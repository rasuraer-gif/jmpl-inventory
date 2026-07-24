// ============================================================
// trimming.js — Trimming Department Module
// ============================================================
const TrimmingModule = (() => {
  let _activeBatch = null;
  let historySearch = '';
  let pendingSearch = '';

  function getInputQty(batchId) {
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId && r.movedTo === 'trimming');
    if (!recs.length) return (DB.Batches.find(batchId)||{}).initialQty||0;
    const lastRec = recs[recs.length - 1];
    return lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
  }
  function render() {
    pendingSearch = '';
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('trimming');
    const history = DB.StageRecords.byStage('trimming');
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthLoss = DB.LossTracker.byStage('trimming').filter(l=>(l.date||'').startsWith(thisMonth)).reduce((s,l)=>s+(l.lossQty||0),0);
    const totalQty = batches.reduce((sum, b) => sum + getInputQty(b.id), 0);
    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Trimming</h2><p class="text-sm text-muted mt-1">Process batches through Trimming</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:700px;margin-bottom:24px;">
          <div class="stat-card teal"><div class="stat-label">Pending Batches</div><div class="stat-value teal">${batches.length}</div></div>
          <div class="stat-card amber"><div class="stat-label">Total WIP Qty</div><div class="stat-value amber">${formatNum(totalQty)}</div></div>
          <div class="stat-card red"><div class="stat-label">Loss This Month</div><div class="stat-value red">${formatNum(monthLoss)}</div></div>
          <div class="stat-card blue"><div class="stat-label">Total Processed</div><div class="stat-value blue">${history.length}</div></div>
        </div>
        <div class="tabs" id="trim-tabs">
          <button class="tab-btn active" data-tab="pending">Pending Batches</button>
          <button class="tab-btn" data-tab="history">History</button>
        </div>
        <div id="trim-content">${pendingTab(batches)}</div>
      </div>
      ${processModal()}${rejectModal()}`;
    document.querySelectorAll('#trim-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#trim-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('trim-content').innerHTML = btn.dataset.tab==='pending' ? pendingTab(batches) : historyTab();
      });
    });
  }
  function pendingTab(batches) {
    let filtered = batches;
    if (pendingSearch) {
      const q = pendingSearch.toLowerCase();
      filtered = batches.filter(b => (b.batchNo || '').toLowerCase().includes(q));
    }
    if (!filtered.length && !pendingSearch) return `<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#9986;&#65039;</div><p>No batches in Trimming stage</p></div></div>`;
    const rows = filtered.map(b => {
      const inputQty = getInputQty(b.id);
      const isRecheck = !!(b.recheckCount && b.recheckCount > 0 && b.currentStage === 'trimming');
      return `<tr>
        <td><input type="checkbox" class="bulk-stage-check" value="${b.id}" style="cursor:pointer;" onclick="event.stopPropagation()"></td>
        <td class="font-semibold text-blue">${b.batchNo}${isRecheck ? ' <span class="badge badge-amber" style="font-size:10px;">RECHECK #' + (b.recheckIteration||1) + '</span>' : ''}</td>
        <td>${b.partNo||'—'}</td>
        <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
        <td class="font-semibold">${formatNum(inputQty)}</td>
        <td class="text-muted text-sm">${(b.createdAt||'').slice(0,10)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-teal btn-xs" onclick="TrimmingModule.openProcess('${b.id}',${inputQty})">Process &amp; Move</button>
            <button class="btn btn-danger btn-xs" onclick="TrimmingModule.openReject('${b.id}')">Reject</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    return `<div class="card">
      <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <h3>Pending Batches</h3>
          <button class="btn btn-secondary btn-sm" onclick="App.bulkPrintStageSelected()" style="padding:4px 12px; height:32px; display:flex; align-items:center; gap:6px;">🖨️ Bulk Print</button>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="search-input" style="max-width: 250px; margin: 0;">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="trim-pending-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${pendingSearch}" oninput="TrimmingModule.filterPending(this.value)">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('trim-pending-search', (val) => TrimmingModule.filterPending(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
      </div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th><input type="checkbox" onclick="App.toggleAllStageChecks(this)" style="cursor:pointer;"></th><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Input Qty</th><th>Received</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}</tbody></table></div></div>`;
  }
  function historyTab() {
    let recs = DB.StageRecords.byStage('trimming');
    const vendors = DB.Vendors.all();
    if (historySearch) {
      const q = historySearch.toLowerCase();
      recs = recs.filter(r => {
        const b = DB.Batches.find(r.batchId) || {};
        return (b.batchNo || '').toLowerCase().includes(q);
      });
    }

    if (!recs.length) return `
      <div class="card card-body">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 12px; max-width: 280px;">
          <input type="text" id="trim-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="TrimmingModule.filterHistory(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('trim-history-search', (val) => TrimmingModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
        <div class="empty-state"><div class="empty-icon">&#128202;</div><p>No processing history found</p></div>
      </div>`;

    const rows = recs.map(r => {
      const b = DB.Batches.find(r.batchId)||{};
      const v = vendors.find(vv=>vv.id===r.vendorId)||{};
      const pct = r.inputQty ? ((r.lossQty / r.inputQty) * 100).toFixed(1) + '%' : '0.0%';
      return `<tr><td class="font-semibold">${b.batchNo||'—'}</td><td>${b.jmrefNo||'—'}</td><td>${v.name||'—'}</td><td>${formatNum(r.inputQty)}</td><td>${formatNum(r.outputQty)}</td><td class="text-danger font-semibold">${formatNum(r.lossQty)}</td><td><span class="badge badge-red">${pct}</span></td><td class="text-muted text-sm">${(r.date||'').slice(0,10)}</td></tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Processing History</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="trim-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="TrimmingModule.filterHistory(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('trim-history-search', (val) => TrimmingModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch</th><th>JMREF</th><th>Vendor</th><th>Input</th><th>Output</th><th>Loss</th><th>% Loss</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }
  function filterHistory(val) {
    historySearch = val;
    const content = document.getElementById('trim-content');
    if (content) {
      content.innerHTML = historyTab();
      const inp = document.getElementById('trim-history-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }
  function processModal() {
    const vendors = DB.Vendors.byDept('trimming');
    let vendorOpts = '';
    if (vendors.length === 1) {
      vendorOpts = `<option value="${vendors[0].id}" selected>${vendors[0].name}</option>`;
    } else {
      vendorOpts = '<option value="">Select vendor...</option>' + vendors.map(v=>`<option value="${v.id}">${v.name}</option>`).join('');
    }
    return `<div class="modal-overlay hidden" id="trim-process-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Process &amp; Move</h3><button class="modal-close" onclick="document.getElementById('trim-process-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="trim-batch-id">
          <input type="hidden" id="trim-input-qty">
          <div id="trim-batch-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div>
          <div class="form-group"><label class="form-label">Vendor <span class="required">*</span></label>
            <select id="trim-vendor" class="form-control">${vendorOpts}</select>
          </div>
          <div class="form-group"><label class="form-label">Output Quantity <span class="required">*</span></label><input type="number" id="trim-output-qty" class="form-control" min="0" oninput="TrimmingModule.calcLoss()"></div>
          <div class="form-group"><label class="form-label">Loss Quantity (Auto)</label><input type="text" id="trim-loss-qty" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div>
          <div class="form-group"><label class="form-label">Destination <span class="required">*</span></label>
            <select id="trim-destination" class="form-control">
              <option value="waiting-visual">Waiting for Visual inspection</option>
              <option value="post-curing">Post Curing</option>
            </select>
          </div>
          <div id="trim-stock-fields" class="hidden">
            <hr style="margin: 16px 0; border: 0; border-top: 1px solid var(--border);">
            <h4 style="margin-bottom:12px; color:var(--primary); font-size:14px;">📦 Stock Upload Sub-Batch Details</h4>
            
            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">TR NO <span class="required">*</span></label>
                <input type="text" id="trim-trno" class="form-control" placeholder="e.g. TR-01" oninput="TrimmingModule.updateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Shift <span class="required">*</span></label>
                <select id="trim-shift-move" class="form-control" onchange="TrimmingModule.updateDynamicBatchNo()">
                  <option value="day">Day (D)</option>
                  <option value="night">Night (N)</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Production Date <span class="required">*</span></label>
                <input type="date" id="trim-date-move" class="form-control" onchange="TrimmingModule.updateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Press No <span class="required">*</span></label>
                <input type="text" id="trim-press-move" class="form-control" placeholder="e.g. PR-01" oninput="TrimmingModule.updateDynamicBatchNo()">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Production Type <span class="required">*</span></label>
              <div class="flex gap-3 mt-2">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="trim-type-move" id="trim-type-move-inhouse" value="inhouse" checked onchange="TrimmingModule.updateDynamicBatchNo()"> <span>In-House (I)</span></label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="trim-type-move" id="trim-type-move-subcontractor" value="subcontractor" onchange="TrimmingModule.updateDynamicBatchNo()"> <span>Subcontractor (S)</span></label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Sub-Batch No (Auto)</label>
              <input type="text" id="trim-sub-batch-no" class="form-control" readonly style="opacity:0.8; font-weight:bold; color:var(--primary);">
            </div>
          </div>
          <div class="form-group"><label class="form-label">Notes</label><textarea id="trim-notes" class="form-control" rows="2"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('trim-process-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-teal" onclick="TrimmingModule.process()">Move to Visual</button>
        </div>
      </div>
    </div>`;
  }
  function rejectModal() {
    return `<div class="modal-overlay hidden" id="trim-reject-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Reject Batch</h3><button class="modal-close" onclick="document.getElementById('trim-reject-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="trim-reject-id">
          <div id="trim-reject-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div>
          <div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="trim-reject-reason" class="form-control" rows="3"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('trim-reject-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-danger" onclick="TrimmingModule.rejectBatch()">Confirm Reject</button>
        </div>
      </div>
    </div>`;
  }
  let _trimInputQty = 0;
  function openProcess(batchId, inputQty) {
    _trimInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    _activeBatch = b;
    document.getElementById('trim-batch-id').value = batchId;
    document.getElementById('trim-input-qty').value = inputQty;
    
    const isStock = b.isStockUpload || (b.batchNo && b.batchNo.includes('-REC-'));
    const stockFields = document.getElementById('trim-stock-fields');
    if (stockFields) {
      if (isStock) {
        stockFields.classList.remove('hidden');
        document.getElementById('trim-trno').value = '';
        document.getElementById('trim-shift-move').value = 'day';
        document.getElementById('trim-date-move').value = new Date().toISOString().slice(0,10);
        document.getElementById('trim-press-move').value = '';
        document.getElementById('trim-type-move-inhouse').checked = true;
        document.getElementById('trim-sub-batch-no').value = '';
      } else {
        stockFields.classList.add('hidden');
      }
    }

    const lossInput = document.getElementById('trim-loss-qty');
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

    document.getElementById('trim-batch-info').innerHTML = `<strong>${b.batchNo}</strong> — ${b.jmrefNo}<br><span class="text-muted text-sm">Input Qty: <strong>${formatNum(inputQty)}</strong></span>${b.recheckCount?` <span class="badge badge-amber">Recheck #${b.recheckIteration}</span>`:''}`;
    const vendors = DB.Vendors.byDept('trimming');
    if (vendors.length === 1) {
      document.getElementById('trim-vendor').value = vendors[0].id;
    } else {
      document.getElementById('trim-vendor').value = '';
    }
    document.getElementById('trim-output-qty').value = '';
    document.getElementById('trim-loss-qty').value = '';
    document.getElementById('trim-notes').value = '';
    document.getElementById('trim-destination').value = 'waiting-visual';
    document.getElementById('trim-process-modal').classList.remove('hidden');
  }

  function updateDynamicBatchNo() {
    if (!_activeBatch) return;
    const trNo = (document.getElementById('trim-trno')?.value || '').trim();
    const shift = document.getElementById('trim-shift-move')?.value || 'day';
    const dateVal = document.getElementById('trim-date-move')?.value || '';
    const pressNo = (document.getElementById('trim-press-move')?.value || '').trim();
    const typeVal = document.querySelector('[name=trim-type-move]:checked')?.value || 'inhouse';
    
    let dayStr = '';
    if (dateVal) {
      dayStr = dateVal.split('-')[2] || '';
    }
    
    const shiftCode = shift === 'night' ? 'N' : 'D';
    const typeCode = typeVal === 'subcontractor' ? 'S' : 'I';
    const subBatchInput = document.getElementById('trim-sub-batch-no');
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
      const out = parseInt(document.getElementById('trim-output-qty').value)||0;
      document.getElementById('trim-loss-qty').value = Math.max(0, _trimInputQty - out);
    }
  }
  function process() {
    const batchId = document.getElementById('trim-batch-id').value;
    const vendorId = document.getElementById('trim-vendor').value;
    const outputQty = parseInt(document.getElementById('trim-output-qty').value);
    const destination = document.getElementById('trim-destination').value;
    const notes = document.getElementById('trim-notes').value.trim();
    if (!vendorId) { showToast('Please select a vendor', 'error'); return; }
    if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
    
    const lossQty = Math.max(0, _trimInputQty - outputQty);
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);

    const isStock = _activeBatch && (_activeBatch.isStockUpload || (_activeBatch.batchNo && _activeBatch.batchNo.includes('-REC-')));
    if (isStock) {
      const trNo = (document.getElementById('trim-trno')?.value || '').trim();
      const shift = document.getElementById('trim-shift-move')?.value || 'day';
      const dateVal = document.getElementById('trim-date-move')?.value || '';
      const pressNo = (document.getElementById('trim-press-move')?.value || '').trim();
      const typeVal = document.querySelector('[name=trim-type-move]:checked')?.value || 'inhouse';
      const subBatchNo = (document.getElementById('trim-sub-batch-no')?.value || '').trim();
      const lossQty = parseInt(document.getElementById('trim-loss-qty').value) || 0;
      
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
        currentStage: destination,
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
        stage: 'trimming',
        inputQty: totalDeducted,
        outputQty: outputQty,
        lossQty: lossQty,
        vendorId,
        movedTo: destination,
        movedFrom: 'trimming',
        date: dateStr,
        recordedBy: session?.userId,
        notes: notes,
        iterationNo: batch?.recheckIteration||null
      });

      if (lossQty > 0) {
        DB.LossTracker.insert({
          batchId: subBatch.id,
          stage: 'trimming',
          lossQty,
          date: dateStr,
          jmrefNo: _activeBatch.jmrefNo,
          partNo: _activeBatch.partNo,
          iterationNo: batch?.recheckIteration||null
        });
      }

      document.getElementById('trim-process-modal').classList.add('hidden');
      showToast('Sub-batch created and moved to ' + (STAGE_LABELS[destination] || destination), 'success');
      App.navigate(App.current);
      return;
    }

    DB.StageRecords.insert({ batchId, stage:'trimming', inputQty:_trimInputQty, outputQty, lossQty, vendorId, movedTo:destination, movedFrom:'trimming', date:dateStr, recordedBy:session?.userId, notes:notes, iterationNo: batch?.recheckIteration||null });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'trimming', lossQty, date:dateStr, jmrefNo:batch?.jmrefNo, partNo:batch?.partNo, iterationNo:batch?.recheckIteration||null });
    DB.Batches.update(batchId, { currentStage:destination });
    document.getElementById('trim-process-modal').classList.add('hidden');
    showToast('Batch moved to ' + (STAGE_LABELS[destination] || destination), 'success');
    App.navigate(App.current);
  }
  function openReject(batchId) {
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('trim-reject-id').value = batchId;
    document.getElementById('trim-reject-info').innerHTML = `Rejecting: <strong>${b.batchNo}</strong> — ${b.jmrefNo}`;
    document.getElementById('trim-reject-reason').value = '';
    document.getElementById('trim-reject-modal').classList.remove('hidden');
  }
  function rejectBatch() {
    const batchId = document.getElementById('trim-reject-id').value;
    const reason = document.getElementById('trim-reject-reason').value.trim();
    const session = Auth.getSession();
    DB.RejectionTracker.insert({ batchId, stage:'trimming', qty:getInputQty(batchId), date:new Date().toISOString(), reason, rejectedBy:session?.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('trim-reject-modal').classList.add('hidden');
    showToast('Batch rejected', 'success');
    render();
  }
  function filterPending(val) {
    pendingSearch = val;
    const content = document.getElementById('trim-content');
    if (content) {
      const batches = DB.Batches.byStage('trimming');
      content.innerHTML = pendingTab(batches);
      const inp = document.getElementById('trim-pending-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  return { render, openProcess, calcLoss, process, openReject, rejectBatch, filterHistory, filterPending, updateDynamicBatchNo };
})();
