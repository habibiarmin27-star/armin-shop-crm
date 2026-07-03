// auth-guard.js
// Include on every protected page. Redirects to login if not signed in,
// resolves the user's role, and BLOCKS access entirely for deactivated
// or unrecognized accounts (signs them out and sends them to the login page).

import { auth } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getUserRole } from "./roles.js";

// Resolves the role for a signed-in user. If they're deactivated or have no
// staff record, signs them out and redirects to login. Returns the role
// ('admin' | 'staff') on success, or null if access was denied.
async function resolveRoleOrBlock(user) {
  const role = await getUserRole(user);
  if (role === "admin" || role === "staff") return role;
  await signOut(auth);
  window.location.href = "index.html?blocked=1";
  return null;
}

// onReady is called with (user, role) once authenticated AND authorized.
export function requireAuth(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const role = await resolveRoleOrBlock(user);
    if (role) onReady(user, role);
  });
}

// For admin-only pages: bounces staff back to dashboard, blocks inactive users.
export function requireAdmin(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    const role = await resolveRoleOrBlock(user);
    if (!role) return;
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
