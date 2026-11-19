import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LINES, MAX_QUANTITY, addItem, cartCount, idempotencyKeyFor, lineState, normalizeCart, removeItem, setQuantity, subtotal,
} from '../src/lib/cart.js';
import {
  fieldErrorsFromApi, normalizeBdPhone, validateAddress, validateDelivery, validateLogin, validateProfile, validateRegistration,
} from '../src/utils/validation.js';
import { friendlyAuthError } from '../src/utils/authErrors.js';
import { formatBdt, formatPhone, stockLabel } from '../src/utils/format.js';
import { CATEGORY_BLURBS, ORDER_STATUS_META, ORDER_STEPS, SORT_OPTIONS, TONES } from '../src/utils/constants.js';
// The backend is the authority for enums, phone rules and sort values: the storefront must agree with it.
import { CATEGORIES, ORDER_STATUS } from '../../backend/src/db/enums.js';
import { normalizeBdPhone as backendPhone } from '../../backend/src/utils/phone.js';
import { SORTS } from '../../backend/src/validators/marketplace.validators.js';

test('cart: add merges lines, respects stock and the line limit', () => {
  let { cart } = addItem([], 'p1', 2, 5);
  assert.deepEqual(cart, [{ productId: 'p1', quantity: 2 }]);
  ({ cart } = addItem(cart, 'p1', 2, 5));
  assert.equal(cart[0].quantity, 4);
  const capped = addItem(cart, 'p1', 3, 5);
  assert.equal(capped.cart[0].quantity, 5, 'never above available stock');
  assert.equal(addItem(capped.cart, 'p1', 1, 5).error, 'at-limit');
  assert.equal(addItem([], 'bad id!', 1).error, 'invalid-product');

  let full = [];
  for (let i = 0; i < MAX_LINES; i += 1) full = addItem(full, `p${i}`, 1).cart;
  assert.equal(addItem(full, 'extra', 1).error, 'cart-full');
  assert.equal(addItem(full, 'p0', 1).cart.length, MAX_LINES, 'existing lines can still grow when the cart is full');
});

test('cart: set, remove, count and persistence sanitising', () => {
  let cart = setQuantity([], 'a', 3, 10);
  cart = setQuantity(cart, 'b', 99, 4);
  assert.deepEqual(cart, [{ productId: 'a', quantity: 3 }, { productId: 'b', quantity: 4 }]);
  assert.equal(setQuantity(cart, 'a', 0, 10)[0].quantity, 1);
  assert.equal(setQuantity(cart, 'a', 1000, 1000)[0].quantity, MAX_QUANTITY);
  assert.equal(cartCount(cart), 7);
  assert.deepEqual(removeItem(cart, 'a'), [{ productId: 'b', quantity: 4 }]);

  // Whatever is in localStorage (hand-edited, old, hostile) becomes a valid cart.
  const dirty = [{ productId: 'ok', quantity: '2' }, { productId: 'ok', quantity: 9 }, { productId: '../x', quantity: 1 }, null, { quantity: 3 }, { productId: 'huge', quantity: 9999 }, { productId: 'neg', quantity: -4 }];
  assert.deepEqual(normalizeCart(dirty), [{ productId: 'ok', quantity: 2 }, { productId: 'huge', quantity: MAX_QUANTITY }, { productId: 'neg', quantity: 1 }]);
  assert.deepEqual(normalizeCart('not an array'), []);
  assert.equal(normalizeCart(Array.from({ length: 30 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }))).length, MAX_LINES);
});

test('cart lines are validated against the product as the server reports it', () => {
  const product = { id: 'p', price: 450, stock: 3, available: true };
  assert.deepEqual(lineState({ productId: 'p', quantity: 2 }, product), { status: 'ok', effectiveQuantity: 2 });
  assert.deepEqual(lineState({ productId: 'p', quantity: 5 }, product), { status: 'reduced', effectiveQuantity: 3 });
  assert.deepEqual(lineState({ productId: 'p', quantity: 1 }, { ...product, stock: 0, available: false }), { status: 'soldout', effectiveQuantity: 0 });
  assert.deepEqual(lineState({ productId: 'p', quantity: 1 }, null), { status: 'gone', effectiveQuantity: 0 });

  const lines = [
    { product, effectiveQuantity: 2 },
    { product: { price: 100 }, effectiveQuantity: 3 },
    { product: null, effectiveQuantity: 0 },
    { product: { price: 999 }, effectiveQuantity: 0 },
  ];
  assert.equal(subtotal(lines), 450 * 2 + 300, 'only orderable quantities count');
  assert.equal(subtotal([]), 0);
});

test('idempotency keys are stable per (checkout attempt, product) and unique across products', () => {
  const id = '0f1e2d3c-aaaa-bbbb-cccc-123456789abc';
  assert.equal(idempotencyKeyFor(id, 'p1'), idempotencyKeyFor(id, 'p1'));
  assert.notEqual(idempotencyKeyFor(id, 'p1'), idempotencyKeyFor(id, 'p2'));
  assert.notEqual(idempotencyKeyFor(id, 'p1'), idempotencyKeyFor('another-attempt-id', 'p1'));
  const key = idempotencyKeyFor(id, 'x'.repeat(20));
  assert.ok(key.length >= 8 && key.length <= 128, 'fits the backend limits');
});

