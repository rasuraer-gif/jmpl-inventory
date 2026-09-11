// ============================================================
// master.js — Inventory Master Module
// ============================================================
const MasterModule = (() => {
  let searchTerm = '';
  let parsedRows = [];
  let lastRawJson = null;
  let currentPage = 1;
  const itemsPerPage = 50;

  function render() {
    const el = document.getElementById('content');
    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div><h2 class="font-bold" style="font-size:20px;">Inventory Master</h2><p class="text-sm text-muted mt-1">Manage Part Numbers, Technical Specifications, and Pricing</p></div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" onclick="MasterModule.openBulk()">📥 Bulk Upload</button>
            <button class="btn btn-primary" onclick="MasterModule.openAdd()">+ Add Part</button>
          </div>
        </div>
        <div id="master-stats" class="stats-grid" style="grid-template-columns:repeat(2,1fr);max-width:340px;margin-bottom:24px;"></div>
        <div class="card">
          <div class="card-header">
            <h3>Parts List</h3>
            <div class="search-input">
              <span class="search-icon">&#128269;</span>
              <input type="text" class="form-control" id="master-search" placeholder="Search by Part No, JMREF, Compound..." oninput="MasterModule.search(this.value)">
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table" style="min-width: 950px;">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Part No</th>
                  <th>JMREF No</th>
                  <th>Sale Price</th>
                  <th>Blank Wt (g)</th>
                  <th>Target Inv</th>
                  <th>Description</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="master-tbody"></tbody>
            </table>
          </div>
          <div id="master-pagination"></div>
        </div>
      </div>
      
      ${quickMoveConfigModal()}
      <div class="modal-overlay hidden" id="master-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3 id="master-modal-title">Add Part</h3>
            <button class="modal-close" onclick="document.getElementById('master-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="master-edit-id">
            
            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Part No <span class="required">*</span></label>
                <input type="text" id="master-partno" class="form-control" placeholder="e.g. OR-001">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">JMREF No <span class="required">*</span></label>
                <input type="text" id="master-jmref" class="form-control" placeholder="e.g. JMREF-2024-001">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">10 Digit No</label>
                <input type="text" id="master-tendigit" class="form-control" placeholder="e.g. 1234567890">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Compound Code</label>
                <input type="text" id="master-compound" class="form-control" placeholder="e.g. CC-90">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Sale Price</label>
                <input type="number" id="master-saleprice" class="form-control" placeholder="e.g. 15.50" step="0.01" min="0">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Time (Minutes)</label>
                <input type="number" id="master-time" class="form-control" placeholder="e.g. 10" min="0">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Temperature (°C)</label>
                <input type="number" id="master-temp" class="form-control" placeholder="e.g. 150">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Pressure (Psi)</label>
                <input type="number" id="master-pressure" class="form-control" placeholder="e.g. 120">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Sheet Thickness (mm)</label>
                <input type="number" id="master-thickness" class="form-control" placeholder="e.g. 2.5" step="0.1" min="0">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Blank Length (mm)</label>
                <input type="number" id="master-length" class="form-control" placeholder="e.g. 200" step="0.1" min="0">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Blank Weight (Grams)</label>
                <input type="number" id="master-weight" class="form-control" placeholder="e.g. 4.5" step="0.01" min="0">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Description <span class="required">*</span></label>
                <input type="text" id="master-desc" class="form-control" placeholder="Product description">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Average Target Inventory (Qty)</label>
                <input type="number" id="master-avgtarget" class="form-control" placeholder="e.g. 5000" min="0">
              </div>
              <div class="form-group" style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                <label class="form-label" style="display:flex; align-items:center; gap:8px; cursor:pointer; margin:0;">
                  <input type="checkbox" id="master-quick-enable" style="width:16px; height:16px; cursor:pointer;">
                  <strong style="color:var(--primary);">⚡ Enable Quick Movement for this JMREF</strong>
                </label>
                <div class="form-hint" style="font-size:11px; margin-top:2px;">Enables 1-step output Qty stage transitions for high daily volume.</div>
              </div>
            </div>

            <hr style="margin: 16px 0; border: 0; border-top: 1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h4 style="color:var(--primary); font-size:14px; font-weight:600; margin:0;">🛠️ Mould Details</h4>
              <button type="button" class="btn btn-secondary btn-xs" onclick="MasterModule.addMouldRow()">+ Add Mould</button>
            </div>
            <!-- Column Headers -->
            <div style="display: flex; gap: 8px; font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; padding-right: 28px;">
              <div style="width: 85px;">Mould No</div>
              <div style="width: 110px;">Mould Type</div>
              <div style="width: 70px;">Cavities</div>
              <div style="flex: 1;">Process Flow</div>
              <div style="width: 130px;">First Process</div>
            </div>
            <div id="moulds-container" style="max-height: 200px; overflow-y: auto; padding-right: 4px; margin-bottom: 8px;"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('master-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="MasterModule.save()">Save Part</button>
          </div>
        </div>
      </div>
      
      ${bulkModal()}`;
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
      parts = parts.filter(p => 
        p.partNo.toLowerCase().includes(s) || 
        p.jmrefNo.toLowerCase().includes(s) || 
        (p.description||'').toLowerCase().includes(s) ||
        (p.tenDigitNo||'').toLowerCase().includes(s) ||
        (p.compoundCode||'').toLowerCase().includes(s)
      );
    }

    const totalItems = parts.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageItems = parts.slice(startIdx, endIdx);

    const pagEl = document.getElementById('master-pagination');
    if (pagEl) {
      if (totalPages > 1) {
        pagEl.innerHTML = `
          <div class="flex justify-between items-center p-4" style="border-top:1px solid var(--border); flex-wrap:wrap; gap:12px; background:var(--bg-glass-hover); border-radius: 0 0 var(--radius-md) var(--radius-md); margin-top: 16px;">
            <div class="text-sm text-muted">
              Showing <strong>${startIdx + 1}</strong> to <strong>${Math.min(endIdx, totalItems)}</strong> of <strong>${totalItems}</strong> entries
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-xs" onclick="MasterModule.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>
              <span class="text-sm font-semibold flex items-center px-2">Page ${currentPage} of ${totalPages}</span>
              <button class="btn btn-secondary btn-xs" onclick="MasterModule.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>
            </div>
          </div>
        `;
      } else {
        pagEl.innerHTML = '';
      }
    }

    if (!pageItems.length) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">&#128203;</div><p>No parts found. Add your first part.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = pageItems.map((p, i) => `
      <tr>
        <td class="text-muted">${startIdx + i + 1}</td>
        <td class="font-semibold text-blue">${p.partNo}</td>
        <td>
          <span class="badge badge-teal">${p.jmrefNo}</span>
          ${p.quickMovementEnabled ? ' <span class="badge badge-amber" style="font-size:10px;">⚡ Quick Move</span>' : ''}
        </td>
        <td class="font-semibold">${p.salePrice != null ? p.salePrice : '—'}</td>
        <td>${p.blankWeight != null ? p.blankWeight : '—'}</td>
        <td class="font-semibold text-success">${p.averageTargetInventory != null ? formatNum(p.averageTargetInventory) : '—'}</td>
        <td>
          <div>${p.description || '—'}</div>
          ${p.moulds && p.moulds.length ? `
            <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
              ${p.moulds.map(m => `<span class="badge badge-gray" style="font-size: 10px; padding: 2px 6px; border: 1px solid var(--border);" title="Mould ${m.mouldNo}\nType: ${m.mouldType}\nCavities: ${m.cavities || '—'}\nFirst Process: ${m.firstProcess}\nFlow: ${m.processFlow}">M#${m.mouldNo} (${m.mouldType})${m.cavities ? ` [Cav: ${m.cavities}]` : ''}</span>`).join('')}
            </div>
          ` : ''}
        </td>
        <td class="text-muted text-sm">${(p.createdAt||'').slice(0,10)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-xs" onclick="MasterModule.openEdit('${p.id}')">Edit</button>
            ${p.quickMovementEnabled ? `<button class="btn btn-secondary btn-xs" style="color:var(--warning); border-color:rgba(245, 158, 11, 0.4);" onclick="MasterModule.openQuickMoveConfig('${p.id}')" title="Configure Quick Movement Stage Sequence">⚡ Quick Move Config</button>` : ''}
            <button class="btn btn-danger btn-xs" onclick="MasterModule.remove('${p.id}')">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function search(val) { searchTerm = val; currentPage = 1; renderTable(); }

  function changePage(page) {
    currentPage = page;
    renderTable();
  }

  function createMouldRowElement(m = {}) {
    const div = document.createElement('div');
    div.className = 'mould-row';
    div.style = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
    div.innerHTML = `
      <div style="width: 85px;">
        <select class="form-control mould-no">
          <option value="1" ${Number(m.mouldNo) === 1 ? 'selected' : ''}>Mould 1</option>
          <option value="2" ${Number(m.mouldNo) === 2 ? 'selected' : ''}>Mould 2</option>
          <option value="3" ${Number(m.mouldNo) === 3 ? 'selected' : ''}>Mould 3</option>
          <option value="4" ${Number(m.mouldNo) === 4 ? 'selected' : ''}>Mould 4</option>
          <option value="5" ${Number(m.mouldNo) === 5 ? 'selected' : ''}>Mould 5</option>
        </select>
      </div>
      <div style="width: 110px;">
        <select class="form-control mould-type">
          <option value="Yet to be assigned" ${!m.mouldType || m.mouldType === 'Yet to be assigned' ? 'selected' : ''}>Yet to be assigned</option>
          <option value="Cryogenic" ${m.mouldType === 'Cryogenic' ? 'selected' : ''}>Cryogenic</option>
          <option value="Flash Free" ${m.mouldType === 'Flash Free' ? 'selected' : ''}>Flash Free</option>
          <option value="Normal" ${m.mouldType === 'Normal' ? 'selected' : ''}>Normal</option>
          ${m.mouldType && m.mouldType !== 'Yet to be assigned' && m.mouldType !== 'Cryogenic' && m.mouldType !== 'Flash Free' && m.mouldType !== 'Normal' ? `<option value="${m.mouldType}" selected>${m.mouldType}</option>` : ''}
        </select>
      </div>
      <div style="width: 70px;">
        <input type="number" class="form-control mould-cavities" placeholder="Qty" min="1" value="${m.cavities || ''}">
      </div>
      <div style="flex: 1;">
        <input type="text" class="form-control mould-flow" placeholder="Process Flow" value="${m.processFlow || ''}">
      </div>
      <div style="width: 130px;">
        <select class="form-control mould-first-process">
          <option value="Cryogenic" ${m.firstProcess === 'Cryogenic' ? 'selected' : ''}>Cryogenic</option>
          <option value="Flash Removal" ${m.firstProcess === 'Flash Removal' ? 'selected' : ''}>Flash Removal</option>
          <option value="Trimming" ${m.firstProcess === 'Trimming' ? 'selected' : ''}>Trimming</option>
        </select>
      </div>
      <button type="button" class="btn btn-danger btn-xs" onclick="MasterModule.removeMouldRow(this)" style="padding: 4px 8px;">✕</button>
    `;
    return div;
  }

  function addMouldRow() {
    const container = document.getElementById('moulds-container');
    if (container) {
      container.appendChild(createMouldRowElement({}));
    }
  }

  function removeMouldRow(btn) {
    btn.closest('.mould-row').remove();
  }

  function openAdd() {
    document.getElementById('master-edit-id').value = '';
    document.getElementById('master-modal-title').textContent = 'Add Part';
    document.getElementById('master-partno').value = '';
    document.getElementById('master-jmref').value = '';
    document.getElementById('master-desc').value = '';
    document.getElementById('master-tendigit').value = '';
    document.getElementById('master-compound').value = '';
    document.getElementById('master-saleprice').value = '';
    document.getElementById('master-time').value = '';
    document.getElementById('master-temp').value = '';
    document.getElementById('master-pressure').value = '';
    document.getElementById('master-thickness').value = '';
    document.getElementById('master-length').value = '';
    document.getElementById('master-weight').value = '';
    document.getElementById('master-avgtarget').value = '';
    const qInp = document.getElementById('master-quick-enable');
    if (qInp) qInp.checked = false;
    
    const container = document.getElementById('moulds-container');
    if (container) {
      container.innerHTML = '';
      container.appendChild(createMouldRowElement({
        mouldNo: 1,
        mouldType: 'Yet to be assigned',
        processFlow: 'Cryogenic',
        firstProcess: 'Cryogenic'
      }));
    }
    
    document.getElementById('master-modal').classList.remove('hidden');
  }

  function openEdit(id) {
    const p = DB.Master.find(id);
    if (!p) return;
    document.getElementById('master-edit-id').value = id;
    document.getElementById('master-modal-title').textContent = 'Edit Part';
    document.getElementById('master-partno').value = p.partNo || '';
    document.getElementById('master-jmref').value = p.jmrefNo || '';
    document.getElementById('master-desc').value = p.description || '';
    document.getElementById('master-tendigit').value = p.tenDigitNo || '';
    document.getElementById('master-compound').value = p.compoundCode || '';
    document.getElementById('master-saleprice').value = p.salePrice != null ? p.salePrice : '';
    document.getElementById('master-time').value = p.timeMinutes != null ? p.timeMinutes : '';
    document.getElementById('master-temp').value = p.temperature != null ? p.temperature : '';
    document.getElementById('master-pressure').value = p.pressure != null ? p.pressure : '';
    document.getElementById('master-thickness').value = p.sheetThickness != null ? p.sheetThickness : '';
    document.getElementById('master-length').value = p.blankLength != null ? p.blankLength : '';
    document.getElementById('master-weight').value = p.blankWeight != null ? p.blankWeight : '';
    document.getElementById('master-avgtarget').value = p.averageTargetInventory != null ? p.averageTargetInventory : '';
    const qInp = document.getElementById('master-quick-enable');
    if (qInp) qInp.checked = !!p.quickMovementEnabled;
    
    const container = document.getElementById('moulds-container');
    if (container) {
      container.innerHTML = '';
      if (p.moulds && p.moulds.length) {
        p.moulds.forEach(m => {
          container.appendChild(createMouldRowElement(m));
        });
      }
    }

    document.getElementById('master-modal').classList.remove('hidden');
  }

  function save() {
    const id = document.getElementById('master-edit-id').value;
    const partNo = document.getElementById('master-partno').value.trim();
    const jmrefNo = document.getElementById('master-jmref').value.trim();
    const description = document.getElementById('master-desc').value.trim();
    
    const tenDigitNo = document.getElementById('master-tendigit').value.trim();
    const compoundCode = document.getElementById('master-compound').value.trim();
    const salePrice = document.getElementById('master-saleprice').value !== '' ? parseFloat(document.getElementById('master-saleprice').value) : null;
    const timeMinutes = document.getElementById('master-time').value !== '' ? parseFloat(document.getElementById('master-time').value) : null;
    const temperature = document.getElementById('master-temp').value !== '' ? parseFloat(document.getElementById('master-temp').value) : null;
    const pressure = document.getElementById('master-pressure').value !== '' ? parseFloat(document.getElementById('master-pressure').value) : null;
    const sheetThickness = document.getElementById('master-thickness').value !== '' ? parseFloat(document.getElementById('master-thickness').value) : null;
    const blankLength = document.getElementById('master-length').value !== '' ? parseFloat(document.getElementById('master-length').value) : null;
    const blankWeight = document.getElementById('master-weight').value !== '' ? parseFloat(document.getElementById('master-weight').value) : null;
    const averageTargetInventory = document.getElementById('master-avgtarget').value !== '' ? parseInt(document.getElementById('master-avgtarget').value, 10) : null;
    const quickMovementEnabled = document.getElementById('master-quick-enable')?.checked || false;

    if (!partNo || !jmrefNo || !description) { showToast('Part No, JMREF No, and Description are required', 'error'); return; }

    // Read and validate moulds
    const mouldRows = Array.from(document.querySelectorAll('.mould-row'));
    const moulds = mouldRows.map(row => {
      const cavitiesInput = row.querySelector('.mould-cavities')?.value.trim();
      return {
        mouldNo: parseInt(row.querySelector('.mould-no').value, 10),
        mouldType: row.querySelector('.mould-type').value,
        cavities: cavitiesInput ? parseInt(cavitiesInput, 10) : null,
        processFlow: row.querySelector('.mould-flow').value.trim(),
        firstProcess: row.querySelector('.mould-first-process').value
      };
    });

    if (moulds.some(m => !m.processFlow)) {
      showToast('Process Flow is required for all moulds', 'error');
      return;
    }

    const all = DB.Master.all();
    if (all.find(p => p.partNo === partNo && p.id !== id)) { showToast('Part No already exists', 'error'); return; }
    if (all.find(p => p.jmrefNo === jmrefNo && p.id !== id)) { showToast('JMREF No already exists', 'error'); return; }

    const fields = { 
      partNo, 
      jmrefNo, 
      description,
      tenDigitNo,
      compoundCode,
      salePrice,
      timeMinutes,
      temperature,
      pressure,
      sheetThickness,
      blankLength,
      blankWeight,
      averageTargetInventory,
      quickMovementEnabled,
      moulds
    };

    if (id) { 
      DB.Master.update(id, fields); 
      showToast('Part updated', 'success'); 
    } else { 
      DB.Master.insert(fields); 
      showToast('Part added', 'success'); 
    }
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

  // ── Excel Bulk Upload Implementation ───────────────────────
  function bulkModal() {
    return `
      <div class="modal-overlay hidden" id="master-bulk-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>📥 Bulk Upload Parts via Excel</h3>
            <button class="modal-close" onclick="document.getElementById('master-bulk-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <div style="margin-bottom: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
              <p style="margin-bottom: 8px;">Upload an Excel sheet containing part specifications to add them in bulk.</p>
              <ul style="padding-left: 20px; list-style-type: disc; margin-bottom: 12px;">
                <li><strong>Required columns:</strong> Part No, JMREF No, Description.</li>
                <li><strong>Optional columns:</strong> 10 Digit No, Compound Code, Sale Price, Time (Minutes), Temperature, Pressure, Sheet Thickness, Blank Length, Blank Weight, Average Target Inventory.</li>
              </ul>
              <button class="btn btn-ghost btn-sm" onclick="MasterModule.downloadTemplate()">📥 Download Template Excel</button>
            </div>
            
            <div class="form-group">
              <label class="form-label">Select Excel File (.xlsx, .xls)</label>
              <input type="file" id="bulk-file-input" class="form-control" accept=".xlsx, .xls" onchange="MasterModule.handleFileSelect(event)">
            </div>
            
            <div class="form-group" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="bulk-update-existing" style="cursor: pointer; width: 16px; height: 16px;" onchange="MasterModule.handleUpdateCheckboxChange()">
              <label for="bulk-update-existing" style="font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text);">Update existing parts if duplicate Part No / JMREF No is found</label>
            </div>
            
            <div id="bulk-preview-container" class="hidden" style="margin-top:20px;">
              <h4 style="font-size:13.5px; font-weight:600; margin-bottom:10px;" id="bulk-preview-title">Preview parsed records</h4>
              <div class="table-wrap" style="max-height: 240px; overflow-y: auto;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Part No</th>
                      <th>JMREF No</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="bulk-preview-tbody"></tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('master-bulk-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" id="bulk-save-btn" disabled onclick="MasterModule.saveBulk()">Upload Parts</button>
          </div>
        </div>
      </div>`;
  }

  function openBulk() {
    const input = document.getElementById('bulk-file-input');
    if (input) input.value = '';
    const updateChk = document.getElementById('bulk-update-existing');
    if (updateChk) updateChk.checked = false;
    lastRawJson = null;
    const container = document.getElementById('bulk-preview-container');
    if (container) container.classList.add('hidden');
    const saveBtn = document.getElementById('bulk-save-btn');
    if (saveBtn) saveBtn.disabled = true;
    
    document.getElementById('master-bulk-modal').classList.remove('hidden');
  }

  function downloadTemplate() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library is still loading, please wait', 'warning');
      return;
    }
    const headers = [
      'Part No', 'JMREF No', 'Description', '10 Digit No', 'Compound Code',
      'Sale Price', 'Time (Minutes)', 'Temperature', 'Pressure', 
      'Sheet Thickness', 'Blank Length', 'Blank Weight', 'Average Target Inventory',
      'Mould Nos', 'Mould Types', 'Cavities', 'Process Flows', 'First Processes'
    ];

    const parts = DB.Master.all();
    let rows = [];

    if (parts && parts.length > 0) {
      rows = parts.map(p => {
        const mouldNos = (p.moulds || []).map(m => m.mouldNo).join('; ');
        const mouldTypes = (p.moulds || []).map(m => m.mouldType || 'Yet to be assigned').join('; ');
        const cavities = (p.moulds || []).map(m => m.cavities || '').join('; ');
        const processFlows = (p.moulds || []).map(m => m.processFlow || 'Cryogenic').join(' ; ');
        const firstProcesses = (p.moulds || []).map(m => m.firstProcess || 'Cryogenic').join('; ');

        return [
          p.partNo || '',
          p.jmrefNo || '',
          p.description || '',
          p.tenDigitNo || '',
          p.compoundCode || '',
          p.salePrice != null ? p.salePrice : '',
          p.timeMinutes != null ? p.timeMinutes : '',
          p.temperature != null ? p.temperature : '',
          p.pressure != null ? p.pressure : '',
          p.sheetThickness != null ? p.sheetThickness : '',
          p.blankLength != null ? p.blankLength : '',
          p.blankWeight != null ? p.blankWeight : '',
          p.averageTargetInventory != null ? p.averageTargetInventory : '',
          mouldNos,
          mouldTypes,
          cavities,
          processFlows,
          firstProcesses
        ];
      });
    } else {
      rows = [
        ['OR-101', 'JMREF-2026-101', 'O-Ring 101 Description', '1234567890', 'CC-70', '12.50', '8', '140', '100', '2.0', '150', '3.5', '5000', '1', 'Cryogenic', '4', 'Cryogenic', 'Cryogenic'],
        ['OR-102', 'JMREF-2026-102', 'O-Ring 102 Description', '0987654321', 'CC-80', '18.00', '10', '150', '110', '2.5', '180', '4.2', '8000', '1; 2', 'Cryogenic; Yet to be assigned', '4; 2', 'Cryogenic, Visual ; Cryogenic, Gauge, Visual', 'Cryogenic; Cryogenic']
      ];
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parts Template');
    XLSX.writeFile(wb, 'JMPL_Parts_Upload_Template.xlsx');
    showToast('Template Excel downloaded', 'success');
  }

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded. Refresh and try again.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet);
        lastRawJson = rawJson;
        validateAndPreview(rawJson);
      } catch (err) {
        console.error(err);
        showToast('Error reading Excel: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleUpdateCheckboxChange() {
    if (lastRawJson) {
      validateAndPreview(lastRawJson);
    }
  }

  function validateAndPreview(rawJson) {
    const tbody = document.getElementById('bulk-preview-tbody');
    const container = document.getElementById('bulk-preview-container');
    const saveBtn = document.getElementById('bulk-save-btn');
    if (!tbody || !container || !saveBtn) return;

    tbody.innerHTML = '';
    parsedRows = [];

    const existingMaster = DB.Master.all();
    const seenPartNo = new Set();
    const seenJmref = new Set();
    let validCount = 0;

    rawJson.forEach(row => {
      // Normalise key names (lowercase and trim spaces)
      const normRow = {};
      Object.keys(row).forEach(k => {
        normRow[k.trim().toLowerCase()] = String(row[k]).trim();
      });

      const partNo = normRow['part no'] || normRow['partno'] || '';
      const jmrefNo = normRow['jmref no'] || normRow['jmrefno'] || normRow['jmref'] || '';
      const description = normRow['description'] || normRow['desc'] || '';
      const tenDigitNo = normRow['10 digit no'] || normRow['tendigit'] || '';
      const compoundCode = normRow['compound code'] || normRow['compoundcode'] || normRow['compound'] || '';
      
      const salePrice = normRow['sale price'] || normRow['saleprice'] || '';
      const timeMinutes = normRow['time (minutes)'] || normRow['time'] || '';
      const temperature = normRow['temperature'] || normRow['temp'] || '';
      const pressure = normRow['pressure'] || '';
      const sheetThickness = normRow['sheet thickness'] || normRow['thickness'] || '';
      const blankLength = normRow['blank length'] || normRow['length'] || '';
      const blankWeight = normRow['blank weight'] || normRow['weight'] || '';
      const averageTargetInventory = normRow['average target inventory'] || normRow['avgtarget'] || normRow['average target inventory (qty)'] || normRow['target inventory'] || normRow['target'] || '';

      const mouldNosStr = normRow['mould nos'] || normRow['moulds'] || normRow['mould no'] || '1';
      const mouldTypesStr = normRow['mould types'] || normRow['mould type'] || 'Yet to be assigned';
      const cavitiesStr = normRow['cavities'] || normRow['cavity'] || '';
      const processFlowsStr = normRow['process flows'] || normRow['process flow'] || 'Cryogenic';
      const firstProcessesStr = normRow['first processes'] || normRow['first process'] || 'Cryogenic';

      const mouldNos = String(mouldNosStr).split(/[;,]/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const mouldTypes = String(mouldTypesStr).split(/[;,]/).map(s => s.trim());
      const cavitiesList = String(cavitiesStr).split(/[;,]/).map(s => parseInt(s.trim(), 10));
      const processFlows = String(processFlowsStr).split(';').map(s => s.trim());
      const firstProcesses = String(firstProcessesStr).split(/[;,]/).map(s => s.trim());

      const moulds = [];
      const numMoulds = Math.max(mouldNos.length, 1);
      for (let i = 0; i < numMoulds; i++) {
        const cav = cavitiesList[i] != null && !isNaN(cavitiesList[i]) ? cavitiesList[i] : (cavitiesList[0] != null && !isNaN(cavitiesList[0]) ? cavitiesList[0] : null);
        
        let mType = 'Yet to be assigned';
        const rawType = mouldTypes[i] !== undefined ? mouldTypes[i] : mouldTypes[0];
        if (rawType && rawType.trim() !== '') {
          const t = rawType.trim();
          const lowerT = t.toLowerCase();
          if (lowerT === 'cryogenic' || lowerT === 'cryo') mType = 'Cryogenic';
          else if (lowerT === 'flash free' || lowerT === 'flashfree' || lowerT === 'ff') mType = 'Flash Free';
          else if (lowerT === 'normal' || lowerT === 'std') mType = 'Normal';
          else if (lowerT.includes('yet') || lowerT.includes('assign')) mType = 'Yet to be assigned';
          else {
            // Capitalize first letter of each word
            mType = t.replace(/\b\w/g, c => c.toUpperCase());
          }
        }

        moulds.push({
          mouldNo: mouldNos[i] || (i + 1),
          mouldType: mType,
          cavities: cav,
          processFlow: processFlows[i] || processFlows[0] || 'Cryogenic',
          firstProcess: firstProcesses[i] || firstProcesses[0] || 'Cryogenic'
        });
      }

      const updateExisting = document.getElementById('bulk-update-existing')?.checked;
      let status = 'Valid';
      let isValid = true;
      let existingId = null;

      if (!partNo || !jmrefNo || !description) {
        status = 'Missing required fields';
        isValid = false;
      } else {
        const dupPart = existingMaster.find(p => p.partNo === partNo);
        const dupJmref = existingMaster.find(p => p.jmrefNo === jmrefNo);

        if (dupPart || dupJmref) {
          if (updateExisting) {
            status = 'Update';
            existingId = dupPart ? dupPart.id : dupJmref.id;
            isValid = true;
          } else {
            status = dupPart ? 'Duplicate Part No' : 'Duplicate JMREF No';
            isValid = false;
          }
        } else if (seenPartNo.has(partNo)) {
          status = 'Duplicate Part No in Excel';
          isValid = false;
        } else if (seenJmref.has(jmrefNo)) {
          status = 'Duplicate JMREF No in Excel';
          isValid = false;
        }
      }

      if (isValid) {
        seenPartNo.add(partNo);
        seenJmref.add(jmrefNo);
        validCount++;
      }

      const record = {
        partNo,
        jmrefNo,
        description,
        tenDigitNo,
        compoundCode,
        salePrice: salePrice !== '' ? parseFloat(salePrice) : null,
        timeMinutes: timeMinutes !== '' ? parseFloat(timeMinutes) : null,
        temperature: temperature !== '' ? parseFloat(temperature) : null,
        pressure: pressure !== '' ? parseFloat(pressure) : null,
        sheetThickness: sheetThickness !== '' ? parseFloat(sheetThickness) : null,
        blankLength: blankLength !== '' ? parseFloat(blankLength) : null,
        blankWeight: blankWeight !== '' ? parseFloat(blankWeight) : null,
        averageTargetInventory: averageTargetInventory !== '' ? parseInt(averageTargetInventory, 10) : null,
        moulds,
        id: existingId,
        isValid
      };

      parsedRows.push(record);

      let statusBadge = `<span class="badge badge-green">Valid</span>`;
      if (!isValid) {
        statusBadge = `<span class="badge badge-red" title="${status}">${status}</span>`;
      } else if (existingId) {
        statusBadge = `<span class="badge badge-blue">Update</span>`;
      }

      tbody.innerHTML += `
        <tr>
          <td class="font-semibold">${partNo || '<span class="text-danger">—</span>'}</td>
          <td><span class="badge badge-teal">${jmrefNo || '—'}</span></td>
          <td>${statusBadge}</td>
        </tr>`;
    });

    document.getElementById('bulk-preview-title').textContent = `Parsed ${rawJson.length} records (${validCount} valid)`;
    container.classList.remove('hidden');
    saveBtn.disabled = validCount === 0;
  }

  function saveBulk() {
    const validRows = parsedRows.filter(row => row.isValid);
    if (!validRows.length) return;

    const footer = document.querySelector('#master-bulk-modal .modal-footer');
    if (footer) {
      footer.innerHTML = `
        <div id="upload-progress-container" style="flex: 1; text-align: left; padding: 0 10px;">
          <div style="font-weight: 600; font-size: 12px; margin-bottom: 4px; color: var(--text-primary);" id="upload-progress-text">Saving: 0%</div>
          <div style="width: 100%; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; position: relative;">
            <div id="upload-progress-bar" style="width: 0%; height: 100%; background: var(--accent-green); transition: width 0.1s ease-in-out;"></div>
          </div>
        </div>
      `;
    }

    let uploadedCount = 0;
    let updatedCount = 0;
    const total = validRows.length;
    const chunkSize = 20;

    window.preventAutoRefresh = true;

    async function doUpload() {
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = validRows.slice(i, i + chunkSize);
        chunk.forEach(row => {
          const fields = { ...row };
          delete fields.isValid;
          
          if (fields.id) {
            const existingId = fields.id;
            delete fields.id;
            const existingPart = DB.Master.find(existingId);
            if (existingPart) {
              const merged = { ...existingPart, ...fields };
              if (fields.moulds && fields.moulds.length > 0) {
                merged.moulds = fields.moulds;
              }
              DB.Master.update(existingId, merged);
              updatedCount++;
            }
          } else {
            DB.Master.insert(fields);
            uploadedCount++;
          }
        });

        const percent = Math.round(((i + chunk.length) / total) * 100);
        const progressText = document.getElementById('upload-progress-text');
        const progressBar = document.getElementById('upload-progress-bar');
        if (progressText) progressText.textContent = `Saving: ${percent}% (${i + chunk.length}/${total})`;
        if (progressBar) progressBar.style.width = `${percent}%`;

        await new Promise(resolve => setTimeout(resolve, 80));
      }

      if (updatedCount > 0 && uploadedCount > 0) {
        showToast(`Successfully uploaded ${uploadedCount} new parts and updated ${updatedCount} parts!`, 'success');
      } else if (updatedCount > 0) {
        showToast(`Successfully updated ${updatedCount} parts!`, 'success');
      } else {
        showToast(`Successfully uploaded ${uploadedCount} parts!`, 'success');
      }

      if (footer) {
        footer.innerHTML = `
          <div style="flex: 1; text-align: center; color: var(--success); font-weight: 700; font-size: 13px;">
            ✓ Upload completed successfully!
          </div>
        `;
      }

      setTimeout(() => {
        document.getElementById('master-bulk-modal').classList.add('hidden');
        const input = document.getElementById('bulk-file-input');
        if (input) input.value = '';
        
        window.preventAutoRefresh = false;
        renderStats();
        renderTable();
      }, 1000);
    }

    doUpload().catch(err => {
      showToast('Error uploading parts: ' + err.message, 'error');
      window.preventAutoRefresh = false;
      renderTable();
    });
  }

  // ── Quick Movement Stage Sequence Configuration ───────────
  let mouldConfigsCache = {};

  const DEFAULT_QUICK_MOVE_STAGES = [
    { key: 'production', label: 'Production', icon: '🏭', enabled: true },
    { key: 'cryogenic', label: 'Cryogenic', icon: '❄️', enabled: true },
    { key: 'deflashing', label: 'Flash Removal', icon: '🔧', enabled: true },
    { key: 'waiting-trimming', label: 'Waiting for Trimming', icon: '⏳', enabled: true },
    { key: 'trimming', label: 'Trimming (Subcontractor)', icon: '✂️', enabled: true },
    { key: 'waiting-visual', label: 'Waiting for Visual Inspection', icon: '⏳', enabled: true }
  ];

  function quickMoveConfigModal() {
    return `
      <div class="modal-overlay hidden" id="master-quick-move-config-modal">
        <div class="modal modal-lg" style="max-width:850px;">
          <div class="modal-header" style="background:var(--bg-glass-hover); border-bottom:1px solid var(--border);">
            <div>
              <h3 id="qm-config-title" style="display:flex; align-items:center; gap:8px;">
                <span>⚡ Quick Stage Movement Configuration (Mould-Wise)</span>
              </h3>
              <p class="text-xs text-muted" id="qm-config-subtitle">Configure ordered stage progression & subcontractor vendor rules per Mould</p>
            </div>
            <button class="modal-close" onclick="document.getElementById('master-quick-move-config-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" style="padding:20px;">
            <input type="hidden" id="qm-config-part-id">
            <input type="hidden" id="qm-active-mould-no">
            
            <!-- Part Info -->
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-md); padding:14px 16px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div>
                <div style="font-weight:700; font-size:16px; color:var(--primary);" id="qm-config-jmref-display">—</div>
                <div style="font-size:12px; color:var(--text-secondary);" id="qm-config-moulds-display">Mould Details: —</div>
              </div>
              <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background:var(--bg-glass-hover); padding:8px 14px; border-radius:var(--radius-sm); border:1px solid var(--border);">
                <input type="checkbox" id="qm-config-enable-toggle" style="width:18px; height:18px; cursor:pointer;">
                <span style="font-weight:700; color:var(--warning);" id="qm-enable-toggle-label">⚡ Enable Quick Movement for this Mould</span>
              </label>
            </div>

            <!-- Mould Selector Tabs -->
            <div style="margin-bottom:16px;">
              <div style="font-size:12px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">🛠️ Select Mould No to Configure:</div>
              <div class="tabs" id="qm-mould-tabs"></div>
            </div>

            <!-- Configured Stage Pipeline Order -->
            <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
              <h4 style="font-size:14px; font-weight:600; margin:0;" id="qm-stage-order-title">📋 Stage Sequence Order & Subcontractor Rules</h4>
              <span class="text-xs text-muted">Subcontractor vendor details auto-derived from Mould movement details</span>
            </div>

            <div class="table-wrap">
              <table class="data-table" style="width:100%; font-size:12px;">
                <thead>
                  <tr>
                    <th style="width:50px;">Order</th>
                    <th>Stage Name</th>
                    <th>Stage Key</th>
                    <th>Subcontractor Vendor</th>
                    <th style="width:100px;">Max Loss %</th>
                    <th style="width:80px;">Enabled</th>
                    <th style="width:80px;">Reorder</th>
                  </tr>
                </thead>
                <tbody id="qm-config-stages-tbody">
                </tbody>
              </table>
            </div>

            <!-- Loss Protection Rules -->
            <div style="margin-top:20px; background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.2); border-radius:var(--radius-sm); padding:12px;">
              <div style="font-weight:600; font-size:12px; color:var(--danger); margin-bottom:4px;">⚠️ High Scrap Loss Guardrail</div>
              <div style="font-size:11px; color:var(--text-secondary);">
                If calculated scrap loss exceeds the <strong>Max Loss %</strong> limit during quick stage movement, the operator must enter mandatory remarks before progressing.
              </div>
            </div>
          </div>
          <div class="modal-footer" style="padding:12px 20px; background:var(--bg-glass-hover); border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px;">
            <button class="btn btn-secondary" onclick="document.getElementById('master-quick-move-config-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="MasterModule.saveQuickMoveConfig()">💾 Save Configuration</button>
          </div>
        </div>
      </div>`;
  }

  function openQuickMoveConfig(partId) {
    const p = DB.Master.find(partId);
    if (!p) { showToast('Part not found', 'error'); return; }

    document.getElementById('qm-config-part-id').value = p.id;
    document.getElementById('qm-config-jmref-display').textContent = `${p.jmrefNo} (${p.partNo})`;

    const moulds = (p.moulds && p.moulds.length) ? p.moulds : [{ mouldNo: 1, mouldType: 'Standard', processFlow: 'Standard' }];
    
    document.getElementById('qm-config-moulds-display').textContent = 'Configured Moulds: ' + moulds.map(m => `M#${m.mouldNo} (${m.mouldType || 'Std'})`).join(' | ');

    mouldConfigsCache = {};

    moulds.forEach(m => {
      const k = String(m.mouldNo);
      let existingConfig = (p.quickMovementMouldConfigs && p.quickMovementMouldConfigs[k]) || m.quickMovementConfig;
      if (!existingConfig && p.quickMovementConfig) existingConfig = p.quickMovementConfig;

      if (existingConfig && existingConfig.stages) {
        mouldConfigsCache[k] = JSON.parse(JSON.stringify(existingConfig));
      } else {
        mouldConfigsCache[k] = {
          enabled: true,
          stages: JSON.parse(JSON.stringify(DEFAULT_QUICK_MOVE_STAGES))
        };
      }
    });

    const tabsEl = document.getElementById('qm-mould-tabs');
    if (tabsEl) {
      tabsEl.innerHTML = moulds.map((m, idx) => `
        <button class="tab-btn ${idx === 0 ? 'active' : ''}" data-mould-no="${m.mouldNo}" onclick="MasterModule.switchQuickMoveMouldTab('${m.mouldNo}')">
          🛠️ Mould #${m.mouldNo} (${m.mouldType || 'Std'})
        </button>
      `).join('');
    }

    const firstMouldNo = String(moulds[0].mouldNo);
    document.getElementById('qm-active-mould-no').value = firstMouldNo;

    loadMouldConfigToUI(firstMouldNo);
    document.getElementById('master-quick-move-config-modal').classList.remove('hidden');
  }

  function switchQuickMoveMouldTab(targetMouldNo) {
    targetMouldNo = String(targetMouldNo);
    const currentMouldNo = document.getElementById('qm-active-mould-no').value;

    if (currentMouldNo) {
      mouldConfigsCache[currentMouldNo] = {
        enabled: document.getElementById('qm-config-enable-toggle')?.checked || false,
        stages: getStagesFromConfigTable()
      };
    }

    document.getElementById('qm-active-mould-no').value = targetMouldNo;

    document.querySelectorAll('#qm-mould-tabs .tab-btn').forEach(btn => {
      if (String(btn.dataset.mouldNo) === targetMouldNo) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    loadMouldConfigToUI(targetMouldNo);
  }

  function getVendorsForStage(stgKey, stgLabel) {
    const rawVendors = (DB.Vendors ? DB.Vendors.all() : []);
    const key = (stgKey || '').toLowerCase();
    const label = (stgLabel || '').toLowerCase();

    const isFlashStage = key === 'deflashing' || (label.includes('flash') || label.includes('deflashing')) && !label.includes('cryo');
    const isTrimStage = key === 'trimming' || key === 'waiting-trimming' || label.includes('trimming');

    if (isFlashStage) {
      return rawVendors.filter(v => {
        if (!v || !v.name || v.active === false) return false;
        const dept = (v.department || '').toLowerCase();
        const name = (v.name || '').toLowerCase();
        return dept === 'deflashing' || name.includes('flash') || name.includes('shanthi');
      });
    }

    if (isTrimStage) {
      return rawVendors.filter(v => {
        if (!v || !v.name || v.active === false) return false;
        const dept = (v.department || '').toLowerCase();
        const name = (v.name || '').toLowerCase();
        return dept === 'trimming' || name.includes('trimming') || name.includes('chitra');
      });
    }

    return [];
  }

  function loadMouldConfigToUI(mouldNo) {
    mouldNo = String(mouldNo);
    const config = mouldConfigsCache[mouldNo] || { enabled: true, stages: DEFAULT_QUICK_MOVE_STAGES };
    let rawStages = (config.stages && config.stages.length) ? config.stages : DEFAULT_QUICK_MOVE_STAGES;
    let filteredStages = rawStages.filter(s => !['visual', 'quality', 'store'].includes(s.key));

    const toggle = document.getElementById('qm-config-enable-toggle');
    if (toggle) toggle.checked = !!config.enabled;

    const labelEl = document.getElementById('qm-enable-toggle-label');
    if (labelEl) labelEl.textContent = `⚡ Enable Quick Movement for Mould #${mouldNo}`;

    const titleEl = document.getElementById('qm-stage-order-title');
    if (titleEl) titleEl.textContent = `📋 Stage Sequence Order & Subcontractor Rules (Mould #${mouldNo})`;

    renderQuickMoveConfigTable(filteredStages);
  }

  function renderQuickMoveConfigTable(stages) {
    const tbody = document.getElementById('qm-config-stages-tbody');
    if (!tbody) return;

    tbody.innerHTML = stages.map((stg, idx) => {
      const isVendorStage = ['trimming', 'waiting-trimming', 'deflashing'].includes(stg.key) || 
                            (/trimming|flash removal|deflashing/i.test(stg.label || '') && !/cryo/i.test(stg.label || ''));

      let vendorCellContent = `<span class="text-xs text-muted">N/A (In-House)</span>`;

      if (isVendorStage) {
        const stageVendors = getVendorsForStage(stg.key, stg.label);
        const vendorOptions = `<option value="">-- In-House / Direct --</option>` + stageVendors.map(v => 
          `<option value="${v.id}" ${stg.subcontractorVendorId === v.id ? 'selected' : ''}>${v.name}</option>`
        ).join('');

        vendorCellContent = `
          <select class="form-control form-control-sm qm-vendor-select" style="font-size:12px; height:30px;">
            ${vendorOptions}
          </select>
        `;
      }

      return `
        <tr data-stage-key="${stg.key}">
          <td class="font-bold text-center" style="font-size:13px; color:var(--primary);">${idx + 1}</td>
          <td>
            <div style="font-weight:600;">${stg.icon || '📌'} ${stg.label}</div>
          </td>
          <td><code style="font-size:11px; background:var(--bg-glass-hover); padding:2px 6px; border-radius:4px;">${stg.key}</code></td>
          <td>
            ${vendorCellContent}
          </td>
          <td>
            <input type="number" class="form-control form-control-sm qm-max-loss" value="${stg.maxLossPercent != null ? stg.maxLossPercent : 10}" min="0" max="100" style="width:70px; font-size:12px; height:30px;">
          </td>
          <td class="text-center">
            <input type="checkbox" class="qm-stage-enable" ${stg.enabled !== false ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer;">
          </td>
          <td class="text-center">
            <div class="flex justify-center gap-1">
              <button class="btn btn-ghost btn-xs" onclick="MasterModule.moveStageRow(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>▲</button>
              <button class="btn btn-ghost btn-xs" onclick="MasterModule.moveStageRow(${idx}, 1)" ${idx === stages.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function moveStageRow(index, delta) {
    const stages = getStagesFromConfigTable();
    const newIdx = index + delta;
    if (newIdx < 0 || newIdx >= stages.length) return;
    
    const temp = stages[index];
    stages[index] = stages[newIdx];
    stages[newIdx] = temp;

    renderQuickMoveConfigTable(stages);
  }

  function getStagesFromConfigTable() {
    const trs = Array.from(document.querySelectorAll('#qm-config-stages-tbody tr'));
    return trs.map((tr) => {
      const key = tr.dataset.stageKey;
      const label = tr.querySelector('div[style*="font-weight:600"]')?.textContent.trim() || key;
      const vendorSelect = tr.querySelector('.qm-vendor-select');
      const vendorId = vendorSelect ? vendorSelect.value : '';
      const vendorName = vendorSelect && vendorSelect.selectedIndex >= 0 ? vendorSelect.options[vendorSelect.selectedIndex].text : '';
      const maxLossPercent = parseFloat(tr.querySelector('.qm-max-loss')?.value) || 10;
      const enabled = tr.querySelector('.qm-stage-enable')?.checked || false;
      const iconMatch = label.match(/^(\S+)\s+(.*)$/);
      const icon = iconMatch ? iconMatch[1] : '📌';
      const cleanLabel = iconMatch ? iconMatch[2] : label;

      return {
        key,
        label: cleanLabel,
        icon,
        enabled,
        subcontractorVendorId: vendorId,
        subcontractorVendorName: vendorName.includes('--') ? '' : vendorName,
        maxLossPercent
      };
    });
  }

  function saveQuickMoveConfig() {
    const partId = document.getElementById('qm-config-part-id').value;
    if (!partId) return;

    const currentMouldNo = document.getElementById('qm-active-mould-no').value;
    if (currentMouldNo) {
      mouldConfigsCache[currentMouldNo] = {
        enabled: document.getElementById('qm-config-enable-toggle')?.checked || false,
        stages: getStagesFromConfigTable()
      };
    }

    const p = DB.Master.find(partId);
    if (!p) return;

    p.quickMovementMouldConfigs = mouldConfigsCache;

    if (p.moulds && p.moulds.length) {
      p.moulds.forEach(m => {
        const k = String(m.mouldNo);
        if (mouldConfigsCache[k]) {
          m.quickMovementConfig = mouldConfigsCache[k];
        }
      });
    }

    const hasAnyEnabled = Object.values(mouldConfigsCache).some(c => c.enabled);
    p.quickMovementEnabled = hasAnyEnabled;

    DB.Master.update(partId, p);

    document.getElementById('master-quick-move-config-modal').classList.add('hidden');
    showToast(`Mould-wise Quick Movement Configuration saved successfully!`, 'success');
    renderTable();
  }

  return { render, search, openAdd, openEdit, save, remove, openBulk, downloadTemplate, handleFileSelect, saveBulk, addMouldRow, removeMouldRow, handleUpdateCheckboxChange, changePage, openQuickMoveConfig, saveQuickMoveConfig, moveStageRow, switchQuickMoveMouldTab };
})();

// ── Global Quick Movement Execution Handler ─────────────────
window.QuickMovementHandler = {
  redirectToDeliveryChallan: function(batchId, vendorId) {
    const modalEl = document.getElementById('quick-move-scanner-modal');
    if (modalEl) modalEl.classList.add('hidden');

    if (window.App && typeof App.navigate === 'function') {
      App.navigate('delivery-challan');
      setTimeout(() => {
        if (window.DeliveryChallanModule && typeof DeliveryChallanModule.addBatchFromQuickMove === 'function') {
          DeliveryChallanModule.addBatchFromQuickMove(batchId, vendorId);
        }
      }, 300);
    }
  },

  isQuickMoveConfigured: function(batch) {
    if (!batch) return false;
    const stageKey = batch.currentStage || batch.stage;
    if (['waiting-visual', 'visual', 'gauge', 'quality', 'store'].includes(stageKey)) return false;

    const part = DB.Master.find(batch.partId) || DB.Master.findByJmref(batch.jmrefNo);
    if (!part) return false;

    const batchMouldNo = batch.mouldNo != null ? String(batch.mouldNo) : (part.moulds && part.moulds[0] ? String(part.moulds[0].mouldNo) : '1');
    
    let mouldConfig = null;
    if (part.quickMovementMouldConfigs) {
      mouldConfig = part.quickMovementMouldConfigs[batchMouldNo];
    }
    if (!mouldConfig && part.moulds && part.moulds.length) {
      const matchingMould = part.moulds.find(m => String(m.mouldNo) === batchMouldNo || Number(m.mouldNo) === Number(batchMouldNo));
      if (matchingMould) mouldConfig = matchingMould.quickMovementConfig;
    }
    if (!mouldConfig) {
      mouldConfig = part.quickMovementConfig;
    }

    return !!(mouldConfig && mouldConfig.enabled);
  },

  openScannerModal: function(prefilledBatchId = null) {
    let modal = document.getElementById('quick-move-scanner-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay hidden';
      modal.id = 'quick-move-scanner-modal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal modal-md" style="max-width:560px;">
        <div class="modal-header" style="background:var(--bg-glass-hover); border-bottom:1px solid var(--border);">
          <div>
            <h3 style="display:flex; align-items:center; gap:8px;">⚡ Quick Stage Movement Execution</h3>
            <p class="text-xs text-muted" id="qm-header-subtitle">${prefilledBatchId ? 'Confirm 1-step Quick Stage Movement' : 'Scan batch barcode for 1-step stage progression'}</p>
          </div>
          <button class="modal-close" onclick="document.getElementById('quick-move-scanner-modal').classList.add('hidden')">&#x2715;</button>
        </div>
        <div class="modal-body" style="padding:20px;">
          <div class="form-group" id="qm-scan-input-group" style="margin-bottom:16px; ${prefilledBatchId ? 'display:none;' : ''}">
            <label class="form-label font-bold" style="color:var(--primary);">Scan / Enter Batch Number</label>
            <div class="flex gap-2">
              <input type="text" id="qm-scan-input" class="form-control font-mono" placeholder="Scan QR / Batch No..." autofocus onkeydown="if(event.key==='Enter') QuickMovementHandler.lookupBatch(this.value)">
              <button class="btn btn-primary" onclick="QuickMovementHandler.lookupBatch(document.getElementById('qm-scan-input').value)">🔍 Search</button>
            </div>
          </div>
          <div id="qm-scan-details" style="display:none;"></div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    const inp = document.getElementById('qm-scan-input');
    if (inp) {
      inp.value = '';
      inp.focus();
    }

    if (prefilledBatchId) {
      const b = DB.Batches.find(prefilledBatchId);
      if (b) {
        document.getElementById('qm-scan-input').value = b.batchNo;
        this.lookupBatch(b.batchNo);
      }
    }
  },

  lookupBatch: function(batchNo) {
    batchNo = (batchNo || '').trim();
    const detailsEl = document.getElementById('qm-scan-details');
    if (!batchNo) { if (detailsEl) detailsEl.style.display = 'none'; return; }

    const batch = DB.Batches.find(batchNo) || DB.Batches.allIncludeArchived().find(b => (b.batchNo && b.batchNo.toLowerCase() === batchNo.toLowerCase()) || b.id === batchNo);
    if (!batch) {
      showToast('Batch not found: ' + batchNo, 'error');
      if (detailsEl) detailsEl.style.display = 'none';
      return;
    }

    const part = DB.Master.find(batch.partId) || DB.Master.findByJmref(batch.jmrefNo);
    if (!part) {
      showToast('Part Master record not found for batch ' + batchNo, 'error');
      if (detailsEl) detailsEl.style.display = 'none';
      return;
    }

    const batchMouldNo = batch.mouldNo != null ? String(batch.mouldNo) : (part.moulds && part.moulds[0] ? String(part.moulds[0].mouldNo) : '1');
    
    let mouldConfig = null;
    if (part.quickMovementMouldConfigs) {
      mouldConfig = part.quickMovementMouldConfigs[batchMouldNo];
    }
    if (!mouldConfig && part.moulds && part.moulds.length) {
      const matchingMould = part.moulds.find(m => String(m.mouldNo) === batchMouldNo || Number(m.mouldNo) === Number(batchMouldNo));
      if (matchingMould) mouldConfig = matchingMould.quickMovementConfig;
    }
    if (!mouldConfig) {
      mouldConfig = part.quickMovementConfig;
    }

    if (!mouldConfig || !mouldConfig.enabled) {
      showToast(`Quick Movement is not enabled for Mould #${batchMouldNo} of ${batch.jmrefNo}. Configure it in Inventory Master first.`, 'warning');
      if (detailsEl) detailsEl.style.display = 'none';
      return;
    }

    const DEFAULT_STAGES = [
      { key: 'production', label: 'Production', icon: '🏭', enabled: true },
      { key: 'cryogenic', label: 'Cryogenic', icon: '❄️', enabled: true },
      { key: 'deflashing', label: 'Flash Removal', icon: '🔧', enabled: true },
      { key: 'waiting-trimming', label: 'Waiting for Trimming', icon: '⏳', enabled: true },
      { key: 'trimming', label: 'Trimming (Subcontractor)', icon: '✂️', enabled: true },
      { key: 'waiting-visual', label: 'Waiting for Visual Inspection', icon: '⏳', enabled: true }
    ];

    let rawConfiguredStages = (mouldConfig && mouldConfig.stages && mouldConfig.stages.length) ? mouldConfig.stages : DEFAULT_STAGES;
    const allConfiguredStages = rawConfiguredStages.filter(s => !['visual', 'quality', 'store'].includes(s.key));
    const currentStageKey = batch.currentStage || batch.stage || 'production';
    
    let currentIdx = allConfiguredStages.findIndex(s => s.key === currentStageKey);

    if (currentIdx === -1) {
      const STD_ORDER = ['production', 'cryogenic', 'deflashing', 'waiting-trimming', 'trimming', 'post-curing', 'waiting-visual', 'visual', 'gauge', 'quality', 'store'];
      const stdCurrentIdx = STD_ORDER.indexOf(currentStageKey);

      for (let i = 0; i < allConfiguredStages.length; i++) {
        const stg = allConfiguredStages[i];
        if (stg.enabled !== false) {
          const stgStdIdx = STD_ORDER.indexOf(stg.key);
          if (stgStdIdx > stdCurrentIdx) {
            currentIdx = i - 1;
            break;
          }
        }
      }
    }

    let nextStage = null;
    for (let i = currentIdx + 1; i < allConfiguredStages.length; i++) {
      if (allConfiguredStages[i].enabled !== false) {
        nextStage = allConfiguredStages[i];
        break;
      }
    }

    if (!nextStage || currentStageKey === 'store') {
      showToast(`Batch ${batch.batchNo} is already at final stage (${STAGE_LABELS[currentStageKey] || currentStageKey}).`, 'info');
      if (detailsEl) detailsEl.style.display = 'none';
      return;
    }

    const currentQty = Number(batch.currentQty != null ? batch.currentQty : (batch.initialQty || 0));
    
    let vendorObj = null;
    if (nextStage.subcontractorVendorId) {
      vendorObj = DB.Vendors.find(nextStage.subcontractorVendorId);
    }
    const isExternalVendor = !!(vendorObj && vendorObj.name && !vendorObj.name.toLowerCase().includes('in house'));
    const vendorName = vendorObj ? vendorObj.name : (nextStage.subcontractorVendorName || 'In-House');

    if (isExternalVendor) {
      detailsEl.style.display = 'block';
      detailsEl.innerHTML = `
        <div style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.3); border-radius:var(--radius-md); padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div>
              <div style="font-weight:700; font-size:16px; color:var(--primary);">${batch.batchNo}</div>
              <div class="text-xs text-muted">JMREF: <strong>${batch.jmrefNo}</strong> | Part: ${batch.partNo || '—'}</div>
            </div>
            <span class="badge badge-amber">🚚 Subcontractor Dispatch</span>
          </div>

          <div style="font-size:13px; color:var(--text-main); margin-bottom:12px; background:var(--bg-card); padding:12px; border-radius:6px; border:1px solid var(--border); line-height:1.6;">
            <div>📌 Target Stage: <strong>${STAGE_LABELS[nextStage.key] || nextStage.key}</strong></div>
            <div>🏢 Subcontractor Vendor: <strong style="color:var(--warning);">${vendorName}</strong></div>
            <hr style="margin:8px 0; border:0; border-top:1px dashed var(--border);">
            <div style="font-size:12px; color:var(--text-secondary);">
              ⚠️ Direct <em>Process & Move</em> is disabled for external subcontractor vendors.<br>
              Materials must be dispatched via an official <strong>Delivery Challan</strong> for gate pass & dispatch tracking.
            </div>
          </div>

          <div class="flex justify-end gap-2" style="margin-top:14px;">
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('quick-move-scanner-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-amber btn-sm font-bold" onclick="QuickMovementHandler.redirectToDeliveryChallan('${batch.id}', '${vendorObj.id}')">
              🚚 Open Delivery Challan & Add Batch
            </button>
          </div>
        </div>
      `;
      return;
    }

    detailsEl.style.display = 'block';
    detailsEl.innerHTML = `
      <div style="background:var(--bg-glass-hover); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px;">
        <input type="hidden" id="qm-exec-batch-id" value="${batch.id}">
        <input type="hidden" id="qm-exec-input-qty" value="${currentQty}">
        <input type="hidden" id="qm-exec-next-stage" value="${nextStage.key}">
        <input type="hidden" id="qm-exec-vendor-id" value="${nextStage.subcontractorVendorId || ''}">
        <input type="hidden" id="qm-exec-max-loss" value="${nextStage.maxLossPercent || 10}">

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px dashed var(--border); padding-bottom:8px;">
          <div>
            <div style="font-weight:700; font-size:16px; color:var(--primary);">${batch.batchNo}</div>
            <div class="text-xs text-muted">JMREF: <strong>${batch.jmrefNo}</strong> | Part: ${batch.partNo || '—'}</div>
          </div>
          <span class="badge badge-teal">${batch.mouldNo ? `Mould #${batch.mouldNo}` : 'Standard'}</span>
        </div>

        <!-- Stage Progression Pipeline -->
        <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-card); padding:10px 14px; border-radius:var(--radius-sm); margin-bottom:14px; border:1px solid var(--border);">
          <div style="text-align:center;">
            <div class="text-xs text-muted">Current Stage</div>
            <div style="font-weight:700; color:var(--warning); font-size:13px;">${STAGE_LABELS[currentStageKey] || currentStageKey}</div>
          </div>
          <div style="font-size:18px; color:var(--primary);">➔</div>
          <div style="text-align:center;">
            <div class="text-xs text-muted">Next Stage</div>
            <div style="font-weight:700; color:var(--success); font-size:13px;">${nextStage.icon || '📌'} ${nextStage.label || STAGE_LABELS[nextStage.key]}</div>
          </div>
        </div>

        ${(nextStage.key === 'trimming' || nextStage.key === 'waiting-trimming' || nextStage.key === 'deflashing') ? `
          <div style="margin-bottom:12px; font-size:12px; background:rgba(59, 130, 246, 0.08); padding:8px 12px; border-radius:6px; border:1px solid rgba(59, 130, 246, 0.2);">
            🏢 <strong>Subcontractor Vendor:</strong> ${vendorName} <span class="text-xs text-muted">(Auto-derived from Mould Config)</span>
          </div>
        ` : ''}

        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group" style="flex:1;">
            <label class="form-label text-xs">Input Qty</label>
            <input type="number" class="form-control" value="${currentQty}" readonly style="background:var(--bg-glass-hover); font-weight:700;">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label text-xs font-bold" style="color:var(--success);">Output Qty <span class="required">*</span></label>
            <input type="number" id="qm-exec-output-qty" class="form-control font-bold" value="${currentQty}" min="0" max="${currentQty}" autofocus oninput="QuickMovementHandler.calcLoss()">
          </div>
        </div>

        <div id="qm-loss-warning-box" style="display:none; margin-bottom:12px;" class="card-warning">
          <div style="font-size:12px; font-weight:700; color:var(--danger);" id="qm-loss-warning-text">⚠️ High Loss Detected!</div>
          <div style="margin-top:6px;">
            <label class="form-label text-xs font-bold" style="color:var(--danger);">Mandatory Reason / Notes for Loss <span class="required">*</span></label>
            <input type="text" id="qm-exec-comments" class="form-control form-control-sm" placeholder="Enter reason for high loss...">
          </div>
        </div>

        <div class="flex justify-end gap-2" style="margin-top:16px;">
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('quick-move-scanner-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-success btn-sm font-bold" onclick="QuickMovementHandler.submitStageMove()">🚀 Confirm Stage Move</button>
        </div>
      </div>
    `;

    setTimeout(() => {
      const outInp = document.getElementById('qm-exec-output-qty');
      if (outInp) { outInp.focus(); outInp.select(); }
    }, 100);
  },

  calcLoss: function() {
    const inputQty = parseFloat(document.getElementById('qm-exec-input-qty')?.value) || 0;
    const outputQty = parseFloat(document.getElementById('qm-exec-output-qty')?.value) || 0;
    const maxLossPct = parseFloat(document.getElementById('qm-exec-max-loss')?.value) || 10;
    const warnBox = document.getElementById('qm-loss-warning-box');
    const warnText = document.getElementById('qm-loss-warning-text');

    if (inputQty <= 0) return;
    const lossQty = Math.max(0, inputQty - outputQty);
    const lossPct = (lossQty / inputQty) * 100;

    if (lossPct > maxLossPct) {
      if (warnBox) warnBox.style.display = 'block';
      if (warnText) warnText.textContent = `⚠️ Scrap Loss is ${lossPct.toFixed(1)}% (${formatNum(lossQty)} pcs lost). Loss exceeds max limit (${maxLossPct}%). Remarks required!`;
    } else {
      if (warnBox) warnBox.style.display = 'none';
    }
  },

  submitStageMove: function() {
    const batchId = document.getElementById('qm-exec-batch-id')?.value;
    const nextStageKey = document.getElementById('qm-exec-next-stage')?.value;
    const vendorId = document.getElementById('qm-exec-vendor-id')?.value;
    const inputQty = parseFloat(document.getElementById('qm-exec-input-qty')?.value) || 0;
    const outputQty = parseFloat(document.getElementById('qm-exec-output-qty')?.value);
    const maxLossPct = parseFloat(document.getElementById('qm-exec-max-loss')?.value) || 10;
    const comments = (document.getElementById('qm-exec-comments')?.value || '').trim();

    if (isNaN(outputQty) || outputQty < 0) {
      showToast('Please enter a valid Output Quantity', 'error');
      return;
    }
    if (outputQty > inputQty) {
      showToast(`Output Quantity (${outputQty}) cannot exceed Input Quantity (${inputQty})`, 'error');
      return;
    }

    const lossQty = Math.max(0, inputQty - outputQty);
    const lossPct = inputQty > 0 ? (lossQty / inputQty) * 100 : 0;

    if (lossPct > maxLossPct && !comments) {
      showToast(`Remarks are required because Scrap Loss (${lossPct.toFixed(1)}%) exceeds limit (${maxLossPct}%)`, 'error');
      const commInp = document.getElementById('qm-exec-comments');
      if (commInp) commInp.focus();
      return;
    }

    const batch = DB.Batches.find(batchId);
    if (!batch) { showToast('Batch not found', 'error'); return; }

    const fromStage = batch.currentStage || batch.stage || 'production';

    const updateFields = {
      stage: nextStageKey,
      currentStage: nextStageKey,
      currentQty: outputQty,
      vendorId: vendorId || batch.vendorId || '',
      updatedAt: new Date().toISOString()
    };

    if (nextStageKey === 'store') {
      updateFields.status = 'completed';
      updateFields.completedAt = new Date().toISOString();
      updateFields.remainingQty = outputQty;
    }

    DB.Batches.update(batchId, updateFields);

    DB.StageRecords.insert({
      batchId: batchId,
      batchNo: batch.batchNo,
      jmrefNo: batch.jmrefNo,
      partNo: batch.partNo,
      movedFrom: fromStage,
      movedTo: nextStageKey,
      inputQty: inputQty,
      outputQty: outputQty,
      lossQty: lossQty,
      lossPercent: lossPct,
      vendorId: vendorId || '',
      remarks: comments,
      date: today(),
      createdAt: nowISO()
    });

    if (lossQty > 0) {
      DB.LossTracker.insert({
        batchId: batchId,
        batchNo: batch.batchNo,
        jmrefNo: batch.jmrefNo,
        stage: fromStage,
        lossQty: lossQty,
        lossPercent: lossPct,
        reason: comments || 'Quick Move scrap loss',
        date: today(),
        createdAt: nowISO()
      });
    }

    showToast(`⚡ Batch ${batch.batchNo} moved from ${STAGE_LABELS[fromStage] || fromStage} ➔ ${STAGE_LABELS[nextStageKey] || nextStageKey}!`, 'success');

    const modalEl = document.getElementById('quick-move-scanner-modal');
    if (modalEl) modalEl.classList.add('hidden');
    const detailsEl = document.getElementById('qm-scan-details');
    if (detailsEl) detailsEl.style.display = 'none';

    if (window.App && typeof App.navigate === 'function' && App.current) {
      try { App.navigate(App.current); } catch(e) {}
    }
  }
};
