// Regenerates firebase/firestore.indexes.json from the query shapes in src/db/queryShapes.js.
// Run `npm run indexes:generate` after changing a shape; a unit test fails if the file is stale.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildIndexes } from '../src/db/indexes.js';

const target = fileURLToPath(new URL('../firebase/firestore.indexes.json', import.meta.url));
const result = buildIndexes();
writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${result.indexes.length} composite indexes to firebase/firestore.indexes.json`);
