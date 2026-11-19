/** Items that need an admin's attention, derived from the live dashboard counts (nothing is invented). */
export function attentionItems(summary) {
  if (!summary) return [];
  const { products, orders, devices } = summary.counts;
  const plural = (n, one, many) => (n === 1 ? one : many);
  return [
    { key: 'orders', count: orders.needsAttention, text: plural(orders.needsAttention, 'order needs follow-up', 'orders need follow-up'), to: '/orders' },
    { key: 'products', count: products.pendingApproval, text: plural(products.pendingApproval, 'product waiting for approval', 'products waiting for approval'), to: '/products' },
    { key: 'devices', count: devices.offline, text: plural(devices.offline, 'active device offline', 'active devices offline'), to: '/devices?status=offline' },
  ].filter((i) => i.count > 0);
}
