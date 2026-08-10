import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import AvatarDisplay from '../components/AvatarDisplay';
import ShoutoutPanel from '../components/ShoutoutPanel';
import EmoteBar from '../components/EmoteBar';
import {
  Users,
  Flame,
  Star,
  Sparkles,
  Swords,
  Loader2,
  Megaphone,
  Pin,
  Plus,
  Trash2,
  Send,
} from 'lucide-react';

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

function ProgressRing({ completed, total, size = 72 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} className="absolute inset-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-border/30"
      />
      {total > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={progress >= 1 ? 'text-emerald' : 'text-accent'}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

export default function Party() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isParent = user?.role === 'parent' || user?.role === 'admin';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Bulletin board state
  const [announcements, setAnnouncements] = useState([]);
  const [showNewAnnouncement, setShowNewAnnouncement] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '', is_pinned: false });
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await api('/api/announcements');
      setAnnouncements(Array.isArray(res) ? res : []);
    } catch {
      setAnnouncements([]);
    }
  }, []);

  const fetchParty = useCallback(async () => {
    try {
      const res = await api('/api/stats/party');
      setData(res);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchParty(), fetchAnnouncements()]).finally(() => setLoading(false));
  }, [fetchParty, fetchAnnouncements]);

  useEffect(() => {
    const handler = () => { fetchParty(); fetchAnnouncements(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchParty, fetchAnnouncements]);

  const handlePostAnnouncement = async () => {
    if (!announcementForm.title.trim() || !announcementForm.message.trim()) return;
    setAnnouncementSubmitting(true);
    try {
      await api('/api/announcements', { method: 'POST', body: announcementForm });
      setAnnouncementForm({ title: '', message: '', is_pinned: false });
      setShowNewAnnouncement(false);
      await fetchAnnouncements();
    } catch { /* ignore */ } finally {
      setAnnouncementSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    try {
      await api(`/api/announcements/${id}`, { method: 'DELETE' });
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted">
        <Users size={48} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">{t('party.loadError')}</p>
      </div>
    );
  }

  const { members, activity, family_streak, family_total_xp } = data;
  const kids = members.filter((m) => m.role === 'kid');
  const parents = members.filter((m) => m.role !== 'kid');

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="game-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-cream text-lg font-semibold flex items-center gap-2">
            <Users size={20} className="text-purple" />
            {t('party.title')}
          </h1>
          <div className="flex items-center gap-1 text-gold text-sm font-medium">
            <Star size={14} className="fill-gold" />
            {t('chores.starsCount', { count: family_total_xp })}
          </div>
        </div>

        {family_streak > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 rounded-lg bg-crimson/10 border border-crimson/20">
            <span className="flex items-center gap-2">
              <Flame size={16} className="text-crimson flex-shrink-0" />
              <span className="text-cream text-sm font-medium">
                {t('party.familyStreak', { count: family_streak })}
              </span>
            </span>
            <span className="text-muted text-xs ml-auto">
              {t('party.everyoneCompleted')}
            </span>
          </div>
        )}
      </div>

      {/* Emote Bar */}
      <div className="game-panel p-3">
        <EmoteBar />
      </div>

      {/* Members */}
      <div className="game-panel p-4">
        <h2 className="text-cream text-sm font-semibold mb-3">{t('party.heroes')}</h2>
        <div className="flex flex-wrap justify-center gap-4">
          {kids.map((kid) => {
            const ringSize = 72;
            return (
              <div key={kid.id} className="flex flex-col items-center gap-2 min-w-[80px]">
                <div className="relative" style={{ width: ringSize, height: ringSize }}>
                  <ProgressRing
                    completed={kid.today_completed || 0}
                    total={kid.today_total || 0}
                    size={ringSize}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <AvatarDisplay config={kid.avatar_config} photoUrl={kid.avatar_photo_url} size="md" name={kid.display_name} animate />
                  </div>
                </div>
                <span className="text-cream text-sm font-medium text-center leading-tight">
                  {kid.display_name}
                </span>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1 text-gold text-xs font-medium">
                    <Star size={10} className="fill-gold" />
                    {t('chores.starsCount', { count: kid.points_balance })}
                  </span>
                  <span className="text-muted text-[11px]">
                    {t('party.todayProgress', { completed: kid.today_completed || 0, total: kid.today_total || 0 })}
                  </span>
                  {kid.current_streak > 0 && (
                    <span className="flex items-center gap-0.5 text-crimson text-[11px]">
                      <Flame size={10} />
                      {t('leaderboard.streakDays', { count: kid.current_streak })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {parents.length > 0 && (
          <>
            <div className="border-t border-border/50 my-3" />
            <div className="flex flex-wrap justify-center gap-4">
              {parents.map((p) => (
                <div key={p.id} className="flex flex-col items-center gap-1.5">
                  <AvatarDisplay config={p.avatar_config} photoUrl={p.avatar_photo_url} size="md" name={p.display_name} animate />
                  <span className="text-cream text-sm font-medium">{p.display_name}</span>
                  <span className="text-muted text-[11px] capitalize">{t(`common.roles.${p.role}`)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Shoutouts */}
      <ShoutoutPanel members={members} />

      {/* Bulletin Board */}
      <div className="game-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-cream text-sm font-semibold flex items-center gap-2">
            <Megaphone size={14} className="text-accent" />
            {t('party.bulletinBoard')}
          </h2>
          {isParent && (
            <button
              onClick={() => setShowNewAnnouncement(v => !v)}
              className="text-accent text-xs hover:text-accent/80 flex items-center gap-1"
            >
              <Plus size={12} />
              {t('party.post')}
            </button>
          )}
        </div>

        {/* New announcement form (parents only) */}
        {isParent && showNewAnnouncement && (
          <div className="mb-4 p-3 rounded-lg bg-surface-raised/40 border border-border space-y-2">
            <input
              type="text"
              value={announcementForm.title}
              onChange={e => setAnnouncementForm(f => ({ ...f, title: e.target.value }))}
              placeholder={t('party.announcementTitle')}
              maxLength={200}
              className="field-input !text-sm"
            />
            <textarea
              value={announcementForm.message}
              onChange={e => setAnnouncementForm(f => ({ ...f, message: e.target.value }))}
              placeholder={t('party.whatsTheNews')}
              maxLength={1000}
              rows={2}
              className="field-input !text-sm resize-none"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-muted text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={announcementForm.is_pinned}
                  onChange={e => setAnnouncementForm(f => ({ ...f, is_pinned: e.target.checked }))}
                  className="rounded border-border"
                />
                <Pin size={10} />
                {t('party.pinToTop')}
              </label>
              <button
                onClick={handlePostAnnouncement}
                disabled={announcementSubmitting || !announcementForm.title.trim()}
                className="game-btn game-btn-blue !py-1.5 !px-3 flex items-center gap-1 text-xs"
              >
                <Send size={12} />
                {announcementSubmitting ? t('party.posting') : t('party.post')}
              </button>
            </div>
          </div>
        )}

        {announcements.length === 0 ? (
          <p className="text-muted text-sm text-center py-4">
            {t('party.noAnnouncements')}
          </p>
        ) : (
          <div className="space-y-2">
            {announcements.map(a => (
              <div
                key={a.id}
                className={`px-3 py-2.5 rounded-md border ${
                  a.is_pinned ? 'border-accent/30 bg-accent/5' : 'border-border/50 bg-surface-raised/20'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {a.is_pinned && <Pin size={10} className="text-accent flex-shrink-0" />}
                      <p className="text-cream text-sm font-medium truncate">{a.title}</p>
                    </div>
                    <p className="text-muted text-xs mt-1">{a.message}</p>
                    <p className="text-muted/50 text-[10px] mt-1">
                      {a.creator_name && <span>{a.creator_name} &middot; </span>}
                      {timeAgo(a.created_at, t)}
                    </p>
                  </div>
                  {isParent && (
                    <button
                      onClick={() => handleDeleteAnnouncement(a.id)}
                      className="p-1 text-muted hover:text-crimson transition-colors flex-shrink-0"
                      title={t('common.delete')}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div className="game-panel p-4">
        <h2 className="text-cream text-sm font-semibold mb-3 flex items-center gap-2">
          <Sparkles size={14} className="text-gold" />
          {t('party.recentActivity')}
        </h2>

        {activity.length === 0 ? (
          <p className="text-muted text-sm text-center py-6">
            {t('party.noActivity')}
          </p>
        ) : (
          <div className="space-y-2">
            {activity.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-border/50 bg-surface-raised/20"
              >
                <div className="mt-0.5 flex-shrink-0">
                  <Swords size={14} className="text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-cream text-sm">
                    <span className="font-medium">{a.user_name}</span>
                    {' '}
                    <span className="text-muted">{a.description}</span>
                    {!!a.xp && (
                      <span className={`font-medium ml-1 ${a.xp > 0 ? 'text-gold' : 'text-crimson'}`}>
                        {a.xp > 0 ? '+' : ''}{t('chores.starsCount', { count: a.xp })}
                      </span>
                    )}
                  </p>
                  <p className="text-muted/60 text-xs mt-0.5">{timeAgo(a.timestamp, t)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
