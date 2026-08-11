import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Swords, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { api } from '../api/client';

export default function KioskDirect() {
  const { t } = useTranslation();
  const { username } = useParams();
  const { kioskLoginDirect } = useAuth();
  const { applyDefaultIfUnset } = useLanguage();
  const navigate = useNavigate();

  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api('/api/kiosk/settings');
        applyDefaultIfUnset(data?.default_language);
      } catch { /* non-critical — falls back to browser locale */ }
    })();
  }, [applyDefaultIfUnset]);

  useEffect(() => {
    (async () => {
      try {
        await kioskLoginDirect(username);
        navigate('/', { replace: true });
      } catch (err) {
        setError(err.message || t('kiosk.directLoginError'));
      }
    })();
  }, [username, kioskLoginDirect, navigate, t]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-navy">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
            <Swords size={16} className="text-navy" />
          </div>
          <h1 className="text-cream text-lg font-semibold">{t('common.appName')}</h1>
        </div>

        {error ? (
          <div className="game-panel p-6 space-y-3">
            <XCircle size={32} className="mx-auto text-crimson" />
            <p className="text-crimson text-sm">{error}</p>
            <Link to="/kiosk" className="text-accent hover:text-accent-light text-sm font-medium transition-colors">
              {t('kiosk.backToPicker')}
            </Link>
          </div>
        ) : (
          <Loader2 size={24} className="mx-auto text-accent animate-spin" />
        )}
      </div>
    </div>
  );
}
