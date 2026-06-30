// js/customer.js
import { db } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { getTierForPurchase, generateVoucherCode, VOUCHER_VALID_DAYS } from "./voucher-config.js";
import { BRANCHES } from "./branches-config.js";
import { getCustomerLevel, getThreeMonthTotal, getMonthKeyFromDateStr } from "./levels-config.js";
import {
  doc, getDoc, updateDoc, collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, Timestamp, where, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const customerId = params.get("id");
let customerData = null;

if (!customerId) {
  window.location.href = "dashboard.html";
}

// Fill the branch dropdown from the shared config
const branchSelect = document.getElementById("p_branch");
branchSelect.innerHTML = BRANCHES.map((b) => `<option value="${b}">${b}</option>`).join("");

requireAuth(() => {
  loadAll();
});

async function loadAll() {
  await loadCustomer();
  await loadPurchases();
  await loadVouchers();
}

async function loadCustomer() {
  const ref = doc(db, "customers", customerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    document.getElementById("infoCard").innerHTML = `<div class="empty-state">مشتری پیدا نشد</div>`;
    return;
  }
  customerData = snap.data();
  renderInfo();
}

function renderInfo() {
  document.getElementById("custNameTitle").textContent = customerData.name || "مشتری";

  const threeMonthTotal = getThreeMonthTotal(customerData.monthlySpend);
  const level = getCustomerLevel(threeMonthTotal);
  document.getElementById("levelBadgeSlot").innerHTML = level
    ? `<span class="level-badge ${level.badgeClass}">${level.name}</span>`
    : "";

  const progressHtml = `<div class="muted">هر خرید جدا بررسی میشه: ۱۰۰۰+ = ۵۰ درهم، ۱۵۰۰+ = ۸۰ درهم، ۲۰۰۰+ = ۱۵۰ درهم وچر</div>`;

  document.getElementById("infoCard").innerHTML = `
    <div class="stat-grid">
      <div class="stat-box">
        <div class="num">${customerData.totalPurchases || 0}</div>
        <div class="lbl">جمع کل خرید (درهم)</div>
      </div>
      <div class="stat-box">
        <div class="num">${customerData.activeVoucherCount || 0}</div>
        <div class="lbl">وچر فعال</div>
      </div>
    </div>
    ${progressHtml}
    <div class="muted" style="margin-top:6px;">خرید ۳ ماه اخیر: ${threeMonthTotal} درهم</div>
    <div id="branchInfoLine" class="muted" style="margin-top:10px;"></div>
    <div style="margin-top:14px; font-size:13px; color:var(--text-dim); line-height:2;">
      📞 ${escapeHtml(customerData.phone || "—")}<br>
      ✉️ ${escapeHtml(customerData.email || "—")}<br>
      🎂 ${escapeHtml(customerData.birthday || "—")}
    </div>
  `;
}

async function loadPurchases() {
  const listEl = document.getElementById("purchaseList");
  const q = query(collection(db, "customers", customerId, "purchases"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  if (snap.empty) {
    listEl.innerHTML = `<div class="empty-state">هنوز خریدی ثبت نشده</div>`;
    const branchLine = document.getElementById("branchInfoLine");
    if (branchLine) branchLine.textContent = "";
    return;
  }

  const purchases = snap.docs.map((d) => d.data());

  listEl.innerHTML = purchases.map((p) => {
    const branchLabel = p.branch ? ` · ${escapeHtml(p.branch)}` : "";
    return `<div class="purchase-row">
              <span class="date">${p.date || "—"}${branchLabel}</span>
              <span class="amt">${p.amount} درهم</span>
            </div>`;
  }).join("");

  // Most-visited branch, computed from purchase history
  const counts = {};
  purchases.forEach((p) => {
    if (p.branch) counts[p.branch] = (counts[p.branch] || 0) + 1;
  });
  const topBranch = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  document.getElementById("branchInfoLine").textContent = topBranch
    ? `📍 شعبه‌ی پرتکرار: ${topBranch}`
    : "";
}

async function loadVouchers() {
  const listEl = document.getElementById("voucherList");
  const q = query(collection(db, "vouchers"), where("customerId", "==", customerId));
  const snap = await getDocs(q);

  if (snap.empty) {
    listEl.innerHTML = `<div class="empty-state">هنوز وچری صادر نشده</div>`;
    return;
  }

  const vouchers = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.issuedAt?.seconds || 0) - (a.issuedAt?.seconds || 0));

  const now = Date.now();

  listEl.innerHTML = vouchers.map((v) => {
    const expiresMs = v.expiresAt?.seconds ? v.expiresAt.seconds * 1000 : 0;
    let effectiveStatus = v.status;
    if (effectiveStatus === "active" && expiresMs && expiresMs < now) {
      effectiveStatus = "expired";
    }

    const badgeLabel = effectiveStatus === "active" ? "فعال" : effectiveStatus === "used" ? "استفاده شده" : "منقضی";
    const expiryDate = expiresMs ? new Date(expiresMs).toLocaleDateString("fa-IR") : "—";

    let barcodeBlock = "";
    if (effectiveStatus === "active") {
      barcodeBlock = `
        <div class="barcode-box">
          <svg id="bc_${v.id}"></svg>
        </div>
        <div class="voucher-code-text">${v.code}</div>`;
    }

    return `
      <div style="padding:12px 0; border-bottom:1px solid var(--border);">
        <div class="voucher-row" style="border-bottom:none; padding:0 0 6px;">
          <span><b>${v.discount} درهم تخفیف</b></span>
          <span class="badge ${effectiveStatus}">${badgeLabel}</span>
        </div>
        <div class="muted">انقضا: ${expiryDate}</div>
        ${barcodeBlock}
      </div>`;
  }).join("");

  // render barcodes for active vouchers
  vouchers.forEach((v) => {
    const expiresMs = v.expiresAt?.seconds ? v.expiresAt.seconds * 1000 : 0;
    const isExpired = expiresMs && expiresMs < now;
    if (v.status === "active" && !isExpired && window.JsBarcode) {
      try {
        window.JsBarcode(`#bc_${v.id}`, v.code, { format: "CODE128", height: 50, displayValue: false, margin: 6 });
      } catch (e) { console.error(e); }
    }
  });
}

// ---- Add purchase flow ----
const purchaseOverlay = document.getElementById("purchaseOverlay");
document.getElementById("openPurchaseBtn").addEventListener("click", () => purchaseOverlay.classList.add("show"));
document.getElementById("cancelPurchaseBtn").addEventListener("click", () => purchaseOverlay.classList.remove("show"));

document.getElementById("purchaseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById("purchaseError");
  const successBox = document.getElementById("purchaseSuccess");
  errorBox.classList.remove("show");
  successBox.classList.remove("show");

  const amount = parseFloat(document.getElementById("p_amount").value);
  const branch = document.getElementById("p_branch").value;
  const date = document.getElementById("p_date").value || new Date().toISOString().slice(0, 10);

  if (!amount || amount <= 0) return;

  try {
    // 1. record the purchase
    await addDoc(collection(db, "customers", customerId, "purchases"), {
      amount, date, branch, createdAt: serverTimestamp(),
    });

    // 2. check which tier THIS single purchase qualifies for
    const newTotal = (customerData.totalPurchases || 0) + amount;
    const voucherTier = getTierForPurchase(amount);

    let newVoucherCount = 0;
    if (voucherTier) {
      const code = generateVoucherCode();
      const expires = new Date();
      expires.setDate(expires.getDate() + VOUCHER_VALID_DAYS);

      await addDoc(collection(db, "vouchers"), {
        customerId,
        customerName: customerData.name || "",
        customerEmail: customerData.email || "",
        discount: voucherTier.discount,
        code,
        status: "active",
        issuedAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires),
      });
      newVoucherCount = 1;
      // Email sending hook — wired up once EmailJS is configured
      notifyVoucherIssued(customerData, voucherTier.discount, code, expires);
    }

    // 3. update customer doc
    const monthKey = getMonthKeyFromDateStr(date);
    await updateDoc(doc(db, "customers", customerId), {
      totalPurchases: newTotal,
      activeVoucherCount: (customerData.activeVoucherCount || 0) + newVoucherCount,
      [`monthlySpend.${monthKey}`]: increment(amount),
    });

    document.getElementById("purchaseForm").reset();
    successBox.textContent = newVoucherCount > 0
      ? `خرید ثبت شد! ${newVoucherCount} وچر جدید صادر شد 🎉`
      : "خرید با موفقیت ثبت شد.";
    successBox.classList.add("show");

    setTimeout(() => {
      purchaseOverlay.classList.remove("show");
      successBox.classList.remove("show");
      loadAll();
    }, 1400);

  } catch (err) {
    errorBox.textContent = "ثبت خرید با خطا مواجه شد.";
    errorBox.classList.add("show");
    console.error(err);
  }
});

function notifyVoucherIssued(customer, discount, code, expiresDate) {
  // Placeholder — will call EmailJS once the account is set up.
  console.log("TODO: email voucher", { to: customer.email, discount, code, expiresDate });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
