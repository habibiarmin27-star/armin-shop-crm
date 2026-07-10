// emailjs-config.js
// Lets the app send real emails straight from the browser via EmailJS — no
// backend server needed. Requires the EmailJS SDK <script> tag to already
// be loaded on the page (see the <head> of dashboard.html / customer.html).

export const EMAILJS_SERVICE_ID = "service_awt5vcw";
export const EMAILJS_TEMPLATE_ID = "template_avxie3o";
export const EMAILJS_PUBLIC_KEY = "eARcTwaTLTFMSLeSZ";

let initialized = false;
function ensureInit() {
  if (initialized) return;
  if (typeof emailjs === "undefined") return;
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  initialized = true;
}

// Sends one email. Deliberately never throws — on failure it logs and
// resolves to false, so a failed send can never break whatever staff action
// (like recording a purchase) triggered it.
export async function sendEmail(toEmail, subject, message) {
  if (!toEmail) return false;
  ensureInit();
  if (typeof emailjs === "undefined") {
    console.error("EmailJS SDK not loaded on this page.");
    return false;
  }
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: toEmail,
      subject,
      message,
    });
    return true;
  } catch (err) {
    console.error("EmailJS send failed:", err);
    return false;
  }
}
