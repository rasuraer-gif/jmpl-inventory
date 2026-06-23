// ============================================================
// visual.js — Visual Inspection Department Module
// ============================================================
const VisualModule = (() => {
  function getInputQty(batchId) {
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId && r.movedTo === 'visual');
    return recs.length ? recs[recs.length-1].outputQty : (DB.Batches.find(batchId)||{}).initialQty||0;
  }
  function render() {
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('visual');
    const history = DB.StageRecords.byStage('visual');
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthLoss = DB.LossTracker.byStage('visual').filter(l=>(l.date||'').startsWith(thisMonth)).reduce((s,l)=>s+(l.lossQty||0),0);
    const inspectors = [...new Set(history.map(r=>r.inspectorName).filter(Boolean))];
    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Visual Inspection</h2><p class="text-sm text-muted mt-1">Inspect batches and record visual defects</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);max-width:700px;margin-bottom:24px;">
          <div class="stat-card green"><div class="stat-label">Pending Batches</div><div class="stat-value green">${batches.length}</div></div>
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
    if (!batches.length) return `<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#128065;&#65039;</div><p>No batches pending visual inspection</p></div></div>`;
    const rows = batches.map(b => {
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
    return `<div class="card"><div class="card-header"><h3>Pending Batches</h3></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Input Qty</th><th>Received</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function historyTab() {
    const recs = DB.StageRecords.byStage('visual');
    if (!recs.length) return `<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#128202;</div><p>No inspection history yet</p></div></div>`;
    const rows = recs.map(r => {
      const b = DB.Batches.find(r.batchId)||{};
      return `<tr><td class="font-semibold">${b.batchNo||'—'}</td><td>${b.jmrefNo||'—'}</td><td>${r.inspectorName||'—'}</td><td>${formatNum(r.inputQty)}</td><td>${formatNum(r.outputQty)}</td><td class="text-danger font-semibold">${formatNum(r.lossQty)}</td><td><span class="badge badge-gray">${r.movedTo||'—'}</span></td><td class="text-muted text-sm">${(r.date||'').slice(0,10)}</td></tr>`;
    }).join('');
    return `<div class="card"><div class="card-header"><h3>Inspection History</h3></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Batch</th><th>JMREF</th><th>Inspector</th><th>Input</th><th>Output</th><th>Loss</th><th>Moved To</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function processModal() {
    return `<div class="modal-overlay hidden" id="vis-process-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Visual Inspection &amp; Move</h3><button class="modal-close" onclick="document.getElementById('vis-process-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="vis-batch-id">
          <input type="hidden" id="vis-input-qty">
          <div id="vis-batch-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div>
          <div class="form-group"><label class="form-label">Inspector Name <span class="required">*</span></label><input type="text" id="vis-inspector" class="form-control" placeholder="Enter inspector name"></div>
          <div class="form-group"><label class="form-label">Output Quantity <span class="required">*</span></label><input type="number" id="vis-output-qty" class="form-control" min="0" oninput="VisualModule.calcLoss()"></div>
          <div class="form-group"><label class="form-label">Loss Quantity (Auto)</label><input type="text" id="vis-loss-qty" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div>
          <div class="form-group"><label class="form-label">Destination <span class="required">*</span></label>
            <select id="vis-destination" class="form-control">
              <option value="gauge">Gauge Inspection</option>
              <option value="quality">Quality Final</option>
            </select>
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
  let _visInputQty = 0;
  function openProcess(batchId, inputQty) {
    _visInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('vis-batch-id').value = batchId;
    document.getElementById('vis-input-qty').value = inputQty;
    document.getElementById('vis-batch-info').innerHTML = `<strong>${b.batchNo}</strong> — ${b.jmrefNo}<br><span class="text-muted text-sm">Input Qty: <strong>${formatNum(inputQty)}</strong></span>${b.recheckCount?` <span class="badge badge-amber">Recheck #${b.recheckIteration}</span>`:''}`;
    document.getElementById('vis-inspector').value = '';
    document.getElementById('vis-output-qty').value = '';
    document.getElementById('vis-loss-qty').value = '';
    document.getElementById('vis-notes').value = '';
    document.getElementById('vis-process-modal').classList.remove('hidden');
  }
  function calcLoss() {
    const out = parseInt(document.getElementById('vis-output-qty').value)||0;
    document.getElementById('vis-loss-qty').value = Math.max(0, _visInputQty - out);
  }
  function process() {
    const batchId = document.getElementById('vis-batch-id').value;
    const inspectorName = document.getElementById('vis-inspector').value.trim();
    const outputQty = parseInt(document.getElementById('vis-output-qty').value);
    const destination = document.getElementById('vis-destination').value;
    if (!inspectorName) { showToast('Inspector name is required', 'error'); return; }
    if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
    if (outputQty > _visInputQty) { showToast('Output cannot exceed input quantity', 'error'); return; }
    const lossQty = Math.max(0, _visInputQty - outputQty);
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);
    DB.StageRecords.insert({ batchId, stage:'visual', inputQty:_visInputQty, outputQty, lossQty, inspectorName, movedTo:destination, movedFrom:'visual', date:dateStr, recordedBy:session?.userId, notes:document.getElementById('vis-notes').value, iterationNo:batch?.recheckIteration||null });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'visual', lossQty, date:dateStr, jmrefNo:batch?.jmrefNo, partNo:batch?.partNo, iterationNo:batch?.recheckIteration||null });
    DB.Batches.update(batchId, { currentStage:destination });
    document.getElementById('vis-process-modal').classList.add('hidden');
    showToast('Batch moved to ' + (destination === 'gauge' ? 'Gauge Inspection' : 'Quality Final'), 'success');
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
    DB.RejectionTracker.insert({ batchId, stage:'visual', qty:getInputQty(batchId), date:new Date().toISOString().slice(0,10), reason, rejectedBy:session?.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('vis-reject-modal').classList.add('hidden');
    showToast('Batch rejected', 'success');
    render();
  }
  return { render, openProcess, calcLoss, process, openReject, rejectBatch };
})();
