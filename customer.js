// customer.js
import { db, auth } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { getTierForPurchase, generateVoucherCode, VOUCHER_VALID_DAYS } from "./voucher-config.js";
import { BRANCHES } from "./branches-config.js";
import { getCustomerLevel, getThreeMonthTotal, getMonthKeyFromDateStr } from "./levels-config.js";
import { calculatePoints, pointsToAED } from "./points-config.js";
import { validateText, validateEmail, validatePhone } from "./input-guard.js";
import { EMIRATES, OTHER_VALUE } from "./area-config.js";
import { sendEmail } from "./emailjs-config.js";
import { thankYouMessage, thankYouSubject } from "./reminders-config.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, Timestamp, where, increment, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const customerId = params.get("id");
let customerData = null;
let loadedPurchases = [];

if (!customerId) {
  window.location.href = "dashboard.html";
}

// Fill the branch dropdown
document.getElementById("p_branch").innerHTML =
  BRANCHES.map((b) => `<option value="${b}">${b}</option>`).join("");

// ---- Emirate / Area cascading dropdowns ----
const emirateSelect = document.getElementById("e_emirate");
const areaSelect = document.getElementById("e_area");
const emirateOtherInput = document.getElementById("e_emirate_other");
const areaOtherInput = document.getElementById("e_area_other");

emirateSelect.innerHTML =
  `<option value="">— Select —</option>` +
  Object.keys(EMIRATES).map((e) => `<option value="${e}">${e}</option>`).join("") +
  `<option value="${OTHER_VALUE}">Other (type manually)</option>`;

function populateAreaOptions(emirate) {
  const areas = EMIRATES[emirate] || [];
  areaSelect.innerHTML =
    `<option value="">— Select —</option>` +
    areas.map((a) => `<option value="${a}">${a}</option>`).join("") +
    `<option value="${OTHER_VALUE}">Other (type manually)</option>`;
}

emirateSelect.addEventListener("change", () => {
  const val = emirateSelect.value;
  emirateOtherInput.style.display = val === OTHER_VALUE ? "block" : "none";
  if (val === OTHER_VALUE) {
    // No known area list for a custom emirate — just let staff type the area directly.
    areaSelect.innerHTML = `<option value="${OTHER_VALUE}">Other (type manually)</option>`;
    areaSelect.value = OTHER_VALUE;
    areaOtherInput.style.display = "block";
  } else {
    populateAreaOptions(val);
    areaOtherInput.style.display = "none";
    areaOtherInput.value = "";
  }
});

areaSelect.addEventListener("change", () => {
  areaOtherInput.style.display = areaSelect.value === OTHER_VALUE ? "block" : "none";
});

let userRole = "staff";
let currentUserEmail = null;

requireAuth((user, role) => {
  userRole = role;
  currentUserEmail = user.email;
  loadAll();
  loadSalespeople();
});

// Fills the Salesperson dropdown from active staff members, and pre-selects
// whoever is currently logged in (most sales are self-recorded) — anyone
// filling the form can still pick a different name, e.g. a cashier logging
// a sale that another salesperson closed.
async function loadSalespeople() {
  const sel = document.getElementById("p_salesperson");
  try {
    const snap = await getDocs(collection(db, "staff"));
    const active = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.active !== false);
    sel.innerHTML = active
      .map((m) => `<option value="${m.id}">${staffDisplayName(m.id)}</option>`)
      .join("");
    applyDefaultSalesperson();
  } catch (err) {
    console.error("Failed to load salespeople", err);
  }
}

function applyDefaultSalesperson() {
  const sel = document.getElementById("p_salesperson");
  if (!sel || !currentUserEmail) return;
  if ([...sel.options].some((o) => o.value === currentUserEmail)) {
    sel.value = currentUserEmail;
  }
}

