// ============================================================
// store.js — Store & Sales Module (Excel Bulk Upload)
// ============================================================
const StoreModule = (() => {
  let activeTab = 'inventory';
  let parsedSalesRows = [];
  let currentPage = 1;
  let inventoryCurrentPage = 1;
  let salesCurrentPage = 1;
  const itemsPerPage = 50;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── FIFO precomputation cache ──────────────────────────────
  function buildFifoPrecomputed() {
    const stageRecords = DB.StageRecords.all();
    const sales = DB.Sales.all();
    const allBatches = DB.Batches.all();

    const storeRecordsByBatchId = {};
    for (let i = 0; i < stageRecords.length; i++) {
      const r = stageRecords[i];
      if (r.batchId && r.stage === 'store') {
        storeRecordsByBatchId[r.batchId] = r;
      }
    }

    const batchesByPartId = {};
    const batchesByJmref = {};
    for (let i = 0; i < allBatches.length; i++) {
      const b = allBatches[i];
      if (b.status !== 'completed' && b.currentStage !== 'store') continue;
      if (b.notes && (b.notes.includes('Closed via stock') || b.notes.includes('Zeroed via stock') || b.notes.includes('zeroing'))) continue;

      if (b.partId) {
        if (!batchesByPartId[b.partId]) batchesByPartId[b.partId] = [];
        batchesByPartId[b.partId].push(b);
      }
      if (b.jmrefNo) {
        const bNorm = String(b.jmrefNo).trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
        if (!batchesByJmref[bNorm]) batchesByJmref[bNorm] = [];
        batchesByJmref[bNorm].push(b);
      }
    }

    const sortByDate = (a, b) => (a.completedAt || a.createdAt || '').localeCompare(b.completedAt || b.createdAt || '');
    Object.keys(batchesByPartId).forEach(k => batchesByPartId[k].sort(sortByDate));
    Object.keys(batchesByJmref).forEach(k => batchesByJmref[k].sort(sortByDate));

    const salesByPartId = {};
    const salesByJmref = {};
    for (let i = 0; i < sales.length; i++) {
      const s = sales[i];
      const qty = Number(s.qty) || 0;
      if (s.partId) {
        salesByPartId[s.partId] = (salesByPartId[s.partId] || 0) + qty;
      }
      if (s.jmrefNo) {
        const sNorm = String(s.jmrefNo).trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
        salesByJmref[sNorm] = (salesByJmref[sNorm] || 0) + qty;
      }
    }

    return {
      storeRecordsByBatchId,
      batchesByPartId,
      batchesByJmref,
      salesByPartId,
      salesByJmref
    };
  }

  // ── FIFO engine ────────────────────────────────────────────
  // Returns available qty per jmref and FIFO batch breakdown
  function fifoAvailable(jmrefNo, partId, precomputed = null) {
    const list = fifoBatches(jmrefNo, partId, precomputed);
    return list.reduce((sum, b) => sum + b.remaining, 0);
  }

  // Build FIFO batch list with remaining quantities (pure in-memory calculation)
  function fifoBatches(jmrefNo, partId, precomputed = null) {
    const normTarget = String(jmrefNo || '').trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
    
    let batches = [];
    let totalSold = 0;
    
    if (precomputed) {
      if (partId && precomputed.batchesByPartId[partId]) {
        batches = precomputed.batchesByPartId[partId];
        totalSold = precomputed.salesByPartId[partId] || 0;
      } else if (normTarget && precomputed.batchesByJmref[normTarget]) {
        batches = precomputed.batchesByJmref[normTarget];
        totalSold = precomputed.salesByJmref[normTarget] || 0;
      }
    } else {
      const stageRecords = DB.StageRecords.all();
      const sales = DB.Sales.all();
      const allBatches = DB.Batches.all();
      
      batches = allBatches
        .filter(b => {
          if (b.status !== 'completed' && b.currentStage !== 'store') return false;
          if (b.notes && (b.notes.includes('Closed via stock') || b.notes.includes('Zeroed via stock') || b.notes.includes('zeroing'))) return false;
          if (partId && b.partId === partId) return true;
          if (b.jmrefNo) {
            const bNorm = String(b.jmrefNo).trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
            if (normTarget && (bNorm === normTarget || String(b.jmrefNo).trim().toUpperCase() === String(jmrefNo).trim().toUpperCase())) return true;
          }
          return false;
        })
        .sort((a, b) => (a.completedAt || a.createdAt || '').localeCompare(b.completedAt || b.createdAt || ''));

      sales.forEach(s => {
        if (partId && s.partId === partId) {
          totalSold += Number(s.qty) || 0;
          return;
        }
        if (s.jmrefNo) {
          const sNorm = String(s.jmrefNo).trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
          if (normTarget && (sNorm === normTarget || String(s.jmrefNo).trim().toUpperCase() === String(jmrefNo).trim().toUpperCase())) {
            totalSold += Number(s.qty) || 0;
          }
        }
      });
    }

    const list = [];
    const stageRecords = precomputed?.storeRecordsByBatchId ? null : DB.StageRecords.all();
    for (const b of batches) {
      let storeQty = 0;
      if (precomputed?.storeRecordsByBatchId) {
        const r = precomputed.storeRecordsByBatchId[b.id];
        storeQty = r ? (r.inputQty !== undefined ? Number(r.inputQty) : Number(b.initialQty || 0)) : Number(b.initialQty || 0);
      } else {
        const storeRecs = stageRecords.filter(r => r.batchId === b.id && r.stage === 'store');
        storeQty = storeRecs.length ? (storeRecs[0].inputQty !== undefined ? Number(storeRecs[0].inputQty) : Number(b.initialQty || 0)) : Number(b.initialQty || 0);
      }
      if (storeQty <= 0) continue;

      let remaining = storeQty;
      if (totalSold >= storeQty) {
        totalSold -= storeQty;
        remaining = 0;
      } else if (totalSold > 0) {
        remaining = storeQty - totalSold;
        totalSold = 0;
      }

      if (remaining > 0) {
        list.push({
          batchId: b.id,
          batchNo: b.batchNo,
          batchQty: storeQty,
          remaining,
          completedAt: b.completedAt || b.createdAt
        });
      }
    }
    return list;
  }

  // ── Render ─────────────────────────────────────────────────
  function render() {
    currentPage = 1;
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
          <button class="tab-btn ${activeTab === 'inventory' ? 'active' : ''}" data-tab="inventory">Inventory</button>
          <button class="tab-btn ${activeTab === 'adjust' ? 'active' : ''}" data-tab="adjust">🛠️ Stock Adjustment &amp; Reconciliation</button>
          <button class="tab-btn ${activeTab === 'upload' ? 'active' : ''}" data-tab="upload">📤 Upload Sales (Excel)</button>
          <button class="tab-btn ${activeTab === 'batches' ? 'active' : ''}" data-tab="batches">Completed Batches</button>
          <button class="tab-btn ${activeTab === 'sales' ? 'active' : ''}" data-tab="sales">Sales History</button>
        </div>
        <div id="store-content">${renderTabContent(parts)}</div>
      </div>`;

    document.querySelectorAll('#store-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    if (activeTab === 'upload') {
      attachUploadEvents();
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    inventoryCurrentPage = 1;
    salesCurrentPage = 1;
    const parts = DB.StoreInventory.allParts();
    const cont = document.getElementById('store-content');
    if (cont) {
      cont.innerHTML = renderTabContent(parts);
      if (activeTab === 'upload') attachUploadEvents();
    }
    document.querySelectorAll('#store-tabs .tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
  }

  function renderTabContent(parts) {
    if (activeTab === 'inventory') return inventoryTab(parts);
    if (activeTab === 'adjust')    return adjustTab(parts);
    if (activeTab === 'upload')    return uploadTab();
    if (activeTab === 'batches')   return batchesTab();
    if (activeTab === 'sales')     return salesTab();
  }

  // ── Inventory Tab ──────────────────────────────────────────
  function inventoryTab(parts) {
    if (!parts.length) {
      return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#127978;</div><p>No parts in inventory. Complete batches through Quality Final to see stock here.</p></div></div>';
    }

    const totalItems = parts.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (inventoryCurrentPage > totalPages) inventoryCurrentPage = totalPages;
    if (inventoryCurrentPage < 1) inventoryCurrentPage = 1;

    const startIdx = (inventoryCurrentPage - 1) * itemsPerPage;
    const endIdx = inventoryCurrentPage * itemsPerPage;
    const pageItems = parts.slice(startIdx, endIdx);

    const precomputed = buildFifoPrecomputed();

    const rows = pageItems.map(p => {
      const fifo = fifoBatches(p.jmrefNo, p.id, precomputed);
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

    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="StoreModule.changePageInventory(${inventoryCurrentPage - 1})" ${inventoryCurrentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${inventoryCurrentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="StoreModule.changePageInventory(${inventoryCurrentPage + 1})" ${inventoryCurrentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="card animate-in">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3>Current Inventory</h3>
            <span class="text-muted text-sm">Qty = Completed Batches &#x2212; Sales (FIFO)</span>
          </div>
          <button class="btn btn-warning btn-sm" onclick="StoreModule.switchTab('adjust')">🛠️ Reconcile / Adjust Store Stock</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Part No</th><th>JMREF</th><th>Description</th><th>Available Stock &amp; FIFO Batches</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${paginationHtml}
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
    if (parsedSalesRows && parsedSalesRows.length > 0) {
      showPreview(parsedSalesRows);
    }
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

  // ── Helper to resolve Master part from JMREF, Part No, 10 Digit No ───
  function resolvePart(rawKey, master) {
    if (!rawKey) return null;
    const s = String(rawKey).trim();
    const sNorm = s.replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
    
    // 1. Direct JMREF exact or normalized match
    let match = master.find(m => {
      if (!m.jmrefNo) return false;
      const mNorm = String(m.jmrefNo).trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
      return mNorm === sNorm || String(m.jmrefNo).trim().toUpperCase() === s.toUpperCase();
    });
    if (match) return match;

    // 2. Part No match
    match = master.find(m => m.partNo && String(m.partNo).trim().toUpperCase() === s.toUpperCase());
    if (match) return match;

    // 3. 10-Digit No match
    match = master.find(m => m.tenDigitNo && String(m.tenDigitNo).trim().toUpperCase() === s.toUpperCase());
    if (match) return match;

    // 4. Substring / clean digit matching
    const digitsOnly = s.replace(/\D/g, '');
    if (digitsOnly.length >= 3) {
      match = master.find(m => {
        const mDigits = String(m.jmrefNo || '').replace(/\D/g, '');
        return mDigits && mDigits === digitsOnly;
      });
      if (match) return match;
    }

    return null;
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
        const dateIdx = header.findIndex(h => h.includes('date') || h.includes('dt'));
        const jmrefIdx = header.findIndex(h => h.includes('jmref') || h.includes('jm ref') || h.includes('part') || h.includes('item') || h.includes('10 digit'));
        const qtyIdx = header.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('sold') || h.includes('dispatch') || h.includes('nos'));
        const priceIdx = header.findIndex(h => h.includes('price') || h.includes('rate') || h.includes('sale price') || h.includes('sales price') || h.includes('cost') || h.includes('amount'));

        if (dateIdx < 0 || jmrefIdx < 0 || qtyIdx < 0) {
          showToast('Excel must include columns: Date, JMREF / Part No, Sold Quantity', 'error');
          return;
        }

        const master = DB.Master.all();
        const rows = [];
        const precomputed = buildFifoPrecomputed();
        const runningAvail = {};

        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r || r.every(c => c === '' || c === null || c === undefined)) continue;

          let dateVal = r[dateIdx];
          let parsedDate = '';
          // Handle Excel date serial numbers
          if (typeof dateVal === 'number') {
            parsedDate = XLSX.SSF.format('yyyy-mm-dd', dateVal);
          } else if (dateVal instanceof Date) {
            const y = dateVal.getFullYear();
            const m = String(dateVal.getMonth() + 1).padStart(2, '0');
            const d = String(dateVal.getDate()).padStart(2, '0');
            parsedDate = `${y}-${m}-${d}`;
          } else {
            const str = String(dateVal || '').trim();
            // Match DD-MM-YYYY or D-M-YYYY with slashes or dashes
            const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (match) {
              const d = match[1].padStart(2, '0');
              const m = match[2].padStart(2, '0');
              const y = match[3];
              parsedDate = `${y}-${m}-${d}`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
              parsedDate = str;
            } else {
              parsedDate = new Date().toISOString().slice(0, 10);
            }
          }

          const rawIdentifier = String(r[jmrefIdx] || '').trim();
          const part = resolvePart(rawIdentifier, master);
          const jmrefNo = part ? part.jmrefNo : rawIdentifier;
          const partNo = part ? (part.partNo || '—') : '—';
          const partId = part ? part.id : null;
          const qty = parseInt(r[qtyIdx], 10);
          
          let price = priceIdx >= 0 ? parseFloat(r[priceIdx]) : (part?.salePrice || 0);
          if (isNaN(price)) price = part?.salePrice || 0;

          // Track running available stock originally and currently
          const normKey = String(jmrefNo || '').trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
          if (runningAvail[normKey] === undefined) {
            runningAvail[normKey] = fifoAvailable(jmrefNo, partId, precomputed);
          }
          const available = runningAvail[normKey];

          // Validate
          let errors = [];
          let warnings = [];
          let adjustedQty = qty;

          if (!parsedDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) errors.push('Invalid date (use DD-MM-YYYY)');
          if (!rawIdentifier) errors.push('JMREF/Part No is empty');
          if (!part) errors.push('Part/JMREF not found in master');
          if (isNaN(qty) || qty < 1) errors.push('Qty must be ≥ 1');

          if (part && !errors.length) {
            if (qty > available) {
              warnings.push(`Qty (${qty}) exceeds remaining stock (${available})`);
              adjustedQty = available;
              runningAvail[normKey] = 0;
            } else {
              runningAvail[normKey] = available - qty;
            }
          }

          rows.push({
            row: i + 1,
            dateVal: parsedDate,
            jmref: jmrefNo,
            partNo,
            partId,
            qty,
            adjustedQty,
            price,
            available: fifoAvailable(jmrefNo, partId, precomputed),
            remainingAvailable: available,
            errors,
            warnings
          });
        }

        parsedSalesRows = rows;
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
    
    // Total qty & val should use adjustedQty
    const totalQty  = validRows.reduce((s, r) => s + r.adjustedQty, 0);
    const totalVal  = validRows.reduce((s, r) => s + (r.adjustedQty * r.price), 0);

    const tableRows = rows.map(r => {
      const hasErr = r.errors.length > 0;
      const hasWarn = r.warnings.length > 0;
      const rowStyle = hasErr ? 'background:rgba(255,71,87,0.06);' : (hasWarn ? 'background:rgba(245,158,11,0.06);' : '');
      
      let statusCell = '';
      if (hasErr) {
        statusCell = `<td style="color:var(--accent-red);font-size:12px;">❌ ${r.errors.join(', ')}</td>`;
      } else if (hasWarn) {
        statusCell = `<td style="color:var(--accent-amber);font-size:12px;">⚠️ ${r.warnings.join(', ')} (will adjust to ${r.adjustedQty})</td>`;
      } else {
        statusCell = `<td><span class="badge badge-green">&#10003; OK</span></td>`;
      }

      const qtyCell = hasWarn
        ? `<span style="text-decoration:line-through;color:var(--text-muted);font-size:11px;margin-right:4px;">${r.qty}</span><span style="color:var(--accent-amber);font-weight:700;">${r.adjustedQty}</span>`
        : formatNum(r.qty);

      return `<tr style="${rowStyle}">
        <td class="text-muted">${r.row}</td>
        <td>${r.dateVal}</td>
        <td><span class="badge badge-teal">${r.jmref}</span></td>
        <td>${r.partNo}</td>
        <td class="font-semibold">${qtyCell}</td>
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

    // Check for stock adjustment warnings
    const needsAdjustment = validRows.some(r => r.adjustedQty !== r.qty);
    if (needsAdjustment) {
      const details = validRows
        .filter(r => r.adjustedQty !== r.qty)
        .map(r => `• Row ${r.row} [JMREF: ${r.jmref}]: Sold qty ${r.qty} exceeds stock. Adjusting to ${r.adjustedQty}.`)
        .join('\n');

      const msg = `⚠️ The following rows exceed available store stock:\n\n${details}\n\nDo you want to adjust the sold quantities to match the available stock and make the store inventory zero for these items?`;
      if (!confirm(msg)) return;
    }

    // Re-validate final available stock
    const errors = [];
    const partQtys = {};
    validRows.forEach(r => {
      const key = r.partId || r.jmref;
      if (!partQtys[key]) {
        partQtys[key] = { jmref: r.jmref, partId: r.partId, qty: 0 };
      }
      partQtys[key].qty += Number(r.adjustedQty);
    });

    const precomputed = buildFifoPrecomputed();
    for (const item of Object.values(partQtys)) {
      const avail = fifoAvailable(item.jmref, item.partId, precomputed);
      if (item.qty > avail) {
        errors.push(`${item.jmref}: need ${formatNum(item.qty)} but only ${formatNum(avail)} available`);
      }
    }

    if (errors.length) {
      showToast('Stock changed since preview. Issues:\n' + errors.join('\n'), 'error');
      return;
    }

    // Save in bulk and deduct stock
    const salesToInsert = [];
    validRows.forEach(r => {
      const finalQty = Number(r.adjustedQty);
      if (finalQty > 0) {
        salesToInsert.push({
          jmrefNo: r.jmref,
          partNo:  r.partNo,
          partId:  r.partId,
          qty:     finalQty,
          salePrice: Number(r.price) || 0,
          saleDate: r.dateVal,
          uploadedViaExcel: true,
          notes: 'Excel bulk upload'
        });
      }
    });

    if (salesToInsert.length === 0) {
      showToast('No valid sales records with quantity > 0 to save', 'warning');
      return;
    }

    // Prevent auto-refresh during save
    window.preventAutoRefresh = true;

    // Show progress bar in UI
    const actionArea = preview.querySelector('div[style*="display:flex;gap:10px;align-items:center"]');
    if (actionArea) {
      actionArea.innerHTML = `
        <div id="upload-progress-container" style="width: 250px; text-align: left;">
          <div style="font-weight: 600; font-size: 12px; margin-bottom: 4px; color: var(--text-primary);" id="upload-progress-text">Saving: 0%</div>
          <div style="width: 100%; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; position: relative;">
            <div id="upload-progress-bar" style="width: 0%; height: 100%; background: var(--accent-green); transition: width 0.1s ease-in-out;"></div>
          </div>
        </div>
      `;
    }

    // Perform bulk insertion in chunks
    const chunkSize = 25;
    const total = salesToInsert.length;

    async function uploadChunks() {
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = salesToInsert.slice(i, i + chunkSize);
        DB.Sales.insertBulk(chunk);
        
        const percent = Math.round(((i + chunk.length) / total) * 100);
        const progressText = document.getElementById('upload-progress-text');
        const progressBar = document.getElementById('upload-progress-bar');
        if (progressText) progressText.textContent = `Saving: ${percent}% (${i + chunk.length}/${total})`;
        if (progressBar) progressBar.style.width = `${percent}%`;
        
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      
      showToast(`✓ ${salesToInsert.length} sale record(s) saved and deducted from Store stock.`, 'success');
      
      // Reset preview and show completion screen
      parsedSalesRows = [];
      if (preview) {
        preview.innerHTML = `
          <div style="padding: 24px; text-align: center; color: var(--success); font-weight: 700; background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.1); border-radius: 8px;">
            <span style="font-size: 24px; margin-right: 8px; vertical-align: middle;">✓</span> Upload completed successfully! ${total} records saved.
          </div>
        `;
        delete preview.dataset.validRows;
      }
      
      setTimeout(() => {
        window.preventAutoRefresh = false;
        render();
      }, 1500);
    }

    uploadChunks().catch(err => {
      showToast(`Error saving sales: ${err.message}`, 'error');
      window.preventAutoRefresh = false;
      render();
    });
  }

  // ── Completed Batches Tab ──────────────────────────────────
  let completedBatchSearch = '';

  function batchesTab() {
    const stageRecords = DB.StageRecords.all();
    const sales = DB.Sales.all();
    let batches = DB.Batches.all().filter(b => b.status === 'completed' || b.currentStage === 'store');
    
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

    // Precompute sales map
    const salesMap = {};
    sales.forEach(s => {
      if (s.partId) salesMap[s.partId] = (salesMap[s.partId] || 0) + (Number(s.qty) || 0);
      if (s.jmrefNo) {
        const norm = 'jmref_' + String(s.jmrefNo).trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
        salesMap[norm] = (salesMap[norm] || 0) + (Number(s.qty) || 0);
      }
    });

    // Group batches by part and compute FIFO
    const partBatchesMap = {};
    batches.forEach(b => {
      const normJmref = b.jmrefNo ? 'jmref_' + String(b.jmrefNo).trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase() : '';
      const key = b.partId || normJmref || 'batch_' + b.id;
      if (!partBatchesMap[key]) partBatchesMap[key] = [];
      partBatchesMap[key].push(b);
    });

    const batchStatusMap = {};
    Object.entries(partBatchesMap).forEach(([key, bList]) => {
      bList.sort((a, b) => (a.completedAt || a.createdAt || '').localeCompare(b.completedAt || b.createdAt || ''));
      let totalSold = salesMap[key] || 0;

      bList.forEach(b => {
        const storeRecs = stageRecords.filter(r => r.batchId === b.id && r.stage === 'store');
        let initialQty = storeRecs.length ? (storeRecs[0].inputQty !== undefined ? Number(storeRecs[0].inputQty) : Number(b.initialQty || 0)) : Number(b.initialQty || 0);
        if (b.notes && (b.notes.includes('Closed via stock') || b.notes.includes('Zeroed via stock') || b.notes.includes('zeroing'))) {
          initialQty = 0;
        }

        let remainingQty = initialQty;
        if (totalSold >= initialQty) {
          totalSold -= initialQty;
          remainingQty = 0;
        } else if (totalSold > 0) {
          remainingQty = initialQty - totalSold;
          totalSold = 0;
        }

        batchStatusMap[b.id] = {
          initialQty,
          remainingQty,
          soldQty: Math.max(0, initialQty - remainingQty)
        };
      });
    });

    batches.sort((a, b) => (b.completedAt || b.createdAt || '').localeCompare(a.completedAt || a.createdAt || ''));
    
    const totalItems = batches.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = currentPage * itemsPerPage;
    const pageItems = batches.slice(startIdx, endIdx);

    const rows = pageItems
      .map(b => {
        const stats = batchStatusMap[b.id] || { initialQty: Number(b.initialQty || 0), remainingQty: Number(b.initialQty || 0), soldQty: 0 };
        const initialQty = stats.initialQty;
        const remainingQty = stats.remainingQty;
        const soldQty = stats.soldQty;
        const isDispatched = remainingQty === 0;
        const statusBadge = isDispatched
          ? '<span class="badge badge-gray">⚪ Dispatched</span>'
          : '<span class="badge badge-green">🟢 In Store</span>';

        return `<tr>
          <td><input type="checkbox" class="bulk-stage-check" value="${b.id}" style="cursor:pointer;" onclick="event.stopPropagation()"></td>
          <td class="font-semibold text-blue">${b.batchNo}</td>
          <td><span class="badge badge-teal">${b.jmrefNo || '&#x2014;'}</span></td>
          <td>${b.partNo || '&#x2014;'}</td>
          <td class="font-semibold">${formatNum(initialQty)}</td>
          <td class="${soldQty > 0 ? 'text-amber font-semibold' : 'text-muted'}">${soldQty > 0 ? formatNum(soldQty) : '—'}</td>
          <td class="font-bold ${isDispatched ? 'text-muted' : 'text-success'}">${formatNum(remainingQty)}</td>
          <td>${statusBadge}</td>
          <td class="text-muted text-sm">${(b.completedAt || b.createdAt || '').slice(0, 10)}</td>
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
            <thead>
              <tr>
                <th><input type="checkbox" onclick="App.toggleAllStageChecks(this)" style="cursor:pointer;"></th>
                <th>Batch No</th>
                <th>JMREF</th>
                <th>Part</th>
                <th>Initial Qty</th>
                <th>Qty Sold / Dispatched</th>
                <th>Remaining in Store</th>
                <th>Status</th>
                <th>Completed Date</th>
              </tr>
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
            <button class="btn btn-secondary btn-xs" onclick="StoreModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="StoreModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function filterCompletedBatches(val) {
    currentPage = 1;
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

      const totalItems = s.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
      if (salesCurrentPage > totalPages) salesCurrentPage = totalPages;
      if (salesCurrentPage < 1) salesCurrentPage = 1;

      const startIdx = (salesCurrentPage - 1) * itemsPerPage;
      const endIdx = salesCurrentPage * itemsPerPage;
      const pageItems = s.slice(startIdx, endIdx);

      const tbody = document.getElementById('sales-tbody');
      const totalEl = document.getElementById('sales-total');
      const totalValEl = document.getElementById('sales-total-value');
      if (!tbody) return;
      
      tbody.innerHTML = pageItems.map((r, i) => {
        const part = master.find(m => m.jmrefNo === r.jmrefNo) || {};
        const price = r.salePrice !== undefined && r.salePrice !== null ? r.salePrice : (part.salePrice || 0);
        const totalVal = price * r.qty;
        return `<tr>
          <td class="text-muted">${startIdx + i + 1}</td>
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

      const pagEl = document.getElementById('sales-pagination');
      if (pagEl) {
        if (totalPages > 1) {
          pagEl.innerHTML = `
            <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
              <div class="text-sm text-muted">
                Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
              </div>
              <div class="flex gap-2">
                <button class="btn btn-secondary btn-xs" onclick="StoreModule.changePageSales(${salesCurrentPage - 1})" ${salesCurrentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
                <span class="text-sm font-semibold flex items-center px-2">Page ${salesCurrentPage} of ${totalPages}</span>
                <button class="btn btn-secondary btn-xs" onclick="StoreModule.changePageSales(${salesCurrentPage + 1})" ${salesCurrentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
              </div>
            </div>
          `;
          pagEl.style.display = '';
        } else {
          pagEl.innerHTML = '';
          pagEl.style.display = 'none';
        }
      }
    }

    const jmrefOpts = master.map(m => `<option value="${m.jmrefNo}">${m.jmrefNo}</option>`).join('');

    setTimeout(render, 0);

    return `
      <div class="card animate-in">
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
        <div id="sales-pagination"></div>
      </div>`;
  }

  // Public filter trigger for sales tab
  function _salesFilter(resetPage = true) {
    if (resetPage) {
      salesCurrentPage = 1;
    }
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

    const totalItems = s.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (salesCurrentPage > totalPages) salesCurrentPage = totalPages;
    if (salesCurrentPage < 1) salesCurrentPage = 1;

    const startIdx = (salesCurrentPage - 1) * itemsPerPage;
    const endIdx = salesCurrentPage * itemsPerPage;
    const pageItems = s.slice(startIdx, endIdx);

    const tbody = document.getElementById('sales-tbody');
    const totalEl = document.getElementById('sales-total');
    const totalValEl = document.getElementById('sales-total-value');
    if (!tbody) return;
    tbody.innerHTML = pageItems.map((r, i) => {
      const part = master.find(m => m.jmrefNo === r.jmrefNo) || {};
      const price = r.salePrice !== undefined && r.salePrice !== null ? r.salePrice : (part.salePrice || 0);
      const totalVal = price * r.qty;
      return `<tr>
        <td class="text-muted">${startIdx + i + 1}</td>
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

    // Update pagination controls in DOM
    const pagEl = document.getElementById('sales-pagination');
    if (pagEl) {
      if (totalPages > 1) {
        pagEl.innerHTML = `
          <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
            <div class="text-sm text-muted">
              Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-xs" onclick="StoreModule.changePageSales(${salesCurrentPage - 1})" ${salesCurrentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
              <span class="text-sm font-semibold flex items-center px-2">Page ${salesCurrentPage} of ${totalPages}</span>
              <button class="btn btn-secondary btn-xs" onclick="StoreModule.changePageSales(${salesCurrentPage + 1})" ${salesCurrentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
            </div>
          </div>
        `;
        pagEl.style.display = '';
      } else {
        pagEl.innerHTML = '';
        pagEl.style.display = 'none';
      }
    }
  }


  function changePage(page) {
    currentPage = page;
    const content = document.getElementById('store-content');
    if (content) {
      content.innerHTML = batchesTab();
    }
  }

  function changePageInventory(page) {
    inventoryCurrentPage = page;
    const content = document.getElementById('store-content');
    const parts = DB.StoreInventory.allParts();
    if (content) {
      content.innerHTML = inventoryTab(parts);
    }
  }

  function changePageSales(page) {
    salesCurrentPage = page;
    _salesFilter(false);
  }

  // ── Stock Adjustment Tab & Logic ─────────────────────────
  let adjustParsedRows = [];

  function adjustTab(parts) {
    const masterParts = DB.Master ? DB.Master.all() : [];
    adjustParsedRows = [];

    // Pre-index store parts by jmrefNo and id for 0ms instantaneous lookup
    const storeMapByJmref = {};
    const storeMapById = {};
    (parts || []).forEach(sp => {
      if (sp.jmrefNo) storeMapByJmref[sp.jmrefNo] = sp;
      if (sp.id) storeMapById[sp.id] = sp;
    });

    const rowsHtml = masterParts.map(p => {
      const storeItem = storeMapByJmref[p.jmrefNo] || storeMapById[p.id];
      const systemAvailable = storeItem ? storeItem.available : 0;

      return `
        <tr>
          <td class="font-bold text-blue">${p.partNo}</td>
          <td><span class="badge badge-teal">${p.jmrefNo}</span></td>
          <td class="text-muted text-xs">${escapeHtml(p.description || '—')}</td>
          <td class="font-bold text-main" id="adj-sys-${p.jmrefNo}">${formatNum(systemAvailable)} pcs</td>
          <td style="width:180px;">
            <input type="number" class="form-control form-control-sm adj-phy-input" data-jmref="${p.jmrefNo}" data-partno="${p.partNo}" data-partid="${p.id}" data-sys="${systemAvailable}" 
              placeholder="Physical Pcs" min="0" style="font-weight:700;" oninput="StoreModule.onAdjQtyChange('${p.jmrefNo}', ${systemAvailable}, this.value)">
          </td>
          <td id="adj-badge-${p.jmrefNo}">
            <span class="text-muted text-xs">No change</span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card animate-in mb-6">
        <div class="card-header flex justify-between items-center">
          <div>
            <h3>🛠️ Store Physical Stock Adjustment &amp; Reconciliation</h3>
            <p class="text-sm text-muted mt-1">Enter physical store count per JMREF or upload Excel to reconcile system balances</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" onclick="StoreModule.downloadAdjustTemplate()">⬇️ Download Excel Template</button>
            <button class="btn btn-warning" onclick="StoreModule.applyStockAdjustments()">💾 Save &amp; Reconcile Store Stock</button>
          </div>
        </div>
        <div class="card-body">
          <div class="filter-bar mb-4 p-4" style="background:var(--bg-glass-hover); border-radius:12px; border:1px dashed var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
            <div>
              <strong style="font-size:13px;">📥 Option A: Bulk Upload Physical Stock via Excel</strong>
              <p class="text-xs text-muted mb-0">Upload an Excel file with columns: <code>JMREF_No</code>, <code>Physical_Qty</code>, <code>Reason</code></p>
            </div>
            <div>
              <input type="file" id="adj-excel-file" accept=".xlsx, .xls, .csv" style="display:none;" onchange="StoreModule.onAdjExcelSelected(this)">
              <button class="btn btn-teal btn-sm" onclick="document.getElementById('adj-excel-file').click()">📄 Upload Excel File</button>
            </div>
          </div>

          <div class="mb-3 flex justify-between items-center">
            <h4 class="font-bold text-sm">Option B: Enter Physical Stock per JMREF Directly</h4>
            <input type="text" class="form-control form-control-sm" style="max-width:280px;" placeholder="Search JMREF or Part No..." oninput="StoreModule.filterAdjustGrid(this.value)">
          </div>

          <div class="table-wrap" style="max-height:480px; overflow-y:auto;">
            <table class="data-table" id="adj-grid-table">
              <thead>
                <tr>
                  <th>Part No</th>
                  <th>JMREF No</th>
                  <th>Description</th>
                  <th>Current System Stock</th>
                  <th>Actual Physical Stock</th>
                  <th>Variance / Action</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function onAdjQtyChange(jmrefNo, systemQty, physicalVal) {
    const badgeEl = document.getElementById(`adj-badge-${jmrefNo}`);
    if (!badgeEl) return;

    if (physicalVal === '' || physicalVal === null || physicalVal === undefined) {
      badgeEl.innerHTML = `<span class="text-muted text-xs">No change</span>`;
      return;
    }

    const physical = Number(physicalVal);
    const diff = physical - systemQty;

    if (diff === 0) {
      badgeEl.innerHTML = `<span class="badge badge-green">Exact Match (0)</span>`;
    } else if (diff > 0) {
      badgeEl.innerHTML = `<span class="badge badge-amber font-bold">+${formatNum(diff)} pcs (Add to System)</span>`;
    } else {
      badgeEl.innerHTML = `<span class="badge badge-red font-bold">${formatNum(diff)} pcs (Deduct Excess)</span>`;
    }
  }

  function filterAdjustGrid(val) {
    const q = (val || '').toLowerCase();
    const rows = document.querySelectorAll('#adj-grid-table tbody tr');
    rows.forEach(r => {
      const txt = r.textContent.toLowerCase();
      r.style.display = txt.includes(q) ? '' : 'none';
    });
  }

  function downloadAdjustTemplate() {
    const headers = ['JMREF_No', 'Part_No', 'Physical_Stock_Qty', 'Reason'];
    const rows = (DB.Master ? DB.Master.all() : []).map(p => [
      p.jmrefNo || '',
      p.partNo || '',
      '',
      'Physical Stock Reconciliation'
    ]);

    if (typeof window.exportExcel === 'function') {
      window.exportExcel(headers, rows, 'JMPL_Store_Stock_Adjustment_Template', 'Stock Adjustment');
    } else if (typeof window.exportCSV === 'function') {
      window.exportCSV(headers, rows, 'JMPL_Store_Stock_Adjustment_Template');
    } else {
      // Direct CSV download fallback
      const escapeCsv = (val) => {
        const str = String(val || '');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const csvStr = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n');
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'JMPL_Store_Stock_Adjustment_Template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Template downloaded successfully', 'success');
    }
  }

  function onAdjExcelSelected(input) {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let rows = [];
        if (typeof XLSX !== 'undefined') {
          const workbook = XLSX.read(e.target.result, { type: 'binary' });
          const firstSheet = workbook.SheetNames[0];
          rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
        } else {
          showToast('XLSX parser library unavailable. Please enter physical stock in table.', 'error');
          return;
        }

        let updatedCount = 0;
        rows.forEach(r => {
          const jmref = String(r.JMREF_No || r.JMREF || r.jmref || '').trim();
          const phyQty = r.Physical_Stock_Qty ?? r.Physical_Qty ?? r.PhysicalQty ?? r.qty;

          if (jmref && phyQty !== undefined && phyQty !== '') {
            const inputEl = document.querySelector(`.adj-phy-input[data-jmref="${jmref}"]`);
            if (inputEl) {
              inputEl.value = Number(phyQty);
              const sysQty = Number(inputEl.dataset.sys || 0);
              onAdjQtyChange(jmref, sysQty, phyQty);
              updatedCount++;
            }
          }
        });

        showToast(`Parsed ${updatedCount} physical stock counts from Excel`, 'success');
      } catch (err) {
        console.error('Excel parse error:', err);
        showToast('Failed to parse Excel file: ' + err.message, 'error');
      }
    };
    reader.readAsBinaryString(file);
  }

  async function applyStockAdjustments() {
    const inputs = document.querySelectorAll('.adj-phy-input');
    const adjustmentsToApply = [];

    inputs.forEach(inp => {
      const val = inp.value;
      if (val !== '' && val !== null && val !== undefined) {
        const physical = Number(val);
        const sysQty = Number(inp.dataset.sys || 0);
        const jmref = inp.dataset.jmref;
        const partNo = inp.dataset.partno;
        const partId = inp.dataset.partid;
        const diff = physical - sysQty;

        if (diff !== 0) {
          adjustmentsToApply.push({ jmref, partNo, partId, physical, sysQty, diff });
        }
      }
    });

    if (!adjustmentsToApply.length) {
      showToast('No physical stock changes entered.', 'warning');
      return;
    }

    const confirmMsg = `Reconcile ${adjustmentsToApply.length} item(s) to match physical stock counts?\n\n` +
      adjustmentsToApply.slice(0, 5).map(a => `• ${a.jmref}: System ${a.sysQty} → Physical ${a.physical} (${a.diff > 0 ? '+' : ''}${a.diff})`).join('\n') +
      (adjustmentsToApply.length > 5 ? `\n...and ${adjustmentsToApply.length - 5} more.` : '');

    if (!confirm(confirmMsg)) return;

    let totalAdded = 0;
    let totalDeducted = 0;

    adjustmentsToApply.forEach(adj => {
      const now = new Date();
      const timeStr = now.toISOString().slice(0,10);

      if (adj.diff > 0) {
        // Physical count is higher than system stock -> Create store adjustment batch to credit stock
        const batchNo = `STK-ADJ-${adj.jmref}-${now.getTime().toString().slice(-5)}`;
        DB.Batches.insert({
          batchNo,
          jmrefNo: adj.jmref,
          partNo: adj.partNo,
          partId: adj.partId,
          initialQty: adj.diff,
          currentStage: 'store',
          status: 'completed',
          completedAt: now.toISOString(),
          notes: `Direct Store Stock Reconciliation: Added +${adj.diff} pcs to match physical count (${adj.physical} pcs)`
        });

        DB.StageRecords.insert({
          batchId: batchNo,
          stage: 'store',
          inputQty: adj.diff,
          outputQty: adj.diff,
          lossQty: 0,
          date: timeStr,
          timestamp: now.toISOString(),
          notes: `Stock Reconciliation Credit`
        });

        totalAdded += adj.diff;
      } else {
        // Physical count is lower than system stock -> Record sales/reconciliation debit for difference
        const debitQty = Math.abs(adj.diff);
        DB.Sales.insert({
          date: timeStr,
          saleDate: timeStr,
          jmrefNo: adj.jmref,
          partNo: adj.partNo,
          partId: adj.partId,
          qty: debitQty,
          notes: `Direct Store Stock Reconciliation: Deducted -${debitQty} pcs to match physical count (${adj.physical} pcs)`
        });

        totalDeducted += debitQty;
      }
    });

    showToast(`Store stock successfully reconciled! Added: ${totalAdded} pcs, Deducted: ${totalDeducted} pcs.`, 'success');
    render();
  }

  return {
    render,
    downloadTemplate,
    onDragOver, onDragLeave, onDrop,
    onFileSelected,
    confirmSales,
    _salesFilter,
    filterCompletedBatches,
    fifoBatches,
    fifoAvailable,
    switchTab,
    changePage,
    changePageInventory,
    changePageSales,
    onAdjQtyChange,
    filterAdjustGrid,
    downloadAdjustTemplate,
    onAdjExcelSelected,
    applyStockAdjustments
  };
})();
window.StoreModule = StoreModule;

