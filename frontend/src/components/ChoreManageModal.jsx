import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { themedTitle, themedDescription } from '../utils/questThemeText';
import Modal from './Modal';
import AvatarDisplay from './AvatarDisplay';
import ChoreVacationSettings from './ChoreVacationSettings';
import {
  Star,
  Image,
  X,
  Loader2,
  Users,
  Camera,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  RotateCw,
  Trash2,
  CalendarDays,
  CheckCircle2,
  XCircle,
  SkipForward,
  Clock,
} from 'lucide-react';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', labelKey: 'chores.difficulty.easy' },
  { value: 'medium', labelKey: 'chores.difficulty.medium' },
  { value: 'hard', labelKey: 'chores.difficulty.hard' },
  { value: 'expert', labelKey: 'chores.difficulty.expert' },
];

const FREQUENCY_OPTIONS = [
  { value: 'once', labelKey: 'questAssign.frequency.once' },
  { value: 'daily', labelKey: 'questAssign.frequency.daily' },
  { value: 'weekly', labelKey: 'questAssign.frequency.weekly' },
  { value: 'fortnightly', labelKey: 'questAssign.frequency.fortnightly' },
];
const ROTATION_CADENCE_OPTIONS = [
  { value: 'daily', labelKey: 'questAssign.frequency.daily' },
  { value: 'weekly', labelKey: 'questAssign.frequency.weekly' },
  { value: 'fortnightly', labelKey: 'questAssign.frequency.fortnightly' },
  { value: 'monthly', labelKey: 'questAssign.frequency.monthly' },
];

const DAY_KEYS = ['calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed', 'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat', 'calendar.days.sun'];

const selectClass =
  'bg-navy-light border border-border text-cream p-2 rounded text-sm ' +
  'focus:border-accent focus:outline-none transition-colors';

const TAB_DEFS = [
  { id: 'info', labelKey: 'choreManage.tabInfo' },
  { id: 'assign', labelKey: 'choreManage.tabAssign' },
  { id: 'history', labelKey: 'choreManage.tabHistory' },
  { id: 'vacation', labelKey: 'choreManage.tabVacation' },
];

// ---------------------------------------------------------------------------
// Infos tab — basic chore fields (was QuestCreateModal's edit mode)
// ---------------------------------------------------------------------------

function buildInfoForm(chore) {
  return {
    title: chore.title || '',
    description: chore.description || '',
    points: chore.points ?? 10,
    difficulty: chore.difficulty || 'easy',
    category_id: chore.category_id ? String(chore.category_id) : '',
    photo_url: chore.photo_url || null,
    sort_order: chore.sort_order ?? 0,
    pausesDuringVacation: chore.pauses_during_vacation ?? true,
    windowStart: chore.window_start ? chore.window_start.slice(0, 5) : '',
    windowEnd: chore.window_end ? chore.window_end.slice(0, 5) : '',
  };
}

