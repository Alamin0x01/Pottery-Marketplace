const BD_MOBILE = /^01[3-9]\d{8}$/;

/**
 * Mirror of backend/src/utils/phone.js (the backend remains the authority; this only gives instant feedback).
 * admin/tests/admin.test.js checks both implementations agree.
 */
export function normalizeBdPhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith('+880')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('880')) digits = `0${digits.slice(3)}`;
  return BD_MOBILE.test(digits) ? digits : null;
}

/** "01712345678" -> "01712-345678" for display. */
export const formatBdPhone = (phone) => (/^01\d{9}$/.test(phone ?? '') ? `${phone.slice(0, 5)}-${phone.slice(5)}` : (phone ?? '—'));
