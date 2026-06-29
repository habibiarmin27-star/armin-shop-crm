// js/customer.js
import { db } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { getNextTier, getNewlyTriggeredTiers, generateVoucherCode, VOUCHER_VALID_DAYS } from "./voucher-config.js";
import {
  doc, getDoc, updateDoc, collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, Timestamp, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const customerId = params.get("id");
let customerData = null;

if (!customerId) {
  window.location.href = "dashboard.html";
}

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

  const progress = customerData.voucherProgress || 0;
  const next = getNextTier(progress);
  let progressHtml = next
    ? `<div class="tier-progress">
         <div class="label"><span>تا تخفیف بعدی</span><b>${progress} / ${next.threshold} درهم</b></div>
         <div class="tier-track"><div class="tier-fill" style="width:${Math.min(100, Math.round(progress / next.threshold * 100))}%"></div></div>
       </div>`
    : `<div class="tier-progress"><div class="label"><span>به بالاترین سطح رسیده ✓</span></div></div>`;

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
    return;
  }
  listEl.innerHTML = snap.docs.map((d) => {
    const p = d.data();
    return `<div class="purchase-row">
              <span class="date">${p.date || "—"}</span>
              <span class="amt">${p.amount} درهم</span>
            </div>`;
  }).join("");
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
  const date = document.getElementById("p_date").value || new Date().toISOString().slice(0, 10);

  if (!amount || amount <= 0) return;

  try {
    // 1. record the purchase
    await addDoc(collection(db, "customers", customerId, "purchases"), {
      amount, date, createdAt: serverTimestamp(),
    });

    // 2. compute new totals + check tiers
    const oldProgress = customerData.voucherProgress || 0;
    const oldTriggered = customerData.triggeredTiers || [];
    const newProgress = oldProgress + amount;
    const newTotal = (customerData.totalPurchases || 0) + amount;

    const newTiers = getNewlyTriggeredTiers(newProgress, oldTriggered);

    let newVoucherCount = 0;
    for (const tier of newTiers) {
      const code = generateVoucherCode();
      const expires = new Date();
      expires.setDate(expires.getDate() + VOUCHER_VALID_DAYS);

      await addDoc(collection(db, "vouchers"), {
        customerId,
        customerName: customerData.name || "",
        customerEmail: customerData.email || "",
        discount: tier.discount,
        code,
        status: "active",
        issuedAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires),
      });
      newVoucherCount++;
      // Email sending hook — wired up once EmailJS is configured (see js/email.js)
      notifyVoucherIssued(customerData, tier.discount, code, expires);
    }

    // 3. update customer doc
    const updatedTriggered = [...oldTriggered, ...newTiers.map((t) => t.threshold)];
    await updateDoc(doc(db, "customers", customerId), {
      voucherProgress: newProgress,
      totalPurchases: newTotal,
      triggeredTiers: updatedTriggered,
      activeVoucherCount: (customerData.activeVoucherCount || 0) + newVoucherCount,
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
