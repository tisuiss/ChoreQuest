import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Loader2, ListChecks, ChevronLeft, ChevronRight, Plus, X,
  UtensilsCrossed, Star, Pencil, ArrowLeft, CalendarDays, Images,
  ListTodo, Check, LayoutDashboard, LogIn, Cake, CalendarPlus, Trash2,
  GraduationCap, BookOpen, Clock, AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import AvatarDisplay from '../components/AvatarDisplay';
import AppLogo from '../components/AppLogo';
import ChoreIcon from '../components/ChoreIcon';

// Picked from the Family Zone event form; a birthday auto-added to the
// calendar always gets 'cake' regardless of this list. Kebab-case names --
// each must exist in lucide-react (ChoreIcon falls back to a plain dot
// otherwise) since they're resolved dynamically, not imported one by one.
const EVENT_ICON_OPTIONS = [
  'cake', 'gift', 'party-popper', 'cocktail',
  'tooth', 'cross', 'stethoscope',
  'book-open', 'graduation-cap', 'pencil',
  'football', 'dumbbell', 'music', 'clapperboard',
  'plane', 'car', 'bike', 'scissors',
];

// Fixed, theme-independent colors only (unlike "accent"/"sky", which shift
// with the family's chosen color theme and could visually collide with one
// of these) -- offered as the calendar color picker's palette (+ "sky" as a
// 15th, deliberately-picked-only option -- see Settings.jsx).
const MEMBER_COLORS = [
  'gold', 'purple', 'emerald', 'crimson', 'rose', 'cyan', 'amber', 'lime',
  'indigo', 'teal', 'orange', 'fuchsia', 'blue', 'pink',
];

// A small color swatch with the label's first letter inside -- used in the
// calendar legend so each color is identifiable even without reading the
// name next to it (e.g. at a glance from across the room on a wall display).
function ColorDot({ color, label }) {
  return (
    <span
      className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white leading-none [text-shadow:0_1px_1px_rgba(0,0,0,0.45)]"
      style={{ background: `var(--color-${color})` }}
    >
      {label?.trim().charAt(0).toUpperCase()}
    </span>
  );
}

const SIDEBAR_ITEMS = [
  { id: 'dashboard', labelKey: 'familyZone.navDashboard', icon: LayoutDashboard },
  { id: 'menu', labelKey: 'familyZone.navMenu', icon: UtensilsCrossed },
  { id: 'todo', labelKey: 'familyZone.navTodo', icon: ListTodo },
  { id: 'birthdays', labelKey: 'familyZone.navBirthdays', icon: Cake },
  { id: 'school', labelKey: 'familyZone.navSchool', icon: GraduationCap },
];

// Duration presets (minutes) offered on the add-event form.
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

// "HH:MM" (+ duration) -> "HH:MM–HH:MM", or just "HH:MM" without a duration.
function formatEventTimeRange(timeStr, durationMinutes) {
  const start = timeStr.slice(0, 5);
  if (!durationMinutes) return start;
  const [h, m] = timeStr.split(':').map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const endM = String(totalMin % 60).padStart(2, '0');
  return `${start}–${endH}:${endM}`;
}

