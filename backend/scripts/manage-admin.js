// Trusted process for managing administrators. Whoever can run this holds the Firebase Admin credentials;
// there is deliberately no public endpoint that can grant a role.
//
// Use the direct form (works in every shell, including Windows PowerShell):
//   node --env-file=.env scripts/manage-admin.js grant  --email you@example.com --name "Your Name" --role superadmin --create
//   node --env-file=.env scripts/manage-admin.js revoke --email you@example.com
//   node --env-file=.env scripts/manage-admin.js list
// (`npm run admin -- ...` also works, but PowerShell swallows the `--`; there write: npm run admin '--' grant ...)
//
// --create   create the Firebase user if it does not exist (random password nobody sees; you get a
//            password-reset link so the person sets their own).
// --yes      required when the configured Firebase is a REAL project (not the emulators).
import { loadEnv } from '../src/config/env.js';
import { createFirebase } from '../src/config/firebase.js';
import { createRepositories } from '../src/repositories/index.js';
import { createAdminsService } from '../src/services/admins.service.js';

const [command, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) fail(`Unexpected argument "${rest[i]}"`);
  const key = rest[i].slice(2);
  const next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) flags[key] = true;
  else {
    flags[key] = next;
    i++;
  }
}

function fail(message, code = 2) {
  console.error(`✖ ${message}`);
  process.exit(code);
}

if (!['grant', 'revoke', 'list'].includes(command)) {
  fail('Usage: node --env-file=.env scripts/manage-admin.js <grant|revoke|list> [--email x] [--name "Name"] [--role admin|superadmin] [--create] [--yes]');
}
if (flags.password) fail('Passwords are never accepted on the command line. Use --create and the password-reset link.');

let firebase;
try {
  firebase = createFirebase(loadEnv(), { appName: 'manage-admin' });
} catch (err) {
  fail(`Configuration error: ${err.message}`);
}

const { projectId, useEmulators } = firebase.config;
console.log(`Project: ${projectId}  (${useEmulators ? 'EMULATORS' : 'REAL Firebase project'})`);
if (!useEmulators && command !== 'list' && flags.yes !== true) {
  await firebase.close();
  fail(`This changes admin access in the REAL project "${projectId}". Re-run with --yes to confirm.`);
}

const repos = createRepositories(firebase.db);
const admins = createAdminsService({ auth: firebase.auth, repos });

try {
  if (command === 'grant') {
    const result = await admins.grant({
      email: flags.email,
      name: flags.name,
      role: flags.role,
      createIfMissing: flags.create === true,
    });
    console.log(`✔ ${result.email} is now "${result.role}" (uid ${result.uid})`);
    if (result.created) {
      console.log('✔ A new Firebase user was created with a random password that nobody knows.');
      console.log('\nGive this one-time link ONLY to that person so they can set their own password:\n');
      console.log(result.passwordResetLink);
      console.log('\n(Treat the link like a password: do not paste it into chat or commit it.)');
    } else {
      console.log('Existing sessions receive the new role the next time their token refreshes (sign out/in to apply now).');
    }
  } else if (command === 'revoke') {
    const result = await admins.revoke({ email: flags.email });
    console.log(`✔ Admin access removed for ${result.email} (was: ${result.previousRole ?? 'none'}); all their sessions are revoked.`);
  } else {
    const { items } = await repos.admins.list({ limit: 100 });
    if (items.length === 0) console.log('No admins yet. Create the first one: node --env-file=.env scripts/manage-admin.js grant --create --role superadmin --email ... --name "..."');
    for (const a of items) console.log(`${a.active ? '●' : '○'} ${a.role.padEnd(10)} ${a.email}  (${a.name}, uid ${a.id})`);
  }
  await firebase.close();
} catch (err) {
  await firebase.close().catch(() => {});
  const details = err.details?.map((d) => `${d.path}: ${d.message}`).join('; ');
  fail(`${err.message}${details ? ` (${details})` : ''}`, 1);
}
