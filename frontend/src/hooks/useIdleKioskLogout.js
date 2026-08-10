import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, KIOSK_SESSION_KEY } from './useAuth';

const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'touchstart', 'keydown'];

/** Auto-logout back to the kiosk kid-selection screen after inactivity.
 *  No-op unless the current session was started from the kiosk (/kiosk). */
export function useIdleKioskLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionStorage.getItem(KIOSK_SESSION_KEY) !== '1') return;

    let timer = null;

    const goToSelection = () => {
      logout().finally(() => navigate('/kiosk'));
    };

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(goToSelection, IDLE_TIMEOUT_MS);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer));

    return () => {
      if (timer) clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [logout, navigate]);
}
