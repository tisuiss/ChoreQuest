import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import {
  Settings as CogIcon,
  Save,
  Shield,
  Loader2,
  Award,
  ArrowLeft,
  Globe,
} from 'lucide-react';
import VacationSettings from '../components/VacationSettings';
import { SUPPORTED_LANGUAGES } from '../hooks/useLanguage';

export default function Settings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isParentOrAdmin = user?.role === 'parent' || user?.role === 'admin';

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Achievements
  const [achievements, setAchievements] = useState([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [achievementsSaving, setAchievementsSaving] = useState({});

  // Settings are stored as strings in the DB — parse on load, stringify on save
  const parseSettings = (raw) => {
    const parsed = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === 'true') parsed[k] = true;
      else if (v === 'false') parsed[k] = false;
      else if (/^\d+$/.test(v)) parsed[k] = parseInt(v, 10);
      else parsed[k] = v;
    }
    return parsed;
  };

  const stringifySettings = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = String(v);
    }
    return out;
  };

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/admin/settings');
      setSettings(parseSettings(data));
    } catch (err) {
      if (err.message?.includes('403') || err.message?.includes('Forbidden') || err.message?.includes('permission')) {
        setError(t('settings.accessDenied'));
      } else {
        setError(err.message || t('settings.loadError'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchAchievements = useCallback(async () => {
    setAchievementsLoading(true);
    try {
      const data = await api('/api/stats/achievements/all');
      setAchievements(data.achievements || data || []);
    } catch {
      // Achievements endpoint may not exist
      setAchievements([]);
    } finally {
      setAchievementsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isParentOrAdmin) {
      fetchSettings();
      fetchAchievements();
    } else {
      setLoading(false);
      setError(t('settings.accessDenied'));
    }
  }, [isParentOrAdmin, fetchSettings, fetchAchievements, t]);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { settings: stringifySettings(settings) } });
      setSaveMsg(t('settings.saved'));
      window.dispatchEvent(new CustomEvent('settings:updated'));
    } catch (err) {
      setSaveMsg(err.message || t('settings.saveError'));
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const updateAchievementPoints = async (achievement) => {
    setAchievementsSaving((prev) => ({ ...prev, [achievement.id]: true }));
    try {
      await api(`/api/stats/achievements/${achievement.id}`, {
        method: 'PUT',
        body: { points_reward: achievement.points_reward },
      });
    } catch {
      // Revert will be handled by re-fetch if needed
    } finally {
      setAchievementsSaving((prev) => ({ ...prev, [achievement.id]: false }));
    }
  };

  const ToggleSwitch = ({ enabled, onChange, label }) => (
    <div className="flex items-center justify-between py-3">
      <span className="text-cream text-sm">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors flex-shrink-0 ${
          enabled
            ? 'bg-accent/30 border-accent/40'
            : 'bg-navy border-border'
        }`}
        aria-label={`${t('settings.toggle')} ${label}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition-transform ${
            enabled
              ? 'translate-x-6 bg-accent'
              : 'translate-x-1 bg-muted/60'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto overflow-hidden">
      {/* Back + Header */}
      <button
        onClick={() => navigate('/profile')}
        className="flex items-center gap-1.5 text-muted hover:text-cream transition-colors mb-4 text-sm"
      >
        <ArrowLeft size={16} />
        {t('settings.profile')}
      </button>
      <div className="flex items-center gap-3 mb-6">
        <CogIcon size={24} className="text-cream" />
        <h1 className="text-cream text-lg font-semibold">
          {t('settings.title')}
        </h1>
      </div>

      {/* Error / Access denied */}
      {error && (
        <div className="game-panel p-8 text-center">
          <Shield size={48} className="text-crimson/30 mx-auto mb-4" />
          <p className="text-crimson text-sm">{error}</p>
          <p className="text-muted text-xs mt-2">
            {t('settings.accessDeniedHint')}
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-accent animate-spin" />
        </div>
      )}

      {/* Settings form */}
      {!loading && !error && settings && (
        <div className="space-y-6">
          {/* Toggle settings */}
          <div className="game-panel p-4">
            <h2 className="text-cream text-sm font-semibold mb-3">
              {t('settings.featureToggles')}
            </h2>

            <div className="divide-y divide-border">
              <ToggleSwitch
                enabled={settings.leaderboard_enabled ?? true}
                onChange={(v) => updateSetting('leaderboard_enabled', v)}
                label={t('settings.leaderboard')}
              />
              <ToggleSwitch
                enabled={settings.chore_trading_enabled ?? true}
                onChange={(v) => updateSetting('chore_trading_enabled', v)}
                label={t('settings.choreTrading')}
              />
            </div>
          </div>

          {/* Family default language */}
          <div className="game-panel p-4">
            <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
              <Globe size={16} className="text-muted" />
              {t('settings.defaultLanguage')}
            </h2>
            <p className="text-muted text-xs mb-3">
              {t('settings.defaultLanguageHint')}
            </p>
            <div className="flex items-center gap-0.5 bg-navy/60 rounded-md p-0.5 max-w-xs">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => updateSetting('default_language', lang.id)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    (settings.default_language ?? 'fr') === lang.id
                      ? 'bg-surface-raised text-cream'
                      : 'text-muted hover:text-cream'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Daily reset hour */}
          <div className="game-panel p-4">
            <h2 className="text-cream text-sm font-semibold mb-3">
              {t('settings.dailyResetHour')}
            </h2>
            <p className="text-muted text-xs mb-3">
              {t('settings.dailyResetHourHint')}
            </p>
            <input
              type="number"
              min={0}
              max={23}
              value={settings.daily_reset_hour ?? 0}
              onChange={(e) => {
                const val = Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0));
                updateSetting('daily_reset_hour', val);
              }}
              className="field-input max-w-[120px]"
            />
          </div>

          {/* Save button */}
          <button
            onClick={saveSettings}
            disabled={saving}
            className="game-btn game-btn-blue flex items-center gap-2"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? t('common.saving') : t('settings.saveSettings')}
          </button>
          {saveMsg && (
            <p className={`text-sm ${saveMsg === t('settings.saved') ? 'text-emerald' : 'text-crimson'}`}>
              {saveMsg}
            </p>
          )}

          {/* Achievement point values */}
          <div className="game-panel p-4">
            <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
              <Award size={16} className="text-muted" />
              {t('settings.achievementPoints')}
            </h2>

            {achievementsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="text-accent animate-spin" />
              </div>
            ) : achievements.length === 0 ? (
              <p className="text-muted text-xs">
                {t('settings.noAchievements')}
              </p>
            ) : (
              <div className="space-y-3">
                {achievements.map((ach) => {
                  const tierColors = { bronze: 'text-amber-500 bg-amber-600/10 border-amber-600/30', silver: 'text-slate-300 bg-slate-300/10 border-slate-300/30', gold: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' };
                  const tierStyle = tierColors[ach.tier] || '';
                  return (
                  <div
                    key={ach.id}
                    className="p-3 rounded-md bg-surface-raised/30 border border-border space-y-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-cream text-sm truncate">
                          {ach.title || ach.name}
                        </p>
                        {ach.tier && (
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md border ${tierStyle}`}>
                            {ach.tier}
                          </span>
                        )}
                      </div>
                      {ach.description && (
                        <p className="text-muted text-xs">
                          {ach.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={ach.points_reward ?? 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setAchievements((prev) =>
                            prev.map((a) =>
                              a.id === ach.id
                                ? { ...a, points_reward: val }
                                : a
                            )
                          );
                        }}
                        className="field-input !w-20 !p-2 text-center"
                      />
                      <span className="text-muted text-xs">{t('settings.pts')}</span>
                      <button
                        onClick={() => updateAchievementPoints(ach)}
                        disabled={achievementsSaving[ach.id]}
                        className="game-btn game-btn-blue !py-2 !px-3 ml-auto"
                        title={t('common.save')}
                      >
                        {achievementsSaving[ach.id] ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Save size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vacation Mode */}
          <VacationSettings />

          {/* Admin link */}
          {user?.role === 'admin' && (
            <div className="game-panel p-4 text-center">
              <p className="text-muted text-xs mb-3">
                {t('settings.needAdvancedControls')}
              </p>
              <button
                onClick={() => navigate('/admin')}
                className="game-btn game-btn-purple"
              >
                <Shield size={14} className="inline mr-2" />
                {t('settings.adminDashboard')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
