// staff.js — Staff Management (admin only)
import { db } from "./firebase-init.js";
import { requireAdmin } from "./auth-guard.js";
import {
  collection, getDocs, doc, setDoc, updateDoc, getDoc, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

requireAdmin(() => {
  loadStaff();
  loadActivity();
});

async function loadStaff() {
  const listEl = document.getElementById("staffList");
  try {
    const snap = await getDocs(collection(db, "staff"));
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (members.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No staff yet</div>';
      return;
    }
    let rows = '<div class="staff-table"><div class="t-head"><span>Email</span><span>Role</span><span>Status</span></div>';
    members.forEach(m => {
      const active = m.active !== false;
      const roleClass = m.role === "admin" ? "admin" : "staff";
      const roleLabel = m.role === "admin" ? "Admin" : "Staff";
      const statusBtn = active
        ? '<button class="s-action danger" data-toggle="' + esc(m.id) + '" data-active="true">Deactivate</button>'
        : '<button class="s-action" data-toggle="' + esc(m.id) + '" data-active="false">Activate</button>';
      rows += '<div class="t-row">' +
        '<span class="s-email">' + esc(m.email||m.id) + '</span>' +
        '<span><span class="role-pill ' + roleClass + '">' + roleLabel + '</span></span>' +
        '<span>' + statusBtn + '</span>' +
      '</div>';
    });
    rows += '</div>';
    listEl.innerHTML = rows;

    listEl.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => toggleActive(btn.dataset.toggle, btn.dataset.active === "true"));
    });
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state">Failed to load staff</div>';
    console.error(err);
  }
}

async function toggleActive(email, currentlyActive) {
  try {
    await updateDoc(doc(db, "staff", email), { active: !currentlyActive });
    showSuccess((currentlyActive ? "Deactivated " : "Activated ") + email);
    loadStaff();
  } catch (err) {
    showError("Could not update status.");
    console.error(err);
  }
}

let allActivity = [];

async function loadActivity() {
  const el = document.getElementById("activityList");
  try {
    const snap = await getDocs(query(collection(db, "activity"), orderBy("at", "desc"), limit(50)));
    allActivity = snap.docs.map(d => d.data());
    renderActivity("all");
  } catch (err) {
    el.innerHTML = '<div class="empty-state">No activity log yet</div>';
    console.error(err);
  }
}

function renderActivity(branchFilter) {
  const el = document.getElementById("activityList");
  const filtered = branchFilter === "all"
    ? allActivity
    : allActivity.filter(a => a.branch === branchFilter);

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state">No activity for this branch yet</div>';
    return;
  }

  el.innerHTML = filtered.map(a => {
    const when = a.at?.seconds ? timeAgo(a.at.seconds * 1000) : "";
    const branchBadge = a.branch
      ? '<span class="a-branch ' + (a.branch.includes('Dubai') ? 'dubai' : 'abudhabi') + '">' + esc(a.branch.replace('Al Hudu ','')) + '</span>'
      : "";
    return '<div class="activity-row"><div class="a-title">' + esc(a.action||'Activity') + '</div>' +
      '<div class="a-meta">By: ' + esc(a.by||'—') + ' · ' + when + '</div>' + branchBadge + '</div>';
  }).join("");
}

document.getElementById("activityFilterBar").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-branch]");
  if (!btn) return;
  document.querySelectorAll("#activityFilterBar .filter-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderActivity(btn.dataset.branch);
});

function timeAgo(ms) {
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return h + "h ago";
  return Math.floor(h/24) + "d ago";
}

// Add staff sheet
const overlay = document.getElementById("addStaffOverlay");
document.getElementById("openAddStaffBtn").addEventListener("click", () => overlay.classList.add("show"));
document.getElementById("cancelAddStaffBtn").addEventListener("click", () => overlay.classList.remove("show"));

document.getElementById("saveStaffBtn").addEventListener("click", async () => {
  const errBox = document.getElementById("addStaffError");
  errBox.classList.remove("show");
  const email = document.getElementById("st_email").value.trim().toLowerCase();
  const role = document.getElementById("st_role").value;
  if (!email || !email.includes("@")) {
    errBox.textContent = "Enter a valid email."; errBox.classList.add("show"); return;
  }
  try {
    const existing = await getDoc(doc(db, "staff", email));
    if (existing.exists()) {
      errBox.textContent = "This email is already a staff member."; errBox.classList.add("show"); return;
    }
    await setDoc(doc(db, "staff", email), { email, role, active: true, createdAt: serverTimestamp() });
    overlay.classList.remove("show");
    document.getElementById("st_email").value = "";
    showSuccess("Added " + email + " as " + role);
    loadStaff();
  } catch (err) {
    errBox.textContent = "Could not add staff member."; errBox.classList.add("show");
    console.error(err);
  }
});

function showSuccess(msg) {
  const el = document.getElementById("staffSuccess");
  el.textContent = msg; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}
function showError(msg) {
  const el = document.getElementById("staffError");
  el.textContent = msg; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}
function esc(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
