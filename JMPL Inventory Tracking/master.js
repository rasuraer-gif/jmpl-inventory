// ============================================================
// master.js — Inventory Master Module
// ============================================================
const MasterModule = (() => {
  let searchTerm = '';

  function render() {
    const el = document.getElementById('content');
    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div><h2 class="font-bold" style="font-size:20px;">Inventory Master</h2><p class="text-sm text-muted mt-1">Manage Part Numbers, JMREF Numbers and Descriptions</p></div>
          <button class="btn btn-primary" onclick="MasterModule.openAdd()">+ Add Part</button>
        </div>
        <div id="master-stats" class="stats-grid" style="grid-template-columns:repeat(2,1fr);max-width:340px;margin-bottom:24px;"></div>
        <div class="card">
          <div class="card-header">
            <h3>Parts List</h3>
            <div class="search-input">
              <span class="search-icon">&#128269;</span>
              <input type="text" class="form-control" id="master-search" placeholder="Search by Part No or JMREF..." oninput="MasterModule.search(this.value)">
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>#</th><th>Part No</th><th>JMREF No</th><th>Description</th><th>Created Date</th><th>Actions</th></tr></thead>
              <tbody id="master-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="modal-overlay hidden" id="master-modal">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3 id="master-modal-title">Add Part</h3>
            <button class="modal-close" onclick="document.getElementById('master-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="master-edit-id">
            <div class="form-group"><label class="form-label">Part No <span class="required">*</span></label><input type="text" id="master-partno" class="form-control" placeholder="e.g. OR-001"></div>
            <div class="form-group"><label class="form-label">JMREF No <span class="required">*</span></label><input type="text" id="master-jmref" class="form-control" placeholder="e.g. JMREF-2024-001"></div>
            <div class="form-group"><label class="form-label">Description <span class="required">*</span></label><textarea id="master-desc" class="form-control" rows="3" placeholder="Product description"></textarea></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('master-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="MasterModule.save()">Save Part</button>
          </div>
        </div>
      </div>`;
    renderStats();
    renderTable();
  }

  function renderStats() {
    const all = DB.Master.all();
    const el = document.getElementById('master-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-card teal"><div class="stat-label">Total Parts</div><div class="stat-value teal">${all.length}</div></div>
      <div class="stat-card blue"><div class="stat-label">This Month</div><div class="stat-value blue">${all.filter(m=>(m.createdAt||'').startsWith(new Date().toISOString().slice(0,7))).length}</div></div>`;
  }

  function renderTable() {
    const tbody = document.getElementById('master-tbody');
    if (!tbody) return;
    let parts = DB.Master.all();
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      parts = parts.filter(p => p.partNo.toLowerCase().includes(s) || p.jmrefNo.toLowerCase().includes(s) || (p.description||'').toLowerCase().includes(s));
    }
    if (!parts.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">&#128203;</div><p>No parts found. Add your first part.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = parts.map((p, i) => `
      <tr>
        <td class="text-muted">${i+1}</td>
        <td class="font-semibold text-blue">${p.partNo}</td>
        <td><span class="badge badge-teal">${p.jmrefNo}</span></td>
        <td>${p.description}</td>
        <td class="text-muted text-sm">${(p.createdAt||'').slice(0,10)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-xs" onclick="MasterModule.openEdit('${p.id}')">Edit</button>
            <button class="btn btn-danger btn-xs" onclick="MasterModule.remove('${p.id}')">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function search(val) { searchTerm = val; renderTable(); }

  function openAdd() {
    document.getElementById('master-edit-id').value = '';
    document.getElementById('master-modal-title').textContent = 'Add Part';
    document.getElementById('master-partno').value = '';
    document.getElementById('master-jmref').value = '';
    document.getElementById('master-desc').value = '';
    document.getElementById('master-modal').classList.remove('hidden');
  }

  function openEdit(id) {
    const p = DB.Master.find(id);
    if (!p) return;
    document.getElementById('master-edit-id').value = id;
    document.getElementById('master-modal-title').textContent = 'Edit Part';
    document.getElementById('master-partno').value = p.partNo;
    document.getElementById('master-jmref').value = p.jmrefNo;
    document.getElementById('master-desc').value = p.description;
    document.getElementById('master-modal').classList.remove('hidden');
  }

  function save() {
    const id = document.getElementById('master-edit-id').value;
    const partNo = document.getElementById('master-partno').value.trim();
    const jmrefNo = document.getElementById('master-jmref').value.trim();
    const description = document.getElementById('master-desc').value.trim();
    if (!partNo || !jmrefNo || !description) { showToast('All fields are required', 'error'); return; }
    const all = DB.Master.all();
    if (all.find(p => p.partNo === partNo && p.id !== id)) { showToast('Part No already exists', 'error'); return; }
    if (all.find(p => p.jmrefNo === jmrefNo && p.id !== id)) { showToast('JMREF No already exists', 'error'); return; }
    if (id) { DB.Master.update(id, { partNo, jmrefNo, description }); showToast('Part updated', 'success'); }
    else { DB.Master.insert({ partNo, jmrefNo, description }); showToast('Part added', 'success'); }
    document.getElementById('master-modal').classList.add('hidden');
    renderStats(); renderTable();
  }

  function remove(id) {
    const inUse = DB.Batches.all().some(b => b.partId === id);
    if (inUse) { showToast('Cannot delete - this part is used in batches', 'error'); return; }
    if (!confirm('Delete this part? This cannot be undone.')) return;
    DB.Master.remove(id);
    showToast('Part deleted', 'success');
    renderStats(); renderTable();
  }

  return { render, search, openAdd, openEdit, save, remove };
})();
