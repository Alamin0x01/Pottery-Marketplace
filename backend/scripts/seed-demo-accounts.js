// Fixed DEMO accounts for the judge demonstration (see docs/DEMO_ACCOUNTS.md).
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.demo scripts/seed-demo-accounts.js <command> [--yes]
//
//   init     creates backend/.env.demo with generated passwords (git-ignored; never overwritten; nothing is printed)
//   seed     creates/updates the demo accounts, claims, role documents, a DEMO potter and DEMO products. Idempotent.
//            Needs --yes against a real Firebase project. Existing users are never overwritten: an account whose
//            email already exists WITHOUT the `demo` claim is skipped untouched. Passwords are only set when an
//            account is created (or with --reset-passwords for accounts that already carry the demo claim).
//   doc      writes judge-credentials/JUDGE_CREDENTIALS.md (git-ignored) from .env.demo
//   verify   signs in as every demo account and checks role-based access against a running backend (--api URL)
//
// Passwords are never printed.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/env.js';
import { createFirebase } from '../src/config/firebase.js';
import { COLLECTIONS } from '../src/db/collections.js';
import { createRepositories } from '../src/repositories/index.js';
import { createAdminsService } from '../src/services/admins.service.js';
import { DEMO_ACCOUNTS, DEMO_POTTER, DEMO_PRODUCTS, buildJudgeDoc, generatePassword, passwordVar } from './lib/demoAccounts.js';
import { createImagePicker, staticImageEntries } from './lib/staticImages.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
const repoRoot = path.resolve(backendDir, '..');
const ENV_DEMO = path.join(backendDir, '.env.demo');
const DOC_DIR = path.join(repoRoot, 'judge-credentials');

const [command, ...rest] = process.argv.slice(2);
const flags = new Map();
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) fail(`Unexpected argument "${rest[i]}"`);
  const next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) flags.set(rest[i].slice(2), true);
  else flags.set(rest[i].slice(2), next), i++;
}

function fail(message, code = 2) {
  console.error(`✖ ${message}`);
  process.exit(code);
}

function requirePasswords() {
  const passwords = {};
  for (const a of DEMO_ACCOUNTS) {
    const value = process.env[passwordVar(a)];
    if (!value || value.length < 10) fail(`${passwordVar(a)} is missing or too short in backend/.env.demo. Run the "init" command first.`);
    passwords[a.key] = value;
  }
  return passwords;
}

function writeDoc(passwords) {
  fs.mkdirSync(DOC_DIR, { recursive: true });
  const file = path.join(DOC_DIR, 'JUDGE_CREDENTIALS.md');
  fs.writeFileSync(file, buildJudgeDoc({ passwords }), { mode: 0o600 });
  console.log(`✔ Judge credentials written to ${path.relative(repoRoot, file)} (git-ignored; share it directly with the judges).`);
}

async function init() {
  if (fs.existsSync(ENV_DEMO)) {
    console.log('backend/.env.demo already exists: left untouched.');
    return;
  }
  const lines = DEMO_ACCOUNTS.map((a) => `${passwordVar(a)}=${generatePassword()}`);
  fs.writeFileSync(ENV_DEMO, `# DEMO account passwords (git-ignored). Used only by scripts/seed-demo-accounts.js.\n${lines.join('\n')}\n`, { mode: 0o600 });
  console.log('✔ backend/.env.demo created with generated passwords (not printed). Next: run "seed --yes", then "doc".');
}

