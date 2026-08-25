// ============================================================
// stock.js — Monthly Stock Upload & Reconciliation Module (Admin Only)
// ============================================================
const StockModule = (() => {
  const STAGE_LABELS = { 
    production: 'Production', 
    cryogenic: 'Cryogenic', 
    deflashing: 'Manual DE Flashing', 
    'waiting-trimming': 'Waiting for Trimming',
    trimming: 'Trimming', 
    'post-curing': 'Post Curing',
    'waiting-visual': 'Waiting for Visual',
    visual: 'Visual Inspection', 
    gauge: 'Gauge Inspection', 
    quality: 'Quality Final', 
    store: 'Store' 
  };

  let activeTab = 'single'; // 'single', 'bulk', 'compare', 'batch_bulk', 'batch_confirm', 'batch_success'
  let parsedAdjustments = []; // Holds all parsed stage count adjustments
  let uniqueJmrefs = []; // Holds list of unique JMREF codes in the upload
  let currentJmrefIndex = 0; // Current wizard index in uniqueJmrefs
  let historySearch = '';
  let parsedBatchUploads = []; // Holds parsed rows for batch upload
  let lastCreatedBatchIds = []; // Holds IDs of batches created in the current session
  let currentPage = 1;
  const itemsPerPage = 50;

  function getActualStock(partId, jmrefNo, stage) {
    const batches = DB.Batches.all();
    const stageRecords = DB.StageRecords.all();

    if (stage === 'store') {
      return DB.StoreInventory.availableByJmref(jmrefNo);
    }

    const active = batches.filter(b => b.partId === partId && b.currentStage === stage && b.status === 'active');
    return active.reduce((sum, b) => {
      const incoming = stageRecords.filter(r => r.batchId === b.id && r.movedTo === stage);
      if (incoming.length) {
        return sum + (incoming[incoming.length - 1].outputQty || 0);
      }
      return sum + (b.initialQty || 0);
    }, 0);
  }

  function render() {
    currentPage = 1;
    const el = document.getElementById('content');
    if (!el) return;

    if (activeTab === 'compare') {
      renderCompareScreen(el);
      return;
    }
    if (activeTab === 'batch_confirm') {
      renderBatchConfirmScreen(el);
      return;
    }
    if (activeTab === 'batch_success') {
      renderBatchSuccessScreen(el);
      return;
    }

    const isAdmin = Auth.isAdmin();
    const master = DB.Master.all();
    const partOpts = master.map(m=>'<option value="' + m.id + '" data-jmref="' + m.jmrefNo + '">' + m.partNo + ' — ' + m.jmrefNo + '</option>').join('');

    let activeFormHtml = '';
    if (activeTab === 'single') {
      activeFormHtml = renderSingleTab(partOpts);
    } else if (activeTab === 'bulk') {
      activeFormHtml = renderBulkTab();
    } else if (activeTab === 'batch_bulk') {
      activeFormHtml = renderBatchBulkTab();
    }

    const formHtml = isAdmin ? `
      <div id="stock-upload-forms">
        ${activeFormHtml}
      </div>` : `
      <div class="card card-body" style="margin-bottom:24px;text-align:center;padding:32px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">
        <div style="font-size:36px;margin-bottom:12px;">⚠️</div>
        <h3 style="margin-bottom:8px;">Admin Access Required</h3>
        <p class="text-muted text-sm">Only administrators can upload stock snapshots.</p>
      </div>`;

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6">
          <h2 class="font-bold" style="font-size:20px;">Monthly Stock Upload</h2>
          <p class="text-sm text-muted mt-1">Upload physical stock count snapshots or reconcile inventories via Excel (Admin only)</p>
        </div>
        
        <div class="tabs" id="stock-module-tabs">
          <button class="tab-btn ${activeTab==='single'?'active':''}" onclick="StockModule.switchTab('single')">Single Upload</button>
          <button class="tab-btn ${activeTab==='bulk'?'active':''}" onclick="StockModule.switchTab('bulk')">📥 Reconciliation Upload (Excel)</button>
          <button class="tab-btn ${activeTab==='batch_bulk'?'active':''}" onclick="StockModule.switchTab('batch_bulk')">📦 Batch-wise Bulk Upload</button>
        </div>

        ${formHtml}

        <div class="card">
          <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <h3>Created Stock Batches &amp; Upload History</h3>
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="btn btn-primary btn-sm no-print" onclick="StockModule.bulkPrintBarcodes()" style="padding: 4px 8px; height: 32px; display: flex; align-items: center; justify-content: center; gap: 4px;" title="Print Selected Barcodes">🖨️ Bulk Print</button>
              <div class="search-input" style="max-width: 200px; margin: 0;">
                <span class="search-icon">&#128269;</span>
                <input type="text" id="stock-search" class="form-control form-control-sm" placeholder="Filter by JMREF / Part..." value="${historySearch}" oninput="StockModule.filterHistory(this.value)">
              </div>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th><input type="checkbox" onclick="StockModule.toggleAll(this)" style="cursor:pointer;"></th>
                  <th>Batch No</th>
                  <th>Stage</th>
                  <th>Part No</th>
                  <th>JMREF</th>
                  <th>Qty</th>
                  <th>Upload Date</th>
                  <th>Uploaded By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody id="stock-module-history-table-body">
                ${renderHistoryRows()}
              </tbody>
            </table>
          </div>
          <div id="stock-pagination"></div>
        </div>
      </div>`;
  }

  function switchTab(tab) {
    currentPage = 1;
    activeTab = tab;
    render();
  }

  function renderSingleTab(partOpts) {
    const ops = DB.Operators.all().filter(o => o.status !== 'inactive');
    const subs = DB.Subcontractors.all().filter(s => s.status !== 'inactive');
    
    const opOpts = ops.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    const subOpts = subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    return `
      <div class="card animate-in" style="margin-bottom:24px;">
        <div class="card-header" style="justify-content:space-between; align-items:center;">
          <h3>Upload &amp; Create Stock Batches</h3>
          <span class="badge badge-amber">Admin Only — Overwrite</span>
        </div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">Select a part and enter quantities to automatically create stock batches at each stage.</p>
          
          <div class="form-row-2">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Part No / JMREF <span class="required">*</span></label>
              <select id="stock-part" class="form-control" onchange="StockModule.onPartChange()">
                <option value="">Select part...</option>
                ${partOpts}
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">Upload Date <span class="required">*</span></label>
              <input type="date" id="stock-date" class="form-control" value="${new Date().toISOString().slice(0,10)}">
            </div>
          </div>
          
          <div class="form-group" style="margin-top:16px;">
            <label class="form-label">Notes</label>
            <input type="text" id="stock-notes" class="form-control" placeholder="Optional notes (e.g. Initial stock intake)">
          </div>

          <div style="margin-top:16px; border-top: 1px solid var(--border); padding-top:16px;">
            <h4 style="margin-bottom:12px; color:var(--primary); font-size:14px; font-weight:700;">⚙️ Production Mode &amp; Details</h4>
            
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label" style="font-size:12px; font-weight:600; margin-bottom:6px; display:block;">Production Type</label>
              <div style="display:flex; gap:16px; align-items:center;">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; font-weight:600;">
                  <input type="radio" name="stock-prod-type" value="inhouse" checked onchange="StockModule.onTypeChange('inhouse')"> In-House
                </label>
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; font-weight:600;">
                  <input type="radio" name="stock-prod-type" value="subcontractor" onchange="StockModule.onTypeChange('subcontractor')"> Subcontractor
                </label>
              </div>
            </div>
            
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label" style="font-size:12px;">Mould No</label>
                <select id="stock-mould" class="form-control">
                  <option value="">Select part first...</option>
                </select>
              </div>
              
              <!-- In-House Fields -->
              <div class="form-group stock-inhouse-field">
                <label class="form-label" style="font-size:12px;">Operator</label>
                <select id="stock-operator" class="form-control">
                  <option value="">Select operator...</option>
                  ${opOpts}
                </select>
              </div>
              
              <!-- Subcontractor Fields -->
              <div class="form-group stock-subcontractor-field hidden">
                <label class="form-label" style="font-size:12px;">Subcontractor</label>
                <select id="stock-subcontractor" class="form-control">
                  <option value="">Select subcontractor...</option>
                  ${subOpts}
                </select>
              </div>
            </div>
            
            <div class="form-row-2 stock-inhouse-field">
              <div class="form-group">
                <label class="form-label" style="font-size:12px;">Shift</label>
                <select id="stock-shift" class="form-control">
                  <option value="day">Day</option>
                  <option value="night">Night</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size:12px;">Press No</label>
                <input type="text" id="stock-press-no" class="form-control" placeholder="e.g. 1, 2">
              </div>
            </div>
          </div>

          <div style="margin-top:20px; border-top: 1px solid var(--border); padding-top:16px;">
            <h4 style="margin-bottom:12px; color:var(--primary); font-size:14px; font-weight:700;">📦 Allocate Quantities at Each Stage</h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
              <div>
                <label class="form-label" style="font-size:12px;">Production Qty</label>
                <input type="number" id="qty-production" class="form-control" min="0" value="0">
              </div>
              <div>
                <label class="form-label" style="font-size:12px;">Cryogenic Qty</label>
                <input type="number" id="qty-cryogenic" class="form-control" min="0" value="0">
              </div>
              <div>
                <label class="form-label" style="font-size:12px;">Manual DE Flashing Qty</label>
                <input type="number" id="qty-deflashing" class="form-control" min="0" value="0">
              </div>
              <div>
                <label class="form-label" style="font-size:12px;">Trimming Qty</label>
                <input type="number" id="qty-trimming" class="form-control" min="0" value="0">
              </div>
              <div>
                <label class="form-label" style="font-size:12px;">Visual Inspection Qty</label>
                <input type="number" id="qty-visual" class="form-control" min="0" value="0">
              </div>
              <div>
                <label class="form-label" style="font-size:12px;">Gauge Inspection Qty</label>
                <input type="number" id="qty-gauge" class="form-control" min="0" value="0">
              </div>
              <div>
                <label class="form-label" style="font-size:12px;">Quality Final Qty</label>
                <input type="number" id="qty-quality" class="form-control" min="0" value="0">
              </div>
              <div>
                <label class="form-label" style="font-size:12px;">Store Qty</label>
                <input type="number" id="qty-store" class="form-control" min="0" value="0">
              </div>
            </div>
          </div>
          
          <button class="btn btn-primary mt-4" onclick="StockModule.upload()">Create Stock Batches</button>
        </div>
      </div>`;
  }

  function renderBulkTab() {
    return `
      <div class="card animate-in" style="margin-bottom:24px;">
        <div class="card-header"><h3>Bulk Upload Stock Excel</h3><span class="badge badge-blue">Reconciliation Planner</span></div>
        <div class="card-body">
          <div style="margin-bottom: 20px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
            <p style="margin-bottom: 8px;">Upload an Excel sheet containing stock counts for parts across multiple stages.</p>
            <ul style="padding-left: 20px; list-style-type: disc; margin-bottom: 12px;">
              <li>The Excel sheet should have columns: <strong>JMREF No</strong> (or <strong>JMREF</strong>), and stage names (<strong>Production</strong>, <strong>Cryogenic</strong>, <strong>Manual DE Flashing</strong>, <strong>Trimming</strong>, <strong>Visual Inspection</strong>, <strong>Gauge Inspection</strong>, <strong>Quality Final</strong>, <strong>Store</strong>).</li>
            </ul>
            <button class="btn btn-ghost btn-sm" onclick="StockModule.downloadTemplate()">📥 Download Stock Excel Template</button>
          </div>
          
          <div class="form-row">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Select Excel File (.xlsx, .xls)</label>
              <input type="file" id="stock-bulk-input" class="form-control" accept=".xlsx, .xls" onchange="StockModule.handleFileSelect(event)">
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Adjustment As-Of Date <span class="required">*</span></label>
              <input type="date" id="stock-bulk-date" class="form-control" value="${new Date().toISOString().slice(0,10)}">
            </div>
          </div>
        </div>
      </div>`;
  }

  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded, please wait', 'warning');
      return;
    }
    const headers = [
      'JMREF No', 'Production', 'Cryogenic', 'Manual DE Flashing', 
      'Trimming', 'Visual Inspection', 'Gauge Inspection', 'Quality Final', 'Store'
    ];
    const rows = [
      ['JMREF-2026-101', '1000', '500', '0', '300', '0', '150', '0', '4500'],
      ['JMREF-2026-102', '1500', '0', '800', '0', '400', '0', '200', '2300']
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Upload');
    XLSX.writeFile(wb, 'JMPL_Monthly_Stock_Template.xlsx');
    showToast('Template downloaded', 'success');
  }

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded. Refresh and try again.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet);
        
        processUploadedJson(rawJson);
      } catch (err) {
        console.error(err);
        showToast('Error reading Excel: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function processUploadedJson(rawJson) {
    const master = DB.Master.all();
    parsedAdjustments = [];

    // Stage column mapping
    const colMappings = {
      'production': 'production',
      'cryogenic': 'cryogenic',
      'manual de flashing': 'deflashing',
      'deflashing': 'deflashing',
      'flash removal': 'deflashing',
      'trimming': 'trimming',
      'visual inspection': 'visual',
      'visual': 'visual',
      'gauge inspection': 'gauge',
      'gauge': 'gauge',
      'quality final': 'quality',
      'quality': 'quality',
      'qc final': 'quality',
      'store': 'store',
      'store stock': 'store'
    };

    rawJson.forEach(row => {
      // Find JMREF key
      let jmrefVal = '';
      Object.keys(row).forEach(k => {
        const cleanK = k.trim().toLowerCase();
        if (cleanK === 'jmref no' || cleanK === 'jmrefno' || cleanK === 'jmref') {
          jmrefVal = String(row[k]).trim();
        }
      });

      if (!jmrefVal) return;

      // Case-insensitive search
      let part = master.find(p => p.jmrefNo.trim().toLowerCase() === jmrefVal.toLowerCase());
      if (!part) {
        part = DB.Master.insert({
          partNo: jmrefVal,
          jmrefNo: jmrefVal,
          description: `Auto-created during Excel Stock Upload`
        });
        master.push(part);
      }

      // Extract values for matched stages
      Object.keys(row).forEach(k => {
        const cleanK = k.trim().toLowerCase();
        const stageKey = colMappings[cleanK];
        if (stageKey) {
          const qty = parseInt(row[k]);
          if (!isNaN(qty) && qty >= 0) {
            const actual = getActualStock(part.id, part.jmrefNo, stageKey);
            parsedAdjustments.push({
              partId: part.id,
              partNo: part.partNo,
              jmrefNo: part.jmrefNo,
              stage: stageKey,
              stageLabel: STAGE_LABELS[stageKey] || stageKey,
              actualQty: actual,
              uploadedQty: qty,
              selected: actual !== qty // Auto-select if there is a mismatch
            });
          }
        }
      });
    });

    if (parsedAdjustments.length === 0) {
      showToast('No valid stock entries parsed from Excel', 'warning');
      return;
    }

    // Extract unique JMREFs to run the loop
    uniqueJmrefs = [...new Set(parsedAdjustments.map(item => item.jmrefNo))];
    currentJmrefIndex = 0;

    // Block snapshot reloads during wizard loop
    window.preventAutoRefresh = true;

    activeTab = 'compare';
    render();
  }

  function renderCompareScreen(el) {
    if (currentJmrefIndex >= uniqueJmrefs.length) {
      // Finished all items
      window.preventAutoRefresh = false;
      parsedAdjustments = [];
      uniqueJmrefs = [];
      currentJmrefIndex = 0;
      activeTab = 'bulk';
      render();
      return;
    }

    const currentJmref = uniqueJmrefs[currentJmrefIndex];
    const currentItems = parsedAdjustments.filter(item => item.jmrefNo === currentJmref);

    const rowsHtml = currentItems.map((item, idx) => {
      const diff = item.uploadedQty - item.actualQty;
      const diffText = diff > 0 ? `+${formatNum(diff)}` : formatNum(diff);
      const diffClass = diff > 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'text-muted';
      return `
        <tr>
          <td>
            <input type="checkbox" class="compare-row-checkbox" data-idx="${idx}" id="compare-chk-${idx}" ${item.selected ? 'checked' : ''} onchange="StockModule.toggleItemSelection(${idx})">
          </td>
          <td><span class="badge badge-blue">${item.stageLabel}</span></td>
          <td class="font-bold">${formatNum(item.actualQty)}</td>
          <td class="font-bold text-blue">${formatNum(item.uploadedQty)}</td>
          <td class="font-bold ${diffClass}">${diffText}</td>
        </tr>`;
    }).join('');

    const partNo = currentItems[0]?.partNo || '—';

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 class="font-bold" style="font-size:20px;">Reconcile Stock Snapshot</h2>
            <p class="text-sm text-muted mt-1">Review differences for Part: <strong>${partNo}</strong> (JMREF: <strong>${currentJmref}</strong>)</p>
            <p class="text-sm font-semibold text-blue mt-1">Reconciliation Progress: JMREF ${currentJmrefIndex + 1} of ${uniqueJmrefs.length}</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" onclick="StockModule.cancelComparison()">Cancel Reconcile</button>
            <button class="btn btn-ghost" onclick="StockModule.skipJmref()">Skip JMREF</button>
            <button class="btn btn-primary" onclick="StockModule.confirmAdjustments()">Confirm and Update JMREF</button>
          </div>
        </div>

        <div class="card mb-6">
          <div class="card-header" style="justify-content:space-between; flex-direction:row;">
            <h3>Comparison Table — ${partNo}</h3>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-xs" onclick="StockModule.toggleCurrentGroup(true)">Select All</button>
              <button class="btn btn-ghost btn-xs" onclick="StockModule.toggleCurrentGroup(false)">Deselect All</button>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 40px;">Select</th>
                  <th>Stage</th>
                  <th>Actual Stock (System)</th>
                  <th>Uploaded Stock (Physical)</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function toggleItemSelection(idx) {
    const currentJmref = uniqueJmrefs[currentJmrefIndex];
    const currentItems = parsedAdjustments.filter(item => item.jmrefNo === currentJmref);
    if (currentItems[idx]) {
      currentItems[idx].selected = !currentItems[idx].selected;
    }
  }

  function toggleCurrentGroup(val) {
    const currentJmref = uniqueJmrefs[currentJmrefIndex];
    parsedAdjustments.forEach(item => {
      if (item.jmrefNo === currentJmref) {
        item.selected = val;
      }
    });
    render();
  }

  function cancelComparison() {
    if (confirm('Cancel stock reconciliation? All progress for this batch upload will be lost.')) {
      window.preventAutoRefresh = false;
      parsedAdjustments = [];
      uniqueJmrefs = [];
      currentJmrefIndex = 0;
      activeTab = 'bulk';
      render();
    }
  }

  function skipJmref() {
    const skippedJmref = uniqueJmrefs[currentJmrefIndex];
    currentJmrefIndex++;
    
    if (currentJmrefIndex >= uniqueJmrefs.length) {
      window.preventAutoRefresh = false;
      showToast('Reconciliation wizard complete!', 'success');
      activeTab = 'bulk';
    } else {
      showToast(`Skipped JMREF ${skippedJmref}`, 'info');
    }
    render();
  }

  function confirmAdjustments() {
    const currentJmref = uniqueJmrefs[currentJmrefIndex];
    const currentItems = parsedAdjustments.filter(item => item.jmrefNo === currentJmref);
    const toAdjust = currentItems.filter(item => item.selected);

    if (toAdjust.length > 0) {
      const session = Auth.getSession();
      const dateInput = document.getElementById('stock-bulk-date')?.value || new Date().toISOString().slice(0,10);
      const timeISO = new Date().toISOString();

      toAdjust.forEach(item => {
        const part = DB.Master.find(item.partId);
        if (!part) return;

        const T = item.uploadedQty;
        const curr = item.actualQty;
        const diff = T - curr;

        if (diff === 0) return;

        // Generate unique batch number: [JMREF No]-REC-[YYMMDD]-[HHMM]
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const batchNoBase = `${item.jmrefNo}-REC-${yy}${mm}${dd}-${hh}${min}`;

        let batchNo = batchNoBase;
        let counter = 1;
        while (DB.Batches.all().some(b => b.batchNo === batchNo)) {
          batchNo = `${batchNoBase}-${counter}`;
          counter++;
        }

        let createdBatchDbId = null;
        let createdBatchNo = '';

        if (item.stage === 'store') {
          // STORE STOCK ADJUSTMENT
          if (diff > 0) {
            const adjBatch = DB.Batches.insert({
              batchNo,
              partId: item.partId,
              partNo: part.partNo,
              jmrefNo: part.jmrefNo,
              description: part.description,
              currentStage: 'store',
              status: 'completed',
              initialQty: diff,
              completedAt: timeISO,
              createdAt: timeISO,
              notes: 'Stock Reconciliation Increase'
            });
            createdBatchDbId = adjBatch.id;
            createdBatchNo = batchNo;
            DB.StageRecords.insert({
              batchId: adjBatch.id,
              stage: 'store',
              inputQty: diff,
              outputQty: 0,
              lossQty: 0,
              movedFrom: 'quality',
              date: dateInput,
              recordedBy: session && session.userId,
              notes: 'Stock Reconciliation Adjustment'
            });
          } else {
            DB.Sales.insert({
              jmrefNo: part.jmrefNo,
              qty: Math.abs(diff),
              saleDate: dateInput,
              notes: 'Stock Reconciliation Decrease Adjustment'
            });
          }
        } else {
          // WIP STAGE ADJUSTMENT
          const activeBatches = DB.Batches.all().filter(b => 
            b.partId === item.partId && b.currentStage === item.stage && b.status === 'active'
          );

          if (T === 0) {
            activeBatches.forEach(b => {
              DB.Batches.update(b.id, {
                status: 'completed',
                currentStage: 'store',
                initialQty: 0,
                remainingQty: 0,
                isArchived: true,
                completedAt: timeISO,
                notes: 'Closed via stock adjustment zeroing'
              });
              DB.StageRecords.insert({
                batchId: b.id,
                stage: item.stage,
                inputQty: getActualStock(part.id, part.jmrefNo, item.stage),
                outputQty: 0,
                lossQty: 0,
                movedTo: 'store',
                movedFrom: item.stage,
                date: dateInput,
                recordedBy: session && session.userId,
                notes: 'Zeroed via stock adjustment'
              });
              DB.StageRecords.insert({
                batchId: b.id,
                stage: 'store',
                inputQty: 0,
                outputQty: 0,
                lossQty: 0,
                movedFrom: item.stage,
                date: dateInput,
                recordedBy: session && session.userId,
                notes: 'Zeroed via stock adjustment'
              });
            });
          } else {
            if (activeBatches.length > 0) {
              let distributedSum = 0;
              activeBatches.forEach((b, idx) => {
                const incoming = DB.StageRecords.all().filter(r => r.movedTo === item.stage && r.batchId === b.id);
                const bQty = incoming.length ? (incoming[incoming.length - 1].outputQty || 0) : (b.initialQty || 0);

                let newQty = 0;
                if (idx === activeBatches.length - 1) {
                  newQty = T - distributedSum;
                } else {
                  newQty = Math.round(bQty * (T / curr)) || 0;
                  distributedSum += newQty;
                }

                if (incoming.length > 0) {
                  DB.StageRecords.update(incoming[incoming.length - 1].id, {
                    outputQty: newQty
                  });
                } else {
                  DB.Batches.update(b.id, {
                    initialQty: newQty
                  });
                }
              });
            } else {
              const adjBatch = DB.Batches.insert({
                batchNo,
                partId: item.partId,
                partNo: part.partNo,
                jmrefNo: part.jmrefNo,
                description: part.description,
                currentStage: item.stage,
                status: 'active',
                initialQty: T,
                createdAt: timeISO,
                notes: 'Created via Stock Reconciliation Adjustment'
              });
              createdBatchDbId = adjBatch.id;
              createdBatchNo = batchNo;
            }
          }
        }

        // Log the action historically
        DB.StockUploads.insert({
          stage: item.stage,
          partId: item.partId,
          jmrefNo: item.jmrefNo,
          qty: T,
          uploadedAt: dateInput,
          uploadedBy: session && session.userId,
          notes: `Bulk Excel Adjustment Reconciliation (Was: ${curr}, Shift: ${diff > 0 ? '+' : ''}${diff})`,
          batchNo: createdBatchNo || '',
          batchDbId: createdBatchDbId || ''
        });
      });
      showToast(`Inventory updated for JMREF: ${currentJmref}`, 'success');
    } else {
      showToast(`No adjustments applied for JMREF: ${currentJmref}`, 'info');
    }

    currentJmrefIndex++;

    if (currentJmrefIndex >= uniqueJmrefs.length) {
      window.preventAutoRefresh = false;
      showToast('All stock reconciliations complete!', 'success');
      activeTab = 'bulk';
    }
    
    render();
  }

  function upload() {
    if (!Auth.isAdmin()) { showToast('Admin access required', 'error'); return; }
    
    const partEl = document.getElementById('stock-part');
    const partId = partEl.value;
    const jmrefNo = partEl.options[partEl.selectedIndex]?.dataset?.jmref || '';
    const uploadedAt = document.getElementById('stock-date').value;
    const notes = document.getElementById('stock-notes').value.trim();
    const session = Auth.getSession();
    
    if (!partId) { showToast('Please select a part', 'error'); return; }
    if (!uploadedAt) { showToast('Upload date is required', 'error'); return; }
    
    const part = DB.Master.find(partId);
    if (!part) return;

    // Get Production Parameters
    const productionType = document.querySelector('input[name="stock-prod-type"]:checked')?.value || 'inhouse';
    const mouldNo = document.getElementById('stock-mould').value || '';
    const operatorId = productionType === 'inhouse' ? (document.getElementById('stock-operator').value || '') : '';
    const subcontractorId = productionType === 'subcontractor' ? (document.getElementById('stock-subcontractor').value || '') : '';
    const shift = productionType === 'inhouse' ? document.getElementById('stock-shift').value : '';
    const pressNo = productionType === 'inhouse' ? document.getElementById('stock-press-no').value.trim() : '';

    // Get allocations
    const stagesToUpload = [
      { key: 'production', id: 'qty-production' },
      { key: 'cryogenic', id: 'qty-cryogenic' },
      { key: 'deflashing', id: 'qty-deflashing' },
      { key: 'trimming', id: 'qty-trimming' },
      { key: 'visual', id: 'qty-visual' },
      { key: 'gauge', id: 'qty-gauge' },
      { key: 'quality', id: 'qty-quality' },
      { key: 'store', id: 'qty-store' }
    ];

    let createdCount = 0;

    stagesToUpload.forEach(st => {
      const qtyInput = document.getElementById(st.id);
      const qty = parseInt(qtyInput?.value, 10) || 0;
      if (qty <= 0) return;

      // Generate unique batch number: [JMREF]-REC-[YYMMDD]-[STAGE]
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const stageCode = st.key.toUpperCase().slice(0, 3);
      const batchNoBase = `${jmrefNo}-REC-${yy}${mm}${dd}-${hh}${min}-${stageCode}`;

      let batchNo = batchNoBase;
      let counter = 1;
      while (DB.Batches.all().some(b => b.batchNo === batchNo)) {
        batchNo = `${batchNoBase}-${counter}`;
        counter++;
      }

      // Create Batch record
      const isCompleted = st.key === 'store';
      const batch = DB.Batches.insert({
        batchNo,
        partId,
        partNo: part.partNo,
        jmrefNo: part.jmrefNo,
        description: part.description,
        currentStage: st.key,
        status: isCompleted ? 'completed' : 'active',
        initialQty: qty,
        isStockUpload: true,
        productionType,
        mouldNo: mouldNo ? Number(mouldNo) : null,
        operatorId: operatorId || null,
        subcontractorId: subcontractorId || null,
        shift: shift || null,
        pressNo: pressNo || null,
        createdAt: new Date().toISOString(),
        productionDate: uploadedAt,
        notes: notes || 'Physical Stock Intake Batch'
      });

      // Create Stage Record to initialize it
      DB.StageRecords.insert({
        batchId: batch.id,
        stage: st.key,
        inputQty: qty,
        outputQty: isCompleted ? 0 : qty,
        lossQty: 0,
        movedTo: isCompleted ? 'store' : st.key,
        movedFrom: 'Stock Upload',
        date: uploadedAt,
        recordedBy: session && session.userId,
        notes: 'Single Stock Upload Initialization'
      });

      // Create StockUpload log
      DB.StockUploads.insert({
        stage: st.key,
        partId,
        jmrefNo,
        qty,
        uploadedAt,
        uploadedBy: session && session.userId,
        notes: notes || 'Single Stock Upload Batch',
        batchNo,
        batchDbId: batch.id
      });

      createdCount++;
    });

    if (createdCount === 0) {
      showToast('Please enter a quantity greater than 0 for at least one stage', 'warning');
      return;
    }

    showToast(`Successfully created ${createdCount} stock batches`, 'success');
    render();
  }

  function filterHistory(val) {
    currentPage = 1;
    historySearch = val;
    const tableBody = document.querySelector('#stock-module-history-table-body');
    if (tableBody) {
      tableBody.innerHTML = renderHistoryRows();
    }
  }

  function renderHistoryRows() {
    const master = DB.Master.all();
    const users = DB.Users.all();
    const uploads = DB.StockUploads.all().sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
    
    const filterText = historySearch.toLowerCase();
    const filtered = uploads.filter(u => {
      if (!filterText) return true;
      const part = master.find(m => m.id === u.partId) || {};
      return (part.partNo || '').toLowerCase().includes(filterText) ||
             (u.jmrefNo || '').toLowerCase().includes(filterText) ||
             (STAGE_LABELS[u.stage] || u.stage).toLowerCase().includes(filterText) ||
             (u.batchNo || '').toLowerCase().includes(filterText);
    });

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = currentPage * itemsPerPage;
    const pageItems = filtered.slice(startIdx, endIdx);

    setTimeout(() => {
      const pagEl = document.getElementById('stock-pagination');
      if (pagEl) {
        if (totalPages > 1) {
          pagEl.innerHTML = `
            <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
              <div class="text-sm text-muted">
                Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
              </div>
              <div class="flex gap-2">
                <button class="btn btn-secondary btn-xs" onclick="StockModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
                <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
                <button class="btn btn-secondary btn-xs" onclick="StockModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
              </div>
            </div>`;
        } else {
          pagEl.innerHTML = '';
        }
      }
    }, 0);

    if (!pageItems.length) {
      return '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">No matching uploads found</td></tr>';
    }

    return pageItems.map(u => {
      const part = master.find(m => m.id === u.partId) || {};
      const user = users.find(uu => uu.id === u.uploadedBy) || {};
      const checkboxHtml = u.batchDbId
        ? `<input type="checkbox" class="bulk-stock-check" value="${u.batchDbId}" style="cursor:pointer;" onclick="event.stopPropagation()">`
        : `<input type="checkbox" disabled title="Legacy snapshot or adjustment with no single batch associated">`;
      
      let displayBatchNo = u.batchNo;
      if (!displayBatchNo) {
        if (u.notes && u.notes.includes('Bulk Excel')) {
          displayBatchNo = '<span class="text-muted text-xs">Excel Adjusted</span>';
        } else {
          displayBatchNo = '<span class="text-muted text-xs">N/A (Legacy)</span>';
        }
      }

      return `
        <tr>
          <td>${checkboxHtml}</td>
          <td class="font-semibold text-blue">${displayBatchNo}</td>
          <td><span class="badge badge-blue">${STAGE_LABELS[u.stage] || u.stage}</span></td>
          <td>${part.partNo || '—'}</td>
          <td><span class="badge badge-teal">${u.jmrefNo || '—'}</span></td>
          <td class="font-semibold">${formatNum(u.qty)}</td>
          <td class="text-muted text-sm">${(u.uploadedAt || '').slice(0,10)}</td>
          <td class="text-muted text-sm">${user.name || '—'}</td>
          <td class="text-muted text-sm">${u.notes || '—'}</td>
        </tr>`;
    }).join('');
  }

  function toggleAll(chk) {
    const list = document.querySelectorAll('.bulk-stock-check');
    list.forEach(el => {
      if (!el.disabled) el.checked = chk.checked;
    });
  }

  function bulkPrintBarcodes() {
    const checked = Array.from(document.querySelectorAll('.bulk-stock-check:checked')).map(el => el.value);
    if (!checked.length) {
      showToast('Please select at least one stock batch to print', 'warning');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) {
      showToast('Popup blocked! Please allow popups for printing.', 'warning');
      return;
    }

    let labelsHtml = '';
    checked.forEach((batchId, idx) => {
      const batch = DB.Batches.find(batchId);
      if (!batch) return;
      const formattedDate = batch.productionDate ? formatDate(batch.productionDate) : formatDate(batch.createdAt);
      const part = DB.Master.find(batch.partId) || DB.Master.all().find(p => p.partNo === batch.partNo || p.jmrefNo === batch.jmrefNo) || {};
      let mouldType = '—';
      let processFlow = '—';
      if (batch.mouldNo && part.moulds) {
        const m = part.moulds.find(x => Number(x.mouldNo) === Number(batch.mouldNo));
        if (m) {
          mouldType = m.mouldType || '—';
          processFlow = m.processFlow || '—';
        }
      }

      labelsHtml += `
        <div class="label-container" style="${idx > 0 ? 'page-break-before: always;' : ''} width: 40mm; height: 60mm; padding: 1.5mm; border: 1.5px solid #000; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; background: #fff; color: #000;">
          <div class="company-title" style="font-size: 8px; font-weight: bold; letter-spacing: 0.2px; border-bottom: 1.5px solid #000; padding-bottom: 1.5px; width: 100%; text-align: center; text-transform: uppercase; white-space: nowrap; margin-bottom: 1px;">JANANI MOULDINGS PVT. LTD.</div>
          <div class="qr-wrapper" style="position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 20mm; margin: 1mm 0;">
            <div class="flow-text-left" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; font-size: 6.5px; font-weight: bold; text-transform: uppercase; color: #000; letter-spacing: 0.2px; white-space: nowrap; height: 18mm; display: flex; align-items: center; justify-content: center; text-align: center; border-right: 0.5px dashed #000; padding-right: 2px;">${processFlow}</div>
            <img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(batch.batchNo)}" style="width: 19mm; height: 19mm; display: block;" />
            <div class="flow-text-right" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; font-size: 6.5px; font-weight: bold; text-transform: uppercase; color: #000; letter-spacing: 0.2px; white-space: nowrap; height: 18mm; display: flex; align-items: center; justify-content: center; text-align: center; border-left: 0.5px dashed #000; padding-left: 2px;">IB: ${batch.internalBatchNo || '—'}</div>
          </div>
          <div class="batch-no-display" style="font-size: 7.5px; font-weight: bold; letter-spacing: 0.2px; margin-bottom: 1.5px; border: 1px solid #000; padding: 1px 3px; border-radius: 2px; background: #f3f4f6; text-align: center; white-space: nowrap; max-width: 100%; box-sizing: border-box; overflow: hidden; text-overflow: ellipsis;">${batch.batchNo}</div>
          <div class="details" style="width: 100%; border-top: 1.5px solid #000; padding-top: 2px; font-size: 7px; display: flex; flex-direction: column; gap: 1px;">
            <div class="detail-row" style="display: flex; justify-content: space-between; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
              <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">JMREF:</span>
              <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${batch.jmrefNo || '—'}</span>
            </div>
            <div class="detail-row" style="display: flex; justify-content: space-between; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
              <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Part No:</span>
              <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${batch.partNo || '—'}</span>
            </div>
            <div class="detail-row" style="display: flex; justify-content: space-between; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
              <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Stage:</span>
              <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${STAGE_LABELS[batch.currentStage] || batch.currentStage} (Stock)</span>
            </div>
            <div class="detail-row" style="display: flex; justify-content: space-between; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
              <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Qty:</span>
              <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${Number(batch.initialQty).toLocaleString('en-IN')}</span>
            </div>
            <div class="detail-row" style="display: flex; justify-content: space-between; line-height: 1.25; border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
              <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Date:</span>
              <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${formattedDate}</span>
            </div>
          </div>
        </div>
      `;
    });

    printWindow.document.write(`
      <html>
      <head>
        <title>Bulk Print Stock Labels</title>
        <style>
          @page { size: 40mm 60mm; margin: 0; }
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style>
      </head>
      <body>
        ${labelsHtml}
        <script>
          let printed = false;
          function triggerPrint() {
            if (printed) return;
            printed = true;
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
          window.onload = function() {
            setTimeout(triggerPrint, 2500); // 2.5s fallback to allow all QR code images to load completely
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  function onPartChange() {
    const partId = document.getElementById('stock-part').value;
    const mouldSelect = document.getElementById('stock-mould');
    if (!mouldSelect) return;
    
    mouldSelect.innerHTML = '<option value="">Select mould...</option>';
    if (!partId) return;
    
    const part = DB.Master.find(partId);
    if (!part || !part.moulds) return;
    
    part.moulds.forEach(m => {
      const cavText = m.cavity ? `Cav: ${m.cavity}` : 'Cav: —';
      const typeText = m.mouldType ? m.mouldType : 'Normal';
      const label = `Mould ${m.mouldNo} (${typeText} - ${cavText})`;
      mouldSelect.innerHTML += `<option value="${m.mouldNo}">${label}</option>`;
    });
  }

  function onTypeChange(type) {
    const inhouseFields = document.querySelectorAll('.stock-inhouse-field');
    const subcontractorFields = document.querySelectorAll('.stock-subcontractor-field');
    
    if (type === 'inhouse') {
      inhouseFields.forEach(el => el.classList.remove('hidden'));
      subcontractorFields.forEach(el => el.classList.add('hidden'));
    } else {
      inhouseFields.forEach(el => el.classList.add('hidden'));
      subcontractorFields.forEach(el => el.classList.remove('hidden'));
    }
  }

  // Helper to extract values in a case-insensitive, space-flexible way
  function getRowValue(row, possibleHeaders) {
    for (const k of Object.keys(row)) {
      const cleanK = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const h of possibleHeaders) {
        const cleanH = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanK === cleanH) {
          return row[k];
        }
      }
    }
    return undefined;
  }

  // Helper to format Date from Excel
  function formatExcelDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (typeof val === 'number') {
      if (typeof XLSX !== 'undefined') {
        return XLSX.SSF.format('yyyy-mm-dd', val);
      }
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      return date.toISOString().slice(0, 10);
    }
    if (typeof val === 'string') {
      val = val.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
      const match = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (match) {
        const d = match[1].padStart(2, '0');
        const m = match[2].padStart(2, '0');
        const y = match[3];
        return `${y}-${m}-${d}`;
      }
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 10);
        }
      } catch (e) {}
    }
    return '';
  }

  function renderBatchBulkTab() {
    return `
      <div class="card animate-in" style="margin-bottom:24px;">
        <div class="card-header" style="justify-content:space-between; align-items:center;">
          <h3>Batch-wise Bulk Upload</h3>
          <span class="badge badge-blue">Admin Only — Excel Upload</span>
        </div>
        <div class="card-body">
          <div style="margin-bottom: 20px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
            <p style="margin-bottom: 8px;">Upload an Excel sheet containing manufacturing batch entries to automatically create batches at their destination stages.</p>
            <ul style="padding-left: 20px; list-style-type: disc; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
              <li>Mandatory columns: <strong>JMREF No</strong>, <strong>TRNO</strong>, <strong>Production Type</strong> (In-House / Subcontractor), <strong>Operator</strong> (required for In-House), <strong>Subcontractor</strong> (required for Subcontractor), <strong>Production Date</strong>, <strong>Quantity</strong>, <strong>Destination Stage</strong>.</li>
              <li>Optional columns: <strong>Mould No</strong> (defaults to 1), <strong>Shift</strong> (defaults to Day), <strong>Press No</strong> (defaults to 1).</li>
              <li>Details like Part No, Description, Mould Type, Process Flow, Batch No, and Internal Batch No will be automatically mapped based on the JMREF No and Mould No.</li>
            </ul>
            <button class="btn btn-ghost btn-sm" onclick="StockModule.downloadBatchTemplate()" style="padding: 6px 12px; margin-top: 4px;">📥 Download Batch Upload Excel Template</button>
          </div>
          
          <div class="form-row">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Select Excel File (.xlsx, .xls) <span class="required">*</span></label>
              <input type="file" id="stock-batch-bulk-input" class="form-control" accept=".xlsx, .xls" onchange="StockModule.handleBatchFileSelect(event)">
            </div>
            <div class="form-group" style="flex: 1;">
              <!-- Spacer -->
            </div>
          </div>
        </div>
      </div>`;
  }

  function downloadBatchTemplate() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded, please wait', 'warning');
      return;
    }
    const headers = [
      'JMREF No', 'TRNO', 'Production Type', 'Operator', 'Subcontractor', 
      'Production Date', 'Quantity', 'Destination Stage', 'Mould No', 'Shift', 'Press No'
    ];
    const rows = [
      ['JMREF-2026-101', 'TR-100', 'In-House', 'John Doe', '', '2026-07-29', '1000', 'Moulding', '1', 'Day', '1'],
      ['JMREF-2026-102', 'TR-200', 'Subcontractor', '', 'Anil Polymers', '2026-07-29', '2000', 'Cryogenic', '1', 'Day', '1']
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Batch Upload');
    XLSX.writeFile(wb, 'JMPL_Batch_Upload_Template.xlsx');
    showToast('Batch template downloaded', 'success');
  }

  function handleBatchFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded. Refresh and try again.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet);
        
        processBatchUploadedJson(rawJson);
      } catch (err) {
        console.error(err);
        showToast('Error reading Excel: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = ''; // Reset file input
  }

  function processBatchUploadedJson(rawJson) {
    parsedBatchUploads = [];
    const master = DB.Master.all();
    const operators = DB.Operators.all();
    const subcontractors = DB.Subcontractors.all();
    const existingBatches = DB.Batches.all();
    let nextIB = DB.Batches.nextInternalBatchNo();

    if (rawJson.length === 0) {
      showToast('Excel file is empty', 'warning');
      return;
    }

    rawJson.forEach((row, index) => {
      const rowNum = index + 2;
      
      const rowJmref = String(getRowValue(row, ['jmrefno', 'jmref', 'jmref number']) || '').trim();
      const rowTrNo = String(getRowValue(row, ['trno', 'trnumber', 'tr number']) || '').trim();
      const rowProdTypeRaw = String(getRowValue(row, ['productiontype', 'prodtype', 'type']) || '').trim().toLowerCase();
      const rowOperator = String(getRowValue(row, ['operator', 'operatorid', 'operatorname']) || '').trim();
      const rowSubcontractor = String(getRowValue(row, ['subcontractor', 'subcontractorid', 'subcontractorname']) || '').trim();
      const rowProdDateRaw = getRowValue(row, ['productiondate', 'proddate', 'date']);
      const rowQtyRaw = getRowValue(row, ['quantity', 'qty']);
      const rowStageRaw = String(getRowValue(row, ['destinationstage', 'destination', 'stage']) || '').trim();
      const rowMouldNoRaw = getRowValue(row, ['mouldno', 'mouldnumber', 'mould']);
      const rowShiftRaw = String(getRowValue(row, ['shift']) || '').trim().toLowerCase();
      const rowPressNoRaw = String(getRowValue(row, ['pressno', 'pressnumber', 'press']) || '').trim();

      const errors = [];
      const warnings = [];

      // 1. JMREF No lookup
      let part = null;
      let partId = '';
      let partNo = '';
      let partDesc = '';
      if (!rowJmref) {
        errors.push("JMREF No is required");
      } else {
        part = master.find(p => p.jmrefNo.trim().toLowerCase() === rowJmref.toLowerCase());
        if (!part) {
          errors.push(`JMREF No "${rowJmref}" not found in Master Database`);
        } else {
          partId = part.id;
          partNo = part.partNo;
          partDesc = part.description;
        }
      }

      // 2. Mould No
      let mouldNo = 1;
      if (rowMouldNoRaw != null && String(rowMouldNoRaw).trim() !== '') {
        const parsedMould = parseInt(rowMouldNoRaw, 10);
        if (isNaN(parsedMould) || parsedMould <= 0) {
          warnings.push(`Invalid Mould No "${rowMouldNoRaw}", defaulting to Mould 1`);
        } else {
          mouldNo = parsedMould;
        }
      } else {
        warnings.push("Mould No empty, defaulting to Mould 1");
      }

      // Mould details lookup
      let mouldType = 'Normal';
      let processFlow = '—';
      if (part) {
        const partMould = part.moulds ? part.moulds.find(m => Number(m.mouldNo) === Number(mouldNo)) : null;
        if (partMould) {
          mouldType = partMould.mouldType || 'Normal';
          processFlow = partMould.processFlow || '—';
        } else {
          warnings.push(`Mould ${mouldNo} not configured in Master for JMREF ${rowJmref}`);
        }
      }

      // 3. TR No
      if (!rowTrNo) {
        errors.push("TR No is required");
      }

      // 4. Production Type
      let productionType = 'inhouse';
      if (rowProdTypeRaw === 'subcontractor' || rowProdTypeRaw === 'sub') {
        productionType = 'subcontractor';
      } else if (rowProdTypeRaw && rowProdTypeRaw !== 'inhouse' && rowProdTypeRaw !== 'in-house') {
        warnings.push(`Unknown Production Type "${rowProdTypeRaw}", defaulting to In-House`);
      }

      // 5. Operator (for In-House)
      let operatorId = null;
      let operatorName = '—';
      if (productionType === 'inhouse') {
        if (!rowOperator) {
          errors.push("Operator is required for In-House production");
        } else {
          const op = operators.find(o => o.name.trim().toLowerCase() === rowOperator.toLowerCase());
          if (op) {
            operatorId = op.id;
            operatorName = op.name;
          } else {
            errors.push(`Operator "${rowOperator}" not found in Database`);
          }
        }
      }

      // 6. Subcontractor (for Subcontractor)
      let subcontractorId = null;
      let subcontractorName = '—';
      if (productionType === 'subcontractor') {
        if (!rowSubcontractor) {
          errors.push("Subcontractor is required for Subcontractor production");
        } else {
          const sub = subcontractors.find(s => s.name.trim().toLowerCase() === rowSubcontractor.toLowerCase());
          if (sub) {
            subcontractorId = sub.id;
            subcontractorName = sub.name;
          } else {
            errors.push(`Subcontractor "${rowSubcontractor}" not found in Database`);
          }
        }
      }

      // 7. Production Date
      let productionDate = '';
      if (!rowProdDateRaw) {
        errors.push("Production Date is required");
      } else {
        const formattedDate = formatExcelDate(rowProdDateRaw);
        if (!formattedDate) {
          errors.push(`Invalid Production Date format: "${rowProdDateRaw}"`);
        } else {
          productionDate = formattedDate;
        }
      }

      // 8. Quantity
      let quantity = 0;
      if (rowQtyRaw == null) {
        errors.push("Quantity is required");
      } else {
        const parsedQty = parseInt(rowQtyRaw, 10);
        if (isNaN(parsedQty) || parsedQty <= 0) {
          errors.push(`Quantity must be a positive number: "${rowQtyRaw}"`);
        } else {
          quantity = parsedQty;
        }
      }

      // 9. Destination Stage
      let stage = 'production';
      let stageLabel = 'Moulding';
      if (!rowStageRaw) {
        warnings.push("Destination Stage empty, defaulting to Moulding");
      } else {
        const stageMappings = {
          'production': 'production',
          'moulding': 'production',
          'moulding 1': 'production',
          'mould 1': 'production',
          'cryogenic': 'cryogenic',
          'cryo': 'cryogenic',
          'deflashing': 'deflashing',
          'manual de flashing': 'deflashing',
          'de flashing': 'deflashing',
          'de-flashing': 'deflashing',
          'waiting-trimming': 'waiting-trimming',
          'waiting trimming': 'waiting-trimming',
          'waiting for trimming': 'waiting-trimming',
          'trimming': 'trimming',
          'post-curing': 'post-curing',
          'post curing': 'post-curing',
          'waiting-visual': 'waiting-visual',
          'waiting visual': 'waiting-visual',
          'waiting for visual': 'waiting-visual',
          'visual': 'visual',
          'visual inspection': 'visual',
          'gauge': 'gauge',
          'gauge inspection': 'gauge',
          'quality': 'quality',
          'quality final': 'quality',
          'qc final': 'quality',
          'store': 'store'
        };

        const cleanedStage = rowStageRaw.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
        let stageKey = stageMappings[cleanedStage];
        if (!stageKey) {
          // Sort keys descending by length to match the most specific/longest substring first
          const sortedKeys = Object.keys(stageMappings).sort((a, b) => b.length - a.length);
          for (const k of sortedKeys) {
            if (cleanedStage.includes(k)) {
              stageKey = stageMappings[k];
              break;
            }
          }
        }

        if (!stageKey) {
          errors.push(`Invalid Destination Stage "${rowStageRaw}"`);
        } else {
          stage = stageKey;
          stageLabel = STAGE_LABELS[stageKey] || stageKey;
        }
      }

      // 10. Shift
      let shift = 'day';
      if (rowShiftRaw === 'night' || rowShiftRaw === 'n') {
        shift = 'night';
      }

      // 11. Press No
      let pressNo = '1';
      if (rowPressNoRaw) {
        pressNo = rowPressNoRaw;
      }

      // Generate Batch No
      let batchNo = '';
      if (errors.length === 0) {
        const dayStr = productionDate.split('-')[2] || '';
        const shiftCode = shift === 'night' ? 'N' : 'D';
        const typeCode = productionType === 'subcontractor' ? 'S' : 'I';
        batchNo = `${rowJmref}-${rowTrNo}-${dayStr}-${shiftCode}-${typeCode}-${pressNo}`;

        // Check if Batch No exists
        const exists = existingBatches.some(b => b.batchNo === batchNo) || parsedBatchUploads.some(b => b.batchNo === batchNo);
        if (exists) {
          errors.push(`Batch No "${batchNo}" already exists in Database or current upload list`);
        }
      }

      // Assign Internal Batch No sequentially
      const internalBatchNo = errors.length === 0 ? nextIB++ : null;

      parsedBatchUploads.push({
        rowNum,
        jmrefNo: rowJmref,
        partId,
        partNo,
        description: partDesc,
        mouldNo,
        mouldType,
        processFlow,
        trNo: rowTrNo,
        productionType,
        operatorId,
        operatorName,
        subcontractorId,
        subcontractorName,
        productionDate,
        quantity,
        stage,
        stageLabel,
        shift,
        pressNo,
        batchNo,
        internalBatchNo,
        errors,
        warnings
      });
    });

    activeTab = 'batch_confirm';
    render();
  }

  function renderBatchConfirmScreen(el) {
    const hasErrors = parsedBatchUploads.some(b => b.errors.length > 0);
    const totalRows = parsedBatchUploads.length;
    const errorRows = parsedBatchUploads.filter(b => b.errors.length > 0).length;
    const validRows = totalRows - errorRows;

    const rowsHtml = parsedBatchUploads.map((row) => {
      let statusHtml = '';
      if (row.errors.length > 0) {
        statusHtml = `<div style="color:var(--accent-red); font-size:11px; font-weight:bold;">❌ Row ${row.rowNum}:<br>${row.errors.join('<br>')}</div>`;
      } else if (row.warnings.length > 0) {
        statusHtml = `<div style="color:var(--accent-yellow); font-size:11px; font-weight:bold;">⚠️ Row ${row.rowNum}:<br>${row.warnings.join('<br>')}</div>`;
      } else {
        statusHtml = `<div style="color:var(--accent-teal); font-size:11px; font-weight:bold;">✅ Row ${row.rowNum}: Valid</div>`;
      }

      const rowStyle = row.errors.length > 0 ? 'style="background: rgba(239, 68, 68, 0.08); border-left: 3px solid var(--accent-red);"' : '';

      return `
        <tr ${rowStyle}>
          <td>${statusHtml}</td>
          <td class="font-bold" style="color:var(--primary); font-size:12px;">${row.batchNo || '—'}</td>
          <td class="font-bold" style="color:var(--accent-teal); font-size:12px;">IB: ${row.internalBatchNo || '—'}</td>
          <td>
            <div><span class="badge badge-teal">${row.jmrefNo}</span></div>
            <div style="font-size:11px; font-weight:600; margin-top:2px;">${row.partNo || '—'}</div>
          </td>
          <td>
            <div style="font-size:11px;">Mould ${row.mouldNo}</div>
            <div class="text-muted" style="font-size:10px;">${row.mouldType}</div>
          </td>
          <td class="text-muted" style="font-size:11px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${row.processFlow}">${row.processFlow}</td>
          <td class="font-bold">${formatNum(row.quantity)}</td>
          <td><span class="badge badge-blue">${row.stageLabel}</span></td>
          <td style="font-size:11px; white-space:nowrap;">${row.productionDate || '—'}</td>
          <td>
            <div style="font-size:11px; font-weight:600;">${row.productionType === 'inhouse' ? 'In-House' : 'Subcontractor'}</div>
            <div class="text-muted" style="font-size:10px;">${row.productionType === 'inhouse' ? row.operatorName : row.subcontractorName}</div>
          </td>
        </tr>`;
    }).join('');

    const alertHtml = hasErrors ? `
      <div class="card card-body" style="margin-bottom:20px; border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.06); display:flex; align-items:center; gap:16px;">
        <span style="font-size:24px;">❌</span>
        <div>
          <h4 style="margin:0 0 4px 0; color:var(--accent-red); font-weight:700;">Validation Errors Found (${errorRows} rows)</h4>
          <p class="text-muted text-sm" style="margin:0;">Please fix the errors in your Excel sheet and upload again. You cannot confirm the import until all errors are resolved.</p>
        </div>
      </div>` : `
      <div class="card card-body" style="margin-bottom:20px; border-color:rgba(16,185,129,0.3); background:rgba(16,185,129,0.06); display:flex; align-items:center; gap:16px;">
        <span style="font-size:24px;">✅</span>
        <div>
          <h4 style="margin:0 0 4px 0; color:var(--accent-teal); font-weight:700;">All Rows Valid (${validRows} rows)</h4>
          <p class="text-muted text-sm" style="margin:0;">Review the details below and click "Confirm and Create Batches" to complete the import.</p>
        </div>
      </div>`;

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 class="font-bold" style="font-size:20px;">Review Bulk Batch Import</h2>
            <p class="text-sm text-muted mt-1">Verify batch details parsed from your Excel spreadsheet.</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" onclick="StockModule.cancelBatchConfirm()">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-batches" ${hasErrors ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} onclick="StockModule.confirmBatchImport()">Confirm and Create Batches</button>
          </div>
        </div>

        ${alertHtml}

        <div class="card">
          <div class="card-header">
            <h3>Excel Row Mapping Preview</h3>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Validation Status</th>
                  <th>Batch No</th>
                  <th>Internal Batch No</th>
                  <th>JMREF & Part</th>
                  <th>Mould</th>
                  <th>Process Flow</th>
                  <th>Quantity</th>
                  <th>Stage</th>
                  <th>Prod Date</th>
                  <th>Type & Op/Sub</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function confirmBatchImport() {
    const hasErrors = parsedBatchUploads.some(b => b.errors.length > 0);
    if (hasErrors) {
      showToast('Cannot import Excel sheet with errors', 'error');
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-batches');
    const parentNode = confirmBtn?.parentNode;
    if (confirmBtn && parentNode) {
      confirmBtn.style.display = 'none';
      const progressDiv = document.createElement('div');
      progressDiv.id = 'batch-upload-progress-container';
      progressDiv.style.marginTop = '15px';
      progressDiv.style.flex = '1';
      progressDiv.style.textAlign = 'left';
      progressDiv.innerHTML = `
        <div style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: var(--text-primary);" id="batch-progress-text">Saving: 0%</div>
        <div style="width: 100%; max-width: 320px; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; position: relative;">
          <div id="batch-progress-bar" style="width: 0%; height: 100%; background: var(--accent-green); transition: width 0.1s ease-in-out;"></div>
        </div>
      `;
      parentNode.appendChild(progressDiv);
    }

    const session = Auth.getSession();
    const uploadedAt = new Date().toISOString();
    lastCreatedBatchIds = [];

    let nextIB = DB.Batches.nextInternalBatchNo();
    const total = parsedBatchUploads.length;
    const chunkSize = 15;

    window.preventAutoRefresh = true;

    async function doUpload() {
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = parsedBatchUploads.slice(i, i + chunkSize);
        chunk.forEach(row => {
          const isCompleted = row.stage === 'store';
          const batch = DB.Batches.insert({
            batchNo: row.batchNo,
            partId: row.partId,
            partNo: row.partNo,
            jmrefNo: row.jmrefNo,
            description: row.description,
            currentStage: row.stage,
            status: isCompleted ? 'completed' : 'active',
            initialQty: row.quantity,
            isStockUpload: true,
            productionType: row.productionType,
            mouldNo: row.mouldNo,
            operatorId: row.operatorId || null,
            subcontractorId: row.subcontractorId || null,
            shift: row.shift || 'day',
            pressNo: row.pressNo || '1',
            createdAt: uploadedAt,
            productionDate: row.productionDate,
            notes: 'Bulk Batch Excel Upload',
            internalBatchNo: nextIB++
          });

          lastCreatedBatchIds.push(batch.id);

          DB.StageRecords.insert({
            batchId: batch.id,
            stage: row.stage,
            inputQty: row.quantity,
            outputQty: isCompleted ? 0 : row.quantity,
            lossQty: 0,
            movedTo: isCompleted ? 'store' : row.stage,
            movedFrom: 'Stock Upload',
            date: row.productionDate,
            recordedBy: session && session.userId,
            notes: 'Bulk Excel Stock Batch Initialization'
          });

          DB.StockUploads.insert({
            stage: row.stage,
            partId: row.partId,
            jmrefNo: row.jmrefNo,
            qty: row.quantity,
            uploadedAt: uploadedAt,
            uploadedBy: session && session.userId,
            notes: 'Bulk Excel Batch Upload',
            batchNo: row.batchNo,
            batchDbId: batch.id
          });
        });

        const percent = Math.round(((i + chunk.length) / total) * 100);
        const progressText = document.getElementById('batch-progress-text');
        const progressBar = document.getElementById('batch-progress-bar');
        if (progressText) progressText.textContent = `Saving: ${percent}% (${i + chunk.length}/${total})`;
        if (progressBar) progressBar.style.width = `${percent}%`;

        await new Promise(resolve => setTimeout(resolve, 80));
      }

      showToast(`Successfully created ${parsedBatchUploads.length} stock batches`, 'success');
      
      const progressDiv = document.getElementById('batch-upload-progress-container');
      if (progressDiv) {
        progressDiv.innerHTML = `
          <div style="color: var(--success); font-weight: 700; font-size: 13px;">
            ✓ Batches imported successfully!
          </div>
        `;
      }

      setTimeout(() => {
        window.preventAutoRefresh = false;
        activeTab = 'batch_success';
        render();
      }, 1000);
    }

    doUpload().catch(err => {
      showToast('Error importing batches: ' + err.message, 'error');
      window.preventAutoRefresh = false;
      render();
    });
  }

  function renderBatchSuccessScreen(el) {
    const batches = lastCreatedBatchIds.map(id => DB.Batches.find(id)).filter(Boolean);

    const rowsHtml = batches.map((batch) => {
      return `
        <tr>
          <td>
            <input type="checkbox" class="success-batch-check" value="${batch.id}" style="cursor:pointer;" checked>
          </td>
          <td class="font-bold text-blue">${batch.batchNo}</td>
          <td class="font-bold text-teal">IB: ${batch.internalBatchNo}</td>
          <td>${batch.partNo}</td>
          <td><span class="badge badge-teal">${batch.jmrefNo}</span></td>
          <td class="font-semibold">${formatNum(batch.initialQty)}</td>
          <td><span class="badge badge-blue">${STAGE_LABELS[batch.currentStage] || batch.currentStage}</span></td>
          <td>${formatDate(batch.productionDate)}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="animate-in">
        <div class="card card-body" style="margin-bottom:24px; border-color:rgba(16,185,129,0.3); background:rgba(16,185,129,0.06); text-align:center; padding:32px;">
          <div style="font-size:48px; margin-bottom:12px;">🎉</div>
          <h3 style="color:var(--accent-teal); font-weight:700; margin-bottom:8px;">Import Complete!</h3>
          <p class="text-muted text-sm" style="margin-bottom:20px;">Successfully created ${batches.length} manufacturing batches from the Excel upload.</p>
          <div class="flex justify-center gap-3">
            <button class="btn btn-primary" onclick="StockModule.printSuccessBatches()">🖨️ Bulk Print Selected Labels</button>
            <button class="btn btn-secondary" onclick="StockModule.finishSuccessScreen()">Finish & View History</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="justify-content:space-between; flex-direction:row; align-items:center;">
            <h3>Created Batches List</h3>
            <div>
              <button class="btn btn-ghost btn-xs" onclick="StockModule.toggleSuccessAll(true)">Select All</button>
              <button class="btn btn-ghost btn-xs" onclick="StockModule.toggleSuccessAll(false)">Deselect All</button>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:40px;">Print?</th>
                  <th>Batch No</th>
                  <th>Internal Batch No</th>
                  <th>Part No</th>
                  <th>JMREF</th>
                  <th>Quantity</th>
                  <th>Stage</th>
                  <th>Prod Date</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function printSuccessBatches() {
    const checked = Array.from(document.querySelectorAll('.success-batch-check:checked')).map(el => el.value);
    window.bulkPrintBarcodes(checked);
  }

  function finishSuccessScreen() {
    lastCreatedBatchIds = [];
    parsedBatchUploads = [];
    activeTab = 'single';
    render();
  }

  function toggleSuccessAll(val) {
    const list = document.querySelectorAll('.success-batch-check');
    list.forEach(el => el.checked = val);
  }

  function cancelBatchConfirm() {
    if (confirm('Cancel batch upload? All parsed data will be lost.')) {
      parsedBatchUploads = [];
      activeTab = 'batch_bulk';
      render();
    }
  }

  function changePage(page) {
    currentPage = page;
    const tbody = document.getElementById('stock-module-history-table-body');
    if (tbody) {
      tbody.innerHTML = renderHistoryRows();
    }
  }

  return { 
    render, 
    upload, 
    switchTab, 
    downloadTemplate, 
    handleFileSelect,
    toggleItemSelection,
    toggleCurrentGroup,
    cancelComparison,
    skipJmref,
    confirmAdjustments,
    filterHistory,
    renderHistoryRows,
    toggleAll,
    bulkPrintBarcodes,
    onPartChange,
    onTypeChange,
    
    // Batch-wise bulk upload methods
    renderBatchBulkTab,
    downloadBatchTemplate,
    handleBatchFileSelect,
    processBatchUploadedJson,
    renderBatchConfirmScreen,
    confirmBatchImport,
    renderBatchSuccessScreen,
    printSuccessBatches,
    finishSuccessScreen,
    toggleSuccessAll,
    cancelBatchConfirm,
    changePage
  };
})();
