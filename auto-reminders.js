// auto-reminders.js
// Called once from dashboard.js after the customer list loads. Guarded by
// localStorage so it only actually does anything once per calendar day,
// no matter how many times the dashboard is opened. Customers with no
// email on file are silently skipped here — they still show up on
// reminders.html for a manual WhatsApp message.
import { db } from "./firebase-init.js";
import {
  collection, doc, addDoc, updateDoc, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  INACTIVITY_DAYS, BIRTHDAY_VOUCHER_DISCOUNT, BIRTHDAY_VOUCHER_VALID_DAYS,
  birthdayMessage, missYouMessage, birthdaySubject, missYouSubject,
} from "./reminders-config.js";
import { generateVoucherCode } from "./voucher-config.js";
import { sendEmail } from "./emailjs-config.js";

const CHECK_KEY = "alhudu_last_auto_reminder_check";
// Don't re-email the same still-inactive customer more than once per ~3
// months — otherwise they'd get the same "we miss you" note every single
// day forever.
const MISS_YOU_COOLDOWN_DAYS = 90;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}

export async function runDailyAutoReminders(allCustomers) {
  const today = todayStr();
  if (localStorage.getItem(CHECK_KEY) === today) return; // already ran today
  // Mark as done first — if something below throws partway through, we'd
  // rather silently miss one customer than retry the whole batch (and
  // double-email everyone already sent to) on every subsequent page load.
  localStorage.setItem(CHECK_KEY, today);

  const todayMD = today.slice(5); // "MM-DD"
  const currentYear = new Date().getFullYear();

  for (const c of allCustomers) {
    if (!c.email) continue;

    if (c.birthday && c.birthday.slice(5) === todayMD && c.lastBirthdayVoucherYear !== currentYear) {
      await sendBirthdayEmail(c, currentYear);
    }

    if (c.lastPurchaseDate && daysBetween(c.lastPurchaseDate, today) >= INACTIVITY_DAYS) {
      const cooldownOk = !c.lastMissYouEmailDate || daysBetween(c.lastMissYouEmailDate, today) >= MISS_YOU_COOLDOWN_DAYS;
      if (cooldownOk) await sendMissYouEmail(c, today);
    }
  }
}

async function sendBirthdayEmail(c, currentYear) {
  try {
    const code = generateVoucherCode();
    const expires = new Date();
    expires.setDate(expires.getDate() + BIRTHDAY_VOUCHER_VALID_DAYS);
    const expiryLabel = expires.toLocaleDateString("en-GB");

    await addDoc(collection(db, "vouchers"), {
      customerId: c.id, customerName: c.name || "", customerEmail: c.email || "",
      discount: BIRTHDAY_VOUCHER_DISCOUNT, code, status: "active",
      issuedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expires), reason: "birthday",
    });

    await updateDoc(doc(db, "customers", c.id), {
      lastBirthdayVoucherYear: currentYear,
      activeVoucherCount: (c.activeVoucherCount || 0) + 1,
    });

    await sendEmail(c.email, birthdaySubject(), birthdayMessage(c.name || "", code, expiryLabel));
  } catch (err) {
    console.error("Auto birthday email failed for", c.id, err);
  }
}

async function sendMissYouEmail(c, today) {
  try {
    await updateDoc(doc(db, "customers", c.id), { lastMissYouEmailDate: today });
    await sendEmail(c.email, missYouSubject(), missYouMessage(c.name || ""));
  } catch (err) {
    console.error("Auto miss-you email failed for", c.id, err);
  }
}
