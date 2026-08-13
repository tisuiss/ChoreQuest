import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { themedTitle, themedDescription } from '../utils/questThemeText';
import Modal from './Modal';
import {
  BookTemplate,
  Star,
  Scroll,
  Image,
  X,
  Loader2,
} from 'lucide-react';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', labelKey: 'chores.difficulty.easy', level: 1 },
  { value: 'medium', labelKey: 'chores.difficulty.medium', level: 2 },
  { value: 'hard', labelKey: 'chores.difficulty.hard', level: 3 },
  { value: 'expert', labelKey: 'chores.difficulty.expert', level: 4 },
];

const FREQUENCY_OPTIONS = [
  { value: 'once', labelKey: 'questAssign.frequency.once' },
  { value: 'daily', labelKey: 'questAssign.frequency.daily' },
  { value: 'weekly', labelKey: 'questAssign.frequency.weekly' },
  { value: 'fortnightly', labelKey: 'questAssign.frequency.fortnightly' },
  { value: 'custom', labelKey: 'questAssign.frequency.custom' },
];

const DAY_KEYS = ['calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed', 'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat', 'calendar.days.sun'];

const selectClass =
  'bg-navy-light border border-border text-cream p-2 rounded text-sm ' +
  'focus:border-accent focus:outline-none transition-colors';

const emptyForm = {
  title: '',
  description: '',
  points: 10,
  difficulty: 'easy',
  category_id: '',
  photo_url: null,
  sort_order: 0,
  recurrence: 'once',
  customDays: [],
  assignedUserIds: [],
  pausesDuringVacation: true,
  windowStart: '',
  windowEnd: '',
};

