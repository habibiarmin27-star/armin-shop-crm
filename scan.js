// scan.js
import { db } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import {
  collection, query, where, getDocs, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const codeInput = document.getElementById("codeInput");
const resultArea = document.getElementById("resultArea");
let currentUser = null;

requireAuth((user) => { currentUser = user; });

document.getElementById("checkBtn").addEventListener("click", checkCode);
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); checkCode(); }
});

let currentVoucher = null;

async function checkCode() {
  const code = codeInput.value.trim();
  if (!code) return;

  resultArea.innerHTML = `<div class="loading">Checking...</div>`;

  try {
    const q = query(collection(db, "vouchers"), where("code", "==", code));
    const snap = await getDocs(q);

    if (snap.empty) {
      resultArea.innerHTML = `<div class="error-msg show">This code was not found.</div>`;
      return;
    }

    const docSnap = snap.docs[0];
    currentVoucher = { id: docSnap.id, ...docSnap.data() };

    const now = Date.now();
    const expiresMs = currentVoucher.expiresAt?.seconds ? currentVoucher.expiresAt.seconds * 1000 : 0;
    const isExpired = expiresMs && expiresMs < now;

    if (currentVoucher.status === "used") {
      resultArea.innerHTML = `<div class="error-msg show">This voucher has already been used.</div>`;
      return;
    }
    if (isExpired) {
      resultArea.innerHTML = `<div class="error-msg show">This voucher has expired.</div>`;
      return;
    }

    resultArea.innerHTML = `
      <div class="card">
        <div style="font-size:15px; margin-bottom:10px;">
          Customer: <b>${escapeHtml(currentVoucher.customerName || "—")}</b>
        </div>
        <div style="font-size:22px; font-weight:800; color:var(--accent); margin-bottom:14px;">
          ${currentVoucher.discount} AED off
        </div>
        <button class="btn" id="confirmBtn">Confirm & Apply Discount</button>
      </div>`;

    document.getElementById("confirmBtn").addEventListener("click", redeemVoucher);

  } catch (err) {
    resultArea.innerHTML = `<div class="error-msg show">Error checking the code.</div>`;
    console.error(err);
  }
}

async function redeemVoucher() {
  if (!currentVoucher) return;
  try {
    await updateDoc(doc(db, "vouchers", currentVoucher.id), {
      status: "used",
      usedAt: serverTimestamp(),
      usedBy: currentUser ? currentUser.email : "unknown",
    });

    const custRef = doc(db, "customers", currentVoucher.customerId);
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const custSnap = await getDoc(custRef);
    const custData = custSnap.data() || {};

    await updateDoc(custRef, {
      activeVoucherCount: Math.max(0, (custData.activeVoucherCount || 1) - 1),
    });

    resultArea.innerHTML = `<div class="success-msg show">Discount applied ✅</div>`;
    codeInput.value = "";
    currentVoucher = null;
  } catch (err) {
    resultArea.innerHTML += `<div class="error-msg show">Failed to mark the voucher as used.</div>`;
    console.error(err);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