// Turns "sara.ahmed@alhudu.ae" into "Sara Ahmed" for a friendlier dropdown
// label — staff records only store an email, no separate display name.
function staffDisplayName(email) {
  if (!email) return "Unknown";
  const local = email.split("@")[0];
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function loadAll() {
  try {
    await loadCustomer();
    if (userRole === "admin") {
      await loadPurchases();
    } else {
      await loadMyPurchases();
    }
    await loadVouchers();
  } catch (err) {
    document.getElementById("infoCard").innerHTML =
      `<div class="empty-state">Failed to load: ${escapeHtml(err && err.message ? err.message : String(err))}</div>`;
    console.error(err);
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
        🎂 ${escapeHtml(customerData.birthday || "—")}<br>
        📍 ${escapeHtml(customerData.address || "—")}<br>
        🗺️ ${escapeHtml(regionLabel(customerData))}
      </div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn secondary" id="openEditBtn" style="flex:1;">✏️ Edit</button>
        <button class="btn secondary" id="openRedeemBtn" style="flex:1;" ${pts < 10 ? "disabled" : ""}>🎁 Redeem (${bal} AED)</button>
      </div>
      <button class="btn secondary" id="recalcTotalsBtn" style="margin-top:10px;">🔄 Recalculate Totals</button>
      <button class="btn danger" id="deleteCustBtn" style="margin-top:10px;">🗑 Delete Customer</button>
    `;
    const redeemBtn = document.getElementById("openRedeemBtn");
    if (redeemBtn) redeemBtn.addEventListener("click", openRedeemSheet);
    document.getElementById("openEditBtn").addEventListener("click", openEditSheet);
    document.getElementById("deleteCustBtn").addEventListener("click", deleteCustomer);
    document.getElementById("recalcTotalsBtn").addEventListener("click", recalculateCustomerTotals);

  } else {
    // Staff — limited view: points/balance + contact, edit basic info + redeem + vouchers,
    // but no lifetime totals or purchase history
    document.getElementById("infoCard").innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><div class="num">${pts}</div><div class="lbl">Points</div></div>
        <div class="stat-box"><div class="num">${bal}</div><div class="lbl">Balance (AED)</div></div>
      </div>
      <div style="margin-top:14px; font-size:13px; color:var(--text-dim); line-height:2;">
        📞 ${escapeHtml(customerData.phone || "—")}<br>
        ✉️ ${escapeHtml(customerData.email || "—")}<br>
        🎂 ${escapeHtml(customerData.birthday || "—")}<br>
        📍 ${escapeHtml(customerData.address || "—")}<br>
        🗺️ ${escapeHtml(regionLabel(customerData))}
      </div>
      <div class="locked-info" style="margin-top:12px;">🔒 Lifetime total — Admin only</div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn secondary" id="openEditBtn" style="flex:1;">✏️ Edit Info</button>
        <button class="btn secondary" id="openRedeemBtn" style="flex:1;" ${pts < 10 ? "disabled" : ""}>🎁 Redeem (${bal} AED)</button>
      </div>
    `;
    document.getElementById("openEditBtn").addEventListener("click", openEditSheet);
    const redeemBtn = document.getElementById("openRedeemBtn");
    if (redeemBtn) redeemBtn.addEventListener("click", openRedeemSheet);
  }
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

  const purchases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  loadedPurchases = purchases;
  listEl.innerHTML = purchases.map((p) => {
    const branchLabel = p.branch ? ` · ${escapeHtml(p.branch)}` : "";
    return `<div class="purchase-row">
      <span class="date">${p.date || "—"}${branchLabel}</span>
      <span style="display:flex; align-items:center; gap:8px;">
        <span class="amt">${p.amount} AED</span>
        <button type="button" class="edit-purchase-btn" data-id="${p.id}">✏️</button>
        <button type="button" class="delete-purchase-btn" data-id="${p.id}">🗑️</button>
      </span>
    </div>`;
  }).join("");

  document.querySelectorAll(".edit-purchase-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditPurchaseSheet(btn.dataset.id));
  });
  document.querySelectorAll(".delete-purchase-btn").forEach((btn) => {
    btn.addEventListener("click", () => deletePurchase(btn.dataset.id));
  });

  const counts = {};
  purchases.forEach((p) => { if (p.branch) counts[p.branch] = (counts[p.branch] || 0) + 1; });
  const topBranch = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const bl = document.getElementById("branchInfoLine");
  if (bl) bl.textContent = topBranch ? `📍 Most-visited branch: ${topBranch}` : "";
}

