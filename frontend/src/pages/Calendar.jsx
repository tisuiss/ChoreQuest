import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import Modal from '../components/Modal';
import {
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Clock,
  Slash,
  ArrowRightLeft,
  CalendarDays,
  Loader2,
  X,
  Trash2,
} from 'lucide-react';

// Format using local date components — toISOString() would shift the date
// by the UTC offset (e.g. back a day for UTC+1/+2 timezones like France).
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}

const SHORT_DAY_KEYS = ['calendar.days.sun', 'calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed', 'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat'];

function statusStyle(assignment, dayStr) {
  const today = toISO(new Date());

  if (assignment.status === 'verified') {
    return {
      border: 'border-emerald',
      bg: 'bg-emerald/10',
      icon: <CheckCheck size={16} className="text-emerald" />,
    };
  }
  if (assignment.status === 'completed') {
    return {
      border: 'border-emerald',
      bg: 'bg-emerald/5',
      icon: <CheckCheck size={16} className="text-emerald/60" />,
    };
  }
  if (assignment.status === 'skipped') {
    return {
      border: 'border-border',
      bg: 'bg-navy-light/50',
      icon: <Slash size={16} className="text-muted" />,
      textClass: 'line-through text-muted',
    };
  }
  // pending
  if (dayStr < today) {
    // overdue
    return {
      border: 'border-crimson',
      bg: 'bg-crimson/5',
      icon: <Clock size={16} className="text-crimson" />,
    };
  }
  return {
    border: 'border-border',
    bg: '',
    icon: <Clock size={16} className="text-muted" />,
  };
}

