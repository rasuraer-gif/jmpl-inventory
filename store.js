// ============================================================
// store.js — Store & Sales Module (Excel Bulk Upload)
// ============================================================
const StoreModule = (() => {

  // ── FIFO engine ────────────────────────────────────────────
  // Returns available qty per jmref and FIFO batch breakdown
  function fifoAvailable(jmrefNo) {
    const batches = DB.Batches.all()
      .filter(b => b.jmrefNo === jmrefNo && b.status === 'completed')
      .sort((a, b) => (a.completedAt || a.createdAt || '').localeCompare(b.completedAt || b.createdAt || ''));

    const totalIn = batches.reduce((s, b) => {
      const recs = DB.StageRecords.all().filter(r => r.batchId === b.id && r.stage === 'store');
      return s + (recs.length ? recs[recs.length - 1].inputQty || 0 : 0);
    }, 0);
    const totalSold = DB.Sales.all()
      .filter(s => s.jmrefNo === jmrefNo)
      .reduce((s, r) => s + (r.qty || 0), 0);
    return Math.max(0, totalIn - totalSold);
  }

  // Build FIFO batch list with remaining quantities
  function fifoBatches(jmrefNo) {
    const batches = DB.Batches.all()
      .filter(b => b.jmrefNo === jmrefNo && b.status === 'completed')
      .sort((a, b) => (a.completedAt || a.createdAt || '').localeCompare(b.completedAt || b.createdAt || ''));

    const sales = DB.Sales.all().filter(s => s.jmrefNo === jmrefNo);
    let totalDeducted = sales.reduce((s, r) => s + (r.qty || 0), 0);

    return batches.map(b => {
      const recs = DB.StageRecords.all().filter(r => r.batchId === b.id && r.stage === 'store');
      const batchQty = recs.length ? (recs[recs.length - 1].inputQty || 0) : 0;
      const deducted = Math.min(batchQty, totalDeducted);
      totalDeducted -= deducted;
      const remaining = batchQty - deducted;
      return { batchId: b.id, batchNo: b.batchNo, batchQty, remaining, completedAt: b.completedAt };
    }).filter(b => b.batchQty > 0);
  }

  // ── Render ─────────────────────────────────────────────────
  function render() {
    const el = document.getElementById('content');
    const parts = DB.StoreInventory.allParts();
    const sales = DB.Sales.all();
    const thisMonth = new Date().toISOString().slice(0, 7);
    const salesThisMonth = sales.filter(s => (s.saleDate || '').startsWith(thisMonth)).reduce((s, r) => s + (r.qty || 0), 0);
    const totalStock = parts.reduce((s, p) => s + (p.available || 0), 0);
    const lowStock = parts.filter(p => p.available < 10 && p.available >= 0).length;

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6">
          <h2 class="font-bold" style="font-size:20px;">Store &amp; Sales</h2>
          <p class="text-sm text-muted mt-1">Finished goods inventory and bulk sales upload</p>
        </div>

        <!-- Stats -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:720px;margin-bottom:24px;">
          <div class="stat-card green"><div class="stat-label">Total SKUs</div><div class="stat-value green">${parts.length}</div></div>
          <div class="stat-card teal"><div class="stat-label">Total Stock</div><div class="stat-value teal">${formatNum(totalStock)}</div></div>
          <div class="stat-card blue"><div class="stat-label">Sales This Month</div><div class="stat-value blue">${formatNum(salesThisMonth)}</div></div>
          <div class="stat-card amber"><div class="stat-label">Low Stock Items</div><div class="stat-value amber">${lowStock}</div></div>
        </div>

        <!-- Tabs -->
        <div class="tabs" id="store-tabs">
          <button class="tab-btn active" data-tab="inventory">Inventory</button>
          <button class="tab-btn" data-tab="upload">📤 Upload Sales (Excel)</button>
          <button class="tab-btn" data-tab="batches">Completed Batches</button>
          <button class="tab-btn" data-tab="sales">Sales History</button>
        </div>
        <div id="store-content">${inventoryTab(parts)}</div>
      </div>`;

    document.querySelectorAll('#store-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#store-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        const cont = document.getElementById('store-content');
        if (tab === 'inventory') cont.innerHTML = inventoryTab(parts);
        if (tab === 'upload')    { cont.innerHTML = uploadTab(); attachUploadEvents(); }
        if (tab === 'batches')   cont.innerHTML = batchesTab();
        if (tab === 'sales')     cont.innerHTML = salesTab();
      });
    });
  }

  // ── Inventory Tab ──────────────────────────────────────────
  function inventoryTab(parts) {
    if (!parts.length) {
      return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#127978;</div><p>No parts in inventory. Complete batches through Quality Final to see stock here.</p></div></div>';
    }
    const rows = parts.map(p => {
      const fifo = fifoBatches(p.jmrefNo);
      const available = p.available;
      const statusClass = available === 0 ? 'text-danger' : available < 10 ? 'text-amber' : 'text-success';
      const lowBadge = available < 10 ? ' <span class="badge badge-amber" style="font-size:10px;">Low</span>' : '';
      const fifoTip = fifo.map(b => b.batchNo + ': ' + formatNum(b.remaining) + ' remaining').join(' | ');
      return `<tr>
        <td class="font-semibold">${p.partNo}</td>
        <td><span class="badge badge-teal">${p.jmrefNo}</span></td>
        <td class="text-muted">${p.description || '&#x2014;'}</td>
        <td>
          <span class="font-bold ${statusClass}">${formatNum(available)}</span>${lowBadge}
          ${fifo.length ? `<div class="text-muted" style="font-size:10px;margin-top:2px;">${fifoTip}</div>` : ''}
        </td>
      </tr>`;
    }).join('');
    return `
      <div class="card">
        <div class="card-header">
          <h3>Current Inventory</h3>
          <span class="text-muted text-sm">Qty = Completed Batches &#x2212; Sales (FIFO)</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Part No</th><th>JMREF</th><th>Description</th><th>Available Stock &amp; FIFO Batches</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Upload Tab ─────────────────────────────────────────────
  function uploadTab() {
    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>&#128229; Bulk Sales Upload — Excel</h3>
          <a id="store-dl-template" href="#" onclick="StoreModule.downloadTemplate(event)"
             class="btn btn-secondary btn-sm">&#128229; Download Template</a>
        </div>
        <div class="card-body">

          <!-- Instructions -->
          <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:10px;padding:16px;margin-bottom:24px;">
            <div style="font-weight:700;margin-bottom:8px;color:var(--accent-blue);">&#8505;&#65039; How to use</div>
            <ol style="margin:0;padding-left:20px;color:var(--text-muted);font-size:13px;line-height:1.8;">
              <li>Download the Excel template using the button above</li>
              <li>Fill in <strong>Date</strong> (DD-MM-YYYY), <strong>JMREF</strong>, <strong>Sold Quantity</strong>, <strong>Sale Price</strong> — one row per sale</li>
              <li>Upload the completed file below</li>
              <li>Review the preview table — check for errors highlighted in red</li>
              <li>Click <strong>Confirm &amp; Save</strong> to apply FIFO deductions</li>
            </ol>
          </div>

          <!-- Drop Zone -->
          <div id="store-dropzone"
            style="border:2px dashed var(--border-color);border-radius:12px;padding:48px 20px;text-align:center;cursor:pointer;transition:border-color 0.2s,background 0.2s;"
            onclick="document.getElementById('store-file-input').click()"
            ondragover="StoreModule.onDragOver(event)"
            ondragleave="StoreModule.onDragLeave(event)"
            ondrop="StoreModule.onDrop(event)">
            <div style="font-size:48px;margin-bottom:12px;">&#128196;</div>
            <div style="font-weight:700;font-size:15px;margin-bottom:6px;">Click to browse or drag &amp; drop</div>
            <div class="text-muted text-sm">Supports <strong>.xlsx</strong> and <strong>.xls</strong> files</div>
            <input type="file" id="store-file-input" accept=".xlsx,.xls" style="display:none" onchange="StoreModule.onFileSelected(this)">
          </div>

          <!-- Preview Area -->
          <div id="store-preview" style="margin-top:24px;"></div>
        </div>
      </div>`;
  }

  function attachUploadEvents() {
    // nothing extra needed — inline handlers cover it
  }

  // ── Excel template download ────────────────────────────────
  function downloadTemplate(e) {
    e.preventDefault();
    if (typeof XLSX === 'undefined') { showToast('Excel library not loaded', 'error'); return; }
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const dateStr = `${dd}-${mm}-${yyyy}`;
    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'JMREF', 'Sold Quantity', 'Sale Price'],
      [dateStr, 'JMREF-2024-001', 100, 12.5],
      [dateStr, 'JMREF-2024-002', 50, 8.75],
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Upload');
    XLSX.writeFile(wb, 'JMPL_Sales_Upload_Template.xlsx');
    showToast('Template downloaded', 'success');
  }

  // ── Drag-drop helpers ──────────────────────────────────────
  function onDragOver(e) {
    e.preventDefault();
    const dz = document.getElementById('store-dropzone');
    if (dz) { dz.style.borderColor = 'var(--accent-blue)'; dz.style.background = 'rgba(56,189,248,0.06)'; }
  }
  function onDragLeave(e) {
    const dz = document.getElementById('store-dropzone');
    if (dz) { dz.style.borderColor = 'var(--border-color)'; dz.style.background = ''; }
  }
  function onDrop(e) {
    e.preventDefault();
    onDragLeave(e);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }
  function onFileSelected(input) {
    const file = input.files?.[0];
    if (file) processFile(file);
    input.value = '';
  }

  // ── Parse & preview uploaded file ─────────────────────────
  function processFile(file) {
    if (typeof XLSX === 'undefined') { showToast('Excel library not loaded', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (raw.length < 2) { showToast('File is empty or has no data rows', 'error'); return; }

        const header = (raw[0] || []).map(h => String(h).trim().toLowerCase());
        const dateIdx = header.findIndex(h => h.includes('date'));
        const jmrefIdx = header.findIndex(h => h.includes('jmref'));
        const qtyIdx = header.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('sold'));
        const priceIdx = header.findIndex(h => h.includes('price') || h.includes('rate') || h.includes('sale price') || h.includes('sales price'));

        if (dateIdx < 0 || jmrefIdx < 0 || qtyIdx < 0 || priceIdx < 0) {
          showToast('Column headers must include: Date, JMREF, Sold Quantity, Sale Price', 'error');
          return;
        }

        const master = DB.Master.all();
        const rows = [];

        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r || r.every(c => c === '' || c === null || c === undefined)) continue;

          let dateVal = r[dateIdx];
          let parsedDate = '';
          // Handle Excel date serial numbers
          if (typeof dateVal === 'number') {
            parsedDate = XLSX.SSF.format('yyyy-mm-dd', dateVal);
          } else if (dateVal instanceof Date) {
            parsedDate = dateVal.toISOString().slice(0, 10);
          } else {
            const str = String(dateVal).trim();
            // Match DD-MM-YYYY or D-M-YYYY with slashes or dashes
            const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (match) {
              const d = match[1].padStart(2, '0');
              const m = match[2].padStart(2, '0');
              const y = match[3];
              parsedDate = `${y}-${m}-${d}`;
            } else {
              parsedDate = str;
            }
          }

          const jmref = String(r[jmrefIdx] || '').trim();
          const qty   = parseInt(r[qtyIdx]);
          const price = parseFloat(r[priceIdx]);
          const part  = master.find(m => m.jmrefNo === jmref);
          const available = jmref ? fifoAvailable(jmref) : 0;

          // Validate
          let errors = [];
          if (!parsedDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) errors.push('Invalid date (use DD-MM-YYYY)');
          if (!jmref) errors.push('JMREF is empty');
          if (!part) errors.push('JMREF not found in master');
          if (isNaN(qty) || qty < 1) errors.push('Qty must be ≥ 1');
          if (part && qty > available) errors.push('Qty (' + qty + ') exceeds available stock (' + available + ')');
          if (isNaN(price) || price < 0) errors.push('Sale Price must be a valid number ≥ 0');

          rows.push({ row: i + 1, dateVal: parsedDate, jmref, partNo: part?.partNo || '—', qty, price, available, errors });
        }

        showPreview(rows);
      } catch(err) {
        showToast('Error reading file: ' + err.message, 'error');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Preview table ──────────────────────────────────────────
  function showPreview(rows) {
    const preview = document.getElementById('store-preview');
    if (!preview) return;

    const validRows = rows.filter(r => r.errors.length === 0);
    const errorRows = rows.filter(r => r.errors.length > 0);
    const totalQty  = validRows.reduce((s, r) => s + r.qty, 0);
    const totalVal  = validRows.reduce((s, r) => s + (r.qty * r.price), 0);

    const tableRows = rows.map(r => {
      const hasErr = r.errors.length > 0;
      const rowStyle = hasErr ? 'background:rgba(255,71,87,0.06);' : '';
      const statusCell = hasErr
        ? '<td style="color:var(--accent-red);font-size:12px;">' + r.errors.join(', ') + '</td>'
        : '<td><span class="badge badge-green">&#10003; OK</span></td>';
      return `<tr style="${rowStyle}">
        <td class="text-muted">${r.row}</td>
        <td>${r.dateVal}</td>
        <td><span class="badge badge-teal">${r.jmref}</span></td>
        <td>${r.partNo}</td>
        <td class="font-semibold">${formatNum(r.qty)}</td>
        <td class="font-semibold">${isNaN(r.price) ? '—' : '₹' + formatNum(r.price)}</td>
        <td class="text-muted">${formatNum(r.available)}</td>
        ${statusCell}
      </tr>`;
    }).join('');

    preview.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div>
          <span class="font-bold" style="font-size:15px;">Preview — ${rows.length} row${rows.length !== 1 ? 's' : ''} found</span>
          <span class="badge badge-green" style="margin-left:10px;">${validRows.length} valid</span>
          ${errorRows.length ? '<span class="badge badge-red" style="margin-left:6px;">' + errorRows.length + ' errors</span>' : ''}
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <span class="text-muted text-sm">Total Qty: <strong>${formatNum(totalQty)}</strong> | Total Value: <strong class="text-success">₹${formatNum(totalVal)}</strong></span>
          ${validRows.length > 0
            ? `<button class="btn btn-primary" onclick="StoreModule.confirmSales()">&#10003; Confirm &amp; Save (${validRows.length} rows)</button>`
            : ''}
        </div>
      </div>
      ${errorRows.length ? '<div style="padding:10px 14px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;margin-bottom:14px;color:var(--accent-red);font-size:13px;">&#9888;&#65039; Fix errors before confirming. Only valid rows will be saved.</div>' : ''}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Row</th><th>Date</th><th>JMREF</th><th>Part No</th>
              <th>Sold Qty</th><th>Sale Price</th><th>Available Stock</th><th>Status</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;

    // Store validated rows for confirmation
    preview.dataset.validRows = JSON.stringify(validRows);
  }

  // ── Confirm & Save with FIFO ───────────────────────────────
  function confirmSales() {
    const preview = document.getElementById('store-preview');
    if (!preview?.dataset.validRows) { showToast('No valid rows to save', 'error'); return; }

    const validRows = JSON.parse(preview.dataset.validRows);
    if (!validRows.length) { showToast('No valid rows to save', 'error'); return; }

    // Re-validate available stock at the moment of confirmation (stock may have changed)
    const errors = [];
    // Group by jmref to check cumulative qty in same upload
    const jmrefQtys = {};
    validRows.forEach(r => { jmrefQtys[r.jmref] = (jmrefQtys[r.jmref] || 0) + r.qty; });

    for (const [jmref, totalQty] of Object.entries(jmrefQtys)) {
      const avail = fifoAvailable(jmref);
      if (totalQty > avail) {
        errors.push(`${jmref}: need ${formatNum(totalQty)} but only ${formatNum(avail)} available`);
      }
    }

    if (errors.length) {
      showToast('Stock changed since preview. Issues:\n' + errors.join('\n'), 'error');
      return;
    }

    // Save each row as a sale record
    let saved = 0;
    validRows.forEach(r => {
      DB.Sales.insert({
        jmrefNo: r.jmref,
        partNo:  r.partNo,
        qty:     r.qty,
        salePrice: r.price,
        saleDate: r.dateVal,
        uploadedViaExcel: true,
        notes: 'Excel bulk upload'
      });
      saved++;
    });

    showToast(`✓ ${saved} sale record${saved !== 1 ? 's' : ''} saved with FIFO applied`, 'success');

    // Reset preview and re-render
    if (preview) { preview.innerHTML = ''; delete preview.dataset.validRows; }

    // Refresh inventory tab
    setTimeout(() => {
      document.querySelectorAll('#store-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      const invBtn = document.querySelector('#store-tabs [data-tab="inventory"]');
      if (invBtn) invBtn.classList.add('active');
      render();
    }, 800);
  }

  // ── Completed Batches Tab ──────────────────────────────────
  let completedBatchSearch = '';

  function batchesTab() {
    let batches = DB.Batches.byStatus('completed');
    if (completedBatchSearch) {
      const q = completedBatchSearch.toLowerCase();
      batches = batches.filter(b => 
        (b.batchNo || '').toLowerCase().includes(q) || 
        (b.jmrefNo || '').toLowerCase().includes(q) || 
        (b.partNo || '').toLowerCase().includes(q)
      );
    }

    if (!batches.length) {
      return `
        <div class="card card-body">
          <div style="margin-bottom: 12px; max-width: 280px;">
            <input type="text" id="store-batch-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${completedBatchSearch}" oninput="StoreModule.filterCompletedBatches(this.value)">
          </div>
          <div class="empty-state"><div class="empty-icon">&#9989;</div><p>No completed batches found</p></div>
        </div>`;
    }

    const rows = batches
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
      .map(b => {
        const storeRecs = DB.StageRecords.all().filter(r => r.batchId === b.id && r.stage === 'store');
        const storeQty = storeRecs.length ? storeRecs[0].inputQty : 0;
        return `<tr>
          <td><input type="checkbox" class="bulk-stage-check" value="${b.id}" style="cursor:pointer;" onclick="event.stopPropagation()"></td>
          <td class="font-semibold text-blue">${b.batchNo}</td>
          <td><span class="badge badge-teal">${b.jmrefNo || '&#x2014;'}</span></td>
          <td>${b.partNo || '&#x2014;'}</td>
          <td class="font-semibold">${formatNum(storeQty)}</td>
          <td class="text-muted text-sm">${(b.completedAt || '').slice(0, 10)}</td>
        </tr>`;
      }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:16px;">
            <h3>Completed Batches in Store</h3>
            <button class="btn btn-secondary btn-sm" onclick="App.bulkPrintStageSelected()" style="padding:4px 12px; height:32px; display:flex; align-items:center; gap:6px;">🖨️ Bulk Print</button>
          </div>
          <div class="search-input" style="max-width: 250px; margin: 0;">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="store-batch-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${completedBatchSearch}" oninput="StoreModule.filterCompletedBatches(this.value)">
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th><input type="checkbox" onclick="App.toggleAllStageChecks(this)" style="cursor:pointer;"></th><th>Batch No</th><th>JMREF</th><th>Part</th><th>Qty in Store</th><th>Completed</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function filterCompletedBatches(val) {
    completedBatchSearch = val;
    const content = document.getElementById('store-content');
    if (content) {
      content.innerHTML = batchesTab();
      const inp = document.getElementById('store-batch-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  // ── Sales History Tab ──────────────────────────────────────
  function salesTab() {
    const sales = DB.Sales.all().sort((a, b) => b.saleDate.localeCompare(a.saleDate));
    const master = DB.Master.all();

    function render() {
      let s = sales;
      const sv = (document.getElementById('sales-filter-search') || {}).value || '';
      const jv = (document.getElementById('sales-filter-jmref') || {}).value || '';
      const fv = (document.getElementById('sales-filter-from')  || {}).value || '';
      const tv = (document.getElementById('sales-filter-to')    || {}).value || '';
      
      if (sv) {
        const q = sv.toLowerCase();
        s = s.filter(r => 
          (r.jmrefNo || '').toLowerCase().includes(q) || 
          (r.partNo || '').toLowerCase().includes(q) || 
          (r.notes || '').toLowerCase().includes(q)
        );
      }
      if (jv) s = s.filter(r => (r.jmrefNo || '').toLowerCase().includes(jv.toLowerCase()));
      if (fv) s = s.filter(r => r.saleDate >= fv);
      if (tv) s = s.filter(r => r.saleDate <= tv);

      const total = s.reduce((sum, r) => sum + (r.qty || 0), 0);
      const totalValue = s.reduce((sum, r) => {
        const part = master.find(m => m.jmrefNo === r.jmrefNo) || {};
        const price = r.salePrice !== undefined && r.salePrice !== null ? r.salePrice : (part.salePrice || 0);
        return sum + (price * r.qty);
      }, 0);

      const tbody = document.getElementById('sales-tbody');
      const totalEl = document.getElementById('sales-total');
      const totalValEl = document.getElementById('sales-total-value');
      if (!tbody) return;
      
      tbody.innerHTML = s.map((r, i) => {
        const part = master.find(m => m.jmrefNo === r.jmrefNo) || {};
        const price = r.salePrice !== undefined && r.salePrice !== null ? r.salePrice : (part.salePrice || 0);
        const totalVal = price * r.qty;
        return `<tr>
          <td class="text-muted">${i + 1}</td>
          <td><span class="badge badge-teal">${r.jmrefNo || '&#x2014;'}</span></td>
          <td>${part.partNo || '&#x2014;'}</td>
          <td class="font-semibold">${formatNum(r.qty)}</td>
          <td>₹${formatNum(price)}</td>
          <td class="font-bold text-success">₹${formatNum(totalVal)}</td>
          <td>${r.saleDate || '&#x2014;'}</td>
          <td class="text-muted text-sm">${r.uploadedViaExcel ? '<span class="badge badge-blue" style="font-size:10px;">Excel</span>' : '&#x2014;'}</td>
          <td class="text-muted text-sm">${r.notes || '&#x2014;'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">No sales match the selected filters</td></tr>';
      
      if (totalEl) totalEl.textContent = formatNum(total);
      if (totalValEl) totalValEl.textContent = '₹' + formatNum(totalValue);
    }

    const jmrefOpts = master.map(m => `<option value="${m.jmrefNo}">${m.jmrefNo}</option>`).join('');

    setTimeout(render, 0);

    return `
      <div class="card">
        <div class="card-header"><h3>Sales History</h3></div>
        <div class="card-body">
          <div class="filter-bar" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
            <div class="form-group mb-0">
              <label class="form-label">Search text</label>
              <input type="text" class="form-control" id="sales-filter-search" placeholder="Search JMREF, Part, Notes..." oninput="StoreModule._salesFilter()">
            </div>
            <div class="form-group mb-0">
              <label class="form-label">JMREF</label>
              <select class="form-control" id="sales-filter-jmref" onchange="StoreModule._salesFilter()">
                <option value="">All</option>${jmrefOpts}
              </select>
            </div>
            <div class="form-group mb-0">
              <label class="form-label">From Date</label>
              <input type="date" class="form-control" id="sales-filter-from" onchange="StoreModule._salesFilter()">
            </div>
            <div class="form-group mb-0">
              <label class="form-label">To Date</label>
              <input type="date" class="form-control" id="sales-filter-to" onchange="StoreModule._salesFilter()">
            </div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>#</th><th>JMREF</th><th>Part No</th><th>Qty Sold</th><th>Sale Price</th><th>Total Value</th><th>Sale Date</th><th>Source</th><th>Notes</th></tr>
            </thead>
            <tbody id="sales-tbody"></tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding:12px 16px;font-weight:700;">Total</td>
                <td style="padding:12px 16px;font-weight:800;color:var(--accent-teal);" id="sales-total">0</td>
                <td></td>
                <td style="padding:12px 16px;font-weight:800;color:var(--accent-green);" id="sales-total-value">₹0</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  }

  // Public filter trigger for sales tab
  function _salesFilter() {
    const sales = DB.Sales.all().sort((a, b) => b.saleDate.localeCompare(a.saleDate));
    const master = DB.Master.all();
    let s = sales;
    const sv = (document.getElementById('sales-filter-search') || {}).value || '';
    const jv = (document.getElementById('sales-filter-jmref') || {}).value || '';
    const fv = (document.getElementById('sales-filter-from')  || {}).value || '';
    const tv = (document.getElementById('sales-filter-to')    || {}).value || '';
    
    if (sv) {
      const q = sv.toLowerCase();
      s = s.filter(r => 
        (r.jmrefNo || '').toLowerCase().includes(q) || 
        (r.partNo || '').toLowerCase().includes(q) || 
        (r.notes || '').toLowerCase().includes(q)
      );
    }
    if (jv) s = s.filter(r => (r.jmrefNo || '').toLowerCase().includes(jv.toLowerCase()));
    if (fv) s = s.filter(r => r.saleDate >= fv);
    if (tv) s = s.filter(r => r.saleDate <= tv);

    const total = s.reduce((sum, r) => sum + (r.qty || 0), 0);
    const totalValue = s.reduce((sum, r) => {
      const part = master.find(m => m.jmrefNo === r.jmrefNo) || {};
      const price = r.salePrice !== undefined && r.salePrice !== null ? r.salePrice : (part.salePrice || 0);
      return sum + (price * r.qty);
    }, 0);

    const tbody = document.getElementById('sales-tbody');
    const totalEl = document.getElementById('sales-total');
    const totalValEl = document.getElementById('sales-total-value');
    if (!tbody) return;
    tbody.innerHTML = s.map((r, i) => {
      const part = master.find(m => m.jmrefNo === r.jmrefNo) || {};
      const price = r.salePrice !== undefined && r.salePrice !== null ? r.salePrice : (part.salePrice || 0);
      const totalVal = price * r.qty;
      return `<tr>
        <td class="text-muted">${i + 1}</td>
        <td><span class="badge badge-teal">${r.jmrefNo || '&#x2014;'}</span></td>
        <td>${part.partNo || '&#x2014;'}</td>
        <td class="font-semibold">${formatNum(r.qty)}</td>
        <td>₹${formatNum(price)}</td>
        <td class="font-bold text-success">₹${formatNum(totalVal)}</td>
        <td>${r.saleDate || '&#x2014;'}</td>
        <td class="text-muted text-sm">${r.uploadedViaExcel ? '<span class="badge badge-blue" style="font-size:10px;">Excel</span>' : '&#x2014;'}</td>
        <td class="text-muted text-sm">${r.notes || '&#x2014;'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">No sales match the selected filters</td></tr>';
    if (totalEl) totalEl.textContent = formatNum(total);
    if (totalValEl) totalValEl.textContent = '₹' + formatNum(totalValue);
  }

  return {
    render,
    downloadTemplate,
    onDragOver, onDragLeave, onDrop,
    onFileSelected,
    confirmSales,
    _salesFilter,
    filterCompletedBatches
  };
})();

