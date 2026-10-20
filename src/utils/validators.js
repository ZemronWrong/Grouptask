export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidEmail(email) {
  if (!isNonEmptyString(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

export function isValidInviteCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{6,12}$/i.test(code.trim());
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