export default function Calendar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { chore_trading_enabled } = useSettings();
  const { colorTheme } = useTheme();
  const isKid = user?.role === 'kid';

  const [startDate, setStartDate] = useState(() => toISO(new Date()));
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Trade modal
  const [tradeModal, setTradeModal] = useState(false);
  const [tradeAssignment, setTradeAssignment] = useState(null);
  const [familyKids, setFamilyKids] = useState([]);
  const [selectedKid, setSelectedKid] = useState('');
  const [allKids, setAllKids] = useState([]);
  const [selectedKidFilter, setSelectedKidFilter] = useState('');
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState('');

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // The backend requires week_start to be a Monday. Our 7-day window
      // may span two Mon-Sun weeks, so fetch both if needed.
      const d = new Date(startDate + 'T00:00:00');
      const dayOfWeek = d.getDay(); // 0=Sun..6=Sat
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday1 = addDays(startDate, mondayOffset);

      const data = await api(`/api/calendar?week_start=${monday1}`);
      const byDay = {};
      for (let i = 0; i < 7; i++) {
        const dayKey = addDays(startDate, i);
        byDay[dayKey] = data.days?.[dayKey] || [];
      }

      // If our window extends past Sunday of that week, fetch next week too
      const monday2 = addDays(monday1, 7);
      const lastDay = addDays(startDate, 6);
      const sunday1 = addDays(monday1, 6);
      if (lastDay > sunday1) {
        try {
          const data2 = await api(`/api/calendar?week_start=${monday2}`);
          for (let i = 0; i < 7; i++) {
            const dayKey = addDays(startDate, i);
            if (!byDay[dayKey]?.length && data2.days?.[dayKey]) {
              byDay[dayKey] = data2.days[dayKey];
            }
          }
        } catch { /* second fetch is best-effort */ }
      }
      setAssignments(byDay);
    } catch (err) {
      setError(err.message || t('calendar.loadError'));
    } finally {
      setLoading(false);
    }
  }, [startDate, t]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  useEffect(() => {
    if (isKid) return;
    api('/api/stats/kids')
      .then((data) => setAllKids(data || []))
      .catch(() => setAllKids([]));
  }, [isKid]);

  // Live updates via WebSocket
  useEffect(() => {
    const handler = () => { fetchCalendar(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchCalendar]);

  const prevWeek = () => setStartDate(addDays(startDate, -7));
  const nextWeek = () => setStartDate(addDays(startDate, 7));
  const goToday = () => setStartDate(toISO(new Date()));

  const openTrade = async (assignment) => {
    setTradeAssignment(assignment);
    setTradeError('');
    setSelectedKid('');
    setTradeModal(true);
    try {
      const data = await api('/api/stats/kids');
      const kids = (data || []).filter((k) => k.id !== user.id);
      setFamilyKids(kids);
    } catch {
      setFamilyKids([]);
    }
  };

  const submitTrade = async () => {
    if (!selectedKid) {
      setTradeError(t('calendar.selectHero'));
      return;
    }
    setTradeSubmitting(true);
    setTradeError('');
    try {
      await api('/api/calendar/trade', {
        method: 'POST',
        body: {
          assignment_id: tradeAssignment.id,
          target_user_id: selectedKid,
        },
      });
      setTradeModal(false);
      fetchCalendar();
    } catch (err) {
      setTradeError(err.message || t('calendar.tradeFailed'));
    } finally {
      setTradeSubmitting(false);
    }
  };

  const removeAssignment = async (assignmentId, allFuture = false) => {
    setRemovingId(assignmentId);
    setRemoveTarget(null);
    try {
      const qs = allFuture ? '?all_future=true' : '';
      await api(`/api/calendar/assignments/${assignmentId}${qs}`, { method: 'DELETE' });
      fetchCalendar();
    } catch (err) {
      setError(err.message || t('calendar.removeError'));
    } finally {
      setRemovingId(null);
    }
  };

  const cleanupStale = async () => {
    setCleaning(true);
    setCleanMsg('');
    try {
      const data = await api('/api/chores/cleanup-all-stale', { method: 'POST' });
      setCleanMsg(data.message || t('calendar.cleanupComplete'));
      fetchCalendar();
    } catch (err) {
      setError(err.message || t('calendar.cleanupFailed'));
    } finally {
      setCleaning(false);
    }
  };

  const endDate = addDays(startDate, 6);
  const today = toISO(new Date());
  const isAtToday = startDate === today;
  const formatShortDate = (str) => {
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-cream text-lg font-semibold">
          {t('calendar.title')}
        </h1>

        {/* Week navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={prevWeek}
              className="p-2 rounded hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label={t('calendar.previousWeek')}
            >
              <ChevronLeft size={20} />
            </button>

            <span className="text-cream text-sm min-w-[140px] sm:min-w-[180px] text-center">
              {formatShortDate(startDate)} &ndash; {formatShortDate(endDate)}
            </span>

            <button
              onClick={nextWeek}
              className="p-2 rounded hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label={t('calendar.next7Days')}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {!isAtToday && (
            <button onClick={goToday} className="game-btn game-btn-blue">
              {t('common.today')}
            </button>
          )}

          {!isKid && allKids.length > 0 && (
            <select
              value={selectedKidFilter}
              onChange={(e) => setSelectedKidFilter(e.target.value)}
              className="bg-surface-raised text-cream text-sm rounded-md border border-border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">{t('calendar.allKids')}</option>
              {allKids.map((kid) => (
                <option key={kid.id} value={kid.id}>{kid.display_name}</option>
              ))}
            </select>
          )}

          {!isKid && (
            <button
              onClick={cleanupStale}
              disabled={cleaning}
              className="game-btn game-btn-red flex items-center gap-1"
              title={t('calendar.cleanUpHint')}
            >
              {cleaning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              {t('calendar.cleanUp')}
            </button>
          )}
        </div>
      </div>

      {/* Cleanup success message */}
      {cleanMsg && (
        <div className="mb-4 p-3 rounded-md border border-emerald/30 bg-emerald/10 text-emerald text-sm text-center">
          {cleanMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm text-center">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-accent animate-spin" />
        </div>
      )}

      {/* Calendar Grid — 7 days starting from startDate */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {Array.from({ length: 7 }, (_, i) => {
            const dayStr = addDays(startDate, i);
            const d = new Date(dayStr + 'T00:00:00');
            const label = t(SHORT_DAY_KEYS[d.getDay()]);
            const isToday = dayStr === today;
            const allDayAssignments = assignments[dayStr] || [];
            const dayAssignments = isKid
              ? allDayAssignments.filter((a) => a.user_id === user?.id)
              : allDayAssignments.filter(
                  (a) => !selectedKidFilter || a.user_id === Number(selectedKidFilter)
                );

            return (
              <div key={dayStr} className="min-w-0">
                {/* Day header */}
                <div
                  className={`text-center py-2 px-1 rounded-t-md border-b ${
                    isToday
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-surface-raised/30 border-border text-muted'
                  }`}
                >
                  <div className="text-xs font-medium">
                    {label}
                  </div>
                  <div className="text-sm mt-1">
                    {new Date(dayStr + 'T00:00:00').getDate()}
                  </div>
                </div>

                {/* Assignments */}
                <div className="space-y-2 mt-2 min-h-[80px]">
                  {dayAssignments.length === 0 && (
                    <p className="text-muted text-xs text-center py-4">
                      {t('calendar.noQuests')}
                    </p>
                  )}
                  {dayAssignments.map((a) => {
                    const style = statusStyle(a, dayStr);
                    return (
                      <div
                        key={a.id}
                        className={`game-panel !border ${style.border} ${style.bg} p-2 cursor-pointer hover:border-accent/40 transition-colors`}
                        onClick={() =>
                          navigate(`/chores/${a.chore_id || a.id}`)
                        }
                      >
                        <div className="flex items-start gap-1.5">
                          {style.icon}
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm leading-tight truncate ${
                                style.textClass || 'text-cream'
                              }`}
                            >
                              {themedTitle(a.chore?.title || a.chore_title || t('parentDashboard.chore'), colorTheme)}
                            </p>
                            {/* Show assigned kid for parents */}
                            {!isKid && (a.user?.display_name || a.assigned_to_name) && (
                              <p className="text-xs text-purple font-medium mt-0.5 truncate">
                                {a.user?.display_name || a.assigned_to_name}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Trade button for kids */}
                        {isKid && chore_trading_enabled && a.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openTrade(a);
                            }}
                            className="mt-1.5 flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                          >
                            <ArrowRightLeft size={12} />
                            {t('calendar.trade')}
                          </button>
                        )}

                        {/* Remove button for parents on pending assignments */}
                        {!isKid && a.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const isRecurring = a.chore?.recurrence && a.chore.recurrence !== 'once';
                              if (isRecurring) {
                                setRemoveTarget(a);
                              } else {
                                removeAssignment(a.id);
                              }
                            }}
                            disabled={removingId === a.id}
                            className="mt-1.5 flex items-center gap-1 text-xs font-medium text-crimson hover:text-crimson/80 transition-colors"
                          >
                            {removingId === a.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <X size={12} />
                            )}
                            {t('common.delete')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading &&
        !error &&
        Object.values(assignments).every((arr) => arr.length === 0) && (
          <div className="text-center py-16">
            <p className="text-muted text-sm">
              {t('calendar.noneScheduled')}
            </p>
          </div>
        )}

      {/* Trade Modal */}
      <Modal
        isOpen={tradeModal}
        onClose={() => setTradeModal(false)}
        title={t('calendar.proposeTrade')}
        actions={[
          {
            label: t('common.cancel'),
            onClick: () => setTradeModal(false),
            className: 'game-btn game-btn-red',
          },
          {
            label: tradeSubmitting ? t('calendar.sending') : t('calendar.sendTrade'),
            onClick: submitTrade,
            className: 'game-btn game-btn-blue',
            disabled: tradeSubmitting || !selectedKid,
          },
        ]}
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            {t('calendar.tradeIntro')}{' '}
            <span className="text-cream font-medium">
              {themedTitle(tradeAssignment?.chore?.title || tradeAssignment?.chore_title || t('parentDashboard.chore'), colorTheme)}
            </span>{' '}
            {t('calendar.tradeIntroEnd')}
          </p>

          {tradeError && (
            <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
              {tradeError}
            </div>
          )}

          {familyKids.length === 0 ? (
            <p className="text-muted text-sm">
              {t('calendar.noOtherMembers')}
            </p>
          ) : (
            <div className="space-y-2">
              {familyKids.map((kid) => (
                <button
                  key={kid.id}
                  onClick={() => setSelectedKid(kid.id)}
                  className={`w-full text-left p-3 rounded-md border transition-colors ${
                    selectedKid === kid.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-cream/30'
                  }`}
                >
                  <span className="text-sm">
                    {kid.display_name || kid.username}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Remove Recurring Quest Modal */}
      <Modal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title={t('calendar.removeRecurring')}
        actions={[
          {
            label: t('common.cancel'),
            onClick: () => setRemoveTarget(null),
            className: 'game-btn game-btn-blue',
          },
          {
            label: t('calendar.justThisOne'),
            onClick: () => removeAssignment(removeTarget?.id, false),
            className: 'game-btn game-btn-red',
          },
          {
            label: t('calendar.allFuture'),
            onClick: () => removeAssignment(removeTarget?.id, true),
            className: 'game-btn game-btn-red',
          },
        ]}
      >
        <p className="text-muted text-sm">
          <span className="text-cream font-bold">
            {themedTitle(removeTarget?.chore?.title || t('parentDashboard.chore'), colorTheme)}
          </span>{' '}
          {removeTarget?.user?.display_name
            ? t('calendar.recurringFor', { name: removeTarget.user.display_name })
            : t('calendar.recurring')}
        </p>
      </Modal>
    </div>
  );
}
