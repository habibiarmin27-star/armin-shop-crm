// reports.js
import { db } from "./firebase-init.js";
import { requireAdmin } from "./auth-guard.js";
import { getCustomerLevel, getThreeMonthTotal } from "./levels-config.js";
import { BRANCHES, shortBranchName } from "./branches-config.js";
import {
  collection, collectionGroup, getDocs, query, where, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ACCENT  = '#7A4E2A';
const ACCENT2 = '#C9A27A';
const ACCENT3 = '#E8D5B7';
const GRID    = '#E3D6C1';
const BRANCH_COLORS = [ACCENT, ACCENT2, '#E8B87A', '#D4A06A'];

Chart.defaults.font.family = '-apple-system,"Segoe UI",Roboto,sans-serif';
Chart.defaults.color = '#8A7860';

let allPurchases = [];
let allCustomers = [];
let branchTotalsAllTime = {};
let activeBranch = 'all';
let activeTime   = 'monthly';
let activeDailyBranch = 'all';
let barChartInstance = null;

requireAdmin(() => {
  loadReport();
});

async function loadReport() {
  const area = document.getElementById("reportArea");
  try {
    // Every chart on this page (monthly/weekly/daily) only ever shows the
    // last 6 months at most, so we only fetch that much data — no matter
    // how far back the shop's full history goes, this read stays a fixed,
    // predictable size instead of growing forever.
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    cutoff.setDate(1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const [pSnap, cSnap, statsSnap] = await Promise.all([
      getDocs(query(collectionGroup(db, "purchases"), where("date", ">=", cutoffStr))),
      getDocs(collection(db, "customers")),
      getDoc(doc(db, "stats", "branchTotals")),
    ]);
    allPurchases = pSnap.docs.map(d => d.data());
    allCustomers = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    branchTotalsAllTime = statsSnap.exists() ? statsSnap.data() : {};
    renderAll(area);
  } catch (err) {
    area.innerHTML = '<div class="empty-state">Failed to load report</div>';
    console.error(err);
  }
}

function monthKey(date) {
  if (!date) date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0');
}

function lastNMonthKeys(n) {
  const keys = [], now = new Date();
  for (let i = n-1; i >= 0; i--) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth()-i, 1)));
  }
  return keys;
}

function monthLabel(key) {
  const parts = key.split('-');
  return new Date(+parts[0], +parts[1]-1, 1).toLocaleString('en-US', {month:'short'});
}

function weekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}

function weekLabel(ws) {
  const d = new Date(ws);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return 'W' + wk + ' ' + d.toLocaleString('en-US', {month:'short'});
}

function filteredPurchases() {
  if (activeBranch === 'all') return allPurchases;
  return allPurchases.filter(p => p.branch === activeBranch);
}

function trendText(current, prev) {
  if (prev === 0 || prev === null || prev === undefined) return '— no prior data';
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0) return '▲ ' + pct + '% vs last month';
  if (pct < 0) return '▼ ' + Math.abs(pct) + '% vs last month';
  return '— same as last month';
}

function trendClass(current, prev) {
  if (!prev) return 'neutral';
  return current >= prev ? 'up' : 'down';
}

