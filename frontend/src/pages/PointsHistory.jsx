import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { History, Loader2, Star, Shield } from 'lucide-react';

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

// Most recent period boundary (<= d) for the given cadence, mirroring
// backend/main.py's _most_recent_points_reset_boundary -- used here only
// to group the display, never to trigger anything.
function periodBoundary(cadence, weekday, d) {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (cadence === 'weekly') {
    const jsDay = local.getDay(); // 0=Sun..6=Sat
    const mondayBasedDay = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon..6=Sun
    const delta = (mondayBasedDay - weekday + 7) % 7;
    local.setDate(local.getDate() - delta);
    return local;
  }
  if (cadence === 'quarterly') {
    const qStartMonth = Math.floor(local.getMonth() / 3) * 3;
    return new Date(local.getFullYear(), qStartMonth, 1);
  }
  return new Date(local.getFullYear(), local.getMonth(), 1); // monthly
}

function periodKey(boundaryDate) {
  const y = boundaryDate.getFullYear();
  const m = String(boundaryDate.getMonth() + 1).padStart(2, '0');
  const d = String(boundaryDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function periodLabel(cadence, boundaryDate, locale, t) {
  if (cadence === 'weekly') {
    const dateStr = boundaryDate.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    return t('pointsHistory.weekOf', { date: dateStr });
  }
  if (cadence === 'quarterly') {
    const q = Math.floor(boundaryDate.getMonth() / 3) + 1;
    return t('pointsHistory.quarterLabel', { quarter: q, year: boundaryDate.getFullYear() });
  }
  const label = boundaryDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function TransactionRow({ tx, showKidName, t }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border/50 bg-surface-raised/20">
      <div className="flex-1 min-w-0">
        {showKidName && (
          <p className="text-purple text-xs font-medium truncate">{tx.user_display_name}</p>
        )}
        <p className="text-cream text-sm truncate">{tx.description}</p>
        <p className="text-muted/60 text-xs mt-0.5">{timeAgo(tx.created_at, t)}</p>
      </div>
      <span className={`text-sm font-medium flex-shrink-0 ${tx.amount > 0 ? 'text-gold' : 'text-crimson'}`}>
        {tx.amount > 0 ? '+' : ''}{tx.amount}
      </span>
    </div>
  );
}

export default function PointsHistory() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isParent = user?.role === 'parent' || user?.role === 'admin';
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';

  const [kids, setKids] = useState([]);
  const [selectedKidFilter, setSelectedKidFilter] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [resetSettings, setResetSettings] = useState({ enabled: false, cadence: 'monthly', weekday: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isParent) return;
    api('/api/stats/kids').then((data) => setKids(data || [])).catch(() => setKids([]));
    api('/api/admin/settings')
      .then((data) => {
        setResetSettings({
          enabled: data.points_reset_enabled === 'true',
          cadence: ['weekly', 'monthly', 'quarterly'].includes(data.points_reset_cadence)
            ? data.points_reset_cadence
            : 'monthly',
          weekday: parseInt(data.points_reset_weekday, 10) || 0,
        });
      })
      .catch(() => {});
  }, [isParent]);

  const fetchHistory = useCallback(async () => {
    if (!isParent) return;
    setLoading(true);
    setError('');
    try {
      const qs = selectedKidFilter ? `?user_id=${selectedKidFilter}` : '';
      const data = await api(`/api/points/family/history${qs}`);
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || t('pointsHistory.loadError'));
    } finally {
      setLoading(false);
    }
  }, [isParent, selectedKidFilter, t]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const handler = () => fetchHistory();
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchHistory]);

  if (!isParent) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="game-panel p-10 text-center">
          <Shield size={48} className="text-crimson/30 mx-auto mb-4" />
          <p className="text-crimson text-sm">{t('settings.accessDenied')}</p>
        </div>
      </div>
    );
  }

  let groups = null;
  if (resetSettings.enabled) {
    const map = new Map();
    for (const tx of transactions) {
      const boundary = periodBoundary(resetSettings.cadence, resetSettings.weekday, new Date(tx.created_at));
      const key = periodKey(boundary);
      if (!map.has(key)) {
        map.set(key, { key, boundary, items: [] });
      }
      map.get(key).items.push(tx);
    }
    groups = Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <History size={22} className="text-cream" />
          <h1 className="text-cream text-lg font-semibold">{t('pointsHistory.title')}</h1>
        </div>
        {kids.length > 0 && (
          <select
            value={selectedKidFilter}
            onChange={(e) => setSelectedKidFilter(e.target.value)}
            className="bg-surface-raised text-cream text-sm rounded-md border border-border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">{t('pointsHistory.allKids')}</option>
            {kids.map((kid) => (
              <option key={kid.id} value={kid.id}>{kid.display_name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm text-center">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-accent animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="game-panel p-10 text-center">
          <Star size={36} className="mx-auto text-muted mb-3" />
          <p className="text-muted text-sm">{t('pointsHistory.empty')}</p>
        </div>
      ) : groups ? (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <h2 className="text-cream text-sm font-semibold px-1">
                {periodLabel(resetSettings.cadence, group.boundary, locale, t)}
              </h2>
              <div className="space-y-1.5">
                {group.items.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} showKidName={!selectedKidFilter} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} showKidName={!selectedKidFilter} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
