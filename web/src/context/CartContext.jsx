import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addItem, cartCount, normalizeCart, removeItem, setQuantity } from '../lib/cart.js';

const KEY = 'mati.cart.v1';
const CartContext = createContext(null);

function read() {
  try {
    return normalizeCart(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return [];
  }
}

/** The cart lives in this browser (product IDs and quantities only) and survives reloads and new tabs. */
export function CartProvider({ children }) {
  const [items, setItems] = useState(read);
  const latest = useRef(items);
  latest.current = items;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable (private mode): the cart still works for this visit */
    }
  }, [items]);

  // Keep several open tabs in step.
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setItems(read());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((productId, quantity = 1, maxStock) => {
    const result = addItem(latest.current, productId, quantity, maxStock);
    latest.current = result.cart;
    setItems(result.cart);
    return result.error;
  }, []);
  const set = useCallback((productId, quantity, maxStock) => setItems((cart) => setQuantity(cart, productId, quantity, maxStock)), []);
  const remove = useCallback((productId) => setItems((cart) => removeItem(cart, productId)), []);
  const removeMany = useCallback((ids) => setItems((cart) => cart.filter((i) => !ids.includes(i.productId))), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({ items, count: cartCount(items), add, set, remove, removeMany, clear }), [items, add, set, remove, removeMany, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
