import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirebaseAuth, getFirebaseRuntime } from '../lib/firebase.js';
import { setSessionInvalidHandler } from '../api/client.js';
import { storeApi } from '../services/storeApi.js';
import { friendlyAuthError } from '../utils/authErrors.js';

/**
 * status:   loading (restoring a saved session) | signed-out | signed-in
 * profile:  the customer document from the backend, or null when the account has no profile yet
 * profileState: idle | loading | ready | error
 *
 * Being signed in with Firebase proves identity only. The backend verifies the ID token on every customer request and
 * decides what the user may see; nothing in the browser grants access. Customers carry no role, so they can never
 * reach admin functionality.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const auth = getFirebaseAuth();
  const [state, setState] = useState({ status: 'loading', user: null, profile: null, profileState: 'idle', notice: null });
  const ticket = useRef(0);

  const loadProfile = useCallback(async () => {
    const mine = ++ticket.current;
    setState((s) => ({ ...s, profileState: 'loading' }));
    try {
      const { customer } = await storeApi.me();
      if (mine === ticket.current) setState((s) => ({ ...s, profile: customer, profileState: 'ready' }));
    } catch {
      if (mine === ticket.current) setState((s) => ({ ...s, profileState: 'error' }));
    }
  }, []);

  const endSession = useCallback(
    async (notice = null) => {
      ticket.current += 1;
      setState({ status: 'signed-out', user: null, profile: null, profileState: 'idle', notice });
      await signOut(auth).catch(() => {});
    },
    [auth],
  );

  useEffect(() => {
    setSessionInvalidHandler(() => endSession('Your session has expired. Please sign in again.'));
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setState((s) => ({ ...s, status: 'signed-in', user: { uid: user.uid, email: user.email }, notice: null }));
        loadProfile();
      } else {
        ticket.current += 1;
        setState((s) => ({ status: 'signed-out', user: null, profile: null, profileState: 'idle', notice: s.notice }));
      }
    });
  }, [auth, loadProfile, endSession]);

  const login = useCallback(
    async (email, password) => {
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (err) {
        throw new Error(friendlyAuthError(err, getFirebaseRuntime(), 'login'));
      }
    },
    [auth],
  );

  const saveProfile = useCallback(async (values) => {
    const customer = await storeApi.saveProfile(values);
    ticket.current += 1; // discards any profile load that was still in flight when this save finished
    setState((s) => ({ ...s, profile: customer, profileState: 'ready' }));
    return customer;
  }, []);

  /** Creates the Firebase account, then the customer profile on the backend. */
  const register = useCallback(
    async ({ name, phone, email, password }) => {
      try {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } catch (err) {
        throw new Error(friendlyAuthError(err, getFirebaseRuntime(), 'register'));
      }
      // The account exists now. If saving the profile fails the user stays signed in and is asked to complete it.
      try {
        await saveProfile({ name, phone });
      } catch (err) {
        await loadProfile();
        throw err;
      }
    },
    [auth, saveProfile, loadProfile],
  );

  const setAddresses = useCallback((addresses) => setState((s) => (s.profile ? { ...s, profile: { ...s.profile, addresses } } : s)), []);
  const logout = useCallback(() => endSession(null), [endSession]);

  const value = useMemo(
    () => ({ ...state, login, register, saveProfile, setAddresses, logout, reloadProfile: loadProfile }),
    [state, login, register, saveProfile, setAddresses, logout, loadProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
