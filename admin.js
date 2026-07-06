// ============================================================
// admin.js — Admin Panel Module
// ============================================================
const AdminModule = (() => {
  const PERMS = ['master','production','cryogenic','deflashing','trimming','post-curing','waiting-visual','visual','gauge','quality','store','stock','monthly-plan','prod-sched','replenishment','report_inventory','report_sales','report_production','report_cryogenic','report_deflashing','report_trimming','report_post_curing','report_waiting_visual','report_visual','report_gauge','report_rejected','report_recheck'];
  const PERM_LABELS = {
    master: 'Inventory Master',
    production: 'Production',
    cryogenic: 'Cryogenic',
    deflashing: 'DE Flashing',
    trimming: 'Trimming',
    'post-curing': 'Post Curing',
    'waiting-visual': 'Waiting for Visual inspection',
    visual: 'Visual',
    gauge: 'Gauge',
    quality: 'Quality Final',
    store: 'Store',
    stock: 'Stock Upload',
    'monthly-plan': 'Monthly Plan',
    'prod-sched': 'Production Schedule',
    replenishment: 'Replenishment Planner',
    report_inventory: 'Report: Inventory',
    report_sales: 'Report: Sales',
    report_production: 'Report: Production',
    report_cryogenic: 'Report: Cryo Loss',
    report_deflashing: 'Report: DE Flash Loss',
    report_trimming: 'Report: Trimming Loss',
    report_post_curing: 'Report: Post Curing Loss',
    report_waiting_visual: 'Report: Waiting for Visual inspection',
    report_visual: 'Report: Visual Insp',
    report_gauge: 'Report: Gauge Insp',
    report_rejected: 'Report: Rejected Batches',
    report_recheck: 'Report: QF Recheck'
  };
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
    const permPills = PERMS.map(p => `
      <div class="perm-pill">
        <input type="checkbox" id="perm-${p}" name="perm" value="${p}">
        <label for="perm-${p}">${PERM_LABELS[p]}</label>
      </div>`).join('');
    return `
      <div class="modal-overlay hidden" id="admin-user-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3 id="user-modal-title">Add User</h3>
            <button class="modal-close" onclick="document.getElementById('admin-user-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
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
              <label class="form-label">Module Permissions</label>
              <div class="perm-grid" id="perm-grid">${permPills}</div>
              <div class="form-hint">Select which modules this user can access.</div>
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
    const grid = document.getElementById('perm-grid');
    if (!grid) return;
    if (role === 'admin') {
      grid.querySelectorAll('input').forEach(cb => { cb.checked = true; cb.disabled = true; });
    } else {
      grid.querySelectorAll('input').forEach(cb => { cb.disabled = false; });
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
    return `
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

  return { render, openAddUser, editUser, saveUser, toggleUser, onRoleChange, openAddSub, editSub, saveSub, toggleSub, openAddVendor, editVendor, saveVendor, toggleVendor, openAddOp, editOp, saveOp, toggleOp, openAddInspector, editInspector, saveInspector, toggleInspector, clearTransactionData };
})();
