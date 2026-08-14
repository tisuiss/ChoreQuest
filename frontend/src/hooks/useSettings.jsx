import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const SettingsContext = createContext({
  leaderboard_enabled: true,
  chore_trading_enabled: true,
  achievements_enabled: true,
  chore_window_enforcement: 'indicative',
  keep_validated_visible: true,
});

export function SettingsProvider({ children }) {
  const [features, setFeatures] = useState({
    leaderboard_enabled: true,
    chore_trading_enabled: true,
    achievements_enabled: true,
    chore_window_enforcement: 'indicative',
    keep_validated_visible: true,
  });

  const fetchFeatures = useCallback(async () => {
    try {
      const data = await api('/api/admin/settings/features');
      setFeatures({
        leaderboard_enabled: data.leaderboard_enabled !== 'false',
        chore_trading_enabled: data.chore_trading_enabled !== 'false',
        achievements_enabled: data.achievements_enabled !== 'false',
        chore_window_enforcement: data.chore_window_enforcement === 'strict' ? 'strict' : 'indicative',
        keep_validated_visible: data.keep_validated_visible !== 'false',
      });
    } catch {
      // If fetch fails, keep defaults (all enabled)
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  // Re-fetch when settings are saved (listen for custom event)
  useEffect(() => {
    const handler = () => fetchFeatures();
    window.addEventListener('settings:updated', handler);
    return () => window.removeEventListener('settings:updated', handler);
  }, [fetchFeatures]);

  return (
    <SettingsContext.Provider value={features}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