function InfoTab({ chore, categories, onChanged }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => buildInfoForm(chore));
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(buildInfoForm(chore));
    setFormError('');
  }, [chore]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setFormError(t('questCreate.nameRequired'));
      return;
    }
    if (form.points < 0) {
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
    try {
      await api(`/api/chores/${chore.id}`, {
        method: 'PUT',
        body: {
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
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onChanged();
    } catch (err) {
      setFormError(err.message || t('questCreate.saveError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {formError && (
        <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {formError}
        </div>
      )}

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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            {t('questCreate.starsReward')}
          </label>
          <input
            type="number"
            min={0}
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

      {chore.recurrence && chore.recurrence !== 'once' && (
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

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="game-btn game-btn-gold w-full flex items-center justify-center gap-1.5"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        {submitting ? t('common.saving') : saved ? t('choreManage.saved') : t('common.save')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assignation tab — kids/schedule/rotation (was QuestAssignModal) + live
// rotation status (was ChoreDetail's Rotation Panel)
// ---------------------------------------------------------------------------

function AssignTab({ chore, kids, onChanged }) {
  const { t } = useTranslation();
  const DAY_NAMES = DAY_KEYS.map((k) => t(k));

  const [kidConfigs, setKidConfigs] = useState({});
  const [expandedKid, setExpandedKid] = useState(null);
  const [scheduleFrequency, setScheduleFrequency] = useState('once');
  const [scheduleDays, setScheduleDays] = useState([]);
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationCadence, setRotationCadence] = useState('daily');
  const [rotationFirstKid, setRotationFirstKid] = useState(null);
  const [rotation, setRotation] = useState(null);
  const [rotationActionLoading, setRotationActionLoading] = useState('');
  const [rotationMessage, setRotationMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hadExistingAssignments, setHadExistingAssignments] = useState(false);

  const fetchRotation = useCallback(async () => {
    try {
      const rotations = await api('/api/rotations');
      const match = (rotations || []).find((r) => r.chore_id === chore.id);
      setRotation(match || null);
      if (match && match.kid_ids && match.kid_ids.length >= 2) {
        setRotationEnabled(true);
        setRotationCadence(match.cadence || 'daily');
        const currentIdx = match.current_index ?? 0;
        setRotationFirstKid(match.kid_ids[currentIdx] ?? match.kid_ids[0]);
      } else {
        setRotationEnabled(false);
        setRotationCadence('daily');
        setRotationFirstKid(null);
      }
    } catch {
      setRotation(null);
      setRotationEnabled(false);
      setRotationCadence('daily');
      setRotationFirstKid(null);
    }
  }, [chore.id]);

  useEffect(() => {
    if (!kids.length) return;

    api(`/api/chores/${chore.id}/rules`)
      .then((rules) => {
        const rulesList = Array.isArray(rules) ? rules : [];
        const hasActive = rulesList.some((r) => r.is_active);
        setHadExistingAssignments(hasActive);

        const configs = {};
        for (const kid of kids) {
          const existingRule = rulesList.find((r) => r.user_id === kid.id && r.is_active);
          configs[kid.id] = {
            selected: !!existingRule,
            requires_photo: existingRule?.requires_photo || false,
          };
        }
        setKidConfigs(configs);

        const firstActive = rulesList.find((r) => r.is_active);
        if (firstActive) {
          if (firstActive.recurrence === 'custom' && firstActive.custom_days?.length) {
            setScheduleFrequency('daily');
            setScheduleDays(firstActive.custom_days);
          } else {
            setScheduleFrequency(firstActive.recurrence || 'once');
            setScheduleDays([]);
          }
        } else {
          setScheduleFrequency('once');
          setScheduleDays([]);
        }
      })
      .catch(() => {
        const configs = {};
        for (const kid of kids) {
          configs[kid.id] = { selected: false, requires_photo: false };
        }
        setKidConfigs(configs);
        setHadExistingAssignments(false);
        setScheduleFrequency('once');
        setScheduleDays([]);
      });

    fetchRotation();
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chore.id, kids]);

  const selectedKids = Object.entries(kidConfigs).filter(([, c]) => c.selected);
  const selectedCount = selectedKids.length;
  const isUnassigningAll = hadExistingAssignments && selectedCount === 0;

  useEffect(() => {
    if (!rotationEnabled || selectedCount < 2) return;
    const selectedIds = selectedKids.map(([id]) => Number(id));
    if (rotationFirstKid == null || !selectedIds.includes(Number(rotationFirstKid))) {
      setRotationFirstKid(selectedIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationEnabled, selectedCount, kidConfigs]);

  const toggleKid = (kidId) => {
    setKidConfigs((prev) => ({
      ...prev,
      [kidId]: { ...prev[kidId], selected: !prev[kidId]?.selected },
    }));
  };

  const toggleScheduleDay = (dayIdx) => {
    setScheduleDays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx]
    );
  };

  const togglePhotoAll = () => {
    const anyHasPhoto = selectedKids.some(([, c]) => c.requires_photo);
    const newValue = !anyHasPhoto;
    setKidConfigs((prev) => {
      const next = { ...prev };
      for (const [kidId, config] of Object.entries(next)) {
        if (config.selected) {
          next[kidId] = { ...config, requires_photo: newValue };
        }
      }
      return next;
    });
  };

  const getEffectiveSchedule = () => {
    if (scheduleDays.length > 0) {
      return { recurrence: 'custom', custom_days: [...scheduleDays] };
    }
    return { recurrence: scheduleFrequency, custom_days: null };
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    const { recurrence, custom_days } = getEffectiveSchedule();

    let assignments = selectedKids.map(([kidId, config]) => ({
      user_id: Number(kidId),
      recurrence,
      custom_days,
      requires_photo: config.requires_photo,
    }));

    const body = { assignments };

    if (rotationEnabled && selectedCount >= 2) {
      if (rotationFirstKid != null) {
        const firstIdx = assignments.findIndex((a) => a.user_id === Number(rotationFirstKid));
        if (firstIdx > 0) {
          const [first] = assignments.splice(firstIdx, 1);
          assignments.unshift(first);
        }
      }
      body.rotation = { enabled: true, cadence: rotationCadence };
    }

    try {
      await api(`/api/chores/${chore.id}/assign`, { method: 'POST', body });
      await fetchRotation();
      onChanged();
    } catch (err) {
      setError(err.message || t('questAssign.assignError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceRotation = async () => {
    if (!rotation) return;
    setRotationActionLoading('advance');
    setRotationMessage('');
    try {
      await api(`/api/rotations/${rotation.id}/advance`, { method: 'POST' });
      await fetchRotation();
      setRotationMessage(t('choreDetail.rotationAdvanced'));
    } catch (err) {
      setRotationMessage(err.message || t('choreDetail.rotationAdvanceError'));
    } finally {
      setRotationActionLoading('');
    }
  };

  const handleDeleteRotation = async () => {
    if (!rotation) return;
    setRotationActionLoading('delete');
    setRotationMessage('');
    try {
      await api(`/api/rotations/${rotation.id}`, { method: 'DELETE' });
      await fetchRotation();
      setRotationMessage(t('choreDetail.rotationRemoved'));
    } catch (err) {
      setRotationMessage(err.message || t('choreDetail.rotationDeleteError'));
    } finally {
      setRotationActionLoading('');
    }
  };

  const allSelectedHavePhoto = selectedCount > 0 && selectedKids.every(([, c]) => c.requires_photo);
  const someSelectedHavePhoto = selectedCount > 0 && selectedKids.some(([, c]) => c.requires_photo);
  const hasDaysSelected = scheduleDays.length > 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {error}
        </div>
      )}

      {/* Kid selector */}
      <div>
        <label className="flex items-center gap-2 text-cream text-sm font-medium mb-2">
          <Users size={14} />
          {t('questAssign.selectHeroes')}
        </label>
        <div className="space-y-2">
          {kids.map((kid) => {
            const config = kidConfigs[kid.id];
            if (!config) return null;
            const isSelected = config.selected;
            const isExpanded = expandedKid === kid.id && isSelected;

            return (
              <div
                key={kid.id}
                className={`rounded-lg border transition-colors ${
                  isSelected ? 'border-accent/40 bg-accent/5' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleKid(kid.id)}
                    className="w-4 h-4 accent-accent flex-shrink-0"
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AvatarDisplay
                      config={kid.avatar_config}
                      photoUrl={kid.avatar_photo_url}
                      size="xs"
                      name={kid.display_name || kid.username}
                      animate
                    />
                    <span className="text-cream text-sm font-medium truncate">
                      {kid.display_name || kid.username}
                    </span>
                  </div>
                  {isSelected && config.requires_photo && (
                    <Camera size={14} className="text-accent flex-shrink-0" />
                  )}
                  {isSelected && (
                    <button
                      type="button"
                      onClick={() => setExpandedKid(isExpanded ? null : kid.id)}
                      className="p-1 rounded hover:bg-surface-raised text-muted hover:text-cream transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border/50 pt-3 ml-7">
                    <div className="flex items-center justify-between">
                      <label className="text-muted text-xs font-medium flex items-center gap-1.5">
                        <Camera size={12} />
                        {t('questAssign.photoProof')}
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setKidConfigs((prev) => ({
                            ...prev,
                            [kid.id]: { ...prev[kid.id], requires_photo: !config.requires_photo },
                          }))
                        }
                        className={`relative w-10 h-5 rounded-full border transition-colors ${
                          config.requires_photo
                            ? 'bg-accent/20 border-accent'
                            : 'bg-navy-light border-border'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
                            config.requires_photo ? 'left-5 bg-accent' : 'left-0.5 bg-muted'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isUnassigningAll && (
        <div className="p-3 rounded-lg border border-crimson/30 bg-crimson/10 text-crimson text-sm">
          {t('questAssign.noHeroesSelected')}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="p-3 rounded-lg border border-border bg-surface-raised/20 space-y-3">
          <label className="text-cream text-sm font-medium flex items-center gap-2">
            <CalendarDays size={14} />
            {t('questAssign.schedule')}
          </label>

          <div>
            <label className="block text-muted text-xs font-medium mb-1">
              {t('questAssign.frequency.label')}
              {hasDaysSelected && (
                <span className="text-accent ml-1">{t('questAssign.overriddenByDays')}</span>
              )}
            </label>
            <select
              value={scheduleFrequency}
              onChange={(e) => setScheduleFrequency(e.target.value)}
              disabled={hasDaysSelected}
              className={`${selectClass} w-full${hasDaysSelected ? ' opacity-50 cursor-not-allowed' : ''}`}
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-muted text-xs font-medium mb-1">
              {t('questAssign.questDays')}
              <span className="text-muted/60 ml-1">{t('questAssign.optional')}</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_NAMES.map((day, idx) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleScheduleDay(idx)}
                  className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
                    scheduleDays.includes(idx)
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-border text-muted hover:border-cream/30'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="text-muted text-xs mt-1">
              {hasDaysSelected
                ? t('questAssign.appearsOn', { days: scheduleDays.slice().sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(', ') })
                : t('questAssign.pickDaysHint')}
            </p>
          </div>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="p-3 rounded-lg border border-border bg-surface-raised/20">
          <div className="flex items-center justify-between">
            <label className="text-cream text-sm font-medium flex items-center gap-2">
              <Camera size={14} />
              {t('questAssign.requirePhotoProof')}
            </label>
            <button
              type="button"
              onClick={togglePhotoAll}
              className={`relative w-12 h-6 rounded-full border transition-colors ${
                allSelectedHavePhoto
                  ? 'bg-accent/20 border-accent'
                  : someSelectedHavePhoto
                  ? 'bg-accent/10 border-accent/50'
                  : 'bg-navy-light border-border'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                  allSelectedHavePhoto
                    ? 'left-6 bg-accent'
                    : someSelectedHavePhoto
                    ? 'left-6 bg-accent/50'
                    : 'left-0.5 bg-muted'
                }`}
              />
            </button>
          </div>
          <p className="text-muted text-xs mt-1">
            {allSelectedHavePhoto
              ? t('questAssign.allRequirePhoto')
              : someSelectedHavePhoto
              ? t('questAssign.someRequirePhoto')
              : t('questAssign.noneRequirePhoto')}
          </p>
        </div>
      )}

      {selectedCount >= 2 && (
        <div className="p-3 rounded-lg border border-border bg-surface-raised/20 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-cream text-sm font-medium flex items-center gap-2">
              <RotateCw size={14} />
              {t('questAssign.kidRotation')}
            </label>
            <button
              type="button"
              onClick={() => setRotationEnabled(!rotationEnabled)}
              className={`relative w-12 h-6 rounded-full border transition-colors ${
                rotationEnabled ? 'bg-purple/20 border-purple' : 'bg-navy-light border-border'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                  rotationEnabled ? 'left-6 bg-purple' : 'left-0.5 bg-muted'
                }`}
              />
            </button>
          </div>
          <p className="text-muted text-xs">{t('questAssign.rotationHint')}</p>
          {rotationEnabled && (
            <div className="space-y-3">
              <div>
                <label className="block text-muted text-xs font-medium mb-1">
                  {t('questAssign.swapEvery')}
                </label>
                <select
                  value={rotationCadence}
                  onChange={(e) => setRotationCadence(e.target.value)}
                  className={`${selectClass} w-full`}
                >
                  {ROTATION_CADENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-muted text-xs font-medium mb-1">
                  {t('questAssign.startsWith')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedKids.map(([kidId]) => {
                    const kid = kids.find((k) => k.id === Number(kidId));
                    if (!kid) return null;
                    const isFirst = Number(kidId) === Number(rotationFirstKid);
                    return (
                      <button
                        key={kidId}
                        type="button"
                        onClick={() => setRotationFirstKid(Number(kidId))}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${
                          isFirst
                            ? 'border-purple bg-purple/15 text-purple'
                            : 'border-border text-muted hover:border-cream/30'
                        }`}
                      >
                        <AvatarDisplay
                          config={kid.avatar_config}
                          photoUrl={kid.avatar_photo_url}
                          size="xs"
                          name={kid.display_name || kid.username}
                          animate
                        />
                        {kid.display_name || kid.username}
                      </button>
                    );
                  })}
                </div>
                <p className="text-muted text-xs mt-1">{t('questAssign.startsWithHint')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className={isUnassigningAll ? 'game-btn game-btn-red w-full flex items-center justify-center gap-1.5' : 'game-btn game-btn-gold w-full flex items-center justify-center gap-1.5'}
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        {submitting
          ? t('common.saving')
          : isUnassigningAll
          ? t('questAssign.unassignAll')
          : selectedCount === 0
          ? t('common.save')
          : t('questAssign.assignQuest')}
      </button>

      {/* Live rotation status (only once a rotation actually exists) */}
      {rotation && (
        <div className="p-3 rounded-lg border border-purple/30 bg-purple/5 space-y-3">
          {rotationMessage && (
            <p className="text-muted text-xs">{rotationMessage}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {(rotation.kid_ids || []).map((kidId, idx) => {
              const kid = kids.find((k) => k.id === kidId);
              const isCurrent = idx === rotation.current_index;
              return (
                <span
                  key={kidId}
                  className={`px-3 py-1 rounded-md text-xs font-medium border ${
                    isCurrent ? 'border-purple bg-purple/20 text-purple' : 'border-border text-muted'
                  }`}
                >
                  {kid?.display_name || t('choreDetail.kidFallback', { id: kidId })}
                  {isCurrent && ` ${t('choreDetail.current')}`}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdvanceRotation}
              disabled={rotationActionLoading === 'advance'}
              className="game-btn game-btn-purple flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
            >
              <ChevronRight size={14} />
              {t('choreDetail.advance')}
            </button>
            <button
              onClick={handleDeleteRotation}
              disabled={rotationActionLoading === 'delete'}
              className="game-btn game-btn-red flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
            >
              <Trash2 size={14} />
              {t('choreDetail.removeRotation')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historique tab — 7-day per-kid grid (was ChoreDetail's assignment grid)
// ---------------------------------------------------------------------------

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lastNDays(n) {
  const dates = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(toISO(d));
  }
  return dates;
}

function cellStatus(status, dateStr, todayStr) {
  if (status === 'pending' && dateStr < todayStr) return 'missed';
  return status;
}

const CELL_STYLES = {
  pending: { icon: Clock, className: 'bg-gold/10 text-gold border-gold/30' },
  completed: { icon: Clock, className: 'bg-gold/20 text-gold border-gold/40' },
  verified: { icon: CheckCircle2, className: 'bg-emerald/20 text-emerald border-emerald/40' },
  skipped: { icon: SkipForward, className: 'bg-cream/10 text-muted border-border' },
  missed: { icon: XCircle, className: 'bg-crimson/20 text-crimson border-crimson/40' },
};

function AssignmentGrid({ rows, assignments, selectedCell, onSelectCell, t }) {
  const days = lastNDays(7);
  const todayStr = days[days.length - 1];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="text-left text-muted font-medium pb-2 pr-2">{t('choreDetail.kid')}</th>
            {days.map((d) => {
              const jsDay = new Date(`${d}T00:00:00`).getDay();
              const mondayIndex = jsDay === 0 ? 6 : jsDay - 1;
              const dayNum = parseInt(d.split('-')[2], 10);
              return (
                <th key={d} className="text-center text-muted font-medium pb-2 px-1 whitespace-nowrap">
                  {t(DAY_KEYS[mondayIndex])} {dayNum}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="text-cream font-medium py-1 pr-2 whitespace-nowrap">{row.kidName}</td>
              {days.map((d) => {
                const a = assignments.find((x) => x.user_id === row.user_id && x.date === d);
                if (!a) {
                  return (
                    <td key={d} className="text-center py-1 px-1">
                      <span className="inline-flex items-center justify-center w-7 h-7 text-muted/30" title={t('choreDetail.noAssignment')}>–</span>
                    </td>
                  );
                }
                const status = cellStatus(a.status, d, todayStr);
                const style = CELL_STYLES[status] || CELL_STYLES.pending;
                const Icon = style.icon;
                const isSelected = selectedCell?.assignmentId === a.id;
                return (
                  <td key={d} className="text-center py-1 px-1">
                    <button
                      onClick={() => onSelectCell({ assignmentId: a.id, userId: row.user_id, kidName: row.kidName, date: d, status: a.status })}
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-all ${style.className} ${
                        isSelected ? 'ring-2 ring-accent' : ''
                      }`}
                      title={t(`chores.status.${status}`, status)}
                    >
                      <Icon size={13} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTab({ chore, kids }) {
  const { t } = useTranslation();
  const [assignmentRules, setAssignmentRules] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [actionLoading, setActionLoading] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionOk, setActionOk] = useState(true);

  const fetchAssignmentRules = useCallback(async () => {
    try {
      const rules = await api(`/api/chores/${chore.id}/rules`);
      setAssignmentRules(Array.isArray(rules) ? rules.filter((r) => r.is_active) : []);
    } catch {
      setAssignmentRules([]);
    }
  }, [chore.id]);

  const fetchAssignments = useCallback(async () => {
    try {
      const data = await api(`/api/chores/${chore.id}/assignments?days=7`);
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      setAssignments([]);
    }
  }, [chore.id]);

  useEffect(() => {
    fetchAssignmentRules();
    fetchAssignments();
  }, [fetchAssignmentRules, fetchAssignments]);

  const handleVerify = async (assignmentId) => {
    setActionLoading('verify');
    setActionMessage('');
    try {
      await api(`/api/chores/assignments/${assignmentId}/verify`, { method: 'POST' });
      setActionMessage(t('choreDetail.verifiedMsg'));
      setActionOk(true);
      setSelectedCell(null);
      await Promise.all([fetchAssignmentRules(), fetchAssignments()]);
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.verifyError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  const handleUncomplete = async (assignmentId) => {
    setActionLoading('uncomplete');
    setActionMessage('');
    try {
      await api(`/api/chores/assignments/${assignmentId}/uncomplete`, { method: 'POST' });
      setActionMessage(t('choreDetail.uncompletedMsg'));
      setActionOk(true);
      setSelectedCell(null);
      await Promise.all([fetchAssignmentRules(), fetchAssignments()]);
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.uncompleteError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  const handleSkip = async (assignmentId) => {
    setActionLoading('skip');
    setActionMessage('');
    try {
      await api(`/api/chores/assignments/${assignmentId}/skip`, { method: 'POST' });
      setActionMessage(t('choreDetail.skippedMsg'));
      setActionOk(true);
      setSelectedCell(null);
      await Promise.all([fetchAssignmentRules(), fetchAssignments()]);
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.skipError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  const gridUserIds = [
    ...new Set([
      ...assignmentRules.map((r) => r.user_id),
      ...assignments.map((a) => a.user_id),
    ]),
  ];
  const gridRows = gridUserIds.map((uid) => {
    const rule = assignmentRules.find((r) => r.user_id === uid);
    const kid = kids.find((k) => k.id === uid);
    const fallbackAssignment = assignments.find((a) => a.user_id === uid);
    const kidName =
      kid?.display_name ||
      rule?.user?.display_name ||
      fallbackAssignment?.user?.display_name ||
      t('choreDetail.kidFallback', { id: uid });
    return { id: `kid-${uid}`, user_id: uid, kidName };
  });

  return (
    <div className="space-y-3">
      {actionMessage && (
        <div
          className={`p-2 rounded border text-sm text-center ${
            !actionOk
              ? 'border-crimson/40 bg-crimson/10 text-crimson'
              : 'border-emerald/40 bg-emerald/10 text-emerald'
          }`}
        >
          {actionMessage}
        </div>
      )}

      {gridRows.length === 0 ? (
        <p className="text-muted text-sm text-center py-6">{t('choreDetail.noAssignment')}</p>
      ) : (
        <>
          <p className="text-muted text-xs">{t('choreDetail.selectDayHint')}</p>
          <AssignmentGrid
            rows={gridRows}
            assignments={assignments}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
            t={t}
          />

          {selectedCell && (
            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-cream text-sm font-medium">
                  {selectedCell.kidName} · {selectedCell.date}
                </p>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="text-muted hover:text-cream transition-colors"
                  aria-label={t('common.close')}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedCell.status === 'completed' && (
                  <>
                    <button
                      onClick={() => handleVerify(selectedCell.assignmentId)}
                      disabled={!!actionLoading}
                      className={`game-btn game-btn-blue flex items-center gap-2 !text-xs !py-1.5 ${
                        actionLoading === 'verify' ? 'opacity-60 cursor-wait' : ''
                      }`}
                    >
                      <CheckCircle2 size={14} />
                      {actionLoading === 'verify' ? t('choreDetail.verifying') : t('choreDetail.verify')}
                    </button>
                    <button
                      onClick={() => handleUncomplete(selectedCell.assignmentId)}
                      disabled={!!actionLoading}
                      className={`game-btn game-btn-red flex items-center gap-2 !text-xs !py-1.5 ${
                        actionLoading === 'uncomplete' ? 'opacity-60 cursor-wait' : ''
                      }`}
                    >
                      <XCircle size={14} />
                      {actionLoading === 'uncomplete' ? t('choreDetail.undoing') : t('choreDetail.uncomplete')}
                    </button>
                  </>
                )}
                {selectedCell.status === 'verified' && (
                  <button
                    onClick={() => handleUncomplete(selectedCell.assignmentId)}
                    disabled={!!actionLoading}
                    className={`game-btn game-btn-red flex items-center gap-2 !text-xs !py-1.5 ${
                      actionLoading === 'uncomplete' ? 'opacity-60 cursor-wait' : ''
                    }`}
                  >
                    <XCircle size={14} />
                    {actionLoading === 'uncomplete' ? t('choreDetail.undoing') : t('choreDetail.uncomplete')}
                  </button>
                )}
                {selectedCell.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleVerify(selectedCell.assignmentId)}
                      disabled={!!actionLoading}
                      className={`game-btn game-btn-blue flex items-center gap-2 !text-xs !py-1.5 ${
                        actionLoading === 'verify' ? 'opacity-60 cursor-wait' : ''
                      }`}
                    >
                      <CheckCircle2 size={14} />
                      {actionLoading === 'verify' ? t('choreDetail.verifying') : t('choreDetail.validateForKid')}
                    </button>
                    <button
                      onClick={() => handleSkip(selectedCell.assignmentId)}
                      disabled={!!actionLoading}
                      className={`game-btn game-btn-red flex items-center gap-2 !text-xs !py-1.5 ${
                        actionLoading === 'skip' ? 'opacity-60 cursor-wait' : ''
                      }`}
                    >
                      <SkipForward size={14} />
                      {actionLoading === 'skip' ? t('choreDetail.skipping') : t('choreDetail.skipToday')}
                    </button>
                  </>
                )}
                {selectedCell.status === 'skipped' && (
                  <p className="text-muted text-xs">{t('chores.status.skipped')}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell — tab switcher
// ---------------------------------------------------------------------------

export default function ChoreManageModal({ isOpen, onClose, chore, kids = [], categories = [], onChanged }) {
  const { t } = useTranslation();
  const { colorTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('info');

  useEffect(() => {
    if (isOpen) setActiveTab('info');
  }, [isOpen, chore?.id]);

  if (!chore) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('choreManage.title')}
      actions={[{ label: t('common.close'), onClick: onClose, className: 'game-btn game-btn-blue' }]}
    >
      <div className="space-y-4">
        {/* Quest summary */}
        <div className="p-3 rounded-lg border border-border bg-surface-raised/30">
          <h3 className="text-cream font-bold text-base">{themedTitle(chore.title, colorTheme)}</h3>
          {chore.description && (
            <p className="text-muted text-xs mt-1">{themedDescription(chore.title, chore.description, colorTheme)}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-gold text-sm font-bold">
              <Star size={12} className="fill-gold" />
              {t('chores.starsCount', { count: chore.points })}
            </span>
            {chore.category && (
              <span className="text-muted text-xs">{chore.category.name || chore.category}</span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 bg-navy/60 rounded-md p-0.5 flex-wrap">
          {TAB_DEFS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-surface-raised text-cream'
                  : 'text-muted hover:text-cream'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {activeTab === 'info' && (
          <InfoTab chore={chore} categories={categories} onChanged={onChanged} />
        )}
        {activeTab === 'assign' && (
          <AssignTab chore={chore} kids={kids} onChanged={onChanged} />
        )}
        {activeTab === 'history' && (
          <HistoryTab chore={chore} kids={kids} />
        )}
        {activeTab === 'vacation' && (
          <ChoreVacationSettings choreId={chore.id} />
        )}
      </div>
    </Modal>
  );
}
