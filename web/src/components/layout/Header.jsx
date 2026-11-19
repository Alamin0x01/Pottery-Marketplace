import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from './Brand.jsx';
import { Icon } from '../ui/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';

const NAV = [
  { to: '/shop', label: 'Shop' },
  { to: '/#craft', label: 'Our craft', hash: true },
  { to: '/#how-it-works', label: 'How ordering works', hash: true },
];

const linkClass = ({ isActive }) => `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-beige text-terracotta-700' : 'text-clay-brown hover:bg-beige/70'}`;

function UserMenu() {
  const { status, user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (status === 'loading') return <span className="h-9 w-9 animate-pulse rounded-full bg-sand/60" aria-hidden="true" />;
  if (status === 'signed-out') {
    return (
      <Link to="/login" className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-clay-brown transition hover:bg-beige/70">
        <Icon name="user" className="h-5 w-5" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }
  const name = profile?.name ?? user.email ?? 'Account';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-beige/70">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-terracotta-600 text-sm font-semibold text-white">{name.trim()[0]?.toUpperCase() ?? '?'}</span>
        <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">{name.split(' ')[0]}</span>
        <Icon name="chevron" className="hidden h-4 w-4 sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 animate-fade-in overflow-hidden rounded-2xl border border-sand bg-white shadow-xl">
          <div className="border-b border-sand/70 px-4 py-3">
            <p className="truncate text-sm font-medium">{profile?.name ?? 'Your account'}</p>
            <p className="truncate text-xs text-clay-soft">{user.email}</p>
          </div>
          {[['/account', 'My profile'], ['/account/orders', 'My orders']].map(([to, label]) => (
            <Link key={to} role="menuitem" to={to} onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-cream">{label}</Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/');
            }}
            className="flex w-full items-center gap-2 border-t border-sand/70 px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
          >
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  return (
    <header className="sticky top-0 z-40 border-b border-sand/60 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" aria-label="Mati — home" className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"><Brand /></Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => item.hash ? <Link key={item.to} to={item.to} className="rounded-full px-3 py-1.5 text-sm font-medium text-clay-brown transition hover:bg-beige/70">{item.label}</Link> : <NavLink key={item.to} to={item.to} className={linkClass}>{item.label}</NavLink>)}
        </nav>

        <div className="flex items-center gap-1">
          <Link to="/shop" aria-label="Search products" className="rounded-full p-2 transition hover:bg-beige/70 md:hidden"><Icon name="search" /></Link>
          <Link to="/cart" aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`} className="relative rounded-full p-2 transition hover:bg-beige/70">
            <Icon name="bag" className="h-6 w-6" />
            {count > 0 && <span key={count} className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 animate-fade-in place-items-center rounded-full bg-terracotta-600 px-1 text-[11px] font-semibold text-white">{count}</span>}
          </Link>
          <UserMenu />
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} className="rounded-full p-2 transition hover:bg-beige/70 md:hidden">
            <Icon name={open ? 'close' : 'menu'} />
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="animate-fade-in border-t border-sand/60 bg-cream px-4 py-3 md:hidden">
          {NAV.map((item) => <Link key={item.to} to={item.to} className="block rounded-xl px-3 py-3 text-base font-medium hover:bg-beige/60">{item.label}</Link>)}
        </nav>
      )}
    </header>
  );
}
