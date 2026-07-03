// customer.js
import { db, auth } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { getTierForPurchase, generateVoucherCode, VOUCHER_VALID_DAYS } from "./voucher-config.js";
import { BRANCHES } from "./branches-config.js";
import { getCustomerLevel, getThreeMonthTotal, getMonthKeyFromDateStr } from "./levels-config.js";
import { calculatePoints, pointsToAED } from "./points-config.js";
import {
  doc, getDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, Timestamp, where, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const customerId = params.get("id");
let customerData = null;

if (!customerId) {
  window.location.href = "dashboard.html";
}

// Fill the branch dropdown
document.getElementById("p_branch").innerHTML =
  BRANCHES.map((b) => `<option value="${b}">${b}</option>`).join("");

let userRole = "staff";

requireAuth((user, role) => { userRole = role; loadAll(); });

async function loadAll() {
  await loadCustomer();
  if (userRole === "admin") {
    await loadPurchases();
    await loadVouchers();
  }
}

async function loadCustomer() {
  const snap = await getDoc(doc(db, "customers", customerId));
  if (!snap.exists()) {
    document.getElementById("infoCard").innerHTML = `<div class="empty-state">Customer not found</div>`;
    return;
  }
  customerData = snap.data();
  renderInfo();
}

function renderInfo() {
  document.getElementById("custNameTitle").textContent = customerData.name || "Customer";

  const threeMonthTotal = getThreeMonthTotal(customerData.monthlySpend);
  const level = getCustomerLevel(threeMonthTotal);
  document.getElementById("levelBadgeSlot").innerHTML = level
    ? `<span class="level-badge ${level.badgeClass}">${level.name}</span>` : "";

  const pts = customerData.totalPoints || 0;
  const bal = pointsToAED(pts);

  if (userRole === "admin") {
    document.getElementById("infoCard").innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><div class="num">${customerData.totalPurchases || 0}</div><div class="lbl">Lifetime Total (AED)</div></div>
        <div class="stat-box"><div class="num">${customerData.activeVoucherCount || 0}</div><div class="lbl">Active Vouchers</div></div>
        <div class="stat-box"><div class="num">${pts}</div><div class="lbl">Points</div></div>
        <div class="stat-box"><div class="num">${bal}</div><div class="lbl">Balance (AED)</div></div>
      </div>
      <div class="muted" style="margin-top:6px;">Each purchase is checked on its own: 1000+=50, 1500+=80, 2000+=150 AED voucher</div>
      <div class="muted" style="margin-top:4px;">Last 3 months: ${threeMonthTotal} AED</div>
      <div id="branchInfoLine" class="muted" style="margin-top:10px;"></div>
      <div style="margin-top:14px; font-size:13px; color:var(--text-dim); line-height:2;">
        📞 ${escapeHtml(customerData.phone || "—")}<br>
        ✉️ ${escapeHtml(customerData.email || "—")}<br>
        🎂 ${escapeHtml(customerData.birthday || "—")}
      </div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn secondary" id="openEditBtn" style="flex:1;">✏️ Edit</button>
        <button class="btn secondary" id="openRedeemBtn" style="flex:1;" ${pts < 10 ? "disabled" : ""}>🎁 Redeem (${bal} AED)</button>
      </div>
      <button class="btn danger" id="deleteCustBtn" style="margin-top:10px;">🗑 Delete Customer</button>
    `;
    const redeemBtn = document.getElementById("openRedeemBtn");
    if (redeemBtn) redeemBtn.addEventListener("click", openRedeemSheet);
    document.getElementById("openEditBtn").addEventListener("click", openEditSheet);
    document.getElementById("deleteCustBtn").addEventListener("click", deleteCustomer);

  } else {
    // Staff — limited view: points/balance + contact, edit basic info, no totals/vouchers/history/delete
    document.getElementById("infoCard").innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><div class="num">${pts}</div><div class="lbl">Points</div></div>
        <div class="stat-box"><div class="num">${bal}</div><div class="lbl">Balance (AED)</div></div>
      </div>
      <div style="margin-top:14px; font-size:13px; color:var(--text-dim); line-height:2;">
        📞 ${escapeHtml(customerData.phone || "—")}<br>
        ✉️ ${escapeHtml(customerData.email || "—")}<br>
        🎂 ${escapeHtml(customerData.birthday || "—")}
      </div>
      <div class="locked-info" style="margin-top:12px;">🔒 Sales total, vouchers & history — Admin only</div>
      <button class="btn secondary" id="openEditBtn" style="margin-top:14px;">✏️ Edit Info</button>
    `;
    document.getElementById("openEditBtn").addEventListener("click", openEditSheet);

    // Hide the purchase-history and vouchers sections for staff
    hideAdminSections();
  }
}

function hideAdminSections() {
  document.querySelectorAll(".section-title").forEach(el => {
    const t = el.textContent.trim();
    if (t === "Purchase History" || t === "Vouchers") el.style.display = "none";
  });
  const pl = document.getElementById("purchaseList");
  const vl = document.getElementById("voucherList");
  if (pl) pl.style.display = "none";
  if (vl) vl.style.display = "none";
}

async function loadPurchases() {
  const listEl = document.getElementById("purchaseList");
  const snap = await getDocs(query(
    collection(db, "customers", customerId, "purchases"), orderBy("createdAt", "desc")
  ));

  if (snap.empty) {
    listEl.innerHTML = `<div class="empty-state">No purchases recorded yet</div>`;
    const bl = document.getElementById("branchInfoLine");
    if (bl) bl.textContent = "";
    return;
  }

  const purchases = snap.docs.map((d) => d.data());
  listEl.innerHTML = purchases.map((p) => {
    const branchLabel = p.branch ? ` · ${escapeHtml(p.branch)}` : "";
    return `<div class="purchase-row">
      <span class="date">${p.date || "—"}${branchLabel}</span>
      <span class="amt">${p.amount} AED</span>
    </div>`;
  }).join("");

  const counts = {};
  purchases.forEach((p) => { if (p.branch) counts[p.branch] = (counts[p.branch] || 0) + 1; });
  const topBranch = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const bl = document.getElementById("branchInfoLine");
  if (bl) bl.textContent = topBranch ? `📍 Most-visited branch: ${topBranch}` : "";
}

async function loadVouchers() {
  const listEl = document.getElementById("voucherList");
  const snap = await getDocs(query(collection(db, "vouchers"), where("customerId", "==", customerId)));

  if (snap.empty) {
    listEl.innerHTML = `<div class="empty-state">No vouchers issued yet</div>`;
    return;
  }

  const vouchers = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.issuedAt?.seconds || 0) - (a.issuedAt?.seconds || 0));
  const now = Date.now();

  listEl.innerHTML = vouchers.map((v) => {
    const expiresMs = v.expiresAt?.seconds ? v.expiresAt.seconds * 1000 : 0;
    let status = v.status;
    if (status === "active" && expiresMs && expiresMs < now) status = "expired";
    const badgeLabel = status === "active" ? "Active" : status === "used" ? "Used" : "Expired";
    const expiry = expiresMs ? new Date(expiresMs).toLocaleDateString("en-GB") : "—";
    const barcodeBlock = status === "active"
      ? `<div class="barcode-box"><svg id="bc_${v.id}"></svg></div><div class="voucher-code-text">${v.code}</div>` : "";
    return `
      <div style="padding:12px 0; border-bottom:1px solid var(--border);">
        <div class="voucher-row" style="border-bottom:none; padding:0 0 6px;">
          <span><b>${v.discount} AED off</b></span>
          <span class="badge ${status}">${badgeLabel}</span>
        </div>
        <div class="muted">Expires: ${expiry}</div>
        ${barcodeBlock}
      </div>`;
  }).join("");

  vouchers.forEach((v) => {
    const expiresMs = v.expiresAt?.seconds ? v.expiresAt.seconds * 1000 : 0;
    if (v.status === "active" && !(expiresMs && expiresMs < now) && window.JsBarcode) {
      try { window.JsBarcode(`#bc_${v.id}`, v.code, { format: "CODE128", height: 50, displayValue: false, margin: 6 }); }
      catch (e) { console.error(e); }
    }
  });
}

