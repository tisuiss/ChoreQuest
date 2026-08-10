import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  Star,
  Flame,
  CheckCircle2,
  XCircle,
  Clock,
  Camera,
  Swords,
  SkipForward,
} from 'lucide-react';
import { api } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { themedTitle, themedDescription } from '../utils/questThemeText';
import AvatarDisplay from '../components/AvatarDisplay';

const STATUS_CONFIG = {
  pending: { labelKey: 'chores.status.pending', color: 'text-muted', icon: Clock },
  completed: { labelKey: 'chores.status.awaitingApproval', color: 'text-gold', icon: Clock },
  verified: { labelKey: 'chores.status.approved', color: 'text-emerald', icon: CheckCircle2 },
  skipped: { labelKey: 'chores.status.skipped', color: 'text-muted/50', icon: SkipForward },
};

export default function KidQuests() {
  const { t } = useTranslation();
  const { kidId } = useParams();
  const navigate = useNavigate();
  const { colorTheme } = useTheme();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  const fetchData = useCallback(async () => {
    try {
      setError('');
      const res = await api(`/api/stats/family/${kidId}`);
      setData(res);
    } catch (err) {
      setError(err.message || t('kidQuests.loadError'));
    } finally {
      setLoading(false);
    }
  }, [kidId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchData]);

  const setActionBusy = (key, busy) => {
    setActionLoading((prev) => ({ ...prev, [key]: busy }));
  };

  const handleVerify = async (choreId) => {
    const key = `verify-${choreId}`;
    setActionBusy(key, true);
    try {
      await api(`/api/chores/${choreId}/verify`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err.message || t('kidQuests.verifyError'));
    } finally {
      setActionBusy(key, false);
    }
  };

  const handleReject = async (choreId) => {
    const key = `reject-${choreId}`;
    setActionBusy(key, true);
    try {
      await api(`/api/chores/${choreId}/uncomplete`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err.message || t('kidQuests.rejectError'));
    } finally {
      setActionBusy(key, false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <div className="game-panel p-8 text-center">
          <XCircle size={36} className="mx-auto text-crimson mb-3" />
          <p className="text-cream text-base font-semibold mb-2">{t('kidQuests.errorTitle')}</p>
          <p className="text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { kid, assignments } = data;
  const completedCount = assignments.filter(
    (a) => a.status === 'completed' || a.status === 'verified'
  ).length;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Kid header */}
      <div className="game-panel p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <AvatarDisplay
            config={kid.avatar_config}
            photoUrl={kid.avatar_photo_url}
            size="md"
            name={kid.display_name}
            animate
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-cream text-sm sm:text-base font-semibold truncate">
              {t('kidQuests.title', { name: kid.display_name })}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1 text-gold text-xs sm:text-sm font-semibold">
                <Star size={13} fill="currentColor" />
                {t('kidQuests.starsCount', { count: kid.points_balance })}
              </span>
              {kid.current_streak > 0 && (
                <span className="inline-flex items-center gap-1 text-orange-400 text-xs sm:text-sm font-semibold">
                  <Flame size={13} fill="currentColor" />
                  {t('streakDisplay.dayStreak', { count: kid.current_streak })}
                </span>
              )}
            </div>
            <p className="text-muted text-xs mt-1">
              {t('kidQuests.doneToday', { completed: completedCount, total: assignments.length })}
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="game-panel p-3 border-crimson/30 text-crimson text-sm">
          {error}
        </div>
      )}

      {/* Quest list */}
      {assignments.length === 0 ? (
        <div className="game-panel p-10 text-center">
          <Swords size={40} className="mx-auto text-muted mb-4" />
          <p className="text-muted text-sm">
            {t('kidQuests.noneAssigned')}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {assignments.map((a, idx) => {
            const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
            const statusLabel = t(cfg.labelKey);
            const StatusIcon = cfg.icon;
            const isCompleted = a.status === 'completed';
            const isVerified = a.status === 'verified';
            const verifyKey = `verify-${a.chore_id}`;
            const rejectKey = `reject-${a.chore_id}`;
            const isVerifying = actionLoading[verifyKey];
            const isRejecting = actionLoading[rejectKey];
            const isBusy = isVerifying || isRejecting;

            return (
              <div
                key={a.id}
                className={`game-panel p-3 sm:p-4 ${isVerified ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => navigate(`/chores/${a.chore_id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-cream text-sm font-medium truncate">
                        {themedTitle(a.chore.title, colorTheme)}
                      </h3>
                      {a.chore.requires_photo && (
                        <Camera size={12} className="text-accent flex-shrink-0" />
                      )}
                    </div>
                    {a.chore.description && (
                      <p className="text-muted text-xs line-clamp-1 mb-1.5">
                        {themedDescription(a.chore.title, a.chore.description, colorTheme)}
                      </p>
                    )}
                    <div className="flex items-center flex-wrap gap-3">
                      <span className="flex items-center gap-1 text-gold text-xs font-semibold">
                        <Star size={11} fill="currentColor" />
                        {t('chores.starsCount', { count: a.chore.points })}
                      </span>
                      {a.chore.category && (
                        <span className="text-muted text-xs capitalize">
                          {a.chore.category}
                        </span>
                      )}
                      <span className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                        <StatusIcon size={12} />
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* Approve / Reject buttons for completed quests */}
                  {isCompleted && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        className="game-btn game-btn-blue !px-3 !py-2"
                        disabled={isBusy}
                        onClick={() => handleVerify(a.chore_id)}
                        title={t('kidQuests.approve')}
                      >
                        {isVerifying ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                      </button>
                      <button
                        className="game-btn game-btn-red !px-3 !py-2"
                        disabled={isBusy}
                        onClick={() => handleReject(a.chore_id)}
                        title={t('kidQuests.reject')}
                      >
                        {isRejecting ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <XCircle size={16} />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Verified checkmark */}
                  {isVerified && (
                    <CheckCircle2 size={20} className="text-emerald flex-shrink-0" />
                  )}
                </div>

                {/* Photo proof */}
                {a.photo_proof_path && isCompleted && (
                  <div className="mt-3">
                    <img
                      src={`/api/uploads/${a.photo_proof_path}`}
                      alt={t('kidQuests.photoProof')}
                      className="rounded-md max-h-48 object-cover border border-border"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