function e(s) {
  return String(s).replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function renderAll(area) {
  const now   = new Date();
  const thisM = monthKey(now);
  const lastM = monthKey(new Date(now.getFullYear(), now.getMonth()-1, 1));
  const fp    = filteredPurchases();

  // Sales by month (filtered)
  const salesByMonth = {};
  fp.forEach(p => {
    const k = (p.date || '').slice(0,7);
    if (k) salesByMonth[k] = (salesByMonth[k] || 0) + (p.amount || 0);
  });
  const thisMonthSales = salesByMonth[thisM] || 0;
  const lastMonthSales = salesByMonth[lastM] || 0;

  // New customers
  const newThisMonth = allCustomers.filter(c => {
    const d = c.createdAt && c.createdAt.seconds ? new Date(c.createdAt.seconds * 1000) : new Date(0);
    return d.toISOString().slice(0,7) === thisM;
  }).length;

  // Vouchers & VIP
  const activeVouchers = allCustomers.reduce((s,c) => s + (c.activeVoucherCount || 0), 0);
  const vipCount = allCustomers.filter(c => {
    const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    return lv && lv.name === 'VIP';
  }).length;

  // Branch sales all-time — read from the aggregate doc kept up to date at
  // purchase-time, instead of re-scanning every purchase ever recorded.
  const branchEntries = Object.entries(branchTotalsAllTime).sort((a,b) => b[1]-a[1]);
  const branchTotal   = branchEntries.reduce((s, e2) => s + e2[1], 0) || 1;

  // Per-branch this/last month
  const branchThisM = {}, branchLastM = {};
  allPurchases.forEach(p => {
    if (!p.branch) return;
    const k = (p.date || '').slice(0,7);
    if (k === thisM) branchThisM[p.branch] = (branchThisM[p.branch] || 0) + (p.amount || 0);
    if (k === lastM) branchLastM[p.branch] = (branchLastM[p.branch] || 0) + (p.amount || 0);
  });

  // Level counts
  const lvc = {VIP:0, Gold:0, Silver:0, None:0};
  allCustomers.forEach(c => {
    const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    if (lv) lvc[lv.name] = (lvc[lv.name] || 0) + 1; else lvc.None++;
  });

  // Top customers
  const top10 = [...allCustomers]
    .sort((a,b) => (b.totalPurchases||0) - (a.totalPurchases||0)).slice(0,10);

  const branchTitle = activeBranch === 'all' ? 'All Branches' : shortBranchName(activeBranch);

  // Build filter tabs
  let filterTabs = '<button class="filter-tab ' + (activeBranch==='all'?'active':'') + '" data-branch="all">All Branches</button>';
  BRANCHES.forEach(b => {
    filterTabs += '<button class="filter-tab ' + (activeBranch===b?'active':'') + '" data-branch="' + e(b) + '">' + e(shortBranchName(b)) + '</button>';
  });

  // Build per-branch cards
  let branchCards = '';
  branchEntries.forEach(function(entry) {
    const branch = entry[0];
    const thisB  = branchThisM[branch] || 0;
    const lastB  = branchLastM[branch] || 0;
    const short  = shortBranchName(branch);
    branchCards += '<div class="trend-card">' +
      '<div class="lbl">' + e(short) + '</div>' +
      '<div class="num">' + thisB.toLocaleString('en-US') + ' <span style="font-size:11px;color:var(--text-dim)">AED</span></div>' +
      '<div class="trend-line ' + trendClass(thisB, lastB) + '">' + trendText(thisB, lastB) + '</div>' +
      '</div>';
  });

  // Build top customers rows
  let topRows = '';
  top10.forEach(c => {
    const lv  = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    const lvN = lv ? lv.name : '—';
    const lvC = lv ? lv.name.toLowerCase() : 'none';
    topRows += '<div class="t-row">' +
      '<span class="t-name">' + e(c.name || 'Unnamed') + '</span>' +
      '<span><span class="level-badge level-' + lvC + '">' + lvN + '</span></span>' +
      '<span>' + (c.totalPoints || 0) + '</span>' +
      '<span class="t-amt">' + (c.totalPurchases||0).toLocaleString('en-US') + '</span>' +
      '</div>';
  });

  area.innerHTML =
    '<div class="filter-bar">' + filterTabs + '</div>' +

    '<div class="section-title">Overview — This Month · ' + e(branchTitle) + '</div>' +
    '<div class="trend-grid">' +
      '<div class="trend-card"><div class="lbl">Sales This Month</div>' +
        '<div class="num">' + thisMonthSales.toLocaleString('en-US') + ' <span style="font-size:11px;color:var(--text-dim)">AED</span></div>' +
        '<div class="trend-line ' + trendClass(thisMonthSales, lastMonthSales) + '">' + trendText(thisMonthSales, lastMonthSales) + '</div></div>' +
      '<div class="trend-card"><div class="lbl">New Customers</div>' +
        '<div class="num">' + newThisMonth + '</div>' +
        '<div class="trend-line neutral">— this month (all branches)</div></div>' +
      '<div class="trend-card green"><div class="lbl">Active Vouchers</div>' +
        '<div class="num">' + activeVouchers + '</div>' +
        '<div class="trend-line neutral">— across all customers</div></div>' +
      '<div class="trend-card purple"><div class="lbl">VIP Customers</div>' +
        '<div class="num">' + vipCount + '</div>' +
        '<div class="trend-line neutral">— last 3 months</div></div>' +
    '</div>' +

    '<div class="section-title">This Month — By Branch</div>' +
    '<div class="trend-grid">' + branchCards + '</div>' +

    '<div class="section-title">Sales Chart · ' + e(branchTitle) + '</div>' +
    '<div class="chart-card">' +
      '<div class="chart-title">Revenue Trend</div>' +
      '<div class="time-toggle">' +
        '<button class="time-btn ' + (activeTime==='monthly'?'active':'') + '" data-time="monthly">Monthly</button>' +
        '<button class="time-btn ' + (activeTime==='weekly'?'active':'') + '" data-time="weekly">Weekly</button>' +
        '<button class="time-btn ' + (activeTime==='daily'?'active':'') + '" data-time="daily">Daily</button>' +
      '</div>' +
      '<div class="branch-pills" id="dailyBranchPills" style="display:' + (activeTime==='daily'?'flex':'none') + '">' +
        '<button class="branch-pill ' + (activeDailyBranch==='all'?'active':'') + '" data-daily-branch="all">All</button>' +
        BRANCHES.map(b => '<button class="branch-pill ' + (activeDailyBranch===b?'active':'') + '" data-daily-branch="' + e(b) + '">' + e(shortBranchName(b)) + '</button>').join('') +
      '</div>' +
      '<div class="chart-wrap"><canvas id="barChart"></canvas></div>' +
    '</div>' +

    '<div class="section-title">Branch & Customer Mix</div>' +
    '<div class="duo-grid">' +
      '<div class="mini-chart-card"><div class="chart-title">Branch Sales</div>' +
        '<div class="mini-wrap"><canvas id="donutChart"></canvas></div>' +
        '<div class="legend" id="branchLegend"></div>' +
        '<button id="recalcBranchBtn" style="margin-top:10px; background:none; border:none; color:var(--text-dim); font-size:10px; text-decoration:underline; cursor:pointer; font-family:inherit; padding:0;">Recalculate from full history</button>' +
      '</div>' +
      '<div class="mini-chart-card"><div class="chart-title">Customer Levels</div>' +
        '<div class="mini-wrap"><canvas id="pieChart"></canvas></div>' +
        '<div class="legend">' +
          '<div class="legend-item"><div class="legend-dot" style="background:#8C5E96"></div>VIP: ' + lvc.VIP + '</div>' +
          '<div class="legend-item"><div class="legend-dot" style="background:#9C7A30"></div>Gold: ' + lvc.Gold + '</div>' +
          '<div class="legend-item"><div class="legend-dot" style="background:#7E7660"></div>Silver: ' + lvc.Silver + '</div>' +
          '<div class="legend-item"><div class="legend-dot" style="background:#E3D6C1"></div>None: ' + lvc.None + '</div>' +
        '</div></div>' +
    '</div>' +

    (activeTime === 'daily' ? buildDailyTableHTML(allPurchases) : '') +

    '<div class="section-title">Top Customers</div>' +
    '<div class="top-table">' +
      '<div class="t-head"><span>Name</span><span>Level</span><span>Points</span><span>Total (AED)</span></div>' +
      topRows +
    '</div>';

  // Charts
  buildBarChart(fp);
  buildDonutChart(branchEntries, branchTotal);
  buildPieChart(lvc);

  // Legend
  const legendEl = document.getElementById('branchLegend');
  if (legendEl) {
    legendEl.innerHTML = branchEntries.map((entry, i) =>
      '<div class="legend-item"><div class="legend-dot" style="background:' + (BRANCH_COLORS[i] || '#ccc') + '"></div>' +
      e(shortBranchName(entry[0])) + ': ' + Math.round((entry[1]/branchTotal)*100) + '%</div>'
    ).join('');
  }

  // Event listeners
  area.querySelectorAll('[data-branch]').forEach(btn => {
    btn.addEventListener('click', () => { activeBranch = btn.dataset.branch; renderAll(area); });
  });
  area.querySelectorAll('[data-time]').forEach(btn => {
    btn.addEventListener('click', () => { activeTime = btn.dataset.time; renderAll(area); });
  });

  area.querySelectorAll('[data-daily-branch]').forEach(btn => {
    btn.addEventListener('click', () => { activeDailyBranch = btn.dataset.dailyBranch; renderAll(area); });
  });

  const recalcBtn = document.getElementById('recalcBranchBtn');
  if (recalcBtn) recalcBtn.addEventListener('click', () => recalculateBranchTotals(recalcBtn));
}

function buildBarChart(fp) {
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
  const now = new Date();
  const thisM = monthKey(now);
  const ctx = document.getElementById('barChart');

  if (activeTime === 'monthly') {
    const months6 = lastNMonthKeys(6);
    const byMonth = {};
    fp.forEach(p => {
      const k = (p.date || '').slice(0,7);
      if (k) byMonth[k] = (byMonth[k] || 0) + (p.amount || 0);
    });
    barChartInstance = new Chart(ctx, {
      type:'bar',
      data:{ labels: months6.map(monthLabel), datasets:[{
        data: months6.map(k => byMonth[k]||0),
        backgroundColor: months6.map(k => k===thisM?ACCENT:ACCENT3),
        borderRadius:6, borderSkipped:false
      }]},
      options: barOpts()
    });

  } else if (activeTime === 'weekly') {
    const byWeek = {};
    fp.forEach(p => {
      if (!p.date) return;
      const ws = weekStart(p.date);
      byWeek[ws] = (byWeek[ws]||0) + (p.amount||0);
    });
    const weeks = Object.keys(byWeek).sort().slice(-8);
    const lastWk = weeks[weeks.length-1];
    barChartInstance = new Chart(ctx, {
      type:'bar',
      data:{ labels: weeks.map(weekLabel), datasets:[{
        data: weeks.map(w => byWeek[w]||0),
        backgroundColor: weeks.map(w => w===lastWk?ACCENT:ACCENT3),
        borderRadius:6, borderSkipped:false
      }]},
      options: barOpts()
    });

  } else {
    // Daily — line chart per branch, last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate()-30);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const relevant = allPurchases.filter(p => p.date && p.date >= cutoffStr);
    const days = [...new Set(relevant.map(p => p.date))].sort();

    const byDayBranch = {};
    relevant.forEach(p => {
      if (!byDayBranch[p.date]) byDayBranch[p.date] = {};
      const b = p.branch || 'Unknown';
      byDayBranch[p.date][b] = (byDayBranch[p.date][b]||0) + (p.amount||0);
    });

    const datasets = [];
    if (activeDailyBranch === 'all') {
      BRANCHES.forEach((branch, i) => {
        const color = BRANCH_COLORS[i];
        datasets.push({
          label: shortBranchName(branch),
          data: days.map(d => (byDayBranch[d] && byDayBranch[d][branch]) || 0),
          borderColor: color, backgroundColor: color+'33',
          tension:.3, fill:true, pointRadius:3, pointHoverRadius:5
        });
      });
    } else {
      const color = BRANCH_COLORS[BRANCHES.indexOf(activeDailyBranch)] || ACCENT;
      datasets.push({
        label: shortBranchName(activeDailyBranch),
        data: days.map(d => (byDayBranch[d] && byDayBranch[d][activeDailyBranch]) || 0),
        borderColor: color, backgroundColor: color+'33',
        tension:.3, fill:true, pointRadius:3, pointHoverRadius:5
      });
    }

    barChartInstance = new Chart(ctx, {
      type:'line',
      data:{ labels: days.map(d => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})), datasets },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{ display:true, position:'top', labels:{font:{size:11},boxWidth:12,padding:10} },
          tooltip:{ callbacks:{ label: c2 => ' '+c2.dataset.label+': '+c2.parsed.y.toLocaleString()+' AED' } }
        },
        scales:{
          x:{ grid:{display:false}, ticks:{font:{size:10},maxRotation:45} },
          y:{ grid:{color:GRID}, ticks:{font:{size:10}, callback: v => v>=1000?(v/1000)+'k':v} }
        }
      }
    });
  }
}

