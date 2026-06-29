// js/voucher-config.js
// Single source of truth for the loyalty/voucher tiers.
// To add more tiers later, just add more rows here — nothing else needs to change.

export const VOUCHER_TIERS = [
  { threshold: 1000, discount: 50 },
  { threshold: 1500, discount: 80 },
  { threshold: 2000, discount: 150 },
];

export const VOUCHER_VALID_DAYS = 30;

// Given a customer's progress BEFORE and AFTER a new purchase, plus the list
// of tier thresholds already triggered in the current cycle, returns the
// tiers that should issue a brand new voucher right now.
export function getNewlyTriggeredTiers(newProgress, alreadyTriggered) {
  const triggeredSet = new Set(alreadyTriggered || []);
  return VOUCHER_TIERS.filter(
    (tier) => newProgress >= tier.threshold && !triggeredSet.has(tier.threshold)
  );
}

// Returns the next tier the customer hasn't reached yet (for the progress bar),
// or null if they've already passed every defined tier.
export function getNextTier(progress) {
  return VOUCHER_TIERS.find((tier) => progress < tier.threshold) || null;
}

// Generates a short, unique-enough voucher code to encode as a barcode.
export function generateVoucherCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VC${stamp}${rand}`;
}
