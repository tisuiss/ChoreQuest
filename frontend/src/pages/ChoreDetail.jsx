import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { themedTitle, themedDescription } from '../utils/questThemeText';
import {
  ArrowLeft,
  Star,
  RefreshCw,
  Camera,
  CheckCircle2,
  XCircle,
  SkipForward,
  Calendar,
  Clock,
  Shield,
  Loader2,
  RotateCw,
  Trash2,
  ChevronRight,
  Users,
} from 'lucide-react';

const DIFFICULTY_LEVEL = { easy: 1, medium: 2, hard: 3, expert: 4 };
const DIFFICULTY_LABEL_KEYS = ['choreDetail.difficultyLabels.trivial', 'choreDetail.difficultyLabels.easy', 'choreDetail.difficultyLabels.medium', 'choreDetail.difficultyLabels.hard', 'choreDetail.difficultyLabels.legendary'];
const DIFFICULTY_COLORS = [
  'text-muted',
  'text-emerald',
  'text-accent',
  'text-purple',
  'text-gold',
];
const DAY_KEYS = ['calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed', 'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat', 'calendar.days.sun'];

const CATEGORY_COLORS = {
  cleaning: 'bg-accent/20 text-accent border-accent/40',
  cooking: 'bg-gold/20 text-gold border-gold/40',
  outdoor: 'bg-emerald/20 text-emerald border-emerald/40',
  homework: 'bg-purple/20 text-purple border-purple/40',
  pet_care: 'bg-crimson/20 text-crimson border-crimson/40',
  laundry: 'bg-accent/20 text-accent border-accent/40',
  errands: 'bg-gold/20 text-gold border-gold/40',
  default: 'bg-cream/10 text-muted border-border',
};

