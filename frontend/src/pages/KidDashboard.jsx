import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star,
  Sword,
  CheckCircle2,
  CheckCheck,
  Skull,
  Camera,
  Loader2,
  AlertTriangle,
  ShieldOff,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import PointCounter from '../components/PointCounter';
import StreakDisplay from '../components/StreakDisplay';
import ConfettiAnimation from '../components/ConfettiAnimation';
import ChoreIcon from '../components/ChoreIcon';

// ---------- helpers ----------

function getMondayOfThisWeek() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- card animation variants ----------

const cardVariants = {
  hidden: { opacity: 0 },
  visible: (i) => ({
    opacity: 1,
    transition: { delay: i * 0.04, duration: 0.15 },
  }),
};

// ---------- chore card ----------

function ChoreActionCard({ chore, idx, completing, photoFile, onPhotoChange, onComplete, colorTheme, t }) {
  const categoryColor = chore.category?.colour || '#14b8a6';
  const iconName = chore.icon || chore.category?.icon;
  const needsPhoto = chore.requires_photo && !photoFile;

  return (
    <motion.div
      className="game-panel p-3 flex flex-col items-center gap-2 text-center"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={idx}
    >
      {chore.photo_url ? (
        <img
          src={chore.photo_url}
          alt=""
          className="w-28 h-28 rounded-2xl object-cover flex-shrink-0 border-2 border-border"
        />
      ) : (
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${categoryColor}26`, color: categoryColor }}
        >
          <ChoreIcon name={iconName} size={30} />
        </div>
      )}

      <h3 className="text-cream text-sm font-semibold leading-tight line-clamp-2">
        {themedTitle(chore.title, colorTheme)}
      </h3>

      <span className="inline-flex items-center gap-1 text-gold text-xs font-semibold">
        <Star size={12} fill="currentColor" />
        {t('chores.starsCount', { count: chore.points })}
      </span>

      {chore.requires_photo && (
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted cursor-pointer hover:text-cream transition-colors bg-surface-raised px-2 py-1 rounded-md border border-border w-full justify-center">
          <Camera size={11} />
          <span className="truncate">{photoFile ? photoFile.name : t('chores.attachPhoto')}</span>
          <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
        </label>
      )}

      <div className="flex items-center gap-2 w-full mt-1">
        <button
          onClick={onComplete}
          disabled={completing || needsPhoto}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-opacity bg-emerald text-navy ${
            completing || needsPhoto ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90'
          }`}
        >
          {completing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {t('common.yes')}
        </button>
        <button
          className="flex-1 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 bg-crimson/70 text-white cursor-default"
        >
          <X size={14} />
          {t('common.no')}
        </button>
      </div>
    </motion.div>
  );
}

// ---------- component ----------

export default function KidDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colorTheme } = useTheme();

  // data state
  const [assignments, setAssignments] = useState([]);
  const [chores, setChores] = useState([]);
  const [myStats, setMyStats] = useState(null);

  // ui state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // completion state
  const [completingId, setCompletingId] = useState(null);
  const [photoFiles, setPhotoFiles] = useState({});

  // ---- data fetching ----

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const monday = getMondayOfThisWeek();
      const today = todayISO();

      const promises = [
        api('/api/chores'),
        api(`/api/calendar?week_start=${monday}`),
        api('/api/stats/me'),
      ];

      const results = await Promise.all(promises);
      const choresRes = results[0];
      const calendarRes = results[1];
      const statsRes = results[2];
      if (statsRes) {
        setMyStats(statsRes);
      }

      setChores(choresRes);

      // Filter calendar assignments to today and this user only
      const allToday = (calendarRes.days && calendarRes.days[today]) || [];
      const todayAssignments = allToday.filter((a) => a.user_id === user?.id);
      setAssignments(todayAssignments);
    } catch (err) {
      setError(err.message || t('kidDashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- WebSocket listener ----

  useEffect(() => {
    const handler = () => {
      fetchData();
    };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchData]);

  // ---- chore completion ----

  const handleComplete = async (chore) => {
    const choreId = chore.id;
    if (chore.requires_photo && !photoFiles[choreId]) return;

    setCompletingId(choreId);
    try {
      if (chore.requires_photo && photoFiles[choreId]) {
        const fd = new FormData();
        fd.append('file', photoFiles[choreId]);
        await api(`/api/chores/${choreId}/complete`, { method: 'POST', body: fd });
      } else {
        await api(`/api/chores/${choreId}/complete`, { method: 'POST' });
      }
      setPhotoFiles((prev) => { const next = { ...prev }; delete next[choreId]; return next; });
      setShowConfetti(true);
      await fetchData();
    } catch (err) {
      setError(err.message || t('chores.completeError'));
    } finally {
      setCompletingId(null);
    }
  };

  // ---- render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  const completedCount = assignments.filter(a => a.status === 'verified' || a.status === 'completed').length;
  const totalCount = assignments.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* ── Confetti overlay ── */}
      <AnimatePresence>
        {showConfetti && (
          <ConfettiAnimation onComplete={() => setShowConfetti(false)} />
        )}
      </AnimatePresence>

      {/* ── Header with stats ── */}
      <div className="game-panel p-5 relative overflow-hidden">
        <div className="relative z-10">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h1 className="text-cream text-lg font-semibold">{t('kidDashboard.title')}</h1>
          <div className="flex items-center gap-3">
            <PointCounter value={user?.points_balance ?? 0} prefix={t('common.stars')} />
            <StreakDisplay streak={user?.current_streak ?? 0} />
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-muted text-xs font-medium">{t('kidDashboard.todaysProgress')}</span>
              <span className="text-cream text-xs font-bold">{completedCount}/{totalCount}</span>
            </div>
            <div className="xp-bar">
              <div
                className="xp-bar-fill"
                style={{ width: `${progressPct}%`, transition: 'width 0.3s ease' }}
              />
            </div>
          </div>
        )}
        </div>{/* close z-10 */}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="game-panel p-3 flex items-center gap-2 border-crimson/30 text-crimson text-sm">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Active Quest cards (pending only) ── */}
      {(() => {
        const pendingAssignments = assignments.filter(
          (a) => a.status === 'pending' || a.status === 'assigned'
        );

        if (pendingAssignments.length === 0 && !loading) {
          return (
            <motion.div
              className="game-panel p-10 flex flex-col items-center gap-3 text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Sword size={36} className="text-muted" />
              <p className="text-muted text-sm">
                {assignments.length === 0
                  ? t('kidDashboard.noneToday')
                  : t('kidDashboard.allComplete')}
              </p>
            </motion.div>
          );
        }

        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pendingAssignments.map((assignment, idx) => {
              const chore = assignment.chore;
              if (!chore) return null;

              return (
                <ChoreActionCard
                  key={assignment.id}
                  chore={chore}
                  idx={idx}
                  completing={completingId === chore.id}
                  photoFile={photoFiles[chore.id]}
                  onPhotoChange={(e) =>
                    setPhotoFiles((prev) => ({
                      ...prev,
                      [chore.id]: e.target.files?.[0] || null,
                    }))
                  }
                  onComplete={() => handleComplete(chore)}
                  colorTheme={colorTheme}
                  t={t}
                />
              );
            })}
          </div>
        );
      })()}

      {/* ── Streak Freeze Indicator ── */}
      {myStats?.streak_freeze_available && (
        <div className="game-panel p-3 flex items-center gap-3">
          <ShieldOff size={16} className="text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-cream text-xs font-medium">{t('kidDashboard.streakFreezeAvailable')}</p>
            <p className="text-muted text-[10px]">{t('kidDashboard.streakFreezeHint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
