// nav-menu.js
// Shared hamburger navigation menu, included on every protected page.
// Injects a hamburger button's behavior + a slide-in panel with the app's
// main links. The "گزارش مدیر" link only appears for manager emails.

import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { MANAGER_EMAILS } from "./manager-config.js";

function buildPanel(isManager) {
  const reportsLink = isManager
    ? `<a href="reports.html" class="nav-link">📊 گزارش مدیر</a>`
    : "";

  const overlay = document.createElement("div");
  overlay.id = "navMenuOverlay";
  overlay.className = "nav-overlay";
  overlay.innerHTML = `
    <div class="nav-panel">
      <div class="nav-panel-head">
        <span>منو</span>
        <button id="navCloseBtn" class="nav-close">✕</button>
      </div>
      <a href="dashboard.html" class="nav-link">🏠 داشبورد</a>
      <a href="scan.html" class="nav-link">📷 اسکن وچر</a>
      ${reportsLink}
      <button data-logout class="nav-link nav-logout">🚪 خروج</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.id === "navCloseBtn") {
      overlay.classList.remove("show");
    }
  });
}

export function initNavMenu() {
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    const isManager = MANAGER_EMAILS.includes(user.email);
    buildPanel(isManager);

    const hamburgerBtn = document.getElementById("hamburgerBtn");
    if (hamburgerBtn) {
      hamburgerBtn.addEventListener("click", () => {
        document.getElementById("navMenuOverlay").classList.add("show");
      });
    }
  });
}

initNavMenu();