function barOpts() {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c2 => ' '+c2.parsed.y.toLocaleString()+' AED' } } },
    scales:{
      x:{ grid:{display:false}, ticks:{font:{size:11}} },
      y:{ grid:{color:GRID}, ticks:{font:{size:10}, callback: v => v>=1000?(v/1000)+'k':v} }
    }
  };
}

function buildDailyTableHTML(purchases) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate()-30);
  const cutoffStr = cutoff.toISOString().slice(0,10);

  const relevant = purchases.filter(p => p.date && p.date >= cutoffStr);
  const byDay = {};
  relevant.forEach(p => {
    if (!byDay[p.date]) byDay[p.date] = {};
    const b = p.branch || 'Unknown';
    byDay[p.date][b] = (byDay[p.date][b]||0) + (p.amount||0);
  });

  const days = Object.keys(byDay).sort().reverse();
  if (days.length === 0) return '<div class="empty-state" style="margin-bottom:14px;">No sales in the last 30 days</div>';

  const branchHeaders = BRANCHES.map(b => '<span>' + e(shortBranchName(b)) + '</span>').join('');
  let rows = '';
  days.forEach(d => {
    const label = new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    const vals  = BRANCHES.map(b => byDay[d][b]||0);
    const total = vals.reduce((s,v)=>s+v,0);
    rows += '<div class="t-row"><span class="date-col">'+label+'</span>' +
      vals.map(v => '<span class="d-amt">'+(v>0?v.toLocaleString('en-US'):'—')+'</span>').join('') +
      '<span class="d-total">'+total.toLocaleString('en-US')+'</span></div>';
  });

  return '<div class="section-title">Daily Breakdown — Last 30 Days</div>' +
    '<div class="daily-table"><div class="t-head"><span>Date</span>'+branchHeaders+'<span>Total</span></div>'+rows+'</div>';
}

