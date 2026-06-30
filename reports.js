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
    area.innerHTML = `<div class="empty-state">خطا در بارگذاری گزارش</div>`;
    console.error(err);
  }
}

function renderReport(area, purchases, customers) {
  // --- Branch performance ---
  const branchStats = {};
  purchases.forEach((p) => {
    const b = p.branch || "نامشخص";
    if (!branchStats[b]) branchStats[b] = { total: 0, count: 0 };
    branchStats[b].total += p.amount || 0;
    branchStats[b].count += 1;
  });
  const branchRows = Object.entries(branchStats)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, s]) => `
      <div class="purchase-row">
        <span class="date">${escapeHtml(name)} · ${s.count} خرید</span>
        <span class="amt">${s.total.toLocaleString("fa-IR")} درهم</span>
      </div>`).join("") || `<div class="empty-state">هنوز خریدی ثبت نشده</div>`;

  // --- Daily sales (last 14 days that had activity) ---
  const dailyStats = {};
  purchases.forEach((p) => {
    const d = p.date || "نامشخص";
    dailyStats[d] = (dailyStats[d] || 0) + (p.amount || 0);
  });
  const dailyRows = Object.entries(dailyStats)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)
    .map(([date, total]) => `
      <div class="purchase-row">
        <span class="date">${date}</span>
        <span class="amt">${total.toLocaleString("fa-IR")} درهم</span>
      </div>`).join("") || `<div class="empty-state">هنوز خریدی ثبت نشده</div>`;

  // --- Top spenders (lifetime total) ---
  const topSpenders = [...customers]
    .sort((a, b) => (b.totalPurchases || 0) - (a.totalPurchases || 0))
    .slice(0, 10)
    .map((c) => `
      <a class="customer-item" href="customer.html?id=${c.id}">
        <div class="row">
          <span class="name">${escapeHtml(c.name || "بدون اسم")}</span>
          <span class="amt">${(c.totalPurchases || 0).toLocaleString("fa-IR")} درهم</span>
        </div>
      </a>`).join("") || `<div class="empty-state">مشتری‌ای ثبت نشده</div>`;

  // --- VIP list (rolling 3-month spend) ---
  const vipCustomers = customers
    .filter((c) => {
      const level = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
      return level && level.name === "VIP";
    })
    .map((c) => `
      <a class="customer-item" href="customer.html?id=${c.id}">
        <div class="row">
          <span class="name">${escapeHtml(c.name || "بدون اسم")}</span>
          <span class="level-badge level-vip">VIP</span>
        </div>
      </a>`).join("") || `<div class="empty-state">فعلاً مشتری VIP ای نیست</div>`;

  area.innerHTML = `
    <div class="section-title">عملکرد شعبه‌ها</div>
    <div class="card">${branchRows}</div>

    <div class="section-title">فروش روزانه (۱۴ روز اخیر)</div>
    <div class="card">${dailyRows}</div>

    <div class="section-title">پرخریدترین مشتری‌ها (جمع کل)</div>
    <div class="card">${topSpenders}</div>

    <div class="section-title">مشتری‌های VIP</div>
    <div class="card">${vipCustomers}</div>

    <div class="muted" style="text-align:center; margin-top:10px;">
      آیتم‌های پرفروش هنوز در دسترس نیست — برای این بخش باید فیلد "نام محصول" به فرم ثبت خرید اضافه شود.
    </div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
