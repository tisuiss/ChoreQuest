import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api/client';

// EcoleDirecte account for the "École" Family Zone tab. One parent login for
// the whole family; credentials are stored encrypted server-side and only
// used to mirror each child's school data. Handles the one-time security
// question (QCM) EcoleDirecte asks on first login.
export default function SchoolCredentialsSettings() {
  const { t } = useTranslation();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [qcm, setQcm] = useState(null); // { question, propositions: [{index, text}] }
  const [answering, setAnswering] = useState(false);
  const [busy, setBusy] = useState(''); // 'refresh' | 'disconnect'

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api('/api/ecole/credentials');
      setStatus(data);
      if (data.qcm_pending && data.qcm_question) {
        setQcm({ question: data.qcm_question, propositions: data.qcm_propositions || [] });
      } else {
        setQcm(null);
      }
      setError('');
    } catch (err) {
      setError(err.message || t('schoolCredentials.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const submit = async () => {
    if (!username.trim() || !password) return;
    setSaving(true);
    setError('');
    try {
      const res = await api('/api/ecole/credentials', {
        method: 'PUT',
        body: { username: username.trim(), password },
      });
      if (res.status === 'ok') {
        setPassword('');
        setQcm(null);
        await fetchStatus();
      } else if (res.status === 'qcm_required') {
        setQcm({ question: res.question, propositions: res.propositions || [] });
      } else if (res.status === 'totp_unsupported') {
        setError(res.message || t('schoolCredentials.totpUnsupported'));
      } else {
        setError(res.message || t('schoolCredentials.genericError'));
      }
    } catch (err) {
      setError(err.message || t('schoolCredentials.genericError'));
    } finally {
      setSaving(false);
    }
  };

  const answerQcm = async (index) => {
    setAnswering(true);
    setError('');
    try {
      const res = await api('/api/ecole/credentials/qcm', {
        method: 'POST',
        body: { proposition_index: index },
      });
      if (res.status === 'ok') {
        setQcm(null);
        setPassword('');
        await fetchStatus();
      } else {
        setError(res.message || t('schoolCredentials.qcmError'));
      }
    } catch (err) {
      setError(err.message || t('schoolCredentials.qcmError'));
    } finally {
      setAnswering(false);
    }
  };

  const refreshNow = async () => {
    setBusy('refresh');
    setError('');
    try {
      await api('/api/ecole/refresh', { method: 'POST' });
      await fetchStatus();
    } catch (err) {
      setError(err.message || t('schoolCredentials.genericError'));
    } finally {
      setBusy('');
    }
  };

  const disconnect = async () => {
    if (!window.confirm(t('schoolCredentials.disconnectConfirm'))) return;
    setBusy('disconnect');
    try {
      await api('/api/ecole/credentials', { method: 'DELETE' });
      setUsername('');
      setPassword('');
      setQcm(null);
      await fetchStatus();
    } catch (err) {
      setError(err.message || t('schoolCredentials.genericError'));
    } finally {
      setBusy('');
    }
  };

  const configured = status?.configured;
  const lastSync = status?.last_sync_at
    ? new Date(status.last_sync_at).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className="game-panel p-4">
      <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
        <GraduationCap size={16} className="text-muted" />
        {t('schoolCredentials.title')}
      </h2>
      <p className="text-muted text-xs mb-3">{t('schoolCredentials.hint')}</p>

      {error && (
        <div className="mb-3 p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="text-accent animate-spin" />
        </div>
      ) : qcm ? (
        <div className="space-y-2">
          <p className="text-cream text-xs font-medium">{t('schoolCredentials.qcmTitle')}</p>
          <p className="text-muted text-xs">{t('schoolCredentials.qcmHint')}</p>
          <p className="text-cream text-sm">{qcm.question}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {qcm.propositions.map((p) => (
              <button
                key={p.index}
                onClick={() => answerQcm(p.index)}
                disabled={answering}
                className="game-btn game-btn-blue !py-1.5 !px-3 !text-xs"
              >
                {answering ? <Loader2 size={12} className="animate-spin" /> : p.text}
              </button>
            ))}
          </div>
        </div>
      ) : configured ? (
        <div className="space-y-3">
          <div className="text-xs space-y-1">
            <p className="text-emerald">
              {t('schoolCredentials.configured', { username: status.username_masked || '?' })}
            </p>
            {status.children?.length > 0 && (
              <p className="text-muted">
                {t('schoolCredentials.children', { names: status.children.join(', ') })}
              </p>
            )}
            <p className="text-muted">
              {lastSync
                ? t('schoolCredentials.lastSync', { date: lastSync })
                : t('schoolCredentials.lastSyncNever')}
            </p>
            {status.last_error && (
              <p className="text-crimson">
                {t('schoolCredentials.lastError', { error: status.last_error })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshNow}
              disabled={busy === 'refresh'}
              className="game-btn game-btn-blue inline-flex items-center gap-2 !text-xs"
            >
              {busy === 'refresh' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {t('schoolCredentials.refreshNow')}
            </button>
            <button
              onClick={disconnect}
              disabled={busy === 'disconnect'}
              className="p-2 rounded-md text-muted hover:text-crimson hover:bg-crimson/10 transition-colors"
              title={t('schoolCredentials.disconnect')}
              aria-label={t('schoolCredentials.disconnect')}
            >
              {busy === 'disconnect' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('schoolCredentials.usernameLabel')}
            autoComplete="off"
            className="field-input !py-1.5 !text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('schoolCredentials.passwordLabel')}
            autoComplete="new-password"
            className="field-input !py-1.5 !text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <button
            onClick={submit}
            disabled={saving}
            className="game-btn game-btn-blue inline-flex items-center gap-2 !text-xs"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {t('schoolCredentials.save')}
          </button>
        </div>
      )}
    </div>
  );
}
