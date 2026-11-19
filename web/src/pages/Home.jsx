import { Link } from 'react-router-dom';
import { Container } from '../components/layout/Layout.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { EmptyState, ErrorState } from '../components/ui/States.jsx';
import { ProductCard, ProductCardSkeleton, ProductGrid } from '../components/shop/ProductCard.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { storeApi } from '../services/storeApi.js';
import { CATEGORY_BLURBS } from '../utils/constants.js';

/** Decorative illustration of three pots (not a product photo). */
function HeroArt() {
  return (
    <svg viewBox="0 0 520 460" className="mx-auto w-full max-w-lg" role="img" aria-label="Illustration of three terracotta pots">
      <defs>
        <linearGradient id="h1" x1="0" x2="1"><stop offset="0" stopColor="#8a4026" /><stop offset=".4" stopColor="#c2623d" /><stop offset="1" stopColor="#8a4026" /></linearGradient>
        <linearGradient id="h2" x1="0" x2="1"><stop offset="0" stopColor="#6d3520" /><stop offset=".4" stopColor="#a8502f" /><stop offset="1" stopColor="#6d3520" /></linearGradient>
        <linearGradient id="h3" x1="0" x2="1"><stop offset="0" stopColor="#9a5a38" /><stop offset=".4" stopColor="#cf8a5c" /><stop offset="1" stopColor="#9a5a38" /></linearGradient>
      </defs>
      <circle cx="260" cy="230" r="210" fill="#f5e0d5" />
      <circle cx="260" cy="230" r="160" fill="#ecc4b0" opacity=".5" />
      <ellipse cx="260" cy="410" rx="220" ry="20" fill="#4a3426" opacity=".14" />
      <path d="M232 70h56v38c0 28 70 46 70 118 0 74-44 118-90 118s-90-44-90-118c0-72 54-90 54-118z" fill="url(#h1)" />
      <ellipse cx="260" cy="70" rx="30" ry="7" fill="#6d3520" />
      <path d="M176 270c50 18 118 18 168 0" stroke="#f5e0d5" strokeOpacity=".6" strokeWidth="6" fill="none" />
      <path d="M72 300h96c10 26 14 52 4 78-6 16-26 32-52 32s-46-16-52-32c-10-26-6-52 4-78z" fill="url(#h2)" />
      <ellipse cx="120" cy="300" rx="48" ry="9" fill="#5c2f20" />
      <path d="M356 270h100c8 22 12 44 4 66-6 16-22 28-54 28s-48-12-54-28c-8-22-4-44 4-66z" fill="url(#h3)" />
      <ellipse cx="406" cy="270" rx="50" ry="9" fill="#7a4a2e" />
      <path d="M380 322c20 8 46 8 66 0" stroke="#fdf8f0" strokeOpacity=".55" strokeWidth="4" fill="none" />
    </svg>
  );
}

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta-600">{eyebrow}</p>}
        <h2 className="mt-1 text-3xl text-clay-brown sm:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const ViewAll = ({ to, children = 'View all' }) => (
  <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-medium text-terracotta-700 hover:text-terracotta-600">
    {children} <Icon name="arrow" className="h-4 w-4" />
  </Link>
);

function FeaturedProducts() {
  // Prefer pieces an admin marked as featured; if none are, honestly show the newest arrivals instead.
  const state = useAsync(async (signal) => {
    const featured = await storeApi.products({ featured: 'true', limit: 4 }, signal);
    if (featured.items.length > 0) return { items: featured.items, featured: true };
    const newest = await storeApi.products({ limit: 4 }, signal);
    return { items: newest.items, featured: false };
  }, []);
  const { data, error, loading, reload } = state;
  return (
    <section className="py-16" aria-labelledby="featured-heading">
      <Container>
        <SectionHeading eyebrow={data?.featured === false ? 'Just arrived' : 'Handpicked'} title={data?.featured === false ? 'New arrivals' : 'Featured pottery'} action={<ViewAll to="/shop">Shop all pottery</ViewAll>} />
        <span id="featured-heading" className="sr-only">Featured pottery</span>
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <ProductGrid>{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
        ) : data.items.length === 0 ? (
          <EmptyState icon="box" title="New pieces are on their way" description="Potters are preparing their first listings. Please check back soon." />
        ) : (
          <ProductGrid>{data.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</ProductGrid>
        )}
      </Container>
    </section>
  );
}

