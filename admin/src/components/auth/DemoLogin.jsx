// Demo login exists in development builds only. `import.meta.env.DEV` is a build-time constant (false in
// `vite build`), so a production bundle contains neither the panel nor the demo emails, even if VITE_DEMO_MODE is set.
const ACCOUNTS = [
  { role: 'Superadmin', email: 'superadmin@mati.demo', note: 'Everything, including the admin list' },
  { role: 'Admin', email: 'admin@mati.demo', note: 'Everything except the admin list' },
];

/**
 * Judge demo helper: lists the fixed DEMO accounts and fills the email field for the chosen role. It does not sign in
 * and holds no password: Firebase Authentication and the backend still check what the judge types in. Shown only when
 * VITE_DEMO_MODE=true (a local, git-ignored setting).
 */
function DemoPanel({ onSelect }) {
  return (
    <section aria-labelledby="demo-login-title" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 id="demo-login-title" className="text-sm font-semibold text-amber-900">
        Demo login <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] uppercase tracking-wide">Demo accounts</span>
      </h2>
      <p className="mt-1 text-xs text-amber-900/80">For the judging demo only. Pick a role to fill in its email, then type the password from the judge credentials sheet. Destructive actions are disabled for demo admins.</p>
      <ul className="mt-3 space-y-2">
        {ACCOUNTS.map((a) => (
          <li key={a.email}>
            <button type="button" onClick={() => onSelect(a.email)} className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm transition hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
              <span className="font-medium text-charcoal">{a.role}</span>
              <span className="block text-xs text-charcoal-soft">{a.email} · {a.note}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-amber-900/80">Customers sign in on the storefront. Potters have no login; a DEMO potter record is listed under Potters.</p>
    </section>
  );
}

export const DemoLogin = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true' ? DemoPanel : () => null;
