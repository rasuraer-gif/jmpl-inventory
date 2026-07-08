// ============================================================
// quality.js — Quality Final Module
// ============================================================
const QualityModule = (() => {
  const STAGE_LABELS = { production:'Production', cryogenic:'Cryogenic', deflashing:'Flash Removal', trimming:'Trimming', visual:'Visual', gauge:'Gauge' };

  let recheckSearch = '';
  let rejectSearch = '';
  let pendingSearch = '';

  function getInputQty(batchId) {
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId && r.movedTo === 'quality');
    if (!recs.length) return (DB.Batches.find(batchId)||{}).initialQty||0;
    const lastRec = recs[recs.length - 1];
    return lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
  }

  function render() {
    pendingSearch = '';
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('quality');
    const allRejected = DB.Batches.byStatus('rejected');
    const allRechecks = DB.RecheckTracker.all();
    const thisMonth = new Date().toISOString().slice(0,7);
    const passedThisMonth = DB.Batches.byStatus('completed').filter(b=>(b.completedAt||'').startsWith(thisMonth)).length;
    const totalQty = batches.reduce((sum, b) => sum + getInputQty(b.id), 0);
    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Quality Final</h2><p class="text-sm text-muted mt-1">Final quality check — Pass to Store, Reject, or Send for Recheck</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:760px;margin-bottom:24px;">
          <div class="stat-card red"><div class="stat-label">Pending</div><div class="stat-value red">${batches.length}</div></div>
          <div class="stat-card teal"><div class="stat-label">Pending Qty</div><div class="stat-value teal">${formatNum(totalQty)}</div></div>
          <div class="stat-card green"><div class="stat-label">Passed This Month</div><div class="stat-value green">${passedThisMonth}</div></div>
          <div class="stat-card amber"><div class="stat-label">Total Rejected</div><div class="stat-value amber">${allRejected.length}</div></div>
          <div class="stat-card blue"><div class="stat-label">Rechecks Issued</div><div class="stat-value blue">${allRechecks.length}</div></div>
        </div>
        <div class="tabs" id="qf-tabs">
          <button class="tab-btn active" data-tab="pending">Pending</button>
          <button class="tab-btn" data-tab="recheck">Recheck History</button>
          <button class="tab-btn" data-tab="rejected">Rejected Batches</button>
        </div>
        <div id="qf-content">${pendingTab(batches)}</div>
      </div>
      ${passModal()}${rejectModal()}${recheckModal()}`;
    document.querySelectorAll('#qf-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#qf-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('qf-content').innerHTML = btn.dataset.tab==='pending' ? pendingTab(batches) : btn.dataset.tab==='recheck' ? recheckHistoryTab() : rejectedTab();
      });
    });
  }

  function pendingTab(batches) {
    let filtered = batches;
    if (pendingSearch) {
      const q = pendingSearch.toLowerCase();
      filtered = batches.filter(b => (b.batchNo || '').toLowerCase().includes(q));
    }
    if (!filtered.length && !pendingSearch) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#11088;</div><p>No batches pending quality final inspection</p></div></div>';
    const rows = filtered.map(b => {
      const inputQty = getInputQty(b.id);
      const recheckCount = (b.recheckCount || 0);
      return '<tr>' +
        '<td class="font-semibold text-blue">' + b.batchNo + '</td>' +
        '<td>' + (b.partNo||'&#x2014;') + '</td>' +
        '<td><span class="badge badge-teal">' + (b.jmrefNo||'&#x2014;') + '</span></td>' +
        '<td class="font-semibold">' + formatNum(inputQty) + '</td>' +
        '<td>' + (recheckCount > 0 ? '<span class="badge badge-amber">' + recheckCount + ' rechecks</span>' : '<span class="badge badge-gray">&#x2014;</span>') + '</td>' +
        '<td class="text-muted text-sm">' + (b.createdAt||'').slice(0,10) + '</td>' +
        '<td><div class="flex gap-2">' +
        '<button class="btn btn-teal btn-xs" onclick="QualityModule.openPass(\'' + b.id + '\',' + inputQty + ')">Pass to Store</button>' +
        '<button class="btn btn-danger btn-xs" onclick="QualityModule.openReject(\'' + b.id + '\',' + inputQty + ')">Reject</button>' +
        '<button class="btn btn-amber btn-xs" onclick="QualityModule.openRecheck(\'' + b.id + '\',' + inputQty + ')">Recheck</button>' +
        '</div></td></tr>';
    }).join('');
    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Pending Quality Final</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="qf-pending-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${pendingSearch}" oninput="QualityModule.filterPending(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-pending-search', (val) => QualityModule.filterPending(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Input Qty</th><th>Rechecks</th><th>Received</th><th>Actions</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function recheckHistoryTab() {
    let recs = DB.RecheckTracker.all();
    if (recheckSearch) {
      const q = recheckSearch.toLowerCase();
      recs = recs.filter(r => {
        const batch = DB.Batches.find(r.batchId)||{};
        return (batch.batchNo||'').toLowerCase().includes(q);
      });
    }

    if (!recs.length) return `
      <div class="card card-body">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 12px; max-width: 280px;">
          <input type="text" id="qf-recheck-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${recheckSearch}" oninput="QualityModule.filterRechecks(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-recheck-search', (val) => QualityModule.filterRechecks(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
        <div class="empty-state"><div class="empty-icon">&#x1F504;</div><p>No recheck records found</p></div>
      </div>`;

    const rows = recs.sort((a,b)=>b.date.localeCompare(a.date)).map(r => {
      const batch = DB.Batches.find(r.batchId)||{};
      const user = DB.Users.find(r.recordedBy)||{};
      const totalBefore = r.qty + r.lossQty;
      const pct = totalBefore ? ((r.lossQty / totalBefore) * 100).toFixed(1) + '%' : '0.0%';
      return '<tr><td class="font-semibold">' + (batch.batchNo||'&#x2014;') + '</td><td>' + (batch.jmrefNo||'&#x2014;') + '</td><td><span class="badge badge-blue">' + (STAGE_LABELS[r.toStage]||r.toStage) + '</span></td><td class="font-semibold">' + formatNum(r.qty) + '</td><td class="text-danger font-semibold">' + formatNum(r.lossQty) + '</td><td><span class="badge badge-red">' + pct + '</span></td><td><span class="badge badge-amber">Recheck #' + r.recheckNo + '</span></td><td class="text-muted text-sm">' + (user.name||'&#x2014;') + '</td><td class="text-muted text-sm">' + (r.date||'').slice(0,10) + '</td></tr>';
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Recheck History</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="qf-recheck-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${recheckSearch}" oninput="QualityModule.filterRechecks(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-recheck-search', (val) => QualityModule.filterRechecks(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch</th><th>JMREF</th><th>Sent To</th><th>Qty</th><th>Loss at QF</th><th>% Loss</th><th>Iteration</th><th>By</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function rejectedTab() {
    let batches = DB.Batches.byStatus('rejected');
    const recs = DB.RejectionTracker.all();
    if (rejectSearch) {
      const q = rejectSearch.toLowerCase();
      batches = batches.filter(b => b.batchNo.toLowerCase().includes(q));
    }

    if (!batches.length) return `
      <div class="card card-body">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 12px; max-width: 280px;">
          <input type="text" id="qf-reject-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${rejectSearch}" oninput="QualityModule.filterRejects(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-reject-search', (val) => QualityModule.filterRejects(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
        <div class="empty-state"><div class="empty-icon">&#x1F6AB;</div><p>No rejected batches found</p></div>
      </div>`;

    const rows = batches.map(b => {
      const rej = recs.filter(r=>r.batchId===b.id).pop()||{};
      return '<tr><td class="font-semibold">' + b.batchNo + '</td><td>' + (b.jmrefNo||'&#x2014;') + '</td><td>' + (b.partNo||'&#x2014;') + '</td><td><span class="badge badge-red">Rejected</span></td><td>' + (rej.reason||'&#x2014;') + '</td><td class="text-muted text-sm">' + (rej.date||'').slice(0,10) + '</td></tr>';
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Rejected Batches</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="qf-reject-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${rejectSearch}" oninput="QualityModule.filterRejects(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-reject-search', (val) => QualityModule.filterRejects(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch No</th><th>JMREF</th><th>Part</th><th>Status</th><th>Reason</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function filterRechecks(val) {
    recheckSearch = val;
    const content = document.getElementById('qf-content');
    if (content) {
      content.innerHTML = recheckHistoryTab();
      const inp = document.getElementById('qf-recheck-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function filterRejects(val) {
    rejectSearch = val;
    const content = document.getElementById('qf-content');
    if (content) {
      content.innerHTML = rejectedTab();
      const inp = document.getElementById('qf-reject-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }



  function passModal() {
    return '<div class="modal-overlay hidden" id="qf-pass-modal"><div class="modal modal-sm"><div class="modal-header"><h3>Pass to Store</h3><button class="modal-close" onclick="document.getElementById(\'qf-pass-modal\').classList.add(\'hidden\')">&#x2715;</button></div><div class="modal-body"><input type="hidden" id="qf-pass-batch-id"><input type="hidden" id="qf-pass-input-qty"><div id="qf-pass-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div><div class="form-group"><label class="form-label">Output Quantity (for Store) <span class="required">*</span></label><input type="number" id="qf-pass-output" class="form-control" min="0" oninput="QualityModule.calcPassLoss()"></div><div class="form-group"><label class="form-label">Loss at Quality Final (Auto)</label><input type="text" id="qf-pass-loss" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div><div class="form-group"><label class="form-label">Notes</label><textarea id="qf-pass-notes" class="form-control" rows="2"></textarea></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById(\'qf-pass-modal\').classList.add(\'hidden\')">Cancel</button><button class="btn btn-teal" onclick="QualityModule.passBatch()">Pass to Store</button></div></div></div>';
  }

  function rejectModal() {
    return '<div class="modal-overlay hidden" id="qf-reject-modal"><div class="modal modal-sm"><div class="modal-header"><h3>Reject Batch</h3><button class="modal-close" onclick="document.getElementById(\'qf-reject-modal\').classList.add(\'hidden\')">&#x2715;</button></div><div class="modal-body"><input type="hidden" id="qf-reject-batch-id"><input type="hidden" id="qf-reject-input-qty"><div id="qf-reject-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div><div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="qf-reject-reason" class="form-control" rows="3"></textarea></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById(\'qf-reject-modal\').classList.add(\'hidden\')">Cancel</button><button class="btn btn-danger" onclick="QualityModule.rejectBatch()">Confirm Reject</button></div></div></div>';
  }

  function recheckModal() {
    const stageOpts = Object.entries(STAGE_LABELS).map(([k,v]) => '<option value="' + k + '">' + v + '</option>').join('');
    return '<div class="modal-overlay hidden" id="qf-recheck-modal"><div class="modal modal-sm"><div class="modal-header"><h3>Send for Recheck</h3><button class="modal-close" onclick="document.getElementById(\'qf-recheck-modal\').classList.add(\'hidden\')">&#x2715;</button></div><div class="modal-body"><input type="hidden" id="qf-rc-batch-id"><input type="hidden" id="qf-rc-input-qty"><div id="qf-rc-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div><div class="form-group"><label class="form-label">Target Stage <span class="required">*</span></label><select id="qf-rc-stage" class="form-control">' + stageOpts + '</select></div><div class="form-group"><label class="form-label">Qty to Send for Recheck <span class="required">*</span></label><input type="number" id="qf-rc-qty" class="form-control" min="1" oninput="QualityModule.calcRecheckLoss()"></div><div class="form-group"><label class="form-label">Loss at Quality Final (Auto)</label><input type="text" id="qf-rc-loss" class="form-control" readonly style="color:var(--accent-red);font-weight:700;"></div><div class="form-group"><label class="form-label">Iteration No</label><input type="text" id="qf-rc-iter" class="form-control" readonly style="opacity:0.7;"></div><div class="form-group"><label class="form-label">Notes</label><textarea id="qf-rc-notes" class="form-control" rows="2"></textarea></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById(\'qf-recheck-modal\').classList.add(\'hidden\')">Cancel</button><button class="btn btn-amber" onclick="QualityModule.sendRecheck()">Send for Recheck</button></div></div></div>';
  }

  let _passInputQty = 0, _rcInputQty = 0;

  function openPass(batchId, inputQty) {
    _passInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('qf-pass-batch-id').value = batchId;
    document.getElementById('qf-pass-input-qty').value = inputQty;
    document.getElementById('qf-pass-info').innerHTML = '<strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo + '<br><span class="text-muted text-sm">Input Qty: <strong>' + formatNum(inputQty) + '</strong></span>';
    document.getElementById('qf-pass-output').value = inputQty;
    document.getElementById('qf-pass-loss').value = '0';
    document.getElementById('qf-pass-notes').value = '';
    document.getElementById('qf-pass-modal').classList.remove('hidden');
  }

  function calcPassLoss() {
    const out = parseInt(document.getElementById('qf-pass-output').value)||0;
    document.getElementById('qf-pass-loss').value = Math.max(0, _passInputQty - out);
  }

  function passBatch() {
    const batchId = document.getElementById('qf-pass-batch-id').value;
    const outputQty = parseInt(document.getElementById('qf-pass-output').value);
    if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
    if (outputQty > _passInputQty) { showToast('Output cannot exceed input', 'error'); return; }
    const lossQty = Math.max(0, _passInputQty - outputQty);
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);
    const nowStr = new Date().toISOString();
    DB.StageRecords.insert({ batchId, stage:'quality', inputQty:_passInputQty, outputQty, lossQty, movedTo:'store', movedFrom:'quality', date:dateStr, recordedBy:session&&session.userId, notes:document.getElementById('qf-pass-notes').value });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'quality', lossQty, date:dateStr, jmrefNo:batch&&batch.jmrefNo, partNo:batch&&batch.partNo });
    DB.StageRecords.insert({ batchId, stage:'store', inputQty:outputQty, outputQty:0, lossQty:0, movedFrom:'quality', date:dateStr, recordedBy:session&&session.userId });
    DB.Batches.update(batchId, { status:'completed', currentStage:'store', completedAt:nowStr });
    document.getElementById('qf-pass-modal').classList.add('hidden');
    showToast('Batch passed to Store! Batch completed.', 'success');
    render();
  }

  function openReject(batchId, inputQty) {
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('qf-reject-batch-id').value = batchId;
    document.getElementById('qf-reject-input-qty').value = inputQty;
    document.getElementById('qf-reject-info').innerHTML = 'Rejecting: <strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo + ' | Qty: ' + formatNum(inputQty);
    document.getElementById('qf-reject-reason').value = '';
    document.getElementById('qf-reject-modal').classList.remove('hidden');
  }

  function rejectBatch() {
    const batchId = document.getElementById('qf-reject-batch-id').value;
    const inputQty = parseInt(document.getElementById('qf-reject-input-qty').value)||0;
    const reason = document.getElementById('qf-reject-reason').value.trim();
    const session = Auth.getSession();
    DB.RejectionTracker.insert({ batchId, stage:'quality', qty:inputQty, date:new Date().toISOString(), reason, rejectedBy:session&&session.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('qf-reject-modal').classList.add('hidden');
    showToast('Batch rejected and recorded', 'success');
    render();
  }

  function openRecheck(batchId, inputQty) {
    _rcInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    const iterNo = DB.RecheckTracker.nextIterationNo(batchId);
    document.getElementById('qf-rc-batch-id').value = batchId;
    document.getElementById('qf-rc-input-qty').value = inputQty;
    document.getElementById('qf-rc-info').innerHTML = '<strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo + '<br><span class="text-muted text-sm">Qty at QF: <strong>' + formatNum(inputQty) + '</strong> | Current Rechecks: ' + (b.recheckCount||0) + '</span>';
    document.getElementById('qf-rc-qty').value = '';
    document.getElementById('qf-rc-loss').value = '';
    document.getElementById('qf-rc-iter').value = 'Recheck #' + iterNo;
    document.getElementById('qf-rc-notes').value = '';
    document.getElementById('qf-recheck-modal').classList.remove('hidden');
  }

  function calcRecheckLoss() {
    const qty = parseInt(document.getElementById('qf-rc-qty').value)||0;
    document.getElementById('qf-rc-loss').value = Math.max(0, _rcInputQty - qty);
  }

  function sendRecheck() {
    const batchId = document.getElementById('qf-rc-batch-id').value;
    const toStage = document.getElementById('qf-rc-stage').value;
    const recheckQty = parseInt(document.getElementById('qf-rc-qty').value);
    if (!recheckQty || recheckQty < 1) { showToast('Enter a valid recheck quantity', 'error'); return; }
    if (recheckQty > _rcInputQty) { showToast('Recheck qty cannot exceed input qty', 'error'); return; }
    const lossQty = Math.max(0, _rcInputQty - recheckQty);
    const iterNo = DB.RecheckTracker.nextIterationNo(batchId);
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId);
    const dateStr = new Date().toISOString().slice(0,10);
    DB.RecheckTracker.insert({ batchId, fromStage:'quality', toStage, qty:recheckQty, recheckNo:iterNo, date:dateStr, lossQty, recordedBy:session&&session.userId, notes:document.getElementById('qf-rc-notes').value });
    if (lossQty > 0) DB.LossTracker.insert({ batchId, stage:'quality', lossQty, date:dateStr, jmrefNo:batch&&batch.jmrefNo, partNo:batch&&batch.partNo, iterationNo:iterNo });
    DB.StageRecords.insert({ batchId, stage:'quality', inputQty:_rcInputQty, outputQty:0, recheckQty, lossQty, movedTo:toStage, movedFrom:'quality', date:dateStr, isRecheck:true, recheckNo:iterNo, recordedBy:session&&session.userId });
    DB.Batches.update(batchId, { currentStage:toStage, recheckCount:(batch&&batch.recheckCount||0)+1, recheckIteration:iterNo });
    document.getElementById('qf-recheck-modal').classList.add('hidden');
    showToast('Batch sent for recheck #' + iterNo + ' to ' + (STAGE_LABELS[toStage]||toStage), 'success');
    render();
  }

  function filterPending(val) {
    pendingSearch = val;
    const content = document.getElementById('qf-content');
    if (content) {
      const batches = DB.Batches.byStage('quality');
      content.innerHTML = pendingTab(batches);
      const inp = document.getElementById('qf-pending-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  return { render, openPass, calcPassLoss, passBatch, openReject, rejectBatch, openRecheck, calcRecheckLoss, sendRecheck, filterRechecks, filterRejects, filterPending };
})();

