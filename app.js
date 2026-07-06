// ============================================================
// app.js — JMPL Inventory Tracking System
// Main application bootstrap, routing and navigation
// ============================================================

// ── Global Utilities ───────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('out'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); el.classList.add('modal-overlay'); }
}
function hideModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); }
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  } catch { return iso.slice(0,10); }
}
function formatNum(n) { return n == null ? '0' : Number(n).toLocaleString('en-IN'); }
function today() { return new Date().toISOString().slice(0,10); }
function nowISO() { return new Date().toISOString(); }

function printBarcode(batchId) {
  const batch = DB.Batches.find(batchId);
  if (!batch) { showToast('Batch not found', 'error'); return; }

  const printWindow = window.open('', '_blank', 'width=600,height=800');
  if (!printWindow) {
    showToast('Popup blocked! Please allow popups for printing.', 'warning');
    return;
  }

  const formattedDate = batch.productionDate ? formatDate(batch.productionDate) : formatDate(batch.createdAt);

  printWindow.document.write(`
    <html>
    <head>
      <title>Print Label - \${batch.batchNo}</title>
      <style>
        @page {
          size: 4in 6in;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          width: 100vw;
          background: #fff;
          color: #000;
          box-sizing: border-box;
        }
        .label-container {
          width: 3.8in;
          height: 5.8in;
          border: 3px solid #000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          box-sizing: border-box;
          padding: 16px;
        }
        .company-title {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.5px;
          border-bottom: 3px solid #000;
          padding-bottom: 6px;
          width: 100%;
          text-align: center;
          text-transform: uppercase;
        }
        .qr-wrapper {
          margin: 12px 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .batch-no-display {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
          border: 3px solid #000;
          padding: 8px 16px;
          border-radius: 4px;
          background: #f3f4f6;
          text-align: center;
        }
        .details {
          width: 100%;
          border-top: 3px solid #000;
          padding-top: 12px;
          font-size: 18px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          line-height: 1.3;
        }
        .label {
          font-weight: 800;
          text-transform: uppercase;
          font-size: 18px;
        }
        .value {
          font-weight: 800;
          font-size: 20px;
          white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <div class="label-container">
        <div class="company-title">JANANI MOULDINGS PVT. LTD.</div>
        <div class="qr-wrapper">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=\${encodeURIComponent(batch.batchNo)}" style="width: 200px; height: 200px; display: block;" onload="triggerPrint()" />
        </div>
        <div class="batch-no-display">\${batch.batchNo}</div>
        <div class="details">
          <div class="detail-row">
            <span class="label">JMREF:</span>
            <span class="value">\${batch.jmrefNo}</span>
          </div>
          <div class="detail-row">
            <span class="label">Part No:</span>
            <span class="value">\${batch.partNo || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Prod Date:</span>
            <span class="value">\${formattedDate}</span>
          </div>
        </div>
      </div>
      <script>
        let printed = false;
        function triggerPrint() {
          if (printed) return;
          printed = true;
          setTimeout(function() {
            window.print();
            window.close();
          }, 300);
        }
        window.onload = function() {
          setTimeout(triggerPrint, 1000); // fallback in case image load event doesn't fire
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
window.printBarcode = printBarcode;

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});
// Close modal on ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllModals();
});

// ── Navigation Config ──────────────────────────────────────
const NAV = [
  { id:'dashboard',  label:'Dashboard',           icon:'🏠', module:'dashboard', section:'main' },
  { id:'master',     label:'Inventory Master',    icon:'📋', module:'master',    section:'main' },
  // Departments
  { id:'production', label:'Production',          icon:'🏭', module:'production',section:'dept', perm:'production' },
  { id:'cryogenic',  label:'Cryogenic',           icon:'❄️', module:'cryogenic', section:'dept', perm:'cryogenic' },
  { id:'deflashing', label:'Flash Removal',       icon:'🔧', module:'deflashing',section:'dept', perm:'deflashing' },
  { id:'trimming',   label:'Trimming',            icon:'✂️', module:'trimming',  section:'dept', perm:'trimming' },
  { id:'post-curing', label:'Post Curing',          icon:'🔥', module:'post-curing',section:'dept', perm:'post-curing' },
  { id:'waiting-visual', label:'Waiting for Visual inspection', icon:'⏳', module:'waiting-visual',section:'dept', perm:'waiting-visual' },
  { id:'visual',     label:'Visual Inspection',   icon:'👁️', module:'visual',    section:'dept', perm:'visual' },
  { id:'gauge',      label:'Gauge Inspection',    icon:'📏', module:'gauge',     section:'dept', perm:'gauge' },
  { id:'quality',    label:'Quality Final',       icon:'⭐', module:'quality',   section:'dept', perm:'quality' },
  { id:'store',      label:'Store & Sales',       icon:'🏪', module:'store',     section:'dept', perm:'store' },
  // Tools
  { id:'stock',      label:'Stock Upload',        icon:'📤', module:'stock',     section:'tools', perm:'stock' },
  { id:'monthly-plan', label:'Monthly Plan',      icon:'📅', module:'monthly-plan',section:'tools', perm:'monthly-plan' },
  { id:'prod-sched',  label:'Production Schedule', icon:'📝', module:'prod-sched',  section:'tools', perm:'prod-sched' },
  { id:'replenishment',label:'Replenishment Planner',icon:'🎯', module:'replenishment',section:'tools', perm:'replenishment' },
  { id:'reports',    label:'Reports',             icon:'📊', module:'reports',   section:'tools' },
  // Sub-reports
  { id:'rpt-inventory', label:'Inventory Report',  icon:'📦', module:'report_inventory', section:'tools', parent:'reports', perm:'report_inventory' },
  { id:'rpt-sales',     label:'Sales Report',      icon:'💰', module:'report_sales',     section:'tools', parent:'reports', perm:'report_sales' },
  { id:'rpt-production',label:'Production Report', icon:'🏭', module:'report_production',section:'tools', parent:'reports', perm:'report_production' },
  { id:'rpt-cryogenic', label:'Cryogenic Loss',    icon:'❄️', module:'report_cryogenic', section:'tools', parent:'reports', perm:'report_cryogenic' },
  { id:'rpt-deflashing',label:'Flash Removal Loss',icon:'🔧', module:'report_deflashing',section:'tools', parent:'reports', perm:'report_deflashing' },
  { id:'rpt-trimming',  label:'Trimming Loss',     icon:'✂️', module:'report_trimming',  section:'tools', parent:'reports', perm:'report_trimming' },
  { id:'rpt-post-curing', label:'Post Curing Loss', icon:'🔥', module:'report_post_curing', section:'tools', parent:'reports', perm:'report_post_curing' },
  { id:'rpt-waiting-visual', label:'Waiting for Visual Report', icon:'⏳', module:'report_waiting_visual', section:'tools', parent:'reports', perm:'report_waiting_visual' },
  { id:'rpt-visual',    label:'Visual Inspection', icon:'👁️', module:'report_visual',    section:'tools', parent:'reports', perm:'report_visual' },
  { id:'rpt-gauge',     label:'Gauge Inspection',  icon:'📏', module:'report_gauge',     section:'tools', parent:'reports', perm:'report_gauge' },
  { id:'rpt-rejected',  label:'Rejected Batches',  icon:'🚫', module:'report_rejected',  section:'tools', parent:'reports', perm:'report_rejected' },
  { id:'rpt-recheck',   label:'QF Recheck Report', icon:'🔄', module:'report_recheck',   section:'tools', parent:'reports', perm:'report_recheck' },
  { id:'rpt-slob',      label:'SLOB Report',       icon:'📉', module:'report_slob',      section:'tools', parent:'reports', perm:'report_inventory' },
  { id:'rpt-aging',     label:'Aging WIP Report',  icon:'⏳', module:'report_aging',     section:'tools', parent:'reports', perm:'report_inventory' },

  { id:'print-batch',  label:'Print Label',        icon:'🖨️', module:'print-batch',  section:'tools' },
  { id:'ai-agent',   label:'AI Assistant',        icon:'🤖', module:'ai-agent',  section:'tools' },
  // Admin
  { id:'admin',      label:'Admin Panel',         icon:'⚙️', module:'admin',     section:'admin', adminOnly:true },
];

const SECTION_LABELS = { main:'OVERVIEW', dept:'DEPARTMENTS', tools:'TOOLS', admin:'ADMINISTRATION' };

// ── App State ──────────────────────────────────────────────
const App = (() => {
  let currentModule = null;
  let reportsExpanded = localStorage.getItem('jmpl_reports_expanded') === 'true';

  const MODULE_MAP = {
    dashboard:  () => renderDashboard(),
    master:     () => MasterModule?.render(),
    production: () => ProductionModule?.render(),
    cryogenic:  () => CryogenicModule?.render(),
    deflashing: () => DeflashingModule?.render(),
    trimming:   () => TrimmingModule?.render(),
    'post-curing': () => PostCuringModule?.render(),
    'waiting-visual': () => WaitingVisualModule?.render(),
    visual:     () => VisualModule?.render(),
    gauge:      () => GaugeModule?.render(),
    quality:    () => QualityModule?.render(),
    store:      () => StoreModule?.render(),
    stock:      () => StockModule?.render(),
    'monthly-plan': () => MonthlyPlanModule?.render(),
    'prod-sched':   () => ProductionScheduleModule?.render(),
    replenishment:  () => ReplenishmentModule?.render(),
    reports:    () => ReportsModule?.render('inventory'),
    admin:      () => AdminModule?.render(),
    'ai-agent': () => AIAgentModule?.render(),
    report_inventory:  () => ReportsModule?.render('inventory'),
    report_sales:      () => ReportsModule?.render('sales'),
    report_production: () => ReportsModule?.render('production'),
    report_cryogenic:  () => ReportsModule?.render('cryogenic'),
    report_deflashing: () => ReportsModule?.render('deflashing'),
    report_trimming:   () => ReportsModule?.render('trimming'),
    report_post_curing: () => ReportsModule?.render('post-curing'),
    report_waiting_visual: () => ReportsModule?.render('waiting-visual'),
    report_visual:     () => ReportsModule?.render('visual'),
    report_gauge:      () => ReportsModule?.render('gauge'),
    report_rejected:   () => ReportsModule?.render('rejected'),
    report_recheck:    () => ReportsModule?.render('recheck'),
    report_slob:       () => ReportsModule?.render('slob'),
    report_aging:      () => ReportsModule?.render('aging'),
    'print-batch':     () => PrintBatchModule?.render(),
  };

  const PAGE_TITLES = {
    dashboard:'Dashboard', master:'Inventory Master', production:'Production',
    cryogenic:'Cryogenic', deflashing:'Flash Removal', trimming:'Trimming',
    visual:'Visual Inspection', gauge:'Gauge Inspection', quality:'Quality Final',
    'post-curing':'Post Curing',
    'waiting-visual':'Waiting for Visual inspection',
    store:'Store & Sales', stock:'Stock Upload', reports:'Reports', admin:'Admin Panel',
    'print-batch':'Print Label',
    'ai-agent':'AI Assistant',
    'monthly-plan':'Monthly Plan',
    'prod-sched':'Production Schedule',
    replenishment:'Replenishment Planner',
    report_inventory:'Inventory Report',
    report_sales:'Sales Report',
    report_production:'Production Report',
    report_cryogenic:'Cryogenic Loss Report',
    report_deflashing:'Flash Removal Loss Report',
    report_trimming:'Trimming Loss Report',
    report_post_curing:'Post Curing Loss Report',
    report_waiting_visual:'Waiting for Visual Report',
    report_visual:'Visual Inspection Report',
    report_gauge:'Gauge Inspection Report',
    report_rejected:'Rejected Batch Report',
    report_recheck:'Quality Final Recheck',
    report_slob:'SLOB Report',
    report_aging:'Aging WIP Report',
  };

  function navigate(moduleId) {
    const nav = NAV.find(n => n.module === moduleId);
    if (!nav) return;

    // Permission check
    if (nav.adminOnly && !Auth.isAdmin()) { showToast('Admin access required', 'error'); return; }
    if (nav.perm && !Auth.hasPermission(nav.perm) && !Auth.isAdmin()) {
      showToast('You do not have permission to access this module', 'error'); return;
    }

    currentModule = moduleId;

    // Update active nav
    document.querySelectorAll('.nav-item[data-module]').forEach(el => {
      el.classList.toggle('active', el.dataset.module === moduleId);
    });

    // Update top bar title
    const topTitle = document.getElementById('top-bar-title');
    if (topTitle) topTitle.textContent = PAGE_TITLES[moduleId] || moduleId;

    // Close mobile sidebar if open
    document.getElementById('sidebar')?.classList.remove('open');

    // Render module
    const fn = MODULE_MAP[moduleId];
    if (fn) {
      try { fn(); }
      catch(e) {
        console.error('Module render error:', e);
        const content = document.getElementById('content');
        if (content) content.innerHTML = `<div class="card card-body text-danger">⚠️ Error loading module: ${e.message}</div>`;
      }
    }

    // Update URL hash
    location.hash = moduleId;
  }

  async function init() {
    // Show a global loader if page loads and Firebase isn't synced
    const root = document.getElementById('app-root') || document.body;
    if (root) {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background-color:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
          <div style="font-size:36px;margin-bottom:16px;animation:spin 1s linear infinite;">🔩</div>
          <h2 style="font-size:18px;font-weight:600;margin-bottom:8px;">Connecting to JMPL Cloud...</h2>
          <p style="font-size:13px;color:#94a3b8;">Syncing database with Firestore</p>
          <style>
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </div>`;
    }

    try {
      await DB.init();
    } catch(e) {
      console.error("Database initialization failed:", e);
    }

    DB.seedDefaults();

    const session = Auth.getSession();
    if (!session) { showLoginPage(); return; }

    showAppShell(session);

    // Route to module from hash or default
    const hash = location.hash.replace('#', '');
    navigate(hash && MODULE_MAP[hash] ? hash : 'dashboard');
  }

  function toggleReportsMenu() {
    const subItems = document.querySelectorAll('.sub-nav-item');
    if (subItems.length === 0) return;
    const isHidden = subItems[0].style.display === 'none';
    subItems.forEach(el => {
      el.style.display = isHidden ? 'flex' : 'none';
    });
    reportsExpanded = isHidden;
    localStorage.setItem('jmpl_reports_expanded', reportsExpanded);
  }

  return { navigate, init, toggleReportsMenu, get current() { return currentModule; } };
})();

