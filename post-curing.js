// ============================================================
// post-curing.js — Post Curing Department Module
// ============================================================
const PostCuringModule = (() => {
  let historySearch = '';
  let pendingSearch = '';
  let _activeBatch = null;

  function getInputQty(batchId) {
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId && r.movedTo === 'post-curing');
    if (!recs.length) return (DB.Batches.find(batchId)||{}).initialQty||0;
    const lastRec = recs[recs.length - 1];
    return lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
  }

  function render() {
    pendingSearch = '';
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('post-curing');
    const history = DB.StageRecords.byStage('post-curing');
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthLoss = DB.LossTracker.byStage('post-curing').filter(l=>(l.date||'').startsWith(thisMonth)).reduce((s,l)=>s+(l.lossQty||0),0);
    const totalQty = batches.reduce((sum, b) => sum + getInputQty(b.id), 0);
    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Post Curing</h2><p class="text-sm text-muted mt-1">Post curing processing before Visual Inspection</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:700px;margin-bottom:24px;">
          <div class="stat-card teal"><div class="stat-label">Pending Batches</div><div class="stat-value teal">${batches.length}</div></div>
          <div class="stat-card amber"><div class="stat-label">Total WIP Qty</div><div class="stat-value amber">${formatNum(totalQty)}</div></div>
          <div class="stat-card red"><div class="stat-label">Loss This Month</div><div class="stat-value red">${formatNum(monthLoss)}</div></div>
          <div class="stat-card blue"><div class="stat-label">Total Processed</div><div class="stat-value blue">${history.length}</div></div>
        </div>
        <div class="tabs" id="pc-tabs">
          <button class="tab-btn active" data-tab="pending">Pending Batches</button>
          <button class="tab-btn" data-tab="history">History</button>
        </div>
        <div id="pc-content">${pendingTab(batches)}</div>
      </div>
      ${processModal()}${rejectModal()}`;

    document.querySelectorAll('#pc-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pc-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('pc-content').innerHTML = btn.dataset.tab==='pending' ? pendingTab(batches) : historyTab();
      });
    });
  }

  function pendingTab(batches) {
    let filtered = batches;
    if (pendingSearch) {
      const q = pendingSearch.toLowerCase();
      filtered = batches.filter(b => (b.batchNo || '').toLowerCase().includes(q));
    }
    if (!filtered.length && !pendingSearch) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#128293;</div><p>No batches pending post curing</p></div></div>';
    
    const rows = filtered.map(b => {
      const inputQty = getInputQty(b.id);
      return `
        <tr>
          <td><input type="checkbox" class="bulk-stage-check" value="${b.id}" style="cursor:pointer;" onclick="event.stopPropagation()"></td>
          <td class="font-semibold text-blue">${b.batchNo}</td>
          <td>${b.partNo||'—'}</td>
          <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
          <td class="font-semibold">${formatNum(inputQty)}</td>
          <td><span class="badge badge-blue">Ready</span></td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-primary btn-xs" onclick="PostCuringModule.openProcess('${b.id}', ${inputQty})">Process &amp; Move</button>
              <button class="btn btn-danger btn-xs" onclick="PostCuringModule.openReject('${b.id}')">Reject</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:16px;">
            <h3>Pending Batches</h3>
            <button class="btn btn-secondary btn-sm" onclick="App.bulkPrintStageSelected()" style="padding:4px 12px; height:32px; display:flex; align-items:center; gap:6px;">🖨️ Bulk Print</button>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="pc-pending-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${pendingSearch}" oninput="PostCuringModule.filterPending(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('pc-pending-search', (val) => PostCuringModule.filterPending(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th><input type="checkbox" onclick="App.toggleAllStageChecks(this)" style="cursor:pointer;"></th><th>Batch</th><th>Part No</th><th>JMREF</th><th>WIP Qty</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function historyTab() {
    let list = DB.StageRecords.byStage('post-curing');
    if (historySearch) {
      const q = historySearch.toLowerCase();
      list = list.filter(r => {
        const b = DB.Batches.find(r.batchId);
        return b && b.batchNo.toLowerCase().includes(q);
      });
    }
    if (!list.length && !historySearch) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#128196;</div><p>No post curing history found</p></div></div>';

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
          <h3>Post Curing History</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="pc-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="PostCuringModule.filterHistory(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('pc-history-search', (val) => PostCuringModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
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

  function filterHistory(val) {
    historySearch = val;
    const content = document.getElementById('pc-content');
    if (content) {
      content.innerHTML = historyTab();
      const inp = document.getElementById('pc-history-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function processModal() {
    return `<div class="modal-overlay hidden" id="pc-process-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Post Curing Processing</h3><button class="modal-close" onclick="document.getElementById('pc-process-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="pc-batch-id">
          <input type="hidden" id="pc-input-qty">
          <div id="pc-batch-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div>
          <div class="form-group"><label class="form-label">Output Quantity <span class="required">*</span></label><input type="number" id="pc-output-qty" class="form-control" min="0" oninput="PostCuringModule.calcLoss()"></div>
          <div class="form-group"><label class="form-label">Loss Quantity (Auto)</label><input type="text" id="pc-loss-qty" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div>
          <div class="form-group"><label class="form-label">Destination</label><input type="text" class="form-control" value="Waiting for Visual inspection" readonly style="opacity:0.6;"></div>
          
          <div id="pc-stock-fields" class="hidden">
            <hr style="margin: 16px 0; border: 0; border-top: 1px solid var(--border);">
            <h4 style="margin-bottom:12px; color:var(--primary); font-size:14px;">📦 Stock Upload Sub-Batch Details</h4>
            
            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">TR NO <span class="required">*</span></label>
                <input type="text" id="pc-trno" class="form-control" placeholder="e.g. TR-01" oninput="PostCuringModule.updateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Shift <span class="required">*</span></label>
                <select id="pc-shift-move" class="form-control" onchange="PostCuringModule.updateDynamicBatchNo()">
                  <option value="day">Day (D)</option>
                  <option value="night">Night (N)</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Production Date <span class="required">*</span></label>
                <input type="date" id="pc-date-move" class="form-control" onchange="PostCuringModule.updateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Press No <span class="required">*</span></label>
                <input type="text" id="pc-press-move" class="form-control" placeholder="e.g. PR-01" oninput="PostCuringModule.updateDynamicBatchNo()">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Production Type <span class="required">*</span></label>
              <div class="flex gap-3 mt-2">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="pc-type-move" id="pc-type-move-inhouse" value="inhouse" checked onchange="PostCuringModule.updateDynamicBatchNo()"> <span>In-House (I)</span></label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="pc-type-move" id="pc-type-move-subcontractor" value="subcontractor" onchange="PostCuringModule.updateDynamicBatchNo()"> <span>Subcontractor (S)</span></label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Sub-Batch No (Auto)</label>
              <input type="text" id="pc-sub-batch-no" class="form-control" readonly style="opacity:0.8; font-weight:bold; color:var(--primary);">
            </div>
          </div>
          <div class="form-group"><label class="form-label">Notes</label><textarea id="pc-notes" class="form-control" rows="2"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('pc-process-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-primary" onclick="PostCuringModule.process()">Move to Visual Inspection</button>
        </div>
      </div>
    </div>`;
  }

  function rejectModal() {
    return `<div class="modal-overlay hidden" id="pc-reject-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Reject Batch</h3><button class="modal-close" onclick="document.getElementById('pc-reject-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="pc-reject-id">
          <div id="pc-reject-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div>
          <div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="pc-reject-reason" class="form-control" rows="3"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('pc-reject-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-danger" onclick="PostCuringModule.rejectBatch()">Confirm Reject</button>
        </div>
      </div>
    </div>`;
  }

  let _pcInputQty = 0;
  function openProcess(batchId, inputQty) {
    _pcInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    _activeBatch = b;
    document.getElementById('pc-batch-id').value = batchId;
    document.getElementById('pc-input-qty').value = inputQty;
    
    const isStock = b.isStockUpload || (b.batchNo && b.batchNo.includes('-REC-'));
    const stockFields = document.getElementById('pc-stock-fields');
    if (stockFields) {
      if (isStock) {
        stockFields.classList.remove('hidden');
        document.getElementById('pc-trno').value = '';
        document.getElementById('pc-shift-move').value = 'day';
        document.getElementById('pc-date-move').value = new Date().toISOString().slice(0,10);
        document.getElementById('pc-press-move').value = '';
        document.getElementById('pc-type-move-inhouse').checked = true;
        document.getElementById('pc-sub-batch-no').value = '';
      } else {
        stockFields.classList.add('hidden');
      }
    }

    const lossInput = document.getElementById('pc-loss-qty');
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

    document.getElementById('pc-batch-info').innerHTML = '<strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo + '<br><span class="text-muted text-sm">Input Qty: <strong>' + formatNum(inputQty) + '</strong></span>';
    document.getElementById('pc-output-qty').value = '';
    document.getElementById('pc-loss-qty').value = '';
    document.getElementById('pc-notes').value = '';
    document.getElementById('pc-process-modal').classList.remove('hidden');
  }

  function updateDynamicBatchNo() {
    if (!_activeBatch) return;
    const trNo = (document.getElementById('pc-trno')?.value || '').trim();
    const shift = document.getElementById('pc-shift-move')?.value || 'day';
    const dateVal = document.getElementById('pc-date-move')?.value || '';
    const pressNo = (document.getElementById('pc-press-move')?.value || '').trim();
    const typeVal = document.querySelector('[name=pc-type-move]:checked')?.value || 'inhouse';
    
    let dayStr = '';
    if (dateVal) {
      dayStr = dateVal.split('-')[2] || '';
    }
    
    const shiftCode = shift === 'night' ? 'N' : 'D';
    const typeCode = typeVal === 'subcontractor' ? 'S' : 'I';
    const subBatchInput = document.getElementById('pc-sub-batch-no');
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
      const out = parseInt(document.getElementById('pc-output-qty').value)||0;
      document.getElementById('pc-loss-qty').value = Math.max(0, _pcInputQty - out);
    }
  }

  function process() {
    const batchId = document.getElementById('pc-batch-id').value;
    const outputQty = parseInt(document.getElementById('pc-output-qty').value);
    const notes = document.getElementById('pc-notes').value.trim();
    if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
    
    const lossQty = Math.max(0, _pcInputQty - outputQty);
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);

    const isStock = _activeBatch && (_activeBatch.isStockUpload || (_activeBatch.batchNo && _activeBatch.batchNo.includes('-REC-')));
    if (isStock) {
      const trNo = (document.getElementById('pc-trno')?.value || '').trim();
      const shift = document.getElementById('pc-shift-move')?.value || 'day';
      const dateVal = document.getElementById('pc-date-move')?.value || '';
      const pressNo = (document.getElementById('pc-press-move')?.value || '').trim();
      const typeVal = document.querySelector('[name=pc-type-move]:checked')?.value || 'inhouse';
      const subBatchNo = (document.getElementById('pc-sub-batch-no')?.value || '').trim();
      const lossQty = parseInt(document.getElementById('pc-loss-qty').value) || 0;
      
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
        currentStage: 'waiting-visual',
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

      setTimeout(() => {
        const confirmPrint = confirm(`Would you like to print the label for the new sub-batch: ${subBatchNo}?`);
        if (confirmPrint) {
          window.printBarcode(subBatch.id);
        }
      }, 500);

      DB.StageRecords.insert({
        batchId: subBatch.id,
        stage: 'post-curing',
        inputQty: totalDeducted,
        outputQty: outputQty,
        lossQty: lossQty,
        movedTo: 'waiting-visual',
        movedFrom: 'post-curing',
        date: dateStr,
        recordedBy: session?.userId,
        notes: notes
      });

      if (lossQty > 0) {
        DB.LossTracker.insert({
          batchId: subBatch.id,
          stage: 'post-curing',
          lossQty,
          date: dateStr,
          jmrefNo: _activeBatch.jmrefNo,
          partNo: _activeBatch.partNo
        });
      }

      document.getElementById('pc-process-modal').classList.add('hidden');
      showToast('Sub-batch created and moved to Waiting for Visual inspection', 'success');
      App.navigate(App.current);
      return;
    }

    DB.StageRecords.insert({ batchId, stage:'post-curing', inputQty:_pcInputQty, outputQty, lossQty, movedTo:'waiting-visual', movedFrom:'post-curing', date:dateStr, recordedBy:session&&session.userId, notes:notes });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'post-curing', lossQty, date:dateStr, jmrefNo:batch&&batch.jmrefNo, partNo:batch&&batch.partNo });
    DB.Batches.update(batchId, { currentStage:'waiting-visual' });
    document.getElementById('pc-process-modal').classList.add('hidden');
    showToast('Batch moved to Waiting for Visual inspection', 'success');
    App.navigate(App.current);
  }

  function openReject(batchId) {
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('pc-reject-id').value = batchId;
    document.getElementById('pc-reject-info').innerHTML = 'Rejecting: <strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo;
    document.getElementById('pc-reject-reason').value = '';
    document.getElementById('pc-reject-modal').classList.remove('hidden');
  }

  function rejectBatch() {
    const batchId = document.getElementById('pc-reject-id').value;
    const reason = document.getElementById('pc-reject-reason').value.trim();
    const session = Auth.getSession();
    DB.RejectionTracker.insert({ batchId, stage:'post-curing', qty:getInputQty(batchId), date:new Date().toISOString(), reason, rejectedBy:session&&session.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('pc-reject-modal').classList.add('hidden');
    showToast('Batch rejected', 'success');
    render();
  }

  function filterPending(val) {
    pendingSearch = val;
    const content = document.getElementById('pc-content');
    if (content) {
      const batches = DB.Batches.byStage('post-curing');
      content.innerHTML = pendingTab(batches);
      const inp = document.getElementById('pc-pending-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  return { render, openProcess, calcLoss, process, openReject, rejectBatch, filterHistory, filterPending, updateDynamicBatchNo };
})();
