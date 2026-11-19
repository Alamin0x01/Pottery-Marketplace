import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirebaseAuth, getFirebaseRuntime } from '../lib/firebase.js';
import { setSessionInvalidHandler } from '../api/client.js';
import { adminApi } from '../services/adminApi.js';
import { friendlyAuthError } from '../utils/authErrors.js';

/**
 * status:
 *   loading      Firebase is restoring a persisted session
 *   signed-out   nobody signed in (`error` may explain why we were signed out)
 *   verifying    signed in with Firebase; asking the backend whether this account is an admin
 *   authorized   backend confirmed an admin role; `admin` = { uid, email, role, name }
 *   unavailable  could not reach the backend to verify (retry possible)
 *
 * Being signed in with Firebase proves identity only. Admin access exists solely when the backend,
 * after verifying the ID token, says so — never because of anything held in the browser.
 */
const AuthContext = createContext(null);

const MESSAGES = {
  'not-admin': 'This account does not have administrator access.',
  'session-expired': 'Your session has expired. Please sign in again.',
};

export function AuthProvider({ children }) {
  const auth = getFirebaseAuth();
  const [state, setState] = useState({ status: 'loading', admin: null, error: null });
  const verifyTicket = useRef(0);

  const endSession = useCallback(
    async (code) => {
      verifyTicket.current += 1;
      setState({ status: 'signed-out', admin: null, error: code ? { code, message: MESSAGES[code] } : null });
      await signOut(auth).catch(() => {});
    },
    [auth],
  );

  const verify = useCallback(async () => {
    const ticket = ++verifyTicket.current;
    setState((s) => ({ ...s, status: 'verifying', error: null }));
    try {
      const admin = await adminApi.me();
      if (ticket === verifyTicket.current) setState({ status: 'authorized', admin, error: null });
    } catch (err) {
      if (ticket !== verifyTicket.current) return;
      if (err.status === 403) await endSession('not-admin');
      else if (err.status === 401) await endSession('session-expired');
      else setState({ status: 'unavailable', admin: null, error: { code: 'unavailable', message: err.message } });
    }
  }, [endSession]);

  useEffect(() => {
    setSessionInvalidHandler(() => endSession('session-expired'));
    return onAuthStateChanged(auth, (user) => {
      if (user) verify();
      else {
        verifyTicket.current += 1;
        setState((s) => ({ status: 'signed-out', admin: null, error: s.error }));
      }
    });
  }, [auth, verify, endSession]);

  const signIn = useCallback(
    async (email, password) => {
      setState((s) => ({ ...s, error: null }));
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (err) {
        throw new Error(friendlyAuthError(err, getFirebaseRuntime()));
      }
      // onAuthStateChanged now runs verify(); the outcome arrives through `state`.
    },
    [auth],
  );

  const logout = useCallback(() => endSession(null), [endSession]);

  const value = useMemo(() => ({ ...state, signIn, logout, retry: verify }), [state, signIn, logout, verify]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
