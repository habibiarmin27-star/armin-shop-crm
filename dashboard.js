// dashboard.js
import { db } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { getCustomerLevel, getThreeMonthTotal } from "./levels-config.js";
import {
  collection, collectionGroup, getDocs, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allCustomers = [];

requireAuth(async () => {
  await loadCustomers();
  loadStats();
});

async function loadCustomers() {
  const listArea = document.getElementById("listArea");
  try {
    const q = query(collection(db, "customers"), orderBy("name"));
    const snap = await getDocs(q);
    allCustomers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList(allCustomers);
  } catch (err) {
    listArea.innerHTML = `<div class="empty-state">خطا در بارگذاری مشتری‌ها</div>`;
    console.error(err);
  }
}

async function loadStats() {
  const statsArea = document.getElementById("statsArea");
  try {
    const purchasesSnap = await getDocs(collectionGroup(db, "purchases"));
    const purchases = purchasesSnap.docs.map((d) => d.data());

    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthSales = purchases
      .filter((p) => (p.date || "").startsWith(thisMonthKey))
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const totalCustomers = allCustomers.length;
    const activeVouchers = allCustomers.reduce((sum, c) => sum + (c.activeVoucherCount || 0), 0);
    const vipCount = allCustomers.filter((c) => {
      const level = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
      return level && level.name === "VIP";
    }).length;

    statsArea.innerHTML = `
      <div class="dash-stat"><div class="lbl">کل مشتریان</div><div class="num">${totalCustomers}</div></div>
      <div class="dash-stat"><div class="lbl">فروش این ماه</div><div class="num">${thisMonthSales.toLocaleString("fa-IR")} <span style="font-size:11px;">درهم</span></div></div>
      <div class="dash-stat"><div class="lbl">وچرهای فعال</div><div class="num">${activeVouchers}</div></div>
      <div class="dash-stat"><div class="lbl">مشتریان VIP</div><div class="num">${vipCount}</div></div>
    `;
  } catch (err) {
    statsArea.innerHTML = "";
    console.error(err);
  }
}

function renderList(customers) {
  const listArea = document.getElementById("listArea");
  if (customers.length === 0) {
    listArea.innerHTML = `<div class="empty-state">هنوز مشتری‌ای ثبت نشده. با دکمه‌ی + شروع کن.</div>`;
    return;
  }

  listArea.innerHTML = customers.map((c) => {
    const level = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    const levelChip = level ? `<span class="level-badge ${level.badgeClass}">${level.name}</span>` : "";
    const threeMonthTotal = getThreeMonthTotal(c.monthlySpend);
    const branch = c.topBranch || "—";

    return `
      <a class="cust-row" href="customer.html?id=${c.id}">
        <div class="top-line">
          <span class="name">${escapeHtml(c.name || "بدون اسم")}</span>
          ${levelChip}
        </div>
        <div class="sub-line">
          <div class="meta"><span>${escapeHtml(c.phone || "—")}</span><span>${escapeHtml(branch)}</span></div>
          <div class="right-stats">
            <div class="amt">${threeMonthTotal.toLocaleString("fa-IR")} درهم</div>
            <div class="amt-lbl">${c.activeVoucherCount > 0 ? `🎫 ${c.activeVoucherCount} وچر` : "۳ ماه اخیر"}</div>
          </div>
        </div>
      </a>`;
  }).join("");
}

document.getElementById("searchInput").addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) { renderList(allCustomers); return; }
  const filtered = allCustomers.filter((c) =>
    (c.name || "").toLowerCase().includes(term) ||
    (c.phone || "").toLowerCase().includes(term)
  );
  renderList(filtered);
});

// Add-customer sheet
const addOverlay = document.getElementById("addOverlay");
document.getElementById("openAddBtn").addEventListener("click", () => addOverlay.classList.add("show"));
document.getElementById("cancelAddBtn").addEventListener("click", () => addOverlay.classList.remove("show"));

document.getElementById("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById("addError");
  errorBox.classList.remove("show");

  const name = document.getElementById("c_name").value.trim();
  const phone = document.getElementById("c_phone").value.trim();
  const email = document.getElementById("c_email").value.trim();
  const birthday = document.getElementById("c_birthday").value;

  if (!name) return;

  try {
    await addDoc(collection(db, "customers"), {
      name, phone, email, birthday,
      totalPurchases: 0,
      activeVoucherCount: 0,
      createdAt: serverTimestamp(),
    });
    document.getElementById("addForm").reset();
    addOverlay.classList.remove("show");
    loadCustomers();
    loadStats();
  } catch (err) {
    errorBox.textContent = "ذخیره انجام نشد، دوباره تلاش کن.";
    errorBox.classList.add("show");
    console.error(err);
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
