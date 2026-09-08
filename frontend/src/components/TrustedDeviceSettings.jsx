import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Loader2, Copy, Check, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

export default function TrustedDeviceSettings({ paired }) {
  const { t } = useTranslation();
  const [generating, setGenerating] = useState(false);
  const [pairingUrl, setPairingUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setGenerating(true);
    setError('');
    setCopied(false);
    try {
      const data = await api('/api/admin/kiosk-device-token/regenerate', { method: 'POST' });
      setPairingUrl(`${window.location.origin}/pair?token=${data.token}`);
    } catch (err) {
      setError(err.message || t('trustedDevice.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pairingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — link is still shown/selectable */ }
  };

  return (
    <div className="game-panel p-4">
      <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
        <ShieldCheck size={16} className="text-muted" />
        {t('trustedDevice.title')}
      </h2>
      <p className="text-muted text-xs mb-3">
        {t('trustedDevice.hint')}
      </p>

      {!pairingUrl && (
        <p className="text-xs mb-3">
          <span className={paired ? 'text-emerald' : 'text-muted'}>
            {paired ? t('trustedDevice.statusPaired') : t('trustedDevice.statusNotPaired')}
          </span>
        </p>
      )}

      {error && (
        <div className="mb-3 p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {error}
        </div>
      )}

      {pairingUrl && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2 p-2.5 rounded-md border border-border bg-navy/60">
            <code className="text-cream text-xs truncate flex-1">{pairingUrl}</code>
            <button
              onClick={copyLink}
              className="text-muted hover:text-cream transition-colors flex-shrink-0"
              aria-label={t('trustedDevice.copy')}
              title={t('trustedDevice.copy')}
            >
              {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-muted text-xs">
            {t('trustedDevice.openOnce')}
          </p>
        </div>
      )}

      <button
        onClick={generate}
        disabled={generating}
        className="game-btn game-btn-blue inline-flex items-center gap-2"
      >
        {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {generating
          ? t('common.saving')
          : paired || pairingUrl
            ? t('trustedDevice.regenerate')
            : t('trustedDevice.generate')}
      </button>
      {(paired || pairingUrl) && (
        <p className="text-muted text-xs mt-2">
          {t('trustedDevice.regenerateWarning')}
        </p>
      )}
    </div>
  );
}
