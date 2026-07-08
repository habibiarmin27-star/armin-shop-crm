// points-config.js
// Points system configuration — edit these values to change the rules.

// How many points per AED spent (e.g. 100 AED = 30 points)
export const POINTS_PER_100_AED = 30;

// How many points equal 1 AED balance (e.g. 50 points = 1 AED, so 1000 points = 20 AED)
export const POINTS_PER_AED = 50;

// Calculate points earned from a purchase amount
export function calculatePoints(amount) {
  return Math.floor((amount / 100) * POINTS_PER_100_AED);
}

// Convert points to AED balance
export function pointsToAED(points) {
  return (points / POINTS_PER_AED).toFixed(2);
}

// Convert AED balance to points needed
export function aedToPoints(aed) {
  return Math.ceil(aed * POINTS_PER_AED);
}
