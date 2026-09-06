import { lazy, Suspense, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, KIOSK_PINNED_USERNAME_KEY } from './hooks/useAuth';
import { useWebSocket } from './hooks/useWebSocket';
import Layout from './components/Layout';
import UpdatePrompt from './components/UpdatePrompt';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Kiosk = lazy(() => import('./pages/Kiosk'));
const FamilyZone = lazy(() => import('./pages/FamilyZone'));
const KioskDirect = lazy(() => import('./pages/KioskDirect'));
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

  // /kiosk/<username> must work regardless of auth state — switching from
  // one kid's pinned kiosk session straight to another's, without an
  // explicit logout step, needs this route reachable even while a kid is
  // already logged in (it's absent from the routes below once !user is
  // false, which otherwise silently swallows the navigation).
  if (location.pathname.startsWith('/kiosk/')) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/kiosk/:username" element={<KioskDirect />} />
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (!user) {
    // A device pinned to one kid (/kiosk/<username>) self-heals here: if the
    // session was ever lost mid-use (token/cookie expiry after a reload),
    // silently re-open that kid's kiosk instead of stopping on /login.
    let pinnedUsername = null;
    try { pinnedUsername = localStorage.getItem(KIOSK_PINNED_USERNAME_KEY); } catch { /* ignore */ }

    return (
      <Suspense fallback={<Loading />}>
        <UpdatePrompt />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/familyzone" element={<FamilyZone />} />
          <Route
            path="*"
            element={<Navigate to={pinnedUsername ? `/kiosk/${pinnedUsername}` : '/login'} replace />}
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
