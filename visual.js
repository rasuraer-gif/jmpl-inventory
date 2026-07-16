// ============================================================
// visual.js — Visual Inspection Department Module
// ============================================================
const VisualModule = (() => {
  let _activeBatch = null;
  function getInputQty(batchId) {
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId && r.movedTo === 'visual');
    const batch = DB.Batches.find(batchId) || {};
    if (!recs.length) return batch.initialQty || 0;
    const lastRec = recs[recs.length - 1];
    const qtyVal = Number(lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty);
    return !isNaN(qtyVal) ? qtyVal : (batch.initialQty || 0);
  }

  let historySearch = '';
  let pendingSearch = '';

  function render() {
    pendingSearch = '';
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('visual');
    const history = DB.StageRecords.byStage('visual');
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthLoss = DB.LossTracker.byStage('visual').filter(l=>(l.date||'').startsWith(thisMonth)).reduce((s,l)=>s+(l.lossQty||0),0);
    const inspectors = DB.Inspectors.active();
    const totalQty = batches.reduce((sum, b) => sum + getInputQty(b.id), 0);
    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Visual Inspection</h2><p class="text-sm text-muted mt-1">Inspect batches and record visual defects</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:720px;margin-bottom:24px;">
          <div class="stat-card green"><div class="stat-label">Pending Batches</div><div class="stat-value green">${batches.length}</div></div>
          <div class="stat-card amber"><div class="stat-label">Total WIP Qty</div><div class="stat-value amber">${formatNum(totalQty)}</div></div>
          <div class="stat-card red"><div class="stat-label">Loss This Month</div><div class="stat-value red">${formatNum(monthLoss)}</div></div>
          <div class="stat-card blue"><div class="stat-label">Total Inspected</div><div class="stat-value blue">${history.length}</div></div>
          <div class="stat-card purple"><div class="stat-label">Inspectors Active</div><div class="stat-value purple">${inspectors.length}</div></div>
        </div>
        <div class="tabs" id="vis-tabs">
          <button class="tab-btn active" data-tab="pending">Pending Batches</button>
          <button class="tab-btn" data-tab="history">History</button>
        </div>
        <div id="vis-content">${pendingTab(batches)}</div>
      </div>
      ${processModal()}${rejectModal()}`;
    document.querySelectorAll('#vis-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#vis-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('vis-content').innerHTML = btn.dataset.tab==='pending' ? pendingTab(batches) : historyTab();
      });
    });
  }

  function pendingTab(batches) {
    let filtered = batches;
    if (pendingSearch) {
      const q = pendingSearch.toLowerCase();
      filtered = batches.filter(b => (b.batchNo || '').toLowerCase().includes(q));
    }
    if (!filtered.length && !pendingSearch) return `<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#128065;&#65039;</div><p>No batches pending visual inspection</p></div></div>`;
    const rows = filtered.map(b => {
      const inputQty = getInputQty(b.id);
      const isRecheck = !!(b.recheckCount && b.recheckCount > 0);
      return `<tr>
        <td class="font-semibold text-blue">${b.batchNo}${isRecheck ? ' <span class="badge badge-amber" style="font-size:10px;">RECHECK #'+(b.recheckIteration||1)+'</span>' : ''}</td>
        <td>${b.partNo||'—'}</td>
        <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
        <td class="font-semibold">${formatNum(inputQty)}</td>
        <td class="text-muted text-sm">${(b.createdAt||'').slice(0,10)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-teal btn-xs" onclick="VisualModule.openProcess('${b.id}',${inputQty})">Inspect &amp; Move</button>
            <button class="btn btn-danger btn-xs" onclick="VisualModule.openReject('${b.id}')">Reject</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    return `<div class="card">
      <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <h3>Pending Batches</h3>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="search-input" style="max-width: 250px; margin: 0;">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="vis-pending-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${pendingSearch}" oninput="VisualModule.filterPending(this.value)">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('vis-pending-search', (val) => VisualModule.filterPending(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
      </div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Input Qty</th><th>Received</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}</tbody></table></div></div>`;
  }

  function historyTab() {
    let recs = DB.StageRecords.byStage('visual');
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
          <input type="text" id="vis-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="VisualModule.filterHistory(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('vis-history-search', (val) => VisualModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
        <div class="empty-state"><div class="empty-icon">&#128202;</div><p>No inspection history found</p></div>
      </div>`;

    const rows = recs.map(r => {
      const b = DB.Batches.find(r.batchId)||{};
      const pct = r.inputQty ? ((r.lossQty / r.inputQty) * 100).toFixed(1) + '%' : '0.0%';
      return `<tr>
        <td class="font-semibold">${b.batchNo||'—'}</td>
        <td>${b.jmrefNo||'—'}</td>
        <td>${r.inspectorName||'—'}</td>
        <td>${formatNum(r.inputQty)}</td>
        <td>${formatNum(r.outputQty)}</td>
        <td class="text-danger font-semibold">${formatNum(r.lossQty)}</td>
        <td><span class="badge badge-red">${pct}</span></td>
        <td><span class="badge badge-gray">${r.movedTo||'—'}</span></td>
        <td class="text-muted text-sm">${(r.date||'').slice(0,10)}</td>
      </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Inspection History</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="vis-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="VisualModule.filterHistory(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('vis-history-search', (val) => VisualModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch</th><th>JMREF</th><th>Inspector</th><th>Input</th><th>Output</th><th>Loss</th><th>% Loss</th><th>Moved To</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function filterHistory(val) {
    historySearch = val;
    const content = document.getElementById('vis-content');
    if (content) {
      content.innerHTML = historyTab();
      const inp = document.getElementById('vis-history-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function showInspectorDropdown() {
    const list = document.getElementById('vis-inspector-dropdown');
    if (!list) return;
    list.classList.remove('hidden');
    filterInspectors(document.getElementById('vis-inspector-search').value || '');
  }

  function filterInspectors(query) {
    const list = document.getElementById('vis-inspector-dropdown');
    if (!list) return;
    const inspectors = DB.Inspectors.active();
    const q = query.toLowerCase();
    const filtered = inspectors.filter(i => i.name.toLowerCase().includes(q) || (i.employeeId || '').toLowerCase().includes(q));
    
    if (filtered.length === 0) {
      list.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:12.5px; text-align:center;">No active inspectors found.</div>`;
      return;
    }
    
    list.innerHTML = filtered.map(i => `
      <div class="dropdown-item" 
           style="padding:8px 12px; cursor:pointer; border-radius:4px; transition:background 0.2s; font-size:13px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;"
           onclick="VisualModule.selectInspector('${i.id}', '${i.name.replace(/'/g, "\\'")}')"
           onmouseover="this.style.background='rgba(99,102,241,0.15)'"
           onmouseout="this.style.background='transparent'">
        <div>
          <span style="font-weight:600; color:var(--primary);">${i.name}</span>
          ${i.employeeId ? `<span class="badge badge-gray" style="margin-left:8px; font-size:10px;">${i.employeeId}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  function selectInspector(id, name) {
    document.getElementById('vis-inspector').value = name;
    document.getElementById('vis-inspector-search').value = name;
    const list = document.getElementById('vis-inspector-dropdown');
    if (list) list.classList.add('hidden');
  }

  function processModal() {
    return `<div class="modal-overlay hidden" id="vis-process-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Visual Inspection &amp; Move</h3><button class="modal-close" onclick="document.getElementById('vis-process-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="vis-batch-id">
          <input type="hidden" id="vis-input-qty">
          <div id="vis-batch-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div>
          
          <div class="form-group" style="position:relative;">
            <label class="form-label">Inspector Name <span class="required">*</span></label>
            <input type="text" id="vis-inspector-search" class="form-control" placeholder="Search inspector..." onfocus="VisualModule.showInspectorDropdown()" oninput="VisualModule.filterInspectors(this.value)" autocomplete="off">
            <input type="hidden" id="vis-inspector">
            <div id="vis-inspector-dropdown" class="hidden" style="position:absolute; top:100%; left:0; right:0; z-index:1000; max-height:180px; overflow-y:auto; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.3); margin-top:4px; padding: 4px;"></div>
          </div>

          <div class="form-row-2">
            <div class="form-group"><label class="form-label">Output Quantity <span class="required">*</span></label><input type="number" id="vis-output-qty" class="form-control" min="0" oninput="VisualModule.calcLoss()"></div>
            <div class="form-group" id="vis-reprocess-qty-group">
              <label class="form-label">Reprocess Qty</label>
              <input type="number" id="vis-reprocess-qty" class="form-control" min="0" value="0" oninput="VisualModule.calcLoss()">
            </div>
          </div>
          
          <div class="form-group hidden" id="vis-reprocess-dest-group">
            <label class="form-label">Reprocess Destination <span class="required">*</span></label>
            <select id="vis-reprocess-destination" class="form-control">
              <option value="cryogenic">Cryogenic</option>
              <option value="deflashing">Flash Removal (DE Flashing)</option>
              <option value="trimming">Trimming</option>
            </select>
          </div>

          <div class="form-group"><label class="form-label">Loss Quantity (Auto)</label><input type="text" id="vis-loss-qty" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div>
          <div class="form-group"><label class="form-label">Destination <span class="required">*</span></label>
            <select id="vis-destination" class="form-control" onchange="VisualModule.onDestinationChange()">
              <option value="gauge">Gauge Inspection</option>
              <option value="quality">Quality Final</option>
            </select>
          </div>

          <div class="form-group hidden" id="vis-vendor-group">
            <label class="form-label">Vendor <span class="required">*</span></label>
            <select id="vis-vendor" class="form-control"><option value="">Select vendor...</option></select>
          </div>
          <div id="vis-stock-fields" class="hidden">
            <hr style="margin: 16px 0; border: 0; border-top: 1px solid var(--border);">
            <h4 style="margin-bottom:12px; color:var(--primary); font-size:14px;">📦 Stock Upload Sub-Batch Details</h4>
            
            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">TR NO <span class="required">*</span></label>
                <input type="text" id="vis-trno" class="form-control" placeholder="e.g. TR-01" oninput="VisualModule.updateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Shift <span class="required">*</span></label>
                <select id="vis-shift-move" class="form-control" onchange="VisualModule.updateDynamicBatchNo()">
                  <option value="day">Day (D)</option>
                  <option value="night">Night (N)</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Production Date <span class="required">*</span></label>
                <input type="date" id="vis-date-move" class="form-control" onchange="VisualModule.updateDynamicBatchNo()">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Press No <span class="required">*</span></label>
                <input type="text" id="vis-press-move" class="form-control" placeholder="e.g. PR-01" oninput="VisualModule.updateDynamicBatchNo()">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Production Type <span class="required">*</span></label>
              <div class="flex gap-3 mt-2">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="vis-type-move" id="vis-type-move-inhouse" value="inhouse" checked onchange="VisualModule.updateDynamicBatchNo()"> <span>In-House (I)</span></label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="vis-type-move" id="vis-type-move-subcontractor" value="subcontractor" onchange="VisualModule.updateDynamicBatchNo()"> <span>Subcontractor (S)</span></label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Sub-Batch No (Auto)</label>
              <input type="text" id="vis-sub-batch-no" class="form-control" readonly style="opacity:0.8; font-weight:bold; color:var(--primary);">
            </div>
          </div>
          <div class="form-group"><label class="form-label">Notes</label><textarea id="vis-notes" class="form-control" rows="2"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('vis-process-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-teal" onclick="VisualModule.process()">Move Batch</button>
        </div>
      </div>
    </div>`;
  }
  function rejectModal() {
    return `<div class="modal-overlay hidden" id="vis-reject-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Reject Batch</h3><button class="modal-close" onclick="document.getElementById('vis-reject-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="vis-reject-id">
          <div id="vis-reject-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div>
          <div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="vis-reject-reason" class="form-control" rows="3"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('vis-reject-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-danger" onclick="VisualModule.rejectBatch()">Confirm Reject</button>
        </div>
      </div>
    </div>`;
  }
  function onDestinationChange() {
    const dest = document.getElementById('vis-destination').value;
    const vendorGroup = document.getElementById('vis-vendor-group');
    const vendorSelect = document.getElementById('vis-vendor');
    if (!vendorGroup || !vendorSelect) return;
    if (dest === 'trimming' || dest === 'deflashing') {
      vendorGroup.classList.remove('hidden');
      const vendors = DB.Vendors.byDept(dest);
      vendorSelect.innerHTML = '<option value="">Select vendor...</option>' + vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    } else {
      vendorGroup.classList.add('hidden');
      vendorSelect.innerHTML = '<option value="">Not required</option>';
      vendorSelect.value = '';
    }
  }
  let _visInputQty = 0;
  function openProcess(batchId, inputQty) {
    _visInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    _activeBatch = b;
    document.getElementById('vis-batch-id').value = batchId;
    document.getElementById('vis-input-qty').value = inputQty;
    
    const isStock = b.isStockUpload || (b.batchNo && b.batchNo.includes('-REC-'));
    const stockFields = document.getElementById('vis-stock-fields');
    if (stockFields) {
      if (isStock) {
        stockFields.classList.remove('hidden');
        document.getElementById('vis-trno').value = '';
        document.getElementById('vis-shift-move').value = 'day';
        document.getElementById('vis-date-move').value = new Date().toISOString().slice(0,10);
        document.getElementById('vis-press-move').value = '';
        document.getElementById('vis-type-move-inhouse').checked = true;
        document.getElementById('vis-sub-batch-no').value = '';
      } else {
        stockFields.classList.add('hidden');
      }
    }

    const lossInput = document.getElementById('vis-loss-qty');
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

    const isRep = b.isReprocess || (b.batchNo && b.batchNo.endsWith('-REP'));
    const repQtyGroup = document.getElementById('vis-reprocess-qty-group');
    if (repQtyGroup) {
      if (isRep) {
        repQtyGroup.classList.add('hidden');
      } else {
        repQtyGroup.classList.remove('hidden');
      }
    }
    
    const destSelect = document.getElementById('vis-destination');
    if (destSelect) {
      destSelect.innerHTML = `
        <option value="gauge">Gauge Inspection</option>
        <option value="quality">Quality Final</option>
      `;
      destSelect.value = 'gauge';
    }

    document.getElementById('vis-batch-info').innerHTML = `<strong>${b.batchNo}</strong> — ${b.jmrefNo}<br><span class="text-muted text-sm">Input Qty: <strong>${formatNum(inputQty)}</strong></span>${b.recheckCount?` <span class="badge badge-amber">Recheck #${b.recheckIteration}</span>`:''}`;
    document.getElementById('vis-inspector').value = '';
    document.getElementById('vis-inspector-search').value = '';
    document.getElementById('vis-output-qty').value = '';
    document.getElementById('vis-reprocess-qty').value = '0';
    document.getElementById('vis-reprocess-destination').value = 'cryogenic';
    document.getElementById('vis-loss-qty').value = '';
    document.getElementById('vis-notes').value = '';
    onDestinationChange();
    document.getElementById('vis-process-modal').classList.remove('hidden');
  }

  function updateDynamicBatchNo() {
    if (!_activeBatch) return;
    const trNo = (document.getElementById('vis-trno')?.value || '').trim();
    const shift = document.getElementById('vis-shift-move')?.value || 'day';
    const dateVal = document.getElementById('vis-date-move')?.value || '';
    const pressNo = (document.getElementById('vis-press-move')?.value || '').trim();
    const typeVal = document.querySelector('[name=vis-type-move]:checked')?.value || 'inhouse';
    
    let dayStr = '';
    if (dateVal) {
      dayStr = dateVal.split('-')[2] || '';
    }
    
    const shiftCode = shift === 'night' ? 'N' : 'D';
    const typeCode = typeVal === 'subcontractor' ? 'S' : 'I';
    const subBatchInput = document.getElementById('vis-sub-batch-no');
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
    const out = parseInt(document.getElementById('vis-output-qty').value)||0;
    const rep = parseInt(document.getElementById('vis-reprocess-qty')?.value)||0;

    const destGroup = document.getElementById('vis-reprocess-dest-group');
    if (destGroup) {
      if (rep > 0) {
        destGroup.classList.remove('hidden');
      } else {
        destGroup.classList.add('hidden');
      }
    }

    if (!isStock) {
      document.getElementById('vis-loss-qty').value = Math.max(0, _visInputQty - out - rep);
    }
  }
  function process() {
    const batchId = document.getElementById('vis-batch-id').value;
    const inspectorName = document.getElementById('vis-inspector').value.trim();
    const outputQty = parseInt(document.getElementById('vis-output-qty').value);
    const reprocessQty = parseInt(document.getElementById('vis-reprocess-qty').value)||0;
    const reprocessDestination = document.getElementById('vis-reprocess-destination').value;
    const destination = document.getElementById('vis-destination').value;
    const vendorId = document.getElementById('vis-vendor').value;
    const notes = document.getElementById('vis-notes').value.trim();

    if (!inspectorName) { showToast('Inspector name is required', 'error'); return; }
    if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
    
    const batch = DB.Batches.find(batchId);
    const isRep = batch?.isReprocess || (batch?.batchNo && batch?.batchNo.endsWith('-REP'));
    const finalReprocessQty = isRep ? 0 : reprocessQty;
    
    if (isNaN(finalReprocessQty) || finalReprocessQty < 0) { showToast('Enter a valid reprocess quantity', 'error'); return; }
    

    if ((destination === 'trimming' || destination === 'deflashing') && !vendorId) { showToast('Please select a vendor', 'error'); return; }
    const finalVendorId = (destination === 'trimming' || destination === 'deflashing') ? vendorId : '';

    const session = Auth.getSession();
    const dateStr = new Date().toISOString().slice(0,10);
    const isStock = _activeBatch && (_activeBatch.isStockUpload || (_activeBatch.batchNo && _activeBatch.batchNo.includes('-REC-')));

    if (isStock) {
      const trNo = (document.getElementById('vis-trno')?.value || '').trim();
      const shift = document.getElementById('vis-shift-move')?.value || 'day';
      const dateVal = document.getElementById('vis-date-move')?.value || '';
      const pressNo = (document.getElementById('vis-press-move')?.value || '').trim();
      const typeVal = document.querySelector('[name=vis-type-move]:checked')?.value || 'inhouse';
      const subBatchNo = (document.getElementById('vis-sub-batch-no')?.value || '').trim();
      const lossQty = parseInt(document.getElementById('vis-loss-qty').value) || 0;
      
      if (!trNo) { showToast('Please enter a TR No', 'error'); return; }
      if (!dateVal) { showToast('Please select a production date', 'error'); return; }
      if (!pressNo) { showToast('Please enter a Press No', 'error'); return; }
      if (!subBatchNo) { showToast('Please fill all sub-batch fields', 'error'); return; }
      if (lossQty < 0) { showToast('Loss quantity cannot be negative', 'error'); return; }

      if (DB.Batches.all().some(b => b.batchNo === subBatchNo)) {
        showToast('Sub-batch number already exists: ' + subBatchNo, 'error');
        return;
      }

      const totalDeducted = outputQty + finalReprocessQty + lossQty;
      

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
        stage: 'visual',
        inputQty: totalDeducted,
        outputQty: outputQty,
        lossQty: lossQty,
        reprocessQty: finalReprocessQty,
        reprocessDestination: finalReprocessQty > 0 ? reprocessDestination : '',
        vendorId: finalVendorId,
        inspectorName,
        movedTo: destination,
        movedFrom: 'visual',
        date: dateStr,
        recordedBy: session?.userId,
        notes: notes,
        iterationNo: batch?.recheckIteration||null
      });

      if (lossQty > 0) {
        DB.LossTracker.insert({
          batchId: subBatch.id,
          stage: 'visual',
          lossQty,
          date: dateStr,
          jmrefNo: _activeBatch.jmrefNo,
          partNo: _activeBatch.partNo,
          iterationNo: batch?.recheckIteration||null
        });
      }

      if (finalReprocessQty > 0) {
        let baseBatchNo = `${_activeBatch.batchNo}-REP`;
        let repBatchNo = baseBatchNo;
        let counter = 1;
        while (DB.Batches.all().some(b => b.batchNo === repBatchNo)) {
          counter++;
          repBatchNo = `${baseBatchNo}-${counter}`;
        }
        const repBatch = DB.Batches.insert({
          batchNo: repBatchNo,
          partId: _activeBatch.partId,
          partNo: _activeBatch.partNo,
          jmrefNo: _activeBatch.jmrefNo,
          description: _activeBatch.description,
          currentStage: reprocessDestination,
          status: 'active',
          initialQty: finalReprocessQty,
          isReprocess: true,
          reprocessDestination: reprocessDestination,
          createdAt: new Date().toISOString(),
          notes: `Reprocess batch created from stock upload batch ${_activeBatch.batchNo}. Target: ${reprocessDestination}`
        });

        DB.StageRecords.insert({
          batchId: repBatch.id,
          stage: 'visual',
          inputQty: finalReprocessQty,
          outputQty: finalReprocessQty,
          lossQty: 0,
          movedTo: reprocessDestination,
          movedFrom: 'visual',
          date: dateStr,
          recordedBy: session?.userId,
          notes: `Reprocess batch created from stock upload batch ${_activeBatch.batchNo}. Target: ${reprocessDestination}`
        });

        setTimeout(() => {
          const confirmPrint = confirm(`Reprocess batch ${repBatchNo} created. Would you like to print its barcode label?`);
          if (confirmPrint) {
            window.printBarcode(repBatch.id);
          }
        }, 1200);
      }

      document.getElementById('vis-process-modal').classList.add('hidden');
      showToast('Sub-batch created and moved to ' + (STAGE_LABELS[destination] || destination), 'success');
      render();
      return;
    }

    const lossQty = Math.max(0, _visInputQty - outputQty - finalReprocessQty);

    DB.StageRecords.insert({
      batchId,
      stage: 'visual',
      inputQty: _visInputQty,
      outputQty,
      lossQty,
      reprocessQty: finalReprocessQty,
      reprocessDestination: finalReprocessQty > 0 ? reprocessDestination : '',
      vendorId: finalVendorId,
      inspectorName,
      movedTo: destination,
      movedFrom: 'visual',
      date: dateStr,
      recordedBy: session?.userId,
      notes: notes,
      iterationNo: batch?.recheckIteration||null
    });

    if (lossQty > 0) {
      DB.LossTracker.insert({
        batchId,
        stage: 'visual',
        lossQty,
        date: dateStr,
        jmrefNo: batch?.jmrefNo,
        partNo: batch?.partNo,
        iterationNo: batch?.recheckIteration||null
      });
    }

    if (finalReprocessQty > 0) {
      let baseBatchNo = `${batch.batchNo}-REP`;
      let repBatchNo = baseBatchNo;
      let counter = 1;
      while (DB.Batches.all().some(b => b.batchNo === repBatchNo)) {
        counter++;
        repBatchNo = `${baseBatchNo}-${counter}`;
      }
      const repBatch = DB.Batches.insert({
        batchNo: repBatchNo,
        partId: batch.partId,
        partNo: batch.partNo,
        jmrefNo: batch.jmrefNo,
        description: batch.description,
        currentStage: reprocessDestination,
        status: 'active',
        initialQty: finalReprocessQty,
        isReprocess: true,
        reprocessDestination: reprocessDestination,
        createdAt: new Date().toISOString(),
        notes: `Reprocess batch created from batch ${batch.batchNo}. Target: ${reprocessDestination}`
      });

      DB.StageRecords.insert({
        batchId: repBatch.id,
        stage: 'visual',
        inputQty: finalReprocessQty,
        outputQty: finalReprocessQty,
        lossQty: 0,
        movedTo: reprocessDestination,
        movedFrom: 'visual',
        date: dateStr,
        recordedBy: session?.userId,
        notes: `Reprocess batch created from batch ${batch.batchNo}. Target: ${reprocessDestination}`
      });

      setTimeout(() => {
        const confirmPrint = confirm(`Reprocess batch ${repBatchNo} created. Would you like to print its barcode label?`);
        if (confirmPrint) {
          window.printBarcode(repBatch.id);
        }
      }, 1200);
    }

    DB.Batches.update(batchId, { currentStage:destination });
    document.getElementById('vis-process-modal').classList.add('hidden');
    showToast('Batch moved to ' + (STAGE_LABELS[destination] || destination), 'success');
    render();
  }
  function openReject(batchId) {
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('vis-reject-id').value = batchId;
    document.getElementById('vis-reject-info').innerHTML = `Rejecting: <strong>${b.batchNo}</strong> — ${b.jmrefNo}`;
    document.getElementById('vis-reject-reason').value = '';
    document.getElementById('vis-reject-modal').classList.remove('hidden');
  }
  function rejectBatch() {
    const batchId = document.getElementById('vis-reject-id').value;
    const reason = document.getElementById('vis-reject-reason').value.trim();
    const session = Auth.getSession();
    DB.RejectionTracker.insert({ batchId, stage:'visual', qty:getInputQty(batchId), date:new Date().toISOString(), reason, rejectedBy:session?.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('vis-reject-modal').classList.add('hidden');
    showToast('Batch rejected', 'success');
    render();
  }
  document.addEventListener('click', e => {
    const list = document.getElementById('vis-inspector-dropdown');
    if (list && !e.target.closest('#vis-inspector-search') && !e.target.closest('#vis-inspector-dropdown')) {
      list.classList.add('hidden');
    }
  });

  function filterPending(val) {
    pendingSearch = val;
    const content = document.getElementById('vis-content');
    if (content) {
      const batches = DB.Batches.byStage('visual');
      content.innerHTML = pendingTab(batches);
      const inp = document.getElementById('vis-pending-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  return { render, openProcess, calcLoss, process, openReject, rejectBatch, showInspectorDropdown, filterInspectors, selectInspector, filterHistory, filterPending, updateDynamicBatchNo, onDestinationChange };
})();
