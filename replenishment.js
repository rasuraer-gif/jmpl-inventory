// ============================================================
// replenishment.js — Replenishment Planner Module
// ============================================================
const ReplenishmentModule = (() => {

  const STAGES = ['production', 'cryogenic', 'deflashing', 'trimming', 'visual', 'gauge', 'quality'];
  
  const STAGE_LABELS = {
    production: 'Production',
    cryogenic: 'Cryogenic',
    deflashing: 'Flash Removal',
    trimming: 'Trimming',
    visual: 'Visual',
    gauge: 'Gauge',
    quality: 'QC Final'
  };

  // Calculates historical average loss rate for a stage + part
  function getStageLossRate(partId, stage) {
    const stageRecords = DB.StageRecords.all().filter(r => {
      const b = DB.Batches.find(r.batchId);
      return b && b.partId === partId && r.stage === stage;
    });

    if (stageRecords.length === 0) {
      // General stage loss fallback
      const generalRecords = DB.StageRecords.all().filter(r => r.stage === stage);
      if (generalRecords.length === 0) return 0.05; // 5% default fallback
      const totalIn = generalRecords.reduce((s, r) => s + (r.inputQty || 0), 0);
      const totalLoss = generalRecords.reduce((s, r) => s + (r.lossQty || 0), 0);
      return totalIn > 0 ? (totalLoss / totalIn) : 0.05;
    }

    const totalIn = stageRecords.reduce((s, r) => s + (r.inputQty || 0), 0);
    const totalLoss = stageRecords.reduce((s, r) => s + (r.lossQty || 0), 0);
    return totalIn > 0 ? (totalLoss / totalIn) : 0.0;
  }

  // Get active batches at a specific stage
  function getWIPQty(partId, stage) {
    const batches = DB.Batches.all().filter(b => b.partId === partId && b.currentStage === stage && b.status === 'active');
    const stageRecords = DB.StageRecords.all();
    return batches.reduce((sum, b) => {
      const incoming = stageRecords.filter(r => r.batchId === b.id && r.movedTo === stage);
      if (incoming.length) {
        return sum + (incoming[incoming.length - 1].outputQty || 0);
      }
      return sum + (b.initialQty || 0);
    }, 0);
  }

  // Calculates expected yields after applying stage survival rate recursively
  function calculateExpectedWIPYield(partId) {
    // 1. Get loss rates for all stages
    const lossRates = STAGES.map(stage => getStageLossRate(partId, stage));
    
    // 2. Get nominal WIP quantities at each stage
    const wipCounts = STAGES.map(stage => getWIPQty(partId, stage));

    // 3. Apply cumulative survival rates: Yield = WIP_i * (1-L_i) * (1-L_{i+1}) * ... * (1-L_last)
    let totalExpectedYield = 0;
    const stageDetails = [];

    for (let i = 0; i < STAGES.length; i++) {
      const wip = wipCounts[i];
      if (wip <= 0) continue;

      let survivalRate = 1.0;
      for (let j = i; j < STAGES.length; j++) {
        survivalRate *= (1.0 - lossRates[j]);
      }

      const expectedYield = Math.round(wip * survivalRate);
      totalExpectedYield += expectedYield;

      stageDetails.push({
        stage: STAGES[i],
        label: STAGE_LABELS[STAGES[i]],
        wip,
        expectedYield
      });
    }

    return { total: totalExpectedYield, details: stageDetails };
  }

  function render() {
    const el = document.getElementById('content');
    if (!el) return;

    const master = DB.Master.all();
    const partsPlannerData = master.map(p => {
      const storeStock = DB.StoreInventory.availableByJmref(p.jmrefNo);
      const wipYieldData = calculateExpectedWIPYield(p.id);
      const wipYield = wipYieldData.total;
      
      const target = p.averageTargetInventory || 0;
      const netAvailable = storeStock + wipYield;
      const qtyNeeded = Math.max(0, target - netAvailable);
      
      // Priority Calculation
      let priority = 'No Action';
      let priorityRatio = 0.0;
      let badgeClass = 'badge-green';

      if (target > 0) {
        priorityRatio = netAvailable / target;
        if (priorityRatio <= 0.3) {
          priority = 'Critical';
          badgeClass = 'badge-red';
        } else if (priorityRatio <= 0.7) {
          priority = 'Medium';
          badgeClass = 'badge-amber';
        } else if (priorityRatio < 1.0) {
          priority = 'Low';
          badgeClass = 'badge-blue';
        } else {
          priority = 'No Action';
          badgeClass = 'badge-green';
        }
      } else {
        priority = 'N/A';
        badgeClass = 'badge-gray';
        priorityRatio = 1.0;
      }

      return {
        part: p,
        storeStock,
        wipYield,
        wipDetails: wipYieldData.details,
        target,
        netAvailable,
        qtyNeeded,
        priority,
        priorityRatio,
        badgeClass
      };
    });

    // Sort: Critical (0.3) first, then Medium (0.7), then Low (1.0), then No Action / N/A last
    const priorityWeight = { 'Critical': 4, 'Medium': 3, 'Low': 2, 'No Action': 1, 'N/A': 0 };
    partsPlannerData.sort((a, b) => {
      const weightA = priorityWeight[a.priority];
      const weightB = priorityWeight[b.priority];
      if (weightA !== weightB) {
        return weightB - weightA; // Descending weight
      }
      return a.priorityRatio - b.priorityRatio; // Ascending ratio (smaller ratio = more critical)
    });

    // Summarize counts
    const criticalCount = partsPlannerData.filter(d => d.priority === 'Critical').length;
    const mediumCount = partsPlannerData.filter(d => d.priority === 'Medium').length;
    const lowCount = partsPlannerData.filter(d => d.priority === 'Low').length;

    const rowsHtml = partsPlannerData.map((d, idx) => {
      // Build tooltip detail for WIP
      const wipTooltip = d.wipDetails.map(w => `${w.label}: WIP ${formatNum(w.wip)} → Yield ${formatNum(w.expectedYield)}`).join('\n');
      return `
        <tr>
          <td class="text-muted">${idx + 1}</td>
          <td><span class="badge badge-teal">${d.part.jmrefNo}</span></td>
          <td class="font-semibold text-blue">${d.part.partNo}</td>
          <td class="font-bold">${formatNum(d.target)}</td>
          <td class="font-bold text-success">${formatNum(d.storeStock)}</td>
          <td class="font-semibold" style="cursor:help;" title="${wipTooltip || 'No WIP active'}">
            ${formatNum(d.wipYield)} ${d.wipYield > 0 ? 'ℹ️' : ''}
          </td>
          <td class="font-bold">${formatNum(d.netAvailable)}</td>
          <td class="font-bold text-blue">${formatNum(d.qtyNeeded)}</td>
          <td><span class="badge ${d.badgeClass}">${d.priority}</span></td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="animate-in">
        <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 class="font-bold" style="font-size:20px;">Replenishment Priority Planner</h2>
            <p class="text-sm text-muted mt-1">Calculates production needs based on Target Inventories, Store Stock, and expected WIP yields adjusting for stage losses</p>
          </div>
          <button class="btn btn-secondary" onclick="ReplenishmentModule.exportExcel()">📥 Export Priority List</button>
        </div>

        <div class="stats-grid mb-6" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); max-width: 600px;">
          <div class="stat-card red"><div class="stat-label">Critical Replenishment</div><div class="stat-value red">${criticalCount}</div></div>
          <div class="stat-card amber"><div class="stat-label">Medium Replenishment</div><div class="stat-value amber">${mediumCount}</div></div>
          <div class="stat-card blue"><div class="stat-label">Low Priority</div><div class="stat-value blue">${lowCount}</div></div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Replenishment &amp; Production Priority Plan</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 50px;">#</th>
                  <th>JMREF No</th>
                  <th>Part No</th>
                  <th>Target Inventory</th>
                  <th>Store Stock</th>
                  <th>WIP Yield (Adjusted)</th>
                  <th>Net Available</th>
                  <th>Qty to Produce</th>
                  <th>Priority Status</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="9" class="text-center text-muted" style="padding:32px;">No parts found. Add parts in Inventory Master first.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded', 'error');
      return;
    }

    const master = DB.Master.all();
    const data = master.map((p, idx) => {
      const storeStock = DB.StoreInventory.availableByJmref(p.jmrefNo);
      const wipYield = calculateExpectedWIPYield(p.id).total;
      const target = p.averageTargetInventory || 0;
      const netAvailable = storeStock + wipYield;
      const qtyNeeded = Math.max(0, target - netAvailable);
      
      let priority = 'No Action';
      if (target > 0) {
        const ratio = netAvailable / target;
        if (ratio <= 0.3) priority = 'Critical';
        else if (ratio <= 0.7) priority = 'Medium';
        else if (ratio < 1.0) priority = 'Low';
      }

      return [
        idx + 1,
        p.jmrefNo,
        p.partNo,
        target,
        storeStock,
        wipYield,
        netAvailable,
        qtyNeeded,
        priority
      ];
    });

    const headers = ['#', 'JMREF No', 'Part No', 'Target Inventory', 'Store Stock', 'WIP Yield (Adjusted)', 'Net Available', 'Qty to Produce', 'Priority Status'];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Replenishment Priority');
    XLSX.writeFile(wb, 'JMPL_Production_Replenishment_Priority.xlsx');
    showToast('Priority Planner Excel exported successfully', 'success');
  }

  return {
    render,
    exportExcel
  };
})();
