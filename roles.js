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

// Resolve the current user's role. Returns 'admin' | 'staff' | null.
export async function getUserRole(user) {
  if (!user) return null;
  if (cachedRole && cachedEmail === user.email) return cachedRole;

  cachedEmail = user.email;

  // Bootstrap admin is always admin, and we make sure their staff doc exists.
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

  // Everyone else: look up their staff document.
  try {
    const snap = await getDoc(doc(db, "staff", user.email));
    if (snap.exists() && snap.data().active !== false) {
      cachedRole = snap.data().role === "admin" ? "admin" : "staff";
    } else {
      cachedRole = "staff"; // default if somehow missing but authenticated
    }
  } catch (e) {
    console.error(e);
    cachedRole = "staff";
  }
  return cachedRole;
}

export function isAdmin() { return cachedRole === "admin"; }
export function isStaff() { return cachedRole === "staff"; }
