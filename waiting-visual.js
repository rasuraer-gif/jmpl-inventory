// ============================================================
// waiting-visual.js — Waiting for Visual inspection Stage Module
// ============================================================
const WaitingVisualModule = (() => {
  let historySearch = '';
  let pendingSearch = '';
  let _activeBatch = null;
  let _wvInputQty = 0;

  function getInputQty(batchId) {
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId && r.movedTo === 'waiting-visual');
    const batch = DB.Batches.find(batchId) || {};
    if (!recs.length) return batch.initialQty || 0;
    const lastRec = recs[recs.length - 1];
    const qtyVal = Number(lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty);
    return !isNaN(qtyVal) ? qtyVal : (batch.initialQty || 0);
  }

  function render() {
    pendingSearch = '';
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('waiting-visual');
    const history = DB.StageRecords.byStage('waiting-visual');
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthLoss = DB.LossTracker.byStage('waiting-visual').filter(l=>(l.date||'').startsWith(thisMonth)).reduce((s,l)=>s+(l.lossQty||0),0);
    const totalQty = batches.reduce((sum, b) => sum + getInputQty(b.id), 0);

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6">
          <h2 class="font-bold" style="font-size:20px;">Waiting for Visual inspection</h2>
          <p class="text-sm text-muted mt-1">Pending allocation and staging buffer before Visual Inspection</p>
        </div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:700px;margin-bottom:24px;">
          <div class="stat-card teal"><div class="stat-label">Pending Batches</div><div class="stat-value teal">${batches.length}</div></div>
          <div class="stat-card amber"><div class="stat-label">Total WIP Qty</div><div class="stat-value amber">${formatNum(totalQty)}</div></div>
          <div class="stat-card red"><div class="stat-label">Loss This Month</div><div class="stat-value red">${formatNum(monthLoss)}</div></div>
          <div class="stat-card blue"><div class="stat-label">Total Processed</div><div class="stat-value blue">${history.length}</div></div>
        </div>
        <div class="tabs" id="wv-tabs">
          <button class="tab-btn active" data-tab="pending">Pending Batches</button>
          <button class="tab-btn" data-tab="history">History</button>
        </div>
        <div id="wv-content">${pendingTab(batches)}</div>
      </div>
      ${processModal()}${rejectModal()}${allocateModal()}`;

    document.querySelectorAll('#wv-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#wv-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('wv-content').innerHTML = btn.dataset.tab==='pending' ? pendingTab(batches) : historyTab();
      });
    });
  }

  function pendingTab(batches) {
    let filtered = batches;
    if (pendingSearch) {
      const q = pendingSearch.toLowerCase();
      filtered = batches.filter(b => (b.batchNo || '').toLowerCase().includes(q));
    }
    if (!filtered.length && !pendingSearch) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">⏳</div><p>No batches waiting for visual inspection</p></div></div>';

    const rows = filtered.map(b => {
      const inputQty = getInputQty(b.id);
      return `
        <tr>
          <td><input type="checkbox" class="bulk-stage-check" value="${b.id}" style="cursor:pointer;" onclick="event.stopPropagation()"></td>
          <td class="font-semibold text-blue">${b.batchNo}</td>
          <td>${b.partNo||'—'}</td>
          <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
          <td class="font-semibold">${formatNum(inputQty)}</td>
          <td>
            ${b.rackNo ? `
              <div style="font-size:12px; line-height:1.3;">
                <div>📦 Rack: <strong class="text-blue">${b.rackNo}</strong></div>
                <div>📍 Loc: <strong>${b.rackLocation || '—'}</strong></div>
                ${b.boxNo ? `<div>🏷️ Box: ${b.boxNo}</div>` : ''}
                ${b.rackQty ? `<div>🔢 Qty: <strong>${formatNum(b.rackQty)}</strong></div>` : ''}
                ${b.bagNo ? `<div>🛍️ Bag: <strong>${b.bagNo}</strong></div>` : ''}
              </div>
            ` : '<span class="text-muted text-sm" style="font-style:italic;">Not allocated</span>'}
          </td>
          <td>
            <div class="flex gap-1" style="flex-wrap: wrap;">
              <button class="btn btn-primary btn-xs" onclick="WaitingVisualModule.openProcess('${b.id}', ${inputQty})">Process &amp; Move</button>
              <button class="btn btn-secondary btn-xs" onclick="WaitingVisualModule.openAllocate('${b.id}')">${b.rackNo ? '✏️ Edit Rack' : '📍 Allocate Rack'}</button>
              <button class="btn btn-danger btn-xs" onclick="WaitingVisualModule.openReject('${b.id}')">Reject</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:16px;">
            <h3>Pending Queue</h3>
            <button class="btn btn-secondary btn-sm" onclick="App.bulkPrintStageSelected()" style="padding:4px 12px; height:32px; display:flex; align-items:center; gap:6px;">🖨️ Bulk Print</button>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="wv-pending-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${pendingSearch}" oninput="WaitingVisualModule.filterPending(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('wv-pending-search', (val) => WaitingVisualModule.filterPending(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th><input type="checkbox" onclick="App.toggleAllStageChecks(this)" style="cursor:pointer;"></th><th>Batch</th><th>Part No</th><th>JMREF</th><th>WIP Qty</th><th>Rack Location</th><th>Actions</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function historyTab() {
    let list = DB.StageRecords.byStage('waiting-visual');
    if (historySearch) {
      const q = historySearch.toLowerCase();
      list = list.filter(r => {
        const b = DB.Batches.find(r.batchId);
        return b && b.batchNo.toLowerCase().includes(q);
      });
    }
    if (!list.length && !historySearch) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#128196;</div><p>No history found</p></div></div>';

    const rows = list.map(r => {
      const b = DB.Batches.find(r.batchId)||{};
      const lossRate = r.inputQty > 0 ? ((r.lossQty / r.inputQty)*100).toFixed(1) + '%' : '0.0%';
      return `
        <tr>
          <td class="font-semibold text-blue">${b.batchNo||'—'}</td>
          <td><span class="badge badge-teal">${r.jmrefNo||b.jmrefNo||'—'}</span></td>
          <td class="font-semibold">${formatNum(r.inputQty)}</td>
          <td class="font-semibold">${formatNum(r.outputQty)}</td>
          <td class="text-danger font-semibold">${formatNum(r.lossQty)}</td>
          <td class="text-sm font-semibold">${lossRate}</td>
          <td class="text-muted text-sm">${r.date}</td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Processing History</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="wv-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="WaitingVisualModule.filterHistory(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('wv-history-search', (val) => WaitingVisualModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch</th><th>JMREF</th><th>Input</th><th>Output</th><th>Loss</th><th>% Loss</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function filterPending(val) {
    pendingSearch = val;
    const content = document.getElementById('wv-content');
    const batches = DB.Batches.byStage('waiting-visual');
    if (content) {
      content.innerHTML = pendingTab(batches);
      const inp = document.getElementById('wv-pending-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function filterHistory(val) {
    historySearch = val;
    const content = document.getElementById('wv-content');
    if (content) {
      content.innerHTML = historyTab();
      const inp = document.getElementById('wv-history-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function allocateModal() {
    return `<div class="modal-overlay hidden" id="wv-allocate-modal">
      <div class="modal modal-sm" style="max-height: 90vh; overflow-y: auto;">
        <div class="modal-header"><h3>Allocate Rack Details</h3><button class="modal-close" onclick="document.getElementById('wv-allocate-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="wv-allocate-batch-id">
          <div id="wv-allocate-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div>
          
          <div class="form-row-2">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Rack No <span class="required">*</span></label>
              <input type="text" id="wv-allocate-rack-no" class="form-control" placeholder="RK-05">
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">Location/Row <span class="required">*</span></label>
              <input type="text" id="wv-allocate-location" class="form-control" placeholder="Section B">
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Box No</label>
              <input type="text" id="wv-allocate-box-no" class="form-control" placeholder="BX-12">
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">Bag No <span class="required">*</span></label>
              <input type="text" id="wv-allocate-bag-no" class="form-control" placeholder="Bag No">
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Quantity <span class="required">*</span></label>
              <input type="number" id="wv-allocate-qty" class="form-control" placeholder="Enter qty" min="1">
            </div>
            <div class="form-group" style="flex:1;">
              <!-- Spacer to balance layout -->
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Additional Details / Notes</label>
            <textarea id="wv-allocate-details" class="form-control" rows="2" placeholder="Notes..."></textarea>
          </div>

          <!-- Stock Sub-Batch creation fields -->
          <div id="wv-allocate-stock-fields" class="hidden">
            <hr style="margin: 16px 0; border: 0; border-top: 1px solid var(--border);">
            <h4 style="margin-bottom:12px; color:var(--primary); font-size:14px;">📦 Stock Upload Sub-Batch Details</h4>
            
            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">TR NO <span class="required">*</span></label>
                <input type="text" id="wv-allocate-trno" class="form-control" placeholder="e.g. TR-01" oninput="WaitingVisualModule.updateAllocateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Shift <span class="required">*</span></label>
                <select id="wv-allocate-shift" class="form-control" onchange="WaitingVisualModule.updateAllocateDynamicBatchNo()">
                  <option value="day">Day (D)</option>
                  <option value="night">Night (N)</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Purchase Date <span class="required">*</span></label>
                <input type="date" id="wv-allocate-purchase-date" class="form-control" onchange="WaitingVisualModule.updateAllocateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Press No <span class="required">*</span></label>
                <input type="text" id="wv-allocate-press-move" class="form-control" placeholder="e.g. PR-01" oninput="WaitingVisualModule.updateAllocateDynamicBatchNo()">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Production Type <span class="required">*</span></label>
              <div class="flex gap-3 mt-2">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="wv-allocate-type" id="wv-allocate-type-inhouse" value="inhouse" checked onchange="WaitingVisualModule.updateAllocateDynamicBatchNo()"> <span>In-House (I)</span></label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="wv-allocate-type" id="wv-allocate-type-subcontractor" value="subcontractor" onchange="WaitingVisualModule.updateAllocateDynamicBatchNo()"> <span>Subcontractor (S)</span></label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Sub-Batch No (Auto-Generated)</label>
              <input type="text" id="wv-allocate-sub-batch-no" class="form-control" readonly style="opacity:0.8; font-weight:bold; color:var(--primary);" placeholder="Auto-generated sub-batch no">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('wv-allocate-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-teal" onclick="WaitingVisualModule.saveRackDetails()">Save Location</button>
        </div>
      </div>
    </div>`;
  }

  function openAllocate(batchId) {
    const b = DB.Batches.find(batchId);
    if (!b) return;
    _activeBatch = b;
    const inputQty = getInputQty(batchId);
    document.getElementById('wv-allocate-batch-id').value = batchId;
    document.getElementById('wv-allocate-info').innerHTML = `<strong>${b.batchNo}</strong> — ${b.jmrefNo}<br><span class="text-sm text-muted">${b.partNo} (Available: <strong>${formatNum(inputQty)}</strong>)</span>`;
    
    document.getElementById('wv-allocate-rack-no').value = b.rackNo || '';
    document.getElementById('wv-allocate-location').value = b.rackLocation || '';
    document.getElementById('wv-allocate-box-no').value = b.boxNo || '';
    document.getElementById('wv-allocate-details').value = b.rackNotes || '';
    document.getElementById('wv-allocate-qty').value = b.rackQty || inputQty;
    document.getElementById('wv-allocate-bag-no').value = b.bagNo || '';
    
    const isStock = b.isStockUpload || (b.batchNo && b.batchNo.includes('-REC-'));
    const stockFields = document.getElementById('wv-allocate-stock-fields');
    if (stockFields) {
      if (isStock) {
        stockFields.classList.remove('hidden');
        document.getElementById('wv-allocate-trno').value = '';
        document.getElementById('wv-allocate-shift').value = 'day';
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const yesterdayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        document.getElementById('wv-allocate-purchase-date').value = yesterdayStr;
        document.getElementById('wv-allocate-press-move').value = '';
        document.getElementById('wv-allocate-type-inhouse').checked = true;
        document.getElementById('wv-allocate-sub-batch-no').value = '';
      } else {
        stockFields.classList.add('hidden');
      }
    }
    document.getElementById('wv-allocate-modal').classList.remove('hidden');
  }

  function updateAllocateDynamicBatchNo() {
    if (!_activeBatch) return;
    const trNo = (document.getElementById('wv-allocate-trno')?.value || '').trim();
    const shift = document.getElementById('wv-allocate-shift')?.value || 'day';
    const dateVal = document.getElementById('wv-allocate-purchase-date')?.value || '';
    const pressNo = (document.getElementById('wv-allocate-press-move')?.value || '').trim();
    const type = document.querySelector('[name=wv-allocate-type]:checked')?.value || 'inhouse';
    
    let dayStr = '';
    if (dateVal) {
      dayStr = dateVal.split('-')[2] || '';
    }
    
    const shiftCode = shift === 'night' ? 'N' : 'D';
    const typeCode = type === 'subcontractor' ? 'S' : 'I';
    const subBatchInput = document.getElementById('wv-allocate-sub-batch-no');
    if (subBatchInput) {
      if (trNo && dayStr && pressNo) {
        subBatchInput.value = `${_activeBatch.jmrefNo}-${trNo}-${dayStr}-${shiftCode}-${typeCode}-${pressNo}`;
      } else {
        subBatchInput.value = '';
      }
    }
  }

  function saveRackDetails() {
    const batchId = document.getElementById('wv-allocate-batch-id').value;
    const rackNo = document.getElementById('wv-allocate-rack-no').value.trim();
    const rackLocation = document.getElementById('wv-allocate-location').value.trim();
    const boxNo = document.getElementById('wv-allocate-box-no').value.trim();
    const rackNotes = document.getElementById('wv-allocate-details').value.trim();
    const qty = parseInt(document.getElementById('wv-allocate-qty').value);
    const bagNo = document.getElementById('wv-allocate-bag-no').value.trim();

    if (!rackNo) { showToast('Rack No is required', 'error'); return; }
    if (!rackLocation) { showToast('Location is required', 'error'); return; }
    if (isNaN(qty) || qty <= 0) { showToast('Please enter a valid Quantity', 'error'); return; }
    if (!bagNo) { showToast('Bag No is required', 'error'); return; }

    const b = _activeBatch;
    const isStock = b.isStockUpload || (b.batchNo && b.batchNo.includes('-REC-'));
    const session = Auth.getSession();

    if (isStock) {
      const trNo = document.getElementById('wv-allocate-trno').value.trim();
      const shift = document.getElementById('wv-allocate-shift').value;
      const purchaseDate = document.getElementById('wv-allocate-purchase-date').value;
      const pressNo = document.getElementById('wv-allocate-press-move').value.trim();
      const type = document.querySelector('[name=wv-allocate-type]:checked')?.value || 'inhouse';
      const subBatchNo = document.getElementById('wv-allocate-sub-batch-no').value.trim();

      if (!trNo) { showToast('TR No is required', 'error'); return; }
      if (!purchaseDate) { showToast('Purchase Date is required', 'error'); return; }
      if (!pressNo) { showToast('Press No is required', 'error'); return; }
      if (!subBatchNo) { showToast('Sub-batch number could not be generated', 'error'); return; }

      if (DB.Batches.all().some(x => x.batchNo === subBatchNo)) {
        showToast('Sub-batch number already exists: ' + subBatchNo, 'error');
        return;
      }

      const availableQty = getInputQty(b.id);
      if (qty > availableQty) {
        showToast(`Quantity (${qty}) exceeds available stock balance (${availableQty})`, 'error');
        return;
      }

      // Deduct from master stock upload batch
      const remainingQty = Math.max(0, availableQty - qty);
      DB.Batches.update(b.id, {
        initialQty: remainingQty,
        status: remainingQty === 0 ? 'completed' : 'active',
        completedAt: remainingQty === 0 ? new Date().toISOString() : null
      });

      // Create new sub-batch in waiting-visual stage
      const subBatch = DB.Batches.insert({
        batchNo: subBatchNo,
        partId: b.partId,
        partNo: b.partNo,
        jmrefNo: b.jmrefNo,
        description: b.description,
        currentStage: 'waiting-visual',
        status: 'active',
        initialQty: qty,
        trNo,
        shift,
        productionType: type,
        pressNo,
        productionDate: purchaseDate,
        createdAt: new Date().toISOString(),
        rackNo,
        rackLocation,
        boxNo,
        notes: 'Sub-batch allocated from Stock Upload pool batch: ' + b.batchNo,
        rackNotes,
        rackQty: qty,
        bagNo
      });

      // Insert incoming stage record for the sub-batch
      DB.StageRecords.insert({
        batchId: subBatch.id,
        stage: 'stock',
        inputQty: qty,
        outputQty: qty,
        lossQty: 0,
        movedTo: 'waiting-visual',
        movedFrom: 'stock',
        date: new Date().toISOString().slice(0, 10),
        recordedBy: session?.userId,
        notes: 'Stock allocation'
      });

      document.getElementById('wv-allocate-modal').classList.add('hidden');
      showToast('Sub-batch created and allocated successfully', 'success');
      render();

      // Trigger barcode print label for the sub-batch
      setTimeout(() => {
        const confirmPrint = confirm(`Would you like to print the label for the new sub-batch: ${subBatchNo}?`);
        if (confirmPrint) {
          window.printBarcode(subBatch.id);
        }
      }, 500);

    } else {
      DB.Batches.update(b.id, {
        rackNo,
        rackLocation,
        boxNo,
        rackNotes,
        rackQty: qty,
        bagNo
      });
      document.getElementById('wv-allocate-modal').classList.add('hidden');
      showToast('Rack allocation saved successfully', 'success');
      render();
    }
  }

  function processModal() {
    return `<div class="modal-overlay hidden" id="wv-process-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Process &amp; Move</h3><button class="modal-close" onclick="document.getElementById('wv-process-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="wv-process-batch-id">
          <input type="hidden" id="wv-process-input-qty">
          <div id="wv-batch-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div>
          <div class="form-group"><label class="form-label">Output Quantity <span class="required">*</span></label><input type="number" id="wv-output-qty" class="form-control" min="0" oninput="WaitingVisualModule.calcLoss()"></div>
          <div class="form-group"><label class="form-label">Loss Quantity (Auto)</label><input type="text" id="wv-loss-qty" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div>
          <div class="form-group"><label class="form-label">Destination</label><input type="text" class="form-control" value="Visual Inspection" readonly style="opacity:0.6;"></div>
          <div class="form-group"><label class="form-label">Notes</label><textarea id="wv-notes" class="form-control" rows="2"></textarea></div>

          <div id="wv-stock-fields" class="hidden">
            <hr style="margin: 16px 0; border: 0; border-top: 1px solid var(--border);">
            <h4 style="margin-bottom:12px; color:var(--primary); font-size:14px;">📦 Stock Upload Sub-Batch Details</h4>
            
            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">TR NO <span class="required">*</span></label>
                <input type="text" id="wv-trno" class="form-control" placeholder="e.g. TR-01" oninput="WaitingVisualModule.updateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Shift <span class="required">*</span></label>
                <select id="wv-shift-move" class="form-control" onchange="WaitingVisualModule.updateDynamicBatchNo()">
                  <option value="day">Day (D)</option>
                  <option value="night">Night (N)</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Production Date <span class="required">*</span></label>
                <input type="date" id="wv-date-move" class="form-control" onchange="WaitingVisualModule.updateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Press No <span class="required">*</span></label>
                <input type="text" id="wv-press-move" class="form-control" placeholder="e.g. PR-01" oninput="WaitingVisualModule.updateDynamicBatchNo()">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Production Type <span class="required">*</span></label>
              <div class="flex gap-3 mt-2">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="wv-type-move" id="wv-type-move-inhouse" value="inhouse" checked onchange="WaitingVisualModule.updateDynamicBatchNo()"> <span>In-House (I)</span></label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="wv-type-move" id="wv-type-move-subcontractor" value="subcontractor" onchange="WaitingVisualModule.updateDynamicBatchNo()"> <span>Subcontractor (S)</span></label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Sub-Batch No (Auto)</label>
              <input type="text" id="wv-sub-batch-no" class="form-control" readonly style="opacity:0.8; font-weight:bold; color:var(--primary);">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('wv-process-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-primary" onclick="WaitingVisualModule.process()">Move Batch</button>
        </div>
      </div>
    </div>`;
  }

  function rejectModal() {
    return `<div class="modal-overlay hidden" id="wv-reject-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Reject Batch</h3><button class="modal-close" onclick="document.getElementById('wv-reject-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="wv-reject-id">
          <div id="wv-reject-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div>
          <div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="wv-reject-reason" class="form-control" rows="3"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('wv-reject-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-danger" onclick="WaitingVisualModule.rejectBatch()">Confirm Reject</button>
        </div>
      </div>
    </div>`;
  }

  function openProcess(batchId, inputQty) {
    _wvInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    _activeBatch = b;
    document.getElementById('wv-process-batch-id').value = batchId;
    document.getElementById('wv-process-input-qty').value = inputQty;

    const isStock = b.isStockUpload || (b.batchNo && b.batchNo.includes('-REC-'));
    const stockFields = document.getElementById('wv-stock-fields');
    if (stockFields) {
      if (isStock) {
        stockFields.classList.remove('hidden');
        document.getElementById('wv-trno').value = '';
        document.getElementById('wv-shift-move').value = 'day';
        document.getElementById('wv-date-move').value = new Date().toISOString().slice(0,10);
        document.getElementById('wv-press-move').value = '';
        document.getElementById('wv-type-move-inhouse').checked = true;
        document.getElementById('wv-sub-batch-no').value = '';
      } else {
        stockFields.classList.add('hidden');
      }
    }

    const lossInput = document.getElementById('wv-loss-qty');
    if (lossInput) {
      if (isStock) {
        lossInput.removeAttribute('readonly');
        lossInput.style.color = 'var(--text)';
        lossInput.placeholder = 'Enter loss quantity';
      } else {
        lossInput.setAttribute('readonly', 'true');
        lossInput.style.color = 'var(--accent-red)';
        lossInput.placeholder = '';
      }
    }

    document.getElementById('wv-batch-info').innerHTML = '<strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo + '<br><span class="text-muted text-sm">Input Qty: <strong>' + formatNum(inputQty) + '</strong></span>';
    document.getElementById('wv-output-qty').value = '';
    document.getElementById('wv-loss-qty').value = '';
    document.getElementById('wv-notes').value = '';
    document.getElementById('wv-process-modal').classList.remove('hidden');
  }

  function updateDynamicBatchNo() {
    if (!_activeBatch) return;
    const trNo = (document.getElementById('wv-trno')?.value || '').trim();
    const shift = document.getElementById('wv-shift-move')?.value || 'day';
    const dateVal = document.getElementById('wv-date-move')?.value || '';
    const pressNo = (document.getElementById('wv-press-move')?.value || '').trim();
    const typeVal = document.querySelector('[name=wv-type-move]:checked')?.value || 'inhouse';
    
    let dayStr = '';
    if (dateVal) {
      dayStr = dateVal.split('-')[2] || '';
    }
    
    const shiftCode = shift === 'night' ? 'N' : 'D';
    const typeCode = typeVal === 'subcontractor' ? 'S' : 'I';
    const subBatchInput = document.getElementById('wv-sub-batch-no');
    if (subBatchInput) {
      if (trNo && dayStr && pressNo) {
        subBatchInput.value = `${_activeBatch.jmrefNo}-${trNo}-${dayStr}-${shiftCode}-${typeCode}-${pressNo}`;
      } else {
        subBatchInput.value = '';
      }
    }
  }

  function calcLoss() {
    const isStock = _activeBatch && (_activeBatch.isStockUpload || (_activeBatch.batchNo && _activeBatch.batchNo.includes('-REC-')));
    if (!isStock) {
      const out = parseInt(document.getElementById('wv-output-qty').value)||0;
      document.getElementById('wv-loss-qty').value = Math.max(0, _wvInputQty - out);
    }
  }

  function process() {
    const batchId = document.getElementById('wv-process-batch-id').value;
    const outputQty = parseInt(document.getElementById('wv-output-qty').value);
    const notes = document.getElementById('wv-notes').value.trim();
    if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
    
    const lossQty = Math.max(0, _wvInputQty - outputQty);
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);

    const isStock = _activeBatch && (_activeBatch.isStockUpload || (_activeBatch.batchNo && _activeBatch.batchNo.includes('-REC-')));
    if (isStock) {
      const trNo = (document.getElementById('wv-trno')?.value || '').trim();
      const shift = document.getElementById('wv-shift-move')?.value || 'day';
      const dateVal = document.getElementById('wv-date-move')?.value || '';
      const pressNo = (document.getElementById('wv-press-move')?.value || '').trim();
      const typeVal = document.querySelector('[name=wv-type-move]:checked')?.value || 'inhouse';
      const subBatchNo = (document.getElementById('wv-sub-batch-no')?.value || '').trim();
      const lossQty = parseInt(document.getElementById('wv-loss-qty').value) || 0;

      if (!trNo) { showToast('Please enter a TR No', 'error'); return; }
      if (!dateVal) { showToast('Please select a production date', 'error'); return; }
      if (!pressNo) { showToast('Please enter a Press No', 'error'); return; }
      if (!subBatchNo) { showToast('Please fill all sub-batch fields', 'error'); return; }
      if (lossQty < 0) { showToast('Loss quantity cannot be negative', 'error'); return; }

      if (DB.Batches.all().some(b => b.batchNo === subBatchNo)) {
        showToast('Sub-batch number already exists: ' + subBatchNo, 'error');
        return;
      }

      const totalDeducted = outputQty + lossQty;
      

      const remainingQty = Math.max(0, (_activeBatch.initialQty || 0) - totalDeducted);

      DB.Batches.update(_activeBatch.id, {
        initialQty: remainingQty,
        status: remainingQty === 0 ? 'completed' : 'active',
        completedAt: remainingQty === 0 ? new Date().toISOString() : null
      });

      const subBatch = DB.Batches.insert({
        batchNo: subBatchNo,
        partId: _activeBatch.partId,
        partNo: _activeBatch.partNo,
        jmrefNo: _activeBatch.jmrefNo,
        description: _activeBatch.description,
        currentStage: 'visual',
        status: 'active',
        initialQty: outputQty,
        trNo,
        shift,
        productionType: typeVal,
        pressNo,
        productionDate: dateVal,
        createdAt: new Date().toISOString(),
        notes: 'Sub-batch created from Stock Upload pool batch: ' + _activeBatch.batchNo
      });

      // Trigger barcode print label for the sub-batch
      setTimeout(() => {
        const confirmPrint = confirm(`Would you like to print the label for the new sub-batch: ${subBatchNo}?`);
        if (confirmPrint) {
          window.printBarcode(subBatch.id);
        }
      }, 500);

      DB.StageRecords.insert({
        batchId: subBatch.id,
        stage: 'waiting-visual',
        inputQty: totalDeducted,
        outputQty: outputQty,
        lossQty: lossQty,
        movedTo: 'visual',
        movedFrom: 'waiting-visual',
        date: dateStr,
        recordedBy: session?.userId,
        notes: notes
      });

      if (lossQty > 0) {
        DB.LossTracker.insert({
          batchId: subBatch.id,
          stage: 'waiting-visual',
          lossQty,
          date: dateStr,
          jmrefNo: _activeBatch.jmrefNo,
          partNo: _activeBatch.partNo
        });
      }

      document.getElementById('wv-process-modal').classList.add('hidden');
      showToast('Sub-batch created and moved to Visual Inspection', 'success');
      App.navigate(App.current);
      return;
    }

    DB.StageRecords.insert({ batchId, stage:'waiting-visual', inputQty:_wvInputQty, outputQty, lossQty, movedTo:'visual', movedFrom:'waiting-visual', date:dateStr, recordedBy:session&&session.userId, notes:notes });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'waiting-visual', lossQty, date:dateStr, jmrefNo:batch&&batch.jmrefNo, partNo:batch&&batch.partNo });
    DB.Batches.update(batchId, { currentStage:'visual' });
    document.getElementById('wv-process-modal').classList.add('hidden');
    showToast('Batch moved to Visual Inspection', 'success');
    App.navigate(App.current);
  }

  function openReject(batchId) {
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('wv-reject-id').value = batchId;
    document.getElementById('wv-reject-info').innerHTML = 'Rejecting: <strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo;
    document.getElementById('wv-reject-reason').value = '';
    document.getElementById('wv-reject-modal').classList.remove('hidden');
  }

  function rejectBatch() {
    const batchId = document.getElementById('wv-reject-id').value;
    const reason = document.getElementById('wv-reject-reason').value.trim();
    if (!reason) { showToast('Rejection reason is required', 'error'); return; }

    const batch = DB.Batches.find(batchId);
    const qty = getInputQty(batchId);
    const session = Auth.getSession();

    DB.RejectionTracker.insert({
      batchId,
      stage: 'waiting-visual',
      qty,
      reason,
      rejectedBy: session?.userId,
      date: new Date().toISOString()
    });

    DB.Batches.update(batchId, {
      status: 'rejected',
      completedAt: new Date().toISOString()
    });

    document.getElementById('wv-reject-modal').classList.add('hidden');
    showToast('Batch rejected and scrapped', 'success');
    render();
  }

  return { render, openProcess, openReject, openAllocate, saveRackDetails, process, rejectBatch, filterPending, filterHistory, calcLoss, updateDynamicBatchNo, updateAllocateDynamicBatchNo };
})();
