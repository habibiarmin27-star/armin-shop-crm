// reports.js
import { db, auth } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { MANAGER_EMAILS } from "./manager-config.js";
import { getCustomerLevel, getThreeMonthTotal } from "./levels-config.js";
import {
  collection, collectionGroup, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

requireAuth((user) => {
  if (!MANAGER_EMAILS.includes(user.email)) {
    // Not a manager — silently bounce back to the normal dashboard.
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

    const purchases = purchasesSnap.docs.map((d) => d.data());
    const customers = customersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    renderReport(area, purchases, customers);
  } catch (err) {
    area.innerHTML = `<div class="empty-state">Failed to load the report</div>`;
    console.error(err);
  }
}

function renderReport(area, purchases, customers) {
  // --- Branch performance ---
  const branchStats = {};
  purchases.forEach((p) => {
    const b = p.branch || "Unknown";
    if (!branchStats[b]) branchStats[b] = { total: 0, count: 0 };
    branchStats[b].total += p.amount || 0;
    branchStats[b].count += 1;
  });
  const branchRows = Object.entries(branchStats)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, s]) => `
      <div class="purchase-row">
        <span class="date">${escapeHtml(name)} · ${s.count} purchases</span>
        <span class="amt">${s.total.toLocaleString("en-US")} AED</span>
      </div>`).join("") || `<div class="empty-state">No purchases recorded yet</div>`;

  // --- Daily sales (last 14 days that had activity) ---
  const dailyStats = {};
  purchases.forEach((p) => {
    const d = p.date || "Unknown";
    dailyStats[d] = (dailyStats[d] || 0) + (p.amount || 0);
  });
  const dailyRows = Object.entries(dailyStats)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)
    .map(([date, total]) => `
      <div class="purchase-row">
        <span class="date">${date}</span>
        <span class="amt">${total.toLocaleString("en-US")} AED</span>
      </div>`).join("") || `<div class="empty-state">No purchases recorded yet</div>`;

  // --- Top spenders (lifetime total) ---
  const topSpenders = [...customers]
    .sort((a, b) => (b.totalPurchases || 0) - (a.totalPurchases || 0))
    .slice(0, 10)
    .map((c) => `
      <a class="customer-item" href="customer.html?id=${c.id}">
        <div class="row">
          <span class="name">${escapeHtml(c.name || "Unnamed")}</span>
          <span class="amt">${(c.totalPurchases || 0).toLocaleString("en-US")} AED</span>
        </div>
      </a>`).join("") || `<div class="empty-state">No customers yet</div>`;

  // --- VIP list (rolling 3-month spend) ---
  const vipCustomers = customers
    .filter((c) => {
      const level = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
      return level && level.name === "VIP";
    })
    .map((c) => `
      <a class="customer-item" href="customer.html?id=${c.id}">
        <div class="row">
          <span class="name">${escapeHtml(c.name || "Unnamed")}</span>
          <span class="level-badge level-vip">VIP</span>
        </div>
      </a>`).join("") || `<div class="empty-state">No VIP customers yet</div>`;

  area.innerHTML = `
    <div class="section-title">Branch Performance</div>
    <div class="card">${branchRows}</div>

    <div class="section-title">Daily Sales (last 14 days)</div>
    <div class="card">${dailyRows}</div>

    <div class="section-title">Top Spenders (lifetime)</div>
    <div class="card">${topSpenders}</div>

    <div class="section-title">VIP Customers</div>
    <div class="card">${vipCustomers}</div>

    <div class="muted" style="text-align:center; margin-top:10px;">
      Best-selling items aren't available yet — add a "product name" field to the purchase form to enable this section.
    </div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
