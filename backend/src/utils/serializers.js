// Admin-facing views of stored documents. Internal credentials/derived secrets are never returned.
const ORDER_HIDDEN = ['trackingTokenHash', 'idempotencyKey'];

export function toAdminOrder(order) {
  const view = { ...order };
  for (const key of ORDER_HIDDEN) delete view[key];
  return view;
}

export const toAdminProduct = (product) => ({ ...product });

// Search-index helper fields are an implementation detail of the repository.
export function toAdminPotter(potter) {
  const { nameLower: _l, searchTokens: _t, ...view } = potter;
  return view;
}

export const potterSummary = (p) => (p ? { id: p.id, name: p.name, village: p.village, district: p.district, status: p.status } : null);
