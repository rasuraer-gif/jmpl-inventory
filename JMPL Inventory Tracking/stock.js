// ============================================================
// stock.js — Monthly Stock Upload Module (Admin Only)
// ============================================================
const StockModule = (() => {
  const STAGE_LABELS = { production:'Production', cryogenic:'Cryogenic', deflashing:'Manual DE Flashing', trimming:'Trimming', visual:'Visual Inspection', gauge:'Gauge Inspection', quality:'Quality Final', store:'Store' };

  function render() {
    const el = document.getElementById('content');
    const isAdmin = Auth.isAdmin();
    const uploads = DB.StockUploads.all().sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
    const master = DB.Master.all();
    const users = DB.Users.all();
    const stageOpts = Object.entries(STAGE_LABELS).map(([k,v])=>'<option value="' + k + '">' + v + '</option>').join('');
    const partOpts = master.map(m=>'<option value="' + m.id + '" data-jmref="' + m.jmrefNo + '">' + m.partNo + ' — ' + m.jmrefNo + '</option>').join('');

    const formHtml = isAdmin ? `
      <div class="card animate-in" style="margin-bottom:24px;">
        <div class="card-header"><h3>Upload Stock Snapshot</h3><span class="badge badge-amber">Admin Only — Full Overwrite</span></div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">This will overwrite the current stock record for the selected Stage + Part combination. Latest upload per combination is used as current stock.</p>
          <div class="form-row-3">
            <div class="form-group"><label class="form-label">Stage <span class="required">*</span></label><select id="stock-stage" class="form-control"><option value="">Select stage...</option>${stageOpts}</select></div>
            <div class="form-group"><label class="form-label">Part <span class="required">*</span></label><select id="stock-part" class="form-control"><option value="">Select part...</option>${partOpts}</select></div>
            <div class="form-group"><label class="form-label">Quantity <span class="required">*</span></label><input type="number" id="stock-qty" class="form-control" min="0" placeholder="Current stock qty"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Upload Date <span class="required">*</span></label><input type="date" id="stock-date" class="form-control" value="${new Date().toISOString().slice(0,10)}"></div>
            <div class="form-group"><label class="form-label">Notes</label><input type="text" id="stock-notes" class="form-control" placeholder="Optional notes"></div>
          </div>
          <button class="btn btn-primary" onclick="StockModule.upload()">Upload Stock Snapshot</button>
        </div>
      </div>` : `<div class="card card-body" style="margin-bottom:24px;text-align:center;padding:32px;border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);"><div style="font-size:36px;margin-bottom:12px;">&#x26A0;&#xFE0F;</div><h3 style="margin-bottom:8px;">Admin Access Required</h3><p class="text-muted text-sm">Only administrators can upload stock snapshots.</p></div>`;

    const rows = uploads.map(u => {
      const part = master.find(m=>m.id===u.partId)||{};
      const user = users.find(uu=>uu.id===u.uploadedBy)||{};
      return '<tr><td><span class="badge badge-blue">' + (STAGE_LABELS[u.stage]||u.stage) + '</span></td><td>' + (part.partNo||'&#x2014;') + '</td><td><span class="badge badge-teal">' + (u.jmrefNo||'&#x2014;') + '</span></td><td class="font-semibold">' + formatNum(u.qty) + '</td><td class="text-muted text-sm">' + (u.uploadedAt||'').slice(0,10) + '</td><td class="text-muted text-sm">' + (user.name||'&#x2014;') + '</td><td class="text-muted text-sm">' + (u.notes||'&#x2014;') + '</td></tr>';
    }).join('');

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6"><h2 class="font-bold" style="font-size:20px;">Monthly Stock Upload</h2><p class="text-sm text-muted mt-1">Upload physical stock count snapshots per stage (Admin only)</p></div>
        ${formHtml}
        <div class="card">
          <div class="card-header"><h3>Upload History</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Stage</th><th>Part No</th><th>JMREF</th><th>Qty</th><th>Upload Date</th><th>Uploaded By</th><th>Notes</th></tr></thead>
              <tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No stock uploads yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function upload() {
    if (!Auth.isAdmin()) { showToast('Admin access required', 'error'); return; }
    const stage = document.getElementById('stock-stage').value;
    const partEl = document.getElementById('stock-part');
    const partId = partEl.value;
    const jmrefNo = partEl.options[partEl.selectedIndex]?.dataset?.jmref || '';
    const qty = parseInt(document.getElementById('stock-qty').value);
    const uploadedAt = document.getElementById('stock-date').value;
    const notes = document.getElementById('stock-notes').value.trim();
    const session = Auth.getSession();
    if (!stage) { showToast('Please select a stage', 'error'); return; }
    if (!partId) { showToast('Please select a part', 'error'); return; }
    if (isNaN(qty) || qty < 0) { showToast('Please enter a valid quantity', 'error'); return; }
    if (!uploadedAt) { showToast('Upload date is required', 'error'); return; }
    DB.StockUploads.insert({ stage, partId, jmrefNo, qty, uploadedAt, uploadedBy: session&&session.userId, notes });
    showToast('Stock snapshot uploaded successfully', 'success');
    render();
  }

  return { render, upload };
})();
