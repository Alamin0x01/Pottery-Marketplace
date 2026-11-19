import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { CartProvider } from '../context/CartContext.jsx';
import { getFirebaseAuth } from '../lib/firebase.js';
import { Layout } from '../components/layout/Layout.jsx';
import { RedirectIfSignedIn, RequireAuth } from '../features/auth/guards.jsx';
import { HomePage } from '../pages/Home.jsx';
import { ShopPage } from '../pages/Shop.jsx';
import { ProductDetailsPage } from '../pages/ProductDetails.jsx';
import { CartPage } from '../pages/Cart.jsx';
import { CheckoutPage } from '../pages/Checkout.jsx';
import { OrderPlacedPage } from '../pages/OrderPlaced.jsx';
import { TrackOrderPage } from '../pages/Track.jsx';
import { LoginPage, RegisterPage } from '../pages/Auth.jsx';
import { AccountLayout, ProfilePage } from '../pages/account/Profile.jsx';
import { OrderDetailPage, OrdersPage } from '../pages/account/Orders.jsx';
import { NotFound } from '../pages/NotFound.jsx';

function ConfigError({ message }) {
  return (
    <div className="grid min-h-screen place-items-center bg-cream p-6">
      <div role="alert" className="max-w-lg rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl text-clay-brown">The shop is not configured</h1>
        <p className="mt-2 text-sm text-clay-soft">{message}</p>
      </div>
    </div>
  );
}

export function App() {
  // Fail with a readable message (not a blank page) when the Firebase web settings are missing.
  try {
    getFirebaseAuth();
  } catch (err) {
    return <ConfigError message={err.message} />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="shop" element={<ShopPage />} />
              <Route path="shop/:id" element={<ProductDetailsPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="order-placed" element={<OrderPlacedPage />} />
              <Route path="track/:id" element={<TrackOrderPage />} />
              <Route path="login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
              <Route path="register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
              <Route element={<RequireAuth />}>
                <Route path="account" element={<AccountLayout />}>
                  <Route index element={<ProfilePage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="orders/:id" element={<OrderDetailPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
