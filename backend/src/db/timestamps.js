import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// All timestamps are written with server time; device/browser clocks are never trusted.
export const serverTimestamp = () => FieldValue.serverTimestamp();
export const timestampAfter = (ms) => Timestamp.fromMillis(Date.now() + ms);
export const timestampBefore = (ms) => Timestamp.fromMillis(Date.now() - ms);

function convert(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(convert);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v)]));
  }
  return value;
}

/** DocumentSnapshot -> `{ id, ...fields }` with Timestamps as ISO-8601 strings, or null if missing. */
export function serialize(snapshot) {
  if (!snapshot.exists) return null;
  return { id: snapshot.id, ...convert(snapshot.data()) };
}
