import { ACTIVITY_VERBS } from './constants.js';

/** Who did it: a named admin, the platform operator (CLI), the platform itself, or a device. */
export function actorLabel(actor) {
  if (actor.type === 'admin') return actor.name ?? `Admin ${actor.id.slice(0, 6)}…`;
  if (actor.type === 'device') return `Device ${actor.id}`;
  return actor.id === 'admin-cli' ? 'Platform operator' : 'System';
}

/** `{ actor, verb, subject }` for one audit entry, e.g. Priya · "deactivated potter" · "Rahim Uddin (POT-1001)". */
export function describeActivity(item) {
  const { id, label } = item.target;
  return {
    actor: actorLabel(item.actor),
    verb: ACTIVITY_VERBS[item.action] ?? item.action,
    subject: label ?? (id.length > 24 ? `${id.slice(0, 8)}…` : id),
  };
}
