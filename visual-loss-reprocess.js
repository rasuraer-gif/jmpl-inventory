// ============================================================
// visual-loss-reprocess.js — Visual Loss to Reprocess Module
// ============================================================
// Allows supervisors to convert recorded Visual Inspection loss
// quantities into active reprocess batches (LREP) for batches
// that have moved out from the visual inspection stage.
// Strictly blocks any batches before or currently in visual inspection.
// ============================================================

const VisualLossReprocessModule = (() => {
  const PRE_OR_AT_VISUAL_STAGES = [
    'production',
    'cryogenic',
    'deflashing',
    'waiting-trimming',
    'trimming',
    'post-curing',
    'waiting-visual',
    'visual'
  ];

  const STAGE_LABELS = {
    production: 'Production / Moulding',
    cryogenic: 'Cryogenic',
    deflashing: 'Flash Removal (DE Flashing)',
    'waiting-trimming': 'Waiting for Trimming',
    trimming: 'Trimming',
    'post-curing': 'Post Curing',
    'waiting-visual': 'Waiting for Visual',
    visual: 'Visual Inspection',
    gauge: 'Gauge Inspection',
    quality: 'Quality Final (QC)',
    store: 'Store'
  };

  const REPROCESS_DESTINATIONS = [
    { key: 'trimming', label: 'Trimming', vendorEligible: true },
    { key: 'waiting-trimming', label: 'Waiting for Trimming', vendorEligible: true },
    { key: 'deflashing', label: 'Flash Removal (DE Flashing)', vendorEligible: true },
    { key: 'cryogenic', label: 'Cryogenic', vendorEligible: false },
    { key: 'post-curing', label: 'Post Curing', vendorEligible: false }
  ];

  let activeTab = 'create'; // 'create' | 'eligible' | 'history'
  let selectedBatchId = null;
  let validationError = null;
  let eligibleSearchQuery = '';
  let historySearchQuery = '';
  let currentPage = 1;
  let itemsPerPage = 25;
  let historyCurrentPage = 1;
  let historyItemsPerPage = 25;

  // In-memory caches to guarantee 0 Firestore database reads on pagination/filtering
  let _cachedEligibleList = null;
  let _cachedHistoryList = null;

  function invalidateCache() {
    _cachedEligibleList = null;
    _cachedHistoryList = null;
  }

  // Helper to escape HTML safely
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Format numbers with comma
  function formatNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-IN');
  }

  // Generate unique LREP batch number replacing REP with LREP
  function generateLossReprocessBatchNo(parentBatchNo) {
    if (!parentBatchNo) return 'LREP-BATCH-1';
    const cleanParent = String(parentBatchNo).trim();
    let base;
    if (cleanParent.includes('-REP')) {
      base = cleanParent.replace(/-REP/g, '-LREP');
    } else if (cleanParent.includes('REP')) {
      base = cleanParent.replace(/REP/g, 'LREP');
    } else {
      base = cleanParent + '-LREP';
    }

    let candidate = base;
    let counter = 1;
    const allBatches = DB.Batches.allIncludeArchived ? DB.Batches.allIncludeArchived() : DB.Batches.all();
    while (allBatches.some(b => b && b.batchNo && b.batchNo.trim().toUpperCase() === candidate.trim().toUpperCase())) {
      counter++;
      candidate = `${base}-${counter}`;
    }
    return candidate;
  }

  // Calculate visual loss and remaining available loss for a batch
  // Supports an optional precomputed LREP map for O(1) performance during list building
  function getBatchVisualLossInfo(batch, precomputedLRepMap = null) {
    if (!batch) return null;

    // 1. Gather visual records from StageRecords
    const recs = DB.StageRecords.byBatch ? DB.StageRecords.byBatch(batch.id) : [];
    const visualRecs = recs.filter(r => (r.stage === 'visual' || r.movedFrom === 'visual'));
    const stageLoss = visualRecs.reduce((sum, r) => sum + (Number(r.lossQty) || 0), 0);

    // 2. Gather visual records from LossTracker
    const ltRecs = DB.LossTracker.byBatch ? DB.LossTracker.byBatch(batch.id).filter(l => l.stage === 'visual') : [];
    const trackerLoss = ltRecs.reduce((sum, l) => sum + (Number(l.lossQty) || 0), 0);

    // Total visual loss recorded across records
    const totalVisualLoss = Math.max(stageLoss, trackerLoss);

    // Check if the batch has visual history or has reached post-visual WIP stages
    const hasVisualMovement = visualRecs.length > 0 || ltRecs.length > 0 || ['gauge', 'quality'].includes(batch.currentStage);

    // Strict guard: batch cannot be in pre-visual, visual, or store stages
    const isCurrentlyPreOrAtVisual = PRE_OR_AT_VISUAL_STAGES.includes(batch.currentStage);
    const isCurrentlyStoreOrCompleted = batch.currentStage === 'store' || batch.currentStage === 'completed' || batch.status === 'completed';
    const hasMovedOutOfVisual = hasVisualMovement && !isCurrentlyPreOrAtVisual && !isCurrentlyStoreOrCompleted;

    // 3. Look for existing LREP child batches created from this parent
    let existingLRepBatches = [];
    if (precomputedLRepMap) {
      existingLRepBatches = precomputedLRepMap.get(batch.id) || (batch.batchNo ? precomputedLRepMap.get(batch.batchNo) : null) || [];
    } else {
      const allBatches = DB.Batches.allIncludeArchived ? DB.Batches.allIncludeArchived() : DB.Batches.all();
      existingLRepBatches = allBatches.filter(b => {
        if (!b) return false;
        if (b.parentBatchId === batch.id || (batch.batchNo && b.parentBatchNo === batch.batchNo)) {
          return b.isLossReprocess === true || (b.batchNo && b.batchNo.includes('LREP'));
        }
        return false;
      });
    }

    const alreadyReprocessedQty = existingLRepBatches.reduce((sum, b) => sum + (Number(b.initialQty) || 0), 0);
    const availableLossQty = Math.max(0, totalVisualLoss - alreadyReprocessedQty);

    const latestVisualRec = visualRecs.length ? visualRecs[visualRecs.length - 1] : null;
    const latestLtRec = ltRecs.length ? ltRecs[ltRecs.length - 1] : null;

    return {
      batch,
      hasVisualMovement,
      hasMovedOutOfVisual,
      isCurrentlyPreOrAtVisual,
      totalVisualLoss,
      alreadyReprocessedQty,
      availableLossQty,
      existingLRepBatches,
      visualDate: latestVisualRec ? (latestVisualRec.date || (latestVisualRec.createdAt || '').slice(0, 10)) : (latestLtRec?.date || (batch.updatedAt || batch.createdAt || '').slice(0, 10) || '—'),
      visualInspector: latestVisualRec ? (latestVisualRec.inspectorName || '—') : '—',
      visualMovedTo: latestVisualRec ? (latestVisualRec.movedTo || '—') : (batch.currentStage || '—')
    };
  }

  // Validate batch eligibility strictly
  function validateBatchEligibility(batch) {
    if (!batch) {
      return { ok: false, reason: 'Batch not found. Please check the Batch Number or scan the barcode.' };
    }

    const bNo = batch.batchNo || 'Unknown';

    // Strict rule: No batches before or at visual inspection can be selected
    if (PRE_OR_AT_VISUAL_STAGES.includes(batch.currentStage)) {
      const stageName = STAGE_LABELS[batch.currentStage] || batch.currentStage;
      if (batch.currentStage === 'visual') {
        return {
          ok: false,
          reason: `Selection Blocked: Batch "${bNo}" is currently inside the "Visual Inspection" stage. It has not moved out from visual inspection yet. Standard in-process recheck or reprocess must be done from the Visual Inspection module.`
        };
      }
      return {
        ok: false,
        reason: `Selection Blocked: Batch "${bNo}" is currently in "${stageName}". No batches before or currently in Visual Inspection can be selected. Only batches that have passed through and moved out of Visual Inspection are eligible.`
      };
    }

    // Exclude batches that are currently in Store or already Completed
    if (batch.currentStage === 'store' || batch.currentStage === 'completed' || batch.status === 'completed') {
      return {
        ok: false,
        reason: `Selection Blocked: Batch "${bNo}" has already moved to Store stage (Completed). Store batches are not eligible for Visual Loss Reprocess.`
      };
    }

    const info = getBatchVisualLossInfo(batch);
    if (!info.hasVisualMovement) {
      return {
        ok: false,
        reason: `Selection Blocked: Batch "${bNo}" has no recorded Visual Inspection history in its movement records or loss tracker.`
      };
    }

    if (info.totalVisualLoss <= 0) {
      return {
        ok: false,
        reason: `Selection Blocked: Batch "${bNo}" has 0 recorded Loss Quantity at Visual Inspection stage. No loss quantity is available to convert into a reprocess batch.`
      };
    }

    if (info.availableLossQty <= 0) {
      return {
        ok: false,
        reason: `All visual loss quantity (${formatNum(info.totalVisualLoss)} pcs) for Batch "${bNo}" has already been converted into LREP reprocess batch(es) (Available: 0 pcs).`
      };
    }

    return { ok: true, info };
  }

  // Get all eligible batches with available visual loss (blazing fast O(N) vectorized scan with caching)
  function getAllEligibleBatches(forceRefresh = false) {
    if (!forceRefresh && _cachedEligibleList) {
      return _cachedEligibleList;
    }

    const allBatches = DB.Batches.allIncludeArchived ? DB.Batches.allIncludeArchived() : DB.Batches.all();

    // 1. Pre-index existing LREP child batches by parentBatchId and parentBatchNo in ONE single pass O(N)
    const lrepBatchesByParent = new Map();
    for (let i = 0; i < allBatches.length; i++) {
      const b = allBatches[i];
      if (!b || !b.batchNo) continue;
      if (b.isLossReprocess === true || b.batchNo.includes('LREP')) {
        if (b.parentBatchId) {
          let list = lrepBatchesByParent.get(b.parentBatchId);
          if (!list) { list = []; lrepBatchesByParent.set(b.parentBatchId, list); }
          list.push(b);
        }
        if (b.parentBatchNo) {
          let list = lrepBatchesByParent.get(b.parentBatchNo);
          if (!list) { list = []; lrepBatchesByParent.set(b.parentBatchNo, list); }
          list.push(b);
        }
      }
    }

    // 2. Pre-index visual losses by batchId in ONE single pass from DB.LossTracker and DB.StageRecords
    const visualLossByBatchId = new Map();
    const visualDateByBatchId = new Map();

    const ltList = DB.LossTracker ? (DB.LossTracker.all ? DB.LossTracker.all() : []) : [];
    for (let i = 0; i < ltList.length; i++) {
      const lt = ltList[i];
      if (!lt || lt.stage !== 'visual') continue;
      const q = Number(lt.lossQty) || 0;
      if (q <= 0) continue;
      const bId = lt.batchId;
      if (bId) {
        visualLossByBatchId.set(bId, (visualLossByBatchId.get(bId) || 0) + q);
        if (lt.date && !visualDateByBatchId.has(bId)) {
          visualDateByBatchId.set(bId, lt.date);
        }
      }
    }

    const srList = DB.StageRecords ? (DB.StageRecords.all ? DB.StageRecords.all() : []) : [];
    for (let i = 0; i < srList.length; i++) {
      const sr = srList[i];
      if (!sr || (sr.stage !== 'visual' && sr.movedFrom !== 'visual')) continue;
      const q = Number(sr.lossQty) || 0;
      const bId = sr.batchId;
      if (bId) {
        const curr = visualLossByBatchId.get(bId) || 0;
        if (q > curr) {
          visualLossByBatchId.set(bId, q);
        }
        if (sr.date && !visualDateByBatchId.has(bId)) {
          visualDateByBatchId.set(bId, sr.date || (sr.createdAt || '').slice(0, 10));
        }
      }
    }

    // 3. Scan batches with O(1) lookups
    const list = [];
    for (let i = 0; i < allBatches.length; i++) {
      const b = allBatches[i];
      if (!b || !b.batchNo) continue;

      // Filter out invalid batches
      const bNoUpper = b.batchNo.toUpperCase();
      if (bNoUpper.includes('STK-ADJ') || bNoUpper.includes('STK_ADJ') || bNoUpper.includes('REC-') || bNoUpper.includes('LREP')) continue;

      // Strict rule: No batches before or currently in visual inspection can be selected
      if (PRE_OR_AT_VISUAL_STAGES.includes(b.currentStage)) continue;

      // Exclude batches that are currently in Store or already Completed
      if (b.currentStage === 'store' || b.currentStage === 'completed' || b.status === 'completed') continue;

      // Check if batch has recorded visual loss
      const recordedLoss = visualLossByBatchId.get(b.id) || 0;
      if (recordedLoss <= 0) continue;

      // Fast O(1) LREP children lookup from precomputed map
      const existingLRepBatches = lrepBatchesByParent.get(b.id) || (b.batchNo ? lrepBatchesByParent.get(b.batchNo) : null) || [];
      const alreadyReprocessedQty = existingLRepBatches.reduce((sum, child) => sum + (Number(child.initialQty) || 0), 0);
      const availableLossQty = Math.max(0, recordedLoss - alreadyReprocessedQty);

      if (availableLossQty > 0) {
        list.push({
          batch: b,
          hasVisualMovement: true,
          hasMovedOutOfVisual: true,
          isCurrentlyPreOrAtVisual: false,
          totalVisualLoss: recordedLoss,
          alreadyReprocessedQty,
          availableLossQty,
          existingLRepBatches,
          visualDate: visualDateByBatchId.get(b.id) || (b.updatedAt || b.createdAt || '').slice(0, 10) || '—',
          visualInspector: '—',
          visualMovedTo: b.currentStage || '—'
        });
      }
    }

    list.sort((a, b) => (b.batch.createdAt || '').localeCompare(a.batch.createdAt || ''));
    _cachedEligibleList = list;
    return list;
  }

  // Get all historical LREP batches (with caching)
  function getAllLRepHistory(forceRefresh = false) {
    if (!forceRefresh && _cachedHistoryList) {
      return _cachedHistoryList;
    }
    const allBatches = DB.Batches.allIncludeArchived ? DB.Batches.allIncludeArchived() : DB.Batches.all();
    const lrepBatches = allBatches.filter(b => {
      if (!b || !b.batchNo) return false;
      return b.isLossReprocess === true || b.batchNo.includes('LREP');
    });

    lrepBatches.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    _cachedHistoryList = lrepBatches;
    return lrepBatches;
  }

  // Main render
  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const eligibleList = getAllEligibleBatches();
    const historyList = getAllLRepHistory();

    const totalAvailableQty = eligibleList.reduce((sum, item) => sum + item.availableLossQty, 0);
    const totalRecoveredQty = historyList.reduce((sum, b) => sum + (Number(b.initialQty) || 0), 0);

    el.innerHTML = `
      <div class="animate-in" style="max-width: 1200px; margin: 0 auto; padding-bottom: 40px;">
        <!-- Header Banner -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom: 20px;">
          <div>
            <h2 class="font-bold" style="font-size:22px; margin:0; display:flex; align-items:center; gap:8px;">
              <span>♻️ Visual Loss to Reprocess</span>
              <span class="badge badge-purple" style="font-size:11px; padding:3px 8px;">LREP Module</span>
            </h2>
            <p class="text-sm text-muted mt-1" style="margin:4px 0 0 0;">
              Recover recorded Visual Inspection loss quantities into active reprocess batches (tagged as <strong>LREP</strong>) after batches have moved past visual inspection.
            </p>
          </div>
        </div>

        <!-- Quick Summary Stats Grid -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:20px;">
          <div class="stat-card amber" style="cursor:pointer;" onclick="VisualLossReprocessModule.switchTab('eligible')">
            <div class="stat-label">Eligible Batches</div>
            <div class="stat-value amber">${eligibleList.length}</div>
            <div class="text-xs text-muted mt-1">Batches with recoverable visual loss</div>
          </div>
          <div class="stat-card green" style="cursor:pointer;" onclick="VisualLossReprocessModule.switchTab('eligible')">
            <div class="stat-label">Available Loss Qty</div>
            <div class="stat-value green">${formatNum(totalAvailableQty)} <span style="font-size:13px;font-weight:normal;">pcs</span></div>
            <div class="text-xs text-muted mt-1">Ready to convert to reprocess</div>
          </div>
          <div class="stat-card purple" style="cursor:pointer;" onclick="VisualLossReprocessModule.switchTab('history')">
            <div class="stat-label">Total LREP Batches</div>
            <div class="stat-value purple">${historyList.length}</div>
            <div class="text-xs text-muted mt-1">Generated using loss quantity</div>
          </div>
          <div class="stat-card blue" style="cursor:pointer;" onclick="VisualLossReprocessModule.switchTab('history')">
            <div class="stat-label">Total Qty Recovered</div>
            <div class="stat-value blue">${formatNum(totalRecoveredQty)} <span style="font-size:13px;font-weight:normal;">pcs</span></div>
            <div class="text-xs text-muted mt-1">Converted into active WIP</div>
          </div>
        </div>

        <!-- Module Tabs Navigation -->
        <div class="tabs" style="display:flex; gap:8px; border-bottom:2px solid var(--border); margin-bottom:20px;">
          <button class="tab-btn ${activeTab === 'create' ? 'active' : ''}" onclick="VisualLossReprocessModule.switchTab('create')" style="font-weight:700; padding:10px 18px; border:none; background:none; cursor:pointer; font-size:13.5px; border-bottom: ${activeTab === 'create' ? '3px solid var(--primary)' : '3px solid transparent'}; color: ${activeTab === 'create' ? 'var(--primary)' : 'var(--text-secondary)'};">
            ⚡ Create LREP Reprocess Batch
          </button>
          <button class="tab-btn ${activeTab === 'eligible' ? 'active' : ''}" onclick="VisualLossReprocessModule.switchTab('eligible')" style="font-weight:700; padding:10px 18px; border:none; background:none; cursor:pointer; font-size:13.5px; border-bottom: ${activeTab === 'eligible' ? '3px solid var(--primary)' : '3px solid transparent'}; color: ${activeTab === 'eligible' ? 'var(--primary)' : 'var(--text-secondary)'};">
            📋 Eligible Batches List (${eligibleList.length})
          </button>
          <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" onclick="VisualLossReprocessModule.switchTab('history')" style="font-weight:700; padding:10px 18px; border:none; background:none; cursor:pointer; font-size:13.5px; border-bottom: ${activeTab === 'history' ? '3px solid var(--primary)' : '3px solid transparent'}; color: ${activeTab === 'history' ? 'var(--primary)' : 'var(--text-secondary)'};">
            📜 LREP Batch History (${historyList.length})
          </button>
        </div>

        <!-- Tab Content Area -->
        <div id="vlr-tab-content">
          ${renderTabContent(eligibleList, historyList)}
        </div>
      </div>
    `;

    setupAutoCompleter();
  }

  function renderTabContent(eligibleList, historyList) {
    if (activeTab === 'create') {
      return renderCreateTab();
    } else if (activeTab === 'eligible') {
      return renderEligibleTab(eligibleList);
    } else {
      return renderHistoryTab(historyList);
    }
  }

  // ── TAB 1: CREATE REPROCESS BATCH ──────────────────────────
  function renderCreateTab() {
    let selectedBatch = null;
    let lossInfo = null;

    if (selectedBatchId) {
      selectedBatch = DB.Batches.find(selectedBatchId);
      if (selectedBatch) {
        lossInfo = getBatchVisualLossInfo(selectedBatch);
      }
    }

    const vendors = DB.Vendors
      ? (typeof DB.Vendors.active === 'function'
          ? DB.Vendors.active()
          : (typeof DB.Vendors.all === 'function' ? DB.Vendors.all().filter(v => v.active !== false) : []))
      : [];
    const subs = DB.Subcontractors
      ? (typeof DB.Subcontractors.active === 'function'
          ? DB.Subcontractors.active()
          : (typeof DB.Subcontractors.all === 'function' ? DB.Subcontractors.all().filter(s => s.active !== false) : []))
      : [];
    const allVendors = [...vendors, ...subs];

    let lrepPreview = '—';
    if (selectedBatch) {
      lrepPreview = generateLossReprocessBatchNo(selectedBatch.batchNo);
    }

    return `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">
        <!-- Left Column: Search & Batch Verification Card -->
        <div class="card" style="border: 1px solid var(--border); border-radius:12px; padding:20px; background:var(--bg-glass);">
          <h3 style="font-size:15px; font-weight:700; margin-top:0; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
            <span>🔍 1. Select Batch Moved from Visual</span>
          </h3>
          <p class="text-xs text-muted" style="margin-top:-6px; margin-bottom:16px;">
            Scan barcode or search by Batch No. Only batches that have completed Visual Inspection are accepted.
          </p>

          <div class="form-group mb-3">
            <label class="form-label font-bold" style="font-size:12px;">Batch Number / Barcode <span class="required">*</span></label>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="text" id="vlr-search-batch" class="form-control" 
                placeholder="Type or scan batch number..." 
                value="${selectedBatch ? escapeHtml(selectedBatch.batchNo) : ''}" 
                onkeydown="if(event.key==='Enter'){event.preventDefault(); VisualLossReprocessModule.lookupBatch(this.value);}"
                style="font-weight:600; font-size:14px;">
              <button class="btn btn-secondary" onclick="VisualLossReprocessModule.scanBarcode()" style="white-space:nowrap; padding:0 14px;" title="Scan QR / Barcode">
                📷 Scan
              </button>
            </div>
            <div id="vlr-search-suggestions" style="position:relative;"></div>
          </div>

          <div style="display:flex; gap:8px; margin-bottom:16px;">
            <button class="btn btn-primary btn-sm" onclick="VisualLossReprocessModule.lookupBatch(document.getElementById('vlr-search-batch')?.value)" style="flex:1;">
              🔎 Verify Batch
            </button>
            <button class="btn btn-ghost btn-sm" onclick="VisualLossReprocessModule.resetSelection()" style="color:var(--text-muted);">
              ✕ Clear
            </button>
          </div>

          <!-- Strict Guard Notice / Error Box -->
          ${validationError ? `
            <div class="card p-3 mb-4" style="background:rgba(239, 68, 68, 0.08); border:1.5px solid var(--accent-red); border-radius:8px; color:var(--accent-red);">
              <div style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                <span>🚫 Selection Blocked (Strict Guard)</span>
              </div>
              <div style="font-size:12px; line-height:1.45;">
                ${escapeHtml(validationError)}
              </div>
            </div>
          ` : ''}

          <!-- Selected Batch Details Card -->
          ${selectedBatch && lossInfo ? `
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:16px; margin-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div>
                  <span class="font-bold text-blue" style="font-size:15px;">${escapeHtml(selectedBatch.batchNo)}</span>
                  <span class="badge badge-teal text-xs" style="margin-left:6px;">${escapeHtml(selectedBatch.jmrefNo || '—')}</span>
                  <div class="text-xs text-muted mt-1">Part: <strong>${escapeHtml(selectedBatch.partNo || '—')}</strong> ${selectedBatch.description ? `• ${escapeHtml(selectedBatch.description)}` : ''}</div>
                </div>
                <div style="text-align:right;">
                  <span class="stage-chip ${selectedBatch.currentStage}" style="font-size:11px;">${STAGE_LABELS[selectedBatch.currentStage] || selectedBatch.currentStage}</span>
                  <div class="text-xs text-muted mt-1">Status: <strong class="badge badge-${selectedBatch.status==='active'?'amber':'green'}">${selectedBatch.status}</strong></div>
                </div>
              </div>

              <div style="border-top:1px dashed var(--border); padding-top:12px; margin-top:8px; display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; font-size:12px;">
                <div>
                  <div class="text-xs text-muted">Visual Insp. Date:</div>
                  <div class="font-semibold">${lossInfo.visualDate}</div>
                </div>
                <div>
                  <div class="text-xs text-muted">Visual Inspector:</div>
                  <div class="font-semibold">${escapeHtml(lossInfo.visualInspector)}</div>
                </div>
                <div>
                  <div class="text-xs text-muted">Total Recorded Visual Loss:</div>
                  <div class="font-bold text-danger" style="font-size:14px;">${formatNum(lossInfo.totalVisualLoss)} pcs</div>
                </div>
                <div>
                  <div class="text-xs text-muted">Already Reprocessed (LREP):</div>
                  <div class="font-semibold text-purple">${formatNum(lossInfo.alreadyReprocessedQty)} pcs</div>
                </div>
              </div>

              <div style="background:rgba(16, 185, 129, 0.08); border:1px solid rgba(16, 185, 129, 0.3); border-radius:8px; padding:10px 14px; margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div class="text-xs text-muted" style="text-transform:uppercase; font-weight:700;">Available Loss Quantity</div>
                  <div style="font-size:18px; font-weight:800; color:var(--success);">${formatNum(lossInfo.availableLossQty)} pcs</div>
                </div>
                <div>
                  <span class="badge ${lossInfo.availableLossQty > 0 ? 'badge-green' : 'badge-gray'}" style="font-size:11px; font-weight:700;">
                    ${lossInfo.availableLossQty > 0 ? 'Ready for LREP' : 'Depleted'}
                  </span>
                </div>
              </div>

              ${lossInfo.existingLRepBatches && lossInfo.existingLRepBatches.length > 0 ? `
                <div style="margin-top:12px; font-size:11.5px;">
                  <div class="text-xs text-muted font-bold mb-1">Existing LREP Batches from this Parent:</div>
                  <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${lossInfo.existingLRepBatches.map(lb => `
                      <span class="badge badge-purple" style="font-size:10.5px; padding:2px 8px;">
                        ${lb.batchNo} (${formatNum(lb.initialQty)} pcs ➔ ${STAGE_LABELS[lb.currentStage]||lb.currentStage})
                      </span>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          ` : `
            <div style="padding:28px 16px; text-align:center; background:var(--bg-input); border-radius:10px; border:1px dashed var(--border); color:var(--text-muted); font-size:12.5px;">
              <div style="font-size:24px; margin-bottom:8px;">📦</div>
              Scan or enter a batch number above to inspect its visual loss and generate an LREP batch.
            </div>
          `}
        </div>

        <!-- Right Column: Reprocess Batch Generation Form -->
        <div class="card" style="border: 1px solid var(--border); border-radius:12px; padding:20px; background:var(--bg-glass);">
          <h3 style="font-size:15px; font-weight:700; margin-top:0; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
            <span>♻️ 2. Configure Reprocess Batch (LREP)</span>
          </h3>
          <p class="text-xs text-muted" style="margin-top:-6px; margin-bottom:16px;">
            Batch number will automatically use <strong>LREP</strong> naming convention replacing REP.
          </p>

          <form id="vlr-create-form" onsubmit="event.preventDefault(); VisualLossReprocessModule.submitLRepBatch();">
            <!-- Dynamic Naming Preview Card -->
            <div class="card mb-3" style="background:rgba(99, 102, 241, 0.05); border:1.5px solid rgba(99, 102, 241, 0.3); border-radius:8px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span class="text-xs text-muted font-bold" style="text-transform:uppercase;">Generated Batch Number Preview</span>
                <span class="badge badge-purple font-bold" style="font-size:10px;">LREP Naming Applied</span>
              </div>
              <div id="vlr-batch-preview" style="font-size:16px; font-weight:800; color:var(--primary); font-family:monospace;">
                ${lrepPreview}
              </div>
            </div>

            <!-- Reprocess Quantity Input -->
            <div class="form-group mb-3">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label class="form-label font-bold" style="font-size:12px; margin:0;">
                  Reprocess Quantity (pcs) <span class="required">*</span>
                </label>
                ${lossInfo && lossInfo.availableLossQty > 0 ? `
                  <div style="display:flex; gap:4px; font-size:11px;">
                    <button type="button" class="btn btn-ghost btn-xs text-blue" onclick="VisualLossReprocessModule.setQtyFraction(0.25)">25%</button>
                    <button type="button" class="btn btn-ghost btn-xs text-blue" onclick="VisualLossReprocessModule.setQtyFraction(0.50)">50%</button>
                    <button type="button" class="btn btn-ghost btn-xs text-success font-bold" onclick="VisualLossReprocessModule.setQtyFraction(1.0)">100% (All)</button>
                  </div>
                ` : ''}
              </div>
              <input type="number" id="vlr-reprocess-qty" class="form-control font-bold" 
                min="1" 
                max="${lossInfo ? lossInfo.availableLossQty : ''}" 
                placeholder="${lossInfo ? `Max: ${lossInfo.availableLossQty} pcs` : 'Enter quantity...'}" 
                ${!lossInfo || lossInfo.availableLossQty <= 0 ? 'disabled' : ''} 
                style="font-size:16px; color:var(--primary);">
              <div class="text-xs text-muted mt-1">Must not exceed the available visual loss (${lossInfo ? formatNum(lossInfo.availableLossQty) : 0} pcs).</div>
            </div>

            <!-- Reprocess Destination Stage -->
            <div class="form-group mb-3">
              <label class="form-label font-bold" style="font-size:12px;">Reprocess Destination Stage <span class="required">*</span></label>
              <select id="vlr-reprocess-dest" class="form-control" onchange="VisualLossReprocessModule.onDestinationChange()" ${!lossInfo || lossInfo.availableLossQty <= 0 ? 'disabled' : ''}>
                ${REPROCESS_DESTINATIONS.map(d => `
                  <option value="${d.key}" ${d.key==='trimming'?'selected':''}>${d.label}</option>
                `).join('')}
              </select>
            </div>

            <!-- Vendor / Subcontractor Selection -->
            <div class="form-group mb-3" id="vlr-vendor-group">
              <label class="form-label font-bold" style="font-size:12px;">Subcontractor / Trimming Vendor</label>
              <select id="vlr-vendor-id" class="form-control" ${!lossInfo || lossInfo.availableLossQty <= 0 ? 'disabled' : ''}>
                <option value="">-- In-House (No External Vendor) --</option>
                ${allVendors.map(v => `
                  <option value="${v.id}">${escapeHtml(v.name || v.vendorName || v.id)}</option>
                `).join('')}
              </select>
            </div>

            <!-- Reason / Supervisor Remarks -->
            <div class="form-group mb-4">
              <label class="form-label font-bold" style="font-size:12px;">Reason / Rework Instructions <span class="required">*</span></label>
              <textarea id="vlr-notes" class="form-control" rows="2" 
                placeholder="e.g. Visual inspector recorded trimming defect as scrap; moving to Trimming reprocess..." 
                ${!lossInfo || lossInfo.availableLossQty <= 0 ? 'disabled' : ''}></textarea>
            </div>

            <button type="submit" id="vlr-submit-btn" class="btn btn-primary btn-lg w-full" 
              ${!lossInfo || lossInfo.availableLossQty <= 0 ? 'disabled' : ''} 
              style="padding:12px; font-weight:800; font-size:14.5px; width:100%; display:flex; justify-content:center; align-items:center; gap:8px;">
              <span>♻️ Create LREP Reprocess Batch</span>
            </button>
          </form>
        </div>
      </div>
    `;
  }

  // ── TAB 2: ELIGIBLE BATCHES LIST ───────────────────────────
  function renderEligibleTab(eligibleList) {
    let filtered = eligibleList;
    if (eligibleSearchQuery) {
      const q = eligibleSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const b = item.batch;
        return (
          (b.batchNo && b.batchNo.toLowerCase().includes(q)) ||
          (b.jmrefNo && b.jmrefNo.toLowerCase().includes(q)) ||
          (b.partNo && b.partNo.toLowerCase().includes(q))
        );
      });
    }

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageItems = filtered.slice(startIdx, startIdx + itemsPerPage);

    const rowsHtml = pageItems.map((item, idx) => {
      const b = item.batch;
      return `
        <tr>
          <td class="font-semibold text-muted text-xs">${startIdx + idx + 1}</td>
          <td>
            ${typeof App !== 'undefined' && App.formatBatchCell ? App.formatBatchCell(b.batchNo, b.internalBatchNo) : `<span class="font-semibold text-blue">${escapeHtml(b.batchNo)}</span>`}
          </td>
          <td><span class="badge badge-teal">${escapeHtml(b.jmrefNo || '—')}</span></td>
          <td class="text-xs font-semibold">${escapeHtml(b.partNo || '—')}</td>
          <td>
            <span class="stage-chip ${b.currentStage}" style="font-size:11px;">${STAGE_LABELS[b.currentStage] || b.currentStage}</span>
          </td>
          <td class="text-xs text-muted" style="white-space:nowrap;">${item.visualDate}</td>
          <td class="font-semibold text-danger">${formatNum(item.totalVisualLoss)}</td>
          <td class="text-purple">${formatNum(item.alreadyReprocessedQty)}</td>
          <td class="font-bold text-success" style="font-size:13px;">${formatNum(item.availableLossQty)}</td>
          <td>
            <button class="btn btn-primary btn-xs font-bold" onclick="VisualLossReprocessModule.selectEligibleBatch('${b.id}')">
              ♻️ Create LREP
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Numbered pagination buttons
    let pageButtonsHtml = '';
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
      pageButtonsHtml += `<button class="btn btn-secondary btn-xs" onclick="VisualLossReprocessModule.changePage(1)">1</button>`;
      if (startPage > 2) pageButtonsHtml += `<span style="padding:0 3px;" class="text-muted">...</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
      pageButtonsHtml += `
        <button class="btn ${p === currentPage ? 'btn-primary' : 'btn-secondary'} btn-xs font-bold" 
          onclick="VisualLossReprocessModule.changePage(${p})">
          ${p}
        </button>
      `;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pageButtonsHtml += `<span style="padding:0 3px;" class="text-muted">...</span>`;
      pageButtonsHtml += `<button class="btn btn-secondary btn-xs" onclick="VisualLossReprocessModule.changePage(${totalPages})">${totalPages}</button>`;
    }

    return `
      <div class="card animate-in" style="border:1px solid var(--border); border-radius:12px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 style="font-size:15px; font-weight:700; margin:0;">📋 Batches Moved Out of Visual with Available Loss</h3>
            <p class="text-xs text-muted mt-1" style="margin:2px 0 0 0;">Active WIP batches that completed visual inspection (e.g. Gauge, Quality) with available recorded visual loss (Store batches excluded).</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="VisualLossReprocessModule.refreshLists()" title="Refresh eligible batches list">
              🔄 Refresh
            </button>
            <div class="search-input" style="max-width:280px; margin:0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" class="form-control form-control-sm" placeholder="Search batch, JMREF, part..." 
                value="${escapeHtml(eligibleSearchQuery)}" 
                oninput="VisualLossReprocessModule.filterEligible(this.value)">
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Batch Number</th>
                <th>JM REF</th>
                <th>Part Number</th>
                <th>Current Stage</th>
                <th>Visual Date</th>
                <th>Total Loss</th>
                <th>Reprocessed</th>
                <th>Available Loss</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="10" style="text-align:center; padding:28px;" class="text-muted">No eligible batches found matching criteria.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:14px; font-size:12px; border-top:1px solid var(--border); padding-top:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="text-muted">Show</span>
            <select class="form-control form-control-sm" style="width:75px; padding:2px 6px; font-size:12px;" onchange="VisualLossReprocessModule.changeItemsPerPage(this.value)">
              <option value="10" ${itemsPerPage === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${itemsPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>100</option>
            </select>
            <span class="text-muted">entries | Showing <strong>${totalItems > 0 ? startIdx + 1 : 0}</strong> to <strong>${Math.min(startIdx + itemsPerPage, totalItems)}</strong> of <strong>${totalItems}</strong></span>
          </div>
          ${totalPages > 1 ? `
            <div style="display:flex; align-items:center; gap:4px;">
              <button class="btn btn-secondary btn-xs" ${currentPage <= 1 ? 'disabled' : ''} onclick="VisualLossReprocessModule.changePage(${currentPage - 1})">◀ Prev</button>
              ${pageButtonsHtml}
              <button class="btn btn-secondary btn-xs" ${currentPage >= totalPages ? 'disabled' : ''} onclick="VisualLossReprocessModule.changePage(${currentPage + 1})">Next ▶</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ── TAB 3: LREP BATCH HISTORY ──────────────────────────────
  function renderHistoryTab(historyList) {
    let filtered = historyList;
    if (historySearchQuery) {
      const q = historySearchQuery.toLowerCase().trim();
      filtered = filtered.filter(b => {
        return (
          (b.batchNo && b.batchNo.toLowerCase().includes(q)) ||
          (b.parentBatchNo && b.parentBatchNo.toLowerCase().includes(q)) ||
          (b.jmrefNo && b.jmrefNo.toLowerCase().includes(q)) ||
          (b.partNo && b.partNo.toLowerCase().includes(q))
        );
      });
    }

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / historyItemsPerPage) || 1;
    if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
    if (historyCurrentPage < 1) historyCurrentPage = 1;

    const startIdx = (historyCurrentPage - 1) * historyItemsPerPage;
    const pageItems = filtered.slice(startIdx, startIdx + historyItemsPerPage);

    const rowsHtml = pageItems.map((b, idx) => {
      const createdDate = b.createdAt ? b.createdAt.replace('T', ' ').slice(0, 16) : '—';
      return `
        <tr>
          <td class="font-semibold text-muted text-xs">${startIdx + idx + 1}</td>
          <td>
            <span class="badge badge-purple font-bold" style="font-size:12px;">${escapeHtml(b.batchNo)}</span>
          </td>
          <td>
            ${b.parentBatchNo ? (typeof App !== 'undefined' && App.formatBatchCell ? App.formatBatchCell(b.parentBatchNo) : `<span class="font-semibold text-blue">${escapeHtml(b.parentBatchNo)}</span>`) : '—'}
          </td>
          <td><span class="badge badge-teal">${escapeHtml(b.jmrefNo || '—')}</span></td>
          <td class="text-xs font-semibold">${escapeHtml(b.partNo || '—')}</td>
          <td class="font-bold text-primary">${formatNum(b.initialQty)}</td>
          <td>
            <span class="stage-chip ${b.currentStage}" style="font-size:11px;">${STAGE_LABELS[b.currentStage] || b.currentStage}</span>
          </td>
          <td class="text-xs text-muted" style="white-space:nowrap;">${createdDate}</td>
          <td class="text-xs text-muted" style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(b.notes || '')}">
            ${escapeHtml(b.notes || '—')}
          </td>
          <td style="white-space:nowrap;">
            <button class="btn btn-teal btn-xs" onclick="window.printBarcode('${b.id}')" title="Print Barcode Label">
              🖨️ Print
            </button>
            <button class="btn btn-ghost btn-xs text-blue" onclick="App.showBatchGenealogy('${b.id}')" title="View Genealogy">
              🔍 View
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Numbered pagination buttons
    let pageButtonsHtml = '';
    const maxButtons = 5;
    let startPage = Math.max(1, historyCurrentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
      pageButtonsHtml += `<button class="btn btn-secondary btn-xs" onclick="VisualLossReprocessModule.changeHistoryPage(1)">1</button>`;
      if (startPage > 2) pageButtonsHtml += `<span style="padding:0 3px;" class="text-muted">...</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
      pageButtonsHtml += `
        <button class="btn ${p === historyCurrentPage ? 'btn-primary' : 'btn-secondary'} btn-xs font-bold" 
          onclick="VisualLossReprocessModule.changeHistoryPage(${p})">
          ${p}
        </button>
      `;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pageButtonsHtml += `<span style="padding:0 3px;" class="text-muted">...</span>`;
      pageButtonsHtml += `<button class="btn btn-secondary btn-xs" onclick="VisualLossReprocessModule.changeHistoryPage(${totalPages})">${totalPages}</button>`;
    }

    return `
      <div class="card animate-in" style="border:1px solid var(--border); border-radius:12px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 style="font-size:15px; font-weight:700; margin:0;">📜 Reprocess Batches Generated from Loss Qty (LREP)</h3>
            <p class="text-xs text-muted mt-1" style="margin:2px 0 0 0;">Historical log of all batches created using visual loss quantities.</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="VisualLossReprocessModule.refreshLists()" title="Refresh LREP history">
              🔄 Refresh
            </button>
            <div class="search-input" style="max-width:280px; margin:0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" class="form-control form-control-sm" placeholder="Search LREP batch, parent, JMREF..." 
                value="${escapeHtml(historySearchQuery)}" 
                oninput="VisualLossReprocessModule.filterHistory(this.value)">
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>LREP Batch No</th>
                <th>Parent Batch</th>
                <th>JM REF</th>
                <th>Part No</th>
                <th>Reprocess Qty</th>
                <th>Current Stage</th>
                <th>Date & Time</th>
                <th>Notes / Remarks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="10" style="text-align:center; padding:28px;" class="text-muted">No LREP batches generated yet.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:14px; font-size:12px; border-top:1px solid var(--border); padding-top:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="text-muted">Show</span>
            <select class="form-control form-control-sm" style="width:75px; padding:2px 6px; font-size:12px;" onchange="VisualLossReprocessModule.changeHistoryItemsPerPage(this.value)">
              <option value="10" ${historyItemsPerPage === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${historyItemsPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${historyItemsPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${historyItemsPerPage === 100 ? 'selected' : ''}>100</option>
            </select>
            <span class="text-muted">entries | Showing <strong>${totalItems > 0 ? startIdx + 1 : 0}</strong> to <strong>${Math.min(startIdx + historyItemsPerPage, totalItems)}</strong> of <strong>${totalItems}</strong></span>
          </div>
          ${totalPages > 1 ? `
            <div style="display:flex; align-items:center; gap:4px;">
              <button class="btn btn-secondary btn-xs" ${historyCurrentPage <= 1 ? 'disabled' : ''} onclick="VisualLossReprocessModule.changeHistoryPage(${historyCurrentPage - 1})">◀ Prev</button>
              ${pageButtonsHtml}
              <button class="btn btn-secondary btn-xs" ${historyCurrentPage >= totalPages ? 'disabled' : ''} onclick="VisualLossReprocessModule.changeHistoryPage(${historyCurrentPage + 1})">Next ▶</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ── CONTROLLER ACTIONS ─────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    currentPage = 1;
    historyCurrentPage = 1;
    render();
  }

  function changePage(page) {
    currentPage = page;
    const content = document.getElementById('vlr-tab-content');
    if (content && activeTab === 'eligible') {
      content.innerHTML = renderEligibleTab(getAllEligibleBatches());
    } else {
      render();
    }
  }

  function changeItemsPerPage(newVal) {
    itemsPerPage = parseInt(newVal, 10) || 25;
    currentPage = 1;
    const content = document.getElementById('vlr-tab-content');
    if (content && activeTab === 'eligible') {
      content.innerHTML = renderEligibleTab(getAllEligibleBatches());
    } else {
      render();
    }
  }

  function changeHistoryPage(page) {
    historyCurrentPage = page;
    const content = document.getElementById('vlr-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab(getAllLRepHistory());
    } else {
      render();
    }
  }

  function changeHistoryItemsPerPage(newVal) {
    historyItemsPerPage = parseInt(newVal, 10) || 25;
    historyCurrentPage = 1;
    const content = document.getElementById('vlr-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab(getAllLRepHistory());
    } else {
      render();
    }
  }

  function refreshLists() {
    invalidateCache();
    render();
    if (typeof showToast === 'function') {
      showToast('Eligible batches and history reloaded.', 'info');
    }
  }

  function filterEligible(q) {
    eligibleSearchQuery = q;
    currentPage = 1;
    const content = document.getElementById('vlr-tab-content');
    if (content && activeTab === 'eligible') {
      content.innerHTML = renderEligibleTab(getAllEligibleBatches());
    }
  }

  function filterHistory(q) {
    historySearchQuery = q;
    historyCurrentPage = 1;
    const content = document.getElementById('vlr-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab(getAllLRepHistory());
    }
  }

  function selectEligibleBatch(batchId) {
    selectedBatchId = batchId;
    validationError = null;
    activeTab = 'create';
    render();
    setTimeout(() => {
      const qtyInput = document.getElementById('vlr-reprocess-qty');
      if (qtyInput) qtyInput.focus();
    }, 100);
  }

  function resetSelection() {
    selectedBatchId = null;
    validationError = null;
    render();
  }

  function lookupBatch(rawBatchNo) {
    if (!rawBatchNo || !rawBatchNo.trim()) {
      validationError = 'Please enter or scan a batch number.';
      render();
      return;
    }

    const cleanNo = rawBatchNo.trim();
    const batch = DB.Batches.byBatchNo ? DB.Batches.byBatchNo(cleanNo) : DB.Batches.all().find(b => b.batchNo && b.batchNo.trim().toUpperCase() === cleanNo.toUpperCase());

    if (!batch) {
      selectedBatchId = null;
      validationError = `Batch "${cleanNo}" was not found in the database. Please check the batch number.`;
      render();
      return;
    }

    // Run strict guard validation
    const validation = validateBatchEligibility(batch);
    if (!validation.ok) {
      selectedBatchId = null;
      validationError = validation.reason;
      render();
      return;
    }

    selectedBatchId = batch.id;
    validationError = null;
    render();
    showToast(`Batch verified! Available visual loss: ${validation.info.availableLossQty} pcs`, 'success');
  }

  function scanBarcode() {
    if (typeof Scanner !== 'undefined' && typeof Scanner.start === 'function') {
      Scanner.start('vlr-search-batch', (val) => {
        const inp = document.getElementById('vlr-search-batch');
        if (inp) inp.value = val;
        lookupBatch(val);
      });
    } else {
      showToast('Camera scanner unavailable. Please type the batch number.', 'info');
    }
  }

  function setQtyFraction(fraction) {
    if (!selectedBatchId) return;
    const batch = DB.Batches.find(selectedBatchId);
    if (!batch) return;
    const info = getBatchVisualLossInfo(batch);
    if (!info || info.availableLossQty <= 0) return;

    const val = Math.max(1, Math.floor(info.availableLossQty * fraction));
    const qtyInput = document.getElementById('vlr-reprocess-qty');
    if (qtyInput) qtyInput.value = val;
  }

  function onDestinationChange() {
    const dest = document.getElementById('vlr-reprocess-dest')?.value;
    const destObj = REPROCESS_DESTINATIONS.find(d => d.key === dest);
    const vendorGroup = document.getElementById('vlr-vendor-group');
    if (vendorGroup) {
      if (destObj && destObj.vendorEligible) {
        vendorGroup.classList.remove('hidden');
      } else {
        vendorGroup.classList.add('hidden');
        const vSelect = document.getElementById('vlr-vendor-id');
        if (vSelect) vSelect.value = '';
      }
    }
  }

  // Setup auto-completer for the search input
  function setupAutoCompleter() {
    const input = document.getElementById('vlr-search-batch');
    const container = document.getElementById('vlr-search-suggestions');
    if (!input || !container) return;

    let timer = null;
    input.addEventListener('input', (e) => {
      if (timer) clearTimeout(timer);
      const val = e.target.value.trim().toLowerCase();
      if (!val || val.length < 2) {
        container.innerHTML = '';
        return;
      }

      timer = setTimeout(() => {
        const eligible = getAllEligibleBatches();
        const matches = eligible.filter(item => {
          const b = item.batch;
          return (
            (b.batchNo && b.batchNo.toLowerCase().includes(val)) ||
            (b.jmrefNo && b.jmrefNo.toLowerCase().includes(val))
          );
        }).slice(0, 6);

        if (!matches.length) {
          container.innerHTML = '';
          return;
        }

        container.innerHTML = `
          <div style="position:absolute; top:4px; left:0; right:0; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.3); z-index:100; max-height:220px; overflow-y:auto;">
            ${matches.map(item => `
              <div style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); font-size:12px; display:flex; justify-content:space-between; align-items:center;"
                onmouseover="this.style.background='var(--bg-glass-hover)'"
                onmouseout="this.style.background='transparent'"
                onclick="VisualLossReprocessModule.selectEligibleBatch('${item.batch.id}')">
                <div>
                  <strong class="text-blue">${escapeHtml(item.batch.batchNo)}</strong>
                  <span class="badge badge-teal text-xs" style="margin-left:4px;">${escapeHtml(item.batch.jmrefNo || '')}</span>
                  <div class="text-xs text-muted">${escapeHtml(item.batch.partNo || '')}</div>
                </div>
                <div style="text-align:right;">
                  <span class="badge badge-green font-bold">${formatNum(item.availableLossQty)} pcs</span>
                  <div class="text-xs text-muted">${STAGE_LABELS[item.batch.currentStage]||item.batch.currentStage}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }, 150);
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target) && e.target !== input) {
        container.innerHTML = '';
      }
    });
  }

  // Submit and create the LREP batch
  async function submitLRepBatch() {
    if (!selectedBatchId) {
      showToast('Please select a valid batch first.', 'error');
      return;
    }

    const parentBatch = DB.Batches.find(selectedBatchId);
    if (!parentBatch) {
      showToast('Parent batch not found.', 'error');
      return;
    }

    // Re-verify eligibility strictly
    const validation = validateBatchEligibility(parentBatch);
    if (!validation.ok) {
      validationError = validation.reason;
      render();
      showToast(validation.reason, 'error');
      return;
    }

    const info = validation.info;
    const qtyInput = document.getElementById('vlr-reprocess-qty');
    const destSelect = document.getElementById('vlr-reprocess-dest');
    const vendorSelect = document.getElementById('vlr-vendor-id');
    const notesInput = document.getElementById('vlr-notes');

    const reprocessQty = parseInt(qtyInput?.value, 10);
    const targetStage = destSelect?.value || 'trimming';
    const vendorId = vendorSelect?.value || '';
    const notes = (notesInput?.value || '').trim();

    if (isNaN(reprocessQty) || reprocessQty <= 0) {
      showToast('Please enter a valid reprocess quantity (at least 1 pc).', 'error');
      if (qtyInput) qtyInput.focus();
      return;
    }

    if (reprocessQty > info.availableLossQty) {
      showToast(`Cannot reprocess ${formatNum(reprocessQty)} pcs. Maximum available loss is ${formatNum(info.availableLossQty)} pcs.`, 'error');
      if (qtyInput) qtyInput.focus();
      return;
    }

    const submitBtn = document.getElementById('vlr-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳ Generating LREP Batch...</span>';
    }

    try {
      const nowIso = new Date().toISOString();
      const dateStr = nowIso.slice(0, 10);
      const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      const currentUserName = session?.name || session?.username || 'Supervisor';

      // 1. Generate unique LREP Batch Number replacing REP with LREP
      const lrepBatchNo = generateLossReprocessBatchNo(parentBatch.batchNo);

      // 2. Insert the new active LREP reprocess batch into DB.Batches
      const lrepBatch = DB.Batches.insert({
        batchNo: lrepBatchNo,
        partId: parentBatch.partId,
        partNo: parentBatch.partNo,
        jmrefNo: parentBatch.jmrefNo,
        description: parentBatch.description,
        currentStage: targetStage,
        status: 'active',
        initialQty: reprocessQty,
        currentQty: reprocessQty,
        remainingQty: reprocessQty,
        mouldNo: parentBatch.mouldNo ?? null,
        internalBatchNo: (typeof DB !== 'undefined' && DB.Batches?.nextInternalBatchNo) ? DB.Batches.nextInternalBatchNo() : undefined,
        productionDate: parentBatch.productionDate || '',
        compoundCode: parentBatch.compoundCode || '',
        rawMaterialBatchNo: parentBatch.rawMaterialBatchNo || '',
        pressNo: parentBatch.pressNo || '',
        shift: parentBatch.shift || '',
        trNo: parentBatch.trNo || '',
        productionType: parentBatch.productionType || 'inhouse',
        isReprocess: true,
        isLossReprocess: true, // Special tag designating creation from loss quantity
        reprocessDestination: targetStage,
        vendorId: vendorId || '',
        parentBatchId: parentBatch.id,
        parentBatchNo: parentBatch.batchNo,
        lossRecoveredFromStage: 'visual',
        lossRecoveredQty: reprocessQty,
        createdAt: nowIso,
        updatedAt: nowIso,
        notes: `Loss Reprocess batch created from Visual Loss of ${parentBatch.batchNo}. Target: ${STAGE_LABELS[targetStage] || targetStage}.${notes ? ' Remarks: ' + notes : ''}`
      });

      // 3. Insert StageRecord for the new LREP batch (moving from visual to targetStage)
      DB.StageRecords.insert({
        batchId: lrepBatch.id,
        stage: 'visual',
        inputQty: reprocessQty,
        outputQty: reprocessQty,
        lossQty: 0,
        reprocessQty: reprocessQty,
        vendorId: vendorId || '',
        movedTo: targetStage,
        movedFrom: 'visual',
        date: dateStr,
        createdAt: nowIso,
        recordedBy: session?.userId,
        recordedByName: currentUserName,
        actionType: 'loss-reprocess',
        notes: `Reprocess batch generated from Visual Loss of parent ${parentBatch.batchNo}. Target: ${STAGE_LABELS[targetStage] || targetStage}`
      });

      // 4. Update the Parent Batch's Visual Stage Record (reducing lossQty, increasing reprocessQty)
      const allParentRecs = DB.StageRecords.byBatch ? DB.StageRecords.byBatch(parentBatch.id) : [];
      const parentVisRec = allParentRecs.find(r => (r.stage === 'visual' || r.movedFrom === 'visual') && Number(r.lossQty) > 0);
      if (parentVisRec) {
        const updatedLoss = Math.max(0, (Number(parentVisRec.lossQty) || 0) - reprocessQty);
        const updatedRep = (Number(parentVisRec.reprocessQty) || 0) + reprocessQty;
        const addNote = `Moved ${formatNum(reprocessQty)} pcs to Loss Reprocess (${lrepBatchNo})`;
        const newNotes = parentVisRec.notes ? `${parentVisRec.notes} | ${addNote}` : addNote;

        DB.StageRecords.update(parentVisRec.id, {
          lossQty: updatedLoss,
          reprocessQty: updatedRep,
          notes: newNotes,
          updatedAt: nowIso
        });
      }

      // 5. Update the Parent Batch's LossTracker Record (reducing recorded lossQty)
      const allParentLosses = DB.LossTracker.byBatch ? DB.LossTracker.byBatch(parentBatch.id) : [];
      const parentLossRec = allParentLosses.find(r => r.stage === 'visual' && Number(r.lossQty) > 0);
      if (parentLossRec) {
        const updatedLoss = Math.max(0, (Number(parentLossRec.lossQty) || 0) - reprocessQty);
        const addNote = `Reduced by ${formatNum(reprocessQty)} pcs for Loss Reprocess (${lrepBatchNo})`;
        const newNotes = parentLossRec.notes ? `${parentLossRec.notes} | ${addNote}` : addNote;

        DB.LossTracker.update(parentLossRec.id, {
          lossQty: updatedLoss,
          notes: newNotes,
          updatedAt: nowIso
        });
      }

      // 6. Log in AuditLogs for traceability
      if (DB.AuditLogs && typeof DB.AuditLogs.insert === 'function') {
        DB.AuditLogs.insert({
          timestamp: nowIso,
          userId: session?.userId,
          username: currentUserName,
          action: 'LOSS_REPROCESS_CREATED',
          category: 'system',
          details: `Created LREP batch ${lrepBatchNo} (${formatNum(reprocessQty)} pcs ➔ ${STAGE_LABELS[targetStage] || targetStage}) from Visual Loss of ${parentBatch.batchNo}`
        });
      }

      showToast(`✅ Created LREP Batch ${lrepBatchNo} with ${formatNum(reprocessQty)} pcs sent to ${STAGE_LABELS[targetStage] || targetStage}!`, 'success');

      // 7. Prompt to print barcode label
      setTimeout(() => {
        const confirmPrint = confirm(`Loss Reprocess batch ${lrepBatchNo} (${formatNum(reprocessQty)} pcs) was created successfully!\n\nWould you like to print its barcode label now?`);
        if (confirmPrint && typeof window.printBarcode === 'function') {
          window.printBarcode(lrepBatch.id);
        }
      }, 500);

      // Reset selection, invalidate cache, and switch to history view
      selectedBatchId = null;
      validationError = null;
      invalidateCache();
      activeTab = 'history';
      render();

    } catch (err) {
      console.error('Error generating LREP batch:', err);
      showToast(`Error creating LREP batch: ${err.message || err}`, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>♻️ Create LREP Reprocess Batch</span>';
      }
    }
  }

  return {
    render,
    switchTab,
    changePage,
    changeItemsPerPage,
    changeHistoryPage,
    changeHistoryItemsPerPage,
    refreshLists,
    filterEligible,
    filterHistory,
    selectEligibleBatch,
    resetSelection,
    lookupBatch,
    scanBarcode,
    setQtyFraction,
    onDestinationChange,
    submitLRepBatch,
    validateBatchEligibility,
    generateLossReprocessBatchNo,
    getBatchVisualLossInfo,
    getAllEligibleBatches,
    getAllLRepHistory
  };
})();

if (typeof window !== 'undefined') {
  window.VisualLossReprocessModule = VisualLossReprocessModule;
}