function buildDonutChart(branchEntries, branchTotal) {
  new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: {
      labels: branchEntries.map(e2 => e2[0]),
      datasets: [{ data: branchEntries.map(e2 => e2[1]), backgroundColor: BRANCH_COLORS, borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: {display:false}, tooltip: { callbacks: { label: ctx => ' ' + Math.round((ctx.parsed/branchTotal)*100) + '% — ' + ctx.parsed.toLocaleString() + ' AED' } } }
    }
  });
}

function buildPieChart(lvc) {
  new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['VIP','Gold','Silver','None'],
      datasets: [{ data: [lvc.VIP, lvc.Gold, lvc.Silver, lvc.None], backgroundColor: ['#8C5E96','#9C7A30','#7E7660','#E3D6C1'], borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: {display:false}, tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.parsed } } }
    }
  });
}

// One-time (or occasional) full historical scan to rebuild the branch-totals
// aggregate doc from scratch. Normally the aggregate is kept current
// automatically at purchase-time (see customer.js), so this is only needed
// once — e.g. right after this feature was added, to backfill totals from
// purchases recorded before the aggregate existed.
async function recalculateBranchTotals(btn) {
  const originalText = btn.textContent;
  btn.textContent = 'Recalculating...';
  btn.disabled = true;
  try {
    const snap = await getDocs(collectionGroup(db, 'purchases'));
    const totals = {};
    snap.docs.forEach(d => {
      const p = d.data();
      if (p.branch) totals[p.branch] = (totals[p.branch] || 0) + (p.amount || 0);
    });
    await setDoc(doc(db, 'stats', 'branchTotals'), totals);
    branchTotalsAllTime = totals;
    btn.textContent = '✅ Done — refreshing...';
    setTimeout(() => loadReport(), 800);
  } catch (err) {
    btn.textContent = originalText;
    btn.disabled = false;
    alert('Failed to recalculate. Please try again.');
    console.error(err);
  }
}
