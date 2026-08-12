// ============================================================
// daily-analysis.js — Daily Requirement & WIP Sales Feasibility Analysis
// Purely in-memory analysis engine — Primary Reference Comparison by JMREF
// ============================================================

const DailyAnalysisModule = (() => {
  let uploadedData = []; // Raw parsed rows from Excel
  let analysisResults = null; // Computed comparison results
  let activeTab = 'items'; // 'items', 'wip', 'summary'
  let itemFilterText = '';
  let itemStatusFilter = 'all'; // 'all', 'store_ready', 'wip_ready', 'partial', 'deficit'
  let itemSortField = 'storeRealizableValue'; // default sort by Store Sales
  let itemSortDir = 'desc';
  let wipFilterText = '';
  let wipStageFilter = 'all';

  const STAGE_LABELS_MAP = {
    production: 'Moulding',
    cryogenic: 'Cryogenic',
    deflashing: 'Manual DE Flashing',
    trimming: 'Trimming',
    'post-curing': 'Post Curing',
    'waiting-visual': 'Waiting for Visual',
    visual: 'Visual Inspection',
    gauge: 'Gauge Inspection',
    quality: 'QC Final',
    store: 'Store'
  };

  const STAGE_ORDER = ['quality', 'gauge', 'visual', 'waiting-visual', 'post-curing', 'trimming', 'deflashing', 'cryogenic', 'production'];

  function normJmref(val) {
    if (val == null) return '';
    let s = String(val).trim().toUpperCase();
    s = s.replace(/^JMREF[\s\-_]*/i, '').replace(/^JM[\s\-_]*/i, '');
    return s.trim();
  }

  function cleanKey(val) {
    if (val == null) return '';
    return String(val).trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  function getBatchWipQty(batchId, batch) {
    const recs = (typeof DB !== 'undefined' && DB.StageRecords) ? DB.StageRecords.all().filter(r => r.batchId === batchId) : [];
    if (!recs.length) return (batch && batch.initialQty) ? Number(batch.initialQty) : 0;
    const lastRec = recs[recs.length - 1];
    const qtyVal = Number(lastRec.isRecheck ? lastRec.recheckQty : (lastRec.outputQty != null ? lastRec.outputQty : lastRec.inputQty));
    return (!isNaN(qtyVal) && qtyVal > 0) ? qtyVal : Number(batch.initialQty || 0);
  }

  function findRowValue(row, possibleNames) {
    if (!row || typeof row !== 'object') return '';
    // 1. Direct exact property match
    for (const name of possibleNames) {
      if (row[name] != null && String(row[name]).trim() !== '') return row[name];
    }
    // 2. Normalized key match
    const rowKeys = Object.keys(row);
    for (const name of possibleNames) {
      const cleanTarget = cleanKey(name);
      const foundKey = rowKeys.find(k => cleanKey(k) === cleanTarget);
      if (foundKey && row[foundKey] != null && String(row[foundKey]).trim() !== '') {
        return row[foundKey];
      }
    }
    return '';
  }

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    el.innerHTML = `
      <div class="animate-in">
        <!-- Header -->
        <div class="mb-6 flex justify-between items-center flex-wrap gap-4 no-print">
          <div>
            <h2 class="font-bold" style="font-size:22px; display:flex; align-items:center; gap:8px;">
              <span>📈</span> Daily Requirement &amp; WIP Sales Feasibility Analysis
            </h2>
            <p class="text-sm text-muted mt-1">
              Primary JMREF analysis comparing customer demand with Store Finished Goods and factory Work-in-Progress (WIP).
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn btn-ghost btn-sm" onclick="DailyAnalysisModule.downloadSampleTemplate()" title="Download sample ASN format">
              📥 Sample ASN Template
            </button>
            ${analysisResults ? `
              <button class="btn btn-primary btn-sm" onclick="DailyAnalysisModule.downloadReportExcel()">
                📊 Download Feasibility Report (.xlsx)
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.print()">
                🖨️ Print Report
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Upload Box -->
        <div class="card mb-6 no-print" style="border: 2px dashed var(--border); background: var(--bg-card);">
          <div class="card-body" style="padding: 24px; text-align: center;">
            <div style="max-width: 650px; margin: 0 auto;">
              <div style="font-size: 36px; margin-bottom: 8px;">📑</div>
              <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">Upload Daily Requirement / ASN Excel Sheet</h3>
              <p class="text-xs text-muted mb-4" style="line-height: 1.5;">
                Compares uploaded <strong>JM REF</strong>, <strong>Part No / 10-Digit No</strong> &amp; <strong>price</strong> against live Store FG inventory and active WIP stages.
                <br><span class="badge badge-teal" style="margin-top:4px;">🔒 Read-Only Simulation — Does Not Mutate Database</span>
              </p>
              
              <div style="display: inline-flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center;">
                <input type="file" id="asn-file-input" class="form-control" accept=".xlsx, .xls, .csv" 
                  style="max-width: 320px; font-size: 12.5px;" onchange="DailyAnalysisModule.handleFileUpload(event)">
                ${analysisResults ? `
                  <button class="btn btn-ghost btn-sm text-danger" onclick="DailyAnalysisModule.clearAnalysis()">
                    ✕ Clear Analysis
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Analysis Results Container -->
        <div id="analysis-output-container">
          ${analysisResults ? renderAnalysisView() : renderEmptyState()}
        </div>
      </div>`;
  }

  function renderEmptyState() {
    return `
      <div class="card">
        <div class="card-body text-center" style="padding: 48px 24px;">
          <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.6;">📊</div>
          <h3 class="font-semibold" style="font-size: 16px; margin-bottom: 6px;">No Daily Requirement Sheet Uploaded</h3>
          <p class="text-sm text-muted" style="max-width: 480px; margin: 0 auto 16px;">
            Upload your Daily ASN Excel sheet above to generate instant sales feasibility, see how much can be dispatched today from Store, and view total WIP realization value across your plant.
          </p>
          <button class="btn btn-secondary btn-sm" onclick="DailyAnalysisModule.downloadSampleTemplate()">
            📥 Download Sample ASN Template (.xlsx)
          </button>
        </div>
      </div>`;
  }

  function renderAnalysisView() {
    const summary = analysisResults.summary;

    return `
      <!-- Layman Executive Summary Banner -->
      <div class="card mb-6" style="background: linear-gradient(135deg, rgba(79,142,247,0.1) 0%, rgba(16,185,129,0.08) 100%); border: 1px solid rgba(79,142,247,0.25);">
        <div class="card-body" style="padding: 20px 24px;">
          <div class="flex justify-between items-center flex-wrap gap-4">
            <div>
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--accent-blue); letter-spacing: 0.5px; margin-bottom: 4px;">
                💡 Executive Layman Summary
              </div>
              <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 6px;">
                Customer Demand: ₹${formatCurrency(summary.totalReqValue)} (${formatNum(summary.totalReqQty)} units across ${summary.totalItems} JMREFs)
              </h3>
              <p class="text-sm" style="color: var(--text-secondary); max-width: 800px; line-height: 1.5; margin: 0;">
                You can immediately pack and bill <strong class="text-success">₹${formatCurrency(summary.storeRealizableValue)}</strong> (${formatNum(summary.storeFulfillableQty)} units) from Finished Goods Store right now. 
                Your factory currently has <strong style="color: #a855f7;">₹${formatCurrency(summary.wipTotalValue)}</strong> (${formatNum(summary.wipTotalQty)} units) in active WIP production. 
                ${summary.netShortageQty > 0 ? 
                  `<span class="text-danger font-semibold">Net deficit requiring fresh moulding: ${formatNum(summary.netShortageQty)} units (₹${formatCurrency(summary.netShortageValue)}).</span>` : 
                  `<span class="text-success font-semibold">100% of demand is fully covered by Store + WIP stock!</span>`}
              </p>
            </div>
            <div style="text-align: right; min-width: 160px;">
              <div class="text-xs text-muted">Total Realizable Sales (Store + WIP)</div>
              <div class="font-bold text-blue" style="font-size: 24px;">₹${formatCurrency(summary.totalPossibleSalesValue)}</div>
              <span class="badge ${summary.totalPossiblePct >= 100 ? 'badge-green' : summary.totalPossiblePct >= 60 ? 'badge-teal' : 'badge-amber'} font-bold">
                ${summary.totalPossiblePct.toFixed(1)}% Demand Feasibility
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5 Key KPI Cards -->
      <div class="stats-grid mb-6" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
        <div class="stat-card blue">
          <div class="stat-label">1. Customer Requirement</div>
          <div class="stat-value blue" style="font-size: 22px;">₹${formatCurrency(summary.totalReqValue)}</div>
          <div class="text-xs text-muted mt-1">${formatNum(summary.totalReqQty)} units (${summary.totalItems} JMREFs)</div>
        </div>

        <div class="stat-card green">
          <div class="stat-label">2. Ready in Store (FG)</div>
          <div class="stat-value green" style="font-size: 22px;">₹${formatCurrency(summary.storeRealizableValue)}</div>
          <div class="text-xs text-success font-semibold mt-1">
            ${formatNum(summary.storeFulfillableQty)} units (${summary.storePct.toFixed(1)}% immediate)
          </div>
        </div>

        <div class="stat-card purple">
          <div class="stat-label">3. Total Active WIP Value</div>
          <div class="stat-value purple" style="font-size: 22px;">₹${formatCurrency(summary.wipTotalValue)}</div>
          <div class="text-xs font-semibold mt-1" style="color: #a855f7;">
            ${formatNum(summary.wipTotalQty)} units (${summary.wipActiveBatchesCount} batches in plant)
          </div>
        </div>

        <div class="stat-card teal">
          <div class="stat-label">4. Max Achievable Sales</div>
          <div class="stat-value teal" style="font-size: 22px;">₹${formatCurrency(summary.totalPossibleSalesValue)}</div>
          <div class="text-xs font-semibold mt-1" style="color: var(--accent-teal);">
            ${formatNum(summary.totalFulfillableQty)} units (${summary.totalPossiblePct.toFixed(1)}% achievable)
          </div>
        </div>

        <div class="stat-card red">
          <div class="stat-label">5. Fresh Moulding Deficit</div>
          <div class="stat-value red" style="font-size: 22px;">₹${formatCurrency(summary.netShortageValue)}</div>
          <div class="text-xs text-danger font-semibold mt-1">
            ${formatNum(summary.netShortageQty)} units (${summary.shortagePct.toFixed(1)}% shortfall)
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="tabs no-print" id="analysis-tabs" style="margin-bottom: 16px;">
        <button class="tab-btn ${activeTab==='items'?'active':''}" onclick="DailyAnalysisModule.switchTab('items')">
          📋 Primary JMREF Feasibility Matrix (${analysisResults.items.length})
        </button>
        <button class="tab-btn ${activeTab==='wip'?'active':''}" onclick="DailyAnalysisModule.switchTab('wip')">
          🔥 Value-Prioritized WIP Expediting Queue (${analysisResults.wipBatches.length})
        </button>
        <button class="tab-btn ${activeTab==='summary'?'active':''}" onclick="DailyAnalysisModule.switchTab('summary')">
          📊 Feasibility Dashboard &amp; Bottlenecks
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="analysis-tab-content">
        ${activeTab === 'items' ? renderItemsTab() : (activeTab === 'wip' ? renderWipTab() : renderSummaryTab())}
      </div>`;
  }

  // --- TAB 1: PRIMARY JMREF FEASIBILITY MATRIX ---
  function renderItemsRows() {
    let items = [...analysisResults.items];

    // Search filter
    if (itemFilterText) {
      const q = itemFilterText.toLowerCase().trim();
      items = items.filter(i => 
        (i.jmref || '').toLowerCase().includes(q) ||
        (i.partNo || '').toLowerCase().includes(q) ||
        (i.tenDigitNo || '').toLowerCase().includes(q)
      );
    }

    // Status filter
    if (itemStatusFilter !== 'all') {
      if (itemStatusFilter === 'store_ready') {
        items = items.filter(i => i.storeStock >= i.reqQty);
      } else if (itemStatusFilter === 'wip_ready') {
        items = items.filter(i => i.storeStock < i.reqQty && (i.storeStock + i.wipTotalStock) >= i.reqQty);
      } else if (itemStatusFilter === 'partial') {
        items = items.filter(i => (i.storeStock + i.wipTotalStock) > 0 && (i.storeStock + i.wipTotalStock) < i.reqQty);
      } else if (itemStatusFilter === 'deficit') {
        items = items.filter(i => (i.storeStock + i.wipTotalStock) === 0);
      }
    }

    // Interactive Sorting (Default: storeRealizableValue DESC)
    items.sort((a, b) => {
      let valA = a[itemSortField];
      let valB = b[itemSortField];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return itemSortDir === 'asc' ? -1 : 1;
      if (valA > valB) return itemSortDir === 'asc' ? 1 : -1;
      return 0;
    });

    if (!items.length) {
      return '<tr><td colspan="14" class="text-center text-muted" style="padding:32px;">No items match filter criteria</td></tr>';
    }

    return items.map((i, idx) => {
      let statusBadge = '';
      if (i.storeStock >= i.reqQty) {
        statusBadge = '<span class="badge badge-green">🟢 Store Ready (100%)</span>';
      } else if ((i.storeStock + i.wipTotalStock) >= i.reqQty) {
        statusBadge = '<span class="badge badge-purple" style="background:rgba(168,85,247,0.15); color:#a855f7; border:1px solid rgba(168,85,247,0.3);">🟣 In WIP Pipeline</span>';
      } else if ((i.storeStock + i.wipTotalStock) > 0) {
        statusBadge = '<span class="badge badge-amber">🟡 Partial WIP Coverage</span>';
      } else {
        statusBadge = '<span class="badge badge-red">🔴 Fresh Moulding Needed</span>';
      }

      return `
        <tr>
          <td class="text-muted">${idx + 1}</td>
          <td><span class="badge badge-teal font-semibold" style="font-size:12px;">${i.jmref || '—'}</span></td>
          <td>
            <div class="font-semibold text-blue">${i.partNo || '—'}</div>
            ${i.tenDigitNo && i.tenDigitNo !== i.partNo ? `<div class="text-xs text-muted" style="font-size:11px;">10-Digit: ${i.tenDigitNo}</div>` : ''}
          </td>
          <td style="text-align:right;">₹${Number(i.price || 0).toFixed(2)}</td>
          <td style="text-align:right;" class="font-bold">${formatNum(i.reqQty)}</td>
          <td style="text-align:right;" class="font-semibold">₹${formatCurrency(i.reqValue)}</td>
          
          <!-- Store FG Stock & Sales -->
          <td style="text-align:right; color: #10b981; font-weight:600;">${formatNum(i.storeStock)}</td>
          <td style="text-align:right; color: #10b981; font-weight:700; background:rgba(16,185,129,0.05);">
            ₹${formatCurrency(i.storeRealizableValue)}
          </td>
          
          <!-- Total WIP Stock & Total Value -->
          <td style="text-align:right; color: #a855f7; font-weight:600;">${formatNum(i.wipTotalStock)}</td>
          <td style="text-align:right; color: #a855f7; font-weight:600;">₹${formatCurrency(i.wipTotalValue)}</td>
          
          <!-- Combined Ready & Net Shortfall -->
          <td style="text-align:right; font-weight:700;" class="text-blue">${formatNum(i.totalFactoryReadiness)}</td>
          <td style="text-align:right; font-weight:700;" class="${i.netShortageQty > 0 ? 'text-danger' : 'text-muted'}">${formatNum(i.netShortageQty)}</td>
          <td style="text-align:right; font-weight:700;" class="${i.netShortageValue > 0 ? 'text-danger' : 'text-muted'}">₹${formatCurrency(i.netShortageValue)}</td>
          <td>${statusBadge}</td>
        </tr>`;
    }).join('');
  }

  function renderItemsTab() {
    function sortIcon(field) {
      if (itemSortField !== field) return '<span style="opacity:0.3; margin-left:3px;">⇅</span>';
      return itemSortDir === 'asc' ? '<span style="color:var(--accent-blue); margin-left:3px;">▲</span>' : '<span style="color:var(--accent-blue); margin-left:3px;">▼</span>';
    }

    return `
      <div class="card">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3>Primary JMREF Feasibility Matrix</h3>
            <p class="text-xs text-muted mt-1">
              Mapped by <strong>JMREF as Primary Key</strong> &bull; Sorted by <strong>Store Sales (₹)</strong> descending (${analysisResults.items.length} JMREFs).
            </p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <select class="form-control form-control-sm" style="width:190px; margin:0;" onchange="DailyAnalysisModule.filterItemStatus(this.value)">
              <option value="all" ${itemStatusFilter==='all'?'selected':''}>All Items (${analysisResults.items.length})</option>
              <option value="store_ready" ${itemStatusFilter==='store_ready'?'selected':''}>🟢 100% Store Ready</option>
              <option value="wip_ready" ${itemStatusFilter==='wip_ready'?'selected':''}>🟣 In WIP Pipeline</option>
              <option value="partial" ${itemStatusFilter==='partial'?'selected':''}>🟡 Partial WIP Coverage</option>
              <option value="deficit" ${itemStatusFilter==='deficit'?'selected':''}>🔴 Fresh Moulding Needed</option>
            </select>
            <div class="search-input" style="max-width: 240px; margin:0;">
              <span class="search-icon">🔍</span>
              <input type="text" id="daily-analysis-items-search" class="form-control form-control-sm" placeholder="Search JMREF, Part No, 10-Digit..." 
                value="${itemFilterText}" oninput="DailyAnalysisModule.filterItems(this.value)">
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th style="cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('jmref')">JM REF ${sortIcon('jmref')}</th>
                <th style="cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('partNo')">Part / 10-Digit ${sortIcon('partNo')}</th>
                <th style="text-align:right; cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('price')">Price ${sortIcon('price')}</th>
                <th style="text-align:right; cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('reqQty')">Demand Qty ${sortIcon('reqQty')}</th>
                <th style="text-align:right; cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('reqValue')">Demand ₹ ${sortIcon('reqValue')}</th>
                <th style="text-align:right; color: #10b981; cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('storeStock')">Store FG ${sortIcon('storeStock')}</th>
                <th style="text-align:right; color: #10b981; font-weight:700; cursor:pointer; background:rgba(16,185,129,0.08);" onclick="DailyAnalysisModule.toggleItemSort('storeRealizableValue')">Store Sales ₹ ${sortIcon('storeRealizableValue')}</th>
                <th style="text-align:right; color: #a855f7; cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('wipTotalStock')">Total WIP ${sortIcon('wipTotalStock')}</th>
                <th style="text-align:right; color: #a855f7; cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('wipTotalValue')">WIP Total Value ₹ ${sortIcon('wipTotalValue')}</th>
                <th style="text-align:right; color: var(--accent-blue); cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('totalFactoryReadiness')">Plant Total ${sortIcon('totalFactoryReadiness')}</th>
                <th style="text-align:right; color: var(--accent-red); cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('netShortageQty')">Shortage ${sortIcon('netShortageQty')}</th>
                <th style="text-align:right; color: var(--accent-red); cursor:pointer;" onclick="DailyAnalysisModule.toggleItemSort('netShortageValue')">Deficit ₹ ${sortIcon('netShortageValue')}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="daily-analysis-items-tbody">
              ${renderItemsRows()}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // --- TAB 2: VALUE-PRIORITIZED WIP EXPEDITING QUEUE ---
  function renderWipRows() {
    let batches = analysisResults.wipBatches; // Sorted by recoverableValue DESC

    if (wipFilterText) {
      const q = wipFilterText.toLowerCase().trim();
      batches = batches.filter(b => 
        (b.batchNo || '').toLowerCase().includes(q) ||
        (b.jmref || '').toLowerCase().includes(q) ||
        (b.partNo || '').toLowerCase().includes(q) ||
        (b.tenDigitNo || '').toLowerCase().includes(q) ||
        (STAGE_LABELS_MAP[b.currentStage] || '').toLowerCase().includes(q)
      );
    }

    if (wipStageFilter !== 'all') {
      batches = batches.filter(b => b.currentStage === wipStageFilter);
    }

    if (!batches.length) {
      return '<tr><td colspan="9" class="text-center text-muted" style="padding:32px;">No active WIP batches matching filter criteria</td></tr>';
    }

    return batches.map((b, idx) => {
      const stageLabel = STAGE_LABELS_MAP[b.currentStage] || b.currentStage;
      return `
        <tr>
          <td class="text-muted" style="font-weight:700; width:40px;">#${idx + 1}</td>
          <td class="font-bold text-blue">${b.batchNo}</td>
          <td><span class="badge badge-teal font-semibold">${b.jmref || '—'}</span></td>
          <td>
            <div class="font-semibold">${b.partNo || '—'}</div>
            ${b.tenDigitNo && b.tenDigitNo !== b.partNo ? `<div class="text-xs text-muted" style="font-size:11px;">10-Digit: ${b.tenDigitNo}</div>` : ''}
          </td>
          <td><span class="stage-chip ${b.currentStage}">${stageLabel}</span></td>
          <td style="text-align:right;" class="font-semibold">${formatNum(b.qty)}</td>
          <td style="text-align:right;">₹${b.unitPrice.toFixed(2)}</td>
          <td style="text-align:right;" class="font-bold" style="color:#a855f7; font-size:13.5px;">
            ₹${formatCurrency(b.recoverableValue)}
          </td>
          <td style="text-align:center;">
            <button class="btn btn-ghost btn-xs" onclick="App.routeScannedBatch('${b.batchNo}')" title="Open Batch in ${stageLabel}">
              Open Stage →
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  function renderWipTab() {
    return `
      <div class="card">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3>🔥 Value-Prioritized WIP Expediting Queue (${analysisResults.wipBatches.length} batches)</h3>
            <p class="text-xs text-muted mt-1">
              Ranked in <strong>Descending Order of Sales Value (₹)</strong> — expedite top batches to unlock maximum cash flow.
            </p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <select class="form-control form-control-sm" style="width:160px; margin:0;" onchange="DailyAnalysisModule.filterWipStage(this.value)">
              <option value="all">All Stages</option>
              ${Object.keys(STAGE_LABELS_MAP).filter(st=>st!=='store').map(st => `
                <option value="${st}" ${wipStageFilter===st?'selected':''}>${STAGE_LABELS_MAP[st]}</option>
              `).join('')}
            </select>
            <div class="search-input" style="max-width: 240px; margin:0;">
              <span class="search-icon">🔍</span>
              <input type="text" id="daily-analysis-wip-search" class="form-control form-control-sm" placeholder="Search batch, JMREF, part, 10-digit..." 
                value="${wipFilterText}" oninput="DailyAnalysisModule.filterWip(this.value)">
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Batch No</th>
                <th>JMREF No</th>
                <th>Part / 10-Digit</th>
                <th>Current Department Stage</th>
                <th style="text-align:right;">WIP Qty</th>
                <th style="text-align:right;">Unit Price (₹)</th>
                <th style="text-align:right;">Total Sales Value (₹)</th>
                <th style="text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody id="daily-analysis-wip-tbody">
              ${renderWipRows()}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // --- TAB 3: SUMMARY DASHBOARD ---
  function renderSummaryTab() {
    const summary = analysisResults.summary;
    const items = analysisResults.items;
    
    // Top 8 highest value demands
    const topDemands = [...items].sort((a, b) => b.reqValue - a.reqValue).slice(0, 8);
    // Top 8 highest total WIP value
    const topWipItems = [...items].filter(i => i.wipTotalValue > 0).sort((a, b) => b.wipTotalValue - a.wipTotalValue).slice(0, 8);

    return `
      <div class="grid grid-2 gap-4 mb-6">
        <!-- Fulfillment Ratio Card -->
        <div class="card">
          <div class="card-header"><h3>Demand Fulfillment Capacity Ratio</h3></div>
          <div class="card-body">
            <div style="margin-bottom: 16px;">
              <div class="flex justify-between text-xs font-semibold mb-1">
                <span>Immediate Store FG Ready</span>
                <span class="text-success">${summary.storePct.toFixed(1)}% (₹${formatCurrency(summary.storeRealizableValue)})</span>
              </div>
              <div style="background: var(--bg-input); height: 12px; border-radius: 6px; overflow: hidden;">
                <div style="background: #10b981; width: ${Math.min(100, summary.storePct)}%; height: 100%;"></div>
              </div>
            </div>

            <div style="margin-bottom: 16px;">
              <div class="flex justify-between text-xs font-semibold mb-1">
                <span>WIP Required for Today's Demand</span>
                <span style="color: #a855f7;">${summary.wipDemandPct.toFixed(1)}% (₹${formatCurrency(summary.wipRealizableForDemand)})</span>
              </div>
              <div style="background: var(--bg-input); height: 12px; border-radius: 6px; overflow: hidden;">
                <div style="background: #a855f7; width: ${Math.min(100, summary.wipDemandPct)}%; height: 100%;"></div>
              </div>
            </div>

            <div style="margin-bottom: 20px;">
              <div class="flex justify-between text-xs font-semibold mb-1">
                <span>Combined Demand Feasibility (Store + WIP)</span>
                <span class="text-blue">${summary.totalPossiblePct.toFixed(1)}% (₹${formatCurrency(summary.totalPossibleSalesValue)})</span>
              </div>
              <div style="background: var(--bg-input); height: 12px; border-radius: 6px; overflow: hidden; display: flex;">
                <div style="background: #10b981; width: ${Math.min(100, summary.storePct)}%; height: 100%;" title="Store FG"></div>
                <div style="background: #a855f7; width: ${Math.min(100 - summary.storePct, summary.wipDemandPct)}%; height: 100%;" title="WIP"></div>
              </div>
            </div>

            <div style="padding: 12px; background: rgba(168, 85, 247, 0.08); border-radius: 8px; border: 1px solid rgba(168, 85, 247, 0.25); font-size: 12.5px; line-height: 1.5;">
              🏭 <strong>Factory WIP Insight:</strong> In addition to Store stock, your factory holds 
              <strong style="color:#a855f7;">₹${formatCurrency(summary.wipTotalValue)}</strong> (${formatNum(summary.wipTotalQty)} units) of active WIP across manufacturing departments.
            </div>
          </div>
        </div>

        <!-- WIP Stage Distribution Card -->
        <div class="card">
          <div class="card-header"><h3>Active WIP Inventory by Department Stage</h3></div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Department Stage</th>
                    <th style="text-align:right;">Batches</th>
                    <th style="text-align:right;">WIP Qty</th>
                    <th style="text-align:right;">Total WIP Value (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderStageBreakdownRows()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Demands & High Impact WIP Table -->
      <div class="grid grid-2 gap-4">
        <div class="card">
          <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center;">
            <h3>Top Customer Demands (by Value)</h3>
            <button class="btn btn-ghost btn-xs" onclick="DailyAnalysisModule.switchTab('items')">View All JMREFs →</button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>JMREF</th>
                  <th>Part / 10-Digit</th>
                  <th style="text-align:right;">Req Qty</th>
                  <th style="text-align:right;">Price</th>
                  <th style="text-align:right;">Demand Value (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${topDemands.map(d => `
                  <tr>
                    <td><span class="badge badge-teal font-semibold">${d.jmref || '—'}</span></td>
                    <td class="font-semibold text-blue">
                      ${d.partNo || '—'}
                      ${d.tenDigitNo && d.tenDigitNo !== d.partNo ? `<span class="text-xs text-muted block" style="font-size:11px;">10-Digit: ${d.tenDigitNo}</span>` : ''}
                    </td>
                    <td style="text-align:right;">${formatNum(d.reqQty)}</td>
                    <td style="text-align:right;">₹${Number(d.price || 0).toFixed(2)}</td>
                    <td style="text-align:right;" class="font-bold">₹${formatCurrency(d.reqValue)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center;">
            <h3>Top WIP Value Sitting on Factory Floor</h3>
            <button class="btn btn-ghost btn-xs" onclick="DailyAnalysisModule.switchTab('wip')">Expedite Queue →</button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>JMREF</th>
                  <th>Part / 10-Digit</th>
                  <th style="text-align:right;">WIP Qty</th>
                  <th style="text-align:right;">Total WIP Value (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${topWipItems.length ? topWipItems.map(w => `
                  <tr>
                    <td><span class="badge badge-teal font-semibold">${w.jmref || '—'}</span></td>
                    <td class="font-semibold text-blue">
                      ${w.partNo || '—'}
                      ${w.tenDigitNo && w.tenDigitNo !== w.partNo ? `<span class="text-xs text-muted block" style="font-size:11px;">10-Digit: ${w.tenDigitNo}</span>` : ''}
                    </td>
                    <td style="text-align:right;">${formatNum(w.wipTotalStock)}</td>
                    <td style="text-align:right;" class="font-bold" style="color:#a855f7;">₹${formatCurrency(w.wipTotalValue)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="4" class="text-center text-muted" style="padding:24px;">No active WIP batches found for uploaded JMREFs</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function renderStageBreakdownRows() {
    const stageStats = {};
    Object.keys(STAGE_LABELS_MAP).forEach(st => {
      stageStats[st] = { count: 0, qty: 0, value: 0 };
    });

    analysisResults.wipBatches.forEach(b => {
      const st = b.currentStage || 'production';
      if (!stageStats[st]) stageStats[st] = { count: 0, qty: 0, value: 0 };
      stageStats[st].count++;
      stageStats[st].qty += (b.qty || 0);
      stageStats[st].value += (b.recoverableValue || 0);
    });

    const activeStages = STAGE_ORDER
      .filter(st => stageStats[st] && stageStats[st].count > 0);

    if (!activeStages.length) {
      return '<tr><td colspan="4" class="text-center text-muted" style="padding:24px;">No active WIP batches found for uploaded demand</td></tr>';
    }

    return activeStages.map(st => {
      const s = stageStats[st];
      const stageLabel = STAGE_LABELS_MAP[st] || st;
      return `
        <tr>
          <td><span class="stage-chip ${st}">${stageLabel}</span></td>
          <td style="text-align:right;" class="font-semibold">${s.count}</td>
          <td style="text-align:right;">${formatNum(s.qty)}</td>
          <td style="text-align:right;" class="font-bold" style="color:#a855f7;">₹${formatCurrency(s.value)}</td>
        </tr>`;
    }).join('');
  }

  // --- CALCULATION ENGINE ---
  function processRequirementRows(rawRows) {
    const allBatches = (typeof DB !== 'undefined' && DB.Batches) ? DB.Batches.all() || [] : [];
    const allMaster = (typeof DB !== 'undefined' && DB.Master) ? DB.Master.all() || [] : [];

    // Helper: Build Master Part lookup maps
    const masterById = {};
    const masterByJmref = {};
    const masterByPartNo = {};
    const masterByTenDigit = {};

    allMaster.forEach(m => {
      if (m.id) masterById[m.id] = m;
      if (m.jmrefNo) {
        masterByJmref[normJmref(m.jmrefNo)] = m;
        masterByJmref[cleanKey(m.jmrefNo)] = m;
      }
      if (m.partNo) {
        masterByPartNo[cleanKey(m.partNo)] = m;
        masterByPartNo[String(m.partNo).trim().toUpperCase()] = m;
      }
      if (m.tenDigitNo) {
        masterByTenDigit[cleanKey(m.tenDigitNo)] = m;
        masterByTenDigit[String(m.tenDigitNo).trim().toUpperCase()] = m;
      }
      if (m.custPartNo) {
        masterByPartNo[cleanKey(m.custPartNo)] = m;
      }
      if (m.drawingNo) {
        masterByPartNo[cleanKey(m.drawingNo)] = m;
      }
    });

    // Helper: Multi-strategy Master resolver for any part or JMREF
    function resolveMasterPart(partStr, jmrefStr, tenStr) {
      const jKey = normJmref(jmrefStr) || cleanKey(jmrefStr);
      const pKey = cleanKey(partStr);
      const tKey = cleanKey(tenStr);

      // 1. Match Master by JMREF
      if (jKey && masterByJmref[jKey]) return masterByJmref[jKey];
      
      // 2. Match Master by Part No or 10-Digit
      if (pKey && masterByPartNo[pKey]) return masterByPartNo[pKey];
      if (pKey && masterByTenDigit[pKey]) return masterByTenDigit[pKey];
      if (tKey && masterByTenDigit[tKey]) return masterByTenDigit[tKey];
      if (tKey && masterByPartNo[tKey]) return masterByPartNo[tKey];

      // 3. Substring across Master
      if (pKey) {
        const foundM = allMaster.find(m => 
          cleanKey(m.partNo) === pKey || 
          cleanKey(m.tenDigitNo) === pKey || 
          cleanKey(m.jmrefNo) === pKey ||
          cleanKey(m.description).includes(pKey) ||
          cleanKey(m.custPartNo) === pKey
        );
        if (foundM) return foundM;
      }

      // 4. Batch lookup
      if (pKey || jKey) {
        const foundB = allBatches.find(b => 
          (pKey && (cleanKey(b.partNo) === pKey || cleanKey(b.tenDigitNo) === pKey)) ||
          (jKey && (cleanKey(b.jmrefNo) === jKey || normJmref(b.jmrefNo) === jKey))
        );
        if (foundB) {
          const mFromB = masterById[foundB.partId] || {};
          return {
            jmrefNo: foundB.jmrefNo || mFromB.jmrefNo || '',
            partNo: foundB.partNo || mFromB.partNo || partStr,
            tenDigitNo: foundB.tenDigitNo || mFromB.tenDigitNo || (partStr.length === 10 ? partStr : '')
          };
        }
      }

      return null;
    }

    // Helper: Exact Store Stock calculator for a given JMREF (Matches Store Stock & Inventory Reports)
    function getStoreStockForJmref(targetJmref, targetPartNo, targetTenDigit) {
      if (typeof DB !== 'undefined' && DB.StoreInventory && typeof DB.StoreInventory.availableByJmref === 'function') {
        const resolved = resolveMasterPart(targetPartNo, targetJmref, targetTenDigit);
        const partId = resolved ? resolved.id : null;
        return DB.StoreInventory.availableByJmref(targetJmref, partId);
      }
      return 0;
    }

    // Helper: Exact WIP Batches calculator for a given JMREF
    function getWipBatchesForJmref(targetJmref, targetPartNo, targetTenDigit) {
      const normJ = normJmref(targetJmref);
      const cleanJ = cleanKey(targetJmref);
      const cleanP = cleanKey(targetPartNo);
      const cleanT = cleanKey(targetTenDigit);

      const matchedBatches = allBatches.filter(b => {
        if (b.status === 'completed' || b.status === 'rejected' || b.currentStage === 'store') return false;

        // 1. Direct JMREF match (Priority #1)
        if (b.jmrefNo) {
          const bNorm = normJmref(b.jmrefNo);
          const bClean = cleanKey(b.jmrefNo);
          if (normJ && (bNorm === normJ || bClean === cleanJ)) return true;
        }

        // 2. PartId Master lookup JMREF match
        if (b.partId && masterById[b.partId]) {
          const mJm = masterById[b.partId].jmrefNo;
          if (mJm && normJ && (normJmref(mJm) === normJ || cleanKey(mJm) === cleanJ)) return true;
        }

        // 3. Fallback: if no JMREF match, match partNo / tenDigit only if targetJmref was not specified
        if (!normJ && cleanP && b.partNo && cleanKey(b.partNo) === cleanP) return true;
        if (!normJ && cleanT && b.tenDigitNo && cleanKey(b.tenDigitNo) === cleanT) return true;

        return false;
      });

      return matchedBatches.map(b => {
        const qty = getBatchWipQty(b.id, b);
        return { ...b, wipQty: qty };
      });
    }

    // Group and aggregate uploaded rows primarily by unique JMREF
    const groupedDemands = {}; // key: primaryKey

    rawRows.forEach((row) => {
      const jmrefRaw = findRowValue(row, ['JM REF', 'JMREF', 'JMREF No', 'JM Ref', 'Item Code', 'jmref', 'JM_REF', 'JM.REF']);
      const partNoRaw = findRowValue(row, [
        'PART NUMBER', 'Part No', 'PART NO', 'Part Number', '10 Digit No', '10 Digit', '10-Digit No', 
        '10-digit no', '10 Digit Number', '10 DIGIT NO', '10Digit', 'Ten Digit No', 'Part', 'Item Code', 'Material Code'
      ]);
      const tenDigitRaw = findRowValue(row, ['10 Digit No', '10 Digit', '10-Digit No', '10-digit no', '10 Digit Number', '10 DIGIT NO', '10Digit', 'Ten Digit No']);

      if (!jmrefRaw && !partNoRaw && !tenDigitRaw) return;

      const jmrefStr = String(jmrefRaw || '').trim();
      const partNoStr = String(partNoRaw || '').trim();
      const tenDigitStr = String(tenDigitRaw || '').trim();

      // Skip summary / footer rows
      if (jmrefStr.toLowerCase().includes('grand total') || jmrefStr.toLowerCase().includes('total') || partNoStr.toLowerCase().includes('grand total')) {
        return;
      }

      // Resolve Master Part
      const resolved = resolveMasterPart(partNoStr, jmrefStr, tenDigitStr);
      
      const canonicalJmref = (resolved && resolved.jmrefNo) ? resolved.jmrefNo : (jmrefStr || partNoStr || tenDigitStr);
      const canonicalPartNo = (resolved && resolved.partNo) ? resolved.partNo : (partNoStr || jmrefStr);
      const canonicalTenDigit = (resolved && resolved.tenDigitNo) ? resolved.tenDigitNo : (tenDigitStr || (partNoStr.length === 10 ? partNoStr : ''));
      
      const primaryKey = normJmref(canonicalJmref) || cleanKey(canonicalJmref) || cleanKey(canonicalPartNo) || cleanKey(canonicalTenDigit);

      if (!primaryKey) return;

      // Extract Quantity
      let reqQty = 0;
      const grandTotalVal = findRowValue(row, ['Grand Total', 'GrandTotal', 'Total Qty', 'Total Quantity', 'Total']);
      const reqVal = findRowValue(row, ['Requirement', 'Required Qty', 'Demand', 'Qty', 'Quantity', 'ASN Qty', 'Dispatch Qty']);
      
      if (grandTotalVal !== '' && !isNaN(Number(grandTotalVal))) {
        reqQty = Number(grandTotalVal);
      } else if (reqVal !== '' && !isNaN(Number(reqVal))) {
        reqQty = Number(reqVal);
      } else {
        // Sum any numeric location columns
        Object.keys(row).forEach(k => {
          const val = Number(row[k]);
          const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!isNaN(val) && val > 0 && !['price', 'value', 'rate', 'unitprice', 'slno', 'sno', 'jmref', 'partnumber', 'tendigitno', 'partno'].includes(kClean)) {
            reqQty += val;
          }
        });
      }

      // Extract Price
      let unitPrice = 0;
      const priceVal = findRowValue(row, ['price', 'Price', 'Sale Price', 'Rate', 'Unit Price', 'Selling Price', 'Unit Rate', 'Price (INR)']);
      if (priceVal !== '' && !isNaN(Number(priceVal))) {
        unitPrice = Number(priceVal);
      } else if (resolved && resolved.salePrice && !isNaN(Number(resolved.salePrice))) {
        unitPrice = Number(resolved.salePrice);
      }

      if (reqQty <= 0 && unitPrice <= 0) return;

      if (!groupedDemands[primaryKey]) {
        groupedDemands[primaryKey] = {
          jmref: canonicalJmref,
          partNo: canonicalPartNo,
          tenDigitNo: canonicalTenDigit,
          price: unitPrice,
          reqQty: 0
        };
      }

      groupedDemands[primaryKey].reqQty += reqQty;
      if (unitPrice > 0) groupedDemands[primaryKey].price = unitPrice;
      if (canonicalTenDigit && !groupedDemands[primaryKey].tenDigitNo) {
        groupedDemands[primaryKey].tenDigitNo = canonicalTenDigit;
      }
    });

    const parsedItems = [];
    const prioritizedWipBatches = [];
    const processedBatchIds = new Set();

    let totalReqQty = 0;
    let totalReqValue = 0;
    let totalStoreSalesValue = 0;
    let totalStoreFulfillableQty = 0;
    let totalWipStockQty = 0;
    let totalWipStockValue = 0;
    let totalWipFulfillableQty = 0;
    let totalWipDemandSalesValue = 0;
    let totalShortageQty = 0;
    let totalShortageValue = 0;

    Object.values(groupedDemands).forEach(d => {
      const { jmref, partNo, tenDigitNo, price: unitPrice, reqQty } = d;
      if (reqQty <= 0 && unitPrice <= 0) return;

      const reqValue = reqQty * unitPrice;

      // 1. Direct Store Stock Available for this exact JMREF
      const storeStock = getStoreStockForJmref(jmref, partNo, tenDigitNo);
      const storeFulfillableQty = Math.min(storeStock, reqQty);
      const storeRealizableValue = storeFulfillableQty * unitPrice;
      const shortageAfterStore = Math.max(0, reqQty - storeFulfillableQty);

      // 2. Direct WIP Batches & Total Realization Value for this exact JMREF
      const wipList = getWipBatchesForJmref(jmref, partNo, tenDigitNo);
      const wipTotalStock = wipList.reduce((sum, b) => sum + (b.wipQty || 0), 0);
      const wipTotalValue = wipTotalStock * unitPrice; // Total sales value of all WIP stock in factory
      
      // WIP applied specifically to today's demand
      const wipNeededForDemand = Math.min(wipTotalStock, shortageAfterStore);
      const wipRealizableForDemand = wipNeededForDemand * unitPrice;

      // 3. Combined Readiness & Net Shortage
      const totalFactoryReadiness = storeStock + wipTotalStock;
      const totalFulfillableForDemand = storeFulfillableQty + wipNeededForDemand;
      const netShortageQty = Math.max(0, reqQty - totalFactoryReadiness);
      const netShortageValue = netShortageQty * unitPrice;

      // Collect Primary JMREF record
      parsedItems.push({
        jmref,
        partNo,
        tenDigitNo,
        price: unitPrice,
        reqQty,
        reqValue,
        storeStock,
        storeFulfillableQty,
        storeRealizableValue,
        wipTotalStock,
        wipTotalValue,
        wipNeededForDemand,
        wipRealizableForDemand,
        totalFactoryReadiness,
        totalFulfillableForDemand,
        netShortageQty,
        netShortageValue
      });

      // Collect individual active WIP batches for value-prioritized sorting
      wipList.forEach(b => {
        if (!processedBatchIds.has(b.id)) {
          processedBatchIds.add(b.id);
          const bQty = b.wipQty || 0;
          const recoverableValue = bQty * unitPrice;
          prioritizedWipBatches.push({
            batchId: b.id,
            batchNo: b.batchNo,
            internalBatchNo: b.internalBatchNo,
            jmref,
            partNo,
            tenDigitNo: tenDigitNo || b.tenDigitNo || '',
            currentStage: b.currentStage,
            qty: bQty,
            unitPrice,
            recoverableValue
          });
        }
      });

      // Accumulate totals
      totalReqQty += reqQty;
      totalReqValue += reqValue;
      totalStoreFulfillableQty += storeFulfillableQty;
      totalStoreSalesValue += storeRealizableValue;
      totalWipStockQty += wipTotalStock;
      totalWipStockValue += wipTotalValue;
      totalWipFulfillableQty += wipNeededForDemand;
      totalWipDemandSalesValue += wipRealizableForDemand;
      totalShortageQty += netShortageQty;
      totalShortageValue += netShortageValue;
    });

    // Default: Sort parsedItems by Store Sales (storeRealizableValue) DESCENDING
    parsedItems.sort((a, b) => b.storeRealizableValue - a.storeRealizableValue || b.reqValue - a.reqValue);

    // Sort WIP batches by recoverableValue DESCENDING (Value-based prioritization)
    prioritizedWipBatches.sort((a, b) => b.recoverableValue - a.recoverableValue);

    const totalFulfillableQty = totalStoreFulfillableQty + totalWipFulfillableQty;
    const totalPossibleSalesValue = totalStoreSalesValue + totalWipDemandSalesValue;

    const summary = {
      totalItems: parsedItems.length,
      totalReqQty,
      totalReqValue,
      storeFulfillableQty: totalStoreFulfillableQty,
      storeRealizableValue: totalStoreSalesValue,
      storePct: totalReqValue > 0 ? (totalStoreSalesValue / totalReqValue) * 100 : 0,
      wipTotalQty: totalWipStockQty,
      wipTotalValue: totalWipStockValue,
      wipActiveBatchesCount: prioritizedWipBatches.length,
      wipFulfillableForDemand: totalWipFulfillableQty,
      wipRealizableForDemand: totalWipDemandSalesValue,
      wipDemandPct: totalReqValue > 0 ? (totalWipDemandSalesValue / totalReqValue) * 100 : 0,
      totalFulfillableQty,
      totalPossibleSalesValue,
      totalPossiblePct: totalReqValue > 0 ? (totalPossibleSalesValue / totalReqValue) * 100 : 0,
      netShortageQty: totalShortageQty,
      netShortageValue: totalShortageValue,
      shortagePct: totalReqValue > 0 ? (totalShortageValue / totalReqValue) * 100 : 0
    };

    return {
      summary,
      items: parsedItems,
      wipBatches: prioritizedWipBatches
    };
  }

  // --- FILE HANDLERS & EXCEL IO ---
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      showToast('Excel library loading, please wait...', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: 0 });

        if (!rawJson || !rawJson.length) {
          showToast('No rows found in uploaded sheet', 'error');
          return;
        }

        uploadedData = rawJson;
        analysisResults = processRequirementRows(rawJson);
        showToast(`Analyzed ${analysisResults.items.length} primary JMREFs successfully`, 'success');
        render();
      } catch (err) {
        console.error('File parse error:', err);
        showToast('Error reading Excel: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadSampleTemplate() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded', 'error');
      return;
    }

    const headers = ['JM REF', 'PART NUMBER', '10 Digit No', 'AMBATUR', 'JSR OE', 'JSR SPARE', 'LUCKNOW OE', 'LUCKNOW SPARE', 'Grand Total', 'price', 'value'];
    const rows = [
      ['2123', '10051150', '1005115000', 1000, 0, 0, 0, 0, 1000, 0.72, 720],
      ['2128', '10051190', '1005119000', 594, 0, 0, 0, 0, 594, 1.13, 671.22],
      ['2135', '10051210', '1005121000', 828, 0, 0, 0, 0, 828, 0.8, 662.4],
      ['2136', '10051240', '1005124000', 0, 1512, 0, 0, 0, 1512, 0.8, 1209.6],
      ['2138', '10051400', '1005140000', 5582, 0, 0, 0, 0, 5582, 0.72, 4019.04],
      ['2142', '10051010', '1005101000', 1160, 0, 0, 0, 0, 1160, 0.86, 997.6],
      ['2183', '10050210', '1005021000', 3200, 5000, 12594, 0, 0, 20794, 2.41, 50113.54],
      ['2184', '10051080', '1005108000', 2568, 0, 1020, 0, 3850, 7438, 0.77, 5727.26],
      ['2185', '10051280', '1005128000', 817, 0, 0, 0, 0, 817, 2.18, 1781.06],
      ['2186', '10051300', '1005130000', 1531, 0, 0, 0, 0, 1531, 0.91, 1393.21],
      ['2195', '10051640', '1005164000', 1200, 0, 3376, 0, 0, 4576, 2.78, 12721.28],
      ['2204', '10051920', '1005192000', 28991, 10987, 1194, 0, 0, 41172, 1.03, 42407.16],
      ['7149', '100232500', '100232500', 2141, 10740, 0, 1290, 0, 14171, 4.84, 68587.64],
      ['7344', '8970801454', '8970801454', 4234, 0, 767, 0, 5000, 10001, 1.30, 13001.30]
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily ASN Template');
    XLSX.writeFile(wb, `Daily_ASN_Requirement_Template.xlsx`);
    showToast('Sample ASN template downloaded', 'success');
  }

  function downloadReportExcel() {
    if (!analysisResults || typeof XLSX === 'undefined') {
      showToast('No analysis available to export', 'warning');
      return;
    }

    const summary = analysisResults.summary;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Summary
    const summaryData = [
      ['JMPL INVENTORY TRACKING — DAILY REQUIREMENT & SALES FEASIBILITY REPORT'],
      ['Generated On', new Date().toLocaleString('en-IN')],
      [''],
      ['METRIC', 'QUANTITY (UNITS)', 'VALUE (INR)', 'PERCENTAGE (%)'],
      ['1. Total Customer Demand', summary.totalReqQty, summary.totalReqValue, '100.0%'],
      ['2. Ready in Store (FG Stock)', summary.storeFulfillableQty, summary.storeRealizableValue, summary.storePct.toFixed(1) + '%'],
      ['3. Total Active WIP on Floor', summary.wipTotalQty, summary.wipTotalValue, '—'],
      ['4. WIP Required for Demand', summary.wipFulfillableForDemand, summary.wipRealizableForDemand, summary.wipDemandPct.toFixed(1) + '%'],
      ['5. Total Achievable Sales (Store + WIP)', summary.totalFulfillableQty, summary.totalPossibleSalesValue, summary.totalPossiblePct.toFixed(1) + '%'],
      ['6. Net Fresh Moulding Deficit', summary.netShortageQty, summary.netShortageValue, summary.shortagePct.toFixed(1) + '%']
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

    // Sheet 2: Item Level Feasibility Breakdown (Sorted by Store Sales DESC)
    const itemHeaders = [
      'JM REF (Primary Key)', 'Part Number', '10 Digit No', 'Unit Price (INR)', 'Demand Qty', 'Demand Value (INR)',
      'Store FG Stock', 'Store Realizable Sales (INR)', 'Total Plant WIP Stock', 'Total WIP Value (INR)',
      'Total Plant Readiness', 'Net Shortage Qty', 'Deficit Value (INR)', 'Status'
    ];
    const sortedItems = [...analysisResults.items].sort((a, b) => b.storeRealizableValue - a.storeRealizableValue || b.reqValue - a.reqValue);
    const itemRows = sortedItems.map(i => [
      i.jmref || '—',
      i.partNo || '—',
      i.tenDigitNo || '—',
      i.price,
      i.reqQty,
      i.reqValue,
      i.storeStock,
      i.storeRealizableValue,
      i.wipTotalStock,
      i.wipTotalValue,
      i.totalFactoryReadiness,
      i.netShortageQty,
      i.netShortageValue,
      i.storeStock >= i.reqQty ? 'Store Ready' : ((i.storeStock + i.wipTotalStock) >= i.reqQty ? 'In WIP Pipeline' : ((i.storeStock + i.wipTotalStock) > 0 ? 'Partial WIP' : 'Deficit'))
    ]);
    const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
    XLSX.utils.book_append_sheet(wb, wsItems, 'Primary JMREF Matrix');

    // Sheet 3: Value-Prioritized WIP Expediting Queue
    const wipHeaders = ['Rank', 'Batch No', 'Internal Batch No', 'JM REF', 'Part Number', '10 Digit No', 'Current Stage', 'WIP Qty', 'Unit Price (INR)', 'Total Sales Value (INR)'];
    const wipRows = analysisResults.wipBatches.map((b, idx) => [
      idx + 1,
      b.batchNo,
      b.internalBatchNo != null ? b.internalBatchNo : '—',
      b.jmref || '—',
      b.partNo || '—',
      b.tenDigitNo || '—',
      STAGE_LABELS_MAP[b.currentStage] || b.currentStage,
      b.qty,
      b.unitPrice,
      b.recoverableValue
    ]);
    const wsWip = XLSX.utils.aoa_to_sheet([wipHeaders, ...wipRows]);
    XLSX.utils.book_append_sheet(wb, wsWip, 'WIP Expedite Queue');

    XLSX.writeFile(wb, `JMPL_Daily_Requirement_Feasibility_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Feasibility analysis report downloaded', 'success');
  }

  // --- UI CONTROLS ---
  function switchTab(tab) {
    activeTab = tab;
    const content = document.getElementById('analysis-tab-content');
    if (content) {
      document.querySelectorAll('#analysis-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`#analysis-tabs button[onclick*="${tab}"]`)?.classList.add('active');
      content.innerHTML = tab === 'items' ? renderItemsTab() : (tab === 'wip' ? renderWipTab() : renderSummaryTab());
    }
  }

  function filterItems(val) {
    itemFilterText = val;
    const tbody = document.getElementById('daily-analysis-items-tbody');
    if (tbody) {
      tbody.innerHTML = renderItemsRows();
    } else {
      const content = document.getElementById('analysis-tab-content');
      if (content && activeTab === 'items') {
        content.innerHTML = renderItemsTab();
      }
    }
  }

  function filterItemStatus(val) {
    itemStatusFilter = val;
    const tbody = document.getElementById('daily-analysis-items-tbody');
    if (tbody) {
      tbody.innerHTML = renderItemsRows();
    } else {
      const content = document.getElementById('analysis-tab-content');
      if (content && activeTab === 'items') {
        content.innerHTML = renderItemsTab();
      }
    }
  }

  function toggleItemSort(field) {
    if (itemSortField === field) {
      itemSortDir = itemSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      itemSortField = field;
      itemSortDir = 'desc';
    }
    const content = document.getElementById('analysis-tab-content');
    if (content && activeTab === 'items') {
      content.innerHTML = renderItemsTab();
    }
  }

  function filterWip(val) {
    wipFilterText = val;
    const tbody = document.getElementById('daily-analysis-wip-tbody');
    if (tbody) {
      tbody.innerHTML = renderWipRows();
    } else {
      const content = document.getElementById('analysis-tab-content');
      if (content && activeTab === 'wip') {
        content.innerHTML = renderWipTab();
      }
    }
  }

  function filterWipStage(val) {
    wipStageFilter = val;
    const tbody = document.getElementById('daily-analysis-wip-tbody');
    if (tbody) {
      tbody.innerHTML = renderWipRows();
    } else {
      const content = document.getElementById('analysis-tab-content');
      if (content && activeTab === 'wip') {
        content.innerHTML = renderWipTab();
      }
    }
  }

  function clearAnalysis() {
    uploadedData = [];
    analysisResults = null;
    const inp = document.getElementById('asn-file-input');
    if (inp) inp.value = '';
    render();
    showToast('Analysis cleared', 'info');
  }

  function formatCurrency(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }

  return {
    render,
    handleFileUpload,
    downloadSampleTemplate,
    downloadReportExcel,
    switchTab,
    filterItems,
    filterItemStatus,
    toggleItemSort,
    filterWip,
    filterWipStage,
    clearAnalysis
  };
})();

window.DailyAnalysisModule = DailyAnalysisModule;
