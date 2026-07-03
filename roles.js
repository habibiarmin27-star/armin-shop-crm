// roles.js
// Central role/permission system. Fetches the signed-in user's role from the
// Firestore "staff" collection and exposes helpers used across all pages.

import { db, auth } from "./firebase-init.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// The bootstrap admin — this email is ALWAYS treated as admin, even before
// the staff collection exists. Change/expand only if ownership changes.
const BOOTSTRAP_ADMIN = "habibiarmin27@gmail.com";

let cachedRole = null;   // 'admin' | 'staff'
let cachedEmail = null;

// Resolve the current user's role. Returns 'admin' | 'staff' | 'inactive' | null.
// 'inactive' means: deactivated by an admin, OR no staff record exists at all
// (e.g. a Firebase Auth login was created but never added in Staff Management).
export async function getUserRole(user) {
  if (!user) return null;
  if (cachedRole && cachedEmail === user.email) return cachedRole;

  cachedEmail = user.email;

  // Bootstrap admin is always admin, regardless of their staff doc's state.
  // This guarantees the owner can never accidentally lock themselves out.
  if (user.email === BOOTSTRAP_ADMIN) {
    cachedRole = "admin";
    try {
      const ref = doc(db, "staff", user.email);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { email: user.email, role: "admin", active: true, createdAt: serverTimestamp() });
      }
    } catch (e) { console.error(e); }
    return "admin";
  }

  // Everyone else: look up their staff document. Deny access by default —
  // only an explicit, active staff record grants entry.
  try {
    const snap = await getDoc(doc(db, "staff", user.email));
    if (snap.exists() && snap.data().active !== false) {
      cachedRole = snap.data().role === "admin" ? "admin" : "staff";
    } else {
      cachedRole = "inactive";
    }
  } catch (e) {
    console.error(e);
    cachedRole = "inactive";
  }
  return cachedRole;
}

export function isAdmin() { return cachedRole === "admin"; }
export function isStaff() { return cachedRole === "staff"; }