export default function QuestCreateModal({
  isOpen,
  onClose,
  onCreated,
  categories,
  editingChore,
  kids = [],
}) {
  const { t } = useTranslation();
  const DAY_NAMES = DAY_KEYS.map((k) => t(k));
  const { colorTheme } = useTheme();
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingChore) {
        setForm({
          ...emptyForm,
          title: editingChore.title || '',
          description: editingChore.description || '',
          points: editingChore.points || 10,
          difficulty: editingChore.difficulty || 'easy',
          category_id: editingChore.category_id ? String(editingChore.category_id) : '',
          photo_url: editingChore.photo_url || null,
          sort_order: editingChore.sort_order ?? 0,
          // Not editable here (see "Gérer") but needed to gate the vacation
          // checkbox's visibility the same way as when creating.
          recurrence: editingChore.recurrence || 'once',
          pausesDuringVacation: editingChore.pauses_during_vacation ?? true,
          windowStart: editingChore.window_start ? editingChore.window_start.slice(0, 5) : '',
          windowEnd: editingChore.window_end ? editingChore.window_end.slice(0, 5) : '',
        });
      } else {
        setForm({ ...emptyForm });
      }
      setFormError('');
      setShowTemplates(false);
    }
  }, [isOpen, editingChore]);

  useEffect(() => {
    if (isOpen && !editingChore) {
      api('/api/chores/templates')
        .then((data) => setTemplates(Array.isArray(data) ? data : []))
        .catch(() => setTemplates([]));
    }
  }, [isOpen, editingChore]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAssignedKid = (id) => {
    setForm((prev) => {
      const set = new Set(prev.assignedUserIds);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...prev, assignedUserIds: [...set] };
    });
  };

  const toggleCustomDay = (day) => {
    setForm((prev) => {
      const set = new Set(prev.customDays);
      if (set.has(day)) set.delete(day); else set.add(day);
      return { ...prev, customDays: [...set].sort() };
    });
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoUploading(true);
    setFormError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploaded = await api('/api/uploads', { method: 'POST', body: fd });
      updateForm('photo_url', uploaded.path);
    } catch (err) {
      setFormError(err.message || t('questCreate.photoUploadError'));
    } finally {
      setPhotoUploading(false);
    }
  };

  const applyTemplate = (tpl) => {
    const catMatch = categories.find(
      (c) => c.name.toLowerCase() === tpl.category_name.toLowerCase()
    );
    setForm((prev) => ({
      ...prev,
      title: tpl.title,
      description: tpl.description || '',
      points: tpl.suggested_points,
      difficulty: tpl.difficulty,
      category_id: catMatch ? String(catMatch.id) : '',
    }));
    setShowTemplates(false);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setFormError(t('questCreate.nameRequired'));
      return;
    }
    if (form.points < 1) {
      setFormError(t('questCreate.rewardMin'));
      return;
    }
    if (!form.category_id) {
      setFormError(t('questCreate.categoryRequired'));
      return;
    }
    if (Boolean(form.windowStart) !== Boolean(form.windowEnd)) {
      setFormError(t('questCreate.windowBothRequired'));
      return;
    }

    setSubmitting(true);
    setFormError('');

    const baseBody = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      points: Number(form.points),
      difficulty: form.difficulty,
      category_id: Number(form.category_id),
      photo_url: form.photo_url || null,
      sort_order: Number(form.sort_order) || 0,
      pauses_during_vacation: !!form.pausesDuringVacation,
      window_start: form.windowStart || null,
      window_end: form.windowEnd || null,
    };

    try {
      if (editingChore) {
        // Editing only ever touches these basic fields — recurrence and
        // assignment stay under "Gérer" so an unrelated edit here can't
        // silently reset or wipe out an existing assignment setup.
        await api(`/api/chores/${editingChore.id}`, { method: 'PUT', body: baseBody });
      } else {
        const customDays = form.recurrence === 'custom' ? form.customDays : null;
        const created = await api('/api/chores', {
          method: 'POST',
          body: {
            ...baseBody,
            recurrence: form.recurrence,
            custom_days: customDays,
            requires_photo: false,
            assigned_user_ids: [],
          },
        });
        if (form.assignedUserIds.length > 0) {
          await api(`/api/chores/${created.id}/assign`, {
            method: 'POST',
            body: {
              assignments: form.assignedUserIds.map((uid) => ({
                user_id: uid,
                recurrence: form.recurrence,
                custom_days: customDays,
                requires_photo: false,
              })),
            },
          });
        }
      }
      onCreated();
      onClose();
    } catch (err) {
      setFormError(err.message || t('questCreate.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, tpl) => {
    const cat = tpl.category_name || t('questCreate.otherCategory');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tpl);
    return acc;
  }, {});

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingChore ? t('questCreate.editTitle') : t('questCreate.newTitle')}
      actions={[
        { label: t('common.cancel'), onClick: onClose, className: 'game-btn game-btn-blue' },
        {
          label: submitting ? t('common.saving') : editingChore ? t('questCreate.updateQuest') : t('questCreate.createQuest'),
          onClick: handleSubmit,
          className: 'game-btn game-btn-gold',
          disabled: submitting,
        },
      ]}
    >
      <div className="space-y-4">
        {formError && (
          <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
            {formError}
          </div>
        )}

        {/* Template picker (only when creating) */}
        {!editingChore && (
          <div>
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-2 text-accent text-sm hover:text-accent/80 transition-colors"
            >
              <BookTemplate size={14} />
              {showTemplates ? t('questCreate.hideTemplates') : t('questCreate.chooseTemplate')}
            </button>

            {showTemplates && (
              <div className="mt-3 max-h-60 overflow-y-auto space-y-3 border border-border rounded-lg p-3 bg-surface-raised/30">
                {Object.entries(templatesByCategory).map(([cat, tpls]) => (
                  <div key={cat}>
                    <p className="text-muted text-xs font-bold mb-1">
                      {cat}
                    </p>
                    <div className="space-y-1">
                      {tpls.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => applyTemplate(tpl)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-raised transition-colors border border-transparent hover:border-accent/30"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-cream text-sm font-medium">
                              {themedTitle(tpl.title, colorTheme)}
                            </span>
                            <span className="flex items-center gap-1 text-gold text-xs">
                              <Star size={10} className="fill-gold" />
                              {t('chores.starsCount', { count: tpl.suggested_points })}
                            </span>
                          </div>
                          {tpl.description && (
                            <p className="text-muted text-xs line-clamp-1 mt-0.5">
                              {themedDescription(tpl.title, tpl.description, colorTheme)}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <p className="text-muted text-xs text-center py-3">
                    {t('questCreate.noTemplates')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            {t('questCreate.questName')}
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            placeholder={t('questCreate.questNamePlaceholder')}
            className="field-input"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            {t('questCreate.description')}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => updateForm('description', e.target.value)}
            placeholder={t('questCreate.descriptionPlaceholder')}
            rows={3}
            className="field-input resize-none"
          />
        </div>

        {/* Points & Difficulty */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
              {t('questCreate.starsReward')}
            </label>
            <input
              type="number"
              min={1}
              value={form.points}
              onChange={(e) => updateForm('points', e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
              {t('questCreate.difficulty')}
            </label>
            <select
              value={form.difficulty}
              onChange={(e) => updateForm('difficulty', e.target.value)}
              className={`${selectClass} w-full p-3`}
            >
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            {t('questCreate.category')}
          </label>
          <select
            value={form.category_id}
            onChange={(e) => updateForm('category_id', e.target.value)}
            className={`${selectClass} w-full p-3`}
          >
            <option value="">{t('questCreate.selectCategory')}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Display order */}
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            {t('questCreate.sortOrder')}
          </label>
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => updateForm('sort_order', e.target.value)}
            className="field-input"
          />
          <p className="text-muted text-xs mt-1">{t('questCreate.sortOrderHint')}</p>
        </div>

        {/* Time window */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
              {t('questCreate.windowStart')}
            </label>
            <input
              type="time"
              value={form.windowStart}
              onChange={(e) => updateForm('windowStart', e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
              {t('questCreate.windowEnd')}
            </label>
            <input
              type="time"
              value={form.windowEnd}
              onChange={(e) => updateForm('windowEnd', e.target.value)}
              className="field-input"
            />
          </div>
        </div>

        {/* Vacation pause (only meaningful for recurring chores) */}
        {form.recurrence !== 'once' && (
          <label className="flex items-center gap-2 text-cream text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.pausesDuringVacation}
              onChange={(e) => updateForm('pausesDuringVacation', e.target.checked)}
              className="w-4 h-4"
            />
            {t('questCreate.pausesDuringVacation')}
          </label>
        )}

        {/* Recurrence + assignment (creation only — edits stay scoped to basic fields, see Gérer for changing this later) */}
        {!editingChore && (
          <>
            <div>
              <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
                {t('questCreate.recurrence')}
              </label>
              <select
                value={form.recurrence}
                onChange={(e) => updateForm('recurrence', e.target.value)}
                className={`${selectClass} w-full p-3`}
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {form.recurrence === 'custom' && (
              <div>
                <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
                  {t('questAssign.questDays')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_KEYS.map((key, i) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCustomDay(i)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        form.customDays.includes(i)
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border text-muted hover:border-border-light'
                      }`}
                    >
                      {DAY_NAMES[i]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {kids.length > 0 && (
              <div>
                <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
                  {t('questCreate.assignTo')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {kids.map((kid) => (
                    <button
                      key={kid.id}
                      type="button"
                      onClick={() => toggleAssignedKid(kid.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        form.assignedUserIds.includes(kid.id)
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border text-muted hover:border-border-light'
                      }`}
                    >
                      {kid.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Photo */}
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            {t('questCreate.photo')}
          </label>
          {form.photo_url ? (
            <div className="flex items-center gap-3">
              <img
                src={form.photo_url}
                alt=""
                className="w-14 h-14 rounded-lg object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => updateForm('photo_url', null)}
                className="flex items-center gap-1.5 text-crimson text-xs hover:text-crimson/80 transition-colors"
              >
                <X size={14} />
                {t('questCreate.removePhoto')}
              </button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-1.5 text-xs text-muted cursor-pointer hover:text-cream transition-colors bg-surface-raised px-3 py-2 rounded-md border border-border">
              {photoUploading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Image size={14} />
              )}
              {photoUploading ? t('common.saving') : t('questCreate.choosePhoto')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={photoUploading}
                onChange={handlePhotoChange}
              />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
