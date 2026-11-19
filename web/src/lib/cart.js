// Pure cart logic (no browser APIs), so it can be unit-tested. The cart stores only product IDs and quantities:
// prices, names and availability are always read fresh from the backend, never trusted from local storage.
export const MAX_LINES = 10;
export const MAX_QUANTITY = 50;

const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const clampQty = (n) => Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(Number(n)) || 1));

/** Reads whatever was in storage and returns a clean cart: `[{ productId, quantity }]`. */
export function normalizeCart(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || !validId(item.productId) || seen.has(item.productId)) continue;
    seen.add(item.productId);
    out.push({ productId: item.productId, quantity: clampQty(item.quantity) });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/** Adds `quantity` of a product (merging with an existing line). Returns `{ cart, error }`. */
export function addItem(cart, productId, quantity = 1, maxStock = MAX_QUANTITY) {
  if (!validId(productId)) return { cart, error: 'invalid-product' };
  const existing = cart.find((i) => i.productId === productId);
  if (!existing && cart.length >= MAX_LINES) return { cart, error: 'cart-full' };
  const limit = Math.min(MAX_QUANTITY, Math.max(1, maxStock));
  const next = Math.min(limit, (existing?.quantity ?? 0) + clampQty(quantity));
  const lines = existing ? cart.map((i) => (i.productId === productId ? { ...i, quantity: next } : i)) : [...cart, { productId, quantity: next }];
  return { cart: lines, error: existing && existing.quantity >= limit ? 'at-limit' : null };
}

/** Sets an exact quantity (used by "Order now" and the steppers). */
export function setQuantity(cart, productId, quantity, maxStock = MAX_QUANTITY) {
  const limit = Math.min(MAX_QUANTITY, Math.max(1, maxStock));
  const q = Math.min(limit, clampQty(quantity));
  if (!cart.some((i) => i.productId === productId)) return cart.length >= MAX_LINES ? cart : [...cart, { productId, quantity: q }];
  return cart.map((i) => (i.productId === productId ? { ...i, quantity: q } : i));
}

export const removeItem = (cart, productId) => cart.filter((i) => i.productId !== productId);
export const cartCount = (cart) => cart.reduce((n, i) => n + i.quantity, 0);

/**
 * Compares a cart line with the product as the backend reports it now.
 *   gone     product no longer exists / not for sale
 *   soldout  no stock left
 *   reduced  fewer units available than requested (`effectiveQuantity` is what can actually be ordered)
 *   ok
 */
export function lineState(item, product) {
  if (!product) return { status: 'gone', effectiveQuantity: 0 };
  if (!(product.stock > 0) || product.available === false) return { status: 'soldout', effectiveQuantity: 0 };
  if (item.quantity > product.stock) return { status: 'reduced', effectiveQuantity: product.stock };
  return { status: 'ok', effectiveQuantity: item.quantity };
}

/** Sum of unit price x orderable quantity over the lines that can be ordered. */
export const subtotal = (lines) => lines.reduce((sum, l) => sum + (l.product && l.effectiveQuantity > 0 ? l.product.price * l.effectiveQuantity : 0), 0);

/** One stable key per (checkout attempt, product): a retry of the same attempt can never create a second order. */
export const idempotencyKeyFor = (checkoutId, productId) => `${checkoutId}-${productId}`;
