import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { getFirebaseAuth } from '../lib/firebase.js';
import { AdminLayout } from '../layouts/AdminLayout.jsx';
import { RequireAuth, RequireRole } from '../features/auth/guards.jsx';
import { LoginPage } from '../pages/Login.jsx';
import { OverviewPage } from '../pages/Overview.jsx';
import { SettingsPage } from '../pages/Settings.jsx';
import { PottersListPage } from '../pages/potters/PottersList.jsx';
import { PotterEditPage, PotterNewPage } from '../pages/potters/PotterForm.jsx';
import { PotterProfilePage } from '../pages/potters/PotterProfile.jsx';
import { DevicesListPage } from '../pages/devices/DevicesList.jsx';
import { DeviceNewPage } from '../pages/devices/DeviceNew.jsx';
import { DeviceDetailsPage } from '../pages/devices/DeviceDetails.jsx';
import { ComingSoonPage } from '../pages/ComingSoon.jsx';
import { NotFound } from '../pages/NotFound.jsx';
import { NAV_ITEMS } from '../utils/constants.js';

const COMING_SOON = NAV_ITEMS.filter((i) => i.phase);

function ConfigError({ message }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div role="alert" className="max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-charcoal">The admin app is not configured</h1>
        <p className="mt-2 text-sm text-charcoal-soft">{message}</p>
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
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AdminLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="/potters" element={<PottersListPage />} />
              <Route path="/potters/new" element={<PotterNewPage />} />
              <Route path="/potters/:id" element={<PotterProfilePage />} />
              <Route path="/potters/:id/edit" element={<PotterEditPage />} />
              <Route path="/devices" element={<DevicesListPage />} />
              <Route path="/devices/new" element={<DeviceNewPage />} />
              <Route path="/devices/:id" element={<DeviceDetailsPage />} />
              {COMING_SOON.map((item) => (
                <Route key={item.to} path={item.to} element={<ComingSoonPage />} />
              ))}
              <Route path="/settings" element={<RequireRole roles={['admin', 'superadmin']}><SettingsPage /></RequireRole>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
          <Route path="/signin" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
