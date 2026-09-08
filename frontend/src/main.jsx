import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { SettingsProvider } from './hooks/useSettings';
import { LanguageProvider } from './hooks/useLanguage';
import App from './App';
import './i18n';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <SettingsProvider>
              <App />
            </SettingsProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker with auto-update detection
if ('serviceWorker' in navigator) {
  // Unattended, always-on screens (kiosk kid-selection/dashboard, the
  // family wall display) have nobody around to click the "update
  // available" prompt -- left stuck on an old cached bundle indefinitely,
  // they'd keep running whatever bugs shipped before the last time someone
  // happened to walk by and tap it. These apply a new build immediately
  // (a brief auto-reload) instead of waiting for a click.
  const isUnattendedScreen = () => {
    const p = window.location.pathname;
    return p.startsWith('/kiosk') || p.startsWith('/familyzone');
  };

  const applyUpdate = (reg) => {
    if (isUnattendedScreen() && reg.waiting) {
      reg.waiting.postMessage('SKIP_WAITING');
    } else {
      window.dispatchEvent(new CustomEvent('sw:update-available', { detail: reg }));
    }
  };

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // If a new SW is already waiting (e.g. installed while tab was idle)
      if (reg.waiting) {
        applyUpdate(reg);
      }

      // Detect newly installed SW entering the waiting state
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            applyUpdate(reg);
          }
        });
      });

      // Check for updates every 30 minutes and on tab re-focus (debounced)
      let lastCheck = Date.now();
      const check = () => {
        const now = Date.now();
        if (now - lastCheck < 5 * 60_000) return; // at most once per 5 min
        lastCheck = now;
        reg.update().catch(() => {});
      };
      setInterval(check, 30 * 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    } catch { /* SW registration failed — non-critical */ }
  });

  // When a new SW takes control, reload to get fresh assets
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
