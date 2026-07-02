// ============================================================
// monthly-plan.js — Monthly Planning Module
// ============================================================
const MonthlyPlanModule = (() => {
  let activeTab = 'manage'; // 'manage', 'upload', 'progress'
  let selectedMonth = new Date().toISOString().slice(0, 7); // Default: current month (YYYY-MM)
  let parsedPlans = []; // Temporary holder for Excel preview

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const master = DB.Master.all();
    const plans = DB.MonthlyPlans.byMonth(selectedMonth);

    const tabContent = 
      activeTab === 'manage'   ? renderManageTab(plans, master) :
      activeTab === 'upload'   ? renderUploadTab() :
                                 renderProgressTab(plans);

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 class="font-bold" style="font-size:20px;">Monthly Plan</h2>
            <p class="text-sm text-muted mt-1">Set, upload, and track target monthly production requirements per JMREF</p>
          </div>
          <div class="flex items-center gap-3">
            <label class="form-label" style="margin:0; font-size:13.5px; font-weight:600;">Selected Month:</label>
            <input type="month" id="plan-selected-month" class="form-control form-control-sm" style="width: 160px; margin:0;" value="${selectedMonth}" onchange="MonthlyPlanModule.changeMonth(this.value)">
          </div>
        </div>

        <div class="tabs" id="plan-module-tabs">
          <button class="tab-btn ${activeTab==='manage'?'active':''}" onclick="MonthlyPlanModule.switchTab('manage')">Manage Plans</button>
          <button class="tab-btn ${activeTab==='upload'?'active':''}" onclick="MonthlyPlanModule.switchTab('upload')">📥 Bulk Upload (Excel)</button>
          <button class="tab-btn ${activeTab==='progress'?'active':''}" onclick="MonthlyPlanModule.switchTab('progress')">📊 Plan Deductions &amp; Progress</button>
        </div>

        <div id="plan-tab-content">${tabContent}</div>
      </div>
      ${renderAddModal(master)}`;
  }

  function switchTab(tab) {
    activeTab = tab;
    render();
  }

  function changeMonth(month) {
    if (!month) return;
    selectedMonth = month;
    render();
  }

  // --- TAB 1: MANAGE PLANS ---
  function renderManageTab(plans, master) {
    const rows = plans.map((p, idx) => {
      const part = master.find(m => m.jmrefNo === p.jmrefNo) || {};
      return `
        <tr>
          <td class="text-muted">${idx + 1}</td>
          <td><span class="badge badge-teal">${p.jmrefNo}</span></td>
          <td class="font-semibold text-blue">${part.partNo || '—'}</td>
          <td>${part.description || '—'}</td>
          <td class="font-bold">${formatNum(p.qty)}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-xs" onclick="MonthlyPlanModule.openEdit('${p.id}')">Edit</button>
              <button class="btn btn-danger btn-xs" onclick="MonthlyPlanModule.deletePlan('${p.id}')">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="justify-content:space-between; flex-direction:row;">
          <h3>Target Plans for ${formatMonthLabel(selectedMonth)}</h3>
          <button class="btn btn-primary btn-sm" onclick="MonthlyPlanModule.openAddModal()">+ Add Target Plan</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:50px;">#</th>
                <th>JMREF No</th>
                <th>Part No</th>
                <th>Description</th>
                <th>Target Quantity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="6" class="text-center text-muted" style="padding:32px;">No monthly plans set for this month. Create one or upload from Excel.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // --- TAB 2: BULK EXCEL UPLOAD ---
  function renderUploadTab() {
    return `
      <div class="card animate-in" style="margin-bottom:24px;">
        <div class="card-header"><h3>Excel Bulk Upload Monthly Plan</h3></div>
        <div class="card-body">
          <div style="margin-bottom: 20px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.5;">
            <p style="margin-bottom: 8px;">Upload an Excel sheet containing monthly plan numbers to register them in bulk for <strong>${formatMonthLabel(selectedMonth)}</strong>.</p>
            <ul style="padding-left: 20px; list-style-type: disc; margin-bottom: 12px;">
              <li>The Excel sheet should contain columns: <strong>JMREF No</strong> (or <strong>JMREF</strong>), and <strong>Quantity</strong> (or <strong>Qty</strong>/<strong>Target Quantity</strong>).</li>
              <li>Uploading will add new entries or overwrite existing targets for matching JMREFs for this month.</li>
            </ul>
            <button class="btn btn-ghost btn-sm" onclick="MonthlyPlanModule.downloadTemplate()">📥 Download Plan template Excel</button>
          </div>
          
          <div class="form-group" style="max-width: 480px;">
            <label class="form-label">Select Excel File (.xlsx, .xls)</label>
            <input type="file" id="plan-bulk-input" class="form-control" accept=".xlsx, .xls" onchange="MonthlyPlanModule.handleExcelUpload(event)">
          </div>

          <div id="plan-preview-container" class="hidden" style="margin-top: 24px;">
            <h4 style="font-size:14px; font-weight:600; margin-bottom:12px;">Parsed Plans Preview</h4>
            <div class="table-wrap" style="max-height: 250px; overflow-y:auto; margin-bottom: 16px;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>JMREF</th>
                    <th>Target Quantity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="plan-preview-tbody"></tbody>
              </table>
            </div>
            <button class="btn btn-primary" id="plan-save-bulk-btn" onclick="MonthlyPlanModule.saveBulk()">Confirm and Save Plans</button>
          </div>
        </div>
      </div>`;
  }

  // --- TAB 3: DEDUCTIONS & PROGRESS ---
  function renderProgressTab(plans) {
    const batches = DB.Batches.all();

    // Map each plan to include its calculated statistics
    const plansWithStats = plans.map(p => {
      const part = DB.Master.findByJmref(p.jmrefNo) || {};
      
      // Calculate Produced: active or completed batches created in the selected month
      const matchedBatches = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth;
      });

      const produced = matchedBatches.reduce((s, b) => s + (b.initialQty || 0), 0);
      const pending = Math.max(0, p.qty - produced);
      const pct = p.qty > 0 ? (produced / p.qty) * 100 : 0;
      
      return {
        plan: p,
        part,
        produced,
        pending,
        pct
      };
    });

    // Sort plans by % Completion from low to high
    plansWithStats.sort((a, b) => a.pct - b.pct);

    const rows = plansWithStats.map((item, idx) => {
      const p = item.plan;
      const part = item.part;
      const produced = item.produced;
      const pending = item.pending;
      const pct = item.pct.toFixed(1);

      const progressColor = item.pct >= 100 ? 'var(--accent-green)' : item.pct >= 50 ? 'var(--accent-blue)' : item.pct > 0 ? 'var(--accent-amber)' : 'var(--text-muted)';

      return `
        <tr>
          <td class="text-muted">${idx + 1}</td>
          <td><span class="badge badge-teal">${p.jmrefNo}</span></td>
          <td class="font-semibold">${part.partNo || '—'}</td>
          <td class="font-bold">${formatNum(p.qty)}</td>
          <td class="font-bold text-success">${formatNum(produced)}</td>
          <td class="font-bold text-danger">${formatNum(pending)}</td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="flex:1; background:var(--bg-input); height:8px; border-radius:4px; overflow:hidden; min-width:80px;">
                <div style="background:${progressColor}; width:${Math.min(100, item.pct)}%; height:100%;"></div>
              </div>
              <span class="font-bold text-sm" style="color:${progressColor}; min-width:45px; text-align:right;">${pct}%</span>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>Target vs Actual Progress — ${formatMonthLabel(selectedMonth)}</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:50px;">#</th>
                <th>JMREF No</th>
                <th>Part No</th>
                <th>Planned Target</th>
                <th>Produced (Batches)</th>
                <th>Pending Qty</th>
                <th>% Completion</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="7" class="text-center text-muted" style="padding:32px;">No plans target data to track. Add plans first.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // --- POPUP ADD/EDIT MODAL ---
  function renderAddModal(master) {
    const partOpts = master.map(m => `<option value="${m.jmrefNo}">${m.partNo} — ${m.jmrefNo}</option>`).join('');
    return `
      <div class="modal-overlay hidden" id="plan-add-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 id="plan-modal-title">Add Target Plan</h3>
            <button class="modal-close" onclick="MonthlyPlanModule.closeModal()">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="plan-edit-id">
            
            <div class="form-group">
              <label class="form-label">Part / JMREF <span class="required">*</span></label>
              <select id="plan-part-jmref" class="form-control">
                <option value="">Select part...</option>
                ${partOpts}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Target Quantity <span class="required">*</span></label>
              <input type="number" id="plan-qty" class="form-control" min="1" placeholder="e.g. 5000">
            </div>

            <div class="form-group">
              <label class="form-label">Target Month <span class="required">*</span></label>
              <input type="month" id="plan-month" class="form-control" value="${selectedMonth}">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="MonthlyPlanModule.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="MonthlyPlanModule.savePlan()">Save Plan</button>
          </div>
        </div>
      </div>`;
  }

  function openAddModal() {
    document.getElementById('plan-edit-id').value = '';
    document.getElementById('plan-modal-title').textContent = 'Add Target Plan';
    document.getElementById('plan-part-jmref').value = '';
    document.getElementById('plan-part-jmref').disabled = false;
    document.getElementById('plan-qty').value = '';
    document.getElementById('plan-month').value = selectedMonth;
    document.getElementById('plan-add-modal').classList.remove('hidden');
  }

  function openEdit(id) {
    const plan = DB.MonthlyPlans.find(id);
    if (!plan) return;

    document.getElementById('plan-edit-id').value = id;
    document.getElementById('plan-modal-title').textContent = 'Edit Target Plan';
    document.getElementById('plan-part-jmref').value = plan.jmrefNo;
    document.getElementById('plan-part-jmref').disabled = true; // Cannot edit JMREF once set
    document.getElementById('plan-qty').value = plan.qty;
    document.getElementById('plan-month').value = plan.month;
    document.getElementById('plan-add-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('plan-add-modal').classList.add('hidden');
  }

  function savePlan() {
    const id = document.getElementById('plan-edit-id').value;
    const jmrefNo = document.getElementById('plan-part-jmref').value;
    const qty = parseInt(document.getElementById('plan-qty').value);
    const month = document.getElementById('plan-month').value;

    if (!jmrefNo) { showToast('Please select a part/JMREF', 'error'); return; }
    if (isNaN(qty) || qty <= 0) { showToast('Please enter a valid target quantity', 'error'); return; }
    if (!month) { showToast('Please select a target month', 'error'); return; }

    const session = Auth.getSession();

    if (id) {
      // Edit
      DB.MonthlyPlans.update(id, { qty, month });
      showToast('Monthly target plan updated successfully', 'success');
    } else {
      // Add new
      // Check duplicate
      const duplicate = DB.MonthlyPlans.byMonthAndJmref(month, jmrefNo);
      if (duplicate) {
        showToast(`Plan already exists for ${jmrefNo} in ${formatMonthLabel(month)}. Please edit that instead.`, 'error');
        return;
      }
      DB.MonthlyPlans.insert({
        jmrefNo,
        qty,
        month,
        recordedBy: session && session.userId
      });
      showToast('Monthly target plan saved', 'success');
    }

    closeModal();
    render();
  }

  function deletePlan(id) {
    if (!confirm('Are you sure you want to delete this monthly plan?')) return;
    DB.MonthlyPlans.remove(id);
    showToast('Plan deleted', 'success');
    render();
  }

  // --- EXCEL TEMPLATE & PARSER ---
  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded, please wait', 'warning');
      return;
    }
    const headers = ['JMREF No', 'Quantity'];
    const rows = [
      ['JMREF-2026-101', '5000'],
      ['JMREF-2026-102', '10000']
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Plan Template');
    XLSX.writeFile(wb, `Monthly_Plan_Template_${selectedMonth}.xlsx`);
    showToast('Plan template Excel downloaded', 'success');
  }

  function handleExcelUpload(event) {
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
        
        previewBulkPlans(rawJson);
      } catch (err) {
        console.error(err);
        showToast('Error reading Excel: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function previewBulkPlans(rawJson) {
    const master = DB.Master.all();
    parsedPlans = [];
    const tbody = document.getElementById('plan-preview-tbody');
    const container = document.getElementById('plan-preview-container');
    const saveBtn = document.getElementById('plan-save-bulk-btn');

    if (!tbody || !container || !saveBtn) return;
    tbody.innerHTML = '';

    let validCount = 0;

    rawJson.forEach(row => {
      // Clean properties
      const cleanRow = {};
      Object.keys(row).forEach(k => {
        cleanRow[k.trim().toLowerCase()] = String(row[k]).trim();
      });

      const jmrefVal = cleanRow['jmref no'] || cleanRow['jmref'] || cleanRow['jmrefno'] || '';
      const qtyVal = parseInt(cleanRow['quantity'] || cleanRow['qty'] || cleanRow['target quantity'] || '');

      let status = 'Valid';
      let isValid = true;

      const partExists = master.find(m => m.jmrefNo === jmrefVal);

      if (!jmrefVal || isNaN(qtyVal) || qtyVal <= 0) {
        status = 'Missing or invalid fields';
        isValid = false;
      } else if (!partExists) {
        status = 'JMREF not in Inventory Master';
        isValid = false;
      }

      if (isValid) {
        validCount++;
      }

      parsedPlans.push({
        jmrefNo: jmrefVal,
        qty: qtyVal,
        isValid
      });

      const statusBadge = isValid 
        ? `<span class="badge badge-green">Valid</span>` 
        : `<span class="badge badge-red" title="${status}">${status}</span>`;

      tbody.innerHTML += `
        <tr>
          <td><span class="badge badge-teal">${jmrefVal || '—'}</span></td>
          <td class="font-semibold">${isNaN(qtyVal) ? '—' : formatNum(qtyVal)}</td>
          <td>${statusBadge}</td>
        </tr>`;
    });

    container.classList.remove('hidden');
    saveBtn.disabled = validCount === 0;
  }

  function saveBulk() {
    const session = Auth.getSession();
    let savedCount = 0;

    parsedPlans.forEach(p => {
      if (p.isValid) {
        const existing = DB.MonthlyPlans.byMonthAndJmref(selectedMonth, p.jmrefNo);
        if (existing) {
          // Overwrite existing plan qty
          DB.MonthlyPlans.update(existing.id, { qty: p.qty });
        } else {
          // Create new plan record
          DB.MonthlyPlans.insert({
            jmrefNo: p.jmrefNo,
            qty: p.qty,
            month: selectedMonth,
            recordedBy: session && session.userId
          });
        }
        savedCount++;
      }
    });

    showToast(`Successfully registered ${savedCount} target monthly plans!`, 'success');
    parsedPlans = [];
    activeTab = 'manage';
    render();
  }

  // --- UTILS ---
  function formatMonthLabel(monthStr) {
    if (!monthStr) return '—';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  return {
    render,
    switchTab,
    changeMonth,
    openAddModal,
    openEdit,
    closeModal,
    savePlan,
    deletePlan,
    downloadTemplate,
    handleExcelUpload,
    saveBulk
  };
})();
