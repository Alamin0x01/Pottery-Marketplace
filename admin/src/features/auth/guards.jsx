import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { FullPageSpinner, ErrorState } from '../../components/ui/States.jsx';
import { Icon } from '../../components/ui/Icon.jsx';

/**
 * Protects every admin route. Access requires the backend to have verified an admin role
 * (status "authorized"); a Firebase session alone is never enough.
 */
export function RequireAuth() {
  const { status, error, retry, logout } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner label="Restoring your session…" />;
  if (status === 'verifying') return <FullPageSpinner label="Verifying admin access…" />;
  if (status === 'signed-out') return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (status === 'unavailable') {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="w-full max-w-md rounded-xl border border-line bg-white shadow-sm">
          <ErrorState error={{ status: 0, message: error?.message }} onRetry={retry} />
          <div className="border-t border-line p-3 text-center">
            <button type="button" onClick={logout} className="text-sm text-charcoal-soft underline hover:text-charcoal">Sign out</button>
          </div>
        </div>
      </div>
    );
  }
  return <Outlet />;
}

/** Page-level role guard (the backend enforces the same rule on the API; this only avoids dead-end screens). */
export function RequireRole({ roles, children }) {
  const { admin } = useAuth();
  if (roles.includes(admin?.role)) return children;
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-white px-6 py-12 text-center shadow-sm" role="alert">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600"><Icon name="lock" className="h-6 w-6" /></span>
      <h1 className="text-lg font-semibold text-charcoal">Not authorised</h1>
      <p className="mt-1 text-sm text-charcoal-soft">Your role ({admin?.role ?? 'none'}) cannot open this page.</p>
    </div>
  );
}
