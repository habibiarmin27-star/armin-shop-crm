// reports.js — Manager dashboard with branch filter + monthly/weekly toggle
import { db } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { MANAGER_EMAILS } from "./manager-config.js";
import { getCustomerLevel, getThreeMonthTotal } from "./levels-config.js";
import { BRANCHES } from "./branches-config.js";
import { collection, collectionGroup, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ACCENT  = '#7A4E2A';
const ACCENT2 = '#C9A27A';
const ACCENT3 = '#E8D5B7';
const GRID    = '#E3D6C1';
const DIM     = '#8A7860';
const BRANCH_COLORS = [ACCENT, ACCENT2, '#E8B87A', '#D4A06A'];

Chart.defaults.font.family = '-apple-system,"Segoe UI",Roboto,sans-serif';
Chart.defaults.color = DIM;

let allPurchases = [];
let allCustomers = [];
let activeBranch = 'all';   // 'all' | branch name
let activeTime   = 'monthly'; // 'monthly' | 'weekly'
let barChartInstance = null;

requireAuth((user) => {
  if (!MANAGER_EMAILS.includes(user.email)) { window.location.href = "dashboard.html"; return; }
  loadReport();
});

async function loadReport() {
  const area = document.getElementById("reportArea");
  try {
    const [pSnap, cSnap] = await Promise.all([
      getDocs(collectionGroup(db, "purchases")),
      getDocs(collection(db, "customers")),
    ]);
    allPurchases = pSnap.docs.map(d => d.data());
    allCustomers = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll(area);
  } catch (err) {
    area.innerHTML = `<div class="empty-state">Failed to load report</div>`;
    console.error(err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function lastNMonthKeys(n) {
  const keys = [], now = new Date();
  for (let i = n-1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

function monthLabel(key) {
  const [y,m] = key.split('-');
  return new Date(+y,+m-1,1).toLocaleString('en-US',{month:'short'});
}

// Returns ISO week label "Wn MMM" for a date string "YYYY-MM-DD"
function weekLabel(dateStr) {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(),0,1);
  const wk = Math.ceil(((d-jan1)/86400000 + jan1.getDay()+1)/7);
  return `W${wk} ${d.toLocaleString('en-US',{month:'short'})}`;
}

// Get start-of-week (Mon) for a date string
function weekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}

// Filtered purchases by active branch
function filteredPurchases() {
  if (activeBranch === 'all') return allPurchases;
  return allPurchases.filter(p => p.branch === activeBranch);
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, m =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderAll(area) {
  const now   = new Date();
  const thisM = monthKey(now);
  const lastM = monthKey(new Date(now.getFullYear(), now.getMonth()-1, 1));
  const fp    = filteredPurchases();

  // Sales this/last month (filtered)
  const salesByMonth = {};
  fp.forEach(p => {
    const k = (p.date||'').slice(0,7);
    if (k) salesByMonth[k] = (salesByMonth[k]||0) + (p.amount||0);
  });
  const thisMonthSales = salesByMonth[thisM]||0;
  const lastMonthSales = salesByMonth[lastM]||0;
  const salesTrend = lastMonthSales > 0
    ? Math.round(((thisMonthSales-lastMonthSales)/lastMonthSales)*100) : null;

  // New customers this month (not branch-filtered — always total)
  const newThisMonth = allCustomers.filter(c =>
    (c.createdAt?.seconds ? new Date(c.createdAt.seconds*1000) : new Date(0))
      .toISOString().slice(0,7) === thisM).length;

  // Vouchers & VIP (always total)
  const activeVouchers = allCustomers.reduce((s,c)=>s+(c.activeVoucherCount||0),0);
  const vipCount = allCustomers.filter(c => {
    const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    return lv && lv.name === 'VIP';
  }).length;

  // Branch sales (all time, for donut)
  const branchSales = {};
  allPurchases.forEach(p => {
    if (p.branch) branchSales[p.branch] = (branchSales[p.branch]||0) + (p.amount||0);
  });
  const branchEntries = Object.entries(branchSales).sort((a,b)=>b[1]-a[1]);
  const branchTotal   = branchEntries.reduce((s,[,v])=>s+v, 0);

  // Per-branch this month
  const branchThisMonth = {}, branchLastMonth = {};
  allPurchases.forEach(p => {
    if (!p.branch) return;
    const k = (p.date||'').slice(0,7);
    if (k===thisM) branchThisMonth[p.branch] = (branchThisMonth[p.branch]||0)+(p.amount||0);
    if (k===lastM) branchLastMonth[p.branch] = (branchLastMonth[p.branch]||0)+(p.amount||0);
  });

  // Level counts (always total)
  const lvCounts = {VIP:0,Gold:0,Silver:0,None:0};
  allCustomers.forEach(c => {
    const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    if (lv) lvCounts[lv.name] = (lvCounts[lv.name]||0)+1; else lvCounts.None++;
  });

  // Top customers
  const top10 = [...allCustomers]
    .sort((a,b)=>(b.totalPurchases||0)-(a.totalPurchases||0)).slice(0,10);

  // Branch label for title
  const branchLabel = activeBranch === 'all' ? 'All Branches'
    : activeBranch.replace('Al Hudu ','');

  // ── HTML ──
  area.innerHTML = `
    <!-- Branch filter tabs -->
    <div class="filter-bar">
      <button class="filter-tab ${activeBranch==='all'?'active':''}" data-branch="all">All Branches</button>
      ${BRANCHES.map(b => `
        <button class="filter-tab ${activeBranch===b?'active':''}" data-branch="${escHtml(b)}">
          ${escHtml(b.replace('Al Hudu ',''))}
        </button>`).join('')}
    </div>

    <!-- Overview cards -->
    <div class="section-title">Overview — This Month · ${escHtml(branchLabel)}</div>
    <div class="trend-grid">
      <div class="trend-card">
        <div class="lbl">Sales This Month</div>
        <div class="num">${thisMonthSales.toLocaleString('en-US')} <span style="font-size:11px;color:var(--text-dim)">AED</span></div>
        <div class="trend-line ${salesTrend===null?'neutral':salesTrend>0?'up':'down'}">
          ${salesTrend===null ? '— no prior data' : salesTrend>0 ? '▲ '+salesTrend+'% vs last month' : salesTrend<0 ? '▼ '+Math.abs(salesTrend)+'% vs last month' : '— same as last month'}
        </div>
      </div>
      <div class="trend-card">
        <div class="lbl">New Customers</div>
        <div class="num">${newThisMonth}</div>
        <div class="trend-line neutral">— this month (all branches)</div>
      </div>
      <div class="trend-card green">
        <div class="lbl">Active Vouchers</div>
        <div class="num">${activeVouchers}</div>
        <div class="trend-line neutral">— across all customers</div>
      </div>
      <div class="trend-card purple">
        <div class="lbl">VIP Customers</div>
        <div class="num">${vipCount}</div>
        <div class="trend-line neutral">— last 3 months</div>
      </div>
    </div>

    <!-- Per-branch this month -->
    <div class="section-title">This Month — By Branch</div>
    <div class="trend-grid">
      ${branchEntries.map(([branch]) => {
        const thisB = branchThisMonth[branch]||0;
        const lastB = branchLastMonth[branch]||0;
        const tr = lastB > 0 ? Math.round(((thisB-lastB)/lastB)*100) : null;
        const short = branch.replace('Al Hudu ','');
        return `<div class="trend-card">
          <div class="lbl">${escHtml(short)}</div>
          <div class="num">${thisB.toLocaleString('en-US')} <span style="font-size:11px;color:var(--text-dim)">AED</span></div>
          <div class="trend-line ${tr===null?'neutral':tr>0?'up':'down'}">
            ${tr===null ? '— no prior data' : tr>0 ? '▲ '+tr+'% vs last month' : tr<0 ? '▼ '+Math.abs(tr)+'% vs last month' : '— same as last month'}
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- Chart with time toggle -->
    <div class="section-title">Sales Chart · ${escHtml(branchLabel)}</div>
    <div class="chart-card">
      <div class="chart-title">Revenue Trend</div>
      <div class="time-toggle">
        <button class="time-btn ${activeTime==='monthly'?'active':''}" data-time="monthly">Monthly (6 mo)</button>
        <button class="time-btn ${activeTime==='weekly'?'active':''}" data-time="weekly">Weekly (8 wk)</button>
      </div>
      <div class="chart-wrap"><canvas id="barChart"></canvas></div>
    </div>

    <!-- Donut + Pie -->
    <div class="section-title">Branch & Customer Mix</div>
    <div class="duo-grid">
      <div class="mini-chart-card">
        <div class="chart-title">Branch Sales</div>
        <div class="mini-wrap"><canvas id="donutChart"></canvas></div>
        <div class="legend" id="branchLegend"></div>
      </div>
      <div class="mini-chart-card">
        <div class="chart-title">Customer Levels</div>
        <div class="mini-wrap"><canvas id="pieChart"></canvas></div>
        <div class="legend">
          <div class="legend-item"><div class="legend-dot" style="background:#8C5E96"></div>VIP: ${lvCounts.VIP}</div>
          <div class="legend-item"><div class="legend-dot" style="background:#9C7A30"></div>Gold: ${lvCounts.Gold}</div>
          <div class="legend-item"><div class="legend-dot" style="background:#7E7660"></div>Silver: ${lvCounts.Silver}</div>
          <div class="legend-item"><div class="legend-dot" style="background:#E3D6C1"></div>None: ${lvCounts.None}</div>
        </div>
      </div>
    </div>

    <!-- Top customers -->
    <div class="section-title">Top Customers</div>
    <div class="top-table">
      <div class="t-head"><span>Name</span><span>Level</span><span>Points</span><span>Total (AED)</span></div>
      ${top10.map(c => {
        const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
        const lvN = lv ? lv.name : '—';
        const lvC = lv ? lv.name.toLowerCase() : 'none';
        return `<div class="t-row">
          <span class="t-name">${escHtml(c.name||'Unnamed')}</span>
          <span><span class="level-badge level-${lvC}">${lvN}</span></span>
          <span>${c.totalPoints||0}</span>
          <span class="t-amt">${(c.totalPurchases||0).toLocaleString('en-US')}</span>
        </div>`;
      }).join('')}
    </div>
  `;

  // ── Charts ──
  buildBarChart(fp);
  buildDonutChart(branchEntries, branchTotal);
  buildPieChart(lvCounts);
  buildBranchLegend(branchEntries, branchTotal);

  // ── Event listeners ──
  area.querySelectorAll('[data-branch]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeBranch = btn.dataset.branch;
      renderAll(area);
    });
  });

  area.querySelectorAll('[data-time]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTime = btn.dataset.time;
      renderAll(area);
    });
  });
}

// ── Build bar chart ───────────────────────────────────────────────────────────

function buildBarChart(fp) {
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }

  let labels = [], data = [], colors = [];

  if (activeTime === 'monthly') {
    const months6 = lastNMonthKeys(6);
    const now = new Date(); const thisM = monthKey(now);
    const byMonth = {};
    fp.forEach(p => {
      const k = (p.date||'').slice(0,7);
      if (k) byMonth[k] = (byMonth[k]||0)+(p.amount||0);
    });
    labels = months6.map(monthLabel);
    data   = months6.map(k => byMonth[k]||0);
    colors = months6.map(k => k===thisM ? ACCENT : ACCENT3);

  } else {
    // Weekly — last 8 weeks
    const byWeek = {};
    fp.forEach(p => {
      if (!p.date) return;
      const ws = weekStart(p.date);
      byWeek[ws] = (byWeek[ws]||0)+(p.amount||0);
    });
    const weeks = Object.keys(byWeek).sort().slice(-8);
    labels = weeks.map(w => weekLabel(w));
    data   = weeks.map(w => byWeek[w]||0);
    const lastWk = weeks[weeks.length-1];
    colors = weeks.map(w => w===lastWk ? ACCENT : ACCENT3);
  }

  barChartInstance = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{
        callbacks:{ label: ctx => ` ${ctx.parsed.y.toLocaleString()} AED` }
      }},
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:11}} },
        y: { grid:{color:GRID}, ticks:{font:{size:10}, callback: v => v>=1000?(v/1000)+'k':v} }
      }
    }
  });
}

function buildDonutChart(branchEntries, branchTotal) {
  new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: {
      labels: branchEntries.map(([b])=>b),
      datasets:[{ data: branchEntries.map(([,v])=>v), backgroundColor: BRANCH_COLORS, borderWidth:0, hoverOffset:4 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins:{ legend:{display:false}, tooltip:{
        callbacks:{ label: ctx => ` ${Math.round((ctx.parsed/branchTotal)*100)}% — ${ctx.parsed.toLocaleString()} AED` }
      }}
    }
  });
}

function buildPieChart(lvCounts) {
  new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['VIP','Gold','Silver','None'],
      datasets:[{ data:[lvCounts.VIP,lvCounts.Gold,lvCounts.Silver,lvCounts.None],
        backgroundColor:['#8C5E96','#9C7A30','#7E7660','#E3D6C1'], borderWidth:0, hoverOffset:4 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'60%',
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed}`}} }
    }
  });
}

function buildBranchLegend(branchEntries, branchTotal) {
  const el = document.getElementById('branchLegend');
  if (!el) return;
  el.innerHTML = branchEntries.map(([b,v],i) =>
    `<div class="legend-item">
      <div class="legend-dot" style="background:${BRANCH_COLORS[i]||'#ccc'}"></div>
      ${escHtml(b.replace('Al Hudu ',''))}: ${Math.round((v/branchTotal)*100)}%
    </div>`
  ).join('');
}