function DifficultyStars({ level }) {
  const { t } = useTranslation();
  // level can be a string ("easy") or number — normalise to 1-based int
  const num = typeof level === 'string' ? (DIFFICULTY_LEVEL[level] || 1) : (level || 1);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={18}
          className={i <= num ? 'text-gold fill-gold' : 'text-cream/20'}
        />
      ))}
      <span className={`ml-2 text-sm ${DIFFICULTY_COLORS[num - 1] || 'text-muted'}`}>
        {DIFFICULTY_LABEL_KEYS[num - 1] ? t(DIFFICULTY_LABEL_KEYS[num - 1]) : t('choreDetail.difficultyLabels.unknown')}
      </span>
    </div>
  );
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const styles = {
    pending: 'bg-gold/20 text-gold border-gold/40',
    completed: 'bg-emerald/20 text-emerald border-emerald/40',
    verified: 'bg-accent/20 text-accent border-accent/40',
    skipped: 'bg-cream/10 text-muted border-border',
    missed: 'bg-crimson/20 text-crimson border-crimson/40',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-sm border capitalize ${
        styles[status] || styles.pending
      }`}
    >
      {t(`chores.status.${status || 'pending'}`, status || 'pending')}
    </span>
  );
}

export default function ChoreDetail() {
  const { t } = useTranslation();
  const DAY_NAMES = DAY_KEYS.map((k) => t(k));
  const { id } = useParams();
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const navigate = useNavigate();
  const isParent = user?.role === 'parent' || user?.role === 'admin';
  const isKid = user?.role === 'kid';

  const [chore, setChore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionOk, setActionOk] = useState(true);

  // Rotation state (parent only)
  const [rotation, setRotation] = useState(null);
  const [allKids, setAllKids] = useState([]);
  const [selectedCadence, setSelectedCadence] = useState('daily');
  const [assignmentRules, setAssignmentRules] = useState([]);

  const fetchRotation = useCallback(async () => {
    if (!isParent) return;
    try {
      const rotations = await api('/api/rotations');
      const match = (rotations || []).find((r) => r.chore_id === parseInt(id));
      setRotation(match || null);
    } catch { setRotation(null); }
  }, [id, isParent]);

  const fetchAssignmentRules = useCallback(async () => {
    if (!isParent) return;
    try {
      const rules = await api(`/api/chores/${id}/rules`);
      setAssignmentRules(Array.isArray(rules) ? rules.filter((r) => r.is_active) : []);
    } catch { setAssignmentRules([]); }
  }, [id, isParent]);

  const fetchChore = useCallback(async () => {
    try {
      setError('');
      const data = await api(`/api/chores/${id}`);
      setChore(data);
    } catch (err) {
      setError(err.message || t('choreDetail.notFoundError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    fetchChore();
    fetchRotation();
    fetchAssignmentRules();
    if (isParent) {
      api('/api/stats/kids').then((data) => setAllKids(data || [])).catch(() => {});
    }
  }, [fetchChore, fetchRotation, fetchAssignmentRules, isParent]);

  // Live updates via WebSocket
  useEffect(() => {
    const handler = () => { fetchChore(); fetchRotation(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchChore, fetchRotation]);

  const handleComplete = async () => {
    setActionLoading('complete');
    setActionMessage('');
    try {
      await api(`/api/chores/${id}/complete`, { method: 'POST' });
      setActionMessage(t('choreDetail.completedMsg'));
      setActionOk(true);
      await fetchChore();
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.completeError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  const handleVerify = async (assignmentId) => {
    setActionLoading('verify');
    setActionMessage('');
    try {
      const path = assignmentId
        ? `/api/chores/assignments/${assignmentId}/verify`
        : `/api/chores/${id}/verify`;
      await api(path, { method: 'POST' });
      setActionMessage(t('choreDetail.verifiedMsg'));
      setActionOk(true);
      await fetchChore();
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
      const path = assignmentId
        ? `/api/chores/assignments/${assignmentId}/uncomplete`
        : `/api/chores/${id}/uncomplete`;
      await api(path, { method: 'POST' });
      setActionMessage(t('choreDetail.uncompletedMsg'));
      setActionOk(true);
      await fetchChore();
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
      const path = assignmentId
        ? `/api/chores/assignments/${assignmentId}/skip`
        : `/api/chores/${id}/skip`;
      await api(path, { method: 'POST' });
      setActionMessage(t('choreDetail.skippedMsg'));
      setActionOk(true);
      await fetchChore();
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.skipError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  const handleCreateRotation = async () => {
    if (allKids.length < 2) { setActionMessage(t('choreDetail.need2Kids')); setActionOk(false); return; }
    setActionLoading('rotation');
    try {
      await api('/api/rotations', {
        method: 'POST',
        body: { chore_id: parseInt(id), kid_ids: allKids.map((k) => k.id), cadence: selectedCadence },
      });
      await fetchRotation();
      setActionMessage(t('choreDetail.rotationCreated'));
      setActionOk(true);
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.rotationCreateError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  const handleAdvanceRotation = async () => {
    if (!rotation) return;
    setActionLoading('rotation');
    try {
      await api(`/api/rotations/${rotation.id}/advance`, { method: 'POST' });
      await fetchRotation();
      setActionMessage(t('choreDetail.rotationAdvanced'));
      setActionOk(true);
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.rotationAdvanceError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  const handleUpdateCadence = async (newCadence) => {
    if (!rotation) return;
    setActionLoading('rotation');
    try {
      await api(`/api/rotations/${rotation.id}`, {
        method: 'PUT',
        body: { cadence: newCadence },
      });
      await fetchRotation();
      setActionMessage(t('choreDetail.cadenceUpdated', { cadence: t(`questAssign.frequency.${newCadence}`, newCadence) }));
      setActionOk(true);
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.cadenceUpdateError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  const handleDeleteRotation = async () => {
    if (!rotation) return;
    setActionLoading('rotation');
    try {
      await api(`/api/rotations/${rotation.id}`, { method: 'DELETE' });
      setRotation(null);
      setActionMessage(t('choreDetail.rotationRemoved'));
      setActionOk(true);
    } catch (err) {
      setActionMessage(err.message || t('choreDetail.rotationDeleteError'));
      setActionOk(false);
    } finally {
      setActionLoading('');
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <button
          onClick={() => navigate('/chores')}
          className="flex items-center gap-2 text-muted hover:text-cream transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">{t('choreDetail.backToBoard')}</span>
        </button>
        <div className="game-panel p-10 text-center">
          <XCircle size={48} className="mx-auto text-crimson mb-4" />
          <p className="text-cream text-base font-semibold mb-2">{t('choreDetail.notFound')}</p>
          <p className="text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!chore) return null;

  const categoryName = typeof chore.category === 'object' ? chore.category?.name : chore.category;
  const categoryColorClass =
    CATEGORY_COLORS[categoryName?.toLowerCase()] || CATEGORY_COLORS.default;

  // Determine today's assignment
  const assignments = chore.assignments || chore.history || [];
  const today = new Date().toISOString().split('T')[0];
  const todayAssignment = assignments.find(
    (a) => a.date === today || a.assigned_date === today || a.due_date === today
  );
  const hasPendingToday =
    todayAssignment && (todayAssignment.status === 'pending' || todayAssignment.status === 'assigned');
  const recentAssignments = assignments.slice(0, 10);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/chores')}
        className="flex items-center gap-2 text-muted hover:text-cream transition-colors"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">{t('choreDetail.backToBoard')}</span>
      </button>

      {/* Main chore panel */}
      <div className="game-panel p-6 space-y-5">
        {/* Title */}
        <div className="flex items-start gap-3">
          {chore.photo_url && (
            <img
              src={chore.photo_url}
              alt=""
              className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border"
            />
          )}
          <div className="flex-1">
            <h1 className="text-cream text-lg font-semibold leading-relaxed">
              {themedTitle(chore.title, colorTheme)}
            </h1>
          </div>
        </div>

        {/* Description */}
        {chore.description && (
          <div className="pl-10">
            <p className="text-muted text-sm leading-relaxed">
              {themedDescription(chore.title, chore.description, colorTheme)}
            </p>
          </div>
        )}

        {/* Divider */}
        <div className="mx-auto w-full h-[1px] bg-border" />

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* XP */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gold/10 flex items-center justify-center">
              <span className="text-gold text-xl">&#9733;</span>
            </div>
            <div>
              <p className="text-muted text-xs font-medium">{t('choreDetail.xpReward')}</p>
              <p className="text-gold text-lg font-medium">{t('choreDetail.xpValue', { count: chore.points })}</p>
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <p className="text-muted text-xs font-medium mb-1">{t('choreDetail.difficulty')}</p>
            <DifficultyStars level={chore.difficulty || 1} />
          </div>

          {/* Category */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-surface-raised flex items-center justify-center">
              <Shield size={18} className="text-muted" />
            </div>
            <div>
              <p className="text-muted text-xs font-medium">{t('choreDetail.category')}</p>
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-sm border capitalize ${categoryColorClass}`}
              >
                {categoryName || t('choreDetail.generalCategory')}
              </span>
            </div>
          </div>

          {/* Recurrence */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-surface-raised flex items-center justify-center">
              <RefreshCw size={18} className="text-muted" />
            </div>
            <div>
              <p className="text-muted text-xs font-medium">{t('choreDetail.recurrence')}</p>
              <p className="text-cream text-sm capitalize">
                {t(`questAssign.frequency.${chore.recurrence || 'once'}`, chore.recurrence || 'once')}
                {chore.recurrence === 'custom' &&
                  chore.custom_days?.length > 0 && (
                    <span className="text-muted text-xs ml-1">
                      ({chore.custom_days.map((d) => DAY_NAMES[d] || d).join(', ')})
                    </span>
                  )}
              </p>
            </div>
          </div>
        </div>

        {/* Photo requirement */}
        {chore.requires_photo && (
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-purple/10 border border-purple/30">
            <Camera size={16} className="text-purple" />
            <span className="text-purple text-xs">
              {t('choreDetail.photoRequired')}
            </span>
          </div>
        )}
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div
          className={`p-3 rounded border text-sm text-center ${
            !actionOk
              ? 'border-crimson/40 bg-crimson/10 text-crimson'
              : 'border-emerald/40 bg-emerald/10 text-emerald'
          }`}
        >
          {actionMessage}
        </div>
      )}

      {/* Actions for kids */}
      {isKid && hasPendingToday && (
        <div className="game-panel p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cream text-sm font-semibold mb-1">{t('choreDetail.todaysQuest')}</p>
            </div>
            <button
              onClick={handleComplete}
              disabled={!!actionLoading}
              className={`game-btn game-btn-blue flex items-center gap-2 ${
                actionLoading === 'complete' ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              <CheckCircle2 size={16} />
              {actionLoading === 'complete' ? t('choreDetail.completing') : t('choreDetail.completeQuest')}
            </button>
          </div>
        </div>
      )}

      {/* Actions for parents */}
      {isParent && (
        <div className="game-panel p-5">
          <p className="text-cream text-sm font-semibold mb-3">{t('choreDetail.actions')}</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleVerify(todayAssignment?.id)}
              disabled={!!actionLoading}
              className={`game-btn game-btn-blue flex items-center gap-2 ${
                actionLoading === 'verify' ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              <CheckCircle2 size={14} />
              {actionLoading === 'verify' ? t('choreDetail.verifying') : t('choreDetail.verify')}
            </button>
            <button
              onClick={() => handleUncomplete(todayAssignment?.id)}
              disabled={!!actionLoading}
              className={`game-btn game-btn-blue flex items-center gap-2 ${
                actionLoading === 'uncomplete' ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              <XCircle size={14} />
              {actionLoading === 'uncomplete' ? t('choreDetail.undoing') : t('choreDetail.uncomplete')}
            </button>
            <button
              onClick={() => handleSkip(todayAssignment?.id)}
              disabled={!!actionLoading}
              className={`game-btn game-btn-red flex items-center gap-2 ${
                actionLoading === 'skip' ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              <SkipForward size={14} />
              {actionLoading === 'skip' ? t('choreDetail.skipping') : t('choreDetail.skipToday')}
            </button>
          </div>
        </div>
      )}

      {/* Assignment Rules Panel (parent only) */}
      {isParent && assignmentRules.length > 0 && (
        <div className="game-panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-accent" />
            <h2 className="text-cream text-sm font-semibold">{t('choreDetail.assignedTo')}</h2>
          </div>
          <div className="space-y-2">
            {assignmentRules.map((rule) => {
              const kid = allKids.find((k) => k.id === rule.user_id);
              return (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-surface-raised/20"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-cream text-sm font-medium truncate">
                      {kid?.display_name || rule.user?.display_name || t('choreDetail.kidFallback', { id: rule.user_id })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-muted text-xs capitalize flex items-center gap-1">
                      <RefreshCw size={10} />
                      {t(`questAssign.frequency.${rule.recurrence}`, rule.recurrence)}
                    </span>
                    {rule.requires_photo && (
                      <span className="text-muted text-xs flex items-center gap-1">
                        <Camera size={10} />
                        {t('choreDetail.photo')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rotation Panel (parent only, recurring chores) */}
      {isParent && chore.recurrence && chore.recurrence !== 'once' && (
        <div className="game-panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <RotateCw size={18} className="text-purple" />
            <h2 className="text-cream text-sm font-semibold">{t('choreDetail.kidRotation')}</h2>
          </div>

          {rotation ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">{t('choreDetail.cadence')}</span>
                <select
                  value={rotation.cadence}
                  onChange={(e) => handleUpdateCadence(e.target.value)}
                  disabled={actionLoading === 'rotation'}
                  className="bg-surface-raised text-cream text-sm rounded-md border border-border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple"
                >
                  <option value="daily">{t('questAssign.frequency.daily')}</option>
                  <option value="weekly">{t('questAssign.frequency.weekly')}</option>
                  <option value="fortnightly">{t('questAssign.frequency.fortnightly')}</option>
                  <option value="monthly">{t('questAssign.frequency.monthly')}</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {(rotation.kid_ids || []).map((kidId, idx) => {
                  const kid = allKids.find((k) => k.id === kidId);
                  const isCurrent = idx === rotation.current_index;
                  return (
                    <span
                      key={kidId}
                      className={`px-3 py-1 rounded-md text-xs font-medium border ${
                        isCurrent
                          ? 'border-purple bg-purple/20 text-purple'
                          : 'border-border text-muted'
                      }`}
                    >
                      {kid?.display_name || t('choreDetail.kidFallback', { id: kidId })}
                      {isCurrent && ` ${t('choreDetail.current')}`}
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleAdvanceRotation}
                  disabled={actionLoading === 'rotation'}
                  className="game-btn game-btn-purple flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
                >
                  <ChevronRight size={14} />
                  {t('choreDetail.advance')}
                </button>
                <button
                  onClick={handleDeleteRotation}
                  disabled={actionLoading === 'rotation'}
                  className="game-btn game-btn-red flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
                >
                  <Trash2 size={14} />
                  {t('choreDetail.removeRotation')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted text-xs">
                {t('choreDetail.noRotationHint')}
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">{t('choreDetail.cadence')}</span>
                <select
                  value={selectedCadence}
                  onChange={(e) => setSelectedCadence(e.target.value)}
                  className="bg-surface-raised text-cream text-sm rounded-md border border-border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple"
                >
                  <option value="daily">{t('questAssign.frequency.daily')}</option>
                  <option value="weekly">{t('questAssign.frequency.weekly')}</option>
                  <option value="fortnightly">{t('questAssign.frequency.fortnightly')}</option>
                  <option value="monthly">{t('questAssign.frequency.monthly')}</option>
                </select>
              </div>
              <button
                onClick={handleCreateRotation}
                disabled={actionLoading === 'rotation' || allKids.length < 2}
                className="game-btn game-btn-purple flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
              >
                <RotateCw size={14} />
                {allKids.length < 2 ? t('choreDetail.need2Kids') : t('choreDetail.createRotation')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Assignment History */}
      {recentAssignments.length > 0 && (
        <div className="game-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-accent" />
            <h2 className="text-cream text-sm font-semibold">{t('choreDetail.history')}</h2>
          </div>

          <div className="space-y-2">
            {recentAssignments.map((assignment, idx) => (
              <div
                key={assignment.id || idx}
                className="flex items-center justify-between p-3 rounded bg-surface-raised/30 border border-border"
              >
                <div className="flex items-center gap-3">
                  <Clock size={14} className="text-cream/30" />
                  <span className="text-muted text-xs">
                    {assignment.date || assignment.assigned_date || assignment.due_date || t('choreDetail.notAvailable')}
                  </span>
                  {assignment.assigned_to_name && (
                    <span className="text-muted text-xs">
                      - {assignment.assigned_to_name}
                    </span>
                  )}
                </div>
                <StatusBadge status={assignment.status} />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
