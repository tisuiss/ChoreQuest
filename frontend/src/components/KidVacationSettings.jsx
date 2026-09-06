import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { Palmtree, Trash2, Plus, Loader2 } from 'lucide-react';
import DatePicker from './DatePicker';

export default function KidVacationSettings() {
  const { t } = useTranslation();
  const [kids, setKids] = useState([]);
  const [vacations, setVacations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [kidId, setKidId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [family, list] = await Promise.all([
        api('/api/stats/family'),
        api('/api/vacation/kids'),
      ]);
      setKids(Array.isArray(family) ? family : []);
      setVacations(Array.isArray(list) ? list : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const create = async () => {
    if (!kidId || !startDate || !endDate) return;
    setSaving(true);
    setError('');
    try {
      await api('/api/vacation/kids', {
        method: 'POST',
        body: { user_id: Number(kidId), start_date: startDate, end_date: endDate },
      });
      setShowForm(false);
      setKidId('');
      setStartDate('');
      setEndDate('');
      fetchData();
    } catch (err) {
      setError(err.message || t('vacation.createError'));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id) => {
    try {
      await api(`/api/vacation/kids/${id}`, { method: 'DELETE' });
      fetchData();
    } catch {
      // ignore
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const nameFor = (v) =>
    v.user_display_name ||
    kids.find((k) => k.id === v.user_id)?.display_name ||
    `#${v.user_id}`;

  return (
    <div className="game-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-cream text-sm font-bold flex items-center gap-2">
          <Palmtree size={16} className="text-emerald" />
          {t('kidVacation.title')}
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs text-accent hover:text-accent-light transition-colors font-medium flex items-center gap-1"
        >
          <Plus size={12} />
          {showForm ? t('common.cancel') : t('vacation.schedule')}
        </button>
      </div>

      <p className="text-muted text-xs mb-3">{t('kidVacation.description')}</p>

      {showForm && (
        <div className="mb-4 p-3 rounded-lg bg-surface-raised/50 border border-border/50 space-y-3">
          <div>
            <label className="text-muted text-[10px] font-semibold uppercase">
              {t('kidVacation.child')}
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {kids.map((kid) => (
                <button
                  key={kid.id}
                  type="button"
                  onClick={() => setKidId(String(kid.id))}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    kidId === String(kid.id)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-border-light'
                  }`}
                >
                  {kid.display_name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted text-[10px] font-semibold uppercase">{t('vacation.start')}</label>
              <div className="mt-1">
                <DatePicker value={startDate} onChange={setStartDate} min={today} />
              </div>
            </div>
            <div>
              <label className="text-muted text-[10px] font-semibold uppercase">{t('vacation.end')}</label>
              <div className="mt-1">
                <DatePicker value={endDate} onChange={setEndDate} min={startDate || today} />
              </div>
            </div>
          </div>
          {error && <p className="text-crimson text-xs">{error}</p>}
          <button
            onClick={create}
            disabled={saving || !kidId || !startDate || !endDate}
            className="game-btn game-btn-blue w-full flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Palmtree size={12} />}
            {t('vacation.scheduleVacation')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="text-accent animate-spin" />
        </div>
      ) : vacations.length === 0 ? (
        <p className="text-muted text-xs text-center py-2">{t('vacation.noneScheduled')}</p>
      ) : (
        <div className="space-y-2">
          {vacations.map((v) => {
            const isPast = v.end_date < today;
            const isActive = v.start_date <= today && v.end_date >= today;
            return (
              <div
                key={v.id}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                  isActive
                    ? 'border-emerald/30 bg-emerald/5'
                    : isPast
                      ? 'border-border/30 bg-surface-raised/20 opacity-60'
                      : 'border-border/50 bg-surface-raised/20'
                }`}
              >
                <div>
                  <p className="text-cream text-sm font-medium">
                    <span className="text-accent">{nameFor(v)}</span>
                    {'  '}
                    {v.start_date} &rarr; {v.end_date}
                  </p>
                  {isActive && (
                    <p className="text-emerald text-[10px] font-semibold uppercase mt-0.5">
                      {t('vacation.activeNow')}
                    </p>
                  )}
                </div>
                {!isPast && (
                  <button
                    onClick={() => cancel(v.id)}
                    className="text-muted hover:text-crimson transition-colors p-1"
                    title={t('vacation.cancelVacation')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
