import { createContext, useCallback, useContext, useMemo } from 'react';
import { adminApi } from '../services/adminApi.js';
import { useAsync } from '../hooks/useAsync.js';
import { usePolling } from '../hooks/usePolling.js';

// One dashboard request shared by the Overview page and the notification bell (the backend also caches it).
const DashboardContext = createContext(null);
const REFRESH_MS = 60_000;

export function DashboardProvider({ children }) {
  const { data, error, loading, reload } = useAsync((signal) => adminApi.dashboard(signal), []);
  const refresh = useCallback(() => reload({ silent: true }), [reload]);
  usePolling(refresh, REFRESH_MS);

  const value = useMemo(() => ({ summary: data, error, loading, refresh, reloadWithSpinner: reload }), [data, error, loading, refresh, reload]);
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return ctx;
}
