import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import Modal from './Modal';

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

export default function PointsHistoryModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    setLoading(true);
    api(`/api/points/${user.id}`)
      .then((data) => setHistory(Array.isArray(data?.transactions) ? data.transactions : []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [isOpen, user?.id]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('profile.pointsHistory')}
      actions={[{ label: t('common.close'), onClick: onClose, className: 'game-btn game-btn-blue' }]}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-muted text-xs">{t('profile.starsBalance')}</span>
        <span className="text-gold text-sm font-semibold flex items-center gap-1">
          <Star size={14} fill="currentColor" />
          {user?.points_balance ?? 0}
        </span>
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="text-accent animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <p className="text-muted text-center text-sm py-4">{t('profile.noPointsHistory')}</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {history.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border/50 bg-surface-raised/20"
            >
              <div className="flex-1 min-w-0">
                <p className="text-cream text-sm truncate">{tx.description}</p>
                <p className="text-muted/60 text-xs mt-0.5">{timeAgo(tx.created_at, t)}</p>
              </div>
              <span className={`text-sm font-medium flex-shrink-0 ${tx.amount > 0 ? 'text-gold' : 'text-crimson'}`}>
                {tx.amount > 0 ? '+' : ''}{tx.amount}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
