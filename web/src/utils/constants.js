// Display metadata for the order statuses in docs/cloudcamp.pdf. The backend is the authority for the values
// (backend/src/db/enums.js); web/tests checks that every one of them has an entry here.
// Wording is deliberate: nothing implies a potter has accepted an order before an admin records it.

export const ORDER_STATUS_META = {
  pending: { label: 'Pending', tone: 'warning', step: 0, text: 'We have received your order request. The potter has not been contacted yet.' },
  seller_notified: { label: 'Seller notified', tone: 'info', step: 1, text: 'The potter has been told about your request. They have not accepted it yet.' },
  contacted: { label: 'Contacted', tone: 'info', step: 2, text: 'The potter has been in touch about your request.' },
  price_negotiation: { label: 'Price negotiation', tone: 'brand', step: 3, text: 'You and the potter are agreeing the final price by phone.' },
  confirmed: { label: 'Confirmed', tone: 'success', step: 4, text: 'The order is confirmed with the agreed price.' },
  processing: { label: 'Processing', tone: 'success', step: 5, text: 'The potter is preparing your order.' },
  shipped: { label: 'Shipped', tone: 'success', step: 6, text: 'Your order is on its way.' },
  delivered: { label: 'Delivered', tone: 'success', step: 7, text: 'Your order has been delivered.' },
  cancelled: { label: 'Cancelled', tone: 'danger', step: -1, text: 'This order was cancelled.' },
};

/** The normal path, in order (cancelled is shown separately). */
export const ORDER_STEPS = ['pending', 'seller_notified', 'contacted', 'price_negotiation', 'confirmed', 'processing', 'shipped', 'delivered'];

export const TONES = {
  neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  brand: 'bg-terracotta-50 text-terracotta-700 ring-terracotta-200',
};

export const CATEGORY_BLURBS = {
  'Home Decoration': 'Vases, lamps and pieces for the shelf',
  Kitchenware: 'Pots and pans for the traditional kitchen',
  Garden: 'Planters and pots for plants',
  Tableware: 'Cups, bowls and plates for the table',
  Storage: 'Jars and containers with lids',
  Other: 'Other handmade pieces',
};

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];