// ---- Add purchase ----
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
    await addDoc(collection(db, "customers", customerId, "purchases"), {
      amount, date, branch, createdAt: serverTimestamp(),
    });

    const newTotal = (customerData.totalPurchases || 0) + amount;
    const voucherTier = getTierForPurchase(amount);
    const pointsEarned = calculatePoints(amount);

    let newVoucherCount = 0;
    if (voucherTier) {
      const code = generateVoucherCode();
      const expires = new Date();
      expires.setDate(expires.getDate() + VOUCHER_VALID_DAYS);
      await addDoc(collection(db, "vouchers"), {
        customerId, customerName: customerData.name || "",
        customerEmail: customerData.email || "",
        discount: voucherTier.discount, code, status: "active",
        issuedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expires),
      });
      newVoucherCount = 1;
    }

    const oldBranchCounts = customerData.branchCounts || {};
    const newBranchCounts = { ...oldBranchCounts, [branch]: (oldBranchCounts[branch] || 0) + 1 };
    const topBranch = Object.keys(newBranchCounts).sort((a, b) => newBranchCounts[b] - newBranchCounts[a])[0];
    const monthKey = getMonthKeyFromDateStr(date);

    await updateDoc(doc(db, "customers", customerId), {
      totalPurchases: newTotal,
      activeVoucherCount: (customerData.activeVoucherCount || 0) + newVoucherCount,
      [`monthlySpend.${monthKey}`]: increment(amount),
      branchCounts: newBranchCounts, topBranch, lastPurchaseDate: date,
      totalPoints: increment(pointsEarned),
    });

    document.getElementById("purchaseForm").reset();
    const ptsMsg = pointsEarned > 0 ? ` +${pointsEarned} pts earned.` : "";
    successBox.textContent = newVoucherCount > 0
      ? `Purchase recorded! Voucher issued 🎉${ptsMsg}`
      : `Purchase recorded.${ptsMsg}`;
    successBox.classList.add("show");

    // Log this action for Staff Management's activity feed
    logActivity(
      `Purchase recorded — ${customerData.name || "Unnamed"} (${amount} AED)`,
      branch
    );

    setTimeout(() => { purchaseOverlay.classList.remove("show"); successBox.classList.remove("show"); loadAll(); }, 1400);

  } catch (err) {
    document.getElementById("purchaseError").textContent = "Failed to record the purchase.";
    document.getElementById("purchaseError").classList.add("show");
    console.error(err);
  }
});