// Staff (non-admin) don't get the full purchase history — only the entries
// they personally recorded, so they can fix their own mistakes without
// seeing what other staff or branches sold this customer.
async function loadMyPurchases() {
  const listEl = document.getElementById("purchaseList");
  const snap = await getDocs(query(
    collection(db, "customers", customerId, "purchases"),
    where("recordedBy", "==", currentUserEmail)
  ));

  if (snap.empty) {
    listEl.innerHTML = `<div class="empty-state">You haven't recorded any purchases for this customer</div>`;
    loadedPurchases = [];
    return;
  }

  const purchases = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  loadedPurchases = purchases;

  listEl.innerHTML =
    `<div class="muted" style="margin-bottom:8px; font-size:11.5px;">Showing only purchases you recorded for this customer</div>` +
    purchases.map((p) => {
      const branchLabel = p.branch ? ` · ${escapeHtml(p.branch)}` : "";
      return `<div class="purchase-row">
        <span class="date">${p.date || "—"}${branchLabel}</span>
        <span style="display:flex; align-items:center; gap:8px;">
          <span class="amt">${p.amount} AED</span>
          <button type="button" class="edit-purchase-btn" data-id="${p.id}">✏️</button>
          <button type="button" class="delete-purchase-btn" data-id="${p.id}">🗑️</button>
        </span>
      </div>`;
    }).join("");

  document.querySelectorAll(".edit-purchase-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditPurchaseSheet(btn.dataset.id));
  });
  document.querySelectorAll(".delete-purchase-btn").forEach((btn) => {
    btn.addEventListener("click", () => deletePurchase(btn.dataset.id));
  });
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
      ? `<div class="barcode-box"><svg id="bc_${v.id}"></svg></div><div class="voucher-code-text">${v.code}</div>
         <button class="btn secondary" data-mark-used="${v.id}" style="margin-top:8px;">✅ Mark as Used</button>`
      : "";
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

  // Only fetch the barcode library if it's actually needed — most
  // vouchers on a given profile are "used" or "expired" and never render one.
  const hasActiveVoucher = vouchers.some((v) => {
    const expiresMs = v.expiresAt?.seconds ? v.expiresAt.seconds * 1000 : 0;
    return v.status === "active" && !(expiresMs && expiresMs < now);
  });
  if (hasActiveVoucher) {
    await loadBarcodeLib();
  }

  vouchers.forEach((v) => {
    const expiresMs = v.expiresAt?.seconds ? v.expiresAt.seconds * 1000 : 0;
    if (v.status === "active" && !(expiresMs && expiresMs < now) && window.JsBarcode) {
      try { window.JsBarcode(`#bc_${v.id}`, v.code, { format: "CODE128", height: 50, displayValue: false, margin: 6 }); }
      catch (e) { console.error(e); }
    }
  });

  listEl.querySelectorAll("[data-mark-used]").forEach((btn) => {
    btn.addEventListener("click", () => markVoucherUsed(btn.dataset.markUsed, btn));
  });
}

// Loads the JsBarcode library from CDN on demand (only once per page load).
let barcodeLibPromise = null;
function loadBarcodeLib() {
  if (window.JsBarcode) return Promise.resolve();
  if (barcodeLibPromise) return barcodeLibPromise;

  barcodeLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load barcode library"));
    document.head.appendChild(script);
  });
  return barcodeLibPromise;
}

