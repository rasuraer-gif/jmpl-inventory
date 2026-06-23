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
    if (tab === 'create') attachCreateEvents();
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
    const master = DB.Master.all();
    const subs   = DB.Subcontractors.active();
    const ops    = DB.Operators.active();
    const partOpts = master.map(m => `<option value="${m.id}" data-partno="${m.partNo}" data-jmref="${m.jmrefNo}" data-desc="${m.description}">${m.partNo} — ${m.jmrefNo}</option>`).join('');
    const subOpts  = subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const opOpts   = ops.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    const batchNo  = DB.Batches.nextBatchNo();
    return `
      <div class="card animate-in">
        <div class="card-header"><h3>Create New Batch</h3></div>
        <div class="card-body">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Batch No</label><input type="text" class="form-control" value="${batchNo}" readonly style="opacity:0.6;"></div>
            <div class="form-group"><label class="form-label">Part <span class="required">*</span></label>
              <select id="prod-part" class="form-control" onchange="ProductionModule.onPartChange(this)">
                <option value="">Select Part...</option>${partOpts}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">JMREF No</label><input type="text" id="prod-jmref" class="form-control" readonly style="opacity:0.6;" placeholder="Auto-filled"></div>
            <div class="form-group"><label class="form-label">Description</label><input type="text" id="prod-desc" class="form-control" readonly style="opacity:0.6;" placeholder="Auto-filled"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Production Type <span class="required">*</span></label>
            <div class="flex gap-3 mt-1">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="prod-type" value="inhouse" checked onchange="ProductionModule.onTypeChange()"> <span>In-House</span></label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="prod-type" value="subcontractor" onchange="ProductionModule.onTypeChange()"> <span>Subcontractor</span></label>
            </div>
          </div>
          <div id="prod-sub-row" class="form-group hidden">
            <label class="form-label">Subcontractor <span class="required">*</span></label>
            <select id="prod-sub" class="form-control"><option value="">Select subcontractor...</option>${subOpts}</select>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Initial Quantity <span class="required">*</span></label><input type="number" id="prod-qty" class="form-control" placeholder="Total quantity" min="1"></div>
            <div class="form-group"><label class="form-label">Operator <span class="required">*</span></label>
              <select id="prod-op" class="form-control"><option value="">Select operator...</option>${opOpts}</select>
            </div>
          </div>
          <div class="form-group"><label class="form-label">No. of Lifts</label><input type="number" id="prod-lifts" class="form-control" placeholder="Number of lifts" min="0" value="0" style="max-width:280px;"></div>
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
    document.getElementById('move-batch-info').innerHTML = `<strong>${b.batchNo}</strong> &mdash; ${b.jmrefNo} &mdash; ${b.partNo}<br><span class="text-muted text-sm">Initial Qty: <strong>${formatNum(_moveInputQty)}</strong></span>`;
    document.getElementById('move-output-qty').value = '';
    document.getElementById('move-loss-qty').value = '';
    document.getElementById('move-destination').value = 'cryogenic';
    document.getElementById('move-notes').value = '';
    document.getElementById('prod-move-modal').classList.remove('hidden');
  }

  function calcLoss() {
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
    if (outputQty > _moveInputQty) { showToast('Output quantity cannot exceed input quantity', 'error'); return; }
    const lossQty = Math.max(0, _moveInputQty - outputQty);
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);
    DB.StageRecords.insert({ batchId, stage:'production', inputQty:_moveInputQty, outputQty, lossQty, movedTo:destination, movedFrom:'production', date:dateStr, recordedBy:session?.userId, notes });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'production', lossQty, date:dateStr, jmrefNo:batch.jmrefNo, partNo:batch.partNo });
    DB.Batches.update(batchId, { currentStage: destination });
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

  function onPartChange(sel) {
    const opt = sel.options[sel.selectedIndex];
    document.getElementById('prod-jmref').value = opt.dataset.jmref || '';
    document.getElementById('prod-desc').value = opt.dataset.desc || '';
  }

  function onTypeChange() {
    const type = document.querySelector('[name=prod-type]:checked')?.value;
    const subRow = document.getElementById('prod-sub-row');
    if (subRow) subRow.classList.toggle('hidden', type !== 'subcontractor');
  }

  function createBatch() {
    const partEl = document.getElementById('prod-part');
    const partId = partEl?.value;
    const part = DB.Master.find(partId);
    if (!part) { showToast('Please select a part', 'error'); return; }
    const type = document.querySelector('[name=prod-type]:checked')?.value || 'inhouse';
    const subId = type === 'subcontractor' ? document.getElementById('prod-sub')?.value : null;
    if (type === 'subcontractor' && !subId) { showToast('Please select a subcontractor', 'error'); return; }
    const qty = parseInt(document.getElementById('prod-qty')?.value);
    if (!qty || qty < 1) { showToast('Please enter a valid quantity', 'error'); return; }
    const opId = document.getElementById('prod-op')?.value;
    if (!opId) { showToast('Please select an operator', 'error'); return; }
    const lifts = parseInt(document.getElementById('prod-lifts')?.value) || 0;
    const notes = document.getElementById('prod-notes')?.value.trim() || '';
    const session = Auth.getSession();
    const batch = DB.Batches.insert({ partId, partNo: part.partNo, jmrefNo: part.jmrefNo, description: part.description, currentStage:'production', status:'active', productionType: type, subcontractorId: subId||null, operatorId: opId, initialQty: qty, recheckCount:0 });
    DB.ProductionRecords.insert({ batchId: batch.id, operatorId: opId, noOfLifts: lifts, date: new Date().toISOString().slice(0,10), createdBy: session?.userId });
    showToast('Batch ' + batch.batchNo + ' created successfully', 'success');
    renderStats();
    activeTab = 'active';
    document.querySelectorAll('#prod-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'active'));
    renderTab('active');
  }

  function resetForm() { renderTab('create'); }

  function attachCreateEvents() {}

  return { render, openMove, calcLoss, moveBatch, openReject, rejectBatch, onPartChange, onTypeChange, createBatch, resetForm };
})();
