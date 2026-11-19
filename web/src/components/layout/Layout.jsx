import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header.jsx';
import { Footer } from './Footer.jsx';

/** Scrolls to the top on navigation (or to the `#section` of the new URL) like a normal website. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <ScrollManager />
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export function Container({ children, className = '' }) {
  return <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function PageTitle({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-8 pt-10">
      <div>
        <h1 className="text-3xl text-clay-brown sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-clay-soft">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