async function seed() {
  const passwords = requirePasswords();
  const firebase = createFirebase(loadEnv(), { appName: 'seed-demo-accounts' });
  const { projectId, useEmulators } = firebase.config;
  console.log(`Project: ${projectId}  (${useEmulators ? 'EMULATORS' : 'REAL Firebase project'})`);
  if (!useEmulators && flags.get('yes') !== true) {
    await firebase.close();
    fail(`This creates DEMO accounts and demo data in the REAL project "${projectId}". Re-run with --yes to confirm.`);
  }

  const { auth, db } = firebase;
  const repos = createRepositories(db);
  const admins = createAdminsService({ auth, repos });
  const ACTOR = { type: 'system', id: 'seed-demo-accounts' };
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const report = [];

  try {
    for (const account of DEMO_ACCOUNTS) {
      let user = await auth.getUserByEmail(account.email).catch((err) => (err?.code === 'auth/user-not-found' ? null : Promise.reject(err)));
      let status;
      if (user && user.customClaims?.demo !== true) {
        report.push([account.email, 'SKIPPED: a non-demo user already owns this email (left untouched)']);
        continue;
      }
      if (!user) {
        user = await auth.createUser({ email: account.email, displayName: account.name, emailVerified: true, password: passwords[account.key] });
        await auth.setCustomUserClaims(user.uid, { demo: true });
        status = 'created';
      } else {
        status = 'exists';
        if (flags.get('reset-passwords') === true) {
          await auth.updateUser(user.uid, { password: passwords[account.key] });
          status = 'exists (password reset)';
        }
      }

      if (account.role) {
        const profile = await repos.admins.get(user.uid);
        const claimRole = (await auth.getUser(user.uid)).customClaims?.role;
        if (!profile || profile.role !== account.role || profile.active !== true || claimRole !== account.role) {
          await admins.grant({ email: account.email, name: account.name, role: account.role }); // existing logic: claim + role document + audit entry
          status += ', role granted';
        }
      } else if (!(await repos.customers.get(user.uid))) {
        await repos.customers.upsert(user.uid, { name: account.name, phone: account.phone, email: account.email });
        status += ', customer profile created';
      }
      report.push([account.email, status]);
    }

    // DEMO potter record (no login): reused when its reserved phone number already exists.
    const reservation = await db.collection(COLLECTIONS.potterPhones).doc(DEMO_POTTER.phone).get();
    const potterId = reservation.exists
      ? reservation.data().potterId
      : (await repos.potters.create(DEMO_POTTER, { createdBy: ACTOR.id })).id;
    report.push([`${DEMO_POTTER.name} (${potterId})`, reservation.exists ? 'exists' : 'created']);

    // A device with no usable credentials: it only lets the demo products be created through the normal upload flow.
    let [device] = await repos.devices.listByPotter(potterId, { status: 'active' });
    if (!device) {
      device = await repos.devices.register({ credentialHash: sha(randomUUID()), model: 'DEMO device (no credentials)' }, { actor: ACTOR });
      await repos.devices.assign({ deviceId: device.id, potterId, actor: ACTOR });
      report.push([`DEMO device (${device.id})`, 'created']);
    }

    const pick = createImagePicker();
    let created = 0;
    for (const [i, p] of DEMO_PRODUCTS.entries()) {
      const { duplicate, productId } = await repos.uploads.createWithDraft({
        deviceId: device.id, productId: repos.products.newId(), captureId: `demo-seed-${i + 1}`, sizeBytes: 100_000, sha256: sha(`demo-seed-${i + 1}`),
        images: [{ path: `uploads/demo/${i + 1}/original.jpg`, kind: 'original', w: 1600, h: 1200 }],
      });
      if (!duplicate) {
        await repos.products.update(productId, {
          name: p.name, category: p.category, price: p.price, stock: 5, material: 'Terracotta clay', tags: ['demo', 'handmade'], featured: i < 2,
          description: `${p.name}: a DEMO listing for the judging demonstration. A traditional handmade piece shaped and fired by a village potter.`,
        });
        await repos.products.transition(productId, 'pending_review', { actor: ACTOR });
        await repos.products.transition(productId, 'approved', { actor: ACTOR });
        await db.collection(COLLECTIONS.products).doc(productId).update({ images: [{ path: `uploads/demo/${i + 1}/original.jpg`, kind: 'original', w: 1600, h: 1200 }, ...staticImageEntries(pick(p.name))] });
        created += 1;
      }
    }
    report.push([`${DEMO_PRODUCTS.length} DEMO products`, created > 0 ? `${created} created` : 'exist']);
  } finally {
    await firebase.close().catch(() => {});
  }

  for (const [what, result] of report) console.log(`  ${what.padEnd(40)} ${result}`);
  console.log('✔ Done. Passwords were not printed. Use the "doc" command to produce the judge credentials sheet.');
}

