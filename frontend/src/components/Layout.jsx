import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth, KIOSK_SESSION_KEY } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { useNotifications } from '../hooks/useNotifications';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useIdleKioskLogout } from '../hooks/useIdleKioskLogout';
import {
  Bell,
  Swords,
  Gift,
  CalendarDays,
  Home,
  CheckCheck,
  X,
  ArrowLeft,
  Loader2,
  Users,
  Trophy,
  MoreHorizontal,
  LogOut,
  Star,
} from 'lucide-react';
import AvatarDisplay from './AvatarDisplay';
import PointsHistoryModal from './PointsHistoryModal';

const ALL_NAV_ITEMS = [
  { labelKey: 'nav.home', icon: Home, path: '/' },
  { labelKey: 'nav.quests', icon: Swords, path: '/chores' },
  { labelKey: 'nav.party', icon: Users, path: '/party', mobileMore: true },
  { labelKey: 'nav.leaderboard', icon: Trophy, path: '/leaderboard', settingKey: 'leaderboard_enabled', mobileMore: true },
  { labelKey: 'nav.rewards', icon: Gift, path: '/rewards' },
  { labelKey: 'nav.calendar', icon: CalendarDays, path: '/calendar', mobileMore: true },
];

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

export default function Layout({ children }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const settings = useSettings();
  const isKioskSession = typeof window !== 'undefined' && sessionStorage.getItem(KIOSK_SESSION_KEY) === '1';
  useIdleKioskLogout();

  const backToSelection = () => {
    logout().finally(() => navigate('/kiosk'));
  };
  const exitKioskMode = () => {
    logout().finally(() => navigate('/login'));
  };
  const { chore_trading_enabled } = settings;
  const { syncFromUser } = useTheme();
  const { syncFromUser: syncLanguageFromUser } = useLanguage();
  const { notifications, unreadCount, markRead, markAllRead, refresh } = useNotifications();

  const handlePullRefresh = useCallback(async () => {
    window.dispatchEvent(new CustomEvent('ws:message', { detail: { type: 'pull_refresh' } }));
    await new Promise((r) => setTimeout(r, 600));
  }, []);
  const { pulling, pullDistance, refreshing } = usePullToRefresh(handlePullRefresh);

  useEffect(() => {
    if (user) {
      syncFromUser(user);
      syncLanguageFromUser(user);
    }
  }, [user, syncFromUser, syncLanguageFromUser]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showPointsHistory, setShowPointsHistory] = useState(false);
  const panelRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!showNotifs) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifs]);

  useEffect(() => {
    if (!showMore) return;
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMore]);

  useEffect(() => {
    setShowNotifs(false);
    setShowMore(false);
  }, [location.pathname]);

  const isParent = user?.role === 'parent' || user?.role === 'admin';
  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.parentOnly && !isParent) return false;
    if (item.settingKey && settings[item.settingKey] === false) return false;
    return true;
  });
  const primaryNavItems = navItems.filter((item) => !item.mobileMore);
  const moreNavItems = navItems.filter((item) => item.mobileMore);
  const isHome = location.pathname === '/';

  const isActive = (path) => path === '/' ? location.pathname === '/' : (location.pathname === path || location.pathname.startsWith(path + '/'));

  // Kiosk sessions get a distraction-free, full-screen view — no sidebar,
  // no top bar, no notifications — just the page content and a small
  // exit button to return to the kid-selection screen.
  if (isKioskSession) {
    return (
      <div className="min-h-screen bg-navy">
        <div className="fixed top-3 left-3 z-40 flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className={`p-2.5 rounded-full backdrop-blur border transition-colors shadow-lg ${
              isHome ? 'bg-accent/20 border-accent text-accent' : 'bg-surface/90 border-border text-muted hover:text-cream'
            }`}
            title={t('nav.home')}
            aria-label={t('nav.home')}
          >
            <Home size={18} />
          </button>
          <button
            onClick={() => navigate('/calendar')}
            className={`p-2.5 rounded-full backdrop-blur border transition-colors shadow-lg ${
              isActive('/calendar') ? 'bg-accent/20 border-accent text-accent' : 'bg-surface/90 border-border text-muted hover:text-cream'
            }`}
            title={t('nav.calendar')}
            aria-label={t('nav.calendar')}
          >
            <CalendarDays size={18} />
          </button>
          <button
            onClick={() => setShowPointsHistory(true)}
            className="p-2.5 rounded-full bg-surface/90 backdrop-blur border border-border text-muted hover:text-cream transition-colors shadow-lg"
            title={t('profile.pointsHistory')}
            aria-label={t('profile.pointsHistory')}
          >
            <Star size={18} />
          </button>
        </div>
        <div className="fixed top-3 right-3 z-40 flex items-center gap-2">
          <button
            onClick={backToSelection}
            className="p-2.5 rounded-full bg-surface/90 backdrop-blur border border-border text-muted hover:text-cream transition-colors shadow-lg"
            title={t('layout.backToSelection')}
            aria-label={t('layout.backToSelection')}
          >
            <LogOut size={18} />
          </button>
          <button
            onClick={exitKioskMode}
            className="p-2.5 rounded-full bg-surface/90 backdrop-blur border border-border text-muted hover:text-cream transition-colors shadow-lg"
            title={t('layout.exitKiosk')}
            aria-label={t('layout.exitKiosk')}
          >
            <X size={18} />
          </button>
        </div>
        <main className="p-4 pb-6 max-w-[100vw] overflow-x-clip">{children}</main>
        <PointsHistoryModal isOpen={showPointsHistory} onClose={() => setShowPointsHistory(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy flex overflow-x-clip max-w-[100vw]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[248px] bg-surface border-r border-border min-h-screen fixed left-0 top-0 z-30">
        <div
          className="flex items-center gap-2.5 px-4 py-4 cursor-pointer"
          onClick={() => navigate('/')}
        >
          <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
            <Swords size={14} className="text-navy" />
          </div>
          <span className="text-cream text-[15px] font-semibold">{t('common.appName')}</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 mt-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors text-left text-sm ${
                  active
                    ? 'bg-surface-raised text-cream'
                    : 'text-muted hover:text-cream hover:bg-surface-raised'
                }`}
              >
                <Icon size={16} className={active ? 'text-accent' : ''} />
                <span className="font-medium">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        {user && (
          <div className="flex items-center gap-1 border-t border-border">
            <div
              className="flex items-center gap-2.5 px-4 py-3 flex-1 min-w-0 cursor-pointer hover:bg-surface-raised transition-colors"
              onClick={() => navigate('/profile')}
            >
              <AvatarDisplay
                config={user.avatar_config}
                photoUrl={user.avatar_photo_url}
                size="sm"
                name={user.display_name || user.username}
                animate
              />
              <div className="min-w-0">
                <p className="text-cream text-sm font-medium truncate">
                  {user.display_name || user.username}
                </p>
                <p className="text-muted text-xs capitalize">{t(`common.roles.${user.role}`)}</p>
              </div>
            </div>
            {isKioskSession && (
              <button
                onClick={backToSelection}
                className="p-2 mr-2 rounded-md text-muted hover:text-cream hover:bg-surface-raised transition-colors flex-shrink-0"
                title={t('layout.backToSelection')}
                aria-label={t('layout.backToSelection')}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-[248px] min-h-screen min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-surface border-b border-border px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isHome && (
              <button
                onClick={() => navigate(-1)}
                className="p-1.5 rounded-md hover:bg-surface-raised transition-colors text-muted hover:text-cream"
                aria-label={t('layout.goBack')}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div
              className="flex items-center gap-2 cursor-pointer md:hidden"
              onClick={() => navigate('/')}
            >
              <div className="w-6 h-6 rounded bg-accent flex items-center justify-center">
                <Swords size={12} className="text-navy" />
              </div>
              <span className="text-cream text-sm font-semibold">{t('common.appName')}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Notification Bell */}
            <div className="relative" ref={panelRef}>
              <button
                onClick={() => {
                  setShowNotifs((v) => {
                    if (!v && unreadCount > 0) markAllRead();
                    return !v;
                  });
                }}
                className="relative p-2 rounded-md hover:bg-surface-raised transition-colors"
                aria-label={t('layout.notifications')}
              >
                <Bell size={18} className="text-muted hover:text-cream transition-colors" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-crimson text-white text-[10px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full px-1 leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Panel */}
              {showNotifs && (
                <div className="fixed right-2 left-2 sm:left-auto sm:absolute sm:right-0 top-12 sm:top-full sm:mt-1 sm:w-80 max-h-96 bg-surface border border-border rounded-md overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <span className="text-cream text-sm font-semibold">{t('layout.notifications')}</span>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
                          className="text-muted hover:text-cream text-xs flex items-center justify-center gap-1 transition-colors min-w-[44px] min-h-[44px]"
                          title={t('layout.markAllRead')}
                        >
                          <CheckCheck size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => setShowNotifs(false)}
                        className="text-muted hover:text-cream transition-colors flex items-center justify-center min-w-[44px] min-h-[44px]"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-80">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-muted text-sm">
                        {t('layout.noNotifications')}
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const isTrade = chore_trading_enabled && n.type === 'trade_proposed' && !n.is_read;
                        const notifTitle = n.params?.key
                          ? t(`notifications.${n.params.key}.title`, n.params)
                          : n.title;
                        const notifMessage = n.params?.key
                          ? t(`notifications.${n.params.key}.message`, n.params)
                          : n.message;
                        return (
                          <div
                            key={n.id}
                            onClick={() => { if (!n.is_read && !isTrade) markRead(n.id); }}
                            className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-surface-raised transition-colors cursor-pointer ${
                              !n.is_read ? 'bg-accent/5' : ''
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.is_read && (
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-cream text-sm font-medium truncate">
                                  {notifTitle}
                                </p>
                                <p className="text-muted text-xs mt-0.5 line-clamp-2">
                                  {notifMessage}
                                </p>
                                {isTrade && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        api(`/api/calendar/trade/${n.id}/accept`, { method: 'POST' })
                                          .then(() => refresh())
                                          .catch(() => {});
                                      }}
                                      className="game-btn game-btn-blue !py-1.5 !px-3 !text-[10px]"
                                    >
                                      {t('common.accept')}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        api(`/api/calendar/trade/${n.id}/deny`, { method: 'POST' })
                                          .then(() => refresh())
                                          .catch(() => {});
                                      }}
                                      className="game-btn game-btn-red !py-1.5 !px-3 !text-[10px]"
                                    >
                                      {t('common.deny')}
                                    </button>
                                  </div>
                                )}
                                <p className="text-muted/60 text-xs mt-1">
                                  {timeAgo(n.created_at, t)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Back to selection (mobile, kiosk session only) */}
            {user && isKioskSession && (
              <button
                onClick={backToSelection}
                className="md:hidden p-2 rounded-md text-muted hover:text-cream transition-colors"
                title={t('layout.backToSelection')}
                aria-label={t('layout.backToSelection')}
              >
                <LogOut size={16} />
              </button>
            )}

            {/* User Avatar (mobile) */}
            {user && (
              <button
                onClick={() => navigate('/profile')}
                className="md:hidden"
                aria-label={t('layout.profile')}
              >
                <AvatarDisplay
                  config={user.avatar_config}
                  photoUrl={user.avatar_photo_url}
                  size="sm"
                  name={user.display_name || user.username}
                  animate
                />
              </button>
            )}
          </div>
        </header>

        {/* Pull-to-refresh indicator */}
        {(pulling || refreshing) && (
          <div
            className="flex items-center justify-center overflow-hidden transition-all duration-200"
            style={{ height: refreshing ? 48 : pullDistance }}
          >
            <Loader2
              size={20}
              className={`text-accent ${refreshing ? 'animate-spin' : ''}`}
              style={{
                opacity: refreshing ? 1 : Math.min(pullDistance / 40, 1),
                transform: refreshing ? 'none' : `rotate(${pullDistance * 3}deg)`,
              }}
            />
          </div>
        )}

        <main className="flex-1 p-4 pb-24 md:pb-6 overflow-x-clip">{children}</main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border" ref={moreRef}>
        {showMore && moreNavItems.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 bg-surface border-t border-border">
            {moreNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setShowMore(false); }}
                  className={`flex items-center gap-3 w-full px-5 py-3 transition-colors text-left text-sm ${
                    active
                      ? 'bg-surface-raised text-cream'
                      : 'text-muted hover:text-cream hover:bg-surface-raised'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-accent' : ''} />
                  <span className="font-medium">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-around h-14 px-1">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-md transition-colors min-w-0 ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                <Icon size={18} />
                <span className="text-[10px] font-medium leading-none truncate">
                  {t(item.labelKey)}
                </span>
              </button>
            );
          })}

          {moreNavItems.length > 0 && (
            <button
              onClick={() => setShowMore((v) => !v)}
              className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-md transition-colors min-w-0 ${
                showMore || moreNavItems.some((item) => isActive(item.path))
                  ? 'text-accent'
                  : 'text-muted'
              }`}
            >
              <MoreHorizontal size={18} />
              <span className="text-[10px] font-medium leading-none truncate">
                {t('layout.more')}
              </span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
