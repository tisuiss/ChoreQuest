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
} from 'lucide-react';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', labelKey: 'chores.difficulty.easy', level: 1 },
  { value: 'medium', labelKey: 'chores.difficulty.medium', level: 2 },
  { value: 'hard', labelKey: 'chores.difficulty.hard', level: 3 },
  { value: 'expert', labelKey: 'chores.difficulty.expert', level: 4 },
];

const selectClass =
  'bg-navy-light border border-border text-cream p-2 rounded text-sm ' +
  'focus:border-accent focus:outline-none transition-colors';

const emptyForm = {
  title: '',
  description: '',
  points: 10,
  difficulty: 'easy',
  category_id: '',
};

export default function QuestCreateModal({
  isOpen,
  onClose,
  onCreated,
  categories,
  editingChore,
}) {
  const { t } = useTranslation();
  const { colorTheme } = useTheme();
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingChore) {
        setForm({
          title: editingChore.title || '',
          description: editingChore.description || '',
          points: editingChore.points || 10,
          difficulty: editingChore.difficulty || 'easy',
          category_id: editingChore.category_id ? String(editingChore.category_id) : '',
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

  const applyTemplate = (tpl) => {
    const catMatch = categories.find(
      (c) => c.name.toLowerCase() === tpl.category_name.toLowerCase()
    );
    setForm({
      title: tpl.title,
      description: tpl.description || '',
      points: tpl.suggested_points,
      difficulty: tpl.difficulty,
      category_id: catMatch ? String(catMatch.id) : '',
    });
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

    setSubmitting(true);
    setFormError('');

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      points: Number(form.points),
      difficulty: form.difficulty,
      category_id: Number(form.category_id),
      // New quests from this flow don't set recurrence/photo on the chore itself
      recurrence: 'once',
      requires_photo: false,
      assigned_user_ids: [],
    };

    try {
      if (editingChore) {
        await api(`/api/chores/${editingChore.id}`, { method: 'PUT', body });
      } else {
        await api('/api/chores', { method: 'POST', body });
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
      </div>
    </Modal>
  );
}
