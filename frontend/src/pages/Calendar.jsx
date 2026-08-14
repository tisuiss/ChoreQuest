import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import Modal from '../components/Modal';
import ChoreIcon from '../components/ChoreIcon';
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
  CheckCircle2,
  SkipForward,
  XCircle,
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

function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(dateStr, mondayOffset);
}

// Date range covered by each view mode, anchored on `startDate`.
// day: just that date. week: 7 days from startDate (unchanged behaviour).
// month: the full calendar-grid range -- Monday of the week containing the
// 1st of the month through Sunday of the week containing the last day.
function getViewRange(viewMode, startDate) {
  if (viewMode === 'day') {
    return { days: [startDate] };
  }
  if (viewMode === 'month') {
    const d = new Date(startDate + 'T00:00:00');
    const firstOfMonth = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
    const lastOfMonth = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const gridStart = mondayOf(firstOfMonth);
    const gridEnd = addDays(mondayOf(lastOfMonth), 6);
    const days = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return { days };
  }
  // week
  return { days: Array.from({ length: 7 }, (_, i) => addDays(startDate, i)) };
}

const SHORT_DAY_KEYS = ['calendar.days.sun', 'calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed', 'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat'];
const MONDAY_FIRST_DAY_KEYS = ['calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed', 'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat', 'calendar.days.sun'];

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

