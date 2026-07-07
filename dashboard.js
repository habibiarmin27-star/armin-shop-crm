// dashboard.js
import { db, auth } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import { getCustomerLevel, getThreeMonthTotal } from "./levels-config.js";
import { pointsToAED } from "./points-config.js";
import { validateText, validateEmail, validatePhone } from "./input-guard.js";
import {
  collection, collectionGroup, getDocs, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allCustomers = [];
let userRole = "staff";

requireAuth(async (user, role) => {
  userRole = role;
  renderRoleUI();
  await loadCustomers();
  if (userRole === "admin") loadStats();
});

function renderRoleUI() {
  // Role badge
  const badge = document.getElementById("roleBadge");
  if (badge) {
    badge.className = "role-badge " + userRole;
    badge.textContent = userRole === "admin" ? "Admin" : "Staff";
  }

  // Quick access cards
  const qa = document.getElementById("quickAccess");
  if (qa) {
    if (userRole === "admin") {
      qa.innerHTML =
        '<div class="section-title">Quick Access</div>' +
        '<div class="quick-grid">' +
          '<a class="quick-card highlight" href="reports.html"><span class="icon">📊</span><span class="q-title">Reports</span><span class="q-sub">Charts & branch data</span></a>' +
          '<a class="quick-card" href="reminders.html"><span class="icon">🔔</span><span class="q-title">Reminders</span><span class="q-sub">Birthdays & inactive</span></a>' +
          '<a class="quick-card" href="scan.html"><span class="icon">📷</span><span class="q-title">Scan Voucher</span><span class="q-sub">Apply discount</span></a>' +
          '<a class="quick-card" href="staff.html"><span class="icon">👤</span><span class="q-title">Staff</span><span class="q-sub">Manage team</span></a>' +
          '<a class="quick-card" href="history.html"><span class="icon">🗓</span><span class="q-title">History</span><span class="q-sub">Look up any day</span></a>' +
        '</div>';

      const exportEl = document.getElementById("exportSection");
      if (exportEl) {
        exportEl.innerHTML =
          '<div class="section-title">Data Backup</div>' +
          '<div class="card">' +
            '<div class="muted" style="margin-bottom:12px;">Download a copy of your data as a spreadsheet (CSV) — keep it somewhere safe as a backup, or use it for accounting.</div>' +
            '<button class="btn secondary" id="exportCustomersBtn">⬇️ Export Customers (CSV)</button>' +
            '<button class="btn secondary" id="exportPurchasesBtn" style="margin-top:10px;">⬇️ Export All Purchases (CSV)</button>' +
          '</div>';
        document.getElementById("exportCustomersBtn").addEventListener("click", (e) => exportCustomersCSV(e.target));
        document.getElementById("exportPurchasesBtn").addEventListener("click", (e) => exportPurchasesCSV(e.target));
      }
    } else {
      qa.innerHTML =
        '<div class="section-title">Quick Access</div>' +
        '<div class="quick-grid">' +
          '<a class="quick-card highlight" href="scan.html"><span class="icon">📷</span><span class="q-title">Scan Voucher</span><span class="q-sub">Apply discount</span></a>' +
          '<a class="quick-card" href="reminders.html"><span class="icon">🔔</span><span class="q-title">Reminders</span><span class="q-sub">Birthdays & inactive</span></a>' +
        '</div>';
    }
  }

  // Hide stats area entirely for staff
  if (userRole !== "admin") {
    const s = document.getElementById("statsArea");
    if (s) s.style.display = "none";
  }
}

async function loadCustomers() {
  const listArea = document.getElementById("listArea");
  try {
    const snap = await getDocs(query(collection(db, "customers"), orderBy("name")));
    allCustomers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderList(allCustomers);
  } catch (err) {
    listArea.innerHTML = '<div class="empty-state">Failed to load customers</div>';
    console.error(err);
  }
}

async function loadStats() {
  const statsArea = document.getElementById("statsArea");
  try {
    // "Sales This Month" is derived from each customer's monthlySpend map —
    // a running total already kept up to date at purchase-time. This avoids
    // reading every purchase document just to add up one month's total,
    // which would get slower and slower as the shop's history grows.
    const now = new Date();
    const thisMonthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    const thisMonthSales = allCustomers.reduce((s,c) => {
      const spend = c.monthlySpend && c.monthlySpend[thisMonthKey] ? c.monthlySpend[thisMonthKey] : 0;
      return s + spend;
    }, 0);

    const totalCustomers = allCustomers.length;
    const activeVouchers = allCustomers.reduce((s,c) => s + (c.activeVoucherCount||0), 0);
    const vipCount = allCustomers.filter(c => {
      const lv = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
      return lv && lv.name === "VIP";
    }).length;

    statsArea.innerHTML =
      '<div class="dash-stat"><div class="lbl">Total Customers</div><div class="num">' + totalCustomers + '</div></div>' +
      '<div class="dash-stat"><div class="lbl">Sales This Month</div><div class="num">' + thisMonthSales.toLocaleString('en-US') + ' <span style="font-size:11px;">AED</span></div></div>' +
      '<div class="dash-stat"><div class="lbl">Active Vouchers</div><div class="num">' + activeVouchers + '</div></div>' +
      '<div class="dash-stat"><div class="lbl">VIP Customers</div><div class="num">' + vipCount + '</div></div>';
  } catch (err) {
    statsArea.innerHTML = "";
    console.error(err);
  }
}

function renderList(customers) {
  const listArea = document.getElementById("listArea");
  if (customers.length === 0) {
    listArea.innerHTML = '<div class="empty-state">No customers yet. Tap + to add one.</div>';
    return;
  }

  listArea.innerHTML = customers.map(c => {
    const level = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
    const levelChip = level ? '<span class="level-badge ' + level.badgeClass + '">' + level.name + '</span>' : '';

    if (userRole === "admin") {
      const threeMonthTotal = getThreeMonthTotal(c.monthlySpend);
      const branch = c.topBranch || "—";
      return '<a class="cust-row" href="customer.html?id=' + c.id + '">' +
        '<div class="top-line"><span class="name">' + esc(c.name||'Unnamed') + '</span>' + levelChip + '</div>' +
        '<div class="sub-line">' +
          '<div class="meta"><span>' + esc(c.phone||'—') + '</span><span>' + esc(branch) + '</span></div>' +
          '<div class="right-stats"><div class="amt">' + threeMonthTotal.toLocaleString('en-US') + ' AED</div>' +
          '<div class="amt-lbl">' + (c.activeVoucherCount>0 ? '🎫 '+c.activeVoucherCount+' active' : 'last 3 months') + '</div></div>' +
        '</div></a>';
    } else {
      // Staff — limited: name, phone, points balance, no totals
      const pts = c.totalPoints || 0;
      return '<a class="cust-row" href="customer.html?id=' + c.id + '">' +
        '<div class="top-line"><span class="name">' + esc(c.name||'Unnamed') + '</span>' + levelChip + '</div>' +
        '<div class="meta" style="margin-bottom:4px;"><span>' + esc(c.phone||'—') + '</span></div>' +
        '<div style="font-size:12.5px;"><b>' + pts + ' pts</b> = ' + pointsToAED(pts) + ' AED balance</div>' +
        '<div class="locked-info">🔒 Sales total & history — Admin only</div>' +
      '</a>';
    }
  }).join("");
}

document.getElementById("searchInput").addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) { renderList(allCustomers); return; }
  renderList(allCustomers.filter(c =>
    (c.name||'').toLowerCase().includes(term) || (c.phone||'').toLowerCase().includes(term)
  ));
});

