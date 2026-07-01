// reports.js — Manager dashboard with charts
import { db, auth } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { MANAGER_EMAILS } from "./manager-config.js";
import { getCustomerLevel, getThreeMonthTotal } from "./levels-config.js";
import {
  collection, collectionGroup, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ACCENT  = '#7A4E2A';
const ACCENT2 = '#C9A27A';
const ACCENT3 = '#E8D5B7';
const GRID    = '#E3D6C1';
const DIM     = '#8A7860';

Chart.defaults.font.family = '-apple-system,"Segoe UI",Roboto,sans-serif';
Chart.defaults.color = DIM;

requireAuth((user) => {
  if (!MANAGER_EMAILS.includes(user.email)) {
    window.location.href = "dashboard.html";
    return;
  }
  loadReport();
});

async function loadReport() {
  const area = document.getElementById("reportArea");
  try {
    const [purchasesSnap, customersSnap] = await Promise.all([
      getDocs(collectionGroup(db, "purchases")),
      getDocs(collection(db, "customers")),
    ]);
    const purchases = purchasesSnap.docs.map(d => d.data());
    const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderReport(area, purchases, customers);
  } catch (err) {
    area.innerHTML = `<div class="empty-state">Failed to load report</div>`;
    console.error(err);
  }
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function lastNMonthKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = n-1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(+y, +m-1, 1).toLocaleString('en-US', { month: 'short' });
}

function renderReport(area, purchases, customers) {
  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMonth = monthKey(lastMonthDate);
  const months6 = lastNMonthKeys(6);

  // ── Sales per month ──
  const salesByMonth = {};
  purchases.forEach(p => {
    const key = (p.date || '').slice(0,7);
    if (key) salesByMonth[key] = (salesByMonth[key] || 0) + (p.amount || 0);
  });

  const thisMonthSales = salesByMonth[thisMonth] || 0;
  const lastMonthSales = salesByMonth[lastMonth] || 0;
  const salesTrend = lastMonthSales > 0
    ? Math.round(((thisMonthSales - lastMonthSales) / lastMonthSales) * 100) : 0;

  // ── New customers this month ──
  const newThisMonth = customers.filter(c => (c.createdAt?.seconds
    ? new Date(c.createdAt.seconds * 1000) : new Date(0)
  ).toISOString().slice(0,7) === thisMonth).length;

  const newLastMonth = customers.filter(c => (c.createdAt?.seconds
    ? new Date(c.createdAt.seconds * 1000) : new Date(0)
  ).toISOString().slice(0,7) === lastMonth).length;

  // ── Vouchers & VIP ──
  const activeVouchers = customers.reduce((s,c) => s + (c.activeVoucherCount || 0), 0);
  const vipCustomers = customers.filter(c => {
    const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    return lv && lv.name === 'VIP';
  });

  // ── Branch sales (all time) ──
  const branchSales = {};
  purchases.forEach(p => {
    if (p.branch) branchSales[p.branch] = (branchSales[p.branch] || 0) + (p.amount || 0);
  });
  const branchEntries = Object.entries(branchSales).sort((a,b) => b[1]-a[1]);
  const branchTotal = branchEntries.reduce((s,[,v]) => s+v, 0);

  // ── Branch sales this month vs last month ──
  const branchThisMonth = {};
  const branchLastMonth = {};
  purchases.forEach(p => {
    if (!p.branch) return;
    const key = (p.date || '').slice(0,7);
    if (key === thisMonth) branchThisMonth[p.branch] = (branchThisMonth[p.branch] || 0) + (p.amount || 0);
    if (key === lastMonth) branchLastMonth[p.branch] = (branchLastMonth[p.branch] || 0) + (p.amount || 0);
  });

  // ── Customer levels ──
  let lvCounts = { VIP:0, Gold:0, Silver:0, None:0 };
  customers.forEach(c => {
    const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    if (lv) lvCounts[lv.name] = (lvCounts[lv.name] || 0) + 1;
    else lvCounts.None++;
  });

  // ── Top customers ──
  const top10 = [...customers]
    .sort((a,b) => (b.totalPurchases||0) - (a.totalPurchases||0))
    .slice(0,10);

  // ── Render HTML ──
  area.innerHTML = `
    <div class="section-title">Overview — This Month</div>
    <div class="trend-grid">
      <div class="trend-card">
        <div class="lbl">Sales This Month</div>
        <div class="num">${thisMonthSales.toLocaleString('en-US')} <span style="font-size:11px;color:var(--text-dim)">AED</span></div>
        <div class="trend-line ${salesTrend>0?'up':salesTrend<0?'down':'neutral'}">
          ${salesTrend>0?'▲':salesTrend<0?'▼':'—'} ${Math.abs(salesTrend)}% vs last month
        </div>
      </div>
      <div class="trend-card">
        <div class="lbl">New Customers</div>
        <div class="num">${newThisMonth}</div>
        <div class="trend-line ${newThisMonth>=newLastMonth?'up':'down'}">
          ${newThisMonth>=newLastMonth?'▲':'▼'} ${Math.abs(newThisMonth-newLastMonth)} vs last month
        </div>
      </div>
      <div class="trend-card green">
        <div class="lbl">Active Vouchers</div>
        <div class="num">${activeVouchers}</div>
        <div class="trend-line neutral">— across all customers</div>
      </div>
      <div class="trend-card purple">
        <div class="lbl">VIP Customers</div>
        <div class="num">${vipCustomers.length}</div>
        <div class="trend-line neutral">— last 3 months</div>
      </div>
    </div>

    <div class="section-title">This Month — By Branch</div>
    <div class="trend-grid">
      ${branchEntries.map(([branch]) => {
        const thisB = branchThisMonth[branch] || 0;
        const lastB = branchLastMonth[branch] || 0;
        const trend = lastB > 0 ? Math.round(((thisB - lastB) / lastB) * 100) : 0;
        const shortName = branch.replace('Al Hudu ', '');
        return `
          <div class="trend-card">
            <div class="lbl">${escHtml(shortName)}</div>
            <div class="num">${thisB.toLocaleString('en-US')} <span style="font-size:11px;color:var(--text-dim)">AED</span></div>
            <div class="trend-line ${trend>0?'up':trend<0?'down':'neutral'}">
              ${trend>0?'▲':trend<0?'▼':'—'} ${lastB > 0 ? Math.abs(trend)+'% vs last month' : 'no data last month'}
            </div>
          </div>`;
      }).join('')}
    </div>

    <div class="section-title">Monthly Sales (Last 6 Months)</div>
    <div class="chart-card">
      <div class="chart-title">Revenue Trend</div>
      <div class="chart-sub">Total sales per month across all branches</div>
      <div class="chart-wrap"><canvas id="barChart"></canvas></div>
    </div>

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

    <div class="section-title">Top Customers</div>
    <div class="top-table">
      <div class="t-head"><span>Name</span><span>Level</span><span>Points</span><span>Total (AED)</span></div>
      ${top10.map(c => {
        const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
        const lvName = lv ? lv.name : '—';
        const lvClass = lv ? lv.name.toLowerCase() : 'none';
        return `<div class="t-row">
          <span class="t-name">${escHtml(c.name||'Unnamed')}</span>
          <span><span class="level-badge level-${lvClass==='—'?'none':lvClass}">${lvName}</span></span>
          <span>${c.totalPoints||0}</span>
          <span class="t-amt">${(c.totalPurchases||0).toLocaleString('en-US')}</span>
        </div>`;
      }).join('')}
    </div>
  `;

  // ── Bar chart ──
  const barData = months6.map(k => salesByMonth[k] || 0);
  const barColors = months6.map(k => k === thisMonth ? ACCENT : ACCENT3);
  new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: months6.map(monthLabel),
      datasets: [{ data: barData, backgroundColor: barColors, borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display:false }, tooltip: {
        callbacks: { label: ctx => ` ${ctx.parsed.y.toLocaleString()} AED` }
      }},
      scales: {
        x: { grid: { display:false }, ticks: { font:{size:11} } },
        y: { grid: { color:GRID }, ticks: { font:{size:10}, callback: v => v>=1000?(v/1000)+'k':v } }
      }
    }
  });

  // ── Donut chart (branches) ──
  const branchColors = [ACCENT, ACCENT2, '#E8B87A', '#D4A06A'];
  new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: {
      labels: branchEntries.map(([b]) => b),
      datasets: [{ data: branchEntries.map(([,v]) => v), backgroundColor: branchColors, borderWidth:0, hoverOffset:4 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'68%',
      plugins: { legend:{display:false}, tooltip: {
        callbacks: { label: ctx => ` ${Math.round((ctx.parsed/branchTotal)*100)}% — ${ctx.parsed.toLocaleString()} AED` }
      }}
    }
  });

  // Branch legend
  document.getElementById('branchLegend').innerHTML = branchEntries.map(([b,v],i) =>
    `<div class="legend-item">
      <div class="legend-dot" style="background:${branchColors[i]||DIM}"></div>
      ${escHtml(b.replace('Al Hudu ',''))}: ${Math.round((v/branchTotal)*100)}%
    </div>`
  ).join('');

  // ── Pie chart (levels) ──
  new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['VIP','Gold','Silver','None'],
      datasets: [{ data: [lvCounts.VIP,lvCounts.Gold,lvCounts.Silver,lvCounts.None],
        backgroundColor:['#8C5E96','#9C7A30','#7E7660','#E3D6C1'], borderWidth:0, hoverOffset:4 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'60%',
      plugins: { legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed}`}} }
    }
  });
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
