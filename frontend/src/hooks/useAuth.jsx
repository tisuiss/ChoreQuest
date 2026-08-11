import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, setAccessToken, clearAccessToken, getAccessToken } from '../api/client';

export const KIOSK_SESSION_KEY = 'chorequest_kiosk_session';
export const KIOSK_PINNED_SESSION_KEY = 'chorequest_kiosk_pinned_session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshPromiseRef = useRef(null);

  const refreshSession = useCallback(async () => {
    // Deduplicate concurrent refresh calls (React StrictMode double-fires)
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    refreshPromiseRef.current = (async () => {
      try {
        // If we have a stored token (from localStorage), try using it
        // directly via /me.  The api() 401-retry will automatically
        // attempt a cookie-based refresh if the token has expired.
        if (getAccessToken()) {
          const userData = await api('/api/auth/me');
          setUser(userData);
          return true;
        }

        // No stored token — try cookie-based refresh
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('No session');
        const data = await res.json();
        setAccessToken(data.access_token);
        setUser(data.user);
        return true;
      } catch {
        clearAccessToken();
        setUser(null);
        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, []);

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));

    const handleExpired = () => {
      clearAccessToken();
      setUser(null);
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [refreshSession]);

  const login = async (username, password) => {
    const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const pinLogin = async (username, pin) => {
    const data = await api('/api/auth/pin-login', { method: 'POST', body: { username, pin } });
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const kioskLogin = async (kidId, pin) => {
    // Uses a direct fetch (not the shared api() helper): there is no prior
    // session to refresh at this point, so api()'s 401-triggers-refresh
    // retry would just mask a wrong-PIN error behind a misleading
    // "Session expired" message.
    const res = await fetch('/api/kiosk/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kid_id: kidId, pin }),
    });
    if (!res.ok) {
      let detail = 'Could not select this kid';
      try {
        const data = await res.json();
        detail = data.detail || detail;
      } catch { /* ignore */ }
      throw new Error(detail);
    }
    const data = await res.json();
    setAccessToken(data.access_token);
    setUser(data.user);
    sessionStorage.setItem(KIOSK_SESSION_KEY, '1');
    return data.user;
  };

  const kioskLoginDirect = async (username) => {
    // Same rationale as kioskLogin for using a raw fetch instead of api().
    const res = await fetch(`/api/kiosk/login-direct/${encodeURIComponent(username)}`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      let detail = 'Could not open this kid\'s kiosk';
      try {
        const data = await res.json();
        detail = data.detail || detail;
      } catch { /* ignore */ }
      throw new Error(detail);
    }
    const data = await res.json();
    setAccessToken(data.access_token);
    setUser(data.user);
    sessionStorage.setItem(KIOSK_SESSION_KEY, '1');
    sessionStorage.setItem(KIOSK_PINNED_SESSION_KEY, '1');
    return data.user;
  };

  const register = async (username, password, display_name, role, invite_code) => {
    const body = { username, password, display_name, role };
    if (invite_code) body.invite_code = invite_code;
    const data = await api('/api/auth/register', { method: 'POST', body });
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    clearAccessToken();
    setUser(null);
    sessionStorage.removeItem(KIOSK_SESSION_KEY);
    sessionStorage.removeItem(KIOSK_PINNED_SESSION_KEY);
  };

  const updateUser = (updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, pinLogin, kioskLogin, kioskLoginDirect, register, logout, updateUser, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
