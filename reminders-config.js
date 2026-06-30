// reminders-config.js
// Settings for the semi-automatic reminders page (birthdays, inactive
// customers, and same-day thank-you messages). Edit thresholds/messages here.

export const INACTIVITY_DAYS = 60;
export const BIRTHDAY_VOUCHER_DISCOUNT = 50;
export const BIRTHDAY_VOUCHER_VALID_DAYS = 30;

export function thankYouMessage(name) {
  return `سلام ${name} عزیز، از اینکه ما رو برای خریدتون انتخاب کردید خیلی خوشحالیم 🙏 منتظر دیدار دوباره‌تون هستیم.`;
}

export function birthdayMessage(name, code, expiryDate) {
  return `سلام ${name} عزیز، تولدتون مبارک! 🎉 به همین بهونه یه کد تخفیف ویژه برات داریم: ${code} — تا ${expiryDate} فرصت داری ازش استفاده کنی 🎁`;
}

export function missYouMessage(name) {
  return `سلام ${name} عزیز، مدتیه نیومدید پیشمون، دلمون براتون تنگ شده 💛 منتظر دیدارتون هستیم.`;
}
