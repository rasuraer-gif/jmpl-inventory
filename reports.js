// ============================================================
// reports.js — JMPL Inventory Tracking System
// All 10 reports with filtering, CSV and Excel export
// ============================================================
/* global DB, Auth, showToast, formatDate, formatNum, XLSX */

const ReportsModule = (() => {

  const MODULES = [
    'inventory','sales','production','cryogenic','deflashing',
    'trimming','waiting-visual','visual','gauge','rejected','recheck','slob','aging'
  ];

  const STAGE_LABELS = {
    production:'Production', cryogenic:'Cryogenic', deflashing:'Manual DE Flashing',
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
    const stages = ['production','cryogenic','deflashing','trimming','post-curing','waiting-visual','visual','gauge','quality','store'];

    let parts = master.filter(p => {
      if (jmref  && !p.jmrefNo.toLowerCase().includes(jmref.toLowerCase()))  return false;
      if (partNo && !p.partNo.toLowerCase().includes(partNo.toLowerCase())) return false;
      return true;
    });

    if (!parts.length) return emptyState('No parts found. Add parts in Inventory Master first.');

    const stageHeaders = stages.map(s => STAGE_LABELS[s]);
    const headers = ['Part No', 'JMREF No', 'Description', ...stageHeaders, 'Total WIP', 'Store (Available)'];

    const dataRows = parts.map(p => {
      const stageCounts = stages.map(stage => {
        if (stage === 'store') {
          // FIFO-computed available stock
          return DB.StoreInventory.availableByJmref(p.jmrefNo);
        }
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

      // Total WIP = all stages except 'store' (last element)
      const totalWip = stageCounts.slice(0, stages.length - 1).reduce((s, v) => s + v, 0);
      const storeAvail = stageCounts[stages.length - 1];

      return [p.partNo, p.jmrefNo, p.description, ...stageCounts, totalWip, storeAvail];
    });

    const stageLen = stages.length;
    const theadCols = headers.map((h, i) => {
      let color = '';
      if (i >= 3 && i < 3 + stageLen - 1) color = 'var(--accent-blue)';   // WIP stages
      if (i === 3 + stageLen - 1)          color = 'var(--accent-green)';  // Store
      if (i === 3 + stageLen)              color = 'var(--accent-teal)';   // Total WIP
      if (i === 3 + stageLen + 1)          color = 'var(--accent-green)';  // Store avail
      return `<th${color ? ' style="color:' + color + ';"' : ''}>${h}</th>`;
    }).join('');

    const tbodyRows = dataRows.map(r => {
      // Fixed info cols
      const infoCols = `
        <td class="font-semibold text-blue">${r[0]}</td>
        <td><span class="badge badge-teal">${r[1]}</span></td>
        <td class="text-muted">${r[2]}</td>`;

      // Stage qty cols (index 3 to 3+stageLen-1)
      const stageCols = r.slice(3, 3 + stageLen).map((v, i) => {
        const isStore = i === stageLen - 1;
        const cls = v > 0
          ? (isStore ? 'font-bold text-success' : 'font-semibold text-blue')
          : 'text-muted';
        return `<td class="${cls}">${v > 0 ? formatNum(v) : '—'}</td>`;
      }).join('');

      // Summary cols
      const totalWip   = r[3 + stageLen];
      const storeAvail = r[3 + stageLen + 1];
      const summaryCols = `
        <td class="font-bold" style="color:var(--accent-teal);">${totalWip > 0 ? formatNum(totalWip) : '—'}</td>
        <td class="font-bold text-success">${storeAvail > 0 ? formatNum(storeAvail) : '—'}</td>`;

      return `<tr>${infoCols}${stageCols}${summaryCols}</tr>`;
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
    const { from, to, jmref, operatorId } = filters;
    let records = DB.ProductionRecords.all();
    let batches  = DB.Batches.all().filter(b => b.currentStage !== 'production' || b.status !== 'active');

    // Filter by jmref
    if (jmref) batches = batches.filter(b => b.jmrefNo?.toLowerCase().includes(jmref.toLowerCase()));

    // Filter records by date
    records = filterByDateRange(records, 'date', from, to);
    if (operatorId) records = records.filter(r => r.operatorId === operatorId);

    if (!records.length) return emptyState();

    const operators = DB.Operators.all();
    const headers = ['#','Batch No','JMREF','Operator','No. of Lifts','Date'];
    const dataRows = records.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const op = operators.find(o => o.id === r.operatorId) || {};
      return [i+1, batch.batchNo||'', batch.jmrefNo||'', op.name||r.operatorName||'-', r.noOfLifts||0, (r.date||'').slice(0,10)];
    });

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map(r=>`<tr>${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
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
    
    // Filter by date range (using stage entry date or batch creation date)
    filtered = filtered.filter(b => {
      const recs = stageRecords.filter(r => r.batchId === b.id && r.movedTo === 'waiting-visual');
      const dateStr = recs.length ? (recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '') : (b.createdAt || '');
      const d = dateStr.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    
    if (!filtered.length) return emptyState();
    
    const headers = ['#', 'Batch No', 'JMREF No', 'Part No', 'Allocated Qty', 'Rack No', 'Location', 'Box No', 'Additional Details', 'Stage Entry Date', 'Current Stage'];
    
    const dataRows = filtered.map((b, i) => {
      const recs = stageRecords.filter(r => r.batchId === b.id && r.movedTo === 'waiting-visual');
      const qty = recs.length ? (recs[recs.length - 1].outputQty || 0) : (b.initialQty || 0);
      const dateStr = recs.length ? (recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '') : (b.createdAt || '');
      
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
        dateStr.slice(0, 10),
        STAGE_LABELS[b.currentStage] || b.currentStage
      ];
    });
    
    const htmlRows = filtered.map((b, i) => {
      const recs = stageRecords.filter(r => r.batchId === b.id && r.movedTo === 'waiting-visual');
      const qty = recs.length ? (recs[recs.length - 1].outputQty || 0) : (b.initialQty || 0);
      const dateStr = recs.length ? (recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '') : (b.createdAt || '');
      
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
          <td>${formatDate(dateStr.slice(0,10))}</td>
          <td><span class="stage-chip ${b.currentStage}">${STAGE_LABELS[b.currentStage] || b.currentStage}</span></td>
        </tr>`;
    }).join('');
    
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
              <th>Stage Entry Date</th>
              <th>Current Stage</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>
      </div>`;
      
    return { html, headers, dataRows };
  }

  // ── Generic Stage Loss Report ──────────────────────────────
  function renderStageLoss(stage, filters, extraCols=[]) {
    const { from, to, jmref } = filters;
    let losses = DB.LossTracker.byStage(stage);
    if (jmref) losses = losses.filter(l => l.jmrefNo?.toLowerCase().includes(jmref.toLowerCase()));
    losses = filterByDateRange(losses, 'date', from, to);
    if (!losses.length) return emptyState();

    const stageRecs = DB.StageRecords.all();
    const headers = ['#','Batch No','JMREF','Part No','Input Qty','Output Qty','Loss Qty','% Loss','Date', ...extraCols];
    const dataRows = losses.map((l, i) => {
      const batch = DB.Batches.find(l.batchId) || {};
      const sr = stageRecs.find(r => r.batchId === l.batchId && r.stage === stage);
      const extra = extraCols.map(col => {
        if (col === 'Inspector') return sr?.inspectorName || '-';
        if (col === 'Recheck #') return l.iterationNo || '-';
        return '-';
      });
      const input = sr?.inputQty || 0;
      const loss = l.lossQty || 0;
      const pct = input ? ((loss / input) * 100).toFixed(1) + '%' : '0.0%';
      return [i+1, batch.batchNo||'', l.jmrefNo||'', l.partNo||'', input, sr?.outputQty||'', loss, pct, (l.date||'').slice(0,10), ...extra];
    });

    const totalLoss = losses.reduce((s, l) => s + (l.lossQty||0), 0);
    const totalInput = losses.reduce((s, l) => {
      const sr = stageRecs.find(r => r.batchId === l.batchId && r.stage === stage);
      return s + (sr?.inputQty || 0);
    }, 0);
    const totalPct = totalInput ? ((totalLoss / totalInput) * 100).toFixed(1) + '%' : '0.0%';
    const summaryRow = ['','','','','','TOTAL LOSS', totalLoss, totalPct, '', ...extraCols.map(()=>'')];
    dataRows.push(summaryRow);

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map((r,i)=>`<tr class="${i===dataRows.length-1?'font-bold text-danger':''}">${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
    return { html, headers, dataRows };
  }

  // ── Render Report 9: Rejected Batches ─────────────────────
  function renderRejected() {
    const rejections = DB.RejectionTracker.all();
    if (!rejections.length) return emptyState('No rejected batches found.');
    const headers = ['#','Batch No','JMREF','Part No','Stage','Qty','Reason','Rejected By','Date'];
    const users = DB.Users.all();
    const dataRows = rejections.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const user = users.find(u => u.id === r.rejectedBy) || {};
      return [i+1, batch.batchNo||'', batch.jmrefNo||'', batch.partNo||'', STAGE_LABELS[r.stage]||r.stage, r.qty||'', r.reason||'', user.name||'-', (r.date||'').slice(0,10)];
    });
    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map(r=>`<tr>${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
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
    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map(r=>`<tr>${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
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
            ${htmlRows}
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
            ${htmlRows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}
          </tbody>
        </table>
      </div>`;

    return { html, headers, dataRows };
  }

  // ── Build Filter UI ────────────────────────────────────────
  function buildFilters(report) {
    const masterList = DB.Master.all();
    const operators  = DB.Operators.all();
    const jmrefOpts  = masterList.map(m => `<option value="${m.jmrefNo}">${m.jmrefNo} — ${m.partNo}</option>`).join('');
    const opOpts     = operators.map(o => `<option value="${o.id}">${o.name}</option>`).join('');

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

    const filterMap = {
      inventory: [jmrefFilter, partNoFilter].join(''),
      sales:     [jmrefFilter, dateRange].join(''),
      production:[jmrefFilter, opFilter, dateRange].join(''),
      cryogenic: [jmrefFilter, dateRange].join(''),
      deflashing:[jmrefFilter, dateRange].join(''),
      trimming:  [jmrefFilter, dateRange].join(''),
      'post-curing':[jmrefFilter, dateRange].join(''),
      'waiting-visual':[jmrefFilter, dateRange].join(''),
      visual:    [jmrefFilter, dateRange].join(''),
      gauge:     [jmrefFilter, dateRange].join(''),
      rejected:  '',
      recheck:   [opFilter, dateRange].join(''),
    };
    return filterMap[report] || '';
  }

  // ── Collect Filters ────────────────────────────────────────
  function collectFilters() {
    const g = id => (document.getElementById(id) || {}).value || '';
    return {
      from: g('rpt-from'), to: g('rpt-to'),
      jmref: g('rpt-jmref') || g('rpt-partno'),
      partNo: g('rpt-partno'),
      operatorId: g('rpt-operator'),
    };
  }

  // ── Run Report ─────────────────────────────────────────────
  function runReport(reportKey) {
    const filters = collectFilters();
    let result;

    switch(reportKey) {
      case 'inventory':  result = renderInventory(filters); break;
      case 'sales':      result = renderSales(filters); break;
      case 'production': result = renderProduction(filters); break;
      case 'cryogenic':  result = renderStageLoss('cryogenic', filters); break;
      case 'deflashing': result = renderStageLoss('deflashing', filters); break;
      case 'trimming':   result = renderStageLoss('trimming', filters); break;
      case 'post-curing':result = renderStageLoss('post-curing', filters); break;
      case 'waiting-visual':result = renderWaitingVisualReport(filters); break;
      case 'visual':     result = renderStageLoss('visual', filters, ['Inspector']); break;
      case 'gauge':      result = renderStageLoss('gauge', filters); break;
      case 'rejected':   result = renderRejected(); break;
      case 'recheck':    result = renderRecheck(filters); break;
      case 'slob':       result = renderSlob(filters); break;
      case 'aging':      result = renderAging(filters); break;
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
  }

  // ── Report Configs ─────────────────────────────────────────
  const REPORTS = [
    { key:'inventory',  label:'📦 Inventory Report',           desc:'Current quantity per part at each stage' },
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
    // Auto-run inventory report immediately (no date filters needed)
    if (reportKey === 'inventory') runReport(reportKey);
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

  return { render, filterAging };
})();