// ---- Redeem points ----
const redeemOverlay = document.getElementById("redeemOverlay");

function openRedeemSheet() {
  const pts = customerData.totalPoints || 0;
  document.getElementById("redeemInfo").textContent = `Available: ${pts} points = ${pointsToAED(pts)} AED`;
  document.getElementById("r_points").max = pts;
  document.getElementById("r_points").value = "";
  document.getElementById("redeemPreview").textContent = "";
  document.getElementById("redeemError").classList.remove("show");
  document.getElementById("redeemSuccess").classList.remove("show");
  redeemOverlay.classList.add("show");
}

document.getElementById("cancelRedeemBtn").addEventListener("click", () => redeemOverlay.classList.remove("show"));

document.getElementById("r_points").addEventListener("input", () => {
  const pts = parseInt(document.getElementById("r_points").value) || 0;
  const avail = customerData ? (customerData.totalPoints || 0) : 0;
  document.getElementById("redeemPreview").textContent = pts > avail
    ? `Not enough points (max: ${avail})`
    : pts > 0 ? `${pts} points = ${pointsToAED(pts)} AED discount` : "";
});

document.getElementById("confirmRedeemBtn").addEventListener("click", async () => {
  const pts = parseInt(document.getElementById("r_points").value) || 0;
  const avail = customerData ? (customerData.totalPoints || 0) : 0;
  const errEl = document.getElementById("redeemError");
  const sucEl = document.getElementById("redeemSuccess");
  errEl.classList.remove("show"); sucEl.classList.remove("show");

  if (pts < 10) { errEl.textContent = "Minimum 10 points to redeem."; errEl.classList.add("show"); return; }
  if (pts > avail) { errEl.textContent = `Not enough points. Available: ${avail}.`; errEl.classList.add("show"); return; }

  try {
    const discountAED = parseFloat(pointsToAED(pts));
    const code = generateVoucherCode();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    await addDoc(collection(db, "vouchers"), {
      customerId, customerName: customerData.name || "",
      customerEmail: customerData.email || "",
      discount: discountAED, code, status: "active",
      issuedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expires),
      reason: "points_redemption",
    });

    await updateDoc(doc(db, "customers", customerId), {
      totalPoints: increment(-pts),
      activeVoucherCount: (customerData.activeVoucherCount || 0) + 1,
    });

    sucEl.textContent = `✅ ${pts} points redeemed for ${discountAED} AED voucher!`;
    sucEl.classList.add("show");
    setTimeout(() => { redeemOverlay.classList.remove("show"); loadAll(); }, 1400);
  } catch (err) {
    errEl.textContent = "Failed to redeem points."; errEl.classList.add("show"); console.error(err);
  }
});

