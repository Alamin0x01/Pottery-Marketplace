const BD_MOBILE = /^01[3-9]\d{8}$/;

/**
 * Mirror of backend/src/utils/phone.js (the backend stays the authority; this gives instant feedback).
 * tests/web.test.js checks both implementations agree.
 */
export function normalizeBdPhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith('+880')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('880')) digits = `0${digits.slice(3)}`;
  return BD_MOBILE.test(digits) ? digits : null;
}

const len = (value, min, max) => {
  const n = value.trim().length;
  return n >= min && n <= max;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;

export function validateRegistration({ name, phone, email, password }) {
  const errors = {};
  if (!len(name, 2, 100)) errors.name = 'Enter your full name.';
  if (!normalizeBdPhone(phone)) errors.phone = 'Enter a valid Bangladesh mobile number, e.g. 01712345678.';
  if (!EMAIL.test(email.trim()) || email.length > 254) errors.email = 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  return errors;
}

export function validateLogin({ email, password }) {
  const errors = {};
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export function validateProfile({ name, phone }) {
  const errors = {};
  if (!len(name, 2, 100)) errors.name = 'Enter your full name.';
  if (!normalizeBdPhone(phone)) errors.phone = 'Enter a valid Bangladesh mobile number, e.g. 01712345678.';
  return errors;
}

/** Delivery details used by checkout and the saved-address form. */
export function validateDelivery({ name, phone, address, district }, districts = []) {
  const errors = {};
  if (!len(name, 2, 100)) errors.name = 'Enter the name of the person receiving the order.';
  if (!normalizeBdPhone(phone)) errors.phone = 'Enter a valid Bangladesh mobile number, e.g. 01712345678.';
  if (!len(address, 10, 300)) errors.address = 'Enter the full delivery address (at least 10 characters).';
  if (!district || (districts.length > 0 && !districts.includes(district))) errors.district = 'Choose a district.';
  return errors;
}

export function validateAddress({ label, recipientName, phone, line, district }, districts = []) {
  const errors = {};
  if (!len(label, 1, 30)) errors.label = 'Give the address a short name, e.g. Home.';
  const delivery = validateDelivery({ name: recipientName, phone, address: line, district }, districts);
  if (delivery.name) errors.recipientName = delivery.name;
  if (delivery.phone) errors.phone = delivery.phone;
  if (delivery.address) errors.line = delivery.address;
  if (delivery.district) errors.district = delivery.district;
  return errors;
}

/** Turns backend validation `details` ([{ path, message }]) into `{ field: message }`. */
export function fieldErrorsFromApi(error) {
  const out = {};
  for (const d of error?.details ?? []) if (d?.path && !out[d.path]) out[d.path] = d.message;
  return out;
}
