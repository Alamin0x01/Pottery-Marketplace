import { Link, useLocation, useParams } from 'react-router-dom';
import { Container, PageTitle } from '../components/layout/Layout.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, PageSpinner } from '../components/ui/States.jsx';
import { OrderView } from '../components/shop/OrderView.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { storeApi } from '../services/storeApi.js';

/**
 * `/track/:id#<token>` for guests. The token lives in the URL fragment, which browsers never send to any server or
 * log; it is moved into the `X-Tracking-Token` header for the request.
 */
export function TrackOrderPage() {
  const { id } = useParams();
  const { hash } = useLocation();
  const auth = useAuth();
  const token = hash.slice(1);
  const { data: order, error, loading, reload } = useAsync((signal) => storeApi.order(id, token || undefined, signal), [id, token, auth.user?.uid]);

  return (
    <Container className="pb-10">
      <PageTitle title="Track your order" subtitle="Follow your order request from the potter to your door." />
      {loading && !order ? (
        <PageSpinner label="Looking up your order…" />
      ) : error && !order ? (
        error.status === 404 || error.status === 400 ? (
          <EmptyState
            icon="search"
            title="We could not find that order"
            description="The tracking link may be incomplete or out of date. Open the full link you were given when you ordered, or sign in to see your orders."
            action={<ButtonLink to="/login" state={{ from: '/account/orders' }}>Sign in</ButtonLink>}
          />
        ) : (
          <ErrorState error={error} onRetry={reload} />
        )
      ) : (
        <>
          <OrderView order={order} />
          <p className="mt-6 text-sm text-clay-soft">Phone number is partly hidden on this page. <Link to="/login" state={{ from: `/account/orders/${id}` }} className="underline">Sign in</Link> to see full details of orders linked to your account.</p>
        </>
      )}
    </Container>
  );
}
