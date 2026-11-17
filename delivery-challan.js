// ============================================================
// delivery-challan.js — Delivery Challan Module
// ============================================================
// Split into two dedicated screens:
// 1. Job Work Delivery Challan (WIP Batches sent to Subcontractors
//    for Flash Removal & Trimming with stage movement tracking)
// 2. RM Processing & Reprocessing Delivery Challan (Raw Materials
//    sent to Subcontractors / Suppliers for Processing / Reprocessing,
//    managing and deducting available RM inventory stock)
// ============================================================

const DeliveryChallanModule = (() => {
  // Screen state: 'jobwork' or 'rm-processing'
  let currentScreen = 'jobwork';

  // ── State for Screen 1: Job Work Delivery Challan (WIP Batches) ──
  let jwVendorId = '';
  let jwItems = []; // Array of { batch, qty, isAlreadyAtDestination }
  let jwActiveTab = 'create'; // 'create' | 'history'
  let jwSearch = '';

  // ── State for Screen 2: RM Processing & Reprocessing Challan ──
  let rmVendorId = '';
  let rmItemsList = []; // Array of { id, itemCode, name, category, uom, qty, purpose, notes }
  let rmActiveTab = 'create'; // 'create' | 'history'
  let rmPurpose = 'Processing'; // 'Processing' | 'Reprocessing' | 'Job Work'
  let selectedRmCode = '';
  let rmDispatchQty = '';
  let rmNotes = '';
  let rmSearch = '';

  const STAGE_NAMES = {
    production: 'Production',
    cryogenic: 'Cryogenic',
    deflashing: 'Flash Removal (DE Flashing)',
    'waiting-trimming': 'Waiting for Trimming',
    trimming: 'Trimming',
    'post-curing': 'Post Curing',
    'waiting-visual': 'Waiting for Visual inspection',
    visual: 'Visual Inspection',
    gauge: 'Gauge Inspection',
    quality: 'Quality Final (QC)',
    store: 'Store & Sales'
  };

  function localFormatNum(n, decimals = 0) {
    const num = Number(n);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function getBatchCurrentQty(b, stageRecords = null) {
    if (!b) return 0;
    if (stageRecords && typeof stageRecords.filter !== 'function') {
      const lastRec = stageRecords[b.id];
      if (lastRec) {
        const q = lastRec.isRecheck ? Number(lastRec.recheckQty) : Number(lastRec.outputQty);
        if (!isNaN(q) && q > 0) return q;
      }
      return Number(b.remainingQty != null && !isNaN(Number(b.remainingQty)) && Number(b.remainingQty) > 0 ? b.remainingQty : (b.initialQty || 0));
    }

    const allRecs = Array.isArray(stageRecords) 
      ? stageRecords 
      : (DB.StageRecords.byBatch ? DB.StageRecords.byBatch(b.id) : DB.StageRecords.all().filter(r => r.batchId === b.id));
    const batchRecs = allRecs.filter(r => r.batchId === b.id);
    
    if (batchRecs.length > 0) {
      batchRecs.sort((a, b) => {
        const tA = new Date(a.createdAt || a.date || 0).getTime();
        const tB = new Date(b.createdAt || b.date || 0).getTime();
        return tA - tB;
      });

      for (let i = batchRecs.length - 1; i >= 0; i--) {
        const r = batchRecs[i];
        const q = r.isRecheck ? Number(r.recheckQty) : Number(r.outputQty);
        if (!isNaN(q) && q > 0) return q;
      }
    }

    if (b.remainingQty != null && !isNaN(Number(b.remainingQty)) && Number(b.remainingQty) > 0) {
      return Number(b.remainingQty);
    }
    return Number(b.initialQty || 0);
  }

  function formatChallanDate(createdAt, isLong = true) {
    if (!createdAt) return '—';
    try {
      let d;
      if (typeof createdAt === 'object' && createdAt.seconds != null) {
        d = new Date(createdAt.seconds * 1000);
      } else {
        d = new Date(createdAt);
      }
      if (isNaN(d.getTime())) return '—';
      return isLong 
        ? d.toLocaleString('en-IN', { hour12: true })
        : d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return '—';
    }
  }

  // Returns list of Job Work Subcontractor Vendors (Flash Removal & Trimming)
  // Strictly: Shanthi Flash and Chitra Trimming
  function getJobWorkVendors() {
    const allVendors = (DB.Vendors && DB.Vendors.all ? DB.Vendors.all() : [])
      .concat(DB.Subcontractors && DB.Subcontractors.all ? DB.Subcontractors.all() : []);

    const shanthi = allVendors.find(v => {
      const n = (v.name || '').toLowerCase();
      return n.includes('shanthi') || (n.includes('flash') && !n.includes('in house'));
    });

    const chitra = allVendors.find(v => {
      const n = (v.name || '').toLowerCase();
      return n.includes('chitra') || (n.includes('trimming') && !n.includes('in house'));
    });

    const result = [];
    if (shanthi) {
      result.push({
        id: shanthi.id,
        name: shanthi.name || 'Shanthi Flash',
        department: 'deflashing',
        contactPerson: shanthi.contactPerson || '',
        phone: shanthi.phone || '',
        displayName: `${shanthi.name || 'Shanthi Flash'} (Flash Removal)`
      });
    } else {
      result.push({
        id: 'mqz4se5hgymm8',
        name: 'Shanthi Flash',
        department: 'deflashing',
        contactPerson: '',
        phone: '',
        displayName: 'Shanthi Flash (Flash Removal)'
      });
    }

    if (chitra) {
      result.push({
        id: chitra.id,
        name: chitra.name || 'Chitra Trimming',
        department: 'trimming',
        contactPerson: chitra.contactPerson || '',
        phone: chitra.phone || '',
        displayName: `${chitra.name || 'Chitra Trimming'} (Trimming)`
      });
    } else {
      result.push({
        id: 'mqz4s4ah0g64p',
        name: 'Chitra Trimming',
        department: 'trimming',
        contactPerson: '',
        phone: '',
        displayName: 'Chitra Trimming (Trimming)'
      });
    }

    return result;
  }

  function getJobWorkVendorById(id) {
    if (!id) return null;
    const list = getJobWorkVendors();
    const found = list.find(v => v.id === id);
    if (found) return found;
    return (DB.Vendors && DB.Vendors.find ? DB.Vendors.find(id) : null) ||
           (DB.Subcontractors && DB.Subcontractors.find ? DB.Subcontractors.find(id) : null);
  }

  // Returns combined list of Subcontractors and Suppliers for RM Processing
  function getAllSubcontractorVendors() {
    const list = [];
    const seen = new Set();

    if (DB.Vendors && DB.Vendors.all) {
      DB.Vendors.all().filter(v => v.active !== false && !v.name.toLowerCase().includes('in house')).forEach(v => {
        if (!seen.has(v.id)) {
          seen.add(v.id);
          list.push({
            id: v.id,
            name: v.name,
            type: v.type || 'vendor',
            department: v.department || 'subcontractor',
            contactPerson: v.contactPerson || '',
            phone: v.phone || ''
          });
        }
      });
    }

    if (DB.Subcontractors && DB.Subcontractors.all) {
      DB.Subcontractors.all().filter(s => s.active !== false).forEach(s => {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          list.push({
            id: s.id,
            name: s.name,
            type: 'subcontractor',
            department: s.department || s.process || 'subcontractor',
            contactPerson: s.contactPerson || '',
            phone: s.phone || ''
          });
        }
      });
    }

    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  function getSelectedVendor(id) {
    if (!id) return null;
    const all = getAllSubcontractorVendors();
    return all.find(v => v.id === id) || 
      (DB.Vendors && DB.Vendors.find ? DB.Vendors.find(id) : null) ||
      (DB.Subcontractors && DB.Subcontractors.find ? DB.Subcontractors.find(id) : null);
  }

  // Calculates real-time available RM stock: Total GRN Inward minus Total DC Outward
  function getRmStockMap() {
    const map = new Map();

    if (DB.RawMaterials && DB.RawMaterials.all) {
      DB.RawMaterials.all().forEach(rm => {
        const code = (rm.code || rm.itemCode || '').trim().toUpperCase();
        if (!code) return;
        map.set(code, {
          itemCode: rm.code || rm.itemCode,
          name: rm.name || rm.description || '',
          category: rm.category || 'Rubber Compound',
          uom: rm.uom || 'kg',
          totalInward: 0,
          totalDispatched: 0,
          available: 0
        });
      });
    }

    if (DB.GrnRecords && DB.GrnRecords.all) {
      DB.GrnRecords.all().forEach(grn => {
        (grn.items || []).forEach(it => {
          const code = (it.itemCode || '').trim().toUpperCase();
          if (!code) return;
          let entry = map.get(code);
          if (!entry) {
            entry = {
              itemCode: it.itemCode,
              name: it.description || '',
              category: it.category || 'Rubber Compound',
              uom: it.uom || 'kg',
              totalInward: 0,
              totalDispatched: 0,
              available: 0
            };
            map.set(code, entry);
          }
          entry.totalInward += (parseFloat(it.receivedQty) || 0);
          if (it.description && !entry.name) entry.name = it.description;
          if (it.uom) entry.uom = it.uom;
        });
      });
    }

    if (DB.DeliveryChallans && DB.DeliveryChallans.all) {
      DB.DeliveryChallans.all().forEach(dc => {
        (dc.rmItems || []).forEach(it => {
          const code = (it.itemCode || '').trim().toUpperCase();
          if (!code) return;
          let entry = map.get(code);
          if (!entry) {
            entry = {
              itemCode: it.itemCode,
              name: it.name || it.description || '',
              category: it.category || 'Rubber Compound',
              uom: it.uom || 'kg',
              totalInward: 0,
              totalDispatched: 0,
              available: 0
            };
            map.set(code, entry);
          }
          entry.totalDispatched += (parseFloat(it.qty) || 0);
        });
      });
    }

    if (DB.Batches && DB.Batches.all) {
      DB.Batches.all().forEach(b => {
        if (b.sourceRmCode && b.rmConsumedQty) {
          const code = (b.sourceRmCode || '').trim().toUpperCase();
          let entry = map.get(code);
          if (entry) {
            entry.totalConsumed = (entry.totalConsumed || 0) + (parseFloat(b.rmConsumedQty) || 0);
          }
        }
      });
    }

    map.forEach(entry => {
      entry.warehouseBalance = Math.max(0, entry.totalInward - entry.totalDispatched);
      entry.underProcess = Math.max(0, entry.totalDispatched - (entry.totalConsumed || 0));
      entry.available = entry.warehouseBalance;
    });

    return map;
  }

  // ── MAIN ROUTER ─────────────────────────────────────────────
  function render(screen = null) {
    if (screen) {
      currentScreen = screen;
    } else if (typeof App !== 'undefined' && App.current) {
      if (App.current === 'dc-rm-processing') {
        currentScreen = 'rm-processing';
      } else if (App.current === 'dc-jobwork' || App.current === 'delivery-challan') {
        currentScreen = 'jobwork';
      }
    }
    const el = document.getElementById('content');
    if (!el) return;

    if (currentScreen === 'rm-processing') {
      renderRmProcessingScreen(el);
    } else {
      currentScreen = 'jobwork';
      renderJobWorkScreen(el);
    }
  }

  // ════════════════════════════════════════════════════════════
  // ── SCREEN 1: JOB WORK DELIVERY CHALLAN (WIP BATCHES) ──────
  // ════════════════════════════════════════════════════════════

  function renderJobWorkScreen(el) {
    el.innerHTML = `
      <style>
        .dc-compact-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .dc-compact-table th { background: var(--bg-secondary); padding: 6px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); border: 1px solid var(--border); text-align: left; }
        .dc-compact-table td { padding: 6px 8px; font-size: 11.5px; border: 1px solid var(--border); }
      </style>
      <div class="animate-in">
        <div class="mb-4">
          <h2 class="font-bold" style="font-size:20px; display:flex; align-items:center; gap:8px;">
            <span>📦 Subcontractor Job Work Delivery Challan</span>
            <span class="badge badge-blue" style="font-size:11px;">WIP Batches</span>
          </h2>
          <p class="text-sm text-muted mt-1">Generate Job Work dispatches and execute stage movements for Flash Removal &amp; Trimming</p>
        </div>

        <div class="tabs mb-6" id="jw-dc-tabs">
          <button class="tab-btn ${jwActiveTab === 'create' ? 'active' : ''}" onclick="DeliveryChallanModule.switchJobWorkTab('create')">🚚 Create Job Work Challan</button>
          <button class="tab-btn ${jwActiveTab === 'history' ? 'active' : ''}" onclick="DeliveryChallanModule.switchJobWorkTab('history')">📜 Job Work DC History</button>
        </div>

        <div id="jw-dc-module-content">
          ${jwActiveTab === 'create' ? renderJobWorkCreateTab() : renderJobWorkHistoryTab()}
        </div>
      </div>

      <!-- Job Work Confirmation Modal -->
      <div class="modal-overlay hidden" id="jw-confirm-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>Confirm Job Work Challan &amp; Stage Movement</h3>
            <button class="modal-close" onclick="document.getElementById('jw-confirm-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" id="jw-confirm-body"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('jw-confirm-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="DeliveryChallanModule.saveJobWorkChallan(true)">Confirm &amp; Generate DC</button>
          </div>
        </div>
      </div>

      <!-- Print Prompt Modal -->
      <div class="modal-overlay hidden" id="dc-print-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>Delivery Challan Saved</h3>
            <button class="modal-close" onclick="document.getElementById('dc-print-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <div style="text-align:center; padding: 20px 0;">
              <div style="font-size:48px; color: var(--accent-green); margin-bottom: 16px;">✅</div>
              <h4 id="dc-success-title" style="margin-bottom: 8px; font-weight:700;">DC Created Successfully</h4>
              <p class="text-sm text-muted">Delivery Challan has been saved in the cloud. Would you like to print it now?</p>
            </div>
          </div>
          <div class="modal-footer" style="justify-content: center; gap: 12px;">
            <button class="btn btn-secondary" onclick="document.getElementById('dc-print-modal').classList.add('hidden')">Close</button>
            <button class="btn btn-primary" id="dc-print-confirm-btn">🖨️ Print Challan</button>
          </div>
        </div>
      </div>
    `;

    if (jwActiveTab === 'create') {
      populateBatchDropdown();
    }
  }

  function switchJobWorkTab(tab) {
    jwActiveTab = tab;
    render('jobwork');
    if (tab === 'history') {
      triggerCloudFetch();
    }
  }

  function renderJobWorkCreateTab() {
    const vendors = getJobWorkVendors();
    const vendorOpts = '<option value="">Select Subcontractor Vendor...</option>' + 
      vendors.map(v => `<option value="${v.id}" ${v.id === jwVendorId ? 'selected' : ''}>${v.name} (${v.department === 'deflashing' ? 'Flash Removal' : 'Trimming'})</option>`).join('');

    const vendor = getJobWorkVendorById(jwVendorId);
    let vendorDetailHtml = '';
    if (vendor) {
      vendorDetailHtml = `
        <div class="flex flex-wrap gap-4 text-sm mt-2 p-3" style="background:rgba(0,0,0,0.02); border-radius:6px; border:1px solid var(--border);">
          <div>Department: <strong style="text-transform:capitalize;">${vendor.department === 'deflashing' ? 'Flash Removal' : 'Trimming'}</strong></div>
          ${vendor.contactPerson ? `<div>Contact: <strong>${vendor.contactPerson}</strong></div>` : ''}
          ${vendor.phone ? `<div>Phone: <strong>${vendor.phone}</strong></div>` : ''}
        </div>
      `;
    }

    const tableRows = jwItems.map((item, idx) => {
      const b = item.batch;
      const warnStyle = item.isAlreadyAtDestination ? 'background:rgba(245,158,11,0.05); color:var(--accent-amber); font-weight:700;' : '';
      const warnBadge = item.isAlreadyAtDestination ? `<span class="badge badge-amber ml-2" style="font-size:10px;">Already in ${vendor ? (vendor.department === 'deflashing' ? 'Flash Removal' : 'Trimming') : 'Stage'}</span>` : '';
      
      return `
        <tr style="${warnStyle}">
          <td>${idx + 1}</td>
          <td><strong style="color:var(--primary);">${b.batchNo}</strong>${warnBadge}</td>
          <td>${b.partNo || '—'}</td>
          <td><span class="badge badge-teal">${b.jmrefNo || '—'}</span></td>
          <td style="text-transform:capitalize;">${STAGE_NAMES[b.currentStage] || b.currentStage}</td>
          <td class="font-bold">${localFormatNum(item.qty)} pcs</td>
          <td>
            <button class="btn btn-ghost btn-xs text-danger" onclick="DeliveryChallanModule.removeJobWorkItem(${idx})" title="Remove item">🗑️ Remove</button>
          </td>
        </tr>
      `;
    }).join('');

    const totalQty = jwItems.reduce((sum, item) => sum + item.qty, 0);

    return `
      <div class="grid gap-6" style="grid-template-columns: 1fr; @media (min-width: 992px) { grid-template-columns: 350px 1fr; }">
        <!-- Left: Configuration Box -->
        <div class="card">
          <div class="card-header"><h3>Job Work Details</h3></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Destination Subcontractor Vendor <span class="required">*</span></label>
              <select id="jw-dc-vendor" class="form-control" onchange="DeliveryChallanModule.selectJobWorkVendor(this.value)">
                ${vendorOpts}
              </select>
              ${vendorDetailHtml}
            </div>

            <div class="form-group mt-4">
              <label class="form-label">Add Batch (Scan QR / Type No) <span class="required">*</span></label>
              <div class="flex gap-2">
                <input type="text" id="dc-batch-input" class="form-control" style="flex:1;" placeholder="Type or scan Batch No..." list="dc-batch-list" oninput="DeliveryChallanModule.checkAutoAdd(this.value)" onchange="DeliveryChallanModule.onBatchChange(this.value)" onkeydown="if(event.key === 'Enter') { DeliveryChallanModule.onBatchEnter(event); }">
                <datalist id="dc-batch-list"></datalist>
                <button class="btn btn-secondary" onclick="DeliveryChallanModule.startScan()" style="padding:0 12px; display:flex; align-items:center; justify-content:center; height:42px;" title="Scan QR Code">📷 Scan</button>
              </div>
            </div>

            <button class="btn btn-primary w-full mt-4" onclick="DeliveryChallanModule.addBatchItem()" ${!jwVendorId ? 'disabled' : ''}>➕ Add Batch to Challan</button>
          </div>
        </div>

        <!-- Right: Challan Items List -->
        <div class="card">
          <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center;">
            <h3>Challan Batches List</h3>
            <span class="text-sm font-semibold text-muted">Total Batches: ${jwItems.length} | Qty: ${localFormatNum(totalQty)} pcs</span>
          </div>
          <div class="table-wrap">
            <table class="dc-compact-table">
              <thead>
                <tr><th>#</th><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Current Stage</th><th>Qty (pcs)</th><th>Action</th></tr>
              </thead>
              <tbody>
                ${tableRows || '<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--text-muted);"><div style="font-size:24px;margin-bottom:6px;">📦</div><div>No batches added yet. Select a Subcontractor and scan/add batches above.</div></td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="card-footer flex justify-end gap-2" style="background:var(--bg-glass-hover); border-top:1px solid var(--border);">
            <button class="btn btn-secondary" onclick="DeliveryChallanModule.clearJobWorkChallan()" ${!jwItems.length ? 'disabled' : ''}>Reset</button>
            <button class="btn btn-primary" onclick="DeliveryChallanModule.confirmJobWorkChallan()" ${!jwItems.length ? 'disabled' : ''}>💾 Save &amp; Generate Job Work DC</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderJobWorkHistoryTab() {
    let list = DB.DeliveryChallans ? DB.DeliveryChallans.all() : [];

    // Filter to Job Work DCs (batches dispatched)
    list = list.filter(dc => dc.type === 'jobwork' || (!dc.type && dc.batches && dc.batches.length > 0));

    if (jwSearch) {
      const q = jwSearch.toLowerCase();
      list = list.filter(dc => 
        (dc.dcNo && dc.dcNo.toLowerCase().includes(q)) ||
        (dc.vendorName && dc.vendorName.toLowerCase().includes(q))
      );
    }

    list.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const rows = list.map(dc => {
      const dateStr = formatChallanDate(dc.createdAt, true);
      const deleteBtn = (typeof Auth !== 'undefined' && Auth.isAdmin())
        ? `<button class="btn btn-ghost btn-xs text-danger" onclick="DeliveryChallanModule.deleteChallan('${dc.id}')">🗑️ Delete</button>`
        : '';
      return `
        <tr>
          <td><strong style="color:var(--primary);">${dc.dcNo}</strong></td>
          <td>${dateStr}</td>
          <td><strong>${dc.vendorName}</strong></td>
          <td style="text-transform:capitalize;">${dc.department === 'deflashing' ? 'Flash Removal' : 'Trimming'}</td>
          <td class="font-semibold">${dc.batches ? dc.batches.length : 0}</td>
          <td class="font-bold">${localFormatNum(dc.totalQty || 0)}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-xs text-blue" onclick="DeliveryChallanModule.printChallan('${dc.id}')">🖨️ View &amp; Print</button>
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div class="flex items-center gap-2">
            <h3 style="margin:0;">Job Work Delivery Challan History</h3>
            <button id="dc-refresh-btn" class="btn btn-secondary btn-xs" onclick="DeliveryChallanModule.refreshHistory()" title="Reload from cloud" style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px;">🔄 Refresh</button>
          </div>
          <div class="search-input" style="max-width:300px; margin:0;">
            <span class="search-icon">&#128269;</span>
            <input type="text" class="form-control" placeholder="Search by DC No or Vendor..." value="${jwSearch}" oninput="DeliveryChallanModule.filterJobWorkHistory(this.value)">
          </div>
        </div>
        <div class="table-wrap">
          <table class="dc-compact-table">
            <thead>
              <tr><th>DC No</th><th>Created At</th><th>Subcontractor</th><th>Department</th><th>Batches</th><th>Total Qty (pcs)</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);"><div style="font-size:24px;margin-bottom:6px;">📜</div><div>No job work delivery challan records found</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function selectJobWorkVendor(vendorId) {
    jwVendorId = vendorId;
    jwItems = [];
    render('jobwork');
    if (jwVendorId) {
      setTimeout(() => {
        const input = document.getElementById('dc-batch-input');
        if (input) input.focus();
      }, 60);
    }
  }

  function removeJobWorkItem(idx) {
    jwItems.splice(idx, 1);
    render('jobwork');
  }

  function clearJobWorkChallan() {
    jwItems = [];
    render('jobwork');
  }

  function filterJobWorkHistory(val) {
    jwSearch = val;
    const el = document.getElementById('jw-dc-module-content');
    if (el) el.innerHTML = renderJobWorkHistoryTab();
  }

  function confirmJobWorkChallan() {
    if (!jwItems.length) return;
    const vendor = getJobWorkVendorById(jwVendorId);
    if (!vendor) return;

    const destStage = vendor.department;
    const destName = destStage === 'deflashing' ? 'Flash Removal' : 'Trimming';

    const alreadyThere = jwItems.filter(item => item.isAlreadyAtDestination);
    const moveable = jwItems.filter(item => !item.isAlreadyAtDestination);

    let html = '';
    if (alreadyThere.length > 0) {
      html += `
        <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.2); border-radius:8px; padding:12px; margin-bottom:12px;">
          <h4 style="color:var(--accent-amber); margin-bottom:4px; font-weight:700;">⚠️ Already in Stage Warning</h4>
          <p class="text-xs">The following batches are already in <strong>${destName}</strong>:</p>
          <ul style="padding-left:18px; margin-top:4px;" class="text-xs">
            ${alreadyThere.map(item => `<li>Batch <strong>${item.batch.batchNo}</strong></li>`).join('')}
          </ul>
        </div>
      `;
    }

    if (moveable.length > 0) {
      html += `
        <div style="background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.2); border-radius:8px; padding:12px;">
          <h4 style="color:var(--accent-blue); margin-bottom:4px; font-weight:700;">⚙️ Stage Movement Confirmation</h4>
          <p class="text-xs">The following batches will automatically transition to <strong>${destName}</strong>:</p>
          <ul style="padding-left:18px; margin-top:4px;" class="text-xs">
            ${moveable.map(item => `<li>Batch <strong>${item.batch.batchNo}</strong> (from: <span style="text-transform:capitalize;">${STAGE_NAMES[item.batch.currentStage] || item.batch.currentStage}</span>)</li>`).join('')}
          </ul>
        </div>
      `;
    }

    const modalBody = document.getElementById('jw-confirm-body');
    if (modalBody) {
      modalBody.innerHTML = `
        <p class="mb-3 text-sm">Generating Job Work Delivery Challan for <strong>${vendor.name}</strong> containing <strong>${jwItems.length} batches</strong> (Total: <strong>${localFormatNum(jwItems.reduce((s,i)=>s+i.qty,0))} pcs</strong>).</p>
        ${html}
        <p class="text-xs text-muted mt-3">Click below to record this Delivery Challan and advance stages.</p>
      `;
    }

    document.getElementById('jw-confirm-modal')?.classList.remove('hidden');
  }

  async function saveJobWorkChallan(moveBatches = true) {
    if (typeof DB !== 'undefined' && DB.isOnline && !DB.isOnline()) {
      showToast("Cloud Connection Required: Cannot generate Delivery Challan while offline.", "error");
      return;
    }

    const vendor = getJobWorkVendorById(jwVendorId);
    if (!vendor) return;

    const confirmBtn = document.querySelector('#jw-confirm-modal .btn-primary');
    const origText = confirmBtn ? confirmBtn.innerHTML : 'Confirm &amp; Generate DC';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '⏳ Saving to Cloud...';
    }

    try {
      const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      const dateStr = new Date().toISOString().slice(0, 10);
      const destStage = vendor.department;

      const allDCs = DB.DeliveryChallans ? DB.DeliveryChallans.all() : [];
      const year = new Date().getFullYear();
      const seq = allDCs.filter(d => d.dcNo && d.dcNo.includes(year)).length + 1;
      const dcNo = `DC-JMPL-${year}-${String(seq).padStart(4, '0')}`;

      // Process batch movements
      for (const item of jwItems) {
        const b = item.batch;
        if (moveBatches) {
          if (!item.isAlreadyAtDestination) {
            await DB.StageRecords.insertAsync({
              batchId: b.id,
              stage: b.currentStage,
              inputQty: item.qty,
              outputQty: item.qty,
              lossQty: 0,
              vendorId: jwVendorId,
              movedTo: destStage,
              movedFrom: b.currentStage,
              date: dateStr,
              recordedBy: session?.userId || 'unknown',
              notes: `Dispatched via Job Work DC ${dcNo}`
            });

            await DB.Batches.updateAsync(b.id, {
              currentStage: destStage,
              vendorId: jwVendorId,
              remainingQty: item.qty
            });
          } else {
            await DB.Batches.updateAsync(b.id, {
              vendorId: jwVendorId,
              remainingQty: item.qty
            });
          }
        }
      }

      // Save DC record
      const newDC = await DB.DeliveryChallans.insertAsync({
        dcNo,
        type: 'jobwork',
        purpose: 'Job Work',
        vendorId: jwVendorId || '',
        vendorName: vendor.name || '',
        department: vendor.department || '',
        batches: jwItems.map(item => ({
          batchId: item.batch.id || '',
          batchNo: item.batch.batchNo || '',
          partNo: item.batch.partNo || '',
          jmrefNo: item.batch.jmrefNo || '',
          qty: Number(item.qty || 0),
          sourceStage: item.batch.currentStage || ''
        })),
        totalQty: jwItems.reduce((s,i) => s + Number(i.qty || 0), 0),
        createdAt: new Date().toISOString(),
        createdBy: session?.userId || 'unknown'
      });

      document.getElementById('jw-confirm-modal')?.classList.add('hidden');
      showToast(`Job Work Delivery Challan ${dcNo} created successfully`, 'success');

      jwItems = [];
      jwVendorId = '';
      jwActiveTab = 'history';
      render('jobwork');

      showPrintModal(newDC.id, dcNo);
    } catch (err) {
      console.error("Save Job Work DC error:", err);
      showToast(`Failed to generate Delivery Challan: ${err.message}`, 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = origText;
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ── SCREEN 2: RM PROCESSING & REPROCESSING CHALLAN ─────────
  // ════════════════════════════════════════════════════════════

  function renderRmProcessingScreen(el) {
    el.innerHTML = `
      <style>
        .dc-compact-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .dc-compact-table th { background: var(--bg-secondary); padding: 6px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); border: 1px solid var(--border); text-align: left; }
        .dc-compact-table td { padding: 6px 8px; font-size: 11.5px; border: 1px solid var(--border); }
      </style>
      <div class="animate-in">
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 class="font-bold" style="font-size:20px; display:flex; align-items:center; gap:8px;">
              <span>🧪 Raw Material Processing &amp; Reprocessing Challan</span>
              <span class="badge badge-purple" style="font-size:11px;">RM Inventory Outward</span>
            </h2>
            <p class="text-sm text-muted mt-1">Dispatch Raw Materials to Subcontractors &amp; Suppliers for processing or reprocessing and manage live stock</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-teal btn-sm" onclick="App.navigate('report_rm_sub_balance')">🏢 Subcontractor RM Balances</button>
            <button class="btn btn-secondary btn-sm" onclick="App.navigate('report_rm_inventory')">📦 RM Stock Tracking</button>
          </div>
        </div>

        <div class="tabs mb-6" id="rm-dc-tabs">
          <button class="tab-btn ${rmActiveTab === 'create' ? 'active' : ''}" onclick="DeliveryChallanModule.switchRmTab('create')">🚚 Create RM Challan</button>
          <button class="tab-btn ${rmActiveTab === 'history' ? 'active' : ''}" onclick="DeliveryChallanModule.switchRmTab('history')">📜 RM Challan History</button>
        </div>

        <div id="rm-dc-module-content">
          ${rmActiveTab === 'create' ? renderRmCreateTab() : renderRmHistoryTab()}
        </div>
      </div>

      <!-- RM Confirmation Modal -->
      <div class="modal-overlay hidden" id="rm-confirm-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>Confirm RM Outward Dispatch</h3>
            <button class="modal-close" onclick="document.getElementById('rm-confirm-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" id="rm-confirm-body"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('rm-confirm-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="DeliveryChallanModule.saveRmChallan()">Confirm &amp; Generate DC</button>
          </div>
        </div>
      </div>

      <!-- Print Prompt Modal -->
      <div class="modal-overlay hidden" id="dc-print-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>Delivery Challan Saved</h3>
            <button class="modal-close" onclick="document.getElementById('dc-print-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <div style="text-align:center; padding: 20px 0;">
              <div style="font-size:48px; color: var(--accent-green); margin-bottom: 16px;">✅</div>
              <h4 id="dc-success-title" style="margin-bottom: 8px; font-weight:700;">DC Created Successfully</h4>
              <p class="text-sm text-muted">Delivery Challan has been saved. Would you like to print it now?</p>
            </div>
          </div>
          <div class="modal-footer" style="justify-content: center; gap: 12px;">
            <button class="btn btn-secondary" onclick="document.getElementById('dc-print-modal').classList.add('hidden')">Close</button>
            <button class="btn btn-primary" id="dc-print-confirm-btn">🖨️ Print Challan</button>
          </div>
        </div>
      </div>
    `;
  }

  function switchRmTab(tab) {
    rmActiveTab = tab;
    render('rm-processing');
    if (tab === 'history') {
      triggerCloudFetch();
    }
  }

  function renderRmCreateTab() {
    const vendors = getAllSubcontractorVendors();
    const vendorOpts = '<option value="">Select Subcontractor / Supplier...</option>' + 
      vendors.map(v => {
        const typeLabel = v.type === 'subcontractor' ? 'Subcontractor' : 'Supplier';
        const tag = v.department ? ` (${typeLabel} - ${v.department})` : ` (${typeLabel})`;
        return `<option value="${v.id}" ${v.id === rmVendorId ? 'selected' : ''}>${v.name}${tag}</option>`;
      }).join('');

    const vendor = getSelectedVendor(rmVendorId);
    let vendorDetailHtml = '';
    if (vendor) {
      vendorDetailHtml = `
        <div class="flex flex-wrap gap-4 text-sm mt-2 p-3" style="background:rgba(0,0,0,0.02); border-radius:6px; border:1px solid var(--border);">
          <div>Type: <strong style="text-transform:capitalize;">${vendor.type || 'Subcontractor'}</strong></div>
          ${vendor.department ? `<div>Process / Dept: <strong>${vendor.department}</strong></div>` : ''}
          ${vendor.contactPerson ? `<div>Contact: <strong>${vendor.contactPerson}</strong></div>` : ''}
          ${vendor.phone ? `<div>Phone: <strong>${vendor.phone}</strong></div>` : ''}
        </div>
      `;
    }

    const rmStockMap = getRmStockMap();
    const rmList = Array.from(rmStockMap.values()).sort((a,b) => a.itemCode.localeCompare(b.itemCode));
    const selectedRm = selectedRmCode ? rmStockMap.get(selectedRmCode.toUpperCase()) : null;

    const tableRows = rmItemsList.map((item, idx) => `
      <tr style="background:rgba(139,92,246,0.03);">
        <td>${idx + 1}</td>
        <td><strong style="color:var(--primary);">${item.itemCode}</strong></td>
        <td>${item.name || '—'}</td>
        <td><span class="badge badge-teal">${item.category || 'RM'}</span></td>
        <td><span class="badge badge-amber font-semibold">${item.purpose || rmPurpose}</span></td>
        <td class="font-bold text-success">${localFormatNum(item.qty, 2)} ${item.uom}</td>
        <td class="text-xs text-muted">${item.notes || '—'}</td>
        <td>
          <button class="btn btn-ghost btn-xs text-danger" onclick="DeliveryChallanModule.removeRmItem(${idx})" title="Remove item">🗑️ Remove</button>
        </td>
      </tr>
    `).join('');

    const totalRmQty = rmItemsList.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    return `
      <div class="grid gap-6" style="grid-template-columns: 1fr; @media (min-width: 992px) { grid-template-columns: 360px 1fr; }">
        <!-- Left: Configuration Box -->
        <div class="card">
          <div class="card-header"><h3>RM Challan Details</h3></div>
          <div class="card-body">
            <!-- 1. Destination -->
            <div class="form-group">
              <label class="form-label">Destination Subcontractor / Supplier <span class="required">*</span></label>
              <select id="rm-dc-vendor" class="form-control" onchange="DeliveryChallanModule.selectRmVendor(this.value)">
                ${vendorOpts}
              </select>
              ${vendorDetailHtml}
            </div>

            <!-- 2. Purpose -->
            <div class="form-group mt-3">
              <label class="form-label">Dispatch Purpose <span class="required">*</span></label>
              <div class="flex gap-2">
                <button type="button" class="btn btn-xs ${rmPurpose === 'Processing' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;" onclick="DeliveryChallanModule.setRmPurpose('Processing')">⚙️ Processing</button>
                <button type="button" class="btn btn-xs ${rmPurpose === 'Reprocessing' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;" onclick="DeliveryChallanModule.setRmPurpose('Reprocessing')">🔄 Reprocessing</button>
                <button type="button" class="btn btn-xs ${rmPurpose === 'Job Work' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;" onclick="DeliveryChallanModule.setRmPurpose('Job Work')">📋 Job Work</button>
              </div>
            </div>

            <!-- 3. RM Selection from Master -->
            <div class="form-group mt-4 pt-3" style="border-top:1px dashed var(--border);">
              <label class="form-label font-bold">Select Raw Material (RM Master) <span class="required">*</span></label>
              <select id="dc-rm-select" class="form-control" onchange="DeliveryChallanModule.onRmSelect(this.value)">
                <option value="">Select Raw Material...</option>
                ${rmList.map(rm => `
                  <option value="${rm.itemCode}" ${selectedRmCode.toUpperCase() === rm.itemCode.toUpperCase() ? 'selected' : ''}>
                    ${rm.itemCode} - ${rm.name} [Avail: ${localFormatNum(rm.available, 1)} ${rm.uom}]
                  </option>
                `).join('')}
              </select>
            </div>

            ${selectedRm ? `
              <div class="p-3 mb-3 text-xs" style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-radius:6px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span>Material: <strong>${selectedRm.name}</strong></span>
                  <span class="badge badge-teal">${selectedRm.category}</span>
                </div>
                <div>Available Stock on Hand: <strong class="text-success" style="font-size:13px;">${localFormatNum(selectedRm.available, 2)} ${selectedRm.uom}</strong></div>
              </div>
            ` : ''}

            <div class="form-group mt-2">
              <label class="form-label text-xs">Dispatch Quantity ${selectedRm ? `(${selectedRm.uom})` : ''} <span class="required">*</span></label>
              <input type="number" id="dc-rm-qty" class="form-control" placeholder="Enter quantity to dispatch..." min="0.01" step="any" value="${rmDispatchQty}" oninput="DeliveryChallanModule.setRmDispatchQty(this.value)">
            </div>

            <div class="form-group mt-2">
              <label class="form-label text-xs">Processing Instructions / Notes (Optional)</label>
              <input type="text" id="dc-rm-notes" class="form-control" placeholder="e.g. Compound for batch X moulding..." value="${rmNotes}" oninput="DeliveryChallanModule.setRmNotes(this.value)">
            </div>

            <button class="btn btn-primary w-full mt-3" onclick="DeliveryChallanModule.addRmItem()" ${(!rmVendorId || !selectedRmCode) ? 'disabled' : ''}>
              ➕ Add RM Product to Challan
            </button>
          </div>
        </div>

        <!-- Right: Challan Items List -->
        <div class="card">
          <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center;">
            <h3>Raw Materials Dispatches List</h3>
            <span class="text-sm font-semibold text-muted">Items: ${rmItemsList.length} | Total: ${localFormatNum(totalRmQty, 2)} units</span>
          </div>
          <div class="table-wrap">
            <table class="dc-compact-table">
              <thead>
                <tr>
                  <th style="width:36px;">#</th>
                  <th>RM Item Code</th>
                  <th>Material Name</th>
                  <th>Category</th>
                  <th>Purpose</th>
                  <th>Dispatch Qty</th>
                  <th>Notes</th>
                  <th style="width:70px;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows || '<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--text-muted);"><div style="font-size:24px;margin-bottom:6px;">🧪</div><div>No raw materials added yet. Select subcontractor/supplier and add RM products above.</div></td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="card-footer flex justify-end gap-2" style="background:var(--bg-glass-hover); border-top:1px solid var(--border);">
            <button class="btn btn-secondary" onclick="DeliveryChallanModule.clearRmChallan()" ${!rmItemsList.length ? 'disabled' : ''}>Reset</button>
            <button class="btn btn-primary" onclick="DeliveryChallanModule.confirmRmChallan()" ${!rmItemsList.length ? 'disabled' : ''}>💾 Save &amp; Generate RM DC</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderRmHistoryTab() {
    let list = DB.DeliveryChallans ? DB.DeliveryChallans.all() : [];

    // Filter to RM Processing DCs
    list = list.filter(dc => dc.type === 'rm-processing' || (!dc.type && dc.rmItems && dc.rmItems.length > 0));

    if (rmSearch) {
      const q = rmSearch.toLowerCase();
      list = list.filter(dc => 
        (dc.dcNo && dc.dcNo.toLowerCase().includes(q)) ||
        (dc.vendorName && dc.vendorName.toLowerCase().includes(q)) ||
        (dc.purpose && dc.purpose.toLowerCase().includes(q))
      );
    }

    list.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const rows = list.map(dc => {
      const dateStr = formatChallanDate(dc.createdAt, true);
      const deleteBtn = (typeof Auth !== 'undefined' && Auth.isAdmin())
        ? `<button class="btn btn-ghost btn-xs text-danger" onclick="DeliveryChallanModule.deleteChallan('${dc.id}')">🗑️ Delete</button>`
        : '';
      const purposeTag = `<span class="badge ${dc.purpose === 'Reprocessing' ? 'badge-amber' : 'badge-teal'} text-xs font-semibold">${dc.purpose || 'Processing'}</span>`;
      const rmCount = dc.rmItems ? dc.rmItems.length : 0;

      return `
        <tr>
          <td><strong style="color:var(--primary);">${dc.dcNo}</strong></td>
          <td>${dateStr}</td>
          <td><strong>${dc.vendorName}</strong></td>
          <td>${purposeTag}</td>
          <td class="font-semibold">${rmCount} RM items</td>
          <td class="font-bold text-success">${localFormatNum(dc.totalRmQty || 0, 2)} units</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-xs text-blue" onclick="DeliveryChallanModule.printChallan('${dc.id}')">🖨️ View &amp; Print</button>
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card">
        <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div class="flex items-center gap-2">
            <h3 style="margin:0;">RM Processing Delivery Challan History</h3>
            <button id="dc-refresh-btn" class="btn btn-secondary btn-xs" onclick="DeliveryChallanModule.refreshHistory()" title="Reload from cloud" style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px;">🔄 Refresh</button>
          </div>
          <div class="search-input" style="max-width:300px; margin:0;">
            <span class="search-icon">&#128269;</span>
            <input type="text" class="form-control" placeholder="Search by DC No, Vendor or Purpose..." value="${rmSearch}" oninput="DeliveryChallanModule.filterRmHistory(this.value)">
          </div>
        </div>
        <div class="table-wrap">
          <table class="dc-compact-table">
            <thead>
              <tr><th>DC No</th><th>Created At</th><th>Subcontractor / Supplier</th><th>Purpose</th><th>RM Items</th><th>Total Dispatched</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);"><div style="font-size:24px;margin-bottom:6px;">📜</div><div>No RM processing delivery challan records found</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function selectRmVendor(vendorId) {
    rmVendorId = vendorId;
    render('rm-processing');
  }

  function setRmPurpose(purpose) {
    rmPurpose = purpose;
    render('rm-processing');
  }

  function onRmSelect(itemCode) {
    selectedRmCode = itemCode;
    render('rm-processing');
    setTimeout(() => {
      const qtyInput = document.getElementById('dc-rm-qty');
      if (qtyInput) qtyInput.focus();
    }, 50);
  }

  function setRmDispatchQty(val) {
    rmDispatchQty = val;
  }

  function setRmNotes(val) {
    rmNotes = val;
  }

  function addRmItem() {
    if (!rmVendorId) {
      showToast('Please select a Subcontractor / Supplier first', 'warning');
      return;
    }
    const code = (selectedRmCode || '').trim().toUpperCase();
    if (!code) {
      showToast('Please select a Raw Material product', 'warning');
      return;
    }

    const rmStockMap = getRmStockMap();
    const rm = rmStockMap.get(code);
    if (!rm) {
      showToast('Raw Material not found in inventory', 'error');
      return;
    }

    const qtyInput = document.getElementById('dc-rm-qty');
    const qtyVal = parseFloat(qtyInput ? qtyInput.value : rmDispatchQty);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      showToast('Please enter a valid dispatch quantity greater than 0', 'warning');
      if (qtyInput) qtyInput.focus();
      return;
    }

    if (qtyVal > rm.available) {
      const proceed = confirm(`Warning: Dispatch quantity (${qtyVal} ${rm.uom}) exceeds current available on-hand stock (${rm.available} ${rm.uom}). Do you still want to proceed?`);
      if (!proceed) return;
    }

    const notesInput = document.getElementById('dc-rm-notes');
    const notesVal = notesInput ? notesInput.value.trim() : (rmNotes || '');

    const existingIdx = rmItemsList.findIndex(i => (i.itemCode || '').trim().toUpperCase() === code);
    if (existingIdx !== -1) {
      rmItemsList[existingIdx].qty += qtyVal;
      showToast(`Updated quantity for ${rm.itemCode} in challan`, 'info');
    } else {
      rmItemsList.push({
        id: 'rm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        itemCode: rm.itemCode,
        name: rm.name,
        category: rm.category,
        uom: rm.uom,
        qty: qtyVal,
        purpose: rmPurpose,
        notes: notesVal
      });
      showToast(`Added ${rm.itemCode} (${qtyVal} ${rm.uom}) for ${rmPurpose}`, 'success');
    }

    selectedRmCode = '';
    rmDispatchQty = '';
    rmNotes = '';
    render('rm-processing');
  }

  function removeRmItem(idx) {
    rmItemsList.splice(idx, 1);
    render('rm-processing');
  }

  function clearRmChallan() {
    rmItemsList = [];
    selectedRmCode = '';
    rmDispatchQty = '';
    rmNotes = '';
    render('rm-processing');
  }

  function filterRmHistory(val) {
    rmSearch = val;
    const el = document.getElementById('rm-dc-module-content');
    if (el) el.innerHTML = renderRmHistoryTab();
  }

  function confirmRmChallan() {
    if (!rmItemsList.length) return;
    const vendor = getSelectedVendor(rmVendorId);
    if (!vendor) return;

    const modalBody = document.getElementById('rm-confirm-body');
    if (modalBody) {
      modalBody.innerHTML = `
        <p class="mb-3 text-sm">
          Generating RM Delivery Challan for <strong>${vendor.name}</strong> (${vendor.type || 'Subcontractor'}).
          <br>Purpose: <span class="badge badge-amber font-bold">${rmPurpose}</span>
          <br>Items: <strong>${rmItemsList.length} items</strong> (Total: <strong>${localFormatNum(rmItemsList.reduce((s,i)=>s+i.qty,0), 2)} units</strong>).
        </p>
        <div style="background:rgba(139,92,246,0.06); border:1px solid rgba(139,92,246,0.2); border-radius:8px; padding:12px;">
          <h4 style="color:var(--accent-purple); margin-bottom:6px; font-weight:700;">🧪 Raw Material Inventory Outward Deduction</h4>
          <p class="text-xs">The following materials will be deducted from active on-hand inventory:</p>
          <ul style="padding-left:18px; margin-top:4px;" class="text-xs">
            ${rmItemsList.map(i => `<li><strong>${i.itemCode}</strong> - ${i.name}: <span class="text-success font-bold">${localFormatNum(i.qty, 2)} ${i.uom}</span> (Purpose: <em>${i.purpose || rmPurpose}</em>)</li>`).join('')}
          </ul>
        </div>
      `;
    }

    document.getElementById('rm-confirm-modal')?.classList.remove('hidden');
  }

  async function saveRmChallan() {
    if (typeof DB !== 'undefined' && DB.isOnline && !DB.isOnline()) {
      showToast("Cloud Connection Required: Cannot generate Delivery Challan while offline.", "error");
      return;
    }

    const vendor = getSelectedVendor(rmVendorId);
    if (!vendor) return;

    const confirmBtn = document.querySelector('#rm-confirm-modal .btn-primary');
    const origText = confirmBtn ? confirmBtn.innerHTML : 'Confirm &amp; Generate DC';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '⏳ Saving to Cloud...';
    }

    try {
      const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      const allDCs = DB.DeliveryChallans ? DB.DeliveryChallans.all() : [];
      const year = new Date().getFullYear();
      const seq = allDCs.filter(d => d.dcNo && d.dcNo.includes(year)).length + 1;
      const dcNo = `DC-JMPL-${year}-${String(seq).padStart(4, '0')}`;

      const newDC = await DB.DeliveryChallans.insertAsync({
        dcNo,
        type: 'rm-processing',
        purpose: rmPurpose || 'Processing',
        vendorId: rmVendorId || '',
        vendorName: vendor.name || '',
        vendorType: vendor.type || 'subcontractor',
        department: vendor.department || '',
        batches: [],
        rmItems: rmItemsList.map(item => ({
          itemCode: item.itemCode,
          name: item.name || '',
          category: item.category || '',
          qty: Number(item.qty || 0),
          uom: item.uom || 'kg',
          purpose: item.purpose || rmPurpose || 'Processing',
          notes: item.notes || ''
        })),
        totalQty: 0,
        totalRmQty: rmItemsList.reduce((s,i) => s + Number(i.qty || 0), 0),
        createdAt: new Date().toISOString(),
        createdBy: session?.userId || 'unknown'
      });

      document.getElementById('rm-confirm-modal')?.classList.add('hidden');
      showToast(`RM Delivery Challan ${dcNo} created successfully`, 'success');

      rmItemsList = [];
      rmVendorId = '';
      selectedRmCode = '';
      rmDispatchQty = '';
      rmNotes = '';
      rmActiveTab = 'history';
      render('rm-processing');

      showPrintModal(newDC.id, dcNo);
    } catch (err) {
      console.error("Save RM DC error:", err);
      showToast(`Failed to generate RM Challan: ${err.message}`, 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = origText;
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ── SHARED UTILITIES & PRINTING ────────────────────────────
  // ════════════════════════════════════════════════════════════

  function showPrintModal(dcId, dcNo) {
    const printModal = document.getElementById('dc-print-modal');
    if (printModal) {
      const titleEl = document.getElementById('dc-success-title');
      if (titleEl) titleEl.textContent = `Delivery Challan ${dcNo} Saved`;
      const printBtn = document.getElementById('dc-print-confirm-btn');
      if (printBtn) {
        printBtn.onclick = () => {
          printChallan(dcId);
          printModal.classList.add('hidden');
        };
      }
      printModal.classList.remove('hidden');
    }
  }

  function populateBatchDropdown() {
    const dl = document.getElementById('dc-batch-list');
    if (!dl) return;

    let eligibleBatches = DB.Batches ? DB.Batches.all().filter(b => b.status === 'active' && b.currentStage !== 'store') : [];
    eligibleBatches.sort((a,b) => (a.batchNo || '').localeCompare(b.batchNo || ''));

    const stageRecords = DB.StageRecords ? DB.StageRecords.all().slice() : [];
    stageRecords.sort((a, b) => {
      const tA = new Date(a.createdAt || a.date || 0).getTime();
      const tB = new Date(b.createdAt || b.date || 0).getTime();
      return tA - tB;
    });

    const lastRecordMap = {};
    for (let i = 0; i < stageRecords.length; i++) {
      const r = stageRecords[i];
      if (!r.batchId) continue;
      const q = r.isRecheck ? Number(r.recheckQty) : Number(r.outputQty);
      if (!isNaN(q) && q > 0) {
        lastRecordMap[r.batchId] = r;
      }
    }

    let html = '';
    eligibleBatches.forEach(b => {
      const qty = getBatchCurrentQty(b, lastRecordMap);
      const stageName = STAGE_NAMES[b.currentStage] || b.currentStage;
      html += `<option value="${b.batchNo}">${b.batchNo} [${b.jmrefNo}] (${qty} pcs) - Stage: ${stageName}</option>`;
    });

    dl.innerHTML = html;
  }

  let autoAddTimer = null;
  let _isScanningWithCamera = false;

  function onBatchEnter(event) {
    if (event) event.preventDefault();
    if (autoAddTimer) { clearTimeout(autoAddTimer); autoAddTimer = null; }
    addBatchItem();
  }

  function onBatchChange(val) {
    if (!val || !jwVendorId) return;
    const cleanVal = val.trim();
    if (!cleanVal) return;
    const allBatches = DB.Batches ? DB.Batches.all() : [];
    const exactMatch = allBatches.find(x => x.batchNo && x.batchNo.trim().toLowerCase() === cleanVal.toLowerCase() && x.status === 'active')
           || allBatches.find(x => x.batchNo && x.batchNo.trim().toLowerCase() === cleanVal.toLowerCase());
    if (exactMatch && !jwItems.some(item => item.batch.id === exactMatch.id)) {
      if (autoAddTimer) { clearTimeout(autoAddTimer); autoAddTimer = null; }
      addBatchToJobWork(exactMatch);
    }
  }

  function checkAutoAdd(val) {
    if (_isScanningWithCamera) return;
    if (autoAddTimer) { clearTimeout(autoAddTimer); autoAddTimer = null; }
    if (!val || !jwVendorId) return;
    const cleanVal = val.trim();
    if (!cleanVal) return;

    const allBatches = DB.Batches ? DB.Batches.all() : [];
    const exactMatch = allBatches.find(x => x.batchNo && x.batchNo.trim().toLowerCase() === cleanVal.toLowerCase() && x.status === 'active');
    if (!exactMatch) return;

    const cleanValLower = cleanVal.toLowerCase();
    const hasLongerMatches = allBatches.some(x => {
      if (!x.batchNo || x.status !== 'active') return false;
      const bLower = x.batchNo.trim().toLowerCase();
      return bLower.length > cleanValLower.length && bLower.startsWith(cleanValLower);
    });

    if (hasLongerMatches) {
      autoAddTimer = setTimeout(() => {
        const input = document.getElementById('dc-batch-input');
        const currentVal = (input ? input.value : '').trim();
        if (currentVal.toLowerCase() === cleanValLower) {
          if (!jwItems.some(item => item.batch.id === exactMatch.id)) {
            addBatchToJobWork(exactMatch);
          }
        }
      }, 500);
      return;
    }

    autoAddTimer = setTimeout(() => {
      const input = document.getElementById('dc-batch-input');
      const currentVal = (input ? input.value : '').trim();
      if (currentVal.toLowerCase() === cleanValLower) {
        if (!jwItems.some(item => item.batch.id === exactMatch.id)) {
          addBatchToJobWork(exactMatch);
        }
      }
    }, 250);
  }

  function startScan() {
    if (!jwVendorId) {
      showToast('Please select a Subcontractor Vendor first', 'warning');
      return;
    }
    if (typeof Scanner === 'undefined') {
      showToast('Scanner module not loaded', 'error');
      return;
    }
    _isScanningWithCamera = true;
    Scanner.start('dc-batch-input', (scannedText) => {
      _isScanningWithCamera = false;
      if (autoAddTimer) { clearTimeout(autoAddTimer); autoAddTimer = null; }
      const cleanText = (scannedText || '').trim();
      if (!cleanText) return;
      const allBatches = DB.Batches ? DB.Batches.all() : [];
      const b = allBatches.find(x => x.batchNo && x.batchNo.trim().toLowerCase() === cleanText.toLowerCase() && x.status === 'active')
             || allBatches.find(x => x.batchNo && x.batchNo.trim().toLowerCase() === cleanText.toLowerCase());
      if (!b) {
        showToast('Batch not found: ' + cleanText, 'error');
        return;
      }
      addBatchToJobWork(b);
    });
  }

  function addBatchItem() {
    if (autoAddTimer) { clearTimeout(autoAddTimer); autoAddTimer = null; }
    const input = document.getElementById('dc-batch-input');
    if (!input || !input.value.trim()) {
      showToast('Please enter a batch number to add', 'warning');
      return;
    }
    const batchNoVal = input.value.trim();
    const allBatches = DB.Batches ? DB.Batches.all() : [];
    const b = allBatches.find(x => x.batchNo && x.batchNo.trim().toLowerCase() === batchNoVal.toLowerCase() && x.status === 'active')
           || allBatches.find(x => x.batchNo && x.batchNo.trim().toLowerCase() === batchNoVal.toLowerCase());
    if (!b) {
      showToast('Batch not found: ' + batchNoVal, 'error');
      return;
    }
    addBatchToJobWork(b);
  }

  function addBatchToJobWork(b) {
    if (!jwVendorId) {
      showToast('Please select a Subcontractor Vendor first', 'warning');
      return;
    }
    if (jwItems.some(item => item.batch.id === b.id)) {
      showToast('Batch already added to challan: ' + b.batchNo, 'warning');
      const input = document.getElementById('dc-batch-input');
      if (input) { input.value = ''; input.focus(); }
      return;
    }

    const vendor = getJobWorkVendorById(jwVendorId);
    if (!vendor) return;

    const qty = getBatchCurrentQty(b);
    const destStage = vendor.department;
    const isAlreadyAtDestination = b.currentStage === destStage;

    jwItems.push({ batch: b, qty, isAlreadyAtDestination });
    showToast(`Added ${b.batchNo} to challan`, 'success');
    render('jobwork');
    setTimeout(() => {
      const input = document.getElementById('dc-batch-input');
      if (input) { input.value = ''; input.focus(); }
    }, 60);
  }

  function deleteChallan(dcId) {
    const dc = DB.DeliveryChallans ? DB.DeliveryChallans.find(dcId) : null;
    if (!dc) return;
    
    const confirmDelete = confirm(`Are you sure you want to delete Delivery Challan: ${dc.dcNo}?`);
    if (confirmDelete) {
      DB.DeliveryChallans.remove(dcId);
      showToast('Delivery Challan deleted', 'success');
      render(currentScreen);
    }
  }

  function printChallan(dcId) {
    const dc = DB.DeliveryChallans ? DB.DeliveryChallans.find(dcId) : null;
    if (!dc) {
      showToast('Challan record not found', 'error');
      return;
    }

    const img = new Image();
    img.src = 'logo.png';
    img.onload = () => {
      let logoDataUrl = 'logo.png';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        logoDataUrl = canvas.toDataURL('image/png');
      } catch (e) {
        console.error("Canvas toDataURL failed:", e);
      }
      openPrintWindow(dc, logoDataUrl);
    };
    img.onerror = () => {
      openPrintWindow(dc, 'logo.png');
    };
  }

  function openPrintWindow(dc, logoUrl) {
    const printWindow = window.open('', '_blank', 'width=900,height=750');
    if (!printWindow) {
      showToast('Popup blocker blocked challan preview. Please enable popups.', 'error');
      return;
    }

    const dateFormatted = formatChallanDate(dc.createdAt, false);
    const hasBatches = dc.batches && dc.batches.length > 0;
    const hasRm = dc.rmItems && dc.rmItems.length > 0;
    const isRmChallan = dc.type === 'rm-processing' || (hasRm && !hasBatches);

    const batchRows = hasBatches ? dc.batches.map((b, idx) => `
      <tr>
        <td style="width: 6%; border: 1px solid #1e293b; padding: 6px; text-align: center;">${idx + 1}</td>
        <td style="width: 44%; border: 1px solid #1e293b; padding: 6px; font-weight: bold;">${b.batchNo}</td>
        <td style="width: 25%; border: 1px solid #1e293b; padding: 6px;">${b.partNo || '—'} <span style="color:#64748b; font-size:9px;">(${b.jmrefNo || '—'})</span></td>
        <td style="width: 25%; border: 1px solid #1e293b; padding: 6px; text-align: right; font-weight: bold;">${localFormatNum(b.qty)} pcs</td>
      </tr>
    `).join('') : '';

    const rmRows = hasRm ? dc.rmItems.map((rm, idx) => `
      <tr>
        <td style="width: 6%; border: 1px solid #1e293b; padding: 6px; text-align: center;">${idx + 1}</td>
        <td style="width: 28%; border: 1px solid #1e293b; padding: 6px; font-weight: bold;">${rm.itemCode}</td>
        <td style="width: 36%; border: 1px solid #1e293b; padding: 6px;">${rm.name || '—'} <span style="color:#64748b; font-size:9.5px;">[${rm.category || 'RM'}]</span></td>
        <td style="width: 15%; border: 1px solid #1e293b; padding: 6px; text-align: center; font-weight: 600;">${rm.purpose || dc.purpose || 'Processing'}</td>
        <td style="width: 15%; border: 1px solid #1e293b; padding: 6px; text-align: right; font-weight: bold;">${localFormatNum(rm.qty, 2)} ${rm.uom}</td>
      </tr>
    `).join('') : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${dc.dcNo} - JMPL Delivery Challan</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 15px; margin: 0; line-height: 1.4; background: #fff; }
          .toolbar { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 15px; }
          .btn-print { background: #2563eb; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          .logo-container { display: flex; align-items: center; gap: 14px; }
          .logo { height: 52px; width: auto; }
          .company-info { display: flex; flex-direction: column; }
          .company-name { font-size: 21px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; color: #0f172a; }
          .company-address { font-size: 10px; color: #475569; margin-top: 2px; font-weight: 500; max-width: 500px; }
          .dc-badge { text-align: right; }
          .dc-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; border: 2px solid #0f172a; padding: 6px 14px; border-radius: 4px; background: #f8fafc; }
          .dc-sub { font-size: 9.5px; color: #64748b; margin-top: 4px; font-weight: 600; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; border: 1px solid #0f172a; table-layout: fixed; }
          th { background-color: #f1f5f9; font-weight: 700; border: 1px solid #0f172a; padding: 7px; text-transform: uppercase; font-size: 9.5px; }
          td { border: 1px solid #0f172a; padding: 6px; word-wrap: break-word; overflow-wrap: break-word; }
          .total-row td { background: #f8fafc; font-weight: bold; border-top: 2px solid #0f172a; }
          .section-subhead { font-size: 12px; font-weight: 700; text-transform: uppercase; margin: 12px 0 6px 0; color: #1e3a8a; }
          .terms-box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 14px; border-radius: 4px; font-size: 9.5px; color: #475569; margin-bottom: 30px; }
          .terms-title { font-weight: 700; color: #0f172a; text-transform: uppercase; margin-bottom: 4px; font-size: 10px; }
          .sig-row { display: flex; justify-content: space-between; margin-top: 50px; font-size: 11px; font-weight: 600; }
          .sig-box { text-align: center; width: 220px; border-top: 1.5px dashed #475569; padding-top: 8px; color: #0f172a; }
          @media print { body { padding: 0; } .toolbar { display: none; } }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
        </div>

        <div class="header">
          <div class="logo-container">
            <img class="logo" src="${logoUrl}" alt="JMPL Logo">
            <div class="company-info">
              <div class="company-name">Janani Mouldings Pvt Ltd</div>
              <div class="company-address">Survey no. 36 2B, Kelambakkam - Vandalur Rd, Pudupakkam, Tamil Nadu 603103 | Phone: +91 44 2747 4000</div>
            </div>
          </div>
          <div class="dc-badge">
            <div class="dc-title">Delivery Challan</div>
            <div class="dc-sub">${isRmChallan ? (dc.purpose || 'RM Processing') : 'Job Work'} Dispatch Voucher</div>
          </div>
        </div>

        <table style="margin-bottom: 16px; table-layout: fixed; width: 100%;">
          <tbody>
            <tr>
              <td style="width: 20%; background-color: #f1f5f9; font-weight: bold;">DC Number:</td>
              <td style="width: 30%; font-weight: bold; font-size: 12px; color: #0f172a;">${dc.dcNo}</td>
              <td style="width: 20%; background-color: #f1f5f9; font-weight: bold;">Challan Date:</td>
              <td style="width: 30%; font-weight: bold;">${dateFormatted}</td>
            </tr>
            <tr>
              <td style="width: 20%; background-color: #f1f5f9; font-weight: bold;">Subcontractor / Supplier:</td>
              <td style="width: 30%; font-weight: bold; color: #1e3a8a;">${dc.vendorName}</td>
              <td style="width: 20%; background-color: #f1f5f9; font-weight: bold;">Dispatch Purpose:</td>
              <td style="width: 30%; font-weight: bold; text-transform: uppercase; color: #0f766e;">${isRmChallan ? (dc.purpose || 'Processing') : (dc.department === 'deflashing' ? 'Flash Removal' : 'Trimming')}</td>
            </tr>
          </tbody>
        </table>

        ${hasBatches ? `
          <div class="section-subhead">📦 WIP Batches Dispatched:</div>
          <table style="table-layout: fixed; width: 100%;">
            <thead>
              <tr>
                <th style="width: 6%; text-align: center;">#</th>
                <th style="width: 44%; text-align: left;">Batch Number</th>
                <th style="width: 25%; text-align: left;">Part No (JMREF)</th>
                <th style="width: 25%; text-align: right;">Quantity (pcs)</th>
              </tr>
            </thead>
            <tbody>
              ${batchRows}
              <tr class="total-row">
                <td colspan="3" style="border: 1px solid #0f172a; padding: 6px; text-align: right; font-weight: bold;">Total Batches Quantity:</td>
                <td style="border: 1px solid #0f172a; padding: 6px; text-align: right; font-size: 11px; font-weight: bold;">${localFormatNum(dc.totalQty)} pcs</td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        ${hasRm ? `
          <div class="section-subhead">🧪 Raw Materials Dispatched for Processing / Reprocessing:</div>
          <table style="table-layout: fixed; width: 100%;">
            <thead>
              <tr>
                <th style="width: 6%; text-align: center;">#</th>
                <th style="width: 28%; text-align: left;">RM Item Code</th>
                <th style="width: 36%; text-align: left;">Material Description &amp; Category</th>
                <th style="width: 15%; text-align: center;">Purpose</th>
                <th style="width: 15%; text-align: right;">Dispatch Qty</th>
              </tr>
            </thead>
            <tbody>
              ${rmRows}
              <tr class="total-row">
                <td colspan="4" style="border: 1px solid #0f172a; padding: 6px; text-align: right; font-weight: bold;">Total Raw Material Dispatched:</td>
                <td style="border: 1px solid #0f172a; padding: 6px; text-align: right; font-size: 11px; font-weight: bold; color: #0f766e;">${localFormatNum(dc.totalRmQty || 0, 2)} units</td>
              </tr>
            </tbody>
          </table>
        ` : ''}

        <div class="terms-box">
          <div class="terms-title">Dispatch Terms &amp; Conditions:</div>
          1. Goods/materials dispatched above are strictly for <strong>${isRmChallan ? (dc.purpose || 'Processing / Reprocessing') : 'Job Work Processing'}</strong> and remain the exclusive property of Janani Mouldings Pvt Ltd.<br>
          2. The receiver must acknowledge receipt and return processed components/materials along with this delivery challan copy.<br>
          3. Process loss and scrap must be recorded accurately upon return.
        </div>

        <div class="sig-row">
          <div class="sig-box">Dispatched By (JMPL Store)</div>
          <div class="sig-box">Authorized Signatory</div>
          <div class="sig-box">Receiver Signature &amp; Seal</div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  async function triggerCloudFetch() {
    if (typeof DB !== 'undefined') {
      const fetchFn = (DB.DeliveryChallans && typeof DB.DeliveryChallans.fetchFromCloud === 'function')
        ? DB.DeliveryChallans.fetchFromCloud
        : (typeof DB.ensureModuleLoaded === 'function' ? () => DB.ensureModuleLoaded('delivery-challan', true) : null);
      if (fetchFn) {
        try {
          await fetchFn();
          if (currentScreen === 'jobwork' && jwActiveTab === 'history') {
            const el = document.getElementById('jw-dc-module-content');
            if (el) el.innerHTML = renderJobWorkHistoryTab();
          } else if (currentScreen === 'rm-processing' && rmActiveTab === 'history') {
            const el = document.getElementById('rm-dc-module-content');
            if (el) el.innerHTML = renderRmHistoryTab();
          }
        } catch (e) {
          console.warn("Fetch error:", e);
        }
      }
    }
  }

  async function refreshHistory() {
    const btn = document.getElementById('dc-refresh-btn');
    if (btn) btn.innerHTML = '⏳ Loading...';
    await triggerCloudFetch();
    if (btn) btn.innerHTML = '🔄 Refresh';
  }

  function addBatchFromQuickMove(batchId, vendorId) {
    currentScreen = 'jobwork';
    jwActiveTab = 'create';
    if (vendorId) {
      jwVendorId = vendorId;
    }
    const b = DB.Batches ? DB.Batches.find(batchId) : null;
    if (b) {
      const currentQty = getBatchCurrentQty(b);
      const vendor = getJobWorkVendorById(vendorId);
      const isAlready = vendor && b.currentStage === vendor.department;
      const existingIdx = jwItems.findIndex(i => i.batch.id === b.id);
      if (existingIdx === -1) {
        jwItems.push({ batch: b, qty: currentQty, isAlreadyAtDestination: isAlready });
      }
    }
    render('jobwork');
    if (b) {
      showToast(`Batch ${b.batchNo} pre-selected for Job Work Delivery Challan`, 'info');
    }
  }

  return {
    render,
    switchJobWorkTab,
    switchRmTab,
    selectJobWorkVendor,
    selectRmVendor,
    setRmPurpose,
    onRmSelect,
    setRmDispatchQty,
    setRmNotes,
    addRmItem,
    removeJobWorkItem,
    removeRmItem,
    clearJobWorkChallan,
    clearRmChallan,
    confirmJobWorkChallan,
    confirmRmChallan,
    saveJobWorkChallan,
    saveRmChallan,
    deleteChallan,
    printChallan,
    filterJobWorkHistory,
    filterRmHistory,
    refreshHistory,
    checkAutoAdd,
    onBatchEnter,
    onBatchChange,
    startScan,
    addBatchItem,
    addBatchFromQuickMove
  };
})();

window.DeliveryChallanModule = DeliveryChallanModule;
