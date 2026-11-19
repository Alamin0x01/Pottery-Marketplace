import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatCard } from '../components/ui/StatCard.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Spinner } from '../components/ui/States.jsx';
import { useDashboard } from '../context/DashboardContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { usePolling } from '../hooks/usePolling.js';
import { adminApi } from '../services/adminApi.js';
import { formatDateTime, formatDuration, formatNumber } from '../utils/format.js';
import { OrdersChartCard, DeviceConnectivityCard } from '../features/dashboard/ChartCards.jsx';
import { RecentOrders, RecentProducts } from '../features/dashboard/RecentTables.jsx';
import { ActivityFeed } from '../features/dashboard/ActivityFeed.jsx';

export function OverviewPage() {
  const { summary, error, loading, refresh } = useDashboard();
  const orders = useAsync((signal) => adminApi.orders({ limit: 5 }, signal), []);
  const products = useAsync((signal) => adminApi.products({ limit: 5 }, signal), []);
  const activity = useAsync((signal) => adminApi.activity({ limit: 8 }, signal), []);
  const [refreshing, setRefreshing] = useState(false);

  const reloadLists = useCallback(() => {
    orders.reload({ silent: true });
    products.reload({ silent: true });
    activity.reload({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.reload, products.reload, activity.reload]);
  usePolling(reloadLists, 60_000);

  async function refreshAll() {
    setRefreshing(true);
    reloadLists();
    await refresh();
    setRefreshing(false);
  }

  const k = summary?.counts;
  const missing = !summary;
  const v = (fn) => (k ? formatNumber(fn(k)) : '—');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-charcoal">Overview</h1>
          <p className="text-sm text-charcoal-soft">
            Live figures from the platform database{summary && <> · updated {formatDateTime(summary.generatedAt)}</>}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-charcoal shadow-sm transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 disabled:opacity-60"
        >
          {refreshing ? <Spinner className="h-4 w-4" /> : <Icon name="refresh" className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && missing && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>Could not load the statistics: {error.message}</span>
          <button type="button" onClick={refreshAll} className="font-medium underline">Try again</button>
        </div>
      )}
      {k && k.orders.needsAttention > 0 && (
        <Link to="/orders" className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-100">
          <Icon name="alert" className="h-5 w-5 shrink-0" />
          <span><strong>{formatNumber(k.orders.needsAttention)}</strong> {k.orders.needsAttention === 1 ? 'order needs' : 'orders need'} follow-up: the potter may not have seen {k.orders.needsAttention === 1 ? 'it' : 'them'}.</span>
        </Link>
      )}

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Potters" icon="potters" loading={loading && missing} value={v((c) => c.potters.total)} hint={k && `${formatNumber(k.potters.active)} active`} to="/potters" />
        <StatCard label="Total Devices" icon="devices" accent="slate" loading={loading && missing} value={v((c) => c.devices.total)} hint={k && `${formatNumber(k.devices.unassigned)} unassigned · ${formatNumber(k.devices.disabled + k.devices.lost)} disabled/lost`} to="/devices" />
        <StatCard label="Online Devices" icon="devices" accent="green" loading={loading && missing} value={v((c) => c.devices.online)} hint={k && `Seen in the last ${formatDuration(k.devices.onlineWindowSec)}`} to="/devices?status=active" />
        <StatCard label="Offline Devices" icon="devices" accent="amber" loading={loading && missing} value={v((c) => c.devices.offline)} hint={k && 'Active but not seen recently'} to="/devices?status=offline" />
        <StatCard label="Total Products" icon="products" loading={loading && missing} value={v((c) => c.products.total)} hint={k && 'Excluding removed'} to="/products" />
        <StatCard label="Pending Product Approvals" icon="products" accent="amber" loading={loading && missing} value={v((c) => c.products.pendingApproval)} hint={k && 'Waiting for admin review'} to="/products" />
        <StatCard label="Total Orders" icon="orders" loading={loading && missing} value={v((c) => c.orders.total)} hint={k && 'All time'} to="/orders" />
        <StatCard label="Pending Orders" icon="orders" accent="amber" loading={loading && missing} value={v((c) => c.orders.pending)} hint={k && 'Not yet delivered to a potter'} to="/orders" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <OrdersChartCard summary={summary} error={error} loading={loading} onRetry={refreshAll} />
        <DeviceConnectivityCard summary={summary} error={error} loading={loading} onRetry={refreshAll} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentOrders state={orders} />
        <RecentProducts state={products} />
      </div>

      <ActivityFeed state={activity} />
    </div>
  );
}
