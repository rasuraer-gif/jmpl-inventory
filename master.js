// ============================================================
// master.js — Inventory Master Module
// ============================================================
const MasterModule = (() => {
  let searchTerm = '';
  let parsedRows = [];

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
        </div>
      </div>
      
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
              <div class="form-group" style="flex:1;"></div>
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
    if (!parts.length) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">&#128203;</div><p>No parts found. Add your first part.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = parts.map((p, i) => `
      <tr>
        <td class="text-muted">${i+1}</td>
        <td class="font-semibold text-blue">${p.partNo}</td>
        <td><span class="badge badge-teal">${p.jmrefNo}</span></td>
        <td class="font-semibold">${p.salePrice != null ? p.salePrice : '—'}</td>
        <td>${p.blankWeight != null ? p.blankWeight : '—'}</td>
        <td class="font-semibold text-success">${p.averageTargetInventory != null ? formatNum(p.averageTargetInventory) : '—'}</td>
        <td>
          <div>${p.description || '—'}</div>
          ${p.moulds && p.moulds.length ? `
            <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
              ${p.moulds.map(m => `<span class="badge badge-gray" style="font-size: 10px; padding: 2px 6px; border: 1px solid var(--border);" title="Mould ${m.mouldNo}\nType: ${m.mouldType}\nFirst Process: ${m.firstProcess}\nFlow: ${m.processFlow}">M#${m.mouldNo} (${m.mouldType})</span>`).join('')}
            </div>
          ` : ''}
        </td>
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

  function createMouldRowElement(m = {}) {
    const div = document.createElement('div');
    div.className = 'mould-row';
    div.style = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
    div.innerHTML = `
      <div style="width: 85px;">
        <select class="form-control mould-no">
          <option value="1" ${m.mouldNo === 1 ? 'selected' : ''}>Mould 1</option>
          <option value="2" ${m.mouldNo === 2 ? 'selected' : ''}>Mould 2</option>
          <option value="3" ${m.mouldNo === 3 ? 'selected' : ''}>Mould 3</option>
          <option value="4" ${m.mouldNo === 4 ? 'selected' : ''}>Mould 4</option>
          <option value="5" ${m.mouldNo === 5 ? 'selected' : ''}>Mould 5</option>
        </select>
      </div>
      <div style="width: 110px;">
        <select class="form-control mould-type">
          <option value="Yet to be assigned" ${!m.mouldType || m.mouldType === 'Yet to be assigned' ? 'selected' : ''}>Yet to be assigned</option>
          <option value="Cryogenic" ${m.mouldType === 'Cryogenic' ? 'selected' : ''}>Cryogenic</option>
          <option value="Flash Free" ${m.mouldType === 'Flash Free' ? 'selected' : ''}>Flash Free</option>
          <option value="Normal" ${m.mouldType === 'Normal' ? 'selected' : ''}>Normal</option>
        </select>
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

    if (!partNo || !jmrefNo || !description) { showToast('Part No, JMREF No, and Description are required', 'error'); return; }

    // Read and validate moulds
    const mouldRows = Array.from(document.querySelectorAll('.mould-row'));
    const moulds = mouldRows.map(row => {
      return {
        mouldNo: parseInt(row.querySelector('.mould-no').value, 10),
        mouldType: row.querySelector('.mould-type').value,
        processFlow: row.querySelector('.mould-flow').value.trim(),
        firstProcess: row.querySelector('.mould-first-process').value
      };
    });

    if (moulds.some(m => !m.processFlow)) {
      showToast('Process Flow is required for all moulds', 'error');
      return;
    }

    const types = moulds.map(m => m.mouldType).filter(t => t && t !== 'Yet to be assigned');
    const uniqueTypes = new Set(types);
    if (types.length !== uniqueTypes.size) {
      showToast('Each mould must have a different Mould Type (Cryogenic, Flash Free, or Normal)', 'error');
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
      'Mould Nos', 'Mould Types', 'Process Flows', 'First Processes'
    ];
    const rows = [
      ['OR-101', 'JMREF-2026-101', 'O-Ring 101 Description', '1234567890', 'CC-70', '12.50', '8', '140', '100', '2.0', '150', '3.5', '5000', '1', 'Cryogenic', 'Cryogenic', 'Cryogenic'],
      ['OR-102', 'JMREF-2026-102', 'O-Ring 102 Description', '0987654321', 'CC-80', '18.00', '10', '150', '110', '2.5', '180', '4.2', '8000', '1, 2', 'Cryogenic, Yet to be assigned', 'Cryogenic, Visual ; Cryogenic, Gauge, Visual', 'Cryogenic, Cryogenic']
    ];
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
        validateAndPreview(rawJson);
      } catch (err) {
        console.error(err);
        showToast('Error reading Excel: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
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
      const processFlowsStr = normRow['process flows'] || normRow['process flow'] || 'Cryogenic';
      const firstProcessesStr = normRow['first processes'] || normRow['first process'] || 'Cryogenic';

      const mouldNos = String(mouldNosStr).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const mouldTypes = String(mouldTypesStr).split(',').map(s => s.trim());
      const processFlows = String(processFlowsStr).split(';').map(s => s.trim());
      const firstProcesses = String(firstProcessesStr).split(',').map(s => s.trim());

      const moulds = [];
      const numMoulds = Math.max(mouldNos.length, 1);
      for (let i = 0; i < numMoulds; i++) {
        moulds.push({
          mouldNo: mouldNos[i] || (i + 1),
          mouldType: mouldTypes[i] || mouldTypes[0] || 'Yet to be assigned',
          processFlow: processFlows[i] || processFlows[0] || 'Cryogenic',
          firstProcess: firstProcesses[i] || firstProcesses[0] || 'Cryogenic'
        });
      }

      let status = 'Valid';
      let isValid = true;

      if (!partNo || !jmrefNo || !description) {
        status = 'Missing required fields';
        isValid = false;
      } else if (existingMaster.some(p => p.partNo === partNo) || seenPartNo.has(partNo)) {
        status = 'Duplicate Part No';
        isValid = false;
      } else if (existingMaster.some(p => p.jmrefNo === jmrefNo) || seenJmref.has(jmrefNo)) {
        status = 'Duplicate JMREF No';
        isValid = false;
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
        isValid
      };

      parsedRows.push(record);

      const statusBadge = isValid 
        ? `<span class="badge badge-green">Valid</span>`
        : `<span class="badge badge-red" title="${status}">${status}</span>`;

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
    let uploadedCount = 0;
    parsedRows.forEach(row => {
      if (row.isValid) {
        const fields = { ...row };
        delete fields.isValid;
        DB.Master.insert(fields);
        uploadedCount++;
      }
    });

    showToast(`Successfully uploaded ${uploadedCount} parts!`, 'success');
    document.getElementById('master-bulk-modal').classList.add('hidden');
    
    // Clear input
    const input = document.getElementById('bulk-file-input');
    if (input) input.value = '';
    
    // Refresh stats & table
    renderStats();
    renderTable();
  }

  return { render, search, openAdd, openEdit, save, remove, openBulk, downloadTemplate, handleFileSelect, saveBulk, addMouldRow, removeMouldRow };
})();
