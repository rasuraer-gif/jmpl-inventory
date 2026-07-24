// ============================================================
// stock.js — Monthly Stock Upload & Reconciliation Module (Admin Only)
// ============================================================
const StockModule = (() => {
  const STAGE_LABELS = { 
    production: 'Production', 
    cryogenic: 'Cryogenic', 
    deflashing: 'Manual DE Flashing', 
    trimming: 'Trimming', 
    visual: 'Visual Inspection', 
    gauge: 'Gauge Inspection', 
    quality: 'Quality Final', 
    store: 'Store' 
  };

  let activeTab = 'single'; // 'single', 'bulk', 'compare'
  let parsedAdjustments = []; // Holds all parsed stage count adjustments
  let uniqueJmrefs = []; // Holds list of unique JMREF codes in the upload
  let currentJmrefIndex = 0; // Current wizard index in uniqueJmrefs
  let historySearch = '';

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
    const el = document.getElementById('content');
    if (!el) return;

    if (activeTab === 'compare') {
      renderCompareScreen(el);
      return;
    }

    const isAdmin = Auth.isAdmin();
    const master = DB.Master.all();
    const partOpts = master.map(m=>'<option value="' + m.id + '" data-jmref="' + m.jmrefNo + '">' + m.partNo + ' — ' + m.jmrefNo + '</option>').join('');

    const formHtml = isAdmin ? `
      <div id="stock-upload-forms">
        ${activeTab === 'single' ? renderSingleTab(partOpts) : renderBulkTab()}
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
          <button class="tab-btn ${activeTab==='bulk'?'active':''}" onclick="StockModule.switchTab('bulk')">📥 Bulk Upload (Excel)</button>
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
        </div>
      </div>`;
  }

  function switchTab(tab) {
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

    if (!filtered.length) {
      return '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">No matching uploads found</td></tr>';
    }

    return filtered.map(u => {
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
        const m = part.moulds.find(x => x.mouldNo === Number(batch.mouldNo));
        if (m) {
          mouldType = m.mouldType || '—';
          processFlow = m.processFlow || '—';
        }
      }

      labelsHtml += `
        <div class="label-container" style="${idx > 0 ? 'page-break-before: always;' : ''} width: 3.8in; height: 5.8in; border: 3px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: space-between; box-sizing: border-box; padding: 16px; margin: 0 auto;">
          <div class="company-title" style="font-size: 17px; font-weight: 900; letter-spacing: 0.5px; border-bottom: 3px solid #000; padding-bottom: 6px; width: 100%; text-align: center; text-transform: uppercase; white-space: nowrap;">JANANI MOULDINGS PVT. LTD.</div>
          <div class="qr-wrapper" style="margin: 12px 0; display: flex; align-items: center; justify-content: center; position: relative; width: 100%; height: 200px;">
            <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px; white-space: nowrap; height: 180px; display: flex; align-items: center; justify-content: center; text-align: center; border-right: 1px dashed #000; padding-right: 8px;">
              ${processFlow}
            </div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(batch.batchNo)}" style="width: 200px; height: 200px; display: block;" />
            <div style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px; white-space: nowrap; height: 180px; display: flex; align-items: center; justify-content: center; text-align: center; border-left: 1px dashed #000; padding-left: 8px;">
              IB: ${batch.internalBatchNo || '—'}
            </div>
          </div>
          <div class="batch-no-display" style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 12px; border: 3px solid #000; padding: 6px 12px; border-radius: 4px; background: #f3f4f6; text-align: center; white-space: nowrap; max-width: 100%; box-sizing: border-box; overflow: hidden; text-overflow: clip;">${batch.batchNo}</div>
          <div class="details" style="width: 100%; border-top: 3px solid #000; padding-top: 12px; font-size: 18px;">
            <div class="detail-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.3;"><span class="label" style="font-weight: 800; text-transform: uppercase; font-size: 18px;">JMREF:</span><span class="value" style="font-weight: 800; font-size: 20px; white-space: nowrap;">${batch.jmrefNo || '—'}</span></div>
            <div class="detail-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.3;"><span class="label" style="font-weight: 800; text-transform: uppercase; font-size: 18px;">Part No:</span><span class="value" style="font-weight: 800; font-size: 20px; white-space: nowrap;">${batch.partNo || '—'}</span></div>
            <div class="detail-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.3;"><span class="label" style="font-weight: 800; text-transform: uppercase; font-size: 18px;">Stage:</span><span class="value" style="font-weight: 800; font-size: 20px; white-space: nowrap;">${STAGE_LABELS[batch.currentStage] || batch.currentStage} (Stock)</span></div>
            <div class="detail-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.3;"><span class="label" style="font-weight: 800; text-transform: uppercase; font-size: 18px;">Qty:</span><span class="value" style="font-weight: 800; font-size: 20px; white-space: nowrap;">${Number(batch.initialQty).toLocaleString('en-IN')}</span></div>
            <div class="detail-row" style="display: flex; justify-content: space-between; margin-bottom: 8px; line-height: 1.3;"><span class="label" style="font-weight: 800; text-transform: uppercase; font-size: 18px;">Date:</span><span class="value" style="font-weight: 800; font-size: 20px; white-space: nowrap;">${formattedDate}</span></div>
          </div>
        </div>
      `;
    });

    printWindow.document.write(`
      <html>
      <head>
        <title>Bulk Print Stock Labels</title>
        <style>
          @page { size: 4in 6in; margin: 0; }
          body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff; color: #000; }
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
    onTypeChange
  };
})();
