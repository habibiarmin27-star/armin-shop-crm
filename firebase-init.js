// js/firebase-init.js
// Initializes Firebase and exports the services used across the app.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
