import { Card } from '../../components/ui/Card.jsx';
import { BarChart, ProportionBars, StackedBar } from '../../components/charts/Charts.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { ORDER_STATUS_META } from '../../utils/constants.js';
import { formatDuration, formatNumber } from '../../utils/format.js';

const shortDay = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

export function OrdersChartCard({ summary, error, loading, onRetry }) {
  if (error && !summary) return <Card title="Order statistics" className="lg:col-span-2"><ErrorState error={error} onRetry={onRetry} compact /></Card>;
  if (loading && !summary) {
    return <Card title="Order statistics" className="lg:col-span-2" bodyClassName="p-5"><Skeleton className="h-44 w-full" /></Card>;
  }
  const days = summary.ordersByDay;
  const total = days.reduce((s, d) => s + d.count, 0);
  const byStatus = summary.counts.orders.byStatus;
  const statusRows = Object.entries(byStatus)
    .filter(([, n]) => n > 0)
    .map(([status, value]) => ({ label: ORDER_STATUS_META[status]?.label ?? status, value, color: 'bg-terracotta-500' }));

  return (
    <Card title="Order statistics" subtitle={`Orders placed per day (Bangladesh time), last ${days.length} days`} className="lg:col-span-2">
      <div className="grid gap-6 p-5 md:grid-cols-5">
        <div className="md:col-span-3">
          <p className="mb-2 text-xs text-charcoal-soft"><strong className="text-sm font-semibold text-charcoal">{formatNumber(total)}</strong> orders in this period</p>
          <BarChart
            data={days.map((d) => ({ label: d.date, short: shortDay(d.date), value: d.count }))}
            ariaLabel={`Orders per day for the last ${days.length} days: ${total} in total`}
          />
          {total === 0 && <p className="mt-1 text-center text-xs text-charcoal-soft">No orders in this period.</p>}
        </div>
        <div className="md:col-span-2">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-charcoal-soft">By status (all time)</p>
          {statusRows.length === 0 ? (
            <EmptyState icon="orders" title="No orders yet" />
          ) : (
            <ProportionBars rows={statusRows} total={summary.counts.orders.total} />
          )}
        </div>
      </div>
    </Card>
  );
}

export function DeviceConnectivityCard({ summary, error, loading, onRetry }) {
  if (error && !summary) return <Card title="Device connectivity"><ErrorState error={error} onRetry={onRetry} compact /></Card>;
  if (loading && !summary) return <Card title="Device connectivity" bodyClassName="p-5"><Skeleton className="h-32 w-full" /></Card>;

  const d = summary.counts.devices;
  const segments = [
    { label: 'Online', value: d.online, color: 'bg-emerald-500', dot: 'bg-emerald-500' },
    { label: 'Offline', value: d.offline, color: 'bg-amber-400', dot: 'bg-amber-400' },
    { label: 'Unassigned', value: d.unassigned, color: 'bg-stone-300', dot: 'bg-stone-300' },
    { label: 'Disabled', value: d.disabled, color: 'bg-stone-500', dot: 'bg-stone-500' },
    { label: 'Lost', value: d.lost, color: 'bg-red-500', dot: 'bg-red-500' },
  ];
  return (
    <Card title="Device connectivity" subtitle={`Online = contacted the server in the last ${formatDuration(d.onlineWindowSec)}`}>
      {d.total === 0 ? (
        <EmptyState icon="devices" title="No devices registered yet" description="Registered devices and their connectivity appear here." />
      ) : (
        <div className="space-y-4 p-5">
          <StackedBar segments={segments} ariaLabel={`Device status: ${segments.map((s) => `${s.value} ${s.label}`).join(', ')}`} />
          <ul className="space-y-2">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-charcoal-soft"><span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />{s.label}</span>
                <span className="font-medium text-charcoal">{formatNumber(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
