// reminders-config.js
// Settings for the semi-automatic reminders page (birthdays, inactive
// customers, and same-day thank-you messages).
//
// NOTE: the customer-facing messages below are intentionally written in
// elegant Modern Standard Arabic (not English), since these go out to
// shop customers in the Gulf market. The staff-facing UI (reminders.js /
// reminders.html) is in English. Edit thresholds/messages here.

export const INACTIVITY_DAYS = 60;
export const BIRTHDAY_VOUCHER_DISCOUNT = 50;
export const BIRTHDAY_VOUCHER_VALID_DAYS = 30;

export function thankYouMessage(name) {
  return `عزيزي/عزيزتي ${name}، نشكركم من القلب على ثقتكم بـ Al Hudu واختياركم لنا اليوم 🧣✨ كل قطعة نقدمها نختارها بعناية لتُكمل أناقتكم. نتطلع لرؤيتكم مجدداً قريباً!`;
}

export function birthdayMessage(name, code, expiryDate) {
  return `عزيزي/عزيزتي ${name}، كل عام وأنتم بألف خير من عائلة Al Hudu! 🎉 بهذه المناسبة الجميلة، نهديكم كود خصم خاص: ${code} صالح حتى ${expiryDate} 🎁 نتمنى لكم سنة مليئة بالأناقة والتميز.`;
}

export function missYouMessage(name) {
  return `عزيزي/عزيزتي ${name}، اشتقنا لرؤيتكم في Al Hudu 💛 مرّ وقت طويل منذ آخر زيارة لكم، وننتظر عودتكم لنريكم أحدث صيحاتنا. بانتظاركم قريباً!`;
}

export function thankYouSubject() {
  return "شكراً لزيارتكم Al Hudu 🧣";
}

export function birthdaySubject() {
  return "عيد ميلاد سعيد من Al Hudu 🎉";
}

export function missYouSubject() {
  return "اشتقنا لكم في Al Hudu 💛";
}