// ---- Edit basic info (both admin and staff) ----
const editOverlay = document.getElementById("editOverlay");

function openEditSheet() {
  document.getElementById("e_name").value = customerData.name || "";
  document.getElementById("e_phone").value = customerData.phone || "";
  document.getElementById("e_email").value = customerData.email || "";
  document.getElementById("e_birthday").value = customerData.birthday || "";
  document.getElementById("editError").classList.remove("show");
  document.getElementById("editSuccess").classList.remove("show");
  editOverlay.classList.add("show");
}

document.getElementById("cancelEditBtn").addEventListener("click", () => editOverlay.classList.remove("show"));

document.getElementById("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("editError");
  const sucEl = document.getElementById("editSuccess");
  errEl.classList.remove("show"); sucEl.classList.remove("show");

  const name = document.getElementById("e_name").value.trim();
  const phone = document.getElementById("e_phone").value.trim();
  const email = document.getElementById("e_email").value.trim();
  const birthday = document.getElementById("e_birthday").value;

  if (!name) { errEl.textContent = "Name is required."; errEl.classList.add("show"); return; }

  try {
    await updateDoc(doc(db, "customers", customerId), { name, phone, email, birthday });
    sucEl.textContent = "✅ Info updated.";
    sucEl.classList.add("show");
    setTimeout(() => { editOverlay.classList.remove("show"); loadAll(); }, 1000);
  } catch (err) {
    errEl.textContent = "Failed to save changes."; errEl.classList.add("show"); console.error(err);
  }
});

// ---- Delete customer (admin only) ----
async function deleteCustomer() {
  if (userRole !== "admin") return;
  const confirmed = window.confirm(
    `Delete ${customerData.name || "this customer"}? This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "customers", customerId));
    window.location.href = "dashboard.html";
  } catch (err) {
    alert("Failed to delete customer. Please try again.");
    console.error(err);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// Writes a row to the "activity" collection for Staff Management's log.
async function logActivity(action, branch) {
  try {
    await addDoc(collection(db, "activity"), {
      action,
      by: auth.currentUser ? auth.currentUser.email : "unknown",
      branch: branch || "",
      at: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to log activity", err);
  }
}