async function markVoucherUsed(voucherId, btn) {
  const confirmed = window.confirm("Mark this voucher as used? This cannot be undone.");
  if (!confirmed) return;

  btn.disabled = true;
  btn.textContent = "Applying...";

  try {
    await updateDoc(doc(db, "vouchers", voucherId), { status: "used", usedAt: serverTimestamp() });
    await updateDoc(doc(db, "customers", customerId), {
      activeVoucherCount: Math.max(0, (customerData.activeVoucherCount || 1) - 1),
    });
    logActivity(`Voucher used — ${customerData.name || "Unnamed"}`, "");
    loadAll();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "✅ Mark as Used";
    alert("Failed to update the voucher. Please try again.");
    console.error(err);
  }
}

// ---- Add purchase ----
const purchaseOverlay = document.getElementById("purchaseOverlay");
document.getElementById("openPurchaseBtn").addEventListener("click", () => {
  applyDefaultSalesperson();
  document.getElementById("purchaseForm").querySelector('button[type="submit"]').disabled = false;
  purchaseOverlay.classList.add("show");
});
document.getElementById("cancelPurchaseBtn").addEventListener("click", () => purchaseOverlay.classList.remove("show"));

document.getElementById("purchaseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById("purchaseError");
  const successBox = document.getElementById("purchaseSuccess");
  errorBox.classList.remove("show");
  successBox.classList.remove("show");

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn.disabled) return; // already processing this submission — ignore a fast double-tap
  submitBtn.disabled = true;

  const amount = parseFloat(document.getElementById("p_amount").value);
  const branch = document.getElementById("p_branch").value;
  const salesperson = document.getElementById("p_salesperson").value;
  const date = document.getElementById("p_date").value || new Date().toISOString().slice(0, 10);
  if (!amount || amount <= 0) { submitBtn.disabled = false; return; }
  if (!salesperson) {
    errorBox.textContent = "Please select which salesperson made this sale.";
    errorBox.classList.add("show");
    submitBtn.disabled = false;
    return;
  }

  try {
    // Both writes succeed together or not at all — no more risk of the
    // customer's purchase being saved while its sales-page copy silently fails.
    const batch = writeBatch(db);

    const purchaseRef = doc(collection(db, "customers", customerId, "purchases"));
    const salesRef = doc(collection(db, "sales"));
    batch.set(purchaseRef, {
      amount, date, branch, createdAt: serverTimestamp(),
      recordedBy: salesperson, salesId: salesRef.id,
    });

    // A flat copy for the Staff Profile page — querying a top-level
    // collection needs no special Firestore index, unlike searching across
    // every customer's nested purchases at once.
    batch.set(salesRef, {
      customerId, customerName: customerData.name || "",
      amount, date, branch, recordedBy: salesperson, createdAt: serverTimestamp(),
      purchaseId: purchaseRef.id,
    });

    await batch.commit();

    // Fire-and-forget: the customer's thank-you email shouldn't slow down
    // or block the rest of the purchase flow if it's ever slow to send.
    if (customerData.email) {
      sendEmail(customerData.email, thankYouSubject(), thankYouMessage(customerData.name || ""));
    }

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

    // Keep a site-wide running total per branch (used by the Reports page's
    // all-time "Branch Sales" chart) so that chart never has to re-scan
    // every purchase in the shop's history — it just reads one small doc.
    updateBranchTotal(branch, amount);

    document.getElementById("purchaseForm").reset();
    applyDefaultSalesperson();
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
    submitBtn.disabled = false;

  } catch (err) {
    document.getElementById("purchaseError").textContent =
      "Failed to record the purchase: " + (err && err.message ? err.message : String(err));
    document.getElementById("purchaseError").classList.add("show");
    console.error(err);
    submitBtn.disabled = false;
  }
});


// ---- Correct Purchase (only the staff member who recorded it can edit amount & branch) ----
const editPurchaseOverlay = document.getElementById("editPurchaseOverlay");
let editingPurchaseId = null;

