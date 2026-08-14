// ============================================================
// admin.js — Admin Panel Module
// ============================================================
const AdminModule = (() => {
  const PERM_CATEGORIES = [
    {
      name: '🏭 Core Production & Departments',
      perms: [
        { key: 'master', label: 'Inventory Master' },
        { key: 'mould-tracking', label: 'Mould Tracking' },
        { key: 'production', label: 'Production / Moulding' },
        { key: 'cryogenic', label: 'Cryogenic' },
        { key: 'deflashing', label: 'Flash Removal (DE Flashing)' },
        { key: 'waiting-trimming', label: 'Waiting for Trimming' },
        { key: 'trimming', label: 'Trimming' },
        { key: 'post-curing', label: 'Post Curing' },
        { key: 'waiting-visual', label: 'Waiting for Visual inspection' },
        { key: 'visual', label: 'Visual Inspection' },
        { key: 'gauge', label: 'Gauge Inspection' },
        { key: 'quality', label: 'Quality Final (QC)' },
        { key: 'store', label: 'Store & Sales' }
      ]
    },
    {
      name: '🛠️ Planning & Operations Tools',
      perms: [
        { key: 'stock', label: 'Stock Upload' },
        { key: 'daily-analysis', label: 'Daily Feasibility' },
        { key: 'monthly-plan', label: 'Monthly Plan' },
        { key: 'prod-sched', label: 'Production Schedule' },
        { key: 'replenishment', label: 'Replenishment Planner' },
        { key: 'task-tracking', label: 'Task Tracking' },
        { key: 'stock-audit', label: 'Monthly Stock Taking & Audit' },
        { key: 'print-batch', label: 'Print Label' },
        { key: 'ai-agent', label: 'AI Assistant' }
      ]
    },
    {
      name: '📊 Reports & Analytics',
      perms: [
        { key: 'report_inventory', label: 'Report: Inventory' },
        { key: 'report_store_stock', label: 'Report: Store Stock' },
        { key: 'report_sales', label: 'Report: Sales' },
        { key: 'report_production', label: 'Report: Production' },
        { key: 'report_cryogenic', label: 'Report: Cryo Loss' },
        { key: 'report_deflashing', label: 'Report: DE Flash Loss' },
        { key: 'report_trimming', label: 'Report: Trimming Loss' },
        { key: 'report_post_curing', label: 'Report: Post Curing Loss' },
        { key: 'report_waiting_visual', label: 'Report: Waiting for Visual' },
        { key: 'report_visual', label: 'Report: Visual Insp' },
        { key: 'report_gauge', label: 'Report: Gauge Insp' },
        { key: 'report_rejected', label: 'Report: Rejected Batches' },
        { key: 'report_recheck', label: 'Report: QF Recheck' },
        { key: 'report_reprocess', label: 'Report: Reprocessed Items' },
        { key: 'report_slob', label: 'Report: SLOB' },
        { key: 'report_aging', label: 'Report: Aging WIP' },
        { key: 'report_pending_batches', label: 'Report: Pending Batches' },
        { key: 'report_qty_gain', label: 'Report: Qty Gain' },
        { key: 'report_qty_loss', label: 'Report: Qty Loss' },
        { key: 'report_op_efficiency', label: 'Report: Op & Insp Efficiency' },
        { key: 'report_mould_lifecycle', label: 'Report: Mould Lifecycle' },
        { key: 'report_cycle_time', label: 'Report: Cycle Time & Bottlenecks' },
        { key: 'report_wip_valuation', label: 'Report: WIP Valuation' },
        { key: 'report_sub_vs_inhouse', label: 'Report: Subcontractor vs In-House' },
        { key: 'report_sub_pending', label: 'Report: Subcontractor Pending Batches' },
        { key: 'report_sub_performance', label: 'Report: Subcontractor & Vendor Scorecard' },
        { key: 'report_store_aging', label: 'Report: Store FIFO Aging' },
        { key: 'report_daily_summary', label: 'Report: Daily Production & Scrap' },
        { key: 'report_analytics', label: 'Report: Production & Quality Analytics' }
      ]
    }
  ];

  const PERMS = [];
  const PERM_LABELS = {};
  PERM_CATEGORIES.forEach(cat => {
    cat.perms.forEach(p => {
      PERMS.push(p.key);
      PERM_LABELS[p.key] = p.label;
    });
  });

  let activeTab = 'users';

  function render() {
    if (!Auth.isAdmin()) {
      document.getElementById('content').innerHTML = `<div class="card card-body text-danger" style="text-align:center;padding:60px;"><div style="font-size:48px;">🔒</div><h3 style="margin:16px 0 8px;">Admin Access Only</h3><p class="text-muted">You do not have permission to access this panel.</p></div>`;
      return;
    }
    const el = document.getElementById('content');
    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div><h2 class="font-bold" style="font-size:20px;">Admin Panel</h2><p class="text-sm text-muted mt-1">Manage users, subcontractors, vendors, operators and inspectors</p></div>
        </div>
        <div class="tabs" id="admin-tabs">
          <button class="tab-btn ${activeTab==='users'?'active':''}" data-tab="users">👤 Users</button>
          <button class="tab-btn ${activeTab==='sub'?'active':''}" data-tab="sub">🏢 Subcontractors</button>
          <button class="tab-btn ${activeTab==='vendor'?'active':''}" data-tab="vendor">🤝 Vendors</button>
          <button class="tab-btn ${activeTab==='op'?'active':''}" data-tab="op">👷 Operators</button>
          <button class="tab-btn ${activeTab==='insp'?'active':''}" data-tab="insp">🔍 Inspectors</button>
          <button class="tab-btn ${activeTab==='batches'?'active':''}" data-tab="batches">📦 Batches</button>
          <button class="tab-btn ${activeTab==='tasks'?'active':''}" data-tab="tasks">📋 Tasks</button>
          <button class="tab-btn ${activeTab==='system'?'active':''}" data-tab="system">⚙️ Maintenance</button>
        </div>
        <div id="admin-tab-content"></div>
      </div>
      ${userModal()}${subModal()}${vendorModal()}${opModal()}${inspectorModal()}`;

    document.querySelectorAll('#admin-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        renderTab(activeTab);
      });
    });
    renderTab(activeTab);
  }

  function renderTab(tab) {
    const el = document.getElementById('admin-tab-content');
    if (!el) return;
    if (tab === 'users')  el.innerHTML = usersTab();
    if (tab === 'sub')    el.innerHTML = subTab();
    if (tab === 'vendor') el.innerHTML = vendorTab();
    if (tab === 'op')     el.innerHTML = opTab();
    if (tab === 'insp')   el.innerHTML = inspectorTab();
    if (tab === 'batches') el.innerHTML = batchesTab();
    if (tab === 'tasks')  el.innerHTML = tasksTab();
    if (tab === 'system') el.innerHTML = systemTab();
  }

  // ── USERS TAB ───────────────────────────────────────────
  function usersTab() {
    const users = DB.Users.all();
    const rows = users.map(u => `
      <tr>
        <td class="font-semibold">${u.name}</td>
        <td class="text-muted">${u.username}</td>
        <td><span class="badge ${u.role==='admin'?'badge-purple':'badge-blue'}">${u.role}</span></td>
        <td style="max-width:300px;">${u.role==='admin'?'<span class="badge badge-purple">All Access</span>': (u.permissions||[]).map(p=>`<span class="badge badge-gray" style="margin:1px;">${PERM_LABELS[p]||p}</span>`).join('')}</td>
        <td><span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'Active':'Inactive'}</span></td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-xs" onclick="AdminModule.editUser('${u.id}')">✏️ Edit</button>
            ${u.username!=='admin'?`<button class="btn btn-xs ${u.active?'btn-danger':'btn-teal'}" onclick="AdminModule.toggleUser('${u.id}')">${u.active?'Disable':'Enable'}</button>`:''}
          </div>
        </td>
      </tr>`).join('');
    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>👤 System Users</h3>
          <button class="btn btn-primary btn-sm" onclick="AdminModule.openAddUser()">+ Add User</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No users found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function userModal() {
    const permSections = PERM_CATEGORIES.map((cat, catIdx) => `
      <div style="margin-bottom:16px; background:rgba(0,0,0,0.02); padding:12px; border-radius:8px; border:1px solid var(--border);">
        <div class="flex items-center justify-between mb-2">
          <span style="font-size:12px; font-weight:700; color:var(--primary); text-transform:uppercase; letter-spacing:0.5px;">${cat.name}</span>
          <div class="flex gap-1">
            <button type="button" class="btn btn-ghost btn-xs text-blue" style="font-size:11px; padding:2px 6px;" onclick="AdminModule.toggleCategoryPerms(${catIdx}, true)">Select All</button>
            <button type="button" class="btn btn-ghost btn-xs text-muted" style="font-size:11px; padding:2px 6px;" onclick="AdminModule.toggleCategoryPerms(${catIdx}, false)">Clear</button>
          </div>
        </div>
        <div class="perm-grid" id="perm-cat-${catIdx}">
          ${cat.perms.map(p => `
            <div class="perm-pill">
              <input type="checkbox" id="perm-${p.key}" name="perm" value="${p.key}">
              <label for="perm-${p.key}">${p.label}</label>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
      <div class="modal-overlay hidden" id="admin-user-modal">
        <div class="modal modal-lg" style="max-width:780px;">
          <div class="modal-header">
            <h3 id="user-modal-title">Add User</h3>
            <button class="modal-close" onclick="document.getElementById('admin-user-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" style="max-height:calc(85vh - 120px); overflow-y:auto;">
            <input type="hidden" id="user-edit-id">
            <div class="form-row">
              <div class="form-group"><label class="form-label">Full Name <span class="required">*</span></label><input type="text" id="user-name" class="form-control" placeholder="Full name"></div>
              <div class="form-group"><label class="form-label">Username <span class="required">*</span></label><input type="text" id="user-username" class="form-control" placeholder="Login username"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Password <span class="required">*</span></label><input type="password" id="user-password" class="form-control" placeholder="Password"></div>
              <div class="form-group"><label class="form-label">Role <span class="required">*</span></label>
                <select id="user-role" class="form-control" onchange="AdminModule.onRoleChange()">
                  <option value="operator">Operator</option><option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <div class="flex items-center justify-between mb-2">
                <label class="form-label mb-0" style="font-weight:700;">Module Permissions</label>
                <div class="flex gap-2">
                  <button type="button" class="btn btn-ghost btn-xs text-blue" onclick="AdminModule.toggleAllPerms(true)">Select All Modules</button>
                  <button type="button" class="btn btn-ghost btn-xs text-muted" onclick="AdminModule.toggleAllPerms(false)">Deselect All</button>
                </div>
              </div>
              <div id="perm-container">
                ${permSections}
              </div>
              <div class="form-hint mt-1">Select which functional modules and reports this user is permitted to view/operate.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select id="user-active" class="form-control"><option value="true">Active</option><option value="false">Inactive</option></select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('admin-user-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="AdminModule.saveUser()">&#x1F4BE; Save User</button>
          </div>
        </div>
      </div>`;
  }

  function toggleCategoryPerms(catIdx, selectAll) {
    const cat = PERM_CATEGORIES[catIdx];
    if (!cat) return;
    cat.perms.forEach(p => {
      const cb = document.getElementById(`perm-${p.key}`);
      if (cb && !cb.disabled) cb.checked = selectAll;
    });
  }

  function toggleAllPerms(selectAll) {
    document.querySelectorAll('[name=perm]').forEach(cb => {
      if (!cb.disabled) cb.checked = selectAll;
    });
  }

  function openAddUser() {
    document.getElementById('user-edit-id').value = '';
    document.getElementById('user-modal-title').textContent = 'Add User';
    document.getElementById('user-name').value = '';
    document.getElementById('user-username').value = '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = 'operator';
    document.getElementById('user-active').value = 'true';
    document.querySelectorAll('[name=perm]').forEach(cb => cb.checked = false);
    onRoleChange();
    document.getElementById('admin-user-modal').classList.remove('hidden');
  }

  function editUser(id) {
    const u = DB.Users.find(id);
    if (!u) return;
    document.getElementById('user-edit-id').value = id;
    document.getElementById('user-modal-title').textContent = 'Edit User';
    document.getElementById('user-name').value = u.name;
    document.getElementById('user-username').value = u.username;
    document.getElementById('user-password').value = u.password;
    document.getElementById('user-role').value = u.role;
    document.getElementById('user-active').value = String(u.active);
    document.querySelectorAll('[name=perm]').forEach(cb => { cb.checked = (u.permissions||[]).includes(cb.value); });
    onRoleChange();
    document.getElementById('admin-user-modal').classList.remove('hidden');
  }

  function onRoleChange() {
    const role = document.getElementById('user-role') && document.getElementById('user-role').value;
    const allCbs = document.querySelectorAll('[name=perm]');
    if (role === 'admin') {
      allCbs.forEach(cb => { cb.checked = true; cb.disabled = true; });
    } else {
      allCbs.forEach(cb => { cb.disabled = false; });
    }
  }

  function saveUser() {
    const id = document.getElementById('user-edit-id').value;
    const name = document.getElementById('user-name').value.trim();
    const username = document.getElementById('user-username').value.trim();
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;
    const active = document.getElementById('user-active').value === 'true';
    const permissions = [...document.querySelectorAll('[name=perm]:checked')].map(cb => cb.value);
    if (!name || !username || !password) { showToast('Name, username and password are required', 'error'); return; }
    const existing = DB.Users.findByUsername(username);
    if (existing && existing.id !== id) { showToast('Username already exists', 'error'); return; }
    if (id) { DB.Users.update(id, { name, username, password, role, permissions, active }); showToast('User updated successfully', 'success'); }
    else { DB.Users.insert({ name, username, password, role, permissions, active }); showToast('User created successfully', 'success'); }
    document.getElementById('admin-user-modal').classList.add('hidden');
    renderTab('users');
  }

  function toggleUser(id) {
    const u = DB.Users.find(id);
    if (!u) return;
    if (u.username === 'admin') { showToast('Cannot disable the main admin account', 'error'); return; }
    DB.Users.update(id, { active: !u.active });
    showToast('User ' + (u.active ? 'disabled' : 'enabled'), 'success');
    renderTab('users');
  }

  // ── SUBCONTRACTORS TAB ──────────────────────────────────
  function subTab() {
    const subs = DB.Subcontractors.all();
    const rows = subs.map(s => `
      <tr>
        <td class="font-semibold">${s.name}</td>
        <td>${s.contactPerson||'—'}</td>
        <td>${s.phone||'—'}</td>
        <td>${s.address||'—'}</td>
        <td><span class="badge ${s.active?'badge-green':'badge-red'}">${s.active?'Active':'Inactive'}</span></td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-xs" onclick="AdminModule.editSub('${s.id}')">&#x270F;&#xFE0F; Edit</button>
            <button class="btn btn-xs ${s.active?'btn-danger':'btn-teal'}" onclick="AdminModule.toggleSub('${s.id}')">${s.active?'Disable':'Enable'}</button>
          </div>
        </td>
      </tr>`).join('');
    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>&#x1F3E2; Subcontractors</h3>
          <button class="btn btn-primary btn-sm" onclick="AdminModule.openAddSub()">+ Add Subcontractor</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Contact Person</th><th>Phone</th><th>Address</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No subcontractors found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function subModal() {
    return `
      <div class="modal-overlay hidden" id="admin-sub-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 id="sub-modal-title">Add Subcontractor</h3>
            <button class="modal-close" onclick="document.getElementById('admin-sub-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="sub-edit-id">
            <div class="form-group"><label class="form-label">Name <span class="required">*</span></label><input type="text" id="sub-name" class="form-control" placeholder="Subcontractor name"></div>
            <div class="form-group"><label class="form-label">Contact Person</label><input type="text" id="sub-contact" class="form-control" placeholder="Contact person name"></div>
            <div class="form-group"><label class="form-label">Phone</label><input type="text" id="sub-phone" class="form-control" placeholder="Phone number"></div>
            <div class="form-group"><label class="form-label">Address</label><textarea id="sub-address" class="form-control" rows="2" placeholder="Address"></textarea></div>
            <div class="form-group"><label class="form-label">Status</label><select id="sub-active" class="form-control"><option value="true">Active</option><option value="false">Inactive</option></select></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('admin-sub-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="AdminModule.saveSub()">Save</button>
          </div>
        </div>
      </div>`;
  }

  function openAddSub() {
    document.getElementById('sub-edit-id').value = '';
    document.getElementById('sub-modal-title').textContent = 'Add Subcontractor';
    ['sub-name','sub-contact','sub-phone'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('sub-address').value = '';
    document.getElementById('sub-active').value = 'true';
    document.getElementById('admin-sub-modal').classList.remove('hidden');
  }

  function editSub(id) {
    const s = DB.Subcontractors.find(id);
    if (!s) return;
    document.getElementById('sub-edit-id').value = id;
    document.getElementById('sub-modal-title').textContent = 'Edit Subcontractor';
    document.getElementById('sub-name').value = s.name;
    document.getElementById('sub-contact').value = s.contactPerson||'';
    document.getElementById('sub-phone').value = s.phone||'';
    document.getElementById('sub-address').value = s.address||'';
    document.getElementById('sub-active').value = String(s.active);
    document.getElementById('admin-sub-modal').classList.remove('hidden');
  }

  function saveSub() {
    const id = document.getElementById('sub-edit-id').value;
    const name = document.getElementById('sub-name').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }
    const data = { name, contactPerson: document.getElementById('sub-contact').value.trim(), phone: document.getElementById('sub-phone').value.trim(), address: document.getElementById('sub-address').value.trim(), active: document.getElementById('sub-active').value === 'true' };
    if (id) { DB.Subcontractors.update(id, data); showToast('Subcontractor updated', 'success'); }
    else { DB.Subcontractors.insert(data); showToast('Subcontractor added', 'success'); }
    document.getElementById('admin-sub-modal').classList.add('hidden');
    renderTab('sub');
  }

  function toggleSub(id) {
    const s = DB.Subcontractors.find(id);
    if (!s) return;
    DB.Subcontractors.update(id, { active: !s.active });
    showToast('Subcontractor ' + (s.active ? 'disabled' : 'enabled'), 'success');
    renderTab('sub');
  }

  // ── VENDORS TAB ─────────────────────────────────────────
  function vendorTab() {
    const vendors = DB.Vendors.all();
    const rows = vendors.map(v => `
      <tr>
        <td class="font-semibold">${v.name}</td>
        <td><span class="badge ${v.department==='deflashing'?'badge-amber':'badge-teal'}">${v.department==='deflashing'?'DE Flashing':'Trimming'}</span></td>
        <td>${v.contactPerson||'—'}</td>
        <td>${v.phone||'—'}</td>
        <td><span class="badge ${v.active?'badge-green':'badge-red'}">${v.active?'Active':'Inactive'}</span></td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-xs" onclick="AdminModule.editVendor('${v.id}')">Edit</button>
            <button class="btn btn-xs ${v.active?'btn-danger':'btn-teal'}" onclick="AdminModule.toggleVendor('${v.id}')">${v.active?'Disable':'Enable'}</button>
          </div>
        </td>
      </tr>`).join('');
    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>Vendors</h3>
          <button class="btn btn-primary btn-sm" onclick="AdminModule.openAddVendor()">+ Add Vendor</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Department</th><th>Contact Person</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No vendors found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function vendorModal() {
    return `
      <div class="modal-overlay hidden" id="admin-vendor-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 id="vendor-modal-title">Add Vendor</h3>
            <button class="modal-close" onclick="document.getElementById('admin-vendor-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="vendor-edit-id">
            <div class="form-group"><label class="form-label">Vendor Name <span class="required">*</span></label><input type="text" id="vendor-name" class="form-control" placeholder="Vendor name"></div>
            <div class="form-group"><label class="form-label">Department <span class="required">*</span></label>
              <select id="vendor-dept" class="form-control"><option value="deflashing">Manual DE Flashing</option><option value="trimming">Trimming</option></select>
            </div>
            <div class="form-group"><label class="form-label">Contact Person</label><input type="text" id="vendor-contact" class="form-control" placeholder="Contact person"></div>
            <div class="form-group"><label class="form-label">Phone</label><input type="text" id="vendor-phone" class="form-control" placeholder="Phone number"></div>
            <div class="form-group"><label class="form-label">Status</label><select id="vendor-active" class="form-control"><option value="true">Active</option><option value="false">Inactive</option></select></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('admin-vendor-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="AdminModule.saveVendor()">Save</button>
          </div>
        </div>
      </div>`;
  }

  function openAddVendor() {
    document.getElementById('vendor-edit-id').value = '';
    document.getElementById('vendor-modal-title').textContent = 'Add Vendor';
    ['vendor-name','vendor-contact','vendor-phone'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('vendor-dept').value = 'deflashing';
    document.getElementById('vendor-active').value = 'true';
    document.getElementById('admin-vendor-modal').classList.remove('hidden');
  }

  function editVendor(id) {
    const v = DB.Vendors.find(id);
    if (!v) return;
    document.getElementById('vendor-edit-id').value = id;
    document.getElementById('vendor-modal-title').textContent = 'Edit Vendor';
    document.getElementById('vendor-name').value = v.name;
    document.getElementById('vendor-dept').value = v.department;
    document.getElementById('vendor-contact').value = v.contactPerson||'';
    document.getElementById('vendor-phone').value = v.phone||'';
    document.getElementById('vendor-active').value = String(v.active);
    document.getElementById('admin-vendor-modal').classList.remove('hidden');
  }

  function saveVendor() {
    const id = document.getElementById('vendor-edit-id').value;
    const name = document.getElementById('vendor-name').value.trim();
    const department = document.getElementById('vendor-dept').value;
    if (!name || !department) { showToast('Name and department are required', 'error'); return; }
    const data = { name, department, contactPerson: document.getElementById('vendor-contact').value.trim(), phone: document.getElementById('vendor-phone').value.trim(), active: document.getElementById('vendor-active').value === 'true' };
    if (id) { DB.Vendors.update(id, data); showToast('Vendor updated', 'success'); }
    else { DB.Vendors.insert(data); showToast('Vendor added', 'success'); }
    document.getElementById('admin-vendor-modal').classList.add('hidden');
    renderTab('vendor');
  }

  function toggleVendor(id) {
    const v = DB.Vendors.find(id);
    if (!v) return;
    DB.Vendors.update(id, { active: !v.active });
    showToast('Vendor ' + (v.active ? 'disabled' : 'enabled'), 'success');
    renderTab('vendor');
  }

  // ── OPERATORS TAB ────────────────────────────────────────
  function opTab() {
    const ops = DB.Operators.all();
    const rows = ops.map(o => `
      <tr>
        <td class="font-semibold">${o.name}</td>
        <td class="text-muted">${o.employeeId||'—'}</td>
        <td><span class="badge ${o.active?'badge-green':'badge-red'}">${o.active?'Active':'Inactive'}</span></td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-xs" onclick="AdminModule.editOp('${o.id}')">Edit</button>
            <button class="btn btn-xs ${o.active?'btn-danger':'btn-teal'}" onclick="AdminModule.toggleOp('${o.id}')">${o.active?'Disable':'Enable'}</button>
          </div>
        </td>
      </tr>`).join('');
    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>Operators</h3>
          <button class="btn btn-primary btn-sm" onclick="AdminModule.openAddOp()">+ Add Operator</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Employee ID</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${rows||'<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">No operators found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function opModal() {
    return `
      <div class="modal-overlay hidden" id="admin-op-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 id="op-modal-title">Add Operator</h3>
            <button class="modal-close" onclick="document.getElementById('admin-op-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="op-edit-id">
            <div class="form-group"><label class="form-label">Operator Name <span class="required">*</span></label><input type="text" id="op-name" class="form-control" placeholder="Full name"></div>
            <div class="form-group"><label class="form-label">Employee ID</label><input type="text" id="op-empid" class="form-control" placeholder="Employee ID"></div>
            <div class="form-group"><label class="form-label">Status</label><select id="op-active" class="form-control"><option value="true">Active</option><option value="false">Inactive</option></select></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('admin-op-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="AdminModule.saveOp()">Save</button>
          </div>
        </div>
      </div>`;
  }

  function openAddOp() {
    document.getElementById('op-edit-id').value = '';
    document.getElementById('op-modal-title').textContent = 'Add Operator';
    document.getElementById('op-name').value = '';
    document.getElementById('op-empid').value = '';
    document.getElementById('op-active').value = 'true';
    document.getElementById('admin-op-modal').classList.remove('hidden');
  }

  function editOp(id) {
    const o = DB.Operators.find(id);
    if (!o) return;
    document.getElementById('op-edit-id').value = id;
    document.getElementById('op-modal-title').textContent = 'Edit Operator';
    document.getElementById('op-name').value = o.name;
    document.getElementById('op-empid').value = o.employeeId||'';
    document.getElementById('op-active').value = String(o.active);
    document.getElementById('admin-op-modal').classList.remove('hidden');
  }

  function saveOp() {
    const id = document.getElementById('op-edit-id').value;
    const name = document.getElementById('op-name').value.trim();
    if (!name) { showToast('Operator name is required', 'error'); return; }
    const data = { name, employeeId: document.getElementById('op-empid').value.trim(), active: document.getElementById('op-active').value === 'true' };
    if (id) { DB.Operators.update(id, data); showToast('Operator updated', 'success'); }
    else { DB.Operators.insert(data); showToast('Operator added', 'success'); }
    document.getElementById('admin-op-modal').classList.add('hidden');
    renderTab('op');
  }

  function toggleOp(id) {
    const o = DB.Operators.find(id);
    if (!o) return;
    DB.Operators.update(id, { active: !o.active });
    showToast('Operator ' + (o.active ? 'disabled' : 'enabled'), 'success');
    renderTab('op');
  }

  // ── INSPECTORS TAB ───────────────────────────────────────
  function inspectorTab() {
    const ins = DB.Inspectors.all();
    const rows = ins.map(o => `
      <tr>
        <td class="font-semibold">${o.name}</td>
        <td class="text-muted">${o.employeeId||'—'}</td>
        <td><span class="badge ${o.active?'badge-green':'badge-red'}">${o.active?'Active':'Inactive'}</span></td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-xs" onclick="AdminModule.editInspector('${o.id}')">Edit</button>
            <button class="btn btn-xs ${o.active?'btn-danger':'btn-teal'}" onclick="AdminModule.toggleInspector('${o.id}')">${o.active?'Disable':'Enable'}</button>
          </div>
        </td>
      </tr>`).join('');
    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>Inspectors</h3>
          <button class="btn btn-primary btn-sm" onclick="AdminModule.openAddInspector()">+ Add Inspector</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Employee ID</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${rows||'<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted);">No inspectors found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function inspectorModal() {
    return `
      <div class="modal-overlay hidden" id="admin-inspector-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 id="inspector-modal-title">Add Inspector</h3>
            <button class="modal-close" onclick="document.getElementById('admin-inspector-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="inspector-edit-id">
            <div class="form-group"><label class="form-label">Inspector Name <span class="required">*</span></label><input type="text" id="inspector-name" class="form-control" placeholder="Full name"></div>
            <div class="form-group"><label class="form-label">Employee ID</label><input type="text" id="inspector-empid" class="form-control" placeholder="Employee ID"></div>
            <div class="form-group"><label class="form-label">Status</label><select id="inspector-active" class="form-control"><option value="true">Active</option><option value="false">Inactive</option></select></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('admin-inspector-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="AdminModule.saveInspector()">Save</button>
          </div>
        </div>
      </div>`;
  }

  function openAddInspector() {
    document.getElementById('inspector-edit-id').value = '';
    document.getElementById('inspector-modal-title').textContent = 'Add Inspector';
    document.getElementById('inspector-name').value = '';
    document.getElementById('inspector-empid').value = '';
    document.getElementById('inspector-active').value = 'true';
    document.getElementById('admin-inspector-modal').classList.remove('hidden');
  }

  function editInspector(id) {
    const o = DB.Inspectors.find(id);
    if (!o) return;
    document.getElementById('inspector-edit-id').value = id;
    document.getElementById('inspector-modal-title').textContent = 'Edit Inspector';
    document.getElementById('inspector-name').value = o.name;
    document.getElementById('inspector-empid').value = o.employeeId||'';
    document.getElementById('inspector-active').value = String(o.active);
    document.getElementById('admin-inspector-modal').classList.remove('hidden');
  }

  function saveInspector() {
    const id = document.getElementById('inspector-edit-id').value;
    const name = document.getElementById('inspector-name').value.trim();
    if (!name) { showToast('Inspector name is required', 'error'); return; }
    const data = { name, employeeId: document.getElementById('inspector-empid').value.trim(), active: document.getElementById('inspector-active').value === 'true' };
    if (id) { DB.Inspectors.update(id, data); showToast('Inspector updated', 'success'); }
    else { DB.Inspectors.insert(data); showToast('Inspector added', 'success'); }
    document.getElementById('admin-inspector-modal').classList.add('hidden');
    renderTab('insp');
  }

  function toggleInspector(id) {
    const o = DB.Inspectors.find(id);
    if (!o) return;
    DB.Inspectors.update(id, { active: !o.active });
    showToast('Inspector ' + (o.active ? 'disabled' : 'enabled'), 'success');
    renderTab('insp');
  }

  function systemTab() {
    const isLocalBackup = localStorage.getItem('jmpl_db_is_local_backup') === 'true';
    const statusHtml = isLocalBackup 
      ? `<span class="badge badge-amber" style="padding:6px 12px; font-size:12px;">🟡 Local Backup Database Sandbox (Offline Read-Only)</span>`
      : `<span class="badge badge-green" style="padding:6px 12px; font-size:12px;">🟢 Live Online Database (Cloud Sync Active)</span>`;

    const switchBtnText = isLocalBackup ? 'Switch to Cloud Database' : 'Switch to Local Sandbox';
    const switchBtnClass = isLocalBackup ? 'btn-teal' : 'btn-secondary';

    return `
      <!-- Connection Mode -->
      <div class="card animate-in" style="margin-bottom:24px;">
        <div class="card-header">
          <h3>🔌 Database Connection Status</h3>
        </div>
        <div class="card-body" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="margin-bottom:8px;">${statusHtml}</div>
            <p class="text-xs text-muted" style="max-width:480px;">
              You can toggle between the live cloud database and a local offline sandbox. 
              The local sandbox allows you to safely verify database history or inspect older backups without affecting the live cloud database.
            </p>
          </div>
          <button class="btn ${switchBtnClass}" onclick="AdminModule.toggleDatabaseMode()">${switchBtnText}</button>
        </div>
      </div>

      <!-- Backup & Restore Operations -->
      <div class="card animate-in" style="margin-bottom:24px;">
        <div class="card-header">
          <h3>📦 Database Backup &amp; Restore</h3>
        </div>
        <div class="card-body" style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:16px; border-radius:8px; flex-wrap:wrap; gap:12px;">
            <div>
              <h4 class="font-bold" style="font-size:14px; margin-bottom:4px;">Backup Database</h4>
              <p class="text-xs text-muted" style="max-width:480px;">Downloads a JSON snapshot of the currently active database (including all inventory parts, batch history, logs, and tracking records).</p>
            </div>
            <button class="btn btn-primary" onclick="AdminModule.triggerBackupExport()">📥 Download Backup JSON</button>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:16px; border-radius:8px; flex-wrap:wrap; gap:12px;">
            <div>
              <h4 class="font-bold" style="font-size:14px; margin-bottom:4px;">Restore / Upload to Local Sandbox</h4>
              <p class="text-xs text-muted" style="max-width:480px;">Upload a previously downloaded JSON database backup. The data will be loaded into the **local sandbox** (never overwriting the live database).</p>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="file" id="db-restore-file" accept=".json" style="display:none;" onchange="AdminModule.triggerBackupImport(this)">
              <button class="btn btn-teal" onclick="document.getElementById('db-restore-file').click()">📤 Upload Backup JSON</button>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border); padding:16px; border-radius:8px; flex-wrap:wrap; gap:12px; margin-top: 12px;">
            <div>
              <h4 class="font-bold" style="font-size:14px; margin-bottom:4px; color:var(--accent-red);">Restore / Overwrite Live Cloud Database</h4>
              <p class="text-xs text-muted" style="max-width:480px;">Upload a JSON database backup and restore it directly to the **Live Online Firestore DB**. <strong style="color:var(--accent-red);">WARNING: This will completely overwrite all current cloud database records.</strong></p>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="file" id="db-restore-live-file" accept=".json" style="display:none;" onchange="AdminModule.triggerBackupImportLive(this)">
              <button class="btn btn-red" onclick="document.getElementById('db-restore-live-file').click()">🔥 Restore to Online DB</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card animate-in">
        <div class="card-header">
          <h3>⚙️ System Maintenance</h3>
        </div>
        <div class="card-body">
          <div class="alert alert-danger" style="margin-bottom: 24px; padding: 16px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px;">
            <h4 class="font-bold text-danger" style="margin-bottom: 8px; font-size:15px;">⚠️ Danger Zone</h4>
            <p class="text-sm text-muted">The actions listed here are permanent database operations. They cannot be undone.</p>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding: 20px; border: 1px solid var(--border-color); border-radius: 8px; background:var(--bg-card); flex-wrap:wrap; gap:16px;">
            <div>
              <h4 class="font-bold" style="font-size:15px; margin-bottom:4px;">Clear Production &amp; Sales Data</h4>
              <p class="text-xs text-muted" style="max-width: 480px;">Deletes all batches, department movements, inspection records, sales records, recheck history, and production schedules. <strong>All master registers (Users, Inventory Master Parts, Subcontractors, Vendors, Operators, and Inspectors) will be preserved.</strong></p>
            </div>
            <button class="btn btn-danger" onclick="AdminModule.clearTransactionData()">Clear Transactional Data</button>
          </div>
        </div>
      </div>`;
  }

  function clearTransactionData() {
    const text = 'Are you sure you want to clear all transactional data (batches, movements, schedules, sales)? This action is permanent and cannot be undone!';
    if (!confirm(text)) return;

    const code = prompt('Please type "CONFIRM CLEAR" (case-sensitive) to proceed:');
    if (code !== 'CONFIRM CLEAR') {
      showToast('Action cancelled: Confirmation code was incorrect.', 'warning');
      return;
    }

    try {
      DB.clearTable('batches');
      DB.clearTable('stageRecords');
      DB.clearTable('lossTracker');
      DB.clearTable('rejectionTracker');
      DB.clearTable('recheckTracker');
      DB.clearTable('stockUploads');
      DB.clearTable('sales');
      DB.clearTable('productionRecords');
      DB.clearTable('monthlyPlans');
      DB.clearTable('productionSchedules');

      showToast('All production, schedule, and sales data cleared successfully!', 'success');
      App.navigate('dashboard');
    } catch (e) {
      console.error(e);
      showToast('Error resetting database: ' + e.message, 'error');
    }
  }

  function toggleDatabaseMode() {
    const isLocal = localStorage.getItem('jmpl_db_is_local_backup') === 'true';
    const newMode = !isLocal;
    localStorage.setItem('jmpl_db_is_local_backup', String(newMode));
    showToast(newMode ? 'Switched to Local Backup Sandbox!' : 'Switched to Live Cloud Database!', 'success');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  function triggerBackupExport() {
    try {
      const json = DB.exportBackupJSON();
      const isLocal = localStorage.getItem('jmpl_db_is_local_backup') === 'true';
      const filename = `JMPL_DB_Backup_${isLocal ? 'Sandbox' : 'Live'}_${new Date().toISOString().slice(0, 10)}.json`;
      
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Database backup downloaded successfully', 'success');
    } catch (e) {
      console.error(e);
      showToast('Backup download failed: ' + e.message, 'error');
    }
  }

  function triggerBackupImport(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const res = DB.importBackupJSON(e.target.result);
      if (res.ok) {
        showToast('Database restored to Local Sandbox successfully! Switching connection mode...', 'success');
        localStorage.setItem('jmpl_db_is_local_backup', 'true');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        showToast('Database restore failed: ' + res.error, 'error');
      }
    };
    reader.readAsText(file);
  }

  function triggerBackupImportLive(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    
    const confirmRestore = confirm(
      `⚠️ WARNING: RESTORE TO ONLINE DATABASE ⚠️\n\nYou are about to restore the backup file "${file.name}" to the LIVE cloud Firestore database.\n\nThis will completely delete all existing data in your live cloud database and overwrite it with the backup contents.\n\nThis action CANNOT be undone.\n\nAre you absolutely sure you want to proceed?`
    );
    
    if (!confirmRestore) {
      input.value = '';
      return;
    }
    
    const finalConfirm = prompt(
      `To confirm this destructive action, please type the word "RESTORE" in capital letters below:`
    );
    
    if (finalConfirm !== 'RESTORE') {
      showToast('Restore cancelled. Confirmation word was incorrect.', 'warning');
      input.value = '';
      return;
    }
    
    showToast('Starting online restore, please do not close the browser...', 'info');
    
    const reader = new FileReader();
    reader.onload = async function(e) {
      const res = await DB.restoreToOnlineDB(e.target.result);
      if (res.ok) {
        showToast('Live Cloud Database restored successfully!', 'success');
        localStorage.setItem('jmpl_db_is_local_backup', 'false');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        showToast('Online Database restore failed: ' + res.error, 'error');
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  function tasksTab() {
    const tasks = DB.Tasks.all();
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const cancelledTasks = tasks.filter(t => t.status === 'cancelled');

    const statusLabels = {
      pending: '<span class="badge badge-amber">Pending</span>',
      in_progress: '<span class="badge badge-blue">In Progress</span>',
      completed: '<span class="badge badge-green">Completed</span>',
      cancelled: '<span class="badge badge-red">Cancelled</span>'
    };

    const userOpts = DB.Users.all().map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    const jmrefOpts = DB.Master.all().map(m => `<option value="${m.jmrefNo}">${m.jmrefNo} (${m.partNo})</option>`).join('');

    const rows = tasks.map(t => {
      const formattedDate = (t.createdAt || '').slice(0, 16).replace('T', ' ');
      return `
        <tr>
          <td class="font-semibold text-blue">${t.title}</td>
          <td><span class="badge badge-teal">${t.jmrefNo}</span></td>
          <td>${t.assignedToName || '—'}</td>
          <td>${statusLabels[t.status] || t.status}</td>
          <td>${t.createdByName || '—'}</td>
          <td class="text-sm text-muted">${formattedDate}</td>
          <td>
            <button class="btn btn-ghost btn-xs" onclick="AdminModule.viewTaskDetails('${t.id}')">⏳ Details &amp; History</button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div>
        <!-- Stats Row -->
        <div class="dashboard-stats-grid-6" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom: 20px; gap:16px;">
          <div class="stat-card blue">
            <div class="stat-label">Total Tasks</div>
            <div class="stat-value blue" style="font-size:20px;">${tasks.length}</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-label">Pending Tasks</div>
            <div class="stat-value amber" style="font-size:20px;">${pendingTasks.length}</div>
          </div>
          <div class="stat-card blue">
            <div class="stat-label">In Progress</div>
            <div class="stat-value blue" style="font-size:20px;">${inProgressTasks.length}</div>
          </div>
          <div class="stat-card green">
            <div class="stat-label">Completed</div>
            <div class="stat-value green" style="font-size:20px;">${completedTasks.length}</div>
          </div>
        </div>

        <!-- Tasks Table -->
        <div class="card">
          <div class="card-header flex justify-between items-center" style="padding: 12px 20px;">
            <h3 style="margin:0;">🗂️ Task Assignments</h3>
            <button class="btn btn-primary btn-sm" onclick="AdminModule.openCreateTask()">➕ Create New Task</button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Task Title</th>
                  <th>JMREF No</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="7" class="text-center text-muted" style="padding:20px;">No tasks registered yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Admin Task Details Modal -->
        <div class="modal-overlay hidden" id="admin-task-detail-modal">
          <div class="modal modal-md" style="max-width: 600px;">
            <div class="modal-header">
              <h3>⏳ Task Details &amp; Timeline History</h3>
              <button class="modal-close" onclick="document.getElementById('admin-task-detail-modal').classList.add('hidden')">&#x2715;</button>
            </div>
            <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
              <div style="background: var(--bg-input); padding: 14px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border);">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
                  <div>
                    <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">Task Title</span>
                    <div class="font-semibold" id="adm-task-title"></div>
                  </div>
                  <div>
                    <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">JMREF No</span>
                    <div class="font-semibold" id="adm-task-jmref"></div>
                  </div>
                  <div style="grid-column: span 2;">
                    <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">Description</span>
                    <div style="white-space: pre-wrap;" id="adm-task-desc"></div>
                  </div>
                  <div style="grid-column: span 2; display: none;" id="adm-task-solution-panel">
                    <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600; color:var(--success);">Solution / Action Taken</span>
                    <div style="white-space: pre-wrap; font-weight: 600; color:var(--success);" id="adm-task-solution"></div>
                  </div>
                </div>
              </div>
              
              <h4 style="font-size:14px; font-weight:700; margin-bottom:12px;">⏳ Tracking Logs History</h4>
              <div id="adm-task-timeline" style="display:flex; flex-direction:column; gap:12px;"></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" onclick="document.getElementById('admin-task-detail-modal').classList.add('hidden')">Close</button>
            </div>
          </div>
        </div>

        <!-- Admin Task Create Modal -->
        <div class="modal-overlay hidden" id="adm-task-create-modal">
          <div class="modal modal-md">
            <div class="modal-header">
              <h3>➕ Create New Task (Admin)</h3>
              <button class="modal-close" onclick="document.getElementById('adm-task-create-modal').classList.add('hidden')">&#x2715;</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Associated JMREF No <span class="required">*</span></label>
                <select id="adm-task-create-jmref" class="form-control">
                  <option value="">Select JMREF...</option>
                  ${jmrefOpts}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Task Title <span class="required">*</span></label>
                <input type="text" id="adm-task-create-title" class="form-control" placeholder="Enter short task summary">
              </div>
              <div class="form-group">
                <label class="form-label">Task Description</label>
                <textarea id="adm-task-create-desc" class="form-control" rows="3" placeholder="Enter detailed task context or issue description"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">Assign To User <span class="required">*</span></label>
                <select id="adm-task-create-assign" class="form-control">
                  <option value="">Select user...</option>
                  ${userOpts}
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" onclick="document.getElementById('adm-task-create-modal').classList.add('hidden')">Cancel</button>
              <button class="btn btn-primary" onclick="AdminModule.createTask()">Create Task</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function viewTaskDetails(taskId) {
    const t = DB.Tasks.find(taskId);
    if (!t) return;
    
    document.getElementById('adm-task-title').textContent = t.title || '—';
    document.getElementById('adm-task-jmref').textContent = t.jmrefNo || '—';
    document.getElementById('adm-task-desc').textContent = t.taskDesc || '—';
    
    const solPanel = document.getElementById('adm-task-solution-panel');
    const solText = document.getElementById('adm-task-solution');
    if (t.solution) {
      solPanel.style.display = 'block';
      solText.textContent = t.solution;
    } else {
      solPanel.style.display = 'none';
    }
    
    const timelineEl = document.getElementById('adm-task-timeline');
    const statusPills = {
      pending: '<span class="badge badge-amber btn-xs">Pending</span>',
      in_progress: '<span class="badge badge-blue btn-xs">In Progress</span>',
      completed: '<span class="badge badge-green btn-xs">Completed</span>',
      cancelled: '<span class="badge badge-red btn-xs">Cancelled</span>'
    };
    
    if (timelineEl) {
      timelineEl.innerHTML = (t.history || []).map(h => `
        <div style="border-left: 2px solid var(--border); padding-left: 14px; position: relative; margin-bottom: 6px;">
          <div style="position: absolute; left: -6px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent-blue);"></div>
          <div class="flex justify-between items-center flex-wrap gap-2">
            <div class="font-semibold" style="font-size: 13px;">${statusPills[h.status] || h.status}</div>
            <div class="text-xs text-muted">${h.date || ''} — by ${h.updatedBy || 'system'}</div>
          </div>
          <div class="text-sm text-muted mt-1" style="word-break: break-word;">${h.note || '—'}</div>
          ${h.solution ? `<div class="text-sm mt-1" style="color: var(--success); font-weight: 600;">🛠️ Solution: ${h.solution}</div>` : ''}
        </div>
      `).join('') || '<div class="text-muted text-center">No history logs recorded</div>';
    }
    
    document.getElementById('admin-task-detail-modal').classList.remove('hidden');
  }

  function openCreateTask() {
    document.getElementById('adm-task-create-jmref').value = '';
    document.getElementById('adm-task-create-title').value = '';
    document.getElementById('adm-task-create-desc').value = '';
    document.getElementById('adm-task-create-assign').value = '';
    document.getElementById('adm-task-create-modal').classList.remove('hidden');
  }

  function createTask() {
    const jmrefNo = document.getElementById('adm-task-create-jmref').value;
    const title = document.getElementById('adm-task-create-title').value.trim();
    const taskDesc = document.getElementById('adm-task-create-desc').value.trim();
    const assignedId = document.getElementById('adm-task-create-assign').value;

    if (!jmrefNo || !title || !assignedId) {
      showToast('Please fill all required fields (*)', 'error');
      return;
    }

    const assignedUser = DB.Users.find(assignedId);
    const session = Auth.getSession();
    const timestamp = new Date().toISOString();
    const initialHistory = [{
      status: 'pending',
      note: 'Task initialized & assigned to ' + (assignedUser ? assignedUser.name : 'unknown'),
      updatedBy: session ? session.name : 'system',
      date: timestamp.slice(0, 16).replace('T', ' '),
      createdAt: timestamp
    }];

    DB.Tasks.insert({
      jmrefNo,
      title,
      taskDesc,
      assignedTo: assignedId,
      assignedToName: assignedUser ? assignedUser.name : 'unknown',
      status: 'pending',
      solution: '',
      createdBy: session ? session.userId : 'system',
      createdByName: session ? session.name : 'system',
      createdAt: timestamp,
      updatedAt: timestamp,
      history: initialHistory
    });

    showToast('Task created successfully!', 'success');
    document.getElementById('adm-task-create-modal').classList.add('hidden');
    renderTab('tasks');
  }

  function batchesTab() {
    return `
      <div class="card animate-in">
        <div class="card-header">
          <h3>📦 Manage Batch Stages</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <input type="text" id="admin-batch-search" class="form-control" placeholder="Search by Batch No or JM Ref No..." oninput="AdminModule.filterAdminBatches(this.value)">
          </div>
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>Batch Number</th>
                  <th>JM Ref No</th>
                  <th>Part No</th>
                  <th>Current Stage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="admin-batch-table-body">
                ${renderAdminBatchRows('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminBatchRows(query) {
    const batches = DB.Batches.all();
    const filtered = query
      ? batches.filter(b => 
          (b.batchNo && b.batchNo.toLowerCase().includes(query.toLowerCase())) ||
          (b.jmrefNo && b.jmrefNo.toLowerCase().includes(query.toLowerCase()))
        )
      : batches;
      
    filtered.sort((a, b) => {
      const dateA = a.createdAt || '';
      const dateB = b.createdAt || '';
      return dateB.localeCompare(dateA);
    });

    if (filtered.length === 0) {
      return `<tr><td colspan="5" style="text-align:center;" class="text-muted">No batches found</td></tr>`;
    }

    const ADMIN_STAGES = {
      production: 'Moulding',
      cryogenic: 'Cryogenic',
      deflashing: 'Manual DE Flashing',
      trimming: 'Trimming',
      'post-curing': 'Post Curing',
      'waiting-visual': 'Waiting for Visual',
      visual: 'Visual Inspection',
      gauge: 'Gauge Inspection',
      quality: 'QC Final',
      store: 'Store'
    };

    return filtered.map(b => {
      const options = Object.entries(ADMIN_STAGES).map(([val, label]) => {
        const selected = b.currentStage === val ? 'selected' : '';
        return `<option value="${val}" ${selected}>${label}</option>`;
      }).join('');

      return `
        <tr>
          <td class="font-semibold">${b.batchNo || 'N/A'}</td>
          <td class="text-muted">${b.jmrefNo || 'N/A'}</td>
          <td>${b.partNo || 'N/A'}</td>
          <td>
            <select id="admin-stage-select-${b.id}" class="form-control form-control-sm" style="padding:4px 8px; font-size:12px; max-width:200px;">
              ${options}
            </select>
          </td>
          <td>
            <button class="btn btn-primary btn-xs" onclick="AdminModule.saveBatchStage('${b.id}')">💾 Save</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function filterAdminBatches(query) {
    const tbody = document.getElementById('admin-batch-table-body');
    if (tbody) {
      tbody.innerHTML = renderAdminBatchRows(query);
    }
  }

  function saveBatchStage(batchId) {
    const select = document.getElementById(`admin-stage-select-${batchId}`);
    if (!select) return;
    const newStage = select.value;
    
    const batch = DB.Batches.find(batchId);
    if (!batch) {
      showToast('Batch not found', 'error');
      return;
    }
    
    const status = newStage === 'store' ? 'completed' : 'active';
    
    try {
      DB.Batches.update(batchId, { currentStage: newStage, status: status });
      showToast('Batch stage updated successfully', 'success');
      
      const searchInput = document.getElementById('admin-batch-search');
      filterAdminBatches(searchInput ? searchInput.value : '');
    } catch (e) {
      console.error(e);
      showToast('Failed to update stage: ' + e.message, 'error');
    }
  }

  return { render, openAddUser, editUser, saveUser, toggleUser, onRoleChange, toggleCategoryPerms, toggleAllPerms, openAddSub, editSub, saveSub, toggleSub, openAddVendor, editVendor, saveVendor, toggleVendor, openAddOp, editOp, saveOp, toggleOp, openAddInspector, editInspector, saveInspector, toggleInspector, clearTransactionData, toggleDatabaseMode, triggerBackupExport, triggerBackupImport, triggerBackupImportLive, viewTaskDetails, openCreateTask, createTask, filterAdminBatches, saveBatchStage };
})();
