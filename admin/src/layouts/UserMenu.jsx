import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon.jsx';
import { Popover } from '../components/ui/Popover.jsx';
import { StatusBadge } from '../components/ui/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_META } from '../utils/constants.js';
import { initials } from '../utils/format.js';

export function UserMenu() {
  const { admin, logout } = useAuth();
  const display = admin.name ?? admin.email;
  return (
    <Popover
      label="Account menu"
      panelClassName="w-64"
      trigger={
        <span className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-terracotta-500 text-xs font-semibold text-white">{initials(display)}</span>
          <span className="hidden max-w-32 truncate text-sm font-medium text-charcoal md:block">{display}</span>
          <Icon name="chevron" className="hidden h-4 w-4 md:block" />
        </span>
      }
    >
      {(close) => (
        <div>
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-charcoal">{display}</p>
            {admin.name && <p className="truncate text-xs text-charcoal-soft">{admin.email}</p>}
            <div className="mt-2"><StatusBadge value={admin.role} meta={ROLE_META} /></div>
          </div>
          <Link to="/settings" onClick={close} className="flex items-center gap-2 px-4 py-2.5 text-sm text-charcoal transition-colors hover:bg-stone-50">
            <Icon name="settings" className="h-4 w-4" /> Settings
          </Link>
          <button type="button" onClick={logout} className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-left text-sm text-red-700 transition-colors hover:bg-red-50">
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </Popover>
  );
}
