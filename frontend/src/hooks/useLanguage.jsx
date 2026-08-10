import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import i18n, { LANGUAGE_STORAGE_KEY } from '../i18n';
import { api } from '../api/client';

const LanguageContext = createContext(null);

export const SUPPORTED_LANGUAGES = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(i18n.language?.split('-')[0] || 'fr');

  // Keep in sync if i18n.changeLanguage() is called from anywhere else
  useEffect(() => {
    const handler = (lng) => setLanguageState(lng.split('-')[0]);
    i18n.on('languageChanged', handler);
    return () => i18n.off('languageChanged', handler);
  }, []);

  const setLanguage = useCallback(async (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    try {
      await api('/api/auth/me', { method: 'PUT', body: { language: lang } });
    } catch {
      // Non-critical — localStorage already has the value
    }
  }, []);

  // Apply a user's stored preference on login (mirrors useTheme's syncFromUser)
  const syncFromUser = useCallback((user) => {
    if (user?.language && user.language !== i18n.language?.split('-')[0]) {
      i18n.changeLanguage(user.language);
      localStorage.setItem(LANGUAGE_STORAGE_KEY, user.language);
    }
  }, []);

  // Kiosk-only: apply the family default, but never override an already-cached choice
  const applyDefaultIfUnset = useCallback((lang) => {
    if (!localStorage.getItem(LANGUAGE_STORAGE_KEY) && lang) {
      i18n.changeLanguage(lang);
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, syncFromUser, applyDefaultIfUnset }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be within LanguageProvider');
  return ctx;
}
