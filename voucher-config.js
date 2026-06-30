// voucher-config.js
// Single source of truth for the loyalty/voucher tiers.
//
// IMPORTANT: tiers are evaluated PER PURCHASE, independently — not as a
// running cumulative total. Each time a purchase is logged, we look at
// that single purchase's amount and see which tier it qualifies for.
// To add more tiers later, just add more rows here — nothing else needs to change.

export const VOUCHER_TIERS = [
  { threshold: 1000, discount: 50 },
  { threshold: 1500, discount: 80 },
  { threshold: 2000, discount: 150 },
];

export const VOUCHER_VALID_DAYS = 30;

// Given a single purchase amount, returns the ONE tier it qualifies for
// (the highest threshold met), or null if it didn't reach the lowest tier.
// Amounts above the top tier still only earn the top tier's voucher.
export function getTierForPurchase(amount) {
  const qualifying = VOUCHER_TIERS.filter((tier) => amount >= tier.threshold);
  if (qualifying.length === 0) return null;
  return qualifying[qualifying.length - 1];
}

// Generates a short, unique-enough voucher code to encode as a barcode.
export function generateVoucherCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VC${stamp}${rand}`;
}
