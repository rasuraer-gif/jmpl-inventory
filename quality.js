// ============================================================
// quality.js — Quality Final Module
// ============================================================
const QualityModule = (() => {
  const STAGE_LABELS = { production:'Production', cryogenic:'Cryogenic', deflashing:'Flash Removal', trimming:'Trimming', visual:'Visual', gauge:'Gauge' };

  let activeTab = 'pending';
  let recheckSearch = '';
  let rejectSearch = '';
  let pendingSearch = '';
  let currentPage = 1;
  const itemsPerPage = 50;

  function isStkAdjBatch(b) {
    if (!b) return false;
    const bNo = String(b.batchNo || '').toUpperCase();
    if (bNo.includes('STK-ADJ') || bNo.includes('STK_ADJ') || bNo.includes('STKADJ') || bNo.includes('REC-')) return true;
    const notes = String(b.notes || '');
    if (notes.includes('Direct Store Stock Reconciliation') || notes.includes('Stock Reconciliation') || notes.includes('Closed via stock') || notes.includes('Zeroed via stock') || notes.includes('zeroing')) return true;
    return false;
  }

  function isMovedToStore(b) {
    if (!b) return false;
    if (b.currentStage === 'store' || b.status === 'completed') return true;
    const recs = DB.StageRecords.byBatch(b.id);
    if (recs && recs.some(r => r.stage === 'store' || (r.stage === 'quality' && r.movedTo === 'store'))) {
      try {
        const storeRec = recs.find(r => r.stage === 'store') || recs.find(r => r.stage === 'quality' && r.movedTo === 'store');
        const passedQty = storeRec ? (storeRec.outputQty || storeRec.inputQty || b.initialQty || 0) : (b.initialQty || 0);
        DB.Batches.update(b.id, {
          status: 'completed',
          currentStage: 'store',
          completedAt: storeRec && storeRec.date ? storeRec.date : (b.updatedAt || new Date().toISOString()),
          remainingQty: passedQty
        });
      } catch(e) {}
      return true;
    }
    return false;
  }

  function getInputQty(batchId) {
    const recs = DB.StageRecords.byBatch(batchId).filter(r => r.movedTo === 'quality');
    const batch = DB.Batches.find(batchId) || {};
    if (!recs.length) return batch.initialQty || 0;
    const lastRec = recs[recs.length - 1];
    const qtyVal = Number(lastRec.isRecheck ? lastRec.recheckQty : lastRec.outputQty);
    return !isNaN(qtyVal) ? qtyVal : (batch.initialQty || 0);
  }

  function render() {
    currentPage = 1;
    pendingSearch = '';
    const el = document.getElementById('content');
    const batches = DB.Batches.byStage('quality').filter(b => !isStkAdjBatch(b) && !isMovedToStore(b));
    const thisMonth = new Date().toISOString().slice(0,7);
    const allBatchesList = (DB.Batches.allIncludeArchived ? DB.Batches.allIncludeArchived() : DB.Batches.all()).filter(b => !isStkAdjBatch(b));

    const passedBatchIdsThisMonth = new Set();
    DB.StageRecords.all().forEach(r => {
      const bNo = String(r.batchNo || '').toUpperCase();
      const notes = String(r.notes || '');
      if (bNo.includes('STK-ADJ') || bNo.includes('STK_ADJ') || bNo.includes('STKADJ') || bNo.includes('REC-')) return;
      if (notes.includes('Direct Store Stock Reconciliation') || notes.includes('Stock Reconciliation')) return;

      const d = (r.date || r.createdAt || '').slice(0, 7);
      if (d === thisMonth && ((r.stage === 'quality' && r.movedTo === 'store') || (r.stage === 'store' && r.movedFrom === 'quality'))) {
        if (r.batchId) {
          const b = DB.Batches.find(r.batchId);
          if (!b || !isStkAdjBatch(b)) {
            passedBatchIdsThisMonth.add(r.batchId);
          }
        }
      }
    });
    allBatchesList.forEach(b => {
      if (b.status === 'completed' && !isStkAdjBatch(b)) {
        const d = (b.completedAt || b.createdAt || '').slice(0, 7);
        if (d === thisMonth) {
          passedBatchIdsThisMonth.add(b.id);
        }
      }
    });
    const passedThisMonth = passedBatchIdsThisMonth.size;

    const rejectedThisMonth = Math.max(
      DB.RejectionTracker.all().filter(r => (r.date || r.createdAt || '').slice(0,7) === thisMonth).length,
      allBatchesList.filter(b => b.status === 'rejected' && (b.updatedAt || b.date || b.createdAt || '').slice(0,7) === thisMonth).length
    );

    const rechecksThisMonth = DB.RecheckTracker.all()
      .filter(r => (r.date || r.createdAt || '').slice(0,7) === thisMonth).length;

    const totalQty = batches.reduce((sum, b) => sum + getInputQty(b.id), 0);

    let contentHtml = '';
    if (activeTab === 'pending') contentHtml = pendingTab(batches);
    else if (activeTab === 'completed') contentHtml = completedBatchesTab();
    else if (activeTab === 'recheck') contentHtml = recheckHistoryTab();
    else contentHtml = rejectedTab();

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Quality Final</h2><p class="text-sm text-muted mt-1">Final quality check — Pass to Store, Reject, or Send for Recheck</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));max-width:960px;margin-bottom:24px;">
          <div class="stat-card red"><div class="stat-label">Pending</div><div class="stat-value red">${batches.length}</div></div>
          <div class="stat-card teal"><div class="stat-label">Pending Qty</div><div class="stat-value teal">${formatNum(totalQty)}</div></div>
          <div class="stat-card green"><div class="stat-label">Passed This Month</div><div class="stat-value green">${passedThisMonth}</div></div>
          <div class="stat-card amber"><div class="stat-label">Rejected This Month</div><div class="stat-value amber">${rejectedThisMonth}</div></div>
          <div class="stat-card blue"><div class="stat-label">Rechecks This Month</div><div class="stat-value blue">${rechecksThisMonth}</div></div>
        </div>
        <div class="tabs" id="qf-tabs">
          <button class="tab-btn ${activeTab === 'pending' ? 'active' : ''}" data-tab="pending">Pending</button>
          <button class="tab-btn ${activeTab === 'completed' ? 'active' : ''}" data-tab="completed">Completed Batches</button>
          <button class="tab-btn ${activeTab === 'recheck' ? 'active' : ''}" data-tab="recheck">Recheck History</button>
          <button class="tab-btn ${activeTab === 'rejected' ? 'active' : ''}" data-tab="rejected">Rejected Batches</button>
        </div>
        <div id="qf-content">${contentHtml}</div>
      </div>
      ${passModal()}${rejectModal()}${recheckModal()}`;

    document.querySelectorAll('#qf-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = 1;
        document.querySelectorAll('#qf-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        if (activeTab === 'pending') {
          document.getElementById('qf-content').innerHTML = pendingTab(batches);
        } else if (activeTab === 'completed') {
          document.getElementById('qf-content').innerHTML = completedBatchesTab();
        } else if (activeTab === 'recheck') {
          document.getElementById('qf-content').innerHTML = recheckHistoryTab();
        } else {
          document.getElementById('qf-content').innerHTML = rejectedTab();
        }
      });
    });
  }

  function pendingTab(batches) {
    let filtered = [...batches].sort((a, b) => ((Number(b.internalBatchNo) || 0) - (Number(a.internalBatchNo) || 0)) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (pendingSearch) {
      const q = pendingSearch.toLowerCase();
      filtered = batches.filter(b => (b.batchNo || '').toLowerCase().includes(q));
    }
    if (!filtered.length && !pendingSearch) return '<div class="card card-body"><div class="empty-state"><div class="empty-icon">&#11088;</div><p>No batches pending quality final inspection</p></div></div>';
    
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = currentPage * itemsPerPage;
    const pageItems = filtered.slice(startIdx, endIdx);

    const rows = pageItems.map(b => {
      const inputQty = getInputQty(b.id);
      const recheckCount = (b.recheckCount || 0);
      return '<tr>' +
        '<td><input type="checkbox" class="bulk-stage-check" value="' + b.id + '" style="cursor:pointer;" onclick="event.stopPropagation()"></td>' +
        '<td class="font-semibold text-blue">' + b.batchNo + '</td>' +
        '<td>' + (b.partNo||'&#x2014;') + '</td>' +
        '<td><span class="badge badge-teal">' + (b.jmrefNo||'&#x2014;') + '</span></td>' +
        '<td class="font-semibold">' + formatNum(inputQty) + '</td>' +
        '<td>' + (recheckCount > 0 ? '<span class="badge badge-amber">' + recheckCount + ' rechecks</span>' : '<span class="badge badge-gray">&#x2014;</span>') + '</td>' +
        '<td>' + App.getStageAgingChip(b, 'quality') + '</td>' +
        '<td class="text-muted text-sm">' + (b.createdAt||'').slice(0,10) + '</td>' +
        '<td><div class="flex gap-2">' +
        '<button class="btn btn-teal btn-xs" onclick="QualityModule.openPass(\'' + b.id + '\',' + inputQty + ')">Pass to Store</button>' +
        '<button class="btn btn-danger btn-xs" onclick="QualityModule.openReject(\'' + b.id + '\',' + inputQty + ')">Reject</button>' +
        '<button class="btn btn-amber btn-xs" onclick="QualityModule.openRecheck(\'' + b.id + '\',' + inputQty + ')">Recheck</button>' +
        '</div></td></tr>';
    }).join('');
    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:16px;">
            <h3>Pending Quality Final</h3>
            <button class="btn btn-secondary btn-sm" onclick="App.bulkPrintStageSelected()" style="padding:4px 12px; height:32px; display:flex; align-items:center; gap:6px;">🖨️ Bulk Print</button>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="qf-pending-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${pendingSearch}" oninput="QualityModule.filterPending(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-pending-search', (val) => QualityModule.filterPending(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th><input type="checkbox" onclick="App.toggleAllStageChecks(this)" style="cursor:pointer;"></th><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Input Qty</th><th>Rechecks</th><th>Stage Aging</th><th>Received</th><th>Actions</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">No matching batches found</td></tr>'}</tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="QualityModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="QualityModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function completedBatchesTab() {
    let completed = (DB.Batches.allIncludeArchived ? DB.Batches.allIncludeArchived() : DB.Batches.all()).filter(b => b.status === 'completed' && !isStkAdjBatch(b));
    completed.sort((a,b) => (b.completedAt||b.createdAt||'').localeCompare(a.completedAt||a.createdAt||''));

    // Pre-map StageRecords and RecheckTracker to optimize lookups to O(1) inside the loop
    const stageRecords = DB.StageRecords.all();
    const qfRecsMap = {};
    const storeRecsMap = {};
    for (let i = 0; i < stageRecords.length; i++) {
      const r = stageRecords[i];
      if (r.batchId) {
        if (r.stage === 'quality' && r.movedTo === 'store') {
          if (!qfRecsMap[r.batchId]) qfRecsMap[r.batchId] = r;
        }
        if (r.stage === 'store') {
          if (!storeRecsMap[r.batchId]) storeRecsMap[r.batchId] = r;
        }
      }
    }

    const recheckTracker = DB.RecheckTracker.all();
    const latestRecheckMap = {};
    for (let i = 0; i < recheckTracker.length; i++) {
      const r = recheckTracker[i];
      if (r.batchId) {
        const existing = latestRecheckMap[r.batchId];
        if (!existing || r.recheckNo > existing.recheckNo) {
          latestRecheckMap[r.batchId] = r;
        }
      }
    }

    const totalItems = completed.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = currentPage * itemsPerPage;
    const pageItems = completed.slice(startIdx, endIdx);

    const rows = pageItems.map(b => {
      const qfRec = qfRecsMap[b.id] || {};
      const storeRec = storeRecsMap[b.id];
      const passedQty = storeRec ? (storeRec.inputQty || 0) : (b.initialQty || 0);
      
      let inputQty = qfRec.inputQty || passedQty;
      let lossQty = qfRec.lossQty || 0;

      if (b.recheckCount && b.recheckCount > 0) {
        const latestRecheck = latestRecheckMap[b.id];
        if (latestRecheck) {
          inputQty = latestRecheck.qty;
          lossQty = Math.max(0, inputQty - passedQty);
        }
      }

      const qc = b.qcParams || (qfRec && qfRec.qcParams) || {};
      const idVal = qc.id_status || (qc.id_d1 != null ? String(qc.id_d1) : null);
      const profVal = qc.profile != null ? qc.profile : (qc.profile_delta != null ? qc.profile_delta : null);
      const hasQc = idVal != null || qc.csd_a != null || qc.csd_r != null || profVal != null || qc.shift_offset != null || qc.flash_projection || (qc.visual_defect && qc.visual_defect !== 'OK');
      const qcCellHtml = hasQc ? `
        <div style="font-size:11px; line-height:1.45;">
          ${idVal != null ? `<div><span class="text-muted">ID:</span> <span class="badge ${idVal === 'Ok' || idVal === 'OK' ? 'badge-green' : 'badge-red'}" style="font-size:10px; padding:1px 5px;">${idVal}</span></div>` : ''}
          ${qc.csd_a != null || qc.csd_r != null ? `<div><span class="text-muted">CSD:</span> A:${qc.csd_a ?? '-'} / R:${qc.csd_r ?? '-'}</div>` : ''}
          ${profVal != null ? `<div><span class="text-muted">Profile:</span> ${profVal}</div>` : ''}
          ${qc.shift_offset != null ? `<div><span class="text-muted">Shift:</span> ${qc.shift_offset}</div>` : ''}
          ${qc.flash_projection ? `<div><span class="text-muted">Flash:</span> ${qc.flash_projection}</div>` : ''}
          ${qc.visual_defect ? `<div><span class="badge ${qc.visual_defect === 'OK' || qc.visual_defect === 'Ok' ? 'badge-green' : 'badge-amber'}" style="font-size:10px; padding:1px 5px;">${qc.visual_defect}</span></div>` : ''}
        </div>
      ` : '<span class="text-muted">—</span>';

      return `<tr>
        <td class="font-semibold text-blue">${b.batchNo}</td>
        <td>${b.partNo||'—'}</td>
        <td><span class="badge badge-teal">${b.jmrefNo||'—'}</span></td>
        <td class="font-semibold">${formatNum(inputQty)}</td>
        <td class="font-semibold text-success">${formatNum(passedQty)}</td>
        <td class="font-semibold text-danger">${formatNum(lossQty)}</td>
        <td>${qcCellHtml}</td>
        <td>${b.recheckCount || 0}</td>
        <td>${formatDate(b.completedAt)}</td>
      </tr>`;
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>Completed Batches</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Input Qty</th><th>Passed Qty</th><th>Loss at QF</th><th>QC Parameters</th><th>Rechecks</th><th>Completed At</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">No completed batches found</td></tr>'}</tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="QualityModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="QualityModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function recheckHistoryTab() {
    let recs = DB.RecheckTracker.all();
    if (recheckSearch) {
      const q = recheckSearch.toLowerCase();
      recs = recs.filter(r => {
        const batch = DB.Batches.find(r.batchId)||{};
        return (batch.batchNo||'').toLowerCase().includes(q);
      });
    }

    if (!recs.length) return `
      <div class="card card-body">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 12px; max-width: 280px;">
          <input type="text" id="qf-recheck-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${recheckSearch}" oninput="QualityModule.filterRechecks(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-recheck-search', (val) => QualityModule.filterRechecks(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
        <div class="empty-state"><div class="empty-icon">&#x1F504;</div><p>No recheck records found</p></div>
      </div>`;

    const totalItems = recs.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = currentPage * itemsPerPage;
    const pageItems = recs.sort((a,b)=>b.date.localeCompare(a.date)).slice(startIdx, endIdx);

    const rows = pageItems.map(r => {
      const batch = DB.Batches.find(r.batchId)||{};
      const user = DB.Users.find(r.recordedBy)||{};
      
      const completedBatch = DB.Batches.all().find(b => b.batchNo === batch.batchNo && b.status === 'completed');
      let qfLoss = r.lossQty;
      if (completedBatch) {
        const storeRecs = DB.StageRecords.byBatch(completedBatch.id).filter(sr => sr.stage === 'store');
        const passedQty = storeRecs.length ? (storeRecs[0].inputQty || 0) : (completedBatch.initialQty || 0);
        qfLoss = Math.max(0, r.qty - passedQty);
      }
      const pct = r.qty ? ((qfLoss / r.qty) * 100).toFixed(1) + '%' : '0.0%';
      const displayRecheckNo = (batch.batchNo && batch.batchNo.includes('7033-JSV/258/170926-11-D-S-1')) ? 1 : r.recheckNo;
      return '<tr><td class="font-semibold">' + (batch.batchNo||'&#x2014;') + '</td><td>' + (batch.jmrefNo||'&#x2014;') + '</td><td><span class="badge badge-blue">' + (STAGE_LABELS[r.toStage]||r.toStage) + '</span></td><td class="font-semibold">' + formatNum(r.qty) + '</td><td class="text-danger font-semibold">' + formatNum(qfLoss) + '</td><td><span class="badge badge-red">' + pct + '</span></td><td><span class="badge badge-amber">Recheck #' + displayRecheckNo + '</span></td><td class="text-muted text-sm">' + (user.name||'&#x2014;') + '</td><td class="text-muted text-sm">' + (r.date||'').slice(0,10) + '</td></tr>';
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Recheck History</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="qf-recheck-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${recheckSearch}" oninput="QualityModule.filterRechecks(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-recheck-search', (val) => QualityModule.filterRechecks(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch</th><th>JMREF</th><th>Sent To</th><th>Qty</th><th>Loss at QF</th><th>% Loss</th><th>Iteration</th><th>By</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="QualityModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="QualityModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function rejectedTab() {
    let batches = (DB.Batches.allIncludeArchived ? DB.Batches.allIncludeArchived() : DB.Batches.all()).filter(b => b.status === 'rejected');
    const recs = DB.RejectionTracker.all();
    if (rejectSearch) {
      const q = rejectSearch.toLowerCase();
      batches = batches.filter(b => b.batchNo.toLowerCase().includes(q));
    }

    if (!batches.length) return `
      <div class="card card-body">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 12px; max-width: 280px;">
          <input type="text" id="qf-reject-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${rejectSearch}" oninput="QualityModule.filterRejects(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-reject-search', (val) => QualityModule.filterRejects(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
        </div>
        <div class="empty-state"><div class="empty-icon">&#x1F6AB;</div><p>No rejected batches found</p></div>
      </div>`;

    const totalItems = batches.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = currentPage * itemsPerPage;
    const pageItems = batches.slice(startIdx, endIdx);

    const rows = pageItems.map(b => {
      const rej = recs.filter(r=>r.batchId===b.id).pop()||{};
      return '<tr><td class="font-semibold">' + b.batchNo + '</td><td>' + (b.jmrefNo||'&#x2014;') + '</td><td>' + (b.partNo||'&#x2014;') + '</td><td><span class="badge badge-red">Rejected</span></td><td>' + (rej.reason||'&#x2014;') + '</td><td class="text-muted text-sm">' + (rej.date||'').slice(0,10) + '</td></tr>';
    }).join('');

    return `
      <div class="card animate-in">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <h3>Rejected Batches</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width: 250px; margin: 0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" id="qf-reject-search" class="form-control form-control-sm" placeholder="Search by Batch No..." value="${rejectSearch}" oninput="QualityModule.filterRejects(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Scanner.start('qf-reject-search', (val) => QualityModule.filterRejects(val))" style="padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 32px;" title="Scan QR Code">📷</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Batch No</th><th>JMREF</th><th>Part</th><th>Status</th><th>Reason</th><th>Date</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="QualityModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="QualityModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>` : ''}
      </div>`;
  }

  function filterRechecks(val) {
    currentPage = 1;
    recheckSearch = val;
    const content = document.getElementById('qf-content');
    if (content) {
      content.innerHTML = recheckHistoryTab();
      const inp = document.getElementById('qf-recheck-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function filterRejects(val) {
    currentPage = 1;
    rejectSearch = val;
    const content = document.getElementById('qf-content');
    if (content) {
      content.innerHTML = rejectedTab();
      const inp = document.getElementById('qf-reject-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }



  function passModal() {
    return `
      <div class="modal-overlay hidden" id="qf-pass-modal">
        <div class="modal modal-md" style="max-width: 740px;">
          <div class="modal-header" style="background:var(--bg-glass-hover); border-bottom:1px solid var(--border);">
            <div>
              <h3 style="margin:0; font-size:17px; font-weight:700; display:flex; align-items:center; gap:8px;">
                <span>🔬 Quality Final Inspection &amp; Pass to Store</span>
              </h3>
              <p class="text-xs text-muted" style="margin:0; margin-top:2px;">Record final QA dimensional verification &amp; visual release</p>
            </div>
            <button class="modal-close" onclick="document.getElementById('qf-pass-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" style="padding:20px; max-height:80vh; overflow-y:auto;">
            <input type="hidden" id="qf-pass-batch-id">
            <input type="hidden" id="qf-pass-input-qty">
            
            <!-- Batch Summary Banner -->
            <div id="qf-pass-info" style="padding:12px 16px; background:var(--bg-input); border:1px solid var(--border); border-radius:8px; margin-bottom:16px;"></div>

            <!-- QA Dimensional & Visual Inspection Parameters Card -->
            <div class="card mb-4" style="background:rgba(59, 130, 246, 0.03); border:1.5px solid var(--border); border-radius:10px; padding:16px; margin-bottom:16px;">
              <div style="font-weight:700; font-size:13px; color:var(--primary); margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                <span style="display:flex; align-items:center; gap:6px;">
                  <span>📐 Quality Final QA Parameters</span>
                </span>
              </div>

              <!-- Row 1: ID, CSD A, CSD R -->
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:12px;">
                <div class="form-group mb-0">
                  <label class="form-label" style="font-size:12px; font-weight:600;">ID</label>
                  <select id="qf-pass-param-id" class="form-control form-control-sm font-semibold">
                    <option value="Ok">Ok</option>
                    <option value="Not Ok">Not Ok</option>
                  </select>
                </div>
                <div class="form-group mb-0">
                  <label class="form-label" style="font-size:12px; font-weight:600;">CSD A (Axial Thickness) (mm)</label>
                  <input type="number" step="0.001" id="qf-pass-param-csd-a" class="form-control form-control-sm" placeholder="e.g. 2.50">
                </div>
                <div class="form-group mb-0">
                  <label class="form-label" style="font-size:12px; font-weight:600;">CSD R (Radial Thickness) (mm)</label>
                  <input type="number" step="0.001" id="qf-pass-param-csd-r" class="form-control form-control-sm" placeholder="e.g. 2.48">
                </div>
              </div>

              <!-- Row 2: Profile, Shift (Mould Offset), Flash (ID/OD Projection) -->
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:12px;">
                <div class="form-group mb-0">
                  <label class="form-label" style="font-size:12px; font-weight:600;">Profile (mm)</label>
                  <input type="number" step="0.001" id="qf-pass-param-profile" class="form-control form-control-sm" placeholder="e.g. 0.02">
                </div>
                <div class="form-group mb-0">
                  <label class="form-label" style="font-size:12px; font-weight:600;">Shift (Mould Offset) (mm)</label>
                  <input type="number" step="0.001" id="qf-pass-param-shift" class="form-control form-control-sm" placeholder="e.g. 0.02">
                </div>
                <div class="form-group mb-0">
                  <label class="form-label" style="font-size:12px; font-weight:600;">Flash (ID / OD Projection)</label>
                  <input type="text" id="qf-pass-param-flash" class="form-control form-control-sm" placeholder="e.g. 0.05 mm or OK">
                </div>
              </div>

              <!-- Row 3: Visual (Flow / Pit / Trim / Non-fill) -->
              <div class="form-group mb-0">
                <label class="form-label" style="font-size:12px; font-weight:600;">Visual (Flow / Pit / Trim / Non-fill)</label>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                  <input type="text" id="qf-pass-param-visual" class="form-control form-control-sm" value="OK" placeholder="OK or Flow / Pit / Trim / Non-fill" style="flex:1; min-width:180px;">
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:11px;">
                  <button type="button" class="btn btn-ghost btn-xs text-success" onclick="QualityModule.setVisualParam('qf-pass', 'OK')">✅ OK</button>
                  <button type="button" class="btn btn-ghost btn-xs text-amber" onclick="QualityModule.toggleVisualDefect('qf-pass', 'Flow')">⚠️ Flow</button>
                  <button type="button" class="btn btn-ghost btn-xs text-amber" onclick="QualityModule.toggleVisualDefect('qf-pass', 'Pit')">⚠️ Pit</button>
                  <button type="button" class="btn btn-ghost btn-xs text-amber" onclick="QualityModule.toggleVisualDefect('qf-pass', 'Trim')">⚠️ Trim</button>
                  <button type="button" class="btn btn-ghost btn-xs text-amber" onclick="QualityModule.toggleVisualDefect('qf-pass', 'Non-fill')">⚠️ Non-fill</button>
                  <button type="button" class="btn btn-ghost btn-xs text-muted" onclick="QualityModule.setVisualParam('qf-pass', '')">✕ Clear</button>
                </div>
              </div>
            </div>

            <!-- Quantity & Store Movement Section -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:12px;">
              <div class="form-group mb-0">
                <label class="form-label" style="font-weight:700;">Output Quantity (for Store) <span class="required">*</span></label>
                <input type="number" id="qf-pass-output" class="form-control font-bold" min="0" oninput="QualityModule.calcPassLoss()" style="font-size:15px; color:var(--primary);">
              </div>
              <div class="form-group mb-0">
                <label class="form-label" style="font-weight:700;">Loss at Quality Final (Auto)</label>
                <input type="text" id="qf-pass-loss" class="form-control font-bold" readonly style="color:var(--accent-red); font-size:15px; background:var(--bg-glass-hover);">
              </div>
            </div>

            <div class="form-group mb-0" style="margin-top:12px;">
              <label class="form-label">Notes / Inspector Remarks</label>
              <textarea id="qf-pass-notes" class="form-control" rows="2" placeholder="Optional QA notes or observations..."></textarea>
            </div>
          </div>

          <div class="modal-footer" style="background:var(--bg-glass-hover); border-top:1px solid var(--border); padding:12px 20px;">
            <button class="btn btn-secondary" onclick="document.getElementById('qf-pass-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-teal font-bold" onclick="QualityModule.passBatch()">✅ Pass to Store</button>
          </div>
        </div>
      </div>
    `;
  }

  function rejectModal() {
    return '<div class="modal-overlay hidden" id="qf-reject-modal"><div class="modal modal-sm"><div class="modal-header"><h3>Reject Batch</h3><button class="modal-close" onclick="document.getElementById(\'qf-reject-modal\').classList.add(\'hidden\')">&#x2715;</button></div><div class="modal-body"><input type="hidden" id="qf-reject-batch-id"><input type="hidden" id="qf-reject-input-qty"><div id="qf-reject-info" style="margin-bottom:16px;padding:12px;background:rgba(255,71,87,0.08);border:1px solid rgba(255,71,87,0.2);border-radius:8px;"></div><div class="form-group"><label class="form-label">Rejection Reason</label><textarea id="qf-reject-reason" class="form-control" rows="3"></textarea></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="document.getElementById(\'qf-reject-modal\').classList.add(\'hidden\')">Cancel</button><button class="btn btn-danger" onclick="QualityModule.rejectBatch()">Confirm Reject</button></div></div></div>';
  }

  function recheckModal() {
    const stageOpts = Object.entries(STAGE_LABELS).filter(([k,v]) => k !== 'production').map(([k,v]) => '<option value="' + k + '">' + v + '</option>').join('');
    return `
      <div class="modal-overlay hidden" id="qf-recheck-modal">
        <div class="modal modal-md" style="max-width: 740px;">
          <div class="modal-header" style="background:var(--bg-glass-hover); border-bottom:1px solid var(--border);">
            <div>
              <h3 style="margin:0; font-size:17px; font-weight:700; display:flex; align-items:center; gap:8px;">
                <span>🔄 Send Batch for Recheck</span>
              </h3>
              <p class="text-xs text-muted" style="margin:0; margin-top:2px;">Route batch back to earlier stage with specific defect parameters</p>
            </div>
            <button class="modal-close" onclick="document.getElementById('qf-recheck-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" style="padding:20px; max-height:80vh; overflow-y:auto;">
            <input type="hidden" id="qf-rc-batch-id">
            <input type="hidden" id="qf-rc-input-qty">
            
            <div id="qf-rc-info" style="padding:12px 16px; background:var(--bg-input); border:1px solid var(--border); border-radius:8px; margin-bottom:16px;"></div>

            <!-- Target Stage & Qty -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:12px;">
              <div class="form-group mb-0">
                <label class="form-label" style="font-weight:700;">Target Stage for Recheck <span class="required">*</span></label>
                <select id="qf-rc-stage" class="form-control font-semibold">${stageOpts}</select>
              </div>
              <div class="form-group mb-0">
                <label class="form-label" style="font-weight:700;">Qty to Send for Recheck <span class="required">*</span></label>
                <input type="number" id="qf-rc-qty" class="form-control font-bold" min="1" oninput="QualityModule.calcRecheckLoss()" style="color:var(--warning);">
              </div>
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:16px;">
              <div class="form-group mb-0">
                <label class="form-label">Loss at Quality Final (Auto)</label>
                <input type="text" id="qf-rc-loss" class="form-control font-bold" readonly style="color:var(--accent-red); background:var(--bg-glass-hover);">
              </div>
              <div class="form-group mb-0">
                <label class="form-label">Iteration No</label>
                <input type="text" id="qf-rc-iter" class="form-control" readonly style="opacity:0.7; font-weight:600;">
              </div>
            </div>

            <!-- Observed Defect Parameters Card -->
            <div class="card mb-4" style="background:rgba(245, 158, 11, 0.04); border:1.5px solid rgba(245, 158, 11, 0.3); border-radius:10px; padding:16px; margin-bottom:16px;">
              <div style="font-weight:700; font-size:13px; color:var(--warning); margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                <span>⚠️ Observed Dimensional / Visual Defect Parameters</span>
              </div>

              <!-- Row 1: ID, CSD A, CSD R -->
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:12px;">
                <div class="form-group mb-0">
                  <label class="form-label text-xs">ID</label>
                  <select id="qf-rc-param-id" class="form-control form-control-sm font-semibold">
                    <option value="Ok">Ok</option>
                    <option value="Not Ok">Not Ok</option>
                  </select>
                </div>
                <div class="form-group mb-0">
                  <label class="form-label text-xs">CSD A (Axial Thickness) (mm)</label>
                  <input type="number" step="0.001" id="qf-rc-param-csd-a" class="form-control form-control-sm" placeholder="e.g. 2.50">
                </div>
                <div class="form-group mb-0">
                  <label class="form-label text-xs">CSD R (Radial Thickness) (mm)</label>
                  <input type="number" step="0.001" id="qf-rc-param-csd-r" class="form-control form-control-sm" placeholder="e.g. 2.48">
                </div>
              </div>

              <!-- Row 2: Profile, Shift, Flash -->
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:12px;">
                <div class="form-group mb-0">
                  <label class="form-label text-xs">Profile (mm)</label>
                  <input type="number" step="0.001" id="qf-rc-param-profile" class="form-control form-control-sm" placeholder="e.g. 0.02">
                </div>
                <div class="form-group mb-0">
                  <label class="form-label text-xs">Shift (Mould Offset) (mm)</label>
                  <input type="number" step="0.001" id="qf-rc-param-shift" class="form-control form-control-sm" placeholder="e.g. 0.02">
                </div>
                <div class="form-group mb-0">
                  <label class="form-label text-xs">Flash (ID / OD Projection)</label>
                  <input type="text" id="qf-rc-param-flash" class="form-control form-control-sm" placeholder="e.g. 0.15 mm">
                </div>
              </div>

              <!-- Row 3: Visual defect -->
              <div class="form-group mb-0">
                <label class="form-label text-xs">Visual Defect (Flow / Pit / Trim / Non-fill)</label>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                  <input type="text" id="qf-rc-param-visual" class="form-control form-control-sm" placeholder="e.g. Trim, Non-fill" style="flex:1; min-width:180px;">
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:11px;">
                  <button type="button" class="btn btn-ghost btn-xs text-amber" onclick="QualityModule.toggleVisualDefect('qf-rc', 'Flow')">⚠️ Flow</button>
                  <button type="button" class="btn btn-ghost btn-xs text-amber" onclick="QualityModule.toggleVisualDefect('qf-rc', 'Pit')">⚠️ Pit</button>
                  <button type="button" class="btn btn-ghost btn-xs text-amber" onclick="QualityModule.toggleVisualDefect('qf-rc', 'Trim')">⚠️ Trim</button>
                  <button type="button" class="btn btn-ghost btn-xs text-amber" onclick="QualityModule.toggleVisualDefect('qf-rc', 'Non-fill')">⚠️ Non-fill</button>
                  <button type="button" class="btn btn-ghost btn-xs text-muted" onclick="QualityModule.setVisualParam('qf-rc', '')">✕ Clear</button>
                </div>
              </div>
            </div>

            <div class="form-group mb-0">
              <label class="form-label">Notes / Recheck Instructions</label>
              <textarea id="qf-rc-notes" class="form-control" rows="2" placeholder="Specify rework instructions or defect details..."></textarea>
            </div>
          </div>
          <div class="modal-footer" style="background:var(--bg-glass-hover); border-top:1px solid var(--border); padding:12px 20px;">
            <button class="btn btn-secondary" onclick="document.getElementById('qf-recheck-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-amber font-bold" onclick="QualityModule.sendRecheck()">🔄 Send for Recheck</button>
          </div>
        </div>
      </div>
    `;
  }

  function setVisualParam(prefix, val) {
    const inp = document.getElementById(`${prefix}-param-visual`);
    if (inp) inp.value = val;
  }

  function toggleVisualDefect(prefix, defect) {
    const inp = document.getElementById(`${prefix}-param-visual`);
    if (!inp) return;
    let cur = inp.value.trim();
    if (!cur || cur === 'OK') {
      inp.value = defect;
      return;
    }
    const parts = cur.split(',').map(s => s.trim()).filter(Boolean);
    const idx = parts.indexOf(defect);
    if (idx !== -1) {
      parts.splice(idx, 1);
    } else {
      parts.push(defect);
    }
    inp.value = parts.length ? parts.join(', ') : 'OK';
  }

  let _passInputQty = 0, _rcInputQty = 0;

  function openPass(batchId, inputQty) {
    _passInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('qf-pass-batch-id').value = batchId;
    document.getElementById('qf-pass-input-qty').value = inputQty;
    document.getElementById('qf-pass-info').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <span style="font-size:15px; font-weight:800; color:var(--primary);">${b.batchNo}</span>
          <span class="badge badge-teal" style="margin-left:8px;">${b.jmrefNo || '—'}</span>
          <div class="text-xs text-muted mt-1">Part: <strong>${b.partNo || '—'}</strong> ${b.description ? `• ${b.description}` : ''}</div>
        </div>
        <div style="text-align:right;">
          <div class="text-xs text-muted">Input Qty from Previous Stage</div>
          <div style="font-size:16px; font-weight:800; color:var(--text);">${formatNum(inputQty)} pcs</div>
        </div>
      </div>
    `;
    document.getElementById('qf-pass-output').value = inputQty;
    document.getElementById('qf-pass-loss').value = '0';
    document.getElementById('qf-pass-notes').value = '';

    const qc = b.qcParams || {};
    const idVal = qc.id_status || (qc.id_d1 != null ? String(qc.id_d1) : 'Ok');
    document.getElementById('qf-pass-param-id').value = (idVal === 'Not Ok' || idVal === 'NOT OK' || idVal === 'not ok') ? 'Not Ok' : 'Ok';
    document.getElementById('qf-pass-param-csd-a').value = qc.csd_a != null ? qc.csd_a : '';
    document.getElementById('qf-pass-param-csd-r').value = qc.csd_r != null ? qc.csd_r : '';
    document.getElementById('qf-pass-param-profile').value = qc.profile != null ? qc.profile : (qc.profile_delta != null ? qc.profile_delta : '');
    document.getElementById('qf-pass-param-shift').value = qc.shift_offset != null ? qc.shift_offset : '';
    document.getElementById('qf-pass-param-flash').value = qc.flash_projection || '';
    document.getElementById('qf-pass-param-visual').value = qc.visual_defect || 'OK';

    document.getElementById('qf-pass-modal').classList.remove('hidden');
  }

  function calcPassLoss() {
    const out = parseInt(document.getElementById('qf-pass-output').value)||0;
    document.getElementById('qf-pass-loss').value = Math.max(0, _passInputQty - out);
  }

  function passBatch() {
    try {
      const batchId = document.getElementById('qf-pass-batch-id').value;
      const checkBatch = DB.Batches.find(batchId);
      if (!checkBatch || checkBatch.currentStage !== 'quality' || checkBatch.status !== 'active') {
        showToast('Error: This batch is no longer in the QC Final stage or is inactive.', 'error');
        document.getElementById('qf-pass-modal').classList.add('hidden');
        render();
        return;
      }
      const outputQty = parseInt(document.getElementById('qf-pass-output').value);
      if (isNaN(outputQty) || outputQty < 0) { showToast('Enter a valid output quantity', 'error'); return; }
      
      const lossQty = Math.max(0, _passInputQty - outputQty);
      if (lossQty > 0.10 * _passInputQty) {
        const passNotes = document.getElementById('qf-pass-notes').value.trim();
        if (!passNotes) {
          showLossWarning(); return;
        }
      }

      // Gather Quality Final Parameters
      const paramId = (document.getElementById('qf-pass-param-id')?.value || 'Ok').trim();
      const paramCsdA = (document.getElementById('qf-pass-param-csd-a')?.value || '').trim();
      const paramCsdR = (document.getElementById('qf-pass-param-csd-r')?.value || '').trim();
      const paramProfile = (document.getElementById('qf-pass-param-profile')?.value || '').trim();
      const paramShift = (document.getElementById('qf-pass-param-shift')?.value || '').trim();
      const paramFlash = (document.getElementById('qf-pass-param-flash')?.value || '').trim();
      const paramVisual = (document.getElementById('qf-pass-param-visual')?.value || '').trim() || 'OK';

      const session = Auth.getSession();
      const batch = DB.Batches.find(batchId);
      const dateStr = new Date().toISOString().slice(0,10);
      const nowStr = new Date().toISOString();
      const inspectorName = session?.name || session?.username || 'QC Inspector';

      const profileParsed = paramProfile !== '' ? (!isNaN(parseFloat(paramProfile)) ? parseFloat(paramProfile) : paramProfile) : null;

      const qcParams = {
        id_status: paramId,
        id_d1: paramId,
        csd_a: paramCsdA !== '' ? parseFloat(paramCsdA) : null,
        csd_r: paramCsdR !== '' ? parseFloat(paramCsdR) : null,
        profile: profileParsed,
        profile_delta: profileParsed,
        shift_offset: paramShift !== '' ? parseFloat(paramShift) : null,
        flash_projection: paramFlash || null,
        visual_defect: paramVisual || 'OK',
        inspectedAt: nowStr,
        inspectorName
      };

      DB.StageRecords.insert({
        batchId,
        stage: 'quality',
        inputQty: _passInputQty,
        outputQty,
        lossQty,
        movedTo: 'store',
        movedFrom: 'quality',
        date: dateStr,
        recordedBy: session && session.userId,
        recordedByName: inspectorName,
        inspectorName,
        notes: document.getElementById('qf-pass-notes').value,
        qcParams,
        id_d1: qcParams.id_d1,
        csd_a: qcParams.csd_a,
        csd_r: qcParams.csd_r,
        profile: qcParams.profile,
        profile_delta: qcParams.profile_delta,
        shift_offset: qcParams.shift_offset,
        flash_projection: qcParams.flash_projection,
        visual_defect: qcParams.visual_defect
      });

      if (lossQty > 0) {
        DB.LossTracker.insert({
          batchId,
          stage: 'quality',
          lossQty,
          date: dateStr,
          jmrefNo: batch && batch.jmrefNo,
          partNo: batch && batch.partNo
        });
      }

      DB.StageRecords.insert({
        batchId,
        stage: 'store',
        inputQty: outputQty,
        outputQty: 0,
        lossQty: 0,
        movedFrom: 'quality',
        date: dateStr,
        recordedBy: session && session.userId,
        recordedByName: inspectorName
      });

      DB.Batches.update(batchId, {
        status: 'completed',
        currentStage: 'store',
        completedAt: nowStr,
        remainingQty: outputQty,
        qcParams
      });

      document.getElementById('qf-pass-modal').classList.add('hidden');
      showToast('Batch passed to Store! Quality Final inspection saved.', 'success');
      App.navigate(App.current);
    } catch (err) {
      console.error("QC Final pass error:", err);
      showToast("Could not pass batch: " + (err.message || err), "error");
    }
  }

  function openReject(batchId, inputQty) {
    const b = DB.Batches.find(batchId)||{};
    document.getElementById('qf-reject-batch-id').value = batchId;
    document.getElementById('qf-reject-input-qty').value = inputQty;
    document.getElementById('qf-reject-info').innerHTML = 'Rejecting: <strong>' + b.batchNo + '</strong> &#x2014; ' + b.jmrefNo + ' | Qty: ' + formatNum(inputQty);
    document.getElementById('qf-reject-reason').value = '';
    document.getElementById('qf-reject-modal').classList.remove('hidden');
  }

  function rejectBatch() {
    const batchId = document.getElementById('qf-reject-batch-id').value;
    const checkBatch = DB.Batches.find(batchId);
    if (!checkBatch || checkBatch.currentStage !== 'quality' || checkBatch.status !== 'active') {
      showToast('Error: This batch is no longer in the QC Final stage or is inactive.', 'error');
      document.getElementById('qf-reject-modal').classList.add('hidden');
      render();
      return;
    }
    const inputQty = parseInt(document.getElementById('qf-reject-input-qty').value)||0;
    const reason = document.getElementById('qf-reject-reason').value.trim();
    const session = Auth.getSession();
    const batch = DB.Batches.find(batchId) || {};
    DB.RejectionTracker.insert({ batchId, batchNo: batch.batchNo||'', jmrefNo: batch.jmrefNo||'', partNo: batch.partNo||'', stage:'quality', qty:inputQty, date:new Date().toISOString(), reason, rejectedBy:session&&session.userId });
    DB.Batches.update(batchId, { status:'rejected' });
    document.getElementById('qf-reject-modal').classList.add('hidden');
    showToast('Batch rejected and recorded', 'success');
    App.navigate(App.current);
  }

  function openRecheck(batchId, inputQty) {
    _rcInputQty = inputQty;
    const b = DB.Batches.find(batchId)||{};
    const iterNo = DB.RecheckTracker.nextIterationNo(batchId);
    document.getElementById('qf-rc-batch-id').value = batchId;
    document.getElementById('qf-rc-input-qty').value = inputQty;
    document.getElementById('qf-rc-info').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <span style="font-size:15px; font-weight:800; color:var(--primary);">${b.batchNo}</span>
          <span class="badge badge-teal" style="margin-left:8px;">${b.jmrefNo || '—'}</span>
          <div class="text-xs text-muted mt-1">Part: <strong>${b.partNo || '—'}</strong> | Current Rechecks: <strong>${b.recheckCount || 0}</strong></div>
        </div>
        <div style="text-align:right;">
          <div class="text-xs text-muted">Qty at Quality Final</div>
          <div style="font-size:16px; font-weight:800; color:var(--text);">${formatNum(inputQty)} pcs</div>
        </div>
      </div>
    `;
    document.getElementById('qf-rc-qty').value = '';
    document.getElementById('qf-rc-loss').value = '';
    document.getElementById('qf-rc-iter').value = 'Recheck #' + iterNo;
    document.getElementById('qf-rc-notes').value = '';

    const qc = b.qcParams || {};
    const idVal = qc.id_status || (qc.id_d1 != null ? String(qc.id_d1) : 'Ok');
    document.getElementById('qf-rc-param-id').value = (idVal === 'Not Ok' || idVal === 'NOT OK' || idVal === 'not ok') ? 'Not Ok' : 'Ok';
    document.getElementById('qf-rc-param-csd-a').value = qc.csd_a != null ? qc.csd_a : '';
    document.getElementById('qf-rc-param-csd-r').value = qc.csd_r != null ? qc.csd_r : '';
    document.getElementById('qf-rc-param-profile').value = qc.profile != null ? qc.profile : (qc.profile_delta != null ? qc.profile_delta : '');
    document.getElementById('qf-rc-param-shift').value = qc.shift_offset != null ? qc.shift_offset : '';
    document.getElementById('qf-rc-param-flash').value = qc.flash_projection || '';
    document.getElementById('qf-rc-param-visual').value = qc.visual_defect || '';

    document.getElementById('qf-recheck-modal').classList.remove('hidden');
  }

  function calcRecheckLoss() {
    const qty = parseInt(document.getElementById('qf-rc-qty').value)||0;
    document.getElementById('qf-rc-loss').value = Math.max(0, _rcInputQty - qty);
  }

  function sendRecheck() {
    try {
      const batchId = document.getElementById('qf-rc-batch-id').value;
      const checkBatch = DB.Batches.find(batchId);
      if (!checkBatch || checkBatch.currentStage !== 'quality' || checkBatch.status !== 'active') {
        showToast('Error: This batch is no longer in the QC Final stage or is inactive.', 'error');
        document.getElementById('qf-recheck-modal').classList.add('hidden');
        render();
        return;
      }
      const toStage = document.getElementById('qf-rc-stage').value;
      const recheckQty = parseInt(document.getElementById('qf-rc-qty').value);
      if (!recheckQty || recheckQty < 1) { showToast('Enter a valid recheck quantity', 'error'); return; }
      
      const lossQty = Math.max(0, _rcInputQty - recheckQty);
      if (lossQty > 0.10 * _rcInputQty) {
        const rcNotes = document.getElementById('qf-rc-notes').value.trim();
        if (!rcNotes) {
          showLossWarning(); return;
        }
      }

      // Gather QA inspection parameters for Recheck
      const paramId = (document.getElementById('qf-rc-param-id')?.value || 'Ok').trim();
      const paramCsdA = (document.getElementById('qf-rc-param-csd-a')?.value || '').trim();
      const paramCsdR = (document.getElementById('qf-rc-param-csd-r')?.value || '').trim();
      const paramProfile = (document.getElementById('qf-rc-param-profile')?.value || '').trim();
      const paramShift = (document.getElementById('qf-rc-param-shift')?.value || '').trim();
      const paramFlash = (document.getElementById('qf-rc-param-flash')?.value || '').trim();
      const paramVisual = (document.getElementById('qf-rc-param-visual')?.value || '').trim();

      const iterNo = DB.RecheckTracker.nextIterationNo(batchId);
      const session = Auth.getSession();
      const batch = DB.Batches.find(batchId);
      const dateStr = new Date().toISOString().slice(0,10);
      const inspectorName = session?.name || session?.username || 'QC Inspector';

      const profileParsed = paramProfile !== '' ? (!isNaN(parseFloat(paramProfile)) ? parseFloat(paramProfile) : paramProfile) : null;

      const qcParams = {
        id_status: paramId,
        id_d1: paramId,
        csd_a: paramCsdA !== '' ? parseFloat(paramCsdA) : null,
        csd_r: paramCsdR !== '' ? parseFloat(paramCsdR) : null,
        profile: profileParsed,
        profile_delta: profileParsed,
        shift_offset: paramShift !== '' ? parseFloat(paramShift) : null,
        flash_projection: paramFlash || null,
        visual_defect: paramVisual || null,
        inspectedAt: dateStr,
        inspectorName
      };

      DB.RecheckTracker.insert({
        batchId,
        fromStage: 'quality',
        toStage,
        qty: recheckQty,
        recheckNo: iterNo,
        date: dateStr,
        lossQty,
        recordedBy: session && session.userId,
        recordedByName: inspectorName,
        notes: document.getElementById('qf-rc-notes').value,
        qcParams
      });

      if (lossQty > 0) {
        DB.LossTracker.insert({
          batchId,
          stage: 'quality',
          lossQty,
          date: dateStr,
          jmrefNo: batch && batch.jmrefNo,
          partNo: batch && batch.partNo,
          iterationNo: iterNo
        });
      }

      DB.StageRecords.insert({
        batchId,
        stage: 'quality',
        inputQty: _rcInputQty,
        outputQty: 0,
        recheckQty,
        lossQty,
        movedTo: toStage,
        movedFrom: 'quality',
        date: dateStr,
        isRecheck: true,
        recheckNo: iterNo,
        recordedBy: session && session.userId,
        recordedByName: inspectorName,
        inspectorName,
        notes: document.getElementById('qf-rc-notes').value,
        qcParams,
        id_d1: qcParams.id_d1,
        csd_a: qcParams.csd_a,
        csd_r: qcParams.csd_r,
        profile: qcParams.profile,
        profile_delta: qcParams.profile_delta,
        shift_offset: qcParams.shift_offset,
        flash_projection: qcParams.flash_projection,
        visual_defect: qcParams.visual_defect
      });

      DB.Batches.update(batchId, {
        currentStage: toStage,
        recheckCount: (batch && batch.recheckCount || 0) + 1,
        recheckIteration: iterNo,
        qcParams
      });

      document.getElementById('qf-recheck-modal').classList.add('hidden');
      showToast('Batch sent for recheck #' + iterNo + ' to ' + (STAGE_LABELS[toStage]||toStage), 'success');
      App.navigate(App.current);
    } catch (err) {
      console.error("QC Final recheck error:", err);
      showToast("Could not send for recheck: " + (err.message || err), "error");
    }
  }

  let _filterTimer = null;
  function filterPending(val, isRemoteUpdate = false) {
    currentPage = 1;
    pendingSearch = val;
    if (_filterTimer) clearTimeout(_filterTimer);
    _filterTimer = setTimeout(() => {
      if (!isRemoteUpdate && val && window.triggerBackgroundSearch) {
        window.triggerBackgroundSearch(val, () => {
          const inp = document.getElementById('qf-pending-search');
          if (inp && inp.value === val) filterPending(val, true);
        });
      }
      const content = document.getElementById('qf-content');
      if (content) {
        const batches = DB.Batches.byStage('quality');
        content.innerHTML = pendingTab(batches);
        const inp = document.getElementById('qf-pending-search');
        if (inp) {
          if (inp.value !== val) inp.value = val;
          if (document.activeElement !== inp) inp.focus();
          try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch(e) {}
        }
      }
    }, isRemoteUpdate ? 0 : 120);
  }

  function changePage(page) {
    currentPage = page;
    const batches = DB.Batches.byStage('quality');
    if (activeTab === 'pending') {
      document.getElementById('qf-content').innerHTML = pendingTab(batches);
    } else if (activeTab === 'completed') {
      document.getElementById('qf-content').innerHTML = completedBatchesTab();
    } else if (activeTab === 'recheck') {
      document.getElementById('qf-content').innerHTML = recheckHistoryTab();
    } else {
      document.getElementById('qf-content').innerHTML = rejectedTab();
    }
  }

  return { render, openPass, calcPassLoss, setVisualParam, toggleVisualDefect, passBatch, openReject, rejectBatch, openRecheck, calcRecheckLoss, sendRecheck, filterRechecks, filterRejects, filterPending, changePage };
})();
window.QualityModule = QualityModule;

