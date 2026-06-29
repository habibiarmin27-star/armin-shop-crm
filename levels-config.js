// levels-config.js
// Customer status levels (Silver/Gold/VIP), based on rolling 3-month spend.
// This is separate from the voucher system — it's a permanent-feeling badge
// for spotting your best recent customers, not a discount mechanism.

// Listed highest threshold first, so the lookup below returns the top level reached.
export const CUSTOMER_LEVELS = [
  { name: "VIP", threshold: 17000, badgeClass: "level-vip" },
  { name: "طلا", threshold: 13000, badgeClass: "level-gold" },
  { name: "نقره", threshold: 5000, badgeClass: "level-silver" },
];

// Returns the level object for a given 3-month spend total, or null if below all thresholds.
export function getCustomerLevel(threeMonthTotal) {
  return CUSTOMER_LEVELS.find((level) => threeMonthTotal >= level.threshold) || null;
}

// "YYYY-MM" keys for the current month and the two before it.
export function getLastThreeMonthKeys(refDate = new Date()) {
  const keys = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    keys.push(`${y}-${m}`);
  }
  return keys;
}

// Sums a customer's monthlySpend map over the last 3 months.
export function getThreeMonthTotal(monthlySpend) {
  if (!monthlySpend) return 0;
  return getLastThreeMonthKeys().reduce((sum, key) => sum + (monthlySpend[key] || 0), 0);
}

// "2026-06-29" -> "2026-06" — which monthly bucket a purchase belongs to.
export function getMonthKeyFromDateStr(dateStr) {
  return (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 7);
}
