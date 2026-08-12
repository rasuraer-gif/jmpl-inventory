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

const STAGE_LABELS = {
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
    const m = part.moulds.find(x => Number(x.mouldNo) === Number(batch.mouldNo));
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
          size: 40mm 60mm;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #fff;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 60mm;
          width: 40mm;
          box-sizing: border-box;
        }
        .label-container {
          width: 40mm;
          height: 60mm;
          padding: 1.5mm;
          border: 1.5px solid #000;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          overflow: hidden;
        }
        .company-title {
          font-size: 8px;
          font-weight: bold;
          letter-spacing: 0.2px;
          border-bottom: 1.5px solid #000;
          padding-bottom: 1.5px;
          width: 100%;
          text-align: center;
          text-transform: uppercase;
          white-space: nowrap;
          margin-bottom: 1px;
        }
        .qr-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 20mm;
          margin: 1mm 0;
        }
        .qr-image {
          width: 19mm;
          height: 19mm;
          display: block;
        }
        .flow-text-left {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          writing-mode: vertical-rl;
          font-size: 6.5px;
          font-weight: bold;
          text-transform: uppercase;
          color: #000;
          letter-spacing: 0.2px;
          white-space: nowrap;
          height: 18mm;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          border-right: 0.5px dashed #000;
          padding-right: 2px;
        }
        .flow-text-right {
          position: absolute;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          writing-mode: vertical-rl;
          font-size: 6.5px;
          font-weight: bold;
          text-transform: uppercase;
          color: #000;
          letter-spacing: 0.2px;
          white-space: nowrap;
          height: 18mm;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          border-left: 0.5px dashed #000;
          padding-left: 2px;
        }
        .batch-no-display {
          font-size: 7.5px;
          font-weight: bold;
          letter-spacing: 0.2px;
          margin-bottom: 1.5px;
          border: 1px solid #000;
          padding: 1px 3px;
          border-radius: 2px;
          background: #f3f4f6;
          text-align: center;
          white-space: nowrap;
          max-width: 100%;
          box-sizing: border-box;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .details {
          width: 100%;
          border-top: 1.5px solid #000;
          padding-top: 2px;
          font-size: 7px;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          line-height: 1.25;
          border-bottom: 0.5px dashed #ccc;
          padding-bottom: 0.5px;
          margin-bottom: 0.5px;
        }
        .detail-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
          margin-bottom: 0;
        }
        .label {
          font-weight: bold;
          text-transform: uppercase;
          font-size: 7px;
          color: #333;
        }
        .value {
          font-weight: bold;
          font-size: 7.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #000;
        }
      </style>
    </head>
    <body>
      <div class="label-container">
        <div class="company-title">JANANI MOULDINGS PVT. LTD.</div>
        <div class="qr-wrapper">
          <div class="flow-text-left">${processFlow}</div>
          <img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(batch.batchNo)}" onload="triggerPrint()" />
          <div class="flow-text-right">IB: ${batch.internalBatchNo || '—'}</div>
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

