// Fixed accounts for the judge demonstration. They are clearly DEMO accounts (display name, `demo` claim) and the
// passwords are never stored in the repository: they live in the git-ignored backend/.env.demo.
import { randomInt } from 'node:crypto';

export const DEMO_DOMAIN = 'mati.demo';

// Roles that exist in the code: `superadmin` and `admin` (custom claim `role`), and customers (any signed-in user
// without a role claim). Potters have no Firebase login (they are records managed by admins).
export const DEMO_ACCOUNTS = [
  { key: 'SUPERADMIN', email: `superadmin@${DEMO_DOMAIN}`, name: 'DEMO Superadmin', role: 'superadmin', app: 'admin' },
  { key: 'ADMIN', email: `admin@${DEMO_DOMAIN}`, name: 'DEMO Admin', role: 'admin', app: 'admin' },
  { key: 'CUSTOMER', email: `customer@${DEMO_DOMAIN}`, name: 'DEMO Customer', role: null, app: 'web', phone: '01711000998' },
];

export const passwordVar = (account) => `DEMO_${account.key}_PASSWORD`;

// Demo potter record (no login) and a few clearly labelled products that use the static demo images.
export const DEMO_POTTER = { name: 'DEMO Potter', phone: '01700000099', village: 'Demo Village', district: 'Dhaka', featured: true };
export const DEMO_PRODUCTS = [
  { name: 'DEMO Terracotta Vase', category: 'Home Decoration', price: 450 },
  { name: 'DEMO Clay Tea Cups, Set of 6', category: 'Tableware', price: 340 },
  { name: 'DEMO Storage Jar with Lid', category: 'Storage', price: 410 },
  { name: 'DEMO Earthen Cooking Pot', category: 'Kitchenware', price: 520 },
];

// No look-alike characters (0/O, 1/l/I) so a judge can read the password aloud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function generatePassword(length = 16) {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

export function buildJudgeDoc({ passwords, webUrl = 'http://localhost:5173', adminUrl = 'http://localhost:5174', generatedAt = new Date() }) {
  const rows = DEMO_ACCOUNTS.map((a) => `| ${a.role ?? 'customer'} | \`${a.email}\` | \`${passwords[a.key]}\` | ${a.app === 'admin' ? `Admin dashboard: ${adminUrl}/login` : `Storefront: ${webUrl}/login`} |`);
  return `# Judge demo credentials: CONFIDENTIAL

Share this file directly with the judges only. It is git-ignored: never commit it, post it publicly or deploy it.
Generated ${generatedAt.toISOString()}.

These are **DEMO accounts** in the real Firebase project. They exist only for the judging demonstration.

| Role | Email | Password | Where to sign in |
|------|-------|----------|------------------|
${rows.join('\n')}

Potters have **no login** in this system. A "DEMO Potter" record (with a few "DEMO" products) is visible to admins under *Potters*.

## What each account can do
* **Superadmin**: the whole admin dashboard, including the list of administrators.
* **Admin**: the whole admin dashboard except the list of administrators (it gets "403 Forbidden").
* **Customer**: the storefront only (browse, cart, checkout, own orders and profile). The admin API refuses it (403).

## Demo safety
* Demo admins can look at everything but **cannot** deactivate potters, disable or revoke devices, or issue device credentials ("DEMO account: this action is disabled").
* Everything is checked by Firebase Authentication and the backend as for real users. The "Demo login" panel only fills in the email.
* Orders placed with the customer account are real documents in the project's Firestore.
`;
}
