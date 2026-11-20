// Demo login exists in development builds only. `import.meta.env.DEV` is a build-time constant (false in
// `vite build`), so a production bundle contains neither the panel nor the demo emails, even if VITE_DEMO_MODE is set.
const ACCOUNTS = [
  { role: 'Customer', email: 'customer@mati.demo', note: 'Browse, order and track orders' },
];

/**
 * Judge demo helper: lists the fixed DEMO accounts and fills the email field for the chosen role. It does not sign in
 * and holds no password: Firebase Authentication still checks the credentials the judge types in. Shown only when
 * VITE_DEMO_MODE=true (a local, git-ignored setting).
 */
function DemoPanel({ onSelect }) {
  return (
    <section aria-labelledby="demo-login-title" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <h2 id="demo-login-title" className="text-sm font-semibold text-amber-900">Demo login <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] uppercase tracking-wide">Demo accounts</span></h2>
      <p className="mt-1 text-xs text-amber-900/80">For the judging demo only. Pick a role to fill in its email, then type the password from the judge credentials sheet.</p>
      <ul className="mt-3 space-y-2">
        {ACCOUNTS.map((a) => (
          <li key={a.email}>
            <button type="button" onClick={() => onSelect(a.email)} className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-left text-sm transition hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
              <span className="font-medium text-clay-brown">{a.role}</span>
              <span className="block text-xs text-clay-soft">{a.email} · {a.note}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-amber-900/80">Admin roles sign in on the admin dashboard. Potters have no login; a DEMO potter record is shown there.</p>
    </section>
  );
}

export const DemoLogin = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true' ? DemoPanel : () => null;
