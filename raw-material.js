// ============================================================
// raw-material.js — Raw Material Management & GRN Inward Module
// ============================================================
// Allows storekeepers and supervisors to record products and raw
// materials purchased from suppliers based on the Goods Receipt Note (GRN),
// tracks supplier batch traceability, storage locations, and raw material stock.
// ============================================================

const RawMaterialModule = (() => {
  let activeTab = 'create'; // 'create' | 'history' | 'stock' | 'directory'
  let historySearch = '';
  let stockSearch = '';
  let dateFromFilter = '';
  let dateToFilter = '';
  let supplierFilter = '';
  let categoryFilter = '';
  let currentPage = 1;
  let itemsPerPage = 25;
  let stockCurrentPage = 1;
  let stockItemsPerPage = 25;

  // Active form items for current GRN being entered
  let grnItems = [];

  // Active header inputs for current GRN
  let grnHeader = {
    grnNo: '',
    grnDate: '',
    supplierName: '',
    invoiceNo: '',
    invoiceDate: '',
    poNo: '',
    vehicleNo: '',
    receivedBy: '',
    notes: ''
  };

  function captureHeaderInputs() {
    const gNo = document.getElementById('rm-grn-no')?.value;
    const gDate = document.getElementById('rm-grn-date')?.value;
    const sName = document.getElementById('rm-supplier-name')?.value;
    const invNo = document.getElementById('rm-invoice-no')?.value;
    const invDate = document.getElementById('rm-invoice-date')?.value;
    const po = document.getElementById('rm-po-no')?.value;
    const veh = document.getElementById('rm-vehicle-no')?.value;
    const recBy = document.getElementById('rm-received-by')?.value;
    const n = document.getElementById('rm-grn-notes')?.value;

    if (gNo !== undefined) grnHeader.grnNo = gNo;
    if (gDate !== undefined) grnHeader.grnDate = gDate;
    if (sName !== undefined) grnHeader.supplierName = sName;
    if (invNo !== undefined) grnHeader.invoiceNo = invNo;
    if (invDate !== undefined) grnHeader.invoiceDate = invDate;
    if (po !== undefined) grnHeader.poNo = po;
    if (veh !== undefined) grnHeader.vehicleNo = veh;
    if (recBy !== undefined) grnHeader.receivedBy = recBy;
    if (n !== undefined) grnHeader.notes = n;
  }

  function onHeaderChange(field, val) {
    grnHeader[field] = val;
  }

  // Default Standard Categories
  const RM_CATEGORIES = [
    'Rubber Compound',
    'Chemicals & Additives',
    'Metal Inserts',
    'Packaging Materials',
    'Consumables',
    'Finished Goods Purchased',
    'Other'
  ];

  // Default Standard Units of Measurement
  const UOM_OPTIONS = ['kg', 'pcs', 'bags', 'drums', 'meters', 'rolls', 'boxes', 'ltr', 'tons'];

  // Helper to escape HTML safely
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNum(num, decimals = 0) {
    const n = Number(num);
    if (isNaN(n)) return '0';
    return n.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  // Initialize a blank item row
  function createBlankItem() {
    return {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      itemCode: '',
      description: '',
      category: 'Rubber Compound',
      supplierBatchNo: '',
      receivedQty: '',
      uom: 'kg',
      unitRate: '',
      totalAmount: 0,
      storageLocation: '',
      qcStatus: 'Accepted',
      notes: ''
    };
  }

  // Ensure at least one item exists in the form
  function ensureInitialItem() {
    if (!grnItems || grnItems.length === 0) {
      grnItems = [createBlankItem()];
    }
  }

  // Main Render entrypoint
  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    ensureInitialItem();

    const allGrns = DB.GrnRecords ? DB.GrnRecords.all() : [];
    const totalGrnQty = allGrns.reduce((sum, g) => sum + (Number(g.totalQty) || 0), 0);
    const totalGrnAmount = allGrns.reduce((sum, g) => sum + (Number(g.totalAmount) || 0), 0);
    const uniqueSuppliers = new Set(allGrns.map(g => g.supplierName).filter(Boolean));

    // Outward dispatches to Subcontractors via Delivery Challans
    const allDcs = DB.DeliveryChallans ? DB.DeliveryChallans.all() : [];
    const totalDispatchedQty = allDcs.reduce((sum, dc) => sum + (dc.rmItems || []).reduce((s, it) => s + (Number(it.qty) || 0), 0), 0);
    const netAvailableQty = Math.max(0, totalGrnQty - totalDispatchedQty);

    el.innerHTML = `
      <div class="animate-in" style="max-width: 1250px; margin: 0 auto; padding-bottom: 40px;">
        <!-- Header Banner -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom: 20px;">
          <div>
            <h2 class="font-bold" style="font-size:22px; margin:0; display:flex; align-items:center; gap:8px;">
              <span>🧪 Raw Material &amp; GRN Inward</span>
              <span class="badge badge-teal" style="font-size:11px; padding:3px 8px;">Purchases &amp; Inward</span>
            </h2>
            <p class="text-sm text-muted mt-1" style="margin:4px 0 0 0;">
              Record and manage products and raw materials purchased from suppliers based on Goods Receipt Notes (GRN).
            </p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="RawMaterialModule.refreshAll()" title="Refresh data from database">
              🔄 Reload Data
            </button>
            <button class="btn btn-primary btn-sm" onclick="RawMaterialModule.switchTab('create')">
              ⚡ New GRN Entry
            </button>
          </div>
        </div>

        <!-- KPI Summary Cards -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:20px;">
          <div class="stat-card blue" style="cursor:pointer;" onclick="RawMaterialModule.switchTab('history')">
            <div class="stat-label">Total GRNs Created</div>
            <div class="stat-value blue">${formatNum(allGrns.length)}</div>
            <div class="text-xs text-muted mt-1">Receipt notes inwarded to date</div>
          </div>
          <div class="stat-card green" style="cursor:pointer;" onclick="RawMaterialModule.switchTab('stock')">
            <div class="stat-label">Total Inward Qty (GRN)</div>
            <div class="stat-value green">${formatNum(totalGrnQty, 1)} <span style="font-size:13px;font-weight:normal;">units</span></div>
            <div class="text-xs text-muted mt-1">Cumulative materials received</div>
          </div>
          <div class="stat-card amber" style="cursor:pointer;" onclick="RawMaterialModule.switchTab('stock')">
            <div class="stat-label">Dispatched on DC</div>
            <div class="stat-value amber">${formatNum(totalDispatchedQty, 1)} <span style="font-size:13px;font-weight:normal;">units</span></div>
            <div class="text-xs text-muted mt-1">Sent to subcontractors on DC</div>
          </div>
          <div class="stat-card teal" style="cursor:pointer;" onclick="RawMaterialModule.switchTab('stock')">
            <div class="stat-label">Available Stock on Hand</div>
            <div class="stat-value text-success">${formatNum(netAvailableQty, 1)} <span style="font-size:13px;font-weight:normal;">units</span></div>
            <div class="text-xs text-muted mt-1">Inward minus DC dispatches</div>
          </div>
          <div class="stat-card purple" style="cursor:pointer;" onclick="RawMaterialModule.switchTab('directory')">
            <div class="stat-label">Active Suppliers</div>
            <div class="stat-value purple">${uniqueSuppliers.size}</div>
            <div class="text-xs text-muted mt-1">Suppliers providing materials</div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="tabs" style="display:flex; gap:8px; border-bottom:2px solid var(--border); margin-bottom:20px;">
          <button class="tab-btn ${activeTab === 'create' ? 'active' : ''}" onclick="RawMaterialModule.switchTab('create')" style="font-weight:700; padding:10px 18px; border:none; background:none; cursor:pointer; font-size:13.5px; border-bottom: ${activeTab === 'create' ? '3px solid var(--primary)' : '3px solid transparent'}; color: ${activeTab === 'create' ? 'var(--primary)' : 'var(--text-secondary)'};">
            ⚡ New GRN Inward Entry
          </button>
          <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" onclick="RawMaterialModule.switchTab('history')" style="font-weight:700; padding:10px 18px; border:none; background:none; cursor:pointer; font-size:13.5px; border-bottom: ${activeTab === 'history' ? '3px solid var(--primary)' : '3px solid transparent'}; color: ${activeTab === 'history' ? 'var(--primary)' : 'var(--text-secondary)'};">
            📜 GRN Inward History (${allGrns.length})
          </button>
          <button class="tab-btn ${activeTab === 'stock' ? 'active' : ''}" onclick="RawMaterialModule.switchTab('stock')" style="font-weight:700; padding:10px 18px; border:none; background:none; cursor:pointer; font-size:13.5px; border-bottom: ${activeTab === 'stock' ? '3px solid var(--primary)' : '3px solid transparent'}; color: ${activeTab === 'stock' ? 'var(--primary)' : 'var(--text-secondary)'};">
            📦 Raw Material Stock Summary
          </button>
          <button class="tab-btn ${activeTab === 'directory' ? 'active' : ''}" onclick="RawMaterialModule.switchTab('directory')" style="font-weight:700; padding:10px 18px; border:none; background:none; cursor:pointer; font-size:13.5px; border-bottom: ${activeTab === 'directory' ? '3px solid var(--primary)' : '3px solid transparent'}; color: ${activeTab === 'directory' ? 'var(--primary)' : 'var(--text-secondary)'};">
            🏢 Suppliers &amp; Catalog Directory
          </button>
        </div>

        <!-- Tab Content Container -->
        <div id="rm-tab-content">
          ${renderTabContent()}
        </div>
      </div>
    `;
  }

  function renderTabContent() {
    if (activeTab === 'create') {
      return renderCreateTab();
    } else if (activeTab === 'history') {
      return renderHistoryTab();
    } else if (activeTab === 'stock') {
      return renderStockTab();
    } else {
      return renderDirectoryTab();
    }
  }

  // ── TAB 1: NEW GRN INWARD ENTRY ────────────────────────────
  function renderCreateTab() {
    const nextGrnNo = DB.GrnRecords && typeof DB.GrnRecords.nextGrnNo === 'function' 
      ? DB.GrnRecords.nextGrnNo() 
      : 'GRN-' + new Date().getFullYear() + '-0001';
    
    const today = new Date().toISOString().slice(0, 10);
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const currentUserName = session?.name || session?.username || 'Store Supervisor';

    // Suppliers list (display Supplier alone — exclude subcontractors / job workers)
    const suppliers = (DB.Vendors && DB.Vendors.all ? DB.Vendors.all() : [])
      .filter(v => {
        if (v.active === false) return false;
        const name = (v.name || '').toLowerCase();
        if (name.includes('in house')) return false;
        if (v.type === 'subcontractor') return false;
        if (v.department === 'deflashing' || v.department === 'trimming') return false;
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const assignedGrnNo = grnHeader.grnNo || nextGrnNo;
    const assignedGrnDate = grnHeader.grnDate || today;
    const assignedReceivedBy = grnHeader.receivedBy || currentUserName;
    const supplierVal = grnHeader.supplierName || '';
    const hasSupplier = suppliers.some(s => s.name === supplierVal);

    // RM Master catalog of existing raw materials for line items selection
    const existingRm = (DB.RawMaterials && DB.RawMaterials.all ? DB.RawMaterials.all() : [])
      .filter(m => m.active !== false)
      .sort((a, b) => (a.code || a.itemCode || '').localeCompare(b.code || b.itemCode || ''));

    // Calculate totals across line items
    let totalItemsCount = grnItems.length;
    let totalQtySum = grnItems.reduce((sum, item) => sum + (parseFloat(item.receivedQty) || 0), 0);
    let totalAmountSum = grnItems.reduce((sum, item) => sum + (parseFloat(item.totalAmount) || 0), 0);

    const itemsRowsHtml = grnItems.map((item, idx) => {
      const isCustom = !!item.isCustom;
      return `
      <tr id="rm-row-${item.id}">
        <td class="text-muted font-bold text-xs" style="text-align:center;">${idx + 1}</td>
        <td style="min-width:170px;">
          ${isCustom ? `
            <div style="display:flex; gap:4px; align-items:center;">
              <input type="text" class="form-control form-control-sm font-bold text-blue" placeholder="Type custom RM Code"
                value="${escapeHtml(item.itemCode)}" 
                oninput="RawMaterialModule.updateItemField('${item.id}', 'itemCode', this.value)"
                required>
              <button type="button" class="btn btn-ghost btn-xs text-primary" title="Select from RM Master" onclick="RawMaterialModule.toggleCustomCode('${item.id}', false)">📋</button>
            </div>
          ` : `
            <div style="display:flex; gap:4px; align-items:center;">
              <select class="form-control form-control-sm font-bold text-blue" 
                onchange="if(this.value==='__custom__'){RawMaterialModule.toggleCustomCode('${item.id}', true);}else{RawMaterialModule.selectRmItem('${item.id}', this.value);}"
                required>
                <option value="">Select RM Item Code...</option>
                ${existingRm.map(m => {
                  const c = m.code || m.itemCode || '';
                  const n = m.name || m.description || '';
                  const isSel = (item.itemCode || '').toUpperCase() === c.toUpperCase();
                  return `<option value="${escapeHtml(c)}" ${isSel ? 'selected' : ''}>${escapeHtml(c)} — ${escapeHtml(n)}</option>`;
                }).join('')}
                ${item.itemCode && !existingRm.some(m => (m.code || m.itemCode || '').toUpperCase() === item.itemCode.toUpperCase()) ? `
                  <option value="${escapeHtml(item.itemCode)}" selected>${escapeHtml(item.itemCode)}</option>
                ` : ''}
                <option value="__custom__">➕ Type Custom RM Code...</option>
              </select>
            </div>
          `}
        </td>
        <td style="min-width:200px;">
          <input type="text" id="rm-desc-${item.id}" class="form-control form-control-sm font-semibold" placeholder="Material Name &amp; Spec"
            value="${escapeHtml(item.description)}" 
            oninput="RawMaterialModule.updateItemField('${item.id}', 'description', this.value)"
            required>
        </td>
        <td style="min-width:140px;">
          <select id="rm-cat-${item.id}" class="form-control form-control-sm font-semibold" 
            onchange="RawMaterialModule.updateItemField('${item.id}', 'category', this.value)">
            ${RM_CATEGORIES.map(cat => `<option value="${cat}" ${item.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
          </select>
        </td>
        <td style="min-width:130px;">
          <input type="text" class="form-control form-control-sm font-semibold text-purple" placeholder="Supplier Lot / Batch No"
            value="${escapeHtml(item.supplierBatchNo)}" 
            oninput="RawMaterialModule.updateItemField('${item.id}', 'supplierBatchNo', this.value)">
        </td>
        <td style="min-width:90px;">
          <input type="number" step="any" min="0.001" class="form-control form-control-sm font-bold text-primary" placeholder="Qty"
            value="${escapeHtml(item.receivedQty)}" 
            oninput="RawMaterialModule.updateItemField('${item.id}', 'receivedQty', this.value)"
            required>
        </td>
        <td style="width:75px;">
          <select id="rm-uom-${item.id}" class="form-control form-control-sm" 
            onchange="RawMaterialModule.updateItemField('${item.id}', 'uom', this.value)">
            ${UOM_OPTIONS.map(u => `<option value="${u}" ${item.uom === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </td>
        <td style="min-width:90px;">
          <input type="number" id="rm-rate-${item.id}" step="any" min="0" class="form-control form-control-sm" placeholder="₹ Rate"
            value="${escapeHtml(item.unitRate)}" 
            oninput="RawMaterialModule.updateItemField('${item.id}', 'unitRate', this.value)">
        </td>
        <td class="font-bold text-success text-xs" style="text-align:right; white-space:nowrap;" id="rm-amt-${item.id}">
          ₹ ${formatNum(item.totalAmount, 2)}
        </td>
        <td style="min-width:110px;">
          <input type="text" id="rm-loc-${item.id}" class="form-control form-control-sm" placeholder="e.g. Rack A1"
            value="${escapeHtml(item.storageLocation)}" 
            oninput="RawMaterialModule.updateItemField('${item.id}', 'storageLocation', this.value)">
        </td>
        <td style="min-width:120px;">
          <select class="form-control form-control-sm" style="font-size:11px;"
            onchange="RawMaterialModule.updateItemField('${item.id}', 'qcStatus', this.value)">
            <option value="Accepted" ${item.qcStatus === 'Accepted' ? 'selected' : ''}>✅ Accepted</option>
            <option value="Under Inspection" ${item.qcStatus === 'Under Inspection' ? 'selected' : ''}>⏳ Pending QC</option>
            <option value="Rejected" ${item.qcStatus === 'Rejected' ? 'selected' : ''}>❌ Rejected</option>
          </select>
        </td>
        <td style="text-align:center;">
          ${grnItems.length > 1 ? `
            <button type="button" class="btn btn-ghost btn-xs text-danger" title="Remove Item" onclick="RawMaterialModule.removeItemRow('${item.id}')">
              🗑️
            </button>
          ` : `
            <span class="text-muted text-xs">—</span>
          `}
        </td>
      </tr>
    `}).join('');

    return `
      <div class="card animate-in" style="border:1px solid var(--border); border-radius:12px; padding:20px;">
        <form id="rm-grn-form" onsubmit="event.preventDefault(); RawMaterialModule.submitGrn();">
          
          <!-- Document Header Section -->
          <div style="background:var(--bg-glass); border:1px solid var(--border); border-radius:10px; padding:16px; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:14px;">
              <h3 style="margin:0; font-size:16px; font-weight:700; display:flex; align-items:center; gap:8px;">
                <span>📋 Goods Receipt Note (GRN) Inward Details</span>
              </h3>
              <div class="badge badge-purple" style="font-size:12px; padding:4px 10px;">
                Auto-assigned: <strong>${assignedGrnNo}</strong>
              </div>
            </div>

            <div class="grid grid-4" style="gap:14px;">
              <div>
                <label class="form-label font-bold text-xs">GRN Number <span class="text-danger">*</span></label>
                <input type="text" id="rm-grn-no" class="form-control font-bold text-blue" value="${escapeHtml(assignedGrnNo)}" required oninput="RawMaterialModule.onHeaderChange('grnNo', this.value)">
              </div>

              <div>
                <label class="form-label font-bold text-xs">GRN Receipt Date <span class="text-danger">*</span></label>
                <input type="date" id="rm-grn-date" class="form-control" value="${escapeHtml(assignedGrnDate)}" required oninput="RawMaterialModule.onHeaderChange('grnDate', this.value)">
              </div>

              <div>
                <label class="form-label font-bold text-xs">Supplier <span class="text-danger">*</span></label>
                <select id="rm-supplier-name" class="form-control font-semibold" required onchange="RawMaterialModule.onHeaderChange('supplierName', this.value)">
                  <option value="">Select Supplier...</option>
                  ${suppliers.map(s => `
                    <option value="${escapeHtml(s.name)}" ${supplierVal === s.name ? 'selected' : ''}>
                      ${escapeHtml(s.name)}${s.city ? ` (${escapeHtml(s.city)})` : ''}
                    </option>
                  `).join('')}
                  ${supplierVal && !hasSupplier ? `<option value="${escapeHtml(supplierVal)}" selected>${escapeHtml(supplierVal)}</option>` : ''}
                </select>
              </div>

              <div>
                <label class="form-label font-bold text-xs">Supplier Invoice / Bill No <span class="text-danger">*</span></label>
                <input type="text" id="rm-invoice-no" class="form-control font-semibold" placeholder="e.g. INV-2026-904" value="${escapeHtml(grnHeader.invoiceNo || '')}" required oninput="RawMaterialModule.onHeaderChange('invoiceNo', this.value)">
              </div>

              <div>
                <label class="form-label font-bold text-xs">Invoice Date</label>
                <input type="date" id="rm-invoice-date" class="form-control" value="${escapeHtml(grnHeader.invoiceDate || today)}" oninput="RawMaterialModule.onHeaderChange('invoiceDate', this.value)">
              </div>

              <div>
                <label class="form-label font-bold text-xs">Purchase Order (PO) No</label>
                <input type="text" id="rm-po-no" class="form-control" placeholder="e.g. PO-8841" value="${escapeHtml(grnHeader.poNo || '')}" oninput="RawMaterialModule.onHeaderChange('poNo', this.value)">
              </div>

              <div>
                <label class="form-label font-bold text-xs">Vehicle / Delivery Challan No</label>
                <input type="text" id="rm-vehicle-no" class="form-control" placeholder="e.g. TN-37-AK-5001" value="${escapeHtml(grnHeader.vehicleNo || '')}" oninput="RawMaterialModule.onHeaderChange('vehicleNo', this.value)">
              </div>

              <div>
                <label class="form-label font-bold text-xs">Received By</label>
                <input type="text" id="rm-received-by" class="form-control" value="${escapeHtml(assignedReceivedBy)}" oninput="RawMaterialModule.onHeaderChange('receivedBy', this.value)">
              </div>
            </div>

            <div style="margin-top:12px;">
              <label class="form-label font-bold text-xs">Inward Remarks / General Notes</label>
              <input type="text" id="rm-grn-notes" class="form-control" placeholder="Optional remarks on vehicle condition, packaging, or unloading..." value="${escapeHtml(grnHeader.notes || '')}" oninput="RawMaterialModule.onHeaderChange('notes', this.value)">
            </div>
          </div>

          <!-- Line Items Table Section -->
          <div style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
              <div>
                <h4 style="margin:0; font-size:15px; font-weight:700;">📦 Products &amp; Materials Received (Line Items)</h4>
                <p class="text-xs text-muted" style="margin:2px 0 0 0;">Select RM Item Code to auto-fill Category and Material Name &amp; Spec.</p>
              </div>
              <button type="button" class="btn btn-secondary btn-sm font-bold" onclick="RawMaterialModule.addItemRow()">
                ➕ Add Line Item
              </button>
            </div>

            <div class="table-responsive" style="border:1px solid var(--border); border-radius:8px;">
              <table class="table" style="font-size:12.5px; margin-bottom:0;">
                <thead>
                  <tr style="background:var(--bg-glass);">
                    <th style="width:36px; text-align:center;">#</th>
                    <th style="min-width:170px;">Item / RM Code *</th>
                    <th style="min-width:200px;">Material Name &amp; Spec *</th>
                    <th style="min-width:140px;">Category</th>
                    <th style="min-width:130px;">Supplier Batch / Lot</th>
                    <th style="min-width:90px;">Received Qty *</th>
                    <th style="width:75px;">UOM</th>
                    <th style="min-width:90px;">Unit Rate (₹)</th>
                    <th style="min-width:100px; text-align:right;">Amount (₹)</th>
                    <th style="min-width:110px;">Storage Rack</th>
                    <th style="min-width:120px;">QC Status</th>
                    <th style="width:40px; text-align:center;">Action</th>
                  </tr>
                </thead>
                <tbody id="rm-items-tbody">
                  ${itemsRowsHtml}
                </tbody>
              </table>
            </div>

            <!-- Summary Footbar -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; background:var(--bg-glass); border:1px solid var(--border); border-top:none; border-radius:0 0 8px 8px; padding:12px 16px;">
              <div>
                <button type="button" class="btn btn-ghost btn-xs text-blue font-bold" onclick="RawMaterialModule.addItemRow()">
                  ➕ Add Another Item
                </button>
              </div>
              <div style="display:flex; gap:20px; font-size:13px; align-items:center;">
                <div>Total Items: <strong>${totalItemsCount}</strong></div>
                <div>Total Received Qty: <strong class="text-primary" id="rm-total-qty-foot" style="font-size:14px;">${formatNum(totalQtySum, 2)}</strong></div>
                <div>Total Inward Amount: <strong class="text-success" id="rm-total-amt-foot" style="font-size:15px;">₹ ${formatNum(totalAmountSum, 2)}</strong></div>
              </div>
            </div>
          </div>

          <!-- Submit Buttons -->
          <div style="display:flex; justify-content:flex-end; gap:12px; align-items:center; padding-top:10px; border-top:1px solid var(--border);">
            <button type="button" class="btn btn-ghost" onclick="RawMaterialModule.resetForm()">
              ✕ Clear Form
            </button>
            <button type="button" class="btn btn-secondary btn-lg font-bold" onclick="RawMaterialModule.submitGrn(true)">
              🖨️ Save &amp; Print GRN Slip
            </button>
            <button type="submit" id="rm-submit-btn" class="btn btn-primary btn-lg font-bold" style="padding:10px 24px;">
              💾 Save GRN Inward
            </button>
          </div>
        </form>
      </div>
    `;
  }

  // ── TAB 2: GRN INWARD HISTORY ──────────────────────────────
  function renderHistoryTab() {
    let list = DB.GrnRecords ? DB.GrnRecords.all() : [];

    // Filter by search query
    if (historySearch) {
      const q = historySearch.toLowerCase().trim();
      list = list.filter(g => {
        return (
          (g.grnNo && g.grnNo.toLowerCase().includes(q)) ||
          (g.supplierName && g.supplierName.toLowerCase().includes(q)) ||
          (g.invoiceNo && g.invoiceNo.toLowerCase().includes(q)) ||
          (g.poNo && g.poNo.toLowerCase().includes(q)) ||
          (g.items && g.items.some(i => (i.itemCode && i.itemCode.toLowerCase().includes(q)) || (i.description && i.description.toLowerCase().includes(q))))
        );
      });
    }

    // Filter by Date Range
    if (dateFromFilter) {
      list = list.filter(g => (g.grnDate || '').slice(0, 10) >= dateFromFilter);
    }
    if (dateToFilter) {
      list = list.filter(g => (g.grnDate || '').slice(0, 10) <= dateToFilter);
    }

    // Filter by Supplier
    if (supplierFilter) {
      list = list.filter(g => g.supplierName === supplierFilter);
    }

    const totalItems = list.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageItems = list.slice(startIdx, startIdx + itemsPerPage);

    const rowsHtml = pageItems.map((g, idx) => {
      const itemCount = (g.items || []).length;
      const itemsPreview = (g.items || []).map(i => `${i.itemCode || i.description} (${i.receivedQty} ${i.uom})`).join(', ');

      return `
        <tr>
          <td class="text-muted text-xs font-semibold" style="text-align:center;">${startIdx + idx + 1}</td>
          <td>
            <span class="font-bold text-blue" style="font-size:13px; cursor:pointer;" onclick="RawMaterialModule.viewGrnDetails('${g.id}')">
              ${escapeHtml(g.grnNo)}
            </span>
          </td>
          <td style="white-space:nowrap; font-size:12px;">${g.grnDate || '—'}</td>
          <td>
            <strong style="color:var(--text);">${escapeHtml(g.supplierName || '—')}</strong>
          </td>
          <td class="text-xs">
            <div><strong>${escapeHtml(g.invoiceNo || '—')}</strong></div>
            <div class="text-muted">${g.invoiceDate || ''}</div>
          </td>
          <td class="text-xs text-muted">${escapeHtml(g.poNo || '—')}</td>
          <td style="text-align:center;">
            <span class="badge badge-purple font-bold">${itemCount}</span>
          </td>
          <td class="font-bold text-primary" style="white-space:nowrap;">
            ${formatNum(g.totalQty, 2)}
          </td>
          <td class="font-bold text-success" style="white-space:nowrap;">
            ₹ ${formatNum(g.totalAmount, 2)}
          </td>
          <td class="text-xs text-muted" style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(itemsPreview)}">
            ${escapeHtml(itemsPreview || '—')}
          </td>
          <td class="text-xs text-muted">${escapeHtml(g.receivedBy || '—')}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-ghost btn-xs text-blue" onclick="RawMaterialModule.viewGrnDetails('${g.id}')" title="View GRN Details">
              👁️ View
            </button>
            <button class="btn btn-teal btn-xs" onclick="RawMaterialModule.printGrn('${g.id}')" title="Print Goods Receipt Note">
              🖨️ Print
            </button>
            ${typeof Auth !== 'undefined' && Auth.isAdmin() ? `
              <button class="btn btn-ghost btn-xs text-danger" onclick="RawMaterialModule.deleteGrn('${g.id}')" title="Delete GRN (Admin)">
                🗑️
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    // Pagination numbers
    let pageButtonsHtml = '';
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      pageButtonsHtml += `
        <button class="btn ${p === currentPage ? 'btn-primary' : 'btn-secondary'} btn-xs font-bold" 
          onclick="RawMaterialModule.changePage(${p})">
          ${p}
        </button>
      `;
    }

    const allSuppliers = Array.from(new Set((DB.GrnRecords?.all() || []).map(g => g.supplierName).filter(Boolean)));

    return `
      <div class="card animate-in" style="border:1px solid var(--border); border-radius:12px; padding:16px;">
        
        <!-- Filter Toolbar -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 style="font-size:16px; font-weight:700; margin:0;">📜 Goods Receipt Notes (GRN) Inward Register</h3>
            <p class="text-xs text-muted mt-1" style="margin:2px 0 0 0;">Historical log of raw materials and purchased items inwarded from suppliers.</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="RawMaterialModule.exportHistoryToExcel()" title="Export Register to Excel">
              📊 Export Excel
            </button>
            <button class="btn btn-secondary btn-sm" onclick="RawMaterialModule.refreshAll()" title="Reload from database">
              🔄 Refresh
            </button>
          </div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; background:var(--bg-glass); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:16px; align-items:flex-end;">
          <div style="flex:2; min-width:200px;">
            <label class="form-label text-xs font-bold mb-1">Search</label>
            <div class="search-input" style="margin:0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" class="form-control form-control-sm" placeholder="GRN, Supplier, Invoice, Item..." 
                value="${escapeHtml(historySearch)}" 
                oninput="RawMaterialModule.filterHistory(this.value)">
            </div>
          </div>

          <div style="flex:1; min-width:140px;">
            <label class="form-label text-xs font-bold mb-1">From Date</label>
            <input type="date" class="form-control form-control-sm" value="${dateFromFilter}" 
              onchange="RawMaterialModule.setDateFilter(this.value, 'from')">
          </div>

          <div style="flex:1; min-width:140px;">
            <label class="form-label text-xs font-bold mb-1">To Date</label>
            <input type="date" class="form-control form-control-sm" value="${dateToFilter}" 
              onchange="RawMaterialModule.setDateFilter(this.value, 'to')">
          </div>

          <div style="flex:1.5; min-width:160px;">
            <label class="form-label text-xs font-bold mb-1">Supplier</label>
            <select class="form-control form-control-sm" onchange="RawMaterialModule.setSupplierFilter(this.value)">
              <option value="">All Suppliers</option>
              ${allSuppliers.map(s => `<option value="${escapeHtml(s)}" ${supplierFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
            </select>
          </div>

          <div>
            <button class="btn btn-ghost btn-sm" onclick="RawMaterialModule.clearHistoryFilters()">✕ Clear</button>
          </div>
        </div>

        <!-- Table -->
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th style="width:36px; text-align:center;">#</th>
                <th>GRN Number</th>
                <th>GRN Date</th>
                <th>Supplier</th>
                <th>Invoice Details</th>
                <th>PO No</th>
                <th style="text-align:center;">Items</th>
                <th>Total Qty</th>
                <th>Total Amount</th>
                <th>Materials Summary</th>
                <th>Received By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="12" style="text-align:center; padding:32px;" class="text-muted">No GRN records found matching criteria.</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:14px; font-size:12px; border-top:1px solid var(--border); padding-top:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="text-muted">Show</span>
            <select class="form-control form-control-sm" style="width:75px; padding:2px 6px; font-size:12px;" onchange="RawMaterialModule.changeItemsPerPage(this.value)">
              <option value="10" ${itemsPerPage === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${itemsPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>100</option>
            </select>
            <span class="text-muted">entries | Showing <strong>${totalItems > 0 ? startIdx + 1 : 0}</strong> to <strong>${Math.min(startIdx + itemsPerPage, totalItems)}</strong> of <strong>${totalItems}</strong></span>
          </div>
          ${totalPages > 1 ? `
            <div style="display:flex; align-items:center; gap:4px;">
              <button class="btn btn-secondary btn-xs" ${currentPage <= 1 ? 'disabled' : ''} onclick="RawMaterialModule.changePage(${currentPage - 1})">◀ Prev</button>
              ${pageButtonsHtml}
              <button class="btn btn-secondary btn-xs" ${currentPage >= totalPages ? 'disabled' : ''} onclick="RawMaterialModule.changePage(${currentPage + 1})">Next ▶</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ── TAB 3: RAW MATERIAL STOCK SUMMARY ──────────────────────
  function renderStockTab() {
    const allGrns = DB.GrnRecords ? DB.GrnRecords.all() : [];
    const allDcs = DB.DeliveryChallans ? DB.DeliveryChallans.all() : [];

    // Aggregate inventory by Item Code
    const stockMap = new Map();

    // 1. Inward purchases from GRNs
    allGrns.forEach(grn => {
      (grn.items || []).forEach(item => {
        const code = (item.itemCode || '').trim().toUpperCase();
        if (!code) return;

        let entry = stockMap.get(code);
        if (!entry) {
          entry = {
            itemCode: item.itemCode,
            description: item.description || '',
            category: item.category || 'Rubber Compound',
            totalReceived: 0,
            totalDispatched: 0,
            uom: item.uom || 'kg',
            totalValue: 0,
            locations: new Set(),
            suppliers: new Set(),
            subcontractors: new Set(),
            lastReceivedDate: grn.grnDate || '',
            lastSupplier: grn.supplierName || '',
            grnCount: 0,
            dcCount: 0
          };
          stockMap.set(code, entry);
        }

        const q = parseFloat(item.receivedQty) || 0;
        entry.totalReceived += q;
        entry.totalValue += (parseFloat(item.totalAmount) || 0);
        entry.grnCount++;

        if (item.storageLocation) entry.locations.add(item.storageLocation);
        if (grn.supplierName) entry.suppliers.add(grn.supplierName);

        if ((grn.grnDate || '') > (entry.lastReceivedDate || '')) {
          entry.lastReceivedDate = grn.grnDate;
          entry.lastSupplier = grn.supplierName;
        }
      });
    });

    // 2. Outward dispatches to Subcontractors via Delivery Challans
    allDcs.forEach(dc => {
      (dc.rmItems || []).forEach(item => {
        const code = (item.itemCode || '').trim().toUpperCase();
        if (!code) return;

        let entry = stockMap.get(code);
        if (!entry) {
          entry = {
            itemCode: item.itemCode,
            description: item.name || item.description || '',
            category: item.category || 'Rubber Compound',
            totalReceived: 0,
            totalDispatched: 0,
            uom: item.uom || 'kg',
            totalValue: 0,
            locations: new Set(),
            suppliers: new Set(),
            subcontractors: new Set(),
            lastReceivedDate: '',
            lastSupplier: '',
            grnCount: 0,
            dcCount: 0
          };
          stockMap.set(code, entry);
        }

        const q = parseFloat(item.qty) || 0;
        entry.totalDispatched = (entry.totalDispatched || 0) + q;
        entry.dcCount = (entry.dcCount || 0) + 1;
        if (dc.vendorName) entry.subcontractors.add(dc.vendorName);
      });
    });

    let stockList = Array.from(stockMap.values());
    stockList.forEach(entry => {
      entry.totalDispatched = entry.totalDispatched || 0;
      entry.availableStock = Math.max(0, entry.totalReceived - entry.totalDispatched);
    });

    // Filter stock
    if (stockSearch) {
      const q = stockSearch.toLowerCase().trim();
      stockList = stockList.filter(s => {
        return (
          s.itemCode.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.lastSupplier.toLowerCase().includes(q)
        );
      });
    }

    if (categoryFilter) {
      stockList = stockList.filter(s => s.category === categoryFilter);
    }

    stockList.sort((a, b) => b.totalReceived - a.totalReceived);

    const totalItems = stockList.length;
    const totalPages = Math.ceil(totalItems / stockItemsPerPage) || 1;
    if (stockCurrentPage > totalPages) stockCurrentPage = totalPages;
    if (stockCurrentPage < 1) stockCurrentPage = 1;

    const startIdx = (stockCurrentPage - 1) * stockItemsPerPage;
    const pageItems = stockList.slice(startIdx, startIdx + stockItemsPerPage);

    const rowsHtml = pageItems.map((s, idx) => `
      <tr>
        <td class="text-muted text-xs font-semibold" style="text-align:center;">${startIdx + idx + 1}</td>
        <td><strong class="text-blue" style="font-size:13px;">${escapeHtml(s.itemCode)}</strong></td>
        <td>${escapeHtml(s.description || '—')}</td>
        <td><span class="badge badge-teal">${escapeHtml(s.category)}</span></td>
        <td class="font-semibold text-muted" style="white-space:nowrap;">
          ${formatNum(s.totalReceived, 2)} <span style="font-size:11px;">${s.uom}</span>
        </td>
        <td class="font-semibold text-amber" style="white-space:nowrap;">
          ${formatNum(s.totalDispatched, 2)} <span style="font-size:11px;">${s.uom}</span>
        </td>
        <td class="font-bold ${s.availableStock > 0 ? 'text-success' : 'text-danger'}" style="font-size:14px; white-space:nowrap;">
          ${formatNum(s.availableStock, 2)} <span style="font-size:11px; font-weight:normal;">${s.uom}</span>
        </td>
        <td class="text-xs text-muted" style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${Array.from(s.locations).join(', ') || '—'}
        </td>
        <td class="text-xs font-semibold">${escapeHtml(s.lastSupplier || '—')}</td>
        <td style="text-align:center; white-space:nowrap;">
          <span class="badge badge-purple">${s.grnCount} GRNs</span>
          ${s.dcCount > 0 ? `<span class="badge badge-amber" style="margin-left:4px;">${s.dcCount} DCs</span>` : ''}
        </td>
      </tr>
    `).join('');

    return `
      <div class="card animate-in" style="border:1px solid var(--border); border-radius:12px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h3 style="font-size:16px; font-weight:700; margin:0;">📦 Raw Material Inventory &amp; Stock Summary</h3>
            <p class="text-xs text-muted mt-1" style="margin:2px 0 0 0;">Manage and track available on-hand stock: Inward purchases (GRN) minus dispatches to Subcontractors (DC).</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="search-input" style="max-width:260px; margin:0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" class="form-control form-control-sm" placeholder="Search item, grade, category..." 
                value="${escapeHtml(stockSearch)}" 
                oninput="RawMaterialModule.filterStock(this.value)">
            </div>
            <select class="form-control form-control-sm" style="max-width:180px;" onchange="RawMaterialModule.setCategoryFilter(this.value)">
              <option value="">All Categories</option>
              ${RM_CATEGORIES.map(c => `<option value="${c}" ${categoryFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th style="width:36px; text-align:center;">#</th>
                <th>Item Code</th>
                <th>Material Name &amp; Grade</th>
                <th>Category</th>
                <th>Total Inward (GRN)</th>
                <th>Dispatched on DC</th>
                <th>Available On-Hand Stock</th>
                <th>Storage Racks</th>
                <th>Last Supplier</th>
                <th style="text-align:center;">Activity</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="10" style="text-align:center; padding:32px;" class="text-muted">No raw materials found in stock records.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12px; border-top:1px solid var(--border); padding-top:12px;">
          <div class="text-muted">Showing <strong>${totalItems > 0 ? startIdx + 1 : 0}</strong> to <strong>${Math.min(startIdx + stockItemsPerPage, totalItems)}</strong> of <strong>${totalItems}</strong> materials</div>
          ${totalPages > 1 ? `
            <div style="display:flex; gap:6px;">
              <button class="btn btn-secondary btn-xs" ${stockCurrentPage <= 1 ? 'disabled' : ''} onclick="RawMaterialModule.changeStockPage(${stockCurrentPage - 1})">◀ Prev</button>
              <span class="px-2 py-1 font-semibold">Page ${stockCurrentPage} of ${totalPages}</span>
              <button class="btn btn-secondary btn-xs" ${stockCurrentPage >= totalPages ? 'disabled' : ''} onclick="RawMaterialModule.changeStockPage(${stockCurrentPage + 1})">Next ▶</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ── TAB 4: SUPPLIERS & CATALOG DIRECTORY ───────────────────
  function renderDirectoryTab() {
    const rmCatalog = DB.RawMaterials ? DB.RawMaterials.all() : [];
    const suppliers = (DB.Vendors ? (DB.Vendors.all ? DB.Vendors.all() : []) : [])
      .filter(v => v.active !== false && v.type !== 'subcontractor' && v.department !== 'deflashing' && v.department !== 'trimming' && !v.name.toLowerCase().includes('in house'));

    return `
      <div class="animate-in" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
        <!-- Left: Quick Raw Materials Catalog -->
        <div class="card" style="border:1px solid var(--border); border-radius:12px; padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h3 style="font-size:15px; font-weight:700; margin:0;">🧪 Registered Raw Materials</h3>
            <button class="btn btn-primary btn-xs font-bold" onclick="RawMaterialModule.openAddRmModal()">
              ➕ Add Material
            </button>
          </div>
          <p class="text-xs text-muted" style="margin-top:-6px; margin-bottom:12px;">Pre-defined raw material codes that autocomplete in the GRN form.</p>

          <div class="table-responsive" style="max-height:450px; overflow-y:auto;">
            <table class="table" style="font-size:12px;">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name &amp; Description</th>
                  <th>Category</th>
                  <th>UOM</th>
                </tr>
              </thead>
              <tbody>
                ${rmCatalog.length ? rmCatalog.map(m => `
                  <tr>
                    <td><strong class="text-blue">${escapeHtml(m.code || m.itemCode)}</strong></td>
                    <td>${escapeHtml(m.name || m.description || '—')}</td>
                    <td><span class="badge badge-teal">${escapeHtml(m.category || '—')}</span></td>
                    <td>${escapeHtml(m.uom || 'kg')}</td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="4" class="text-center text-muted p-4">No pre-registered materials yet. Items typed into GRNs will automatically register here.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right: Active Raw Material Suppliers -->
        <div class="card" style="border:1px solid var(--border); border-radius:12px; padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h3 style="font-size:15px; font-weight:700; margin:0;">🏢 Supplier Directory</h3>
            <button class="btn btn-primary btn-xs font-bold" onclick="RawMaterialModule.openAddSupplierModal()">
              ➕ Add Supplier
            </button>
          </div>
          <p class="text-xs text-muted" style="margin-top:-6px; margin-bottom:12px;">Suppliers delivering rubber compounds, chemicals, and raw materials.</p>

          <div class="table-responsive" style="max-height:450px; overflow-y:auto;">
            <table class="table" style="font-size:12px;">
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>Contact Person / Phone</th>
                  <th>City / State</th>
                  <th>GST / Status</th>
                </tr>
              </thead>
              <tbody>
                ${suppliers.length ? suppliers.map(v => `
                  <tr>
                    <td><strong style="color:var(--text);">${escapeHtml(v.name)}</strong></td>
                    <td class="text-xs text-muted">${escapeHtml(v.phone || v.contact || '—')}</td>
                    <td class="text-xs text-muted">${escapeHtml(v.city || v.address || '—')}</td>
                    <td><span class="badge ${v.active !== false ? 'badge-green' : 'badge-red'}">${v.active !== false ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                `).join('') : `
                  <tr><td colspan="4" class="text-center text-muted p-4">No suppliers configured. Click "+ Add Supplier" to register.</td></tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ── DYNAMIC ITEM ROW MANAGEMENT ───────────────────────────
  function addItemRow() {
    captureHeaderInputs();
    grnItems.push(createBlankItem());
    render();
    setTimeout(() => {
      const tbody = document.getElementById('rm-items-tbody');
      if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        if (rows.length) rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }

  function removeItemRow(itemId) {
    if (grnItems.length <= 1) {
      if (typeof showToast === 'function') showToast('A GRN must contain at least one line item', 'info');
      return;
    }
    captureHeaderInputs();
    grnItems = grnItems.filter(i => i.id !== itemId);
    render();
  }

  function selectRmItem(itemId, code) {
    captureHeaderInputs();
    const item = grnItems.find(i => i.id === itemId);
    if (!item) return;

    const cleanCode = (code || '').trim().toUpperCase();
    item.itemCode = cleanCode;

    if (!cleanCode) {
      item.description = '';
      render();
      return;
    }

    const allMaterials = DB.RawMaterials ? DB.RawMaterials.all() : [];
    const matched = allMaterials.find(m => 
      (m.code || m.itemCode || '').trim().toUpperCase() === cleanCode
    );

    if (matched) {
      // Auto-fill Material Name & Spec
      let specStr = matched.name || matched.description || cleanCode;
      if (matched.hardness && !specStr.includes(matched.hardness)) {
        specStr += ` (${matched.hardness})`;
      }
      if (matched.polymerType && !specStr.includes(matched.polymerType)) {
        specStr += ` [${matched.polymerType}]`;
      }
      item.description = specStr;

      // Auto-fill Category
      item.category = matched.category || 'Rubber Compound';

      // Auto-fill UOM
      if (matched.uom) item.uom = matched.uom;

      // Auto-fill Rate
      if (matched.rate) {
        item.unitRate = matched.rate;
        const q = parseFloat(item.receivedQty) || 0;
        item.totalAmount = q * parseFloat(item.unitRate);
      }

      // Auto-fill Storage Location
      if (matched.storageLocation) {
        item.storageLocation = matched.storageLocation;
      }
    }

    render();
  }

  function toggleCustomCode(itemId, isCustom) {
    captureHeaderInputs();
    const item = grnItems.find(i => i.id === itemId);
    if (item) {
      item.isCustom = isCustom;
      render();
    }
  }

  function updateItemField(itemId, field, value) {
    const item = grnItems.find(i => i.id === itemId);
    if (!item) return;

    item[field] = value;

    // Auto-calculate total amount
    if (field === 'receivedQty' || field === 'unitRate') {
      const q = parseFloat(item.receivedQty) || 0;
      const r = parseFloat(item.unitRate) || 0;
      item.totalAmount = q * r;

      const amtCell = document.getElementById(`rm-amt-${itemId}`);
      if (amtCell) amtCell.innerHTML = `₹ ${formatNum(item.totalAmount, 2)}`;

      const totalQtySum = grnItems.reduce((sum, it) => sum + (parseFloat(it.receivedQty) || 0), 0);
      const totalAmountSum = grnItems.reduce((sum, it) => sum + (parseFloat(it.totalAmount) || 0), 0);
      const qtyFoot = document.getElementById('rm-total-qty-foot');
      if (qtyFoot) qtyFoot.innerText = formatNum(totalQtySum, 2);
      const amtFoot = document.getElementById('rm-total-amt-foot');
      if (amtFoot) amtFoot.innerText = `₹ ${formatNum(totalAmountSum, 2)}`;
    }
  }

  function resetForm() {
    grnHeader = {
      grnNo: '',
      grnDate: '',
      supplierName: '',
      invoiceNo: '',
      invoiceDate: '',
      poNo: '',
      vehicleNo: '',
      receivedBy: '',
      notes: ''
    };
    grnItems = [createBlankItem()];
    render();
    if (typeof showToast === 'function') showToast('Form cleared', 'info');
  }

  // ── SUBMIT GRN ─────────────────────────────────────────────
  async function submitGrn(shouldPrint = false) {
    captureHeaderInputs();
    const grnNo = (grnHeader.grnNo || document.getElementById('rm-grn-no')?.value || '').trim();
    const grnDate = (grnHeader.grnDate || document.getElementById('rm-grn-date')?.value || '').trim();
    const supplierName = (grnHeader.supplierName || document.getElementById('rm-supplier-name')?.value || '').trim();
    const invoiceNo = (grnHeader.invoiceNo || document.getElementById('rm-invoice-no')?.value || '').trim();
    const invoiceDate = (grnHeader.invoiceDate || document.getElementById('rm-invoice-date')?.value || '').trim();
    const poNo = (grnHeader.poNo || document.getElementById('rm-po-no')?.value || '').trim();
    const vehicleNo = (grnHeader.vehicleNo || document.getElementById('rm-vehicle-no')?.value || '').trim();
    const receivedBy = (grnHeader.receivedBy || document.getElementById('rm-received-by')?.value || '').trim();
    const notes = (grnHeader.notes || document.getElementById('rm-grn-notes')?.value || '').trim();

    if (!grnNo) {
      if (typeof showToast === 'function') showToast('Please provide a valid GRN Number', 'error');
      if (grnNoInput) grnNoInput.focus();
      return;
    }

    if (!supplierName) {
      if (typeof showToast === 'function') showToast('Please select or enter the Supplier Name', 'error');
      if (supplierInput) supplierInput.focus();
      return;
    }

    if (!invoiceNo) {
      if (typeof showToast === 'function') showToast('Please enter the Supplier Invoice / Bill Number', 'error');
      if (invoiceNoInput) invoiceNoInput.focus();
      return;
    }

    // Validate line items
    const validItems = [];
    for (let i = 0; i < grnItems.length; i++) {
      const it = grnItems[i];
      const code = (it.itemCode || '').trim();
      const desc = (it.description || '').trim();
      const qty = parseFloat(it.receivedQty);

      if (!code && !desc && isNaN(qty)) continue; // ignore empty trailing row

      if (!code) {
        if (typeof showToast === 'function') showToast(`Item #${i + 1}: Please enter Item Code`, 'error');
        return;
      }
      if (!desc) {
        if (typeof showToast === 'function') showToast(`Item #${i + 1}: Please enter Material Name / Description`, 'error');
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        if (typeof showToast === 'function') showToast(`Item #${i + 1} (${code}): Please enter a valid quantity greater than 0`, 'error');
        return;
      }

      validItems.push({
        itemCode: code,
        description: desc,
        category: it.category || 'Rubber Compound',
        supplierBatchNo: (it.supplierBatchNo || '').trim(),
        receivedQty: qty,
        acceptedQty: it.qcStatus === 'Rejected' ? 0 : qty,
        rejectedQty: it.qcStatus === 'Rejected' ? qty : 0,
        uom: it.uom || 'kg',
        unitRate: parseFloat(it.unitRate) || 0,
        totalAmount: (parseFloat(it.unitRate) || 0) * qty,
        storageLocation: (it.storageLocation || '').trim(),
        qcStatus: it.qcStatus || 'Accepted',
        notes: (it.notes || '').trim()
      });
    }

    if (validItems.length === 0) {
      if (typeof showToast === 'function') showToast('Please add at least one valid item with positive quantity', 'error');
      return;
    }

    const totalQty = validItems.reduce((sum, it) => sum + it.receivedQty, 0);
    const totalAmount = validItems.reduce((sum, it) => sum + it.totalAmount, 0);

    const submitBtn = document.getElementById('rm-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳ Saving GRN Record...</span>';
    }

    try {
      const nowIso = new Date().toISOString();
      const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;

      // 1. Create GRN Record
      const newGrn = {
        grnNo,
        grnDate: grnDate || nowIso.slice(0, 10),
        supplierName,
        invoiceNo,
        invoiceDate: invoiceDate || grnDate,
        poNo,
        vehicleNo,
        receivedBy: receivedBy || session?.name || 'Supervisor',
        notes,
        items: validItems,
        totalItems: validItems.length,
        totalQty,
        totalAmount,
        status: 'Completed',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const savedGrn = DB.GrnRecords.insert(newGrn);

      // 2. Auto-register new materials into catalog if they don't exist yet
      if (DB.RawMaterials) {
        validItems.forEach(it => {
          const existing = DB.RawMaterials.byCode(it.itemCode);
          if (!existing) {
            DB.RawMaterials.insert({
              code: it.itemCode,
              name: it.description,
              category: it.category,
              uom: it.uom,
              rate: it.unitRate,
              lastSupplier: supplierName,
              createdAt: nowIso
            });
          }
        });
      }

      // 3. Auto-register supplier into Vendors if not existing
      if (DB.Vendors && DB.Vendors.all) {
        const vendorList = DB.Vendors.all();
        const exists = vendorList.some(v => v.name && v.name.trim().toLowerCase() === supplierName.toLowerCase());
        if (!exists) {
          DB.Vendors.insert({
            name: supplierName,
            department: 'Raw Material Supplier',
            active: true,
            createdAt: nowIso
          });
        }
      }

      // 4. Log in AuditLogs
      if (DB.AuditLogs && typeof DB.AuditLogs.log === 'function') {
        DB.AuditLogs.log('GRN_INWARD_CREATED', 'stores', `Generated GRN ${grnNo} from ${supplierName} (${validItems.length} items, Qty: ${totalQty})`);
      }

      if (typeof showToast === 'function') {
        showToast(`✅ GRN ${grnNo} saved successfully with ${validItems.length} items!`, 'success');
      }

      // Reset form and switch to history
      grnHeader = {
        grnNo: '',
        grnDate: '',
        supplierName: '',
        invoiceNo: '',
        invoiceDate: '',
        poNo: '',
        vehicleNo: '',
        receivedBy: '',
        notes: ''
      };
      grnItems = [createBlankItem()];

      if (shouldPrint && savedGrn) {
        printGrn(savedGrn.id);
      }

      activeTab = 'history';
      render();

    } catch (err) {
      console.error('Error saving GRN:', err);
      if (typeof showToast === 'function') {
        showToast(`Failed to save GRN: ${err.message || err}`, 'error');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Save GRN Inward';
      }
    }
  }

  // ── VIEW GRN DETAILS MODAL ─────────────────────────────────
  function viewGrnDetails(grnId) {
    const grn = DB.GrnRecords ? DB.GrnRecords.find(grnId) : null;
    if (!grn) {
      if (typeof showToast === 'function') showToast('GRN record not found', 'error');
      return;
    }

    const itemsHtml = (grn.items || []).map((it, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td><strong class="text-blue">${escapeHtml(it.itemCode)}</strong></td>
        <td>${escapeHtml(it.description)}</td>
        <td><span class="badge badge-teal">${escapeHtml(it.category || '—')}</span></td>
        <td class="text-purple font-semibold">${escapeHtml(it.supplierBatchNo || '—')}</td>
        <td class="font-bold text-primary">${formatNum(it.receivedQty, 2)} ${it.uom || ''}</td>
        <td>₹ ${formatNum(it.unitRate, 2)}</td>
        <td class="font-bold text-success">₹ ${formatNum(it.totalAmount, 2)}</td>
        <td>${escapeHtml(it.storageLocation || '—')}</td>
        <td>
          <span class="badge ${it.qcStatus === 'Accepted' ? 'badge-green' : (it.qcStatus === 'Rejected' ? 'badge-red' : 'badge-amber')}">
            ${it.qcStatus || 'Accepted'}
          </span>
        </td>
      </tr>
    `).join('');

    const modalHtml = `
      <div id="rm-details-modal" class="modal-backdrop animate-in" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.65); z-index:9999; padding:20px;">
        <div class="card" style="width:100%; max-width:960px; max-height:90vh; overflow-y:auto; border-radius:12px; padding:24px; background:var(--bg-card); box-shadow:0 20px 40px rgba(0,0,0,0.4); border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:18px;">
            <div>
              <h3 style="margin:0; font-size:18px; font-weight:800; display:flex; align-items:center; gap:8px;">
                <span>📋 Goods Receipt Note: <strong class="text-blue">${escapeHtml(grn.grnNo)}</strong></span>
                <span class="badge badge-green" style="font-size:11px;">Completed</span>
              </h3>
              <p class="text-xs text-muted" style="margin:4px 0 0 0;">Received on ${grn.grnDate || '—'} from ${escapeHtml(grn.supplierName || '—')}</p>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-teal btn-sm" onclick="RawMaterialModule.printGrn('${grn.id}')">
                🖨️ Print GRN
              </button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rm-details-modal')?.remove()">
                ✕ Close
              </button>
            </div>
          </div>

          <!-- Document Header Info Grid -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; background:var(--bg-glass); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:20px; font-size:12.5px;">
            <div><span class="text-muted">Supplier:</span> <strong>${escapeHtml(grn.supplierName)}</strong></div>
            <div><span class="text-muted">Invoice No:</span> <strong>${escapeHtml(grn.invoiceNo)}</strong></div>
            <div><span class="text-muted">Invoice Date:</span> <strong>${grn.invoiceDate || '—'}</strong></div>
            <div><span class="text-muted">PO Number:</span> <strong>${escapeHtml(grn.poNo || '—')}</strong></div>
            <div><span class="text-muted">Vehicle No:</span> <strong>${escapeHtml(grn.vehicleNo || '—')}</strong></div>
            <div><span class="text-muted">Received By:</span> <strong>${escapeHtml(grn.receivedBy || '—')}</strong></div>
            <div><span class="text-muted">Total Qty:</span> <strong class="text-primary">${formatNum(grn.totalQty, 2)}</strong></div>
            <div><span class="text-muted">Total Value:</span> <strong class="text-success">₹ ${formatNum(grn.totalAmount, 2)}</strong></div>
          </div>

          ${grn.notes ? `
            <div style="background:rgba(99,102,241,0.06); border-left:3px solid var(--primary); padding:8px 12px; border-radius:4px; font-size:12px; margin-bottom:18px;">
              <strong>Remarks:</strong> ${escapeHtml(grn.notes)}
            </div>
          ` : ''}

          <!-- Items Table -->
          <h4 style="margin:0 0 10px 0; font-size:14px; font-weight:700;">📦 Line Items Breakdown</h4>
          <div class="table-responsive" style="border:1px solid var(--border); border-radius:8px; margin-bottom:20px;">
            <table class="table" style="font-size:12px; margin-bottom:0;">
              <thead>
                <tr style="background:var(--bg-glass);">
                  <th style="width:36px; text-align:center;">#</th>
                  <th>Item Code</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Supplier Batch</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Rack</th>
                  <th>QC Status</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('rm-details-modal')?.remove()">
              Close Window
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('rm-details-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  // ── PRINT GOODS RECEIPT NOTE (GRN) ─────────────────────────
  function printGrn(grnId) {
    const grn = DB.GrnRecords ? DB.GrnRecords.find(grnId) : null;
    if (!grn) {
      if (typeof showToast === 'function') showToast('GRN not found for printing', 'error');
      return;
    }

    const itemsHtml = (grn.items || []).map((it, idx) => `
      <tr>
        <td style="text-align:center; padding:6px; border:1px solid #000;">${idx + 1}</td>
        <td style="padding:6px; border:1px solid #000; font-weight:bold;">${escapeHtml(it.itemCode)}</td>
        <td style="padding:6px; border:1px solid #000;">${escapeHtml(it.description)}</td>
        <td style="padding:6px; border:1px solid #000; font-family:monospace;">${escapeHtml(it.supplierBatchNo || '—')}</td>
        <td style="text-align:right; padding:6px; border:1px solid #000; font-weight:bold;">${formatNum(it.receivedQty, 2)}</td>
        <td style="text-align:center; padding:6px; border:1px solid #000;">${it.uom || 'kg'}</td>
        <td style="text-align:center; padding:6px; border:1px solid #000;">${escapeHtml(it.storageLocation || '—')}</td>
        <td style="text-align:center; padding:6px; border:1px solid #000; font-weight:bold;">${it.qcStatus || 'Accepted'}</td>
      </tr>
    `).join('');

    const printWindow = window.open('', '_blank', 'width=880,height=900');
    if (!printWindow) {
      if (typeof showToast === 'function') showToast('Pop-up blocked. Please allow pop-ups to print GRN.', 'error');
      return;
    }

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GRN - ${escapeHtml(grn.grnNo)}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; margin: 0; padding: 15px; }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          .title-box { text-align: center; border: 2px solid #000; padding: 8px; margin-bottom: 14px; background: #f4f4f4; }
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
          .meta-table td { padding: 5px 8px; border: 1px solid #999; font-size: 10.5pt; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .items-table th { background: #eee; padding: 6px; border: 1px solid #000; font-size: 10pt; text-align: left; }
          .items-table td { padding: 6px; border: 1px solid #000; font-size: 10pt; }
          .sign-table { width: 100%; border-collapse: collapse; margin-top: 40px; }
          .sign-table td { text-align: center; vertical-align: bottom; height: 65px; border-top: 1px dashed #444; font-size: 10pt; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:15px; text-align:right;">
          <button onclick="window.print()" style="padding:8px 16px; background:#1b7a43; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">🖨️ Print Document</button>
        </div>

        <table class="header-table">
          <tr>
            <td style="width:90px; vertical-align:middle;">
              <img src="logo.png" style="width:75px; height:auto;" onerror="this.style.display='none'">
            </td>
            <td style="vertical-align:middle; text-align:center;">
              <h2 style="margin:0; font-size:18pt; text-transform:uppercase; letter-spacing:0.5px;">Janani Mouldings Private Limited</h2>
              <p style="margin:2px 0 0 0; font-size:9.5pt;">Precision Rubber &amp; Polymer Moulded Products</p>
              <p style="margin:2px 0 0 0; font-size:9pt; color:#555;">Factory &amp; Registered Office: Coimbatore, Tamil Nadu, India</p>
            </td>
          </tr>
        </table>

        <div class="title-box">
          <h3 style="margin:0; font-size:13pt; text-transform:uppercase; letter-spacing:1px;">GOODS RECEIPT NOTE (GRN)</h3>
        </div>

        <table class="meta-table">
          <tr>
            <td style="width:20%; font-weight:bold; background:#fafafa;">GRN Number:</td>
            <td style="width:30%; font-weight:bold; font-size:11pt;">${escapeHtml(grn.grnNo)}</td>
            <td style="width:20%; font-weight:bold; background:#fafafa;">GRN Date:</td>
            <td style="width:30%; font-weight:bold;">${grn.grnDate || '—'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold; background:#fafafa;">Supplier:</td>
            <td style="font-weight:bold;">${escapeHtml(grn.supplierName)}</td>
            <td style="font-weight:bold; background:#fafafa;">Invoice No &amp; Date:</td>
            <td><strong>${escapeHtml(grn.invoiceNo)}</strong> (${grn.invoiceDate || '—'})</td>
          </tr>
          <tr>
            <td style="font-weight:bold; background:#fafafa;">Purchase Order No:</td>
            <td>${escapeHtml(grn.poNo || '—')}</td>
            <td style="font-weight:bold; background:#fafafa;">Vehicle / DC No:</td>
            <td>${escapeHtml(grn.vehicleNo || '—')}</td>
          </tr>
          <tr>
            <td style="font-weight:bold; background:#fafafa;">Received By:</td>
            <td>${escapeHtml(grn.receivedBy || '—')}</td>
            <td style="font-weight:bold; background:#fafafa;">Total Items:</td>
            <td><strong>${(grn.items || []).length} items</strong> (Total: ${formatNum(grn.totalQty, 2)})</td>
          </tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:30px; text-align:center;">#</th>
              <th>Material / Item Code</th>
              <th>Description / Specification</th>
              <th>Supplier Batch / Heat</th>
              <th style="text-align:right;">Qty Received</th>
              <th style="text-align:center;">Unit</th>
              <th style="text-align:center;">Storage Rack</th>
              <th style="text-align:center;">QC Result</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr style="background:#fafafa; font-weight:bold;">
              <td colspan="4" style="text-align:right; border:1px solid #000; padding:6px;">TOTAL RECEIVED QUANTITY:</td>
              <td style="text-align:right; border:1px solid #000; padding:6px; font-size:11pt;">${formatNum(grn.totalQty, 2)}</td>
              <td colspan="3" style="border:1px solid #000;"></td>
            </tr>
          </tfoot>
        </table>

        ${grn.notes ? `
          <div style="margin-bottom:20px; font-size:10pt;">
            <strong>Remarks / Inspection Notes:</strong> ${escapeHtml(grn.notes)}
          </div>
        ` : ''}

        <table class="sign-table">
          <tr>
            <td style="width:25%;">Received By (Stores)</td>
            <td style="width:25%;">Inspected By (QC)</td>
            <td style="width:25%;">Stores In-Charge</td>
            <td style="width:25%;">Authorized Signatory</td>
          </tr>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(printHtml);
    printWindow.document.close();
  }

  // ── EXPORT REGISTER TO EXCEL ───────────────────────────────
  function exportHistoryToExcel() {
    if (typeof XLSX === 'undefined') {
      if (typeof showToast === 'function') showToast('Excel export library not available', 'error');
      return;
    }

    const allGrns = DB.GrnRecords ? DB.GrnRecords.all() : [];
    if (!allGrns.length) {
      if (typeof showToast === 'function') showToast('No GRN records available to export', 'info');
      return;
    }

    const data = [];
    allGrns.forEach(g => {
      (g.items || []).forEach(it => {
        data.push({
          'GRN No': g.grnNo,
          'GRN Date': g.grnDate,
          'Supplier': g.supplierName,
          'Invoice No': g.invoiceNo,
          'Invoice Date': g.invoiceDate,
          'PO No': g.poNo || '',
          'Vehicle No': g.vehicleNo || '',
          'Item Code': it.itemCode,
          'Material Name': it.description,
          'Category': it.category,
          'Supplier Batch No': it.supplierBatchNo || '',
          'Received Qty': it.receivedQty,
          'UOM': it.uom,
          'Unit Rate (INR)': it.unitRate || 0,
          'Total Value (INR)': it.totalAmount || 0,
          'Storage Location': it.storageLocation || '',
          'QC Status': it.qcStatus || 'Accepted',
          'Received By': g.receivedBy || ''
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GRN_Register');

    const fileName = `JMPL_GRN_Register_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);

    if (typeof showToast === 'function') showToast(`Exported ${data.length} items to ${fileName}`, 'success');
  }

  // ── DELETE GRN ─────────────────────────────────────────────
  function deleteGrn(grnId) {
    const grn = DB.GrnRecords ? DB.GrnRecords.find(grnId) : null;
    if (!grn) return;

    const conf = confirm(`Are you sure you want to delete GRN "${grn.grnNo}" from "${grn.supplierName}"?\n\nThis will remove the inward record.`);
    if (!conf) return;

    try {
      DB.GrnRecords.remove(grnId);
      if (typeof showToast === 'function') showToast(`GRN ${grn.grnNo} deleted`, 'info');
      render();
    } catch (e) {
      console.error(e);
      if (typeof showToast === 'function') showToast('Failed to delete GRN', 'error');
    }
  }

  // ── MODALS FOR DIRECTORY ───────────────────────────────────
  function openAddRmModal() {
    const modalHtml = `
      <div id="rm-add-modal" class="modal-backdrop animate-in" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.65); z-index:9999; padding:20px;">
        <div class="card" style="width:100%; max-width:480px; border-radius:12px; padding:20px; background:var(--bg-card); box-shadow:0 20px 40px rgba(0,0,0,0.4); border:1px solid var(--border);">
          <h3 style="margin:0 0 14px 0; font-size:16px; font-weight:700;">➕ Register Raw Material Item</h3>
          <form onsubmit="event.preventDefault(); RawMaterialModule.saveNewRawMaterial();">
            <div style="margin-bottom:12px;">
              <label class="form-label text-xs font-bold">Item / Material Code *</label>
              <input type="text" id="new-rm-code" class="form-control" placeholder="e.g. RM-NBR-70-BLK" required>
            </div>
            <div style="margin-bottom:12px;">
              <label class="form-label text-xs font-bold">Material Name &amp; Description *</label>
              <input type="text" id="new-rm-name" class="form-control" placeholder="e.g. Nitrile Rubber Compound 70 Shore A" required>
            </div>
            <div style="margin-bottom:12px;">
              <label class="form-label text-xs font-bold">Category</label>
              <select id="new-rm-category" class="form-control">
                ${RM_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
              <div>
                <label class="form-label text-xs font-bold">UOM</label>
                <select id="new-rm-uom" class="form-control">
                  ${UOM_OPTIONS.map(u => `<option value="${u}">${u}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label text-xs font-bold">Approx Rate (₹)</label>
                <input type="number" step="any" min="0" id="new-rm-rate" class="form-control" placeholder="Optional">
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
              <button type="button" class="btn btn-ghost" onclick="document.getElementById('rm-add-modal')?.remove()">Cancel</button>
              <button type="submit" class="btn btn-primary font-bold">Save Material</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.getElementById('rm-add-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function saveNewRawMaterial() {
    const code = document.getElementById('new-rm-code')?.value.trim();
    const name = document.getElementById('new-rm-name')?.value.trim();
    const category = document.getElementById('new-rm-category')?.value;
    const uom = document.getElementById('new-rm-uom')?.value;
    const rate = parseFloat(document.getElementById('new-rm-rate')?.value) || 0;

    if (!code || !name) {
      if (typeof showToast === 'function') showToast('Code and Name are required', 'error');
      return;
    }

    if (DB.RawMaterials) {
      DB.RawMaterials.insert({
        code,
        name,
        category,
        uom,
        rate,
        createdAt: new Date().toISOString()
      });
      if (typeof showToast === 'function') showToast(`Registered material "${code}"`, 'success');
    }

    document.getElementById('rm-add-modal')?.remove();
    render();
  }

  function openAddSupplierModal() {
    const modalHtml = `
      <div id="rm-add-supp-modal" class="modal-backdrop animate-in" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.65); z-index:9999; padding:20px;">
        <div class="card" style="width:100%; max-width:480px; border-radius:12px; padding:20px; background:var(--bg-card); box-shadow:0 20px 40px rgba(0,0,0,0.4); border:1px solid var(--border);">
          <h3 style="margin:0 0 14px 0; font-size:16px; font-weight:700;">➕ Register Raw Material Supplier</h3>
          <form onsubmit="event.preventDefault(); RawMaterialModule.saveNewSupplier();">
            <div style="margin-bottom:12px;">
              <label class="form-label text-xs font-bold">Supplier / Company Name *</label>
              <input type="text" id="new-supp-name" class="form-control" placeholder="e.g. Apex Polymer Compounds Ltd" required>
            </div>
            <div style="margin-bottom:12px;">
              <label class="form-label text-xs font-bold">Contact Person / Phone</label>
              <input type="text" id="new-supp-phone" class="form-control" placeholder="Contact number or person">
            </div>
            <div style="margin-bottom:12px;">
              <label class="form-label text-xs font-bold">Address / City</label>
              <input type="text" id="new-supp-city" class="form-control" placeholder="City, State">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
              <button type="button" class="btn btn-ghost" onclick="document.getElementById('rm-add-supp-modal')?.remove()">Cancel</button>
              <button type="submit" class="btn btn-primary font-bold">Save Supplier</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.getElementById('rm-add-supp-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function saveNewSupplier() {
    const name = document.getElementById('new-supp-name')?.value.trim();
    const phone = document.getElementById('new-supp-phone')?.value.trim();
    const city = document.getElementById('new-supp-city')?.value.trim();

    if (!name) {
      if (typeof showToast === 'function') showToast('Supplier Name is required', 'error');
      return;
    }

    if (DB.Vendors) {
      DB.Vendors.insert({
        name,
        phone,
        city,
        department: 'Raw Material Supplier',
        active: true,
        createdAt: new Date().toISOString()
      });
      if (typeof showToast === 'function') showToast(`Registered supplier "${name}"`, 'success');
    }

    document.getElementById('rm-add-supp-modal')?.remove();
    render();
  }

  // ── CONTROLLER FILTERS & TABS ──────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    currentPage = 1;
    stockCurrentPage = 1;
    render();
  }

  function filterHistory(q) {
    historySearch = q;
    currentPage = 1;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab();
    }
  }

  function setDateFilter(val, type) {
    if (type === 'from') dateFromFilter = val;
    else dateToFilter = val;
    currentPage = 1;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab();
    }
  }

  function setSupplierFilter(val) {
    supplierFilter = val;
    currentPage = 1;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab();
    }
  }

  function clearHistoryFilters() {
    historySearch = '';
    dateFromFilter = '';
    dateToFilter = '';
    supplierFilter = '';
    currentPage = 1;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab();
    }
  }

  function filterStock(q) {
    stockSearch = q;
    stockCurrentPage = 1;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'stock') {
      content.innerHTML = renderStockTab();
    }
  }

  function setCategoryFilter(val) {
    categoryFilter = val;
    stockCurrentPage = 1;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'stock') {
      content.innerHTML = renderStockTab();
    }
  }

  function changePage(p) {
    currentPage = p;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab();
    }
  }

  function changeItemsPerPage(n) {
    itemsPerPage = parseInt(n, 10) || 25;
    currentPage = 1;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'history') {
      content.innerHTML = renderHistoryTab();
    }
  }

  function changeStockPage(p) {
    stockCurrentPage = p;
    const content = document.getElementById('rm-tab-content');
    if (content && activeTab === 'stock') {
      content.innerHTML = renderStockTab();
    }
  }

  async function refreshAll() {
    if (DB.GrnRecords && typeof DB.GrnRecords.fetchFromCloud === 'function') {
      await DB.GrnRecords.fetchFromCloud();
    }
    if (DB.RawMaterials && typeof DB.RawMaterials.fetchFromCloud === 'function') {
      await DB.RawMaterials.fetchFromCloud();
    }
    render();
    if (typeof showToast === 'function') showToast('Raw Material records reloaded', 'info');
  }

  return {
    render,
    switchTab,
    addItemRow,
    removeItemRow,
    updateItemField,
    selectRmItem,
    toggleCustomCode,
    onHeaderChange,
    resetForm,
    submitGrn,
    viewGrnDetails,
    printGrn,
    exportHistoryToExcel,
    deleteGrn,
    filterHistory,
    setDateFilter,
    setSupplierFilter,
    clearHistoryFilters,
    filterStock,
    setCategoryFilter,
    changePage,
    changeItemsPerPage,
    changeStockPage,
    refreshAll,
    openAddRmModal,
    saveNewRawMaterial,
    openAddSupplierModal,
    saveNewSupplier
  };
})();

if (typeof window !== 'undefined') {
  window.RawMaterialModule = RawMaterialModule;
}
