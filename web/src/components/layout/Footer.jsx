import { Link } from 'react-router-dom';
import { Brand } from './Brand.jsx';

export function Footer() {
  return (
    <footer className="mt-24 bg-clay-brown text-sand">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Brand light />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-sand/80">
            Mati brings handmade pottery from village potters in Bangladesh to your home. Every piece is shaped by hand, and you speak to the potter directly.
          </p>
        </div>
        <div>
          <h2 className="font-display text-lg text-cream">Shop</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/shop">All pottery</Link></li>
            <li><Link className="hover:text-white" to="/shop?category=Kitchenware">Kitchenware</Link></li>
            <li><Link className="hover:text-white" to="/shop?category=Home%20Decoration">Home decoration</Link></li>
            <li><Link className="hover:text-white" to="/shop?category=Garden">Garden</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="font-display text-lg text-cream">Your account</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/account/orders">My orders</Link></li>
            <li><Link className="hover:text-white" to="/account">Profile and addresses</Link></li>
            <li><Link className="hover:text-white" to="/cart">Cart</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-sand/70 sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Mati. Handmade pottery from Bangladesh.</p>
          <p>Orders are requests: no online payment is taken. The potter contacts you to agree the price.</p>
        </div>
      </div>
    </footer>
  );
}
