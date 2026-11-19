import { NavLink } from 'react-router-dom';
import { Icon } from '../components/ui/Icon.jsx';
import { NAV_ITEMS } from '../utils/constants.js';
import { useAuth } from '../context/AuthContext.jsx';

const linkClass = ({ isActive }) =>
  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 ${
    isActive ? 'bg-terracotta-50 text-terracotta-700' : 'text-charcoal-soft hover:bg-stone-100 hover:text-charcoal'
  }`;

/** Fixed on large screens, a slide-in drawer on small ones (`open` / `onClose` are controlled by the layout). */
export function Sidebar({ open, onClose }) {
  const { logout } = useAuth();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-charcoal/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Sidebar"
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-terracotta-500 text-sm font-bold text-white">M</span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-charcoal">Mati Admin</p>
              <p className="text-xs text-charcoal-soft">Pottery marketplace</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-charcoal-soft hover:bg-stone-100 lg:hidden" aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={onClose}>
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-charcoal-soft transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
          >
            <Icon name="logout" className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
