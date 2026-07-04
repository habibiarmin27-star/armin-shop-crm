// history.js — Admin-only: full breakdown of everything that happened on a
// specific date. Every query here is bounded to a single day, so it stays
// fast and complete no matter how far back in the shop's history you look.
import { db } from "./firebase-init.js";
import { requireAdmin } from "./auth-guard.js";
import { calculatePoints } from "./points-config.js";
import {
  collection, collectionGroup, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

requireAdmin(() => {
  // Default the picker to today for convenience.
  document.getElementById("dateInput").value = new Date().toISOString().slice(0,10);
  document.getElementById("searchBtn").addEventListener("click", runSearch);
});

async function runSearch() {
  const dateStr = document.getElementById("dateInput").value;
  const area = document.getElementById("resultsArea");
  if (!dateStr) return;

  area.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const dayStart = new Date(dateStr + "T00:00:00");
    const dayEnd = new Date(dateStr + "T23:59:59.999");

    const [purchasesSnap, customersSnap, newCustSnap, issuedSnap, usedSnap, activitySnap] = await Promise.all([
      getDocs(query(collectionGroup(db, "purchases"), where("date", "==", dateStr))),
      getDocs(collection(db, "customers")),
      getDocs(query(collection(db, "customers"), where("createdAt", ">=", dayStart), where("createdAt", "<=", dayEnd))),
      getDocs(query(collection(db, "vouchers"), where("issuedAt", ">=", dayStart), where("issuedAt", "<=", dayEnd))),
      getDocs(query(collection(db, "vouchers"), where("usedAt", ">=", dayStart), where("usedAt", "<=", dayEnd))),
      getDocs(query(collection(db, "activity"), where("at", ">=", dayStart), where("at", "<=", dayEnd))),
    ]);

    const customersById = {};
    customersSnap.docs.forEach(d => { customersById[d.id] = d.data(); });

    const purchases = purchasesSnap.docs.map(d => {
      const custId = d.ref.parent.parent ? d.ref.parent.parent.id : null;
      const custName = custId && customersById[custId] ? customersById[custId].name : "Unknown";
      return { ...d.data(), custId, custName };
    });

    const newCustomers = newCustSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const vouchersIssued = issuedSnap.docs.map(d => d.data());
    const vouchersUsed = usedSnap.docs.map(d => d.data());
    const activities = activitySnap.docs.map(d => d.data())
      .sort((a,b) => (a.at?.seconds||0) - (b.at?.seconds||0));

    render(area, dateStr, { purchases, newCustomers, vouchersIssued, vouchersUsed, activities });

  } catch (err) {
    area.innerHTML = '<div class="empty-state">Failed to load. If this is your first search, Firestore may need a moment to prepare — try again in a minute.</div>';
    console.error(err);
  }
}

function render(area, dateStr, data) {
  const { purchases, newCustomers, vouchersIssued, vouchersUsed, activities } = data;

  const totalSales = purchases.reduce((s,p) => s + (p.amount||0), 0);
  const totalPoints = purchases.reduce((s,p) => s + calculatePoints(p.amount||0), 0);

  // Sales by branch
  const branchSales = {};
  purchases.forEach(p => {
    const b = p.branch || "Unknown";
    branchSales[b] = (branchSales[b]||0) + (p.amount||0);
  });
  const branchLines = Object.entries(branchSales).sort((a,b)=>b[1]-a[1])
    .map(([b,v]) => '<div class="hist-row"><span class="left"><span class="title">' + e(b) + '</span></span><span class="amt">' + v.toLocaleString('en-US') + ' AED</span></div>')
    .join("") || '<div class="empty-state">No sales this day</div>';

  const purchaseLines = purchases.length
    ? purchases.map(p => '<div class="hist-row"><span class="left"><span class="title">' + e(p.custName) + '</span><span class="meta">' + e(p.branch||'—') + '</span></span><span class="amt">' + (p.amount||0).toLocaleString('en-US') + ' AED</span></div>').join("")
    : '<div class="empty-state">No purchases this day</div>';

  const newCustLines = newCustomers.length
    ? newCustomers.map(c => '<div class="hist-row"><span class="left"><span class="title">' + e(c.name||'Unnamed') + '</span><span class="meta">' + e(c.phone||'—') + '</span></span></div>').join("")
    : '<div class="empty-state">No new customers this day</div>';

  const issuedLines = vouchersIssued.length
    ? vouchersIssued.map(v => '<div class="hist-row"><span class="left"><span class="title">' + e(v.customerName||'Unnamed') + '</span><span class="meta">Issued</span></span><span class="amt">' + (v.discount||0) + ' AED</span></div>').join("")
    : '<div class="empty-state">No vouchers issued this day</div>';

  const usedLines = vouchersUsed.length
    ? vouchersUsed.map(v => '<div class="hist-row"><span class="left"><span class="title">' + e(v.customerName||'Unnamed') + '</span><span class="meta">Used</span></span><span class="amt">' + (v.discount||0) + ' AED</span></div>').join("")
    : '<div class="empty-state">No vouchers used this day</div>';

  const activityLines = activities.length
    ? activities.map(a => {
        const time = a.at?.seconds ? new Date(a.at.seconds*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '';
        return '<div class="hist-row"><span class="left"><span class="title">' + e(a.action||'Activity') + '</span><span class="meta">By: ' + e(a.by||'—') + (a.branch? ' · '+e(a.branch.replace('Al Hudu ','')) : '') + '</span></span><span class="meta">' + time + '</span></div>';
      }).join("")
    : '<div class="empty-state">No staff activity logged this day</div>';

  area.innerHTML =
    '<div class="section-title">Summary — ' + e(dateStr) + '</div>' +
    '<div class="stat-row3">' +
      '<div class="stat-box"><div class="num">' + totalSales.toLocaleString('en-US') + '</div><div class="lbl">Total Sales (AED)</div></div>' +
      '<div class="stat-box"><div class="num">' + purchases.length + '</div><div class="lbl">Purchases</div></div>' +
      '<div class="stat-box"><div class="num">' + totalPoints + '</div><div class="lbl">Points Earned</div></div>' +
    '</div>' +

    '<div class="section-title">Sales by Branch</div>' +
    '<div class="card">' + branchLines + '</div>' +

    '<div class="section-title">Purchases</div>' +
    '<div class="card">' + purchaseLines + '</div>' +

    '<div class="section-title">New Customers</div>' +
    '<div class="card">' + newCustLines + '</div>' +

    '<div class="section-title">Vouchers Issued</div>' +
    '<div class="card">' + issuedLines + '</div>' +

    '<div class="section-title">Vouchers Used</div>' +
    '<div class="card">' + usedLines + '</div>' +

    '<div class="section-title">Staff Activity This Day</div>' +
    '<div class="card">' + activityLines + '</div>';
}

function e(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