// 90 -> "1h30", 60 -> "1h", 15 -> "15 min" -- abbreviated, reads fine in
// both French and English without needing pluralized translation strings.
function formatDurationLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
// Next occurrence (this year, or next if already passed) of a birthday's
// month/day, relative to todayStart (a local midnight Date).
function nextOccurrence(birthday, todayStart) {
  let occ = new Date(todayStart.getFullYear(), birthday.month - 1, birthday.day);
  if (occ < todayStart) occ = new Date(todayStart.getFullYear() + 1, birthday.month - 1, birthday.day);
  return occ;
}
function startOfWeek(d) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() - ((nd.getDay() + 6) % 7));
  nd.setHours(0, 0, 0, 0);
  return nd;
}
export default function FamilyZone() {
  const { t, i18n } = useTranslation();
  const { kioskLogin, user } = useAuth();
  const { applyDefaultIfUnset } = useLanguage();
  const navigate = useNavigate();

  const weekdayFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }),
    [i18n.language]
  );
  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: 'long' }),
    [i18n.language]
  );
  const fullDateFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }),
    [i18n.language]
  );

  // ---------------------------------------------------------------------
  // Left-hand navigation (kids quick-access always stays above it)
  // ---------------------------------------------------------------------
  const [sidebarView, setSidebarView] = useState('dashboard'); // 'dashboard' | 'menu' | 'todo'

  // ---------------------------------------------------------------------
  // Kids quick access
  // ---------------------------------------------------------------------
  const [kids, setKids] = useState([]);
  const [kidsError, setKidsError] = useState('');
  const [selectedKid, setSelectedKid] = useState(null);
  const [pin, setPin] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pinRefs = useRef([]);

  const fetchKids = useCallback(async () => {
    try {
      const data = await api('/api/kiosk/kids');
      const next = Array.isArray(data) ? data : [];
      setKids((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setKidsError('');
    } catch (err) {
      setKidsError(err.message || t('familyZone.loadKidsError'));
    }
  }, [t]);

  useEffect(() => {
    fetchKids();
    const interval = setInterval(fetchKids, 20000);
    return () => clearInterval(interval);
  }, [fetchKids]);

  // {"family"|"parents"|"kids"|"<user id>": "<color name>"} overrides set
  // from the family settings page -- entries with no override fall back to
  // a fixed default (see colorForEntity below).
  const [colorMap, setColorMap] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const data = await api('/api/kiosk/settings');
        applyDefaultIfUnset(data?.default_language);
        if (data?.family_zone_default_view === 'month') setViewMode('month');
        try {
          setColorMap(JSON.parse(data?.calendar_colors || '{}') || {});
        } catch { /* malformed setting -- keep defaults */ }
      } catch { /* non-critical */ }
    })();
  }, [applyDefaultIfUnset]);

  // family: whole-family events (member_id and target_group both null).
  // parents/kids: generic group targets. Anything else is a specific
  // member's numeric id (as a string key). An explicit override from
  // colorMap always wins; otherwise groups get a fixed default and
  // individual members cycle through the fixed palette by id.
  const GROUP_DEFAULT_COLORS = { family: 'sky', parents: 'purple', kids: 'emerald' };
  const colorForEntity = (key) => {
    if (colorMap[key]) return colorMap[key];
    if (GROUP_DEFAULT_COLORS[key]) return GROUP_DEFAULT_COLORS[key];
    const id = Number(key);
    return MEMBER_COLORS[Number.isFinite(id) ? id % MEMBER_COLORS.length : 0];
  };
  const colorForEvent = (e) => {
    if (e.target_group) return colorForEntity(e.target_group);
    if (e.member_id == null) return colorForEntity('family');
    return colorForEntity(String(e.member_id));
  };

  const resetPinEntry = () => {
    setSelectedKid(null);
    setPin(['', '', '', '']);
    setPinError('');
  };

  const attemptLogin = useCallback(async (kidId, pinStr) => {
    setSubmitting(true);
    setPinError('');
    setKidsError('');
    try {
      await kioskLogin(kidId, pinStr || null);
      navigate('/');
    } catch (err) {
      // Two different places show the error depending on which flow failed:
      // the PIN pad (selectedKid open) uses pinError; a PIN-less kid clicked
      // directly from the grid has no PIN pad open, so surface it via the
      // kids-list banner instead of failing silently.
      if (pinStr !== null) {
        setPinError(err.message || t('kiosk.invalidPin'));
        setPin(['', '', '', '']);
        pinRefs.current[0]?.focus();
      } else {
        setKidsError(err.message || t('kiosk.invalidPin'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [kioskLogin, navigate, t]);

  const handleKidTileClick = (kid) => {
    if (submitting) return;
    if (kid.has_pin) {
      setSelectedKid(kid);
      setPin(['', '', '', '']);
      setPinError('');
      setTimeout(() => pinRefs.current[0]?.focus(), 50);
    } else {
      attemptLogin(kid.id, null);
    }
  };

  const handlePinChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    setPin((prev) => {
      const next = [...prev];
      next[index] = value;
      if (value && index === 3 && next.every((d) => d !== '')) {
        attemptLogin(selectedKid.id, next.join(''));
      }
      return next;
    });
    if (value && index < 3) pinRefs.current[index + 1]?.focus();
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) pinRefs.current[index - 1]?.focus();
  };

  // ---------------------------------------------------------------------
  // Calendar
  // ---------------------------------------------------------------------
  const [viewMode, setViewMode] = useState('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  // Day shown in the "day detail" panel next to the calendar -- defaults to
  // today, but clicking any day cell (week or month view) shows that day
  // there instead.
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [monthCursor, setMonthCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState('');
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null); // null = creating
  const emptyEventForm = { title: '', date: '', time: '', duration_minutes: '60', all_day: false, member_id: '', icon: '', repeat_frequency: '', repeat_until: '' };
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [savingEvent, setSavingEvent] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [members, setMembers] = useState([]);

  const fetchMembers = useCallback(async () => {
    try {
      const data = await api('/api/family-zone/members');
      setMembers(Array.isArray(data) ? data : []);
    } catch { /* the "for" dropdown just falls back to empty */ }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // ---------------------------------------------------------------------
  // Birthdays -- a free-form list (any loved one, not just app members)
  // ---------------------------------------------------------------------
  const [birthdays, setBirthdays] = useState([]);
  const [birthdaysError, setBirthdaysError] = useState('');
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(null); // null = creating
  const [birthdayForm, setBirthdayForm] = useState({ name: '', day: '', month: '', year: '' });
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [deletingBirthdayId, setDeletingBirthdayId] = useState(null);
  const [addingBirthdayId, setAddingBirthdayId] = useState(null);
  const [birthdayMsg, setBirthdayMsg] = useState('');

  const fetchBirthdays = useCallback(async () => {
    try {
      const data = await api('/api/family-zone/birthdays');
      setBirthdays(Array.isArray(data) ? data : []);
      setBirthdaysError('');
    } catch (err) {
      setBirthdaysError(err.message || t('familyZone.birthdaysLoadError'));
    }
  }, [t]);

  useEffect(() => { fetchBirthdays(); }, [fetchBirthdays]);

  // École tab -- reads a cached snapshot the backend mirrors from
  // EcoleDirecte (~every 25 min). Poll modestly; the data barely moves.
  const [school, setSchool] = useState(null);
  const [schoolError, setSchoolError] = useState('');
  const fetchSchool = useCallback(async () => {
    try {
      const data = await api('/api/ecole/overview');
      setSchool(data);
      setSchoolError('');
    } catch (err) {
      setSchoolError(err.message || t('school.loadError'));
    }
  }, [t]);
  useEffect(() => {
    fetchSchool();
    const id = setInterval(fetchSchool, 120000);
    return () => clearInterval(id);
  }, [fetchSchool]);

  const openBirthdayModal = () => {
    setEditingBirthday(null);
    setBirthdayForm({ name: '', day: '', month: '', year: '' });
    setShowBirthdayModal(true);
  };

  const openEditBirthdayModal = (birthday) => {
    setEditingBirthday(birthday);
    setBirthdayForm({
      name: birthday.name,
      day: String(birthday.day),
      month: String(birthday.month),
      year: birthday.year != null ? String(birthday.year) : '',
    });
    setShowBirthdayModal(true);
  };

  const submitBirthday = async (e) => {
    e.preventDefault();
    if (!birthdayForm.name.trim() || !birthdayForm.day || !birthdayForm.month) return;
    setSavingBirthday(true);
    const body = {
      name: birthdayForm.name.trim(),
      day: Number(birthdayForm.day),
      month: Number(birthdayForm.month),
      year: birthdayForm.year ? Number(birthdayForm.year) : null,
    };
    try {
      if (editingBirthday) {
        await api(`/api/family-zone/birthdays/${editingBirthday.id}`, { method: 'PUT', body });
      } else {
        // Automatically populate the calendar with ~10 years of yearly
        // occurrences as soon as the birthday is entered -- "Add to
        // calendar" on each row stays available afterward to re-sync.
        const created = await api('/api/family-zone/birthdays', { method: 'POST', body });
        addBirthdayToCalendar(created);
      }
      setShowBirthdayModal(false);
      setEditingBirthday(null);
      await fetchBirthdays();
    } catch (err) {
      setBirthdaysError(err.message || t('familyZone.birthdaySaveError'));
    } finally {
      setSavingBirthday(false);
    }
  };

  const removeBirthday = async (id) => {
    setDeletingBirthdayId(id);
    try {
      await api(`/api/family-zone/birthdays/${id}`, { method: 'DELETE' });
      setBirthdays((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setBirthdaysError(err.message || t('familyZone.birthdayRemoveError'));
    } finally {
      setDeletingBirthdayId(null);
    }
  };

  const parentMembers = members.filter((m) => m.role === 'parent' || m.role === 'admin');
  const kidMembers = members.filter((m) => m.role === 'kid');

  const rangeStart = viewMode === 'week' ? weekStart : startOfWeek(monthCursor);
  const rangeEnd = viewMode === 'week' ? addDays(weekStart, 6) : addDays(startOfWeek(monthCursor), 41);
  // Stable primitive strings for the effect/callback deps below -- rangeStart
  // and rangeEnd above are new Date instances on every render, so depending
  // on them directly made fetchEvents/fetchCalendarMenu change identity (and
  // their effects re-fire) on every single render, an infinite fetch loop.
  const rangeStartStr = ymd(rangeStart);
  const rangeEndStr = ymd(rangeEnd);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api(`/api/family-zone/events?start=${rangeStartStr}&end=${rangeEndStr}`);
      setEvents(Array.isArray(data) ? data : []);
      setEventsError('');
    } catch (err) {
      setEventsError(err.message || t('familyZone.loadEventsError'));
    }
  }, [rangeStartStr, rangeEndStr, t]);

  // This screen is meant to stay open indefinitely (a wall display), so a
  // transient failure (e.g. the backend restarting during a deploy) must
  // not leave a stale error banner stuck forever -- poll every 20s like
  // kids/stars below, instead of only refetching when the viewed range
  // changes, so it self-heals on its own shortly after.
  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 20000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const eventsFor = (dateStr) =>
    events.filter((e) => e.date === dateStr).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  // Planned dinners shown directly in the calendar cells (week + month),
  // covering whichever range is currently visible -- separate from the
  // week-scoped `menu` state used by the meal-config modal below.
  const [calendarMenu, setCalendarMenu] = useState([]);

  const fetchCalendarMenu = useCallback(async () => {
    try {
      const data = await api(`/api/family-zone/menu?start=${rangeStartStr}&end=${rangeEndStr}`);
      setCalendarMenu(Array.isArray(data) ? data : []);
    } catch { /* calendar just omits dishes on failure */ }
  }, [rangeStartStr, rangeEndStr]);

  useEffect(() => {
    fetchCalendarMenu();
    const interval = setInterval(fetchCalendarMenu, 20000);
    return () => clearInterval(interval);
  }, [fetchCalendarMenu]);

  const dishForCalendar = (dateStr) => calendarMenu.find((m) => m.date === dateStr)?.dish || '';

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const openEventModal = () => {
    // Defaults to the selected day (itself defaulting to today), not the
    // 1st of whatever month is being browsed in month view.
    setEditingEvent(null);
    setEventForm({ ...emptyEventForm, date: ymd(selectedDay) });
    setShowEventModal(true);
  };

  const openEditEventModal = (event) => {
    setEditingEvent(event);
    setEventForm({
      title: event.title,
      date: event.date,
      time: event.time ? event.time.slice(0, 5) : '',
      duration_minutes: event.duration_minutes ? String(event.duration_minutes) : '',
      all_day: event.all_day,
      member_id: event.target_group || (event.member_id != null ? String(event.member_id) : ''),
      icon: event.icon || '',
      repeat_frequency: '',
      repeat_until: '',
    });
    setShowEventModal(true);
  };

  const submitEvent = async (e) => {
    e.preventDefault();
    if (!eventForm.title.trim() || !eventForm.date) return;
    setSavingEvent(true);
    // eventForm.member_id doubles as the "for" selection: '' (whole family),
    // 'parents' / 'kids' (generic group), or a member's numeric id as a string.
    const isGroup = eventForm.member_id === 'parents' || eventForm.member_id === 'kids';
    const body = {
      title: eventForm.title.trim(),
      date: eventForm.date,
      all_day: eventForm.all_day,
      time: eventForm.all_day ? null : (eventForm.time || null),
      duration_minutes: eventForm.all_day || !eventForm.duration_minutes ? null : Number(eventForm.duration_minutes),
      target_group: isGroup ? eventForm.member_id : null,
      member_id: !isGroup && eventForm.member_id ? Number(eventForm.member_id) : null,
      icon: eventForm.icon || null,
      repeat: eventForm.repeat_frequency && eventForm.repeat_until
        ? { frequency: eventForm.repeat_frequency, until: eventForm.repeat_until }
        : null,
    };
    try {
      if (editingEvent) {
        await api(`/api/family-zone/events/${editingEvent.id}`, { method: 'PUT', body });
      } else {
        await api('/api/family-zone/events', { method: 'POST', body });
      }
      const d = new Date(`${eventForm.date}T00:00:00`);
      if (viewMode === 'week') setWeekStart(startOfWeek(d));
      else setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      setShowEventModal(false);
      setEditingEvent(null);
      await fetchEvents();
    } catch (err) {
      setEventsError(err.message || t('familyZone.addEventError'));
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteEvent = async () => {
    if (!editingEvent) return;
    setDeletingEvent(true);
    try {
      await api(`/api/family-zone/events/${editingEvent.id}`, { method: 'DELETE' });
      setShowEventModal(false);
      setEditingEvent(null);
      await fetchEvents();
    } catch (err) {
      setEventsError(err.message || t('familyZone.deleteEventError'));
    } finally {
      setDeletingEvent(false);
    }
  };

  const goPrev = () => {
    if (viewMode === 'week') setWeekStart((w) => addDays(w, -7));
    else setMonthCursor((m) => addMonths(m, -1));
  };
  const goNext = () => {
    if (viewMode === 'week') setWeekStart((w) => addDays(w, 7));
    else setMonthCursor((m) => addMonths(m, 1));
  };

  const rangeLabel = viewMode === 'week'
    ? t('familyZone.weekOf', {
        start: weekStart.getDate(),
        end: addDays(weekStart, 6).getDate(),
        month: monthFmt.format(addDays(weekStart, 6)),
      })
    : `${monthFmt.format(monthCursor)} ${monthCursor.getFullYear()}`;

  // ---------------------------------------------------------------------
  // Menu (2-week view)
  // ---------------------------------------------------------------------
  const shortDateFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }),
    [i18n.language]
  );
  const MENU_SPAN_DAYS = 14;
  const [menuWeekStart, setMenuWeekStart] = useState(() => startOfWeek(new Date()));
  const [menu, setMenu] = useState([]);
  const [menuError, setMenuError] = useState('');
  const [editingDish, setEditingDish] = useState(null);
  const [dishDraft, setDishDraft] = useState('');
  const [savingDish, setSavingDish] = useState(false);

  const fetchMenu = useCallback(async () => {
    try {
      const data = await api(
        `/api/family-zone/menu?start=${ymd(menuWeekStart)}&end=${ymd(addDays(menuWeekStart, MENU_SPAN_DAYS - 1))}`
      );
      setMenu(Array.isArray(data) ? data : []);
      setMenuError('');
    } catch (err) {
      setMenuError(err.message || t('familyZone.menuLoadError'));
    }
  }, [menuWeekStart, t]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  const menuGoPrev = () => setMenuWeekStart((w) => addDays(w, -MENU_SPAN_DAYS));
  const menuGoNext = () => setMenuWeekStart((w) => addDays(w, MENU_SPAN_DAYS));
  const menuWeekEnd = addDays(menuWeekStart, MENU_SPAN_DAYS - 1);
  const menuRangeLabel = `${shortDateFmt.format(menuWeekStart)} – ${shortDateFmt.format(menuWeekEnd)}`;

  const dishFor = (dateStr) => menu.find((m) => m.date === dateStr)?.dish || '';

  const startEditDish = (dateStr) => {
    setEditingDish(dateStr);
    setDishDraft(dishFor(dateStr));
  };

  const saveDish = async (dateStr) => {
    setSavingDish(true);
    try {
      await api('/api/family-zone/menu', { method: 'PUT', body: { date: dateStr, dish: dishDraft.trim() } });
      await Promise.all([fetchMenu(), fetchCalendarMenu()]);
      setEditingDish(null);
    } catch (err) {
      setMenuError(err.message || t('familyZone.menuSaveError'));
    } finally {
      setSavingDish(false);
    }
  };

  // ---------------------------------------------------------------------
  // Stars
  // ---------------------------------------------------------------------
  const [stars, setStars] = useState([]);
  const [starsError, setStarsError] = useState('');

  const fetchStars = useCallback(async () => {
    try {
      const data = await api('/api/family-zone/stars');
      setStars(Array.isArray(data) ? data : []);
      setStarsError('');
    } catch (err) {
      setStarsError(err.message || t('familyZone.starsLoadError'));
    }
  }, [t]);

  useEffect(() => {
    fetchStars();
    const interval = setInterval(fetchStars, 20000);
    return () => clearInterval(interval);
  }, [fetchStars]);

  const topStars = stars.length > 0 ? Math.max(...stars.map((k) => k.points_balance), 1) : 1;

  // ---------------------------------------------------------------------
  // To-do list
  // ---------------------------------------------------------------------
  const [todos, setTodos] = useState([]);
  const [todosError, setTodosError] = useState('');
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoAssignee, setNewTodoAssignee] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);

  const fetchTodos = useCallback(async () => {
    try {
      const data = await api('/api/family-zone/todos');
      setTodos(Array.isArray(data) ? data : []);
      setTodosError('');
    } catch (err) {
      setTodosError(err.message || t('familyZone.todoLoadError'));
    }
  }, [t]);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const addTodo = async (e) => {
    e.preventDefault();
    const text = newTodoText.trim();
    if (!text) return;
    setAddingTodo(true);
    try {
      await api('/api/family-zone/todos', {
        method: 'POST',
        body: { text, assignee_id: newTodoAssignee ? Number(newTodoAssignee) : null },
      });
      setNewTodoText('');
      setNewTodoAssignee('');
      await fetchTodos();
    } catch (err) {
      setTodosError(err.message || t('familyZone.todoAddError'));
    } finally {
      setAddingTodo(false);
    }
  };

  const pendingTodoCount = todos.filter((it) => !it.is_done).length;

  const toggleTodo = async (item) => {
    setTodos((prev) => prev.map((it) => (it.id === item.id ? { ...it, is_done: !it.is_done } : it)));
    try {
      await api(`/api/family-zone/todos/${item.id}`, { method: 'PUT', body: { is_done: !item.is_done } });
    } catch (err) {
      setTodosError(err.message || t('familyZone.todoSaveError'));
      fetchTodos();
    }
  };

  const removeTodo = async (id) => {
    setTodos((prev) => prev.filter((it) => it.id !== id));
    try {
      await api(`/api/family-zone/todos/${id}`, { method: 'DELETE' });
    } catch (err) {
      setTodosError(err.message || t('familyZone.todoRemoveError'));
      fetchTodos();
    }
  };

  // ---------------------------------------------------------------------
  // Photo frame (guest mode)
  // ---------------------------------------------------------------------
  const [photoFrameOn, setPhotoFrameOn] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState('');
  const [slideIndex, setSlideIndex] = useState(0);

  const openPhotoFrame = async () => {
    setPhotoFrameOn(true);
    setPhotosError('');
    setPhotosLoading(true);
    try {
      const data = await api('/api/family-zone/photos');
      const list = Array.isArray(data) ? data : [];
      const shuffled = [...list];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setPhotos(shuffled);
      setSlideIndex(0);
    } catch (err) {
      setPhotosError(err.message || t('familyZone.loadPhotosError'));
    } finally {
      setPhotosLoading(false);
    }
  };

  const closePhotoFrame = () => setPhotoFrameOn(false);

  useEffect(() => {
    if (!photoFrameOn || photos.length < 2) return;
    const interval = setInterval(() => {
      setSlideIndex((i) => (i + 1) % photos.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [photoFrameOn, photos.length]);

  useEffect(() => {
    if (!photoFrameOn) return;
    const handleKey = (e) => { if (e.key === 'Escape') closePhotoFrame(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [photoFrameOn]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  const weekDays = viewMode === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : [];
  const monthDays = viewMode === 'month'
    ? Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(monthCursor), i))
    : [];
  const menuDays = Array.from({ length: MENU_SPAN_DAYS }, (_, i) => addDays(menuWeekStart, i));

  const kidsSection = (
    <>
      <p className="text-muted text-[11px] font-bold uppercase tracking-wider mb-2.5">
        {t('familyZone.kidsHeading')}
      </p>
      {kidsError && (
        <div className="mb-4 p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm">
          {kidsError}
        </div>
      )}
      {kids.length === 0 && !kidsError ? (
        <p className="text-muted text-sm mb-6">{t('familyZone.noKidsYet')}</p>
      ) : (
        <div className="flex flex-wrap gap-3 mb-6">
          {kids.map((kid) => (
            <button
              key={kid.id}
              onClick={() => handleKidTileClick(kid)}
              className="game-panel flex items-center gap-3 p-3 min-w-[210px] flex-1 text-left transition-colors"
            >
              <AvatarDisplay config={kid.avatar_config} photoUrl={kid.avatar_photo_url} size="md" name={kid.display_name} />
              <div className="min-w-0">
                <p className="text-cream text-sm font-semibold truncate">{kid.display_name}</p>
                <p className={`text-xs flex items-center gap-1 mt-0.5 ${kid.pending_chores > 0 ? 'text-gold-light' : 'text-emerald'}`}>
                  <ListChecks size={12} />
                  {kid.pending_chores > 0
                    ? t('kiosk.pendingChores', { count: kid.pending_chores })
                    : t('familyZone.allDone')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const calendarSection = (
    <div className="game-panel p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-cream text-sm font-bold flex items-center gap-1.5">
            <CalendarDays size={15} className="text-accent" />
            {t('familyZone.calendarTitle')}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <button onClick={goPrev} className="w-6 h-6 rounded-md border border-border bg-navy text-muted hover:text-cream hover:border-border-light flex items-center justify-center">
              <ChevronLeft size={13} />
            </button>
            <span className="text-muted text-xs min-w-[150px]">{rangeLabel}</span>
            <button onClick={goNext} className="w-6 h-6 rounded-md border border-border bg-navy text-muted hover:text-cream hover:border-border-light flex items-center justify-center">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-navy border border-border rounded-md p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('week')}
              className={`text-xs font-semibold px-2.5 py-1 rounded ${viewMode === 'week' ? 'bg-accent text-navy' : 'text-muted hover:text-cream'}`}
            >
              {t('familyZone.viewWeek')}
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`text-xs font-semibold px-2.5 py-1 rounded ${viewMode === 'month' ? 'bg-accent text-navy' : 'text-muted hover:text-cream'}`}
            >
              {t('familyZone.viewMonth')}
            </button>
          </div>
          <button onClick={openEventModal} className="game-btn game-btn-blue !py-1.5 !px-3 flex items-center gap-1.5 !text-xs">
            <Plus size={13} />
            {t('familyZone.addEvent')}
          </button>
        </div>
      </div>

      {/* Legend -- which color on the calendar belongs to whom */}
      {members.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 px-0.5">
          <span className="flex items-center gap-1.5 text-muted text-[clamp(10.5px,0.85vw,13px)]">
            <ColorDot color={colorForEntity('family')} label={t('familyZone.wholeFamily')} />
            {t('familyZone.wholeFamily')}
          </span>
          {parentMembers.length > 0 && (
            <span className="flex items-center gap-1.5 text-muted text-[clamp(10.5px,0.85vw,13px)]">
              <ColorDot color={colorForEntity('parents')} label={t('familyZone.parentsGroup')} />
              {t('familyZone.parentsGroup')}
            </span>
          )}
          {kidMembers.length > 0 && (
            <span className="flex items-center gap-1.5 text-muted text-[clamp(10.5px,0.85vw,13px)]">
              <ColorDot color={colorForEntity('kids')} label={t('familyZone.kidsGroup')} />
              {t('familyZone.kidsGroup')}
            </span>
          )}
          {members.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5 text-muted text-[clamp(10.5px,0.85vw,13px)]">
              <ColorDot color={colorForEntity(String(m.id))} label={m.display_name} />
              {m.display_name}
            </span>
          ))}
        </div>
      )}

      {eventsError && (
        <div className="mb-3 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {eventsError}
        </div>
      )}

      {viewMode === 'week' ? (
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-[clamp(6px,0.8vw,12px)]">
          {weekDays.map((d) => {
            const dStr = ymd(d);
            const isToday = sameDate(d, today);
            const isSelected = sameDate(d, selectedDay);
            const dayEvts = eventsFor(dStr);
            const dish = dishForCalendar(dStr);
            return (
              <button
                key={dStr}
                type="button"
                onClick={() => setSelectedDay(d)}
                className={`text-left rounded-md border p-[clamp(8px,1vw,14px)] min-h-[clamp(150px,15vw,240px)] flex flex-col gap-[clamp(5px,0.6vw,9px)] transition-colors hover:border-accent/60 ${
                  isSelected ? 'ring-1 ring-accent' : ''
                } ${isToday ? 'border-accent bg-accent/5' : 'border-border bg-navy'}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`text-[clamp(10px,0.75vw,13px)] font-bold uppercase tracking-wide ${isToday ? 'text-accent-light' : 'text-muted'}`}>
                    {weekdayFmt.format(d)}
                  </span>
                  <span className={`text-[clamp(12px,1.3vw,18px)] font-bold font-mono ${isToday ? 'text-accent-light' : 'text-cream'}`}>
                    {d.getDate()}
                  </span>
                </div>
                {dish && (
                  <div className="flex items-center gap-1 text-[clamp(10.5px,0.85vw,13px)] leading-tight text-muted">
                    <UtensilsCrossed size={10} className="text-accent flex-shrink-0" />
                    <span className="truncate">{dish}</span>
                  </div>
                )}
                {dayEvts.map((e) => (
                  <div key={e.id} className="rounded bg-surface-raised px-[clamp(6px,0.6vw,9px)] py-[clamp(4px,0.4vw,7px)] text-[clamp(10.5px,0.85vw,13px)] leading-tight border-l-2" style={{ borderColor: `var(--color-${colorForEvent(e)})` }}>
                    {e.all_day ? (
                      <span className="block font-mono text-accent-light text-[clamp(9px,0.7vw,11px)]">{t('familyZone.allDay')}</span>
                    ) : e.time && (
                      <span className="block font-mono text-muted text-[clamp(9px,0.7vw,11px)]">{formatEventTimeRange(e.time, e.duration_minutes)}</span>
                    )}
                    <span className="text-cream font-medium flex items-center gap-1">
                      {e.icon && <ChoreIcon name={e.icon} size={11} className="flex-shrink-0" />}
                      <span className="truncate">{e.title}</span>
                    </span>
                  </div>
                ))}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-[clamp(6px,0.7vw,10px)]">
          {monthDays.slice(0, 7).map((d, i) => (
            <div key={i} className="text-[clamp(10px,0.75vw,13px)] font-bold uppercase tracking-wide text-muted text-center pb-1">
              {weekdayFmt.format(d)}
            </div>
          ))}
          {monthDays.map((d) => {
            const dStr = ymd(d);
            const outside = d.getMonth() !== monthCursor.getMonth();
            const isToday = sameDate(d, today);
            const isSelected = sameDate(d, selectedDay);
            const isPast = d < todayStart;
            const dayEvts = eventsFor(dStr);
            const shown = dayEvts.slice(0, 4);
            const rest = dayEvts.length - shown.length;
            const dish = dishForCalendar(dStr);
            return (
              <button
                key={dStr}
                type="button"
                onClick={() => setSelectedDay(d)}
                className={`relative text-left rounded-md border p-[clamp(4px,0.5vw,8px)] min-h-[clamp(64px,9vw,130px)] flex flex-col gap-[clamp(2px,0.3vw,5px)] transition-colors hover:border-accent/60 ${
                  outside ? 'opacity-35' : ''
                } ${isSelected ? 'ring-1 ring-accent' : ''} ${isToday ? 'border-accent bg-accent/5' : 'border-border bg-navy'}`}
              >
                {isPast && (
                  <X size={36} strokeWidth={2.5} className="absolute inset-0 m-auto text-crimson/35 pointer-events-none" />
                )}
                <span className={`text-[clamp(11px,1vw,15px)] font-bold font-mono ${isToday ? 'text-accent-light' : 'text-cream'}`}>{d.getDate()}</span>
                {dish && (
                  <div className="hidden sm:flex items-center gap-0.5 text-[clamp(9px,0.7vw,11.5px)] leading-tight text-muted">
                    <UtensilsCrossed size={8} className="text-accent flex-shrink-0" />
                    <span className="truncate">{dish}</span>
                  </div>
                )}
                {shown.map((e) => (
                  <div key={e.id} className="hidden sm:flex items-center gap-0.5 rounded bg-surface-raised px-1 py-[1px] text-[clamp(9px,0.7vw,11.5px)] leading-tight border-l-2" style={{ borderColor: `var(--color-${colorForEvent(e)})` }}>
                    {e.icon && <ChoreIcon name={e.icon} size={8} className="flex-shrink-0" />}
                    <span className="truncate">{e.title}</span>
                  </div>
                ))}
                {rest > 0 && <span className="hidden sm:block text-[clamp(9px,0.7vw,11.5px)] text-muted pl-0.5">+{rest}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const isSelectedToday = sameDate(selectedDay, today);
  const todayDetailSection = (
    <div className="game-panel p-4">
      <p className="text-cream text-sm font-bold flex items-center gap-1.5 mb-1">
        <CalendarDays size={15} className="text-accent" />
        {isSelectedToday ? t('familyZone.todayDetailTitle') : t('familyZone.selectedDayTitle')}
      </p>
      <p className="text-muted text-xs mb-3 capitalize">{fullDateFmt.format(selectedDay)}</p>
      {dishForCalendar(ymd(selectedDay)) && (
        <div className="flex items-center gap-2 text-sm mb-3 pb-3 border-b border-border">
          <UtensilsCrossed size={14} className="text-accent flex-shrink-0" />
          <span className="text-cream">{dishForCalendar(ymd(selectedDay))}</span>
        </div>
      )}
      {(() => {
        const dayEvts = eventsFor(ymd(selectedDay));
        if (dayEvts.length === 0) {
          return <p className="text-muted text-sm">{t('familyZone.todayDetailEmpty')}</p>;
        }
        // All-day events first, then by start time -- entries sharing the
        // same start time (or all-day together) are grouped side by side.
        const sorted = [...dayEvts].sort((a, b) => {
          if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
          return (a.time || '99:99').localeCompare(b.time || '99:99');
        });
        const groups = [];
        sorted.forEach((e) => {
          const key = e.all_day ? 'allday' : (e.time || 'none');
          const last = groups[groups.length - 1];
          if (last && last.key === key) last.items.push(e);
          else groups.push({ key, items: [e] });
        });
        return (
          <div className="flex flex-col gap-2">
            {groups.map((g, gi) => (
              <div key={gi} className="flex gap-2">
                {g.items.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => openEditEventModal(e)}
                    className="flex-1 min-w-0 text-left rounded-md bg-surface-raised px-3 py-2 border-l-2 hover:brightness-125 transition-[filter]"
                    style={{ borderColor: `var(--color-${colorForEvent(e)})` }}
                  >
                    {e.all_day ? (
                      <span className="block font-mono text-accent-light text-xs mb-0.5">{t('familyZone.allDay')}</span>
                    ) : e.time && (
                      <span className="block font-mono text-muted text-xs mb-0.5">{formatEventTimeRange(e.time, e.duration_minutes)}</span>
                    )}
                    <span className="text-cream text-sm font-medium flex items-center gap-1.5">
                      {e.icon && <ChoreIcon name={e.icon} size={14} className="flex-shrink-0" />}
                      <span className="truncate">{e.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );

  const menuSection = (
    <div className="game-panel p-4">
      <p className="text-cream text-sm font-bold flex items-center gap-1.5">
        <UtensilsCrossed size={15} className="text-accent" />
        {t('familyZone.menuTitle')}
      </p>
      <div className="flex items-center gap-2 mt-1.5 mb-3">
        <button onClick={menuGoPrev} className="w-6 h-6 rounded-md border border-border bg-navy text-muted hover:text-cream hover:border-border-light flex items-center justify-center">
          <ChevronLeft size={13} />
        </button>
        <span className="text-muted text-xs">{menuRangeLabel}</span>
        <button onClick={menuGoNext} className="w-6 h-6 rounded-md border border-border bg-navy text-muted hover:text-cream hover:border-border-light flex items-center justify-center">
          <ChevronRight size={13} />
        </button>
      </div>
      {menuError && (
        <div className="mb-3 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {menuError}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6">
        {[menuDays.slice(0, 7), menuDays.slice(7, 14)].map((week, wi) => (
          <div key={wi} className="flex flex-col">
            {week.map((d) => {
              const dStr = ymd(d);
              const isToday = sameDate(d, today);
              const isEditing = editingDish === dStr;
              return (
                <div key={dStr} className={`flex items-center gap-2.5 py-2 border-t border-border first:border-t-0 ${isToday ? 'text-cream' : ''}`}>
                  <span className={`w-9 flex-shrink-0 text-[11px] font-bold uppercase ${isToday ? 'text-accent-light' : 'text-muted'}`}>
                    {weekdayFmt.format(d)}
                  </span>
                  {isEditing ? (
                    <input
                      autoFocus
                      className="field-input flex-1 !py-1 !text-sm"
                      value={dishDraft}
                      disabled={savingDish}
                      onChange={(e) => setDishDraft(e.target.value)}
                      onBlur={() => saveDish(dStr)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveDish(dStr); if (e.key === 'Escape') setEditingDish(null); }}
                    />
                  ) : (
                    <button
                      onClick={() => startEditDish(dStr)}
                      className={`flex-1 text-left text-sm flex items-center gap-1.5 group ${isToday ? 'font-semibold' : ''} ${dishFor(dStr) ? '' : 'text-muted italic'}`}
                    >
                      <span className="truncate">{dishFor(dStr) || t('familyZone.menuPlaceholder')}</span>
                      <Pencil size={11} className="text-muted opacity-0 group-hover:opacity-100 flex-shrink-0" />
                    </button>
                  )}
                  {isToday && !isEditing && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-navy bg-accent-light px-2 py-0.5 rounded-full flex-shrink-0">
                      {t('familyZone.menuToday')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  const todoAddForm = (
    <form onSubmit={addTodo} className="mb-4">
      <div className="flex gap-2 mb-2">
        <input
          className="field-input flex-1 !py-1.5 !text-sm"
          placeholder={t('familyZone.todoPlaceholder')}
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          disabled={addingTodo}
          maxLength={300}
        />
        <button
          type="submit"
          disabled={addingTodo || !newTodoText.trim()}
          className="game-btn game-btn-blue !py-1.5 !px-3 flex-shrink-0"
        >
          {addingTodo ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>
      <select
        className="field-input !py-1 !text-xs"
        value={newTodoAssignee}
        onChange={(e) => setNewTodoAssignee(e.target.value)}
        disabled={addingTodo}
      >
        <option value="">{t('familyZone.todoAssigneeNone')}</option>
        {parentMembers.length > 0 && (
          <optgroup label={t('familyZone.parentsGroup')}>
            {parentMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </optgroup>
        )}
        {kidMembers.length > 0 && (
          <optgroup label={t('familyZone.kidsGroup')}>
            {kidMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </optgroup>
        )}
      </select>
    </form>
  );

  const renderTodoRow = (item) => (
    <div key={item.id} className="flex items-center gap-2 group">
      <button
        onClick={() => toggleTodo(item)}
        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          item.is_done ? 'bg-accent border-accent' : 'border-border-light'
        }`}
        aria-label={t('familyZone.todoToggle')}
      >
        {item.is_done && <Check size={11} className="text-navy" />}
      </button>
      <span className={`flex-1 text-sm truncate ${item.is_done ? 'line-through text-muted' : 'text-cream'}`}>
        {item.text}
      </span>
      <button
        onClick={() => removeTodo(item.id)}
        className="text-muted hover:text-crimson opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-label={t('common.delete')}
      >
        <X size={14} />
      </button>
    </div>
  );

  // Compact per-member counts for the Dashboard -- every member shown even
  // with 0 pending items, tapping one jumps to the full To-do view.
  const todoSummarySection = (
    <div className="game-panel p-4">
      <p className="text-cream text-sm font-bold flex items-center gap-1.5 mb-3">
        <ListTodo size={15} className="text-accent" />
        {t('familyZone.todoTitle')}
      </p>
      {todosError && (
        <div className="mb-3 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {todosError}
        </div>
      )}
      {members.length === 0 ? (
        <p className="text-muted text-xs">{t('familyZone.noKidsYet')}</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {members.map((m) => {
            const count = todos.filter((it) => it.assignee_id === m.id && !it.is_done).length;
            return (
              <button
                key={m.id}
                onClick={() => setSidebarView('todo')}
                className="flex items-center gap-2.5 py-1.5 w-full text-left hover:opacity-80 transition-opacity"
              >
                <AvatarDisplay config={m.avatar_config} photoUrl={m.avatar_photo_url} size="sm" name={m.display_name} />
                <span className="flex-1 text-sm text-cream truncate">{m.display_name}</span>
                <span className={`text-xs font-bold min-w-[22px] text-center px-1.5 py-0.5 rounded-full ${
                  count > 0 ? 'bg-accent/15 text-accent' : 'bg-navy text-muted'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Full per-user cards for the dedicated To-do view.
  const todoByUserSection = (
    <div className="space-y-4">
      <div className="game-panel p-4">
        <p className="text-cream text-sm font-bold flex items-center gap-1.5 mb-3">
          <ListTodo size={15} className="text-accent" />
          {t('familyZone.todoTitle')}
        </p>
        {todosError && (
          <div className="mb-3 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
            {todosError}
          </div>
        )}
        {todoAddForm}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m) => {
          const items = todos.filter((it) => it.assignee_id === m.id);
          const pending = items.filter((it) => !it.is_done).length;
          return (
            <div key={m.id} className="game-panel p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <AvatarDisplay config={m.avatar_config} photoUrl={m.avatar_photo_url} size="sm" name={m.display_name} />
                <p className="text-cream text-sm font-semibold flex-1 truncate">{m.display_name}</p>
                <span className="text-muted text-xs flex-shrink-0">{pending}</span>
              </div>
              {items.length === 0 ? (
                <p className="text-muted text-xs">{t('familyZone.todoEmpty')}</p>
              ) : (
                <div className="flex flex-col gap-2">{items.map(renderTodoRow)}</div>
              )}
            </div>
          );
        })}
        {(() => {
          const unassigned = todos.filter((it) => it.assignee_id == null);
          if (unassigned.length === 0) return null;
          return (
            <div className="game-panel p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <p className="text-cream text-sm font-semibold flex-1">{t('familyZone.todoAssigneeNone')}</p>
                <span className="text-muted text-xs flex-shrink-0">{unassigned.filter((it) => !it.is_done).length}</span>
              </div>
              <div className="flex flex-col gap-2">{unassigned.map(renderTodoRow)}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );

  // Generates the next ~10 years of yearly occurrences at once (not just
  // the next one) -- called automatically right after a birthday is
  // created, and available on each row afterward to re-sync (e.g. if the
  // generated events were since deleted, or the birthday was edited).
  const addBirthdayToCalendar = async (birthday) => {
    setAddingBirthdayId(birthday.id);
    setBirthdayMsg('');
    try {
      const occ = nextOccurrence(birthday, todayStart);
      const until = new Date(todayStart.getFullYear() + 10, todayStart.getMonth(), todayStart.getDate());
      await api('/api/family-zone/events', {
        method: 'POST',
        body: {
          title: t('familyZone.birthdayEventTitle', { name: birthday.name }),
          date: ymd(occ),
          all_day: true,
          icon: 'cake',
          repeat: { frequency: 'yearly', until: ymd(until) },
        },
      });
      setBirthdayMsg(t('familyZone.birthdayAdded', { name: birthday.name }));
      await fetchEvents();
    } catch (err) {
      setBirthdayMsg(err.message || t('familyZone.addEventError'));
    } finally {
      setAddingBirthdayId(null);
    }
  };

  // Sorted by next upcoming occurrence, not the raw stored month/day.
  const sortedBirthdays = [...birthdays].sort(
    (a, b) => nextOccurrence(a, todayStart) - nextOccurrence(b, todayStart)
  );

  const birthdaysSection = (
    <div className="game-panel p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-cream text-sm font-bold flex items-center gap-1.5">
          <Cake size={15} className="text-accent" />
          {t('familyZone.navBirthdays')}
        </p>
        <button onClick={openBirthdayModal} className="game-btn game-btn-blue !py-1.5 !px-3 flex items-center gap-1.5 !text-xs flex-shrink-0">
          <Plus size={13} />
          {t('familyZone.addBirthday')}
        </button>
      </div>
      <p className="text-muted text-xs mb-3">{t('familyZone.birthdaysHint')}</p>
      {birthdaysError && (
        <div className="mb-3 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {birthdaysError}
        </div>
      )}
      {birthdayMsg && (
        <div className="mb-3 p-2 rounded-md border border-accent/30 bg-accent/10 text-accent text-xs">
          {birthdayMsg}
        </div>
      )}
      {sortedBirthdays.length === 0 ? (
        <p className="text-muted text-xs">{t('familyZone.birthdaysEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedBirthdays.map((b) => {
            const occ = nextOccurrence(b, todayStart);
            const age = b.year != null ? occ.getFullYear() - b.year : null;
            return (
              <div key={b.id} className="flex items-center gap-2.5 flex-wrap py-1.5 border-t border-border first:border-t-0 group">
                <span className="text-sm text-cream flex-1 min-w-[100px] truncate">{b.name}</span>
                <span className="text-muted text-xs flex-shrink-0">
                  {age != null
                    ? t('familyZone.birthdayNext', { date: shortDateFmt.format(occ), age })
                    : t('familyZone.birthdayNextNoAge', { date: shortDateFmt.format(occ) })}
                </span>
                <button
                  onClick={() => addBirthdayToCalendar(b)}
                  disabled={addingBirthdayId === b.id}
                  className="game-btn !bg-surface !border !border-border text-muted hover:text-cream !py-1 !px-2 !text-xs flex items-center gap-1 flex-shrink-0"
                >
                  {addingBirthdayId === b.id ? <Loader2 size={11} className="animate-spin" /> : <CalendarPlus size={11} />}
                  {t('familyZone.addToCalendar')}
                </button>
                <button
                  onClick={() => openEditBirthdayModal(b)}
                  className="text-muted hover:text-cream opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  aria-label={t('common.edit')}
                  title={t('common.edit')}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => removeBirthday(b.id)}
                  disabled={deletingBirthdayId === b.id}
                  className="text-muted hover:text-crimson opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  aria-label={t('common.delete')}
                >
                  {deletingBirthdayId === b.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const starsSection = (
    <div className="game-panel p-4">
      <p className="text-cream text-sm font-bold flex items-center gap-1.5 mb-3">
        <Star size={15} className="text-gold fill-gold" />
        {t('familyZone.starsTitle')}
      </p>
      {starsError && (
        <div className="mb-3 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {starsError}
        </div>
      )}
      {stars.length === 0 && !starsError ? (
        <p className="text-muted text-sm">{t('familyZone.noKidsYet')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {stars.map((kid, idx) => {
            const pct = topStars > 0 ? (kid.points_balance / topStars) * 100 : 0;
            const color = MEMBER_COLORS[idx % MEMBER_COLORS.length];
            return (
              <div key={kid.id} className="flex items-center gap-2.5">
                <span className={`w-5 text-center font-mono text-xs font-bold ${idx === 0 ? 'text-gold-light' : 'text-muted'}`}>
                  {idx + 1}
                </span>
                <span className="w-16 flex-shrink-0 text-xs font-semibold text-cream truncate">{kid.display_name}</span>
                <div className="flex-1 h-2 rounded-full bg-navy border border-border overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `var(--color-${color})` }} />
                </div>
                <span className="w-14 flex-shrink-0 text-right font-mono text-xs font-bold text-gold-light flex items-center justify-end gap-1">
                  {kid.points_balance} <Star size={10} className="fill-gold-light text-gold-light" />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ---- École tab ----------------------------------------------------------
  // Plain helper (not a nested component) so the subtree isn't remounted on
  // every poll re-render.
  const schoolBlock = (Icon, title, empty, children) => (
    <div>
      <p className="text-cream text-[11px] font-bold uppercase tracking-wide flex items-center gap-1 mb-1">
        <Icon size={11} className="text-accent" /> {title}
      </p>
      {empty ? <p className="text-muted text-[11px]">{t('school.nothingToShow')}</p> : children}
    </div>
  );

  const schoolTodayLessons = (timetable) => {
    const list = Array.isArray(timetable) ? timetable : [];
    const dayKey = ymd(today);
    const today_ = list.filter((l) => (l.start || '').slice(0, 10) === dayKey);
    if (today_.length) return today_;
    // Weekend / school break -> show the earliest upcoming day that has lessons.
    const future = list.filter((l) => (l.start || '').slice(0, 10) > dayKey);
    if (!future.length) return [];
    const nextDay = future.reduce((m, l) => (l.start < m ? l.start : m), future[0].start).slice(0, 10);
    return future.filter((l) => (l.start || '').slice(0, 10) === nextDay);
  };
  const schoolTime = (iso) => (iso || '').slice(11, 16);

  const schoolSection = (
    <div className="space-y-4">
      <div className="game-panel p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-cream text-sm font-bold flex items-center gap-1.5">
            <GraduationCap size={15} className="text-accent" />
            {t('school.title')}
          </p>
          {school?.last_sync_at && (
            <span className="text-muted text-[11px]">
              {t('school.lastSync', {
                date: new Date(school.last_sync_at).toLocaleString(i18n.language, {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                }),
              })}
            </span>
          )}
        </div>
        {schoolError && (
          <div className="mt-2 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
            {schoolError}
          </div>
        )}
        {school && !school.configured && (
          <p className="text-muted text-xs mt-2">{t('school.notConfigured')}</p>
        )}
        {school?.qcm_pending && (
          <div className="mt-2 p-2 rounded-md border border-gold/40 bg-gold/10 text-gold-light text-xs">
            {t('school.qcmPending')}
          </div>
        )}
        {school?.configured && school.last_error && !school.qcm_pending && (
          <div className="mt-2 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
            {t('school.syncError', { error: school.last_error })}
          </div>
        )}
      </div>

      {school?.configured && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(school.children || []).map((child) => {
            const s = (school.snapshot || {})[child.eleve_id] || {};
            const homework = (s.homework || []);
            const notes = (s.grades?.notes || []);
            const lessons = schoolTodayLessons(s.timetable);
            const vs = [
              ...(s.viescolaire?.absences_retards || []),
              ...(s.viescolaire?.sanctions || []),
            ];
            return (
              <div key={child.eleve_id} className="game-panel p-4 space-y-3">
                <div>
                  <p className="text-cream text-sm font-semibold">
                    {[child.prenom, child.nom].filter(Boolean).join(' ') || child.eleve_id}
                  </p>
                  {child.classe && <p className="text-muted text-[11px]">{child.classe}</p>}
                </div>
                {s.error && (
                  <p className="text-crimson text-[11px]">{s.error}</p>
                )}

                {schoolBlock(BookOpen, t('school.homework'), homework.length === 0, (
                  <ul className="space-y-1">
                    {homework.slice(0, 6).map((h, i) => (
                      <li key={i} className="text-[12px] leading-snug">
                        <span className="text-muted font-mono">{(h.date || '').slice(5)}</span>{' '}
                        <span className={`text-cream font-medium ${h.effectue ? 'line-through opacity-60' : ''}`}>
                          {h.matiere}
                        </span>
                        {h.interro && <span className="ml-1 text-crimson text-[10px]">{t('school.interro')}</span>}
                        {h.contenu && <span className="text-muted line-clamp-2"> — {h.contenu}</span>}
                      </li>
                    ))}
                  </ul>
                ))}

                {schoolBlock(ListChecks, t('school.grades'), notes.length === 0, (
                  <>
                    {s.grades?.periode?.periode && (
                      <p className="text-muted text-[10px] mb-1">{s.grades.periode.periode}</p>
                    )}
                    <ul className="space-y-1">
                      {notes.slice(0, 6).map((n, i) => (
                        <li key={i} className="text-[12px] leading-snug flex items-baseline gap-1.5">
                          <span className="text-cream font-bold font-mono">
                            {t('school.gradeValue', { value: n.valeur ?? '–', outOf: n.sur ?? '20' })}
                          </span>
                          <span className="text-cream truncate">{n.matiere}</span>
                          {n.moyenne_classe != null && (
                            <span className="text-muted text-[10px] flex-shrink-0">
                              {t('school.gradeClassAvg', { avg: n.moyenne_classe })}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ))}

                {schoolBlock(Clock, t('school.timetable'), lessons.length === 0, (
                  <ul className="space-y-1">
                    {lessons.map((l, i) => (
                      <li key={i} className={`text-[12px] leading-snug flex items-baseline gap-1.5 ${l.annule ? 'line-through opacity-60' : ''}`}>
                        <span className="text-muted font-mono flex-shrink-0">
                          {schoolTime(l.start)}–{schoolTime(l.end)}
                        </span>
                        <span className="text-cream truncate">{l.matiere}</span>
                        {l.salle && <span className="text-muted text-[10px] flex-shrink-0">{l.salle}</span>}
                        {l.annule && <span className="text-crimson text-[10px] flex-shrink-0">{t('school.timetableCancelled')}</span>}
                      </li>
                    ))}
                  </ul>
                ))}

                {schoolBlock(AlertTriangle, t('school.vieScolaire'), vs.length === 0, (
                  <ul className="space-y-1">
                    {vs.slice(0, 5).map((v, i) => (
                      <li key={i} className="text-[12px] leading-snug">
                        <span className="text-cream">{v.type || v.libelle}</span>
                        {v.display && <span className="text-muted"> · {v.display}</span>}
                        {v.type && /absence|retard/i.test(v.type) && (
                          <span className={`ml-1 text-[10px] ${v.justifie ? 'text-emerald' : 'text-crimson'}`}>
                            {v.justifie ? t('school.justified') : t('school.unjustified')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-navy p-4 md:p-6">
      <div className="w-full">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <AppLogo size={36} className="flex-shrink-0" />
          <div>
            <h1 className="text-cream text-base font-semibold leading-tight">{t('common.appName')}</h1>
            <p className="text-muted text-xs">{t('familyZone.subtitle')}</p>
          </div>
          <button
            onClick={openPhotoFrame}
            className="ml-auto game-btn !bg-surface !border !border-border text-muted hover:text-cream flex items-center gap-1.5 !text-xs"
          >
            <Images size={14} />
            {t('familyZone.photoFrame')}
          </button>
          <Link
            to={user ? '/' : '/login'}
            className="game-btn !bg-surface !border !border-border text-muted hover:text-cream flex items-center gap-1.5 !text-xs"
          >
            <LogIn size={14} />
            {user ? t('kiosk.backToDashboard') : t('kiosk.parentLogin')}
          </Link>
        </div>

        {kidsSection}

        <div className="flex flex-col md:flex-row gap-5 items-start">
          {/* Left nav -- kids quick access above always stays outside this row */}
          <aside className="w-full md:w-44 flex-shrink-0 flex md:flex-col gap-1 overflow-x-auto">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = sidebarView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSidebarView(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-surface-raised text-cream' : 'text-muted hover:text-cream hover:bg-surface-raised/50'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-accent' : ''} />
                  {t(item.labelKey)}
                  {item.id === 'todo' && pendingTodoCount > 0 && (
                    <span className="ml-auto bg-crimson text-white text-[10px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full px-1 leading-none">
                      {pendingTodoCount}
                    </span>
                  )}
                </button>
              );
            })}
          </aside>

          <div className="flex-1 min-w-0 w-full">
            {/* Right column keeps a comfortable, fluidly-sized reading
                width (clamped between 300-420px); the calendar naturally
                claims whatever space is left, so it keeps growing as the
                screen gets wider instead of jumping between fixed ratios. */}
            {sidebarView === 'dashboard' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_clamp(300px,26vw,420px)] gap-4 items-start">
                {calendarSection}
                <div className="flex flex-col gap-4">
                  {todayDetailSection}
                  {todoSummarySection}
                  {starsSection}
                </div>
              </div>
            )}
            {sidebarView === 'menu' && menuSection}
            {sidebarView === 'todo' && todoByUserSection}
            {sidebarView === 'birthdays' && birthdaysSection}
            {sidebarView === 'school' && schoolSection}
          </div>
        </div>
      </div>

      {/* PIN entry overlay */}
      {selectedKid && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="game-panel w-full max-w-sm p-6 flex flex-col items-center">
            <button onClick={resetPinEntry} className="self-start flex items-center gap-1.5 text-muted hover:text-cream text-sm mb-4 transition-colors">
              <ArrowLeft size={14} />
              {t('common.back')}
            </button>
            <AvatarDisplay config={selectedKid.avatar_config} photoUrl={selectedKid.avatar_photo_url} size="lg" name={selectedKid.display_name} />
            <p className="text-cream text-base font-semibold mt-3 mb-5">{selectedKid.display_name}</p>
            {pinError && (
              <div className="mb-4 p-2.5 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm">
                {pinError}
              </div>
            )}
            <div className="flex gap-2.5">
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (pinRefs.current[i] = el)}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={1}
                  value={digit}
                  disabled={submitting}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl bg-navy border border-border text-accent rounded-md font-bold focus:border-accent focus:outline-none transition-colors"
                />
              ))}
            </div>
            {submitting && <Loader2 size={18} className="text-accent animate-spin mt-4" />}
          </div>
        </div>
      )}

      {/* Add/edit event modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowEventModal(false); setEditingEvent(null); } }}>
          <div className="game-panel w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-cream text-sm font-bold">
                {editingEvent ? t('familyZone.editEventTitle') : t('familyZone.addEventTitle')}
              </p>
              <button onClick={() => { setShowEventModal(false); setEditingEvent(null); }} className="text-muted hover:text-cream">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitEvent}>
              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                  {t('familyZone.eventTitleLabel')}
                </label>
                <input
                  className="field-input"
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t('familyZone.eventTitlePlaceholder')}
                  required
                  maxLength={200}
                />
              </div>
              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                  {t('familyZone.iconLabel')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEventForm((f) => ({ ...f, icon: '' }))}
                    className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                      !eventForm.icon ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-border-light'
                    }`}
                    title={t('familyZone.iconNone')}
                    aria-label={t('familyZone.iconNone')}
                  >
                    <X size={14} />
                  </button>
                  {EVENT_ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setEventForm((f) => ({ ...f, icon }))}
                      className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                        eventForm.icon === icon ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-border-light'
                      }`}
                      title={icon}
                      aria-label={icon}
                    >
                      <ChoreIcon name={icon} size={15} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2.5 mb-3 items-end">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                    {t('familyZone.dateLabel')}
                  </label>
                  <input
                    type="date"
                    className="field-input"
                    value={eventForm.date}
                    onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none pb-2.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={eventForm.all_day}
                    onChange={(e) => setEventForm((f) => ({ ...f, all_day: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  {t('familyZone.allDay')}
                </label>
              </div>
              {!eventForm.all_day && (
                <div className="flex gap-2.5 mb-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                      {t('familyZone.timeLabel')}
                    </label>
                    <input
                      type="time"
                      className="field-input"
                      value={eventForm.time}
                      onChange={(e) => setEventForm((f) => ({ ...f, time: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                      {t('familyZone.durationLabel')}
                    </label>
                    <select
                      className="field-input"
                      value={eventForm.duration_minutes}
                      onChange={(e) => setEventForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                    >
                      <option value="">{t('familyZone.durationNone')}</option>
                      {DURATION_OPTIONS.map((min) => (
                        <option key={min} value={min}>{formatDurationLabel(min)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className="mb-4">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                  {t('familyZone.memberLabel')}
                </label>
                <select
                  className="field-input"
                  value={eventForm.member_id}
                  onChange={(e) => setEventForm((f) => ({ ...f, member_id: e.target.value }))}
                >
                  <option value="">{t('familyZone.wholeFamily')}</option>
                  {parentMembers.length > 0 && (
                    <optgroup label={t('familyZone.parentsGroup')}>
                      <option value="parents">{t('familyZone.allParents')}</option>
                      {parentMembers.map((m) => (
                        <option key={m.id} value={m.id}>{m.display_name}</option>
                      ))}
                    </optgroup>
                  )}
                  {kidMembers.length > 0 && (
                    <optgroup label={t('familyZone.kidsGroup')}>
                      <option value="kids">{t('familyZone.allKids')}</option>
                      {kidMembers.map((m) => (
                        <option key={m.id} value={m.id}>{m.display_name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="flex gap-2.5 mb-1 items-end">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                    {t('familyZone.repeatLabel')}
                  </label>
                  <select
                    className="field-input"
                    value={eventForm.repeat_frequency}
                    onChange={(e) => setEventForm((f) => ({ ...f, repeat_frequency: e.target.value }))}
                  >
                    <option value="">{t('familyZone.repeatNone')}</option>
                    <option value="daily">{t('familyZone.repeatDaily')}</option>
                    <option value="weekly">{t('familyZone.repeatWeekly')}</option>
                    <option value="monthly">{t('familyZone.repeatMonthly')}</option>
                    <option value="yearly">{t('familyZone.repeatYearly')}</option>
                  </select>
                </div>
                {eventForm.repeat_frequency && (
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                      {t('familyZone.repeatUntilLabel')}
                    </label>
                    <input
                      type="date"
                      className="field-input"
                      min={eventForm.date}
                      value={eventForm.repeat_until}
                      onChange={(e) => setEventForm((f) => ({ ...f, repeat_until: e.target.value }))}
                      required
                    />
                  </div>
                )}
              </div>
              {editingEvent && eventForm.repeat_frequency && (
                <p className="text-muted text-xs mb-3">{t('familyZone.repeatEditHint')}</p>
              )}
              <div className="flex items-center justify-between gap-2 mt-4">
                {editingEvent ? (
                  <button
                    type="button"
                    onClick={deleteEvent}
                    disabled={deletingEvent}
                    className="game-btn game-btn-red !py-2 !px-3 flex items-center gap-1.5 !text-xs"
                  >
                    {deletingEvent ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    {t('common.delete')}
                  </button>
                ) : <span />}
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowEventModal(false); setEditingEvent(null); }} className="game-btn !bg-transparent !border !border-border text-muted hover:text-cream">
                    {t('familyZone.cancel')}
                  </button>
                  <button type="submit" disabled={savingEvent} className="game-btn game-btn-blue flex items-center gap-1.5">
                    {savingEvent && <Loader2 size={13} className="animate-spin" />}
                    {editingEvent ? t('common.save') : t('familyZone.add')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/edit birthday modal */}
      {showBirthdayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowBirthdayModal(false); setEditingBirthday(null); } }}>
          <div className="game-panel w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-cream text-sm font-bold">
                {editingBirthday ? t('familyZone.editBirthdayTitle') : t('familyZone.addBirthdayTitle')}
              </p>
              <button onClick={() => { setShowBirthdayModal(false); setEditingBirthday(null); }} className="text-muted hover:text-cream">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitBirthday}>
              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                  {t('familyZone.birthdayNameLabel')}
                </label>
                <input
                  className="field-input"
                  value={birthdayForm.name}
                  onChange={(e) => setBirthdayForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('familyZone.birthdayNamePlaceholder')}
                  required
                  maxLength={100}
                />
              </div>
              <div className="flex gap-2.5 mb-1">
                <div className="w-16 flex-shrink-0">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                    {t('familyZone.birthdayDayLabel')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="field-input"
                    value={birthdayForm.day}
                    onChange={(e) => setBirthdayForm((f) => ({ ...f, day: e.target.value }))}
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                    {t('familyZone.birthdayMonthLabel')}
                  </label>
                  <select
                    className="field-input"
                    value={birthdayForm.month}
                    onChange={(e) => setBirthdayForm((f) => ({ ...f, month: e.target.value }))}
                    required
                  >
                    <option value="">—</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m} className="capitalize">
                        {monthFmt.format(new Date(2000, m - 1, 1))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24 flex-shrink-0">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                    {t('familyZone.birthdayYearLabel')}
                  </label>
                  <input
                    type="number"
                    min={1900}
                    max={2100}
                    className="field-input"
                    value={birthdayForm.year}
                    onChange={(e) => setBirthdayForm((f) => ({ ...f, year: e.target.value }))}
                    placeholder={t('familyZone.birthdayYearPlaceholder')}
                  />
                </div>
              </div>
              <p className="text-muted text-xs mb-4">{t('familyZone.birthdayYearHint')}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowBirthdayModal(false); setEditingBirthday(null); }} className="game-btn !bg-transparent !border !border-border text-muted hover:text-cream">
                  {t('familyZone.cancel')}
                </button>
                <button type="submit" disabled={savingBirthday} className="game-btn game-btn-blue flex items-center gap-1.5">
                  {savingBirthday && <Loader2 size={13} className="animate-spin" />}
                  {editingBirthday ? t('common.save') : t('familyZone.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo frame overlay (guest mode) */}
      {photoFrameOn && (
        <div className="fixed inset-0 bg-black z-[70] flex items-center justify-center" onClick={closePhotoFrame}>
          {photosLoading ? (
            <Loader2 size={28} className="text-accent animate-spin" />
          ) : photosError ? (
            <p className="text-crimson text-sm px-6 text-center">{photosError}</p>
          ) : photos.length === 0 ? (
            <div className="text-center px-6">
              <Images size={40} className="text-muted mx-auto mb-3" />
              <p className="text-cream text-sm font-medium">{t('familyZone.photoFrameEmpty')}</p>
              <p className="text-muted text-xs mt-1">{t('familyZone.photoFrameEmptyHint')}</p>
            </div>
          ) : (
            <img
              key={photos[slideIndex].id}
              src={photos[slideIndex].url}
              alt=""
              className="max-w-full max-h-full object-contain"
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); closePhotoFrame(); }}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label={t('familyZone.exitPhotoFrame')}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
