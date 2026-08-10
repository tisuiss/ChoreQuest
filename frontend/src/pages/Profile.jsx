import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme, COLOR_THEMES } from '../hooks/useTheme';
import { useLanguage, SUPPORTED_LANGUAGES } from '../hooks/useLanguage';
import AvatarDisplay from '../components/AvatarDisplay';
import { useNavigate } from 'react-router-dom';
import ChoreIcon from '../components/ChoreIcon';
import ProgressCharts from '../components/ProgressCharts';
import {
  UserCircle,
  Save,
  LogOut,
  KeyRound,
  Lock,
  Sun,
  Moon,
  Monitor,
  Flame,
  Award,
  Star,
  Loader2,
  Pencil,
  ShieldCheck,
  Settings,
  Trophy,
  ChevronRight,
  Bell,
  BellOff,
  BarChart3,
  Download,
  Shield,
  Globe,
} from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

function timeAgo(dateStr, t) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('layout.justNow');
  if (mins < 60) return t('layout.minutesAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('layout.hoursAgo', { count: hrs });
  return t('layout.daysAgo', { count: Math.floor(hrs / 24) });
}

function PushNotificationToggle() {
  const { t } = useTranslation();
  const { supported, supportLevel, permission, subscribed, loading, toggle } = usePushNotifications();
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  const handleToggle = async () => {
    setToggling(true);
    await toggle();
    setToggling(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const data = await api('/api/push/test', { method: 'POST' });
      setTestResult(data.detail);
    } catch (err) {
      setTestResult(err.message || t('profile.push.testFailed'));
    } finally {
      setTesting(false);
    }
  };

  const denied = permission === 'denied';
  const needsInstall = supportLevel === 'needs-install';
  const needsHttps = supportLevel === 'needs-https';
  const unsupported = supportLevel === 'unsupported';

  return (
    <div className="game-panel p-4">
      <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
        {subscribed ? <Bell size={14} className="text-accent" /> : <BellOff size={14} className="text-muted" />}
        {t('profile.push.title')}
      </h2>
      {needsHttps ? (
        <div>
          <p className="text-cream/80 text-sm">{t('profile.push.subtitle')}</p>
          <p className="text-amber/80 text-xs mt-2">{t('profile.push.needsHttps')}</p>
        </div>
      ) : needsInstall ? (
        <div>
          <p className="text-cream/80 text-sm">{t('profile.push.subtitle')}</p>
          <p className="text-amber/80 text-xs mt-2">{t('profile.push.needsInstall')}</p>
        </div>
      ) : unsupported ? (
        <div>
          <p className="text-cream/80 text-sm">{t('profile.push.subtitle')}</p>
          <p className="text-muted text-xs mt-2">{t('profile.push.unsupported')}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-3">
            <p className="text-cream/80 text-sm">
              {denied
                ? t('profile.push.blocked')
                : subscribed
                  ? t('profile.push.enabled')
                  : t('profile.push.subtitleShort')}
            </p>
            {denied && (
              <p className="text-muted text-xs mt-1">{t('profile.push.blockedHint')}</p>
            )}
          </div>
          <button
            onClick={handleToggle}
            disabled={loading || toggling || denied}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
              subscribed
                ? 'bg-accent/30 border border-accent/40'
                : 'bg-navy border border-border'
            } ${denied ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                subscribed
                  ? 'left-5 bg-accent'
                  : 'left-0.5 bg-muted/60'
              }`}
            />
          </button>
        </div>
      )}
      {subscribed && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="text-xs text-accent/70 hover:text-accent underline"
          >
            {testing ? t('profile.push.sending') : t('profile.push.sendTest')}
          </button>
          {testResult && (
            <span className="text-xs text-muted">{testResult}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const { theme, mode, setMode, colorTheme, setColorTheme } = useTheme();
  const { language, setLanguage } = useLanguage();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState('');

  const isKid = user?.role === 'kid';
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(isKid);

  const [achievements, setAchievements] = useState([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [pin, setPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMsg, setPinMsg] = useState('');
  const [pinMsgOk, setPinMsgOk] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwMsgOk, setPwMsgOk] = useState(false);
  const [nameMsgOk, setNameMsgOk] = useState(false);

  useEffect(() => {
    setDisplayName(user?.display_name || '');
  }, [user?.display_name]);

  useEffect(() => {
    if (!isKid) return;
    (async () => {
      setStatsLoading(true);
      try {
        const data = await api('/api/stats/me');
        setStats(data);
      } catch {
        setStats(null);
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [isKid]);

  useEffect(() => {
    if (!showAchievements || achievements.length > 0) return;
    (async () => {
      setAchievementsLoading(true);
      try {
        const data = await api('/api/stats/achievements/all');
        setAchievements(Array.isArray(data) ? data : []);
      } catch {
        setAchievements([]);
      } finally {
        setAchievementsLoading(false);
      }
    })();
  }, [showAchievements, achievements.length]);

  useEffect(() => {
    if (!showHistory || !user?.id || history.length > 0) return;
    (async () => {
      setHistoryLoading(true);
      try {
        const data = await api(`/api/points/${user.id}`);
        setHistory(Array.isArray(data?.transactions) ? data.transactions : []);
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [showHistory, user?.id, history.length]);

  const saveDisplayName = async () => {
    if (!displayName.trim()) return;
    setNameSaving(true);
    setNameMsg('');
    try {
      const data = await api('/api/auth/me', {
        method: 'PUT',
        body: { display_name: displayName.trim() },
      });
      updateUser({ display_name: data.display_name || displayName.trim() });
      setNameMsg(t('profile.nameUpdated'));
      setNameMsgOk(true);
    } catch (err) {
      setNameMsg(err.message || t('profile.nameUpdateError'));
      setNameMsgOk(false);
    } finally {
      setNameSaving(false);
      setTimeout(() => setNameMsg(''), 3000);
    }
  };

  const pinLength = isKid ? 4 : 6;

  const savePin = async () => {
    if (pin.length !== pinLength || !new RegExp(`^\\d{${pinLength}}$`).test(pin)) {
      setPinMsg(t('profile.pinMustBeDigits', { count: pinLength }));
      setPinMsgOk(false);
      return;
    }
    setPinSaving(true);
    setPinMsg('');
    try {
      await api('/api/auth/set-pin', { method: 'POST', body: { pin } });
      setPinMsg(t('profile.pinSet'));
      setPinMsgOk(true);
      setPin('');
    } catch (err) {
      setPinMsg(err.message || t('profile.pinSetError'));
      setPinMsgOk(false);
    } finally {
      setPinSaving(false);
      setTimeout(() => setPinMsg(''), 3000);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      setPwMsg(t('profile.fillAllPasswordFields'));
      setPwMsgOk(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg(t('profile.passwordsDontMatch'));
      setPwMsgOk(false);
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg(t('profile.passwordTooShort'));
      setPwMsgOk(false);
      return;
    }
    setPwSaving(true);
    setPwMsg('');
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });
      setPwMsg(t('profile.passwordChanged'));
      setPwMsgOk(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwMsg(err.message || t('profile.changePasswordError'));
      setPwMsgOk(false);
    } finally {
      setPwSaving(false);
      setTimeout(() => setPwMsg(''), 3000);
    }
  };

  const tierLabels = {
    bronze: t('common.tiers.bronze'),
    silver: t('common.tiers.silver'),
    gold: t('common.tiers.gold'),
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-cream text-lg font-semibold mb-1">
        {t('profile.title')}
      </h1>

      {/* Avatar + Name */}
      <div className="game-panel p-5 flex flex-col items-center gap-3">
        <button
          onClick={() => navigate('/avatar')}
          className="relative"
          aria-label={t('profile.customiseAvatar')}
        >
          <AvatarDisplay
            config={user?.avatar_config}
            photoUrl={user?.avatar_photo_url}
            size="lg"
            name={user?.display_name || user?.username}
            animate
          />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent flex items-center justify-center border-2 border-surface">
            <Pencil size={12} className="text-navy" />
          </div>
        </button>

        {/* Role */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="inline-block px-2 py-0.5 rounded-md border text-[10px] font-medium capitalize border-border text-muted">
            {t(`common.roles.${user?.role}`)}
          </span>
        </div>

        {/* Editable display name */}
        <div className="w-full max-w-xs">
          <label className="block text-cream text-sm font-medium mb-1 text-center">
            {t('profile.displayName')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={10}
              placeholder={t('profile.displayNamePlaceholder')}
              className="field-input"
            />
            <button
              onClick={saveDisplayName}
              disabled={nameSaving}
              className="game-btn game-btn-blue flex-shrink-0"
            >
              {nameSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
          </div>
          {nameMsg && (
            <p className={`text-xs mt-1 text-center ${nameMsgOk ? 'text-emerald' : 'text-crimson'}`}>
              {nameMsg}
            </p>
          )}
        </div>
      </div>

      {/* Stats (kids only) */}
      {isKid && (
        <div className="game-panel p-4">
          <h2 className="text-cream text-sm font-semibold mb-3">{t('profile.stats')}</h2>
          {statsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="text-accent animate-spin" />
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center">
                  <Star size={16} className="text-gold mx-auto mb-1" />
                  <p className="text-gold text-sm font-medium">
                    {stats.points_balance ?? stats.xp_balance ?? 0}
                  </p>
                  <p className="text-muted text-xs">{t('profile.starsBalance')}</p>
                </div>
                <div className="text-center">
                  <Award size={16} className="text-emerald mx-auto mb-1" />
                  <p className="text-emerald text-sm font-medium">
                    {stats.total_points_earned ?? stats.total_xp_earned ?? 0}
                  </p>
                  <p className="text-muted text-xs">{t('profile.totalEarned')}</p>
                </div>
                <div className="text-center">
                  <Flame size={16} className="text-orange-400 mx-auto mb-1" />
                  <p className="text-orange-400 text-sm font-medium">
                    {stats.current_streak ?? stats.streak ?? 0}
                  </p>
                  <p className="text-muted text-xs">{t('profile.streak')}</p>
                </div>
                <button
                  className="text-center hover:bg-surface-raised/50 rounded-md py-1 transition-colors"
                  onClick={() => setShowAchievements((v) => !v)}
                >
                  <Trophy size={16} className="text-purple mx-auto mb-1" />
                  <p className="text-purple text-sm font-medium">
                    {stats.achievements_count ?? 0}
                  </p>
                  <p className="text-muted text-xs flex items-center justify-center gap-0.5">
                    {t('profile.achievements')} <ChevronRight size={10} />
                  </p>
                </button>
              </div>

              <button
                onClick={() => setShowProgress((v) => !v)}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-md bg-surface-raised/30 hover:bg-surface-raised/60 border border-border/50 text-muted hover:text-cream transition-colors text-xs font-medium"
              >
                <BarChart3 size={13} />
                {showProgress ? t('profile.hideCharts') : t('profile.viewProgressCharts')}
              </button>

              <button
                onClick={() => setShowHistory((v) => !v)}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-md bg-surface-raised/30 hover:bg-surface-raised/60 border border-border/50 text-muted hover:text-cream transition-colors text-xs font-medium"
              >
                <Star size={13} />
                {showHistory ? t('profile.hidePointsHistory') : t('profile.viewPointsHistory')}
              </button>
            </>
          ) : (
            <p className="text-muted text-center text-sm">
              {t('profile.statsNotAvailable')}
            </p>
          )}
        </div>
      )}

      {/* Achievements (kids only) */}
      {isKid && showAchievements && (
        <div className="game-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-cream text-sm font-semibold flex items-center gap-2">
              <Trophy size={14} className="text-purple" />
              {t('profile.achievements')}
            </h2>
            <button
              onClick={() => setShowAchievements(false)}
              className="text-muted text-xs hover:text-cream transition-colors"
            >
              {t('common.hide')}
            </button>
          </div>
          {achievementsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="text-accent animate-spin" />
            </div>
          ) : achievements.length === 0 ? (
            <p className="text-muted text-center text-sm">{t('profile.noAchievementsAvailable')}</p>
          ) : (
            <div className="space-y-1.5">
              {(() => {
                const tierColors = {
                  bronze: { border: 'border-amber-600/40', bg: 'bg-amber-600/10', text: 'text-amber-500', icon: 'text-amber-500' },
                  silver: { border: 'border-slate-300/40', bg: 'bg-slate-300/10', text: 'text-slate-300', icon: 'text-slate-300' },
                  gold: { border: 'border-yellow-400/40', bg: 'bg-yellow-400/10', text: 'text-yellow-400', icon: 'text-yellow-400' },
                };
                const grouped = [];
                const seen = new Set();
                const sorted = [...achievements].sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
                for (const a of sorted) {
                  if (a.group_key && !seen.has(a.group_key)) {
                    seen.add(a.group_key);
                    grouped.push({ group: a.group_key, items: sorted.filter(x => x.group_key === a.group_key) });
                  } else if (!a.group_key && !seen.has(a.id)) {
                    seen.add(a.id);
                    grouped.push({ group: null, items: [a] });
                  }
                }
                return grouped.map(({ group, items }) => (
                  <div key={group || items[0].id}>
                    {group && items.length > 1 && (
                      <p className="text-muted text-xs font-medium mt-2 mb-1 px-1 capitalize">
                        {group.replace(/_/g, ' ')}
                      </p>
                    )}
                    {items.map((a) => {
                      const tier = tierColors[a.tier] || null;
                      return (
                        <div
                          key={a.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-md border transition-opacity mb-1 ${
                            a.unlocked
                              ? tier ? `${tier.border} ${tier.bg}` : 'border-purple/30 bg-purple/5'
                              : 'border-border bg-surface-raised/30 opacity-60'
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                              a.unlocked
                                ? tier ? `${tier.bg} border ${tier.border}` : 'bg-purple/20 border border-purple/40'
                                : 'bg-surface-raised border border-border'
                            }`}
                          >
                            {a.unlocked ? (
                              <ChoreIcon name={a.icon} size={16} className={tier ? tier.icon : 'text-purple'} />
                            ) : (
                              <Lock size={14} className="text-muted" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className={`text-sm font-medium ${a.unlocked ? 'text-cream' : 'text-muted'}`}>
                                {a.title}
                              </p>
                              {tier && (
                                <span className={`text-[9px] font-medium px-1 py-0.5 rounded-md border ${tier.border} ${tier.bg} ${tier.text}`}>
                                  {tierLabels[a.tier]}
                                </span>
                              )}
                            </div>
                            <p className="text-muted text-xs mt-0.5">{a.description}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {a.points_reward > 0 && (
                              <div className="flex items-center gap-0.5">
                                <Star size={11} className="text-gold fill-gold" />
                                <span className="text-gold text-xs font-medium">{a.points_reward}</span>
                              </div>
                            )}
                            {a.unlocked && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const res = await fetch(`/api/stats/achievements/${a.id}/badge`, {
                                      credentials: 'include',
                                    });
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `${a.title.replace(/\s+/g, '_')}_badge.svg`;
                                    link.click();
                                    URL.revokeObjectURL(url);
                                  } catch { /* ignore */ }
                                }}
                                className="p-1 rounded-md hover:bg-surface-raised/60 transition-colors"
                                title={t('profile.downloadBadge')}
                              >
                                <Download size={11} className="text-muted hover:text-cream" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* Points History (kids only) */}
      {isKid && showHistory && (
        <div className="game-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-cream text-sm font-semibold flex items-center gap-2">
              <Star size={14} className="text-gold" />
              {t('profile.pointsHistory')}
            </h2>
            <button
              onClick={() => setShowHistory(false)}
              className="text-muted text-xs hover:text-cream transition-colors"
            >
              {t('common.hide')}
            </button>
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="text-accent animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-muted text-center text-sm">{t('profile.noPointsHistory')}</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border/50 bg-surface-raised/20"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-cream text-sm truncate">{tx.description}</p>
                    <p className="text-muted/60 text-xs mt-0.5">{timeAgo(tx.created_at, t)}</p>
                  </div>
                  <span className={`text-sm font-medium flex-shrink-0 ${tx.amount > 0 ? 'text-gold' : 'text-crimson'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Progress Charts */}
      {showProgress && (
        <div className="game-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-cream text-sm font-semibold flex items-center gap-2">
              <BarChart3 size={14} className="text-accent" />
              {t('profile.progressCharts')}
            </h2>
            <button
              onClick={() => setShowProgress(false)}
              className="text-muted text-xs hover:text-cream transition-colors"
            >
              {t('common.hide')}
            </button>
          </div>
          <ProgressCharts />
        </div>
      )}

      {/* Progress Charts for parents */}
      {!isKid && (
        <div className="game-panel p-4">
          <button
            onClick={() => setShowProgress((v) => !v)}
            className="w-full flex items-center justify-center gap-2 py-2 text-muted hover:text-cream transition-colors text-xs font-medium"
          >
            <BarChart3 size={13} />
            {showProgress ? t('profile.hideFamilyProgressCharts') : t('profile.viewFamilyProgressCharts')}
          </button>
          {showProgress && (
            <div className="mt-3">
              <ProgressCharts />
            </div>
          )}
        </div>
      )}

      {/* PIN Setup */}
      <div className="game-panel p-4">
        <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
          <KeyRound size={14} className="text-muted" />
          {t('profile.quickPinLogin')}
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={pinLength}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
            placeholder={t('profile.pinPlaceholder', { count: pinLength })}
            className="field-input"
          />
          <button
            onClick={savePin}
            disabled={pinSaving}
            className="game-btn game-btn-blue flex-shrink-0"
          >
            {pinSaving ? t('profile.settingPin') : t('profile.setPin')}
          </button>
        </div>
        {pinMsg && (
          <p className={`text-xs mt-2 ${pinMsgOk ? 'text-emerald' : 'text-crimson'}`}>
            {pinMsg}
          </p>
        )}
      </div>

      {/* Password Change */}
      <div className="game-panel p-4">
        <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
          <Lock size={14} className="text-muted" />
          {t('profile.changePassword')}
        </h2>
        <div className="space-y-2">
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t('profile.currentPassword')} autoComplete="current-password" className="field-input" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('profile.newPassword')} autoComplete="new-password" className="field-input" />
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t('profile.confirmNewPassword')} autoComplete="new-password" className="field-input" />
          <button onClick={changePassword} disabled={pwSaving} className="game-btn game-btn-blue">
            {pwSaving ? t('profile.changingPassword') : t('profile.changePassword')}
          </button>
        </div>
        {pwMsg && (
          <p className={`text-xs mt-2 ${pwMsgOk ? 'text-emerald' : 'text-crimson'}`}>
            {pwMsg}
          </p>
        )}
      </div>

      {/* Push Notifications */}
      <PushNotificationToggle />

      {/* Language */}
      <div className="game-panel p-4">
        <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
          <Globe size={14} className="text-muted" />
          {t('profile.language')}
        </h2>
        <div className="flex items-center gap-0.5 bg-navy/60 rounded-md p-0.5 max-w-xs">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => setLanguage(lang.id)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                language === lang.id
                  ? 'bg-surface-raised text-cream'
                  : 'text-muted hover:text-cream'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="game-panel p-4">
        <h2 className="text-cream text-sm font-semibold mb-3">{t('profile.appearance')}</h2>
        <div className="flex items-center gap-0.5 mb-4 bg-navy/60 rounded-md p-0.5">
          {[
            { id: 'light', icon: Sun, label: t('profile.light') },
            { id: 'dark', icon: Moon, label: t('profile.dark') },
            { id: 'system', icon: Monitor, label: t('profile.auto') },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === id
                  ? 'bg-surface-raised text-cream'
                  : 'text-muted hover:text-cream'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Color Theme */}
        <p className="text-muted text-xs font-medium mb-2">{t('profile.colorTheme')}</p>
        {['boy', 'girl'].map((group) => (
          <div key={group} className="mb-3">
            <p className="text-muted text-[11px] font-medium mb-1.5">
              {group === 'boy' ? t('profile.knightThemes') : t('profile.princessThemes')}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {COLOR_THEMES.filter((ct) => ct.group === group).map((ct) => {
                const isActive = colorTheme === ct.id;
                return (
                  <button
                    key={ct.id}
                    onClick={() => setColorTheme(ct.id)}
                    className={`relative flex flex-col items-center gap-1 p-2 rounded-md border transition-colors ${
                      isActive
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:border-border-light bg-surface-raised/30'
                    }`}
                  >
                    <div className="flex gap-0.5">
                      <div
                        className="w-4 h-4 rounded-full border border-white/10"
                        style={{ backgroundColor: ct.accent }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-white/10"
                        style={{ backgroundColor: ct.secondary }}
                      />
                      <div
                        className="w-4 h-4 rounded-full border border-white/10"
                        style={{ backgroundColor: ct.tertiary }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-cream/80 leading-tight text-center">
                      {t(`themes.${ct.id}`)}
                    </span>
                    {isActive && (
                      <div
                        className="absolute top-1 right-1 w-2 h-2 rounded-full"
                        style={{ backgroundColor: ct.accent }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Management */}
      {(user?.role === 'admin' || user?.role === 'parent') && (
        <div className="game-panel p-4 space-y-1.5">
          <h2 className="text-cream text-sm font-semibold mb-2 flex items-center gap-2">
            <Settings size={14} className="text-muted" />
            {t('profile.management')}
          </h2>
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-surface-raised/50 hover:bg-surface-raised border border-border/50 hover:border-border transition-colors text-left"
          >
            <Settings size={16} className="text-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-cream text-sm font-medium">{t('profile.familySettings')}</p>
              <p className="text-muted text-xs">{t('profile.familySettingsDesc')}</p>
            </div>
            <ChevronRight size={14} className="text-muted flex-shrink-0" />
          </button>
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-surface-raised/50 hover:bg-surface-raised border border-border/50 hover:border-border transition-colors text-left"
            >
              <ShieldCheck size={16} className="text-crimson flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-cream text-sm font-medium">{t('profile.adminDashboard')}</p>
                <p className="text-muted text-xs">{t('profile.adminDashboardDesc')}</p>
              </div>
              <ChevronRight size={14} className="text-muted flex-shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* Logout */}
      <div className="pb-6">
        <button
          onClick={logout}
          className="game-btn game-btn-red w-full flex items-center justify-center gap-2"
        >
          <LogOut size={14} />
          {t('common.signOut')}
        </button>
      </div>
    </div>
  );
}
