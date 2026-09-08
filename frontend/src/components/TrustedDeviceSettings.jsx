import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Loader2, Copy, Check, Plus, Trash2, Save } from 'lucide-react';
import { api } from '../api/client';

export default function TrustedDeviceSettings() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pairing, setPairing] = useState(null); // { name, url } -- shown once, right after creation
  const [copied, setCopied] = useState(false);

  const [draftNames, setDraftNames] = useState({}); // { [id]: string } -- in-progress rename edits
  const [savingId, setSavingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  const formatTimestamp = (ts) => {
    if (!ts) return null;
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const fetchDevices = useCallback(async () => {
    try {
      const data = await api('/api/admin/trusted-devices');
      setDevices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || t('trustedDevice.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const createDevice = async () => {
    setCreating(true);
    setError('');
    try {
      const data = await api('/api/admin/trusted-devices', {
        method: 'POST',
        body: { name: newName.trim() || t('trustedDevice.defaultName') },
      });
      setPairing({ name: data.name, url: `${window.location.origin}/pair?token=${data.token}` });
      setCopied(false);
      setNewName('');
      await fetchDevices();
    } catch (err) {
      setError(err.message || t('trustedDevice.generateError'));
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable -- link is still shown/selectable */ }
  };

  const renameDevice = async (id) => {
    const name = (draftNames[id] ?? '').trim();
    if (!name) return;
    setSavingId(id);
    try {
      await api(`/api/admin/trusted-devices/${id}`, { method: 'PUT', body: { name } });
      setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
      setDraftNames((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err) {
      setError(err.message || t('trustedDevice.renameError'));
    } finally {
      setSavingId(null);
    }
  };

  const removeDevice = async (id) => {
    setRemovingId(id);
    try {
      await api(`/api/admin/trusted-devices/${id}`, { method: 'DELETE' });
      setDevices((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err.message || t('trustedDevice.removeError'));
    } finally {
      setRemovingId(null);
    }
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

      {error && (
        <div className="mb-3 p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="text-accent animate-spin" />
        </div>
      ) : (
        <>
          {devices.length === 0 ? (
            <p className="text-muted text-xs mb-3">{t('trustedDevice.empty')}</p>
          ) : (
            <div className="space-y-2 mb-4">
              {devices.map((device) => {
                const draft = draftNames[device.id] ?? device.name;
                const dirty = draft.trim() !== device.name && draft.trim() !== '';
                const lastUsed = formatTimestamp(device.last_used_at);
                return (
                  <div key={device.id} className="flex items-center gap-2 p-2.5 rounded-md bg-surface-raised/30 border border-border">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraftNames((prev) => ({ ...prev, [device.id]: e.target.value }))}
                        className="field-input !py-1.5 !text-sm mb-1"
                        maxLength={100}
                      />
                      <p className="text-muted text-[11px]">
                        {lastUsed
                          ? t('trustedDevice.lastUsed', { date: lastUsed })
                          : t('trustedDevice.neverUsed')}
                      </p>
                    </div>
                    {dirty && (
                      <button
                        onClick={() => renameDevice(device.id)}
                        disabled={savingId === device.id}
                        className="game-btn game-btn-blue !p-2 flex-shrink-0"
                        title={t('common.save')}
                      >
                        {savingId === device.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      </button>
                    )}
                    <button
                      onClick={() => removeDevice(device.id)}
                      disabled={removingId === device.id}
                      className="p-2 rounded-md text-muted hover:text-crimson hover:bg-crimson/10 transition-colors flex-shrink-0"
                      title={t('trustedDevice.revoke')}
                      aria-label={t('trustedDevice.revoke')}
                    >
                      {removingId === device.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {pairing && (
            <div className="mb-3 space-y-2">
              <p className="text-cream text-xs font-medium">{t('trustedDevice.pairedAs', { name: pairing.name })}</p>
              <div className="flex items-center gap-2 p-2.5 rounded-md border border-border bg-navy/60">
                <code className="text-cream text-xs truncate flex-1">{pairing.url}</code>
                <button
                  onClick={copyLink}
                  className="text-muted hover:text-cream transition-colors flex-shrink-0"
                  aria-label={t('trustedDevice.copy')}
                  title={t('trustedDevice.copy')}
                >
                  {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-muted text-xs">{t('trustedDevice.openOnce')}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('trustedDevice.namePlaceholder')}
              className="field-input !py-1.5 !text-sm max-w-xs"
              maxLength={100}
              onKeyDown={(e) => { if (e.key === 'Enter') createDevice(); }}
            />
            <button
              onClick={createDevice}
              disabled={creating}
              className="game-btn game-btn-blue inline-flex items-center gap-2 flex-shrink-0"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t('trustedDevice.addDevice')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
