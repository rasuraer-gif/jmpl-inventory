// ============================================================
// print-batch.js — Dedicated Print Label Module with History & Comments
// ============================================================
const PrintBatchModule = (() => {
  let activeTab = 'print'; // 'print' or 'history'
  let selectedBatchId = null;
  let searchVal = '';
  let historySearch = '';

  function setTab(tab) {
    activeTab = tab;
    render();
  }

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="font-bold" style="font-size:20px;">Print Label</h2>
            <p class="text-sm text-muted mt-1">Search or scan batch barcodes to validate, print stickers, and audit print history</p>
          </div>
          <div class="flex gap-2">
            <button class="btn ${activeTab === 'print' ? 'btn-primary' : 'btn-secondary'}" onclick="PrintBatchModule.setTab('print')" style="padding: 8px 16px; font-weight:600;">
              🖨️ Print Label
            </button>
            <button class="btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}" onclick="PrintBatchModule.setTab('history')" style="padding: 8px 16px; font-weight:600;">
              📜 Print History
            </button>
          </div>
        </div>

        ${activeTab === 'print' ? renderPrintTabHtml() : renderHistoryTabHtml()}
      </div>
    `;

    if (activeTab === 'print') {
      renderDetails();
    } else {
      renderHistoryRows();
    }
  }

  function renderPrintTabHtml() {
    return `
      <div class="card mb-6">
        <div class="card-header"><h3>Select Batch to Print</h3></div>
        <div class="card-body">
          <div class="form-row" style="align-items: flex-end;">
            <div class="form-group" style="position:relative; flex:1; margin-bottom: 0;">
              <label class="form-label">Search Batch No <span class="required">*</span></label>
              <div class="flex gap-2">
                <input type="text" id="pb-search-input" class="form-control" placeholder="Search by Batch No (e.g. JMPL-00001)..." onfocus="PrintBatchModule.showDropdown()" oninput="PrintBatchModule.filterDropdown(this.value)" autocomplete="off" value="${searchVal}">
                <button class="btn btn-secondary" onclick="Scanner.start('pb-search-input', (val) => PrintBatchModule.selectBatchByNo(val))" style="padding:0 12px; display:flex; align-items:center; justify-content:center; height:42px;" title="Scan Barcode">📷 Scan</button>
              </div>
              <div id="pb-dropdown" class="hidden" style="position:absolute; top:100%; left:0; right:0; z-index:1000; max-height:250px; overflow-y:auto; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.3); margin-top:4px; padding: 4px;"></div>
            </div>
          </div>
        </div>
      </div>

      <div id="pb-details-container"></div>
    `;
  }

  function renderHistoryTabHtml() {
    return `
      <div class="card animate-in">
        <div class="card-header flex justify-between items-center flex-wrap gap-4">
          <h3>Printed Labels History</h3>
          <div class="flex gap-2 items-center" style="position:relative; min-width:280px;">
            <input type="text" id="pb-history-search" class="form-control" placeholder="Search history by Batch No, User, Comments..." oninput="PrintBatchModule.filterHistory(this.value)" value="${historySearch}">
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          <div id="pb-history-container" class="table-wrap"></div>
        </div>
      </div>
    `;
  }

  function showDropdown() {
    const list = document.getElementById('pb-dropdown');
    if (!list) return;
    list.classList.remove('hidden');
    filterDropdown(document.getElementById('pb-search-input')?.value || '');
  }

  function filterDropdown(query) {
    const list = document.getElementById('pb-dropdown');
    if (!list) return;
    const q = query.toLowerCase().trim();
    const batches = DB.Batches.all();
    
    const filtered = batches.filter(b => 
      (b.batchNo || '').toLowerCase().includes(q) ||
      (b.jmrefNo || '').toLowerCase().includes(q) ||
      (b.partNo || '').toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      list.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:12.5px; text-align:center;">No matching batches found.</div>`;
      return;
    }

    list.innerHTML = filtered.map(b => `
      <div class="dropdown-item" 
           style="padding:8px 12px; cursor:pointer; border-radius:4px; transition:background 0.2s; font-size:13px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;"
           onclick="PrintBatchModule.selectBatch('${b.id}', '${b.batchNo}')"
           onmouseover="this.style.background='rgba(99,102,241,0.15)'"
           onmouseout="this.style.background='transparent'">
        <div>
          <span style="font-weight:600; color:var(--primary);">${b.batchNo}</span>
          <span class="badge badge-teal" style="margin-left:8px; font-size:10px;">${b.jmrefNo}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-muted);">${formatNum(b.initialQty)} pcs</div>
      </div>
    `).join('');
  }

  function selectBatch(id, batchNo) {
    selectedBatchId = id;
    searchVal = batchNo;
    const input = document.getElementById('pb-search-input');
    if (input) input.value = batchNo;

    const list = document.getElementById('pb-dropdown');
    if (list) list.classList.add('hidden');

    renderDetails();
  }

  function selectBatchByNo(batchNo) {
    const batch = DB.Batches.all().find(b => (b.batchNo || '').toLowerCase().trim() === batchNo.toLowerCase().trim());
    if (batch) {
      selectBatch(batch.id, batch.batchNo);
    } else {
      showToast('Batch not found: ' + batchNo, 'error');
    }
  }

  function renderDetails() {
    const container = document.getElementById('pb-details-container');
    if (!container) return;

    if (!selectedBatchId) {
      container.innerHTML = `
        <div class="card"><div class="card-body"><div class="empty-state"><div class="empty-icon">&#128269;</div><p>Search or scan a batch above to display its details for validation and printing.</p></div></div></div>
      `;
      return;
    }

    const b = DB.Batches.find(selectedBatchId);
    if (!b) {
      container.innerHTML = `
        <div class="card"><div class="card-body"><div class="empty-state text-danger"><div class="empty-icon">&#x26A0;</div><p>Selected batch record not found in the database.</p></div></div></div>
      `;
      return;
    }

    const formattedDate = b.productionDate ? formatDate(b.productionDate) : formatDate(b.createdAt);

    container.innerHTML = `
      <div class="card animate-in">
        <div class="card-header flex justify-between items-center">
          <h3>Batch Validation & Metadata</h3>
          <div class="flex gap-2">
            <span class="badge badge-teal" style="font-size:13px; font-weight:700; padding:6px 12px;">IB: ${b.internalBatchNo || '—'}</span>
            <span class="badge badge-blue" style="font-size:13px; font-weight:700; padding:6px 12px;">${b.batchNo}</span>
          </div>
        </div>
        <div class="card-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:20px; margin-bottom: 24px;">
            <div>
              <div class="text-sm text-muted">Internal Batch No</div>
              <div class="font-bold text-lg text-teal mt-1">IB: ${b.internalBatchNo || '—'}</div>
            </div>
            <div>
              <div class="text-sm text-muted">JMREF No</div>
              <div class="font-bold text-lg text-primary mt-1">${b.jmrefNo || '—'}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Part Number</div>
              <div class="font-bold text-lg mt-1">${b.partNo || '—'}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Current Quantity (WIP)</div>
              <div class="font-bold text-lg text-teal mt-1">${formatNum(b.initialQty)} pcs</div>
            </div>
            <div>
              <div class="text-sm text-muted">Current Stage</div>
              <div class="font-semibold text-lg mt-1" style="text-transform: capitalize;">${b.currentStage ? b.currentStage.replace('-', ' ') : '—'}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Batch Status</div>
              <div>
                <span class="badge ${b.status==='active'?'badge-green':(b.status==='completed'?'badge-blue':'badge-red')} mt-1" style="text-transform:uppercase;">
                  ${b.status || 'active'}
                </span>
              </div>
            </div>
            <div>
              <div class="text-sm text-muted">Production / Purchase Date</div>
              <div class="font-semibold mt-1">${formattedDate}</div>
            </div>
            <div>
              <div class="text-sm text-muted">TR No</div>
              <div class="font-semibold mt-1">${b.trNo || '—'}</div>
            </div>
            <div>
              <div class="text-sm text-muted">Rack Location Details</div>
              <div class="mt-1">
                ${b.rackNo ? `
                  <div style="font-size:13px; line-height:1.4;">
                    <div>📦 Rack: <strong class="text-blue">${b.rackNo}</strong></div>
                    <div>📍 Location: <strong>${b.rackLocation || '—'}</strong></div>
                    ${b.boxNo ? `<div>🏷️ Box No: ${b.boxNo}</div>` : ''}
                    ${b.rackQty ? `<div>🔢 Rack Qty: <strong>${formatNum(b.rackQty)}</strong></div>` : ''}
                    ${b.bagNo ? `<div>🛍️ Bag No: <strong>${b.bagNo}</strong></div>` : ''}
                  </div>
                ` : '<span class="text-muted" style="font-style:italic; font-size:13px;">No rack location allocated</span>'}
              </div>
            </div>
          </div>

          <div style="border-top:1px dashed var(--border); padding-top:20px; max-width:600px; margin:0 auto;">
            <div class="form-group mb-4">
              <label class="form-label font-semibold">Print Comments / Reason <span class="text-muted" style="font-weight:normal; font-size:12px;">(Optional)</span></label>
              <input type="text" id="pb-comments" class="form-control" placeholder="Enter reason for label print (e.g. Original sticker damaged, audit request, etc.)...">
            </div>

            <div style="display:flex; flex-direction:column; align-items:center; gap:12px; margin-top:16px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13.5px; color:var(--text-main);">
                <input type="checkbox" id="pb-is-duplicate" checked style="width:18px; height:18px; cursor:pointer; accent-color:var(--primary);">
                Mark label as <strong>DUPLICATE</strong>
              </label>
              <button class="btn btn-primary" onclick="PrintBatchModule.printCurrentLabel()" style="padding:12px 32px; font-size:15px; font-weight:700; display:flex; align-items:center; gap:8px;">
                🖨️ Print Barcode Label
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function printCurrentLabel() {
    if (!selectedBatchId) return;
    const b = DB.Batches.find(selectedBatchId);
    if (!b) {
      showToast('Selected batch not found', 'error');
      return;
    }

    const isDup = document.getElementById('pb-is-duplicate') ? document.getElementById('pb-is-duplicate').checked : true;
    const commentsInput = document.getElementById('pb-comments');
    const comments = (commentsInput ? commentsInput.value : '').trim();

    // Get current logged-in user details
    const session = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
    const userName = session ? (session.name || session.username || 'System User') : 'System User';
    const userId = session ? (session.user || session.id || '') : '';

    // Insert audit record in PrintHistory
    DB.PrintHistory.insert({
      batchId: b.id,
      batchNo: b.batchNo || '',
      jmrefNo: b.jmrefNo || '',
      partNo: b.partNo || '',
      userName: userName,
      userId: userId,
      comments: comments,
      isDuplicate: isDup,
      printedAt: new Date().toISOString()
    });

    // Reset comments field
    if (commentsInput) commentsInput.value = '';

    // Trigger printable sticker
    window.printBarcode(b.id, isDup);
    showToast('Print label generated & recorded in history', 'success');
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr.slice(0, 19).replace('T', ' ');
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch(e) {
      return isoStr;
    }
  }

  function filterHistory(query) {
    historySearch = query;
    renderHistoryRows();
  }

  function renderHistoryRows() {
    const container = document.getElementById('pb-history-container');
    if (!container) return;

    let records = DB.PrintHistory.all();

    if (historySearch) {
      const q = historySearch.toLowerCase().trim();
      records = records.filter(r => 
        (r.batchNo || '').toLowerCase().includes(q) ||
        (r.jmrefNo || '').toLowerCase().includes(q) ||
        (r.partNo || '').toLowerCase().includes(q) ||
        (r.userName || '').toLowerCase().includes(q) ||
        (r.comments || '').toLowerCase().includes(q)
      );
    }

    if (records.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:40px;">
          <div class="empty-icon">📜</div>
          <p>${historySearch ? 'No history records match your search filter.' : 'No printed labels history found yet.'}</p>
        </div>
      `;
      return;
    }

    // Sort newest first
    records.sort((a, b) => (b.printedAt || '').localeCompare(a.printedAt || ''));

    const rowsHtml = records.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="text-sm font-semibold">${formatDateTime(r.printedAt)}</td>
        <td class="font-semibold text-blue">${r.batchNo || '—'}</td>
        <td><span class="badge badge-teal">${r.jmrefNo || '—'}</span></td>
        <td class="font-semibold">${r.partNo || '—'}</td>
        <td class="font-semibold text-primary">👤 ${r.userName || 'System User'}</td>
        <td>
          <span class="badge ${r.isDuplicate ? 'badge-amber' : 'badge-blue'}" style="font-size:10px; font-weight:700;">
            ${r.isDuplicate ? 'DUPLICATE' : 'ORIGINAL'}
          </span>
        </td>
        <td class="text-sm text-muted" style="max-width:220px; word-break:break-word;">
          ${r.comments ? `💬 ${r.comments}` : '<span style="font-style:italic; color:var(--text-muted);">No comments</span>'}
        </td>
        <td>
          <button class="btn btn-secondary btn-xs" onclick="PrintBatchModule.reprintHistoryRecord('${r.id}')" title="Re-print this label">
            🖨️ Re-print
          </button>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Printed Date & Time</th>
            <th>Batch No</th>
            <th>JMREF</th>
            <th>Part No</th>
            <th>Printed By</th>
            <th>Label Type</th>
            <th>Comments / Reason</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  function reprintHistoryRecord(id) {
    const rec = DB.PrintHistory.find(id);
    if (!rec) {
      showToast('History record not found', 'error');
      return;
    }

    // Fetch logged in session
    const session = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
    const userName = session ? (session.name || session.username || 'System User') : 'System User';
    const userId = session ? (session.user || session.id || '') : '';

    // Log new print event for history re-print
    DB.PrintHistory.insert({
      batchId: rec.batchId,
      batchNo: rec.batchNo,
      jmrefNo: rec.jmrefNo,
      partNo: rec.partNo,
      userName: userName,
      userId: userId,
      comments: `Re-printed from History tab (Original comment: ${rec.comments || 'None'})`,
      isDuplicate: rec.isDuplicate !== false,
      printedAt: new Date().toISOString()
    });

    window.printBarcode(rec.batchId, rec.isDuplicate !== false);
    showToast('Re-print initiated & logged in history', 'success');

    if (activeTab === 'history') {
      renderHistoryRows();
    }
  }

  // Close dropdown on click outside
  document.addEventListener('click', e => {
    const list = document.getElementById('pb-dropdown');
    if (list && !e.target.closest('#pb-search-input') && !e.target.closest('#pb-dropdown')) {
      list.classList.add('hidden');
    }
  });

  return {
    render,
    setTab,
    showDropdown,
    filterDropdown,
    selectBatch,
    selectBatchByNo,
    printCurrentLabel,
    filterHistory,
    reprintHistoryRecord
  };
})();
