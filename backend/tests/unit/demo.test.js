import { test } from 'node:test';
import assert from 'node:assert/strict';
import { denyDemo } from '../../src/middleware/denyDemo.js';
import { DEMO_ACCOUNTS, buildJudgeDoc, generatePassword, passwordVar } from '../../scripts/lib/demoAccounts.js';
import { ADMIN_ROLES } from '../../src/db/enums.js';

const run = (user) => {
  let result;
  denyDemo({ user }, null, (err) => { result = err ?? 'next'; });
  return result;
};

test('demo accounts cannot run destructive admin actions; real admins and others are unaffected', () => {
  const err = run({ role: 'admin', demo: true });
  assert.equal(err.status, 403);
  assert.equal(err.code, 'DEMO_RESTRICTED');
  assert.equal(run({ role: 'superadmin', demo: true }).status, 403);
  assert.equal(run({ role: 'superadmin', demo: false }), 'next');
  assert.equal(run({ role: 'admin' }), 'next');
});

test('demo accounts only use roles that exist in the code', () => {
  for (const a of DEMO_ACCOUNTS) assert.ok(a.role === null || ADMIN_ROLES.includes(a.role), a.email);
  assert.deepEqual(DEMO_ACCOUNTS.map((a) => a.role), ['superadmin', 'admin', null]);
  assert.ok(DEMO_ACCOUNTS.every((a) => a.email.endsWith('@mati.demo') && a.name.startsWith('DEMO ')));
});

test('generated demo passwords are strong, readable and different every time', () => {
  const a = generatePassword();
  assert.match(a, /^[A-HJ-NP-Za-km-np-z2-9]{16}$/);
  assert.notEqual(a, generatePassword());
});

test('judge document lists every account and is marked confidential', () => {
  const passwords = Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.key, `pw-${passwordVar(a)}`]));
  const doc = buildJudgeDoc({ passwords, generatedAt: new Date('2026-01-01T00:00:00Z') });
  for (const a of DEMO_ACCOUNTS) assert.ok(doc.includes(a.email) && doc.includes(passwords[a.key]));
  assert.match(doc, /CONFIDENTIAL/);
  assert.match(doc, /DEMO accounts/);
});
