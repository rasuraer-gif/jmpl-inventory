// ============================================================
// mould-tracking.js — Mould Location & Movement Tracking Module
// ============================================================
const MouldTrackingModule = (() => {
  let activeTab = 'moulds'; // 'moulds', 'movements', 'traceability', 'reports'
  
  // Search & Filter state
  let traceJmref = '';
  let traceMouldType = '';
  
  let reportFromDate = '';
  let reportToDate = '';
  let reportMouldId = '';

  function getLocations() {
    const subs = DB.Subcontractors.all() || [];
    return [
      { name: 'In-House Factory Floor', type: 'internal' },
      ...subs.map(s => ({ name: s.name, type: 'external' }))
    ];
  }

  function getMouldCurrentLocation(mouldId) {
    const movements = DB.MouldMovements.byMould(mouldId);
    if (movements && movements.length > 0) {
      return movements[0].toLocation; // Latest destination
    }
    return 'In-House Factory Floor'; // Default starting location
  }

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const session = Auth.getSession();
    const userRole = session ? session.role : '';

    el.innerHTML = `
      <div class="animate-in">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="font-bold" style="font-size:20px;">🛠️ Mould Location & Movement Tracking</h2>
            <p class="text-sm text-muted mt-1">Track physical locations, log dates, and print Delivery Challans for manufacturing moulds</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" onclick="MouldTrackingModule.openMoveModal()">📦 Record Movement</button>
            <button class="btn btn-primary" onclick="MouldTrackingModule.openAddModal()">+ Register Mould</button>
          </div>
        </div>

        <div class="tabs" id="mould-tabs">
          <button class="tab-btn ${activeTab === 'moulds' ? 'active' : ''}" onclick="MouldTrackingModule.switchTab('moulds')">📋 Mould Master</button>
          <button class="tab-btn ${activeTab === 'movements' ? 'active' : ''}" onclick="MouldTrackingModule.switchTab('movements')">📜 Movement Ledger</button>
          <button class="tab-btn ${activeTab === 'maintenance' ? 'active' : ''}" onclick="MouldTrackingModule.switchTab('maintenance')">🛠️ Maintenance Log</button>
          <button class="tab-btn ${activeTab === 'traceability' ? 'active' : ''}" onclick="MouldTrackingModule.switchTab('traceability')">🔍 Traceability Search</button>
          <button class="tab-btn ${activeTab === 'reports' ? 'active' : ''}" onclick="MouldTrackingModule.switchTab('reports')">📊 Historical Reports</button>
        </div>

        <div id="mould-tab-content" style="margin-top: 16px;"></div>
      </div>

      <!-- Add/Edit Mould Modal -->
      ${mouldModal()}
      <!-- Movement Modal -->
      ${movementModal()}
      <!-- Maintenance Modal -->
      ${maintenanceModal()}
      <!-- Layout Diagram Preview Modal -->
      <div class="modal-overlay hidden" id="mould-layout-view-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3 id="mould-layout-view-title">Mould Layout Diagram</h3>
            <button class="modal-close" onclick="document.getElementById('mould-layout-view-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" style="text-align: center; padding: 20px;">
            <img id="mould-layout-view-img" src="" style="max-width: 100%; max-height: 450px; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" />
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('mould-layout-view-modal').classList.add('hidden')">Close</button>
          </div>
        </div>
      </div>
    `;

    renderTabContent();
  }

  function switchTab(tab) {
    activeTab = tab;
    renderTabContent();
    // Update active tab class in UI
    document.querySelectorAll('#mould-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick').includes(tab));
    });
  }

  function renderTabContent() {
    const container = document.getElementById('mould-tab-content');
    if (!container) return;

    if (activeTab === 'moulds') {
      container.innerHTML = renderMouldsTab();
    } else if (activeTab === 'movements') {
      container.innerHTML = renderMovementsTab();
    } else if (activeTab === 'maintenance') {
      container.innerHTML = renderMaintenanceTab();
    } else if (activeTab === 'traceability') {
      container.innerHTML = renderTraceabilityTab();
    } else if (activeTab === 'reports') {
      container.innerHTML = renderReportsTab();
    }
  }

  // ── TAB 1: MOULDS MASTER ──────────────────────────────────
  function renderMouldsTab() {
    const moulds = DB.Moulds.all() || [];
    const rows = moulds.map((m, i) => {
      const currentLoc = getMouldCurrentLocation(m.id);
      const isInternal = currentLoc === 'In-House Factory Floor';
      const locBadge = isInternal ? '<span class="badge badge-green">In-House</span>' : `<span class="badge badge-amber">${currentLoc}</span>`;
      const diagramHtml = m.layoutDiagram 
        ? `<img src="${m.layoutDiagram}" style="width: 48px; height: 32px; object-fit: cover; cursor: pointer; border: 1px solid var(--border); border-radius: 4px;" onclick="MouldTrackingModule.previewLayoutDiagram('${m.id}')" title="Click to view layout diagram" />`
        : `<span class="text-muted" style="font-size:12px; font-style:italic;">None</span>`;

      return `
        <tr>
          <td class="font-semibold text-blue">${m.mouldId}</td>
          <td><span class="badge badge-teal">${m.jmrefNo}</span></td>
          <td><strong>${m.mouldType}</strong></td>
          <td>${m.cavity || '—'}</td>
          <td>${m.size || '—'}</td>
          <td>${m.make || '—'}</td>
          <td>${m.client || '—'}</td>
          <td>${m.rackDetails || '—'}</td>
          <td><span class="text-muted text-sm" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:180px;" title="${m.notes || ''}">${m.notes || '—'}</span></td>
          <td class="text-muted text-sm">${m.creationDate}</td>
          <td>${diagramHtml}</td>
          <td>${locBadge}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-xs" onclick="MouldTrackingModule.openEditModal('${m.id}')">✏️ Edit</button>
              <button class="btn btn-primary btn-xs" onclick="MouldTrackingModule.openMaintenanceModal('${m.id}')">🔧 Log Maintenance</button>
              <button class="btn btn-danger btn-xs" onclick="MouldTrackingModule.deleteMould('${m.id}')">✕ Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card">
        <div class="card-header"><h3>Mould Master Database</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mould ID</th>
                <th>JMREF No</th>
                <th>Mould Type</th>
                <th>Cavity</th>
                <th>Size</th>
                <th>Make</th>
                <th>Client</th>
                <th>Rack Details</th>
                <th>Notes</th>
                <th>Creation Date</th>
                <th>Layout Diagram</th>
                <th>Current Location</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="13" style="text-align:center;padding:32px;color:var(--text-muted);">No moulds registered. Register your first mould to begin.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── TAB 2: MOVEMENT LEDGER ────────────────────────────────
  function renderMovementsTab() {
    const logs = DB.MouldMovements.all() || [];
    // Sort chronological: latest first
    const sortedLogs = [...logs].sort((a,b) => (b.movementDate||'').localeCompare(a.movementDate||''));

    const rows = sortedLogs.map(log => {
      const mould = DB.Moulds.find(log.mouldId) || {};
      const user = DB.Users.all().find(u => u.id === log.authorizedBy) || { name: 'Admin' };
      
      const fromIsInternal = log.fromLocation === 'In-House Factory Floor';
      const toIsInternal = log.toLocation === 'In-House Factory Floor';
      
      const fromSpan = fromIsInternal ? `<span class="badge badge-green">In-House</span>` : `<span class="badge badge-amber">${log.fromLocation}</span>`;
      const toSpan = toIsInternal ? `<span class="badge badge-green">In-House</span>` : `<span class="badge badge-amber">${log.toLocation}</span>`;

      return `
        <tr>
          <td class="text-sm font-semibold">${log.movementDate.replace('T', ' ')}</td>
          <td class="font-semibold text-blue">${log.uniqueMouldId}</td>
          <td><span class="badge badge-teal">${mould.jmrefNo || '—'}</span></td>
          <td>${mould.mouldType || '—'}</td>
          <td>${fromSpan}</td>
          <td><strong>➔</strong> ${toSpan}</td>
          <td class="text-muted text-sm">${user.name}</td>
          <td class="text-sm">${log.remarks || '—'}</td>
          <td>
            <button class="btn btn-teal btn-xs" onclick="MouldTrackingModule.printChallan('${log.id}')">🖨️ Challan</button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card">
        <div class="card-header"><h3>Mould Movement Transaction Ledger</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Mould ID</th>
                <th>JMREF</th>
                <th>Mould Type</th>
                <th>From Location</th>
                <th>To Location</th>
                <th>Authorized By</th>
                <th>Remarks</th>
                <th>Document</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">No movement logs found. Record a mould movement to begin.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── TAB 3: TRACEABILITY SEARCH ─────────────────────────────
  function renderTraceabilityTab() {
    const master = DB.Master.all() || [];
    const uniqueJmrefs = [...new Set(master.map(m => m.jmrefNo))].filter(Boolean);
    const jmrefOpts = uniqueJmrefs.map(j => `<option value="${j}" ${traceJmref === j ? 'selected' : ''}>${j}</option>`).join('');

    // Fetch matching moulds
    let results = DB.Moulds.all() || [];
    if (traceJmref) {
      results = results.filter(m => m.jmrefNo === traceJmref);
    }
    if (traceMouldType) {
      results = results.filter(m => m.mouldType === traceMouldType);
    }

    const rows = results.map(m => {
      const currentLoc = getMouldCurrentLocation(m.id);
      const isInternal = currentLoc === 'In-House Factory Floor';
      const locBadge = isInternal ? '<span class="badge badge-green">In-House</span>' : `<span class="badge badge-amber">${currentLoc}</span>`;
      return `
        <tr>
          <td class="font-semibold text-blue">${m.mouldId}</td>
          <td><span class="badge badge-teal">${m.jmrefNo}</span></td>
          <td><strong>${m.mouldType}</strong></td>
          <td>${m.cavity || '—'}</td>
          <td>${m.size || '—'}</td>
          <td>${m.make || '—'}</td>
          <td>${locBadge}</td>
          <td>
            <button class="btn btn-secondary btn-xs" onclick="MouldTrackingModule.openMoveModalFor('${m.id}')">📦 Move</button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card mb-6">
        <div class="card-header"><h3>Mould Traceability Filter</h3></div>
        <div class="card-body">
          <div class="form-row" style="align-items: flex-end;">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Overarching JMREF NO</label>
              <select id="trace-jmref" class="form-control" onchange="MouldTrackingModule.filterTraceability()">
                <option value="">All Reference Numbers...</option>
                ${jmrefOpts}
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">Mould Type</label>
              <select id="trace-mould-type" class="form-control" onchange="MouldTrackingModule.filterTraceability()">
                <option value="">All Mould Types...</option>
                <option value="Yet to be assigned" ${traceMouldType === 'Yet to be assigned' ? 'selected' : ''}>Yet to be assigned</option>
                <option value="Cryogenic" ${traceMouldType === 'Cryogenic' ? 'selected' : ''}>Cryogenic</option>
                <option value="Flash free" ${traceMouldType === 'Flash free' ? 'selected' : ''}>Flash free</option>
                <option value="Normal" ${traceMouldType === 'Normal' ? 'selected' : ''}>Normal</option>
              </select>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary" onclick="MouldTrackingModule.clearTraceability()" style="height:42px;">Reset</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Physical Asset Locations</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Unique Mould ID</th>
                <th>JMREF No</th>
                <th>Mould Type</th>
                <th>Cavities</th>
                <th>Size</th>
                <th>Make</th>
                <th>Current Status / Location</th>
                <th>Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No matching assets found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── TAB 4: HISTORICAL REPORT ───────────────────────────────
  function renderReportsTab() {
    const moulds = DB.Moulds.all() || [];
    const mouldOpts = moulds.map(m => `<option value="${m.id}" ${reportMouldId === m.id ? 'selected' : ''}>${m.mouldId}</option>`).join('');

    // Fetch movements
    let movements = DB.MouldMovements.all() || [];

    if (reportMouldId) {
      movements = movements.filter(m => m.mouldId === reportMouldId);
    }
    if (reportFromDate) {
      movements = movements.filter(m => m.movementDate.slice(0, 10) >= reportFromDate);
    }
    if (reportToDate) {
      movements = movements.filter(m => m.movementDate.slice(0, 10) <= reportToDate);
    }

    // Sort chronologically (oldest first for reports)
    movements.sort((a,b) => (a.movementDate||'').localeCompare(b.movementDate||''));

    const rows = movements.map((log, i) => {
      const user = DB.Users.all().find(u => u.id === log.authorizedBy) || { name: 'Admin' };
      const fromIsInternal = log.fromLocation === 'In-House Factory Floor';
      const toIsInternal = log.toLocation === 'In-House Factory Floor';
      
      const fromSpan = fromIsInternal ? `<span class="badge badge-green">In-House</span>` : `<span class="badge badge-amber">${log.fromLocation}</span>`;
      const toSpan = toIsInternal ? `<span class="badge badge-green">In-House</span>` : `<span class="badge badge-amber">${log.toLocation}</span>`;

      return `
        <tr>
          <td class="text-muted">${i+1}</td>
          <td class="text-sm font-semibold">${log.movementDate.replace('T', ' ')}</td>
          <td class="font-semibold text-blue">${log.uniqueMouldId}</td>
          <td>${fromSpan}</td>
          <td><strong>➔</strong> ${toSpan}</td>
          <td>${user.name}</td>
          <td>${log.remarks || '—'}</td>
          <td>
            <button class="btn btn-ghost btn-xs" onclick="MouldTrackingModule.printChallan('${log.id}')">🖨️ Challan</button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card mb-6">
        <div class="card-header"><h3>Historical Report Filters</h3></div>
        <div class="card-body">
          <div class="form-row" style="align-items: flex-end;">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Mould Asset</label>
              <select id="rep-mould-id" class="form-control" onchange="MouldTrackingModule.filterReports()">
                <option value="">All Moulds...</option>
                ${mouldOpts}
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">From Date</label>
              <input type="date" id="rep-from-date" class="form-control" value="${reportFromDate}" onchange="MouldTrackingModule.filterReports()">
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">To Date</label>
              <input type="date" id="rep-to-date" class="form-control" value="${reportToDate}" onchange="MouldTrackingModule.filterReports()">
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary" onclick="MouldTrackingModule.clearReports()" style="height:42px;">Reset</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Mould Ledger Chronology</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Timestamp</th>
                <th>Unique Mould ID</th>
                <th>Moved From</th>
                <th>Moved To</th>
                <th>Authorized By</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No movements match your criteria.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── MODAL: ADD / EDIT MOULD ──────────────────────────────
  function mouldModal() {
    return `
      <div class="modal-overlay hidden" id="mould-add-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3 id="mould-modal-title">Register Mould</h3>
            <button class="modal-close" onclick="document.getElementById('mould-add-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="mould-edit-db-id">
            
            <div class="form-row">
              <div class="form-group" style="position:relative; flex:1;">
                <label class="form-label">JMREF No <span class="required">*</span></label>
                <input type="text" id="mould-jmref" class="form-control" placeholder="Search JMREF No..." onfocus="MouldTrackingModule.showJmrefDropdown()" oninput="MouldTrackingModule.filterJmrefs(this.value)" autocomplete="off">
                <div id="mould-jmref-dropdown" class="hidden" style="position:absolute; top:100%; left:0; right:0; z-index:1000; max-height:200px; overflow-y:auto; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.3); margin-top:4px; padding: 4px;"></div>
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Mould No <span class="required">*</span></label>
                <select id="mould-no" class="form-control" onchange="MouldTrackingModule.onMouldNoChange()">
                  <option value="">Select mould...</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Mould Type</label>
                <input type="text" id="mould-type" class="form-control" readonly style="opacity:0.8; background:var(--bg-input);">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Date of Creation <span class="required">*</span></label>
                <input type="date" id="mould-creation-date" class="form-control">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Unique Mould ID (Auto-Generated)</label>
              <input type="text" id="mould-generated-id" class="form-control" readonly style="opacity:0.8;font-weight:700;color:var(--primary);" placeholder="Select JMREF and Mould No">
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">No. of Cavities</label>
                <input type="number" id="mould-cavity" class="form-control" min="1" placeholder="e.g. 4">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Mould Size</label>
                <input type="text" id="mould-size" class="form-control" placeholder="e.g. 250x300 mm">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Make</label>
                <input type="text" id="mould-make" class="form-control" placeholder="e.g. In-House / Brand">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Client Name</label>
                <input type="text" id="mould-client" class="form-control" placeholder="e.g. Client X">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Rack Details</label>
                <input type="text" id="mould-rack-details" class="form-control" placeholder="e.g. Rack A / Shelf 2">
              </div>
              <div class="form-group" style="flex:1;">
                <!-- Spacer -->
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Notes</label>
              <textarea id="mould-notes" class="form-control" rows="2" placeholder="Optional notes..."></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Layout Diagram (Image)</label>
              <input type="file" id="mould-layout-file" class="form-control" accept="image/*" onchange="MouldTrackingModule.handleLayoutUpload(event)">
              <input type="hidden" id="mould-layout-base64">
              <div id="mould-layout-preview-container" class="hidden" style="margin-top: 10px;">
                <img id="mould-layout-preview" src="" style="max-width: 100%; max-height: 120px; border: 1px solid var(--border); border-radius: 4px; display: block;" />
                <button type="button" class="btn btn-secondary btn-xs mt-2" onclick="MouldTrackingModule.clearLayoutPreview()">Remove Diagram</button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('mould-add-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="MouldTrackingModule.saveMould()">Save Mould</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── MODAL: MOVEMENT LOGGING ────────────────────────────────
  function movementModal() {
    const locations = getLocations();
    const locOpts = locations.map(l => `<option value="${l.name}">${l.name} (${l.type === 'internal' ? 'In-House' : 'External'})</option>`).join('');

    return `
      <div class="modal-overlay hidden" id="mould-move-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>Record Mould Location Movement</h3>
            <button class="modal-close" onclick="document.getElementById('mould-move-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Select Mould <span class="required">*</span></label>
              <select id="move-mould-id" class="form-control" onchange="MouldTrackingModule.onMouldSelectChange()">
                <option value="">Select mould asset...</option>
              </select>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Moved From (Current Location)</label>
                <input type="text" id="move-from-loc" class="form-control" readonly style="opacity:0.8;">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Moved To (New Destination) <span class="required">*</span></label>
                <select id="move-to-loc" class="form-control">
                  <option value="">Select destination...</option>
                  ${locOpts}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Movement Date & Time <span class="required">*</span></label>
              <input type="datetime-local" id="move-date" class="form-control">
            </div>

            <div class="form-group">
              <label class="form-label">Remarks</label>
              <textarea id="move-remarks" class="form-control" rows="2" placeholder="e.g. Sent for maintenance, returned to floor, direct vendor transfer..."></textarea>
            </div>

            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;">
                <input type="checkbox" id="move-print-challan" checked>
                <span>🖨️ Print Delivery Challan upon saving</span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('mould-move-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="MouldTrackingModule.saveMovement()">Record Move</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── CONTROLLER / EVENT ACTIONS ─────────────────────────────
  function showJmrefDropdown() {
    const list = document.getElementById('mould-jmref-dropdown');
    if (!list) return;
    list.classList.remove('hidden');
    filterJmrefs(document.getElementById('mould-jmref').value || '');
  }

  function filterJmrefs(query) {
    const list = document.getElementById('mould-jmref-dropdown');
    if (!list) return;
    const q = query.toLowerCase().trim();
    const master = DB.Master.all() || [];
    const uniqueJmrefs = [...new Set(master.map(m => m.jmrefNo))].filter(Boolean);
    const filtered = uniqueJmrefs.filter(j => j.toLowerCase().includes(q));

    if (filtered.length === 0) {
      list.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:12.5px; text-align:center;">No matching JMREF found.</div>`;
      return;
    }

    list.innerHTML = filtered.map(j => `
      <div class="dropdown-item" 
           style="padding:8px 12px; cursor:pointer; border-radius:4px; transition:background 0.2s; font-size:13px; color:var(--text-main);"
           onclick="MouldTrackingModule.selectJmref('${j}')"
           onmouseover="this.style.background='rgba(99,102,241,0.15)'"
           onmouseout="this.style.background='transparent'">
        <strong>${j}</strong>
      </div>
    `).join('');
  }

  function selectJmref(jmrefNo) {
    document.getElementById('mould-jmref').value = jmrefNo;
    const list = document.getElementById('mould-jmref-dropdown');
    if (list) list.classList.add('hidden');

    // Populate Mould No dropdown from Inventory Master
    const part = DB.Master.all().find(p => p.jmrefNo === jmrefNo);
    const mouldNoSelect = document.getElementById('mould-no');
    if (mouldNoSelect) {
      mouldNoSelect.innerHTML = '<option value="">Select mould...</option>';
      if (part && part.moulds && part.moulds.length) {
        part.moulds.forEach(m => {
          mouldNoSelect.innerHTML += `<option value="${m.mouldNo}">Mould ${m.mouldNo}</option>`;
        });
      }
    }

    // Reset Mould Type and Generated ID
    document.getElementById('mould-type').value = '';
    document.getElementById('mould-generated-id').value = '';
  }

  function onMouldNoChange() {
    const jmrefNo = document.getElementById('mould-jmref').value.trim();
    const mouldNo = parseInt(document.getElementById('mould-no').value, 10);
    const typeInp = document.getElementById('mould-type');
    if (!typeInp) return;

    if (!jmrefNo || isNaN(mouldNo)) {
      typeInp.value = '';
      document.getElementById('mould-generated-id').value = '';
      return;
    }

    const part = DB.Master.all().find(p => p.jmrefNo === jmrefNo);
    if (part && part.moulds) {
      const m = part.moulds.find(x => x.mouldNo === mouldNo);
      if (m) {
        typeInp.value = m.mouldType || '';
      } else {
        typeInp.value = '';
      }
    } else {
      typeInp.value = '';
    }

    autoGenMouldId();
  }

  function autoGenMouldId() {
    const editId = document.getElementById('mould-edit-db-id').value;
    if (editId) return; // Do not overwrite on edit

    const jmrefNo = document.getElementById('mould-jmref').value.trim();
    const mouldNo = parseInt(document.getElementById('mould-no').value, 10);
    const mouldType = document.getElementById('mould-type').value;
    const idInput = document.getElementById('mould-generated-id');

    if (!jmrefNo || isNaN(mouldNo) || !mouldType) {
      idInput.value = '';
      return;
    }

    idInput.value = `${jmrefNo}-${mouldType.toUpperCase().replace(' ', '_')}-${String(mouldNo).padStart(2, '0')}`;
  }

  function openAddModal() {
    document.getElementById('mould-edit-db-id').value = '';
    document.getElementById('mould-modal-title').textContent = 'Register Mould';
    document.getElementById('mould-jmref').value = '';
    document.getElementById('mould-jmref').removeAttribute('disabled');
    
    const mouldNoSelect = document.getElementById('mould-no');
    mouldNoSelect.innerHTML = '<option value="">Select mould...</option>';
    mouldNoSelect.removeAttribute('disabled');

    document.getElementById('mould-type').value = '';
    document.getElementById('mould-generated-id').value = '';
    document.getElementById('mould-cavity').value = '';
    document.getElementById('mould-size').value = '';
    document.getElementById('mould-make').value = '';
    document.getElementById('mould-client').value = '';
    document.getElementById('mould-creation-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('mould-rack-details').value = '';
    document.getElementById('mould-notes').value = '';
    
    // Clear layout diagram preview
    const fileInput = document.getElementById('mould-layout-file');
    if (fileInput) fileInput.value = '';
    const base64Input = document.getElementById('mould-layout-base64');
    if (base64Input) base64Input.value = '';
    const previewContainer = document.getElementById('mould-layout-preview-container');
    if (previewContainer) previewContainer.classList.add('hidden');
    const preview = document.getElementById('mould-layout-preview');
    if (preview) preview.src = '';

    document.getElementById('mould-add-modal').classList.remove('hidden');
  }

  function openEditModal(id) {
    const m = DB.Moulds.find(id);
    if (!m) return;

    document.getElementById('mould-edit-db-id').value = id;
    document.getElementById('mould-modal-title').textContent = 'Edit Mould Specifications';
    
    document.getElementById('mould-jmref').value = m.jmrefNo;
    document.getElementById('mould-jmref').setAttribute('disabled', 'true');
    
    const mouldNoSelect = document.getElementById('mould-no');
    mouldNoSelect.innerHTML = `<option value="${m.mouldNo || ''}">Mould ${m.mouldNo || ''}</option>`;
    mouldNoSelect.value = m.mouldNo || '';
    mouldNoSelect.setAttribute('disabled', 'true');

    document.getElementById('mould-type').value = m.mouldType;
    document.getElementById('mould-generated-id').value = m.mouldId;
    document.getElementById('mould-cavity').value = m.cavity || '';
    document.getElementById('mould-size').value = m.size || '';
    document.getElementById('mould-make').value = m.make || '';
    document.getElementById('mould-client').value = m.client || '';
    document.getElementById('mould-creation-date').value = m.creationDate;
    document.getElementById('mould-rack-details').value = m.rackDetails || '';
    document.getElementById('mould-notes').value = m.notes || '';

    // Load layout diagram preview
    const fileInput = document.getElementById('mould-layout-file');
    if (fileInput) fileInput.value = '';
    const base64Input = document.getElementById('mould-layout-base64');
    const previewContainer = document.getElementById('mould-layout-preview-container');
    const preview = document.getElementById('mould-layout-preview');
    
    if (m.layoutDiagram) {
      if (base64Input) base64Input.value = m.layoutDiagram;
      if (preview) preview.src = m.layoutDiagram;
      if (previewContainer) previewContainer.classList.remove('hidden');
    } else {
      if (base64Input) base64Input.value = '';
      if (preview) preview.src = '';
      if (previewContainer) previewContainer.classList.add('hidden');
    }

    document.getElementById('mould-add-modal').classList.remove('hidden');
  }

  function saveMould() {
    const editId = document.getElementById('mould-edit-db-id').value;
    const jmrefNo = document.getElementById('mould-jmref').value.trim();
    const mouldNo = parseInt(document.getElementById('mould-no').value, 10);
    const mouldType = document.getElementById('mould-type').value;
    const mouldId = document.getElementById('mould-generated-id').value;
    const cavity = parseInt(document.getElementById('mould-cavity').value, 10) || null;
    const size = document.getElementById('mould-size').value.trim();
    const make = document.getElementById('mould-make').value.trim();
    const client = document.getElementById('mould-client').value.trim();
    const creationDate = document.getElementById('mould-creation-date').value;
    const rackDetails = document.getElementById('mould-rack-details').value.trim();
    const notes = document.getElementById('mould-notes').value.trim();
    const layoutDiagram = document.getElementById('mould-layout-base64')?.value || '';

    if (!jmrefNo || isNaN(mouldNo) || !mouldType || !mouldId || !creationDate) {
      showToast('All starred fields are required', 'error');
      return;
    }

    const fields = { jmrefNo, mouldNo, mouldType, mouldId, cavity, size, make, client, creationDate, layoutDiagram, rackDetails, notes };

    if (editId) {
      DB.Moulds.update(editId, fields);
      showToast('Mould specifications updated', 'success');
    } else {
      // Ensure absolute uniqueness
      const exists = DB.Moulds.all().some(m => m.mouldId === mouldId);
      if (exists) {
        showToast('Mould ID already exists', 'error');
        return;
      }
      DB.Moulds.insert(fields);
      showToast('Mould registered successfully', 'success');
    }

    document.getElementById('mould-add-modal').classList.add('hidden');
    render();
  }

  function deleteMould(id) {
    if (!confirm('Are you sure you want to delete this mould record? Doing so will clear the asset specs from database.')) return;
    DB.Moulds.remove(id);
    showToast('Mould record removed', 'success');
    render();
  }

  // ── MOVEMENT ACTIONS ──────────────────────────────────────
  function populateMouldOptions(targetMouldId = '') {
    const select = document.getElementById('move-mould-id');
    if (!select) return;

    const moulds = DB.Moulds.all() || [];
    select.innerHTML = '<option value="">Select mould asset...</option>' + 
      moulds.map(m => `<option value="${m.id}" ${targetMouldId === m.id ? 'selected' : ''}>${m.mouldId}</option>`).join('');
  }

  function openMoveModal() {
    populateMouldOptions();
    document.getElementById('move-from-loc').value = '';
    document.getElementById('move-to-loc').value = '';
    document.getElementById('move-date').value = new Date().toISOString().slice(0, 16);
    document.getElementById('move-remarks').value = '';
    document.getElementById('mould-move-modal').classList.remove('hidden');
  }

  function openMoveModalFor(mouldDbId) {
    openMoveModal();
    populateMouldOptions(mouldDbId);
    onMouldSelectChange();
  }

  function onMouldSelectChange() {
    const mouldId = document.getElementById('move-mould-id').value;
    const fromLocInp = document.getElementById('move-from-loc');
    if (!fromLocInp) return;

    if (!mouldId) {
      fromLocInp.value = '';
      return;
    }

    fromLocInp.value = getMouldCurrentLocation(mouldId);
  }

  function saveMovement() {
    const mouldDbId = document.getElementById('move-mould-id').value;
    const fromLoc = document.getElementById('move-from-loc').value;
    const toLoc = document.getElementById('move-to-loc').value;
    const moveDate = document.getElementById('move-date').value;
    const remarks = document.getElementById('move-remarks').value.trim();
    const shouldPrint = document.getElementById('move-print-challan').checked;
    
    if (!mouldDbId || !toLoc || !moveDate) {
      showToast('Please fill all required movement fields', 'error');
      return;
    }

    if (fromLoc === toLoc) {
      showToast('Source location and destination cannot be the same', 'error');
      return;
    }

    const mould = DB.Moulds.find(mouldDbId);
    if (!mould) return;

    const session = Auth.getSession();

    const log = DB.MouldMovements.insert({
      mouldId: mouldDbId,
      uniqueMouldId: mould.mouldId,
      fromLocation: fromLoc,
      toLocation: toLoc,
      movementDate: moveDate,
      authorizedBy: session?.userId || '',
      remarks
    });

    showToast('Movement ledger entry created', 'success');
    document.getElementById('mould-move-modal').classList.add('hidden');

    if (shouldPrint) {
      setTimeout(() => {
        printChallan(log.id);
      }, 500);
    }

    App.navigate(App.current);
  }

  // ── FILTER ACTIONS ────────────────────────────────────────
  function filterTraceability() {
    traceJmref = document.getElementById('trace-jmref')?.value || '';
    traceMouldType = document.getElementById('trace-mould-type')?.value || '';
    renderTabContent();
  }

  function clearTraceability() {
    traceJmref = '';
    traceMouldType = '';
    renderTabContent();
  }

  function filterReports() {
    reportMouldId = document.getElementById('rep-mould-id')?.value || '';
    reportFromDate = document.getElementById('rep-from-date')?.value || '';
    reportToDate = document.getElementById('rep-to-date')?.value || '';
    renderTabContent();
  }

  function clearReports() {
    reportMouldId = '';
    reportFromDate = '';
    reportToDate = '';
    renderTabContent();
  }

  // ── PRINT DELIVERY CHALLAN DOCUMENT ────────────────────────
  function printChallan(movementLogId) {
    const log = DB.MouldMovements.find(movementLogId);
    if (!log) {
      showToast('Movement entry not found', 'error');
      return;
    }

    const mould = DB.Moulds.find(log.mouldId) || {};
    const user = DB.Users.all().find(u => u.id === log.authorizedBy) || { name: 'Authorized Officer' };

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      showToast('Popup blocked! Allow popups to print Delivery Challan.', 'warning');
      return;
    }

    printWindow.document.write(`
      <html>
      <head>
        <title>Delivery Challan - ${log.uniqueMouldId}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #333;
          }
          .challan-box {
            border: 2px solid #000;
            padding: 20px;
            border-radius: 8px;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .company-name {
            font-size: 24px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
          }
          .title {
            font-size: 18px;
            font-weight: 700;
            text-transform: uppercase;
            color: #555;
            letter-spacing: 0.5px;
          }
          .meta-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            font-size: 14px;
          }
          .meta-column {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          .info-table th, .info-table td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
            font-size: 14px;
          }
          .info-table th {
            background-color: #f5f5f5;
            font-weight: 700;
            text-transform: uppercase;
          }
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 60px;
            padding-top: 20px;
          }
          .sig-box {
            text-align: center;
            width: 200px;
          }
          .sig-line {
            border-top: 1px solid #000;
            margin-top: 50px;
            font-weight: 700;
            font-size: 13px;
          }
          .remarks-box {
            border: 1px solid #ddd;
            padding: 12px;
            background-color: #fafafa;
            border-radius: 4px;
            font-size: 13.5px;
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="challan-box">
          <div class="header">
            <div class="company-name">JANANI MOULDINGS PVT. LTD.</div>
            <div class="title">DELIVERY CHALLAN (MOULD TRANSFER)</div>
          </div>

          <div class="meta-info">
            <div class="meta-column">
              <div><strong>Challan No:</strong> DC-${log.id.toUpperCase()}</div>
              <div><strong>Date & Time:</strong> ${log.movementDate.replace('T', ' ')}</div>
            </div>
            <div class="meta-column" style="text-align: right;">
              <div><strong>Authorized By:</strong> ${user.name}</div>
              <div><strong>Status:</strong> OUTWARD/TRANSFER LOG</div>
            </div>
          </div>

          <table class="info-table">
            <thead>
              <tr>
                <th colspan="2">Asset Specification Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="width: 50%;"><strong>Unique Mould ID:</strong></td>
                <td>${log.uniqueMouldId}</td>
              </tr>
              <tr>
                <td><strong>JMREF No:</strong></td>
                <td>${mould.jmrefNo || '—'}</td>
              </tr>
              <tr>
                <td><strong>Mould Type:</strong></td>
                <td>${mould.mouldType || '—'}</td>
              </tr>
              <tr>
                <td><strong>No. of Cavities:</strong></td>
                <td>${mould.cavity || '—'}</td>
              </tr>
              <tr>
                <td><strong>Mould Size:</strong></td>
                <td>${mould.size || '—'}</td>
              </tr>
              <tr>
                <td><strong>Make / Manufacturer:</strong></td>
                <td>${mould.make || '—'}</td>
              </tr>
              <tr>
                <td><strong>Client Ownership:</strong></td>
                <td>${mould.client || '—'}</td>
              </tr>
            </tbody>
          </table>

          <table class="info-table">
            <thead>
              <tr>
                <th>Dispatched From (Source)</th>
                <th>Delivered To (Destination)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="width: 50%; font-size:16px;"><strong>${log.fromLocation}</strong></td>
                <td style="font-size:16px; color:#1e40af;"><strong>${log.toLocation}</strong></td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 20px;">
            <strong>Remarks / Purpose of dispatch:</strong>
            <div class="remarks-box" style="margin-top: 8px;">
              ${log.remarks || 'Standard production/maintenance transfer.'}
            </div>
          </div>

          <div class="signatures">
            <div class="sig-box">
              <div class="sig-line">Prepared By</div>
            </div>
            <div class="sig-box">
              <div class="sig-line">Receiver's Signature</div>
            </div>
            <div class="sig-box">
              <div class="sig-line">Authorized Signatory</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  document.addEventListener('click', e => {
    const list = document.getElementById('mould-jmref-dropdown');
    if (list && !e.target.closest('#mould-jmref') && !e.target.closest('#mould-jmref-dropdown')) {
      list.classList.add('hidden');
    }
  });

  function handleLayoutUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result;
      document.getElementById('mould-layout-base64').value = base64;
      const preview = document.getElementById('mould-layout-preview');
      if (preview) preview.src = base64;
      const container = document.getElementById('mould-layout-preview-container');
      if (container) container.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  function clearLayoutPreview() {
    const fileInput = document.getElementById('mould-layout-file');
    if (fileInput) fileInput.value = '';
    const base64Input = document.getElementById('mould-layout-base64');
    if (base64Input) base64Input.value = '';
    const container = document.getElementById('mould-layout-preview-container');
    if (container) container.classList.add('hidden');
    const preview = document.getElementById('mould-layout-preview');
    if (preview) preview.src = '';
  }

  function previewLayoutDiagram(id) {
    const m = DB.Moulds.find(id);
    if (m && m.layoutDiagram) {
      document.getElementById('mould-layout-view-img').src = m.layoutDiagram;
      document.getElementById('mould-layout-view-title').textContent = `Layout Diagram - ${m.mouldId}`;
      document.getElementById('mould-layout-view-modal').classList.remove('hidden');
    }
  }

  function renderMaintenanceTab() {
    const records = DB.MouldMaintenance.all() || [];
    
    const activeRepair = records.filter(r => r.status === 'Under Work' || r.status === 'Awaiting Tool Room').length;
    const completedRepair = records.filter(r => r.status === 'Ready for Production').length;

    const rows = records.map((r, i) => {
      let statusBadge = '<span class="badge badge-gray">Awaiting Tool Room</span>';
      if (r.status === 'Under Work') statusBadge = '<span class="badge badge-amber">Under Work</span>';
      else if (r.status === 'Ready for Production') statusBadge = '<span class="badge badge-green">Ready for Production</span>';

      let actionButtons = '';
      if (r.status === 'Awaiting Tool Room') {
        actionButtons = `<button class="btn btn-primary btn-xs" onclick="MouldTrackingModule.startMaintenanceWork('${r.id}')">Start Work</button>`;
      } else if (r.status === 'Under Work') {
        actionButtons = `<button class="btn btn-success btn-xs" onclick="MouldTrackingModule.promptCompleteMaintenance('${r.id}')">Mark Ready</button>`;
      }

      return `
        <tr>
          <td>${i + 1}</td>
          <td class="font-semibold text-blue">${r.mouldId}</td>
          <td><span class="badge badge-teal">${r.jmrefNo || '—'}</span></td>
          <td><span class="badge badge-blue">${r.maintenanceType || 'Repair'}</span></td>
          <td>${r.reason || '—'}</td>
          <td>${r.reworkDetails || '—'}</td>
          <td>${r.repairedBy || '—'}</td>
          <td>${r.maintenanceDate || '—'}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="flex gap-2">
              ${actionButtons}
              <button class="btn btn-danger btn-xs" onclick="MouldTrackingModule.deleteMaintenance('${r.id}')">✕ Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="animate-in">
        <div style="display:flex; gap:16px; margin-bottom: 20px; flex-wrap:wrap;">
          <div class="stat-card blue" style="flex:1; min-width: 150px;"><div class="stat-label">Active Moulds Under Repair</div><div class="stat-value blue">${activeRepair}</div></div>
          <div class="stat-card green" style="flex:1; min-width: 150px;"><div class="stat-label">Completed Repairs</div><div class="stat-value green">${completedRepair}</div></div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3>🔧 Tool Room Maintenance Log</h3>
            <button class="btn btn-primary btn-sm no-print" onclick="MouldTrackingModule.openMaintenanceModal()">+ New Log Entry</button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Mould ID</th>
                  <th>JMREF No</th>
                  <th>Type</th>
                  <th>Fault / Reason</th>
                  <th>Rework / Repair Notes</th>
                  <th>Technician</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);">No maintenance logs found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function maintenanceModal() {
    const moulds = DB.Moulds.all() || [];
    const mouldOpts = moulds.map(m => `<option value="${m.id}">${m.mouldId} (JMREF: ${m.jmrefNo})</option>`).join('');

    return `
      <div class="modal-overlay hidden" id="mould-maintenance-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3 id="mould-maintenance-modal-title">Record Maintenance Log</h3>
            <button class="modal-close" onclick="document.getElementById('mould-maintenance-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="maint-edit-id">
            
            <div class="form-group">
              <label class="form-label">Select Mould <span class="required">*</span></label>
              <select id="maint-mould-id" class="form-control">
                <option value="">Choose mould...</option>
                ${mouldOpts}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Maintenance Type</label>
              <div class="flex gap-4 mt-1">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="maint-type" value="Repair" checked> <span>Repair</span></label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="maint-type" value="PM"> <span>PM (Preventive)</span></label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="maint-type" value="Calibration"> <span>Calibration</span></label>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Fault Description / Reason <span class="required">*</span></label>
                <input type="text" id="maint-reason" class="form-control" placeholder="e.g. Scratched cavity block">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Technician Name <span class="required">*</span></label>
                <input type="text" id="maint-technician" class="form-control" placeholder="Technician name">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Date <span class="required">*</span></label>
                <input type="date" id="maint-date" class="form-control">
              </div>
              <div class="form-group" style="flex:1;"></div>
            </div>

            <div class="form-group hidden" id="maint-rework-group">
              <label class="form-label">Rework / Repair Notes</label>
              <textarea id="maint-rework" class="form-control" rows="2" placeholder="Describe repair/PM work done..."></textarea>
            </div>

          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('mould-maintenance-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="MouldTrackingModule.saveMaintenance()">Save Entry</button>
          </div>
        </div>
      </div>
    `;
  }

  function openMaintenanceModal(mouldId = null) {
    document.getElementById('maint-edit-id').value = '';
    document.getElementById('maint-mould-id').value = mouldId || '';
    document.getElementById('maint-reason').value = '';
    document.getElementById('maint-technician').value = '';
    document.getElementById('maint-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('maint-rework').value = '';
    document.getElementById('maint-rework-group').classList.add('hidden');
    document.getElementById('mould-maintenance-modal-title').textContent = 'Record Maintenance Log';
    
    const select = document.getElementById('maint-mould-id');
    if (mouldId) {
      select.disabled = true;
      select.style.opacity = '0.8';
    } else {
      select.disabled = false;
      select.style.opacity = '1';
    }
    
    document.getElementById('mould-maintenance-modal').classList.remove('hidden');
  }

  function saveMaintenance() {
    const id = document.getElementById('maint-edit-id').value;
    const mouldId = document.getElementById('maint-mould-id').value;
    if (!mouldId) { showToast('Please select a mould', 'error'); return; }

    const mould = DB.Moulds.find(mouldId);
    if (!mould) return;

    const reason = document.getElementById('maint-reason').value.trim();
    if (!reason) { showToast('Please enter a fault description / reason', 'error'); return; }

    const technician = document.getElementById('maint-technician').value.trim();
    if (!technician) { showToast('Please enter technician name', 'error'); return; }

    const date = document.getElementById('maint-date').value;
    if (!date) { showToast('Please enter date', 'error'); return; }

    const type = document.querySelector('input[name="maint-type"]:checked')?.value || 'Repair';
    const rework = document.getElementById('maint-rework').value.trim();

    if (!id) {
      DB.MouldMaintenance.insert({
        mouldDbId: mould.id,
        mouldId: mould.mouldId,
        jmrefNo: mould.jmrefNo,
        maintenanceType: type,
        reason,
        repairedBy: technician,
        maintenanceDate: date,
        reworkDetails: rework,
        status: 'Awaiting Tool Room'
      });
      showToast('Maintenance request logged', 'success');
    } else {
      DB.MouldMaintenance.update(id, {
        maintenanceType: type,
        reason,
        repairedBy: technician,
        maintenanceDate: date,
        reworkDetails: rework
      });
      showToast('Maintenance entry updated', 'success');
    }
    
    document.getElementById('mould-maintenance-modal').classList.add('hidden');
    renderTabContent();
  }

  function startMaintenanceWork(recordId) {
    DB.MouldMaintenance.update(recordId, {
      status: 'Under Work'
    });
    showToast('Mould repair status: Under Work', 'success');
    renderTabContent();
  }

  function promptCompleteMaintenance(recordId) {
    const rework = prompt("Enter repair / rework work details done on this mould:");
    if (rework === null) return;
    
    DB.MouldMaintenance.update(recordId, {
      status: 'Ready for Production',
      reworkDetails: rework || 'Repair completed'
    });
    showToast('Mould marked Ready for Production', 'success');
    renderTabContent();
  }

  function deleteMaintenance(recordId) {
    if (confirm('Are you sure you want to delete this maintenance record?')) {
      DB.MouldMaintenance.remove(recordId);
      showToast('Record deleted', 'success');
      renderTabContent();
    }
  }

  return {
    render,
    switchTab,
    openAddModal,
    openEditModal,
    autoGenMouldId,
    saveMould,
    deleteMould,
    openMoveModal,
    openMoveModalFor,
    onMouldSelectChange,
    saveMovement,
    filterTraceability,
    clearTraceability,
    filterReports,
    clearReports,
    printChallan,
    showJmrefDropdown,
    filterJmrefs,
    selectJmref,
    onMouldNoChange,
    handleLayoutUpload,
    clearLayoutPreview,
    previewLayoutDiagram,
    openMaintenanceModal,
    saveMaintenance,
    startMaintenanceWork,
    promptCompleteMaintenance,
    deleteMaintenance
  };
})();
