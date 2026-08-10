import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import Modal from './Modal';
import AvatarDisplay from './AvatarDisplay';
import {
  Star,
  RefreshCw,
  Camera,
  Users,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Loader2,
  CalendarDays,
} from 'lucide-react';

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

export default function QuestAssignModal({
  isOpen,
  onClose,
  onAssigned,
  chore,
  kids,
}) {
  const { t } = useTranslation();
  const DAY_NAMES = DAY_KEYS.map((k) => t(k));
  const { colorTheme } = useTheme();

  // Per-kid: { [kidId]: { selected, requires_photo } }
  const [kidConfigs, setKidConfigs] = useState({});
  const [expandedKid, setExpandedKid] = useState(null);

  // Shared schedule (applies to all selected kids)
  const [scheduleFrequency, setScheduleFrequency] = useState('once');
  const [scheduleDays, setScheduleDays] = useState([]);

  // Rotation (2+ kids only)
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationCadence, setRotationCadence] = useState('daily');
  const [rotationFirstKid, setRotationFirstKid] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hadExistingAssignments, setHadExistingAssignments] = useState(false);

  // Initialize
  useEffect(() => {
    if (!isOpen || !chore || !kids.length) return;

    // Fetch existing rules
    api(`/api/chores/${chore.id}/rules`)
      .then((rules) => {
        const rulesList = Array.isArray(rules) ? rules : [];
        const hasActive = rulesList.some((r) => r.is_active);
        setHadExistingAssignments(hasActive);

        // Build kid configs
        const configs = {};
        for (const kid of kids) {
          const existingRule = rulesList.find(
            (r) => r.user_id === kid.id && r.is_active
          );
          configs[kid.id] = {
            selected: !!existingRule,
            requires_photo: existingRule?.requires_photo || false,
          };
        }
        setKidConfigs(configs);

        // Derive shared schedule from first active rule
        const firstActive = rulesList.find((r) => r.is_active);
        if (firstActive) {
          if (firstActive.recurrence === 'custom' && firstActive.custom_days?.length) {
            setScheduleFrequency('daily'); // underlying default for day-picker mode
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

    // Fetch existing rotation
    api(`/api/chores/${chore.id}/rotation`)
      .then((rot) => {
        if (rot && rot.kid_ids && rot.kid_ids.length >= 2) {
          setRotationEnabled(true);
          setRotationCadence(rot.cadence || 'daily');
          const currentIdx = rot.current_index ?? 0;
          setRotationFirstKid(rot.kid_ids[currentIdx] ?? rot.kid_ids[0]);
        } else {
          setRotationEnabled(false);
          setRotationCadence('daily');
          setRotationFirstKid(null);
        }
      })
      .catch(() => {
        setRotationEnabled(false);
        setRotationCadence('daily');
        setRotationFirstKid(null);
      });

    setError('');
  }, [isOpen, chore, kids]);

  const selectedKids = Object.entries(kidConfigs).filter(([, c]) => c.selected);
  const selectedCount = selectedKids.length;
  const isUnassigningAll = hadExistingAssignments && selectedCount === 0;

  // Auto-default rotationFirstKid
  useEffect(() => {
    if (!rotationEnabled || selectedCount < 2) return;
    const selectedIds = selectedKids.map(([id]) => Number(id));
    if (rotationFirstKid == null || !selectedIds.includes(Number(rotationFirstKid))) {
      setRotationFirstKid(selectedIds[0]);
    }
  }, [rotationEnabled, selectedCount, kidConfigs]);

  const toggleKid = (kidId) => {
    setKidConfigs((prev) => ({
      ...prev,
      [kidId]: { ...prev[kidId], selected: !prev[kidId]?.selected },
    }));
  };

  const toggleScheduleDay = (dayIdx) => {
    setScheduleDays((prev) =>
      prev.includes(dayIdx)
        ? prev.filter((d) => d !== dayIdx)
        : [...prev, dayIdx]
    );
  };

  // Toggle photo proof for all selected kids
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

  // Compute the effective recurrence + custom_days from shared schedule
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
      // Reorder so the chosen first kid is at index 0
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
      onAssigned();
      onClose();
    } catch (err) {
      setError(err.message || t('questAssign.assignError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!chore) return null;

  const allSelectedHavePhoto = selectedCount > 0 && selectedKids.every(([, c]) => c.requires_photo);
  const someSelectedHavePhoto = selectedCount > 0 && selectedKids.some(([, c]) => c.requires_photo);
  const hasDaysSelected = scheduleDays.length > 0;

  // Summary text for the schedule
  const scheduleLabel = (() => {
    if (hasDaysSelected) {
      return scheduleDays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d])
        .join(', ');
    }
    const opt = FREQUENCY_OPTIONS.find((f) => f.value === scheduleFrequency);
    return opt ? t(opt.labelKey) : scheduleFrequency;
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('questAssign.title')}
      actions={[
        { label: t('common.cancel'), onClick: onClose, className: 'game-btn game-btn-blue' },
        {
          label: submitting
            ? t('common.saving')
            : isUnassigningAll
            ? t('questAssign.unassignAll')
            : selectedCount === 0
            ? t('common.save')
            : t('questAssign.assignQuest'),
          onClick: handleSubmit,
          className: isUnassigningAll ? 'game-btn game-btn-red' : 'game-btn game-btn-gold',
          disabled: submitting,
        },
      ]}
    >
      <div className="space-y-4">
        {error && (
          <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
            {error}
          </div>
        )}

        {/* Quest summary */}
        <div className="p-3 rounded-lg border border-border bg-surface-raised/30">
          <h3 className="text-cream font-bold text-base">{themedTitle(chore.title, colorTheme)}</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-gold text-sm font-bold">
              <Star size={12} className="fill-gold" />
              {t('chores.starsCount', { count: chore.points })}
            </span>
            <span className="text-muted text-xs capitalize">{t(`chores.difficulty.${chore.difficulty}`)}</span>
            {chore.category && (
              <span className="text-muted text-xs">{chore.category.name || chore.category}</span>
            )}
          </div>
        </div>

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

                  {/* Expanded: per-kid photo proof only */}
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
                              config.requires_photo
                                ? 'left-5 bg-accent'
                                : 'left-0.5 bg-muted'
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

        {/* Unassign warning */}
        {isUnassigningAll && (
          <div className="p-3 rounded-lg border border-crimson/30 bg-crimson/10 text-crimson text-sm">
            {t('questAssign.noHeroesSelected')}
          </div>
        )}

        {/* Schedule section — shown when 1+ kids selected */}
        {selectedCount > 0 && (
          <div className="p-3 rounded-lg border border-border bg-surface-raised/20 space-y-3">
            <label className="text-cream text-sm font-medium flex items-center gap-2">
              <CalendarDays size={14} />
              {t('questAssign.schedule')}
            </label>

            {/* Frequency dropdown */}
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

            {/* Day picker */}
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

        {/* Photo proof toggle */}
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

        {/* Rotation section — shown when 2+ kids selected */}
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
                  rotationEnabled
                    ? 'bg-purple/20 border-purple'
                    : 'bg-navy-light border-border'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                    rotationEnabled ? 'left-6 bg-purple' : 'left-0.5 bg-muted'
                  }`}
                />
              </button>
            </div>
            <p className="text-muted text-xs">
              {t('questAssign.rotationHint')}
            </p>
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
                  <p className="text-muted text-xs mt-1">
                    {t('questAssign.startsWithHint')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
