import { normalizeBdPhone } from './phone.js';

const len = (value, min, max) => {
  const n = value.trim().length;
  return n >= min && n <= max;
};

/**
 * Client-side checks for the potter form: instant feedback only. The backend validates again and its
 * field errors (`details`) are shown too, so the rules can never silently diverge.
 * Returns `{ values, errors }`; `errors` is empty when the form may be submitted.
 */
export function validatePotterForm(input, districts = []) {
  const values = {
    name: input.name.trim(),
    phone: normalizeBdPhone(input.phone) ?? input.phone.trim(),
    village: input.village.trim(),
    district: input.district,
    address: input.address.trim(),
  };
  const errors = {};
  if (!len(values.name, 2, 100)) errors.name = 'Enter the potter’s full name (2–100 characters).';
  if (!normalizeBdPhone(input.phone)) errors.phone = 'Enter a valid Bangladesh mobile number, e.g. 01712345678 or +8801712345678.';
  if (!len(values.village, 2, 100)) errors.village = 'Enter the village (2–100 characters).';
  if (!values.district || (districts.length > 0 && !districts.includes(values.district))) errors.district = 'Choose a district.';
  if (!len(values.address, 5, 300)) errors.address = 'Enter the full address (5–300 characters).';
  return { values, errors };
}

/** Turns backend validation `details` ([{ path, message }]) into `{ field: message }`. */
export function fieldErrorsFromApi(error) {
  const out = {};
  for (const d of error?.details ?? []) if (d?.path && !out[d.path]) out[d.path] = d.message;
  return out;
}

export function validateDeviceForm({ model, pollIntervalSec }) {
  const errors = {};
  if (model.trim() && !len(model, 2, 100)) errors.model = 'Model must be 2–100 characters.';
  if (pollIntervalSec !== '') {
    const n = Number(pollIntervalSec);
    if (!Number.isInteger(n) || n < 30 || n > 3600) errors.pollIntervalSec = 'Enter whole seconds between 30 and 3600.';
  }
  return errors;
}
