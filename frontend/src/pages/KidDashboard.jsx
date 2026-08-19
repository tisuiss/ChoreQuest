import { useState, useEffect, useCallback, useRef } from 'react';
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
  X,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Gift,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useSettings } from '../hooks/useSettings';
import { themedTitle } from '../utils/questThemeText';
import PointCounter from '../components/PointCounter';
import StreakDisplay from '../components/StreakDisplay';
import ConfettiAnimation from '../components/ConfettiAnimation';
import ChoreIcon from '../components/ChoreIcon';

// ---------- helpers ----------

// Local date components — toISOString() would shift the date by the UTC
// offset (e.g. back a day for UTC+1/+2 timezones like France).
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMondayOfThisWeek() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return toISO(monday);
}

function todayISO() {
  return toISO(new Date());
}

// "HH:MM:SS", zero-padded, comparable lexicographically against the
// backend's time.isoformat() strings (chore.window_start/window_end).
function nowTimeString() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// A category with no window set is always visible. One with a window is
// only visible while "now" falls inside it -- outside, chores in that
// category are fully hidden from the kid's dashboard (no badge/greying,
// unlike the per-chore window which only affects the "Oui" button).
function isWithinCategoryWindow(category) {
  if (!category?.window_start || !category?.window_end) return true;
  const now = nowTimeString();
  return now >= category.window_start && now <= category.window_end;
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

function ChoreActionCard({ chore, status, idx, completing, declining, photoFile, onPhotoChange, onComplete, onDecline, onZoomPhoto, colorTheme, enforcement, thumbsMode, malusMode, t }) {
  const categoryColor = chore.category?.colour || '#14b8a6';
  const iconName = chore.icon || chore.category?.icon;
  const needsPhoto = chore.requires_photo && !photoFile;
  const isValidated = status === 'completed' || status === 'verified';
  const isDeclined = status === 'skipped';
  const effectiveMalus = chore.malus_override === 'malus' ? true
    : chore.malus_override === 'none' ? false
    : malusMode === 'malus';

  const hasWindow = Boolean(chore.window_start && chore.window_end);
  const windowLabel = hasWindow
    ? `${chore.window_start.slice(0, 5)}–${chore.window_end.slice(0, 5)}`
    : null;
  const strict = enforcement === 'strict';
  const nowStr = hasWindow && strict ? nowTimeString() : null;
  const beforeWindow = strict && hasWindow && nowStr < chore.window_start;
  const afterWindow = strict && hasWindow && nowStr > chore.window_end;
  const isGrayed = beforeWindow && !isValidated && !isDeclined;
  const isMissedWindow = afterWindow && !isValidated && !isDeclined;

  return (
    <motion.div
      className={`game-panel p-3 flex flex-col items-center gap-2 text-center ${
        isGrayed ? 'opacity-50' : ''
      } ${isMissedWindow ? 'border-crimson/40' : ''}`}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={idx}
    >
      {chore.photo_url ? (
        <button
          type="button"
          onClick={() => onZoomPhoto(chore.photo_url, themedTitle(chore.title, colorTheme))}
          className="active:scale-95 transition-transform"
        >
          <img
            src={chore.photo_url}
            alt=""
            className="w-28 h-28 rounded-2xl object-cover flex-shrink-0 border-2 border-border cursor-zoom-in"
          />
        </button>
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

      {hasWindow && (
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
            isMissedWindow ? 'text-crimson' : 'text-muted'
          }`}
        >
          <Clock size={11} />
          {windowLabel}
        </span>
      )}

      {!isValidated && !isDeclined && !isGrayed && !isMissedWindow && chore.requires_photo && (
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted cursor-pointer hover:text-cream transition-colors bg-surface-raised px-2 py-1 rounded-md border border-border w-full justify-center">
          <Camera size={11} />
          <span className="truncate">{photoFile ? photoFile.name : t('chores.attachPhoto')}</span>
          <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
        </label>
      )}

      <div className="w-full mt-1">
        {isValidated ? (
          <div className="rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 bg-emerald/15 text-emerald border border-emerald/40">
            <CheckCircle2 size={14} />
            {t('kidDashboard.validated')}
          </div>
        ) : isDeclined ? (
          <div className="rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 bg-surface-raised text-muted border border-border">
            <XCircle size={14} />
            {t('kidDashboard.declined')}
          </div>
        ) : isMissedWindow ? (
          <div className="rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 bg-crimson/15 text-crimson border border-crimson/40">
            <Clock size={14} />
            {t('kidDashboard.windowMissed')}
          </div>
        ) : isGrayed ? (
          <div className="rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 bg-surface-raised text-muted border border-border">
            <Clock size={14} />
            {t('kidDashboard.availableFrom', { time: chore.window_start.slice(0, 5) })}
          </div>
        ) : (
          <div className="flex gap-1.5">
            <button
              onClick={onComplete}
              disabled={completing || declining || needsPhoto}
              aria-label={t('common.yes')}
              title={t('common.yes')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-opacity bg-emerald text-navy ${
                completing || declining || needsPhoto ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90'
              }`}
            >
              {completing ? (
                <Loader2 size={thumbsMode ? 20 : 14} className="animate-spin" />
              ) : thumbsMode ? (
                <ThumbsUp size={20} fill="currentColor" />
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  {t('common.yes')}
                </>
              )}
            </button>
            <button
              onClick={onDecline}
              disabled={completing || declining}
              aria-label={t('common.no')}
              title={
                effectiveMalus && chore.points > 0
                  ? t('kidDashboard.declineMalusHint', { points: chore.points })
                  : t('common.no')
              }
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold flex flex-col items-center justify-center gap-0.5 transition-opacity bg-surface-raised text-muted border border-border ${
                completing || declining ? 'opacity-40 cursor-not-allowed' : 'hover:text-crimson hover:border-crimson/40'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                {declining ? (
                  <Loader2 size={thumbsMode ? 20 : 14} className="animate-spin" />
                ) : thumbsMode ? (
                  <ThumbsDown size={20} fill="currentColor" />
                ) : (
                  <>
                    <XCircle size={14} />
                    {t('common.no')}
                  </>
                )}
              </span>
              {effectiveMalus && chore.points > 0 && (
                <span className="text-[10px] font-medium text-crimson/80">
                  -{chore.points}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------- component ----------

export default function KidDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const { chore_window_enforcement, keep_validated_visible, kid_thumbs_buttons, decline_malus_mode } = useSettings();

  // data state
  const [assignments, setAssignments] = useState([]);
  const [chores, setChores] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [rewards, setRewards] = useState([]);

  // ui state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState(null);

  // completion state
  const [completingId, setCompletingId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [photoFiles, setPhotoFiles] = useState({});

  // ---- data fetching ----

  // Guards against stale responses landing after a newer fetch was already
  // kicked off — e.g. on the kiosk, switching from one kid to another mid-
  // request must not let the previous kid's slower response overwrite the
  // new kid's freshly-loaded data.
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const forUserId = user?.id;
    try {
      setError(null);
      const monday = getMondayOfThisWeek();
      const today = todayISO();

      const promises = [
        api('/api/chores'),
        api(`/api/calendar?week_start=${monday}`),
        api('/api/stats/me'),
        api('/api/rewards').catch(() => []),
      ];

      const results = await Promise.all(promises);
      if (requestIdRef.current !== requestId) return;

      const choresRes = results[0];
      const calendarRes = results[1];
      const statsRes = results[2];
      const rewardsRes = results[3];
      if (statsRes) {
        setMyStats(statsRes);
      }

      setChores(choresRes);
      setRewards(Array.isArray(rewardsRes) ? rewardsRes : []);

      // Filter calendar assignments to today and this user only
      const allToday = (calendarRes.days && calendarRes.days[today]) || [];
      const todayAssignments = allToday.filter((a) => a.user_id === forUserId);
      setAssignments(todayAssignments);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err.message || t('kidDashboard.loadError'));
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

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

  const handleDecline = async (chore) => {
    const choreId = chore.id;
    setDecliningId(choreId);
    try {
      await api(`/api/chores/${choreId}/decline`, { method: 'POST' });
      setPhotoFiles((prev) => { const next = { ...prev }; delete next[choreId]; return next; });
      await fetchData();
    } catch (err) {
      setError(err.message || t('chores.completeError'));
    } finally {
      setDecliningId(null);
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

  // Rewards are already sorted cheapest-first by the backend, so the first
  // match here is the cheapest reward the kid can currently afford.
  const affordableReward = rewards.find(
    (r) => (r.point_cost ?? 0) <= (user?.points_balance ?? 0) && !(r.stock != null && r.stock <= 0)
  );

  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
  const todayLabel = new Date().toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="max-w-6xl mx-auto space-y-5">
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
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-cream text-lg font-semibold">{t('kidDashboard.title')}</h1>
            <span className="text-muted text-xs capitalize">{todayLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-md hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label={t('kidDashboard.refresh')}
              title={t('kidDashboard.refresh')}
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <StreakDisplay streak={user?.current_streak ?? 0} />
          </div>
        </div>

        {/* Today's progress / stars / malus, split evenly across the same banner height */}
        <div className="grid grid-cols-3 gap-3 items-center">
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

          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-muted text-sm font-medium">{t('common.stars')}</span>
            <PointCounter value={user?.points_balance ?? 0} prefix="" />
          </div>

          <div className="flex flex-col items-center justify-center gap-1">
            <span className="text-muted text-sm font-medium">{t('kidDashboard.malusToday')}</span>
            <span className="inline-flex items-center gap-1.5 font-heading text-crimson text-xl font-bold tabular-nums">
              <Star size={20} className="fill-crimson" />
              {myStats?.malus_today ?? 0}
            </span>
          </div>
        </div>
        </div>{/* close z-10 */}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="game-panel p-3 flex items-center gap-2 border-crimson/30 text-crimson text-sm">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Today's quest cards, grouped by category (pending always shown; resolved
          ones — validated or declined — shown only if the family keeps them visible) ── */}
      {(() => {
        const todaysAssignments = assignments.filter((a) => {
          if (!isWithinCategoryWindow(a.chore?.category)) return false;
          if (a.status === 'pending' || a.status === 'assigned') return true;
          if (a.status === 'completed' || a.status === 'verified' || a.status === 'skipped') return keep_validated_visible;
          return false;
        });

        if (todaysAssignments.length === 0 && !loading) {
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

        // Sort by category then display order (parent-defined routine sequence)
        // before grouping, same ordering as the backend applies to /api/chores.
        const sortedAssignments = [...todaysAssignments].sort((a, b) => {
          const catA = a.chore?.category?.id ?? 0;
          const catB = b.chore?.category?.id ?? 0;
          if (catA !== catB) return catA - catB;
          return (a.chore?.sort_order ?? 0) - (b.chore?.sort_order ?? 0);
        });

        // Group by category, preserving first-appearance order
        const groups = [];
        const groupByKey = new Map();
        sortedAssignments.forEach((assignment) => {
          const chore = assignment.chore;
          if (!chore) return;
          const cat = chore.category;
          const key = cat?.id ?? 'none';
          let group = groupByKey.get(key);
          if (!group) {
            group = {
              key,
              name: cat?.name || t('choreDetail.generalCategory'),
              icon: cat?.icon,
              colour: cat?.colour || '#14b8a6',
              items: [],
            };
            groupByKey.set(key, group);
            groups.push(group);
          }
          group.items.push(assignment);
        });

        return (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${group.colour}26`, color: group.colour }}
                  >
                    <ChoreIcon name={group.icon} size={13} />
                  </div>
                  <h2 className="text-cream text-sm font-semibold">{group.name}</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {group.items.map((assignment, idx) => {
                    const chore = assignment.chore;
                    return (
                      <ChoreActionCard
                        key={assignment.id}
                        chore={chore}
                        status={assignment.status}
                        idx={idx}
                        completing={completingId === chore.id}
                        declining={decliningId === chore.id}
                        photoFile={photoFiles[chore.id]}
                        onPhotoChange={(e) =>
                          setPhotoFiles((prev) => ({
                            ...prev,
                            [chore.id]: e.target.files?.[0] || null,
                          }))
                        }
                        onComplete={() => handleComplete(chore)}
                        onDecline={() => handleDecline(chore)}
                        onZoomPhoto={(url, title) => setZoomedPhoto({ url, title })}
                        colorTheme={colorTheme}
                        enforcement={chore_window_enforcement}
                        thumbsMode={kid_thumbs_buttons}
                        malusMode={decline_malus_mode}
                        t={t}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Reward affordability banner ── */}
      {affordableReward && (
        <motion.div
          className="game-panel p-3 flex items-center gap-3 border-emerald/30 bg-emerald/5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Gift size={18} className="text-emerald flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-cream text-xs font-medium">
              {t('kidDashboard.canAffordReward', { title: themedTitle(affordableReward.title, colorTheme) })}
            </p>
          </div>
          <button
            onClick={() => navigate('/rewards')}
            className="game-btn game-btn-blue !text-xs !py-1.5 flex-shrink-0"
          >
            {t('kidDashboard.viewRewards')}
          </button>
        </motion.div>
      )}

      {/* ── Enlarged chore photo ── */}
      <AnimatePresence>
        {zoomedPhoto && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setZoomedPhoto(null)}
          >
            <button
              onClick={() => setZoomedPhoto(null)}
              className="absolute top-4 right-4 p-2.5 rounded-full bg-surface/90 text-cream hover:text-accent transition-colors"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
            <img
              src={zoomedPhoto.url}
              alt=""
              className="max-w-full max-h-[75vh] rounded-2xl object-contain border-2 border-border"
              onClick={(e) => e.stopPropagation()}
            />
            {zoomedPhoto.title && (
              <p className="text-cream text-lg font-semibold text-center">{zoomedPhoto.title}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
