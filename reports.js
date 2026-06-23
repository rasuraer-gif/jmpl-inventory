// ============================================================
// reports.js — JMPL Inventory Tracking System
// All 10 reports with filtering, CSV and Excel export
// ============================================================
/* global DB, Auth, showToast, formatDate, formatNum, XLSX */

const ReportsModule = (() => {

  const MODULES = [
    'inventory','sales','production','cryogenic','deflashing',
    'trimming','visual','gauge','rejected','recheck'
  ];

  const STAGE_LABELS = {
    production:'Production', cryogenic:'Cryogenic', deflashing:'Manual DE Flashing',
    trimming:'Trimming', visual:'Visual', gauge:'Gauge', quality:'Quality Final', store:'Store'
  };

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
    const stages = ['production','cryogenic','deflashing','trimming','visual','gauge','quality','store'];

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
    const headers = ['#','JMREF No','Part No','Description','Qty Sold','Sale Date','Notes'];
    const dataRows = sales.sort((a,b)=>b.saleDate.localeCompare(a.saleDate)).map((s, i) => {
      const part = master.find(m => m.jmrefNo === s.jmrefNo) || {};
      return [i+1, s.jmrefNo, part.partNo||'', part.description||'', s.qty, s.saleDate, s.notes||''];
    });

    const totalQty = dataRows.reduce((sum, r) => sum + (r[4]||0), 0);
    dataRows.push(['','','','TOTAL', totalQty, '', '']);

    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map((r,i) => `<tr class="${i===dataRows.length-1?'font-bold':''}">${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
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

  // ── Generic Stage Loss Report ──────────────────────────────
  function renderStageLoss(stage, filters, extraCols=[]) {
    const { from, to, jmref } = filters;
    let losses = DB.LossTracker.byStage(stage);
    if (jmref) losses = losses.filter(l => l.jmrefNo?.toLowerCase().includes(jmref.toLowerCase()));
    losses = filterByDateRange(losses, 'date', from, to);
    if (!losses.length) return emptyState();

    const stageRecs = DB.StageRecords.all();
    const headers = ['#','Batch No','JMREF','Part No','Input Qty','Output Qty','Loss Qty','Date', ...extraCols];
    const dataRows = losses.map((l, i) => {
      const batch = DB.Batches.find(l.batchId) || {};
      const sr = stageRecs.find(r => r.batchId === l.batchId && r.stage === stage);
      const extra = extraCols.map(col => {
        if (col === 'Inspector') return sr?.inspectorName || '-';
        if (col === 'Recheck #') return l.iterationNo || '-';
        return '-';
      });
      return [i+1, batch.batchNo||'', l.jmrefNo||'', l.partNo||'', sr?.inputQty||'', sr?.outputQty||'', l.lossQty||0, (l.date||'').slice(0,10), ...extra];
    });

    const totalLoss = losses.reduce((s, l) => s + (l.lossQty||0), 0);
    const summaryRow = ['','','','','','TOTAL LOSS', totalLoss,'', ...extraCols.map(()=>'')];
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
    const headers = ['#','Batch No','JMREF','Sent To Stage','Qty','Loss At QF','Recheck #','Recorded By','Date'];
    const dataRows = rechecks.map((r, i) => {
      const batch = DB.Batches.find(r.batchId) || {};
      const user = users.find(u => u.id === r.recordedBy) || {};
      return [i+1, batch.batchNo||'', batch.jmrefNo||'', STAGE_LABELS[r.toStage]||r.toStage, r.qty||0, r.lossQty||0, r.recheckNo||1, user.name||'-', (r.date||'').slice(0,10)];
    });
    const html = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${headers.map(th).join('')}</tr></thead>
      <tbody>${dataRows.map(r=>`<tr>${r.map(v=>td(v)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
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
      case 'visual':     result = renderStageLoss('visual', filters, ['Inspector']); break;
      case 'gauge':      result = renderStageLoss('gauge', filters); break;
      case 'rejected':   result = renderRejected(); break;
      case 'recheck':    result = renderRecheck(filters); break;
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
    { key:'visual',     label:'👁️ Visual Inspection Report',   desc:'Inspector-wise loss and inspection records' },
    { key:'gauge',      label:'📏 Gauge Inspection Report',    desc:'Loss during gauge inspection' },
    { key:'rejected',   label:'🚫 Rejected Batch Report',      desc:'All batches rejected due to quality issues' },
    { key:'recheck',    label:'🔄 Quality Final Recheck',      desc:'Date-wise and operator-wise recheck tracking' },
  ];

  // ── Render ────────────────────────────────────────────────
  function render() {
    const session = Auth.getSession();
    const el = document.getElementById('content');
    if (!el) return;

    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="font-bold" style="font-size:20px;">Reports &amp; Analytics</h2>
            <p class="text-sm text-muted mt-1">Generate, filter and export all reports</p>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:280px 1fr;gap:24px;align-items:start;">

          <!-- Report Selector -->
          <div class="card" style="position:sticky;top:80px;">
            <div class="card-header"><h3>📊 Select Report</h3></div>
            <div style="padding:8px 0;">
              ${REPORTS.map(r => `
                <button class="nav-item report-nav-btn w-full" data-report="${r.key}" id="rpt-nav-${r.key}">
                  <span style="font-size:15px;">${r.label.split(' ')[0]}</span>
                  <div style="flex:1;text-align:left;">
                    <div style="font-size:13px;font-weight:600;">${r.label.split(' ').slice(1).join(' ')}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${r.desc}</div>
                  </div>
                </button>`).join('')}
            </div>
          </div>

          <!-- Report Content -->
          <div id="report-area">
            <div class="card" style="text-align:center;padding:60px 20px;">
              <div style="font-size:48px;margin-bottom:16px;">📊</div>
              <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">Select a Report</h3>
              <p class="text-muted text-sm">Choose a report from the list on the left to get started</p>
            </div>
          </div>
        </div>
      </div>`;

    // Attach nav clicks
    document.querySelectorAll('.report-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.report-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadReport(btn.dataset.report);
      });
    });
  }

  function loadReport(reportKey) {
    const report = REPORTS.find(r => r.key === reportKey);
    if (!report) return;

    const area = document.getElementById('report-area');
    if (!area) return;

    area.innerHTML = `
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
          <div class="filter-bar" id="rpt-filters" style="flex-wrap:wrap;gap:12px;margin-bottom:24px;">
            ${buildFilters(reportKey)}
            <div class="form-group mb-0" style="display:flex;align-items:flex-end;">
              <button class="btn btn-primary" id="rpt-run-btn">🔍 Generate Report</button>
            </div>
          </div>
          <div id="report-output">
            <div class="empty-state"><div class="empty-icon">🔍</div><p>Set filters and click Generate Report</p></div>
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

  return { render };
})();
