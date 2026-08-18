// ============================================================
// reports.js — JMPL Inventory Tracking System
// All 10 reports with filtering, CSV and Excel export
// ============================================================
/* global DB, Auth, showToast, formatDate, formatNum, XLSX */

const ReportsModule = (() => {

  const MODULES = [
    'inventory','store-stock','sales','production','cryogenic','deflashing',
    'trimming','waiting-visual','visual','gauge','rejected','recheck','slob','aging','reprocess','store-aging','daily-summary','analytics'
  ];

  const STAGE_LABELS = {
    production:'Production', cryogenic:'Cryogenic', deflashing:'Manual DE Flashing', 'waiting-trimming':'Waiting for Trimming',
    trimming:'Trimming', 'post-curing':'Post Curing', 'waiting-visual':'Waiting for Visual', visual:'Visual', gauge:'Gauge', quality:'Quality Final', store:'Store'
  };

  let agingSearch = '';

  // ── Utility ────────────────────────────────────────────────
  function td(val, cls='') { return `<td class="${cls}">${val ?? ''}</td>`; }
  function th(val) { return `<th>${val}</th>`; }

  function filterByDateRange(rows, dateField, from, to) {
    return rows.filter(r => {
      const d = (r[dateField] || '').slice(0,10);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  function emptyState(msg='No records found for the selected filters.') {
    return `<div class="empty-state"><div class="empty-icon">📊</div><p>${msg}</p></div>`;
  }

  // ── Export Helpers ─────────────────────────────────────────
  function exportCSV(headers, rows, filename) {
    const escape = v => {
      const s = String(v ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename + '.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully', 'success');
  }

  function exportExcel(headers, rows, filename, sheetName='Report') {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded', 'error'); return;
    }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Style header row
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: '1E3A5F' } } };
    }
    // Auto column width
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length), 10)
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename + '.xlsx');
    showToast('Excel exported successfully', 'success');
  }

  // ── Render Report 1: Inventory ─────────────────────────────
  function renderInventory(filters) {
    const { jmref, partNo } = filters;
    const master = DB.Master.all();
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();
    const wipStages = ['production','cryogenic','deflashing','waiting-trimming','trimming','post-curing','waiting-visual','visual','gauge','quality'];

    let parts = master.filter(p => {
      if (jmref) {
        const q = jmref.toLowerCase();
        const matchJmref = p.jmrefNo && p.jmrefNo.toLowerCase().includes(q);
        const matchPartNo = p.partNo && p.partNo.toLowerCase().includes(q);
        if (!matchJmref && !matchPartNo) return false;
      }
      return true;
    });

    if (!parts.length) return emptyState('No parts found. Add parts in Inventory Master first.');

    const wipHeaders = wipStages.map(s => STAGE_LABELS[s]);
    const headers = ['Part No', 'JMREF No', 'Description', ...wipHeaders, 'Total WIP', 'Store (Available)'];

    const dataRows = parts.map(p => {
      const stageCounts = wipStages.map(stage => {
        // Active batches for this part currently sitting at this stage
        const activeBatches = batches.filter(b =>
          b.partId === p.id && b.currentStage === stage && b.status === 'active'
        );
        return activeBatches.reduce((sum, b) => {
          // Find the most recent record that moved INTO this stage
          const incoming = stageRecords.filter(r => r.batchId === b.id && r.movedTo === stage);
          if (incoming.length) {
            // Last incoming record's outputQty = qty that arrived at this stage
            return sum + (incoming[incoming.length - 1].outputQty || 0);
          }
          // No incoming record = freshly created production batch, use initialQty
          return sum + (b.initialQty || 0);
        }, 0);
      });

      // Total WIP = sum of all WIP stages
      const totalWip = stageCounts.reduce((s, v) => s + v, 0);
      const storeAvail = DB.StoreInventory.availableByJmref(p.jmrefNo, p.id);

      return [p.partNo, p.jmrefNo, p.description, ...stageCounts, totalWip, storeAvail];
    });

    const wipLen = wipStages.length;
    const theadCols = headers.map((h, i) => {
      let color = '';
      if (i >= 3 && i < 3 + wipLen) color = 'var(--accent-blue)';   // WIP stages
      if (i === 3 + wipLen)         color = 'var(--accent-teal)';   // Total WIP
      if (i === 3 + wipLen + 1)     color = 'var(--accent-green)';  // Store avail
      return `<th${color ? ' style="color:' + color + ';"' : ''}>${h}</th>`;
    }).join('');

    let tbodyRows = dataRows.map(r => {
      const infoCols = `
        <td class="font-semibold text-blue">${r[0]}</td>
        <td><span class="badge badge-teal" style="cursor:pointer;" title="Click to view batches" onclick="ReportsModule.showPartBatches('${r[1]}', '${r[0]}')">${r[1]}</span></td>
        <td class="text-muted">${r[2]}</td>`;

      const stageCols = r.slice(3, 3 + wipLen).map((v) => {
        const cls = v > 0 ? 'font-semibold text-blue' : 'text-muted';
        return `<td class="${cls}">${v > 0 ? formatNum(v) : '—'}</td>`;
      }).join('');

      const totalWip   = r[3 + wipLen];
      const storeAvail = r[3 + wipLen + 1];
      const summaryCols = `
        <td class="font-bold" style="color:var(--accent-teal);">${totalWip > 0 ? formatNum(totalWip) : '—'}</td>
        <td class="font-bold text-success">${storeAvail > 0 ? formatNum(storeAvail) : '—'}</td>`;

      return `<tr>${infoCols}${stageCols}${summaryCols}</tr>`;
    }).join('');

    const totals = Array(wipLen + 2).fill(0);
    dataRows.forEach(r => {
      for (let i = 3; i < r.length; i++) {
        totals[i - 3] += (r[i] || 0);
      }
    });

    const totalRowHtml = `
      <tr class="font-bold text-danger">
        <td colspan="3" style="text-align:right;">TOTAL:</td>
        ${totals.map((t, idx) => {
          let style = '';
          const isTotalWip = idx === wipLen;
          const isStoreAvail = idx === wipLen + 1;
          if (isStoreAvail) style = ' style="color:var(--accent-green);"';
          else if (isTotalWip) style = ' style="color:var(--accent-teal);"';
          return `<td${style}>${t > 0 ? formatNum(t) : '0'}</td>`;
        }).join('')}
      </tr>
    `;
    tbodyRows += totalRowHtml;
    dataRows.push(['', '', 'TOTAL:', ...totals]);

    const html = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${theadCols}</tr></thead>
          <tbody>${tbodyRows}</tbody>
        </table>
      </div>`;

    return { html, headers, dataRows };
  }

  // ── Render Store Stock Report ──────────────────────────────
  function renderStoreStock(filters) {
    const { jmref } = filters;
    const master = DB.Master.all();
    const batches = DB.Batches.all();
    const parts = DB.StoreInventory.allParts();

    let filtered = parts;
    if (jmref) {
      const q = jmref.toLowerCase();
      filtered = filtered.filter(p => 
        (p.jmrefNo && p.jmrefNo.toLowerCase().includes(q)) ||
        (p.partNo && p.partNo.toLowerCase().includes(q)) ||
        (p.tenDigitNo && p.tenDigitNo.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    if (!filtered.length) return emptyState('No store stock records found matching filters.');

    // Calculate summary statistics
    const totalSKUs = filtered.length;
    const totalStock = filtered.reduce((s, p) => s + (p.available || 0), 0);
    const totalValuation = filtered.reduce((s, p) => s + ((p.available || 0) * (p.salePrice || 0)), 0);
    const lowStockCount = filtered.filter(p => (p.available || 0) < 10 && (p.available || 0) > 0).length;
    const outOfStockCount = filtered.filter(p => (p.available || 0) === 0).length;

    // Helper to get FIFO batches for a part
    function getPartStoreBatches(p) {
      if (typeof StoreModule !== 'undefined' && typeof StoreModule.fifoBatches === 'function') {
        return StoreModule.fifoBatches(p.jmrefNo, p.id);
      }
      const normTarget = String(p.jmrefNo || '').trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
      return batches.filter(b => {
        if (b.status !== 'completed' || b.isArchived) return false;
        if (b.batchNo && (b.batchNo.includes('-REC-') || b.batchNo.includes('REC'))) return false;
        if (p.id && b.partId === p.id) return true;
        if (b.jmrefNo) {
          const bNorm = String(b.jmrefNo).trim().replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '').toUpperCase();
          if (normTarget && (bNorm === normTarget || String(b.jmrefNo).trim().toUpperCase() === String(p.jmrefNo).trim().toUpperCase())) return true;
        }
        return false;
      }).sort((a, b) => (a.completedAt || a.createdAt || '').localeCompare(b.completedAt || b.createdAt || ''));
    }

    const headers = ['#', 'Part No', 'JMREF No', '10 Digit No', 'Description', 'Sale Price (₹)', 'Available Qty (pcs)', 'Valuation (₹)', 'FIFO Batches Breakdown', 'Status'];
    
    const dataRows = [];
    const tableRows = filtered.map((p, idx) => {
      const available = p.available || 0;
      const price = p.salePrice || 0;
      const valuation = available * price;
      const partBatches = getPartStoreBatches(p);
      const batchListStr = partBatches.map(b => {
        const rem = b.remaining !== undefined ? Number(b.remaining) : (b.remainingQty !== undefined ? Number(b.remainingQty) : Number(b.initialQty || 0));
        return `${b.batchNo} (${formatNum(rem)})`;
      }).join(', ');

      const statusText = available === 0 ? 'Out of Stock' : (available < 10 ? 'Low Stock' : 'In Stock');
      let statusBadge = '<span class="badge badge-green">🟢 In Stock</span>';
      if (available === 0) statusBadge = '<span class="badge badge-red">🔴 Out of Stock</span>';
      else if (available < 10) statusBadge = '<span class="badge badge-amber">🟡 Low Stock</span>';

      dataRows.push([
        idx + 1,
        p.partNo || '—',
        p.jmrefNo || '—',
        p.tenDigitNo || '—',
        p.description || '—',
        price,
        available,
        valuation,
        batchListStr || '—',
        statusText
      ]);

      const batchBadges = partBatches.map(b => {
        const rem = b.remainingQty !== undefined ? Number(b.remainingQty) : Number(b.initialQty || 0);
        return `<span class="badge badge-gray" style="font-size:11px; margin:2px 3px 2px 0;"><strong>${b.batchNo}</strong>: <span style="color:var(--accent-green);font-weight:700;">${formatNum(rem)}</span></span>`;
      }).join('') || '<span class="text-muted text-xs">—</span>';

      return `
        <tr>
          <td class="text-muted">${idx + 1}</td>
          <td class="font-semibold text-blue">${p.partNo || '—'}</td>
          <td><span class="badge badge-teal font-semibold">${p.jmrefNo || '—'}</span></td>
          <td class="text-muted text-xs">${p.tenDigitNo || '—'}</td>
          <td class="text-muted text-sm" style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.description || ''}">${p.description || '—'}</td>
          <td style="text-align:right;">₹${price.toFixed(2)}</td>
          <td style="text-align:right; font-weight:700;" class="${available === 0 ? 'text-danger' : (available < 10 ? 'text-amber' : 'text-success')}">${formatNum(available)}</td>
          <td style="text-align:right; font-weight:700; color:var(--accent-teal);">₹${Number(valuation).toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
          <td><div style="display:flex; flex-wrap:wrap; max-width:350px;">${batchBadges}</div></td>
          <td>${statusBadge}</td>
        </tr>`;
    }).join('');

    dataRows.push(['', '', 'TOTAL', '', '', '', totalStock, totalValuation, '', '']);

    const html = `
      <!-- Store Stock KPI Cards -->
      <div class="stats-grid mb-6" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
        <div class="stat-card blue">
          <div class="stat-label">Total SKUs in Store</div>
          <div class="stat-value blue">${formatNum(totalSKUs)}</div>
          <div class="text-xs text-muted mt-1">Finished Goods Catalog</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">Total Available Stock</div>
          <div class="stat-value green">${formatNum(totalStock)}</div>
          <div class="text-xs text-success font-semibold mt-1">Ready for Dispatch</div>
        </div>
        <div class="stat-card teal">
          <div class="stat-label">Total Store Valuation</div>
          <div class="stat-value teal" style="font-size:20px;">₹${Number(totalValuation).toLocaleString('en-IN', {maximumFractionDigits:2})}</div>
          <div class="text-xs text-muted mt-1">Based on Master Sale Prices</div>
        </div>
        <div class="stat-card amber">
          <div class="stat-label">Low Stock SKUs (&lt; 10)</div>
          <div class="stat-value amber">${formatNum(lowStockCount)}</div>
          <div class="text-xs font-semibold mt-1" style="color:var(--accent-amber);">Replenishment Alert</div>
        </div>
        <div class="stat-card red">
          <div class="stat-label">Out of Stock SKUs</div>
          <div class="stat-value red">${formatNum(outOfStockCount)}</div>
          <div class="text-xs text-danger font-semibold mt-1">Zero Store Balance</div>
        </div>
      </div>

      <!-- Store Stock Table -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Part No</th>
              <th>JMREF No</th>
              <th>10 Digit No</th>
              <th>Description</th>
              <th style="text-align:right;">Sale Price</th>
              <th style="text-align:right;">Available Qty</th>
              <th style="text-align:right;">Total Valuation (₹)</th>
              <th>FIFO Batches in Store</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            <tr class="font-bold text-success" style="background:rgba(16,185,129,0.06); border-top:2px solid var(--border);">
              <td colspan="5" style="text-align:right; font-weight:800;">GRAND TOTAL:</td>
              <td></td>
              <td style="text-align:right; font-weight:800; font-size:14px;">${formatNum(totalStock)} pcs</td>
              <td style="text-align:right; font-weight:800; font-size:14px; color:var(--accent-teal);">₹${Number(totalValuation).toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>
      </div>`;

    return { html, headers, dataRows };
  }

  // ── Render Report 2: Sales ─────────────────────────────────
  function renderSales(filters) {
    const { from, to, jmref } = filters;
    let sales = DB.Sales.all();
    if (jmref) sales = sales.filter(s => s.jmrefNo?.toLowerCase().includes(jmref.toLowerCase()));
    sales = filterByDateRange(sales, 'saleDate', from, to);
    if (!sales.length) return emptyState();

    const master = DB.Master.all();
    const headers = ['#', 'JMREF No', 'Part No', 'Description', 'Qty Sold', 'Sale Price', 'Total Value', 'Sale Date', 'Notes'];
    
    const dataRows = sales.sort((a,b)=>b.saleDate.localeCompare(a.saleDate)).map((s, i) => {
      const part = master.find(m => m.jmrefNo === s.jmrefNo) || {};
      const price = s.salePrice !== undefined && s.salePrice !== null ? s.salePrice : (part.salePrice || 0);
      const totalVal = price * s.qty;
      return [
        i+1, 
        s.jmrefNo, 
        part.partNo||'', 
        part.description||'', 
        s.qty, 
        price, 
        totalVal, 
        s.saleDate, 
        s.notes||''
      ];
    });

    const totalQty = dataRows.reduce((sum, r) => sum + (r[4]||0), 0);
    const totalValAll = dataRows.reduce((sum, r) => sum + (r[6]||0), 0);
    dataRows.push(['', '', '', 'TOTAL', totalQty, '', totalValAll, '', '']);

    const htmlRows = dataRows.map((r, i) => {
      const isTotal = i === dataRows.length - 1;
      const rowCls = isTotal ? 'font-bold' : '';
      if (isTotal) {
        return `<tr class="${rowCls}">
          <td></td><td></td><td></td><td>TOTAL</td>
          <td class="font-bold">${formatNum(r[4])}</td>
          <td></td>
          <td class="font-bold text-success">₹${formatNum(r[6])}</td>
          <td></td><td></td>
        </tr>`;
      }
      return `<tr class="${rowCls}">
        <td class="text-muted">${r[0]}</td>
        <td><span class="badge badge-teal">${r[1]}</span></td>
        <td class="font-semibold text-blue">${r[2]}</td>
        <td class="text-muted">${r[3]}</td>
        <td class="font-semibold">${formatNum(r[4])}</td>
        <td>₹${formatNum(r[5])}</td>
        <td class="font-bold text-success">₹${formatNum(r[6])}</td>
        <td>${r[7]}</td>
        <td class="text-muted text-sm">${r[8]}</td>
      </tr>`;
    }).join('');

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${htmlRows}</tbody>
    </table></div>`;
    
    return { html, headers, dataRows };
  }

  // ── Render Report 3: Production ────────────────────────────
  function renderProduction(filters) {
    const { from, to, jmref, operatorId, prodType } = filters;
    let records = DB.ProductionRecords.all();

    // Filter by jmref
    if (jmref) {
      records = records.filter(r => {
        const batch = DB.Batches.find(r.batchId) || {};
        return (batch.jmrefNo || '').toLowerCase().includes(jmref.toLowerCase()) ||
               (batch.partNo || '').toLowerCase().includes(jmref.toLowerCase());
      });
    }

    // Filter records by date
    records = filterByDateRange(records, 'date', from, to);
    if (operatorId) records = records.filter(r => r.operatorId === operatorId);

    // Filter by production type (In House vs Subcontractor)
    if (prodType) {
      records = records.filter(r => {
        const batch = DB.Batches.find(r.batchId) || {};
        return batch.productionType === prodType;
      });
    }

    if (!records.length) return emptyState();

    const operators = DB.Operators.all();
    const subcontractors = DB.Subcontractors.all();
    const headers = ['#','Batch No','JMREF','Operator','Subcontractor Name','Press No','No. of Lifts','Prod Type','Date'];
    const dataRows = records.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const op = operators.find(o => o.id === r.operatorId) || {};
      const sub = subcontractors.find(s => s.id === batch.subcontractorId) || {};
      const typeStr = batch.productionType === 'subcontractor' ? 'Subcontractor' : 'In House';
      return [
        i+1, 
        batch.batchNo||'', 
        batch.jmrefNo||'', 
        op.name||r.operatorName||'-', 
        (sub.name && sub.name !== '-') ? sub.name : typeStr,
        r.pressNo||batch.pressNo||'-', 
        r.noOfLifts||0, 
        typeStr, 
      ];
    });
    const totalLifts = records.reduce((s, r) => s + (r.noOfLifts||0), 0);
    const summaryRow = ['', '', '', 'TOTAL:', '', '', totalLifts, '', ''];
    dataRows.push(summaryRow);

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map((r,i)=>`<tr class="${i===dataRows.length-1?'font-bold text-danger':''}">${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
    return { html, headers, dataRows };
  }

  function renderWaitingVisualReport(filters) {
    const { from, to, jmref } = filters;
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();
    
    // Find all batches currently in waiting-visual OR that historically have a stage record for it.
    const targetBatchIds = new Set(
      batches.filter(b => b.currentStage === 'waiting-visual').map(b => b.id)
    );
    stageRecords.filter(r => r.stage === 'waiting-visual').forEach(r => targetBatchIds.add(r.batchId));
    
    let filtered = Array.from(targetBatchIds).map(id => DB.Batches.find(id)).filter(Boolean);
    
    if (jmref) {
      const q = jmref.toLowerCase();
      filtered = filtered.filter(b => 
        (b.batchNo || '').toLowerCase().includes(q) || 
        (b.jmrefNo || '').toLowerCase().includes(q) ||
        (b.partNo || '').toLowerCase().includes(q)
      );
    }
    
    // Filter by date range (using production date)
    filtered = filtered.filter(b => {
      const dateStr = b.productionDate || b.createdAt || '';
      const d = dateStr.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    
    if (!filtered.length) return emptyState();
    
    const headers = ['#', 'Batch No', 'JMREF No', 'Part No', 'Allocated Qty', 'Rack No', 'Location', 'Box No', 'Additional Details', 'Production Date', 'Stage Entry Date', 'Current Stage'];
    
    const dataRows = filtered.map((b, i) => {
      const recs = stageRecords.filter(r => r.batchId === b.id && r.movedTo === 'waiting-visual');
      const qty = recs.length ? (recs[recs.length - 1].outputQty || 0) : (b.initialQty || 0);
      const entryDateStr = recs.length ? (recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '') : (b.createdAt || '');
      const prodDateStr = b.productionDate || b.createdAt || '';
      
      return [
        i + 1,
        b.batchNo || '',
        b.jmrefNo || '',
        b.partNo || '',
        qty,
        b.rackNo || '—',
        b.rackLocation || '—',
        b.boxNo || '—',
        b.rackNotes || '—',
        prodDateStr.slice(0, 10),
        entryDateStr.slice(0, 10),
        STAGE_LABELS[b.currentStage] || b.currentStage
      ];
    });
    
    const htmlRows = filtered.map((b, i) => {
      const recs = stageRecords.filter(r => r.batchId === b.id && r.movedTo === 'waiting-visual');
      const qty = recs.length ? (recs[recs.length - 1].outputQty || 0) : (b.initialQty || 0);
      const entryDateStr = recs.length ? (recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '') : (b.createdAt || '');
      const prodDateStr = b.productionDate || b.createdAt || '';
      
      return `
        <tr>
          <td>${i + 1}</td>
          <td class="font-semibold text-blue">${b.batchNo}</td>
          <td><span class="badge badge-teal">${b.jmrefNo}</span></td>
          <td class="font-semibold">${b.partNo}</td>
          <td class="font-bold">${formatNum(qty)}</td>
          <td><span class="badge badge-blue">${b.rackNo || '—'}</span></td>
          <td><strong>${b.rackLocation || '—'}</strong></td>
          <td>${b.boxNo || '—'}</td>
          <td class="text-sm text-muted">${b.rackNotes || '—'}</td>
          <td>${formatDate(prodDateStr.slice(0,10))}</td>
          <td>${formatDate(entryDateStr.slice(0,10))}</td>
          <td><span class="stage-chip ${b.currentStage}">${STAGE_LABELS[b.currentStage] || b.currentStage}</span></td>
        </tr>`;
    }).join('');

    const totalAllocated = filtered.reduce((sum, b) => {
      const recs = stageRecords.filter(r => r.batchId === b.id && r.movedTo === 'waiting-visual');
      const qty = recs.length ? (recs[recs.length - 1].outputQty || 0) : (b.initialQty || 0);
      return sum + qty;
    }, 0);

    const totalRowHtml = `
      <tr class="font-bold text-danger">
        <td colspan="4" style="text-align:right;">TOTAL:</td>
        <td>${formatNum(totalAllocated)}</td>
        <td colspan="7"></td>
      </tr>
    `;
    const finalHtmlRows = htmlRows + totalRowHtml;
    dataRows.push(['', '', '', 'TOTAL:', totalAllocated, '', '', '', '', '', '', '']);
    
    const html = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Batch No</th>
              <th>JMREF No</th>
              <th>Part No</th>
              <th>Allocated Qty</th>
              <th>Rack No</th>
              <th>Location</th>
              <th>Box No</th>
              <th>Additional Details</th>
              <th>Production Date</th>
              <th>Stage Entry Date</th>
              <th>Current Stage</th>
            </tr>
          </thead>
          <tbody>
            ${finalHtmlRows}
          </tbody>
        </table>
      </div>`;
      
    return { html, headers, dataRows };
  }

  // ── Generic Stage Loss Report ──────────────────────────────
  function renderStageLoss(stage, filters, extraCols=[]) {
    const { from, to, jmref, vendorId, rejectionRate } = filters;
    let records = DB.StageRecords.all().filter(r => r.stage === stage);
    
    if (vendorId) {
      records = records.filter(r => r.vendorId === vendorId);
    }
    
    if (jmref) {
      const q = jmref.toLowerCase();
      records = records.filter(r => {
        const batch = DB.Batches.find(r.batchId) || {};
        return (batch.jmrefNo || '').toLowerCase().includes(q) ||
               (batch.batchNo || '').toLowerCase().includes(q) ||
               (batch.partNo || '').toLowerCase().includes(q);
      });
    }

    if (rejectionRate) {
      records = records.filter(r => {
        const input = Number(r.inputQty || 0);
        const loss = Number(r.lossQty || 0);
        const reprocess = Number(r.reprocessQty || 0);
        const output = Number(r.outputQty || 0);

        // Total non-conforming defect units (either scrapped loss or sent for reprocessing)
        const totalDefects = Math.max(loss + reprocess, Math.max(0, input - output));
        const pct = input > 0 ? (totalDefects / input) * 100 : 0;

        if (rejectionRate === 'zero') {
          // Strict 0% rejection: zero loss, zero reprocessed, output equals input, and input > 0
          return totalDefects === 0 && loss === 0 && reprocess === 0 && output >= input && input > 0;
        } else if (rejectionRate === '10') {
          return pct >= 10;
        } else if (rejectionRate === '20') {
          return pct >= 20;
        } else if (rejectionRate === '30') {
          return pct >= 30;
        } else if (rejectionRate === '50') {
          return pct >= 50;
        }
        return true;
      });
    }
    
    records = filterByDateRange(records, 'date', from, to);
    if (!records.length) return emptyState('No records found for the selected rejection and date filters.');

    // Sort chronologically (oldest to newest) so that cumulative data reads naturally
    records.sort((a, b) => {
      const dateA = a.createdAt || a.date || '';
      const dateB = b.createdAt || b.date || '';
      return dateA.localeCompare(dateB);
    });

    const headers = ['#','Batch No','JMREF','Part No','Input Qty','Output Qty','Loss Qty','% Loss / Defect','Date', ...extraCols];
    const dataRows = records.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const extra = extraCols.map(col => {
        if (col === 'Inspector') return r.inspectorName || '-';
        if (col === 'Reprocess Qty') return r.reprocessQty || 0;
        if (col === 'Recheck #') return r.iterationNo || '-';
        if (col === 'Vendor') {
          if (r.vendorId) {
            const v = DB.Vendors.find(r.vendorId);
            return v ? v.name : '—';
          }
          return 'In House';
        }
        return '-';
      });
      const input = r.inputQty || 0;
      const loss = r.lossQty || 0;
      const reprocess = r.reprocessQty || 0;
      const totalDefects = Math.max(loss + reprocess, Math.max(0, input - (r.outputQty || 0)));
      const pct = input ? ((totalDefects / input) * 100).toFixed(1) + '%' : '0.0%';
      return [i+1, batch.batchNo||'', batch.jmrefNo||'', batch.partNo||'', input, r.outputQty||'', loss, pct, (r.date||'').slice(0,10), ...extra];
    });

    const totalLoss = records.reduce((s, r) => s + (r.lossQty||0), 0);
    const totalReprocess = records.reduce((s, r) => s + (r.reprocessQty||0), 0);
    const totalInput = records.reduce((s, r) => s + (r.inputQty || 0), 0);
    const totalOutput = records.reduce((s, r) => s + (r.outputQty || 0), 0);
    const totalDefects = Math.max(totalLoss + totalReprocess, Math.max(0, totalInput - totalOutput));
    const totalPct = totalInput ? ((totalDefects / totalInput) * 100).toFixed(1) + '%' : '0.0%';
    
    const summaryExtra = extraCols.map(col => {
      if (col === 'Reprocess Qty') return totalReprocess;
      return '';
    });
    const summaryRow = ['', '', '', 'TOTAL:', totalInput, totalOutput, totalLoss, totalPct, '', ...summaryExtra];
    dataRows.push(summaryRow);

    const htmlRows = records.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const input = r.inputQty || 0;
      const loss = r.lossQty || 0;
      const reprocess = r.reprocessQty || 0;
      const totalDefects = Math.max(loss + reprocess, Math.max(0, input - (r.outputQty || 0)));
      const pctNum = input ? (totalDefects / input) * 100 : 0;
      const pctStr = pctNum.toFixed(1) + '%';
      
      let badgeClass = 'badge-green';
      if (pctNum >= 50) badgeClass = 'badge-red font-bold';
      else if (pctNum >= 30) badgeClass = 'badge-red';
      else if (pctNum >= 20) badgeClass = 'badge-amber';
      else if (pctNum >= 10) badgeClass = 'badge-amber';
      else if (pctNum > 0) badgeClass = 'badge-blue';

      const extraTd = extraCols.map(col => {
        if (col === 'Inspector') return `<td>${r.inspectorName || '-'}</td>`;
        if (col === 'Reprocess Qty') return `<td class="${(r.reprocessQty || 0) > 0 ? 'text-warning font-semibold' : 'text-muted'}">${formatNum(r.reprocessQty || 0)}</td>`;
        if (col === 'Recheck #') return `<td>${r.iterationNo || '-'}</td>`;
        if (col === 'Vendor') {
          if (r.vendorId) {
            const v = DB.Vendors.find(r.vendorId);
            return `<td>${v ? v.name : '—'}</td>`;
          }
          return `<td>In House</td>`;
        }
        return `<td>-</td>`;
      }).join('');

      return `
        <tr>
          <td>${i + 1}</td>
          <td class="font-semibold text-blue">${batch.batchNo || '—'}</td>
          <td><span class="badge badge-teal">${batch.jmrefNo || '—'}</span></td>
          <td>${batch.partNo || '—'}</td>
          <td>${formatNum(input)}</td>
          <td class="font-semibold text-success">${formatNum(r.outputQty || 0)}</td>
          <td class="${loss > 0 ? 'text-danger font-semibold' : 'text-muted'}">${formatNum(loss)}</td>
          <td><span class="badge ${badgeClass}">${pctStr}</span></td>
          <td class="text-sm text-muted">${(r.date || '').slice(0, 10)}</td>
          ${extraTd}
        </tr>`;
    }).join('');

    const totalRowHtml = `
      <tr class="font-bold text-danger">
        <td colspan="4" style="text-align:right;">TOTAL:</td>
        <td>${formatNum(totalInput)}</td>
        <td>${formatNum(totalOutput)}</td>
        <td>${formatNum(totalLoss)}</td>
        <td>${totalPct}</td>
        <td></td>
        ${extraCols.map(col => col === 'Reprocess Qty' ? `<td class="text-warning font-bold">${formatNum(totalReprocess)}</td>` : '<td></td>').join('')}
      </tr>`;

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${htmlRows}${totalRowHtml}</tbody>
    </table></div>`;
    return { html, headers, dataRows };
  }

  // ── Render Report: Reprocessed Items ─────────────────────
  function renderReprocess(filters) {
    const { from, to, jmref, reprocessDestination } = filters;
    let recs = DB.StageRecords.all().filter(r => (r.reprocessQty || 0) > 0);
    
    if (reprocessDestination) {
      recs = recs.filter(r => r.reprocessDestination === reprocessDestination);
    }
    
    if (jmref) {
      const q = jmref.toLowerCase();
      recs = recs.filter(r => {
        const b = DB.Batches.find(r.batchId) || {};
        return (b.batchNo || '').toLowerCase().includes(q) || 
               (b.jmrefNo || '').toLowerCase().includes(q) ||
               (b.partNo || '').toLowerCase().includes(q);
      });
    }

    recs = filterByDateRange(recs, 'date', from, to);
    if (!recs.length) return emptyState('No reprocessed items found matching the selected filters.');

    // Sort chronologically (oldest to newest)
    recs.sort((a, b) => {
      const dateA = a.createdAt || a.date || '';
      const dateB = b.createdAt || b.date || '';
      return dateA.localeCompare(dateB);
    });

    const headers = ['#', 'Original Batch No', 'JMREF No', 'Part No', 'Reprocess Qty', 'Reprocess Destination', 'Processed By', 'Date'];
    const users = DB.Users.all();
    const stageLabelMap = {
      cryogenic: 'Cryogenic',
      trimming: 'Trimming',
      deflashing: 'Manual DE Flashing (Flash Removal)'
    };
    
    const dataRows = recs.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const user = users.find(u => u.id === r.recordedBy) || {};
      const destLabel = stageLabelMap[r.reprocessDestination] || r.reprocessDestination || '—';
      const dateStr = r.date ? formatDate(r.date) : '—';
      return [
        i + 1,
        batch.batchNo || '—',
        batch.jmrefNo || '—',
        batch.partNo || '—',
        r.reprocessQty || 0,
        destLabel,
        user.name || '—',
        dateStr
      ];
    });

    const totalReprocessQty = recs.reduce((s, r) => s + (r.reprocessQty || 0), 0);
    const summaryRow = ['', '', '', 'TOTAL:', totalReprocessQty, '', '', ''];
    dataRows.push(summaryRow);

    const htmlRows = recs.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const user = users.find(u => u.id === r.recordedBy) || {};
      const dest = r.reprocessDestination;
      const destLabel = stageLabelMap[dest] || dest || '—';
      let destBadge = 'badge-blue';
      if (dest === 'trimming') destBadge = 'badge-amber';
      else if (dest === 'deflashing') destBadge = 'badge-purple';

      return `
        <tr>
          <td>${i + 1}</td>
          <td class="font-semibold text-blue">${batch.batchNo || '—'}</td>
          <td><span class="badge badge-teal">${batch.jmrefNo || '—'}</span></td>
          <td>${batch.partNo || '—'}</td>
          <td class="font-bold text-warning">${formatNum(r.reprocessQty || 0)}</td>
          <td><span class="badge ${destBadge}">${destLabel}</span></td>
          <td>${user.name || '—'}</td>
          <td class="text-sm text-muted">${(r.date || '').slice(0, 10)}</td>
        </tr>`;
    }).join('');

    const totalRowHtml = `
      <tr class="font-bold text-danger">
        <td colspan="4" style="text-align:right;">TOTAL:</td>
        <td>${formatNum(totalReprocessQty)}</td>
        <td colspan="3"></td>
      </tr>`;

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${htmlRows}${totalRowHtml}</tbody>
    </table></div>`;
    
    return { html, headers, dataRows };
  }

  // ── Render Report 9: Rejected Batches ─────────────────────
  function renderRejected() {
    const rejections = DB.RejectionTracker.all();
    if (!rejections.length) return emptyState('No rejected batches found.');
    const headers = ['#','Batch No','JMREF','Part No','Stage','Qty','Reason','Rejected By','Date & Time'];
    const users = DB.Users.all();
    const dataRows = rejections.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const user = users.find(u => u.id === r.rejectedBy) || {};
      let dateTimeStr = '—';
      if (r.date) {
        try {
          const d = new Date(r.date);
          if (isNaN(d.getTime())) {
            dateTimeStr = r.date;
          } else {
            if (r.date.length > 10) {
              const datePart = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
              const timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
              dateTimeStr = `${datePart} ${timePart}`;
            } else {
              dateTimeStr = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
            }
          }
        } catch {
          dateTimeStr = r.date;
        }
      }
      return [i+1, batch.batchNo||'', batch.jmrefNo||'', batch.partNo||'', STAGE_LABELS[r.stage]||r.stage, r.qty||'', r.reason||'', user.name||'-', dateTimeStr];
    });
    const totalQty = rejections.reduce((s, r) => s + (r.qty||0), 0);
    const summaryRow = ['', '', '', 'TOTAL:', '', totalQty, '', '', ''];
    dataRows.push(summaryRow);

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map((r,i)=>`<tr class="${i===dataRows.length-1?'font-bold text-danger':''}">${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
    return { html, headers, dataRows };
  }

  // ── Render Report 10: Quality Final Recheck ───────────────
  function renderRecheck(filters) {
    const { from, to, operatorId } = filters;
    let rechecks = DB.RecheckTracker.all();
    rechecks = filterByDateRange(rechecks, 'date', from, to);

    if (!rechecks.length) return emptyState();
    const users = DB.Users.all();
    const headers = ['#','Batch No','JMREF','Sent To Stage','Qty','Loss At QF','% Loss','Recheck #','Recorded By','Date'];
    const dataRows = rechecks.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const user = users.find(u => u.id === r.recordedBy) || {};
      const totalBefore = r.qty + r.lossQty;
      const pct = totalBefore ? ((r.lossQty / totalBefore) * 100).toFixed(1) + '%' : '0.0%';
      return [i+1, batch.batchNo||'', batch.jmrefNo||'', STAGE_LABELS[r.toStage]||r.toStage, r.qty||0, r.lossQty||0, pct, r.recheckNo||1, user.name||'-', (r.date||'').slice(0,10)];
    });
    const totalQty = rechecks.reduce((s, r) => s + (r.qty||0), 0);
    const totalLoss = rechecks.reduce((s, r) => s + (r.lossQty||0), 0);
    const totalBefore = totalQty + totalLoss;
    const totalPct = totalBefore ? ((totalLoss / totalBefore) * 100).toFixed(1) + '%' : '0.0%';
    const summaryRow = ['', '', '', 'TOTAL:', totalQty, totalLoss, totalPct, '', '', ''];
    dataRows.push(summaryRow);

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map((r,i)=>`<tr class="${i===dataRows.length-1?'font-bold text-danger':''}">${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
    return { html, headers, dataRows };
  }

  // ── Render Report 11: SLOB Report ────────────────────────
  function renderSlob(filters) {
    const master = DB.Master.all();
    const sales = DB.Sales.all();
    const today = new Date();
    
    // Filter parts having available store stock > 0
    const stockParts = master.map(p => {
      const stock = DB.StoreInventory.availableByJmref(p.jmrefNo);
      return { part: p, stock };
    }).filter(item => item.stock > 0);

    if (!stockParts.length) return emptyState('No stock available in store for SLOB calculation.');

    const headers = ['#', 'JMREF No', 'Part No', 'Store Stock', 'Sale Price', 'Stock Value', 'Last Sale Date', 'Days Idle', 'SLOB Status'];
    const dataRows = stockParts.map((item, i) => {
      const p = item.part;
      const stock = item.stock;
      const partSales = sales.filter(s => s.jmrefNo === p.jmrefNo)
                            .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
      
      let lastSaleDateStr = '—';
      let daysIdle = 0;
      let referenceDate = p.createdAt ? new Date(p.createdAt) : today;

      if (partSales.length > 0) {
        lastSaleDateStr = partSales[0].saleDate;
        referenceDate = new Date(lastSaleDateStr);
      }

      const diffTime = Math.abs(today - referenceDate);
      daysIdle = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let status = 'Active';
      if (daysIdle > 180) {
        status = 'Obsolete';
      } else if (daysIdle > 30) {
        status = 'Slow-Moving';
      }

      const val = stock * (p.salePrice || 0);

      return [
        i + 1,
        p.jmrefNo,
        p.partNo,
        stock,
        p.salePrice || 0,
        val,
        lastSaleDateStr,
        daysIdle,
        status
      ];
    });

    const totalVal = dataRows.reduce((sum, r) => sum + r[5], 0);
    const totalQty = dataRows.reduce((sum, r) => sum + r[3], 0);

    const htmlRows = dataRows.map(r => {
      const status = r[8];
      const badgeCls = status === 'Active' ? 'badge-green' : status === 'Slow-Moving' ? 'badge-amber' : 'badge-red';
      return `
        <tr>
          <td>${r[0]}</td>
          <td><span class="badge badge-teal">${r[1]}</span></td>
          <td class="font-semibold text-blue">${r[2]}</td>
          <td class="font-bold">${formatNum(r[3])}</td>
          <td>${formatNum(r[4])}</td>
          <td class="font-bold">${formatNum(r[5])}</td>
          <td>${r[6]}</td>
          <td>${formatNum(r[7])} days</td>
          <td><span class="badge ${badgeCls}">${status}</span></td>
        </tr>`;
    }).join('');

    const totalRowHtml = `
      <tr class="font-bold text-danger">
        <td colspan="3" style="text-align:right;">TOTAL:</td>
        <td>${formatNum(totalQty)}</td>
        <td></td>
        <td>${formatNum(totalVal)}</td>
        <td colspan="3"></td>
      </tr>
    `;
    const finalHtmlRows = htmlRows + totalRowHtml;
    dataRows.push(['', '', 'TOTAL:', totalQty, '', totalVal, '', '', '']);

    const html = `
      <div style="display:flex; gap:16px; margin-bottom: 20px; flex-wrap:wrap;">
        <div class="stat-card green" style="flex:1; min-width: 140px;"><div class="stat-label">Total Store Stock</div><div class="stat-value green">${formatNum(totalQty)}</div></div>
        <div class="stat-card blue" style="flex:1; min-width: 140px;"><div class="stat-label">Stock Value (Sale Price)</div><div class="stat-value blue">${formatNum(totalVal)}</div></div>
        <div class="stat-card red" style="flex:1; min-width: 140px;">
          <div class="stat-label">Obsolete Stock Value</div>
          <div class="stat-value red">
            ${formatNum(dataRows.filter(r => r[8] === 'Obsolete').reduce((s, r) => s + r[5], 0))}
          </div>
        </div>
        <div class="stat-card amber" style="flex:1; min-width: 140px;">
          <div class="stat-label">Slow-Moving Stock Value</div>
          <div class="stat-value amber">
            ${formatNum(dataRows.filter(r => r[8] === 'Slow-Moving').reduce((s, r) => s + r[5], 0))}
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>JMREF No</th>
              <th>Part No</th>
              <th>Store Stock</th>
              <th>Sale Price (INR)</th>
              <th>Stock Value</th>
              <th>Last Sale Date</th>
              <th>Days Idle</th>
              <th>SLOB Status</th>
            </tr>
          </thead>
          <tbody>
            ${finalHtmlRows}
          </tbody>
        </table>
      </div>`;

    return { html, headers, dataRows };
  }

  // ── Render Report 12: Aging WIP Report (> 1 Week) ─────────
  function renderAging(filters) {
    const batches = DB.Batches.all().filter(b => b.status === 'active');
    const stageRecs = DB.StageRecords.all();
    const master = DB.Master.all();
    const today = new Date();

    const agingBatches = [];

    batches.forEach(b => {
      let entryDateStr = '';
      
      const recs = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage)
                            .sort((a, b) => (a.createdAt || a.date).localeCompare(b.createdAt || b.date));

      if (recs.length > 0) {
        entryDateStr = recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '';
      } else {
        entryDateStr = b.productionDate || b.createdAt || '';
      }

      if (!entryDateStr) return;

      const entryDate = new Date(entryDateStr.slice(0, 10));
      const diffTime = Math.abs(today - entryDate);
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (days > 7) {
        let qty = b.initialQty || 0;
        if (b.currentStage !== 'production') {
          const incoming = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage);
          if (incoming.length > 0) {
            const lastRec = incoming[incoming.length - 1];
            qty = lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
          }
        }

        agingBatches.push({
          batch: b,
          stage: b.currentStage,
          entryDate: entryDateStr.slice(0, 10),
          days,
          qty
        });
      }
    });

    const searchHtml = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom: 20px; max-width: 280px;" class="no-print">
        <div class="search-input" style="flex:1; margin:0;">
          <span class="search-icon">&#128269;</span>
          <input type="text" id="aging-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${agingSearch}" oninput="ReportsModule.filterAging(this.value)">
        </div>
        <button class="btn btn-secondary btn-sm" onclick="Scanner.start('aging-search', (val) => ReportsModule.filterAging(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
      </div>`;

    if (!agingBatches.length && !agingSearch) {
      const html = `${searchHtml}${emptyState('No active batches pending in their stage for more than a week.')}`;
      return { html, headers: [], dataRows: [] };
    }

    agingBatches.sort((a, b) => b.days - a.days);

    let filteredAging = agingBatches;
    if (agingSearch) {
      const q = agingSearch.toLowerCase();
      filteredAging = agingBatches.filter(item => 
        (item.batch.batchNo || '').toLowerCase().includes(q)
      );
    }

    const headers = ['#', 'Stage', 'Batch No', 'JMREF No', 'Part No', 'Current Qty', 'Stage Entry Date', 'Days Aging'];
    
    const dataRows = filteredAging.map((item, i) => {
      const p = master.find(m => m.jmrefNo === item.batch.jmrefNo) || {};
      return [
        i + 1,
        STAGE_LABELS[item.stage] || item.stage,
        item.batch.batchNo,
        item.batch.jmrefNo,
        p.partNo || item.batch.partNo || '—',
        item.qty,
        item.entryDate,
        `${item.days} days`
      ];
    });

    const htmlRows = filteredAging.map((item, i) => {
      const p = master.find(m => m.jmrefNo === item.batch.jmrefNo) || {};
      return `
        <tr>
          <td>${i + 1}</td>
          <td><span class="badge badge-blue">${STAGE_LABELS[item.stage] || item.stage}</span></td>
          <td class="font-semibold text-blue">${item.batch.batchNo}</td>
          <td><span class="badge badge-teal">${item.batch.jmrefNo}</span></td>
          <td class="font-semibold">${p.partNo || item.batch.partNo || '—'}</td>
          <td class="font-bold">${formatNum(item.qty)}</td>
          <td>${formatDate(item.entryDate)}</td>
          <td class="font-bold text-danger">${item.days} days</td>
        </tr>`;
    }).join('');

    const totalQty = filteredAging.reduce((s, i) => s + i.qty, 0);
    const totalRowHtml = `
      <tr class="font-bold text-danger">
        <td colspan="5" style="text-align:right;">TOTAL:</td>
        <td>${formatNum(totalQty)}</td>
        <td colspan="2"></td>
      </tr>
    `;
    const finalHtmlRows = htmlRows ? (htmlRows + totalRowHtml) : '';
    dataRows.push(['', '', '', '', 'TOTAL:', totalQty, '', '']);

    const html = `
      ${searchHtml}
      <div style="display:flex; gap:16px; margin-bottom: 20px; flex-wrap:wrap;">
        <div class="stat-card red" style="flex:1; min-width: 140px;"><div class="stat-label">Aging Batches (>7 Days)</div><div class="stat-value red">${agingBatches.length}</div></div>
        <div class="stat-card amber" style="flex:1; min-width: 140px;"><div class="stat-label">Total Aging Quantity</div><div class="stat-value amber">${formatNum(agingBatches.reduce((s,i)=>s+i.qty,0))}</div></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Current Stage</th>
              <th>Batch No</th>
              <th>JMREF No</th>
              <th>Part No</th>
              <th>Current Qty</th>
              <th>Stage Entry Date</th>
              <th>Days Aging</th>
            </tr>
          </thead>
          <tbody>
            ${finalHtmlRows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}
          </tbody>
        </table>
      </div>`;

    return { html, headers, dataRows };
  }

  function renderPendingBatches(filters) {
    const { pendingStage, pendingTimeframe } = filters;
    const batches = DB.Batches.all().filter(b => {
      if (pendingStage === 'store') {
        return b.status === 'completed' && b.currentStage === 'store';
      }
      return b.status === 'active';
    });
    const stageRecs = DB.StageRecords.all();
    const master = DB.Master.all();
    const today = new Date();
    today.setHours(0,0,0,0);

    function parseLocalDate(dateStr) {
      if (!dateStr) return new Date();
      const clean = dateStr.slice(0, 10).trim();
      const parts = clean.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else {
          return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
      }
      const d = new Date(clean);
      return isNaN(d.getTime()) ? new Date() : d;
    }

    const dataRows = [];
    const headers = ['#', 'Batch No', 'JMREF No', 'Part No', 'Current Stage', 'Current Qty', 'Date Received', 'Days Pending'];

    batches.forEach(b => {
      if (pendingStage && b.currentStage !== pendingStage) return;

      let entryDateStr = '';
      const recs = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage)
                            .sort((a, b) => (a.createdAt || a.date || '').localeCompare(b.createdAt || b.date || ''));

      if (recs.length > 0) {
        entryDateStr = recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '';
      }
      if (!entryDateStr) {
        entryDateStr = b.productionDate || b.createdAt || '';
      }

      const entryDate = parseLocalDate(entryDateStr);
      entryDate.setHours(0,0,0,0);
      const diffTime = today - entryDate;
      const days = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));

      if (pendingTimeframe) {
        if (pendingTimeframe === '1w' && days > 7) return;
        if (pendingTimeframe === '2w' && days > 14) return;
        if (pendingTimeframe === '3w' && days > 21) return;
        if (pendingTimeframe === '1m' && days > 30) return;
        if (pendingTimeframe === '2m' && days > 60) return;

        if (pendingTimeframe === '1w_plus' && days < 7) return;
        if (pendingTimeframe === '2w_plus' && days < 14) return;
        if (pendingTimeframe === '3w_plus' && days < 21) return;
        if (pendingTimeframe === '1m_plus' && days < 30) return;
        if (pendingTimeframe === '2m_plus' && days < 60) return;
      }

      let qty = b.initialQty || 0;
      if (b.currentStage !== 'production') {
        const incoming = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage);
        if (incoming.length > 0) {
          const lastRec = incoming[incoming.length - 1];
          qty = lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
        }
      }

      const p = master.find(m => m.jmrefNo === b.jmrefNo) || {};
      dataRows.push({
        batchNo: b.batchNo,
        jmrefNo: b.jmrefNo,
        partNo: p.partNo || b.partNo || '—',
        currentStage: STAGE_LABELS[b.currentStage] || b.currentStage,
        qty: qty,
        dateReceived: entryDateStr.slice(0, 10),
        daysPending: days
      });
    });

    dataRows.sort((a, b) => b.daysPending - a.daysPending);

    const rows = dataRows.map((r, i) => {
      return [
        i + 1,
        r.batchNo,
        r.jmrefNo,
        r.partNo,
        r.currentStage,
        r.qty,
        r.dateReceived,
        r.daysPending
      ];
    });

    const htmlRows = rows.map(r => {
      const days = r[7];
      let daysStyle = '';
      if (days >= 60) daysStyle = 'style="color:var(--accent-red); font-weight:bold;"';
      else if (days >= 30) daysStyle = 'style="color:var(--accent-amber); font-weight:bold;"';
      else if (days >= 14) daysStyle = 'style="color:var(--accent-blue); font-weight:semibold;"';
      else daysStyle = 'class="text-muted"';

      return `
        <tr>
          <td>${r[0]}</td>
          <td class="font-semibold text-blue">${r[1]}</td>
          <td><span class="badge badge-teal">${r[2]}</span></td>
          <td>${r[3]}</td>
          <td><span class="badge badge-blue">${r[4]}</span></td>
          <td class="font-semibold">${formatNum(r[5])}</td>
          <td>${formatDate(r[6])}</td>
          <td ${daysStyle}>${days} days</td>
        </tr>`;
    }).join('');

    const totalQty = dataRows.reduce((s, r) => s + r.qty, 0);
    const totalRowHtml = `
      <tr class="font-bold text-danger">
        <td colspan="5" style="text-align:right;">TOTAL:</td>
        <td>${formatNum(totalQty)}</td>
        <td colspan="2"></td>
      </tr>
    `;
    const finalHtmlRows = htmlRows ? (htmlRows + totalRowHtml) : '';
    rows.push(['', '', '', '', 'TOTAL:', totalQty, '', '']);

    const html = `
      <div style="display:flex; gap:16px; margin-bottom: 20px; flex-wrap:wrap;">
        <div class="stat-card blue" style="flex:1; min-width: 140px;"><div class="stat-label">Pending Batches</div><div class="stat-value blue">${dataRows.length}</div></div>
        <div class="stat-card amber" style="flex:1; min-width: 140px;"><div class="stat-label">Total Pending Quantity</div><div class="stat-value amber">${formatNum(totalQty)}</div></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Batch No</th>
              <th>JMREF No</th>
              <th>Part No</th>
              <th>Current Stage</th>
              <th>Current Qty</th>
              <th>Date Received</th>
              <th>Days Pending</th>
            </tr>
          </thead>
          <tbody>
            ${finalHtmlRows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">No pending batches found matching the filters</td></tr>'}
          </tbody>
        </table>
      </div>`;

    return { html, headers, dataRows: rows };
  }

  // ── 1. Operator & Inspector Efficiency ─────────────────────
  function renderOpEfficiency(filters) {
    const { from, to } = filters;
    const operators = DB.Operators.all();
    const inspectors = DB.Inspectors.all();
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();

    // Calculate Operator rows
    const opRows = operators.map(op => {
      const opBatches = batches.filter(b => b.operatorId === op.id);
      const inRangeBatches = filterByDateRange(opBatches, 'createdAt', from, to);
      const totalBatches = inRangeBatches.length;

      const inputQty = inRangeBatches.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const batchIds = new Set(inRangeBatches.map(b => b.id));
      const opRecords = stageRecords.filter(r => r.stage === 'production' && batchIds.has(r.batchId));
      const lossQty = opRecords.reduce((sum, r) => sum + (r.lossQty || 0), 0);
      const outputQty = Math.max(0, inputQty - lossQty);
      const yieldRate = inputQty > 0 ? (outputQty / inputQty) * 100 : 100;
      let grade = 'C';
      if (yieldRate >= 98) grade = 'A';
      else if (yieldRate >= 95) grade = 'B';

      return {
        name: op.name,
        role: 'Operator',
        totalBatches,
        inputQty,
        outputQty,
        lossQty,
        yieldRate: yieldRate.toFixed(2) + '%',
        grade
      };
    });

    // Calculate Inspector rows
    const inspRows = inspectors.map(insp => {
      const allInspRecords = stageRecords.filter(r => r.stage === 'visual' && r.inspectorName && r.inspectorName.toLowerCase() === insp.name.toLowerCase());
      const inRangeRecords = filterByDateRange(allInspRecords, 'date', from, to);
      
      const batchIds = new Set(inRangeRecords.map(r => r.batchId));
      const totalBatches = batchIds.size;
      const inputQty = inRangeRecords.reduce((sum, r) => sum + (r.inputQty || 0), 0);
      const lossQty = inRangeRecords.reduce((sum, r) => sum + (r.lossQty || 0), 0);
      const outputQty = Math.max(0, inputQty - lossQty);
      const yieldRate = inputQty > 0 ? (outputQty / inputQty) * 100 : 100;
      let grade = 'C';
      if (yieldRate >= 98) grade = 'A';
      else if (yieldRate >= 95) grade = 'B';

      return {
        name: insp.name,
        role: 'Inspector',
        totalBatches,
        inputQty,
        outputQty,
        lossQty,
        yieldRate: yieldRate.toFixed(2) + '%',
        grade
      };
    });

    const allRows = [...opRows, ...inspRows].filter(r => r.totalBatches > 0 || r.inputQty > 0);
    const headers = ['Name', 'Role', 'Total Batches', 'Input Qty', 'Output Qty', 'Loss Qty', 'Yield Rate', 'Performance Grade'];
    const dataRows = allRows.map(r => [
      r.name, r.role, String(r.totalBatches), String(r.inputQty), String(r.outputQty), String(r.lossQty), r.yieldRate, r.grade
    ]);

    const opHtmlRows = opRows.filter(r => r.totalBatches > 0 || r.inputQty > 0).map(r => `
      <tr>
        <td class="font-semibold text-blue">${r.name}</td>
        <td><span class="badge badge-blue">Operator</span></td>
        <td>${formatNum(r.totalBatches)}</td>
        <td>${formatNum(r.inputQty)}</td>
        <td>${formatNum(r.outputQty)}</td>
        <td class="text-danger font-semibold">${formatNum(r.lossQty)}</td>
        <td class="font-bold text-success">${r.yieldRate}</td>
        <td><span class="badge ${r.grade === 'A' ? 'badge-green' : r.grade === 'B' ? 'badge-blue' : 'badge-amber'}">${r.grade}</span></td>
      </tr>`).join('');

    const inspHtmlRows = inspRows.filter(r => r.totalBatches > 0 || r.inputQty > 0).map(r => `
      <tr>
        <td class="font-semibold text-blue">${r.name}</td>
        <td><span class="badge badge-purple">Inspector</span></td>
        <td>${formatNum(r.totalBatches)}</td>
        <td>${formatNum(r.inputQty)}</td>
        <td>${formatNum(r.outputQty)}</td>
        <td class="text-danger font-semibold">${formatNum(r.lossQty)}</td>
        <td class="font-bold text-success">${r.yieldRate}</td>
        <td><span class="badge ${r.grade === 'A' ? 'badge-green' : r.grade === 'B' ? 'badge-blue' : 'badge-amber'}">${r.grade}</span></td>
      </tr>`).join('');

    const html = `
      <div style="margin-bottom: 24px;">
        <h4 style="font-weight:600; font-size:15px; margin-bottom:12px; color:var(--primary);">👷 Operator Performance</h4>
        <div class="table-wrap" style="margin-bottom: 28px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Operator Name</th>
                <th>Role</th>
                <th>Batches Created</th>
                <th>Input Qty (pcs)</th>
                <th>Output Qty (pcs)</th>
                <th>Loss Qty (pcs)</th>
                <th>Yield Rate</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              ${opHtmlRows || '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--text-muted);">No operator data for range</td></tr>'}
            </tbody>
          </table>
        </div>

        <h4 style="font-weight:600; font-size:15px; margin-bottom:12px; color:var(--primary);">🔍 Inspector Performance</h4>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Inspector Name</th>
                <th>Role</th>
                <th>Batches Inspected</th>
                <th>Input Qty (pcs)</th>
                <th>Output Qty (pcs)</th>
                <th>Loss Qty (pcs)</th>
                <th>Yield Rate</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              ${inspHtmlRows || '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--text-muted);">No inspector data for range</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    return { html, headers, dataRows };
  }

  // ── 2. Mould Lifecycle & Performance ────────────────────────
  function renderMouldLifecycle(filters) {
    const { jmref } = filters;
    const moulds = DB.Moulds.all();
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();

    let filteredMoulds = jmref 
      ? moulds.filter(m => m.jmrefNo && m.jmrefNo.toLowerCase().includes(jmref.toLowerCase())) 
      : moulds;

    const headers = ['Mould ID', 'JMREF No', 'Mould Type', 'Cavities', 'Size', 'Batches Run', 'Total Curing Lifts', 'Total Produced Qty', 'Avg Yield Rate', 'Rack / Location', 'Alert Level'];
    const dataRows = filteredMoulds.map(m => {
      const matchBatches = batches.filter(b => b.jmrefNo === m.jmrefNo && parseInt(b.mouldNo, 10) === parseInt(m.mouldNo, 10));
      const totalBatches = matchBatches.length;
      const totalLifts = matchBatches.reduce((sum, b) => sum + (b.lifts || 0), 0);
      const totalProduced = matchBatches.reduce((sum, b) => sum + (b.initialQty || 0), 0);

      const batchIds = new Set(matchBatches.map(b => b.id));
      const prodRecords = stageRecords.filter(r => r.stage === 'production' && batchIds.has(r.batchId));
      const inputSum = prodRecords.reduce((sum, r) => sum + (r.inputQty || 0), 0);
      const outputSum = prodRecords.reduce((sum, r) => sum + (r.outputQty || 0), 0);
      const yieldRate = inputSum > 0 ? ((outputSum / inputSum) * 100).toFixed(2) + '%' : '100.00%';

      let alertStatus = 'Normal';
      if (totalLifts >= 10000) alertStatus = 'Service Required';
      else if (totalLifts >= 8000) alertStatus = 'Upcoming Service';

      return [
        m.id,
        m.jmrefNo || '—',
        m.mouldType || 'Yet to be assigned',
        String(m.noOfCavities || 0),
        m.mouldSize || '300*300',
        String(totalBatches),
        String(totalLifts),
        String(totalProduced),
        yieldRate,
        m.rackDetails || 'Rack A / Row 1',
        alertStatus
      ];
    });

    const htmlRows = dataRows.map(r => {
      let badgeCls = 'badge-green';
      if (r[10] === 'Service Required') badgeCls = 'badge-red';
      else if (r[10] === 'Upcoming Service') badgeCls = 'badge-amber';

      return `
        <tr>
          <td class="font-semibold text-blue">${r[0]}</td>
          <td><span class="badge badge-teal">${r[1]}</span></td>
          <td>${r[2]}</td>
          <td>${r[3]}</td>
          <td>${r[4]}</td>
          <td>${formatNum(r[5])}</td>
          <td class="font-semibold">${formatNum(r[6])}</td>
          <td>${formatNum(r[7])}</td>
          <td class="font-bold text-success">${r[8]}</td>
          <td><span class="badge badge-gray">${r[9]}</span></td>
          <td><span class="badge ${badgeCls}">${r[10]}</span></td>
        </tr>`;
    }).join('');

    const html = `
      <div class="table-wrap">
        <table class="data-table" style="min-width: 1050px;">
          <thead>
            <tr>
              <th>Mould ID</th>
              <th>JMREF No</th>
              <th>Mould Type</th>
              <th>Cavities</th>
              <th>Size</th>
              <th>Batches Run</th>
              <th>Total Lifts</th>
              <th>Total Produced</th>
              <th>Avg Yield Rate</th>
              <th>Rack Details</th>
              <th>Status Alert</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows || '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--text-muted);">No mould records found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    return { html, headers, dataRows };
  }

  // ── 3. Cycle Time & Bottleneck Analysis ─────────────────────
  function renderCycleTime(filters) {
    const { from, to } = filters;
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();
    const stages = ['production','cryogenic','deflashing','trimming','post-curing','waiting-visual','visual','gauge','quality'];

    const batchTransitions = {};
    stageRecords.forEach(r => {
      if (!batchTransitions[r.batchId]) batchTransitions[r.batchId] = [];
      batchTransitions[r.batchId].push(r);
    });

    const inRangeBatches = filterByDateRange(batches, 'createdAt', from, to);
    const stageDurations = {};
    stages.forEach(s => stageDurations[s] = []);

    inRangeBatches.forEach(b => {
      const records = (batchTransitions[b.id] || []).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
      const entryTime = new Date(b.createdAt).getTime();

      let lastTime = entryTime;
      let lastStage = 'production';

      records.forEach(r => {
        const transTime = new Date(r.createdAt).getTime();
        const durationHrs = (transTime - lastTime) / (1000 * 60 * 60);
        if (durationHrs >= 0 && stages.includes(lastStage)) {
          stageDurations[lastStage].push(durationHrs);
        }
        lastStage = r.movedTo;
        lastTime = transTime;
      });

      if (b.status === 'active' && b.currentStage && stages.includes(b.currentStage)) {
        const nowTime = new Date().getTime();
        const durationHrs = (nowTime - lastTime) / (1000 * 60 * 60);
        if (durationHrs >= 0) {
          stageDurations[b.currentStage].push(durationHrs);
        }
      }
    });

    const formatDuration = hrs => {
      if (hrs === 0) return '0 hrs';
      if (hrs < 24) return hrs.toFixed(1) + ' hrs';
      return (hrs / 24).toFixed(1) + ' days';
    };

    const headers = ['Stage Name', 'Avg Dwell Time', 'Min Dwell Time', 'Max Dwell Time', 'Total Batches Processed', 'Bottleneck Risk'];
    const dataRows = [];

    stages.forEach(stage => {
      const durs = stageDurations[stage] || [];
      const total = durs.length;
      const avg = total > 0 ? (durs.reduce((s, v) => s + v, 0) / total) : 0;
      const min = total > 0 ? Math.min(...durs) : 0;
      const max = total > 0 ? Math.max(...durs) : 0;

      let risk = 'Normal';
      if (avg > 72) risk = '🔥 High Bottleneck';
      else if (avg > 24) risk = '⚠️ Medium Bottleneck';

      dataRows.push([
        STAGE_LABELS[stage] || stage,
        formatDuration(avg),
        formatDuration(min),
        formatDuration(max),
        String(total),
        risk
      ]);
    });

    const htmlRows = dataRows.map(r => {
      let badgeCls = 'badge-green';
      if (r[5].includes('High')) badgeCls = 'badge-red';
      else if (r[5].includes('Medium')) badgeCls = 'badge-amber';

      return `
        <tr>
          <td class="font-semibold text-blue">${r[0]}</td>
          <td class="font-bold">${r[1]}</td>
          <td>${r[2]}</td>
          <td>${r[3]}</td>
          <td>${formatNum(r[4])}</td>
          <td><span class="badge ${badgeCls}">${r[5]}</span></td>
        </tr>`;
    }).join('');

    const html = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Stage Name</th>
              <th>Avg Dwell Time</th>
              <th>Min Dwell Time</th>
              <th>Max Dwell Time</th>
              <th>Total Batches Processed</th>
              <th>Bottleneck Risk</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>
      </div>
    `;

    return { html, headers, dataRows };
  }

  // ── 4. WIP Valuation Report ────────────────────────────────
  function renderWipValuation(filters) {
    const batches = DB.Batches.all().filter(b => b.status === 'active');
    const master = DB.Master.all();
    const stageRecords = DB.StageRecords.all();

    const groups = {};
    batches.forEach(b => {
      const part = master.find(p => p.jmrefNo === b.jmrefNo);
      if (!part) return;

      const stage = b.currentStage || 'production';
      const key = `${b.jmrefNo}_${stage}`;

      let qty = b.initialQty || 0;
      const incoming = stageRecords.filter(r => r.batchId === b.id && r.movedTo === stage);
      if (incoming.length) {
        qty = incoming[incoming.length - 1].outputQty || 0;
      }

      if (!groups[key]) {
        groups[key] = {
          jmrefNo: b.jmrefNo,
          partNo: part.partNo,
          description: part.description,
          stage: stage,
          stageLabel: STAGE_LABELS[stage] || stage,
          qty: 0,
          salePrice: part.salePrice || 0
        };
      }
      groups[key].qty += qty;
    });

    const rows = Object.values(groups).filter(g => g.qty > 0);
    rows.sort((a, b) => a.stage.localeCompare(b.stage) || a.partNo.localeCompare(b.partNo));

    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    const totalValuation = rows.reduce((s, r) => s + (r.qty * r.salePrice), 0);

    const headers = ['JMREF No', 'Part No', 'Description', 'Current Stage', 'WIP Qty', 'Unit Price (INR)', 'Total Valuation (INR)'];
    const dataRows = rows.map(r => [
      r.jmrefNo,
      r.partNo,
      r.description,
      r.stageLabel,
      String(r.qty),
      String(r.salePrice),
      String(r.qty * r.salePrice)
    ]);

    const htmlRows = rows.map(r => `
      <tr>
        <td><span class="badge badge-teal">${r.jmrefNo}</span></td>
        <td class="font-semibold text-blue">${r.partNo}</td>
        <td class="text-muted text-sm">${r.description}</td>
        <td><span class="badge badge-blue">${r.stageLabel}</span></td>
        <td class="font-semibold">${formatNum(r.qty)}</td>
        <td>₹${formatNum(r.salePrice)}</td>
        <td class="font-bold text-success">₹${formatNum(r.qty * r.salePrice)}</td>
      </tr>`).join('');

    const html = `
      <div style="display:flex; gap:16px; margin-bottom: 24px; flex-wrap:wrap;">
        <div class="stat-card blue" style="flex:1; min-width: 160px;"><div class="stat-label">Total WIP Qty</div><div class="stat-value blue">${formatNum(totalQty)} pcs</div></div>
        <div class="stat-card green" style="flex:1; min-width: 160px;"><div class="stat-label">Total WIP Valuation</div><div class="stat-value green">₹${formatNum(totalValuation)}</div></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>JMREF No</th>
              <th>Part No</th>
              <th>Description</th>
              <th>Current Stage</th>
              <th>WIP Qty</th>
              <th>Unit Price</th>
              <th>Total Valuation</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No active WIP inventory found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    return { html, headers, dataRows };
  }

  // ── 5. Subcontractor vs In-House Yield ──────────────────────
  function renderSubVsInhouse(filters) {
    const { from, to } = filters;
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();

    const inRangeBatches = filterByDateRange(batches, 'createdAt', from, to);

    const inhouseBatches = inRangeBatches.filter(b => b.productionType === 'inhouse' || !b.productionType);
    const subBatches = inRangeBatches.filter(b => b.productionType === 'subcontractor');

    const computeMetrics = (batchList, label) => {
      const total = batchList.length;
      const inputQty = batchList.reduce((sum, b) => sum + (b.initialQty || 0), 0);

      const batchIds = new Set(batchList.map(b => b.id));
      const records = stageRecords.filter(r => batchIds.has(r.batchId));

      const lossQty = records.reduce((sum, r) => sum + (r.lossQty || 0), 0);
      const outputQty = Math.max(0, inputQty - lossQty);
      const yieldRate = inputQty > 0 ? ((outputQty / inputQty) * 100) : 100;

      let totalTimeHrs = 0;
      batchList.forEach(b => {
        const start = new Date(b.createdAt).getTime();
        const end = b.status === 'completed' && b.completedAt 
          ? new Date(b.completedAt).getTime() 
          : new Date().getTime();
        totalTimeHrs += (end - start) / (1000 * 60 * 60);
      });
      const avgLeadTimeDays = total > 0 ? (totalTimeHrs / total / 24) : 0;

      return {
        label,
        total,
        inputQty,
        outputQty,
        lossQty,
        yieldRate: yieldRate.toFixed(2) + '%',
        avgLeadTime: avgLeadTimeDays.toFixed(1) + ' days'
      };
    };

    const inhouseMetrics = computeMetrics(inhouseBatches, 'In-House');
    const subMetrics = computeMetrics(subBatches, 'Subcontractor');

    const headers = ['Manufacturing Mode', 'Total Batches', 'Total Input Qty', 'Total Output Qty', 'Total Loss Qty', 'Yield Rate', 'Avg Lead Time'];
    const dataRows = [
      [inhouseMetrics.label, String(inhouseMetrics.total), String(inhouseMetrics.inputQty), String(inhouseMetrics.outputQty), String(inhouseMetrics.lossQty), inhouseMetrics.yieldRate, inhouseMetrics.avgLeadTime],
      [subMetrics.label, String(subMetrics.total), String(subMetrics.inputQty), String(subMetrics.outputQty), String(subMetrics.lossQty), subMetrics.yieldRate, subMetrics.avgLeadTime]
    ];

    const html = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Manufacturing Mode</th>
              <th>Total Batches</th>
              <th>Total Input Qty (pcs)</th>
              <th>Total Output Qty (pcs)</th>
              <th>Total Loss Qty (pcs)</th>
              <th>Avg Yield Rate</th>
              <th>Avg Lead Time (Days)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-semibold text-blue">🏢 In-House</td>
              <td>${formatNum(inhouseMetrics.total)}</td>
              <td>${formatNum(inhouseMetrics.inputQty)}</td>
              <td>${formatNum(inhouseMetrics.outputQty)}</td>
              <td class="text-danger font-semibold">${formatNum(inhouseMetrics.lossQty)}</td>
              <td class="font-bold text-success">${inhouseMetrics.yieldRate}</td>
              <td class="font-semibold text-blue">${inhouseMetrics.avgLeadTime}</td>
            </tr>
            <tr>
              <td class="font-semibold text-amber">🏢 Subcontractor</td>
              <td>${formatNum(subMetrics.total)}</td>
              <td>${formatNum(subMetrics.inputQty)}</td>
              <td>${formatNum(subMetrics.outputQty)}</td>
              <td class="text-danger font-semibold">${formatNum(subMetrics.lossQty)}</td>
              <td class="font-bold text-success">${subMetrics.yieldRate}</td>
              <td class="font-semibold text-blue">${subMetrics.avgLeadTime}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    return { html, headers, dataRows };
  }

  function renderSubPending(filters) {
    const { from, to, jmref, subcontractorId } = filters;
    const batches = DB.Batches.all().filter(b => b.productionType === 'subcontractor' && b.status === 'active' && b.currentStage !== 'store');
    const stageRecs = DB.StageRecords.all();
    const master = DB.Master.all();
    const subcontractors = DB.Subcontractors.all();
    const today = new Date();
    today.setHours(0,0,0,0);

    function parseLocalDate(dateStr) {
      if (!dateStr) return new Date();
      const clean = dateStr.slice(0, 10).trim();
      const parts = clean.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else {
          return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
      }
      const d = new Date(clean);
      return isNaN(d.getTime()) ? new Date() : d;
    }

    const dataRows = [];
    const headers = ['#', 'Batch No', 'JMREF No', 'Part No', 'Description', 'Subcontractor', 'Current Stage', 'Current Qty', 'Date Created', 'Days Pending'];

    batches.forEach(b => {
      // Subcontractor Filter
      if (subcontractorId && b.subcontractorId !== subcontractorId) return;

      // Part / JMREF Filter
      if (jmref) {
        const q = jmref.toLowerCase();
        const p = master.find(m => m.jmrefNo === b.jmrefNo) || {};
        const matchJm = (b.jmrefNo || '').toLowerCase().includes(q);
        const matchPart = (p.partNo || b.partNo || '').toLowerCase().includes(q);
        const matchBatch = (b.batchNo || '').toLowerCase().includes(q);
        if (!matchJm && !matchPart && !matchBatch) return;
      }

      // Date Range Filter (based on batch createdAt)
      const cDate = (b.createdAt || '').slice(0, 10);
      if (from && cDate < from) return;
      if (to && cDate > to) return;

      // Find subcontractor name
      const sub = subcontractors.find(s => s.id === b.subcontractorId) || {};
      const subName = sub.name || 'Unknown / Not Assigned';

      // Find current quantity
      let qty = b.initialQty || 0;
      if (b.currentStage !== 'production') {
        const incoming = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage);
        if (incoming.length > 0) {
          const lastRec = incoming[incoming.length - 1];
          qty = lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
        }
      }

      // Find date received / entered in current stage
      let entryDateStr = '';
      const recs = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage)
                            .sort((a, b) => (a.createdAt || a.date || '').localeCompare(b.createdAt || b.date || ''));
      if (recs.length > 0) {
        entryDateStr = recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '';
      }
      if (!entryDateStr) {
        entryDateStr = b.productionDate || b.createdAt || '';
      }

      const entryDate = parseLocalDate(entryDateStr);
      entryDate.setHours(0,0,0,0);
      const diffTime = today - entryDate;
      const days = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));

      const p = master.find(m => m.jmrefNo === b.jmrefNo) || {};
      dataRows.push({
        batchNo: b.batchNo,
        jmrefNo: b.jmrefNo,
        partNo: p.partNo || b.partNo || '—',
        description: p.description || b.description || '—',
        subcontractor: subName,
        currentStage: STAGE_LABELS[b.currentStage] || b.currentStage,
        qty: qty,
        dateCreated: (b.createdAt || '').slice(0, 10),
        daysPending: days
      });
    });

    dataRows.sort((a, b) => b.daysPending - a.daysPending);

    const rows = dataRows.map((r, i) => {
      return [
        i + 1,
        r.batchNo,
        r.jmrefNo,
        r.partNo,
        r.description,
        r.subcontractor,
        r.currentStage,
        r.qty,
        r.dateCreated,
        r.daysPending
      ];
    });

    const htmlRows = rows.map(r => {
      const days = r[9];
      let daysStyle = '';
      if (days >= 60) daysStyle = 'style="color:var(--accent-red); font-weight:bold;"';
      else if (days >= 30) daysStyle = 'style="color:var(--accent-amber); font-weight:bold;"';
      else if (days >= 14) daysStyle = 'style="color:var(--accent-blue); font-weight:semibold;"';
      else daysStyle = 'class="text-muted"';

      return `
        <tr>
          <td>${r[0]}</td>
          <td class="font-semibold text-blue">${r[1]}</td>
          <td><span class="badge badge-teal">${r[2]}</span></td>
          <td>${r[3]}</td>
          <td class="text-muted text-sm">${r[4]}</td>
          <td><span class="badge badge-amber">${r[5]}</span></td>
          <td><span class="badge badge-blue">${r[6]}</span></td>
          <td class="font-semibold">${formatNum(r[7])}</td>
          <td>${formatDate(r[8])}</td>
          <td ${daysStyle}>${days} days</td>
        </tr>`;
    }).join('');

    const totalQty = dataRows.reduce((s, r) => s + r.qty, 0);
    const totalRowHtml = `
      <tr class="font-bold text-danger">
        <td colspan="7" style="text-align:right;">TOTAL:</td>
        <td>${formatNum(totalQty)}</td>
        <td colspan="2"></td>
      </tr>
    `;
    const finalHtmlRows = htmlRows ? (htmlRows + totalRowHtml) : '';
    rows.push(['', '', '', '', '', '', 'TOTAL:', totalQty, '', '']);

    const html = `
      <div style="display:flex; gap:16px; margin-bottom: 20px; flex-wrap:wrap;">
        <div class="stat-card blue" style="flex:1; min-width: 140px;"><div class="stat-label">Pending Batches</div><div class="stat-value blue">${dataRows.length}</div></div>
        <div class="stat-card amber" style="flex:1; min-width: 140px;"><div class="stat-label">Total Pending Quantity</div><div class="stat-value amber">${formatNum(totalQty)}</div></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Batch No</th>
              <th>JMREF No</th>
              <th>Part No</th>
              <th>Description</th>
              <th>Subcontractor</th>
              <th>Current Stage</th>
              <th>Current Qty</th>
              <th>Date Created</th>
              <th>Days Pending</th>
            </tr>
          </thead>
          <tbody>
            ${finalHtmlRows || '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);">No pending subcontractor batches found matching the filters</td></tr>'}
          </tbody>
        </table>
      </div>`;

    return { html, headers, dataRows: rows };
  }

  function renderSubPerformance(filters) {
    const { from, to } = filters;
    const batches = DB.Batches.all();
    const stageRecs = DB.StageRecords.all();
    const subcontractors = DB.Subcontractors.all();
    const vendors = DB.Vendors.all();

    // 1. Subcontractor Production Metrics
    const subData = subcontractors.map(sub => {
      // Find batches where productionType is subcontractor and subcontractorId matches
      let subBatches = batches.filter(b => b.productionType === 'subcontractor' && b.subcontractorId === sub.id);
      
      // Filter by date range if specified (based on b.createdAt)
      subBatches = filterByDateRange(subBatches, 'createdAt', from, to);

      const totalBatches = subBatches.length;
      const totalInput = subBatches.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      
      const batchIds = new Set(subBatches.map(b => b.id));
      const subStageRecs = stageRecs.filter(r => batchIds.has(r.batchId));
      const totalLoss = subStageRecs.reduce((sum, r) => sum + (r.lossQty || 0), 0);
      const totalOutput = Math.max(0, totalInput - totalLoss);
      const yieldRate = totalInput > 0 ? ((totalOutput / totalInput) * 100) : 100;

      // Avg Lead Time for completed batches
      let totalTimeHrs = 0;
      let completedCount = 0;
      subBatches.forEach(b => {
        if (b.status === 'completed' && b.completedAt) {
          const start = new Date(b.createdAt).getTime();
          const end = new Date(b.completedAt).getTime();
          totalTimeHrs += (end - start) / (1000 * 60 * 60);
          completedCount++;
        }
      });
      const avgLeadTime = completedCount > 0 ? (totalTimeHrs / completedCount / 24).toFixed(1) + ' days' : '—';

      // Active WIP
      const activeWipBatches = batches.filter(b => b.productionType === 'subcontractor' && b.subcontractorId === sub.id && b.status === 'active' && b.currentStage !== 'store');
      const activeWipQty = activeWipBatches.reduce((sum, b) => {
        let qty = b.initialQty || 0;
        if (b.currentStage !== 'production') {
          const incoming = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage);
          if (incoming.length > 0) {
            const lastRec = incoming[incoming.length - 1];
            qty = lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
          }
        }
        return sum + qty;
      }, 0);

      return {
        name: sub.name,
        totalBatches,
        totalInput,
        totalOutput,
        totalLoss,
        yieldRate: yieldRate.toFixed(2) + '%',
        avgLeadTime,
        activeWipCount: activeWipBatches.length,
        activeWipQty
      };
    });

    // 2. Process Vendor Metrics (Deflashing & Trimming)
    const vendorData = vendors.map(vendor => {
      // Find stage records processed by this vendor
      let vStageRecs = stageRecs.filter(r => r.vendorId === vendor.id && (r.stage === 'deflashing' || r.stage === 'trimming'));
      
      // Filter by date range if specified (based on r.date or r.createdAt)
      vStageRecs = filterByDateRange(vStageRecs, 'date', from, to);

      const batchIds = [...new Set(vStageRecs.map(r => r.batchId))];
      const totalBatches = batchIds.length;

      const totalInput = vStageRecs.reduce((sum, r) => sum + (r.inputQty || 0), 0);
      const totalLoss = vStageRecs.reduce((sum, r) => sum + (r.lossQty || 0), 0);
      const totalOutput = Math.max(0, totalInput - totalLoss);
      const yieldRate = totalInput > 0 ? ((totalOutput / totalInput) * 100) : 100;

      // Avg Dwell Time inside the stage for this vendor
      let totalTimeHrs = 0;
      let transitionCount = 0;
      
      vStageRecs.forEach(r => {
        // Find when the batch entered this stage
        const b = batches.find(bt => bt.id === r.batchId) || {};
        const prevRecs = stageRecs.filter(pr => pr.batchId === r.batchId && pr.createdAt.localeCompare(r.createdAt) < 0)
                                 .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        const entryTimeStr = prevRecs.length > 0 ? (prevRecs[0].createdAt || prevRecs[0].date) : b.createdAt;
        if (entryTimeStr) {
          const start = new Date(entryTimeStr).getTime();
          const end = new Date(r.createdAt || r.date).getTime();
          const hrs = (end - start) / (1000 * 60 * 60);
          if (hrs >= 0) {
            totalTimeHrs += hrs;
            transitionCount++;
          }
        }
      });
      const avgDwellTime = transitionCount > 0 ? (totalTimeHrs / transitionCount / 24).toFixed(1) + ' days' : '—';

      // Active WIP currently assigned to this vendor
      const activeWipBatches = batches.filter(b => b.status === 'active' && b.vendorId === vendor.id && b.currentStage !== 'store');
      const activeWipQty = activeWipBatches.reduce((sum, b) => {
        let qty = b.initialQty || 0;
        if (b.currentStage !== 'production') {
          const incoming = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage);
          if (incoming.length > 0) {
            const lastRec = incoming[incoming.length - 1];
            qty = lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty;
          }
        }
        return sum + qty;
      }, 0);

      const deptLabels = (vendor.departments || []).map(d => STAGE_LABELS[d] || d).join(', ');

      return {
        name: vendor.name,
        departments: deptLabels || '—',
        totalBatches,
        totalInput,
        totalOutput,
        totalLoss,
        yieldRate: yieldRate.toFixed(2) + '%',
        avgDwellTime,
        activeWipCount: activeWipBatches.length,
        activeWipQty
      };
    });

    // Sort by yield rate descending or active WIP
    subData.sort((a,b) => b.totalBatches - a.totalBatches);
    vendorData.sort((a,b) => b.totalBatches - a.totalBatches);

    // Build Tables HTML representation
    const subRowsHtml = subData.map(r => `
      <tr>
        <td class="font-semibold text-blue">🏢 ${r.name}</td>
        <td>${formatNum(r.totalBatches)}</td>
        <td>${formatNum(r.totalInput)}</td>
        <td>${formatNum(r.totalOutput)}</td>
        <td class="text-danger font-semibold">${formatNum(r.totalLoss)}</td>
        <td class="font-bold text-success">${r.yieldRate}</td>
        <td>${r.avgLeadTime}</td>
        <td class="font-semibold text-amber">${formatNum(r.activeWipCount)} batches (${formatNum(r.activeWipQty)} pcs)</td>
      </tr>
    `).join('');

    const vendorRowsHtml = vendorData.map(r => `
      <tr>
        <td class="font-semibold text-blue">🔧 ${r.name}</td>
        <td class="text-xs text-muted">${r.departments}</td>
        <td>${formatNum(r.totalBatches)}</td>
        <td>${formatNum(r.totalInput)}</td>
        <td>${formatNum(r.totalOutput)}</td>
        <td class="text-danger font-semibold">${formatNum(r.totalLoss)}</td>
        <td class="font-bold text-success">${r.yieldRate}</td>
        <td>${r.avgDwellTime}</td>
        <td class="font-semibold text-amber">${formatNum(r.activeWipCount)} batches (${formatNum(r.activeWipQty)} pcs)</td>
      </tr>
    `).join('');

    const html = `
      <h4 class="font-bold mb-3" style="font-size: 15px; border-bottom: 2px solid var(--border); padding-bottom: 6px; margin-top: 12px;">🏢 Section 1: Subcontractor Production (Batch Creators)</h4>
      <div class="table-wrap mb-6">
        <table class="data-table">
          <thead>
            <tr>
              <th>Subcontractor</th>
              <th>Total Batches</th>
              <th>Total Input (pcs)</th>
              <th>Total Output (pcs)</th>
              <th>Total Loss (pcs)</th>
              <th>Avg Yield Rate</th>
              <th>Avg Lead Time</th>
              <th>Active WIP Load</th>
            </tr>
          </thead>
          <tbody>
            ${subRowsHtml || '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--text-muted);">No subcontractor production records found</td></tr>'}
          </tbody>
        </table>
      </div>

      <h4 class="font-bold mb-3" style="font-size: 15px; border-bottom: 2px solid var(--border); padding-bottom: 6px; margin-top: 24px;">🔧 Section 2: Process Stage Vendors (Deflashing & Trimming)</h4>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Vendor Name</th>
              <th>Departments</th>
              <th>Total Batches</th>
              <th>Total Input (pcs)</th>
              <th>Total Output (pcs)</th>
              <th>Total Loss (pcs)</th>
              <th>Avg Yield Rate</th>
              <th>Avg Dwell Time</th>
              <th>Active WIP Load</th>
            </tr>
          </thead>
          <tbody>
            ${vendorRowsHtml || '<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--text-muted);">No process stage vendor records found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    // Define export data
    const headers = ['Name', 'Type', 'Total Batches', 'Total Input Qty', 'Total Output Qty', 'Total Loss Qty', 'Yield Rate', 'Avg Time', 'Active WIP Batches', 'Active WIP Qty'];
    const dataRows = [];
    
    subData.forEach(r => {
      dataRows.push([
        r.name,
        'Subcontractor Production',
        String(r.totalBatches),
        String(r.totalInput),
        String(r.totalOutput),
        String(r.totalLoss),
        r.yieldRate,
        r.avgLeadTime,
        String(r.activeWipCount),
        String(r.activeWipQty)
      ]);
    });

    vendorData.forEach(r => {
      dataRows.push([
        r.name,
        'Process Vendor (' + r.departments + ')',
        String(r.totalBatches),
        String(r.totalInput),
        String(r.totalOutput),
        String(r.totalLoss),
        r.yieldRate,
        r.avgDwellTime,
        String(r.activeWipCount),
        String(r.activeWipQty)
      ]);
    });

    return { html, headers, dataRows };
  }

  // ── Build Filter UI ────────────────────────────────────────
  function buildFilters(report) {
    const masterList = DB.Master.all();
    const operators  = DB.Operators.all();
    const subcontractors = DB.Subcontractors.all();
    const jmrefOpts  = masterList.map(m => `<option value="${m.jmrefNo}">${m.jmrefNo} — ${m.partNo}</option>`).join('');
    const opOpts     = operators.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    const subOpts    = subcontractors.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    const trimmingVendors = DB.Vendors.byDept ? DB.Vendors.byDept('trimming') : DB.Vendors.all().filter(v => v.department === 'trimming');
    const vendorOpts = trimmingVendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');

    const dateRange = `
      <div class="form-group mb-0">
        <label class="form-label">From Date</label>
        <input type="date" class="form-control" id="rpt-from">
      </div>
      <div class="form-group mb-0">
        <label class="form-label">To Date</label>
        <input type="date" class="form-control" id="rpt-to">
      </div>`;
    const jmrefFilter = `
      <div class="form-group mb-0">
        <label class="form-label">JMREF / Part No</label>
        <input type="text" class="form-control" id="rpt-jmref" placeholder="Filter by JMREF or Part No">
      </div>`;
    const partNoFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Part No</label>
        <input type="text" class="form-control" id="rpt-partno" placeholder="Filter by Part No">
      </div>`;
    const opFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Operator</label>
        <select class="form-control" id="rpt-operator">
          <option value="">All Operators</option>${opOpts}
        </select>
      </div>`;
    const prodTypeFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Production Type</label>
        <select class="form-control" id="rpt-prod-type">
          <option value="">All Types</option>
          <option value="inhouse">In House</option>
          <option value="subcontractor">Subcontractor</option>
        </select>
      </div>`;
    const subcontractorFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Subcontractor</label>
        <select class="form-control" id="rpt-subcontractor">
          <option value="">All Subcontractors</option>${subOpts}
        </select>
      </div>`;
    const vendorFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Vendor</label>
        <select class="form-control" id="rpt-vendor">
          <option value="">All Vendors</option>${vendorOpts}
        </select>
      </div>`;

    const pendingStageFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Stage</label>
        <select class="form-control" id="rpt-pending-stage">
          <option value="">All Stages</option>
          <option value="production">Production</option>
          <option value="cryogenic">Cryogenic</option>
          <option value="deflashing">Manual DE Flashing</option>
          <option value="waiting-trimming">Waiting for Trimming</option>
          <option value="trimming">Trimming</option>
          <option value="post-curing">Post Curing</option>
          <option value="waiting-visual">Waiting for Visual</option>
          <option value="visual">Visual</option>
          <option value="gauge">Gauge</option>
          <option value="quality">Quality Final</option>
          <option value="store">Store</option>
        </select>
      </div>`;

    const pendingTimeframeFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Timeframe (from Date Received)</label>
        <select class="form-control" id="rpt-pending-timeframe">
          <option value="">All Pending</option>
          <option value="1w">Pending from last 1 week (<= 7 days)</option>
          <option value="2w">Pending from last 2 weeks (<= 14 days)</option>
          <option value="3w">Pending from last 3 weeks (<= 21 days)</option>
          <option value="1m">Pending from last 1 month (<= 30 days)</option>
          <option value="2m">Pending from last 2 months (<= 60 days)</option>
          <option value="1w_plus">Pending for 1 week or more (>= 7 days)</option>
          <option value="2w_plus">Pending for 2 weeks or more (>= 14 days)</option>
          <option value="3w_plus">Pending for 3 weeks or more (>= 21 days)</option>
          <option value="1m_plus">Pending for 1 month or more (>= 30 days)</option>
          <option value="2m_plus">Pending for 2 months or more (>= 60 days)</option>
        </select>
      </div>`;

    const rejectionRateFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Rejection / Loss %</label>
        <select class="form-control" id="rpt-rejection-rate">
          <option value="">All Rejection Rates</option>
          <option value="zero">0% Rejection (No Rejection / Loss)</option>
          <option value="10">Above 10% Rejection (&ge; 10%)</option>
          <option value="20">Above 20% Rejection (&ge; 20%)</option>
          <option value="30">Above 30% Rejection (&ge; 30%)</option>
          <option value="50">Above 50% Rejection (&ge; 50%)</option>
        </select>
      </div>`;

    const reprocessDestFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Reprocess Destination</label>
        <select class="form-control" id="rpt-reprocess-dest">
          <option value="">All Destinations</option>
          <option value="cryogenic">Cryogenic</option>
          <option value="trimming">Trimming</option>
          <option value="deflashing">Manual DE Flashing (Flash Removal)</option>
        </select>
      </div>`;

    const filterMap = {
      reprocess: [jmrefFilter, reprocessDestFilter, dateRange].join(''),
      inventory: jmrefFilter,
      'store-stock': jmrefFilter,
      sales:     [jmrefFilter, dateRange].join(''),
      production:[jmrefFilter, opFilter, prodTypeFilter, dateRange].join(''),
      cryogenic: [jmrefFilter, dateRange].join(''),
      deflashing:[jmrefFilter, dateRange].join(''),
      trimming:  [jmrefFilter, vendorFilter, dateRange].join(''),
      'post-curing':[jmrefFilter, dateRange].join(''),
      'waiting-visual':[jmrefFilter, dateRange].join(''),
      visual:    [jmrefFilter, rejectionRateFilter, dateRange].join(''),
      gauge:     [jmrefFilter, dateRange].join(''),
      rejected:  '',
      recheck:   [opFilter, dateRange].join(''),
      'pending-batches': [pendingStageFilter, pendingTimeframeFilter].join(''),
      'sub-pending': [subcontractorFilter, jmrefFilter, dateRange].join(''),
      'sub-performance': dateRange,
      'qty-gain': [jmrefFilter, dateRange].join(''),
      'qty-loss': [jmrefFilter, dateRange].join(''),
      'op-efficiency': dateRange,
      'mould-lifecycle': jmrefFilter,
      'cycle-time': dateRange,
      'wip-valuation': '',
      'sub-vs-inhouse': dateRange,
      'store-aging': jmrefFilter,
      'daily-summary': dateRange,
      'analytics': dateRange,
    };
    return filterMap[report] || '';
  }

  function renderQtyGainReport(filters) {
    const { from, to, jmref } = filters;
    let recs = DB.StageRecords.all().filter(r => r.outputQty > r.inputQty);

    recs = filterByDateRange(recs, 'date', from, to);

    if (jmref) {
      const q = jmref.toLowerCase();
      recs = recs.filter(r => {
        const b = DB.Batches.find(r.batchId) || {};
        return (b.batchNo || '').toLowerCase().includes(q) ||
               (b.jmrefNo || '').toLowerCase().includes(q) ||
               (b.partNo || '').toLowerCase().includes(q);
      });
    }

    if (!recs.length) return emptyState('No quantity gain transactions found matching the selected filters.');

    const headers = ['Batch No', 'Part No', 'JMREF No', 'Stage Name', 'Input Qty', 'Output Qty', 'Qty Gained', 'Date', 'Recorded By'];
    const users = DB.Users.all();

    // Map to normalized transactions objects
    const transactions = recs.map(r => {
      const b = DB.Batches.find(r.batchId) || {};
      const u = users.find(usr => usr.id === r.recordedBy);
      const gain = r.outputQty - r.inputQty;
      return {
        batchNo: b.batchNo || '—',
        partNo: b.partNo || '—',
        jmrefNo: b.jmrefNo || '—',
        stage: r.stage || '—',
        stageLabel: STAGE_LABELS[r.stage] || r.stage || '—',
        inputQty: r.inputQty,
        outputQty: r.outputQty,
        gain: gain,
        date: (r.date || '').slice(0, 10),
        recordedBy: u ? u.name : '—'
      };
    });

    // Group transactions by batch number
    const groups = {};
    transactions.forEach(t => {
      if (!groups[t.batchNo]) {
        groups[t.batchNo] = {
          batchNo: t.batchNo,
          partNo: t.partNo,
          jmrefNo: t.jmrefNo,
          totalGain: 0,
          entries: []
        };
      }
      groups[t.batchNo].totalGain += t.gain;
      groups[t.batchNo].entries.push(t);
    });

    const groupList = Object.values(groups);

    // Build grouped rows HTML representation
    const rowsHtml = groupList.map(g => {
      const groupHeader = `
        <tr style="background: rgba(37, 99, 235, 0.05); font-weight: bold; border-left: 4px solid var(--accent-blue);">
          <td colspan="4" class="font-bold text-blue" style="padding: 12px 14px; font-size: 13px;">
            📦 Batch: ${g.batchNo} 
            <span class="badge badge-gray" style="margin-left: 8px;">Part: ${g.partNo}</span>
            <span class="badge badge-teal" style="margin-left: 8px;">JMREF: ${g.jmrefNo}</span>
          </td>
          <td colspan="5" class="font-bold text-success" style="padding: 12px 14px; font-size: 13px; text-align: right;">
            Total Gained: +${formatNum(g.totalGain)}
          </td>
        </tr>`;

      const entriesHtml = g.entries.map(e => `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding-left: 20px; color: var(--text-muted); font-size: 12px; font-style: italic;">↳ ${e.batchNo}</td>
          <td><span class="stage-chip ${e.stage.toLowerCase().replace(/\s+/g, '')}">${e.stageLabel}</span></td>
          <td>${formatNum(e.inputQty)}</td>
          <td>${formatNum(e.outputQty)}</td>
          <td class="font-bold text-success">+${formatNum(e.gain)}</td>
          <td class="text-muted text-sm">${e.date}</td>
          <td class="text-sm" colspan="3">${e.recordedBy}</td>
        </tr>
      `).join('');

      return groupHeader + entriesHtml;
    }).join('');

    const html = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Batch No</th>
              <th>Stage Name</th>
              <th>Input Qty</th>
              <th>Output Qty</th>
              <th>Qty Gained</th>
              <th>Date</th>
              <th colspan="3">Recorded By</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>`;

    const dataRows = transactions.map(t => [
      t.batchNo,
      t.partNo,
      t.jmrefNo,
      t.stageLabel,
      String(t.inputQty),
      String(t.outputQty),
      String(t.gain),
      t.date,
      t.recordedBy
    ]);

    return { html, headers, dataRows };
  }

  function renderQtyLossReport(filters) {
    const { from, to, jmref } = filters;
    let recs = DB.StageRecords.all().filter(r => r.lossQty > 0);

    recs = filterByDateRange(recs, 'date', from, to);

    if (jmref) {
      const q = jmref.toLowerCase();
      recs = recs.filter(r => {
        const b = DB.Batches.find(r.batchId) || {};
        return (b.batchNo || '').toLowerCase().includes(q) ||
               (b.jmrefNo || '').toLowerCase().includes(q) ||
               (b.partNo || '').toLowerCase().includes(q);
      });
    }

    if (!recs.length) return emptyState('No quantity loss transactions found matching the selected filters.');

    const headers = ['Batch No', 'Part No', 'JMREF No', 'Stage Name', 'Input Qty', 'Output Qty', 'Qty Lost', 'Date', 'Recorded By'];
    const users = DB.Users.all();

    // Map to normalized transactions objects
    const transactions = recs.map(r => {
      const b = DB.Batches.find(r.batchId) || {};
      const u = users.find(usr => usr.id === r.recordedBy);
      return {
        batchNo: b.batchNo || '—',
        partNo: b.partNo || '—',
        jmrefNo: b.jmrefNo || '—',
        stage: r.stage || '—',
        stageLabel: STAGE_LABELS[r.stage] || r.stage || '—',
        inputQty: r.inputQty,
        outputQty: r.isRecheck ? r.recheckQty : r.outputQty,
        loss: r.lossQty,
        date: (r.date || '').slice(0, 10),
        recordedBy: u ? u.name : '—'
      };
    });

    // Group transactions by batch number
    const groups = {};
    transactions.forEach(t => {
      if (!groups[t.batchNo]) {
        groups[t.batchNo] = {
          batchNo: t.batchNo,
          partNo: t.partNo,
          jmrefNo: t.jmrefNo,
          totalLoss: 0,
          entries: []
        };
      }
      groups[t.batchNo].totalLoss += t.loss;
      groups[t.batchNo].entries.push(t);
    });

    const groupList = Object.values(groups);

    // Build grouped rows HTML representation
    const rowsHtml = groupList.map(g => {
      const groupHeader = `
        <tr style="background: rgba(255, 71, 87, 0.04); font-weight: bold; border-left: 4px solid var(--accent-red);">
          <td colspan="4" class="font-bold text-blue" style="padding: 12px 14px; font-size: 13px;">
            📦 Batch: ${g.batchNo} 
            <span class="badge badge-gray" style="margin-left: 8px;">Part: ${g.partNo}</span>
            <span class="badge badge-teal" style="margin-left: 8px;">JMREF: ${g.jmrefNo}</span>
          </td>
          <td colspan="5" class="font-bold text-danger" style="padding: 12px 14px; font-size: 13px; text-align: right;">
            Total Lost: -${formatNum(g.totalLoss)}
          </td>
        </tr>`;

      const entriesHtml = g.entries.map(e => `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding-left: 20px; color: var(--text-muted); font-size: 12px; font-style: italic;">↳ ${e.batchNo}</td>
          <td><span class="stage-chip ${e.stage.toLowerCase().replace(/\s+/g, '')}">${e.stageLabel}</span></td>
          <td>${formatNum(e.inputQty)}</td>
          <td>${formatNum(e.outputQty)}</td>
          <td class="font-bold text-danger">-${formatNum(e.loss)}</td>
          <td class="text-muted text-sm">${e.date}</td>
          <td class="text-sm" colspan="3">${e.recordedBy}</td>
        </tr>
      `).join('');

      return groupHeader + entriesHtml;
    }).join('');

    const html = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Batch No</th>
              <th>Stage Name</th>
              <th>Input Qty</th>
              <th>Output Qty</th>
              <th>Qty Lost</th>
              <th>Date</th>
              <th colspan="3">Recorded By</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>`;

    const dataRows = transactions.map(t => [
      t.batchNo,
      t.partNo,
      t.jmrefNo,
      t.stageLabel,
      String(t.inputQty),
      String(t.outputQty),
      String(t.loss),
      t.date,
      t.recordedBy
    ]);

    return { html, headers, dataRows };
  }

  // ── Collect Filters ────────────────────────────────────────
  function collectFilters() {
    const g = id => (document.getElementById(id) || {}).value || '';
    return {
      from: g('rpt-from'), to: g('rpt-to'),
      jmref: g('rpt-jmref') || g('rpt-partno'),
      partNo: g('rpt-partno'),
      operatorId: g('rpt-operator'),
      rejectionRate: g('rpt-rejection-rate'),
      reprocessDestination: g('rpt-reprocess-dest'),
      pendingStage: g('rpt-pending-stage'),
      pendingTimeframe: g('rpt-pending-timeframe'),
      prodType: g('rpt-prod-type'),
      subcontractorId: g('rpt-subcontractor'),
      vendorId: g('rpt-vendor'),
    };
  }

  // ── Run Report ─────────────────────────────────────────────
  async function runReport(reportKey) {
    const filters = collectFilters();

    // Fetch historical batches on-demand if online and DB method is available
    if (typeof DB !== 'undefined' && DB.Batches && DB.Batches.fetchByDateRange) {
      const runBtn = document.getElementById('rpt-run-btn');
      const originalText = runBtn ? runBtn.textContent : '🔍 Generate Report';
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = '⏳ Loading...';
      }
      try {
        await DB.Batches.fetchByDateRange(filters.from, filters.to);
      } catch (err) {
        console.error("Failed to pre-fetch historical batches:", err);
      } finally {
        if (runBtn) {
          runBtn.disabled = false;
          runBtn.textContent = originalText;
        }
      }
    }

    let result;

    switch(reportKey) {
      case 'reprocess':  result = renderReprocess(filters); break;
      case 'inventory':  result = renderInventory(filters); break;
      case 'store-stock':result = renderStoreStock(filters); break;
      case 'store-aging': result = renderStoreAging(filters); break;
      case 'daily-summary': result = renderDailySummary(filters); break;
      case 'sales':      result = renderSales(filters); break;
      case 'production': result = renderProduction(filters); break;
      case 'cryogenic':  result = renderStageLoss('cryogenic', filters); break;
      case 'deflashing': result = renderStageLoss('deflashing', filters); break;
      case 'trimming':   result = renderStageLoss('trimming', filters, ['Vendor']); break;
      case 'post-curing':result = renderStageLoss('post-curing', filters); break;
      case 'waiting-visual':result = renderWaitingVisualReport(filters); break;
      case 'visual':     result = renderStageLoss('visual', filters, ['Inspector', 'Reprocess Qty']); break;
      case 'gauge':      result = renderStageLoss('gauge', filters); break;
      case 'rejected':   result = renderRejected(); break;
      case 'recheck':    result = renderRecheck(filters); break;
      case 'slob':       result = renderSlob(filters); break;
      case 'aging':      result = renderAging(filters); break;
      case 'pending-batches': result = renderPendingBatches(filters); break;
      case 'sub-pending':     result = renderSubPending(filters); break;
      case 'sub-performance': result = renderSubPerformance(filters); break;
      case 'qty-gain':        result = renderQtyGainReport(filters); break;
      case 'qty-loss':        result = renderQtyLossReport(filters); break;
      case 'op-efficiency':   result = renderOpEfficiency(filters); break;
      case 'mould-lifecycle': result = renderMouldLifecycle(filters); break;
      case 'cycle-time':      result = renderCycleTime(filters); break;
      case 'wip-valuation':   result = renderWipValuation(filters); break;
      case 'sub-vs-inhouse':  result = renderSubVsInhouse(filters); break;
      case 'analytics':       result = renderAnalytics(filters); break;
      default: result = emptyState('Unknown report');
    }

    const output = document.getElementById('report-output');
    if (!output) return;

    if (typeof result === 'string') {
      output.innerHTML = result;
      return;
    }
    output.innerHTML = result.html;

    // Store for export
    output.dataset.headers = JSON.stringify(result.headers);
    output.dataset.rows    = JSON.stringify(result.dataRows);

    if (result.onRender) {
      setTimeout(() => result.onRender(), 50);
    }
  }

  // ── Report Configs ─────────────────────────────────────────
  const REPORTS = [
    { key:'reprocess',  label:'🔄 Reprocessed Items Report',   desc:'Chronological list of all batches and quantities sent for reprocessing' },
    { key:'inventory',  label:'📦 Inventory Report',           desc:'Current quantity per part at each stage' },
    { key:'store-stock',label:'🏪 Store Stock Report',         desc:'Finished Goods inventory available in Store with batch breakdown and valuation' },
    { key:'sales',      label:'💰 Sales Report',               desc:'Sales records with date range filter' },
    { key:'production', label:'🏭 Production Report',          desc:'Operator-wise and JMREF-wise production output' },
    { key:'cryogenic',  label:'❄️ Cryogenic Loss Report',      desc:'Loss during cryogenic processing' },
    { key:'deflashing', label:'🔧 DE Flashing Loss Report',    desc:'Loss during manual DE flashing' },
    { key:'trimming',   label:'✂️ Trimming Loss Report',       desc:'Loss during trimming process' },
    { key:'post-curing',label:'🔥 Post Curing Loss Report',     desc:'Loss during post curing process' },
    { key:'waiting-visual',label:'⏳ Waiting for Visual Report', desc:'Rack allocation and location details' },
    { key:'visual',     label:'👁️ Visual Inspection Report',   desc:'Inspector-wise loss and inspection records' },
    { key:'gauge',      label:'📏 Gauge Inspection Report',    desc:'Loss during gauge inspection' },
    { key:'rejected',   label:'🚫 Rejected Batch Report',      desc:'All batches rejected due to quality issues' },
    { key:'recheck',    label:'🔄 Quality Final Recheck',      desc:'Date-wise and operator-wise recheck tracking' },
    { key:'slob',       label:'📉 SLOB Report',                desc:'Slow-moving and Obsolete inventory aging analysis' },
    { key:'aging',      label:'⏳ Aging WIP Report (> 1 Week)', desc:'Active batches sitting in the same stage for more than 7 days' },
    { key:'pending-batches', label:'⏳ Pending Batch Report',  desc:'Pending batches filtered by stage and timeframe from date Received' },
    { key:'qty-gain',   label:'📈 Quantity Gain Report',       desc:'Stages where the batch output quantity was greater than the input quantity' },
    { key:'qty-loss',   label:'📉 Quality Loss Report',        desc:'Stages where the batch quantity was lost, grouped by batch number' },
    { key:'op-efficiency',  label:'👷 Operator & Inspector Efficiency', desc:'Operator-wise and Inspector-wise output, yield, and defect rates' },
    { key:'mould-lifecycle',label:'⚙️ Mould Lifecycle & Performance',    desc:'Accumulative lift count, output yield, and maintenance alert status per mould' },
    { key:'cycle-time',     label:'⏳ Production Cycle Time & Bottlenecks', desc:'Average hours/days batches spend at each process stage' },
    { key:'wip-valuation',  label:'💰 WIP Inventory Valuation',          desc:'Financial valuation of live inventory based on part sale prices' },
    { key:'sub-vs-inhouse', label:'🏢 Subcontractor vs. In-House Comparison', desc:'Yield, cycle time, and rejection comparison between manufacturing channels' },
    { key:'sub-pending', label:'🏢 Subcontractor Pending Batches', desc:'Batches of subcontractor parts currently in pending/WIP stages other than Store' },
    { key:'sub-performance', label:'🏢 Subcontractor & Vendor Performance Scorecard', desc:'Detailed quality, speed, and WIP load scorecard for all subcontractors and process vendors' },
    { key:'store-aging', label:'⏳ Finished-Goods FIFO Aging Report', desc:'Available stock batches in the Store with FIFO-calculated remaining quantities and age' },
    { key:'daily-summary', label:'📊 Daily Production & Scrap Summary', desc:'Daily overview of total pieces molded, completed, reprocessed, and scrap rates across all stages' },
    { key:'analytics', label:'📈 Production & Quality Analytics', desc:'Interactive visual charts showing WIP bottlenecks, daily production yield trends, and top defective parts' }
  ];

  // ── Render ────────────────────────────────────────────────
  function render(reportKey = 'inventory') {
    const session = Auth.getSession();
    const el = document.getElementById('content');
    if (!el) return;

    const report = REPORTS.find(r => r.key === reportKey);
    if (!report) return;

    if (reportKey !== 'aging') {
      agingSearch = '';
    }

    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="font-bold" style="font-size:20px;">${report.label}</h2>
            <p class="text-sm text-muted mt-1">${report.desc}</p>
          </div>
        </div>

        <div class="card animate-in">
          <div class="card-header">
            <h3>${report.label}</h3>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm no-print" id="rpt-export-csv">⬇️ CSV</button>
              <button class="btn btn-teal btn-sm no-print" id="rpt-export-excel">📊 Excel</button>
              <button class="btn btn-ghost btn-sm no-print" onclick="window.print()">🖨️ Print</button>
            </div>
          </div>
          <div class="card-body">
            <!-- Filters -->
            <div class="filter-bar" id="rpt-filters" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px;align-items:flex-end;">
              ${buildFilters(reportKey)}
              <div class="form-group mb-0">
                <label class="form-label" style="visibility:hidden;display:block;">&nbsp;</label>
                <button class="btn btn-primary" id="rpt-run-btn">🔍 Generate Report</button>
              </div>
            </div>
            <div id="report-output">
              <div class="empty-state"><div class="empty-icon">🔍</div><p>Set filters and click Generate Report</p></div>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('rpt-run-btn')?.addEventListener('click', () => runReport(reportKey));
    document.getElementById('rpt-export-csv')?.addEventListener('click', () => {
      const out = document.getElementById('report-output');
      if (!out?.dataset.headers) { showToast('Generate the report first', 'warning'); return; }
      exportCSV(JSON.parse(out.dataset.headers), JSON.parse(out.dataset.rows), `JMPL_${reportKey}_${new Date().toISOString().slice(0,10)}`);
    });
    document.getElementById('rpt-export-excel')?.addEventListener('click', () => {
      const out = document.getElementById('report-output');
      if (!out?.dataset.headers) { showToast('Generate the report first', 'warning'); return; }
      exportExcel(JSON.parse(out.dataset.headers), JSON.parse(out.dataset.rows), `JMPL_${reportKey}_${new Date().toISOString().slice(0,10)}`, report.label);
    });

    // Auto-run if no filters needed (e.g. rejected report)
    if (!buildFilters(reportKey)) runReport(reportKey);
    // Auto-run inventory & store reports immediately (no date filters needed)
    if (reportKey === 'inventory') runReport(reportKey);
    if (reportKey === 'store-stock') runReport(reportKey);
    if (reportKey === 'pending-batches') runReport(reportKey);
    if (reportKey === 'sub-pending') runReport(reportKey);
    if (reportKey === 'sub-performance') runReport(reportKey);
  }

  function filterAging(val) {
    agingSearch = val;
    runReport('aging');
    const inp = document.getElementById('aging-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  function renderAnalytics(filters) {
    const { from, to } = filters;
    
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const fromDate = from || thirtyDaysAgo.toISOString().slice(0, 10);
    const toDate = to || today.toISOString().slice(0, 10);

    const master = DB.Master.all();
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();

    const stages = ['production', 'cryogenic', 'deflashing', 'trimming', 'post-curing', 'waiting-visual', 'visual', 'gauge', 'quality'];
    const wipCounts = stages.map(stage => {
      const activeBatches = batches.filter(b => b.currentStage === stage && b.status === 'active');
      return activeBatches.reduce((sum, b) => {
        const incoming = stageRecords.filter(r => r.batchId === b.id && r.movedTo === stage);
        if (incoming.length) {
          return sum + (incoming[incoming.length - 1].outputQty || 0);
        }
        return sum + (b.initialQty || 0);
      }, 0);
    });

    const dateList = [];
    let curr = new Date(fromDate);
    const end = new Date(toDate);
    while (curr <= end) {
      dateList.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
    }

    const dailyOutput = Array(dateList.length).fill(0);
    const dailyScrap = Array(dateList.length).fill(0);

    const rangeRecords = stageRecords.filter(r => r.date >= fromDate && r.date <= toDate);
    rangeRecords.forEach(r => {
      const idx = dateList.indexOf(r.date);
      if (idx !== -1) {
        if (r.stage === 'production') {
          dailyOutput[idx] += (r.outputQty || 0);
        }
        dailyScrap[idx] += (r.lossQty || 0);
      }
    });

    const partScrapMap = {};
    rangeRecords.forEach(r => {
      if ((r.lossQty || 0) <= 0) return;
      const b = DB.Batches.find(r.batchId);
      if (!b) return;
      partScrapMap[b.jmrefNo || 'Unknown'] = (partScrapMap[b.jmrefNo || 'Unknown'] || 0) + r.lossQty;
    });

    const topDefects = Object.entries(partScrapMap)
      .map(([jmrefNo, scrap]) => ({ jmrefNo, scrap }))
      .sort((a, b) => b.scrap - a.scrap)
      .slice(0, 5);

    const html = `
      <div class="animate-in" style="display:flex; flex-direction:column; gap:24px;">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
          <div class="card" style="padding: 16px;">
            <h3 style="font-size:14px; font-weight:700; color:var(--primary); margin-bottom:12px;">📊 WIP Inventory Bottlenecks (Active Pieces in Pipeline)</h3>
            <div style="height: 300px; position: relative;">
              <canvas id="chart-bottleneck"></canvas>
            </div>
          </div>
          
          <div class="card" style="padding: 16px;">
            <h3 style="font-size:14px; font-weight:700; color:var(--primary); margin-bottom:12px;">🚫 Top 5 Defective Parts (Total Scrap Qty)</h3>
            <div style="height: 300px; position: relative;">
              <canvas id="chart-defects"></canvas>
            </div>
          </div>
        </div>

        <div class="card" style="padding: 16px; width: 100%;">
          <h3 style="font-size:14px; font-weight:700; color:var(--primary); margin-bottom:12px;">📈 Daily Production Yield vs. Scrap Trend</h3>
          <div style="height: 320px; position: relative;">
            <canvas id="chart-trend"></canvas>
          </div>
        </div>
      </div>
    `;

    const headers = ['Metric/Part/Stage', 'Values'];
    const dataRows = [
      ['Date Range', `${fromDate} to ${toDate}`],
      ['Top Defects', JSON.stringify(topDefects)],
      ['WIP Counts', JSON.stringify(wipCounts)]
    ];

    const onRender = () => {
      const ctxBottleneck = document.getElementById('chart-bottleneck')?.getContext('2d');
      if (ctxBottleneck) {
        new Chart(ctxBottleneck, {
          type: 'doughnut',
          data: {
            labels: stages.map(s => STAGE_LABELS[s] || s),
            datasets: [{
              label: 'Pieces in WIP',
              data: wipCounts,
              backgroundColor: [
                '#3b82f6', '#60a5fa', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#f43f5e', '#06b6d4', '#14b8a6'
              ],
              borderWidth: 1,
              borderColor: 'var(--bg-card)'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: { color: '#94a3b8', font: { size: 10 } }
              }
            }
          }
        });
      }

      const ctxDefects = document.getElementById('chart-defects')?.getContext('2d');
      if (ctxDefects) {
        new Chart(ctxDefects, {
          type: 'bar',
          data: {
            labels: topDefects.map(d => d.jmrefNo),
            datasets: [{
              label: 'Scrap Quantity',
              data: topDefects.map(d => d.scrap),
              backgroundColor: '#ef4444',
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
              y: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }

      const ctxTrend = document.getElementById('chart-trend')?.getContext('2d');
      if (ctxTrend) {
        new Chart(ctxTrend, {
          type: 'line',
          data: {
            labels: dateList.map(d => d.slice(5)),
            datasets: [
              {
                label: 'Moulded Quantity',
                data: dailyOutput,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3,
                borderWidth: 2
              },
              {
                label: 'Scrap Quantity',
                data: dailyScrap,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.3,
                borderWidth: 2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: { color: '#94a3b8' }
              }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
              y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94a3b8' } }
            }
          }
        });
      }
    };

    return { html, headers, dataRows, onRender };
  }

  function renderDailySummary(filters) {
    const { from, to } = filters;
    const todayStr = new Date().toISOString().slice(0, 10);
    const fromDate = from || todayStr;
    const toDate = to || todayStr;

    const stageRecords = DB.StageRecords.all();
    const master = DB.Master.all();

    const recs = stageRecords.filter(r => r.date >= fromDate && r.date <= toDate);

    let totalMoulded = 0;
    let totalCompleted = 0;
    let totalScrap = 0;
    let totalReprocess = 0;

    recs.forEach(r => {
      if (r.stage === 'production') {
        totalMoulded += (r.outputQty || 0);
      }
      if (r.stage === 'store') {
        totalCompleted += (r.inputQty || 0);
      }
      totalScrap += (r.lossQty || 0);
      totalReprocess += (r.reprocessQty || 0);
    });

    const yieldRate = (totalCompleted + totalScrap) > 0 
      ? ((totalCompleted / (totalCompleted + totalScrap)) * 100).toFixed(1) 
      : '0.0';

    const stages = ['production', 'cryogenic', 'deflashing', 'trimming', 'post-curing', 'waiting-visual', 'visual', 'gauge', 'quality', 'store'];
    const stageSummary = stages.map(s => {
      const stageRecs = recs.filter(r => r.stage === s);
      let input = 0;
      let output = 0;
      let loss = 0;
      let reprocess = 0;

      stageRecs.forEach(r => {
        input += (r.inputQty || 0);
        output += (r.outputQty || 0);
        loss += (r.lossQty || 0);
        reprocess += (r.reprocessQty || 0);
      });

      if (s === 'store') {
        input = stageRecs.reduce((sum, r) => sum + (r.inputQty || 0), 0);
        output = input;
      }

      const scrapRate = input > 0 ? ((loss / input) * 100).toFixed(1) : '0.0';

      return {
        stage: STAGE_LABELS[s] || s,
        input,
        output,
        loss,
        reprocess,
        scrapRate
      };
    });

    const partSummaryMap = {};
    recs.forEach(r => {
      const batch = DB.Batches.find(r.batchId);
      if (!batch) return;

      if (!partSummaryMap[batch.jmrefNo]) {
        const m = master.find(p => p.jmrefNo === batch.jmrefNo) || {};
        partSummaryMap[batch.jmrefNo] = {
          partNo: batch.partNo || m.partNo || 'Unknown',
          jmrefNo: batch.jmrefNo,
          description: m.description || '—',
          moulded: 0,
          completed: 0,
          scrapped: 0,
          reprocessed: 0
        };
      }

      const entry = partSummaryMap[batch.jmrefNo];
      if (r.stage === 'production') {
        entry.moulded += (r.outputQty || 0);
      }
      if (r.stage === 'store') {
        entry.completed += (r.inputQty || 0);
      }
      entry.scrapped += (r.lossQty || 0);
      entry.reprocessed += (r.reprocessQty || 0);
    });

    const partRows = Object.values(partSummaryMap);

    const kpiHtml = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div class="card" style="padding: 16px; background: var(--bg-primary); border: 1px solid var(--border); border-left: 4px solid var(--accent-blue);">
          <div class="text-sm text-muted">Total Moulded Today</div>
          <div class="font-bold mt-2" style="font-size: 24px; color: var(--primary);">${formatNum(totalMoulded)}</div>
        </div>
        <div class="card" style="padding: 16px; background: var(--bg-primary); border: 1px solid var(--border); border-left: 4px solid var(--accent-green);">
          <div class="text-sm text-muted">Completed (Moved to Store)</div>
          <div class="font-bold mt-2" style="font-size: 24px; color: var(--accent-green);">${formatNum(totalCompleted)}</div>
        </div>
        <div class="card" style="padding: 16px; background: var(--bg-primary); border: 1px solid var(--border); border-left: 4px solid var(--accent-red);">
          <div class="text-sm text-muted">Total Scrapped (Loss)</div>
          <div class="font-bold mt-2" style="font-size: 24px; color: var(--accent-red);">${formatNum(totalScrap)}</div>
        </div>
        <div class="card" style="padding: 16px; background: var(--bg-primary); border: 1px solid var(--border); border-left: 4px solid var(--accent-teal);">
          <div class="text-sm text-muted">Completed Yield Rate</div>
          <div class="font-bold mt-2" style="font-size: 24px; color: var(--accent-teal);">${yieldRate}%</div>
        </div>
      </div>
    `;

    const stageTableRows = stageSummary.map(s => {
      const scrapRateClass = parseFloat(s.scrapRate) > 5 ? 'text-danger font-bold' : 'text-muted';
      return `
        <tr>
          <td class="font-semibold">${s.stage}</td>
          <td>${s.input > 0 ? formatNum(s.input) : '—'}</td>
          <td>${s.output > 0 ? formatNum(s.output) : '—'}</td>
          <td class="${s.loss > 0 ? 'text-danger font-semibold' : ''}">${s.loss > 0 ? formatNum(s.loss) : '—'}</td>
          <td class="${s.reprocess > 0 ? 'text-warning font-semibold' : ''}">${s.reprocess > 0 ? formatNum(s.reprocess) : '—'}</td>
          <td class="${scrapRateClass}">${parseFloat(s.scrapRate) > 0 ? s.scrapRate + '%' : '—'}</td>
        </tr>
      `;
    }).join('');

    const stageTableHtml = `
      <h3 style="font-size: 14px; font-weight:700; color:var(--primary); margin: 24px 0 12px 0;">🏢 Stage-wise Input, Output, and Scrap Rates</h3>
      <div class="table-wrap" style="margin-bottom: 24px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Input Qty</th>
              <th>Output Qty</th>
              <th>Scrap (Loss)</th>
              <th>Reprocess Qty</th>
              <th>Scrap Rate (%)</th>
            </tr>
          </thead>
          <tbody>
            ${stageTableRows}
          </tbody>
        </table>
      </div>
    `;

    let partTableRows = '';
    if (partRows.length === 0) {
      partTableRows = `<tr><td colspan="7" class="text-center text-muted" style="padding: 20px;">No production records found for the selected date range.</td></tr>`;
    } else {
      partTableRows = partRows.map(r => `
        <tr>
          <td class="font-semibold text-blue">${r.partNo}</td>
          <td><span class="badge badge-teal">${r.jmrefNo}</span></td>
          <td class="text-muted text-sm">${r.description}</td>
          <td class="font-bold">${r.moulded > 0 ? formatNum(r.moulded) : '—'}</td>
          <td class="font-bold text-success">${r.completed > 0 ? formatNum(r.completed) : '—'}</td>
          <td class="text-danger font-semibold">${r.scrapped > 0 ? formatNum(r.scrapped) : '—'}</td>
          <td class="text-warning font-semibold">${r.reprocessed > 0 ? formatNum(r.reprocessed) : '—'}</td>
        </tr>
      `).join('');
    }

    const partTableHtml = `
      <h3 style="font-size: 14px; font-weight:700; color:var(--primary); margin: 12px 0;">📦 Item-wise Summary</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Part No</th>
              <th>JMREF No</th>
              <th>Description</th>
              <th>Moulded</th>
              <th>Completed (Store)</th>
              <th>Scrapped</th>
              <th>Reprocessed</th>
            </tr>
          </thead>
          <tbody>
            ${partTableRows}
          </tbody>
        </table>
      </div>
    `;

    const html = `
      <div class="daily-summary-dashboard animate-in">
        ${kpiHtml}
        ${stageTableHtml}
        ${partTableHtml}
      </div>
    `;

    const headers = ['Type', 'Name / Stage / Part No', 'JMREF No', 'Description / Stage output', 'Input / Moulded Qty', 'Completed / Output Qty', 'Scrapped / Loss Qty', 'Reprocess Qty', 'Scrap / Yield Rate'];
    
    const exportRows = [];
    exportRows.push(['KPI Summary', 'Total Moulded Today', '', '', totalMoulded, '', '', '', '']);
    exportRows.push(['KPI Summary', 'Completed (Store)', '', '', '', totalCompleted, '', '', '']);
    exportRows.push(['KPI Summary', 'Total Scrapped (Loss)', '', '', '', '', totalScrap, '', '']);
    exportRows.push(['KPI Summary', 'Completed Yield Rate', '', '', '', '', '', '', yieldRate + '%']);
    exportRows.push(['', '', '', '', '', '', '', '', '']); 

    exportRows.push(['Header', 'Stage Breakdown', '', '', '', '', '', '', '']);
    stageSummary.forEach(s => {
      exportRows.push(['Stage Data', s.stage, '', '', s.input, s.output, s.loss, s.reprocess, s.scrapRate + '%']);
    });
    exportRows.push(['', '', '', '', '', '', '', '', '']); 

    exportRows.push(['Header', 'Part Summary', '', '', '', '', '', '', '']);
    partRows.forEach(r => {
      exportRows.push(['Part Data', r.partNo, r.jmrefNo, r.description, r.moulded, r.completed, r.scrapped, r.reprocessed, '']);
    });

    return { html, headers, dataRows: exportRows };
  }

  function renderStoreAging(filters) {
    const { jmref } = filters;
    const master = DB.Master.all();
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();
    const sales = DB.Sales.all();
    const today = new Date();

    let parts = master.filter(p => {
      if (jmref) {
        const q = jmref.toLowerCase();
        const matchJmref = p.jmrefNo && p.jmrefNo.toLowerCase().includes(q);
        const matchPartNo = p.partNo && p.partNo.toLowerCase().includes(q);
        return matchJmref || matchPartNo;
      }
      return true;
    });

    const agingRows = [];

    parts.forEach(p => {
      const partBatches = batches.filter(b => b.jmrefNo === p.jmrefNo && b.status === 'completed');
      if (partBatches.length === 0) return;

      const batchEntries = partBatches.map(b => {
        const storeRecs = stageRecords.filter(r => r.batchId === b.id && r.stage === 'store');
        const lastRec = storeRecs.length ? storeRecs[storeRecs.length - 1] : null;
        
        const storeQty = lastRec ? (lastRec.inputQty || 0) : (b.initialQty || 0);
        const storeDateStr = lastRec ? (lastRec.date || lastRec.createdAt || b.completedAt || b.createdAt) : (b.completedAt || b.createdAt || '');
        
        return {
          batch: b,
          storeQty,
          storeDateStr: storeDateStr ? storeDateStr.slice(0, 10) : ''
        };
      });

      batchEntries.sort((a, b) => {
        if (!a.storeDateStr) return 1;
        if (!b.storeDateStr) return -1;
        return a.storeDateStr.localeCompare(b.storeDateStr);
      });

      let totalSold = sales.filter(s => s.jmrefNo === p.jmrefNo).reduce((s, r) => s + (r.qty || 0), 0);

      batchEntries.forEach(entry => {
        let remainingQty = entry.storeQty;
        if (totalSold >= remainingQty) {
          totalSold -= remainingQty;
          remainingQty = 0;
        } else if (totalSold > 0) {
          remainingQty -= totalSold;
          totalSold = 0;
        }

        if (remainingQty > 0) {
          let ageDays = 0;
          if (entry.storeDateStr) {
            const entryDate = new Date(entry.storeDateStr);
            const diffTime = Math.abs(today - entryDate);
            ageDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          }

          agingRows.push({
            partNo: p.partNo,
            jmrefNo: p.jmrefNo,
            description: p.description,
            batchNo: entry.batch.batchNo,
            storeDate: entry.storeDateStr || '—',
            initialQty: entry.storeQty,
            remainingQty,
            ageDays
          });
        }
      });
    });

    agingRows.sort((a, b) => b.ageDays - a.ageDays);

    const headers = ['Part No', 'JMREF No', 'Description', 'Batch No', 'Date Completed', 'Original Qty', 'Remaining Qty', 'Age (Days)'];
    
    if (agingRows.length === 0) {
      return {
        html: emptyState('No finished goods inventory found in the Store.'),
        headers,
        dataRows: []
      };
    }

    const dataRows = agingRows.map(r => [
      r.partNo,
      r.jmrefNo,
      r.description,
      r.batchNo,
      r.storeDate,
      r.initialQty,
      r.remainingQty,
      r.ageDays
    ]);

    const theadCols = headers.map(h => `<th>${h}</th>`).join('');
    
    const tbodyRows = agingRows.map(r => {
      let ageClass = 'text-success font-semibold';
      if (r.ageDays > 30) ageClass = 'text-danger font-bold';
      else if (r.ageDays > 15) ageClass = 'text-warning font-semibold';

      return `
        <tr>
          <td class="font-semibold text-blue">${r.partNo}</td>
          <td><span class="badge badge-teal">${r.jmrefNo}</span></td>
          <td class="text-muted text-sm">${r.description}</td>
          <td class="font-semibold">${r.batchNo}</td>
          <td>${r.storeDate}</td>
          <td>${formatNum(r.initialQty)}</td>
          <td class="font-bold text-success">${formatNum(r.remainingQty)}</td>
          <td class="${ageClass}">${r.ageDays} days</td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${theadCols}</tr></thead>
          <tbody>${tbodyRows}</tbody>
        </table>
      </div>`;

    return { html, headers, dataRows };
  }

  function showPartBatches(jmrefNo, partNo) {
    const batches = DB.Batches.all().filter(b => b.jmrefNo === jmrefNo && b.status === 'active' && b.currentStage !== 'store');
    
    // Sort by date desc
    batches.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    let rowsHtml = '';
    if (batches.length === 0) {
      rowsHtml = `<tr><td colspan="6" class="text-center text-muted" style="padding:20px;">No batches found for this part.</td></tr>`;
    } else {
      rowsHtml = batches.map(b => {
        const stageLabel = STAGE_LABELS[b.currentStage] || b.currentStage || 'Unknown';
        const isStore = b.currentStage === 'store';
        
        let qty = b.initialQty || 0;
        const statusClass = b.status === 'active' ? 'badge-blue' : 'badge-teal';
        const stageClass = isStore ? 'text-success font-bold' : 'text-blue font-semibold';
        
        let vendorName = '—';
        if (b.vendorId) {
          const v = DB.Vendors.find(b.vendorId);
          if (v) vendorName = v.name;
        }

        const dateStr = b.createdAt ? b.createdAt.slice(0, 10) : '—';

        return `
          <tr>
            <td class="font-semibold">${b.batchNo}</td>
            <td class="${stageClass}">${stageLabel}</td>
            <td class="font-bold">${formatNum(qty)}</td>
            <td>${vendorName}</td>
            <td><span class="badge ${statusClass}">${b.status}</span></td>
            <td class="text-muted text-sm">${dateStr}</td>
          </tr>
        `;
      }).join('');
    }

    const modalHtml = `
      <div class="modal-overlay" id="inventory-detail-overlay" onclick="if(event.target===this) ReportsModule.closePartBatches()" style="z-index: 10000;">
        <div class="modal" style="max-width: 800px; width: 100%;">
          <div class="modal-header">
            <h3 style="font-size:16px; font-weight:700; color:var(--primary);">📦 WIP Batches for Part: ${partNo} (${jmrefNo})</h3>
            <button class="btn btn-ghost" onclick="ReportsModule.closePartBatches()">✕</button>
          </div>
          <div class="modal-body" style="max-height: 60vh;">
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Batch No</th>
                    <th>Destination Stage</th>
                    <th>Qty</th>
                    <th>Vendor</th>
                    <th>Status</th>
                    <th>Date Created</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="ReportsModule.closePartBatches()">Close</button>
          </div>
        </div>
      </div>
    `;

    closePartBatches();

    const div = document.createElement('div');
    div.id = 'inventory-detail-container';
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
  }

  function closePartBatches() {
    const el = document.getElementById('inventory-detail-container');
    if (el) el.remove();
  }

  return { render, filterAging, showPartBatches, closePartBatches };
})();
