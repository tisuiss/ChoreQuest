import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const DAY_KEYS = [
  'calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed',
  'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat', 'calendar.days.sun',
];

// Local date components — toISOString() would shift the date by the UTC
// offset (e.g. back a day for UTC+1/+2 timezones like France).
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DatePicker({ value, onChange, min, placeholder }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  const minDate = parseISO(min);
  const [viewDate, setViewDate] = useState(selected || minDate || new Date());
  const containerRef = useRef(null);

  useEffect(() => {
    if (open) setViewDate(selected || minDate || new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
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
  const isDisabled = (d) => minDate && toISO(d) < toISO(minDate);

  const selectDay = (d) => {
    if (!d || isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
  };

  const displayLabel = selected
    ? selected.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : (placeholder || t('common.selectDate'));

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="field-input w-full flex items-center justify-between gap-2 text-left"
      >
        <span className={selected ? 'text-cream' : 'text-muted'}>{displayLabel}</span>
        <CalendarIcon size={14} className="text-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 p-3 rounded-lg border border-border bg-surface shadow-lg w-64">
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
            {DAY_KEYS.map((k) => (
              <span key={k} className="text-muted text-[9px] font-semibold uppercase text-center">
                {t(k)}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const iso = toISO(d);
              const disabled = isDisabled(d);
              const isSelected = value === iso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(d)}
                  className={`w-8 h-8 rounded-md text-xs flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-accent text-navy font-semibold'
                      : disabled
                        ? 'text-muted/30 cursor-not-allowed'
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
