// ============================================================
// print-batch.js — Dedicated Print Label Module
// ============================================================
const PrintBatchModule = (() => {
  let selectedBatchId = null;
  let searchVal = '';

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="font-bold" style="font-size:20px;">Print Label</h2>
            <p class="text-sm text-muted mt-1">Search or scan batch barcodes to validate and print stickers</p>
          </div>
        </div>

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
      </div>
    `;

    renderDetails();
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
          <span class="badge badge-blue" style="font-size:13px; font-weight:700; padding:6px 12px;">${b.batchNo}</span>
        </div>
        <div class="card-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:20px; margin-bottom: 24px;">
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

          <div style="border-top:1px dashed var(--border); padding-top:20px; display:flex; justify-content:center;">
            <button class="btn btn-primary" onclick="PrintBatchModule.printCurrentLabel()" style="padding:12px 32px; font-size:15px; font-weight:700; display:flex; align-items:center; gap:8px;">
              🖨️ Print Barcode Label
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function printCurrentLabel() {
    if (!selectedBatchId) return;
    window.printBarcode(selectedBatchId);
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
    showDropdown,
    filterDropdown,
    selectBatch,
    selectBatchByNo,
    printCurrentLabel
  };
})();
