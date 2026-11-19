import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDeviceSecret, hashDeviceSecret, verifyDeviceSecret, credentialFingerprint, SECRET_PATTERN } from '../../src/utils/deviceCredentials.js';
import { createFailureThrottle } from '../../src/utils/failureThrottle.js';
import { BD_DISTRICTS, canonicalDistrict } from '../../src/utils/districts.js';
import { connectivityOf, withConnectivity } from '../../src/utils/connectivity.js';

test('device secrets: 256-bit random, URL-safe, unique; only the SHA-256 digest is comparable', () => {
  const secrets = Array.from({ length: 200 }, generateDeviceSecret);
  assert.equal(new Set(secrets).size, 200);
  assert.ok(secrets.every((s) => SECRET_PATTERN.test(s)));

  const secret = secrets[0];
  const hash = hashDeviceSecret(secret);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.ok(!hash.includes(secret));
  assert.equal(verifyDeviceSecret(secret, hash), true);
  assert.equal(verifyDeviceSecret(secrets[1], hash), false);
  assert.equal(credentialFingerprint(hash), hash.slice(0, 8));
});

test('secret verification fails closed for missing credentials and non-string input', () => {
  const hash = hashDeviceSecret(generateDeviceSecret());
  assert.equal(verifyDeviceSecret('anything', null), false, 'revoked device: nothing can match');
  assert.equal(verifyDeviceSecret(undefined, hash), false);
  assert.equal(verifyDeviceSecret({ toString: () => 'x' }, hash), false);
  assert.equal(verifyDeviceSecret('', hash), false);
  assert.equal(credentialFingerprint(null), null);
});

test('failure throttle: counts per key, expires, and is bounded in memory', () => {
  let now = 0;
  const throttle = createFailureThrottle({ limit: 2, windowMs: 1000, maxKeys: 3, now: () => now });
  assert.equal(throttle.fail('a').blocked, false);
  assert.equal(throttle.fail('a').blocked, false);
  const blocked = throttle.fail('a');
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(throttle.fail('b').blocked, false, 'keys are independent');
  now = 1500;
  assert.equal(throttle.fail('a').blocked, false, 'window expired');
  for (let i = 0; i < 50; i++) throttle.fail(`flood-${i}`);
  assert.ok(throttle.size() <= 4, 'an attacker cannot grow the table without bound');
});

test('districts: 64 canonical names, common alternative spellings resolve', () => {
  assert.equal(BD_DISTRICTS.length, 64);
  assert.equal(new Set(BD_DISTRICTS).size, 64);
  assert.equal(canonicalDistrict('dhaka'), 'Dhaka');
  assert.equal(canonicalDistrict('  COMILLA '), 'Cumilla');
  assert.equal(canonicalDistrict('Atlantis'), null);
  assert.equal(canonicalDistrict(''), null);
});

test('connectivity is derived from lastSeen; an active device that went silent displays as offline', () => {
  const now = new Date('2025-01-01T12:00:00Z');
  const opts = { onlineWindowSec: 900, now };
  assert.equal(connectivityOf({ lastSeen: null }, opts), 'never_seen');
  assert.equal(connectivityOf({ lastSeen: '2025-01-01T11:50:00Z' }, opts), 'online');
  assert.equal(connectivityOf({ lastSeen: '2025-01-01T11:30:00Z' }, opts), 'offline');
  assert.equal(withConnectivity({ status: 'active', lastSeen: '2025-01-01T11:30:00Z' }, opts).displayStatus, 'offline');
  assert.equal(withConnectivity({ status: 'active', lastSeen: '2025-01-01T11:59:00Z' }, opts).displayStatus, 'active');
  assert.equal(withConnectivity({ status: 'disabled', lastSeen: '2025-01-01T11:59:00Z' }, opts).displayStatus, 'disabled');
  assert.equal(withConnectivity({ status: 'unassigned', lastSeen: null }, opts).displayStatus, 'unassigned');
});
