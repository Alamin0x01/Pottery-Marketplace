import { CATEGORIES } from '../db/enums.js';
import { encodeCursor } from '../repositories/query.js';
import { ApiError } from '../utils/ApiError.js';

const SCAN_PAGE = 100;
const SCAN_PAGES = 3; // in-memory queries look at the newest 300 approved products at most
const NATIVE_REFILL_ROUNDS = 5;
const CACHE_MS = 60_000;

const encodeOffset = (offset) => Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
function decodeOffset(cursor) {
  if (!cursor) return 0;
  try {
    const { o } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Number.isInteger(o) && o >= 0 && o < 100_000) return o;
  } catch {
    /* fall through */
  }
  throw ApiError.badRequest('Invalid cursor');
}

const words = (q) => (q ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

/**
 * The public catalogue. Everything returned is an allow-list: no potter ID, device ID, AI fields, private image
 * paths, statuses or internal tokens. Only `approved` products are ever read, and products with no stock left are not
 * offered in listings ("available for sale").
 */
export function createCatalogService({ repos, imageUrl, cacheMs = CACHE_MS }) {
  const cache = new Map();
  const cached = async (key, load) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return hit.value;
    const value = await load();
    cache.set(key, { value, at: Date.now() });
    return value;
  };

  function toPublic(p) {
    const web = p.images?.find((i) => i.kind === 'web') ?? p.images?.find((i) => i.kind === 'thumb');
    const thumb = p.images?.find((i) => i.kind === 'thumb') ?? web;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      material: p.material && p.material !== 'unknown' ? p.material : null,
      tags: p.tags ?? [],
      price: p.price,
      imageUrl: imageUrl(web?.path),
      thumbUrl: imageUrl(thumb?.path),
      stock: p.stock,
      available: p.stock > 0,
      featured: p.featured === true,
      seller: { name: p.potterName, village: p.potterVillage, district: p.potterDistrict },
      createdAt: p.createdAt,
    };
  }

  /** Indexed query path: pages are refilled until `limit` in-stock products are collected. */
  async function listNative({ category, featured, minPrice, maxPrice, sort, limit, cursor }) {
    const out = [];
    let next = cursor ?? null;
    for (let round = 0; round < NATIVE_REFILL_ROUNDS; round += 1) {
      const page = await repos.products.list({ status: 'approved', category, featured, minPrice, maxPrice, sort, limit, cursor: next });
      out.push(...page.items.filter((p) => p.stock > 0));
      next = page.nextCursor;
      if (out.length >= limit || !next) break;
    }
    if (out.length > limit) {
      out.length = limit;
      next = encodeCursor(out.at(-1).id);
    }
    return { items: out, nextCursor: next };
  }

  /**
   * Search / seller filter / "newest within a price range". Firestore cannot combine these with ordering, so the
   * newest 300 approved products matching the indexed part are fetched and the rest is applied in memory.
   */
  async function listScanned({ q, category, potterId, minPrice, maxPrice, sort, limit, cursor }) {
    const terms = words(q);
    if (q && terms.length === 0) return { items: [], nextCursor: null };
    const primary = terms.reduce((a, b) => (b.length > a.length ? b : a), '');
    const query = { status: 'approved', sort: 'newest', limit: SCAN_PAGE };
    if (q) query.searchToken = primary;
    else if (potterId) query.potterId = potterId;
    else if (category) query.category = category;

    const found = [];
    let next = null;
    for (let i = 0; i < SCAN_PAGES; i += 1) {
      const page = await repos.products.list({ ...query, cursor: next });
      found.push(...page.items);
      next = page.nextCursor;
      if (!next) break;
    }

    const matches = found.filter(
      (p) =>
        p.stock > 0 &&
        (!category || p.category === category) &&
        (!potterId || p.potterId === potterId) &&
        (minPrice == null || p.price >= minPrice) &&
        (maxPrice == null || p.price <= maxPrice) &&
        terms.every((t) => p.searchTokens?.includes(t) || p.searchTokens?.some((s) => s.startsWith(t))),
    );
    if (sort === 'price_asc') matches.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
    if (sort === 'price_desc') matches.sort((a, b) => b.price - a.price || a.id.localeCompare(b.id));

    const offset = decodeOffset(cursor);
    const items = matches.slice(offset, offset + limit);
    return { items, nextCursor: offset + limit < matches.length ? encodeOffset(offset + limit) : null };
  }

  async function list(query) {
    const { q, potterId, minPrice, maxPrice, sort } = query;
    const range = minPrice != null || maxPrice != null;
    const needsScan = Boolean(q) || Boolean(potterId) || (range && sort === 'newest');
    const page = needsScan ? await listScanned(query) : await listNative(query);
    return { items: page.items.map(toPublic), nextCursor: page.nextCursor };
  }

  async function get(id) {
    const product = await repos.products.get(id);
    if (!product || product.status !== 'approved') throw ApiError.notFound('Product not found');
    return toPublic(product);
  }

  /** Approved-product count per category (only categories that have products are "popular"). */
  const categories = () =>
    cached('categories', async () => {
      const counts = await repos.stats.approvedProductsByCategory(CATEGORIES);
      return CATEGORIES.map((name) => ({ name, count: counts[name] ?? 0 })).sort((a, b) => b.count - a.count);
    });

  /** Active, featured potters that currently have at least one approved product. Public-safe fields only. */
  const featuredPotters = () =>
    cached('featured-potters', async () => {
      const { items } = await repos.potters.list({ status: 'active', featured: true, limit: 12 });
      const counts = await Promise.all(items.map((p) => repos.stats.approvedProductsForPotter(p.id)));
      return items
        .map((p, i) => ({ id: p.id, name: p.name, village: p.village, district: p.district, bio: p.bio ?? null, productCount: counts[i] }))
        .filter((p) => p.productCount > 0);
    });

  return { list, get, categories, featuredPotters, toPublic };
}