// Add-customer sheet (both roles can add)
const addOverlay = document.getElementById("addOverlay");
document.getElementById("openAddBtn").addEventListener("click", () => addOverlay.classList.add("show"));
document.getElementById("cancelAddBtn").addEventListener("click", () => addOverlay.classList.remove("show"));

document.getElementById("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById("addError");
  errorBox.classList.remove("show");

  const nameCheck = validateText(document.getElementById("c_name").value, { label: "Name", maxLength: 80, required: true });
  const phoneCheck = validatePhone(document.getElementById("c_phone").value);
  const emailCheck = validateEmail(document.getElementById("c_email").value);
  const birthday = document.getElementById("c_birthday").value;

  const failedCheck = [nameCheck, phoneCheck, emailCheck].find((c) => !c.valid);
  if (failedCheck) {
    errorBox.textContent = failedCheck.error;
    errorBox.classList.add("show");
    return;
  }
  const name = nameCheck.value, phone = phoneCheck.value, email = emailCheck.value;

  try {
    await addDoc(collection(db, "customers"), {
      name, phone, email, birthday,
      totalPurchases: 0, activeVoucherCount: 0, totalPoints: 0,
      createdAt: serverTimestamp(),
    });
    document.getElementById("addForm").reset();
    addOverlay.classList.remove("show");
    logActivity(`New customer added — ${name}`);
    loadCustomers();
    if (userRole === "admin") loadStats();
  } catch (err) {
    errorBox.textContent = "Could not save. Please try again.";
    errorBox.classList.add("show");
    console.error(err);
  }
});

