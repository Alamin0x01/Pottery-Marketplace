import { Card } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { describeActivity } from '../../utils/activity.js';
import { formatDateTime, formatRelative } from '../../utils/format.js';

export function ActivityFeed({ state }) {
  const { data, error, loading, reload } = state;
  return (
    <Card title="Recent activity" subtitle="Audit trail of administrative changes">
      {loading && !data ? (
        <div className="space-y-3 p-5" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} compact />
      ) : data.items.length === 0 ? (
        <EmptyState icon="clock" title="No activity yet" description="Changes such as device assignments, approvals and admin access will be listed here." />
      ) : (
        <ol className="divide-y divide-line">
          {data.items.map((item) => {
            const { actor, verb, subject } = describeActivity(item);
            return (
              <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 rounded-full bg-stone-100 p-1.5 text-charcoal-soft"><Icon name="clock" className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-charcoal">
                    <span className="font-medium">{actor}</span> {verb} <span className="font-mono text-xs">{subject}</span>
                  </p>
                  <p className="text-xs text-charcoal-soft" title={formatDateTime(item.timestamp)}>{formatRelative(item.timestamp)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