document.getElementById("ep_branch").innerHTML =
  BRANCHES.map((b) => `<option value="${b}">${b}</option>`).join("");

function openEditPurchaseSheet(purchaseId) {
  const p = loadedPurchases.find((x) => x.id === purchaseId);
  if (!p) return;
  editingPurchaseId = purchaseId;
  document.getElementById("ep_amount").value = p.amount;
  document.getElementById("ep_branch").value = p.branch || BRANCHES[0];
  document.getElementById("editPurchaseError").classList.remove("show");
  document.getElementById("editPurchaseWarning").classList.remove("show");
  document.getElementById("editPurchaseSuccess").classList.remove("show");
  document.getElementById("editPurchaseForm").querySelector('button[type="submit"]').disabled = false;
  editPurchaseOverlay.classList.add("show");
}
document.getElementById("cancelEditPurchaseBtn").addEventListener("click", () => editPurchaseOverlay.classList.remove("show"));

document.getElementById("editPurchaseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("editPurchaseError");
  const warnEl = document.getElementById("editPurchaseWarning");
  const okEl = document.getElementById("editPurchaseSuccess");
  errEl.classList.remove("show");
  warnEl.classList.remove("show");

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn.disabled) return; // already processing — ignore a fast double-tap
  submitBtn.disabled = true;

  const purchase = loadedPurchases.find((x) => x.id === editingPurchaseId);
  if (!purchase) {
    errEl.textContent = "Could not find this purchase."; errEl.classList.add("show");
    submitBtn.disabled = false;
    return;
  }

  const newAmount = parseFloat(document.getElementById("ep_amount").value);
  const newBranch = document.getElementById("ep_branch").value;
  if (!newAmount || newAmount <= 0) {
    errEl.textContent = "Enter a valid amount."; errEl.classList.add("show");
    submitBtn.disabled = false;
    return;
  }

  const oldAmount = purchase.amount;
  const oldBranch = purchase.branch;
  const deltaAmount = newAmount - oldAmount;
  const branchChanged = newBranch !== oldBranch;

  if (!branchChanged && deltaAmount === 0) {
    editPurchaseOverlay.classList.remove("show");
    submitBtn.disabled = false;
    return;
  }

  try {
    const oldTier = getTierForPurchase(oldAmount);
    const newTier = getTierForPurchase(newAmount);
    const tierChanged = (oldTier ? oldTier.discount : 0) !== (newTier ? newTier.discount : 0);

    const monthKey = getMonthKeyFromDateStr(purchase.date);
    const oldPoints = calculatePoints(oldAmount);
    const newPoints = calculatePoints(newAmount);
    const deltaPoints = newPoints - oldPoints;

    const oldBranchCounts = customerData.branchCounts || {};
    let newBranchCounts = oldBranchCounts;
    let topBranch = customerData.topBranch;
    if (branchChanged) {
      newBranchCounts = { ...oldBranchCounts };
      newBranchCounts[oldBranch] = Math.max(0, (newBranchCounts[oldBranch] || 0) - 1);
      newBranchCounts[newBranch] = (newBranchCounts[newBranch] || 0) + 1;
      topBranch = Object.keys(newBranchCounts).sort((a, b) => newBranchCounts[b] - newBranchCounts[a])[0];
    }

    const batch = writeBatch(db);
    const purchaseUpdate = { amount: newAmount, branch: newBranch };

    if (purchase.salesId) {
      batch.update(doc(db, "sales", purchase.salesId), { amount: newAmount, branch: newBranch });
    } else {
      // This purchase predates the sales-copy link — create one now (with
      // the corrected values) so it starts showing up correctly on the
      // Staff Profile page from this point on.
      const newSalesRef = doc(collection(db, "sales"));
      batch.set(newSalesRef, {
        customerId, customerName: customerData.name || "",
        amount: newAmount, date: purchase.date, branch: newBranch,
        recordedBy: purchase.recordedBy, createdAt: serverTimestamp(),
        purchaseId: editingPurchaseId,
      });
      purchaseUpdate.salesId = newSalesRef.id;
    }

    batch.update(doc(db, "customers", customerId, "purchases", editingPurchaseId), purchaseUpdate);

    batch.update(doc(db, "customers", customerId), {
      totalPurchases: increment(deltaAmount),
      [`monthlySpend.${monthKey}`]: increment(deltaAmount),
      totalPoints: increment(deltaPoints),
      branchCounts: newBranchCounts,
      topBranch,
    });

    if (branchChanged) {
      batch.set(doc(db, "stats", "branchTotals"), {
        [oldBranch]: increment(-oldAmount),
        [newBranch]: increment(newAmount),
      }, { merge: true });
    } else if (deltaAmount !== 0) {
      batch.set(doc(db, "stats", "branchTotals"), {
        [oldBranch]: increment(deltaAmount),
      }, { merge: true });
    }

    const activityRef = doc(collection(db, "activity"));
    batch.set(activityRef, {
      action: `Purchase corrected for ${customerData.name || "Unnamed"} — ${oldAmount} AED/${oldBranch} → ${newAmount} AED/${newBranch}`,
      at: serverTimestamp(),
      branch: newBranch,
      by: auth.currentUser ? auth.currentUser.email : "unknown",
    });

    await batch.commit();

    if (tierChanged) {
      warnEl.textContent = `⚠️ This changed the voucher tier (${oldTier ? oldTier.discount + " AED" : "none"} → ${newTier ? newTier.discount + " AED" : "none"}). No voucher was auto-issued or removed — please check this customer's vouchers manually if needed.`;
      warnEl.classList.add("show");
    }

    okEl.textContent = "Purchase corrected.";
    okEl.classList.add("show");
    setTimeout(() => {
      editPurchaseOverlay.classList.remove("show");
      okEl.classList.remove("show");
      loadAll();
    }, tierChanged ? 2600 : 1200);
    submitBtn.disabled = false;
  } catch (err) {
    errEl.textContent = "Could not save correction: " + (err && err.message ? err.message : String(err));
    errEl.classList.add("show");
    console.error(err);
    submitBtn.disabled = false;
  }
});


