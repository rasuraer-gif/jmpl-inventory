// ============================================================
// rm-master.js — Raw Material Master (RM Master) Module
// ============================================================
// Central catalog and specification master for all Raw Materials,
// Polymer Compounds, Chemicals, Metal Inserts, and Packaging.
// Tracks live available on-hand stock and minimum reorder levels.
// ============================================================

const RmMasterModule = (() => {
  let searchQuery = '';
  let categoryFilter = '';
  let polymerFilter = '';
  let statusFilter = 'all'; // 'all' | 'active' | 'inactive' | 'reorder'
  let currentPage = 1;
  let itemsPerPage = 20;
  let sortField = 'code';
  let sortDir = 'asc';

  // Standard Master Definitions
  const RM_CATEGORIES = [
    'Rubber Compound',
    'Chemicals & Additives',
    'Metal Inserts',
    'Packaging Materials',
    'Consumables',
    'Finished Goods Purchased',
    'Other'
  ];

  const POLYMER_TYPES = [
    'NBR (Nitrile Rubber)',
    'HNBR (Hydrogenated Nitrile)',
    'EPDM (Ethylene Propylene)',
    'Silicone / VMQ',
    'FKM / Viton',
    'CR / Neoprene',
    'Natural Rubber (NR)',
    'SBR (Styrene Butadiene)',
    'ACM / AEM (Polyacrylate)',
    'Metal / Brass Insert',
    'Chemical Additive',
    'Packaging Corrugation',
    'Other'
  ];

  const UOM_LIST = ['kg', 'pcs', 'bags', 'drums', 'meters', 'rolls', 'boxes', 'ltr', 'tons'];

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

  // Real-time stock aggregator: Inward receipts (GRN) minus Outward dispatches (DC)
  function getLiveStockMap() {
    const stockMap = new Map();

    // 1. Inward receipts from GRNs
    const allGrns = DB.GrnRecords ? DB.GrnRecords.all() : [];
    allGrns.forEach(grn => {
      (grn.items || []).forEach(it => {
        const code = (it.itemCode || '').trim().toUpperCase();
        if (!code) return;
        let entry = stockMap.get(code);
        if (!entry) {
          entry = { inward: 0, dispatched: 0, uom: it.uom || 'kg' };
          stockMap.set(code, entry);
        }
        entry.inward += (parseFloat(it.receivedQty) || 0);
        if (it.uom) entry.uom = it.uom;
      });
    });

    // 2. Outward dispatches to Subcontractors via Delivery Challans
    const allDcs = DB.DeliveryChallans ? DB.DeliveryChallans.all() : [];
    allDcs.forEach(dc => {
      (dc.rmItems || []).forEach(it => {
        const code = (it.itemCode || '').trim().toUpperCase();
        if (!code) return;
        let entry = stockMap.get(code);
        if (!entry) {
          entry = { inward: 0, dispatched: 0, consumed: 0, uom: it.uom || 'kg' };
          stockMap.set(code, entry);
        }
        entry.dispatched += (parseFloat(it.qty) || 0);
      });
    });

    // 3. Consumed in Production Batches
    const allBatches = DB.Batches ? DB.Batches.all() : [];
    allBatches.forEach(b => {
      if (b.sourceRmCode && b.rmConsumedQty) {
        const code = (b.sourceRmCode || '').trim().toUpperCase();
        let entry = stockMap.get(code);
        if (!entry) {
          entry = { inward: 0, dispatched: 0, consumed: 0, uom: 'kg' };
          stockMap.set(code, entry);
        }
        entry.consumed = (entry.consumed || 0) + (parseFloat(b.rmConsumedQty) || 0);
      }
    });

    // Calculate 3-State Stock:
    // 1. Warehouse Balance = Inward - Dispatched
    // 2. Under Process at Subcontractor = Dispatched - Consumed
    // 3. Consumed in Moulding / Batches = Consumed
    stockMap.forEach(e => {
      e.warehouseBalance = Math.max(0, e.inward - e.dispatched);
      e.underProcess = Math.max(0, e.dispatched - (e.consumed || 0));
      e.available = e.warehouseBalance;
    });

    return stockMap;
  }

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const materials = DB.RawMaterials ? DB.RawMaterials.all() : [];
    const stockMap = getLiveStockMap();

    // KPI Metrics
    const totalMaterials = materials.length;
    const activeMaterials = materials.filter(m => m.active !== false).length;
    const compoundCount = materials.filter(m => (m.category || '').toLowerCase().includes('rubber')).length;
    
    let lowStockCount = 0;
    let totalStockUnits = 0;
    let totalUnderProcessUnits = 0;

    materials.forEach(m => {
      const code = (m.code || m.itemCode || '').trim().toUpperCase();
      const stock = stockMap.get(code);
      const avail = stock ? stock.warehouseBalance : 0;
      const up = stock ? stock.underProcess : 0;
      totalStockUnits += avail;
      totalUnderProcessUnits += up;
      const minStock = parseFloat(m.minStock) || 0;
      if (minStock > 0 && avail <= minStock) {
        lowStockCount++;
      }
    });

    // Filter and Sort Materials
    let filtered = materials.filter(m => {
      const code = (m.code || m.itemCode || '').toUpperCase();
      const name = (m.name || m.description || '').toLowerCase();
      const cat = (m.category || '').toLowerCase();
      const poly = (m.polymerType || '').toLowerCase();
      const supp = (m.supplierName || '').toLowerCase();
      const linked = (m.linkedJmref || '').toLowerCase();

      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const match = code.toLowerCase().includes(q) || name.includes(q) || cat.includes(q) || poly.includes(q) || supp.includes(q) || linked.includes(q);
        if (!match) return false;
      }

      if (categoryFilter && m.category !== categoryFilter) return false;
      if (polymerFilter && m.polymerType !== polymerFilter) return false;

      if (statusFilter === 'active' && m.active === false) return false;
      if (statusFilter === 'inactive' && m.active !== false) return false;
      if (statusFilter === 'reorder') {
        const stock = stockMap.get(code);
        const avail = stock ? stock.warehouseBalance : 0;
        const minStock = parseFloat(m.minStock) || 0;
        if (minStock <= 0 || avail > minStock) return false;
      }

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';
      if (sortField === 'stock') {
        const stockA = stockMap.get((a.code || a.itemCode || '').toUpperCase());
        const stockB = stockMap.get((b.code || b.itemCode || '').toUpperCase());
        valA = stockA ? stockA.warehouseBalance : 0;
        valB = stockB ? stockB.warehouseBalance : 0;
        return sortDir === 'asc' ? valA - valB : valB - valA;
      }
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const paged = filtered.slice(startIdx, startIdx + itemsPerPage);

    // Table rows
    const rowsHtml = paged.map((m, idx) => {
      const code = (m.code || m.itemCode || '').trim();
      const stock = stockMap.get(code.toUpperCase());
      const availStock = stock ? stock.warehouseBalance : 0;
      const underProcessStock = stock ? stock.underProcess : 0;
      const minStock = parseFloat(m.minStock) || 0;
      const isLowStock = minStock > 0 && availStock <= minStock;
      const uom = m.uom || 'kg';
      const linked = m.linkedJmref ? `<span class="badge badge-blue font-bold" title="Linked to Finished Good Master">🎯 ${escapeHtml(m.linkedJmref)}</span>` : '<span class="text-muted">—</span>';

      return `
        <tr>
          <td class="text-muted text-xs font-semibold" style="text-align:center;">${startIdx + idx + 1}</td>
          <td>
            <div style="display:flex; align-items:center; gap:6px;">
              <strong style="color:var(--primary); font-size:13px;">${escapeHtml(code)}</strong>
              ${isLowStock ? '<span class="badge badge-amber text-xs" title="Stock is at or below minimum reorder level">⚠️ Reorder</span>' : ''}
            </div>
          </td>
          <td>
            <div class="font-bold" style="font-size:12.5px;">${escapeHtml(m.name || m.description || '—')}</div>
            ${m.hardness ? `<span class="text-xs text-muted">Hardness: ${escapeHtml(m.hardness)}</span>` : ''}
            ${m.color ? `<span class="text-xs text-muted" style="margin-left:6px;">• Color: ${escapeHtml(m.color)}</span>` : ''}
          </td>
          <td style="text-align:center;">${linked}</td>
          <td><span class="badge badge-teal">${escapeHtml(m.category || 'Other')}</span></td>
          <td class="text-xs font-semibold">${escapeHtml(m.polymerType || '—')}</td>
          <td class="text-center font-bold text-xs">${escapeHtml(uom)}</td>
          <td class="font-semibold text-purple" style="white-space:nowrap;">
            ${m.rate ? `₹ ${formatNum(m.rate, 2)}` : '—'}
          </td>
          <td class="font-bold ${availStock > 0 ? (isLowStock ? 'text-amber' : 'text-success') : 'text-danger'}" style="font-size:13px; white-space:nowrap;">
            ${formatNum(availStock, 2)} <span style="font-size:11px; font-weight:normal;">${uom}</span>
          </td>
          <td class="font-semibold ${underProcessStock > 0 ? 'text-amber' : 'text-muted'}" style="font-size:12.5px; white-space:nowrap;">
            ${underProcessStock > 0 ? `🔄 ${formatNum(underProcessStock, 2)} ${uom}` : '0 ' + uom}
          </td>
          <td class="text-xs text-muted font-semibold">
            ${minStock > 0 ? `${formatNum(minStock, 1)} ${uom}` : '—'}
          </td>
          <td class="text-xs text-muted" style="max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(m.storageLocation || '—')}
          </td>
          <td class="text-xs font-semibold" style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(m.supplierName || '—')}
          </td>
          <td style="text-align:center;">
            <button class="badge ${m.active !== false ? 'badge-green' : 'badge-red'}" style="cursor:pointer; border:none;" onclick="RmMasterModule.toggleStatus('${m.id}')" title="Click to toggle status">
              ${m.active !== false ? 'Active' : 'Inactive'}
            </button>
          </td>
          <td>
            <div class="flex gap-1" style="justify-content:center;">
              <button class="btn btn-ghost btn-xs text-blue" onclick="RmMasterModule.openViewModal('${m.id}')" title="View Specifications">👁️</button>
              <button class="btn btn-ghost btn-xs text-teal" onclick="RmMasterModule.openEditModal('${m.id}')" title="Edit Raw Material">✏️</button>
              <button class="btn btn-ghost btn-xs text-danger" onclick="RmMasterModule.deleteMaterial('${m.id}')" title="Delete">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    el.innerHTML = `
      <div class="animate-in" style="max-width: 1300px; margin: 0 auto; padding-bottom: 40px;">
        <!-- Header Banner -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom: 20px;">
          <div>
            <h2 class="font-bold" style="font-size:22px; margin:0; display:flex; align-items:center; gap:8px;">
              <span>🧪 RM Master (Raw Material Master)</span>
              <span class="badge badge-teal" style="font-size:11px; padding:3px 8px;">Master Catalog</span>
            </h2>
            <p class="text-sm text-muted mt-1" style="margin:4px 0 0 0;">
              Centralized master catalog for raw materials, polymer compounds, chemicals, inserts &amp; specifications.
            </p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-teal btn-sm" onclick="App.navigate('report_rm_inventory')" title="Live 3-State RM Inventory & Valuation Report">
              📊 RM Reports
            </button>
            <button class="btn btn-secondary btn-sm" onclick="RmMasterModule.refreshData()" title="Reload from cloud">
              🔄 Reload Data
            </button>
            <button class="btn btn-secondary btn-sm" onclick="RmMasterModule.openImportModal()" title="Import from Excel or CSV">
              📥 Import Excel
            </button>
            <button class="btn btn-secondary btn-sm" onclick="RmMasterModule.exportExcel()" title="Export master to Excel">
              📤 Export Excel
            </button>
            <button class="btn btn-primary btn-sm" onclick="RmMasterModule.openCreateModal()">
              ➕ Add Raw Material
            </button>
          </div>
        </div>

        <!-- KPI Metrics Grid -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin-bottom:20px;">
          <div class="stat-card blue">
            <div class="stat-label">Total Raw Materials</div>
            <div class="stat-value blue">${formatNum(totalMaterials)}</div>
            <div class="text-xs text-muted mt-1">Cataloged in master</div>
          </div>
          <div class="stat-card green">
            <div class="stat-label">Active Materials</div>
            <div class="stat-value green">${formatNum(activeMaterials)}</div>
            <div class="text-xs text-muted mt-1">Available for purchases &amp; DC</div>
          </div>
          <div class="stat-card purple">
            <div class="stat-label">Rubber Compounds</div>
            <div class="stat-value purple">${formatNum(compoundCount)}</div>
            <div class="text-xs text-muted mt-1">Formulations &amp; masterbatches</div>
          </div>
          <div class="stat-card teal">
            <div class="stat-label">Warehouse Stock (Raw)</div>
            <div class="stat-value text-success">${formatNum(totalStockUnits, 1)} <span style="font-size:12px; font-weight:normal;">units</span></div>
            <div class="text-xs text-muted mt-1">Available on-hand in store</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-label">Under Process (Job Work DC)</div>
            <div class="stat-value text-amber">${formatNum(totalUnderProcessUnits, 1)} <span style="font-size:12px; font-weight:normal;">units</span></div>
            <div class="text-xs text-muted mt-1">With Subcontractor for processing</div>
          </div>
        </div>

        <!-- Filters & Search Toolbar -->
        <div class="card" style="border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <!-- Search -->
            <div class="search-input" style="max-width:320px; flex:1; margin:0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" class="form-control form-control-sm" placeholder="Search Code, Name, Polymer, Supplier..." 
                value="${escapeHtml(searchQuery)}" 
                oninput="RmMasterModule.setSearch(this.value)">
            </div>

            <!-- Category Filter -->
            <select class="form-control form-control-sm" style="max-width:200px;" onchange="RmMasterModule.setCategoryFilter(this.value)">
              <option value="">All Categories</option>
              ${RM_CATEGORIES.map(c => `<option value="${c}" ${categoryFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>

            <!-- Polymer Filter -->
            <select class="form-control form-control-sm" style="max-width:200px;" onchange="RmMasterModule.setPolymerFilter(this.value)">
              <option value="">All Polymer Types</option>
              ${POLYMER_TYPES.map(p => `<option value="${p}" ${polymerFilter === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>

            <!-- Status Filter -->
            <select class="form-control form-control-sm" style="max-width:170px;" onchange="RmMasterModule.setStatusFilter(this.value)">
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Status</option>
              <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Active Only</option>
              <option value="inactive" ${statusFilter === 'inactive' ? 'selected' : ''}>Inactive Only</option>
              <option value="reorder" ${statusFilter === 'reorder' ? 'selected' : ''}>⚠️ Reorder Alert Only</option>
            </select>

            <!-- Reset Filters -->
            ${(searchQuery || categoryFilter || polymerFilter || statusFilter !== 'all') ? `
              <button class="btn btn-secondary btn-xs" onclick="RmMasterModule.resetFilters()">
                ✕ Clear Filters
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Master Table -->
        <div class="card" style="border:1px solid var(--border); border-radius:12px; padding:16px;">
          <div class="table-responsive">
            <table class="table" style="font-size:12.5px;">
              <thead>
                <tr>
                  <th style="width:36px; text-align:center;">#</th>
                  <th style="cursor:pointer;" onclick="RmMasterModule.setSort('code')">
                    Item Code ${sortField === 'code' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style="cursor:pointer;" onclick="RmMasterModule.setSort('name')">
                    Material Name &amp; Grade ${sortField === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style="text-align:center;">Linked JMREF</th>
                  <th>Category</th>
                  <th>Polymer / Spec</th>
                  <th style="text-align:center;">UOM</th>
                  <th style="cursor:pointer;" onclick="RmMasterModule.setSort('rate')">
                    Standard Rate (₹) ${sortField === 'rate' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style="cursor:pointer;" onclick="RmMasterModule.setSort('stock')">
                    Warehouse Stock ${sortField === 'stock' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th>Under Process (DC)</th>
                  <th>Min Reorder</th>
                  <th>Default Rack</th>
                  <th>Primary Supplier</th>
                  <th style="text-align:center;">Status</th>
                  <th style="text-align:center; width:90px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="15" style="text-align:center; padding:36px;" class="text-muted"><div style="font-size:24px; margin-bottom:6px;">🧪</div><div>No raw materials found matching your filters.</div><div class="text-xs mt-1">Click "+ Add Raw Material" or "📥 Import Excel" to register materials.</div></td></tr>`}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12px; border-top:1px solid var(--border); padding-top:12px;">
            <div class="text-muted">
              Showing <strong>${totalItems > 0 ? startIdx + 1 : 0}</strong> to <strong>${Math.min(startIdx + itemsPerPage, totalItems)}</strong> of <strong>${totalItems}</strong> raw materials
            </div>
            ${totalPages > 1 ? `
              <div style="display:flex; gap:6px;">
                <button class="btn btn-secondary btn-xs" ${currentPage <= 1 ? 'disabled' : ''} onclick="RmMasterModule.changePage(${currentPage - 1})">◀ Prev</button>
                <span class="px-2 py-1 font-semibold">Page ${currentPage} of ${totalPages}</span>
                <button class="btn btn-secondary btn-xs" ${currentPage >= totalPages ? 'disabled' : ''} onclick="RmMasterModule.changePage(${currentPage + 1})">Next ▶</button>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // Filter & Search Handlers
  function setSearch(val) {
    searchQuery = val;
    currentPage = 1;
    render();
  }

  function setCategoryFilter(val) {
    categoryFilter = val;
    currentPage = 1;
    render();
  }

  function setPolymerFilter(val) {
    polymerFilter = val;
    currentPage = 1;
    render();
  }

  function setStatusFilter(val) {
    statusFilter = val;
    currentPage = 1;
    render();
  }

  function resetFilters() {
    searchQuery = '';
    categoryFilter = '';
    polymerFilter = '';
    statusFilter = 'all';
    currentPage = 1;
    render();
  }

  function setSort(field) {
    if (sortField === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDir = 'asc';
    }
    render();
  }

  function changePage(page) {
    currentPage = page;
    render();
  }

  async function refreshData() {
    if (typeof showToast === 'function') showToast('Reloading RM Master from cloud...', 'info');
    try {
      if (DB.RawMaterials && typeof DB.RawMaterials.fetchFromCloud === 'function') {
        await DB.RawMaterials.fetchFromCloud();
      } else if (typeof DB.ensureModuleLoaded === 'function') {
        await DB.ensureModuleLoaded('raw-material', true);
      }
      render();
      if (typeof showToast === 'function') showToast('RM Master updated successfully', 'success');
    } catch (e) {
      console.warn("Refresh error:", e);
      if (typeof showToast === 'function') showToast('Failed to refresh data: ' + e.message, 'error');
    }
  }

  // ── CREATE & EDIT MODAL ─────────────────────────────────────
  function openCreateModal() {
    openFormModal();
  }

  function openEditModal(id) {
    const mat = DB.RawMaterials ? DB.RawMaterials.find(id) : null;
    if (!mat) {
      if (typeof showToast === 'function') showToast('Material record not found', 'error');
      return;
    }
    openFormModal(mat);
  }

  function openFormModal(mat = null) {
    document.getElementById('rm-form-modal')?.remove();

    const isEdit = !!mat;
    const vendors = (DB.Vendors && DB.Vendors.all ? DB.Vendors.all() : []).filter(v => v.active !== false);

    const modal = document.createElement('div');
    modal.id = 'rm-form-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '9999';

    modal.innerHTML = `
      <div class="modal" style="max-width: 680px; width: 95%;">
        <div class="modal-header">
          <h3 style="margin:0; font-size:17px; font-weight:700;">
            ${isEdit ? '✏️ Edit Raw Material' : '➕ Add New Raw Material'}
          </h3>
          <button class="modal-close" onclick="document.getElementById('rm-form-modal').remove()">&times;</button>
        </div>

        <form onsubmit="RmMasterModule.saveMaterial(event, '${mat ? mat.id : ''}')">
          <div class="modal-body" style="max-height: calc(85vh - 120px); overflow-y: auto; padding: 20px;">
            
            <!-- Section 1: Basic Information -->
            <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--primary); margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:4px;">
              📌 Identification &amp; Category
            </div>
            
            <div class="grid grid-2" style="gap:14px; margin-bottom:14px;">
              <div>
                <label class="form-label text-xs font-bold">Item Code <span class="text-danger">*</span></label>
                <input type="text" id="rm-input-code" class="form-control font-bold text-blue" 
                  value="${escapeHtml(mat ? (mat.code || mat.itemCode || '') : '')}" 
                  placeholder="e.g. RM-NBR-70-BLK" required 
                  ${isEdit ? 'readonly style="background:var(--bg-glass);"' : ''}>
                <span class="text-xs text-muted">Unique identifier used in GRN &amp; DC</span>
              </div>
              <div>
                <label class="form-label text-xs font-bold">Category <span class="text-danger">*</span></label>
                <select id="rm-input-category" class="form-control" required>
                  ${RM_CATEGORIES.map(c => `<option value="${c}" ${(mat && mat.category === c) ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label text-xs font-bold">Material Name &amp; Description <span class="text-danger">*</span></label>
              <input type="text" id="rm-input-name" class="form-control font-semibold" 
                value="${escapeHtml(mat ? (mat.name || mat.description || '') : '')}" 
                placeholder="e.g. Nitrile Rubber 70 Shore A Black Compound" required>
            </div>

            <!-- BOM & Finished Good Linkage -->
            <div class="grid grid-2" style="gap:14px; margin-bottom:14px; background:rgba(99,102,241,0.05); border:1px solid rgba(99,102,241,0.2); border-radius:8px; padding:12px;">
              <div>
                <label class="form-label text-xs font-bold text-primary">Linked Finished Good (JMREF / Master Part)</label>
                <input type="text" id="rm-input-linked-jmref" class="form-control font-semibold" list="rm-master-jmref-list"
                  value="${escapeHtml(mat ? (mat.linkedJmref || '') : '')}" 
                  placeholder="e.g. 7132A">
                <datalist id="rm-master-jmref-list">
                  ${(DB.Master && DB.Master.all ? DB.Master.all() : []).map(m => `<option value="${m.jmrefNo}">${m.jmrefNo} — ${m.partNo || ''} (${m.description || ''})</option>`).join('')}
                </datalist>
                <span class="text-xs text-muted">Maps RM to Finished Good (BOM mapping for Production &amp; DC)</span>
              </div>
              <div>
                <label class="form-label text-xs font-bold text-primary">Standard Grams / Piece (Part + Flash Weight)</label>
                <input type="number" id="rm-input-std-shot-weight" class="form-control" step="0.01" min="0"
                  value="${mat && mat.stdShotWeightGrams != null ? mat.stdShotWeightGrams : ''}"
                  placeholder="e.g. 12.50">
                <span class="text-xs text-muted">Estimated compound consumption per moulded unit in Production</span>
              </div>
            </div>

            <!-- Section 2: Technical Specifications -->
            <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--primary); margin-top:16px; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:4px;">
              🔬 Polymer &amp; Material Specifications
            </div>

            <div class="grid grid-3" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label text-xs font-bold">Polymer Type / Base</label>
                <select id="rm-input-polymer" class="form-control">
                  <option value="">Select Polymer...</option>
                  ${POLYMER_TYPES.map(p => `<option value="${p}" ${(mat && mat.polymerType === p) ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label text-xs font-bold">Hardness / Rating</label>
                <input type="text" id="rm-input-hardness" class="form-control" 
                  value="${escapeHtml(mat ? (mat.hardness || '') : '')}" 
                  placeholder="e.g. 70 ± 5 Shore A">
              </div>
              <div>
                <label class="form-label text-xs font-bold">Color</label>
                <input type="text" id="rm-input-color" class="form-control" 
                  value="${escapeHtml(mat ? (mat.color || '') : '')}" 
                  placeholder="e.g. Black, Brown, Natural">
              </div>
            </div>

            <div class="grid grid-2" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label text-xs font-bold">Specific Gravity / Density (g/cm³)</label>
                <input type="number" id="rm-input-density" class="form-control" step="0.01" min="0" 
                  value="${mat && mat.density != null ? mat.density : ''}" 
                  placeholder="e.g. 1.25">
              </div>
              <div>
                <label class="form-label text-xs font-bold">Shelf Life (Days)</label>
                <input type="number" id="rm-input-shelflife" class="form-control" min="1" 
                  value="${mat && mat.shelfLifeDays != null ? mat.shelfLifeDays : '180'}" 
                  placeholder="e.g. 180">
              </div>
            </div>

            <!-- Section 3: Commercials & Storage -->
            <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--primary); margin-top:16px; margin-bottom:10px; border-bottom:1px solid var(--border); padding-bottom:4px;">
              📦 Inventory, Commercials &amp; Storage
            </div>

            <div class="grid grid-3" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label text-xs font-bold">Unit of Measure (UOM) <span class="text-danger">*</span></label>
                <select id="rm-input-uom" class="form-control font-bold" required>
                  ${UOM_LIST.map(u => `<option value="${u}" ${(mat && mat.uom === u) ? 'selected' : (u === 'kg' && !mat ? 'selected' : '')}>${u}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label text-xs font-bold">Standard Purchase Rate (₹)</label>
                <input type="number" id="rm-input-rate" class="form-control font-semibold" step="0.01" min="0" 
                  value="${mat && mat.rate != null ? mat.rate : ''}" 
                  placeholder="e.g. 195.00">
              </div>
              <div>
                <label class="form-label text-xs font-bold">HSN Code</label>
                <input type="text" id="rm-input-hsn" class="form-control" 
                  value="${escapeHtml(mat ? (mat.hsnCode || '') : '')}" 
                  placeholder="e.g. 4005 91 00">
              </div>
            </div>

            <div class="grid grid-2" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label text-xs font-bold">Minimum Reorder Level (Safety Stock)</label>
                <input type="number" id="rm-input-minstock" class="form-control" step="any" min="0" 
                  value="${mat && mat.minStock != null ? mat.minStock : ''}" 
                  placeholder="e.g. 250">
                <span class="text-xs text-muted">Triggers low stock alert when on-hand falls below</span>
              </div>
              <div>
                <label class="form-label text-xs font-bold">Default Storage Rack / Bin</label>
                <input type="text" id="rm-input-location" class="form-control" 
                  value="${escapeHtml(mat ? (mat.storageLocation || '') : '')}" 
                  placeholder="e.g. Rack RM-02 / Bin A">
              </div>
            </div>

            <div class="grid grid-2" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label text-xs font-bold">Primary / Preferred Supplier</label>
                <select id="rm-input-supplier" class="form-control">
                  <option value="">Select Supplier...</option>
                  ${vendors.map(v => `<option value="${v.name}" ${(mat && (mat.supplierName === v.name || mat.supplierId === v.id)) ? 'selected' : ''}>${escapeHtml(v.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label text-xs font-bold">Master Status</label>
                <select id="rm-input-active" class="form-control">
                  <option value="true" ${(!mat || mat.active !== false) ? 'selected' : ''}>Active (Available)</option>
                  <option value="false" ${(mat && mat.active === false) ? 'selected' : ''}>Inactive (Disabled)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label text-xs font-bold">Technical Specifications / Notes</label>
              <textarea id="rm-input-notes" class="form-control" rows="2" placeholder="Storage instructions, vulcanization parameters, mixing details...">${escapeHtml(mat ? (mat.notes || '') : '')}</textarea>
            </div>

          </div>

          <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('rm-form-modal').remove()">Cancel</button>
            <button type="submit" id="rm-save-btn" class="btn btn-primary">
              💾 ${isEdit ? 'Update Raw Material' : 'Save Raw Material'}
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => {
      const codeInput = document.getElementById('rm-input-code');
      if (codeInput && !isEdit) codeInput.focus();
    }, 50);
  }

  async function saveMaterial(event, existingId) {
    if (event) event.preventDefault();

    const code = (document.getElementById('rm-input-code')?.value || '').trim().toUpperCase();
    const name = (document.getElementById('rm-input-name')?.value || '').trim();
    const category = document.getElementById('rm-input-category')?.value || 'Rubber Compound';
    const polymerType = document.getElementById('rm-input-polymer')?.value || '';
    const hardness = (document.getElementById('rm-input-hardness')?.value || '').trim();
    const color = (document.getElementById('rm-input-color')?.value || '').trim();
    const density = parseFloat(document.getElementById('rm-input-density')?.value) || null;
    const shelfLifeDays = parseInt(document.getElementById('rm-input-shelflife')?.value) || 180;
    const uom = document.getElementById('rm-input-uom')?.value || 'kg';
    const rate = parseFloat(document.getElementById('rm-input-rate')?.value) || 0;
    const hsnCode = (document.getElementById('rm-input-hsn')?.value || '').trim();
    const minStock = parseFloat(document.getElementById('rm-input-minstock')?.value) || 0;
    const storageLocation = (document.getElementById('rm-input-location')?.value || '').trim();
    const supplierName = document.getElementById('rm-input-supplier')?.value || '';
    const linkedJmref = (document.getElementById('rm-input-linked-jmref')?.value || '').trim().toUpperCase();
    const stdShotWeightGrams = parseFloat(document.getElementById('rm-input-std-shot-weight')?.value) || null;
    const active = document.getElementById('rm-input-active')?.value === 'true';
    const notes = (document.getElementById('rm-input-notes')?.value || '').trim();

    if (!code) {
      if (typeof showToast === 'function') showToast('Please enter Item Code', 'warning');
      return;
    }
    if (!name) {
      if (typeof showToast === 'function') showToast('Please enter Material Name', 'warning');
      return;
    }

    // Check duplicate code
    const allMaterials = DB.RawMaterials ? DB.RawMaterials.all() : [];
    const duplicate = allMaterials.find(m => {
      const c = (m.code || m.itemCode || '').trim().toUpperCase();
      return c === code && m.id !== existingId;
    });

    if (duplicate) {
      if (typeof showToast === 'function') showToast(`Item Code '${code}' already exists in RM Master`, 'error');
      return;
    }

    const saveBtn = document.getElementById('rm-save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '⏳ Saving...';
    }

    try {
      const nowIso = new Date().toISOString();
      const payload = {
        code,
        itemCode: code, // alias for backwards compatibility
        name,
        description: name, // alias
        category,
        polymerType,
        hardness,
        color,
        density,
        shelfLifeDays,
        uom,
        rate,
        hsnCode,
        minStock,
        storageLocation,
        supplierName,
        linkedJmref,
        stdShotWeightGrams,
        active,
        notes,
        updatedAt: nowIso
      };

      if (existingId) {
        await DB.RawMaterials.updateAsync(existingId, payload);
        if (typeof showToast === 'function') showToast(`Raw Material ${code} updated successfully`, 'success');
      } else {
        payload.createdAt = nowIso;
        await DB.RawMaterials.insertAsync(payload);
        if (typeof showToast === 'function') showToast(`Raw Material ${code} added to master catalog`, 'success');
      }

      document.getElementById('rm-form-modal')?.remove();
      render();
    } catch (err) {
      console.error("Save material error:", err);
      if (typeof showToast === 'function') showToast('Failed to save Raw Material: ' + err.message, 'error');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = existingId ? '💾 Update Raw Material' : '💾 Save Raw Material';
      }
    }
  }

  async function toggleStatus(id) {
    const mat = DB.RawMaterials ? DB.RawMaterials.find(id) : null;
    if (!mat) return;

    const newStatus = mat.active === false ? true : false;
    try {
      await DB.RawMaterials.updateAsync(id, { active: newStatus, updatedAt: new Date().toISOString() });
      if (typeof showToast === 'function') {
        showToast(`Material ${mat.code || mat.itemCode} is now ${newStatus ? 'Active' : 'Inactive'}`, 'info');
      }
      render();
    } catch (err) {
      if (typeof showToast === 'function') showToast('Failed to toggle status: ' + err.message, 'error');
    }
  }

  async function deleteMaterial(id) {
    const mat = DB.RawMaterials ? DB.RawMaterials.find(id) : null;
    if (!mat) return;

    const code = (mat.code || mat.itemCode || '').trim().toUpperCase();

    // Check if referenced in GRN or Delivery Challan
    const allGrns = DB.GrnRecords ? DB.GrnRecords.all() : [];
    const isUsedInGrn = allGrns.some(g => (g.items || []).some(it => (it.itemCode || '').trim().toUpperCase() === code));

    if (isUsedInGrn) {
      const confirmDeact = confirm(`Notice: Material '${code}' has associated GRN receipt history.\n\nDeleting will preserve transaction records but remove it from the master catalog.\n\nWould you prefer to Deactivate it instead?\n\nClick OK to Deactivate, or Cancel to keep as is.`);
      if (confirmDeact) {
        await DB.RawMaterials.updateAsync(id, { active: false, updatedAt: new Date().toISOString() });
        if (typeof showToast === 'function') showToast(`Material ${code} deactivated`, 'info');
        render();
      }
      return;
    }

    const confirmDel = confirm(`Are you sure you want to permanently delete '${code}' (${mat.name || mat.description}) from RM Master?`);
    if (!confirmDel) return;

    try {
      await DB.RawMaterials.removeAsync(id);
      if (typeof showToast === 'function') showToast(`Raw Material ${code} deleted`, 'success');
      render();
    } catch (err) {
      if (typeof showToast === 'function') showToast('Failed to delete material: ' + err.message, 'error');
    }
  }

  // ── VIEW DETAILS MODAL ──────────────────────────────────────
  function openViewModal(id) {
    const mat = DB.RawMaterials ? DB.RawMaterials.find(id) : null;
    if (!mat) return;

    document.getElementById('rm-view-modal')?.remove();

    const code = (mat.code || mat.itemCode || '').trim().toUpperCase();
    const stockMap = getLiveStockMap();
    const stock = stockMap.get(code);
    const availStock = stock ? stock.warehouseBalance : 0;
    const underProcess = stock ? stock.underProcess : 0;
    const consumed = stock ? stock.consumed : 0;
    const totalInward = stock ? stock.inward : 0;
    const totalDispatched = stock ? stock.dispatched : 0;
    const uom = mat.uom || 'kg';
    const minStock = parseFloat(mat.minStock) || 0;

    const modal = document.createElement('div');
    modal.id = 'rm-view-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '9999';

    modal.innerHTML = `
      <div class="modal" style="max-width: 650px; width: 95%;">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <h3 style="margin:0; font-size:16px; font-weight:700;">🧪 ${escapeHtml(code)}</h3>
            <span class="badge ${mat.active !== false ? 'badge-green' : 'badge-red'}">${mat.active !== false ? 'Active' : 'Inactive'}</span>
          </div>
          <button class="modal-close" onclick="document.getElementById('rm-view-modal').remove()">&times;</button>
        </div>

        <div class="modal-body" style="padding: 20px;">
          <h4 style="margin:0 0 12px 0; font-size:15px; font-weight:700;">${escapeHtml(mat.name || mat.description || '—')}</h4>

          <!-- 3-State Stock Summary -->
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; background:var(--bg-glass); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:18px; text-align:center;">
            <div>
              <div class="text-xs text-muted">1. Total Inward (GRN)</div>
              <div class="font-bold text-primary" style="font-size:13px; margin-top:2px;">${formatNum(totalInward, 1)} ${uom}</div>
            </div>
            <div>
              <div class="text-xs text-muted">2. Warehouse (Raw)</div>
              <div class="font-bold text-success" style="font-size:13px; margin-top:2px;">${formatNum(availStock, 1)} ${uom}</div>
            </div>
            <div>
              <div class="text-xs text-muted">3. Under Process (DC)</div>
              <div class="font-bold text-amber" style="font-size:13px; margin-top:2px;">${formatNum(underProcess, 1)} ${uom}</div>
            </div>
            <div>
              <div class="text-xs text-muted">4. Production Consumed</div>
              <div class="font-bold text-purple" style="font-size:13px; margin-top:2px;">${formatNum(consumed, 1)} ${uom}</div>
            </div>
          </div>

          <!-- Specifications Table -->
          <table class="table" style="font-size:12px; margin-bottom:14px;">
            <tbody>
              <tr>
                <td style="width:35%; font-weight:bold; background:var(--bg-glass);">Linked Finished Good:</td>
                <td>${mat.linkedJmref ? `<span class="badge badge-blue font-bold">🎯 Master JMREF: ${escapeHtml(mat.linkedJmref)}</span>` : '<span class="text-muted">Not linked</span>'}</td>
              </tr>
              ${mat.stdShotWeightGrams ? `
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Standard Grams / Piece:</td>
                <td class="font-bold">${mat.stdShotWeightGrams} g / pc</td>
              </tr>` : ''}
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Category:</td>
                <td><span class="badge badge-teal">${escapeHtml(mat.category || 'Other')}</span></td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Polymer / Base:</td>
                <td class="font-semibold">${escapeHtml(mat.polymerType || '—')}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Hardness &amp; Color:</td>
                <td>${escapeHtml(mat.hardness || '—')} ${mat.color ? `(${escapeHtml(mat.color)})` : ''}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Density / Specific Gravity:</td>
                <td>${mat.density ? `${mat.density} g/cm³` : '—'}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Standard Cost Rate:</td>
                <td class="font-bold text-purple">${mat.rate ? `₹ ${formatNum(mat.rate, 2)} / ${uom}` : '—'}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">HSN Code:</td>
                <td>${escapeHtml(mat.hsnCode || '—')}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Minimum Reorder Safety Stock:</td>
                <td class="font-bold text-amber">${minStock > 0 ? `${formatNum(minStock, 1)} ${uom}` : '—'}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Default Storage Rack / Bin:</td>
                <td>${escapeHtml(mat.storageLocation || '—')}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Primary Supplier:</td>
                <td class="font-semibold">${escapeHtml(mat.supplierName || '—')}</td>
              </tr>
              <tr>
                <td style="font-weight:bold; background:var(--bg-glass);">Shelf Life:</td>
                <td>${mat.shelfLifeDays ? `${mat.shelfLifeDays} Days` : '—'}</td>
              </tr>
            </tbody>
          </table>

          ${mat.notes ? `
            <div style="background:rgba(99,102,241,0.06); border-left:3px solid var(--primary); padding:8px 12px; border-radius:4px; font-size:12px;">
              <strong>Notes:</strong> ${escapeHtml(mat.notes)}
            </div>
          ` : ''}
        </div>

        <div class="modal-footer" style="display:flex; justify-content:space-between; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="RmMasterModule.openEditModal('${mat.id}'); document.getElementById('rm-view-modal').remove();">
            ✏️ Edit Material
          </button>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('rm-view-modal').remove()">
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // ── EXCEL EXPORT & IMPORT ───────────────────────────────────
  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      if (typeof showToast === 'function') showToast('Excel library not available', 'error');
      return;
    }

    const materials = DB.RawMaterials ? DB.RawMaterials.all() : [];
    if (!materials.length) {
      if (typeof showToast === 'function') showToast('No raw materials to export', 'info');
      return;
    }

    const stockMap = getLiveStockMap();

    const rows = materials.map((m, idx) => {
      const code = (m.code || m.itemCode || '').trim();
      const stock = stockMap.get(code.toUpperCase());
      const avail = stock ? stock.available : 0;
      const inward = stock ? stock.inward : 0;
      const dispatched = stock ? stock.dispatched : 0;

      return {
        'S.No': idx + 1,
        'Item Code': code,
        'Material Name': m.name || m.description || '',
        'Category': m.category || '',
        'Polymer Type': m.polymerType || '',
        'Hardness': m.hardness || '',
        'Color': m.color || '',
        'UOM': m.uom || 'kg',
        'Standard Rate (INR)': m.rate || 0,
        'Available Stock on Hand': avail,
        'Total Inward (GRN)': inward,
        'Total Dispatched (DC)': dispatched,
        'Min Safety Stock': m.minStock || 0,
        'Storage Location': m.storageLocation || '',
        'Primary Supplier': m.supplierName || '',
        'HSN Code': m.hsnCode || '',
        'Shelf Life (Days)': m.shelfLifeDays || '',
        'Status': m.active !== false ? 'Active' : 'Inactive',
        'Notes': m.notes || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RM_Master');
    XLSX.writeFile(wb, `JMPL_Raw_Material_Master_${new Date().toISOString().slice(0, 10)}.xlsx`);

    if (typeof showToast === 'function') showToast(`Exported ${rows.length} raw materials to Excel`, 'success');
  }

  function openImportModal() {
    document.getElementById('rm-import-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'rm-import-modal';
    modal.className = 'modal-overlay';
    modal.style.zIndex = '9999';

    modal.innerHTML = `
      <div class="modal" style="max-width: 600px; width: 95%;">
        <div class="modal-header">
          <h3 style="margin:0; font-size:16px; font-weight:700;">📥 Bulk Import Raw Materials (Excel / CSV)</h3>
          <button class="modal-close" onclick="document.getElementById('rm-import-modal').remove()">&times;</button>
        </div>

        <div class="modal-body" style="padding: 20px;">
          <p class="text-sm text-muted" style="margin-top:0;">
            Upload an Excel (.xlsx, .xls) or CSV file with raw material items. The file should contain column headers such as:
          </p>
          <div style="background:var(--bg-glass); border:1px solid var(--border); border-radius:6px; padding:10px; font-size:11.5px; font-family:monospace; margin-bottom:16px;">
            <strong>Item Code</strong>, <strong>Material Name</strong>, Category, Polymer Type, Hardness, UOM, Standard Rate, Min Safety Stock, Storage Location, Primary Supplier
          </div>

          <div class="form-group mb-4">
            <label class="form-label text-xs font-bold">Select File</label>
            <input type="file" id="rm-excel-file" class="form-control" accept=".xlsx, .xls, .csv" onchange="RmMasterModule.handleFileSelect(event)">
          </div>

          <div id="rm-import-preview" style="display:none; max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:6px; margin-bottom:16px;">
            <!-- Dynamic preview -->
          </div>
        </div>

        <div class="modal-footer" style="display:flex; justify-content:space-between; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="RmMasterModule.downloadTemplate()">
            📄 Download Excel Template
          </button>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('rm-import-modal').remove()">Cancel</button>
            <button class="btn btn-primary btn-sm" id="rm-import-btn" disabled onclick="RmMasterModule.processImport()">
              🚀 Upload &amp; Import
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  let _stagedImportItems = [];

  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      if (typeof showToast === 'function') showToast('Excel library not loaded', 'error');
      return;
    }

    const headers = [
      'Item Code',
      'Material Name',
      'Category',
      'Polymer Type',
      'Hardness',
      'Color',
      'UOM',
      'Standard Rate',
      'Min Safety Stock',
      'Storage Location',
      'Primary Supplier',
      'HSN Code',
      'Notes'
    ];

    const sampleRows = [
      [
        'RM-NBR-70-BLK',
        'Nitrile Rubber 70 Shore A Black Compound',
        'Rubber Compound',
        'NBR (Nitrile Rubber)',
        '70 ± 5 Shore A',
        'Black',
        'kg',
        '185.00',
        '500',
        'Rack RM-A01',
        'Polymers India Ltd',
        '4005 91 00',
        'Store below 25°C'
      ],
      [
        'CHEM-ZNO-99',
        'Zinc Oxide Active 99.5%',
        'Chemicals & Additives',
        'Chemical Additive',
        '',
        'White',
        'kg',
        '210.00',
        '100',
        'Rack CHEM-02',
        'Industrial Chemicals Corp',
        '2817 00 10',
        'Activator for rubber curing'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RM_Template');
    XLSX.writeFile(wb, 'JMPL_RM_Master_Upload_Template.xlsx');
    if (typeof showToast === 'function') showToast('Template Excel downloaded', 'success');
  }

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      if (typeof showToast === 'function') showToast('Excel library not loaded. Please wait a moment and try again.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet);

        if (!rawJson || rawJson.length === 0) {
          if (typeof showToast === 'function') showToast('Uploaded spreadsheet is empty', 'warning');
          return;
        }

        // Parse and validate items
        const parsed = [];
        rawJson.forEach(row => {
          const code = (row['Item Code'] || row['ItemCode'] || row['Code'] || row['RM Code'] || '').toString().trim().toUpperCase();
          const name = (row['Material Name'] || row['MaterialName'] || row['Name'] || row['Description'] || '').toString().trim();
          if (!code || !name) return;

          parsed.push({
            code,
            itemCode: code,
            name,
            description: name,
            category: row['Category'] || 'Rubber Compound',
            polymerType: row['Polymer Type'] || row['Polymer'] || '',
            hardness: (row['Hardness'] || '').toString().trim(),
            color: (row['Color'] || '').toString().trim(),
            uom: (row['UOM'] || 'kg').toString().trim().toLowerCase(),
            rate: parseFloat(row['Standard Rate'] || row['Rate'] || row['Standard Rate (INR)']) || 0,
            minStock: parseFloat(row['Min Safety Stock'] || row['Min Stock'] || row['MinStock']) || 0,
            storageLocation: (row['Storage Location'] || row['Location'] || row['Rack'] || '').toString().trim(),
            supplierName: (row['Primary Supplier'] || row['Supplier'] || '').toString().trim(),
            hsnCode: (row['HSN Code'] || row['HSN'] || '').toString().trim(),
            notes: (row['Notes'] || '').toString().trim(),
            active: true
          });
        });

        _stagedImportItems = parsed;

        const previewContainer = document.getElementById('rm-import-preview');
        const importBtn = document.getElementById('rm-import-btn');

        if (previewContainer) {
          previewContainer.style.display = 'block';
          previewContainer.innerHTML = `
            <table class="table" style="font-size:11.5px; margin-bottom:0;">
              <thead>
                <tr><th>#</th><th>Code</th><th>Name</th><th>Category</th><th>UOM</th><th>Rate</th></tr>
              </thead>
              <tbody>
                ${parsed.map((p, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${escapeHtml(p.code)}</strong></td>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${escapeHtml(p.category)}</td>
                    <td>${escapeHtml(p.uom)}</td>
                    <td>₹ ${p.rate}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }

        if (importBtn) {
          importBtn.disabled = parsed.length === 0;
          importBtn.innerHTML = `🚀 Upload &amp; Import (${parsed.length} items)`;
        }

        if (typeof showToast === 'function') showToast(`Parsed ${parsed.length} valid items from file`, 'info');
      } catch (err) {
        console.error("Excel read error:", err);
        if (typeof showToast === 'function') showToast('Failed to parse file: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function processImport() {
    if (!_stagedImportItems || !_stagedImportItems.length) return;

    const importBtn = document.getElementById('rm-import-btn');
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.innerHTML = '⏳ Importing to Cloud...';
    }

    try {
      const allExisting = DB.RawMaterials ? DB.RawMaterials.all() : [];
      const existingMap = new Map();
      allExisting.forEach(m => {
        const c = (m.code || m.itemCode || '').trim().toUpperCase();
        if (c) existingMap.set(c, m);
      });

      let added = 0;
      let updated = 0;
      const nowIso = new Date().toISOString();

      for (const item of _stagedImportItems) {
        const existing = existingMap.get(item.code);
        if (existing) {
          item.updatedAt = nowIso;
          await DB.RawMaterials.updateAsync(existing.id, item);
          updated++;
        } else {
          item.createdAt = nowIso;
          item.updatedAt = nowIso;
          await DB.RawMaterials.insertAsync(item);
          added++;
        }
      }

      document.getElementById('rm-import-modal')?.remove();
      _stagedImportItems = [];

      if (typeof showToast === 'function') {
        showToast(`Import completed: ${added} added, ${updated} updated`, 'success');
      }
      render();
    } catch (err) {
      console.error("Bulk import error:", err);
      if (typeof showToast === 'function') showToast('Bulk import failed: ' + err.message, 'error');
      if (importBtn) {
        importBtn.disabled = false;
        importBtn.innerHTML = '🚀 Upload &amp; Import';
      }
    }
  }

  return {
    render,
    setSearch,
    setCategoryFilter,
    setPolymerFilter,
    setStatusFilter,
    resetFilters,
    setSort,
    changePage,
    refreshData,
    openCreateModal,
    openEditModal,
    openViewModal,
    saveMaterial,
    toggleStatus,
    deleteMaterial,
    exportExcel,
    openImportModal,
    downloadTemplate,
    handleFileSelect,
    processImport
  };
})();

window.RmMasterModule = RmMasterModule;
