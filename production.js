// ============================================================
// production.js — Production Department Module
// ============================================================
const ProductionModule = (() => {
  let activeTab = 'active';

  function getInputQtyForBatch(batch) {
    return batch.initialQty || 0;
  }

  function render() {
    const el = document.getElementById('content');
    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div><h2 class="font-bold" style="font-size:20px;">Production</h2><p class="text-sm text-muted mt-1">Create and manage production batches</p></div>
        </div>
        <div id="prod-stats" class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:24px;"></div>
        <div class="tabs" id="prod-tabs">
          <button class="tab-btn ${activeTab==='active'?'active':''}" data-tab="active">Active Batches</button>
          <button class="tab-btn ${activeTab==='create'?'active':''}" data-tab="create">+ Create Batch</button>
          <button class="tab-btn ${activeTab==='completed'?'active':''}" data-tab="completed">Completed</button>
          <button class="tab-btn ${activeTab==='rejected'?'active':''}" data-tab="rejected">Rejected</button>
        </div>
        <div id="prod-tab-content"></div>
      </div>
      ${moveModal()}${rejectModal()}`;

    document.querySelectorAll('#prod-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#prod-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        renderTab(activeTab);
      });
    });
    renderStats();
    renderTab(activeTab);
  }

  function renderStats() {
    const batches = DB.Batches.all();
    const active = batches.filter(b => b.currentStage === 'production' && b.status === 'active').length;
    const completed = batches.filter(b => b.status === 'completed').length;
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthBatches = batches.filter(b => (b.createdAt||'').startsWith(thisMonth)).length;
    const el = document.getElementById('prod-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-card purple"><div class="stat-label">Active in Production</div><div class="stat-value purple">${active}</div></div>
      <div class="stat-card green"><div class="stat-label">Completed Batches</div><div class="stat-value green">${completed}</div></div>
      <div class="stat-card blue"><div class="stat-label">Created This Month</div><div class="stat-value blue">${monthBatches}</div></div>`;
  }

  function renderTab(tab) {
    const el = document.getElementById('prod-tab-content');
    if (!el) return;
    if (tab === 'active')    el.innerHTML = activeBatchesTab();
    if (tab === 'create')    el.innerHTML = createBatchTab();
    if (tab === 'completed') el.innerHTML = completedTab();
    if (tab === 'rejected')  el.innerHTML = rejectedTab();
  }

  function activeBatchesTab() {
    const batches = DB.Batches.byStage('production');
    const subs = DB.Subcontractors.all();
    const ops  = DB.Operators.all();
    if (!batches.length) return `<div class="card"><div class="card-body"><div class="empty-state"><div class="empty-icon">&#127981;</div><p>No active batches in Production. Create a new batch to get started.</p></div></div></div>`;
    const rows = batches.map(b => {
      const sub = subs.find(s => s.id === b.subcontractorId);
      const op  = ops.find(o => o.id === b.operatorId);
      return `
        <tr>
          <td class="font-semibold text-blue">${b.batchNo}</td>
          <td>${b.partNo||'—'}</td>
          <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
          <td><span class="badge ${b.productionType==='inhouse'?'badge-blue':'badge-amber'}">${b.productionType==='inhouse'?'In-House':'Subcontractor'}</span></td>
          <td>${b.productionType==='subcontractor'?(sub?sub.name:'—'):'—'}</td>
          <td>${op?op.name:(b.operatorName||'—')}</td>
          <td class="font-semibold">${formatNum(b.initialQty)}</td>
          <td class="text-muted text-sm">${(b.createdAt||'').slice(0,10)}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-primary btn-xs" onclick="ProductionModule.openMove('${b.id}')">Move Stage</button>
              <button class="btn btn-danger btn-xs" onclick="ProductionModule.openReject('${b.id}')">Reject</button>
            </div>
          </td>
        </tr>`;
    }).join('');
    return `
      <div class="card">
        <div class="card-header"><h3>Active Batches in Production</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Type</th><th>Subcontractor</th><th>Operator</th><th>Initial Qty</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function createBatchTab() {
    const todayStr = new Date().toISOString().slice(0,10);
    const subs   = DB.Subcontractors.active();
    const ops    = DB.Operators.active();
    const subOpts  = subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const opOpts   = ops.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    return `
      <div class="card animate-in">
        <div class="card-header"><h3>Create New Batch</h3></div>
        <div class="card-body">
          <!-- Field Order: Part No, TR No, Shift, Operator, Lift -->
          <div class="form-row">
            <div class="form-group" style="position:relative; flex:1;">
              <label class="form-label">Part No <span class="required">*</span></label>
              <input type="text" id="prod-part-search" class="form-control" placeholder="Search Part No or JMREF..." onfocus="ProductionModule.showPartDropdown()" oninput="ProductionModule.filterParts(this.value)" autocomplete="off">
              <input type="hidden" id="prod-part-id">
              <div id="prod-part-dropdown" class="hidden" style="position:absolute; top:100%; left:0; right:0; z-index:1000; max-height:220px; overflow-y:auto; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.3); margin-top:4px; padding: 4px;"></div>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">TR No <span class="required">*</span></label>
              <input type="text" id="prod-trno" class="form-control" placeholder="Enter TR No" oninput="ProductionModule.updateDynamicBatchNo()">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Shift <span class="required">*</span></label>
              <select id="prod-shift" class="form-control" onchange="ProductionModule.updateDynamicBatchNo()">
                <option value="day">Day (D)</option>
                <option value="night">Night (N)</option>
              </select>
            </div>
             <div class="form-group" style="flex:1;" id="prod-op-group">
              <label class="form-label">Operator <span class="required">*</span></label>
              <select id="prod-op" class="form-control"><option value="">Select operator...</option>${opOpts}</select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex:1;">
              <label class="form-label">No. of Lifts <span class="required">*</span></label>
              <input type="number" id="prod-lifts" class="form-control" placeholder="Number of lifts" min="0" value="0">
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">Production Date <span class="required">*</span></label>
              <input type="date" id="prod-date" class="form-control" value="${todayStr}" onchange="ProductionModule.updateDynamicBatchNo()">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Batch No (Auto-Generated)</label>
              <input type="text" id="prod-batch-no" class="form-control" readonly style="opacity:0.8; font-weight:bold; color:var(--primary);" placeholder="Select Part and enter TR No">
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">Production Type <span class="required">*</span></label>
              <div class="flex gap-3 mt-2">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="prod-type" value="inhouse" checked onchange="ProductionModule.onTypeChange()"> <span>In-House</span></label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="prod-type" value="subcontractor" onchange="ProductionModule.onTypeChange()"> <span>Subcontractor</span></label>
              </div>
            </div>
          </div>

          <div id="prod-sub-row" class="form-group hidden">
            <label class="form-label">Subcontractor <span class="required">*</span></label>
            <select id="prod-sub" class="form-control"><option value="">Select subcontractor...</option>${subOpts}</select>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex:1;"><label class="form-label">JMREF No</label><input type="text" id="prod-jmref" class="form-control" readonly style="opacity:0.6;" placeholder="Auto-filled"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">Description</label><input type="text" id="prod-desc" class="form-control" readonly style="opacity:0.6;" placeholder="Auto-filled"></div>
          </div>

          <div class="form-group"><label class="form-label">Notes</label><textarea id="prod-notes" class="form-control" rows="2" placeholder="Optional notes"></textarea></div>
          <div class="flex gap-3 mt-2">
            <button class="btn btn-primary" onclick="ProductionModule.createBatch()">Create Batch</button>
            <button class="btn btn-secondary" onclick="ProductionModule.resetForm()">Reset</button>
          </div>
        </div>
      </div>`;
  }

  function completedTab() {
    const batches = DB.Batches.byStatus('completed');
    if (!batches.length) return `<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#9989;</div><p>No completed batches yet</p></div></div>`;
    const rows = batches.map(b => `
      <tr>
        <td class="font-semibold text-blue">${b.batchNo}</td>
        <td>${b.partNo||'—'}</td>
        <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
        <td><span class="badge badge-green">Completed</span></td>
        <td class="text-muted text-sm">${(b.createdAt||'').slice(0,10)}</td>
        <td class="text-muted text-sm">${(b.completedAt||'').slice(0,10)}</td>
      </tr>`).join('');
    return `<div class="card"><div class="card-header"><h3>Completed Batches</h3></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Status</th><th>Created</th><th>Completed</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function rejectedTab() {
    const batches = DB.Batches.byStatus('rejected');
    if (!batches.length) return `<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#x1F6AB;</div><p>No rejected batches</p></div></div>`;
    const rows = batches.map(b => `
      <tr>
        <td class="font-semibold">${b.batchNo}</td>
        <td>${b.partNo||'—'}</td>
        <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
        <td><span class="badge badge-red">Rejected</span></td>
        <td class="text-muted text-sm">${(b.createdAt||'').slice(0,10)}</td>
      </tr>`).join('');
    return `<div class="card"><div class="card-header"><h3>Rejected Batches</h3></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function moveModal() {
    return `
      <div class="modal-overlay hidden" id="prod-move-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3>Move Batch to Next Stage</h3>
            <button class="modal-close" onclick="document.getElementById('prod-move-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="move-batch-id">
            <div id="move-batch-info" class="card" style="padding:12px;margin-bottom:16px;background:var(--bg-input);"></div>
            <div class="form-group"><label class="form-label">Output Quantity <span class="required">*</span></label>
              <input type="number" id="move-output-qty" class="form-control" placeholder="Quantity moved to next stage" min="0" oninput="ProductionModule.calcLoss()">
            </div>
            <div class="form-group"><label class="form-label">Loss Quantity (Auto-calculated)</label>
              <input type="text" id="move-loss-qty" class="form-control" readonly style="color:var(--accent-red);font-weight:700;">
            </div>
            <div class="form-group"><label class="form-label">Destination Stage <span class="required">*</span></label>
              <select id="move-destination" class="form-control">
                <option value="cryogenic">Cryogenic</option>
                <option value="deflashing">Manual DE Flashing</option>
                <option value="trimming">Trimming</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Notes</label><textarea id="move-notes" class="form-control" rows="2"></textarea></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('prod-move-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="ProductionModule.moveBatch()">Move Batch</button>
          </div>
        </div>
      </div>`;
  }

  function rejectModal() {
    return `
      <div class="modal-overlay hidden" id="prod-reject-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3>Reject Batch</h3>
            <button class="modal-close" onclick="document.getElementById('prod-reject-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="reject-batch-id">
            <div id="reject-batch-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div>
            <div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="reject-reason" class="form-control" rows="3" placeholder="Reason for rejection..."></textarea></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('prod-reject-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-danger" onclick="ProductionModule.rejectBatch()">Confirm Reject</button>
          </div>
        </div>
      </div>`;
  }

  let _moveBatchId = null;
  let _moveInputQty = 0;

  function openMove(batchId) {
    const b = DB.Batches.find(batchId);
    if (!b) return;
    _moveBatchId = batchId;
    _moveInputQty = b.initialQty || 0;
    document.getElementById('move-batch-id').value = batchId;
    
    const lossGroup = document.getElementById('move-loss-qty').parentElement;
    if (!_moveInputQty) {
      document.getElementById('move-batch-info').innerHTML = `<strong>${b.batchNo}</strong> &mdash; ${b.jmrefNo} &mdash; ${b.partNo}<br><span class="text-muted text-sm" style="color:var(--primary); font-weight:600;">Please enter the total quantity produced.</span>`;
      document.getElementById('move-output-qty').value = '';
      document.getElementById('move-output-qty').placeholder = "Total quantity produced";
      document.getElementById('move-loss-qty').value = '0';
      if (lossGroup) lossGroup.style.display = 'none';
    } else {
      document.getElementById('move-batch-info').innerHTML = `<strong>${b.batchNo}</strong> &mdash; ${b.jmrefNo} &mdash; ${b.partNo}<br><span class="text-muted text-sm">Initial Qty: <strong>${formatNum(_moveInputQty)}</strong></span>`;
      document.getElementById('move-output-qty').value = '';
      document.getElementById('move-output-qty').placeholder = "Quantity moved to next stage";
      document.getElementById('move-loss-qty').value = '';
      if (lossGroup) lossGroup.style.display = 'block';
    }
    document.getElementById('move-destination').value = 'cryogenic';
    document.getElementById('move-notes').value = '';
    document.getElementById('prod-move-modal').classList.remove('hidden');
  }

  function calcLoss() {
    if (!_moveInputQty) {
      document.getElementById('move-loss-qty').value = '0';
      return;
    }
    const out = parseInt(document.getElementById('move-output-qty').value) || 0;
    const loss = Math.max(0, _moveInputQty - out);
    document.getElementById('move-loss-qty').value = loss;
  }

  function moveBatch() {
    const batchId = document.getElementById('move-batch-id').value;
    const outputQty = parseInt(document.getElementById('move-output-qty').value);
    const destination = document.getElementById('move-destination').value;
    const notes = document.getElementById('move-notes').value.trim();
    const session = Auth.getSession();
    if (!outputQty && outputQty !== 0) { showToast('Output quantity is required', 'error'); return; }
    if (_moveInputQty && outputQty > _moveInputQty) { showToast('Output quantity cannot exceed input quantity', 'error'); return; }
    const inputQty = _moveInputQty || outputQty;
    const lossQty = Math.max(0, inputQty - outputQty);
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);
    DB.StageRecords.insert({ batchId, stage:'production', inputQty, outputQty, lossQty, movedTo:destination, movedFrom:'production', date:dateStr, recordedBy:session?.userId, notes });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'production', lossQty, date:dateStr, jmrefNo:batch.jmrefNo, partNo:batch.partNo });
    DB.Batches.update(batchId, { currentStage: destination, initialQty: inputQty });
    document.getElementById('prod-move-modal').classList.add('hidden');
    showToast('Batch moved to ' + destination, 'success');
    renderStats();
    renderTab('active');
  }

  function openReject(batchId) {
    const b = DB.Batches.find(batchId);
    if (!b) return;
    document.getElementById('reject-batch-id').value = batchId;
    document.getElementById('reject-batch-info').innerHTML = `<strong class="text-danger">Rejecting:</strong> ${b.batchNo} &mdash; ${b.jmrefNo}`;
    document.getElementById('reject-reason').value = '';
    document.getElementById('prod-reject-modal').classList.remove('hidden');
  }

  function rejectBatch() {
    const batchId = document.getElementById('reject-batch-id').value;
    const reason = document.getElementById('reject-reason').value.trim();
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    DB.RejectionTracker.insert({ batchId, stage:'production', qty: batch?.initialQty||0, date: new Date().toISOString().slice(0,10), reason, rejectedBy: session?.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('prod-reject-modal').classList.add('hidden');
    showToast('Batch rejected and recorded', 'success');
    renderStats(); renderTab('active');
  }

  function showPartDropdown() {
    const list = document.getElementById('prod-part-dropdown');
    if (!list) return;
    list.classList.remove('hidden');
    filterParts(document.getElementById('prod-part-search').value || '');
  }

  function filterParts(query) {
    const list = document.getElementById('prod-part-dropdown');
    if (!list) return;
    const parts = DB.Master.all();
    const q = query.toLowerCase();
    
    const filtered = parts.filter(p => 
      p.partNo.toLowerCase().includes(q) || 
      p.jmrefNo.toLowerCase().includes(q) || 
      (p.description || '').toLowerCase().includes(q)
    );
    
    if (filtered.length === 0) {
      list.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:12.5px; text-align:center;">No parts found.</div>`;
      return;
    }
    
    list.innerHTML = filtered.map(p => `
      <div class="dropdown-item" 
           style="padding:8px 12px; cursor:pointer; border-radius:4px; transition:background 0.2s; font-size:13px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;"
           onclick="ProductionModule.selectPart('${p.id}', '${p.partNo}', '${p.jmrefNo}', '${p.description.replace(/'/g, "\\'")}')"
           onmouseover="this.style.background='rgba(99,102,241,0.15)'"
           onmouseout="this.style.background='transparent'">
        <div>
          <span style="font-weight:600; color:var(--primary);">${p.partNo}</span>
          <span class="badge badge-teal" style="margin-left:8px; font-size:10px;">${p.jmrefNo}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.description}</div>
      </div>
    `).join('');
  }

  function selectPart(id, partNo, jmref, desc) {
    document.getElementById('prod-part-id').value = id;
    document.getElementById('prod-part-search').value = partNo;
    document.getElementById('prod-jmref').value = jmref;
    document.getElementById('prod-desc').value = desc;
    
    const list = document.getElementById('prod-part-dropdown');
    if (list) list.classList.add('hidden');
    
    updateDynamicBatchNo();
  }

  function updateDynamicBatchNo() {
    const jmrefNo = document.getElementById('prod-jmref')?.value || '';
    const trNo = document.getElementById('prod-trno')?.value.trim() || '';
    const dateVal = document.getElementById('prod-date')?.value || '';
    const shiftVal = document.getElementById('prod-shift')?.value || 'day';
    
    let dayStr = '';
    if (dateVal) {
      dayStr = dateVal.split('-')[2] || '';
    }
    
    const shiftCode = shiftVal === 'night' ? 'N' : 'D';
    
    const batchNoInput = document.getElementById('prod-batch-no');
    if (batchNoInput) {
      if (jmrefNo && trNo && dayStr) {
        batchNoInput.value = `${jmrefNo}-${trNo}-${dayStr}-${shiftCode}`;
      } else {
        batchNoInput.value = '';
      }
    }
  }

  function onTypeChange() {
    const type = document.querySelector('[name=prod-type]:checked')?.value;
    const subRow = document.getElementById('prod-sub-row');
    if (subRow) subRow.classList.toggle('hidden', type !== 'subcontractor');

    const opGroup = document.getElementById('prod-op-group');
    if (opGroup) opGroup.classList.toggle('hidden', type === 'subcontractor');
  }

  function createBatch() {
    const partId = document.getElementById('prod-part-id')?.value;
    const part = DB.Master.find(partId);
    if (!part) { showToast('Please select a part from search dropdown', 'error'); return; }
    
    const trNo = document.getElementById('prod-trno')?.value.trim();
    if (!trNo) { showToast('Please enter a TR No', 'error'); return; }
    
    const shift = document.getElementById('prod-shift')?.value || 'day';
    
    const type = document.querySelector('[name=prod-type]:checked')?.value || 'inhouse';
    const opId = type === 'subcontractor' ? '' : (document.getElementById('prod-op')?.value || '');
    if (type !== 'subcontractor' && !opId) { showToast('Please select an operator', 'error'); return; }
    
    const lifts = parseInt(document.getElementById('prod-lifts')?.value) || 0;
    const prodDate = document.getElementById('prod-date')?.value || new Date().toISOString().slice(0,10);
    const subId = type === 'subcontractor' ? document.getElementById('prod-sub')?.value : null;
    if (type === 'subcontractor' && !subId) { showToast('Please select a subcontractor', 'error'); return; }
    
    const notes = document.getElementById('prod-notes')?.value.trim() || '';
    const session = Auth.getSession();
    
    updateDynamicBatchNo();
    const batchNo = document.getElementById('prod-batch-no')?.value;
    if (!batchNo) { showToast('Batch No could not be generated. Check fields.', 'error'); return; }
    
    const batchExists = DB.Batches.all().some(b => b.batchNo === batchNo);
    if (batchExists) { showToast(`Batch No ${batchNo} already exists!`, 'error'); return; }
    
    const batch = DB.Batches.insert({ 
      batchNo,
      partId, 
      partNo: part.partNo, 
      jmrefNo: part.jmrefNo, 
      description: part.description, 
      currentStage:'production', 
      status:'active', 
      productionType: type, 
      subcontractorId: subId||null, 
      operatorId: opId||null, 
      initialQty: 0,
      shift,
      trNo,
      productionDate: prodDate,
      recheckCount:0 
    });
    
    DB.ProductionRecords.insert({ 
      batchId: batch.id, 
      operatorId: opId||null, 
      noOfLifts: lifts, 
      date: prodDate, 
      shift,
      trNo,
      createdBy: session?.userId 
    });
    
    showToast('Batch ' + batch.batchNo + ' created successfully', 'success');
    renderStats();
    activeTab = 'active';
    document.querySelectorAll('#prod-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'active'));
    renderTab('active');
  }

  function resetForm() { renderTab('create'); }

  document.addEventListener('click', e => {
    const list = document.getElementById('prod-part-dropdown');
    if (list && !e.target.closest('#prod-part-search') && !e.target.closest('#prod-part-dropdown')) {
      list.classList.add('hidden');
    }
  });

  return { render, openMove, calcLoss, moveBatch, openReject, rejectBatch, onTypeChange, createBatch, resetForm, showPartDropdown, filterParts, selectPart, updateDynamicBatchNo };
})();
