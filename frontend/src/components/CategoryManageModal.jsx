import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import Modal from './Modal';
import ChoreIcon from './ChoreIcon';
import { Plus, Trash2, Loader2, Clock } from 'lucide-react';

const ICON_OPTIONS = [
  'cooking-pot', 'bed', 'bath', 'flower-2', 'paw-print', 'book-open',
  'shirt', 'home', 'trees', 'trash-2', 'car', 'dog', 'cat', 'gamepad-2',
  'backpack', 'shopping-cart', 'wrench', 'palette', 'music', 'dumbbell',
  'sparkles', 'heart', 'star', 'gift',
];

const COLOUR_OPTIONS = [
  '#ff6b6b', '#b388ff', '#64dfdf', '#2de2a6', '#f9d71c', '#4ecdc4',
  '#ff9ff3', '#a29bfe', '#55efc4', '#f39c12', '#e74c3c', '#3b82f6',
];

const emptyForm = { name: '', icon: ICON_OPTIONS[0], colour: COLOUR_OPTIONS[0] };

export default function CategoryManageModal({ isOpen, onClose, categories, onChanged }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [scheduleEditingId, setScheduleEditingId] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ windowStart: '', windowEnd: '' });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdd = async () => {
    if (!form.name.trim()) {
      setFormError(t('categories.nameRequired'));
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await api('/api/chores/categories', {
        method: 'POST',
        body: { name: form.name.trim(), icon: form.icon, colour: form.colour },
      });
      setForm({ ...emptyForm });
      onChanged();
    } catch (err) {
      setFormError(err.message || t('categories.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (category) => {
    setDeletingId(category.id);
    setFormError('');
    try {
      await api(`/api/chores/categories/${category.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setFormError(err.message || t('categories.deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  const toggleScheduleEditor = (category) => {
    if (scheduleEditingId === category.id) {
      setScheduleEditingId(null);
      return;
    }
    setScheduleEditingId(category.id);
    setScheduleError('');
    setScheduleForm({
      windowStart: category.window_start ? category.window_start.slice(0, 5) : '',
      windowEnd: category.window_end ? category.window_end.slice(0, 5) : '',
    });
  };

  const handleSaveSchedule = async (category) => {
    if (Boolean(scheduleForm.windowStart) !== Boolean(scheduleForm.windowEnd)) {
      setScheduleError(t('categories.windowBothRequired'));
      return;
    }
    setScheduleSaving(true);
    setScheduleError('');
    try {
      await api(`/api/chores/categories/${category.id}`, {
        method: 'PUT',
        body: {
          name: category.name,
          icon: category.icon,
          colour: category.colour,
          window_start: scheduleForm.windowStart || null,
          window_end: scheduleForm.windowEnd || null,
        },
      });
      setScheduleEditingId(null);
      onChanged();
    } catch (err) {
      setScheduleError(err.message || t('categories.saveError'));
    } finally {
      setScheduleSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('categories.manageTitle')}
      actions={[{ label: t('common.close'), onClick: onClose, className: 'game-btn game-btn-blue' }]}
    >
      <div className="space-y-4">
        {formError && (
          <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
            {formError}
          </div>
        )}

        {/* Existing categories */}
        <div className="space-y-1.5">
          {categories.map((cat) => (
            <div key={cat.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-surface-raised/20">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${cat.colour}26`, color: cat.colour }}
                  >
                    <ChoreIcon name={cat.icon} size={14} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-cream text-sm truncate block">{cat.name}</span>
                    {cat.window_start && cat.window_end && (
                      <span className="text-muted text-[10px] flex items-center gap-1">
                        <Clock size={10} />
                        {cat.window_start.slice(0, 5)}–{cat.window_end.slice(0, 5)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleScheduleEditor(cat)}
                    className={`p-1.5 rounded transition-colors ${
                      scheduleEditingId === cat.id
                        ? 'bg-accent/10 text-accent'
                        : 'hover:bg-surface-raised text-muted hover:text-cream'
                    }`}
                    title={t('categories.editSchedule')}
                  >
                    <Clock size={14} />
                  </button>
                  {cat.is_default ? (
                    <span className="text-muted text-[11px] flex-shrink-0">{t('categories.builtIn')}</span>
                  ) : (
                    <button
                      onClick={() => handleDelete(cat)}
                      disabled={deletingId === cat.id}
                      className="p-1.5 rounded hover:bg-crimson/10 text-crimson/60 hover:text-crimson transition-colors flex-shrink-0"
                      title={t('common.delete')}
                    >
                      {deletingId === cat.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {scheduleEditingId === cat.id && (
                <div className="ml-3 p-3 rounded-md bg-surface-raised/30 border border-border/50 space-y-2">
                  <p className="text-muted text-xs">{t('categories.scheduleWindow')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-muted text-[10px] font-semibold uppercase">{t('categories.windowStart')}</label>
                      <input
                        type="time"
                        value={scheduleForm.windowStart}
                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, windowStart: e.target.value }))}
                        className="field-input text-sm mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-muted text-[10px] font-semibold uppercase">{t('categories.windowEnd')}</label>
                      <input
                        type="time"
                        value={scheduleForm.windowEnd}
                        onChange={(e) => setScheduleForm((prev) => ({ ...prev, windowEnd: e.target.value }))}
                        className="field-input text-sm mt-1"
                      />
                    </div>
                  </div>
                  {scheduleError && <p className="text-crimson text-xs">{scheduleError}</p>}
                  <button
                    onClick={() => handleSaveSchedule(cat)}
                    disabled={scheduleSaving}
                    className="game-btn game-btn-blue w-full flex items-center justify-center gap-1.5 !py-1.5 !text-xs"
                  >
                    {scheduleSaving ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                    {t('common.save')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new category */}
        <div className="pt-3 border-t border-border space-y-3">
          <p className="text-cream text-sm font-medium">{t('categories.addNew')}</p>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateForm('name', e.target.value)}
            placeholder={t('categories.namePlaceholder')}
            className="field-input"
          />

          <div>
            <p className="text-muted text-xs font-medium mb-1.5">{t('categories.icon')}</p>
            <div className="flex flex-wrap gap-1.5">
              {ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => updateForm('icon', icon)}
                  className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                    form.icon === icon
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-border-light'
                  }`}
                >
                  <ChoreIcon name={icon} size={14} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-muted text-xs font-medium mb-1.5">{t('categories.colour')}</p>
            <div className="flex flex-wrap gap-1.5">
              {COLOUR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateForm('colour', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    form.colour === c ? 'border-accent' : 'border-transparent hover:border-border-light'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={submitting}
            className="game-btn game-btn-gold w-full flex items-center justify-center gap-1.5"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('categories.addNew')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
