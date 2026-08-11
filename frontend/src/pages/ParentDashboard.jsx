import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Flame,
  Star,
  CheckCircle2,
  XCircle,
  Plus,
  Loader2,
  AlertTriangle,
  Users,
  Sparkles,
  Camera,
  MessageSquare,
  Send,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import AvatarDisplay from '../components/AvatarDisplay';
import Modal from '../components/Modal';

export default function ParentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { colorTheme } = useTheme();

  const [familyStats, setFamilyStats] = useState([]);
  const [pendingVerifications, setPendingVerifications] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [bonusModalOpen, setBonusModalOpen] = useState(false);

  const [feedbackText, setFeedbackText] = useState({});
  const [feedbackSending, setFeedbackSending] = useState({});

  const [bonusKidId, setBonusKidId] = useState('');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusDescription, setBonusDescription] = useState('');
  const [bonusIsMalus, setBonusIsMalus] = useState(false);
  const [bonusSubmitting, setBonusSubmitting] = useState(false);
  const [bonusError, setBonusError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [familyRes, calendarRes] = await Promise.all([
        api('/api/stats/family'),
        api('/api/calendar'),
      ]);

      setFamilyStats(familyRes);

      const today = new Date().toISOString().slice(0, 10);
      const todayAssignments = (calendarRes.days && calendarRes.days[today]) || [];
      const needsVerification = todayAssignments.filter(
        (a) => a.status === 'completed'
      );
      setPendingVerifications(needsVerification);
    } catch (err) {
      setError(err.message || t('parentDashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => { fetchData(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchData]);

  const setActionBusy = (key, busy) => {
    setActionLoading((prev) => ({ ...prev, [key]: busy }));
  };

  const handleVerifyChore = async (assignment) => {
    const key = `verify-${assignment.id}`;
    setActionBusy(key, true);
    try {
      await api(`/api/chores/assignments/${assignment.id}/verify`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err.message || t('parentDashboard.verifyError'));
    } finally {
      setActionBusy(key, false);
    }
  };

  const handleRejectChore = async (assignment) => {
    const key = `reject-${assignment.id}`;
    setActionBusy(key, true);
    try {
      await api(`/api/chores/assignments/${assignment.id}/uncomplete`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err.message || t('parentDashboard.rejectError'));
    } finally {
      setActionBusy(key, false);
    }
  };

  const handleBonusSubmit = async () => {
    setBonusError('');
    if (!bonusKidId) {
      setBonusError(t('parentDashboard.selectKid'));
      return;
    }
    const amt = parseInt(bonusAmount, 10);
    if (!amt || amt <= 0) {
      setBonusError(t('parentDashboard.enterPositiveAmount'));
      return;
    }
    if (!bonusDescription.trim()) {
      setBonusError(t('parentDashboard.enterReason'));
      return;
    }

    setBonusSubmitting(true);
    try {
      await api(`/api/points/${bonusKidId}/bonus`, {
        method: 'POST',
        body: { amount: bonusIsMalus ? -amt : amt, description: bonusDescription.trim() },
      });
      setBonusKidId('');
      setBonusAmount('');
      setBonusDescription('');
      setBonusIsMalus(false);
      setBonusModalOpen(false);
      await fetchData();
    } catch (err) {
      setBonusError(err.message || (bonusIsMalus ? t('parentDashboard.malusError') : t('parentDashboard.bonusError')));
    } finally {
      setBonusSubmitting(false);
    }
  };

  const handleSendFeedback = async (assignmentId) => {
    const text = feedbackText[assignmentId]?.trim();
    if (!text) return;
    setFeedbackSending(prev => ({ ...prev, [assignmentId]: true }));
    try {
      await api(`/api/chores/assignments/${assignmentId}/feedback`, {
        method: 'POST',
        body: { feedback: text },
      });
      setFeedbackText(prev => ({ ...prev, [assignmentId]: '' }));
    } catch { /* ignore */ } finally {
      setFeedbackSending(prev => ({ ...prev, [assignmentId]: false }));
    }
  };

  function ProgressBar({ completed, total }) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return (
      <div className="xp-bar">
        <div
          className="xp-bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  const hasPendingItems = pendingVerifications.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-cream text-lg font-semibold">
          {t('parentDashboard.familyOverview')}
        </h1>
        <div className="flex items-center gap-1.5 text-muted text-sm">
          <Users size={14} />
          <span>{t('parentDashboard.membersCount', { count: familyStats.length })}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="game-panel p-3 flex items-center gap-2 border-crimson/30 text-crimson text-sm">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Kid overview cards */}
      {familyStats.length === 0 ? (
        <div className="game-panel p-8 text-center">
          <p className="text-muted text-sm">
            {t('parentDashboard.noKids')}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {familyStats.map((kid) => (
            <div
              key={kid.id}
              className="game-panel p-4 cursor-pointer hover:border-accent/40 transition-colors"
              onClick={() => navigate(`/kids/${kid.id}`)}
            >
              <div className="flex items-center gap-3 mb-3">
                <AvatarDisplay
                  config={kid.avatar_config}
                  photoUrl={kid.avatar_photo_url}
                  size="md"
                  name={kid.display_name}
                  animate
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-cream text-sm font-medium truncate">
                    {kid.display_name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="inline-flex items-center gap-1 text-gold text-xs font-medium">
                      <Star size={11} fill="currentColor" />
                      {t('chores.starsCount', { count: kid.points_balance })}
                    </span>
                    {kid.current_streak > 0 && (
                      <span className="inline-flex items-center gap-1 text-orange-400 text-xs font-medium">
                        <Flame size={11} fill="currentColor" />
                        {kid.current_streak}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">{t('common.today')}</span>
                  <span className="text-cream font-medium">
                    {t('parentDashboard.questsCount', { completed: kid.today_completed, total: kid.today_total })}
                  </span>
                </div>
                <ProgressBar
                  completed={kid.today_completed}
                  total={kid.today_total}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Verifications */}
      {hasPendingItems && (
        <section>
          <h2 className="text-cream text-sm font-semibold mb-2">
            {t('parentDashboard.pendingVerifications')}
          </h2>

          <div className="space-y-2">
            {pendingVerifications.map((assignment) => {
              const verifyKey = `verify-${assignment.id}`;
              const rejectKey = `reject-${assignment.id}`;
              const isVerifying = actionLoading[verifyKey];
              const isRejecting = actionLoading[rejectKey];
              const isBusy = isVerifying || isRejecting;

              return (
                <div
                  key={`chore-${assignment.id}`}
                  className="game-panel p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-cream text-sm font-medium truncate cursor-pointer hover:text-accent transition-colors"
                        onClick={() => navigate(`/chores/${assignment.chore_id}`)}
                      >
                        {themedTitle(assignment.chore?.title || t('parentDashboard.chore'), colorTheme)}
                      </p>
                      <p className="text-muted text-xs mt-0.5">
                        {t('parentDashboard.by', { name: assignment.user?.display_name || t('parentDashboard.kid') })}
                        {assignment.chore?.requires_photo && (
                          <span className="inline-flex items-center gap-1 ml-2 text-accent">
                            <Camera size={10} /> {t('chores.photo')}
                          </span>
                        )}
                        <span className="ml-2 text-gold font-medium">+{t('chores.starsCount', { count: assignment.chore?.points })}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        className="game-btn game-btn-blue !px-2.5 !py-1.5"
                        disabled={isBusy}
                        onClick={() => handleVerifyChore(assignment)}
                        title={t('kidQuests.approve')}
                      >
                        {isVerifying ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                      </button>
                      <button
                        className="game-btn game-btn-red !px-2.5 !py-1.5"
                        disabled={isBusy}
                        onClick={() => handleRejectChore(assignment)}
                        title={t('kidQuests.reject')}
                      >
                        {isRejecting ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <XCircle size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                  {assignment.photo_proof_path && (
                    <div className="mt-2">
                      <img
                        src={`/api/uploads/${assignment.photo_proof_path}`}
                        alt={t('kidQuests.photoProof')}
                        className="rounded-md max-h-48 object-cover border border-border"
                      />
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <MessageSquare size={12} className="text-muted flex-shrink-0" />
                    <input
                      type="text"
                      value={feedbackText[assignment.id] || ''}
                      onChange={e => setFeedbackText(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                      placeholder={t('parentDashboard.leaveFeedback')}
                      maxLength={500}
                      className="field-input !py-1.5 !text-xs flex-1"
                    />
                    <button
                      onClick={() => handleSendFeedback(assignment.id)}
                      disabled={feedbackSending[assignment.id] || !feedbackText[assignment.id]?.trim()}
                      className="game-btn game-btn-blue !py-1.5 !px-2 flex-shrink-0"
                      title={t('parentDashboard.sendFeedback')}
                    >
                      {feedbackSending[assignment.id] ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Send size={12} />
                      )}
                    </button>
                  </div>
                  {assignment.feedback && (
                    <p className="mt-1.5 ml-5 text-muted text-xs italic">
                      {t('parentDashboard.feedbackLabel', { feedback: assignment.feedback })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section className="flex flex-col sm:flex-row gap-2 pt-1">
        <button
          className="game-btn game-btn-blue flex items-center gap-2 justify-center flex-1"
          onClick={() => navigate('/chores')}
        >
          <Plus size={14} />
          {t('parentDashboard.createQuest')}
        </button>
        <button
          className="game-btn game-btn-purple flex items-center gap-2 justify-center flex-1"
          onClick={() => {
            setBonusError('');
            setBonusModalOpen(true);
          }}
        >
          <Sparkles size={14} />
          {t('parentDashboard.awardDeductStars')}
        </button>
      </section>

      {/* Bonus / Malus Modal */}
      <Modal
        isOpen={bonusModalOpen}
        onClose={() => setBonusModalOpen(false)}
        title={bonusIsMalus ? t('parentDashboard.deductStars') : t('parentDashboard.awardBonusStars')}
        actions={[
          {
            label: t('common.cancel'),
            onClick: () => setBonusModalOpen(false),
            className: 'game-btn game-btn-red',
          },
          {
            label: bonusSubmitting ? t('common.saving') : (bonusIsMalus ? t('parentDashboard.deductStars') : t('parentDashboard.awardStars')),
            onClick: handleBonusSubmit,
            disabled: bonusSubmitting,
            className: bonusIsMalus ? 'game-btn game-btn-red' : 'game-btn game-btn-gold',
          },
        ]}
      >
        <div className="space-y-3">
          {bonusError && (
            <div className="p-2 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm">
              {bonusError}
            </div>
          )}

          <div className="flex items-center gap-0.5 bg-navy/60 rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setBonusIsMalus(false)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                !bonusIsMalus ? 'bg-surface-raised text-cream' : 'text-muted hover:text-cream'
              }`}
            >
              {t('parentDashboard.bonus')}
            </button>
            <button
              type="button"
              onClick={() => setBonusIsMalus(true)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                bonusIsMalus ? 'bg-crimson/20 text-crimson' : 'text-muted hover:text-cream'
              }`}
            >
              {t('parentDashboard.malus')}
            </button>
          </div>

          <div>
            <label className="block text-cream text-sm font-medium mb-1">
              {t('parentDashboard.selectKidLabel')}
            </label>
            <select
              value={bonusKidId}
              onChange={(e) => setBonusKidId(e.target.value)}
              className="field-input"
            >
              <option value="">{t('parentDashboard.choose')}</option>
              {familyStats.map((kid) => (
                <option key={kid.id} value={kid.id}>
                  {kid.display_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-cream text-sm font-medium mb-1">
              {t('parentDashboard.starAmount')}
            </label>
            <input
              type="number"
              min="1"
              value={bonusAmount}
              onChange={(e) => setBonusAmount(e.target.value)}
              placeholder="50"
              className="field-input"
            />
          </div>

          <div>
            <label className="block text-cream text-sm font-medium mb-1">
              {t('parentDashboard.reason')}
            </label>
            <input
              type="text"
              value={bonusDescription}
              onChange={(e) => setBonusDescription(e.target.value)}
              placeholder={bonusIsMalus ? t('parentDashboard.malusPlaceholder') : t('parentDashboard.bonusPlaceholder')}
              className="field-input"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
