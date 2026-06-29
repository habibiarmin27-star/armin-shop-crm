// js/auth-guard.js
// Include this on every protected page (dashboard, customer, scan).
// Redirects to login if the staff member is not signed in.

import { auth } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function requireAuth(onReady) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "index.html";
    } else {
      onReady(user);
    }
  });
}

export function logout() {
  signOut(auth).then(() => {
    window.location.href = "index.html";
  });
}

// Wire up any element with [data-logout] automatically
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-logout]")) {
    logout();
  }
});
