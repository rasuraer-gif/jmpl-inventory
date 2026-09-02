// ============================================================
// delivery-challan.js — Delivery Challan Module
// ============================================================
const DeliveryChallanModule = (() => {
  let selectedVendorId = '';
  let challanItems = []; // Array of { batch, qty, isAlreadyAtDestination }
  let activeTab = 'create'; // 'create' or 'history'
  let historySearch = '';

  const STAGE_NAMES = {
    production: 'Moulding',
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

  function getBatchCurrentQty(b, stageRecords = null) {
    if (stageRecords && typeof stageRecords.filter !== 'function') {
      const key = `${b.id}_${b.currentStage}`;
      const lastRec = stageRecords[key];
      if (!lastRec) return Number(b.initialQty || 0);
      return lastRec.isRecheck ? Number(lastRec.recheckQty || 0) : Number(lastRec.outputQty || 0);
    }
    const records = stageRecords || DB.StageRecords.all();
    const recs = records.filter(r => r.batchId === b.id && r.movedTo === b.currentStage);
    if (!recs.length) return Number(b.initialQty || 0);
    const lastRec = recs[recs.length - 1];
    return lastRec.isRecheck ? Number(lastRec.recheckQty || 0) : Number(lastRec.outputQty || 0);
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

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    el.innerHTML = `
      <style>
        .dc-compact-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .dc-compact-table th {
          background: var(--bg-secondary);
          padding: 6px 8px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-secondary);
          border: 1px solid var(--border);
          text-align: left;
        }
        .dc-compact-table td {
          padding: 6px 8px;
          font-size: 11.5px;
          border: 1px solid var(--border);
        }
      </style>
      <div class="animate-in">
        <div class="mb-6">
          <h2 class="font-bold" style="font-size:20px;">Subcontractor Delivery Challan</h2>
          <p class="text-sm text-muted mt-1">Generate dispatches and manage stage movements for subcontractors and vendors</p>
        </div>

        <div class="tabs mb-6" id="dc-tabs">
          <button class="tab-btn ${activeTab === 'create' ? 'active' : ''}" onclick="DeliveryChallanModule.switchTab('create')">🚚 Create Challan</button>
          <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" onclick="DeliveryChallanModule.switchTab('history')">📜 Challan History</button>
        </div>

        <div id="dc-module-content">
          ${activeTab === 'create' ? renderCreateTab() : renderHistoryTab()}
        </div>
      </div>
      
      <!-- Warnings / Stage Transition Modal -->
      <div class="modal-overlay hidden" id="dc-confirm-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>Confirm Delivery Challan & Stage Transition</h3>
            <button class="modal-close" onclick="document.getElementById('dc-confirm-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" id="dc-confirm-body">
            <!-- Dynamically populated -->
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('dc-confirm-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="DeliveryChallanModule.saveChallan(true)">Confirm &amp; Generate DC</button>
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
              <p class="text-sm text-muted">Delivery Challan has been saved in the system. Would you like to print it now?</p>
            </div>
          </div>
          <div class="modal-footer" style="justify-content: center; gap: 12px;">
            <button class="btn btn-secondary" onclick="document.getElementById('dc-print-modal').classList.add('hidden')">Cancel (Close)</button>
            <button class="btn btn-primary" id="dc-print-confirm-btn">🖨️ Print Challan</button>
          </div>
        </div>
      </div>
    `;

    // Populate active lists if create tab is active
    if (activeTab === 'create') {
      populateBatchDropdown();
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    render();
  }

  function renderCreateTab() {
    const vendors = DB.Vendors.all().filter(v => v.active !== false && !v.name.toLowerCase().includes('in house'));
    const vendorOpts = '<option value="">Select Vendor...</option>' + 
      vendors.map(v => `<option value="${v.id}" ${v.id === selectedVendorId ? 'selected' : ''}>${v.name} (${v.department === 'deflashing' ? 'Flash Removal' : 'Trimming'})</option>`).join('');

    const vendor = DB.Vendors.find(selectedVendorId);
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

    const tableRows = challanItems.map((item, idx) => {
      const b = item.batch;
      const warnStyle = item.isAlreadyAtDestination ? 'background:rgba(245,158,11,0.05); color:var(--accent-amber); font-weight:700;' : '';
      const warnBadge = item.isAlreadyAtDestination ? `<span class="badge badge-amber ml-2" style="font-size:10px;">Already in ${vendor.department === 'deflashing' ? 'Flash Removal' : 'Trimming'}</span>` : '';
      
      return `
        <tr style="${warnStyle}">
          <td>${idx + 1}</td>
          <td><strong style="color:var(--primary);">${b.batchNo}</strong>${warnBadge}</td>
          <td>${b.partNo}</td>
          <td><span class="badge badge-teal">${b.jmrefNo}</span></td>
          <td style="text-transform:capitalize;">${STAGE_NAMES[b.currentStage] || b.currentStage}</td>
          <td class="font-bold">${formatNum(item.qty)}</td>
          <td>
            <button class="btn btn-ghost btn-xs text-danger" onclick="DeliveryChallanModule.removeItem(${idx})" title="Remove item">🗑️ Remove</button>
          </td>
        </tr>
      `;
    }).join('');

    const totalQty = challanItems.reduce((sum, item) => sum + item.qty, 0);

    return `
      <div class="grid gap-6" style="grid-template-columns: 1fr; @media (min-width: 992px) { grid-template-columns: 350px 1fr; }">
        
        <!-- Left: Configuration Box -->
        <div class="card">
          <div class="card-header"><h3>Challan Details</h3></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Destination Subcontractor Vendor <span class="required">*</span></label>
              <select id="dc-vendor" class="form-control" onchange="DeliveryChallanModule.selectVendor(this.value)">
                ${vendorOpts}
              </select>
              ${vendorDetailHtml}
            </div>

            <div class="form-group mt-4">
              <label class="form-label">Add Batch (Scan or Type) <span class="required">*</span></label>
              <div class="flex gap-2">
                <input type="text" id="dc-batch-input" class="form-control" style="flex:1;" placeholder="Type or scan Batch No..." list="dc-batch-list" onkeydown="if(event.key === 'Enter') { DeliveryChallanModule.addBatchItem(); event.preventDefault(); }">
                <datalist id="dc-batch-list"></datalist>
                <button class="btn btn-secondary" onclick="DeliveryChallanModule.startScan()" style="padding:0 12px; display:flex; align-items:center; justify-content:center; height:42px;" title="Scan QR Code">📷 Scan</button>
              </div>
            </div>

            <button class="btn btn-primary w-full mt-4" onclick="DeliveryChallanModule.addBatchItem()" ${!selectedVendorId ? 'disabled' : ''}>➕ Add Batch to Challan</button>
          </div>
        </div>

        <!-- Right: Challan Items List -->
        <div class="card">
          <div class="card-header" style="flex-direction:row; justify-content:space-between; align-items:center;">
            <h3>Challan Batches List</h3>
            <span class="text-sm font-semibold text-muted">Total Batches: ${challanItems.length} | Qty: ${formatNum(totalQty)} pcs</span>
          </div>
          <div class="table-wrap">
            <table class="dc-compact-table">
              <thead>
                <tr><th>#</th><th>Batch No</th><th>Part No</th><th>JMREF</th><th>Current Stage</th><th>Qty (pcs)</th><th>Action</th></tr>
              </thead>
              <tbody>
                ${tableRows || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No batches added to this challan yet. Select vendor and scan/add batches above.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="card-footer flex justify-end gap-2" style="background:var(--bg-glass-hover); border-top:1px solid var(--border);">
            <button class="btn btn-secondary" onclick="DeliveryChallanModule.clearChallan()" ${!challanItems.length ? 'disabled' : ''}>Reset</button>
            <button class="btn btn-primary" onclick="DeliveryChallanModule.confirmChallan()" ${!challanItems.length ? 'disabled' : ''}>💾 Save &amp; Generate DC</button>
          </div>
        </div>

      </div>
    `;
  }

  function renderHistoryTab() {
    let list = DB.DeliveryChallans.all();
    if (historySearch) {
      const q = historySearch.toLowerCase();
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
          <td class="font-bold">${formatNum(dc.totalQty || 0)}</td>
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
          <h3>Delivery Challan History</h3>
          <div class="search-input" style="max-width:300px; margin:0;">
            <span class="search-icon">&#128269;</span>
            <input type="text" id="dc-history-search" class="form-control" placeholder="Search by DC No or Vendor..." value="${historySearch}" oninput="DeliveryChallanModule.filterHistory(this.value)">
          </div>
        </div>
        <div class="table-wrap">
          <table class="dc-compact-table">
            <thead>
              <tr><th>DC No</th><th>Created At</th><th>Vendor</th><th>Department</th><th>Batches</th><th>Total Qty (pcs)</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No delivery challan records found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function filterHistory(val) {
    historySearch = val;
    const content = document.getElementById('dc-module-content');
    if (content) {
      content.innerHTML = renderHistoryTab();
      const inp = document.getElementById('dc-history-search');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }

  function selectVendor(vendorId) {
    selectedVendorId = vendorId;
    
    // Clear items if changing vendor (since destination changes)
    challanItems = [];
    render();
  }

  function populateBatchDropdown() {
    const dl = document.getElementById('dc-batch-list');
    if (!dl) return;

    let eligibleBatches = DB.Batches.all().filter(b => b.status === 'active');

    // Sort batches alphabetically by Batch No
    eligibleBatches.sort((a,b) => a.batchNo.localeCompare(b.batchNo));

    const stageRecords = DB.StageRecords.all();
    // Build a map of the last record for each batch/stage combination to avoid nested loops (O(N^2))
    const lastRecordMap = {};
    for (let i = 0; i < stageRecords.length; i++) {
      const r = stageRecords[i];
      if (r.batchId && r.movedTo) {
        lastRecordMap[`${r.batchId}_${r.movedTo}`] = r;
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

  function startScan() {
    if (!selectedVendorId) {
      showToast('Please select a Subcontractor Vendor first', 'warning');
      return;
    }
    if (typeof Scanner === 'undefined') {
      showToast('Scanner module not loaded', 'error');
      return;
    }
    Scanner.start(null, (scannedText) => {
      const b = DB.Batches.all().find(x => x.batchNo === scannedText.trim());
      if (!b) {
        showToast('Batch not found: ' + scannedText, 'error');
        return;
      }
      addBatchToChallan(b);
    });
  }

  function addBatchItem() {
    const input = document.getElementById('dc-batch-input');
    if (!input || !input.value.trim()) {
      showToast('Please enter a batch number to add', 'warning');
      return;
    }
    const batchNoVal = input.value.trim();
    const b = DB.Batches.all().find(x => x.batchNo === batchNoVal);
    if (!b) {
      showToast('Batch not found: ' + batchNoVal, 'error');
      return;
    }

    addBatchToChallan(b);
    input.value = '';
    input.focus();
  }

  function addBatchToChallan(b) {
    if (challanItems.some(item => item.batch.id === b.id)) {
      showToast('Batch already added to challan: ' + b.batchNo, 'warning');
      return;
    }

    const vendor = DB.Vendors.find(selectedVendorId);
    if (!vendor) return;

    const qty = getBatchCurrentQty(b);
    const destStage = vendor.department; // 'deflashing' or 'trimming'

    const isAlreadyAtDestination = b.currentStage === destStage;

    challanItems.push({
      batch: b,
      qty,
      isAlreadyAtDestination
    });

    showToast(`Added ${b.batchNo} to challan`, 'success');
    render();
  }

  function removeItem(idx) {
    challanItems.splice(idx, 1);
    render();
  }

  function clearChallan() {
    challanItems = [];
    render();
  }

  function confirmChallan() {
    if (!challanItems.length) return;
    const vendor = DB.Vendors.find(selectedVendorId);
    if (!vendor) return;

    const destStage = vendor.department;
    const destName = destStage === 'deflashing' ? 'Flash Removal' : 'Trimming';

    // Group batches
    const alreadyThere = challanItems.filter(item => item.isAlreadyAtDestination);
    const moveable = challanItems.filter(item => !item.isAlreadyAtDestination);

    let html = '';
    
    if (alreadyThere.length > 0) {
      html += `
        <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.2); border-radius:8px; padding:12px; margin-bottom:16px;">
          <h4 style="color:var(--accent-amber); margin-bottom:6px; font-weight:700;">⚠️ Already in Stage Warning</h4>
          <p class="text-sm">The following batches are <strong>already in the ${destName} stage</strong>. No stage transitions will be performed for them:</p>
          <ul style="padding-left:20px; margin-top:6px;" class="text-xs">
            ${alreadyThere.map(item => `<li>Batch <strong>${item.batch.batchNo}</strong></li>`).join('')}
          </ul>
        </div>
      `;
    }

    if (moveable.length > 0) {
      html += `
        <div style="background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.2); border-radius:8px; padding:12px;">
          <h4 style="color:var(--accent-blue); margin-bottom:6px; font-weight:700;">⚙️ Stage Movements</h4>
          <p class="text-sm">The following batches will automatically transition to the <strong>${destName} stage</strong>:</p>
          <ul style="padding-left:20px; margin-top:6px;" class="text-xs">
            ${moveable.map(item => `<li>Batch <strong>${item.batch.batchNo}</strong> (currently: <span style="text-transform:capitalize;">${STAGE_NAMES[item.batch.currentStage] || item.batch.currentStage}</span>)</li>`).join('')}
          </ul>
        </div>
      `;
    } else if (alreadyThere.length === challanItems.length) {
      html += `
        <div style="background:rgba(0,0,0,0.02); border:1px solid var(--border); border-radius:8px; padding:12px; text-align:center;">
          <p class="text-sm">All batches are already in the destination stage. Delivery Challan will be saved but no batch stages will change.</p>
        </div>
      `;
    }

    document.getElementById('dc-confirm-body').innerHTML = `
      <p class="mb-4">You are generating a Delivery Challan for <strong>${vendor.name}</strong> containing <strong>${challanItems.length} batches</strong> (Total Quantity: <strong>${formatNum(challanItems.reduce((s,i)=>s+i.qty,0))} pcs</strong>).</p>
      ${html}
      <p class="text-sm text-muted mt-4">Please choose if you want to automatically execute stage movements for the eligible batches now.</p>
    `;

    document.getElementById('dc-confirm-modal').classList.remove('hidden');
  }

  function saveChallan(moveBatches = true) {
    const vendor = DB.Vendors.find(selectedVendorId);
    if (!vendor) return;

    const session = Auth.getSession();
    const dateStr = new Date().toISOString().slice(0, 10);
    const destStage = vendor.department; // 'deflashing' or 'trimming'

    // Generate consecutive sequential DC Number
    const allDCs = DB.DeliveryChallans.all();
    const year = new Date().getFullYear();
    const seq = allDCs.filter(d => d.dcNo && d.dcNo.includes(year)).length + 1;
    const dcNo = `DC-JMPL-${year}-${String(seq).padStart(4, '0')}`;

    // Process dispatches and stage record insertions
    challanItems.forEach(item => {
      const b = item.batch;
      if (moveBatches) {
        if (!item.isAlreadyAtDestination) {
          // Record transition
          DB.StageRecords.insert({
            batchId: b.id,
            stage: b.currentStage,
            inputQty: item.qty,
            outputQty: item.qty,
            lossQty: 0,
            vendorId: selectedVendorId,
            movedTo: destStage,
            movedFrom: b.currentStage,
            date: dateStr,
            recordedBy: session?.userId || 'unknown',
            notes: `Dispatched via ${dcNo}`
          });

          // Advance stage
          DB.Batches.update(b.id, {
            currentStage: destStage,
            vendorId: selectedVendorId
          });
        } else {
          // Update vendor even if it is already in the destination stage
          DB.Batches.update(b.id, {
            vendorId: selectedVendorId
          });
        }
      }
    });

    // Save DC Document
    const newDC = DB.DeliveryChallans.insert({
      dcNo,
      vendorId: selectedVendorId || '',
      vendorName: vendor.name || '',
      department: vendor.department || '',
      batches: challanItems.map(item => ({
        batchId: item.batch.id || '',
        batchNo: item.batch.batchNo || '',
        partNo: item.batch.partNo || '',
        jmrefNo: item.batch.jmrefNo || '',
        qty: Number(item.qty || 0),
        sourceStage: item.batch.currentStage || ''
      })),
      totalQty: challanItems.reduce((s,i) => s + Number(i.qty || 0), 0),
      createdAt: new Date().toISOString(),
      createdBy: session?.userId || 'unknown'
    });

    // Hide Modal & Alert
    document.getElementById('dc-confirm-modal').classList.add('hidden');
    showToast(`Delivery Challan ${dcNo} created successfully`, 'success');

    // Clear active states
    challanItems = [];
    selectedVendorId = '';
    
    // Switch to history tab and render
    activeTab = 'history';
    render();

    // Show the non-blocking custom print modal
    const printModal = document.getElementById('dc-print-modal');
    if (printModal) {
      const titleEl = document.getElementById('dc-success-title');
      if (titleEl) titleEl.textContent = `Delivery Challan ${dcNo} Saved`;
      
      const printBtn = document.getElementById('dc-print-confirm-btn');
      if (printBtn) {
        printBtn.onclick = () => {
          printChallan(newDC.id);
          printModal.classList.add('hidden');
        };
      }
      printModal.classList.remove('hidden');
    }
  }

  function deleteChallan(dcId) {
    const dc = DB.DeliveryChallans.find(dcId);
    if (!dc) return;
    
    const confirmDelete = confirm(`Are you sure you want to delete Delivery Challan: ${dc.dcNo}? (This will NOT undo batch stage transitions)`);
    if (confirmDelete) {
      DB.DeliveryChallans.remove(dcId);
      showToast('Delivery Challan deleted', 'success');
      render();
    }
  }

  function printChallan(dcId) {
    const dc = DB.DeliveryChallans.find(dcId);
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
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast('Popup blocker blocked challan preview. Please enable popups.', 'error');
      return;
    }

    const dateFormatted = formatChallanDate(dc.createdAt, false);

    const rows = dc.batches.map((b, idx) => `
      <tr>
        <td style="width: 10%; border: 1px solid #1e293b; padding: 5px; text-align: center;">${idx + 1}</td>
        <td style="width: 65%; border: 1px solid #1e293b; padding: 5px; font-weight: bold;">${b.batchNo}</td>
        <td style="width: 25%; border: 1px solid #1e293b; padding: 5px; text-align: right; font-weight: bold;">${formatNum(b.qty)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${dc.dcNo} - JMPL Delivery Challan</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #1e293b; padding: 5px; margin: 0; line-height: 1.4; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 16px; }
          .logo-container { display: flex; align-items: center; gap: 14px; }
          .logo { height: 48px; width: auto; }
          .company-info { display: flex; flex-direction: column; }
          .company-name { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; color: #0f172a; }
          .company-address { font-size: 9.5px; color: #475569; margin-top: 2px; font-weight: 500; max-width: 480px; }
          .dc-badge { font-size: 12px; font-weight: 700; border: 1.5px solid #1e293b; padding: 5px 12px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; background-color: #f8fafc; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; border: 1px solid #1e293b; table-layout: fixed; }
          th { background-color: #f1f5f9; font-weight: 700; border: 1px solid #1e293b; padding: 6px; text-transform: uppercase; font-size: 9px; }
          td { border: 1px solid #1e293b; padding: 5px; word-wrap: break-word; overflow-wrap: break-word; }
          .total-row td { background: #f8fafc; font-weight: bold; border-top: 2px solid #1e293b; }
          .sig-row { display: flex; justify-content: space-between; margin-top: 50px; font-size: 11px; font-weight: 600; }
          .sig-box { text-align: center; width: 200px; border-top: 1px dashed #64748b; padding-top: 8px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-container">
            <img class="logo" src="${logoUrl}" alt="JMPL Logo">
            <div class="company-info">
              <div class="company-name">Janani Mouldings Pvt Ltd</div>
              <div class="company-address">Survey no, 36 2B, Kelambakkam - Vandalur Rd, Pudupakkam, Tamil Nadu 603103</div>
            </div>
          </div>
          <div class="dc-badge">
            Delivery Challan
          </div>
        </div>

        <!-- Metadata Table Content -->
        <table style="margin-bottom: 16px; table-layout: fixed; width: 100%;">
          <tbody>
            <tr>
              <td style="width: 25%; background-color: #f1f5f9; font-weight: bold;">DC Number:</td>
              <td style="width: 25%; font-weight: bold; font-size: 11px; color: #0f172a;">${dc.dcNo}</td>
              <td style="width: 25%; background-color: #f1f5f9; font-weight: bold;">Challan Date &amp; Time:</td>
              <td style="width: 25%;">${dateFormatted}</td>
            </tr>
            <tr>
              <td style="width: 25%; background-color: #f1f5f9; font-weight: bold;">Subcontractor Vendor:</td>
              <td style="width: 25%; font-weight: bold;">${dc.vendorName}</td>
              <td style="width: 25%; background-color: #f1f5f9; font-weight: bold;">Destination Stage:</td>
              <td style="width: 25%; text-transform: capitalize;">${dc.department === 'deflashing' ? 'Flash Removal' : 'Trimming'} Department</td>
            </tr>
          </tbody>
        </table>

        <table style="table-layout: fixed; width: 100%;">
          <thead>
            <tr>
              <th style="width: 10%; text-align: center;">#</th>
              <th style="width: 65%; text-align: left;">Batch Number</th>
              <th style="width: 25%; text-align: right;">Quantity (pcs)</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="2" style="width: 75%; border: 1px solid #1e293b; padding: 6px; text-align: right; font-weight: bold;">GRAND TOTAL:</td>
              <td style="width: 25%; border: 1px solid #1e293b; padding: 6px; text-align: right; font-size: 10.5px; font-weight: bold;">${formatNum(dc.totalQty)} pcs</td>
            </tr>
          </tbody>
        </table>

        <div class="sig-row">
          <div class="sig-box">Prepared &amp; Dispatched By</div>
          <div class="sig-box">Authorized Signature</div>
          <div class="sig-box">Subcontractor Acknowledgment</div>
        </div>

        <script>
          let printed = false;
          function triggerPrint() {
            if (printed) return;
            printed = true;
            setTimeout(function() {
              window.print();
              window.close();
            }, 300);
          }
          window.onload = function() {
            setTimeout(triggerPrint, 800);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  return {
    render,
    switchTab,
    selectVendor,
    startScan,
    addBatchItem,
    removeItem,
    clearChallan,
    confirmChallan,
    saveChallan,
    deleteChallan,
    printChallan,
    filterHistory
  };
})();
window.DeliveryChallanModule = DeliveryChallanModule;
