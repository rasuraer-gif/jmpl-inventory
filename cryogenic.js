// ============================================================
// cryogenic.js — Cryogenic Department Module
// ============================================================
const CryogenicModule = (() => {
  let historySearch = '';
  let pendingSearch = '';

  function getInputQty(batchId) {
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId && r.movedTo === 'cryogenic');
    if (!recs.length) return 0;
    const lastRec = recs[recs.length - 1];
    return lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
  }
  function render() {
    pendingSearch = '';
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('cryogenic');
    const history = DB.StageRecords.byStage('cryogenic');
    const thisMonth = new Date().toISOString().slice(0,7);
    const monthLoss = DB.LossTracker.byStage('cryogenic').filter(l=>(l.date||'').startsWith(thisMonth)).reduce((s,l)=>s+(l.lossQty||0),0);
    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Cryogenic</h2><p class="text-sm text-muted mt-1">Process and move batches from Cryogenic to Trimming</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:520px;margin-bottom:24px;">
          <div class="stat-card blue"><div class="stat-label">Pending Batches</div><div class="stat-value blue">${batches.length}</div></div>
          <div class="stat-card red"><div class="stat-label">Loss This Month</div><div class="stat-value red">${formatNum(monthLoss)}</div></div>
          <div class="stat-card teal"><div class="stat-label">Processed (Total)</div><div class="stat-value teal">${history.length}</div></div>
        </div>
        <div class="tabs" id="cryo-tabs">
          <button class="tab-btn active" data-tab="pending">Pending Batches</button>
          <button class="tab-btn" data-tab="history">History</button>
        </div>
        <div id="cryo-content">${pendingTab(batches)}</div>
      </div>
      ${processModal()}${rejectModal()}`;
    document.querySelectorAll('#cryo-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#cryo-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('cryo-content').innerHTML = btn.dataset.tab==='pending' ? pendingTab(batches) : historyTab();
      });
    });
  }
  function pendingTab(batches) {
    let filtered = batches;
    if (pendingSearch) {
      const q = pendingSearch.toLowerCase();
      filtered = batches.filter(b => (b.batchNo || '').toLowerCase().includes(q));
    }
    if (!filtered.length && !pendingSearch) return `<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#10052;&#65039;</div><p>No batches in Cryogenic stage</p></div></div>`;
    const rows = filtered.map(b => {
      const inputQty = getInputQty(b.id);
      return `<tr>
        <td class="font-semibold text-blue">${b.batchNo}</td>
        <td>${b.partNo||'—'}</td>
        <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
        <td class="font-semibold">${formatNum(inputQty)}</td>
        <td class="text-muted text-sm">${(b.createdAt||'').slice(0,10)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-primary btn-xs" onclick="CryogenicModule.openProcess('${b.id}',${inputQty})">Process &amp; Move</button>
            <button class="btn btn-danger btn-xs" onclick="CryogenicModule.openReject('${b.id}')">Reject</button>
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
            <input type="text" id="cryo-pending-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${pendingSearch}" oninput="CryogenicModule.filterPending(this.value)">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('cryo-pending-search', (val) => CryogenicModule.filterPending(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
      </div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Input Qty</th><th>Received</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}</tbody></table></div></div>`;
  }
  function historyTab() {
    let recs = DB.StageRecords.byStage('cryogenic');
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
          <input type="text" id="cryo-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="CryogenicModule.filterHistory(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('cryo-history-search', (val) => CryogenicModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
        <div class="empty-state"><div class="empty-icon">&#128202;</div><p>No processing history found</p></div>
      </div>`;

    const rows = recs.map(r => {
      const b = DB.Batches.find(r.batchId)||{};
      const pct = r.inputQty ? ((r.lossQty / r.inputQty) * 100).toFixed(1) + '%' : '0.0%';
      return `<tr><td class="font-semibold">${b.batchNo||'—'}</td><td>${b.jmrefNo||'—'}</td><td>${formatNum(r.inputQty)}</td><td>${formatNum(r.outputQty)}</td><td class="text-danger font-semibold">${formatNum(r.lossQty)}</td><td><span class="badge badge-red">${pct}</span></td><td class="text-muted text-sm">${(r.date||'').slice(0,10)}</td></tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Processing History</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="cryo-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="CryogenicModule.filterHistory(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('cryo-history-search', (val) => CryogenicModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch No</th><th>JMREF</th><th>Input</th><th>Output</th><th>Loss</th><th>% Loss</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }
  function filterHistory(val) {
    historySearch = val;
    const content = document.getElementById('cryo-content');
    if (content) {
      content.innerHTML = historyTab();
      const inp = document.getElementById('cryo-history-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }
  function processModal() {
    return `<div class="modal-overlay hidden" id="cryo-process-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Process &amp; Move to Trimming</h3><button class="modal-close" onclick="document.getElementById('cryo-process-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="cryo-batch-id">
          <input type="hidden" id="cryo-input-qty">
          <div id="cryo-batch-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div>
          <div class="form-group"><label class="form-label">Output Quantity <span class="required">*</span></label><input type="number" id="cryo-output-qty" class="form-control" min="0" oninput="CryogenicModule.calcLoss()"></div>
          <div class="form-group"><label class="form-label">Loss Quantity (Auto)</label><input type="text" id="cryo-loss-qty" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div>
          <div class="form-group"><label class="form-label">Destination</label><input type="text" class="form-control" value="Trimming" readonly style="opacity:0.6;"></div>
          <div class="form-group"><label class="form-label">Notes</label><textarea id="cryo-notes" class="form-control" rows="2"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('cryo-process-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-primary" onclick="CryogenicModule.process()">Move to Trimming</button>
        </div>
      </div>
    </div>`;
  }
  function rejectModal() {
    return `<div class="modal-overlay hidden" id="cryo-reject-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><h3>Reject Batch</h3><button class="modal-close" onclick="document.getElementById('cryo-reject-modal').classList.add('hidden')">&#x2715;</button></div>
        <div class="modal-body">
          <input type="hidden" id="cryo-reject-id">
          <div id="cryo-reject-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div>
          <div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="cryo-reject-reason" class="form-control" rows="3"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('cryo-reject-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-danger" onclick="CryogenicModule.rejectBatch()">Confirm Reject</button>
        </div>
      </div>
    </div>`;
  }
  let _cryoInputQty = 0;
  function openProcess(batchId, inputQty) {
    _cryoInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('cryo-batch-id').value = batchId;
    document.getElementById('cryo-input-qty').value = inputQty;
    document.getElementById('cryo-batch-info').innerHTML = `<strong>${b.batchNo}</strong> — ${b.jmrefNo}<br><span class="text-muted text-sm">Input Qty: <strong>${formatNum(inputQty)}</strong></span>`;
    document.getElementById('cryo-output-qty').value = '';
    document.getElementById('cryo-loss-qty').value = '';
    document.getElementById('cryo-notes').value = '';
    document.getElementById('cryo-process-modal').classList.remove('hidden');
  }
  function calcLoss() {
    const out = parseInt(document.getElementById('cryo-output-qty').value)||0;
    document.getElementById('cryo-loss-qty').value = Math.max(0, _cryoInputQty - out);
  }
  function process() {
    const batchId = document.getElementById('cryo-batch-id').value;
    const outputQty = parseInt(document.getElementById('cryo-output-qty').value);
    if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
    if (outputQty > _cryoInputQty) { showToast('Output cannot exceed input quantity', 'error'); return; }
    const lossQty = Math.max(0, _cryoInputQty - outputQty);
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);
    DB.StageRecords.insert({ batchId, stage:'cryogenic', inputQty:_cryoInputQty, outputQty, lossQty, movedTo:'trimming', movedFrom:'cryogenic', date:dateStr, recordedBy:session?.userId, notes:document.getElementById('cryo-notes').value });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'cryogenic', lossQty, date:dateStr, jmrefNo:batch?.jmrefNo, partNo:batch?.partNo });
    DB.Batches.update(batchId, { currentStage:'trimming' });
    document.getElementById('cryo-process-modal').classList.add('hidden');
    showToast('Batch moved to Trimming', 'success');
    render();
  }
  function openReject(batchId) {
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('cryo-reject-id').value = batchId;
    document.getElementById('cryo-reject-info').innerHTML = `Rejecting: <strong>${b.batchNo}</strong> — ${b.jmrefNo}`;
    document.getElementById('cryo-reject-reason').value = '';
    document.getElementById('cryo-reject-modal').classList.remove('hidden');
  }
  function rejectBatch() {
    const batchId = document.getElementById('cryo-reject-id').value;
    const reason = document.getElementById('cryo-reject-reason').value.trim();
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    DB.RejectionTracker.insert({ batchId, stage:'cryogenic', qty:getInputQty(batchId), date:new Date().toISOString().slice(0,10), reason, rejectedBy:session?.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('cryo-reject-modal').classList.add('hidden');
    showToast('Batch rejected', 'success');
    render();
  }
  function filterPending(val) {
    pendingSearch = val;
    const content = document.getElementById('cryo-content');
    if (content) {
      const batches = DB.Batches.byStage('cryogenic');
      content.innerHTML = pendingTab(batches);
      const inp = document.getElementById('cryo-pending-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  return { render, openProcess, calcLoss, process, openReject, rejectBatch, filterHistory, filterPending };
})();
