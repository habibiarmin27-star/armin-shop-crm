// staff-profile.js — Admin-only: real-time performance profile for one staff member.
// Reached by clicking a staff member's row in Staff Management (staff.html).
import { db } from "./firebase-init.js";
import { requireAdmin } from "./auth-guard.js";
import { shortBranchName } from "./branches-config.js";
import {
  collection, collectionGroup, query, where, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ACCENT  = '#7A4E2A';
const ACCENT2 = '#C9A27A';
const GRID    = '#E3D6C1';

Chart.defaults.font.family = '-apple-system,"Segoe UI",Roboto,sans-serif';
Chart.defaults.color = '#8A7860';

const params = new URLSearchParams(window.location.search);
const staffEmail = params.get("email");

if (!staffEmail) {
  window.location.href = "staff.html";
}

let staffRole = "staff";           // this profile's own role (for the badge)
let customersById = {};            // custId -> name, for the purchase table
let myPurchases = [];              // every purchase this staff member has ever recorded (live)
let myVouchers = [];                // every voucher this staff member has ever redeemed (live)
let teamThisMonth = {};             // { email: totalThisMonthAED } across the whole team (live)
let dateFilterValue = "";
let dailyChartInstance = null;
let compareChartInstance = null;

requireAdmin(() => { init(); });

function init() {
  loadStaffRoleAndCustomers();
  listenMyPurchases();
  listenMyVouchers();
  listenTeamThisMonth();
}

// One-time reads: this staff member's own role (for the badge) and the
// customer name lookup (customer names rarely change moment-to-moment, so
// unlike the sales figures below, these don't need to be real-time).
async function loadStaffRoleAndCustomers() {
  try {
    const [staffSnap, custSnap] = await Promise.all([
      getDocs(collection(db, "staff")),
      getDocs(collection(db, "customers")),
    ]);
    const me = staffSnap.docs.find(d => d.id === staffEmail);
    staffRole = me && me.data().role === "admin" ? "admin" : "staff";
    customersById = {};
    custSnap.docs.forEach(d => { customersById[d.id] = d.data().name || "Unnamed"; });
  } catch (err) {
    console.error("Failed to load staff/customers", err);
  }
  renderAll();
}

// Every purchase ever recorded by this staff member, across every customer
// and branch. Deliberately NOT date-bounded: it's scoped to a single staff
// member's own history (inherently small), not the whole store, so it stays
// cheap without needing a composite index on (recordedBy + date).
function listenMyPurchases() {
  const q = query(collectionGroup(db, "purchases"), where("recordedBy", "==", staffEmail));
  onSnapshot(q, (snap) => {
    myPurchases = snap.docs.map(d => {
      const custId = d.ref.parent.parent ? d.ref.parent.parent.id : null;
      return { ...d.data(), custId };
    });
    renderAll();
  }, (err) => {
    document.getElementById("profileArea").innerHTML =
      '<div class="empty-state">Failed to load sales data</div>';
    console.error(err);
  });
}

// Every voucher this staff member has redeemed at the scanner.
function listenMyVouchers() {
  const q = query(collection(db, "vouchers"), where("usedBy", "==", staffEmail));
  onSnapshot(q, (snap) => {
    myVouchers = snap.docs.map(d => d.data());
    renderAll();
  }, (err) => console.error(err));
}

// Store-wide purchases for the current month only, grouped client-side by
// who recorded them. This powers the team comparison chart. Bounded to a
// single range filter on `date` — same pattern reports.js already uses, so
// no extra index is needed.
function listenTeamThisMonth() {
  const start = monthKey(new Date()) + "-01";
  const q = query(collectionGroup(db, "purchases"), where("date", ">=", start));
  onSnapshot(q, (snap) => {
    const totals = {};
    snap.docs.forEach(d => {
      const p = d.data();
      if (!p.recordedBy) return;
      totals[p.recordedBy] = (totals[p.recordedBy] || 0) + (p.amount || 0);
    });
    teamThisMonth = totals;
    renderAll();
  }, (err) => console.error(err));
}

// ---- Date helpers (same conventions as reports.js) ----
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function weekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function trendText(current, prev) {
  if (!prev) return '— no prior data';
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0) return '▲ ' + pct + '% vs last month';
  if (pct < 0) return '▼ ' + Math.abs(pct) + '% vs last month';
  return '— same as last month';
}
function trendClass(current, prev) {
  if (!prev) return 'neutral';
  return current >= prev ? 'up' : 'down';
}
function staffDisplayName(email) {
  if (!email) return 'Unknown';
  const local = email.split('@')[0];
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Crunches myPurchases into every number the page needs. All the "general
// stats" (best day, highest sale, average, vouchers scanned) are scoped to
// THIS month, matching the rest of the page's monthly focus.
function computeStats() {
  const now = new Date();
  const todayS = now.toISOString().slice(0, 10);
  const thisM = monthKey(now);
  const lastM = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const thisWeekStart = weekStart(todayS);

  let today = 0, week = 0, month = 0, lastMonth = 0;
  const monthTotals = {};
  const dayTotals = {};

  myPurchases.forEach(p => {
    const amt = p.amount || 0;
    const d = p.date || '';
    if (!d) return;
    if (d === todayS) today += amt;
    if (d >= thisWeekStart && d <= todayS) week += amt;
    const mk = d.slice(0, 7);
    if (mk === thisM) month += amt;
    if (mk === lastM) lastMonth += amt;
    monthTotals[mk] = (monthTotals[mk] || 0) + amt;
    dayTotals[d] = (dayTotals[d] || 0) + amt;
  });

  const last3Keys = [0, 1, 2].map(i => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const threeMonth = last3Keys.reduce((s, k) => s + (monthTotals[k] || 0), 0);

  let bestDay = null, bestDayAmt = 0;
  Object.entries(dayTotals).forEach(([d, amt]) => {
    if (d.slice(0, 7) === thisM && amt > bestDayAmt) { bestDayAmt = amt; bestDay = d; }
  });

  const thisMonthPurchases = myPurchases.filter(p => (p.date || '').slice(0, 7) === thisM);
  const highestSale = thisMonthPurchases.reduce((m, p) => Math.max(m, p.amount || 0), 0);
  const avgSale = thisMonthPurchases.length
    ? Math.round(thisMonthPurchases.reduce((s, p) => s + (p.amount || 0), 0) / thisMonthPurchases.length)
    : 0;

  const vouchersThisMonth = myVouchers.filter(v => {
    const ms = v.usedAt && v.usedAt.seconds ? new Date(v.usedAt.seconds * 1000) : null;
    return ms && monthKey(ms) === thisM;
  }).length;

  return { today, week, month, lastMonth, threeMonth, bestDay, bestDayAmt, highestSale, avgSale, vouchersThisMonth, dayTotals, thisM, lastM };
}

function e(s) {
  return String(s).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function renderAll() {
  const area = document.getElementById("profileArea");
  const stats = computeStats();

  // Rank among the whole team, by this month's sales
  const ranked = Object.entries(teamThisMonth).sort((a, b) => b[1] - a[1]);
  const rankIdx = ranked.findIndex(([email]) => email === staffEmail);
  const rank = rankIdx >= 0 ? rankIdx + 1 : null;
  const rankTotal = ranked.length;
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank ? ('#' + rank) : '';
  const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
  const rankLabel = rank ? (medal + (rank > 3 ? '' : '') + ' · Rank ' + rank + ' of ' + rankTotal + ' this month') : 'No sales yet this month';

  const name = staffDisplayName(staffEmail);
  const initial = name.charAt(0).toUpperCase();
  const roleClass = staffRole === 'admin' ? 'admin' : 'staff';
  const roleLabel = staffRole === 'admin' ? 'Admin' : 'Staff';

  const bestDayLabel = stats.bestDay
    ? new Date(stats.bestDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' (' + stats.bestDayAmt.toLocaleString('en-US') + ' AED)'
    : '—';

  area.innerHTML =
    '<div class="profile-head">' +
      '<div class="profile-avatar">' + e(initial) + '</div>' +
      '<div>' +
        '<div class="profile-name">' + e(name) + '</div>' +
        '<div class="profile-meta">' +
          '<span>' + e(staffEmail) + '</span>' +
          '<span class="role-pill ' + roleClass + '">' + roleLabel + '</span>' +
          '<span class="rank-pill ' + rankClass + '">' + e(rankLabel) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="section-title">Sales Overview</div>' +
    '<div class="trend-grid">' +
      '<div class="trend-card"><div class="lbl">Today</div>' +
        '<div class="num">' + stats.today.toLocaleString('en-US') + ' <span style="font-size:11px;color:var(--text-dim)">AED</span></div>' +
        '<div class="trend-line neutral">—</div></div>' +
      '<div class="trend-card"><div class="lbl">This Week</div>' +
        '<div class="num">' + stats.week.toLocaleString('en-US') + ' <span style="font-size:11px;color:var(--text-dim)">AED</span></div>' +
        '<div class="trend-line neutral">—</div></div>' +
      '<div class="trend-card"><div class="lbl">This Month</div>' +
        '<div class="num">' + stats.month.toLocaleString('en-US') + ' <span style="font-size:11px;color:var(--text-dim)">AED</span></div>' +
        '<div class="trend-line ' + trendClass(stats.month, stats.lastMonth) + '">' + trendText(stats.month, stats.lastMonth) + '</div></div>' +
      '<div class="trend-card"><div class="lbl">Last 3 Months</div>' +
        '<div class="num">' + stats.threeMonth.toLocaleString('en-US') + ' <span style="font-size:11px;color:var(--text-dim)">AED</span></div>' +
        '<div class="trend-line neutral">—</div></div>' +
    '</div>' +

    '<div class="section-title">Daily Revenue — This Month</div>' +
    '<div class="chart-card">' +
      '<div class="chart-title">This Month vs Last Month</div>' +
      '<div class="chart-sub">Daily sales, day-by-day</div>' +
      '<div class="chart-wrap"><canvas id="dailyChart"></canvas></div>' +
    '</div>' +

    '<div class="section-title">Team Comparison</div>' +
    '<div class="chart-card">' +
      '<div class="chart-title">This Month\u2019s Sales — All Staff</div>' +
      '<div class="chart-sub">' + e(name) + '\u2019s bar is highlighted</div>' +
      '<div class="chart-wrap"><canvas id="compareChart"></canvas></div>' +
    '</div>' +

    '<div class="section-title">General Stats — This Month</div>' +
    '<div class="stat-grid">' +
      '<div class="stat-box"><div class="num" style="font-size:14px;">' + e(bestDayLabel) + '</div><div class="lbl">Best Sales Day</div></div>' +
      '<div class="stat-box"><div class="num">' + stats.highestSale.toLocaleString('en-US') + '</div><div class="lbl">Highest Single Sale (AED)</div></div>' +
      '<div class="stat-box"><div class="num">' + stats.avgSale.toLocaleString('en-US') + '</div><div class="lbl">Average Sale (AED)</div></div>' +
      '<div class="stat-box"><div class="num">' + stats.vouchersThisMonth + '</div><div class="lbl">Vouchers Scanned</div></div>' +
    '</div>' +

    '<div class="section-title">Purchases</div>' +
    '<div class="filter-row">' +
      '<input type="date" id="dateFilter" value="' + e(dateFilterValue) + '">' +
      '<button id="clearFilterBtn">Clear</button>' +
    '</div>' +
    '<div class="top-table">' +
      '<div class="t-head"><span>Date</span><span>Customer</span><span>Branch</span><span style="text-align:right;">AED</span></div>' +
      '<div id="purchaseRows"></div>' +
    '</div>';

  document.getElementById("dateFilter").addEventListener("change", (ev) => {
    dateFilterValue = ev.target.value;
    renderPurchaseTable();
  });
  document.getElementById("clearFilterBtn").addEventListener("click", () => {
    dateFilterValue = "";
    document.getElementById("dateFilter").value = "";
    renderPurchaseTable();
  });

  renderPurchaseTable();
  buildDailyChart(stats);
  buildCompareChart(ranked);
}

function renderPurchaseTable() {
  const el = document.getElementById("purchaseRows");
  if (!el) return;
  let rows = [...myPurchases].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (dateFilterValue) rows = rows.filter(p => p.date === dateFilterValue);

  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">' + (dateFilterValue ? 'No purchases on this date' : 'No purchases recorded yet') + '</div>';
    return;
  }
  el.innerHTML = rows.map(p =>
    '<div class="t-row">' +
      '<span class="t-date">' + e((p.date || '').slice(5)) + '</span>' +
      '<span class="t-name">' + e(p.custId && customersById[p.custId] ? customersById[p.custId] : 'Unknown') + '</span>' +
      '<span class="t-branch">' + e(shortBranchName(p.branch || '—')) + '</span>' +
      '<span class="t-amt">' + (p.amount || 0).toLocaleString('en-US') + '</span>' +
    '</div>'
  ).join('');
}

function buildDailyChart(stats) {
  if (dailyChartInstance) { dailyChartInstance.destroy(); dailyChartInstance = null; }
  const now = new Date();
  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const daysInLastMonth = new Date(lastMonthRef.getFullYear(), lastMonthRef.getMonth() + 1, 0).getDate();
  const maxDays = Math.max(daysInThisMonth, daysInLastMonth);

  const thisMonthDaily = [], lastMonthDaily = [];
  for (let day = 1; day <= maxDays; day++) {
    const dd = String(day).padStart(2, '0');
    thisMonthDaily.push(day <= daysInThisMonth ? (stats.dayTotals[stats.thisM + '-' + dd] || 0) : null);
    lastMonthDaily.push(day <= daysInLastMonth ? (stats.dayTotals[stats.lastM + '-' + dd] || 0) : null);
  }

  dailyChartInstance = new Chart(document.getElementById('dailyChart'), {
    type: 'line',
    data: {
      labels: thisMonthDaily.map((_, i) => i + 1),
      datasets: [
        { label: 'This month', data: thisMonthDaily, borderColor: ACCENT, backgroundColor: 'rgba(122,78,42,.08)', fill: true, tension: .3, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Last month', data: lastMonthDaily, borderColor: ACCENT2, borderDash: [4, 4], fill: false, tension: .3, pointRadius: 0, borderWidth: 2 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxTicksLimit: 8 } },
        y: { beginAtZero: true, grid: { color: GRID }, ticks: { font: { size: 10 } } }
      },
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 10, font: { size: 10.5 } } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + (ctx.parsed.y ?? 0).toLocaleString() + ' AED' } }
      }
    }
  });
}

function buildCompareChart(ranked) {
  if (compareChartInstance) { compareChartInstance.destroy(); compareChartInstance = null; }
  const canvas = document.getElementById('compareChart');
  if (!canvas) return;

  if (ranked.length === 0) {
    canvas.parentElement.innerHTML = '<div class="empty-state" style="padding:36px 0;">No sales recorded by any staff member this month yet</div>';
    return;
  }

  compareChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ranked.map(([email]) => staffDisplayName(email)),
      datasets: [{
        data: ranked.map(([, total]) => total),
        backgroundColor: ranked.map(([email]) => email === staffEmail ? ACCENT : '#E3D6C1'),
        borderRadius: 6, maxBarThickness: 34,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10.5, weight: '600' } } },
        y: { beginAtZero: true, grid: { color: GRID }, ticks: { font: { size: 10 } } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y.toLocaleString() + ' AED this month' } }
      }
    }
  });
}
