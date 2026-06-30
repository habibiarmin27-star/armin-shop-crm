// reminders.js
import { db } from "./firebase-init.js";
import { requireAuth } from "./auth-guard.js";
import {
  INACTIVITY_DAYS, BIRTHDAY_VOUCHER_DISCOUNT, BIRTHDAY_VOUCHER_VALID_DAYS,
  thankYouMessage, birthdayMessage, missYouMessage
} from "./reminders-config.js";
import { generateVoucherCode } from "./voucher-config.js";
import {
  collection, collectionGroup, getDocs, addDoc, doc, updateDoc,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allCustomers = [];

requireAuth(() => {
  loadReminders();
});

async function loadReminders() {
  const area = document.getElementById("remindersArea");
  try {
    const [customersSnap, purchasesSnap] = await Promise.all([
      getDocs(collection(db, "customers")),
      getDocs(collectionGroup(db, "purchases")),
    ]);

    allCustomers = customersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const purchases = purchasesSnap.docs.map((d) => {
      const ref = d.ref;
      const customerId = ref.parent.parent ? ref.parent.parent.id : null;
      return { ...d.data(), customerId };
    });

    renderReminders(area, purchases);
  } catch (err) {
    area.innerHTML = `<div class="empty-state">خطا در بارگذاری یادآوری‌ها</div>`;
    console.error(err);
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(dateStr1, dateStr2) {
  const a = new Date(dateStr1);
  const b = new Date(dateStr2);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function renderReminders(area, purchases) {
  const today = todayStr();
  const todayMD = today.slice(5); // "MM-DD"

  // --- Birthdays today ---
  const birthdayCustomers = allCustomers.filter(
    (c) => c.birthday && c.birthday.slice(5) === todayMD
  );

  // --- Inactive 60+ days ---
  const inactiveCustomers = allCustomers.filter((c) => {
    if (!c.lastPurchaseDate) return false;
    return daysBetween(c.lastPurchaseDate, today) >= INACTIVITY_DAYS;
  });

  // --- Today's purchases (thank-you) ---
  const todayCustomerIds = [...new Set(
    purchases.filter((p) => p.date === today && p.customerId).map((p) => p.customerId)
  )];
  const thankYouCustomers = todayCustomerIds
    .map((id) => allCustomers.find((c) => c.id === id))
    .filter(Boolean);

  area.innerHTML = `
    <div class="section-title">🎂 تولد امروز</div>
    <div id="birthdaySection">${birthdayCustomers.length
      ? birthdayCustomers.map(birthdayCardHtml).join("")
      : `<div class="empty-state">امروز تولد کسی نیست</div>`}</div>

    <div class="section-title">💛 دلمون تنگ شده (${INACTIVITY_DAYS}+ روز)</div>
    <div>${inactiveCustomers.length
      ? inactiveCustomers.map((c) => actionCardHtml(c, missYouMessage(c.name || ""), "دلتنگی")).join("")
      : `<div class="empty-state">فعلاً مشتری غایبی نیست</div>`}</div>

    <div class="section-title">🙏 تشکر بابت خرید امروز</div>
    <div>${thankYouCustomers.length
      ? thankYouCustomers.map((c) => actionCardHtml(c, thankYouMessage(c.name || ""), "تشکر")).join("")
      : `<div class="empty-state">هنوز خریدی امروز ثبت نشده</div>`}</div>
  `;

  // wire up birthday voucher buttons (need async voucher creation before linking)
  document.querySelectorAll("[data-birthday-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => handleBirthdayClick(e, btn));
  });
}

function toWhatsAppNumber(phone) {
  let digits = (phone || "").replace(/[^0-9]/g, "");
  // Local UAE-style numbers start with 0 (e.g. 050...); wa.me needs the
  // country code instead (971...).
  if (digits.startsWith("0")) {
    digits = "971" + digits.slice(1);
  }
  return digits;
}

function actionCardHtml(c, message, subLabel) {
  const waLink = c.phone
    ? `https://wa.me/${toWhatsAppNumber(c.phone)}?text=${encodeURIComponent(message)}`
    : null;
  const mailLink = c.email
    ? `mailto:${c.email}?subject=${encodeURIComponent("از طرف فروشگاه")}&body=${encodeURIComponent(message)}`
    : null;

  return `
    <div class="reminder-card">
      <div class="r-top"><span class="r-name">${escapeHtml(c.name || "بدون اسم")}</span></div>
      <div class="r-sub">${subLabel} · <a href="customer.html?id=${c.id}" style="color:var(--accent);">مشاهده پروفایل</a></div>
      <div class="reminder-actions">
        ${waLink ? `<a class="wa-btn" href="${waLink}">واتساپ</a>` : `<span class="wa-btn" style="opacity:.4;">بدون شماره</span>`}
        ${mailLink ? `<a class="mail-btn" href="${mailLink}">ایمیل</a>` : `<span class="mail-btn" style="opacity:.4;">بدون ایمیل</span>`}
      </div>
    </div>`;
}

function birthdayCardHtml(c) {
  const currentYear = new Date().getFullYear();
  const alreadySent = c.lastBirthdayVoucherYear === currentYear;

  return `
    <div class="reminder-card">
      <div class="r-top"><span class="r-name">${escapeHtml(c.name || "بدون اسم")}</span></div>
      <div class="r-sub">
        تولد · <a href="customer.html?id=${c.id}" style="color:var(--accent);">مشاهده پروفایل</a>
        ${alreadySent ? " · کد تخفیف امسال قبلاً صادر شده" : ""}
      </div>
      <div class="reminder-actions">
        <button class="wa-btn" style="width:100%; border:1px solid rgba(62,142,92,.3); cursor:pointer;"
          data-birthday-id="${c.id}" ${alreadySent ? "disabled" : ""}>
          ${alreadySent ? "ارسال شده ✓" : "ساخت کد + ارسال پیام"}
        </button>
      </div>
    </div>`;
}

async function handleBirthdayClick(e, btn) {
  e.preventDefault();
  const customerId = btn.dataset.birthdayId;
  const c = allCustomers.find((x) => x.id === customerId);
  if (!c) return;

  btn.disabled = true;
  btn.textContent = "در حال ساخت کد...";

  try {
    const code = generateVoucherCode();
    const expires = new Date();
    expires.setDate(expires.getDate() + BIRTHDAY_VOUCHER_VALID_DAYS);
    const expiryLabel = expires.toLocaleDateString("fa-IR");

    await addDoc(collection(db, "vouchers"), {
      customerId,
      customerName: c.name || "",
      customerEmail: c.email || "",
      discount: BIRTHDAY_VOUCHER_DISCOUNT,
      code,
      status: "active",
      issuedAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expires),
      reason: "birthday",
    });

    const currentYear = new Date().getFullYear();
    await updateDoc(doc(db, "customers", customerId), {
      lastBirthdayVoucherYear: currentYear,
      activeVoucherCount: (c.activeVoucherCount || 0) + 1,
    });

    const message = birthdayMessage(c.name || "", code, expiryLabel);
    if (c.phone) {
      window.location.href = `https://wa.me/${toWhatsAppNumber(c.phone)}?text=${encodeURIComponent(message)}`;
    } else if (c.email) {
      window.location.href = `mailto:${c.email}?subject=${encodeURIComponent("تولدتون مبارک 🎉")}&body=${encodeURIComponent(message)}`;
    } else {
      alert(`کد ساخته شد: ${code} — ولی این مشتری شماره یا ایمیل ندارد.`);
      loadReminders();
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "خطا — دوباره تلاش کن";
    console.error(err);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
