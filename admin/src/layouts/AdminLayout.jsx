import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { SearchBox } from './SearchBox.jsx';
import { NotificationsMenu } from './NotificationsMenu.jsx';
import { UserMenu } from './UserMenu.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { DashboardProvider } from '../context/DashboardContext.jsx';

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile drawer on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <DashboardProvider>
      <div className="flex min-h-screen">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 text-charcoal-soft hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 lg:hidden"
              aria-label="Open menu"
              aria-controls="admin-sidebar"
              aria-expanded={menuOpen}
            >
              <Icon name="menu" />
            </button>
            <SearchBox />
            <div className="ml-auto flex items-center gap-1">
              <NotificationsMenu />
              <UserMenu />
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </DashboardProvider>
  );
}
