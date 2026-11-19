import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageSpinner } from '../../components/ui/States.jsx';

/** Customer-only pages. Signed-out visitors are sent to the sign-in page and brought back afterwards. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageSpinner label="Restoring your session…" />;
  if (status === 'signed-out') return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Outlet />;
}

/** Login/register pages bounce signed-in users to where they were going. */
export function RedirectIfSignedIn({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'signed-in') return <Navigate to={location.state?.from ?? '/account'} replace />;
  return children;
}
