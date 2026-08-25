// ============================================================
// waiting-trimming.js — Waiting for Trimming Stage Module
// ============================================================
const WaitingTrimmingModule = (() => {
  let historySearch = '';
  let pendingSearch = '';
  let _activeBatch = null;
  let _wtInputQty = 0;
  let currentPage = 1;
  const itemsPerPage = 50;

  function getInputQty(batchOrId, lastRecordMap = null) {
    if (!batchOrId) return 0;
    const batch = (typeof batchOrId === 'object') ? batchOrId : (DB.Batches.find(batchOrId) || {});
    
    if (lastRecordMap) {
      const lastRec = lastRecordMap[batch.id];
      if (!lastRec) return batch.initialQty || 0;
      return Number(lastRec.outputQty) || batch.initialQty || 0;
    }
    
    const recs = DB.StageRecords.all().filter(r => r.batchId === batch.id && r.movedTo === 'waiting-trimming');
    if (!recs.length) return batch.initialQty || 0;
    const lastRec = recs[recs.length - 1];
    return Number(lastRec.outputQty) || batch.initialQty || 0;
  }

  function render() {
    currentPage = 1;
    pendingSearch = '';
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('waiting-trimming');
    const history = DB.StageRecords.byStage('waiting-trimming');

    // Build the lookup map for StageRecords
    const stageRecords = DB.StageRecords.all();
    const lastRecordMap = {};
    for (let i = 0; i < stageRecords.length; i++) {
      const r = stageRecords[i];
      if (r.batchId && r.movedTo === 'waiting-trimming') {
        lastRecordMap[r.batchId] = r;
      }
    }

    const totalQty = batches.reduce((sum, b) => sum + getInputQty(b, lastRecordMap), 0);

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6">
          <h2 class="font-bold" style="font-size:20px;">Waiting for Trimming</h2>
          <p class="text-sm text-muted mt-1">Pending allocation and vendor dispatch before Trimming stage</p>
        </div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));max-width:550px;margin-bottom:24px;">
          <div class="stat-card teal"><div class="stat-label">Pending Batches</div><div class="stat-value teal">${batches.length}</div></div>
          <div class="stat-card amber"><div class="stat-label">Total WIP Qty</div><div class="stat-value amber">${formatNum(totalQty)}</div></div>
          <div class="stat-card blue"><div class="stat-label">Total Dispatched</div><div class="stat-value blue">${history.length}</div></div>
        </div>
        <div class="tabs" id="wt-tabs">
          <button class="tab-btn active" data-tab="pending">Pending Dispatch</button>
          <button class="tab-btn" data-tab="history">History</button>
        </div>
        <div id="wt-content">${pendingTab(batches, lastRecordMap)}</div>
      </div>
      ${processModal()}`;

    document.querySelectorAll('#wt-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = 1;
        document.querySelectorAll('#wt-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('wt-content').innerHTML = btn.dataset.tab==='pending' ? pendingTab(batches, lastRecordMap) : historyTab();
      });
    });
  }

  function pendingTab(batches, lastRecordMap = null) {
    let filtered = batches;
    if (pendingSearch) {
      const q = pendingSearch.toLowerCase();
      filtered = batches.filter(b => (b.batchNo || '').toLowerCase().includes(q));
    }
    if (!filtered.length && !pendingSearch) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">⏳</div><p>No batches waiting for trimming</p></div></div>';

    const recordMap = lastRecordMap || (() => {
      const stageRecords = DB.StageRecords.all();
      const map = {};
      for (let i = 0; i < stageRecords.length; i++) {
        const r = stageRecords[i];
        if (r.batchId && r.movedTo === 'waiting-trimming') {
          map[r.batchId] = r;
        }
      }
      return map;
    })();

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = currentPage * itemsPerPage;
    const pageItems = filtered.slice(startIdx, endIdx);

    const rows = pageItems.map(b => {
      const inputQty = getInputQty(b, recordMap);
      return `
        <tr>
          <td class="font-semibold text-blue">${b.batchNo}</td>
          <td>${b.partNo||'—'}</td>
          <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
          <td>${formatDate(b.productionDate || b.createdAt)}</td>
          <td class="font-semibold">${formatNum(inputQty)}</td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-primary btn-xs" onclick="WaitingTrimmingModule.openProcess('${b.id}', ${inputQty})">Process &amp; Dispatch</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Pending Queue</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="wt-pending-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${pendingSearch}" oninput="WaitingTrimmingModule.filterPending(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('wt-pending-search', (val) => WaitingTrimmingModule.filterPending(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch</th><th>Part No</th><th>JMREF</th><th>Production Date</th><th>WIP Qty</th><th>Actions</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}</tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="WaitingTrimmingModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="WaitingTrimmingModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function historyTab() {
    let list = DB.StageRecords.byStage('waiting-trimming');
    const batches = DB.Batches.all();
    const batchMap = {};
    for (let i = 0; i < batches.length; i++) {
      batchMap[batches[i].id] = batches[i];
    }

    if (historySearch) {
      const q = historySearch.toLowerCase();
      list = list.filter(r => {
        const b = batchMap[r.batchId];
        return b && b.batchNo.toLowerCase().includes(q);
      });
    }
    if (!list.length && !historySearch) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#128196;</div><p>No history found</p></div></div>';

    const totalItems = list.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = currentPage * itemsPerPage;
    const pageItems = list.slice(startIdx, endIdx);

    const rows = pageItems.map(r => {
      const b = batchMap[r.batchId]||{};
      const v = DB.Vendors.find(r.vendorId)||{};
      return `
        <tr>
          <td class="font-semibold text-blue">${b.batchNo||'—'}</td>
          <td><span class="badge badge-teal">${r.jmrefNo||b.jmrefNo||'—'}</span></td>
          <td class="font-semibold">${v.name||'—'}</td>
          <td class="font-semibold">${formatNum(r.inputQty)}</td>
          <td class="font-semibold">${formatNum(r.outputQty)}</td>
          <td class="text-muted text-sm">${r.date}</td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Dispatched History</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="wt-history-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${historySearch}" oninput="WaitingTrimmingModule.filterHistory(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('wt-history-search', (val) => WaitingTrimmingModule.filterHistory(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch</th><th>JMREF</th><th>Trimming Vendor</th><th>Received Qty</th><th>Dispatched Qty</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="WaitingTrimmingModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="WaitingTrimmingModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function filterPending(val) {
    currentPage = 1;
    pendingSearch = val;
    const content = document.getElementById('wt-content');
    const batches = DB.Batches.byStage('waiting-trimming');
    if (content) {
      content.innerHTML = pendingTab(batches);
      const inp = document.getElementById('wt-pending-search');
      if (inp) {
        inp.value = val;
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function filterHistory(val) {
    currentPage = 1;
    historySearch = val;
    const content = document.getElementById('wt-content');
    if (content) {
      content.innerHTML = historyTab();
      const inp = document.getElementById('wt-history-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function processModal() {
    const vendors = DB.Vendors.byDept('trimming').filter(v => v.name.toLowerCase().includes('in house'));
    const vendorOpts = vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');

    return `<div class="modal-overlay hidden" id="wt-process-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>Process &amp; Dispatch Batch</h3>
          <button class="modal-close" onclick="document.getElementById('wt-process-modal').classList.add('hidden')">&#x2715;</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="wt-process-batch-id">
          <div id="wt-batch-info" style="padding:12px;background:var(--bg-input);border-radius:8px;margin-bottom:16px;"></div>
          
          <div class="form-group">
            <label class="form-label">Output Quantity</label>
            <input type="number" id="wt-output-qty" class="form-control" readonly style="opacity:0.8; font-weight:700;">
            <div class="form-hint">Output quantity matches received quantity (No loss recorded in this stage).</div>
          </div>

          <div class="form-group">
            <label class="form-label">Trimming Vendor <span class="required">*</span></label>
            <select id="wt-vendor" class="form-control">
              <option value="">Select vendor...</option>
              ${vendorOpts}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Destination</label>
            <input type="text" class="form-control" value="Trimming" readonly style="opacity:0.6;">
          </div>

          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea id="wt-notes" class="form-control" rows="2" placeholder="Dispatch notes..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('wt-process-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-primary" onclick="WaitingTrimmingModule.process()">Dispatch to Trimming</button>
        </div>
      </div>
    </div>`;
  }

  function openProcess(batchId, inputQty) {
    _wtInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    _activeBatch = b;
    
    document.getElementById('wt-process-batch-id').value = batchId;
    document.getElementById('wt-output-qty').value = inputQty;
    const trimmingVendors = DB.Vendors.byDept('trimming').filter(v => v.name.toLowerCase().includes('in house'));
    const defaultVendorId = trimmingVendors.length ? trimmingVendors[0].id : '';
    const hasVendor = trimmingVendors.some(v => v.id === b.vendorId);
    document.getElementById('wt-vendor').value = hasVendor ? b.vendorId : defaultVendorId;
    document.getElementById('wt-notes').value = '';
    
    document.getElementById('wt-batch-info').innerHTML = `
      <strong>${b.batchNo}</strong> &mdash; ${b.jmrefNo}<br>
      <span class="text-muted text-sm">WIP Quantity: <strong>${formatNum(inputQty)}</strong></span>
    `;
    
    document.getElementById('wt-process-modal').classList.remove('hidden');
  }

  function process() {
    const batchId = document.getElementById('wt-process-batch-id').value;
    const checkBatch = DB.Batches.find(batchId);
    if (!checkBatch || checkBatch.currentStage !== 'waiting-trimming' || checkBatch.status !== 'active') {
      showToast('Error: This batch is no longer in the Waiting for Trimming stage or is inactive.', 'error');
      document.getElementById('wt-process-modal').classList.add('hidden');
      render();
      return;
    }

    const vendorId = document.getElementById('wt-vendor').value;
    if (!vendorId) {
      showToast('Please select a Trimming Vendor', 'error');
      return;
    }

    const notes = document.getElementById('wt-notes').value.trim();
    const session = Auth.getSession();
    const dateStr = new Date().toISOString().slice(0,10);

    // Write Stage Record transition
    DB.StageRecords.insert({
      batchId,
      stage: 'waiting-trimming',
      inputQty: _wtInputQty,
      outputQty: _wtInputQty,
      lossQty: 0,
      vendorId: vendorId,
      movedTo: 'trimming',
      movedFrom: 'waiting-trimming',
      date: dateStr,
      recordedBy: session?.userId,
      notes: notes
    });

    // Move batch to trimming and assign vendor
    DB.Batches.update(batchId, {
      currentStage: 'trimming',
      vendorId: vendorId
    });

    document.getElementById('wt-process-modal').classList.add('hidden');
    showToast('Batch moved to Trimming stage successfully', 'success');
    App.navigate(App.current);
  }

  function changePage(page) {
    currentPage = page;
    const activeTab = document.querySelector('#wt-tabs .tab-btn.active');
    const tabType = activeTab ? activeTab.dataset.tab : 'pending';
    const batches = DB.Batches.byStage('waiting-trimming');
    document.getElementById('wt-content').innerHTML = tabType === 'pending' ? pendingTab(batches) : historyTab();
  }

  return { render, openProcess, process, filterPending, filterHistory, changePage };
})();
window.WaitingTrimmingModule = WaitingTrimmingModule;