function bulkPrintBarcodes(ids) {
  if (!ids || !ids.length) {
    showToast('Please select at least one batch to print', 'warning');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=600,height=800');
  if (!printWindow) {
    showToast('Popup blocked! Please allow popups for printing.', 'warning');
    return;
  }

  const STAGE_LABELS = {
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

  let labelsHtml = '';
  ids.forEach((batchId, idx) => {
    const batch = DB.Batches.find(batchId);
    if (!batch) return;
    const formattedDate = batch.productionDate ? formatDate(batch.productionDate) : formatDate(batch.createdAt);
    const part = DB.Master.find(batch.partId) || DB.Master.all().find(p => p.partNo === batch.partNo || p.jmrefNo === batch.jmrefNo) || {};
    let mouldType = '—';
    let processFlow = '—';
    if (batch.mouldNo && part.moulds) {
      const m = part.moulds.find(x => Number(x.mouldNo) === Number(batch.mouldNo));
      if (m) {
        mouldType = m.mouldType || '—';
        processFlow = m.processFlow || '—';
      }
    }

    const detailRowsHtml = batch.isStockUpload ? `
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">JMREF:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${batch.jmrefNo || '—'}</span>
      </div>
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Part No:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${batch.partNo || '—'}</span>
      </div>
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Stage:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${STAGE_LABELS[batch.currentStage] || batch.currentStage} (Stock)</span>
      </div>
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Qty:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${Number(batch.initialQty).toLocaleString('en-IN')}</span>
      </div>
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Date:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${formattedDate}</span>
      </div>
    ` : `
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">JMREF:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${batch.jmrefNo || '—'}</span>
      </div>
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Part No:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${batch.partNo || '—'}</span>
      </div>
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Date:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${formattedDate}</span>
      </div>
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: 0.5px dashed #ccc; padding-bottom: 0.5px; margin-bottom: 0.5px;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Mould:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">M#${batch.mouldNo || '—'} (${mouldType})</span>
      </div>
      <div class="detail-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; line-height: 1.25; border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
        <span class="label" style="font-weight: bold; text-transform: uppercase; font-size: 7px; color: #333;">Mould Type:</span>
        <span class="value" style="font-weight: bold; font-size: 7.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000;">${mouldType}</span>
      </div>
    `;

    labelsHtml += `
      <div class="label-container" style="${idx > 0 ? 'page-break-before: always;' : ''} width: 40mm; height: 60mm; padding: 1.5mm; border: 1.5px solid #000; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; background: #fff; color: #000;">
        <div class="company-title" style="font-size: 8px; font-weight: bold; letter-spacing: 0.2px; border-bottom: 1.5px solid #000; padding-bottom: 1.5px; width: 100%; text-align: center; text-transform: uppercase; white-space: nowrap; margin-bottom: 1px;">JANANI MOULDINGS PVT. LTD.</div>
        <div class="qr-wrapper" style="position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 20mm; margin: 1mm 0;">
          <div class="flow-text-left" style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; font-size: 6.5px; font-weight: bold; text-transform: uppercase; color: #000; letter-spacing: 0.2px; white-space: nowrap; height: 18mm; display: flex; align-items: center; justify-content: center; text-align: center; border-right: 0.5px dashed #000; padding-right: 2px;">${processFlow}</div>
          <img class="qr-image" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(batch.batchNo)}" style="width: 19mm; height: 19mm; display: block;" />
          <div class="flow-text-right" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; font-size: 6.5px; font-weight: bold; text-transform: uppercase; color: #000; letter-spacing: 0.2px; white-space: nowrap; height: 18mm; display: flex; align-items: center; justify-content: center; text-align: center; border-left: 0.5px dashed #000; padding-left: 2px;">IB: ${batch.internalBatchNo || '—'}</div>
        </div>
        <div class="batch-no-display" style="font-size: 7.5px; font-weight: bold; letter-spacing: 0.2px; margin-bottom: 1.5px; border: 1px solid #000; padding: 1px 3px; border-radius: 2px; background: #f3f4f6; text-align: center; white-space: nowrap; max-width: 100%; box-sizing: border-box; overflow: hidden; text-overflow: ellipsis;">${batch.batchNo}</div>
        <div class="details" style="width: 100%; border-top: 1.5px solid #000; padding-top: 2px; font-size: 7px; display: flex; flex-direction: column; gap: 1px;">
          ${detailRowsHtml}
        </div>
      </div>
    `;
  });

  printWindow.document.write(`
    <html>
    <head>
      <title>Bulk Print Labels</title>
      <style>
        @page { size: 40mm 60mm; margin: 0; }
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      </style>
    </head>
    <body>
      ${labelsHtml}
      <script>
        let printed = false;
        function triggerPrint() {
          if (printed) return;
          printed = true;
          setTimeout(function() {
            window.print();
            window.close();
          }, 500);
        }
        window.onload = function() {
          setTimeout(triggerPrint, 2500);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
window.bulkPrintBarcodes = bulkPrintBarcodes;

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
  { id:'daily-analysis', label:'Daily Feasibility', icon:'📈', module:'daily-analysis', section:'tools', perm:'daily-analysis' },
  { id:'monthly-plan', label:'Monthly Plan',      icon:'📅', module:'monthly-plan',section:'tools', perm:'monthly-plan' },
  { id:'prod-sched',  label:'Production Schedule', icon:'📝', module:'prod-sched',  section:'tools', perm:'prod-sched' },
  { id:'replenishment',label:'Replenishment Planner',icon:'🎯', module:'replenishment',section:'tools', perm:'replenishment' },
  { id:'task-tracking',label:'Task Tracking',     icon:'📋', module:'task-tracking',section:'tools', perm:'task-tracking' },
  { id:'stock-audit',  label:'Monthly Stock Taking', icon:'📋', module:'stock-audit',  section:'tools', perm:'stock-audit' },
  { id:'reports',    label:'Reports',             icon:'📊', module:'reports',   section:'tools' },
  // Sub-reports
  { id:'rpt-inventory', label:'Inventory Report',  icon:'📦', module:'report_inventory', section:'tools', parent:'reports', perm:'report_inventory' },
  { id:'rpt-store-stock', label:'Store Stock Report', icon:'🏪', module:'report_store_stock', section:'tools', parent:'reports', perm:'report_store_stock' },
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
  { id:'rpt-slob',      label:'SLOB Report',       icon:'📉', module:'report_slob',      section:'tools', parent:'reports', perm:'report_slob' },
  { id:'rpt-aging',     label:'Aging WIP Report',  icon:'⏳', module:'report_aging',     section:'tools', parent:'reports', perm:'report_aging' },
  { id:'rpt-pending-batches', label:'Pending Batches', icon:'⏳', module:'report_pending_batches', section:'tools', parent:'reports', perm:'report_pending_batches' },
  { id:'rpt-reprocess', label:'Reprocessed Items', icon:'🔄', module:'report_reprocess', section:'tools', parent:'reports', perm:'report_reprocess' },
  { id:'rpt-qty-gain',  label:'Qty Gain Report',   icon:'📈', module:'report_qty_gain',  section:'tools', parent:'reports', perm:'report_qty_gain' },
  { id:'rpt-qty-loss',  label:'Qty Loss Report',   icon:'📉', module:'report_qty_loss',  section:'tools', parent:'reports', perm:'report_qty_loss' },
  { id:'rpt-op-efficiency', label:'Operator & Inspector Efficiency', icon:'👷', module:'report_op_efficiency', section:'tools', parent:'reports', perm:'report_op_efficiency' },
  { id:'rpt-mould-lifecycle', label:'Mould Lifecycle & Performance', icon:'⚙️', module:'report_mould_lifecycle', section:'tools', parent:'reports', perm:'report_mould_lifecycle' },
  { id:'rpt-cycle-time', label:'Production Cycle Time & Bottlenecks', icon:'⏳', module:'report_cycle_time', section:'tools', parent:'reports', perm:'report_cycle_time' },
  { id:'rpt-wip-valuation', label:'WIP Inventory Valuation', icon:'💰', module:'report_wip_valuation', section:'tools', parent:'reports', perm:'report_wip_valuation' },
  { id:'rpt-sub-vs-inhouse', label:'Subcontractor vs. In-House Comparison', icon:'🏢', module:'report_sub_vs_inhouse', section:'tools', parent:'reports', perm:'report_sub_vs_inhouse' },
  { id:'rpt-sub-pending', label:'Subcontractor Pending Batches', icon:'🏢', module:'report_sub_pending', section:'tools', parent:'reports', perm:'report_sub_pending' },
  { id:'rpt-sub-performance', label:'Subcontractor & Vendor Scorecard', icon:'🏢', module:'report_sub_performance', section:'tools', parent:'reports', perm:'report_sub_performance' },
  { id:'rpt-store-aging', label:'Store FIFO Aging Report', icon:'⏳', module:'report_store_aging', section:'tools', parent:'reports', perm:'report_store_aging' },
  { id:'rpt-daily-summary', label:'Daily Production & Scrap', icon:'📊', module:'report_daily_summary', section:'tools', parent:'reports', perm:'report_daily_summary' },
  { id:'rpt-analytics', label:'Production & Quality Analytics', icon:'📈', module:'report_analytics', section:'tools', parent:'reports', perm:'report_analytics' },

  { id:'print-batch',  label:'Print Label',        icon:'🖨️', module:'print-batch',  section:'tools', perm:'print-batch' },
  { id:'ai-agent',   label:'AI Assistant',        icon:'🤖', module:'ai-agent',  section:'tools', perm:'ai-agent' },
  // Admin
  { id:'admin',      label:'Admin Panel',         icon:'⚙️', module:'admin',     section:'admin', adminOnly:true },
];

const SECTION_LABELS = { main:'OVERVIEW', dept:'DEPARTMENTS', tools:'TOOLS', admin:'ADMINISTRATION' };

let dashboardMonth = new Date().toISOString().slice(0, 7);

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
    'daily-analysis': () => DailyAnalysisModule?.render(),
    'monthly-plan': () => MonthlyPlanModule?.render(),
    'prod-sched':   () => ProductionScheduleModule?.render(),
    replenishment:  () => ReplenishmentModule?.render(),
    'task-tracking': () => TaskTrackingModule?.render(),
    'stock-audit':   () => StockAuditModule?.render(),
    reports:    () => ReportsModule?.render('inventory'),
    admin:      () => AdminModule?.render(),
    'ai-agent': () => AIAgentModule?.render(),
    report_inventory:  () => ReportsModule?.render('inventory'),
    report_store_stock:() => ReportsModule?.render('store-stock'),
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
    report_sub_pending:    () => ReportsModule?.render('sub-pending'),
    report_sub_performance:() => ReportsModule?.render('sub-performance'),
    report_store_aging: () => ReportsModule?.render('store-aging'),
    report_daily_summary: () => ReportsModule?.render('daily-summary'),
    report_analytics:  () => ReportsModule?.render('analytics'),
    'print-batch':     () => PrintBatchModule?.render(),
  };

  const PAGE_TITLES = {
    dashboard:'Dashboard', master:'Inventory Master', 'mould-tracking':'Mould Tracking', production:'Production',
    cryogenic:'Cryogenic', deflashing:'Flash Removal', trimming:'Trimming',
    visual:'Visual Inspection', gauge:'Gauge Inspection', quality:'Quality Final',
    'post-curing':'Post Curing',
    'waiting-visual':'Waiting for Visual inspection',
    store:'Store & Sales', stock:'Stock Upload', 'daily-analysis':'Daily Requirement Feasibility', reports:'Reports', admin:'Admin Panel',
    'print-batch':'Print Label',
    'ai-agent':'AI Assistant',
    'monthly-plan':'Monthly Plan',
    'prod-sched':'Production Schedule',
    replenishment:'Replenishment Planner',
    'task-tracking':'Task Tracking',
    'stock-audit':'Monthly Physical Stock Taking & Audit',
    report_inventory:'Inventory Report',
    report_store_stock:'Store Stock Report',
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
    report_sub_pending:    'Subcontractor Pending Batches',
    report_sub_performance:'Subcontractor & Vendor Scorecard',
    report_store_aging:'Finished-Goods FIFO Aging Report',
    report_daily_summary:'Daily Production & Scrap Summary',
    report_analytics:'Production & Quality Visual Analytics Dashboard',
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
      try { 
        fn(); 
        applyBatchTagsToContainer(document.getElementById('content'));
      }
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

  function formatBatchCell(b) {
    if (!b) return '—';
    const batchNo = typeof b === 'string' ? b.trim() : String(b.batchNo || '').trim();
    if (!batchNo) return '—';
    let ib = typeof b === 'object' ? b.internalBatchNo : null;
    if (ib == null && typeof DB !== 'undefined' && DB.Batches) {
      const found = DB.Batches.all().find(x => x.batchNo === batchNo);
      if (found && found.internalBatchNo) ib = found.internalBatchNo;
    }
    const ibText = ib ? ` <span style="font-size:10.5px;color:var(--accent-teal);font-weight:600;">(IB: ${ib})</span>` : '';
    return `<span class="clickable-batch font-semibold text-blue" style="cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation(); App.showBatchGenealogy('${batchNo}')" title="Click to view Batch Genealogy & Details">${batchNo}</span>${ibText}`;
  }

  let tagDebounceTimer = null;
  function setupInternalBatchNoObserver() {
    const content = document.getElementById('content');
    if (!content) return;
    
    if (window._batchTagObserver) {
      window._batchTagObserver.disconnect();
    }

    applyBatchTagsToContainer(content);

    window._batchTagObserver = new MutationObserver(() => {
      clearTimeout(tagDebounceTimer);
      tagDebounceTimer = setTimeout(() => {
        applyBatchTagsToContainer(document.getElementById('content'));
      }, 40);
    });

    window._batchTagObserver.observe(content, { childList: true, subtree: true });
  }

  function applyBatchTagsToContainer(rootNode) {
    if (!rootNode || typeof DB === 'undefined' || !DB.Batches) return;
    const batches = DB.Batches.all();
    if (!batches || !batches.length) return;

    const batchMap = new Map();
    batches.forEach(b => {
      if (b.batchNo) {
        batchMap.set(b.batchNo.trim(), b.internalBatchNo || null);
      }
    });

    if (!batchMap.size) return;

    const tdElements = rootNode.querySelectorAll ? rootNode.querySelectorAll('td, .batch-cell') : [];
    tdElements.forEach(td => {
      if (td.querySelector('.clickable-batch') || td.querySelector('button, input, select, textarea')) return;
      const text = td.textContent.trim();
      if (batchMap.has(text)) {
        const ib = batchMap.get(text);
        const ibText = ib ? ` <span style="font-size:10.5px;color:var(--accent-teal);font-weight:600;">(IB: ${ib})</span>` : '';
        td.innerHTML = `<span class="clickable-batch font-semibold text-blue" style="cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation(); App.showBatchGenealogy('${text}')" title="Click to view Batch Genealogy & Details">${text}</span>${ibText}`;
      }
    });
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

    dot.classList.remove('pulse-green', 'pulse-amber');

    if (!navigator.onLine) {
      dot.style.background = '#ef4444'; // Red
      text.innerText = 'DISCONNECTED';
      text.style.color = '#ef4444';
    } else if (pendingSyncCollections.size > 0) {
      dot.style.background = '#f59e0b'; // Amber
      dot.classList.add('pulse-amber');
      text.innerText = 'SYNCING...';
      text.style.color = '#f59e0b';
    } else {
      dot.style.background = '#10b981'; // Green
      dot.classList.add('pulse-green');
      text.innerText = 'SYNCED';
      text.style.color = '#10b981';
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function onGlobalSearchFocus() {
    const input = document.getElementById('global-search-input');
    if (input && input.value.trim()) {
      onGlobalSearchInput(input.value);
    }
  }

  function onGlobalSearchInput(query) {
    const dropdown = document.getElementById('global-search-dropdown');
    if (!dropdown) return;

    try {
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
      }

      const qNorm = q.replace(/[\s\-_]/g, '');

      // 1. Search Batches
      const allBatches = (typeof DB !== 'undefined' && DB.Batches && DB.Batches.all) ? DB.Batches.all() : [];
      const ops = (typeof DB !== 'undefined' && DB.Operators && DB.Operators.all) ? DB.Operators.all() : [];
      const subs = (typeof DB !== 'undefined' && DB.Subcontractors && DB.Subcontractors.all) ? DB.Subcontractors.all() : [];
      const opMap = {};
      ops.forEach(o => { opMap[o.id] = (o.name || '').toLowerCase(); });
      const subMap = {};
      subs.forEach(s => { subMap[s.id] = (s.name || '').toLowerCase(); });

      const matchedBatches = allBatches.filter(b => {
        const batchNo = (b.batchNo || '').toLowerCase();
        const batchNoNorm = batchNo.replace(/[\s\-_]/g, '');
        const internalNo = b.internalBatchNo != null ? String(b.internalBatchNo).toLowerCase() : '';
        const trNo = (b.trNo || '').toLowerCase();
        const jmrefNo = (b.jmrefNo || '').toLowerCase();
        const jmrefNoNorm = jmrefNo.replace(/[\s\-_]/g, '');
        const partNo = (b.partNo || '').toLowerCase();
        const partNoNorm = partNo.replace(/[\s\-_]/g, '');
        const opName = (b.operatorName || opMap[b.operatorId] || '').toLowerCase();
        const subName = (subMap[b.subcontractorId] || '').toLowerCase();

        return batchNo.includes(q) ||
               (qNorm && batchNoNorm.includes(qNorm)) ||
               internalNo === q ||
               internalNo.includes(q) ||
               trNo.includes(q) ||
               jmrefNo.includes(q) ||
               (qNorm && jmrefNoNorm.includes(qNorm)) ||
               partNo.includes(q) ||
               (qNorm && partNoNorm.includes(qNorm)) ||
               opName.includes(q) ||
               subName.includes(q);
      }).slice(0, 8);

      // 2. Search Master Parts
      const allMaster = (typeof DB !== 'undefined' && DB.Master && DB.Master.all) ? DB.Master.all() : [];
      const matchedParts = allMaster.filter(m => {
        const partNo = (m.partNo || '').toLowerCase();
        const partNoNorm = partNo.replace(/[\s\-_]/g, '');
        const jmrefNo = (m.jmrefNo || '').toLowerCase();
        const jmrefNoNorm = jmrefNo.replace(/[\s\-_]/g, '');
        const desc = (m.description || '').toLowerCase();

        return partNo.includes(q) ||
               (qNorm && partNoNorm.includes(qNorm)) ||
               jmrefNo.includes(q) ||
               (qNorm && jmrefNoNorm.includes(qNorm)) ||
               desc.includes(q);
      }).slice(0, 4);

      // 3. Search Moulds
      const allMoulds = (typeof DB !== 'undefined' && DB.Moulds && DB.Moulds.all) ? DB.Moulds.all() : [];
      const matchedMoulds = allMoulds.filter(m => {
        const mouldNo = String(m.mouldNo || '');
        const mouldId = (m.mouldId || '').toLowerCase();
        const mouldType = (m.mouldType || '').toLowerCase();
        const jmrefNo = (m.jmrefNo || '').toLowerCase();

        return mouldNo === q ||
               mouldNo.includes(q) ||
               mouldId.includes(q) ||
               mouldType.includes(q) ||
               jmrefNo.includes(q);
      }).slice(0, 3);

      if (!matchedBatches.length && !matchedParts.length && !matchedMoulds.length) {
        dropdown.innerHTML = `
          <div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">
            <div style="font-size:24px; margin-bottom:4px;">🔍</div>
            No matching batches, parts, or moulds found for "<strong>${escapeHtml(query)}</strong>"
          </div>`;
        dropdown.classList.remove('hidden');
        return;
      }

      let html = '';

      // Render Batches
      if (matchedBatches.length) {
        html += `
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); padding:6px 10px; display:flex; justify-content:space-between;">
            <span>📦 Batches (${matchedBatches.length})</span>
            <span style="font-size:10px; opacity:0.8;">Click to Open</span>
          </div>`;
        
        matchedBatches.forEach(b => {
          const stageLabel = (typeof STAGE_LABELS !== 'undefined' && STAGE_LABELS[b.currentStage]) ? STAGE_LABELS[b.currentStage] : (b.currentStage || 'Unknown');
          const statusBadge = b.status === 'completed' ? '<span class="badge badge-green">Completed</span>' : (b.status === 'rejected' ? '<span class="badge badge-red">Rejected</span>' : `<span class="stage-chip ${b.currentStage}">${stageLabel}</span>`);
          const qty = b.initialQty || 0;

          html += `
            <div class="search-result-item" style="padding:8px 10px; border-radius:8px; display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; margin-bottom:4px; transition:background 0.15s;" 
              onmouseover="this.style.background='var(--bg-glass-hover)'" onmouseout="this.style.background='transparent'" onclick="App.selectBatchFromSearch('${b.id}')">
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <span class="font-bold text-blue" style="font-size:13px;">${b.batchNo}</span>
                  <span class="badge badge-teal" style="font-size:10px;">${b.jmrefNo || '—'}</span>
                  ${b.internalBatchNo != null ? `<span style="font-size:10.5px; color:var(--accent-teal); font-weight:600;">IB: ${b.internalBatchNo}</span>` : ''}
                  ${statusBadge}
                </div>
                <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px; display:flex; gap:12px;">
                  <span>Part: <strong style="color:var(--text-main);">${b.partNo || '—'}</strong></span>
                  <span>Qty: <strong style="color:var(--text-main);">${formatNum(qty)}</strong></span>
                  ${b.trNo ? `<span>TR: <strong>${b.trNo}</strong></span>` : ''}
                </div>
              </div>
              <div style="display:flex; gap:4px; flex-shrink:0;" onclick="event.stopPropagation()">
                <button class="btn btn-ghost btn-xs" onclick="App.showBatchGenealogy('${b.id}'); App.closeGlobalSearch();" title="View Genealogy" style="padding:3px 6px;">🧬</button>
                <button class="btn btn-primary btn-xs" onclick="App.selectBatchFromSearch('${b.id}')" style="padding:3px 8px; font-size:11px;">Open →</button>
              </div>
            </div>`;
        });
      }

      // Render Parts
      if (matchedParts.length) {
        html += `
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); padding:8px 10px 4px 10px; border-top:1px solid var(--border); margin-top:4px;">
            <span>📋 Master Parts (${matchedParts.length})</span>
          </div>`;
        
        matchedParts.forEach(p => {
          html += `
            <div class="search-result-item" style="padding:8px 10px; border-radius:8px; display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; margin-bottom:4px; transition:background 0.15s;" 
              onmouseover="this.style.background='var(--bg-glass-hover)'" onmouseout="this.style.background='transparent'" onclick="App.navigate('master'); App.closeGlobalSearch();">
              <div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <span class="font-bold" style="font-size:13px; color:var(--primary);">${p.partNo}</span>
                  <span class="badge badge-teal" style="font-size:10px;">${p.jmrefNo}</span>
                </div>
                <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">
                  ${escapeHtml(p.description || 'Rubber Component')}
                </div>
              </div>
              <span class="text-xs text-muted">Master →</span>
            </div>`;
        });
      }

      // Render Moulds
      if (matchedMoulds.length) {
        html += `
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); padding:8px 10px 4px 10px; border-top:1px solid var(--border); margin-top:4px;">
            <span>⚙️ Moulds (${matchedMoulds.length})</span>
          </div>`;
        
        matchedMoulds.forEach(m => {
          html += `
            <div class="search-result-item" style="padding:8px 10px; border-radius:8px; display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; margin-bottom:4px; transition:background 0.15s;" 
              onmouseover="this.style.background='var(--bg-glass-hover)'" onmouseout="this.style.background='transparent'" onclick="App.navigate('mould-tracking'); App.closeGlobalSearch();">
              <div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <span class="font-bold" style="font-size:13px; color:var(--accent-amber);">Mould ${m.mouldNo}</span>
                  <span class="badge badge-teal" style="font-size:10px;">${m.jmrefNo || '—'}</span>
                </div>
                <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">
                  ${escapeHtml(m.mouldType || 'Yet to be assigned')} • Cavities: ${m.cavity || '—'}
                </div>
              </div>
              <span class="text-xs text-muted">Tracking →</span>
            </div>`;
        });
      }

      dropdown.innerHTML = html;
      dropdown.classList.remove('hidden');
    } catch (err) {
      console.error("Global search error:", err);
      dropdown.innerHTML = `<div style="padding:12px; color:var(--accent-red); font-size:12px;">Search error: ${escapeHtml(err.message)}</div>`;
      dropdown.classList.remove('hidden');
    }
  }

  function selectBatchFromSearch(batchId) {
    closeGlobalSearch();
    const batch = DB.Batches.find(batchId);
    if (!batch) return;
    navigateToBatch(batch);
  }

  function closeGlobalSearch() {
    const dropdown = document.getElementById('global-search-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    const input = document.getElementById('global-search-input');
    if (input) input.blur();
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

  function filterStageScreenForBatch(stage, batchNo) {
    if (!stage || !batchNo) return;

    const applyFilter = () => {
      switch (stage) {
        case 'production':
          if (typeof ProductionModule !== 'undefined' && typeof ProductionModule.filterPending === 'function') {
            ProductionModule.filterPending(batchNo);
            const inp = document.getElementById('prod-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'cryogenic':
          if (typeof CryogenicModule !== 'undefined' && typeof CryogenicModule.filterPending === 'function') {
            CryogenicModule.filterPending(batchNo);
            const inp = document.getElementById('cryo-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'deflashing':
          if (typeof DeflashingModule !== 'undefined' && typeof DeflashingModule.filterPending === 'function') {
            DeflashingModule.filterPending(batchNo);
            const inp = document.getElementById('de-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'trimming':
          if (typeof TrimmingModule !== 'undefined' && typeof TrimmingModule.filterPending === 'function') {
            TrimmingModule.filterPending(batchNo);
            const inp = document.getElementById('trim-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'post-curing':
          if (typeof PostCuringModule !== 'undefined' && typeof PostCuringModule.filterPending === 'function') {
            PostCuringModule.filterPending(batchNo);
            const inp = document.getElementById('pc-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'waiting-visual':
          if (typeof WaitingVisualModule !== 'undefined' && typeof WaitingVisualModule.filterPending === 'function') {
            WaitingVisualModule.filterPending(batchNo);
            const inp = document.getElementById('wv-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'visual':
          if (typeof VisualModule !== 'undefined' && typeof VisualModule.filterPending === 'function') {
            VisualModule.filterPending(batchNo);
            const inp = document.getElementById('vis-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'gauge':
          if (typeof GaugeModule !== 'undefined' && typeof GaugeModule.filterPending === 'function') {
            GaugeModule.filterPending(batchNo);
            const inp = document.getElementById('gauge-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'quality':
          if (typeof QualityModule !== 'undefined' && typeof QualityModule.filterPending === 'function') {
            QualityModule.filterPending(batchNo);
            const inp = document.getElementById('qf-pending-search');
            if (inp) inp.value = batchNo;
          }
          break;
        case 'store':
          if (typeof StoreModule !== 'undefined' && typeof StoreModule.filterCompletedBatches === 'function') {
            StoreModule.filterCompletedBatches(batchNo);
            const inp = document.getElementById('store-batch-search');
            if (inp) inp.value = batchNo;
          }
          break;
      }
    };

    applyFilter();
    setTimeout(applyFilter, 50);
    setTimeout(applyFilter, 150);
    setTimeout(applyFilter, 300);
  }

  function navigateToBatch(batch) {
    if (!batch) return;
    const batchNo = batch.batchNo || '';

    if (batch.status === 'completed') {
      showToast(`Batch "${batchNo}" is in Store`, 'success');
      navigate('store');
      filterStageScreenForBatch('store', batchNo);
      return;
    }

    if (batch.status === 'rejected') {
      showToast(`Batch "${batchNo}" is rejected`, 'error');
      navigate('reports');
      return;
    }

    navigate(batch.currentStage);
    filterStageScreenForBatch(batch.currentStage, batchNo);
  }

  function routeScannedBatch(batchNo) {
    if (!batchNo) return;
    const q = batchNo.trim().toLowerCase();
    const batch = DB.Batches.all().find(b => (b.batchNo || '').trim().toLowerCase() === q || (b.internalBatchNo != null && String(b.internalBatchNo).trim().toLowerCase() === q));
    if (!batch) {
      showToast(`Batch "${batchNo}" not found in system`, 'error');
      return;
    }
    navigateToBatch(batch);
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
                  <tr><th>Activity / Route</th><th>Input</th><th>Output</th><th>Loss</th><th>Date</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  ${(() => {
                    const rawRecs = DB.StageRecords.all().filter(r => r.batchId === b.id).sort((x,y) => (x.createdAt||'').localeCompare(y.createdAt||''));
                    const filteredRecs = [];
                    rawRecs.forEach(r => {
                      if (filteredRecs.length > 0) {
                        const prev = filteredRecs[filteredRecs.length - 1];
                        if (prev.stage === r.stage && prev.movedTo === r.movedTo && prev.movedFrom === r.movedFrom) {
                          // Overwrite with the latest duplicate to ensure most recent notes/data are preserved
                          filteredRecs[filteredRecs.length - 1] = r;
                          return;
                        }
                      }
                      filteredRecs.push(r);
                    });
                    return filteredRecs;
                  })().map(r => {
                    const displayLoss = (r.stage === 'store') ? 0 : Math.max(0, (r.inputQty || 0) - (r.outputQty || 0));
                    const stageNames = {
                      production: 'Production',
                      cryogenic: 'Cryogenic',
                      deflashing: 'DE Flashing',
                      trimming: 'Trimming',
                      'post-curing': 'Post Curing',
                      'waiting-visual': 'Waiting for Visual',
                      visual: 'Visual',
                      gauge: 'Gauge',
                      quality: 'QC Final',
                      store: 'Store',
                      'Stock Upload': 'Stock Upload'
                    };
                    const fromLabel = stageNames[r.movedFrom] || r.movedFrom || stageNames[r.stage] || r.stage;
                    const toLabel = stageNames[r.movedTo] || r.movedTo || stageNames[r.stage] || r.stage;
                    let routeText = '';
                    if (r.stage === 'store') {
                      routeText = `Received in Store (from ${fromLabel})`;
                    } else {
                      routeText = (fromLabel === toLabel) ? fromLabel : `${fromLabel} ➔ ${toLabel}`;
                    }
                    return `
                      <tr>
                        <td class="font-semibold" style="white-space: nowrap; color: var(--primary);">${routeText}</td>
                        <td>${formatNum(r.inputQty)}</td>
                        <td>${formatNum(r.outputQty)}</td>
                        <td class="text-danger">${formatNum(displayLoss)}</td>
                        <td>${r.date}</td>
                        <td class="text-muted" style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${r.notes||''}">${r.notes || '—'}</td>
                      </tr>`;
                  }).join('') || '<tr><td colspan="6" class="text-center text-muted">No stage history recorded</td></tr>'}
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

  function toggleAllStageChecks(chk) {
    const list = document.querySelectorAll('.bulk-stage-check');
    list.forEach(el => {
      if (!el.disabled) el.checked = chk.checked;
    });
  }

  function bulkPrintStageSelected() {
    const checked = Array.from(document.querySelectorAll('.bulk-stage-check:checked')).map(el => el.value);
    if (!checked.length) {
      showToast('Please select at least one batch to print', 'warning');
      return;
    }
    window.bulkPrintBarcodes(checked);
  }

  document.addEventListener('click', (e) => {
    const searchContainer = document.getElementById('global-search-container');
    if (searchContainer && !searchContainer.contains(e.target)) {
      closeGlobalSearch();
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('global-search-input');
      if (input) {
        input.focus();
        input.select();
        onGlobalSearchFocus();
      }
    } else if (e.key === 'Escape') {
      closeGlobalSearch();
    }
  });

  return { navigate, init, toggleReportsMenu, openChangePasswordModal, changePassword, runQuickScan, showBatchGenealogy, formatBatchCell, applyBatchTagsToContainer, get current() { return currentModule; }, changeDashboardMonth: (val) => { dashboardMonth = val; renderDashboard(); }, toggleAllStageChecks, bulkPrintStageSelected, onGlobalSearchFocus, onGlobalSearchInput, selectBatchFromSearch, closeGlobalSearch };
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

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const originalText = btn ? btn.innerHTML : 'Sign In →';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Verifying...';
    }
    
    const err = document.getElementById('login-error');
    if (err) {
      err.textContent = '';
      err.classList.remove('show');
    }

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    try {
      const result = await Auth.login(username, password);
      if (result.ok) {
        App.init();
      } else {
        if (err) {
          err.textContent = result.error;
          err.classList.add('show');
        }
      }
    } catch (loginErr) {
      if (err) {
        err.textContent = 'Login error: ' + (loginErr.message || loginErr);
        err.classList.add('show');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
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
          <h2 id="top-bar-title" style="flex-shrink:0;">Dashboard</h2>

          <!-- Global Quick Search Container -->
          <div id="global-search-container" style="position:relative; flex:1; max-width:440px; margin:0 12px;">
            <div style="position:relative; display:flex; align-items:center;">
              <span style="position:absolute; left:12px; color:var(--text-muted); font-size:13px; pointer-events:none;">🔍</span>
              <input type="text" id="global-search-input" class="form-control" placeholder="Search batch, part, JMREF, mould... (Ctrl+K)" 
                style="padding-left:36px; padding-right:75px; height:36px; font-size:12.5px; border-radius:20px; background:var(--card-bg); border:1px solid var(--border);"
                onfocus="App.onGlobalSearchFocus()" oninput="App.onGlobalSearchInput(this.value)" autocomplete="off">
              <div style="position:absolute; right:8px; display:flex; align-items:center; gap:4px;">
                <kbd style="font-size:10px; font-family:inherit; padding:1px 5px; border-radius:4px; background:var(--bg-input); color:var(--text-muted); border:1px solid var(--border); line-height:1.2;">Ctrl K</kbd>
                <button type="button" class="btn btn-ghost btn-xs" onclick="App.runQuickScan()" title="Scan QR Code" style="padding:2px 5px; height:24px; font-size:12px; color:var(--accent-teal);">📷</button>
              </div>
            </div>
            <div id="global-search-dropdown" class="hidden" style="position:absolute; top:calc(100% + 6px); left:0; right:0; max-height:420px; overflow-y:auto; background:var(--card-bg); border:1px solid var(--border); border-radius:12px; box-shadow:0 12px 30px rgba(0,0,0,0.4); z-index:1000; padding:8px;">
            </div>
          </div>

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

  const thisMonth = dashboardMonth;

  const batches   = DB.Batches.all();
  const master    = DB.Master.all();
  const sales     = DB.Sales.all();
  const losses    = DB.LossTracker.all();
  const rejected  = DB.RejectionTracker.all();
  const rechecks  = DB.RecheckTracker.all();

  const active    = batches.filter(b => b.status === 'active').length;
  const completed = batches.filter(b => b.status === 'completed' && (b.completedAt || b.createdAt || '').slice(0, 7) === thisMonth).length;
  const rejectedCount = batches.filter(b => b.status === 'rejected' && (b.updatedAt || b.createdAt || '').slice(0, 7) === thisMonth).length;
  const totalLoss = losses.filter(l => (l.date || l.createdAt || '').slice(0, 7) === thisMonth).reduce((s, l) => s + (l.lossQty || 0), 0);
  const storeInv  = DB.StoreInventory.allParts();
  const totalStock = storeInv.reduce((s, p) => s + (p.available || 0), 0);

  // Monthly stats
  const salesThisMonth = sales.filter(s => (s.saleDate||'').startsWith(thisMonth)).reduce((s,r)=>s+(r.qty||0),0);

  // Extract unique months for select options
  const uniqueMonths = new Set();
  uniqueMonths.add(new Date().toISOString().slice(0, 7)); // always include current month
  batches.forEach(b => {
    const d = b.productionDate || b.createdAt;
    if (d) uniqueMonths.add(d.slice(0, 7));
  });
  DB.StageRecords.all().forEach(r => {
    const d = r.date || r.createdAt;
    if (d) uniqueMonths.add(d.slice(0, 7));
  });
  const sortedMonths = Array.from(uniqueMonths).sort().reverse();
  const monthOptions = sortedMonths.map(m => {
    const [y, mm] = m.split('-');
    const dateStr = new Date(Number(y), Number(mm) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    return `<option value="${m}" ${m === thisMonth ? 'selected' : ''}>${dateStr}</option>`;
  }).join('');

  const monthYearStr = (() => {
    const [y, m] = thisMonth.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  })();

  // Production plan & schedule metrics
  const monthlyPlans = DB.MonthlyPlans.all().filter(p => p.month === thisMonth);
  const planQtyThisMonth = monthlyPlans.reduce((s, p) => s + (p.qty || 0), 0);
  const scheduledQtyThisMonth = DB.ProductionSchedules.all().filter(s => s.month === thisMonth).reduce((s, sch) => s + (sch.qty || 0), 0);
  const producedQtyThisMonth = batches.filter(b => {
    const bd = (b.productionDate || b.createdAt || '').slice(0, 7);
    return bd === thisMonth && 
           !b.isReprocess && 
           !b.isStockUpload && 
           !(b.batchNo && b.batchNo.includes('-REP')) && 
           !(b.batchNo && b.batchNo.includes('-REC-'));
  }).reduce((s, b) => s + (b.initialQty || 0), 0);

  // Active WIP rechecks
  const activeRechecks = rechecks.filter(r => {
    const b = DB.Batches.find(r.batchId);
    return b && b.status === 'active';
  }).length;

  // Critical replenishments (stock < 30% of target level) - Optimized O(N) indexing
  let criticalCount = 0;
  const STAGES = ['production', 'cryogenic', 'deflashing', 'trimming', 'post-curing', 'waiting-visual', 'visual', 'gauge', 'quality'];
  
  const allStageRecords = DB.StageRecords.all();
  const allBatches = batches;

  // Build quick batch lookups
  const batchMap = new Map();
  allBatches.forEach(b => batchMap.set(b.id, b));

  // Pre-index active batches by partId & stage
  const activeBatchesByPartAndStage = {};
  allBatches.forEach(b => {
    if (b.status === 'active' && b.partId) {
      const k = `${b.partId}_${b.currentStage}`;
      if (!activeBatchesByPartAndStage[k]) activeBatchesByPartAndStage[k] = [];
      activeBatchesByPartAndStage[k].push(b);
    }
  });

  // Pre-index incoming stage records by batchId
  const incomingRecordsByBatchId = {};
  allStageRecords.forEach(r => {
    if (r.movedTo) {
      if (!incomingRecordsByBatchId[r.batchId]) incomingRecordsByBatchId[r.batchId] = [];
      incomingRecordsByBatchId[r.batchId].push(r);
    }
  });

  // Pre-calculate general stage loss rates
  const generalLossRates = {};
  STAGES.forEach(stage => {
    const stageRecs = allStageRecords.filter(r => r.stage === stage);
    const totalIn = stageRecs.reduce((s, r) => s + (r.inputQty || 0), 0);
    const totalLoss = stageRecs.reduce((s, r) => s + (r.lossQty || 0), 0);
    generalLossRates[stage] = totalIn > 0 ? (totalLoss / totalIn) : 0.05;
  });

  // Pre-calculate available store stock map for all parts
  const storeStockByJmref = {};
  storeInv.forEach(p => {
    if (p.jmrefNo) storeStockByJmref[p.jmrefNo] = p.available || 0;
  });

  master.forEach(p => {
    const target = p.averageTargetInventory || 0;
    if (target <= 0) return;
    const storeStock = storeStockByJmref[p.jmrefNo] || 0;
    
    let wipYield = 0;
    for (let i = 0; i < STAGES.length; i++) {
      const stage = STAGES[i];
      const activeList = activeBatchesByPartAndStage[`${p.id}_${stage}`] || [];
      const wip = activeList.reduce((sum, b) => {
        const inc = incomingRecordsByBatchId[b.id] || [];
        const matchInc = inc.filter(r => r.movedTo === stage);
        if (matchInc.length) return sum + (matchInc[matchInc.length - 1].outputQty || 0);
        return sum + (b.initialQty || 0);
      }, 0);

      if (wip <= 0) continue;

      let survivalRate = 1.0;
      for (let j = i; j < STAGES.length; j++) {
        survivalRate *= (1.0 - (generalLossRates[STAGES[j]] || 0.05));
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

  // Grand totals across all stages for the month
  const grandCount = stageRecordsThisMonth.filter(r => STAGES.includes(r.stage)).length;
  const grandIn = stageRecordsThisMonth.filter(r => STAGES.includes(r.stage)).reduce((sum, r) => sum + (r.inputQty || 0), 0);
  const grandOut = stageRecordsThisMonth.filter(r => STAGES.includes(r.stage)).reduce((sum, r) => sum + (r.outputQty || 0), 0);
  const grandLoss = stageRecordsThisMonth.filter(r => STAGES.includes(r.stage)).reduce((sum, r) => sum + (r.lossQty || 0), 0);
  const grandLossPercent = grandIn > 0 ? ((grandLoss / grandIn) * 100).toFixed(1) + '%' : '0.0%';

  // SVG Chart code
  const svgWidth = 500;
  const svgHeight = 240;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 60;
  
  const chartStages = STAGES.filter(stage => {
    return stageRecordsThisMonth.some(r => r.stage === stage && ((r.outputQty || 0) > 0 || (r.lossQty || 0) > 0));
  });
  const activeStagesForChart = chartStages.length > 0 ? chartStages : STAGES.slice(0, 5);
  
  const maxVal = Math.max(...activeStagesForChart.map(stage => {
    const recs = stageRecordsThisMonth.filter(r => r.stage === stage);
    return Math.max(recs.reduce((sum, r) => sum + (r.inputQty || 0), 0), 10);
  }), 100);
  
  const stageData = activeStagesForChart.map(stage => {
    const recs = stageRecordsThisMonth.filter(r => r.stage === stage);
    const totalIn = recs.reduce((sum, r) => sum + (r.inputQty || 0), 0);
    const totalOut = recs.reduce((sum, r) => sum + (r.outputQty || 0), 0);
    const totalLoss = recs.reduce((sum, r) => sum + (r.lossQty || 0), 0);
    return { name: STAGE_NAMES[stage] || stage, totalIn, totalOut, totalLoss };
  });

  const barCount = stageData.length;
  const chartInnerWidth = svgWidth - paddingLeft - paddingRight;
  const chartInnerHeight = svgHeight - paddingTop - paddingBottom;
  const groupWidth = chartInnerWidth / barCount;
  const barWidth = groupWidth * 0.3;
  
  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const yVal = paddingTop + (chartInnerHeight / 4) * i;
    const tickLabel = Math.round(maxVal - (maxVal / 4) * i);
    gridLines += `
      <line x1="${paddingLeft}" y1="${yVal}" x2="${svgWidth - paddingRight}" y2="${yVal}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4" />
      <text x="${paddingLeft - 8}" y="${yVal + 4}" font-size="9" fill="var(--text-secondary)" text-anchor="end">${formatNum(tickLabel)}</text>
    `;
  }
  
  let barsHtml = '';
  stageData.forEach((d, idx) => {
    const xGroupCenter = paddingLeft + groupWidth * idx + groupWidth / 2;
    const xOutBar = xGroupCenter - barWidth - 1;
    const xLossBar = xGroupCenter + 1;
    
    const outHeight = (d.totalOut / maxVal) * chartInnerHeight;
    const lossHeight = (d.totalLoss / maxVal) * chartInnerHeight;
    
    const yOut = paddingTop + chartInnerHeight - outHeight;
    const yLoss = paddingTop + chartInnerHeight - lossHeight;
    
    barsHtml += `
      <rect x="${xOutBar}" y="${yOut}" width="${barWidth}" height="${outHeight}" fill="var(--accent-green)" rx="3" />
      <rect x="${xLossBar}" y="${yLoss}" width="${barWidth}" height="${lossHeight}" fill="var(--accent-red)" rx="3" />
      <text x="${xGroupCenter + 6}" y="${svgHeight - paddingBottom + 12}" font-size="8.5" fill="var(--text-primary)" text-anchor="end" font-weight="600" transform="rotate(-30, ${xGroupCenter + 6}, ${svgHeight - paddingBottom + 12})">${d.name}</text>
    `;
  });
  
  const dashboardChartHtml = `
    <div class="card" style="margin-bottom:28px; padding: 16px;">
      <div class="card-header" style="padding-bottom: 8px;">
        <h3>📊 Monthly Stage Yield &amp; Defect Analysis</h3>
      </div>
      <div style="display:flex; justify-content:center; align-items:center; overflow-x:auto;">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%; max-width:550px; height:auto; overflow:visible;">
          ${gridLines}
          ${barsHtml}
          <line x1="${paddingLeft}" y1="${svgHeight - paddingBottom}" x2="${svgWidth - paddingRight}" y2="${svgHeight - paddingBottom}" stroke="var(--border-strong)" stroke-width="2" />
        </svg>
      </div>
      <div style="display:flex; justify-content:center; gap:20px; margin-top:12px; font-size:12px;">
        <div style="display:flex; align-items:center; gap:6px;"><span style="width:12px; height:12px; background:var(--accent-green); border-radius:3px; display:inline-block;"></span><span class="font-semibold">Passed</span></div>
        <div style="display:flex; align-items:center; gap:6px;"><span style="width:12px; height:12px; background:var(--accent-red); border-radius:3px; display:inline-block;"></span><span class="font-semibold">Loss (Reject)</span></div>
      </div>
    </div>
  `;

  el.innerHTML = `
    <div class="animate-in">
      <!-- Welcome Header with Left-Aligned Logo & Month Selector -->
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; margin-bottom:28px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <img src="./logo.png" alt="JMPL Logo" style="height: 64px; width: 64px; object-fit: contain; background: white; padding: 8px; border-radius: 12px; box-shadow: var(--shadow-sm); flex-shrink: 0;">
          <div>
            <h2 style="font-size:22px;font-weight:800;margin:0;">Good ${getGreeting()}, ${Auth.getSession()?.name?.split(' ')[0]} 👋</h2>
            <p class="text-sm text-muted mt-1" style="margin:0;">Here's your JMPL inventory overview for today</p>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <label class="form-label" style="margin:0; font-size:13px; font-weight:700; white-space:nowrap; color:var(--text-secondary);">Select Month:</label>
          <select id="dashboard-month-select" class="form-control form-control-sm" style="width:160px; margin:0;" onchange="App.changeDashboardMonth(this.value)">
            ${monthOptions}
          </select>
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

      ${dashboardChartHtml}

      <!-- Monthly Stage Production (Selected Month) -->
      <div class="card" style="margin-bottom:28px;">
        <div class="card-header">
          <h3>📈 Monthly Production Summary by Stage (${monthYearStr})</h3>
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
            <tfoot>
              <tr style="border-top: 2px solid var(--border); font-weight: bold; background: rgba(255,255,255,0.02);">
                <td>Total</td>
                <td style="text-align: right;">${formatNum(grandCount)}</td>
                <td style="text-align: right; color: var(--text-secondary);">${formatNum(grandIn)}</td>
                <td style="text-align: right; color: var(--success); font-weight: 700;">${formatNum(grandOut)}</td>
                <td style="text-align: right; color: var(--danger); font-weight: 600;">${formatNum(grandLoss)}</td>
                <td style="text-align: right; font-weight: 600;" class="${grandLoss > 0 ? 'text-amber' : 'text-muted'}">${grandLossPercent}</td>
              </tr>
            </tfoot>
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
