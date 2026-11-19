import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon.jsx';
import { Popover } from '../components/ui/Popover.jsx';
import { useDashboard } from '../context/DashboardContext.jsx';
import { formatNumber } from '../utils/format.js';
import { attentionItems } from './attention.js';

export function NotificationsMenu() {
  const { summary, error, loading } = useDashboard();
  const items = attentionItems(summary);
  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <Popover
      label={total > 0 ? `Notifications, ${total} need attention` : 'Notifications'}
      trigger={
        <span className="relative block">
          <Icon name="bell" />
          {total > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-terracotta-500 px-1 text-[10px] font-semibold leading-4 text-white">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </span>
      }
      panelClassName="w-80"
    >
      {(close) => (
        <div>
          <p className="border-b border-line px-4 py-3 text-sm font-semibold text-charcoal">Needs your attention</p>
          {loading && !summary && <p className="px-4 py-4 text-sm text-charcoal-soft">Loading…</p>}
          {error && !summary && <p className="px-4 py-4 text-sm text-red-700">Could not load notifications.</p>}
          {summary && items.length === 0 && <p className="px-4 py-5 text-sm text-charcoal-soft">You are all caught up.</p>}
          <ul>
            {items.map((i) => (
              <li key={i.key}>
                <Link to={i.to} onClick={close} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-stone-50">
                  <span className="text-charcoal"><strong className="font-semibold">{formatNumber(i.count)}</strong> {i.text}</span>
                  <Icon name="chevron" className="h-4 w-4 -rotate-90 text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  );
}
