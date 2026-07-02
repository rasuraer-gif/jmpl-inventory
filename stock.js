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
    const uploads = DB.StockUploads.all().sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
    const master = DB.Master.all();
    const users = DB.Users.all();
    const stageOpts = Object.entries(STAGE_LABELS).map(([k,v])=>'<option value="' + k + '">' + v + '</option>').join('');
    const partOpts = master.map(m=>'<option value="' + m.id + '" data-jmref="' + m.jmrefNo + '">' + m.partNo + ' — ' + m.jmrefNo + '</option>').join('');

    const formHtml = isAdmin ? `
      <div id="stock-upload-forms">
        ${activeTab === 'single' ? renderSingleTab(stageOpts, partOpts) : renderBulkTab()}
      </div>` : `
      <div class="card card-body" style="margin-bottom:24px;text-align:center;padding:32px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">
        <div style="font-size:36px;margin-bottom:12px;">⚠️</div>
        <h3 style="margin-bottom:8px;">Admin Access Required</h3>
        <p class="text-muted text-sm">Only administrators can upload stock snapshots.</p>
      </div>`;

    const rows = uploads.map(u => {
      const part = master.find(m=>m.id===u.partId)||{};
      const user = users.find(uu=>uu.id===u.uploadedBy)||{};
      return '<tr><td><span class="badge badge-blue">' + (STAGE_LABELS[u.stage]||u.stage) + '</span></td><td>' + (part.partNo||'—') + '</td><td><span class="badge badge-teal">' + (u.jmrefNo||'—') + '</span></td><td class="font-semibold">' + formatNum(u.qty) + '</td><td class="text-muted text-sm">' + (u.uploadedAt||'').slice(0,10) + '</td><td class="text-muted text-sm">' + (user.name||'—') + '</td><td class="text-muted text-sm">' + (u.notes||'—') + '</td></tr>';
    }).join('');

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
          <div class="card-header"><h3>Upload History</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Stage</th><th>Part No</th><th>JMREF</th><th>Qty</th><th>Upload Date</th><th>Uploaded By</th><th>Notes</th></tr></thead>
              <tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No stock uploads yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function switchTab(tab) {
    activeTab = tab;
    render();
  }

  function renderSingleTab(stageOpts, partOpts) {
    return `
      <div class="card animate-in" style="margin-bottom:24px;">
        <div class="card-header"><h3>Upload Stock Snapshot</h3><span class="badge badge-amber">Admin Only — Overwrite</span></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">This will record the stock count for the selected Stage + Part combination.</p>
          <div class="form-row-3">
            <div class="form-group"><label class="form-label">Stage <span class="required">*</span></label><select id="stock-stage" class="form-control"><option value="">Select stage...</option>${stageOpts}</select></div>
            <div class="form-group"><label class="form-label">Part <span class="required">*</span></label><select id="stock-part" class="form-control"><option value="">Select part...</option>${partOpts}</select></div>
            <div class="form-group"><label class="form-label">Quantity <span class="required">*</span></label><input type="number" id="stock-qty" class="form-control" min="0" placeholder="Current stock qty"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Upload Date <span class="required">*</span></label><input type="date" id="stock-date" class="form-control" value="${new Date().toISOString().slice(0,10)}"></div>
            <div class="form-group"><label class="form-label">Notes</label><input type="text" id="stock-notes" class="form-control" placeholder="Optional notes"></div>
          </div>
          <button class="btn btn-primary" onclick="StockModule.upload()">Upload Stock Snapshot</button>
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

        // Log the action historically
        DB.StockUploads.insert({
          stage: item.stage,
          partId: item.partId,
          jmrefNo: item.jmrefNo,
          qty: T,
          uploadedAt: dateInput,
          uploadedBy: session && session.userId,
          notes: `Bulk Excel Adjustment Reconciliation (Was: ${curr}, Shift: ${diff > 0 ? '+' : ''}${diff})`
        });

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
              DB.Batches.insert({
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
            }
          }
        }
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
    const stage = document.getElementById('stock-stage').value;
    const partEl = document.getElementById('stock-part');
    const partId = partEl.value;
    const jmrefNo = partEl.options[partEl.selectedIndex]?.dataset?.jmref || '';
    const qty = parseInt(document.getElementById('stock-qty').value);
    const uploadedAt = document.getElementById('stock-date').value;
    const notes = document.getElementById('stock-notes').value.trim();
    const session = Auth.getSession();
    
    if (!stage) { showToast('Please select a stage', 'error'); return; }
    if (!partId) { showToast('Please select a part', 'error'); return; }
    if (isNaN(qty) || qty < 0) { showToast('Please enter a valid quantity', 'error'); return; }
    if (!uploadedAt) { showToast('Upload date is required', 'error'); return; }
    
    DB.StockUploads.insert({ stage, partId, jmrefNo, qty, uploadedAt, uploadedBy: session && session.userId, notes });
    showToast('Stock snapshot uploaded successfully', 'success');
    render();
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
    confirmAdjustments
  };
})();
