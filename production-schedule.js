// ============================================================
// production-schedule.js — Production Scheduling Module
// ============================================================
const ProductionScheduleModule = (() => {
  let activeTab = 'summary'; // 'summary', 'entries'
  let selectedMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const master = DB.Master.all();
    const plans = DB.MonthlyPlans.byMonth(selectedMonth);
    const schedules = DB.ProductionSchedules.byMonth(selectedMonth);

    const tabContent = 
      activeTab === 'summary' ? renderSummaryTab(plans, schedules, master) :
                                renderEntriesTab(schedules, master);

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 class="font-bold" style="font-size:20px;">Production Schedule</h2>
            <p class="text-sm text-muted mt-1">Schedule production targets for subcontractors or in-house, and track execution</p>
          </div>
          <div class="flex items-center gap-3">
            <label class="form-label" style="margin:0; font-size:13.5px; font-weight:600;">Selected Month:</label>
            <input type="month" id="schedule-selected-month" class="form-control form-control-sm" style="width: 160px; margin:0;" value="${selectedMonth}" onchange="ProductionScheduleModule.changeMonth(this.value)">
          </div>
        </div>

        <div class="tabs" id="schedule-module-tabs">
          <button class="tab-btn ${activeTab==='summary'?'active':''}" onclick="ProductionScheduleModule.switchTab('summary')">Schedule Summary &amp; deductions</button>
          <button class="tab-btn ${activeTab==='entries'?'active':''}" onclick="ProductionScheduleModule.switchTab('entries')">Schedule Entries</button>
        </div>

        <div id="schedule-tab-content">${tabContent}</div>
      </div>
      ${renderAddModal(plans, master)}`;
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

  // --- TAB 1: SUMMARY & DEDUCTIONS ---
  function renderSummaryTab(plans, schedules, master) {
    const batches = DB.Batches.all();

    const rows = plans.map((p, idx) => {
      const part = master.find(m => m.jmrefNo === p.jmrefNo) || {};
      
      // Matched schedules & batches
      const matchedSchedules = schedules.filter(s => s.jmrefNo === p.jmrefNo);
      const matchedBatches = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth;
      });

      // Total calculations
      const scheduledQty = matchedSchedules.reduce((sum, s) => sum + (s.qty || 0), 0);
      const producedQty = matchedBatches.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const schedPct = scheduledQty > 0 ? ((producedQty / scheduledQty) * 100).toFixed(1) : '0.0';
      const progressColor = schedPct >= 100 ? 'var(--accent-green)' : schedPct >= 50 ? 'var(--accent-blue)' : schedPct > 0 ? 'var(--accent-amber)' : 'var(--text-muted)';

      // In-House calculations
      const matchedSchedulesInHouse = matchedSchedules.filter(s => s.producedBy === 'inhouse');
      const scheduledInHouse = matchedSchedulesInHouse.reduce((sum, s) => sum + (s.qty || 0), 0);
      const matchedBatchesInHouse = matchedBatches.filter(b => b.productionType === 'inhouse');
      const producedInHouse = matchedBatchesInHouse.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const inHousePct = scheduledInHouse > 0 ? ((producedInHouse / scheduledInHouse) * 100).toFixed(1) : '0.0';

      // Subcontractor calculations
      const matchedSchedulesSub = matchedSchedules.filter(s => s.producedBy === 'subcontractor');
      const scheduledSub = matchedSchedulesSub.reduce((sum, s) => sum + (s.qty || 0), 0);
      const matchedBatchesSub = matchedBatches.filter(b => b.productionType === 'subcontractor');
      const producedSub = matchedBatchesSub.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const subPct = scheduledSub > 0 ? ((producedSub / scheduledSub) * 100).toFixed(1) : '0.0';

      return `
        <tr>
          <td class="text-muted">${idx + 1}</td>
          <td><span class="badge badge-teal">${p.jmrefNo}</span></td>
          <td class="font-semibold text-blue">${part.partNo || '—'}</td>
          <td class="font-bold">${formatNum(p.qty)}</td>
          <td>
            <div class="font-semibold">${formatNum(producedInHouse)} / ${formatNum(scheduledInHouse)}</div>
            <div class="text-xs font-bold" style="color:${scheduledInHouse > 0 && producedInHouse >= scheduledInHouse ? 'var(--accent-green)' : scheduledInHouse > 0 && producedInHouse > 0 ? 'var(--accent-blue)' : 'var(--text-secondary)'};">${inHousePct}%</div>
          </td>
          <td>
            <div class="font-semibold">${formatNum(producedSub)} / ${formatNum(scheduledSub)}</div>
            <div class="text-xs font-bold" style="color:${scheduledSub > 0 && producedSub >= scheduledSub ? 'var(--accent-green)' : scheduledSub > 0 && producedSub > 0 ? 'var(--accent-blue)' : 'var(--text-secondary)'};">${subPct}%</div>
          </td>
          <td>
            <div class="font-bold text-success">${formatNum(producedQty)} / ${formatNum(scheduledQty)}</div>
            <div class="text-xs font-bold" style="color:${progressColor};">${schedPct}%</div>
          </td>
          <td>
            <button class="btn btn-teal btn-xs" onclick="ProductionScheduleModule.openAddModal('${p.jmrefNo}')">Schedule</button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>Schedule Summary for ${formatMonthLabel(selectedMonth)}</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:50px;">#</th>
                <th>JMREF No</th>
                <th>Part No</th>
                <th>Monthly Target</th>
                <th>In-House (Prod / Sched)</th>
                <th>Subcontractor (Prod / Sched)</th>
                <th>Total (Prod / Sched)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">No monthly plans found for this month. Set plans first under "Monthly Plan".</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // --- TAB 2: SCHEDULE ENTRIES ---
  function renderEntriesTab(schedules, master) {
    const subs = DB.Subcontractors.all();

    const rows = schedules.map((s, idx) => {
      const part = master.find(m => m.jmrefNo === s.jmrefNo) || {};
      const subcontractor = s.producedBy === 'subcontractor' ? (subs.find(sub => sub.id === s.subcontractorId)?.name || 'Subcontractor') : 'In House';
      const sourceBadge = s.producedBy === 'inhouse' ? 'badge-blue' : 'badge-amber';

      return `
        <tr>
          <td class="text-muted">${idx + 1}</td>
          <td><span class="badge badge-teal">${s.jmrefNo}</span></td>
          <td class="font-semibold">${part.partNo || '—'}</td>
          <td><span class="badge ${sourceBadge}">${s.producedBy === 'inhouse' ? 'In House' : 'Subcontractor'}</span></td>
          <td>${subcontractor}</td>
          <td class="font-bold">${formatNum(s.qty)}</td>
          <td>${formatDate(s.scheduleDate)}</td>
          <td class="text-muted text-sm">${s.notes || '—'}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-xs" onclick="ProductionScheduleModule.openEdit('${s.id}')">Edit</button>
              <button class="btn btn-danger btn-xs" onclick="ProductionScheduleModule.deleteSchedule('${s.id}')">Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="justify-content:space-between; flex-direction:row;">
          <h3>Scheduled Entries</h3>
          <button class="btn btn-primary btn-sm" onclick="ProductionScheduleModule.openAddModal()">+ Add Schedule Entry</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:50px;">#</th>
                <th>JMREF No</th>
                <th>Part No</th>
                <th>Source</th>
                <th>Facility</th>
                <th>Scheduled Qty</th>
                <th>Schedule Date</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="9" class="text-center text-muted" style="padding:32px;">No schedule entries for this month. Create one to plan production.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // --- POPUP ADD/EDIT MODAL ---
  function renderAddModal(plans, master) {
    const subs = DB.Subcontractors.active();
    const subOpts = subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    const jmrefs = plans.map(p => {
      const part = master.find(m => m.jmrefNo === p.jmrefNo) || {};
      return `<option value="${p.jmrefNo}">${part.partNo || p.jmrefNo} — ${p.jmrefNo}</option>`;
    }).join('');

    return `
      <div class="modal-overlay hidden" id="schedule-add-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 id="schedule-modal-title">Create Schedule Entry</h3>
            <button class="modal-close" onclick="ProductionScheduleModule.closeModal()">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="schedule-edit-id">
            
            <div class="form-group">
              <label class="form-label">Plan / JMREF <span class="required">*</span></label>
              <select id="schedule-part-jmref" class="form-control">
                <option value="">Select JMREF...</option>
                ${jmrefs}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Production Source <span class="required">*</span></label>
              <div class="flex gap-4 mt-2">
                <label style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                  <input type="radio" name="schedule-source" value="inhouse" checked onchange="ProductionScheduleModule.toggleSourceFields()"> 
                  <span>In House</span>
                </label>
                <label style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                  <input type="radio" name="schedule-source" value="subcontractor" onchange="ProductionScheduleModule.toggleSourceFields()"> 
                  <span>Subcontractor</span>
                </label>
              </div>
            </div>

            <div class="form-group hidden" id="schedule-subcontractor-group">
              <label class="form-label">Subcontractor <span class="required">*</span></label>
              <select id="schedule-subcontractor" class="form-control">
                <option value="">Select subcontractor...</option>
                ${subOpts}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Scheduled Quantity <span class="required">*</span></label>
              <input type="number" id="schedule-qty" class="form-control" min="1" placeholder="e.g. 2500">
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Schedule Date <span class="required">*</span></label>
                <input type="date" id="schedule-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Plan Month <span class="required">*</span></label>
                <input type="month" id="schedule-month" class="form-control" value="${selectedMonth}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Notes</label>
              <textarea id="schedule-notes" class="form-control" rows="2" placeholder="Optional notes"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="ProductionScheduleModule.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="ProductionScheduleModule.saveSchedule()">Save Entry</button>
          </div>
        </div>
      </div>`;
  }

  function toggleSourceFields() {
    const src = document.querySelector('[name=schedule-source]:checked')?.value;
    const subGroup = document.getElementById('schedule-subcontractor-group');
    if (subGroup) {
      subGroup.classList.toggle('hidden', src !== 'subcontractor');
    }
  }

  function openAddModal(preSelectedJmref = '') {
    document.getElementById('schedule-edit-id').value = '';
    document.getElementById('schedule-modal-title').textContent = 'Create Schedule Entry';
    document.getElementById('schedule-part-jmref').value = preSelectedJmref;
    document.getElementById('schedule-part-jmref').disabled = false;
    
    document.querySelector('[name=schedule-source][value=inhouse]').checked = true;
    toggleSourceFields();
    
    document.getElementById('schedule-subcontractor').value = '';
    document.getElementById('schedule-qty').value = '';
    document.getElementById('schedule-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('schedule-month').value = selectedMonth;
    document.getElementById('schedule-notes').value = '';
    
    document.getElementById('schedule-add-modal').classList.remove('hidden');
  }

  function openEdit(id) {
    const s = DB.ProductionSchedules.find(id);
    if (!s) return;

    document.getElementById('schedule-edit-id').value = id;
    document.getElementById('schedule-modal-title').textContent = 'Edit Schedule Entry';
    document.getElementById('schedule-part-jmref').value = s.jmrefNo;
    document.getElementById('schedule-part-jmref').disabled = true;
    
    document.querySelector(`[name=schedule-source][value=${s.producedBy}]`).checked = true;
    toggleSourceFields();
    
    if (s.producedBy === 'subcontractor') {
      document.getElementById('schedule-subcontractor').value = s.subcontractorId || '';
    }
    
    document.getElementById('schedule-qty').value = s.qty;
    document.getElementById('schedule-date').value = s.scheduleDate;
    document.getElementById('schedule-month').value = s.month;
    document.getElementById('schedule-notes').value = s.notes || '';
    
    document.getElementById('schedule-add-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('schedule-add-modal').classList.add('hidden');
  }

  function saveSchedule() {
    const id = document.getElementById('schedule-edit-id').value;
    const jmrefNo = document.getElementById('schedule-part-jmref').value;
    const producedBy = document.querySelector('[name=schedule-source]:checked')?.value || 'inhouse';
    const subcontractorId = producedBy === 'subcontractor' ? document.getElementById('schedule-subcontractor').value : null;
    const qty = parseInt(document.getElementById('schedule-qty').value);
    const scheduleDate = document.getElementById('schedule-date').value;
    const month = document.getElementById('schedule-month').value;
    const notes = document.getElementById('schedule-notes').value.trim();

    if (!jmrefNo) { showToast('Please select a JMREF', 'error'); return; }
    if (producedBy === 'subcontractor' && !subcontractorId) { showToast('Please select a subcontractor', 'error'); return; }
    if (isNaN(qty) || qty <= 0) { showToast('Please enter a valid scheduled quantity', 'error'); return; }
    if (!scheduleDate) { showToast('Please select a schedule date', 'error'); return; }
    if (!month) { showToast('Please select a month', 'error'); return; }

    const session = Auth.getSession();
    const payload = {
      jmrefNo,
      producedBy,
      subcontractorId,
      qty,
      scheduleDate,
      month,
      notes,
      recordedBy: session && session.userId
    };

    if (id) {
      DB.ProductionSchedules.update(id, payload);
      showToast('Schedule entry updated', 'success');
    } else {
      DB.ProductionSchedules.insert(payload);
      showToast('Schedule entry saved successfully', 'success');
    }

    closeModal();
    render();
  }

  function deleteSchedule(id) {
    if (!confirm('Are you sure you want to delete this schedule entry?')) return;
    DB.ProductionSchedules.remove(id);
    showToast('Schedule entry deleted', 'success');
    render();
  }

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
    toggleSourceFields,
    openAddModal,
    openEdit,
    closeModal,
    saveSchedule,
    deleteSchedule
  };
})();
