import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <section className="mx-auto max-w-md rounded-xl border border-line bg-white px-6 py-12 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-charcoal">Page not found</h1>
      <p className="mt-1 text-sm text-charcoal-soft">The page you are looking for does not exist.</p>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-terracotta-600 hover:text-terracotta-700">
        Back to overview
      </Link>
    </section>
  );
}
