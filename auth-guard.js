// auth-guard.js
// Include on every protected page. Redirects to login if not signed in,
// resolves the user's role, and provides requireAdmin() for admin-only pages.

import { auth } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getUserRole } from "./roles.js";

// onReady is called with (user, role) once authenticated.
export function requireAuth(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    const role = await getUserRole(user);
    onReady(user, role);
  });
}

// For admin-only pages: bounces staff back to dashboard.
export function requireAdmin(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const role = await getUserRole(user);
    if (role !== "admin") { window.location.href = "dashboard.html"; return; }
    onReady(user, role);
  });
}

export function logout() {
  signOut(auth).then(() => { window.location.href = "index.html"; });
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-logout]")) logout();
});
