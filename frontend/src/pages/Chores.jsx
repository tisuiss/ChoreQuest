import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { themedTitle, themedDescription } from '../utils/questThemeText';
import Modal from '../components/Modal';
import QuestCreateModal from '../components/QuestCreateModal';
import QuestAssignModal from '../components/QuestAssignModal';
import CategoryManageModal from '../components/CategoryManageModal';
import AvatarDisplay from '../components/AvatarDisplay';
import ChoreIcon from '../components/ChoreIcon';
import {
  Swords,
  Plus,
  Pencil,
  Trash2,
  Star,
  RefreshCw,
  Calendar,
  Camera,
  Filter,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Users,
  ScrollText,
  Zap,
  Tag,
  ListOrdered,
  LayoutGrid,
  List,
} from 'lucide-react';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', labelKey: 'chores.difficulty.easy', level: 1 },
  { value: 'medium', labelKey: 'chores.difficulty.medium', level: 2 },
  { value: 'hard', labelKey: 'chores.difficulty.hard', level: 3 },
  { value: 'expert', labelKey: 'chores.difficulty.expert', level: 4 },
];
const DIFFICULTY_LEVEL = { easy: 1, medium: 2, hard: 3, expert: 4 };
const DAY_KEYS = ['calendar.days.mon', 'calendar.days.tue', 'calendar.days.wed', 'calendar.days.thu', 'calendar.days.fri', 'calendar.days.sat', 'calendar.days.sun'];

const selectClass =
  'bg-navy-light border border-border text-cream p-2 rounded-md text-sm ' +
  'focus:border-accent focus:outline-none transition-colors';

function DifficultyStars({ level }) {
  const numLevel = typeof level === 'string' ? (DIFFICULTY_LEVEL[level] || 1) : (level || 1);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={12}
          className={i <= numLevel ? 'text-gold fill-gold' : 'text-muted'}
        />
      ))}
    </div>
  );
}

function CategoryBadge({ category }) {
  const { t } = useTranslation();
  const catName = typeof category === 'object' ? category?.name : category;
  return (
    <span className="inline-block px-2 py-0.5 rounded-md text-xs border bg-surface-raised text-muted border-border capitalize">
      {catName || t('chores.generalCategory')}
    </span>
  );
}

function RecurrenceIndicator({ recurrence, customDays }) {
  const { t } = useTranslation();
  const DAY_NAMES = DAY_KEYS.map((k) => t(k));
  if (!recurrence || recurrence === 'once') return null;
  return (
    <div className="flex items-center gap-1 text-muted text-xs">
      <RefreshCw size={11} />
      <span className="capitalize">{t(`questAssign.frequency.${recurrence}`, recurrence)}</span>
      {recurrence === 'custom' && customDays?.length > 0 && (
        <span className="text-muted">
          ({customDays.map((d) => DAY_NAMES[d] || d).join(', ')})
        </span>
      )}
    </div>
  );
}

function getMondayOfThisWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Chores() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const navigate = useNavigate();
  const isParent = user?.role === 'parent' || user?.role === 'admin';
  const isKid = user?.role === 'kid';

  const [chores, setChores] = useState([]);
  const [categories, setCategories] = useState([]);
  const [kids, setKids] = useState([]);
  const [todayAssignments, setTodayAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('library');
  const [viewMode, setViewMode] = useState('list'); // 'grid' | 'list' (parent only)

  const [filterCategory, setFilterCategory] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChore, setEditingChore] = useState(null);
  const [assigningChore, setAssigningChore] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [completingId, setCompletingId] = useState(null);
  const [photoFiles, setPhotoFiles] = useState({});

  const fetchChores = useCallback(async () => {
    try {
      setError('');
      const data = await api('/api/chores');
      setChores(Array.isArray(data) ? data : data.chores || data.items || []);
    } catch (err) {
      setError(err.message || t('chores.loadError'));
    }
  }, [t]);

  const fetchAssignments = useCallback(async () => {
    if (!isKid) return;
    try {
      const monday = getMondayOfThisWeek();
      const today = todayISO();
      const calendarRes = await api(`/api/calendar?week_start=${monday}`);
      const dayAssignments = (calendarRes.days && calendarRes.days[today]) || [];
      setTodayAssignments(dayAssignments);
    } catch {
      // Non-critical
    }
  }, [isKid]);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await api('/api/chores/categories');
      setCategories(Array.isArray(data) ? data : data.categories || []);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchKids = useCallback(async () => {
    if (!isParent) return;
    try {
      const data = await api('/api/stats/family');
      setKids(Array.isArray(data) ? data : []);
    } catch {
      try {
        const data = await api('/api/admin/users');
        const users = Array.isArray(data) ? data : data.users || [];
        setKids(users.filter((u) => u.role === 'kid'));
      } catch {
        // Non-critical
      }
    }
  }, [isParent]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchChores(), fetchAssignments(), fetchCategories(), fetchKids()]);
  }, [fetchChores, fetchAssignments, fetchCategories, fetchKids]);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  useEffect(() => {
    const handler = () => { fetchChores(); fetchAssignments(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchChores, fetchAssignments]);

  const handleKidComplete = async (chore) => {
    const choreId = chore.id;
    if (chore.requires_photo && !photoFiles[choreId]) return;

    setCompletingId(choreId);
    try {
      if (chore.requires_photo && photoFiles[choreId]) {
        const fd = new FormData();
        fd.append('file', photoFiles[choreId]);
        await api(`/api/chores/${choreId}/complete`, { method: 'POST', body: fd });
      } else {
        await api(`/api/chores/${choreId}/complete`, { method: 'POST' });
      }
      setPhotoFiles((prev) => { const next = { ...prev }; delete next[choreId]; return next; });
      await fetchAll();
    } catch (err) {
      setError(err.message || t('chores.completeError'));
    } finally {
      setCompletingId(null);
    }
  };

  const assignmentStatusMap = {};
  if (isKid) {
    for (const a of todayAssignments) {
      const cid = a.chore_id || a.chore?.id;
      if (cid) assignmentStatusMap[cid] = a.status;
    }
  }

  const libraryChores = chores;
  const activeChores = chores.filter((c) => (c.assignment_count || 0) > 0);

  const currentChores = isParent
    ? (activeTab === 'library' ? libraryChores : activeChores)
    : chores;

  const filteredChores = currentChores.filter((chore) => {
    if (filterCategory && chore.category?.name !== filterCategory) return false;
    if (filterDifficulty && chore.difficulty !== filterDifficulty) return false;
    if (isKid && !showCompleted) {
      const status = assignmentStatusMap[chore.id];
      if (status === 'completed' || status === 'verified') return false;
    }
    return true;
  });

  const completedCount = isKid
    ? Object.values(assignmentStatusMap).filter((s) => s === 'completed' || s === 'verified').length
    : 0;

  // Group by category, preserving the order chores already come back in
  // (backend sorts by category then sort_order, so this reads as a routine).
  const groupedChores = [];
  const groupByKey = new Map();
  filteredChores.forEach((chore) => {
    const cat = chore.category;
    const key = cat?.id ?? 'none';
    let group = groupByKey.get(key);
    if (!group) {
      group = {
        key,
        name: cat?.name || t('choreDetail.generalCategory'),
        icon: cat?.icon,
        colour: cat?.colour || '#14b8a6',
        items: [],
      };
      groupByKey.set(key, group);
      groupedChores.push(group);
    }
    group.items.push(chore);
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/api/chores/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await fetchChores();
    } catch (err) {
      setError(err.message || t('chores.removeError'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-cream text-lg font-semibold">
          {isParent ? t('chores.management') : t('chores.myQuests')}
        </h1>
        <div className="flex items-center gap-2">
          {isKid && completedCount > 0 && (
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-1.5 text-muted hover:text-cream text-sm transition-colors"
            >
              {showCompleted ? <EyeOff size={14} /> : <Eye size={14} />}
              {showCompleted ? t('chores.hideCompleted', { count: completedCount }) : t('chores.showCompleted', { count: completedCount })}
            </button>
          )}
          {isParent && (
            <button
              onClick={() => { setEditingChore(null); setShowCreateModal(true); }}
              className="game-btn game-btn-blue flex items-center gap-1.5"
            >
              <Plus size={14} />
              {t('parentDashboard.createQuest')}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-2.5 rounded-md border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {error}
        </div>
      )}

      {/* Parent Tabs */}
      {isParent && (
        <div className="flex gap-0.5 border-b border-border">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'library'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-cream'
            }`}
          >
            <ScrollText size={14} />
            {t('chores.library')}
            <span className="text-xs text-muted">({libraryChores.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'active'
                ? 'border-emerald text-emerald'
                : 'border-transparent text-muted hover:text-cream'
            }`}
          >
            <Zap size={14} />
            {t('chores.active')}
            <span className="text-xs text-muted">({activeChores.length})</span>
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="game-panel p-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-1.5 text-muted">
            <Filter size={14} />
            <span className="text-sm">{t('chores.filters')}</span>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={selectClass}
          >
            <option value="">{t('chores.allCategories')}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className={selectClass}
          >
            <option value="">{t('chores.allDifficulties')}</option>
            {DIFFICULTY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
          {isParent && (
            <div className="flex items-center gap-1 sm:ml-auto">
              <div className="flex items-center gap-0.5 bg-navy/60 rounded-md p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-surface-raised text-cream'
                      : 'text-muted hover:text-cream'
                  }`}
                  title={t('chores.viewGrid')}
                  aria-label={t('chores.viewGrid')}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === 'list'
                      ? 'bg-surface-raised text-cream'
                      : 'text-muted hover:text-cream'
                  }`}
                  title={t('chores.viewList')}
                  aria-label={t('chores.viewList')}
                >
                  <List size={14} />
                </button>
              </div>
              <button
                onClick={() => setShowCategoryModal(true)}
                className="flex items-center gap-1.5 text-muted hover:text-cream text-sm transition-colors"
              >
                <Tag size={14} />
                {t('categories.manage')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chore List */}
      {filteredChores.length === 0 ? (
        <div className="game-panel p-8 text-center">
          <p className="text-muted text-sm">
            {chores.length === 0
              ? t('chores.noneCreated')
              : isParent && activeTab === 'active'
              ? t('chores.noneActive')
              : t('chores.noneMatch')}
          </p>
          {isParent && chores.length === 0 && (
            <button
              onClick={() => { setEditingChore(null); setShowCreateModal(true); }}
              className="game-btn game-btn-blue mt-3 inline-flex items-center gap-1.5"
            >
              <Plus size={14} />
              {t('chores.createFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groupedChores.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${group.colour}26`, color: group.colour }}
                >
                  <ChoreIcon name={group.icon} size={13} />
                </div>
                <h2 className="text-cream text-sm font-semibold">{group.name}</h2>
              </div>
              <div className={isParent && viewMode === 'list' ? 'space-y-1.5' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
                {group.items.map((chore) => {
            const kidStatus = isKid ? assignmentStatusMap[chore.id] : null;
            const isDone = kidStatus === 'completed' || kidStatus === 'verified';
            const isPending = isKid && (kidStatus === 'pending' || kidStatus === 'assigned');
            const isCompleting = completingId === chore.id;
            const assignCount = chore.assignment_count || 0;

            if (isParent && viewMode === 'list') {
              return (
                <div
                  key={chore.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-surface-raised/20 hover:border-accent/40 transition-colors cursor-pointer"
                  onClick={() => {
                    if (activeTab === 'library' && assignCount === 0) {
                      setAssigningChore(chore);
                    } else {
                      navigate(`/chores/${chore.id}`);
                    }
                  }}
                >
                  <ChoreIcon name={chore.icon || chore.category?.icon} size={16} className="flex-shrink-0 text-muted" />
                  <span className="text-cream text-sm font-medium truncate flex-1 min-w-0">
                    {themedTitle(chore.title, colorTheme)}
                  </span>
                  <span className="hidden sm:flex items-center gap-1 text-gold text-xs font-medium flex-shrink-0">
                    <Star size={11} fill="currentColor" />
                    {chore.points}
                  </span>
                  <div className="hidden sm:block flex-shrink-0">
                    <DifficultyStars level={chore.difficulty || 1} />
                  </div>
                  <div className="hidden md:block flex-shrink-0">
                    <CategoryBadge category={chore.category} />
                  </div>
                  <span className="hidden lg:flex items-center gap-1 text-muted text-xs flex-shrink-0" title={t('questCreate.sortOrderHint')}>
                    <ListOrdered size={11} />
                    {chore.sort_order ?? 0}
                  </span>
                  <span
                    className={`hidden sm:inline text-xs flex-shrink-0 ${
                      assignCount > 0 ? 'text-emerald font-medium' : 'text-muted/60'
                    }`}
                  >
                    {assignCount > 0
                      ? t('chores.assignedCount', { count: assignCount })
                      : t('chores.unassigned')}
                  </span>
                  <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => { setEditingChore(chore); setShowCreateModal(true); }}
                      className="p-1 rounded-md hover:bg-surface-raised transition-colors text-muted hover:text-accent"
                      aria-label={t('chores.editQuest')}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(chore)}
                      className="p-1 rounded-md hover:bg-surface-raised transition-colors text-muted hover:text-crimson"
                      aria-label={t('chores.deleteQuest')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={chore.id}
                className={`game-panel p-3 flex flex-col gap-2 cursor-pointer hover:border-accent/40 transition-colors ${
                  isDone ? 'opacity-50' : ''
                }`}
                onClick={() => {
                  if (isParent && activeTab === 'library' && assignCount === 0) {
                    setAssigningChore(chore);
                  } else {
                    navigate(`/chores/${chore.id}`);
                  }
                }}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-cream text-sm font-medium flex-1">
                    {themedTitle(chore.title, colorTheme)}
                  </h3>
                  {isParent && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChore(chore);
                          setShowCreateModal(true);
                        }}
                        className="p-1 rounded-md hover:bg-surface-raised transition-colors text-muted hover:text-accent"
                        aria-label={t('chores.editQuest')}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(chore);
                        }}
                        className="p-1 rounded-md hover:bg-surface-raised transition-colors text-muted hover:text-crimson"
                        aria-label={t('chores.deleteQuest')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                  {isDone && (
                    <CheckCircle2 size={16} className="text-emerald flex-shrink-0" />
                  )}
                </div>

                {/* Description */}
                {chore.description && (
                  <p className="text-muted text-xs line-clamp-2">
                    {themedDescription(chore.title, chore.description, colorTheme)}
                  </p>
                )}

                {/* Meta row */}
                <div className="flex items-center flex-wrap gap-2 mt-auto">
                  <span className="flex items-center gap-1 text-gold font-medium text-sm">
                    <Star size={12} fill="currentColor" />
                    {t('chores.starsCount', { count: chore.points })}
                  </span>
                  <DifficultyStars level={chore.difficulty || 1} />
                </div>

                {/* Bottom row */}
                <div className="flex items-center flex-wrap gap-1.5">
                  <CategoryBadge category={chore.category} />
                  <RecurrenceIndicator
                    recurrence={chore.recurrence}
                    customDays={chore.custom_days}
                  />
                  {isParent && (
                    <span className="flex items-center gap-1 text-muted text-xs" title={t('questCreate.sortOrderHint')}>
                      <ListOrdered size={11} />
                      {t('chores.sortOrderBadge', { order: chore.sort_order ?? 0 })}
                    </span>
                  )}
                  {chore.requires_photo && (
                    <span className="flex items-center gap-1 text-muted text-xs">
                      <Camera size={11} />
                      {t('chores.photo')}
                    </span>
                  )}
                  {isParent && assignCount > 0 && (
                    <span className="flex items-center gap-1 text-emerald text-xs font-medium">
                      <Users size={11} />
                      {t('chores.assignedCount', { count: assignCount })}
                    </span>
                  )}
                  {isParent && assignCount === 0 && (
                    <span className="text-muted/60 text-xs">
                      {t('chores.unassigned')}
                    </span>
                  )}
                </div>

                {/* Parent: assign button */}
                {isParent && activeTab === 'library' && assignCount === 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigningChore(chore);
                    }}
                    className="game-btn game-btn-gold w-full flex items-center justify-center gap-1.5 !text-xs !py-1.5"
                  >
                    <Users size={12} />
                    {t('chores.assign')}
                  </button>
                )}

                {isParent && assignCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigningChore(chore);
                    }}
                    className="game-btn game-btn-purple w-full flex items-center justify-center gap-1.5 !text-xs !py-1.5"
                  >
                    <Users size={12} />
                    {t('chores.manage')}
                  </button>
                )}

                {/* Kid: photo upload + complete */}
                {isPending && (
                  <div
                    className="mt-1 space-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {chore.requires_photo && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-muted cursor-pointer hover:text-cream transition-colors bg-surface-raised px-2.5 py-1.5 rounded-md border border-border">
                        <Camera size={12} />
                        <span>
                          {photoFiles[chore.id]
                            ? photoFiles[chore.id].name
                            : t('chores.attachPhoto')}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            setPhotoFiles((prev) => ({
                              ...prev,
                              [chore.id]: e.target.files?.[0] || null,
                            }))
                          }
                        />
                      </label>
                    )}
                    <button
                      onClick={() => handleKidComplete(chore)}
                      disabled={
                        isCompleting ||
                        (chore.requires_photo && !photoFiles[chore.id])
                      }
                      className={`game-btn game-btn-blue w-full flex items-center justify-center gap-1.5 ${
                        isCompleting ? 'opacity-60 cursor-wait' : ''
                      } ${
                        chore.requires_photo && !photoFiles[chore.id]
                          ? 'opacity-40 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      {isCompleting ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          {t('chores.completing')}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={12} />
                          {t('chores.completeQuest')}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <QuestCreateModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingChore(null); }}
        onCreated={fetchChores}
        categories={categories}
        editingChore={editingChore}
        kids={kids}
      />

      <QuestAssignModal
        isOpen={!!assigningChore}
        onClose={() => setAssigningChore(null)}
        onAssigned={() => { fetchChores(); }}
        chore={assigningChore}
        kids={kids}
      />

      <CategoryManageModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={categories}
        onChanged={fetchCategories}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('chores.removeQuest')}
        actions={[
          {
            label: t('common.cancel'),
            onClick: () => setDeleteTarget(null),
            className: 'game-btn game-btn-blue',
          },
          {
            label: deleting ? t('rewards.removing') : t('common.delete'),
            onClick: handleDelete,
            className: 'game-btn game-btn-red',
            disabled: deleting,
          },
        ]}
      >
        <p className="text-muted">
          {t('chores.removeConfirm', { title: themedTitle(deleteTarget?.title || '', colorTheme) })}
        </p>
      </Modal>
    </div>
  );
}
