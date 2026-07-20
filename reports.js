// ============================================================
// reports.js — JMPL Inventory Tracking System
// All 10 reports with filtering, CSV and Excel export
// ============================================================
/* global DB, Auth, showToast, formatDate, formatNum, XLSX */

const ReportsModule = (() => {

  const MODULES = [
    'inventory','sales','production','cryogenic','deflashing',
    'trimming','waiting-visual','visual','gauge','rejected','recheck','slob','aging','reprocess'
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
      if (jmref) {
        const q = jmref.toLowerCase();
        const matchJmref = p.jmrefNo && p.jmrefNo.toLowerCase().includes(q);
        const matchPartNo = p.partNo && p.partNo.toLowerCase().includes(q);
        if (!matchJmref && !matchPartNo) return false;
      }
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
        (r.date||'').slice(0,10)
      ];
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

  // ── Render Report: Reprocessed Items ─────────────────────
  function renderReprocess(filters) {
    const { from, to, jmref } = filters;
    let recs = DB.StageRecords.all().filter(r => r.reprocessQty > 0);
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

    if (!recs.length) return emptyState('No reprocessed items found.');

    const headers = ['#', 'Original Batch No', 'JMREF No', 'Part No', 'Reprocess Qty', 'Reprocess Destination', 'Processed By', 'Date'];
    const users = DB.Users.all();
    
    const dataRows = recs.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const user = users.find(u => u.id === r.recordedBy) || {};
      const stageLabelMap = {
        trimming: 'Trimming',
        cryogenic: 'Cryogenic',
        deflashing: 'Manual DE Flashing (Flash Removal)'
      };
      const dateStr = r.date ? formatDate(r.date) : '—';
      return [
        i + 1,
        batch.batchNo || '—',
        batch.jmrefNo || '—',
        batch.partNo || '—',
        r.reprocessQty || 0,
        stageLabelMap[r.reprocessDestination] || r.reprocessDestination || '—',
        user.name || '—',
        dateStr
      ];
    });

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map(r=>`<tr>${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
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

  function renderPendingBatches(filters) {
    const { pendingStage, pendingTimeframe } = filters;
    const batches = DB.Batches.all().filter(b => b.status === 'active');
    const stageRecs = DB.StageRecords.all();
    const master = DB.Master.all();
    const today = new Date();
    today.setHours(0,0,0,0);

    const dataRows = [];
    const headers = ['#', 'Batch No', 'JMREF No', 'Part No', 'Current Stage', 'Current Qty', 'Date Received', 'Days Pending'];

    batches.forEach(b => {
      if (pendingStage && b.currentStage !== pendingStage) return;

      let entryDateStr = '';
      const recs = stageRecs.filter(r => r.batchId === b.id && r.movedTo === b.currentStage)
                            .sort((a, b) => (a.createdAt || a.date || '').localeCompare(b.createdAt || b.date || ''));

      if (recs.length > 0) {
        entryDateStr = recs[recs.length - 1].date || recs[recs.length - 1].createdAt || '';
      } else {
        entryDateStr = b.productionDate || b.createdAt || '';
      }

      if (!entryDateStr) return;

      const entryDate = new Date(entryDateStr.slice(0, 10));
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

    const html = `
      <div style="display:flex; gap:16px; margin-bottom: 20px; flex-wrap:wrap;">
        <div class="stat-card blue" style="flex:1; min-width: 140px;"><div class="stat-label">Pending Batches</div><div class="stat-value blue">${dataRows.length}</div></div>
        <div class="stat-card amber" style="flex:1; min-width: 140px;"><div class="stat-label">Total Pending Quantity</div><div class="stat-value amber">${formatNum(dataRows.reduce((s,r)=>s+r.qty,0))}</div></div>
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
            ${htmlRows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">No pending batches found matching the filters</td></tr>'}
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
    const prodTypeFilter = `
      <div class="form-group mb-0">
        <label class="form-label">Production Type</label>
        <select class="form-control" id="rpt-prod-type">
          <option value="">All Types</option>
          <option value="inhouse">In House</option>
          <option value="subcontractor">Subcontractor</option>
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

    const filterMap = {
      reprocess: [jmrefFilter, dateRange].join(''),
      inventory: jmrefFilter,
      sales:     [jmrefFilter, dateRange].join(''),
      production:[jmrefFilter, opFilter, prodTypeFilter, dateRange].join(''),
      cryogenic: [jmrefFilter, dateRange].join(''),
      deflashing:[jmrefFilter, dateRange].join(''),
      trimming:  [jmrefFilter, dateRange].join(''),
      'post-curing':[jmrefFilter, dateRange].join(''),
      'waiting-visual':[jmrefFilter, dateRange].join(''),
      visual:    [jmrefFilter, dateRange].join(''),
      gauge:     [jmrefFilter, dateRange].join(''),
      rejected:  '',
      recheck:   [opFilter, dateRange].join(''),
      'pending-batches': [pendingStageFilter, pendingTimeframeFilter].join(''),
      'qty-gain': [jmrefFilter, dateRange].join(''),
      'qty-loss': [jmrefFilter, dateRange].join(''),
      'op-efficiency': dateRange,
      'mould-lifecycle': jmrefFilter,
      'cycle-time': dateRange,
      'wip-valuation': '',
      'sub-vs-inhouse': dateRange,
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
      pendingStage: g('rpt-pending-stage'),
      pendingTimeframe: g('rpt-pending-timeframe'),
      prodType: g('rpt-prod-type'),
    };
  }

  // ── Run Report ─────────────────────────────────────────────
  function runReport(reportKey) {
    const filters = collectFilters();
    let result;

    switch(reportKey) {
      case 'reprocess':  result = renderReprocess(filters); break;
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
      case 'pending-batches': result = renderPendingBatches(filters); break;
      case 'qty-gain':        result = renderQtyGainReport(filters); break;
      case 'qty-loss':        result = renderQtyLossReport(filters); break;
      case 'op-efficiency':   result = renderOpEfficiency(filters); break;
      case 'mould-lifecycle': result = renderMouldLifecycle(filters); break;
      case 'cycle-time':      result = renderCycleTime(filters); break;
      case 'wip-valuation':   result = renderWipValuation(filters); break;
      case 'sub-vs-inhouse':  result = renderSubVsInhouse(filters); break;
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
    { key:'reprocess',  label:'🔄 Reprocessed Items Report',   desc:'Chronological list of all batches and quantities sent for reprocessing' },
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
    { key:'pending-batches', label:'⏳ Pending Batch Report',  desc:'Pending batches filtered by stage and timeframe from date Received' },
    { key:'qty-gain',   label:'📈 Quantity Gain Report',       desc:'Stages where the batch output quantity was greater than the input quantity' },
    { key:'qty-loss',   label:'📉 Quality Loss Report',        desc:'Stages where the batch quantity was lost, grouped by batch number' },
    { key:'op-efficiency',  label:'👷 Operator & Inspector Efficiency', desc:'Operator-wise and Inspector-wise output, yield, and defect rates' },
    { key:'mould-lifecycle',label:'⚙️ Mould Lifecycle & Performance',    desc:'Accumulative lift count, output yield, and maintenance alert status per mould' },
    { key:'cycle-time',     label:'⏳ Production Cycle Time & Bottlenecks', desc:'Average hours/days batches spend at each process stage' },
    { key:'wip-valuation',  label:'💰 WIP Inventory Valuation',          desc:'Financial valuation of live inventory based on part sale prices' },
    { key:'sub-vs-inhouse', label:'🏢 Subcontractor vs. In-House Comparison', desc:'Yield, cycle time, and rejection comparison between manufacturing channels' }
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
    if (reportKey === 'pending-batches') runReport(reportKey);
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
