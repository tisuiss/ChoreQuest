import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth, KIOSK_SESSION_KEY, KIOSK_PINNED_SESSION_KEY } from './useAuth';

const DEFAULT_IDLE_TIMEOUT_MINUTES = 3;
const DEFAULT_REDIRECT_PATH = '/kiosk';
const ACTIVITY_EVENTS = ['mousedown', 'touchstart', 'keydown'];

function isKioskSessionActive() {
  return sessionStorage.getItem(KIOSK_SESSION_KEY) === '1'
    && sessionStorage.getItem(KIOSK_PINNED_SESSION_KEY) !== '1';
}

/** Auto-logout back to the kiosk kid-selection screen (or the Family Zone
 *  screen, per the family's "idle_kiosk_redirect" setting) after inactivity.
 *  No-op unless the current session was started from the kiosk (/kiosk) or
 *  by picking a kid from the Family Zone screen (both flows set
 *  KIOSK_SESSION_KEY). Also no-op for "pinned" sessions (/kiosk/<username>,
 *  a device dedicated to one kid) — those are meant to stay open indefinitely.
 */
export function useIdleKioskLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState({
    timeoutMs: DEFAULT_IDLE_TIMEOUT_MINUTES * 60 * 1000,
    redirectTo: DEFAULT_REDIRECT_PATH,
  });

  // Fetch the family's idle-timeout preference once per kiosk session.
  // Public endpoint (works for a kid session with no parent ever logged in).
  useEffect(() => {
    if (!isKioskSessionActive()) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await api('/api/kiosk/settings');
        if (cancelled) return;
        const minutes = parseInt(settings?.idle_kiosk_timeout_minutes, 10);
        const redirectTo = settings?.idle_kiosk_redirect === 'familyzone' ? '/familyzone' : '/kiosk';
        setConfig({
          timeoutMs: (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_IDLE_TIMEOUT_MINUTES) * 60 * 1000,
          redirectTo,
        });
      } catch { /* keep defaults */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isKioskSessionActive()) return;

    let timer = null;

    const goToSelection = () => {
      logout().finally(() => navigate(config.redirectTo));
    };

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(goToSelection, config.timeoutMs);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer));

    return () => {
      if (timer) clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [logout, navigate, config]);
}
