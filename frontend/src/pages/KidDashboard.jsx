import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
  ChevronRight,
  ShieldOff,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import PointCounter from '../components/PointCounter';
import StreakDisplay from '../components/StreakDisplay';
import ConfettiAnimation from '../components/ConfettiAnimation';

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

function difficultyLabel(difficulty, t) {
  switch (difficulty) {
    case 'easy':
      return { text: t('chores.difficulty.easy'), color: 'text-emerald bg-emerald/10 border-emerald/20' };
    case 'medium':
      return { text: t('chores.difficulty.medium'), color: 'text-gold bg-gold/10 border-gold/20' };
    case 'hard':
      return { text: t('chores.difficulty.hard'), color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' };
    case 'expert':
      return { text: t('chores.difficulty.expert'), color: 'text-crimson bg-crimson/10 border-crimson/20' };
    default:
      return { text: t('chores.difficulty.easy'), color: 'text-emerald bg-emerald/10 border-emerald/20' };
  }
}

// ---------- card animation variants ----------

const cardVariants = {
  hidden: { opacity: 0 },
  visible: (i) => ({
    opacity: 1,
    transition: { delay: i * 0.04, duration: 0.15 },
  }),
};

// ---------- component ----------

export default function KidDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const navigate = useNavigate();

  // data state
  const [assignments, setAssignments] = useState([]);
  const [chores, setChores] = useState([]);
  const [myStats, setMyStats] = useState(null);

  // ui state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

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
          <div className="space-y-3">
            {pendingAssignments.map((assignment, idx) => {
              const chore = assignment.chore;
              if (!chore) return null;

              const diff = difficultyLabel(chore.difficulty, t);
              const categoryColor = chore.category?.colour || '#14b8a6';

              return (
                <motion.div
                  key={assignment.id}
                  className="game-panel p-4 transition-all cursor-pointer hover:border-accent/40"
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  custom={idx}
                  onClick={() => navigate('/chores')}
                >
                  <div className="flex items-start gap-3">
                    {/* Category indicator */}
                    <div
                      className="mt-0.5 w-1 h-12 rounded-full flex-shrink-0"
                      style={{ backgroundColor: categoryColor }}
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h3 className="text-cream text-sm font-semibold truncate">
                          {themedTitle(chore.title, colorTheme)}
                        </h3>
                        <ChevronRight size={16} className="text-muted flex-shrink-0" />
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Stars */}
                        <span className="inline-flex items-center gap-1 text-gold text-xs font-semibold">
                          <Star size={12} fill="currentColor" />
                          {t('chores.starsCount', { count: chore.points })}
                        </span>

                        {/* Difficulty */}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${diff.color}`}>
                          {diff.text}
                        </span>

                        {/* Category */}
                        {chore.category?.name && (
                          <span className="text-muted text-xs">
                            {chore.category.name}
                          </span>
                        )}

                        {/* Photo indicator */}
                        {chore.requires_photo && (
                          <span className="inline-flex items-center gap-1 text-muted text-xs">
                            <Camera size={10} />
                            {t('chores.photo')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
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
