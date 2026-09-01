// ============================================================
// stock-audit.js — JMPL Inventory Tracking System
// Monthly Physical Stock Taking, Barcode Scanning & Audit Module
// ============================================================
/* global DB, Auth, App, showToast, formatDate, formatNum, STAGE_LABELS, XLSX, Scanner */

const StockAuditModule = (() => {
  let activeTab = 'scanner'; // 'scanner' | 'verified' | 'missing' | 'sessions'
  let currentSessionId = null;
  let verifiedSearch = '';
  let verifiedStatusFilter = '';
  let missingSearch = '';
  let missingStageFilter = '';
  let lastScannedBatch = null;
  
  let verifiedCurrentPage = 1;
  let missingCurrentPage = 1;
  const itemsPerPage = 50;

  let rapidScanMode = false;
  let pinnedRackLocation = '';

  function toggleRapidScan(val) {
    rapidScanMode = Boolean(val);
    showToast(rapidScanMode ? '⚡ Rapid Scan / Auto-Verify Mode Enabled' : 'Standard Verification Mode Enabled', 'info');
    render();
  }

  function updatePinnedRack(val) {
    pinnedRackLocation = String(val || '').trim();
  }

  // ── Audio Feedback Utility ─────────────────────────────────
  function playAudioTone(type = 'success') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'warning') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {
      // AudioContext not allowed or unsupported
    }
  }

  // ── Get Active or Selected Session ────────────────────────
  function getActiveSession() {
    const sessions = DB.AuditSessions.all();
    if (currentSessionId) {
      const s = sessions.find(x => x.id === currentSessionId);
      if (s) return s;
    }
    // Default to the latest in_progress session or latest overall session
    const inProgress = sessions.filter(x => x.status === 'in_progress').sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    if (inProgress.length > 0) {
      currentSessionId = inProgress[0].id;
      return inProgress[0];
    }
    if (sessions.length > 0) {
      const sorted = [...sessions].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
      currentSessionId = sorted[0].id;
      return sorted[0];
    }
    return null;
  }

  // ── Calculate Expected Quantity for a Batch (Optimized) ────
  function getBatchExpectedQty(batch, stageRecsMap) {
    if (!batch) return 0;
    
    // Use indexed map if provided, otherwise fetch stage records once
    let stageRecs = null;
    if (stageRecsMap && stageRecsMap[batch.id]) {
      stageRecs = stageRecsMap[batch.id];
    }

    if (batch.status === 'completed' || batch.currentStage === 'store') {
      if (stageRecs) {
        const storeRecs = stageRecs.filter(r => r.stage === 'store');
        if (storeRecs.length > 0) {
          return storeRecs[storeRecs.length - 1].inputQty || batch.initialQty || 0;
        }
      } else {
        const storeItem = DB.StoreInventory.byJmref ? DB.StoreInventory.byJmref(batch.jmrefNo) : null;
        if (storeItem && typeof storeItem.available === 'number') {
          const recs = DB.StageRecords.all().filter(r => r.batchId === batch.id && r.stage === 'store');
          if (recs.length > 0) {
            return recs[recs.length - 1].inputQty || batch.initialQty || 0;
          }
        }
      }
      return batch.initialQty || 0;
    }

    // In-process stages: find incoming qty to currentStage
    if (batch.currentStage === 'production') {
      return batch.initialQty || 0;
    }

    if (!stageRecs) {
      stageRecs = DB.StageRecords.all().filter(r => r.batchId === batch.id);
    }

    const incoming = stageRecs.filter(r => r.movedTo === batch.currentStage);
    if (incoming.length > 0) {
      const last = incoming[incoming.length - 1];
      return last.isRecheck ? (last.recheckQty || 0) : (last.outputQty || 0);
    }

    return batch.initialQty || 0;
  }

  // ── Calculate Expected In-Scope Batches for a Session ─────
  function getSessionExpectedBatches(session) {
    if (!session) return [];
    const batches = DB.Batches.all().filter(b => !b.isArchived);
    const scope = session.stageScope || 'all';

    if (scope === 'all') {
      return batches.filter(b => b.status === 'active' || b.currentStage === 'store' || b.status === 'completed');
    } else if (scope === 'store') {
      return batches.filter(b => b.currentStage === 'store' || b.status === 'completed');
    } else {
      return batches.filter(b => b.currentStage === scope && b.status === 'active');
    }
  }

  // ── Compute Audit Stats for Active Session (High Performance) ──
  function getSessionMetrics(session) {
    if (!session) return { expectedBatches: 0, expectedQty: 0, verifiedBatches: 0, verifiedQty: 0, exactMatches: 0, varianceBatches: 0, stageMismatches: 0, missingBatches: 0, missingQty: 0, netVarianceQty: 0, netVarianceValue: 0, pctComplete: 0 };

    // 1. Index StageRecords by batchId once to avoid millions of O(N*M) lookups
    const allStageRecs = DB.StageRecords.all();
    const stageRecsMap = {};
    for (let i = 0; i < allStageRecs.length; i++) {
      const r = allStageRecs[i];
      if (r.batchId) {
        if (!stageRecsMap[r.batchId]) stageRecsMap[r.batchId] = [];
        stageRecsMap[r.batchId].push(r);
      }
    }

    const expectedBatches = getSessionExpectedBatches(session);
    let expectedQty = 0;
    for (let i = 0; i < expectedBatches.length; i++) {
      expectedQty += getBatchExpectedQty(expectedBatches[i], stageRecsMap);
    }

    const records = DB.AuditRecords.bySession(session.id);
    const verifiedBatchIds = new Set(records.map(r => r.batchId).filter(Boolean));
    const verifiedBatchNos = new Set(records.map(r => (r.batchNo || '').trim().toLowerCase()));

    const verifiedBatches = records.length;
    let verifiedQty = 0;
    let exactMatches = 0;
    let varianceBatches = 0;
    let stageMismatches = 0;
    let netVarianceQty = 0;
    let netVarianceValue = 0;

    const masterMap = {};
    DB.Master.all().forEach(m => { masterMap[m.jmrefNo] = m; });

    records.forEach(r => {
      verifiedQty += Number(r.countedQty || 0);
      const diff = Number(r.varianceQty || 0);
      netVarianceQty += diff;
      const part = masterMap[r.jmrefNo] || {};
      const unitPrice = Number(part.salePrice || part.standardCost || 0);
      netVarianceValue += (diff * unitPrice);

      if (r.verificationStatus === 'verified_match') exactMatches++;
      else if (r.verificationStatus === 'verified_variance') varianceBatches++;
      else if (r.verificationStatus === 'stage_mismatch') stageMismatches++;
    });

    const missingList = expectedBatches.filter(b => !verifiedBatchIds.has(b.id) && !verifiedBatchNos.has((b.batchNo || '').trim().toLowerCase()));
    const missingBatches = missingList.length;
    let missingQty = 0;
    for (let i = 0; i < missingList.length; i++) {
      missingQty += getBatchExpectedQty(missingList[i], stageRecsMap);
    }

    const totalTarget = expectedBatches.length || 1;
    const pctComplete = Math.min(100, Math.round((verifiedBatches / totalTarget) * 100));

    return {
      expectedBatches: expectedBatches.length,
      expectedQty,
      verifiedBatches,
      verifiedQty,
      exactMatches,
      varianceBatches,
      stageMismatches,
      missingBatches,
      missingQty,
      netVarianceQty,
      netVarianceValue,
      pctComplete,
      missingList
    };
  }

  // ── Main Render ────────────────────────────────────────────
  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const session = getActiveSession();
    const allSessions = DB.AuditSessions.all().sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    const metrics = getSessionMetrics(session);

    el.innerHTML = `
      <div class="animate-in" style="display:flex; flex-direction:column; gap:20px;">
        
        <!-- Header & Session Selector Toolbar -->
        <div class="card" style="padding:16px 20px;">
          <div class="flex items-center justify-between" style="flex-wrap:wrap; gap:16px;">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="font-bold" style="font-size:20px; color:var(--text-main); margin:0;">📋 Monthly Physical Stock Taking &amp; Audit</h2>
                ${session ? `<span class="badge ${session.status === 'in_progress' ? 'badge-green' : 'badge-gray'}">${session.status === 'in_progress' ? '🟢 Active Session' : '🔒 Closed / Finalized'}</span>` : ''}
              </div>
              <p class="text-sm text-muted mt-1" style="margin:0;">Barcode-driven physical stock count, stage verification, discrepancy logging &amp; reconciliation reports.</p>
            </div>

            <div class="flex items-center gap-2" style="flex-wrap:wrap;">
              <div class="form-group mb-0" style="min-width:240px;">
                <select id="audit-session-select" class="form-control" onchange="StockAuditModule.switchSession(this.value)">
                  ${allSessions.length === 0 ? '<option value="">No Audit Sessions Found</option>' : ''}
                  ${allSessions.map(s => `
                    <option value="${s.id}" ${session && session.id === s.id ? 'selected' : ''}>
                      ${s.status === 'in_progress' ? '🟢' : '🔒'} ${s.title || 'Audit ' + s.id} (${s.stageScope === 'all' ? 'All Stages' : (STAGE_LABELS[s.stageScope] || s.stageScope)})
                    </option>
                  `).join('')}
                </select>
              </div>
              
              <button class="btn btn-primary btn-sm" onclick="StockAuditModule.openNewSessionModal()">
                ➕ New Audit Session
              </button>
              
              ${session && session.status === 'in_progress' ? `
                <button class="btn btn-danger btn-sm" onclick="StockAuditModule.finalizeSession('${session.id}')">
                  🏁 Close &amp; Finalize Audit
                </button>
              ` : ''}

              ${session ? `
                <button class="btn btn-teal btn-sm" onclick="StockAuditModule.exportAuditExcel('${session.id}')">
                  📊 Export Report (Excel)
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Session Progress Bar & Details -->
          ${session ? `
            <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border);">
              <div class="flex items-center justify-between text-xs text-muted mb-1">
                <span><strong>Scope:</strong> ${session.stageScope === 'all' ? '🏢 Full Factory & Store' : '🏭 ' + (STAGE_LABELS[session.stageScope] || session.stageScope)} | <strong>Auditor:</strong> ${session.auditorName || '—'} | <strong>Started:</strong> ${formatDate(session.startedAt)}</span>
                <span class="font-bold text-blue">${metrics.verifiedBatches} of ${metrics.expectedBatches} Batches Verified (${metrics.pctComplete}%)</span>
              </div>
              <div style="width:100%; height:8px; background:var(--border); border-radius:4px; overflow:hidden;">
                <div style="width:${metrics.pctComplete}%; height:100%; background:linear-gradient(90deg, var(--accent-blue), #10b981); border-radius:4px; transition:width 0.3s;"></div>
              </div>
            </div>
          ` : ''}
        </div>

        ${!session ? `
          <div class="empty-state card" style="padding:48px 24px; text-align:center;">
            <div class="empty-icon" style="font-size:48px; margin-bottom:12px;">📋</div>
            <h3 class="font-bold" style="font-size:18px; color:var(--text-main);">No Stock Audit Session Active</h3>
            <p class="text-muted text-sm" style="max-width:480px; margin:8px auto 20px;">Start a new monthly stock taking session to scan batch barcodes, record physical counted quantities, and detect stage or count discrepancies.</p>
            <button class="btn btn-primary" onclick="StockAuditModule.openNewSessionModal()">🚀 Start Monthly Stock Taking Session</button>
          </div>
        ` : `
          <!-- KPI Summary Cards -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
            <div class="card" style="padding:14px 18px; border-left:4px solid var(--accent-blue);">
              <div class="text-xs text-muted font-bold">TOTAL EXPECTED (BOOK)</div>
              <div class="font-bold text-blue mt-1" style="font-size:22px;">${formatNum(metrics.expectedBatches)} <span class="text-xs text-muted font-normal">batches</span></div>
              <div class="text-xs text-muted mt-1">${formatNum(metrics.expectedQty)} total pcs</div>
            </div>

            <div class="card" style="padding:14px 18px; border-left:4px solid #10b981;">
              <div class="text-xs text-muted font-bold">VERIFIED ON FLOOR</div>
              <div class="font-bold text-success mt-1" style="font-size:22px;">${formatNum(metrics.verifiedBatches)} <span class="text-xs text-muted font-normal">batches</span></div>
              <div class="text-xs text-muted mt-1">${formatNum(metrics.verifiedQty)} pcs counted (${metrics.pctComplete}%)</div>
            </div>

            <div class="card" style="padding:14px 18px; border-left:4px solid #f59e0b;">
              <div class="text-xs text-muted font-bold">COUNT VARIANCES</div>
              <div class="font-bold text-amber mt-1" style="font-size:22px;">${formatNum(metrics.varianceBatches)} <span class="text-xs text-muted font-normal">batches</span></div>
              <div class="text-xs ${metrics.netVarianceQty < 0 ? 'text-danger' : 'text-success'} mt-1 font-semibold">
                ${metrics.netVarianceQty >= 0 ? '+' : ''}${formatNum(metrics.netVarianceQty)} pcs (${metrics.netVarianceValue >= 0 ? '+' : ''}₹${formatNum(Math.round(metrics.netVarianceValue))})
              </div>
            </div>

            <div class="card" style="padding:14px 18px; border-left:4px solid #8b5cf6;">
              <div class="text-xs text-muted font-bold">STAGE MISMATCHES</div>
              <div class="font-bold text-purple mt-1" style="font-size:22px;">${formatNum(metrics.stageMismatches)} <span class="text-xs text-muted font-normal">batches</span></div>
              <div class="text-xs text-muted mt-1">Found in different stage</div>
            </div>

            <div class="card" style="padding:14px 18px; border-left:4px solid #ef4444;">
              <div class="text-xs text-muted font-bold">MISSING / UNSCANNED</div>
              <div class="font-bold text-danger mt-1" style="font-size:22px;">${formatNum(metrics.missingBatches)} <span class="text-xs text-muted font-normal">batches</span></div>
              <div class="text-xs text-danger mt-1 font-semibold">${formatNum(metrics.missingQty)} pcs unverified</div>
            </div>
          </div>

          <!-- Main Tab Navigation -->
          <div class="card" style="padding:0; overflow:hidden;">
            <div style="display:flex; border-bottom:1px solid var(--border); background:rgba(0,0,0,0.02); overflow-x:auto;">
              <button class="btn btn-ghost" style="border-radius:0; padding:12px 20px; font-weight:600; border-bottom:3px solid ${activeTab === 'scanner' ? 'var(--accent-blue)' : 'transparent'}; color:${activeTab === 'scanner' ? 'var(--accent-blue)' : 'var(--text-muted)'};" onclick="StockAuditModule.switchTab('scanner')">
                📷 Barcode Scan &amp; Count
              </button>
              <button class="btn btn-ghost" style="border-radius:0; padding:12px 20px; font-weight:600; border-bottom:3px solid ${activeTab === 'verified' ? 'var(--accent-blue)' : 'transparent'}; color:${activeTab === 'verified' ? 'var(--accent-blue)' : 'var(--text-muted)'};" onclick="StockAuditModule.switchTab('verified')">
                ✅ Verified Batches (${metrics.verifiedBatches})
              </button>
              <button class="btn btn-ghost" style="border-radius:0; padding:12px 20px; font-weight:600; border-bottom:3px solid ${activeTab === 'missing' ? 'var(--accent-blue)' : 'transparent'}; color:${activeTab === 'missing' ? 'var(--accent-blue)' : 'var(--text-muted)'};" onclick="StockAuditModule.switchTab('missing')">
                ❌ Missing / Unscanned (${metrics.missingBatches})
              </button>
              <button class="btn btn-ghost" style="border-radius:0; padding:12px 20px; font-weight:600; border-bottom:3px solid ${activeTab === 'sessions' ? 'var(--accent-blue)' : 'transparent'}; color:${activeTab === 'sessions' ? 'var(--accent-blue)' : 'var(--text-muted)'};" onclick="StockAuditModule.switchTab('sessions')">
                📁 Session History (${allSessions.length})
              </button>
            </div>

            <div style="padding:20px;">
              ${renderTabContent(session, metrics)}
            </div>
          </div>
        `}
      </div>

      <!-- New Session Modal -->
      ${renderNewSessionModal()}
      
      <!-- Verification Modal -->
      ${renderVerificationModal()}
    `;

    // Focus barcode input if on scanner tab
    if (activeTab === 'scanner') {
      setTimeout(() => {
        const inp = document.getElementById('audit-barcode-input');
        if (inp) inp.focus();
      }, 100);
    }
  }

  // ── Render Active Tab Content ──────────────────────────────
  function renderTabContent(session, metrics) {
    if (activeTab === 'scanner') {
      return renderScannerTab(session);
    } else if (activeTab === 'verified') {
      return renderVerifiedTab(session);
    } else if (activeTab === 'missing') {
      return renderMissingTab(session, metrics);
    } else if (activeTab === 'sessions') {
      return renderSessionsTab();
    }
    return '';
  }

  // ── Tab 1: Scanner Interface ───────────────────────────────
  function renderScannerTab(session) {
    const records = DB.AuditRecords.bySession(session.id).sort((a, b) => (b.scannedAt || '').localeCompare(a.scannedAt || ''));
    const recentScans = records.slice(0, 8);

    return `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:24px; align-items:start;">
        
        <!-- Left: Rapid Scan Input Box -->
        <div style="background:var(--bg-input); padding:20px; border-radius:12px; border:2px dashed var(--border);">
          <div class="flex items-center justify-between mb-3">
            <label class="form-label font-bold" style="font-size:14px; color:var(--text-main); margin:0;">
              🔍 Scan Batch Barcode / QR Code
            </label>
            <span class="badge badge-blue">Ready for Scanner</span>
          </div>

          <div class="flex gap-2 mb-3">
            <input type="text" id="audit-barcode-input" class="form-control" placeholder="Scan or type Batch No (e.g. 7031-1708262-11)..." autocomplete="off" onkeydown="if(event.key==='Enter') StockAuditModule.handleScanSubmit(this.value)">
            <button class="btn btn-primary" onclick="StockAuditModule.handleScanSubmit(document.getElementById('audit-barcode-input').value)">
              Verify
            </button>
            <button class="btn btn-secondary" onclick="StockAuditModule.openCameraScanner()" title="Open Mobile Camera Scanner">
              📷 Camera
            </button>
          </div>

          <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; margin-top:12px; padding:10px 12px; background:var(--card-bg); border-radius:8px; border:1px solid var(--border); flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="audit-rapid-scan-toggle" ${rapidScanMode ? 'checked' : ''} onchange="StockAuditModule.toggleRapidScan(this.checked)" style="width:16px; height:16px; cursor:pointer;">
              <label for="audit-rapid-scan-toggle" class="font-bold text-xs" style="color:var(--text-main); cursor:pointer;">
                ⚡ Rapid Scan (Auto-Verify Exact Matches)
              </label>
            </div>

            <div style="display:flex; align-items:center; gap:6px;">
              <span class="text-xs font-semibold text-muted">📌 Sticky Rack:</span>
              <input type="text" id="audit-pinned-rack-input" class="form-control form-control-sm" placeholder="e.g. Rack A-02" value="${pinnedRackLocation}" style="width:120px; font-weight:600;" oninput="StockAuditModule.updatePinnedRack(this.value)">
            </div>
          </div>

          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px; font-size:12px; color:var(--text-muted);">
            <div>💡 <strong>Auditing Stage:</strong> 
              <select id="audit-floor-stage-lock" class="form-control form-control-sm" style="display:inline-block; width:auto; margin-left:4px;">
                <option value="auto">⚡ Auto-detect registered stage</option>
                <option value="store">Store</option>
                <option value="waiting-visual">Waiting for Visual</option>
                <option value="visual">Visual Inspection</option>
                <option value="gauge">Gauge Inspection</option>
                <option value="quality">Quality Final</option>
                <option value="production">Production / Moulding</option>
                <option value="cryogenic">Cryogenic</option>
                <option value="deflashing">Flash Removal</option>
                <option value="trimming">Trimming</option>
                <option value="post-curing">Post Curing</option>
              </select>
            </div>
          </div>

          <!-- Last Scanned Batch Card Preview -->
          <div id="audit-last-scan-container" style="margin-top:20px;">
            ${renderLastScannedCard()}
          </div>
        </div>

        <!-- Right: Recent Scans Stream -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold" style="font-size:14px; color:var(--text-main); margin:0;">
              🕒 Recent Scans Stream (This Session)
            </h4>
            <span class="text-xs text-muted">${records.length} Total Verified</span>
          </div>

          ${recentScans.length === 0 ? `
            <div class="empty-state" style="padding:28px; background:var(--card-bg); border:1px solid var(--border); border-radius:8px;">
              <p class="text-sm text-muted">No batches scanned yet in this session. Scan a barcode above to begin verification.</p>
            </div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${recentScans.map(r => {
                let badgeCls = 'badge-green';
                let statusText = 'Exact Match';
                if (r.verificationStatus === 'verified_variance') {
                  badgeCls = 'badge-amber';
                  statusText = `${r.varianceQty >= 0 ? '+' : ''}${r.varianceQty} Variance`;
                } else if (r.verificationStatus === 'stage_mismatch') {
                  badgeCls = 'badge-purple';
                  statusText = 'Stage Mismatch';
                }

                return `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; font-size:13px;">
                    <div>
                      <div class="font-semibold text-blue">${r.batchNo}</div>
                      <div class="text-xs text-muted">JMREF ${r.jmrefNo || '—'} | ${STAGE_LABELS[r.scannedStage] || r.scannedStage || '—'} ${r.rackLocation ? `(${r.rackLocation})` : ''}</div>
                    </div>
                    <div style="text-align:right;">
                      <div><strong>${formatNum(r.countedQty)}</strong> pcs <span class="badge ${badgeCls}" style="font-size:10px;">${statusText}</span></div>
                      <div class="text-xs text-muted">${formatDate(r.scannedAt)} by ${r.scannedBy || 'Auditor'}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

      </div>
    `;
  }

  function renderLastScannedCard() {
    if (!lastScannedBatch) {
      return `
        <div style="padding:16px; background:var(--card-bg); border-radius:8px; border:1px solid var(--border); text-align:center; color:var(--text-muted); font-size:12.5px;">
          Ready to scan. Point your barcode reader at the batch label or type the batch number.
        </div>
      `;
    }

    const b = lastScannedBatch.batch;
    const rec = lastScannedBatch.record;
    let statusBadge = '<span class="badge badge-green">Exact Match</span>';
    if (rec.verificationStatus === 'verified_variance') {
      statusBadge = `<span class="badge badge-amber font-bold">${rec.varianceQty >= 0 ? '+' : ''}${rec.varianceQty} pcs Variance</span>`;
    } else if (rec.verificationStatus === 'stage_mismatch') {
      statusBadge = '<span class="badge badge-purple font-bold">Stage Mismatch</span>';
    }

    return `
      <div style="padding:14px 16px; background:rgba(37,99,235,0.06); border-radius:8px; border:1px solid var(--accent-blue);">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-blue">✅ LAST VERIFIED BATCH</span>
          ${statusBadge}
        </div>
        <div class="font-bold" style="font-size:15px; color:var(--primary);">${b.batchNo}</div>
        <div class="text-xs text-muted mt-1">Part No: <strong>${b.partNo || '—'}</strong> | JMREF: <strong>${b.jmrefNo || '—'}</strong></div>
        <div class="flex items-center justify-between mt-2 pt-2" style="border-top:1px dashed var(--border); font-size:12.5px;">
          <span>Expected: <strong>${formatNum(rec.expectedQty)}</strong> pcs (${STAGE_LABELS[rec.expectedStage] || rec.expectedStage})</span>
          <span>Counted: <strong class="text-success">${formatNum(rec.countedQty)}</strong> pcs (${STAGE_LABELS[rec.scannedStage] || rec.scannedStage})</span>
        </div>
      </div>
    `;
  }

  // ── Tab 2: Verified Batches Table ──────────────────────────
  function renderVerifiedTab(session) {
    let records = DB.AuditRecords.bySession(session.id);

    if (verifiedSearch) {
      const q = verifiedSearch.toLowerCase();
      records = records.filter(r => 
        (r.batchNo || '').toLowerCase().includes(q) ||
        (r.jmrefNo || '').toLowerCase().includes(q) ||
        (r.partNo || '').toLowerCase().includes(q) ||
        (r.rackLocation || '').toLowerCase().includes(q)
      );
    }

    if (verifiedStatusFilter) {
      records = records.filter(r => r.verificationStatus === verifiedStatusFilter);
    }

    records.sort((a, b) => (b.scannedAt || '').localeCompare(a.scannedAt || ''));

    const totalCounted = records.reduce((s, r) => s + (Number(r.countedQty) || 0), 0);
    const totalExpected = records.reduce((s, r) => s + (Number(r.expectedQty) || 0), 0);
    const totalVariance = records.reduce((s, r) => s + (Number(r.varianceQty) || 0), 0);

    const totalItems = records.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (verifiedCurrentPage > totalPages) verifiedCurrentPage = totalPages;
    if (verifiedCurrentPage < 1) verifiedCurrentPage = 1;

    const startIdx = (verifiedCurrentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = records.slice(startIdx, endIdx);

    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="StockAuditModule.changePageVerified(${verifiedCurrentPage - 1})" ${verifiedCurrentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${verifiedCurrentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="StockAuditModule.changePageVerified(${verifiedCurrentPage + 1})" ${verifiedCurrentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>
      `;
    }

    return `
      <div>
        <div class="flex items-center justify-between gap-3 mb-4" style="flex-wrap:wrap;">
          <div class="flex items-center gap-2" style="flex-wrap:wrap; flex:1;">
            <input type="text" id="audit-verified-search" class="form-control form-control-sm" style="max-width:280px;" placeholder="Search Batch / JMREF / Part / Rack..." value="${verifiedSearch}" oninput="StockAuditModule.filterVerifiedSearch(this.value)">
            
            <select class="form-control form-control-sm" style="max-width:200px;" onchange="StockAuditModule.filterVerifiedStatus(this.value)">
              <option value="">All Verification Statuses</option>
              <option value="verified_match" ${verifiedStatusFilter === 'verified_match' ? 'selected' : ''}>Exact Match (0 Variance)</option>
              <option value="verified_variance" ${verifiedStatusFilter === 'verified_variance' ? 'selected' : ''}>Quantity Variance</option>
              <option value="stage_mismatch" ${verifiedStatusFilter === 'stage_mismatch' ? 'selected' : ''}>Stage Mismatch</option>
            </select>
          </div>

          <div class="text-xs text-muted">
            Showing <strong>${startIdx + 1}</strong> - <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> verified batch entries
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Batch No</th>
                <th>JMREF</th>
                <th>Part No</th>
                <th>System Stage</th>
                <th>Physical Stage</th>
                <th>Expected Qty</th>
                <th>Counted Qty</th>
                <th>Variance (Pcs)</th>
                <th>Location / Rack</th>
                <th>Status</th>
                <th>Auditor</th>
                <th>Timestamp</th>
                <th class="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${pageItems.length === 0 ? `
                <tr><td colspan="14" style="text-align:center; padding:24px; color:var(--text-muted);">No verified records found matching the filter.</td></tr>
              ` : pageItems.map((r, i) => {
                let badgeCls = 'badge-green';
                let statusLabel = 'Exact Match';
                if (r.verificationStatus === 'verified_variance') {
                  badgeCls = 'badge-amber';
                  statusLabel = 'Qty Variance';
                } else if (r.verificationStatus === 'stage_mismatch') {
                  badgeCls = 'badge-purple';
                  statusLabel = 'Stage Mismatch';
                }

                const diff = Number(r.varianceQty || 0);

                return `
                  <tr>
                    <td>${startIdx + i + 1}</td>
                    <td class="font-semibold text-blue">${r.batchNo}</td>
                    <td><span class="badge badge-teal">${r.jmrefNo || '—'}</span></td>
                    <td>${r.partNo || '—'}</td>
                    <td>${STAGE_LABELS[r.expectedStage] || r.expectedStage || '—'}</td>
                    <td class="${r.expectedStage !== r.scannedStage ? 'font-bold text-purple' : ''}">${STAGE_LABELS[r.scannedStage] || r.scannedStage || '—'}</td>
                    <td>${formatNum(r.expectedQty)}</td>
                    <td class="font-bold text-success">${formatNum(r.countedQty)}</td>
                    <td class="${diff < 0 ? 'text-danger font-bold' : (diff > 0 ? 'text-warning font-bold' : 'text-muted')}">
                      ${diff > 0 ? '+' : ''}${formatNum(diff)}
                    </td>
                    <td>${r.rackLocation ? `<span class="badge badge-gray">${r.rackLocation}</span>` : '—'}</td>
                    <td><span class="badge ${badgeCls}">${statusLabel}</span></td>
                    <td class="text-xs text-muted">${r.scannedBy || '—'}</td>
                    <td class="text-xs text-muted">${formatDate(r.scannedAt)}</td>
                    <td class="no-print">
                      <button class="btn btn-ghost btn-xs text-danger" onclick="StockAuditModule.deleteRecord('${r.id}')" title="Delete Verification">🗑️</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            ${records.length > 0 ? `
              <tfoot>
                <tr class="font-bold" style="background:rgba(0,0,0,0.03);">
                  <td colspan="6" style="text-align:right;">TOTALS:</td>
                  <td>${formatNum(totalExpected)}</td>
                  <td class="text-success">${formatNum(totalCounted)}</td>
                  <td class="${totalVariance < 0 ? 'text-danger' : (totalVariance > 0 ? 'text-warning' : 'text-muted')}">${totalVariance > 0 ? '+' : ''}${formatNum(totalVariance)}</td>
                  <td colspan="5"></td>
                </tr>
              </tfoot>
            ` : ''}
          </table>
        </div>
        ${paginationHtml}
      </div>
    `;
  }

  // ── Tab 3: Missing / Unscanned Batches ──────────────────────
  function renderMissingTab(session, metrics) {
    let missingList = metrics.missingList || [];

    if (missingSearch) {
      const q = missingSearch.toLowerCase();
      missingList = missingList.filter(b => 
        (b.batchNo || '').toLowerCase().includes(q) ||
        (b.jmrefNo || '').toLowerCase().includes(q) ||
        (b.partNo || '').toLowerCase().includes(q)
      );
    }

    if (missingStageFilter) {
      missingList = missingList.filter(b => b.currentStage === missingStageFilter);
    }

    const masterMap = {};
    DB.Master.all().forEach(m => { masterMap[m.jmrefNo] = m; });

    const totalMissingPieces = missingList.reduce((s, b) => s + getBatchExpectedQty(b), 0);
    const totalMissingValue = missingList.reduce((s, b) => {
      const qty = getBatchExpectedQty(b);
      const part = masterMap[b.jmrefNo] || {};
      const unitPrice = Number(part.salePrice || part.standardCost || 0);
      return s + (qty * unitPrice);
    }, 0);

    const totalItems = missingList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (missingCurrentPage > totalPages) missingCurrentPage = totalPages;
    if (missingCurrentPage < 1) missingCurrentPage = 1;

    const startIdx = (missingCurrentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = missingList.slice(startIdx, endIdx);

    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `
        <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover);">
          <div class="text-sm text-muted">
            Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-xs" onclick="StockAuditModule.changePageMissing(${missingCurrentPage - 1})" ${missingCurrentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
            <span class="text-sm font-semibold flex items-center px-2">Page ${missingCurrentPage} of ${totalPages}</span>
            <button class="btn btn-secondary btn-xs" onclick="StockAuditModule.changePageMissing(${missingCurrentPage + 1})" ${missingCurrentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
          </div>
        </div>
      `;
    }

    return `
      <div>
        <div class="flex items-center justify-between gap-3 mb-4" style="flex-wrap:wrap;">
          <div class="flex items-center gap-2" style="flex-wrap:wrap; flex:1;">
            <input type="text" id="audit-missing-search" class="form-control form-control-sm" style="max-width:280px;" placeholder="Search Missing Batch / JMREF / Part..." value="${missingSearch}" oninput="StockAuditModule.filterMissingSearch(this.value)">
            
            <select class="form-control form-control-sm" style="max-width:200px;" onchange="StockAuditModule.filterMissingStage(this.value)">
              <option value="">All Registered Stages</option>
              <option value="store" ${missingStageFilter === 'store' ? 'selected' : ''}>Store</option>
              <option value="waiting-visual" ${missingStageFilter === 'waiting-visual' ? 'selected' : ''}>Waiting for Visual</option>
              <option value="visual" ${missingStageFilter === 'visual' ? 'selected' : ''}>Visual Inspection</option>
              <option value="gauge" ${missingStageFilter === 'gauge' ? 'selected' : ''}>Gauge Inspection</option>
              <option value="quality" ${missingStageFilter === 'quality' ? 'selected' : ''}>Quality Final</option>
              <option value="production" ${missingStageFilter === 'production' ? 'selected' : ''}>Production / Moulding</option>
              <option value="cryogenic" ${missingStageFilter === 'cryogenic' ? 'selected' : ''}>Cryogenic</option>
              <option value="deflashing" ${missingStageFilter === 'deflashing' ? 'selected' : ''}>Flash Removal</option>
              <option value="trimming" ${missingStageFilter === 'trimming' ? 'selected' : ''}>Trimming</option>
              <option value="post-curing" ${missingStageFilter === 'post-curing' ? 'selected' : ''}>Post Curing</option>
            </select>
          </div>

          <div class="text-xs text-danger font-semibold">
            🚨 ${totalItems} Missing Batches (${formatNum(totalMissingPieces)} pcs | ₹${formatNum(Math.round(totalMissingValue))} Est. Value)
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Batch No</th>
                <th>JMREF</th>
                <th>Part No</th>
                <th>Registered Stage</th>
                <th>Book Expected Qty</th>
                <th>Est. Unit Price</th>
                <th>Est. Financial Value</th>
                <th>Batch Created</th>
                <th class="no-print">Action</th>
              </tr>
            </thead>
            <tbody>
              ${pageItems.length === 0 ? `
                <tr><td colspan="10" style="text-align:center; padding:24px; color:var(--text-success); font-weight:600;">🎉 Great! All expected batches have been scanned and verified. Zero missing batches!</td></tr>
              ` : pageItems.map((b, i) => {
                const expQty = getBatchExpectedQty(b);
                const part = masterMap[b.jmrefNo] || {};
                const price = Number(part.salePrice || part.standardCost || 0);
                const val = expQty * price;

                return `
                  <tr>
                    <td>${startIdx + i + 1}</td>
                    <td class="font-semibold text-blue">${b.batchNo}</td>
                    <td><span class="badge badge-teal">${b.jmrefNo || '—'}</span></td>
                    <td>${b.partNo || '—'}</td>
                    <td><span class="badge badge-blue">${STAGE_LABELS[b.currentStage] || b.currentStage || '—'}</span></td>
                    <td class="font-bold text-danger">${formatNum(expQty)}</td>
                    <td>₹${formatNum(price.toFixed(2))}</td>
                    <td class="font-semibold text-danger">₹${formatNum(Math.round(val))}</td>
                    <td class="text-xs text-muted">${formatDate(b.productionDate || b.createdAt)}</td>
                    <td class="no-print">
                      <button class="btn btn-primary btn-xs" onclick="StockAuditModule.openVerificationModalForBatch('${b.id}')">
                        🔍 Verify Count
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            ${missingList.length > 0 ? `
              <tfoot>
                <tr class="font-bold text-danger" style="background:rgba(239,68,68,0.05);">
                  <td colspan="5" style="text-align:right;">TOTAL MISSING DEFICIT:</td>
                  <td>${formatNum(totalMissingPieces)}</td>
                  <td></td>
                  <td>₹${formatNum(Math.round(totalMissingValue))}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            ` : ''}
          </table>
        </div>
        ${paginationHtml}
      </div>
    `;
  }

  // ── Tab 4: Audit Sessions & History ────────────────────────
  function renderSessionsTab() {
    const allSessions = DB.AuditSessions.all().sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));

    return `
      <div>
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-bold" style="font-size:14px; color:var(--text-main); margin:0;">
            📁 Audit Session Archive &amp; Reconciliation History
          </h4>
          <button class="btn btn-primary btn-sm" onclick="StockAuditModule.openNewSessionModal()">
            ➕ Start New Audit Session
          </button>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Session Title</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Started Date</th>
                <th>Completed Date</th>
                <th>Auditor</th>
                <th>Verified Batches</th>
                <th>Variance Pcs</th>
                <th class="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${allSessions.length === 0 ? `
                <tr><td colspan="10" style="text-align:center; padding:24px; color:var(--text-muted);">No past audit sessions found.</td></tr>
              ` : allSessions.map((s, i) => {
                const recs = DB.AuditRecords.bySession(s.id);
                const totalVariance = recs.reduce((sum, r) => sum + (Number(r.varianceQty) || 0), 0);

                return `
                  <tr class="${currentSessionId === s.id ? 'bg-primary-light font-semibold' : ''}">
                    <td>${i + 1}</td>
                    <td class="font-bold text-blue">${s.title || s.id}</td>
                    <td>${s.stageScope === 'all' ? 'All Factory & Store' : (STAGE_LABELS[s.stageScope] || s.stageScope)}</td>
                    <td>
                      <span class="badge ${s.status === 'in_progress' ? 'badge-green' : 'badge-gray'}">
                        ${s.status === 'in_progress' ? '🟢 Active' : '🔒 Closed'}
                      </span>
                    </td>
                    <td class="text-xs text-muted">${formatDate(s.startedAt)}</td>
                    <td class="text-xs text-muted">${s.completedAt ? formatDate(s.completedAt) : '—'}</td>
                    <td>${s.auditorName || '—'}</td>
                    <td class="font-semibold text-success">${recs.length} batches</td>
                    <td class="${totalVariance < 0 ? 'text-danger font-bold' : (totalVariance > 0 ? 'text-warning font-bold' : 'text-muted')}">
                      ${totalVariance > 0 ? '+' : ''}${formatNum(totalVariance)}
                    </td>
                    <td class="no-print">
                      <div class="flex gap-1">
                        <button class="btn btn-secondary btn-xs" onclick="StockAuditModule.switchSession('${s.id}')">Select</button>
                        <button class="btn btn-teal btn-xs" onclick="StockAuditModule.exportAuditExcel('${s.id}')">📊 Excel</button>
                        ${s.status === 'completed' ? `
                          <button class="btn btn-ghost btn-xs" onclick="StockAuditModule.reopenSession('${s.id}')" title="Re-open Session">🔓</button>
                        ` : ''}
                        <button class="btn btn-ghost btn-xs text-danger" onclick="StockAuditModule.deleteSession('${s.id}')" title="Delete Session">🗑️</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── Modals: New Session ────────────────────────────────────
  function renderNewSessionModal() {
    return `
      <div class="modal-overlay hidden" id="modal-audit-new-session">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>➕ Start New Monthly Stock Taking Session</h3>
            <button class="modal-close" onclick="StockAuditModule.closeModal('modal-audit-new-session')">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Audit Session Title <span class="required">*</span></label>
              <input type="text" id="new-audit-title" class="form-control" placeholder="e.g. August 2026 Monthly Stock Audit" value="${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Monthly Stock Audit">
            </div>

            <div class="form-group">
              <label class="form-label">Audit Stage Scope <span class="required">*</span></label>
              <select id="new-audit-scope" class="form-control">
                <option value="all">🏢 All Factory Stages &amp; Finished Goods Store (Full Factory Audit)</option>
                <option value="store">🏪 Store / Finished Goods Only</option>
                <option value="waiting-visual">⏳ Waiting for Visual Inspection Only</option>
                <option value="visual">👁️ Visual Inspection Department Only</option>
                <option value="gauge">📏 Gauge Inspection Only</option>
                <option value="quality">⭐ Quality Final QC Only</option>
                <option value="production">🏭 Moulding / Production Stage Only</option>
                <option value="cryogenic">❄️ Cryogenic Deflashing Only</option>
                <option value="deflashing">🔧 Manual DE Flashing Only</option>
                <option value="trimming">✂️ Trimming Stage Only</option>
                <option value="post-curing">🔥 Post Curing Only</option>
              </select>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Lead Auditor Name <span class="required">*</span></label>
                <input type="text" id="new-audit-auditor" class="form-control" placeholder="Auditor Name" value="${(Auth.getSession() || {}).name || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Audit Start Date</label>
                <input type="date" id="new-audit-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Audit Objective / Notes</label>
              <textarea id="new-audit-notes" class="form-control" rows="2" placeholder="e.g. Monthly physical inventory verification for reconciliation and variance reporting"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="StockAuditModule.closeModal('modal-audit-new-session')">Cancel</button>
            <button class="btn btn-primary" onclick="StockAuditModule.submitNewSession()">🚀 Create &amp; Start Audit</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Modals: Batch Verification Confirmation ────────────────
  function renderVerificationModal() {
    return `
      <div class="modal-overlay hidden" id="modal-audit-verify">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>🔍 Verify Physical Batch Stock</h3>
            <button class="modal-close" onclick="StockAuditModule.closeModal('modal-audit-verify')">✕</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="v-batch-id">
            <input type="hidden" id="v-batch-no">
            <input type="hidden" id="v-jmref">
            <input type="hidden" id="v-partno">
            <input type="hidden" id="v-expected-qty">
            <input type="hidden" id="v-expected-stage">

            <!-- Batch Summary Banner -->
            <div id="v-batch-banner" style="padding:14px 16px; background:var(--bg-input); border-radius:8px; margin-bottom:16px; border:1px solid var(--border);">
              <!-- Injected dynamically -->
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Physical Stage Scanned At <span class="required">*</span></label>
                <select id="v-physical-stage" class="form-control" onchange="StockAuditModule.checkStageMismatch()">
                  <option value="store">Store</option>
                  <option value="waiting-visual">Waiting for Visual</option>
                  <option value="visual">Visual Inspection</option>
                  <option value="gauge">Gauge Inspection</option>
                  <option value="quality">Quality Final</option>
                  <option value="production">Production / Moulding</option>
                  <option value="cryogenic">Cryogenic</option>
                  <option value="deflashing">Flash Removal</option>
                  <option value="trimming">Trimming</option>
                  <option value="post-curing">Post Curing</option>
                </select>
                <div id="v-stage-mismatch-alert" class="text-xs text-purple font-bold mt-1 hidden">
                  ⚠️ Note: Stage differs from registered system location!
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Physical Counted Quantity <span class="required">*</span></label>
                <input type="number" id="v-counted-qty" class="form-control font-bold" min="0" oninput="StockAuditModule.calcVariancePreview()">
                <div id="v-variance-preview" class="text-xs mt-1 font-semibold">
                  <!-- Injected dynamically -->
                </div>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Bin / Rack Location</label>
                <input type="text" id="v-rack-location" class="form-control" placeholder="e.g. Rack A-02 / Bin 14">
              </div>
              <div class="form-group">
                <label class="form-label">Auditor Name</label>
                <input type="text" id="v-auditor-name" class="form-control" value="${(Auth.getSession() || {}).name || ''}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Audit Notes / Discrepancy Reason (Optional)</label>
              <input type="text" id="v-audit-notes" class="form-control" placeholder="e.g. Shortage of 10 pcs due to damage, relocated to visual">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="StockAuditModule.closeModal('modal-audit-verify')">Cancel</button>
            <button class="btn btn-primary" onclick="StockAuditModule.saveBatchVerification()">💾 Save Verification</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Scan Processing Engine ─────────────────────────────────
  function handleScanSubmit(rawVal) {
    const query = String(rawVal || '').trim();
    if (!query) {
      showToast('Please enter or scan a batch barcode', 'warning');
      return;
    }

    const session = getActiveSession();
    if (!session) {
      showToast('Please start or select an active audit session first', 'warning');
      return;
    }

    // Clear input box
    const inp = document.getElementById('audit-barcode-input');
    if (inp) {
      inp.value = '';
      inp.focus();
    }

    // Find batch in system
    const batches = DB.Batches.all();
    let matchedBatch = batches.find(b => (b.batchNo || '').trim().toLowerCase() === query.toLowerCase());

    if (!matchedBatch) {
      // Partial search fallback
      matchedBatch = batches.find(b => (b.batchNo || '').toLowerCase().includes(query.toLowerCase()));
    }

    if (!matchedBatch) {
      playAudioTone('error');
      showToast(`Batch barcode "${query}" not found in system!`, 'error');
      return;
    }

    // Check if user locked floor stage
    const floorStageLock = document.getElementById('audit-floor-stage-lock')?.value;
    const defaultScannedStage = (floorStageLock && floorStageLock !== 'auto') ? floorStageLock : (matchedBatch.currentStage || 'store');
    const expectedStage = matchedBatch.currentStage || 'store';
    const expectedQty = getBatchExpectedQty(matchedBatch);
    const rackLoc = (document.getElementById('audit-pinned-rack-input')?.value || pinnedRackLocation || matchedBatch.rackLocation || '').trim();

    // ⚡ RAPID SCAN MODE: Auto-Verify Exact Matches without popup modal
    if (rapidScanMode && defaultScannedStage === expectedStage) {
      const existingRec = DB.AuditRecords.bySession(session.id).find(r => r.batchId === matchedBatch.id);
      const auditorName = (Auth.getSession() || {}).name || 'Auditor';

      let recordObj = null;
      if (existingRec) {
        recordObj = {
          ...existingRec,
          scannedStage: defaultScannedStage,
          expectedStage,
          expectedQty,
          countedQty: expectedQty,
          varianceQty: 0,
          verificationStatus: 'verified_match',
          rackLocation: rackLoc,
          scannedBy: auditorName,
          scannedAt: new Date().toISOString()
        };
        DB.AuditRecords.update(existingRec.id, recordObj);
      } else {
        recordObj = {
          sessionId: session.id,
          batchId: matchedBatch.id,
          batchNo: matchedBatch.batchNo,
          jmrefNo: matchedBatch.jmrefNo,
          partNo: matchedBatch.partNo,
          expectedStage,
          scannedStage: defaultScannedStage,
          expectedQty,
          countedQty: expectedQty,
          varianceQty: 0,
          verificationStatus: 'verified_match',
          rackLocation: rackLoc,
          scannedBy: auditorName,
          scannedAt: new Date().toISOString()
        };
        DB.AuditRecords.insert(recordObj);
      }

      playAudioTone('success');
      showToast(`⚡ Rapid Verified: ${matchedBatch.batchNo} (Exact Match — ${formatNum(expectedQty)} pcs)`, 'success');

      lastScannedBatch = {
        batch: matchedBatch,
        record: recordObj
      };

      render();
      return;
    }

    openVerificationModalForBatch(matchedBatch.id, defaultScannedStage);
  }

  function openCameraScanner() {
    if (typeof Scanner === 'undefined' || !Scanner.start) {
      showToast('Camera barcode scanner module not loaded', 'error');
      return;
    }
    Scanner.start('audit-barcode-input', (scannedCode) => {
      handleScanSubmit(scannedCode);
    });
  }

  function openVerificationModalForBatch(batchId, forcedScannedStage) {
    const batch = DB.Batches.find(batchId);
    if (!batch) return;

    const session = getActiveSession();
    if (!session) return;

    const expectedQty = getBatchExpectedQty(batch);
    const expectedStage = batch.currentStage || 'store';
    const scannedStage = forcedScannedStage || expectedStage;

    // Check if already verified in this session
    const existingRec = DB.AuditRecords.bySession(session.id).find(r => r.batchId === batch.id);

    document.getElementById('v-batch-id').value = batch.id;
    document.getElementById('v-batch-no').value = batch.batchNo;
    document.getElementById('v-jmref').value = batch.jmrefNo || '';
    document.getElementById('v-partno').value = batch.partNo || '';
    document.getElementById('v-expected-qty').value = expectedQty;
    document.getElementById('v-expected-stage').value = expectedStage;

    const physicalStageSelect = document.getElementById('v-physical-stage');
    if (physicalStageSelect) physicalStageSelect.value = scannedStage;

    const countedQtyInput = document.getElementById('v-counted-qty');
    if (countedQtyInput) {
      countedQtyInput.value = existingRec ? existingRec.countedQty : expectedQty;
    }

    const rackInput = document.getElementById('v-rack-location');
    if (rackInput) {
      rackInput.value = existingRec ? (existingRec.rackLocation || '') : (pinnedRackLocation || batch.rackLocation || '');
    }

    const notesInput = document.getElementById('v-audit-notes');
    if (notesInput) {
      notesInput.value = existingRec ? (existingRec.notes || '') : '';
    }

    // Populate banner
    const banner = document.getElementById('v-batch-banner');
    if (banner) {
      banner.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-blue" style="font-size:16px;">${batch.batchNo}</span>
          <span class="badge badge-teal">JMREF ${batch.jmrefNo || '—'}</span>
        </div>
        <div class="text-xs text-muted">Part No: <strong>${batch.partNo || '—'}</strong> | Registered Stage: <strong>${STAGE_LABELS[expectedStage] || expectedStage}</strong></div>
        <div class="mt-2 text-xs" style="color:var(--text-main);">Book Expected Quantity: <strong class="text-blue" style="font-size:14px;">${formatNum(expectedQty)}</strong> pcs</div>
        ${existingRec ? `<div class="text-xs text-amber font-bold mt-1">⚠️ Previously verified at ${formatDate(existingRec.scannedAt)} (Count: ${formatNum(existingRec.countedQty)}) — Updating record</div>` : ''}
      `;
    }

    checkStageMismatch();
    calcVariancePreview();

    const modal = document.getElementById('modal-audit-verify');
    if (modal) modal.classList.remove('hidden');

    setTimeout(() => {
      if (countedQtyInput) {
        countedQtyInput.focus();
        countedQtyInput.select();
      }
    }, 150);
  }

  function checkStageMismatch() {
    const exp = document.getElementById('v-expected-stage')?.value;
    const act = document.getElementById('v-physical-stage')?.value;
    const alertEl = document.getElementById('v-stage-mismatch-alert');
    if (alertEl) {
      if (exp && act && exp !== act) {
        alertEl.classList.remove('hidden');
      } else {
        alertEl.classList.add('hidden');
      }
    }
  }

  function calcVariancePreview() {
    const exp = Number(document.getElementById('v-expected-qty')?.value || 0);
    const counted = Number(document.getElementById('v-counted-qty')?.value || 0);
    const diff = counted - exp;
    const previewEl = document.getElementById('v-variance-preview');
    if (previewEl) {
      if (diff === 0) {
        previewEl.innerHTML = `<span class="text-success font-bold">✅ Exact match (0 variance)</span>`;
      } else if (diff < 0) {
        previewEl.innerHTML = `<span class="text-danger font-bold">⚠️ Shortage: ${formatNum(diff)} pcs</span>`;
      } else {
        previewEl.innerHTML = `<span class="text-warning font-bold">⚠️ Excess: +${formatNum(diff)} pcs</span>`;
      }
    }
  }

  function saveBatchVerification() {
    const session = getActiveSession();
    if (!session) return;

    const batchId = document.getElementById('v-batch-id').value;
    const batchNo = document.getElementById('v-batch-no').value;
    const jmrefNo = document.getElementById('v-jmref').value;
    const partNo = document.getElementById('v-partno').value;
    const expectedQty = Number(document.getElementById('v-expected-qty').value || 0);
    const expectedStage = document.getElementById('v-expected-stage').value;
    const scannedStage = document.getElementById('v-physical-stage').value;
    const countedQty = Number(document.getElementById('v-counted-qty').value || 0);
    const rackLocation = (document.getElementById('v-rack-location').value || '').trim();
    if (rackLocation) {
      pinnedRackLocation = rackLocation;
    }
    const auditorName = (document.getElementById('v-auditor-name').value || '').trim() || (Auth.getSession() || {}).name || 'Auditor';
    const notes = (document.getElementById('v-audit-notes').value || '').trim();

    const varianceQty = countedQty - expectedQty;
    let verificationStatus = 'verified_match';
    if (scannedStage !== expectedStage) {
      verificationStatus = 'stage_mismatch';
    } else if (varianceQty !== 0) {
      verificationStatus = 'verified_variance';
    }

    // Check existing record
    const existingRec = DB.AuditRecords.bySession(session.id).find(r => r.batchId === batchId);
    let recordObj = null;

    if (existingRec) {
      recordObj = {
        ...existingRec,
        scannedStage,
        expectedStage,
        expectedQty,
        countedQty,
        varianceQty,
        verificationStatus,
        rackLocation,
        scannedBy: auditorName,
        scannedAt: new Date().toISOString(),
        notes
      };
      DB.AuditRecords.update(existingRec.id, recordObj);
    } else {
      recordObj = {
        sessionId: session.id,
        batchId,
        batchNo,
        jmrefNo,
        partNo,
        expectedStage,
        scannedStage,
        expectedQty,
        countedQty,
        varianceQty,
        verificationStatus,
        rackLocation,
        scannedBy: auditorName,
        scannedAt: new Date().toISOString(),
        notes
      };
      DB.AuditRecords.insert(recordObj);
    }

    // Play tone feedback
    if (verificationStatus === 'verified_match') {
      playAudioTone('success');
      showToast(`Batch ${batchNo} verified successfully! (Exact match)`, 'success');
    } else {
      playAudioTone('warning');
      showToast(`Batch ${batchNo} recorded with ${verificationStatus === 'stage_mismatch' ? 'stage mismatch' : varianceQty + ' pcs variance'}!`, 'warning');
    }

    lastScannedBatch = {
      batch: DB.Batches.find(batchId) || { batchNo, jmrefNo, partNo },
      record: recordObj
    };

    closeModal('modal-audit-verify');
    render();
  }

  function deleteRecord(recId) {
    if (!confirm('Are you sure you want to remove this verification record?')) return;
    DB.AuditRecords.remove(recId);
    showToast('Verification record removed', 'info');
    render();
  }

  // ── Session Lifecycle Actions ──────────────────────────────
  function openNewSessionModal() {
    const modal = document.getElementById('modal-audit-new-session');
    if (modal) modal.classList.remove('hidden');
  }

  function submitNewSession() {
    const title = (document.getElementById('new-audit-title')?.value || '').trim();
    const stageScope = document.getElementById('new-audit-scope')?.value || 'all';
    const auditorName = (document.getElementById('new-audit-auditor')?.value || '').trim();
    const startedAt = document.getElementById('new-audit-date')?.value || new Date().toISOString().slice(0, 10);
    const notes = (document.getElementById('new-audit-notes')?.value || '').trim();

    if (!title) {
      showToast('Please enter an audit session title', 'warning');
      return;
    }

    const sessionObj = {
      title,
      stageScope,
      auditorName,
      status: 'in_progress',
      startedAt: new Date(startedAt).toISOString(),
      completedAt: null,
      notes
    };

    const newRec = DB.AuditSessions.insert(sessionObj);
    currentSessionId = newRec.id;

    closeModal('modal-audit-new-session');
    showToast('New stock audit session started!', 'success');
    render();
  }

  function finalizeSession(sessionId) {
    const session = DB.AuditSessions.find(sessionId);
    if (!session) return;

    const metrics = getSessionMetrics(session);
    const confirmMsg = `Are you sure you want to finalize and close "${session.title}"?\n\n` +
      `• Total Verified: ${metrics.verifiedBatches} batches\n` +
      `• Total Missing: ${metrics.missingBatches} batches\n` +
      `• Count Variance: ${metrics.netVarianceQty} pcs (₹${Math.round(metrics.netVarianceValue)})\n\n` +
      `Once finalized, verification scanning is locked for this session.`;

    if (!confirm(confirmMsg)) return;

    DB.AuditSessions.update(sessionId, {
      status: 'completed',
      completedAt: new Date().toISOString()
    });

    showToast('Audit session closed and finalized successfully!', 'success');
    render();
  }

  function reopenSession(sessionId) {
    if (!confirm('Re-open this audit session for scanning?')) return;
    DB.AuditSessions.update(sessionId, {
      status: 'in_progress',
      completedAt: null
    });
    currentSessionId = sessionId;
    showToast('Audit session reopened!', 'info');
    render();
  }

  function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this entire audit session and its verification records?')) return;
    const recs = DB.AuditRecords.bySession(sessionId);
    recs.forEach(r => DB.AuditRecords.remove(r.id));
    DB.AuditSessions.remove(sessionId);
    currentSessionId = null;
    showToast('Audit session deleted', 'info');
    render();
  }

  function switchSession(sessId) {
    currentSessionId = sessId;
    render();
  }

  function switchTab(tabKey) {
    activeTab = tabKey;
    verifiedCurrentPage = 1;
    missingCurrentPage = 1;
    render();
  }

  function filterVerifiedSearch(val) {
    verifiedSearch = val;
    verifiedCurrentPage = 1;
    render();
    const inp = document.getElementById('audit-verified-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  function filterVerifiedStatus(val) {
    verifiedStatusFilter = val;
    verifiedCurrentPage = 1;
    render();
  }

  function filterMissingSearch(val) {
    missingSearch = val;
    missingCurrentPage = 1;
    render();
    const inp = document.getElementById('audit-missing-search');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  function filterMissingStage(val) {
    missingStageFilter = val;
    missingCurrentPage = 1;
    render();
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
  }

  // ── Multi-Sheet Excel Export Engine ────────────────────────
  function exportAuditExcel(sessionId) {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library (SheetJS) is not loaded', 'error');
      return;
    }

    const session = DB.AuditSessions.find(sessionId) || getActiveSession();
    if (!session) {
      showToast('No session selected for export', 'warning');
      return;
    }

    const metrics = getSessionMetrics(session);
    const records = DB.AuditRecords.bySession(session.id);
    const missingList = metrics.missingList || [];
    const masterMap = {};
    DB.Master.all().forEach(m => { masterMap[m.jmrefNo] = m; });

    const wb = XLSX.utils.book_new();

    // 1. Executive Summary Sheet
    const summaryData = [
      ['JANANI MOULDINGS PVT. LTD. - PHYSICAL STOCK TAKING & AUDIT REPORT'],
      ['Session Title:', session.title || 'Stock Audit'],
      ['Audit Scope:', session.stageScope === 'all' ? 'All Factory Stages & Store' : (STAGE_LABELS[session.stageScope] || session.stageScope)],
      ['Status:', session.status === 'in_progress' ? 'In Progress' : 'Completed / Finalized'],
      ['Auditor Name:', session.auditorName || '—'],
      ['Audit Started At:', formatDate(session.startedAt)],
      ['Audit Completed At:', session.completedAt ? formatDate(session.completedAt) : '—'],
      ['Report Generated On:', new Date().toLocaleString('en-IN')],
      [],
      ['AUDIT METRIC', 'COUNT', 'QUANTITY (PCS)', 'NET VALUE (INR)'],
      ['Total Expected (Book Stock)', metrics.expectedBatches, metrics.expectedQty, '—'],
      ['Total Verified on Floor', metrics.verifiedBatches, metrics.verifiedQty, '—'],
      ['Exact Count Matches', metrics.exactMatches, '—', '—'],
      ['Count Variances (+/-)', metrics.varianceBatches, metrics.netVarianceQty, '₹' + Math.round(metrics.netVarianceValue)],
      ['Stage Location Mismatches', metrics.stageMismatches, '—', '—'],
      ['Missing / Unscanned Batches', metrics.missingBatches, metrics.missingQty, '₹' + Math.round(metrics.missingList.reduce((s,b) => s + (getBatchExpectedQty(b) * (Number((masterMap[b.jmrefNo]||{}).salePrice)||0)), 0))],
      ['Audit Completion %', metrics.pctComplete + '%', '—', '—'],
      [],
      ['SIGNOFF & APPROVALS'],
      ['Stock Auditor Signature:', '_______________________', 'Date:', '______________'],
      ['Store Manager Signature:', '_______________________', 'Date:', '______________'],
      ['Plant Head Approval:', '_______________________', 'Date:', '______________']
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Audit Summary');

    // 2. Verified Batches Sheet
    const verifiedHeaders = ['#', 'Batch No', 'JMREF No', 'Part No', 'Expected Stage', 'Scanned Stage', 'Expected Qty', 'Counted Qty', 'Variance Qty', 'Status', 'Rack Location', 'Auditor', 'Timestamp', 'Notes'];
    const verifiedRows = records.map((r, i) => [
      i + 1,
      r.batchNo || '',
      r.jmrefNo || '',
      r.partNo || '',
      STAGE_LABELS[r.expectedStage] || r.expectedStage || '',
      STAGE_LABELS[r.scannedStage] || r.scannedStage || '',
      r.expectedQty || 0,
      r.countedQty || 0,
      r.varianceQty || 0,
      r.verificationStatus === 'verified_match' ? 'Exact Match' : (r.verificationStatus === 'verified_variance' ? 'Qty Variance' : 'Stage Mismatch'),
      r.rackLocation || '',
      r.scannedBy || '',
      r.scannedAt || '',
      r.notes || ''
    ]);
    const wsVerified = XLSX.utils.aoa_to_sheet([verifiedHeaders, ...verifiedRows]);
    XLSX.utils.book_append_sheet(wb, wsVerified, 'Verified Batches');

    // 3. Missing Batches Sheet
    const missingHeaders = ['#', 'Batch No', 'JMREF No', 'Part No', 'Registered Stage', 'Expected Qty', 'Unit Price (INR)', 'Deficit Value (INR)', 'Batch Creation Date'];
    const missingRows = missingList.map((b, i) => {
      const qty = getBatchExpectedQty(b);
      const part = masterMap[b.jmrefNo] || {};
      const price = Number(part.salePrice || part.standardCost || 0);
      return [
        i + 1,
        b.batchNo || '',
        b.jmrefNo || '',
        b.partNo || '',
        STAGE_LABELS[b.currentStage] || b.currentStage || '',
        qty,
        price,
        Math.round(qty * price),
        b.productionDate || b.createdAt || ''
      ];
    });
    const wsMissing = XLSX.utils.aoa_to_sheet([missingHeaders, ...missingRows]);
    XLSX.utils.book_append_sheet(wb, wsMissing, 'Missing Batches');

    const fileName = `JMPL_Stock_Audit_${(session.title || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast('Comprehensive Audit Excel Workbook exported successfully!', 'success');
  }

  return {
    render,
    openNewSessionModal,
    submitNewSession,
    finalizeSession,
    reopenSession,
    deleteSession,
    switchSession,
    switchTab,
    handleScanSubmit,
    openCameraScanner,
    openVerificationModalForBatch,
    checkStageMismatch,
    calcVariancePreview,
    saveBatchVerification,
    deleteRecord,
    filterVerifiedSearch,
    filterVerifiedStatus,
    filterMissingSearch,
    filterMissingStage,
    closeModal,
    exportAuditExcel,
    toggleRapidScan,
    updatePinnedRack,
    changePageVerified: (page) => { verifiedCurrentPage = page; render(); },
    changePageMissing: (page) => { missingCurrentPage = page; render(); }
  };
})();

if (typeof window !== 'undefined') {
  window.StockAuditModule = StockAuditModule;
}