// Group a day's assignments by category (sorted by parent-defined display
// order within each category), preserving first-appearance order for the
// groups themselves -- same pattern as KidDashboard.jsx/Chores.jsx.
function groupByCategory(dayAssignments, t) {
  const sorted = [...dayAssignments].sort((a, b) => {
    const catA = a.chore?.category?.id ?? 0;
    const catB = b.chore?.category?.id ?? 0;
    if (catA !== catB) return catA - catB;
    return (a.chore?.sort_order ?? 0) - (b.chore?.sort_order ?? 0);
  });

  const groups = [];
  const groupByKey = new Map();
  sorted.forEach((assignment) => {
    const cat = assignment.chore?.category;
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
  return groups;
}

export default function Calendar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { chore_trading_enabled } = useSettings();
  const { colorTheme } = useTheme();
  const isKid = user?.role === 'kid';

  const [startDate, setStartDate] = useState(() => toISO(new Date()));
  const [viewMode, setViewMode] = useState('week'); // 'day' | 'week' | 'month'
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
  const [actionLoading, setActionLoading] = useState(null); // `${assignmentId}:${action}`
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState('');

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // The backend requires week_start to be a Monday. The displayed range
      // (a single day, 7 days, or a full month grid) can span several
      // Mon-Sun weeks, so fetch each covered week and merge the results.
      const { days } = getViewRange(viewMode, startDate);
      const byDay = {};
      for (const day of days) byDay[day] = [];

      const mondays = [];
      let cursor = mondayOf(days[0]);
      const lastMonday = mondayOf(days[days.length - 1]);
      while (cursor <= lastMonday) {
        mondays.push(cursor);
        cursor = addDays(cursor, 7);
      }

      let firstError = null;
      for (const monday of mondays) {
        try {
          const data = await api(`/api/calendar?week_start=${monday}`);
          for (const day of days) {
            if (data.days?.[day]) byDay[day] = data.days[day];
          }
        } catch (err) {
          firstError = firstError || err;
        }
      }
      if (firstError && Object.values(byDay).every((arr) => arr.length === 0)) {
        throw firstError;
      }
      setAssignments(byDay);
    } catch (err) {
      setError(err.message || t('calendar.loadError'));
    } finally {
      setLoading(false);
    }
  }, [startDate, viewMode, t]);

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

  const goPrev = () => {
    if (viewMode === 'day') setStartDate(addDays(startDate, -1));
    else if (viewMode === 'month') setStartDate(addMonths(startDate, -1));
    else setStartDate(addDays(startDate, -7));
  };
  const goNext = () => {
    if (viewMode === 'day') setStartDate(addDays(startDate, 1));
    else if (viewMode === 'month') setStartDate(addMonths(startDate, 1));
    else setStartDate(addDays(startDate, 7));
  };
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

  const handleVerify = async (assignmentId) => {
    setActionLoading(`${assignmentId}:verify`);
    try {
      await api(`/api/chores/assignments/${assignmentId}/verify`, { method: 'POST' });
      fetchCalendar();
    } catch (err) {
      setError(err.message || t('choreDetail.verifyError'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUncomplete = async (assignmentId) => {
    setActionLoading(`${assignmentId}:uncomplete`);
    try {
      await api(`/api/chores/assignments/${assignmentId}/uncomplete`, { method: 'POST' });
      fetchCalendar();
    } catch (err) {
      setError(err.message || t('choreDetail.uncompleteError'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (assignmentId) => {
    setActionLoading(`${assignmentId}:skip`);
    try {
      await api(`/api/chores/assignments/${assignmentId}/skip`, { method: 'POST' });
      fetchCalendar();
    } catch (err) {
      setError(err.message || t('choreDetail.skipError'));
    } finally {
      setActionLoading(null);
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
  const periodLabel = () => {
    if (viewMode === 'day') {
      return new Date(startDate + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short',
      });
    }
    if (viewMode === 'month') {
      return new Date(startDate + 'T00:00:00').toLocaleDateString(undefined, {
        month: 'long', year: 'numeric',
      });
    }
    return `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;
  };

  const renderDayColumn = (dayStr) => {
    const d = new Date(dayStr + 'T00:00:00');
    const label = t(SHORT_DAY_KEYS[d.getDay()]);
    const isToday = dayStr === today;
    const allDayAssignments = assignments[dayStr] || [];
    const dayAssignments = isKid
      ? allDayAssignments.filter((a) => a.user_id === user?.id)
      : allDayAssignments.filter(
          (a) => !selectedKidFilter || a.user_id === Number(selectedKidFilter)
        );
    const dayGroups = groupByCategory(dayAssignments, t);

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

        {/* Assignments, grouped by category and sorted by display order */}
        <div className="space-y-3 mt-2 min-h-[80px]">
          {dayAssignments.length === 0 && (
            <p className="text-muted text-xs text-center py-4">
              {t('calendar.noQuests')}
            </p>
          )}
          {dayGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center gap-1 px-0.5">
                <div
                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${group.colour}26`, color: group.colour }}
                >
                  <ChoreIcon name={group.icon} size={10} />
                </div>
                <span className="text-muted text-[10px] font-semibold uppercase truncate">
                  {group.name}
                </span>
              </div>
              {group.items.map((a) => {
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

                    {/* Parent actions */}
                    {!isKid && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {(a.status === 'pending' || a.status === 'completed') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVerify(a.id);
                            }}
                            disabled={actionLoading === `${a.id}:verify`}
                            className="flex items-center gap-1 text-xs font-medium text-emerald hover:text-emerald/80 transition-colors"
                          >
                            {actionLoading === `${a.id}:verify` ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={12} />
                            )}
                            {a.status === 'pending' ? t('choreDetail.validateForKid') : t('choreDetail.verify')}
                          </button>
                        )}
                        {a.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSkip(a.id);
                            }}
                            disabled={actionLoading === `${a.id}:skip`}
                            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-cream transition-colors"
                          >
                            {actionLoading === `${a.id}:skip` ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <SkipForward size={12} />
                            )}
                            {t('choreDetail.skipToday')}
                          </button>
                        )}
                        {(a.status === 'completed' || a.status === 'verified') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUncomplete(a.id);
                            }}
                            disabled={actionLoading === `${a.id}:uncomplete`}
                            className="flex items-center gap-1 text-xs font-medium text-gold hover:text-gold/80 transition-colors"
                          >
                            {actionLoading === `${a.id}:uncomplete` ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <XCircle size={12} />
                            )}
                            {t('choreDetail.uncomplete')}
                          </button>
                        )}
                        {a.status === 'pending' && (
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
                            className="flex items-center gap-1 text-xs font-medium text-crimson hover:text-crimson/80 transition-colors"
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
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMonthCell = (dayStr) => {
    const d = new Date(dayStr + 'T00:00:00');
    const isToday = dayStr === today;
    const inCurrentMonth = new Date(startDate + 'T00:00:00').getMonth() === d.getMonth();
    const allDayAssignments = assignments[dayStr] || [];
    const dayAssignments = isKid
      ? allDayAssignments.filter((a) => a.user_id === user?.id)
      : allDayAssignments.filter(
          (a) => !selectedKidFilter || a.user_id === Number(selectedKidFilter)
        );
    const total = dayAssignments.length;
    const doneCount = dayAssignments.filter(
      (a) => a.status === 'verified' || a.status === 'completed'
    ).length;
    const visible = dayAssignments.slice(0, 3);
    const overflow = dayAssignments.length - visible.length;

    return (
      <div
        key={dayStr}
        onClick={() => {
          setViewMode('day');
          setStartDate(dayStr);
        }}
        className={`min-h-[90px] p-1.5 rounded-md border cursor-pointer transition-colors ${
          isToday ? 'border-accent bg-accent/5' : 'border-border/50 bg-surface-raised/10 hover:border-border'
        } ${!inCurrentMonth ? 'opacity-40' : ''}`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-medium ${isToday ? 'text-accent' : 'text-cream'}`}>
            {d.getDate()}
          </span>
          {total > 0 && (
            <span className="text-[9px] text-muted">{doneCount}/{total}</span>
          )}
        </div>
        <div className="space-y-0.5">
          {visible.map((a) => {
            const isDone = a.status === 'verified' || a.status === 'completed';
            const isSkipped = a.status === 'skipped';
            return (
              <p
                key={a.id}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/chores/${a.chore_id || a.id}`);
                }}
                className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${
                  isDone
                    ? 'bg-emerald/10 text-emerald'
                    : isSkipped
                      ? 'bg-cream/5 text-muted line-through'
                      : 'bg-gold/10 text-gold'
                }`}
              >
                {themedTitle(a.chore?.title || a.chore_title || t('parentDashboard.chore'), colorTheme)}
              </p>
            );
          })}
          {overflow > 0 && (
            <p className="text-[9px] text-muted px-1">
              {t('calendar.more', { count: overflow })}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-cream text-lg font-semibold">
          {t('calendar.title')}
        </h1>

        {/* Navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 bg-navy/60 rounded-md p-0.5">
            {[
              { id: 'day', label: t('calendar.viewDay') },
              { id: 'week', label: t('calendar.viewWeek') },
              { id: 'month', label: t('calendar.viewMonth') },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setViewMode(opt.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === opt.id
                    ? 'bg-surface-raised text-cream'
                    : 'text-muted hover:text-cream'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              className="p-2 rounded hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label={t('calendar.previousWeek')}
            >
              <ChevronLeft size={20} />
            </button>

            <span className="text-cream text-sm min-w-[140px] sm:min-w-[180px] text-center capitalize">
              {periodLabel()}
            </span>

            <button
              onClick={goNext}
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

      {/* Calendar Grid — day/week columns, or month grid */}
      {!loading && viewMode !== 'month' && (
        <div className={viewMode === 'day' ? 'max-w-md mx-auto' : 'grid grid-cols-1 md:grid-cols-7 gap-3'}>
          {viewMode === 'day'
            ? renderDayColumn(startDate)
            : Array.from({ length: 7 }, (_, i) => renderDayColumn(addDays(startDate, i)))}
        </div>
      )}

      {!loading && viewMode === 'month' && (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {MONDAY_FIRST_DAY_KEYS.map((k) => (
              <div key={k} className="text-center text-muted text-[10px] font-semibold uppercase py-1">
                {t(k)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {getViewRange('month', startDate).days.map((dayStr) => renderMonthCell(dayStr))}
          </div>
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
