// Static demo product images, served by the web app from web/public/images/products/ (no Cloud Storage, no paid host).
// Static images are for DEMO products only; real device photos (ESP32) will need a cloud storage solution.
export const STATIC_IMAGES = {
  'terracotta-bowl': { w: 2048, h: 1360 },
  'clay-tea-cups': { w: 547, h: 365 },
  'clay-bowl-set': { w: 480, h: 640 },
  'lidded-clay-pot': { w: 447, h: 447 },
  'water-storage-jar': { w: 300, h: 519 },
  'storage-jar-set': { w: 554, h: 554 },
  'tableware-collection': { w: 447, h: 447 },
  'clay-vase': { w: 1024, h: 1024 },
  'leaf-pattern-pot': { w: 2047, h: 2048 },
  'decorative-plate': { w: 720, h: 720 },
};

// First matching rule wins; images are rotated within a rule so similar products do not all look identical.
const RULES = [
  [/tea|cup/i, ['clay-tea-cups', 'clay-bowl-set']],
  [/bowl/i, ['terracotta-bowl', 'clay-bowl-set']],
  [/jar|storage/i, ['water-storage-jar', 'storage-jar-set']],
  [/kolshi|water/i, ['leaf-pattern-pot', 'water-storage-jar']],
  [/cook|curry|pot/i, ['lidded-clay-pot', 'tableware-collection']],
  [/planter|garden/i, ['clay-vase', 'leaf-pattern-pot']],
  [/diya|lamp|plate/i, ['decorative-plate', 'tableware-collection']],
  [/vase/i, ['clay-vase', 'leaf-pattern-pot']],
];

const ALL = Object.keys(STATIC_IMAGES);

/** Returns a function name -> image slug that rotates within each matching rule (and over all images as a fallback). */
export function createImagePicker() {
  const counters = new Map();
  return (name = '') => {
    const rule = RULES.find(([re]) => re.test(name));
    const choices = rule?.[1] ?? ALL;
    const n = counters.get(choices) ?? 0;
    counters.set(choices, n + 1);
    return choices[n % choices.length];
  };
}

/** Firestore `images[]` entries (same shape as every other image: path + kind + size) for one static demo image. */
export function staticImageEntries(slug) {
  const { w, h } = STATIC_IMAGES[slug];
  const path = `/images/products/${slug}.jpg`;
  return [
    { path, kind: 'web', w, h },
    { path, kind: 'thumb', w, h },
  ];
}
