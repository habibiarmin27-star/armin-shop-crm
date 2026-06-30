// js/dashboard.js
import { db } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { getCustomerLevel, getThreeMonthTotal } from "./levels-config.js";
import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allCustomers = [];

requireAuth(() => {
  loadCustomers();
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

function renderList(customers) {
  const listArea = document.getElementById("listArea");
  if (customers.length === 0) {
    listArea.innerHTML = `<div class="empty-state">هنوز مشتری‌ای ثبت نشده. با دکمه‌ی + شروع کن.</div>`;
    return;
  }

  listArea.innerHTML = customers.map((c) => {
    const voucherChip = (c.activeVoucherCount > 0)
      ? `<span class="voucher-chip">🎫 ${c.activeVoucherCount} وچر فعال</span>`
      : "";

    const level = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    const levelChip = level ? `<span class="level-badge ${level.badgeClass}">${level.name}</span>` : "";

    return `
      <a class="customer-item" href="customer.html?id=${c.id}">
        <div class="row">
          <span class="name">${escapeHtml(c.name || "بدون اسم")}</span>
          <span style="display:flex; gap:6px;">${levelChip}${voucherChip}</span>
        </div>
        <div class="phone">${escapeHtml(c.phone || "—")}</div>
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
