import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import Modal from './Modal';
import ChoreIcon from './ChoreIcon';
import { Plus, Trash2, Loader2, Clock, Pencil } from 'lucide-react';

const ICON_OPTIONS = [
  'cooking-pot', 'bed', 'bath', 'flower-2', 'paw-print', 'book-open',
  'shirt', 'home', 'trees', 'trash-2', 'car', 'dog', 'cat', 'gamepad-2',
  'backpack', 'shopping-cart', 'wrench', 'palette', 'music', 'dumbbell',
  'sparkles', 'heart', 'star', 'gift',
  'sunrise', 'sun', 'cloud-sun', 'sunset',
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
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', icon: '', colour: '', windowStart: '', windowEnd: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

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

  const toggleEditor = (category) => {
    if (editingId === category.id) {
      setEditingId(null);
      return;
    }
    setEditingId(category.id);
    setEditError('');
    setEditForm({
      name: category.name,
      icon: category.icon,
      colour: category.colour,
      windowStart: category.window_start ? category.window_start.slice(0, 5) : '',
      windowEnd: category.window_end ? category.window_end.slice(0, 5) : '',
    });
  };

  const updateEditForm = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveCategory = async (category) => {
    if (!editForm.name.trim()) {
      setEditError(t('categories.nameRequired'));
      return;
    }
    if (Boolean(editForm.windowStart) !== Boolean(editForm.windowEnd)) {
      setEditError(t('categories.windowBothRequired'));
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await api(`/api/chores/categories/${category.id}`, {
        method: 'PUT',
        body: {
          name: editForm.name.trim(),
          icon: editForm.icon,
          colour: editForm.colour,
          window_start: editForm.windowStart || null,
          window_end: editForm.windowEnd || null,
        },
      });
      setEditingId(null);
      onChanged();
    } catch (err) {
      setEditError(err.message || t('categories.saveError'));
    } finally {
      setEditSaving(false);
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
                    onClick={() => toggleEditor(cat)}
                    className={`p-1.5 rounded transition-colors ${
                      editingId === cat.id
                        ? 'bg-accent/10 text-accent'
                        : 'hover:bg-surface-raised text-muted hover:text-cream'
                    }`}
                    title={t('categories.editCategory')}
                  >
                    <Pencil size={14} />
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

              {editingId === cat.id && (
                <div className="ml-3 p-3 rounded-md bg-surface-raised/30 border border-border/50 space-y-3">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => updateEditForm('name', e.target.value)}
                    placeholder={t('categories.namePlaceholder')}
                    className="field-input text-sm"
                  />

                  <div>
                    <p className="text-muted text-xs font-medium mb-1.5">{t('categories.icon')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ICON_OPTIONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => updateEditForm('icon', icon)}
                          className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                            editForm.icon === icon
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
                          onClick={() => updateEditForm('colour', c)}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${
                            editForm.colour === c ? 'border-accent' : 'border-transparent hover:border-border-light'
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-muted text-xs">{t('categories.scheduleWindow')}</p>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      <div>
                        <label className="text-muted text-[10px] font-semibold uppercase">{t('categories.windowStart')}</label>
                        <input
                          type="time"
                          value={editForm.windowStart}
                          onChange={(e) => updateEditForm('windowStart', e.target.value)}
                          className="field-input text-sm mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-muted text-[10px] font-semibold uppercase">{t('categories.windowEnd')}</label>
                        <input
                          type="time"
                          value={editForm.windowEnd}
                          onChange={(e) => updateEditForm('windowEnd', e.target.value)}
                          className="field-input text-sm mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {editError && <p className="text-crimson text-xs">{editError}</p>}
                  <button
                    onClick={() => handleSaveCategory(cat)}
                    disabled={editSaving}
                    className="game-btn game-btn-blue w-full flex items-center justify-center gap-1.5 !py-1.5 !text-xs"
                  >
                    {editSaving ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
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
