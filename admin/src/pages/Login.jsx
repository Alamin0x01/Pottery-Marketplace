import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { DemoLogin } from '../components/auth/DemoLogin.jsx';
import { Spinner } from '../components/ui/States.jsx';
import { getFirebaseRuntime } from '../lib/firebase.js';
import { useReachable } from '../hooks/useReachable.js';
import { emulatorUnreachableMessage } from '../utils/authErrors.js';

/** Development only: warns up front when the local Firebase Auth emulator is not running. */
function EmulatorNotice() {
  const { useEmulators, authEmulatorUrl } = getFirebaseRuntime();
  const reachable = useReachable(useEmulators ? authEmulatorUrl : null);
  if (!useEmulators || reachable !== false) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{emulatorUnreachableMessage(authEmulatorUrl)}</span>
    </div>
  );
}

export function LoginPage() {
  const { status, error, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  if (status === 'authorized') return <Navigate to={location.state?.from ?? '/'} replace />;

  const busy = submitting || status === 'verifying' || status === 'loading';
  const message = formError ?? error?.message ?? null;

  async function onSubmit(event) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      setPassword('');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-terracotta-500 text-xl font-bold text-white">M</span>
          <h1 className="mt-4 text-xl font-semibold text-charcoal">Mati Admin</h1>
          <p className="mt-1 text-sm text-charcoal-soft">Sign in to manage the pottery marketplace</p>
        </div>

        <EmulatorNotice />
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-line bg-white p-6 shadow-sm" noValidate>
          {message && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-charcoal">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-charcoal focus:border-terracotta-500 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-charcoal">Password</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-line py-2 pl-3 pr-10 text-sm text-charcoal focus:border-terracotta-500 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-charcoal"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                <Icon name="eye" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-terracotta-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terracotta-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Spinner className="h-4 w-4 text-white" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <DemoLogin onSelect={(address) => { setEmail(address); setPassword(''); setFormError(null); }} />

        <p className="mt-4 text-center text-xs text-charcoal-soft">
          Administrator accounts are created by the platform operator. There is no public sign-up.
        </p>
      </div>
    </div>
  );
}
