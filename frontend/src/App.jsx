import { lazy, Suspense, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, KIOSK_PINNED_USERNAME_KEY } from './hooks/useAuth';
import { useWebSocket } from './hooks/useWebSocket';
import { getDeviceToken } from './api/client';
import Layout from './components/Layout';
import UpdatePrompt from './components/UpdatePrompt';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Kiosk = lazy(() => import('./pages/Kiosk'));
const FamilyZone = lazy(() => import('./pages/FamilyZone'));
const KioskDirect = lazy(() => import('./pages/KioskDirect'));
const PairDevice = lazy(() => import('./pages/PairDevice'));
const KidDashboard = lazy(() => import('./pages/KidDashboard'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Chores = lazy(() => import('./pages/Chores'));
const ChoreDetail = lazy(() => import('./pages/ChoreDetail'));
const Rewards = lazy(() => import('./pages/Rewards'));
const Profile = lazy(() => import('./pages/Profile'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Settings = lazy(() => import('./pages/Settings'));
const KidQuests = lazy(() => import('./pages/KidQuests'));
const Party = lazy(() => import('./pages/Party'));
const PointsHistory = lazy(() => import('./pages/PointsHistory'));
const AvatarEditor = lazy(() => import('./components/AvatarEditor'));

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-accent font-medium text-sm">Loading...</div>
    </div>
  );
}

export default function App() {
  const { user, loading, refreshSession } = useAuth();
  const location = useLocation();

  const handleWsMessage = useCallback((msg) => {
    // Refresh user object (points_balance, etc.) on every WS event
    refreshSession();
    window.dispatchEvent(new CustomEvent('ws:message', { detail: msg }));
  }, [refreshSession]);

  useWebSocket(user?.id, handleWsMessage);

  if (loading) return <Loading />;

  // Whether this device is either logged in or has already been paired as
  // the trusted kiosk screen (a one-time-use token stored in localStorage
  // via /pair). Only then do /kiosk and /familyzone stay directly reachable
  // — every other device gets redirected to /login instead.
  const hasFamilyAccess = !!user || !!getDeviceToken();

  // /pair must work regardless of auth state — it's how a fresh device
  // becomes the trusted kiosk screen in the first place.
  if (location.pathname === '/pair') {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/pair" element={<PairDevice />} />
        </Routes>
      </Suspense>
    );
  }

  // /kiosk/<username> must work regardless of login state for an already
  // paired/logged-in device — switching from one kid's pinned kiosk session
  // straight to another's, without an explicit logout step, needs this
  // route reachable even while a kid is already logged in (it's absent from
  // the routes below once !user is false, which otherwise silently
  // swallows the navigation). An unpaired, logged-out visitor is redirected
  // to /login instead of reaching the kid-switch screen.
  if (location.pathname.startsWith('/kiosk/')) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route
            path="/kiosk/:username"
            element={hasFamilyAccess ? <KioskDirect /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // /kiosk and /familyzone are full-screen, no-sidebar experiences by design
  // (meant for the shared kiosk display) — reachable this way regardless of
  // auth state: a paired/unpaired device sees them per hasFamilyAccess below,
  // and a logged-in parent can also jump here from the sidebar nav without
  // losing their own session (Kiosk.jsx/FamilyZone.jsx show a way back).
  if (location.pathname === '/kiosk' || location.pathname === '/familyzone') {
    if (!hasFamilyAccess) {
      return (
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<Loading />}>
        <UpdatePrompt />
        <Routes>
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/familyzone" element={<FamilyZone />} />
        </Routes>
      </Suspense>
    );
  }

  if (!user) {
    // A device pinned to one kid (/kiosk/<username>) self-heals here: if the
    // session was ever lost mid-use (token/cookie expiry after a reload),
    // silently re-open that kid's kiosk instead of stopping on /login. Only
    // applies to an already-paired device — an unpaired one falls through
    // to /login like any other unrecognized visitor.
    let pinnedUsername = null;
    try { pinnedUsername = localStorage.getItem(KIOSK_PINNED_USERNAME_KEY); } catch { /* ignore */ }

    return (
      <Suspense fallback={<Loading />}>
        <UpdatePrompt />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="*"
            element={
              <Navigate
                to={hasFamilyAccess && pinnedUsername ? `/kiosk/${pinnedUsername}` : '/login'}
                replace
              />
            }
          />
        </Routes>
      </Suspense>
    );
  }

  const DashboardComponent = user.role === 'kid' ? KidDashboard
    : user.role === 'parent' ? ParentDashboard
    : ParentDashboard;

  return (
    <Layout>
      <UpdatePrompt />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<DashboardComponent />} />
          <Route path="/chores" element={<Chores />} />
          <Route path="/chores/:id" element={<ChoreDetail />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/inventory" element={<Navigate to="/rewards?tab=inventory" replace />} />
          <Route path="/wishlist" element={<Navigate to="/rewards?tab=wishlist" replace />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/history" element={<PointsHistory />} />
          <Route path="/party" element={<Party />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/avatar" element={<AvatarEditor />} />
          <Route path="/kids/:kidId" element={<KidQuests />} />
          <Route path="/settings" element={<Settings />} />
          {user.role === 'admin' && <Route path="/admin" element={<AdminDashboard />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
