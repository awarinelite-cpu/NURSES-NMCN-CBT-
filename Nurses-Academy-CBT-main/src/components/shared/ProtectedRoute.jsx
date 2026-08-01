// src/components/shared/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getChosenPlatform } from '../auth/AuthPage';

/* ── Loading spinner shown while auth/profile is resolving ── */
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#020B18', flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid rgba(13,148,136,0.2)',
        borderTopColor: '#0D9488',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</span>
    </div>
  );
}

/* ── ProtectedRoute — logged-in users only ── */
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/auth" replace />;
  return children;
}

/* ── NmcnRoute — blocks Entrance-track students from NMCN CBT pages.
     Accounts with no platform set yet (pre-migration) pass through until
     an admin assigns their track via Users Manager.                    ── */
export function NmcnRoute({ children }) {
  const { user, profile, loading } = useAuth();

  if (loading)  return <LoadingScreen />;
  if (!user)    return <Navigate to="/auth" replace />;
  if (!profile) return <LoadingScreen />;

  const isAdminOrSubAdmin = profile.role === 'admin' || profile.role === 'subadmin';
  if (!isAdminOrSubAdmin && profile.platform === 'entrance') {
    return <Navigate to="/entrance-exam" replace />;
  }

  return children;
}

/* ── SubscribedRoute — must be logged in AND have an active subscription ── */
export function SubscribedRoute({ children }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/auth" replace />;
  if (!profile) return <LoadingScreen />;

  const isAdminOrSubAdmin = profile.role === 'admin' || profile.role === 'subadmin';
  if (!isAdminOrSubAdmin && profile.platform === 'entrance') {
    return <Navigate to="/entrance-exam" replace />;
  }

  const now    = new Date();
  const expiry = profile.subscriptionExpiry
    ? new Date(profile.subscriptionExpiry)
    : null;

  const isActive =
    (profile.subscribed === true || ['full','basic','standard','premium'].includes(profile.accessLevel)) &&
    expiry !== null &&
    expiry > now;

  if (!isActive) return <Navigate to="/subscription" replace />;

  return children;
}

/* ── FreeTrialRoute — subscribed users pass through freely.
     Free users pass through ONCE per exam mode (10 Qs cap enforced
     inside each page via useFreeTrialGate). This wrapper just ensures
     the user is logged in, the profile is loaded, and (for students)
     the account belongs to the NMCN track.                              ── */
export function FreeTrialRoute({ children }) {
  const { user, profile, loading } = useAuth();

  if (loading)  return <LoadingScreen />;
  if (!user)    return <Navigate to="/auth" replace />;
  if (!profile) return <LoadingScreen />;

  const isAdminOrSubAdmin = profile.role === 'admin' || profile.role === 'subadmin';
  if (!isAdminOrSubAdmin && profile.platform === 'entrance') {
    return <Navigate to="/entrance-exam" replace />;
  }

  return children;
}

/* ── AdminRoute — must be logged in AND have admin role ── */
export function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading)                    return <LoadingScreen />;
  if (!user)                      return <Navigate to="/auth"      replace />;
  if (profile?.role !== 'admin')  return <Navigate to="/dashboard" replace />;
  return children;
}

/* ── SubAdminRoute — admin OR subadmin role ── */
export function SubAdminRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/auth" replace />;
  const role = profile?.role;
  if (role !== 'admin' && role !== 'subadmin') return <Navigate to="/dashboard" replace />;
  return children;
}

/* ── GuestRoute — redirects logged-in users to their chosen platform ── */
export function GuestRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) {
    if (profile?.role === 'subadmin') return <Navigate to="/subadmin" replace />;
    const platform = getChosenPlatform();
    const dest = platform === 'entrance' ? '/entrance-exam' : '/dashboard';
    return <Navigate to={dest} replace />;
  }
  return children;
}
