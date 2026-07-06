// branches-config.js
// List of shop branches. Add more branches here later — nothing else needs to change.

export const BRANCHES = [
  "Al Hudu Readymade",   // Al Ain
  "Fan Al Hudu",         // Dubai
  "Al Hudu Collection",  // Abu Dhabi
];

// Shortens a branch name for tight UI spots (tabs, pills, chart labels) by
// stripping a leading or trailing "Al Hudu" — works regardless of which
// side of the name it's on (e.g. "Al Hudu Collection" -> "Collection",
// "Fan Al Hudu" -> "Fan").
export function shortBranchName(branch) {
  if (!branch) return branch;
  const stripped = branch.replace(/^Al Hudu\s+/i, "").replace(/\s+Al Hudu$/i, "").trim();
  return stripped || branch;
}