test('phone rules in the browser match the backend exactly', () => {
  const samples = ['01712345678', '+8801712345678', '8801712345678', '+880 1712-345678', '(017) 12345678', '01212345678', '0171234567', '017123456789', 'abc', '', ' ', '01912345678', null, 1712345678];
  for (const s of samples) assert.equal(normalizeBdPhone(s), backendPhone(s), JSON.stringify(s));
  assert.equal(formatPhone('01712345678'), '01712-345678');
  assert.equal(formatPhone(undefined), '—');
});

test('form validation: registration, login, profile, delivery and address', () => {
  const ok = { name: 'Karim Ahmed', phone: '+8801712345678', email: 'karim@example.com', password: 'long-enough-1' };
  assert.deepEqual(validateRegistration(ok), {});
  assert.deepEqual(Object.keys(validateRegistration({ name: 'K', phone: '123', email: 'nope', password: 'short' })).sort(), ['email', 'name', 'password', 'phone']);
  assert.deepEqual(validateLogin({ email: 'a@b.co', password: 'x' }), {});
  assert.deepEqual(Object.keys(validateLogin({ email: '', password: '' })).sort(), ['email', 'password']);
  assert.deepEqual(validateProfile({ name: 'Karim', phone: '01712345678' }), {});

  const districts = ['Dhaka', 'Cumilla'];
  const delivery = { name: 'Karim Ahmed', phone: '01712345678', address: 'House 12, Road 4, Dhanmondi', district: 'Dhaka' };
  assert.deepEqual(validateDelivery(delivery, districts), {});
  assert.deepEqual(Object.keys(validateDelivery({ name: '', phone: '1', address: 'short', district: 'Atlantis' }, districts)).sort(), ['address', 'district', 'name', 'phone']);
  assert.ok(validateDelivery({ ...delivery, district: '' }, districts).district);

  const address = { label: 'Home', recipientName: 'Karim Ahmed', phone: '01712345678', line: 'House 12, Road 4, Dhanmondi', district: 'Dhaka' };
  assert.deepEqual(validateAddress(address, districts), {});
  assert.deepEqual(Object.keys(validateAddress({ ...address, label: '', line: 'x' }, districts)).sort(), ['label', 'line']);
  assert.deepEqual(fieldErrorsFromApi({ details: [{ path: 'buyerPhone', message: 'bad' }, { path: 'buyerPhone', message: 'later' }] }), { buyerPhone: 'bad' });
  assert.deepEqual(fieldErrorsFromApi(undefined), {});
});

test('order status metadata covers every backend status (documented PDF statuses)', () => {
  for (const status of ORDER_STATUS) {
    const meta = ORDER_STATUS_META[status];
    assert.ok(meta, `missing metadata for ${status}`);
    assert.ok(meta.label && meta.text && TONES[meta.tone], status);
  }
  assert.deepEqual(Object.keys(ORDER_STATUS_META).sort(), [...ORDER_STATUS].sort(), 'no status the backend does not know');
  assert.deepEqual(ORDER_STEPS, ORDER_STATUS.filter((s) => s !== 'cancelled'), 'progress steps follow the backend order');
  // No wording may suggest acceptance before the admin-recorded statuses.
  assert.doesNotMatch(ORDER_STATUS_META.pending.text + ORDER_STATUS_META.seller_notified.text, /accepted (your|the) order|confirmed/i);
});

test('categories and sort options match the backend API', () => {
  assert.deepEqual(Object.keys(CATEGORY_BLURBS).sort(), [...CATEGORIES].sort());
  assert.deepEqual(SORT_OPTIONS.map((o) => o.value).sort(), [...SORTS].sort());
});

test('formatting and stock wording never overstate availability', () => {
  assert.equal(formatBdt(1250), '৳ 1,250');
  assert.equal(formatBdt(undefined), '—');
  assert.deepEqual(stockLabel({ available: true, stock: 10 }), { text: 'In stock', tone: 'in' });
  assert.deepEqual(stockLabel({ available: true, stock: 2 }), { text: 'Only 2 left', tone: 'low' });
  assert.deepEqual(stockLabel({ available: false, stock: 0 }), { text: 'Sold out', tone: 'out' });
});

test('login/registration errors never reveal which credential was wrong; emulator outages are specific', () => {
  for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) assert.equal(friendlyAuthError({ code }), 'Invalid email or password.');
  assert.match(friendlyAuthError({ code: 'auth/email-already-in-use' }, null, 'register'), /already exists/);
  assert.match(friendlyAuthError({ code: 'auth/network-request-failed' }, { useEmulators: true, authEmulatorUrl: 'http://127.0.0.1:9099' }), /Auth emulator at http:\/\/127\.0\.0\.1:9099/);
  assert.match(friendlyAuthError({ code: 'auth/network-request-failed' }, { useEmulators: false }), /internet connection/);
  assert.match(friendlyAuthError(new Error('x'), null, 'register'), /Could not create your account/);
});
