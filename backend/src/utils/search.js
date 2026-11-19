/** Lower-case tokens for Firestore `array-contains` search (Firestore has no text search). */
export function buildSearchTokens({ name, tags = [], category }, max = 30) {
  const source = [name, category, ...tags].filter((v) => typeof v === 'string').join(' ');
  const tokens = source
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  return [...new Set(tokens)].slice(0, max);
}