function PopularCategories() {
  const { data, error, loading, reload } = useAsync((signal) => storeApi.categories(signal), []);
  const shown = (data ?? []).filter((c) => c.count > 0);
  return (
    <section className="bg-beige/50 py-16">
      <Container>
        <SectionHeading eyebrow="Browse" title="Popular categories" />
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} compact />
        ) : loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-sand/50" />)}</div>
        ) : shown.length === 0 ? (
          <p className="text-clay-soft">Categories appear here as soon as pieces are listed.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c, i) => (
              <li key={c.name} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <Link to={`/shop?category=${encodeURIComponent(c.name)}`} className="group flex h-full items-center justify-between gap-4 rounded-3xl border border-sand bg-cream p-6 transition duration-300 hover:-translate-y-0.5 hover:border-terracotta-200 hover:shadow-lg">
                  <div>
                    <h3 className="text-2xl text-clay-brown group-hover:text-terracotta-700">{c.name}</h3>
                    <p className="mt-1 text-sm text-clay-soft">{CATEGORY_BLURBS[c.name]}</p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-wider text-terracotta-600">{c.count} {c.count === 1 ? 'piece' : 'pieces'}</p>
                  </div>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-terracotta-50 text-terracotta-600 transition group-hover:bg-terracotta-600 group-hover:text-white"><Icon name="arrow" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}

function FeaturedPotters() {
  const { data, error, loading, reload } = useAsync((signal) => storeApi.featuredPotters(signal), []);
  if (!loading && !error && (data ?? []).length === 0) return null; // nothing real to show: no empty section
  return (
    <section className="py-16">
      <Container>
        <SectionHeading eyebrow="The makers" title="Meet our potters" />
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} compact />
        ) : loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-sand/50" />)}</div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((p, i) => (
              <li key={p.id} className="animate-fade-up rounded-3xl border border-sand bg-white/70 p-6" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-terracotta-100 font-display text-2xl text-terracotta-700">{p.name[0]}</span>
                  <div>
                    <h3 className="text-xl text-clay-brown">{p.name}</h3>
                    <p className="flex items-center gap-1 text-sm text-clay-soft"><Icon name="pin" className="h-4 w-4" />{p.village}, {p.district}</p>
                  </div>
                </div>
                {p.bio && <p className="mt-4 text-sm leading-relaxed text-clay-soft">{p.bio}</p>}
                <Link to={`/shop?potter=${p.id}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-terracotta-700 hover:text-terracotta-600">
                  See {p.productCount} {p.productCount === 1 ? 'piece' : 'pieces'} <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}

const STEPS = [
  ['Choose your pieces', 'Browse the shop and add what you like. Nothing is charged online.'],
  ['Send an order request', 'Tell us who you are and where to deliver. We pass your request to the potter.'],
  ['The potter calls you', 'You agree the final price directly with the person who made the piece.'],
  ['Delivery', 'Once the order is confirmed the piece is prepared and sent to you. You can follow every step.'],
];

export function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <Container className="grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
          <div className="animate-fade-up">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-terracotta-600">Handmade in Bangladesh</p>
            <h1 className="mt-4 text-5xl leading-[1.05] text-clay-brown sm:text-6xl">Pottery shaped by hand, straight from the village.</h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-clay-soft">
              Discover terracotta vases, water pots, cookware and garden pieces made by traditional potters. Order from home and talk to the maker yourself.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/shop" size="lg">Shop the collection <Icon name="arrow" className="h-5 w-5" /></ButtonLink>
              <ButtonLink to="/#how-it-works" size="lg" variant="secondary">How ordering works</ButtonLink>
            </div>
          </div>
          <div className="animate-fade-in"><HeroArt /></div>
        </Container>
      </section>

      <FeaturedProducts />
      <PopularCategories />
      <FeaturedPotters />

      <section id="craft" className="bg-clay-brown py-20 text-cream">
        <Container className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-terracotta-200">Our craft</p>
            <h2 className="mt-3 text-4xl sm:text-5xl">A tradition made one piece at a time</h2>
          </div>
          <div className="space-y-4 text-lg leading-relaxed text-sand">
            <p>Pottery has been part of village life in Bangladesh for generations. Clay is dug from the riverbank, shaped on the wheel or by hand, dried in the sun and fired in a kiln.</p>
            <p>Mati is designed for potters who do not spend their day on phones or computers: a simple one-button device in the workshop is how a finished piece reaches this shop, where an admin reviews it before it is listed.</p>
          </div>
        </Container>
      </section>

      <section className="py-20" aria-labelledby="why-heading">
        <Container>
          <SectionHeading eyebrow="Why handmade" title="Why choose handmade pottery" />
          <span id="why-heading" className="sr-only">Why choose handmade pottery</span>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['hand', 'One of a kind', 'Every piece is shaped by hand, so no two are exactly alike.'],
              ['leaf', 'Natural material', 'Made from clay and fire, without plastic or synthetic coatings.'],
              ['flame', 'Made to be used', 'Traditional forms for cooking, storing water and serving at the table.'],
              ['heart', 'Supports the maker', 'You deal with the potter directly, so your purchase reaches the person who made it.'],
            ].map(([icon, title, text], i) => (
              <li key={title} className="animate-fade-up rounded-3xl border border-sand bg-white/60 p-6" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-terracotta-50 text-terracotta-600"><Icon name={icon} className="h-6 w-6" /></span>
                <h3 className="mt-4 text-xl text-clay-brown">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-clay-soft">{text}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section id="how-it-works" className="bg-beige/60 py-20">
        <Container>
          <SectionHeading eyebrow="Simple and personal" title="How ordering works" />
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="relative rounded-3xl bg-cream p-6 shadow-sm ring-1 ring-sand/70">
                <span className="font-display text-5xl text-terracotta-200">{i + 1}</span>
                <h3 className="mt-2 text-xl text-clay-brown">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-clay-soft">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 flex items-start gap-2 text-sm text-clay-soft"><Icon name="phone" className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />Orders are requests, not purchases: the potter is never assumed to have accepted until you hear from them.</p>
        </Container>
      </section>
    </>
  );
}
