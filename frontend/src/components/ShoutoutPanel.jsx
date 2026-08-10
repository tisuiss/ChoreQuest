import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { Megaphone, Send, Loader2 } from 'lucide-react';

const EMOJIS = [
  { id: 'star', icon: '\u2B50' },
  { id: 'fire', icon: '\uD83D\uDD25' },
  { id: 'heart', icon: '\u2764\uFE0F' },
  { id: 'trophy', icon: '\uD83C\uDFC6' },
  { id: 'clap', icon: '\uD83D\uDC4F' },
  { id: 'muscle', icon: '\uD83D\uDCAA' },
];

function timeAgo(dateStr, t) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('layout.justNow');
  if (mins < 60) return t('layout.minutesAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('layout.hoursAgo', { count: hrs });
  return t('layout.daysAgo', { count: Math.floor(hrs / 24) });
}

export default function ShoutoutPanel({ members }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [shoutouts, setShoutouts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [toUserId, setToUserId] = useState('');
  const [message, setMessage] = useState('');
  const [emoji, setEmoji] = useState('star');
  const [sending, setSending] = useState(false);

  const fetchShoutouts = useCallback(async () => {
    try {
      const data = await api('/api/shoutouts');
      setShoutouts(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchShoutouts();
  }, [fetchShoutouts]);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.type === 'shoutout') fetchShoutouts();
    };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchShoutouts]);

  const send = async () => {
    if (!toUserId || !message.trim()) return;
    setSending(true);
    try {
      await api('/api/shoutouts', {
        method: 'POST',
        body: { to_user_id: parseInt(toUserId), message: message.trim(), emoji },
      });
      setMessage('');
      setShowForm(false);
      fetchShoutouts();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const others = (members || []).filter((m) => m.id !== user?.id);
  const emojiIcon = (id) => EMOJIS.find((e) => e.id === id)?.icon || '\u2B50';

  return (
    <div className="game-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-cream text-sm font-semibold flex items-center gap-2">
          <Megaphone size={14} className="text-gold" />
          {t('shoutouts.title')}
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs text-accent hover:text-accent-light transition-colors font-medium"
        >
          {showForm ? t('common.cancel') : t('shoutouts.give')}
        </button>
      </div>

      {/* Send form */}
      {showForm && (
        <div className="mb-4 p-3 rounded-lg bg-surface-raised/50 border border-border/50 space-y-3">
          <select
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            className="field-input text-sm"
          >
            <option value="">{t('shoutouts.whoDeserves')}</option>
            {others.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 200))}
            placeholder={t('shoutouts.placeholder')}
            className="field-input text-sm"
            maxLength={200}
          />
          <div className="flex items-center gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e.id}
                onClick={() => setEmoji(e.id)}
                className={`w-8 h-8 rounded-lg text-base transition-all ${
                  emoji === e.id
                    ? 'bg-accent/20 border border-accent/40'
                    : 'bg-surface-raised border border-border/50 hover:border-border-light'
                }`}
              >
                {e.icon}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={send}
              disabled={sending || !toUserId || !message.trim()}
              className="game-btn game-btn-blue flex items-center gap-1.5 !py-2 !px-3"
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {t('shoutouts.send')}
            </button>
          </div>
        </div>
      )}

      {/* Shoutout feed */}
      {shoutouts.length === 0 ? (
        <p className="text-muted text-sm text-center py-4">
          {t('shoutouts.none')}
        </p>
      ) : (
        <div className="space-y-2">
          {shoutouts.slice(0, 10).map((s) => (
            <div
              key={s.id}
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-border/50 bg-surface-raised/20"
            >
              <span className="text-lg flex-shrink-0 mt-0.5">{emojiIcon(s.emoji)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-cream text-sm">
                  <span className="font-medium">{s.from_user_name}</span>
                  <span className="text-muted"> &rarr; </span>
                  <span className="font-medium">{s.to_user_name}</span>
                </p>
                <p className="text-muted text-xs mt-0.5">{s.message}</p>
                <p className="text-muted/50 text-[10px] mt-0.5">{timeAgo(s.created_at, t)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
