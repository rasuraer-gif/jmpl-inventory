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
    const batches = DB.Batches.all();

    // Filter plans to only show JMREF if % of completion is lesser than 200% (for dropdown)
    const plansUnder200 = plans.filter(p => {
      const matchedBatches = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth;
      });
      const produced = matchedBatches.reduce((s, b) => s + (b.initialQty || 0), 0);
      const pct = p.qty > 0 ? (produced / p.qty) * 100 : 0;
      return pct < 200;
    });

    // Filter schedules to only show entries for JMREF if % of completion is lesser than 200% (for entries tab)
    const schedulesUnder200 = schedules.filter(s => {
      const p = plans.find(plan => plan.jmrefNo === s.jmrefNo);
      if (!p) return true; // If no plan target is set for this JMREF, keep it
      const matchedBatches = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth;
      });
      const produced = matchedBatches.reduce((s, b) => s + (b.initialQty || 0), 0);
      const pct = p.qty > 0 ? (produced / p.qty) * 100 : 0;
      return pct < 200;
    });

    const stageRecords = DB.StageRecords.all();
    const wipStages = ['production','cryogenic','deflashing','trimming','visual','gauge','quality'];

    // Filter plans specifically for the Summary Tab: ONLY display JMREF where (Monthly Target * 2) >= Total Qty in hand
    const summaryPlans = plans.filter(p => {
      const part = master.find(m => m.jmrefNo === p.jmrefNo);
      if (!part) return false;

      // 1. Store stock
      const storeQty = DB.StoreInventory.availableByJmref(p.jmrefNo);

      // 2. WIP stock across all WIP stages
      let wipQty = 0;
      wipStages.forEach(stage => {
        const activeBatches = batches.filter(b =>
          b.partId === part.id && b.currentStage === stage && b.status === 'active'
        );
        wipQty += activeBatches.reduce((sum, b) => {
          const incoming = stageRecords.filter(r => r.batchId === b.id && r.movedTo === stage);
          if (incoming.length) {
            return sum + (incoming[incoming.length - 1].outputQty || 0);
          }
          return sum + (b.initialQty || 0);
        }, 0);
      });

      const totalQtyInHand = storeQty + wipQty;
      return p.qty === 0 || (p.qty * 2) >= totalQtyInHand;
    });

    const tabContent = 
      activeTab === 'summary' ? renderSummaryTab(summaryPlans, schedules, master) :
                                renderEntriesTab(schedulesUnder200, master);

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
      ${renderAddModal(plansUnder200, master)}`;
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

    // Map plans to include pre-computed Produced quantity and achievement percentage for sorting
    const plansWithData = plans.map(p => {
      const matchedBatches = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth;
      });
      const producedQty = matchedBatches.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const totalTargetPct = p.qty > 0 ? (producedQty / p.qty) * 100 : 0;
      return { p, producedQty, totalTargetPct };
    });

    // Sort plans by less achieved first (low to high percentage)
    plansWithData.sort((a, b) => a.totalTargetPct - b.totalTargetPct);

    const rows = plansWithData.map((data, idx) => {
      const p = data.p;
      const producedQty = data.producedQty;
      const totalTargetPct = data.totalTargetPct;
      const totalTargetPctStr = totalTargetPct.toFixed(1);
      const progressColor = totalTargetPct >= 100 ? 'var(--accent-green)' : totalTargetPct >= 50 ? 'var(--accent-blue)' : totalTargetPct > 0 ? 'var(--accent-amber)' : 'var(--text-muted)';
      
      const part = master.find(m => m.jmrefNo === p.jmrefNo) || {};
      
      // Matched schedules & batches
      const matchedSchedules = schedules.filter(s => s.jmrefNo === p.jmrefNo);
      const matchedBatches = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth;
      });

      const scheduledQty = matchedSchedules.reduce((sum, s) => sum + (s.qty || 0), 0);

      // In-House calculations
      const matchedSchedulesInHouse = matchedSchedules.filter(s => s.producedBy === 'inhouse');
      const scheduledInHouse = matchedSchedulesInHouse.reduce((sum, s) => sum + (s.qty || 0), 0);
      const matchedBatchesInHouse = matchedBatches.filter(b => b.productionType === 'inhouse');
      const producedInHouse = matchedBatchesInHouse.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const inHouseTargetPct = p.qty > 0 ? ((producedInHouse / p.qty) * 100).toFixed(1) : '0.0';

      // Subcontractor calculations
      const matchedSchedulesSub = matchedSchedules.filter(s => s.producedBy === 'subcontractor');
      const scheduledSub = matchedSchedulesSub.reduce((sum, s) => sum + (s.qty || 0), 0);
      const matchedBatchesSub = matchedBatches.filter(b => b.productionType === 'subcontractor');
      const producedSub = matchedBatchesSub.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const subTargetPct = p.qty > 0 ? ((producedSub / p.qty) * 100).toFixed(1) : '0.0';

      return `
        <tr>
          <td class="text-muted">${idx + 1}</td>
          <td><span class="badge badge-teal">${p.jmrefNo}</span></td>
          <td class="font-semibold text-blue">${part.partNo || '—'}</td>
          <td class="font-bold">${formatNum(p.qty)}</td>
          <td>
            <div class="font-semibold" style="font-size:12px;">Prod: <strong>${formatNum(producedInHouse)}</strong></div>
            <div class="text-xs text-muted" style="margin-top:2px;">Sched: ${formatNum(scheduledInHouse)}</div>
            <div class="text-xs font-bold" style="color: var(--accent-blue); margin-top:2px;">${inHouseTargetPct}% of Target</div>
          </td>
          <td>
            <div class="font-semibold" style="font-size:12px;">Prod: <strong>${formatNum(producedSub)}</strong></div>
            <div class="text-xs text-muted" style="margin-top:2px;">Sched: ${formatNum(scheduledSub)}</div>
            <div class="text-xs font-bold" style="color: var(--accent-blue); margin-top:2px;">${subTargetPct}% of Target</div>
          </td>
          <td>
            <div class="font-bold text-success" style="font-size:12.5px;">${formatNum(producedQty)} / ${formatNum(p.qty)}</div>
            <div class="text-xs font-bold" style="color:${progressColor}; margin-top:2px;">${totalTargetPctStr}% Achieved</div>
          </td>
          <td>
            <button class="btn btn-teal btn-xs" onclick="ProductionScheduleModule.openAddModal('${p.jmrefNo}')">Schedule</button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="justify-content:space-between; flex-direction:row; align-items:center;">
          <h3>Schedule Summary for ${formatMonthLabel(selectedMonth)}</h3>
          <button class="btn btn-teal btn-sm" onclick="ProductionScheduleModule.exportSummaryExcel()">📊 Export Excel</button>
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
              ${rows || `<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">No monthly plans found where twice the target is greater than or equal to the total quantity in hand.</td></tr>`}
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
    
    // Ensure the option exists in the dropdown (in case it was filtered out by the 200% completion limit)
    const select = document.getElementById('schedule-part-jmref');
    let optionExists = false;
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].value === s.jmrefNo) {
        optionExists = true;
        break;
      }
    }
    if (!optionExists) {
      const part = DB.Master.findByJmref(s.jmrefNo) || {};
      const opt = document.createElement('option');
      opt.value = s.jmrefNo;
      opt.textContent = `${part.partNo || s.jmrefNo} — ${s.jmrefNo}`;
      select.appendChild(opt);
    }

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

  function exportSummaryExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded', 'error'); return;
    }

    const master = DB.Master.all();
    const plans = DB.MonthlyPlans.byMonth(selectedMonth);
    const schedules = DB.ProductionSchedules.byMonth(selectedMonth);
    const batches = DB.Batches.all();

    // Map plans to include pre-computed Produced quantity and achievement percentage for sorting
    const plansWithData = plans.map(p => {
      const matchedBatches = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth;
      });
      const producedQty = matchedBatches.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const totalTargetPct = p.qty > 0 ? (producedQty / p.qty) * 100 : 0;
      return { p, producedQty, totalTargetPct };
    });

    // Sort by less achieved first (low to high percentage)
    plansWithData.sort((a, b) => a.totalTargetPct - b.totalTargetPct);

    const headers = [
      '#', 'JMREF No', 'Part No', 'Monthly Target',
      'In-House Produced', 'In-House Scheduled', 'In-House Target %',
      'Subcontractor Produced', 'Subcontractor Scheduled', 'Subcontractor Target %',
      'Total Produced', 'Total Target', 'Total Achievement %'
    ];

    const rows = plansWithData.map((data, idx) => {
      const p = data.p;
      const producedQty = data.producedQty;
      const totalTargetPct = data.totalTargetPct;
      const part = master.find(m => m.jmrefNo === p.jmrefNo) || {};
      
      const matchedSchedules = schedules.filter(s => s.jmrefNo === p.jmrefNo);
      
      // In-House calculations
      const matchedSchedulesInHouse = matchedSchedules.filter(s => s.producedBy === 'inhouse');
      const scheduledInHouse = matchedSchedulesInHouse.reduce((sum, s) => sum + (s.qty || 0), 0);
      const matchedBatchesInHouse = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth && b.productionType === 'inhouse';
      });
      const producedInHouse = matchedBatchesInHouse.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const inHouseTargetPct = p.qty > 0 ? ((producedInHouse / p.qty) * 100).toFixed(1) : '0.0';

      // Subcontractor calculations
      const matchedSchedulesSub = matchedSchedules.filter(s => s.producedBy === 'subcontractor');
      const scheduledSub = matchedSchedulesSub.reduce((sum, s) => sum + (s.qty || 0), 0);
      const matchedBatchesSub = batches.filter(b => {
        const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
        return b.jmrefNo === p.jmrefNo && bd === selectedMonth && b.productionType === 'subcontractor';
      });
      const producedSub = matchedBatchesSub.reduce((sum, b) => sum + (b.initialQty || 0), 0);
      const subTargetPct = p.qty > 0 ? ((producedSub / p.qty) * 100).toFixed(1) : '0.0';

      return [
        idx + 1,
        p.jmrefNo,
        part.partNo || '—',
        p.qty,
        producedInHouse,
        scheduledInHouse,
        inHouseTargetPct + '%',
        producedSub,
        scheduledSub,
        subTargetPct + '%',
        producedQty,
        p.qty,
        totalTargetPct.toFixed(1) + '%'
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    
    // Auto column width
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length), 10)
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production Schedule Summary');
    XLSX.writeFile(wb, `JMPL_Production_Schedule_Summary_${selectedMonth}_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Excel exported successfully', 'success');
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
    deleteSchedule,
    exportSummaryExcel
  };
})();
