// ============================================================
// quick-movement.js — Streamlined Quick Movement Module
// ============================================================
const QuickMovementModule = (() => {

  let _activeBatch = null;
  let _inputQty = 0;
  let _nextStage = '';
  let activeSearch = '';

  const STAGE_LABELS = {
    production: 'Production (Moulding)',
    cryogenic: 'Cryogenic',
    deflashing: 'Flash Removal (DE Flashing)',
    'waiting-trimming': 'Waiting for Trimming',
    trimming: 'Trimming',
    'post-curing': 'Post Curing',
    'waiting-visual': 'Waiting for Visual Inspection',
    visual: 'Visual Inspection',
    gauge: 'Gauge Inspection',
    quality: 'Quality Final (QC)',
    store: 'Store'
  };

  const STAGE_SEQUENCE = [
    'production',
    'cryogenic',
    'deflashing',
    'waiting-trimming',
    'trimming',
    'post-curing',
    'waiting-visual',
    'visual',
    'gauge',
    'quality',
    'store'
  ];

  function getBatchInputQty(batch) {
    if (!batch || !batch.id) return 0;
    const batchRecs = DB.StageRecords.byBatch ? DB.StageRecords.byBatch(batch.id) : DB.StageRecords.all().filter(r => r.batchId === batch.id);
    const stageRecords = batchRecs.filter(r => r.movedTo === batch.currentStage);
    if (!stageRecords.length) return Number(batch.initialQty || 0);
    const last = stageRecords[stageRecords.length - 1];
    return last.isRecheck ? Number(last.recheckQty || 0) : Number(last.outputQty || 0);
  }

  function determineNextStage(batch) {
    const current = batch.currentStage;
    const part = DB.Master.find(batch.partId) || DB.Master.all().find(p => p.jmrefNo === batch.jmrefNo) || {};
    
    // Check if mould process flow defines first process
    let firstProcess = '';
    if (batch.mouldNo && part.moulds) {
      const m = part.moulds.find(x => Number(x.mouldNo) === Number(batch.mouldNo));
      if (m) firstProcess = m.firstProcess || '';
    }

    if (current === 'production') {
      if (firstProcess === 'Cryogenic') return 'cryogenic';
      if (firstProcess === 'Trimming') return 'waiting-trimming';
      if (firstProcess === 'Flash Removal') return 'deflashing';
      return 'deflashing';
    }

    if (current === 'cryogenic') return 'deflashing';
    if (current === 'deflashing') return 'waiting-trimming';
    if (current === 'waiting-trimming') return 'trimming';
    if (current === 'trimming') return 'waiting-visual';
    if (current === 'post-curing') return 'waiting-visual';
    if (current === 'waiting-visual') return 'visual';
    if (current === 'visual') return 'quality';
    if (current === 'gauge') return 'quality';
    if (current === 'quality') return 'store';

    // Default sequence fallback
    const idx = STAGE_SEQUENCE.indexOf(current);
    if (idx !== -1 && idx < STAGE_SEQUENCE.length - 1) {
      return STAGE_SEQUENCE[idx + 1];
    }
    return 'store';
  }

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const quickMasterParts = DB.Master.all().filter(p => p.quickMovementEnabled);

    el.innerHTML = `
      <div class="animate-in" style="max-width: 900px; margin: 0 auto;">
        <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 class="font-bold flex items-center gap-2" style="font-size:20px;">
              <span>⚡ Quick Stage Movement</span>
              <span class="badge badge-amber" style="font-size:11px;">High Daily Volume</span>
            </h2>
            <p class="text-sm text-muted mt-1">Scan batch barcode and advance to next stage with single Output Quantity entry</p>
          </div>
          <div class="text-sm text-muted">
            Configured High-Volume Parts: <strong class="text-teal">${quickMasterParts.length}</strong>
          </div>
        </div>

        <!-- Main Card -->
        <div class="card mb-6" style="border: 2px solid var(--primary); box-shadow: var(--shadow-md);">
          <div class="card-header" style="background: rgba(59, 130, 246, 0.05);">
            <h3 style="margin:0; font-size:15px; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span>📷 Scan or Type Batch Barcode</span>
            </h3>
          </div>
          <div class="card-body">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" style="font-weight:700;">Scan Batch Number <span class="required">*</span></label>
              <div class="flex gap-2">
                <input type="text" id="quick-batch-search" class="form-control form-control-lg" style="flex:1; font-weight:700; font-size:16px;" placeholder="Scan or type Batch No..." value="${activeSearch}" oninput="QuickMovementModule.onSearchInput(this.value)" onkeydown="if(event.key==='Enter'){ QuickMovementModule.lookupBatch(); event.preventDefault(); }">
                <button class="btn btn-secondary" onclick="QuickMovementModule.startScan()" style="padding: 0 16px; height: 46px; display:flex; align-items:center; gap:6px;" title="Scan camera QR">📷 Scan</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Active Batch Form Area -->
        <div id="quick-batch-form-area">
          ${renderBatchForm()}
        </div>

        <!-- Quick Configured Parts Summary -->
        <div class="card mt-6">
          <div class="card-header">
            <h3>⚡ Configured High-Volume Parts (JMREF)</h3>
          </div>
          <div class="card-body" style="padding:12px;">
            ${quickMasterParts.length > 0 ? `
              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${quickMasterParts.map(p => `<span class="badge badge-teal" style="font-size:12px; padding:6px 12px;">${p.jmrefNo} (${p.partNo})</span>`).join('')}
              </div>
            ` : `
              <p class="text-sm text-muted">No specific parts configured with <strong>⚡ Quick Movement</strong> yet. You can enable Quick Movement for specific JMREFs in the <strong>Inventory Master</strong> screen.</p>
            `}
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      const inp = document.getElementById('quick-batch-search');
      if (inp) inp.focus();
    }, 60);
  }

  function onSearchInput(val) {
    activeSearch = val;
    const clean = val.trim();
    if (!clean) {
      _activeBatch = null;
      document.getElementById('quick-batch-form-area').innerHTML = renderBatchForm();
      return;
    }
    const b = DB.Batches.all().find(x => x.batchNo && x.batchNo.toLowerCase() === clean.toLowerCase() && x.status === 'active');
    if (b) {
      setActiveBatch(b);
    }
  }

  function lookupBatch() {
    const val = (document.getElementById('quick-batch-search')?.value || '').trim();
    if (!val) {
      showToast('Please scan or enter a batch number', 'warning');
      return;
    }
    const b = DB.Batches.all().find(x => x.batchNo && x.batchNo.toLowerCase() === val.toLowerCase());
    if (!b) {
      showToast('Batch not found: ' + val, 'error');
      return;
    }
    if (b.status !== 'active') {
      showToast(`Batch ${b.batchNo} is already completed or inactive`, 'warning');
      return;
    }
    setActiveBatch(b);
  }

  function startScan() {
    if (typeof Scanner === 'undefined') {
      showToast('Scanner module not loaded', 'error');
      return;
    }
    Scanner.start('quick-batch-search', (scannedText) => {
      const clean = (scannedText || '').trim();
      if (!clean) return;
      const b = DB.Batches.all().find(x => x.batchNo && x.batchNo.toLowerCase() === clean.toLowerCase());
      if (b) {
        setActiveBatch(b);
      } else {
        showToast('Scanned batch not found: ' + clean, 'error');
      }
    });
  }

  function setActiveBatch(b) {
    _activeBatch = b;
    _inputQty = getBatchInputQty(b);
    _nextStage = determineNextStage(b);
    activeSearch = b.batchNo;

    const area = document.getElementById('quick-batch-form-area');
    if (area) {
      area.innerHTML = renderBatchForm();
      setTimeout(() => {
        const outInp = document.getElementById('quick-output-qty');
        if (outInp) outInp.focus();
      }, 60);
    }
  }

  function renderBatchForm() {
    if (!_activeBatch) {
      return `
        <div class="card p-8 text-center text-muted" style="border: 2px dashed var(--border);">
          <div style="font-size: 36px; margin-bottom: 8px;">⚡</div>
          <h4 style="font-size: 15px; font-weight: 700; color: var(--text);">Ready to Scan</h4>
          <p class="text-sm">Scan a batch barcode above to view stage status and enter Output Quantity.</p>
        </div>
      `;
    }

    const b = _activeBatch;
    const part = DB.Master.find(b.partId) || DB.Master.all().find(p => p.jmrefNo === b.jmrefNo) || {};
    const isTrimmingTarget = (_nextStage === 'trimming' || _nextStage === 'waiting-trimming');

    const vendors = DB.Vendors.byDept('trimming').filter(v => !v.name.toLowerCase().includes('in house'));
    const vendorOptions = vendors.map(v => `<option value="${v.id}" ${b.vendorId === v.id ? 'selected' : ''}>${v.name}</option>`).join('');

    return `
      <div class="card animate-in" style="border-top: 4px solid var(--accent-blue);">
        <div class="card-header flex justify-between items-center" style="background: rgba(59, 130, 246, 0.03);">
          <div>
            <h3 class="font-bold text-blue" style="font-size: 17px; margin:0;">${b.batchNo}</h3>
            <div class="text-xs text-muted mt-1">
              Part: <strong>${b.partNo || '—'}</strong> | JMREF: <span class="badge badge-teal" style="font-size:10px;">${b.jmrefNo || '—'}</span>
            </div>
          </div>
          <span class="badge badge-green" style="font-size: 12px; padding: 4px 10px;">Active Batch</span>
        </div>

        <div class="card-body">
          <!-- Stage Movement Banner -->
          <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 10px; padding: 14px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-secondary);">Current Stage</div>
              <div style="font-size:15px; font-weight:800; color:var(--text);">${STAGE_LABELS[b.currentStage] || b.currentStage}</div>
            </div>
            <div style="font-size: 22px; color: var(--primary);">➔</div>
            <div style="text-align: right;">
              <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--primary);">Target Next Stage</div>
              <div style="font-size:15px; font-weight:800; color:var(--primary);">${STAGE_LABELS[_nextStage] || _nextStage}</div>
            </div>
          </div>

          <form onsubmit="event.preventDefault(); QuickMovementModule.processMove();">
            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Incoming Input Qty (pcs)</label>
                <input type="text" class="form-control font-bold" value="${formatNum(_inputQty)}" readonly style="background:var(--bg-secondary); color:var(--text);">
              </div>

              <div class="form-group" style="flex:1;">
                <label class="form-label">Good Output Qty (pcs) <span class="required">*</span></label>
                <input type="number" id="quick-output-qty" class="form-control font-bold" style="font-size:16px; color:var(--primary);" placeholder="Enter good output qty" min="0" max="${_inputQty}" oninput="QuickMovementModule.calcLoss()" onkeydown="if(event.key==='Enter'){ QuickMovementModule.processMove(); event.preventDefault(); }">
              </div>
            </div>

            <!-- Dynamic Vendor Dropdown if target stage is Trimming -->
            ${isTrimmingTarget ? `
              <div class="form-group mb-4">
                <label class="form-label">Select Trimming Subcontractor Vendor <span class="required">*</span></label>
                <select id="quick-vendor-id" class="form-control">
                  <option value="">Select Vendor...</option>
                  ${vendorOptions}
                </select>
              </div>
            ` : ''}

            <!-- Computed Loss & Warning Area -->
            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Calculated Loss Qty (pcs)</label>
                <input type="text" id="quick-loss-display" class="form-control font-bold" value="0 pcs (0%)" readonly style="background:var(--bg-secondary);">
              </div>
            </div>

            <!-- High Loss > 10% Warning Box -->
            <div id="quick-high-loss-box" class="hidden mb-4" style="background: rgba(245, 158, 11, 0.08); border: 1.5px solid var(--accent-amber,#f59e0b); border-radius: 10px; padding: 12px;">
              <div style="font-size: 13px; font-weight: 700; color: #d97706; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span>⚠️ High Loss Detected (> 10%)</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                Loss quantity exceeds 10% threshold. Comments / Remarks are <strong>mandatory</strong> to proceed.
              </div>
            </div>

            <!-- Notes Field -->
            <div class="form-group mb-4">
              <label class="form-label" id="quick-notes-label">Notes / Remarks <span id="quick-notes-req" class="required hidden">*</span></label>
              <input type="text" id="quick-notes" class="form-control" placeholder="Enter process notes or loss reasons...">
            </div>

            <div class="flex justify-end gap-3 mt-6">
              <button type="button" class="btn btn-secondary" onclick="QuickMovementModule.cancelForm()">Cancel / Reset</button>
              <button type="submit" class="btn btn-primary btn-lg" style="padding: 10px 28px; font-weight: 700;">⚡ Submit &amp; Advance Stage</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function calcLoss() {
    if (!_activeBatch) return;
    const outVal = parseInt(document.getElementById('quick-output-qty')?.value, 10);
    const lossBox = document.getElementById('quick-high-loss-box');
    const lossDisp = document.getElementById('quick-loss-display');
    const reqStar = document.getElementById('quick-notes-req');

    if (isNaN(outVal) || outVal < 0) {
      if (lossDisp) lossDisp.value = '0 pcs (0%)';
      if (lossBox) lossBox.classList.add('hidden');
      if (reqStar) reqStar.classList.add('hidden');
      return;
    }

    const lossQty = Math.max(0, _inputQty - outVal);
    const lossPct = _inputQty > 0 ? ((lossQty / _inputQty) * 100).toFixed(1) : 0;

    if (lossDisp) {
      lossDisp.value = `${formatNum(lossQty)} pcs (${lossPct}%)`;
      if (lossQty > 0) {
        lossDisp.style.color = 'var(--accent-red,#ef4444)';
      } else {
        lossDisp.style.color = 'var(--text)';
      }
    }

    const isHighLoss = lossQty > (0.10 * _inputQty);
    if (isHighLoss) {
      if (lossBox) lossBox.classList.remove('hidden');
      if (reqStar) reqStar.classList.remove('hidden');
    } else {
      if (lossBox) lossBox.classList.add('hidden');
      if (reqStar) reqStar.classList.add('hidden');
    }
  }

  function cancelForm() {
    _activeBatch = null;
    activeSearch = '';
    render();
  }

  async function processMove() {
    if (!_activeBatch) return;

    if (typeof DB !== 'undefined' && DB.isOnline && !DB.isOnline()) {
      showToast("Cloud Connection Required: Cannot move batch while offline. Please check your internet connection.", "error");
      return;
    }

    const outVal = parseInt(document.getElementById('quick-output-qty')?.value, 10);
    if (isNaN(outVal) || outVal < 0) {
      showToast('Please enter a valid Output Quantity', 'error');
      return;
    }
    if (outVal > _inputQty) {
      showToast(`Output Quantity (${outVal}) cannot exceed Input Quantity (${_inputQty})`, 'error');
      return;
    }

    const isTrimmingTarget = (_nextStage === 'trimming' || _nextStage === 'waiting-trimming');
    let vendorId = '';
    if (isTrimmingTarget) {
      vendorId = document.getElementById('quick-vendor-id')?.value || '';
      if (!vendorId) {
        showToast('Please select a Trimming Subcontractor Vendor', 'error');
        return;
      }
    }

    const lossQty = Math.max(0, _inputQty - outVal);
    const notes = (document.getElementById('quick-notes')?.value || '').trim();

    // >10% High Loss Guardrail
    if (lossQty > (0.10 * _inputQty)) {
      if (!notes) {
        showToast('Loss exceeds 10%. Comments/Notes are mandatory before proceeding.', 'error');
        if (typeof showLossWarning === 'function') showLossWarning();
        const nInp = document.getElementById('quick-notes');
        if (nInp) nInp.focus();
        return;
      }
    }

    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const dateStr = new Date().toISOString().slice(0, 10);
    const b = _activeBatch;

    const moveBtn = document.querySelector('#quick-batch-form-area .btn-teal, #quick-batch-form-area button[onclick*="processMove"]');
    const originalBtnHtml = moveBtn ? moveBtn.innerHTML : '⚡ Confirm &amp; Move Stage';
    if (moveBtn) {
      moveBtn.disabled = true;
      moveBtn.innerHTML = '⏳ Saving to Cloud...';
    }

    try {
      // Insert Stage Record
      await DB.StageRecords.insertAsync({
        batchId: b.id,
        stage: b.currentStage,
        inputQty: _inputQty,
        outputQty: outVal,
        lossQty: lossQty,
        vendorId: vendorId || b.vendorId || '',
        movedTo: _nextStage,
        movedFrom: b.currentStage,
        date: dateStr,
        recordedBy: session?.userId || 'unknown',
        notes: notes || `Quick Movement to ${STAGE_LABELS[_nextStage] || _nextStage}`
      });

      // Update Batch current stage and handle Store completion
      if (_nextStage === 'store') {
        await DB.StageRecords.insertAsync({
          batchId: b.id,
          stage: 'store',
          inputQty: outVal,
          outputQty: 0,
          lossQty: 0,
          movedFrom: b.currentStage,
          date: dateStr,
          recordedBy: session?.userId || 'unknown'
        });
        await DB.Batches.updateAsync(b.id, {
          status: 'completed',
          currentStage: 'store',
          completedAt: new Date().toISOString(),
          remainingQty: outVal,
          vendorId: null
        });
      } else {
        await DB.Batches.updateAsync(b.id, {
          currentStage: _nextStage,
          vendorId: vendorId || b.vendorId || ''
        });
      }

      // Track loss in LossTracker if loss > 0
      if (lossQty > 0) {
        await DB.LossTracker.insertAsync({
          batchId: b.id,
          stage: b.currentStage,
          lossQty,
          date: dateStr,
          jmrefNo: b.jmrefNo,
          partNo: b.partNo
        });
      }

      showToast(`⚡ Batch ${b.batchNo} moved to ${STAGE_LABELS[_nextStage] || _nextStage}`, 'success');

      // Reset active batch state and keep input focused for continuous scanning!
      _activeBatch = null;
      activeSearch = '';
      render();
    } catch (err) {
      console.error("Quick movement error:", err);
      showToast(`Failed to move batch: ${err.message}`, 'error');
    } finally {
      if (moveBtn) {
        moveBtn.disabled = false;
        moveBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  return {
    render,
    onSearchInput,
    lookupBatch,
    startScan,
    calcLoss,
    cancelForm,
    processMove
  };
})();

window.QuickMovementModule = QuickMovementModule;