// Writes a row to the "activity" collection for Staff Management's log.
// No branch is known yet at customer-creation time (branch is picked per purchase).
async function logActivity(action) {
  try {
    await addDoc(collection(db, "activity"), {
      action,
      by: auth.currentUser ? auth.currentUser.email : "unknown",
      branch: "",
      at: serverTimestamp(),
    });
  } catch (err) {
    console.error("Failed to log activity", err);
  }
}

// ── CSV export (data backup / accounting) ──────────────────────────────

function csvEscape(val) {
  const str = String(val === undefined || val === null ? "" : val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowsToCSV(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(",")));
  return lines.join("\r\n");
}

function downloadCSV(filename, csvContent) {
  // Leading BOM so Excel correctly detects UTF-8 (needed for Arabic names, etc.)
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportCustomersCSV(btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparing...";
  try {
    const headers = [
      "Name", "Phone", "Email", "Birthday", "Address", "Top Branch", "Level",
      "Points", "Balance (AED)", "Lifetime Total (AED)", "Active Vouchers", "Created"
    ];
    const rows = allCustomers.map((c) => {
      const level = getCustomerLevel(getThreeMonthTotal(c.monthlySpend));
      const created = c.createdAt && c.createdAt.seconds
        ? new Date(c.createdAt.seconds * 1000).toISOString().slice(0, 10) : "";
      return [
        c.name || "", c.phone || "", c.email || "", c.birthday || "", c.address || "",
        c.topBranch || "", level ? level.name : "",
        c.totalPoints || 0, pointsToAED(c.totalPoints || 0),
        c.totalPurchases || 0, c.activeVoucherCount || 0, created,
      ];
    });
    const csv = rowsToCSV(headers, rows);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`al-hudu-customers-${dateStamp}.csv`, csv);
  } catch (err) {
    alert("Failed to export customers. Please try again.");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function exportPurchasesCSV(btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparing... (this may take a moment)";
  try {
    const custById = {};
    allCustomers.forEach((c) => { custById[c.id] = c.name || "Unnamed"; });

    const snap = await getDocs(collectionGroup(db, "purchases"));
    const headers = ["Date", "Customer", "Branch", "Amount (AED)"];
    const rows = snap.docs.map((d) => {
      const p = d.data();
      const custId = d.ref.parent.parent ? d.ref.parent.parent.id : null;
      const custName = custId && custById[custId] ? custById[custId] : "Unknown";
      return [p.date || "", custName, p.branch || "", p.amount || 0];
    }).sort((a, b) => (a[0] < b[0] ? 1 : -1)); // newest first

    const csv = rowsToCSV(headers, rows);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`al-hudu-purchases-${dateStamp}.csv`, csv);
  } catch (err) {
    alert("Failed to export purchases. Please try again.");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
