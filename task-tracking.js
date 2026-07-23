// ============================================================
// task-tracking.js — Work Task Tracking Module
// ============================================================
const TaskTrackingModule = (() => {
  let searchTerm = '';
  let statusFilter = 'all';
  let userFilter = 'all';

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const tasks = DB.Tasks.all();
    const users = DB.Users.all();
    const session = Auth.getSession();
    const isAdmin = Auth.isAdmin();

    // If not admin, restrict to tasks assigned to current user
    const viewableTasks = isAdmin
      ? tasks
      : tasks.filter(t => t.assignedTo === (session ? session.userId : ''));

    // Calculate stats based on viewable tasks
    const totalCount = viewableTasks.length;
    const pendingCount = viewableTasks.filter(t => t.status === 'pending').length;
    const inProgressCount = viewableTasks.filter(t => t.status === 'in_progress').length;
    const completedCount = viewableTasks.filter(t => t.status === 'completed').length;

    // Filter tasks
    const filteredTasks = viewableTasks.filter(t => {
      const matchSearch = !searchTerm || 
        (t.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.jmrefNo || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchUser = isAdmin 
        ? (userFilter === 'all' || t.assignedTo === userFilter)
        : true;

      return matchSearch && matchStatus && matchUser;
    });

    const userOpts = users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    const userFilterOpts = users.map(u => `<option value="${u.id}" ${userFilter === u.id ? 'selected' : ''}>${u.name}</option>`).join('');

    let userFilterHtml = '';
    if (isAdmin) {
      userFilterHtml = `
        <div class="form-group" style="flex:1; margin-bottom:0;">
          <label class="form-label">Assigned User</label>
          <select class="form-control" onchange="TaskTrackingModule.filterUser(this.value)">
            <option value="all">All Users</option>
            ${userFilterOpts}
          </select>
        </div>`;
    } else {
      userFilterHtml = `
        <div class="form-group" style="flex:1; margin-bottom:0;">
          <label class="form-label">Assigned User</label>
          <input type="text" class="form-control" value="${session ? session.name : ''}" readonly style="opacity: 0.7;">
        </div>`;
    }

    const statusLabels = {
      pending: '<span class="badge badge-amber">Pending</span>',
      in_progress: '<span class="badge badge-blue">In Progress</span>',
      completed: '<span class="badge badge-green">Completed</span>',
      cancelled: '<span class="badge badge-red">Cancelled</span>'
    };

    const taskRows = filteredTasks.map(t => {
      const formattedDate = (t.createdAt || '').slice(0, 16).replace('T', ' ');
      return `
        <tr>
          <td class="font-semibold text-blue">${t.title}</td>
          <td><span class="badge badge-teal" style="cursor: pointer;" onclick="TaskTrackingModule.showJmrefTasks('${t.jmrefNo}')">${t.jmrefNo}</span></td>
          <td>${t.assignedToName || '—'}</td>
          <td>${statusLabels[t.status] || t.status}</td>
          <td class="text-sm text-muted">${formattedDate}</td>
          <td>
            <button class="btn btn-ghost btn-xs" onclick="TaskTrackingModule.openUpdate('${t.id}')">⏳ Details &amp; History</button>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 class="font-bold" style="font-size:20px;">📋 Work Task Tracking</h2>
            <p class="text-sm text-muted mt-1">Assign, trace, and record resolutions for tasks associated with production JMREFs</p>
          </div>
          <div>
            <button class="btn btn-primary" onclick="TaskTrackingModule.openCreate()">➕ Create New Task</button>
          </div>
        </div>

        <!-- Stats Row -->
        <div class="dashboard-stats-grid-6" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 28px;">
          <div class="stat-card blue">
            <div style="font-size:22px;margin-bottom:8px;">📋</div>
            <div class="stat-label">Total Tasks</div>
            <div class="stat-value blue" style="font-size:22px;">${formatNum(totalCount)}</div>
            <div class="stat-sub">assigned tasks</div>
          </div>
          <div class="stat-card amber">
            <div style="font-size:22px;margin-bottom:8px;">⏳</div>
            <div class="stat-label">Pending</div>
            <div class="stat-value amber" style="font-size:22px;">${formatNum(pendingCount)}</div>
            <div class="stat-sub">awaiting start</div>
          </div>
          <div class="stat-card blue">
            <div style="font-size:22px;margin-bottom:8px;">🔄</div>
            <div class="stat-label">In Progress</div>
            <div class="stat-value blue" style="font-size:22px;">${formatNum(inProgressCount)}</div>
            <div class="stat-sub">currently active</div>
          </div>
          <div class="stat-card green">
            <div style="font-size:22px;margin-bottom:8px;">✅</div>
            <div class="stat-label">Completed</div>
            <div class="stat-value green" style="font-size:22px;">${formatNum(completedCount)}</div>
            <div class="stat-sub">resolved tasks</div>
          </div>
        </div>

        <!-- Filter Panel -->
        <div class="card card-body" style="margin-bottom: 24px;">
          <div class="form-row" style="margin-bottom: 0;">
            <div class="form-group" style="flex:2; margin-bottom:0;">
              <label class="form-label">Search Task / JMREF</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <input type="text" id="task-search-input" class="form-control" placeholder="Search by task title or JMREF No..." value="${searchTerm}" oninput="TaskTrackingModule.filterSearch(this.value)">
                <button class="btn btn-secondary" onclick="Scanner.start('task-search-input', (val) => TaskTrackingModule.filterSearch(val))" style="padding:4px 8px; display:flex; align-items:center; justify-content:center; height:38px;" title="Scan QR Code">📷</button>
              </div>
            </div>
            ${userFilterHtml}
            <div class="form-group" style="flex:1; margin-bottom:0;">
              <label class="form-label">Status</label>
              <select class="form-control" onchange="TaskTrackingModule.filterStatus(this.value)">
                <option value="all" ${statusFilter==='all'?'selected':''}>All Statuses</option>
                <option value="pending" ${statusFilter==='pending'?'selected':''}>Pending</option>
                <option value="in_progress" ${statusFilter==='in_progress'?'selected':''}>In Progress</option>
                <option value="completed" ${statusFilter==='completed'?'selected':''}>Completed</option>
                <option value="cancelled" ${statusFilter==='cancelled'?'selected':''}>Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Task List Card -->
        <div class="card">
          <div class="card-header">
            <h3>🗂️ Task Assignments</h3>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Task Title</th>
                  <th>JMREF No</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${taskRows || '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">No tasks match the active filters.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Create Task Modal -->
      <div class="modal-overlay hidden" id="task-create-modal">
        <div class="modal modal-md">
          <div class="modal-header">
            <h3>➕ Create New Task</h3>
            <button class="modal-close" onclick="document.getElementById('task-create-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Associated JMREF No <span class="required">*</span></label>
              <select id="task-create-jmref" class="form-control">
                <option value="">Select JMREF...</option>
                ${DB.Master.all().map(m => `<option value="${m.jmrefNo}">${m.jmrefNo} (${m.partNo})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Task Title <span class="required">*</span></label>
              <input type="text" id="task-create-title" class="form-control" placeholder="Enter short task summary">
            </div>
            <div class="form-group">
              <label class="form-label">Task Description</label>
              <textarea id="task-create-desc" class="form-control" rows="3" placeholder="Enter detailed task context or issue description"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Assign To User <span class="required">*</span></label>
              <select id="task-create-assign" class="form-control">
                <option value="">Select user...</option>
                ${userOpts}
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('task-create-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="TaskTrackingModule.createTask()">Create Task</button>
          </div>
        </div>
      </div>

      <!-- Update Task Details/History Modal -->
      <div class="modal-overlay hidden" id="task-update-modal">
        <div class="modal modal-md" style="max-width: 650px;">
          <div class="modal-header">
            <h3>⏳ Task Status &amp; Tracking History</h3>
            <button class="modal-close" onclick="document.getElementById('task-update-modal').classList.add('hidden')">&#x2715;</button>
          </div>
          <div class="modal-body" style="max-height: 75vh; overflow-y: auto; padding: 20px;">
            <input type="hidden" id="task-update-id">
            
            <!-- Task Summary Panel -->
            <div style="background: var(--bg-input); padding: 14px; border-radius: 10px; margin-bottom: 20px; border: 1px solid var(--border);">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
                <div>
                  <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">Task Title</span>
                  <div class="font-semibold" id="task-detail-title"></div>
                </div>
                <div>
                  <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">JMREF No</span>
                  <div class="font-semibold" id="task-detail-jmref"></div>
                </div>
                <div style="grid-column: span 2;">
                  <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">Description</span>
                  <div style="white-space: pre-wrap;" id="task-detail-desc"></div>
                </div>
                <div style="grid-column: span 2; display: none;" id="task-detail-solution-panel">
                  <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600; color:var(--success);">Solution / Action Taken</span>
                  <div style="white-space: pre-wrap; font-weight: 600; color:var(--success);" id="task-detail-solution"></div>
                </div>
              </div>
            </div>

            <!-- Transition Actions Panel -->
            <h4 style="font-size:14px; font-weight:700; margin-bottom:12px;">⚙️ Update Status &amp; Assignee</h4>
            <div class="form-row">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Update Status</label>
                <select id="task-update-status" class="form-control" onchange="TaskTrackingModule.onStatusChange(this.value)">
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Reassign To</label>
                <select id="task-update-assign" class="form-control">
                  ${userOpts}
                </select>
              </div>
            </div>

            <!-- Log Notes -->
            <div class="form-group">
              <label class="form-label">Update Log Note / Comment</label>
              <textarea id="task-update-note" class="form-control" rows="2" placeholder="Enter comments or status details"></textarea>
            </div>

            <!-- Solution Input (specifically for completed or action items) -->
            <div class="form-group" id="task-solution-group">
              <label class="form-label" style="color:var(--success); font-weight:600;">Solution / Action Taken or Followed</label>
              <textarea id="task-update-solution" class="form-control" rows="2" placeholder="Enter final resolution details or actions taken to resolve the issue" style="border-color: rgba(16, 185, 129, 0.4);"></textarea>
            </div>

            <!-- Tracking History Timeline -->
            <h4 style="font-size:14px; font-weight:700; margin-top:24px; margin-bottom:12px;">⏳ Tracking Logs History</h4>
            <div id="task-history-timeline" style="display:flex; flex-direction:column; gap:12px;">
              <!-- Timeline nodes loaded dynamically -->
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('task-update-modal').classList.add('hidden')">Cancel</button>
            <button class="btn btn-primary" onclick="TaskTrackingModule.updateTaskStatus()">Save Updates</button>
          </div>
        </div>
      </div>
    `;
  }

  function filterSearch(val) {
    searchTerm = val;
    render();
  }

  function filterUser(val) {
    userFilter = val;
    render();
  }

  // Set the filters on select changes
  window.TaskTrackingModule_filterUser = filterUser;

  function filterStatus(val) {
    statusFilter = val;
    render();
  }

  function openCreate() {
    document.getElementById('task-create-jmref').value = '';
    document.getElementById('task-create-title').value = '';
    document.getElementById('task-create-desc').value = '';
    document.getElementById('task-create-assign').value = '';
    document.getElementById('task-create-modal').classList.remove('hidden');
  }

  function createTask() {
    const jmrefNo = document.getElementById('task-create-jmref').value;
    const title = document.getElementById('task-create-title').value.trim();
    const taskDesc = document.getElementById('task-create-desc').value.trim();
    const assignedId = document.getElementById('task-create-assign').value;

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
      date: timestamp.slice(0,16).replace('T', ' '),
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
    document.getElementById('task-create-modal').classList.add('hidden');
    render();
  }

  function openUpdate(taskId) {
    const t = DB.Tasks.find(taskId);
    if (!t) return;

    document.getElementById('task-update-id').value = taskId;
    document.getElementById('task-detail-title').textContent = t.title || '—';
    document.getElementById('task-detail-jmref').textContent = t.jmrefNo || '—';
    document.getElementById('task-detail-desc').textContent = t.taskDesc || '—';
    
    const solPanel = document.getElementById('task-detail-solution-panel');
    const solText = document.getElementById('task-detail-solution');
    if (t.solution) {
      solPanel.style.display = 'block';
      solText.textContent = t.solution;
    } else {
      solPanel.style.display = 'none';
    }

    // Populate transition form
    document.getElementById('task-update-status').value = t.status || 'pending';
    document.getElementById('task-update-assign').value = t.assignedTo || '';
    document.getElementById('task-update-note').value = '';
    document.getElementById('task-update-solution').value = t.solution || '';

    // Handle solution group visibility depending on status
    onStatusChange(t.status);

    // Build timeline logs HTML
    const timelineEl = document.getElementById('task-history-timeline');
    const statusPills = {
      pending: '<span class="badge badge-amber">Pending</span>',
      in_progress: '<span class="badge badge-blue">In Progress</span>',
      completed: '<span class="badge badge-green">Completed</span>',
      cancelled: '<span class="badge badge-red">Cancelled</span>'
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

    document.getElementById('task-update-modal').classList.remove('hidden');
  }

  function onStatusChange(status) {
    const solGroup = document.getElementById('task-solution-group');
    if (solGroup) {
      if (status === 'completed') {
        solGroup.style.display = 'block';
      } else {
        solGroup.style.display = 'block';
      }
    }
  }

  function updateTaskStatus() {
    const id = document.getElementById('task-update-id').value;
    const t = DB.Tasks.find(id);
    if (!t) return;

    const newStatus = document.getElementById('task-update-status').value;
    const newAssigneeId = document.getElementById('task-update-assign').value;
    const logNote = document.getElementById('task-update-note').value.trim();
    const solution = document.getElementById('task-update-solution').value.trim();

    if (!newAssigneeId) {
      showToast('Please select a valid assignee', 'error');
      return;
    }

    const assignedUser = DB.Users.find(newAssigneeId);
    const session = Auth.getSession();
    const timestamp = new Date().toISOString();

    // Build comment/history log
    let details = '';
    if (t.status !== newStatus) {
      details += `Status changed from "${t.status}" to "${newStatus}". `;
    }
    if (t.assignedTo !== newAssigneeId) {
      details += `Reassigned task to "${assignedUser ? assignedUser.name : 'unknown'}". `;
    }
    if (logNote) {
      details += `Comment: ${logNote}. `;
    }

    if (!details && !solution && t.assignedTo === newAssigneeId && t.status === newStatus) {
      showToast('No updates were typed or selected.', 'warning');
      return;
    }

    const logEntry = {
      status: newStatus,
      note: details || 'Task parameters updated',
      solution: solution || null,
      updatedBy: session ? session.name : 'system',
      date: timestamp.slice(0, 16).replace('T', ' '),
      createdAt: timestamp
    };

    const newHistory = [...(t.history || []), logEntry];

    DB.Tasks.update(id, {
      status: newStatus,
      assignedTo: newAssigneeId,
      assignedToName: assignedUser ? assignedUser.name : 'unknown',
      solution: solution || t.solution || '',
      updatedAt: timestamp,
      history: newHistory
    });

    showToast('Task updated successfully', 'success');
    document.getElementById('task-update-modal').classList.add('hidden');
    render();
  }

  function showJmrefTasks(jmrefNo) {
    const list = DB.Tasks.all().filter(t => t.jmrefNo === jmrefNo);
    
    let modal = document.getElementById('jmref-tasks-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay hidden';
      modal.id = 'jmref-tasks-modal';
      modal.style.zIndex = '2100';
      document.body.appendChild(modal);
    }

    const statusLabels = {
      pending: '<span class="badge badge-amber btn-xs">Pending</span>',
      in_progress: '<span class="badge badge-blue btn-xs">In Progress</span>',
      completed: '<span class="badge badge-green btn-xs">Completed</span>',
      cancelled: '<span class="badge badge-red btn-xs">Cancelled</span>'
    };

    const rowsHtml = list.map(t => `
      <tr style="cursor: pointer;" onclick="document.getElementById('jmref-tasks-modal').classList.add('hidden'); TaskTrackingModule.viewTaskDetails('${t.id}')">
        <td class="font-semibold text-blue">${t.title}</td>
        <td>${statusLabels[t.status] || t.status}</td>
        <td>${t.assignedToName || '—'}</td>
        <td class="text-sm text-muted">${(t.createdAt || '').slice(0, 10)}</td>
      </tr>
    `).join('');

    modal.innerHTML = `
      <div class="modal modal-md" style="max-width: 600px;">
        <div class="modal-header">
          <h3>📋 Tickets raised for JMREF: ${jmrefNo}</h3>
          <button class="modal-close" onclick="document.getElementById('jmref-tasks-modal').classList.add('hidden')">&#x2715;</button>
        </div>
        <div class="modal-body">
          <p class="text-sm text-muted mb-3">Click on any ticket row to view its full tracking logs and solution details.</p>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Task Title</th>
                  <th>Status</th>
                  <th>Assigned To</th>
                  <th>Created Date</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="4" class="text-center text-muted" style="padding:20px;">No tickets raised for this JMREF yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('jmref-tasks-modal').classList.add('hidden')">Close</button>
        </div>
      </div>`;

    modal.classList.remove('hidden');
  }

  function viewTaskDetails(taskId) {
    const t = DB.Tasks.find(taskId);
    if (!t) return;

    let modal = document.getElementById('task-details-view-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay hidden';
      modal.id = 'task-details-view-modal';
      modal.style.zIndex = '2200';
      document.body.appendChild(modal);
    }

    const statusPills = {
      pending: '<span class="badge badge-amber btn-xs">Pending</span>',
      in_progress: '<span class="badge badge-blue btn-xs">In Progress</span>',
      completed: '<span class="badge badge-green btn-xs">Completed</span>',
      cancelled: '<span class="badge badge-red btn-xs">Cancelled</span>'
    };

    const timelineHtml = (t.history || []).map(h => `
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

    modal.innerHTML = `
      <div class="modal modal-md" style="max-width: 600px;">
        <div class="modal-header">
          <h3>⏳ Ticket Details &amp; History</h3>
          <button class="modal-close" onclick="document.getElementById('task-details-view-modal').classList.add('hidden')">&#x2715;</button>
        </div>
        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
          <div style="background: var(--bg-input); padding: 14px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border);">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
              <div>
                <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">Task Title</span>
                <div class="font-semibold" style="color: var(--primary);">${t.title || '—'}</div>
              </div>
              <div>
                <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">JMREF No</span>
                <div class="font-semibold">${t.jmrefNo || '—'}</div>
              </div>
              <div style="grid-column: span 2;">
                <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600;">Description</span>
                <div style="white-space: pre-wrap;">${t.taskDesc || '—'}</div>
              </div>
              ${t.solution ? `
              <div style="grid-column: span 2;">
                <span class="text-xs text-muted" style="text-transform:uppercase; font-weight:600; color:var(--success);">Solution / Action Taken</span>
                <div style="white-space: pre-wrap; font-weight: 600; color:var(--success);">${t.solution}</div>
              </div>` : ''}
            </div>
          </div>
          
          <h4 style="font-size:14px; font-weight:700; margin-bottom:12px;">⏳ Tracking Logs History</h4>
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${timelineHtml}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('task-details-view-modal').classList.add('hidden'); if(document.getElementById('jmref-tasks-modal') && !document.getElementById('jmref-tasks-modal').innerHTML.includes('No tickets raised')) document.getElementById('jmref-tasks-modal').classList.remove('hidden');">Back / Close</button>
        </div>
      </div>`;

    modal.classList.remove('hidden');
  }

  return {
    render,
    filterSearch,
    filterUser,
    filterStatus,
    openCreate,
    createTask,
    openUpdate,
    onStatusChange,
    updateTaskStatus,
    showJmrefTasks,
    viewTaskDetails
  };
})();
