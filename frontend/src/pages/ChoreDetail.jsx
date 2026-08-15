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
  Shield,
  Loader2,
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

// Format using local date components — toISOString() would shift the date
// by the UTC offset (e.g. back a day for UTC+1/+2 timezones like France).
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function ChoreDetail() {
  const { t } = useTranslation();
  const DAY_NAMES = DAY_KEYS.map((k) => t(k));
  const { id } = useParams();
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const navigate = useNavigate();
  const isKid = user?.role === 'kid';

  const [chore, setChore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionOk, setActionOk] = useState(true);

  const [assignments, setAssignments] = useState([]);

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
    fetchAssignments();
  }, [fetchChore, fetchAssignments]);

  // Live updates via WebSocket
  useEffect(() => {
    const handler = () => { fetchChore(); fetchAssignments(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchChore, fetchAssignments]);

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
  const today = toISO(new Date());
  const todayAssignment = assignments.find(
    (a) => a.date === today && a.user_id === user?.id
  );
  const hasPendingToday = todayAssignment && todayAssignment.status === 'pending';

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
    </div>
  );
}
