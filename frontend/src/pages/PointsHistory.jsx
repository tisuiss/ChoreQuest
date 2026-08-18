import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import {
  History,
  Loader2,
  Star,
  Shield,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  Pencil,
} from 'lucide-react';
import Modal from '../components/Modal';
import ChoreIcon from '../components/ChoreIcon';
import ChoreManageModal from '../components/ChoreManageModal';

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

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(dateStr, mondayOffset);
}

const MINI_CAL_DAY_KEYS = [
  'calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed',
  'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat', 'calendar.days.sun',
];

// Compact popover calendar — click the day label in the day navigator to
// jump straight to any date, instead of stepping one day at a time.
function DayPickerPopover({ value, onChange, label, locale, t }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(value + 'T00:00:00'));
  const containerRef = useRef(null);

  useEffect(() => {
    if (open) setViewDate(new Date(value + 'T00:00:00'));
  }, [open, value]);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayIso = toISO(new Date());

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-cream text-sm min-w-[180px] text-center capitalize hover:text-accent transition-colors"
      >
        {label}
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 left-1/2 -translate-x-1/2 p-3 rounded-lg border border-border bg-surface shadow-lg w-64">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="p-1 text-muted hover:text-cream transition-colors"
              aria-label={t('common.previousMonth')}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-cream text-xs font-semibold capitalize">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="p-1 text-muted hover:text-cream transition-colors"
              aria-label={t('common.nextMonth')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {MINI_CAL_DAY_KEYS.map((k) => (
              <span key={k} className="text-muted text-[9px] font-semibold uppercase text-center">
                {t(k)}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const iso = toISO(d);
              const isSelected = value === iso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(iso); setOpen(false); }}
                  className={`w-8 h-8 rounded-md text-xs flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-accent text-navy font-semibold'
                      : isToday
                        ? 'border border-accent/50 text-cream hover:bg-surface-raised'
                        : 'text-cream hover:bg-surface-raised'
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Group a day's assignments by category (sorted by parent-defined display
// order within each category), preserving first-appearance order for the
// groups themselves -- same pattern as KidDashboard.jsx/Calendar.jsx.
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

function TransactionRow({ tx, showKidName, deleting, onDeleteClick, t }) {
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
      <button
        onClick={() => onDeleteClick(tx)}
        disabled={deleting}
        className="p-1.5 rounded-md text-muted hover:text-crimson hover:bg-crimson/10 transition-colors flex-shrink-0"
        title={t('pointsHistory.deleteEntry')}
      >
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>
    </div>
  );
}

const STATUS_BUTTONS = [
  { status: 'pending', labelKey: 'pointsHistory.statusToDo', icon: Clock, activeClass: 'border-gold bg-gold/10 text-gold' },
  { status: 'verified', labelKey: 'pointsHistory.statusDone', icon: CheckCircle2, activeClass: 'border-emerald bg-emerald/10 text-emerald' },
  { status: 'skipped', malus: true, labelKey: 'pointsHistory.statusNotDone', icon: XCircle, activeClass: 'border-crimson bg-crimson/10 text-crimson' },
  { status: 'skipped', malus: false, labelKey: 'pointsHistory.statusSkip', icon: SkipForward, activeClass: 'border-border bg-surface-raised text-cream' },
];

function TaskStatusRow({ assignment, showKidName, statusLoading, onSetStatus, onManage, colorTheme, t }) {
  const chore = assignment.chore;
  return (
    <div className="p-2.5 rounded-md border border-border/50 bg-surface-raised/20">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-cream text-sm truncate">
            {themedTitle(chore?.title || t('parentDashboard.chore'), colorTheme)}
          </p>
          {showKidName && (
            <p className="text-purple text-xs font-medium truncate">{assignment.user?.display_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="flex items-center gap-1 text-gold text-xs font-medium">
            <Star size={10} fill="currentColor" />
            {chore?.points ?? 0}
          </span>
          {chore && (
            <button
              onClick={() => onManage(chore)}
              className="p-1 rounded-md text-muted hover:text-cream hover:bg-surface-raised transition-colors"
              aria-label={t('chores.manage')}
              title={t('chores.manage')}
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_BUTTONS.map((btn) => {
          const key = `${assignment.id}:${btn.status}:${btn.malus ? 1 : 0}`;
          const isActive = btn.status === 'skipped'
            ? assignment.status === 'skipped'
            : assignment.status === btn.status;
          const Icon = btn.icon;
          const loading = statusLoading === key;
          return (
            <button
              key={key}
              onClick={() => onSetStatus(assignment, btn.status, btn.malus)}
              disabled={!!statusLoading}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium transition-colors ${
                isActive ? btn.activeClass : 'border-border text-muted hover:border-border-light hover:text-cream'
              } ${statusLoading && !loading ? 'opacity-50' : ''}`}
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
              {t(btn.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PointsHistory() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { decline_malus_mode } = useSettings();
  const { colorTheme } = useTheme();
  const isParent = user?.role === 'parent' || user?.role === 'admin';
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';

  const [tab, setTab] = useState('tasks'); // 'tasks' | 'transactions'
  const [kids, setKids] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedKidFilter, setSelectedKidFilter] = useState('');

  // ---- tasks tab ----
  const [taskDate, setTaskDate] = useState(() => toISO(new Date()));
  const [dayAssignments, setDayAssignments] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const [statusLoading, setStatusLoading] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState(new Set()); // closed by default
  const [managingChore, setManagingChore] = useState(null);

  const toggleCategory = (key) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ---- transactions tab ----
  const [transactions, setTransactions] = useState([]);
  const [resetSettings, setResetSettings] = useState({ enabled: false, cadence: 'monthly', weekday: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!isParent) return;
    api('/api/stats/family').then((data) => setKids(Array.isArray(data) ? data : [])).catch(() => setKids([]));
    api('/api/chores/categories')
      .then((data) => setCategories(Array.isArray(data) ? data : data.categories || []))
      .catch(() => setCategories([]));
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

  const fetchDayAssignments = useCallback(async () => {
    if (!isParent) return;
    setTasksLoading(true);
    setTasksError('');
    try {
      const data = await api(`/api/calendar?week_start=${mondayOf(taskDate)}`);
      const all = (data.days && data.days[taskDate]) || [];
      const filtered = selectedKidFilter
        ? all.filter((a) => a.user_id === Number(selectedKidFilter))
        : all;
      setDayAssignments(filtered);
    } catch (err) {
      setTasksError(err.message || t('pointsHistory.loadError'));
    } finally {
      setTasksLoading(false);
    }
  }, [isParent, taskDate, selectedKidFilter, t]);

  useEffect(() => {
    fetchDayAssignments();
  }, [fetchDayAssignments]);

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
    const handler = () => {
      fetchDayAssignments();
      fetchHistory();
    };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchDayAssignments, fetchHistory]);

  const handleSetStatus = async (assignment, status, malus) => {
    const key = `${assignment.id}:${status}:${malus ? 1 : 0}`;
    setStatusLoading(key);
    try {
      await api(`/api/chores/assignments/${assignment.id}/set-status`, {
        method: 'POST',
        body: { status, malus: status === 'skipped' ? (malus ?? decline_malus_mode === 'malus') : false },
      });
      await fetchDayAssignments();
    } catch (err) {
      setTasksError(err.message || t('pointsHistory.statusError'));
    } finally {
      setStatusLoading(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const txId = deleteTarget.id;
    setDeletingId(txId);
    try {
      await api(`/api/points/family/history/${txId}`, { method: 'DELETE' });
      setTransactions((prev) => prev.filter((tx) => tx.id !== txId));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || t('pointsHistory.deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

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

  const dayLabel = new Date(taskDate + 'T00:00:00').toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const isToday = taskDate === toISO(new Date());
  const taskGroups = groupByCategory(dayAssignments, t);

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

      {/* Tab switcher */}
      <div className="flex items-center gap-0.5 bg-navy/60 rounded-md p-0.5 max-w-xs">
        {[
          { id: 'tasks', label: t('pointsHistory.tabTasks') },
          { id: 'transactions', label: t('pointsHistory.tabTransactions') },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setTab(opt.id)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === opt.id ? 'bg-surface-raised text-cream' : 'text-muted hover:text-cream'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {tab === 'tasks' ? (
        <div className="space-y-4">
          {/* Day navigator */}
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => setTaskDate((d) => addDays(d, -1))}
              className="p-2 rounded hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label={t('pointsHistory.previousDay')}
            >
              <ChevronLeft size={20} />
            </button>
            <DayPickerPopover value={taskDate} onChange={setTaskDate} label={dayLabel} locale={locale} t={t} />
            <button
              onClick={() => setTaskDate((d) => addDays(d, 1))}
              className="p-2 rounded hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label={t('pointsHistory.nextDay')}
            >
              <ChevronRight size={20} />
            </button>
            {!isToday && (
              <button
                onClick={() => setTaskDate(toISO(new Date()))}
                className="game-btn game-btn-blue !py-1.5 !px-3 ml-2"
              >
                {t('common.today')}
              </button>
            )}
          </div>

          {tasksError && (
            <div className="p-3 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm text-center">
              {tasksError}
            </div>
          )}

          {tasksLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="text-accent animate-spin" />
            </div>
          ) : taskGroups.length === 0 ? (
            <div className="game-panel p-10 text-center">
              <Star size={36} className="mx-auto text-muted mb-3" />
              <p className="text-muted text-sm">{t('pointsHistory.noTasksThisDay')}</p>
            </div>
          ) : (
            <div className="space-y-5">
              {taskGroups.map((group) => {
                const isExpanded = expandedCategories.has(group.key);
                return (
                <div key={group.key} className="space-y-2">
                  <button
                    onClick={() => toggleCategory(group.key)}
                    className="flex items-center gap-2 px-1 w-full text-left hover:opacity-80 transition-opacity"
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-muted flex-shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-muted flex-shrink-0" />
                    )}
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${group.colour}26`, color: group.colour }}
                    >
                      <ChoreIcon name={group.icon} size={13} />
                    </div>
                    <h2 className="text-cream text-sm font-semibold">{group.name}</h2>
                    <span className="text-muted text-xs">({group.items.length})</span>
                  </button>
                  {isExpanded && (
                  <div className="space-y-1.5">
                    {group.items.map((assignment) => (
                      <TaskStatusRow
                        key={assignment.id}
                        assignment={assignment}
                        showKidName={!selectedKidFilter}
                        statusLoading={statusLoading}
                        onSetStatus={handleSetStatus}
                        onManage={setManagingChore}
                        colorTheme={colorTheme}
                        t={t}
                      />
                    ))}
                  </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
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
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        showKidName={!selectedKidFilter}
                        deleting={deletingId === tx.id}
                        onDeleteClick={setDeleteTarget}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  showKidName={!selectedKidFilter}
                  deleting={deletingId === tx.id}
                  onDeleteClick={setDeleteTarget}
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('pointsHistory.deleteEntry')}
        actions={[
          {
            label: t('common.cancel'),
            onClick: () => setDeleteTarget(null),
            className: 'game-btn game-btn-blue',
          },
          {
            label: deletingId ? t('common.saving') : t('common.delete'),
            onClick: confirmDelete,
            className: 'game-btn game-btn-red',
            disabled: !!deletingId,
          },
        ]}
      >
        <p className="text-muted text-sm">
          {t('pointsHistory.deleteConfirm', {
            description: deleteTarget?.description,
            amount: deleteTarget?.amount > 0 ? `+${deleteTarget?.amount}` : deleteTarget?.amount,
          })}
        </p>
      </Modal>

      {/* Chore management */}
      <ChoreManageModal
        isOpen={!!managingChore}
        onClose={() => setManagingChore(null)}
        onChanged={fetchDayAssignments}
        chore={managingChore}
        kids={kids}
        categories={categories}
      />
    </div>
  );
}