// ── Login Page ─────────────────────────────────────────────
function showLoginPage() {
  document.body.innerHTML = `
    <div id="login-page">
      <div class="login-card">
        <div class="login-logo">
          <img src="./logo.png" alt="JMPL Logo" style="height: 80px; margin-bottom: 16px; object-fit: contain; background: white; padding: 6px; border-radius: 12px;">
          <h1><span>JMPL</span> Inventory</h1>
          <p>Rubber O-Ring Manufacturing — Tracking System</p>
        </div>
        <div id="login-error" class="login-error"></div>
        <form id="login-form">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" id="login-username" class="form-control" placeholder="Enter username" required autocomplete="username">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <div style="position:relative;">
              <input type="password" id="login-password" class="form-control" placeholder="Enter password" required autocomplete="current-password">
              <button type="button" id="toggle-pwd" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;">👁️</button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary w-full" style="margin-top:8px;justify-content:center;padding:12px;">
            Sign In →
          </button>
        </form>
        <p style="text-align:center;margin-top:20px;font-size:11.5px;color:var(--text-muted);">JMPL © ${new Date().getFullYear()} — Janani Mouldings Pvt. Ltd.</p>
      </div>
    </div>
    <div id="toast-container"></div>`;

  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const result = Auth.login(username, password);
    if (result.ok) {
      App.init();
    } else {
      const err = document.getElementById('login-error');
      err.textContent = result.error;
      err.classList.add('show');
    }
  });

  document.getElementById('toggle-pwd').addEventListener('click', function() {
    const inp = document.getElementById('login-password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
}

// ── App Shell ──────────────────────────────────────────────
function showAppShell(session) {
  const reportsExpanded = localStorage.getItem('jmpl_reports_expanded') === 'true';
  const displayStyle = reportsExpanded ? 'flex' : 'none';

  // Build sidebar nav
  let lastSection = '';
  const navHtml = NAV.filter(n => {
    if (n.adminOnly && !Auth.isAdmin()) return false;
    if (n.perm && !Auth.hasPermission(n.perm) && !Auth.isAdmin()) return false;
    
    // Parent 'reports' menu item: hide if user is not admin and has access to zero sub-reports
    if (n.module === 'reports' && !Auth.isAdmin()) {
      const hasAnyReportPerm = NAV.some(item => item.parent === 'reports' && item.perm && Auth.hasPermission(item.perm));
      if (!hasAnyReportPerm) return false;
    }
    return true;
  }).map(n => {
    let html = '';
    if (n.section !== lastSection) {
      html += `<div class="nav-section-label">${SECTION_LABELS[n.section]}</div>`;
      lastSection = n.section;
    }
    
    if (n.parent) {
      html += `<button class="nav-item sub-nav-item" data-module="${n.module}" id="nav-${n.id}" onclick="App.navigate('${n.module}')" style="padding-left: 36px; font-size: 12.5px; display: ${displayStyle};">
        <span class="nav-icon">${n.icon}</span>${n.label}
      </button>`;
    } else if (n.module === 'reports') {
      html += `<button class="nav-item" data-module="${n.module}" id="nav-${n.id}" onclick="App.toggleReportsMenu()">
        <span class="nav-icon">${n.icon}</span>${n.label} <span style="margin-left: auto; font-size: 10px; opacity: 0.7;">▼</span>
      </button>`;
    } else {
      html += `<button class="nav-item" data-module="${n.module}" id="nav-${n.id}" onclick="App.navigate('${n.module}')">
        <span class="nav-icon">${n.icon}</span>${n.label}
      </button>`;
    }
    return html;
  }).join('');

  const initials = (session.name || 'U').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);

  document.body.innerHTML = `
    <div id="app">
      <!-- Sidebar -->
      <nav id="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-brand">
            <img src="./logo.png" alt="JMPL Logo" style="width: 40px; height: 40px; object-fit: contain; border-radius: 8px; background: white; padding: 4px; flex-shrink: 0;">
            <div class="brand-text">
              <h2>JMPL</h2>
              <p>Inventory System</p>
            </div>
          </div>
        </div>
        <div class="sidebar-nav">${navHtml}</div>
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">${initials}</div>
            <div class="user-details">
              <h4>${session.name}</h4>
              <p>${session.role === 'admin' ? '🔑 Administrator' : '👤 Operator'}</p>
            </div>
          </div>
          <button class="btn btn-ghost w-full btn-sm" onclick="Auth.logout()">🚪 Sign Out</button>
        </div>
      </nav>

      <!-- Main Content -->
      <main id="main">
        <header id="top-bar">
          <button id="sidebar-toggle" class="btn btn-ghost btn-sm no-print" style="margin-right:12px; display:none; align-items:center; justify-content:center; width:36px; height:36px; font-size:18px;">☰</button>
          <h2 id="top-bar-title">Dashboard</h2>
          <span class="top-badge" id="top-badge-date">${new Date().toLocaleDateString('en-IN', {weekday:'short',day:'numeric',month:'short',year:'numeric'})}</span>
        </header>
        <div id="content" style="padding:28px;"></div>
      </main>
    </div>
    <div id="toast-container"></div>`;

  // Register mobile sidebar toggling
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('open')) {
        if (!e.target.closest('#sidebar') && !e.target.closest('#sidebar-toggle')) {
          sidebar.classList.remove('open');
        }
      }
    });
  }
}

