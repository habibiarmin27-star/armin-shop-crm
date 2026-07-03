// js/firebase-init.js
// Initializes Firebase and exports the services used across the app.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfjwyoGqnlBjbtAXXpY6f9en9N9WK9q40",
  authDomain: "armin-shop-crm.firebaseapp.com",
  projectId: "armin-shop-crm",
  storageBucket: "armin-shop-crm.firebasestorage.app",
  messagingSenderId: "828873343863",
  appId: "1:828873343863:web:35a6c59c1b303e9b98d772"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Caches Firestore data on-device so repeat visits to a page can render
// instantly from local storage while fresh data loads in the background.
// Silently no-ops if unsupported (e.g. private browsing) or if the app is
// open in more than one tab at once — neither case should break the app.
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Offline persistence not enabled:", err.code);
});
