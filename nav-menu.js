// nav-menu.js
// Shared hamburger menu. Shows different links depending on the user's role.

import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getUserRole } from "./roles.js";

function buildPanel(role) {
  const isAdmin = role === "admin";

  const adminLinks =
    '<a href="reports.html" class="nav-link">📊 Manager Reports</a>' +
    '<a href="history.html" class="nav-link">🗓 History</a>' +
    '<a href="staff.html" class="nav-link">👤 Staff Management</a>';

  const overlay = document.createElement("div");
  overlay.id = "navMenuOverlay";
  overlay.className = "nav-overlay";
  overlay.innerHTML =
    '<div class="nav-panel">' +
      '<div class="nav-panel-head"><span>Menu</span><button id="navCloseBtn" class="nav-close">✕</button></div>' +
      '<a href="dashboard.html" class="nav-link">🏠 Dashboard</a>' +
      '<a href="reminders.html" class="nav-link">🔔 Reminders</a>' +
      '<a href="scan.html" class="nav-link">📷 Scan Voucher</a>' +
      (isAdmin ? adminLinks : '') +
      '<button data-logout class="nav-link nav-logout">🚪 Sign Out</button>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.id === "navCloseBtn") overlay.classList.remove("show");
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const role = await getUserRole(user);
  buildPanel(role);
  const hb = document.getElementById("hamburgerBtn");
  if (hb) hb.addEventListener("click", () => {
    document.getElementById("navMenuOverlay").classList.add("show");
  });
});
