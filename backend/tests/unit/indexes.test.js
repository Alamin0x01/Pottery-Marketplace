import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SHAPES, findShape, indexFieldsFor } from '../../src/db/queryShapes.js';
import { buildIndexes } from '../../src/db/indexes.js';
import { COLLECTIONS } from '../../src/db/collections.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('firestore.indexes.json is in sync with the query shapes (run `npm run indexes:generate`)', () => {
  assert.equal(read('../../firebase/firestore.indexes.json'), `${JSON.stringify(buildIndexes(), null, 2)}\n`);
});

test('every query shape that needs a composite index has one', () => {
  const declared = JSON.parse(read('../../firebase/firestore.indexes.json')).indexes;
  for (const shape of SHAPES) {
    const needed = indexFieldsFor(shape);
    if (!needed) continue;
    const found = declared.some(
      (i) => i.collectionGroup === shape.collection && JSON.stringify(i.fields) === JSON.stringify(needed),
    );
    assert.ok(found, `missing index for ${shape.collection} ${JSON.stringify(needed)}`);
  }
});

test('index definitions are well-formed (no duplicates, >= 2 fields, valid collections)', () => {
  const { indexes } = buildIndexes();
  const keys = indexes.map((i) => JSON.stringify(i));
  assert.equal(new Set(keys).size, keys.length);
  for (const index of indexes) {
    assert.ok(Object.values(COLLECTIONS).includes(index.collectionGroup));
    assert.ok(index.fields.length >= 2);
  }
});

test('unsupported filter combinations are rejected instead of producing un-indexed queries', () => {
  assert.ok(findShape('products', { equals: ['status', 'category'], sort: 'price_desc' }));
  assert.throws(() => findShape('products', { equals: ['category', 'potterId'], sort: 'newest' }), /Unsupported/);
  assert.throws(() => findShape('products', { equals: ['status'], arrayContains: 'searchTokens', sort: 'price_asc' }), /Unsupported/);
});
