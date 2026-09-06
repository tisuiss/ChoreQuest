import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Swords, Loader2, ListChecks, ChevronLeft, ChevronRight, Plus, X,
  UtensilsCrossed, Star, Pencil, ArrowLeft, CalendarDays, Images,
  ListTodo, Check,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import AvatarDisplay from '../components/AvatarDisplay';

const MEMBER_COLORS = ['accent', 'gold', 'purple', 'emerald', 'crimson'];

const SECTION_TABS = [
  { id: 'kids', labelKey: 'familyZone.kidsTab', icon: ListChecks },
  { id: 'calendar', labelKey: 'familyZone.calendarTab', icon: CalendarDays },
  { id: 'menu', labelKey: 'familyZone.menuTab', icon: UtensilsCrossed },
  { id: 'todo', labelKey: 'familyZone.todoTab', icon: ListTodo },
  { id: 'stars', labelKey: 'familyZone.starsTitle', icon: Star },
];

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function startOfWeek(d) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() - ((nd.getDay() + 6) % 7));
  nd.setHours(0, 0, 0, 0);
  return nd;
}
function colorForMember(memberId) {
  if (memberId == null) return 'sky';
  return MEMBER_COLORS[memberId % MEMBER_COLORS.length];
}

export default function FamilyZone() {
  const { t, i18n } = useTranslation();
  const { kioskLogin } = useAuth();
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

  // ---------------------------------------------------------------------
  // Kids quick access
  // ---------------------------------------------------------------------
  const [layoutMode, setLayoutMode] = useState('grid');
  const [activeSection, setActiveSection] = useState('kids');
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

  useEffect(() => {
    (async () => {
      try {
        const data = await api('/api/kiosk/settings');
        applyDefaultIfUnset(data?.default_language);
        if (data?.family_zone_default_view === 'month') setViewMode('month');
        if (data?.family_zone_layout === 'tabs') setLayoutMode('tabs');
      } catch { /* non-critical */ }
    })();
  }, [applyDefaultIfUnset]);

  const resetPinEntry = () => {
    setSelectedKid(null);
    setPin(['', '', '', '']);
    setPinError('');
  };

  const attemptLogin = useCallback(async (kidId, pinStr) => {
    setSubmitting(true);
    setPinError('');
    try {
      await kioskLogin(kidId, pinStr || null);
      navigate('/');
    } catch (err) {
      setPinError(err.message || t('kiosk.invalidPin'));
      setPin(['', '', '', '']);
      pinRefs.current[0]?.focus();
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
  const [monthCursor, setMonthCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState('');
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', date: '', time: '', member_id: '' });
  const [savingEvent, setSavingEvent] = useState(false);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api('/api/family-zone/members');
        setMembers(Array.isArray(data) ? data : []);
      } catch { /* the "for" dropdown just falls back to empty */ }
    })();
  }, []);

  const parentMembers = members.filter((m) => m.role === 'parent' || m.role === 'admin');
  const kidMembers = members.filter((m) => m.role === 'kid');

  const rangeStart = viewMode === 'week' ? weekStart : startOfWeek(monthCursor);
  const rangeEnd = viewMode === 'week' ? addDays(weekStart, 6) : addDays(startOfWeek(monthCursor), 41);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api(`/api/family-zone/events?start=${ymd(rangeStart)}&end=${ymd(rangeEnd)}`);
      setEvents(Array.isArray(data) ? data : []);
      setEventsError('');
    } catch (err) {
      setEventsError(err.message || t('familyZone.loadEventsError'));
    }
  }, [rangeStart, rangeEnd, t]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const eventsFor = (dateStr) =>
    events.filter((e) => e.date === dateStr).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  const today = new Date();

  const openEventModal = () => {
    const refDate = viewMode === 'week' ? today : monthCursor;
    setEventForm({ title: '', date: ymd(refDate), time: '', member_id: '' });
    setShowEventModal(true);
  };

  const submitEvent = async (e) => {
    e.preventDefault();
    if (!eventForm.title.trim() || !eventForm.date) return;
    setSavingEvent(true);
    try {
      await api('/api/family-zone/events', {
        method: 'POST',
        body: {
          title: eventForm.title.trim(),
          date: eventForm.date,
          time: eventForm.time || null,
          member_id: eventForm.member_id ? Number(eventForm.member_id) : null,
        },
      });
      const d = new Date(`${eventForm.date}T00:00:00`);
      if (viewMode === 'week') setWeekStart(startOfWeek(d));
      else setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      setShowEventModal(false);
      await fetchEvents();
    } catch (err) {
      setEventsError(err.message || t('familyZone.addEventError'));
    } finally {
      setSavingEvent(false);
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
  // Weekly menu
  // ---------------------------------------------------------------------
  const [menuWeekStart, setMenuWeekStart] = useState(() => startOfWeek(new Date()));
  const [menu, setMenu] = useState([]);
  const [menuError, setMenuError] = useState('');
  const [editingDish, setEditingDish] = useState(null);
  const [dishDraft, setDishDraft] = useState('');
  const [savingDish, setSavingDish] = useState(false);

  const fetchMenu = useCallback(async () => {
    try {
      const data = await api(`/api/family-zone/menu?week_start=${ymd(menuWeekStart)}`);
      setMenu(Array.isArray(data) ? data : []);
      setMenuError('');
    } catch (err) {
      setMenuError(err.message || t('familyZone.menuLoadError'));
    }
  }, [menuWeekStart, t]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  const menuGoPrev = () => setMenuWeekStart((w) => addDays(w, -7));
  const menuGoNext = () => setMenuWeekStart((w) => addDays(w, 7));
  const menuWeekEnd = addDays(menuWeekStart, 6);
  const menuRangeLabel = t('familyZone.weekOf', {
    start: menuWeekStart.getDate(),
    end: menuWeekEnd.getDate(),
    month: monthFmt.format(menuWeekEnd),
  });

  const dishFor = (dateStr) => menu.find((m) => m.date === dateStr)?.dish || '';

  const startEditDish = (dateStr) => {
    setEditingDish(dateStr);
    setDishDraft(dishFor(dateStr));
  };

  const saveDish = async (dateStr) => {
    setSavingDish(true);
    try {
      await api('/api/family-zone/menu', { method: 'PUT', body: { date: dateStr, dish: dishDraft.trim() } });
      await fetchMenu();
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
      await api('/api/family-zone/todos', { method: 'POST', body: { text } });
      setNewTodoText('');
      await fetchTodos();
    } catch (err) {
      setTodosError(err.message || t('familyZone.todoAddError'));
    } finally {
      setAddingTodo(false);
    }
  };

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
  const menuDays = Array.from({ length: 7 }, (_, i) => addDays(menuWeekStart, i));

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

      {eventsError && (
        <div className="mb-3 p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-xs">
          {eventsError}
        </div>
      )}

      {viewMode === 'week' ? (
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {weekDays.map((d) => {
            const dStr = ymd(d);
            const isToday = sameDate(d, today);
            const dayEvts = eventsFor(dStr);
            return (
              <div
                key={dStr}
                className={`rounded-md border p-2 min-h-[150px] flex flex-col gap-1.5 ${
                  isToday ? 'border-accent bg-accent/5' : 'border-border bg-navy'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-accent-light' : 'text-muted'}`}>
                    {weekdayFmt.format(d)}
                  </span>
                  <span className={`text-xs font-bold font-mono ${isToday ? 'text-accent-light' : 'text-cream'}`}>
                    {d.getDate()}
                  </span>
                </div>
                {dayEvts.map((e) => (
                  <div key={e.id} className="rounded bg-surface-raised px-1.5 py-1 text-[10.5px] leading-tight border-l-2" style={{ borderColor: `var(--color-${colorForMember(e.member_id)})` }}>
                    {e.time && <span className="block font-mono text-muted text-[9px]">{e.time.slice(0, 5)}</span>}
                    <span className="text-cream font-medium">{e.title}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {monthDays.slice(0, 7).map((d, i) => (
            <div key={i} className="text-[10px] font-bold uppercase tracking-wide text-muted text-center pb-1">
              {weekdayFmt.format(d)}
            </div>
          ))}
          {monthDays.map((d) => {
            const dStr = ymd(d);
            const outside = d.getMonth() !== monthCursor.getMonth();
            const isToday = sameDate(d, today);
            const dayEvts = eventsFor(dStr);
            const shown = dayEvts.slice(0, 2);
            const rest = dayEvts.length - shown.length;
            return (
              <div
                key={dStr}
                className={`rounded-md border p-1 min-h-[64px] sm:min-h-[76px] flex flex-col gap-0.5 ${
                  outside ? 'opacity-35' : ''
                } ${isToday ? 'border-accent bg-accent/5' : 'border-border bg-navy'}`}
              >
                <span className={`text-[11px] font-bold font-mono ${isToday ? 'text-accent-light' : 'text-cream'}`}>{d.getDate()}</span>
                {shown.map((e) => (
                  <div key={e.id} className="hidden sm:block rounded bg-surface-raised px-1 py-[1px] text-[9px] leading-tight truncate border-l-2" style={{ borderColor: `var(--color-${colorForMember(e.member_id)})` }}>
                    {e.title}
                  </div>
                ))}
                {rest > 0 && <span className="hidden sm:block text-[9px] text-muted pl-0.5">+{rest}</span>}
              </div>
            );
          })}
        </div>
      )}
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
      <div className="flex flex-col">
        {menuDays.map((d) => {
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
    </div>
  );

  const todoSection = (
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
      <form onSubmit={addTodo} className="flex gap-2 mb-3">
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
      </form>
      {todos.length === 0 ? (
        <p className="text-muted text-xs">{t('familyZone.todoEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
          {todos.map((item) => (
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
          ))}
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

  return (
    <div className="min-h-screen bg-navy p-4 md:p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
            <Swords size={17} className="text-navy" />
          </div>
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
        </div>

        {layoutMode === 'tabs' ? (
          <>
            <div className="flex items-center gap-0.5 bg-navy/60 rounded-md p-0.5 mb-5 overflow-x-auto">
              {SECTION_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSection(tab.id)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      activeSection === tab.id ? 'bg-surface-raised text-cream' : 'text-muted hover:text-cream'
                    }`}
                  >
                    <Icon size={14} className={activeSection === tab.id ? 'text-accent' : ''} />
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>
            {activeSection === 'kids' && kidsSection}
            {activeSection === 'calendar' && calendarSection}
            {activeSection === 'menu' && menuSection}
            {activeSection === 'todo' && todoSection}
            {activeSection === 'stars' && starsSection}
          </>
        ) : (
          <>
            {kidsSection}
            <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
              {calendarSection}
              <div className="flex flex-col gap-4">
                {menuSection}
                {todoSection}
                {starsSection}
              </div>
            </div>
          </>
        )}

        <p className="text-center mt-8 text-muted text-sm">
          <Link to="/login" className="text-accent hover:text-accent-light font-medium transition-colors">
            {t('kiosk.parentLogin')}
          </Link>
        </p>
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

      {/* Add event modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowEventModal(false); }}>
          <div className="game-panel w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-cream text-sm font-bold">{t('familyZone.addEventTitle')}</p>
              <button onClick={() => setShowEventModal(false)} className="text-muted hover:text-cream">
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
              <div className="flex gap-2.5 mb-3">
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
              </div>
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
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowEventModal(false)} className="game-btn !bg-transparent !border !border-border text-muted hover:text-cream">
                  {t('familyZone.cancel')}
                </button>
                <button type="submit" disabled={savingEvent} className="game-btn game-btn-blue flex items-center gap-1.5">
                  {savingEvent && <Loader2 size={13} className="animate-spin" />}
                  {t('familyZone.add')}
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