function readWebApiKey() {
  if (process.env.VITE_FIREBASE_API_KEY) return process.env.VITE_FIREBASE_API_KEY;
  const file = path.join(repoRoot, 'web', '.env.local');
  const match = fs.existsSync(file) && /^VITE_FIREBASE_API_KEY=(.+)$/m.exec(fs.readFileSync(file, 'utf8'));
  return match ? match[1].trim() : 'emulator-key';
}

async function verify() {
  const passwords = requirePasswords();
  const api = String(flags.get('api') ?? 'http://localhost:4000').replace(/\/$/, '');
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const signInUrl = `${emulatorHost ? `http://${emulatorHost}/` : 'https://'}identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${readWebApiKey()}`;
  let failures = 0;
  const check = (label, ok) => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✔' : '✖'} ${label}`);
  };
  const call = async (method, route, token, body) => {
    const res = await fetch(`${api}${route}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const signIn = async (email, password) => {
    const res = await fetch(signInUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? json.idToken : null;
  };

  console.log(`Backend: ${api}   Auth: ${emulatorHost ? 'emulator' : 'REAL Firebase Authentication'}`);
  const potters = await fetch(`${api}/api/products?limit=1`).then((r) => r.status);
  check('public catalogue is reachable (no sign-in)', potters === 200);
  check('admin API refuses a missing token (401)', (await call('GET', '/api/admin/me')).status === 401);

  const tokens = {};
  for (const a of DEMO_ACCOUNTS) {
    tokens[a.key] = await signIn(a.email, passwords[a.key]);
    check(`${a.email} can sign in with Firebase Authentication`, Boolean(tokens[a.key]));
  }
  check('wrong password is rejected by Firebase Authentication', (await signIn(DEMO_ACCOUNTS[0].email, `${passwords.SUPERADMIN}x`)) === null);

  const RESTRICTED = [['PATCH', '/api/admin/potters/POT-1001/status', { status: 'inactive' }], ['POST', '/api/admin/devices/DEV-001/revoke', { reason: 'demo check' }], ['PATCH', '/api/admin/devices/DEV-001/status', { status: 'disabled' }], ['POST', '/api/admin/devices/DEV-001/credentials', {}]];
  for (const role of ['SUPERADMIN', 'ADMIN']) {
    const t = tokens[role];
    if (!t) continue;
    const me = await call('GET', '/api/admin/me', t);
    check(`${role.toLowerCase()}: /admin/me is ${role.toLowerCase()} and flagged demo`, me.status === 200 && me.body?.role === role.toLowerCase() && me.body?.demo === true);
    check(`${role.toLowerCase()}: dashboard, orders, products, potters, devices readable`, (await Promise.all(['dashboard', 'orders', 'products', 'potters', 'devices'].map((p) => call('GET', `/api/admin/${p}`, t)))).every((r) => r.status === 200));
    check(`${role.toLowerCase()}: admin list is ${role === 'SUPERADMIN' ? 'allowed' : 'forbidden (superadmin only)'}`, (await call('GET', '/api/admin/admins', t)).status === (role === 'SUPERADMIN' ? 200 : 403));
    const blocked = await Promise.all(RESTRICTED.map(([m, r, b]) => call(m, r, t, b)));
    check(`${role.toLowerCase()}: destructive actions are blocked (DEMO_RESTRICTED)`, blocked.every((r) => r.status === 403 && r.body?.error?.code === 'DEMO_RESTRICTED'));
  }
  const c = tokens.CUSTOMER;
  if (c) {
    check('customer: own profile is readable', (await call('GET', '/api/customers/me', c)).status === 200);
    check('customer: own orders are readable', (await call('GET', '/api/customers/me/orders', c)).status === 200);
    check('customer: admin API is forbidden (403)', (await Promise.all(['me', 'dashboard', 'admins', 'orders'].map((p) => call('GET', `/api/admin/${p}`, c)))).every((r) => r.status === 403));
  }
  console.log(failures === 0 ? '✔ All role checks passed.' : `✖ ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

if (command === 'init') await init();
else if (command === 'seed') await seed();
else if (command === 'doc') writeDoc(requirePasswords());
else if (command === 'verify') await verify();
else fail('Usage: node --env-file-if-exists=.env --env-file-if-exists=.env.demo scripts/seed-demo-accounts.js <init|seed|doc|verify> [--yes] [--reset-passwords] [--api URL]');
