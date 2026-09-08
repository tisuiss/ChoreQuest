import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, XCircle, CheckCircle2 } from 'lucide-react';
import { api, setDeviceToken } from '../api/client';
import AppLogo from '../components/AppLogo';

export default function PairDevice() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('checking'); // checking | success | invalid

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    (async () => {
      try {
        const data = await api(`/api/kiosk/pair-check?token=${encodeURIComponent(token)}`);
        if (data?.valid) {
          setDeviceToken(token);
          setStatus('success');
        } else {
          setStatus('invalid');
        }
      } catch {
        setStatus('invalid');
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-navy">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <AppLogo size={32} />
          <h1 className="text-cream text-lg font-semibold">{t('common.appName')}</h1>
        </div>

        {status === 'checking' && (
          <Loader2 size={24} className="mx-auto text-accent animate-spin" />
        )}

        {status === 'invalid' && (
          <div className="game-panel p-6 space-y-3">
            <XCircle size={32} className="mx-auto text-crimson" />
            <p className="text-crimson text-sm">{t('pairDevice.invalid')}</p>
            <p className="text-muted text-xs">{t('pairDevice.invalidHint')}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="game-panel p-6 space-y-4">
            <CheckCircle2 size={32} className="mx-auto text-emerald" />
            <div>
              <p className="text-cream text-sm font-medium">{t('pairDevice.success')}</p>
              <p className="text-muted text-xs mt-1">{t('pairDevice.successHint')}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Link to="/familyzone" className="game-btn game-btn-blue">
                {t('pairDevice.goToFamilyZone')}
              </Link>
              <Link to="/kiosk" className="game-btn game-btn-gold">
                {t('pairDevice.goToKiosk')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
