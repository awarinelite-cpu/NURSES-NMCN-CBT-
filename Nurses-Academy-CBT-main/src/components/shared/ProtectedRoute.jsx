// src/components/shared/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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

/* ── SubscribedRoute — must be logged in AND have an active subscription ── */
export function SubscribedRoute({ children }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/auth" replace />;

  // Wait until profile has loaded from Firestore
  if (!profile) return <LoadingScreen />;

  // Check subscription flag AND expiry date
  const now    = new Date();
  const expiry = profile.subscriptionExpiry
    ? new Date(profile.subscriptionExpiry)
    : null;

  const isActive =
    (profile.subscribed === true || profile.accessLevel === 'full') &&
    expiry !== null &&
    expiry > now;

  if (!isActive) return <Navigate to="/subscription" replace />;

  return children;
}

/* ── FreeTrialRoute — subscribed users pass through freely.
     Free users pass through ONCE per exam mode (10 Qs cap enforced
     inside each page via useFreeTrialGate). If a free user has already
     used their trial for every mode they try to access, they are sent
     to /subscription.
     This wrapper just ensures the user is logged in and the profile is
     loaded. The per-mode gate lives in useFreeTrialGate.js.           ── */
export function FreeTrialRoute({ children }) {
  const { user, profile, loading } = useAuth();

  if (loading)  return <LoadingScreen />;
  if (!user)    return <Navigate to="/auth" replace />;
  if (!profile) return <LoadingScreen />;

  return children;
}

/* ── AdminRoute — must be logged in AND have admin role ── */
export function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading)              return <LoadingScreen />;
  if (!user)                return <Navigate to="/auth"      replace />;
  if (profile?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

/* ── GuestRoute — redirects logged-in users away from auth pages ── */
export function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user)    return <Navigate to="/dashboard" replace />;
  return children;
}
