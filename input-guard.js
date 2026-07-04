// input-guard.js
// Shared input validation used across every form before data is written to
// Firestore. This is a second layer of defense: the app already escapes
// HTML wherever data is displayed (so stored scripts can never run), but
// rejecting dangerous or malformed input at entry time stops bad data from
// reaching the database at all, and catches mistakes if a future screen
// ever forgets to escape on output.

const DANGEROUS_CHARS = /[<>]/;

// General short text fields (customer name, etc.)
export function validateText(value, options = {}) {
  const { label = "This field", maxLength = 100, required = false } = options;
  const trimmed = (value || "").trim();

  if (required && !trimmed) {
    return { valid: false, error: `${label} is required.` };
  }
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${label} must be under ${maxLength} characters.` };
  }
  if (DANGEROUS_CHARS.test(trimmed)) {
    return { valid: false, error: `${label} can't contain < or > characters.` };
  }
  return { valid: true, value: trimmed };
}

export function validateEmail(value, options = {}) {
  const { required = false } = options;
  const trimmed = (value || "").trim();

  if (!trimmed) {
    return required
      ? { valid: false, error: "Email is required." }
      : { valid: true, value: "" };
  }
  if (trimmed.length > 150) {
    return { valid: false, error: "Email is too long." };
  }
  if (DANGEROUS_CHARS.test(trimmed)) {
    return { valid: false, error: "Email can't contain < or > characters." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, error: "Enter a valid email address." };
  }
  return { valid: true, value: trimmed.toLowerCase() };
}

export function validatePhone(value, options = {}) {
  const { required = false } = options;
  const trimmed = (value || "").trim();

  if (!trimmed) {
    return required
      ? { valid: false, error: "Phone number is required." }
      : { valid: true, value: "" };
  }
  if (trimmed.length > 20) {
    return { valid: false, error: "Phone number is too long." };
  }
  if (!/^[0-9+\-\s()]+$/.test(trimmed)) {
    return { valid: false, error: "Phone number can only contain digits, +, -, spaces, and parentheses." };
  }
  return { valid: true, value: trimmed };
}
