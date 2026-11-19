import { useLocation } from 'react-router-dom';
import { Icon } from '../components/ui/Icon.jsx';
import { NAV_ITEMS } from '../utils/constants.js';

/** Honest placeholder for sections that are built in later phases (see docs/DEVELOPMENT_ROADMAP.md). */
export function ComingSoonPage() {
  const { pathname } = useLocation();
  const item = NAV_ITEMS.find((i) => i.to === pathname);
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-line bg-white px-6 py-14 text-center shadow-sm">
      <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-terracotta-50 text-terracotta-600">
        <Icon name={item?.icon ?? 'clock'} className="h-6 w-6" />
      </span>
      <h1 className="text-lg font-semibold text-charcoal">{item?.label ?? 'This section'} is not built yet</h1>
      {item?.phase && <p className="mt-1 text-xs font-medium uppercase tracking-wide text-terracotta-600">Planned for {item.phase}</p>}
      <p className="mx-auto mt-3 max-w-md text-sm text-charcoal-soft">{item?.blurb}</p>
    </div>
  );
}
