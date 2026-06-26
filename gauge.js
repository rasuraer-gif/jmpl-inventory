// ============================================================
// gauge.js — Gauge Inspection Department Module
// ============================================================
const GaugeModule = (() => {
  let historySearch = '';

  function getInputQty(batchId) {
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId && r.movedTo === 'gauge');
    return recs.length ? recs[recs.length-1].outputQty : 0;
  }
  function render() {
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('gauge');
    const history = DB.StageRecords.byStage('gauge');
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthLoss = DB.LossTracker.byStage('gauge').filter(l=>(l.date||'').startsWith(thisMonth)).reduce((s,l)=>s+(l.lossQty||0),0);
    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Gauge Inspection</h2><p class="text-sm text-muted mt-1">Gauge dimension inspection before Quality Final</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:520px;margin-bottom:24px;">
          <div class="stat-card purple"><div class="stat-label">Pending Batches</div><div class="stat-value purple">${batches.length}</div></div>
          <div class="stat-card red"><div class="stat-label">Loss This Month</div><div class="stat-value red">${formatNum(monthLoss)}</div></div>
          <div class="stat-card blue"><div class="stat-label">Total Inspected</div><div class="stat-value blue">${history.length}</div></div>
        </div>
        <div class="tabs" id="gauge-tabs">
          <button class="tab-btn active" data-tab="pending">Pending Batches</button>
          <button class="tab-btn" data-tab="history">History</button>
        </div>
        <div id="gauge-content">${pendingTab(batches)}</div>
      </div>
      ${processModal()}${rejectModal()}`;
    document.querySelectorAll('#gauge-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#gauge-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('gauge-content').innerHTML = btn.dataset.tab==='pending' ? pendingTab(batches) : historyTab();
      });
    });
  }
  function pendingTab(batches) {
    if (!batches.length) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#128207;</div><p>No batches pending gauge inspection</p></div></div>';
    const rows = batches.map(b => {
      const inputQty = getInputQty(b.id);
      return '<tr><td class="font-semibold text-blue">' + b.batchNo + '</td><td>' + (b.partNo||'&#x2014;') + '</td><td><span class="badge badge-teal">' + (b.jmrefNo||'&#x2014;') + '</span></td><td class="font-semibold">' + formatNum(inputQty) + '</td><td class="text-muted text-sm">' + (b.createdAt||'').slice(0,10) + '</td><td><div class="flex gap-2"><button class="btn btn-primary btn-xs" onclick="GaugeModule.openProcess(\'' + b.id + '\',' + inputQty + ')">Inspect</button><button class="btn btn-danger btn-xs" onclick="GaugeModule.openReject(\'' + b.id + '\')">Reject</button></div></td></tr>';
    }).join('');
    return '<div class="card"><div class="card-header"><h3>Pending Batches</h3></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Input Qty</th><th>Received</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function historyTab() {
    let recs = DB.StageRecords.byStage('gauge');
    if (historySearch) {
      const q = historySearch.toLowerCase();
      recs = recs.filter(r => {
        const b = DB.Batches.find(r.batchId) || {};
        return (b.batchNo || '').toLowerCase().includes(q);
      });
    }

    if (!recs.length) return `
      <div class="card card-body">
        <div style="margin-bottom: 12px; max-width: 280px;">
          <input type="text" id="gauge-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="GaugeModule.filterHistory(this.value)">
        </div>
        <div class="empty-state"><div class="empty-icon">&#128202;</div><p>No processing history found</p></div>
      </div>`;

    const rows = recs.map(r => {
      const b = DB.Batches.find(r.batchId)||{};
      const pct = r.inputQty ? ((r.lossQty / r.inputQty) * 100).toFixed(1) + '%' : '0.0%';
      return '<tr><td class="font-semibold">' + (b.batchNo||'&#x2014;') + '</td><td>' + (b.jmrefNo||'&#x2014;') + '</td><td>' + formatNum(r.inputQty) + '</td><td>' + formatNum(r.outputQty) + '</td><td class="text-danger font-semibold">' + formatNum(r.lossQty) + '</td><td><span class="badge badge-red">' + pct + '</span></td><td class="text-muted text-sm">' + (r.date||'').slice(0,10) + '</td></tr>';
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Gauge Inspection History</h3>
          <div class="search-input" style="max-width: 250px; margin: 0;">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="gauge-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="GaugeModule.filterHistory(this.value)">
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
    const content = document.getElementById('gauge-content');
    if (content) {
      content.innerHTML = historyTab();
      const inp = document.getElementById('gauge-history-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }
  function processModal() {
    return '<div class="modal-overlay hidden" id="gauge-process-modal"><div class="modal modal-sm"><div class="modal-header"><h3>Gauge Inspection</h3><button class="modal-close" onclick="document.getElementById(\'gauge-process-modal\').classList.add(\'hidden\')">&#x2715;</button></div><div class="modal-body"><input type="hidden" id="gauge-batch-id"><input type="hidden" id="gauge-input-qty"><div id="gauge-batch-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div><div class="form-group"><label class="form-label">Output Quantity <span class="required">*</span></label><input type="number" id="gauge-output-qty" class="form-control" min="0" oninput="GaugeModule.calcLoss()"></div><div class="form-group"><label class="form-label">Loss Quantity (Auto)</label><input type="text" id="gauge-loss-qty" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div><div class="form-group"><label class="form-label">Destination</label><input type="text" class="form-control" value="Quality Final" readonly style="opacity:0.6;"></div><div class="form-group"><label class="form-label">Notes</label><textarea id="gauge-notes" class="form-control" rows="2"></textarea></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById(\'gauge-process-modal\').classList.add(\'hidden\')">Cancel</button><button class="btn btn-primary" onclick="GaugeModule.process()">Move to Quality Final</button></div></div></div>';
  }
  function rejectModal() {
    return '<div class="modal-overlay hidden" id="gauge-reject-modal"><div class="modal modal-sm"><div class="modal-header"><h3>Reject Batch</h3><button class="modal-close" onclick="document.getElementById(\'gauge-reject-modal\').classList.add(\'hidden\')">&#x2715;</button></div><div class="modal-body"><input type="hidden" id="gauge-reject-id"><div id="gauge-reject-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div><div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="gauge-reject-reason" class="form-control" rows="3"></textarea></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById(\'gauge-reject-modal\').classList.add(\'hidden\')">Cancel</button><button class="btn btn-danger" onclick="GaugeModule.rejectBatch()">Confirm Reject</button></div></div></div>';
  }
  let _gaugeInputQty = 0;
  function openProcess(batchId, inputQty) {
    _gaugeInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('gauge-batch-id').value = batchId;
    document.getElementById('gauge-batch-info').innerHTML = '<strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo + '<br><span class="text-muted text-sm">Input Qty: <strong>' + formatNum(inputQty) + '</strong></span>';
    document.getElementById('gauge-output-qty').value = '';
    document.getElementById('gauge-loss-qty').value = '';
    document.getElementById('gauge-notes').value = '';
    document.getElementById('gauge-process-modal').classList.remove('hidden');
  }
  function calcLoss() {
    const out = parseInt(document.getElementById('gauge-output-qty').value)||0;
    document.getElementById('gauge-loss-qty').value = Math.max(0, _gaugeInputQty - out);
  }
  function process() {
    const batchId = document.getElementById('gauge-batch-id').value;
    const outputQty = parseInt(document.getElementById('gauge-output-qty').value);
    if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
    if (outputQty > _gaugeInputQty) { showToast('Output cannot exceed input quantity', 'error'); return; }
    const lossQty = Math.max(0, _gaugeInputQty - outputQty);
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);
    DB.StageRecords.insert({ batchId, stage:'gauge', inputQty:_gaugeInputQty, outputQty, lossQty, movedTo:'quality', movedFrom:'gauge', date:dateStr, recordedBy:session&&session.userId, notes:document.getElementById('gauge-notes').value });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'gauge', lossQty, date:dateStr, jmrefNo:batch&&batch.jmrefNo, partNo:batch&&batch.partNo });
    DB.Batches.update(batchId, { currentStage:'quality' });
    document.getElementById('gauge-process-modal').classList.add('hidden');
    showToast('Batch moved to Quality Final', 'success');
    render();
  }
  function openReject(batchId) {
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('gauge-reject-id').value = batchId;
    document.getElementById('gauge-reject-info').innerHTML = 'Rejecting: <strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo;
    document.getElementById('gauge-reject-reason').value = '';
    document.getElementById('gauge-reject-modal').classList.remove('hidden');
  }
  function rejectBatch() {
    const batchId = document.getElementById('gauge-reject-id').value;
    const reason = document.getElementById('gauge-reject-reason').value.trim();
    const session = Auth.getSession();
    DB.RejectionTracker.insert({ batchId, stage:'gauge', qty:getInputQty(batchId), date:new Date().toISOString().slice(0,10), reason, rejectedBy:session&&session.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('gauge-reject-modal').classList.add('hidden');
    showToast('Batch rejected', 'success');
    render();
  }
  return { render, openProcess, calcLoss, process, openReject, rejectBatch, filterHistory };
})();
