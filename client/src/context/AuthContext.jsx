import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth, setUnauthorizedHandler, tokenStore } from '../services/api.js';
import { disconnectSocket, subscribe } from '../services/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { role, profile }
  const [booting, setBooting] = useState(true);

  const signOut = useCallback(async ({ notifyServer = true } = {}) => {
    if (notifyServer && tokenStore.get()) {
      await auth.logout().catch(() => {});
    }
    tokenStore.clear();
    disconnectSocket();
    setSession(null);
  }, []);

  // A 401 from anywhere means the token is dead — drop the session rather than
  // leaving the UI in a half-authenticated state.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      disconnectSocket();
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Restore a session on boot so a phone refresh does not log you out mid-demo.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokenStore.get()) {
        setBooting(false);
        return;
      }
      try {
        const res = await auth.me();
        if (cancelled) return;
        setSession({ role: res.role, profile: res.profile });
        subscribe(res.role, res.profile?.id);
      } catch {
        if (!cancelled) tokenStore.clear();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((result) => {
    tokenStore.set(result.token, result.role);
    setSession({ role: result.role, profile: result.profile });
    subscribe(result.role, result.profile?.id);
    return result;
  }, []);

  /** Merge fresh profile fields (e.g. a new balance) without a refetch. */
  const patchProfile = useCallback((patch) => {
    setSession((current) => (current ? { ...current, profile: { ...current.profile, ...patch } } : current));
  }, []);

  const value = useMemo(
    () => ({
      session,
      role: session?.role ?? null,
      profile: session?.profile ?? null,
      booting,
      signIn,
      signOut,
      patchProfile,
    }),
    [session, booting, signIn, signOut, patchProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
