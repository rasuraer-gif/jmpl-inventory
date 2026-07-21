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

  const part = DB.Master.find(batch.partId) || DB.Master.all().find(p => p.partNo === batch.partNo || p.jmrefNo === batch.jmrefNo) || {};
  let mouldType = '—';
  let processFlow = '—';
  if (batch.mouldNo && part.moulds) {
    const m = part.moulds.find(x => x.mouldNo === Number(batch.mouldNo));
    if (m) {
      mouldType = m.mouldType || '—';
      processFlow = m.processFlow || '—';
    }
  }

  printWindow.document.write(`
    <html>
    <head>
      <title>Print Label - ${batch.batchNo}</title>
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
          font-size: 17px;
          font-weight: 900;
          letter-spacing: 0.5px;
          border-bottom: 3px solid #000;
          padding-bottom: 6px;
          width: 100%;
          text-align: center;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .qr-wrapper {
          margin: 12px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          width: 100%;
        }
        .batch-no-display {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
          border: 3px solid #000;
          padding: 6px 12px;
          border-radius: 4px;
          background: #f3f4f6;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: clip;
          max-width: 100%;
          box-sizing: border-box;
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
          <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px; white-space: nowrap; height: 180px; display: flex; align-items: center; justify-content: center; text-align: center; border-right: 1px dashed #000; padding-right: 8px;">
            ${processFlow}
          </div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(batch.batchNo)}" style="width: 200px; height: 200px; display: block;" onload="triggerPrint()" />
          <div style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px; white-space: nowrap; height: 180px; display: flex; align-items: center; justify-content: center; text-align: center; border-left: 1px dashed #000; padding-left: 8px;">
            IB: ${batch.internalBatchNo || '—'}
          </div>
        </div>
        <div class="batch-no-display">${batch.batchNo}</div>
        <div class="details">
          <div class="detail-row">
            <span class="label">JMREF:</span>
            <span class="value">${batch.jmrefNo}</span>
          </div>
          <div class="detail-row">
            <span class="label">Part No:</span>
            <span class="value">${batch.partNo || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Prod Date:</span>
            <span class="value">${formattedDate}</span>
          </div>
          <div class="detail-row">
            <span class="label">Mould No:</span>
            <span class="value">${batch.mouldNo != null ? batch.mouldNo : '—'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Mould Type:</span>
            <span class="value">${mouldType}</span>
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
  { id:'master',     label:'Inventory Master',    icon:'📋', module:'master',    section:'main', perm:'master' },
  { id:'mould-tracking', label:'Mould Tracking',   icon:'🛠️', module:'mould-tracking', section:'main', perm:'mould-tracking' },
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
  { id:'rpt-pending-batches', label:'Pending Batches', icon:'⏳', module:'report_pending_batches', section:'tools', parent:'reports', perm:'report_inventory' },
  { id:'rpt-reprocess', label:'Reprocessed Items', icon:'🔄', module:'report_reprocess', section:'tools', parent:'reports', perm:'report_reprocess' },
  { id:'rpt-qty-gain',  label:'Qty Gain Report',   icon:'📈', module:'report_qty_gain',  section:'tools', parent:'reports', perm:'report_inventory' },
  { id:'rpt-qty-loss',  label:'Qty Loss Report',   icon:'📉', module:'report_qty_loss',  section:'tools', parent:'reports', perm:'report_inventory' },
  { id:'rpt-op-efficiency', label:'Operator & Inspector Efficiency', icon:'👷', module:'report_op_efficiency', section:'tools', parent:'reports', perm:'report_production' },
  { id:'rpt-mould-lifecycle', label:'Mould Lifecycle & Performance', icon:'⚙️', module:'report_mould_lifecycle', section:'tools', parent:'reports', perm:'mould-tracking' },
  { id:'rpt-cycle-time', label:'Production Cycle Time & Bottlenecks', icon:'⏳', module:'report_cycle_time', section:'tools', parent:'reports', perm:'report_production' },
  { id:'rpt-wip-valuation', label:'WIP Inventory Valuation', icon:'💰', module:'report_wip_valuation', section:'tools', parent:'reports', perm:'report_inventory' },
  { id:'rpt-sub-vs-inhouse', label:'Subcontractor vs. In-House Comparison', icon:'🏢', module:'report_sub_vs_inhouse', section:'tools', parent:'reports', perm:'report_production' },

  { id:'print-batch',  label:'Print Label',        icon:'🖨️', module:'print-batch',  section:'tools' },
  { id:'ai-agent',   label:'AI Assistant',        icon:'🤖', module:'ai-agent',  section:'tools', perm:'ai-agent' },
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
    'mould-tracking': () => MouldTrackingModule?.render(),
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
    report_pending_batches: () => ReportsModule?.render('pending-batches'),
    report_reprocess:  () => ReportsModule?.render('reprocess'),
    report_qty_gain:   () => ReportsModule?.render('qty-gain'),
    report_qty_loss:   () => ReportsModule?.render('qty-loss'),
    report_op_efficiency:  () => ReportsModule?.render('op-efficiency'),
    report_mould_lifecycle:() => ReportsModule?.render('mould-lifecycle'),
    report_cycle_time:     () => ReportsModule?.render('cycle-time'),
    report_wip_valuation:  () => ReportsModule?.render('wip-valuation'),
    report_sub_vs_inhouse: () => ReportsModule?.render('sub-vs-inhouse'),
    'print-batch':     () => PrintBatchModule?.render(),
  };

  const PAGE_TITLES = {
    dashboard:'Dashboard', master:'Inventory Master', 'mould-tracking':'Mould Tracking', production:'Production',
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
    report_pending_batches:'Pending Batch Report',
    report_reprocess:'Reprocessed Items Report',
    report_qty_gain:'Quantity Gain Report',
    report_qty_loss:'Quality Loss Report',
    report_op_efficiency:  'Operator & Inspector Efficiency',
    report_mould_lifecycle:'Mould Lifecycle & Performance',
    report_cycle_time:     'Production Cycle Time & Bottlenecks',
    report_wip_valuation:  'WIP Inventory Valuation',
    report_sub_vs_inhouse: 'Subcontractor vs. In-House Comparison',
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
    if (topTitle) {
      topTitle.textContent = PAGE_TITLES[moduleId] || moduleId;
      if (localStorage.getItem('jmpl_db_is_local_backup') === 'true') {
        const badge = document.createElement('span');
        badge.className = 'badge badge-amber animate-pulse';
        badge.style.cssText = 'margin-left: 12px; font-size: 11px; padding: 4px 8px; border: 1px solid rgba(245, 158, 11, 0.4); display: inline-flex; align-items: center; gap: 4px; border-radius: 4px; vertical-align: middle;';
        badge.innerHTML = '⚠️ LOCAL BACKUP MODE (READ-ONLY)';
        topTitle.appendChild(badge);
      }
    }

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
    setupInternalBatchNoObserver();

    // Configure sync status badge listener
    DB.onSyncStateChange((table, hasPendingWrites) => {
      updateTableSyncState(table, hasPendingWrites);
    });

    window.addEventListener('online', triggerSyncStatusUpdate);
    window.addEventListener('offline', triggerSyncStatusUpdate);
    triggerSyncStatusUpdate(); // initial call

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

  function openChangePasswordModal() {
    document.getElementById('change-pwd-current').value = '';
    document.getElementById('change-pwd-new').value = '';
    document.getElementById('change-pwd-confirm').value = '';
    document.getElementById('change-pwd-modal').classList.remove('hidden');
  }

  function changePassword() {
    const session = Auth.getSession();
    if (!session) return;
    const user = DB.Users.find(session.userId);
    if (!user) return;
    
    const currentPwd = document.getElementById('change-pwd-current').value;
    const newPwd = document.getElementById('change-pwd-new').value;
    const confirmPwd = document.getElementById('change-pwd-confirm').value;
    
    if (user.password !== currentPwd) {
      showToast('Current password is incorrect', 'error');
      return;
    }
    if (!newPwd) {
      showToast('New password cannot be empty', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      showToast('New passwords do not match', 'error');
      return;
    }
    
    DB.Users.update(user.id, { password: newPwd });
    showToast('Password updated successfully', 'success');
    document.getElementById('change-pwd-modal').classList.add('hidden');
  }

  let observer = null;
  function setupInternalBatchNoObserver() {
    if (observer) {
      observer.disconnect();
    }

    function applyTags(rootNode = document.body) {
      if (typeof DB === 'undefined' || !DB.Batches) return;
      const batches = DB.Batches.all();
      if (!batches || !batches.length) return;
      
      const batchMap = new Map();
      batches.forEach(b => {
        if (b.batchNo && b.internalBatchNo) {
          batchMap.set(b.batchNo.trim(), b.internalBatchNo);
        }
      });

      if (!batchMap.size) return;

      const sortedBatchNos = [...batchMap.keys()].sort((a,b) => b.length - a.length);
      const escaped = sortedBatchNos.map(no => no.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
      const regex = new RegExp(`(?<!\\(IB: \\d+\\)\\s*)(?:\\b|(?<=\\s|^))(${escaped.join('|')})(?:\\b|(?=\\s|$))(?!\\s*\\(IB: \\d+\\))`, 'g');

      const walker = document.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentNode;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName.toUpperCase();
            if (['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE'].includes(tag)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      let node;
      const nodesToUpdate = [];
      while (node = walker.nextNode()) {
        const val = node.nodeValue;
        if (val && regex.test(val)) {
          nodesToUpdate.push(node);
        }
      }

      if (observer) observer.disconnect();

      nodesToUpdate.forEach(n => {
        const parent = n.parentNode;
        if (!parent) return;
        const val = n.nodeValue;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        val.replace(regex, (match, p1, offset) => {
          if (offset > lastIndex) {
            fragment.appendChild(document.createTextNode(val.substring(lastIndex, offset)));
          }

          const ib = batchMap.get(match.trim());
          const span = document.createElement('span');
          span.className = 'clickable-batch';
          span.style.color = 'var(--accent-blue)';
          span.style.cursor = 'pointer';
          span.style.fontWeight = '600';
          span.style.textDecoration = 'underline';
          span.setAttribute('onclick', `App.showBatchGenealogy('${match.trim()}')`);
          span.textContent = `${match} (IB: ${ib})`;
          fragment.appendChild(span);

          lastIndex = offset + match.length;
          return match;
        });

        if (lastIndex < val.length) {
          fragment.appendChild(document.createTextNode(val.substring(lastIndex)));
        }

        parent.replaceChild(fragment, n);
      });

      if (observer) {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    }

    observer = new MutationObserver((mutations) => {
      applyTags();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    applyTags();
  }

  let pendingSyncCollections = new Set();
  function updateTableSyncState(table, hasPendingWrites) {
    if (hasPendingWrites) {
      pendingSyncCollections.add(table);
    } else {
      pendingSyncCollections.delete(table);
    }
    triggerSyncStatusUpdate();
  }

  function triggerSyncStatusUpdate() {
    const dot = document.getElementById('sync-status-dot');
    const text = document.getElementById('sync-status-text');
    if (!dot || !text) return;

    if (!navigator.onLine) {
      dot.style.background = '#ef4444'; // Red
      text.innerText = 'DISCONNECTED';
      text.style.color = '#ef4444';
    } else if (pendingSyncCollections.size > 0) {
      dot.style.background = '#f59e0b'; // Amber
      text.innerText = 'SYNCING...';
      text.style.color = '#f59e0b';
    } else {
      dot.style.background = '#10b981'; // Green
      text.innerText = 'SYNCED';
      text.style.color = '#10b981';
    }
  }

  function runQuickScan() {
    if (typeof Scanner === 'undefined') {
      showToast('Scanner module not loaded', 'error');
      return;
    }
    Scanner.start(null, (scannedText) => {
      routeScannedBatch(scannedText);
    });
  }

  function routeScannedBatch(batchNo) {
    if (!batchNo) return;
    const batch = DB.Batches.all().find(b => (b.batchNo || '').trim() === batchNo.trim());
    if (!batch) {
      showToast(`Batch "${batchNo}" not found in system`, 'error');
      return;
    }

    if (batch.status === 'completed') {
      showToast(`Batch "${batchNo}" is completed and stored in Store`, 'success');
      navigate('store');
      return;
    }

    if (batch.status === 'rejected') {
      showToast(`Batch "${batchNo}" is rejected`, 'error');
      return;
    }

    navigate(batch.currentStage);

    setTimeout(() => {
      const inputQty = getBatchCurrentQty(batch.id);
      
      switch (batch.currentStage) {
        case 'production':
          if (window.ProductionModule && typeof ProductionModule.openMove === 'function') {
            ProductionModule.openMove(batch.id);
          }
          break;
        case 'cryogenic':
          if (window.CryogenicModule && typeof CryogenicModule.openProcess === 'function') {
            CryogenicModule.openProcess(batch.id, inputQty);
          }
          break;
        case 'deflashing':
          if (window.DeflashingModule && typeof DeflashingModule.openProcess === 'function') {
            DeflashingModule.openProcess(batch.id, inputQty);
          }
          break;
        case 'trimming':
          if (window.TrimmingModule && typeof TrimmingModule.openProcess === 'function') {
            TrimmingModule.openProcess(batch.id, inputQty);
          }
          break;
        case 'post-curing':
          if (window.PostCuringModule && typeof PostCuringModule.openProcess === 'function') {
            PostCuringModule.openProcess(batch.id, inputQty);
          }
          break;
        case 'waiting-visual':
          if (window.WaitingVisualModule && typeof WaitingVisualModule.openProcess === 'function') {
            WaitingVisualModule.openProcess(batch.id, inputQty);
          }
          break;
        case 'visual':
          if (window.VisualModule && typeof VisualModule.openProcess === 'function') {
            VisualModule.openProcess(batch.id, inputQty);
          }
          break;
        case 'gauge':
          if (window.GaugeModule && typeof GaugeModule.openProcess === 'function') {
            GaugeModule.openProcess(batch.id, inputQty);
          }
          break;
        case 'quality':
          if (window.QualityModule && typeof QualityModule.openPass === 'function') {
            QualityModule.openPass(batch.id, inputQty);
          }
          break;
        default:
          showToast(`No routing action defined for stage: ${batch.currentStage}`, 'warning');
      }
    }, 200);
  }

  function getBatchCurrentQty(batchId) {
    const batch = DB.Batches.find(batchId);
    if (!batch) return 0;
    const recs = DB.StageRecords.all().filter(r => r.batchId === batchId);
    if (!recs.length) return batch.initialQty || 0;
    
    recs.sort((a,b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    
    const stage = batch.currentStage;
    const stageRecs = recs.filter(r => r.movedTo === stage);
    if (!stageRecs.length) return batch.initialQty || 0;
    
    const lastStageRec = stageRecs[stageRecs.length - 1];
    const qty = Number(lastStageRec.isRecheck ? lastStageRec.recheckQty : lastStageRec.outputQty);
    return !isNaN(qty) ? qty : (batch.initialQty || 0);
  }

  function getParentBatch(b) {
    if (!b || !b.notes) return null;
    const regexes = [
      /pool batch:\s*([^\s\.]+)/i,
      /created from batch\s*([^\s\.]+)/i,
      /stock upload batch\s*([^\s\.]+)/i
    ];
    for (const regex of regexes) {
      const match = b.notes.match(regex);
      if (match) {
        const parentNo = match[1].trim();
        const parent = DB.Batches.all().find(x => x.batchNo === parentNo);
        if (parent) return parent;
      }
    }
    return null;
  }

  function getChildBatches(parent) {
    return DB.Batches.all().filter(b => {
      const p = getParentBatch(b);
      return p && p.id === parent.id;
    });
  }

  function showBatchGenealogy(batchIdOrNo) {
    let b = DB.Batches.find(batchIdOrNo);
    if (!b) {
      b = DB.Batches.all().find(x => x.batchNo === batchIdOrNo || x.batchNo === batchIdOrNo.split(' ')[0]);
    }
    if (!b) return;

    let modal = document.getElementById('genealogy-modal-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-overlay hidden';
      modal.id = 'genealogy-modal-overlay';
      modal.style.zIndex = '1500';
      document.body.appendChild(modal);
    }

    const parent = getParentBatch(b);
    const children = getChildBatches(b);

    let lineageHtml = '';
    if (!parent && !children.length) {
      lineageHtml = `<p class="text-sm text-muted">No lineage tracing available (this batch was not split or reprocessed).</p>`;
    } else {
      lineageHtml += `<div class="genealogy-tree" style="background:var(--bg-input); padding:16px; border-radius:12px; border:1px solid var(--border);">`;
      
      if (parent) {
        lineageHtml += `
          <div class="tree-node parent" style="margin-bottom:12px;">
            <span style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Parent Batch</span>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
              <span style="font-size:16px;">🌳</span>
              <button class="btn btn-ghost btn-xs text-blue" onclick="App.showBatchGenealogy('${parent.id}')" style="font-weight:700;padding:2px 6px;">
                ${parent.batchNo} (IB: ${parent.internalBatchNo})
              </button>
              <span class="stage-chip ${parent.currentStage}">${parent.currentStage.toUpperCase()}</span>
            </div>
          </div>
          <div style="padding-left:12px; border-left:2px dashed var(--border); margin:4px 0 12px 10px; height:16px;"></div>
        `;
      }

      lineageHtml += `
        <div class="tree-node active-node" style="padding:8px 12px; background:var(--accent-blue-light); border-left:4px solid var(--accent-blue); border-radius:4px;">
          <span style="font-size:11px;color:var(--accent-blue);font-weight:700;text-transform:uppercase;">Current Batch</span>
          <div style="font-weight:700;margin-top:2px;">${b.batchNo} (IB: ${b.internalBatchNo})</div>
          <div class="text-sm text-muted">Qty: ${formatNum(b.initialQty)} | Stage: ${b.currentStage.toUpperCase()} | Status: ${b.status}</div>
        </div>
      `;

      if (children.length) {
        lineageHtml += `
          <div style="padding-left:12px; border-left:2px dashed var(--border); margin:4px 0 4px 10px; height:16px;"></div>
          <div class="tree-node children" style="margin-top:8px; padding-left:12px;">
            <span style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Split Sub-Batches / Reprocessed</span>
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:6px;">
              ${children.map(child => `
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:14px;">🌱</span>
                  <button class="btn btn-ghost btn-xs text-blue" onclick="App.showBatchGenealogy('${child.id}')" style="font-weight:600;padding:2px 6px;">
                    ${child.batchNo} (IB: ${child.internalBatchNo})
                  </button>
                  <span class="text-sm text-muted">Qty: ${formatNum(child.initialQty)}</span>
                  <span class="stage-chip ${child.currentStage}">${child.currentStage.toUpperCase()}</span>
                  <span class="badge badge-${child.status==='active'?'amber':child.status==='completed'?'green':'red'}">${child.status}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      lineageHtml += `</div>`;
    }

    const operator = b.operatorId ? DB.Operators.find(b.operatorId) : null;
    const subcontractor = b.subcontractorId ? DB.Subcontractors.find(b.subcontractorId) : null;
    const operatorName = operator ? operator.name : (b.operatorName || '—');
    const subcontractorName = subcontractor ? subcontractor.name : '—';

    modal.innerHTML = `
      <div class="modal modal-md" style="max-width: 600px; border-radius:16px;">
        <div class="modal-header">
          <h3>🔍 Batch Genealogy & Details</h3>
          <button class="modal-close" onclick="document.getElementById('genealogy-modal-overlay').classList.add('hidden')">&#x2715;</button>
        </div>
        <div class="modal-body" style="padding:20px; max-height:80vh; overflow-y:auto;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
            <div>
              <span class="text-xs text-muted" style="text-transform:uppercase;font-weight:600;">Batch Number</span>
              <div style="font-weight:700;font-size:16px;color:var(--primary);">${b.batchNo}</div>
            </div>
            <div>
              <span class="text-xs text-muted" style="text-transform:uppercase;font-weight:600;">Internal Batch No</span>
              <div style="font-weight:700;font-size:16px;color:var(--accent-teal);">IB: ${b.internalBatchNo}</div>
            </div>
            <div>
              <span class="text-xs text-muted" style="text-transform:uppercase;font-weight:600;">Part Number / JMREF</span>
              <div>${b.partNo || '—'} / <span class="badge badge-teal">${b.jmrefNo || '—'}</span></div>
            </div>
            <div>
              <span class="text-xs text-muted" style="text-transform:uppercase;font-weight:600;">Description</span>
              <div>${b.description || '—'}</div>
            </div>
            <div>
              <span class="text-xs text-muted" style="text-transform:uppercase;font-weight:600;">Current Stage / Status</span>
              <div><span class="stage-chip ${b.currentStage}">${b.currentStage.toUpperCase()}</span> / <span class="badge badge-${b.status==='active'?'amber':b.status==='completed'?'green':'red'}">${b.status}</span></div>
            </div>
            <div>
              <span class="text-xs text-muted" style="text-transform:uppercase;font-weight:600;">Quantity</span>
              <div class="font-semibold">${formatNum(b.initialQty)} units</div>
            </div>
            <div>
              <span class="text-xs text-muted" style="text-transform:uppercase;font-weight:600;">Operator / Subcontractor</span>
              <div>${operatorName} ${subcontractorName !== '—' ? `(Sub: ${subcontractorName})` : ''}</div>
            </div>
            <div>
              <span class="text-xs text-muted" style="text-transform:uppercase;font-weight:600;">Created / Completed</span>
              <div class="text-sm text-muted">${(b.createdAt || '').slice(0,16).replace('T', ' ')} ${b.completedAt ? `/ ${(b.completedAt || '').slice(0,16).replace('T', ' ')}` : ''}</div>
            </div>
          </div>

          <div style="border-top:1px solid var(--border); margin-bottom:20px; padding-top:16px;">
            <h4 style="font-size:14px; font-weight:700; margin-bottom:12px;">🌳 Family Lineage Tree</h4>
            ${lineageHtml}
          </div>

          <div style="border-top:1px solid var(--border); padding-top:16px;">
            <h4 style="font-size:14px; font-weight:700; margin-bottom:12px;">⏳ Stage History Records</h4>
            <div class="table-wrap">
              <table class="data-table" style="font-size:12px;">
                <thead>
                  <tr><th>Stage</th><th>Input</th><th>Output</th><th>Loss</th><th>Date</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  ${DB.StageRecords.all().filter(r => r.batchId === b.id).sort((x,y) => (x.createdAt||'').localeCompare(y.createdAt||'')).map(r => `
                    <tr>
                      <td class="font-semibold">${r.stage.toUpperCase()}</td>
                      <td>${formatNum(r.inputQty)}</td>
                      <td>${formatNum(r.outputQty)}</td>
                      <td class="text-danger">${formatNum(r.lossQty)}</td>
                      <td>${r.date}</td>
                      <td class="text-muted" style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.notes||''}">${r.notes || '—'}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="6" class="text-center text-muted">No stage history recorded</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('genealogy-modal-overlay').classList.add('hidden')">Close</button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  return { navigate, init, toggleReportsMenu, openChangePasswordModal, changePassword, runQuickScan, showBatchGenealogy, get current() { return currentModule; } };
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
              <div style="display:flex;align-items:center;gap:4px;margin-top:2px;">
                <span id="sync-status-dot" style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;transition:background 0.3s ease;"></span>
                <span id="sync-status-text" style="font-size:10px;color:#10b981;font-weight:700;letter-spacing:0.3px;transition:color 0.3s ease;">SYNCED</span>
              </div>
            </div>
          </div>
          <button class="btn btn-teal btn-xs mt-3 w-full" onclick="App.runQuickScan()" style="display:flex;align-items:center;justify-content:center;gap:4px;font-weight:700;padding:6px 12px;border-radius:8px;">⚡ Quick Scan</button>
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
          <div class="flex flex-col gap-2 mt-3 w-full">
            <button class="btn btn-ghost w-full btn-sm" style="text-align: left; padding: 6px 12px; font-size: 13px;" onclick="App.openChangePasswordModal()">🔑 Change Password</button>
            <button class="btn btn-ghost w-full btn-sm" style="text-align: left; padding: 6px 12px; font-size: 13px; color: var(--accent-red);" onclick="Auth.logout()">🚪 Sign Out</button>
          </div>
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

    <div class="modal-overlay hidden" id="change-pwd-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>🔑 Change Password</h3>
          <button class="modal-close" onclick="document.getElementById('change-pwd-modal').classList.add('hidden')">&#x2715;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Current Password <span class="required">*</span></label>
            <input type="password" id="change-pwd-current" class="form-control" placeholder="Current password">
          </div>
          <div class="form-group">
            <label class="form-label">New Password <span class="required">*</span></label>
            <input type="password" id="change-pwd-new" class="form-control" placeholder="New password">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm New Password <span class="required">*</span></label>
            <input type="password" id="change-pwd-confirm" class="form-control" placeholder="Confirm new password">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="document.getElementById('change-pwd-modal').classList.add('hidden')">Cancel</button>
          <button class="btn btn-primary" onclick="App.changePassword()">Update Password</button>
        </div>
      </div>
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

  const stageRecordsThisMonth = DB.StageRecords.all().filter(r => {
    const recordMonth = (r.date || r.createdAt || '').slice(0, 7);
    return recordMonth === thisMonth;
  });

  const monthlyStageStatsHtml = STAGES.map(stage => {
    const recs = stageRecordsThisMonth.filter(r => r.stage === stage);
    const count = recs.length;
    const totalIn = recs.reduce((sum, r) => sum + (r.inputQty || 0), 0);
    const totalOut = recs.reduce((sum, r) => sum + (r.outputQty || 0), 0);
    const totalLoss = recs.reduce((sum, r) => sum + (r.lossQty || 0), 0);
    const lossPercent = totalIn > 0 ? ((totalLoss / totalIn) * 100).toFixed(1) + '%' : '0.0%';
    
    return `
      <tr>
        <td class="font-semibold"><span style="margin-right: 6px;">${STAGE_ICONS[stage] || '⚙️'}</span>${STAGE_NAMES[stage]}</td>
        <td style="text-align: right;" class="font-semibold">${formatNum(count)}</td>
        <td style="text-align: right; color: var(--text-secondary);">${formatNum(totalIn)}</td>
        <td style="text-align: right; color: var(--success); font-weight: 700;">${formatNum(totalOut)}</td>
        <td style="text-align: right; color: var(--danger); font-weight: 600;">${formatNum(totalLoss)}</td>
        <td style="text-align: right; font-weight: 600;" class="${totalLoss > 0 ? 'text-amber' : 'text-muted'}">${lossPercent}</td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="animate-in">
      <!-- Welcome Header with Left-Aligned Logo -->
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:28px;">
        <img src="./logo.png" alt="JMPL Logo" style="height: 64px; width: 64px; object-fit: contain; background: white; padding: 8px; border-radius: 12px; box-shadow: var(--shadow-sm); flex-shrink: 0;">
        <div>
          <h2 style="font-size:22px;font-weight:800;margin:0;">Good ${getGreeting()}, ${Auth.getSession()?.name?.split(' ')[0]} 👋</h2>
          <p class="text-sm text-muted mt-1" style="margin:0;">Here's your JMPL inventory overview for today</p>
        </div>
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
      <div class="dashboard-stats-grid-6" style="margin-bottom:28px;">
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

      <!-- Monthly Stage Production (Current Month) -->
      <div class="card" style="margin-bottom:28px;">
        <div class="card-header">
          <h3>📈 Monthly Production Summary by Stage (${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })})</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table" style="font-size: 13px;">
            <thead>
              <tr>
                <th>Stage</th>
                <th style="text-align: right;">Batches Processed</th>
                <th style="text-align: right;">Total Input Qty</th>
                <th style="text-align: right;">Total Completed/Passed Qty</th>
                <th style="text-align: right;">Total Loss Qty</th>
                <th style="text-align: right;">Avg. Loss %</th>
              </tr>
            </thead>
            <tbody>
              ${monthlyStageStatsHtml}
            </tbody>
          </table>
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