// ── Dashboard ──────────────────────────────────────────────
function renderDashboard() {
  const el = document.getElementById('content');
  if (!el) return;

  const batches   = DB.Batches.all();
  const master    = DB.Master.all();
  const sales     = DB.Sales.all();
  const losses    = DB.LossTracker.all();
  const rejected  = DB.RejectionTracker.all();
  const rechecks  = DB.RecheckTracker.all();

  const active    = batches.filter(b => b.status === 'active').length;
  const completed = batches.filter(b => b.status === 'completed').length;
  const rejectedCount = batches.filter(b => b.status === 'rejected').length;
  const totalLoss = losses.reduce((s, l) => s + (l.lossQty || 0), 0);
  const storeInv  = DB.StoreInventory.allParts();
  const totalStock = storeInv.reduce((s, p) => s + (p.available || 0), 0);

  // Monthly stats
  const thisMonth = new Date().toISOString().slice(0,7);
  const salesThisMonth = sales.filter(s => (s.saleDate||'').startsWith(thisMonth)).reduce((s,r)=>s+(r.qty||0),0);

  // Production plan & schedule metrics
  const monthlyPlans = DB.MonthlyPlans.all().filter(p => p.month === thisMonth);
  const planQtyThisMonth = monthlyPlans.reduce((s, p) => s + (p.qty || 0), 0);
  const scheduledQtyThisMonth = DB.ProductionSchedules.all().filter(s => s.month === thisMonth).reduce((s, sch) => s + (sch.qty || 0), 0);
  const producedQtyThisMonth = batches.filter(b => {
    const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
    return bd === thisMonth;
  }).reduce((s, b) => s + (b.initialQty || 0), 0);

  // Active WIP rechecks
  const activeRechecks = rechecks.filter(r => {
    const b = DB.Batches.find(r.batchId);
    return b && b.status === 'active';
  }).length;

  // Critical replenishments (stock < 30% of target level)
  let criticalCount = 0;
  const STAGES = ['production', 'cryogenic', 'deflashing', 'trimming', 'post-curing', 'waiting-visual', 'visual', 'gauge', 'quality'];
  
  function getStageLossRate(partId, stage) {
    const stageRecords = DB.StageRecords.all().filter(r => {
      const b = DB.Batches.find(r.batchId);
      return b && b.partId === partId && r.stage === stage;
    });
    if (stageRecords.length === 0) {
      const generalRecords = DB.StageRecords.all().filter(r => r.stage === stage);
      if (generalRecords.length === 0) return 0.05;
      const totalIn = generalRecords.reduce((s, r) => s + (r.inputQty || 0), 0);
      const totalLoss = generalRecords.reduce((s, r) => s + (r.lossQty || 0), 0);
      return totalIn > 0 ? (totalLoss / totalIn) : 0.05;
    }
    const totalIn = stageRecords.reduce((s, r) => s + (r.inputQty || 0), 0);
    const totalLoss = stageRecords.reduce((s, r) => s + (r.lossQty || 0), 0);
    return totalIn > 0 ? (totalLoss / totalIn) : 0.0;
  }

  function getWIPQty(partId, stage) {
    const activeBatches = DB.Batches.all().filter(b => b.partId === partId && b.currentStage === stage && b.status === 'active');
    const stageRecords = DB.StageRecords.all();
    return activeBatches.reduce((sum, b) => {
      const incoming = stageRecords.filter(r => r.batchId === b.id && r.movedTo === stage);
      if (incoming.length) {
        return sum + (incoming[incoming.length - 1].outputQty || 0);
      }
      return sum + (b.initialQty || 0);
    }, 0);
  }

  master.forEach(p => {
    const target = p.averageTargetInventory || 0;
    if (target <= 0) return;
    const storeStock = DB.StoreInventory.availableByJmref(p.jmrefNo);
    
    let wipYield = 0;
    const lossRates = STAGES.map(stage => getStageLossRate(p.id, stage));
    const wipCounts = STAGES.map(stage => getWIPQty(p.id, stage));

    for (let i = 0; i < STAGES.length; i++) {
      const wip = wipCounts[i];
      if (wip <= 0) continue;

      let survivalRate = 1.0;
      for (let j = i; j < STAGES.length; j++) {
        survivalRate *= (1.0 - lossRates[j]);
      }
      wipYield += Math.round(wip * survivalRate);
    }

    const netAvailable = storeStock + wipYield;
    if (netAvailable / target <= 0.3) {
      criticalCount++;
    }
  });

  // Stage pipeline
  const STAGE_ICONS = { production:'🏭', cryogenic:'❄️', deflashing:'🔧', trimming:'✂️', 'post-curing':'🔥', 'waiting-visual':'⏳', visual:'👁️', gauge:'📏', quality:'⭐', store:'🏪' };
  const STAGE_NAMES = { production:'Production', cryogenic:'Cryogenic', deflashing:'DE Flashing', trimming:'Trimming', 'post-curing':'Post Curing', 'waiting-visual':'Waiting for Visual', visual:'Visual', gauge:'Gauge', quality:'QC Final', store:'Store' };

  const pipelineHtml = STAGES.map(stage => {
    const count = batches.filter(b => b.currentStage === stage && b.status === 'active').length;
    return `
      <div class="stat-card ${stage==='quality'?'red':stage==='store'?'green':stage==='production'?'purple':'blue'}" style="cursor:pointer;" onclick="App.navigate('${stage}')">
        <div style="font-size:22px;margin-bottom:8px;">${STAGE_ICONS[stage]}</div>
        <div class="stat-label">${STAGE_NAMES[stage]}</div>
        <div class="stat-value ${stage==='quality'?'red':stage==='store'?'green':stage==='production'?'purple':'blue'}">${count}</div>
        <div class="stat-sub">active batches</div>
      </div>`;
  }).join('');

  // Recent batches
  const recentBatches = [...batches].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,8);

  el.innerHTML = `
    <div class="animate-in">
      <!-- Welcome -->
      <div style="margin-bottom:28px;">
        <h2 style="font-size:22px;font-weight:800;">Good ${getGreeting()}, ${Auth.getSession()?.name?.split(' ')[0]} 👋</h2>
        <p class="text-sm text-muted mt-1">Here's your JMPL inventory overview for today</p>
      </div>

      <!-- Top Stats Row 1: Production & Execution -->
      <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--accent-blue);">🏭 Production &amp; Execution</h3>
      <div class="dashboard-stats-grid-6">
        <div class="stat-card blue" style="cursor:pointer;" onclick="App.navigate('report_aging')">
          <div style="font-size:22px;margin-bottom:8px;">🔄</div>
          <div class="stat-label">Active Batches</div>
          <div class="stat-value blue" style="font-size:22px;">${formatNum(active)}</div>
          <div class="stat-sub">batches in pipeline</div>
        </div>
        <div class="stat-card purple">
          <div style="font-size:22px;margin-bottom:8px;">🎯</div>
          <div class="stat-label">Planned Target</div>
          <div class="stat-value purple" style="font-size:22px;">${formatNum(planQtyThisMonth)}</div>
          <div class="stat-sub">monthly plan target</div>
        </div>
        <div class="stat-card teal">
          <div style="font-size:22px;margin-bottom:8px;">🗓️</div>
          <div class="stat-label">Production Schedule</div>
          <div class="stat-value teal" style="font-size:22px;">${formatNum(scheduledQtyThisMonth)}</div>
          <div class="stat-sub">scheduled target</div>
        </div>
        <div class="stat-card green">
          <div style="font-size:22px;margin-bottom:8px;">🏗️</div>
          <div class="stat-label">Actual Produced</div>
          <div class="stat-value green" style="font-size:22px;">${formatNum(producedQtyThisMonth)}</div>
          <div class="stat-sub">launched this month</div>
        </div>
        <div class="stat-card amber">
          <div style="font-size:22px;margin-bottom:8px;">🔁</div>
          <div class="stat-label">Rechecks Active</div>
          <div class="stat-value amber" style="font-size:22px;">${formatNum(activeRechecks)}</div>
          <div class="stat-sub">batches undergoing rework</div>
        </div>
        <div class="stat-card purple">
          <div style="font-size:22px;margin-bottom:8px;">🚫</div>
          <div class="stat-label">Rejected Batches</div>
          <div class="stat-value purple" style="font-size:22px;">${formatNum(rejectedCount)}</div>
          <div class="stat-sub">scrapped production batches</div>
        </div>
      </div>

      <!-- Top Stats Row 2: Inventory, Sales & Health -->
      <h3 style="font-size:14px;font-weight:700;margin-top:20px;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--accent-teal);">📦 Stocks, Sales &amp; Health</h3>
      <div class="dashboard-stats-grid-6">
        <div class="stat-card green">
          <div style="font-size:22px;margin-bottom:8px;">📦</div>
          <div class="stat-label">Total Store Stock</div>
          <div class="stat-value green" style="font-size:22px;">${formatNum(totalStock)}</div>
          <div class="stat-sub">units in store</div>
        </div>
        <div class="stat-card teal">
          <div style="font-size:22px;margin-bottom:8px;">🗂️</div>
          <div class="stat-label">Parts in Master</div>
          <div class="stat-value teal" style="font-size:22px;">${formatNum(master.length)}</div>
          <div class="stat-sub">registered products</div>
        </div>
        <div class="stat-card amber">
          <div style="font-size:22px;margin-bottom:8px;">💰</div>
          <div class="stat-label">Sales This Month</div>
          <div class="stat-value amber" style="font-size:22px;">${formatNum(salesThisMonth)}</div>
          <div class="stat-sub">units sold this month</div>
        </div>
        <div class="stat-card red">
          <div style="font-size:22px;margin-bottom:8px;">📉</div>
          <div class="stat-label">Total Loss</div>
          <div class="stat-value red" style="font-size:22px;">${formatNum(totalLoss)}</div>
          <div class="stat-sub">loss across all stages</div>
        </div>
        <div class="stat-card red">
          <div style="font-size:22px;margin-bottom:8px;">🚨</div>
          <div class="stat-label">Critical Alerts</div>
          <div class="stat-value red" style="font-size:22px;">${formatNum(criticalCount)}</div>
          <div class="stat-sub">replenish priority</div>
        </div>
        <div class="stat-card blue">
          <div style="font-size:22px;margin-bottom:8px;">✅</div>
          <div class="stat-label">Completed Batches</div>
          <div class="stat-value blue" style="font-size:22px;">${formatNum(completed)}</div>
          <div class="stat-sub">total batches completed</div>
        </div>
      </div>

      <!-- Stage Pipeline -->
      <div style="margin-bottom:28px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">📊 Stage Pipeline — Active Batches</h3>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));">
          ${pipelineHtml}
        </div>
      </div>

      <!-- Dashboard Grid -->
      <div class="dashboard-grid">
        <!-- Recent Batches -->
        <div class="card">
          <div class="card-header">
            <h3>🗂️ Recent Batches</h3>
            <button class="btn btn-ghost btn-sm" onclick="App.navigate('production')">View All →</button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Batch No</th><th>JMREF</th><th>Stage</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                ${recentBatches.length ? recentBatches.map(b => `
                  <tr>
                    <td class="font-semibold text-blue">${b.batchNo}</td>
                    <td>${b.jmrefNo || '—'}</td>
                    <td><span class="stage-chip ${b.currentStage}">${STAGE_NAMES[b.currentStage]||b.currentStage}</span></td>
                    <td><span class="badge badge-${b.status==='active'?'amber':b.status==='completed'?'green':'red'}"><span class="status-dot ${b.status}"></span>${b.status}</span></td>
                    <td class="text-sm text-muted">${(b.createdAt||'').slice(0,10)}</td>
                  </tr>`).join('') : '<tr><td colspan="5" class="text-center text-muted" style="padding:24px;">No batches yet. Create your first batch in Production.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Inventory Snapshot -->
        <div class="card">
          <div class="card-header">
            <h3>📦 Store Inventory</h3>
            <button class="btn btn-ghost btn-sm" onclick="App.navigate('store')">Manage →</button>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>JMREF</th><th>Part No</th><th>Available</th></tr></thead>
              <tbody>
                ${storeInv.length ? storeInv.slice(0,10).map(p => `
                  <tr>
                    <td class="font-semibold">${p.jmrefNo}</td>
                    <td class="text-muted">${p.partNo}</td>
                    <td><span class="font-bold ${p.available===0?'text-danger':p.available<10?'text-amber':'text-success'}">${formatNum(p.available)}</span></td>
                  </tr>`).join('') : '<tr><td colspan="3" class="text-center text-muted" style="padding:24px;">No inventory yet</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

// ── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
