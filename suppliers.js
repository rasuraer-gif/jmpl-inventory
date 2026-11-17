// ============================================================
// suppliers.js — Supplier & Subcontractor Management Module
// ============================================================
// Allows creating, viewing, editing, and managing all suppliers,
// vendors, and job-work subcontractors for Raw Materials and Delivery Challans.
// ============================================================

const SuppliersModule = (() => {
  let searchQuery = '';
  let categoryFilter = '';
  let statusFilter = '';
  let currentPage = 1;
  let itemsPerPage = 20;

  const SUPPLIER_TYPES = [
    'Subcontractor / Job Work',
    'Raw Material Supplier',
    'Trimming Vendor',
    'Flash Removal (Deflashing)',
    'Surface Treatment',
    'Packaging Supplier',
    'Service Provider',
    'General Vendor'
  ];

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getAllSuppliers() {
    const vendors = DB.Vendors ? (DB.Vendors.all ? DB.Vendors.all() : []) : [];
    const subs = DB.Subcontractors ? (DB.Subcontractors.all ? DB.Subcontractors.all() : []) : [];
    
    // Merge into normalized list avoiding duplicate IDs
    const map = new Map();
    vendors.forEach(v => {
      if (v && v.id) {
        map.set(v.id, {
          source: 'vendor',
          ...v,
          category: v.type || v.category || (v.department === 'deflashing' ? 'Flash Removal (Deflashing)' : (v.department === 'trimming' ? 'Trimming Vendor' : (v.department === 'Raw Material Supplier' ? 'Raw Material Supplier' : 'Subcontractor / Job Work')))
        });
      }
    });

    subs.forEach(s => {
      if (s && s.id && !map.has(s.id)) {
        map.set(s.id, {
          source: 'subcontractor',
          ...s,
          category: s.type || s.category || 'Subcontractor / Job Work'
        });
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return list;
  }

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const allSuppliers = getAllSuppliers();
    const activeCount = allSuppliers.filter(s => s.active !== false).length;
    const subCount = allSuppliers.filter(s => (s.category || '').toLowerCase().includes('subcontractor') || (s.category || '').toLowerCase().includes('job work') || s.source === 'subcontractor').length;
    const rmCount = allSuppliers.filter(s => (s.category || '').toLowerCase().includes('raw material')).length;

    // Filter suppliers
    let filtered = allSuppliers;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(s => {
        return (
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
          (s.phone && s.phone.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          (s.gstin && s.gstin.toLowerCase().includes(q)) ||
          (s.city && s.city.toLowerCase().includes(q))
        );
      });
    }

    if (categoryFilter) {
      filtered = filtered.filter(s => (s.category || '').toLowerCase() === categoryFilter.toLowerCase());
    }

    if (statusFilter === 'active') {
      filtered = filtered.filter(s => s.active !== false);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(s => s.active === false);
    }

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageItems = filtered.slice(startIdx, startIdx + itemsPerPage);

    const rowsHtml = pageItems.map((s, idx) => `
      <tr>
        <td class="text-muted text-xs font-semibold" style="text-align:center;">${startIdx + idx + 1}</td>
        <td>
          <strong style="color:var(--text); font-size:13.5px; cursor:pointer;" onclick="SuppliersModule.viewSupplier('${s.id}')">
            ${escapeHtml(s.name)}
          </strong>
        </td>
        <td>
          <span class="badge ${s.category.includes('Raw Material') ? 'badge-purple' : (s.category.includes('Subcontractor') ? 'badge-teal' : 'badge-blue')}">
            ${escapeHtml(s.category)}
          </span>
        </td>
        <td>${escapeHtml(s.contactPerson || s.contact || '—')}</td>
        <td class="font-semibold text-xs" style="white-space:nowrap;">
          ${s.phone ? `📞 ${escapeHtml(s.phone)}` : '—'}
        </td>
        <td class="text-xs text-muted">${escapeHtml(s.email || '—')}</td>
        <td class="text-xs font-mono font-semibold">${escapeHtml(s.gstin || s.gst || '—')}</td>
        <td class="text-xs text-muted" style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escapeHtml([s.city, s.state].filter(Boolean).join(', ') || s.address || '—')}
        </td>
        <td style="text-align:center;">
          <span class="badge ${s.active !== false ? 'badge-green' : 'badge-red'}" style="cursor:pointer;" onclick="SuppliersModule.toggleStatus('${s.id}', '${s.source}')" title="Click to toggle status">
            ${s.active !== false ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-xs text-blue" onclick="SuppliersModule.openEditModal('${s.id}')" title="Edit Supplier">
            ✏️ Edit
          </button>
          <button class="btn btn-ghost btn-xs" onclick="SuppliersModule.viewSupplier('${s.id}')" title="View Full Details">
            👁️ Details
          </button>
          ${typeof Auth !== 'undefined' && Auth.isAdmin() ? `
            <button class="btn btn-ghost btn-xs text-danger" onclick="SuppliersModule.deleteSupplier('${s.id}', '${s.source}')" title="Delete Supplier (Admin)">
              🗑️
            </button>
          ` : ''}
        </td>
      </tr>
    `).join('');

    // Pagination buttons
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
          onclick="SuppliersModule.changePage(${p})">
          ${p}
        </button>
      `;
    }

    el.innerHTML = `
      <div class="animate-in" style="max-width: 1250px; margin: 0 auto; padding-bottom: 40px;">
        
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom: 20px;">
          <div>
            <h2 class="font-bold" style="font-size:22px; margin:0; display:flex; align-items:center; gap:8px;">
              <span>🏢 Suppliers &amp; Subcontractors</span>
              <span class="badge badge-purple" style="font-size:11px; padding:3px 8px;">Master Directory</span>
            </h2>
            <p class="text-sm text-muted mt-1" style="margin:4px 0 0 0;">
              Manage raw material suppliers, job-work vendors, and subcontractors for GRN inward and Delivery Challan dispatches.
            </p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="SuppliersModule.exportToExcel()" title="Export directory to Excel">
              📊 Export Excel
            </button>
            <button class="btn btn-primary btn-sm font-bold" onclick="SuppliersModule.openAddModal()">
              ➕ Add Supplier / Subcontractor
            </button>
          </div>
        </div>

        <!-- Metric Cards -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; margin-bottom:20px;">
          <div class="stat-card blue">
            <div class="stat-label">Total Registered</div>
            <div class="stat-value blue">${allSuppliers.length}</div>
            <div class="text-xs text-muted mt-1">Suppliers &amp; vendors in system</div>
          </div>
          <div class="stat-card green">
            <div class="stat-label">Active Suppliers</div>
            <div class="stat-value green">${activeCount}</div>
            <div class="text-xs text-muted mt-1">Available for GRN &amp; DC</div>
          </div>
          <div class="stat-card teal">
            <div class="stat-label">Subcontractors / Job Work</div>
            <div class="stat-value teal">${subCount}</div>
            <div class="text-xs text-muted mt-1">Processing &amp; Reprocessing vendors</div>
          </div>
          <div class="stat-card purple">
            <div class="stat-label">Raw Material Suppliers</div>
            <div class="stat-value purple">${rmCount}</div>
            <div class="text-xs text-muted mt-1">Providing compounds &amp; materials</div>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="card" style="border:1px solid var(--border); border-radius:12px; padding:16px;">
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:16px; align-items:center;">
            <div class="search-input" style="flex:2; min-width:240px; margin:0;">
              <span class="search-icon">&#128269;</span>
              <input type="text" class="form-control form-control-sm" placeholder="Search supplier, contact, phone, GST, city..." 
                value="${escapeHtml(searchQuery)}" 
                oninput="SuppliersModule.filterSearch(this.value)">
            </div>

            <select class="form-control form-control-sm" style="flex:1; min-width:180px;" onchange="SuppliersModule.filterCategory(this.value)">
              <option value="">All Categories / Types</option>
              ${SUPPLIER_TYPES.map(t => `<option value="${t}" ${categoryFilter === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>

            <select class="form-control form-control-sm" style="width:130px;" onchange="SuppliersModule.filterStatus(this.value)">
              <option value="">All Statuses</option>
              <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Active Only</option>
              <option value="inactive" ${statusFilter === 'inactive' ? 'selected' : ''}>Inactive Only</option>
            </select>

            <button class="btn btn-ghost btn-sm" onclick="SuppliersModule.resetFilters()">✕ Reset</button>
          </div>

          <!-- Table -->
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th style="width:36px; text-align:center;">#</th>
                  <th>Supplier / Company Name</th>
                  <th>Category / Type</th>
                  <th>Contact Person</th>
                  <th>Phone / Mobile</th>
                  <th>Email</th>
                  <th>GSTIN</th>
                  <th>City / Address</th>
                  <th style="text-align:center;">Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="10" style="text-align:center; padding:32px;" class="text-muted">No suppliers found matching criteria.</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:14px; font-size:12px; border-top:1px solid var(--border); padding-top:12px;">
            <div class="text-muted">
              Showing <strong>${totalItems > 0 ? startIdx + 1 : 0}</strong> to <strong>${Math.min(startIdx + itemsPerPage, totalItems)}</strong> of <strong>${totalItems}</strong> entries
            </div>
            ${totalPages > 1 ? `
              <div style="display:flex; align-items:center; gap:4px;">
                <button class="btn btn-secondary btn-xs" ${currentPage <= 1 ? 'disabled' : ''} onclick="SuppliersModule.changePage(${currentPage - 1})">◀ Prev</button>
                ${pageButtonsHtml}
                <button class="btn btn-secondary btn-xs" ${currentPage >= totalPages ? 'disabled' : ''} onclick="SuppliersModule.changePage(${currentPage + 1})">Next ▶</button>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // ── ADD / EDIT MODAL ───────────────────────────────────────
  function openAddModal() {
    renderSupplierModal(null);
  }

  function openEditModal(supplierId) {
    const list = getAllSuppliers();
    const s = list.find(item => item.id === supplierId);
    if (!s) {
      if (typeof showToast === 'function') showToast('Supplier not found', 'error');
      return;
    }
    renderSupplierModal(s);
  }

  function renderSupplierModal(supplier = null) {
    const isEdit = !!supplier;
    const modalHtml = `
      <div id="supplier-form-modal" class="modal-backdrop animate-in" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.65); z-index:9999; padding:20px;">
        <div class="card" style="width:100%; max-width:620px; max-height:92vh; overflow-y:auto; border-radius:12px; padding:22px; background:var(--bg-card); box-shadow:0 20px 40px rgba(0,0,0,0.4); border:1px solid var(--border);">
          
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:12px; margin-bottom:16px;">
            <h3 style="margin:0; font-size:17px; font-weight:700;">
              ${isEdit ? '✏️ Edit Supplier / Subcontractor' : '➕ Register New Supplier / Subcontractor'}
            </h3>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('supplier-form-modal')?.remove()">✕</button>
          </div>

          <form onsubmit="event.preventDefault(); SuppliersModule.saveSupplier('${isEdit ? supplier.id : ''}', '${isEdit ? supplier.source : 'vendor'}');">
            
            <div style="margin-bottom:14px;">
              <label class="form-label font-bold text-xs">Company / Supplier Name <span class="text-danger">*</span></label>
              <input type="text" id="supp-name" class="form-control font-semibold" placeholder="e.g. Apex Polymer Compounds Ltd" value="${escapeHtml(supplier?.name || '')}" required>
            </div>

            <div class="grid grid-2" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label font-bold text-xs">Supplier Category / Role <span class="text-danger">*</span></label>
                <select id="supp-category" class="form-control" required>
                  ${SUPPLIER_TYPES.map(t => `<option value="${t}" ${supplier?.category === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>

              <div>
                <label class="form-label font-bold text-xs">Contact Person Name</label>
                <input type="text" id="supp-contact" class="form-control" placeholder="Key contact person" value="${escapeHtml(supplier?.contactPerson || supplier?.contact || '')}">
              </div>
            </div>

            <div class="grid grid-2" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label font-bold text-xs">Phone / Mobile</label>
                <input type="text" id="supp-phone" class="form-control font-semibold" placeholder="e.g. +91 98765 43210" value="${escapeHtml(supplier?.phone || '')}">
              </div>

              <div>
                <label class="form-label font-bold text-xs">Email Address</label>
                <input type="email" id="supp-email" class="form-control" placeholder="e.g. sales@vendor.com" value="${escapeHtml(supplier?.email || '')}">
              </div>
            </div>

            <div class="grid grid-2" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label font-bold text-xs">GSTIN / Tax ID</label>
                <input type="text" id="supp-gstin" class="form-control font-mono font-bold" placeholder="e.g. 33AAAAA0000A1Z5" value="${escapeHtml(supplier?.gstin || supplier?.gst || '')}">
              </div>

              <div>
                <label class="form-label font-bold text-xs">Payment Terms</label>
                <input type="text" id="supp-terms" class="form-control" placeholder="e.g. 30 Days Credit / Immediate" value="${escapeHtml(supplier?.paymentTerms || '')}">
              </div>
            </div>

            <div style="margin-bottom:14px;">
              <label class="form-label font-bold text-xs">Address / Factory Location</label>
              <textarea id="supp-address" class="form-control" rows="2" placeholder="Street, Industrial Area...">${escapeHtml(supplier?.address || '')}</textarea>
            </div>

            <div class="grid grid-2" style="gap:12px; margin-bottom:14px;">
              <div>
                <label class="form-label font-bold text-xs">City / District</label>
                <input type="text" id="supp-city" class="form-control" placeholder="e.g. Coimbatore" value="${escapeHtml(supplier?.city || '')}">
              </div>

              <div>
                <label class="form-label font-bold text-xs">State / Pincode</label>
                <input type="text" id="supp-state" class="form-control" placeholder="e.g. Tamil Nadu - 641001" value="${escapeHtml(supplier?.state || '')}">
              </div>
            </div>

            <div style="margin-bottom:16px;">
              <label class="form-label font-bold text-xs">Notes / Special Processing Capabilities</label>
              <input type="text" id="supp-notes" class="form-control" placeholder="e.g. Specializes in rubber cryogenic deflashing, NBR compounding" value="${escapeHtml(supplier?.notes || '')}">
            </div>

            <div style="margin-bottom:18px; display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="supp-active" ${supplier?.active !== false ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer;">
              <label for="supp-active" style="cursor:pointer; font-weight:600; font-size:13px; margin:0;">
                Active (Available for selection in GRN Inward &amp; Delivery Challans)
              </label>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border); padding-top:14px;">
              <button type="button" class="btn btn-ghost" onclick="document.getElementById('supplier-form-modal')?.remove()">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary font-bold" style="padding:8px 20px;">
                ${isEdit ? 'Update Supplier' : 'Save Supplier'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('supplier-form-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function saveSupplier(supplierId, source) {
    const name = document.getElementById('supp-name')?.value.trim();
    const category = document.getElementById('supp-category')?.value;
    const contactPerson = document.getElementById('supp-contact')?.value.trim();
    const phone = document.getElementById('supp-phone')?.value.trim();
    const email = document.getElementById('supp-email')?.value.trim();
    const gstin = document.getElementById('supp-gstin')?.value.trim().toUpperCase();
    const paymentTerms = document.getElementById('supp-terms')?.value.trim();
    const address = document.getElementById('supp-address')?.value.trim();
    const city = document.getElementById('supp-city')?.value.trim();
    const state = document.getElementById('supp-state')?.value.trim();
    const notes = document.getElementById('supp-notes')?.value.trim();
    const active = document.getElementById('supp-active')?.checked;

    if (!name) {
      if (typeof showToast === 'function') showToast('Supplier Name is required', 'error');
      return;
    }

    const payload = {
      name,
      category,
      type: category,
      department: category.toLowerCase().includes('deflash') ? 'deflashing' : (category.toLowerCase().includes('trim') ? 'trimming' : category),
      contactPerson,
      phone,
      email,
      gstin,
      paymentTerms,
      address,
      city,
      state,
      notes,
      active,
      updatedAt: new Date().toISOString()
    };

    try {
      if (supplierId) {
        // Edit existing
        if (source === 'subcontractor' && DB.Subcontractors) {
          DB.Subcontractors.update(supplierId, payload);
        } else if (DB.Vendors) {
          DB.Vendors.update(supplierId, payload);
        }
        if (typeof showToast === 'function') showToast(`Updated supplier "${name}"`, 'success');
      } else {
        // Create new
        payload.createdAt = new Date().toISOString();
        if (category.toLowerCase().includes('subcontractor') && DB.Subcontractors) {
          DB.Subcontractors.insert(payload);
        }
        // Always register in Vendors so Delivery Challans & GRN have instant access
        if (DB.Vendors) {
          DB.Vendors.insert(payload);
        }
        if (typeof showToast === 'function') showToast(`Created supplier "${name}"`, 'success');
      }

      document.getElementById('supplier-form-modal')?.remove();
      render();
    } catch (err) {
      console.error(err);
      if (typeof showToast === 'function') showToast(`Error saving supplier: ${err.message}`, 'error');
    }
  }

  function toggleStatus(id, source) {
    const list = getAllSuppliers();
    const s = list.find(item => item.id === id);
    if (!s) return;

    const newActive = s.active === false;
    try {
      if (source === 'subcontractor' && DB.Subcontractors) {
        DB.Subcontractors.update(id, { active: newActive });
      }
      if (DB.Vendors) {
        DB.Vendors.update(id, { active: newActive });
      }
      if (typeof showToast === 'function') {
        showToast(`${s.name} is now ${newActive ? 'Active' : 'Inactive'}`, 'info');
      }
      render();
    } catch (e) {
      console.error(e);
    }
  }

  function deleteSupplier(id, source) {
    const list = getAllSuppliers();
    const s = list.find(item => item.id === id);
    if (!s) return;

    const conf = confirm(`Are you sure you want to delete supplier "${s.name}"?\n\nThis action cannot be undone.`);
    if (!conf) return;

    try {
      if (source === 'subcontractor' && DB.Subcontractors) {
        DB.Subcontractors.remove(id);
      }
      if (DB.Vendors) {
        DB.Vendors.remove(id);
      }
      if (typeof showToast === 'function') showToast(`Supplier "${s.name}" deleted`, 'info');
      render();
    } catch (e) {
      console.error(e);
      if (typeof showToast === 'function') showToast('Failed to delete supplier', 'error');
    }
  }

  function viewSupplier(id) {
    const list = getAllSuppliers();
    const s = list.find(item => item.id === id);
    if (!s) return;

    // Check linked GRNs & Delivery Challans
    const linkedGrns = (DB.GrnRecords ? DB.GrnRecords.all() : []).filter(g => g.supplierName && g.supplierName.toLowerCase() === s.name.toLowerCase());
    const linkedDcs = (DB.DeliveryChallans ? DB.DeliveryChallans.all() : []).filter(d => (d.vendorId === s.id) || (d.vendorName && d.vendorName.toLowerCase() === s.name.toLowerCase()));

    const modalHtml = `
      <div id="supplier-view-modal" class="modal-backdrop animate-in" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.65); z-index:9999; padding:20px;">
        <div class="card" style="width:100%; max-width:680px; max-height:90vh; overflow-y:auto; border-radius:12px; padding:24px; background:var(--bg-card); box-shadow:0 20px 40px rgba(0,0,0,0.4); border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:18px;">
            <div>
              <h3 style="margin:0; font-size:18px; font-weight:800; display:flex; align-items:center; gap:8px;">
                <span>${escapeHtml(s.name)}</span>
                <span class="badge ${s.active !== false ? 'badge-green' : 'badge-red'}">${s.active !== false ? 'Active' : 'Inactive'}</span>
              </h3>
              <p class="text-xs text-muted" style="margin:3px 0 0 0;">${escapeHtml(s.category)}</p>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-secondary btn-sm" onclick="SuppliersModule.openEditModal('${s.id}')">✏️ Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('supplier-view-modal')?.remove()">✕ Close</button>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; background:var(--bg-glass); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:20px; font-size:12.5px;">
            <div><span class="text-muted">Contact Person:</span> <strong>${escapeHtml(s.contactPerson || s.contact || '—')}</strong></div>
            <div><span class="text-muted">Phone:</span> <strong>${escapeHtml(s.phone || '—')}</strong></div>
            <div><span class="text-muted">Email:</span> <strong>${escapeHtml(s.email || '—')}</strong></div>
            <div><span class="text-muted">GSTIN:</span> <strong class="font-mono text-purple">${escapeHtml(s.gstin || s.gst || '—')}</strong></div>
            <div><span class="text-muted">City / State:</span> <strong>${escapeHtml([s.city, s.state].filter(Boolean).join(', ') || '—')}</strong></div>
            <div><span class="text-muted">Payment Terms:</span> <strong>${escapeHtml(s.paymentTerms || '—')}</strong></div>
            <div style="grid-column: span 2;"><span class="text-muted">Full Address:</span> <strong>${escapeHtml(s.address || '—')}</strong></div>
          </div>

          <!-- Activity History Links -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:20px;">
            <div class="card" style="padding:12px; background:rgba(99,102,241,0.05); border:1px solid rgba(99,102,241,0.2);">
              <div class="text-xs text-muted">Inward GRNs Recorded</div>
              <div class="font-bold text-primary" style="font-size:18px;">${linkedGrns.length}</div>
              <div class="text-xs text-muted mt-1">Purchases delivered by this supplier</div>
            </div>
            <div class="card" style="padding:12px; background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.2);">
              <div class="text-xs text-muted">Delivery Challans Sent</div>
              <div class="font-bold text-success" style="font-size:18px;">${linkedDcs.length}</div>
              <div class="text-xs text-muted mt-1">Job-work and material dispatches</div>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('supplier-view-modal')?.remove()">Close Window</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('supplier-view-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function exportToExcel() {
    if (typeof XLSX === 'undefined') {
      if (typeof showToast === 'function') showToast('Excel library not available', 'error');
      return;
    }

    const all = getAllSuppliers();
    const rows = all.map(s => ({
      'Supplier Name': s.name,
      'Category': s.category,
      'Contact Person': s.contactPerson || s.contact || '',
      'Phone': s.phone || '',
      'Email': s.email || '',
      'GSTIN': s.gstin || s.gst || '',
      'City': s.city || '',
      'State': s.state || '',
      'Address': s.address || '',
      'Payment Terms': s.paymentTerms || '',
      'Status': s.active !== false ? 'Active' : 'Inactive'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
    XLSX.writeFile(wb, `JMPL_Suppliers_${new Date().toISOString().slice(0, 10)}.xlsx`);

    if (typeof showToast === 'function') showToast(`Exported ${rows.length} suppliers to Excel`, 'success');
  }

  // Controller filter handlers
  function filterSearch(q) {
    searchQuery = q;
    currentPage = 1;
    render();
  }

  function filterCategory(c) {
    categoryFilter = c;
    currentPage = 1;
    render();
  }

  function filterStatus(st) {
    statusFilter = st;
    currentPage = 1;
    render();
  }

  function resetFilters() {
    searchQuery = '';
    categoryFilter = '';
    statusFilter = '';
    currentPage = 1;
    render();
  }

  function changePage(p) {
    currentPage = p;
    render();
  }

  return {
    render,
    openAddModal,
    openEditModal,
    saveSupplier,
    toggleStatus,
    deleteSupplier,
    viewSupplier,
    exportToExcel,
    filterSearch,
    filterCategory,
    filterStatus,
    resetFilters,
    changePage,
    getAllSuppliers
  };
})();

if (typeof window !== 'undefined') {
  window.SuppliersModule = SuppliersModule;
}
