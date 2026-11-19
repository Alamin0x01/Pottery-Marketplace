const BD_MOBILE = /^01[3-9]\d{8}$/;

/** Normalises Bangladeshi mobile numbers (`+8801712345678`, `8801712-345678`, ...) to `01XXXXXXXXX`; null if invalid. */
export function normalizeBdPhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith('+880')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('880')) digits = `0${digits.slice(3)}`;
  return BD_MOBILE.test(digits) ? digits : null;
}
