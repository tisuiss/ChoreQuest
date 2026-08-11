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
  Clock,
  Shield,
  Loader2,
  RotateCw,
  Trash2,
  ChevronRight,
  Users,
  X,
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

function lastNDays(n) {
  const dates = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
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
          {rows.map((row) => {
            return (
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
            );
          })}
        </tbody>
      </table>
    </div>
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

  // Per-kid assignment grid (last 7 days)
  const [assignments, setAssignments] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);

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

  const fetchAssignments = useCallback(async () => {
    try {
      const data = await api(`/api/chores/${id}/assignments?days=7`);
      setAssignments(Array.isArray(data) ? data : []);
    } catch { setAssignments([]); }
  }, [id]);

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
    fetchAssignments();
    if (isParent) {
      api('/api/stats/kids').then((data) => setAllKids(data || [])).catch(() => {});
    }
  }, [fetchChore, fetchRotation, fetchAssignmentRules, fetchAssignments, isParent]);

  // Live updates via WebSocket
  useEffect(() => {
    const handler = () => { fetchChore(); fetchRotation(); fetchAssignments(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchChore, fetchRotation, fetchAssignments]);

  const handleComplete = async () => {
    setActionLoading('complete');
    setActionMessage('');
    try {
      await api(`/api/chores/${id}/complete`, { method: 'POST' });
      setActionMessage(t('choreDetail.completedMsg'));
      setActionOk(true);
      await Promise.all([fetchChore(), fetchAssignments()]);
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
      await api(`/api/chores/assignments/${assignmentId}/verify`, { method: 'POST' });
      setActionMessage(t('choreDetail.verifiedMsg'));
      setActionOk(true);
      setSelectedCell(null);
      await Promise.all([fetchChore(), fetchAssignments()]);
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
      await Promise.all([fetchChore(), fetchAssignments()]);
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
      await Promise.all([fetchChore(), fetchAssignments()]);
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

  // Determine today's assignment for the logged-in kid
  const today = new Date().toISOString().split('T')[0];
  const todayAssignment = assignments.find(
    (a) => a.date === today && a.user_id === user?.id
  );
  const hasPendingToday = todayAssignment && todayAssignment.status === 'pending';

  // Grid rows = union of currently-assigned kids (active rules) and kids with
  // recent assignment data — a one-time chore's rule is deactivated once
  // verified, but the assignment (and its "undo" action) must stay visible.
  const gridUserIds = [
    ...new Set([
      ...assignmentRules.map((r) => r.user_id),
      ...assignments.map((a) => a.user_id),
    ]),
  ];
  const gridRows = gridUserIds.map((uid) => {
    const rule = assignmentRules.find((r) => r.user_id === uid);
    const kid = allKids.find((k) => k.id === uid);
    const fallbackAssignment = assignments.find((a) => a.user_id === uid);
    const kidName =
      kid?.display_name ||
      rule?.user?.display_name ||
      fallbackAssignment?.user?.display_name ||
      t('choreDetail.kidFallback', { id: uid });
    return { id: `kid-${uid}`, user_id: uid, kidName };
  });

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

      {/* Per-kid assignment grid (parent only) */}
      {isParent && gridRows.length > 0 && (
        <div className="game-panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-accent" />
            <h2 className="text-cream text-sm font-semibold">{t('choreDetail.assignedTo')}</h2>
          </div>
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
                )}
                {selectedCell.status === 'skipped' && (
                  <p className="text-muted text-xs">{t('chores.status.skipped')}</p>
                )}
              </div>
            </div>
          )}
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

    </div>
  );
}