// Fully removes a purchase (not just corrects it) — reverses everything it
// contributed (points, lifetime total, monthly spend, branch counts, and
// the site-wide branch totals) then deletes the record. Available to admin
// (any purchase) or the staff member who originally recorded it.
async function deletePurchase(purchaseId) {
  const purchase = loadedPurchases.find((x) => x.id === purchaseId);
  if (!purchase) return;

  const confirmed = window.confirm(
    `Delete this ${purchase.amount} AED purchase (${purchase.date || ""}, ${purchase.branch || ""})? This cannot be undone.`
  );
  if (!confirmed) return;

  const btn = document.querySelector(`.delete-purchase-btn[data-id="${purchaseId}"]`);
  if (btn) {
    if (btn.disabled) return; // already processing — ignore a fast double-tap
    btn.disabled = true;
    btn.textContent = "...";
  }

  try {
    const oldTier = getTierForPurchase(purchase.amount);
    const monthKey = getMonthKeyFromDateStr(purchase.date);
    const points = calculatePoints(purchase.amount);

    const oldBranchCounts = customerData.branchCounts || {};
    const newBranchCounts = { ...oldBranchCounts };
    if (purchase.branch) {
      newBranchCounts[purchase.branch] = Math.max(0, (newBranchCounts[purchase.branch] || 0) - 1);
    }
    const topBranch = Object.keys(newBranchCounts).sort((a, b) => newBranchCounts[b] - newBranchCounts[a])[0] || "";

    const batch = writeBatch(db);

    batch.delete(doc(db, "customers", customerId, "purchases", purchaseId));

    batch.update(doc(db, "customers", customerId), {
      totalPurchases: increment(-purchase.amount),
      [`monthlySpend.${monthKey}`]: increment(-purchase.amount),
      totalPoints: increment(-points),
      branchCounts: newBranchCounts,
      topBranch,
    });

    if (purchase.branch) {
      batch.set(doc(db, "stats", "branchTotals"), {
        [purchase.branch]: increment(-purchase.amount),
      }, { merge: true });
    }

    if (purchase.salesId) {
      batch.delete(doc(db, "sales", purchase.salesId));
    }

    const activityRef = doc(collection(db, "activity"));
    batch.set(activityRef, {
      action: `Purchase deleted for ${customerData.name || "Unnamed"} — ${purchase.amount} AED/${purchase.branch || "—"}`,
      at: serverTimestamp(),
      branch: purchase.branch || "",
      by: auth.currentUser ? auth.currentUser.email : "unknown",
    });

    await batch.commit();

    if (oldTier) {
      alert(`Deleted. Note: this purchase had triggered a ${oldTier.discount} AED voucher tier — no voucher was auto-removed, please check this customer's vouchers manually if needed.`);
    }

    loadAll();
  } catch (err) {
    alert("Failed to delete the purchase. Please try again.");
    console.error(err);
    if (btn) { btn.disabled = false; btn.textContent = "🗑️"; }
  }
}


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
    logActivity(`Points redeemed — ${customerData.name || "Unnamed"} (${pts} pts → ${discountAED} AED)`, "");
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
  document.getElementById("e_address").value = customerData.address || "";

  // Emirate: select the stored value if it's a known emirate, otherwise fall back to "Other".
  const savedEmirate = customerData.emirate || "";
  if (savedEmirate && EMIRATES.hasOwnProperty(savedEmirate)) {
    emirateSelect.value = savedEmirate;
    populateAreaOptions(savedEmirate);
    emirateOtherInput.style.display = "none";
    emirateOtherInput.value = "";
  } else if (savedEmirate) {
    emirateSelect.value = OTHER_VALUE;
    emirateOtherInput.style.display = "block";
    emirateOtherInput.value = savedEmirate;
    areaSelect.innerHTML = `<option value="${OTHER_VALUE}">Other (type manually)</option>`;
  } else {
    emirateSelect.value = "";
    emirateOtherInput.style.display = "none";
    emirateOtherInput.value = "";
    areaSelect.innerHTML = `<option value="">— Select —</option><option value="${OTHER_VALUE}">Other (type manually)</option>`;
  }

  // Area: select the stored value if it's in the current area list, otherwise "Other".
  const savedArea = customerData.area || "";
  const knownAreas = EMIRATES[savedEmirate] || [];
  if (savedArea && knownAreas.includes(savedArea)) {
    areaSelect.value = savedArea;
    areaOtherInput.style.display = "none";
    areaOtherInput.value = "";
  } else if (savedArea) {
    areaSelect.value = OTHER_VALUE;
    areaOtherInput.style.display = "block";
    areaOtherInput.value = savedArea;
  } else {
    areaOtherInput.style.display = "none";
    areaOtherInput.value = "";
  }

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

  const nameCheck = validateText(document.getElementById("e_name").value, { label: "Name", maxLength: 80, required: true });
  const phoneCheck = validatePhone(document.getElementById("e_phone").value);
  const emailCheck = validateEmail(document.getElementById("e_email").value);
  const birthday = document.getElementById("e_birthday").value;
  const addressCheck = validateText(document.getElementById("e_address").value, { label: "Address", maxLength: 200, required: false });

  // Resolve emirate: either the dropdown value, or the typed value if "Other" was chosen.
  const emirateRaw = emirateSelect.value === OTHER_VALUE ? emirateOtherInput.value : emirateSelect.value;
  const areaRaw = areaSelect.value === OTHER_VALUE ? areaOtherInput.value : areaSelect.value;
  const emirateCheck = validateText(emirateRaw, { label: "Emirate", maxLength: 60, required: false });
  const areaCheck = validateText(areaRaw, { label: "Area", maxLength: 60, required: false });

  const failedCheck = [nameCheck, phoneCheck, emailCheck, addressCheck, emirateCheck, areaCheck].find((c) => !c.valid);
  if (failedCheck) { errEl.textContent = failedCheck.error; errEl.classList.add("show"); return; }
  const name = nameCheck.value, phone = phoneCheck.value, email = emailCheck.value, address = addressCheck.value;
  const emirate = emirateCheck.value, area = areaCheck.value;

  try {
    await updateDoc(doc(db, "customers", customerId), { name, phone, email, birthday, address, emirate, area });
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

// Admin-only repair tool: re-derives totalPurchases, totalPoints,
// monthlySpend, branchCounts, topBranch and activeVoucherCount straight
// from the customer's actual purchase/voucher records, fixing any drift
// (e.g. from a double-tapped submit) instead of trusting the running totals.
async function recalculateCustomerTotals() {
  if (userRole !== "admin") return;
  const confirmed = window.confirm(
    "Recalculate this customer's totals from their actual purchase records? This overwrites the current numbers with freshly-computed ones."
  );
  if (!confirmed) return;

  const btn = document.getElementById("recalcTotalsBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Recalculating..."; }

  try {
    const [purchasesSnap, vouchersSnap] = await Promise.all([
      getDocs(collection(db, "customers", customerId, "purchases")),
      getDocs(query(collection(db, "vouchers"), where("customerId", "==", customerId))),
    ]);

    let totalPurchases = 0, totalPoints = 0;
    const monthlySpend = {};
    const branchCounts = {};
    let lastPurchaseDate = "";

    purchasesSnap.docs.forEach((d) => {
      const p = d.data();
      const amount = p.amount || 0;
      totalPurchases += amount;
      totalPoints += calculatePoints(amount);
      if (p.date) {
        const mk = getMonthKeyFromDateStr(p.date);
        monthlySpend[mk] = (monthlySpend[mk] || 0) + amount;
        if (p.date > lastPurchaseDate) lastPurchaseDate = p.date;
      }
      if (p.branch) branchCounts[p.branch] = (branchCounts[p.branch] || 0) + 1;
    });

    const topBranch = Object.keys(branchCounts).sort((a, b) => branchCounts[b] - branchCounts[a])[0] || "";

    const now = Date.now();
    let activeVoucherCount = 0;
    vouchersSnap.docs.forEach((d) => {
      const v = d.data();
      const expiresMs = v.expiresAt && v.expiresAt.seconds ? v.expiresAt.seconds * 1000 : 0;
      if (v.status === "active" && !(expiresMs && expiresMs < now)) activeVoucherCount++;
    });

    await updateDoc(doc(db, "customers", customerId), {
      totalPurchases, totalPoints, monthlySpend, branchCounts, topBranch,
      lastPurchaseDate: lastPurchaseDate || null,
      activeVoucherCount,
    });

    logActivity(`Recalculated totals for ${customerData.name || "Unnamed"} (repair)`, "");
    alert("Totals recalculated successfully.");
    loadAll();
  } catch (err) {
    alert("Failed to recalculate totals. Please try again.");
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🔄 Recalculate Totals"; }
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// Combines emirate + area into one display string, e.g. "Dubai — Al Barsha".
function regionLabel(data) {
  const emirate = (data.emirate || "").trim();
  const area = (data.area || "").trim();
  if (emirate && area) return `${emirate} — ${area}`;
  return emirate || area || "—";
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

// Keeps a single site-wide document with a running lifetime total per
// branch, updated incrementally on every purchase. This lets the Reports
// page show accurate all-time branch totals by reading ONE document,
// instead of re-reading every purchase ever recorded.
async function updateBranchTotal(branch, amount) {
  try {
    await setDoc(doc(db, "stats", "branchTotals"), { [branch]: increment(amount) }, { merge: true });
  } catch (err) {
    console.error("Failed to update branch totals", err);
  }
}
