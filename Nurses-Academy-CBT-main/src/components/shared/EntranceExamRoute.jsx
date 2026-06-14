// src/components/shared/EntranceExamRoute.jsx
//
// Guards ALL /entrance-exam/* routes.
//
// Logic:
//   - Not logged in              → /auth?redirect=...
//   - Profile still loading      → spinner
//   - Admin                      → full access (bypass payment check)
//   - entranceExamPaid === true  → full access
//   - Logged-in but NOT paid     → /entrance-exam/payment
//                                  (prevents NMCN-only subscribers from
//                                   accessing entrance content for free)

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth }               from '../../context/AuthContext';

export const ENTRANCE_FREE_CAP = 10; // kept for any component that imports it

export default function EntranceExamRoute({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // Spinner while Firebase auth / profile resolves
  if (loading || (user && !profile)) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36,
          border: '3px solid rgba(13,148,136,0.2)',
          borderTopColor: '#0D9488',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  // Not logged in → send to auth, remember destination
  if (!user) {
    return (
      <Navigate
        to={`/auth?redirect=${encodeURIComponent(location.pathname)}&platform=entrance`}
        replace
      />
    );
  }

  // Admin always gets through
  if (profile?.role === 'admin') return children;

  // Must have paid for Entrance Exam specifically
  if (!profile?.entranceExamPaid) {
    // Don't redirect if already on the payment page (avoids redirect loop)
    if (location.pathname === '/entrance-exam/payment') return children;
    return <Navigate to="/entrance-exam/payment" replace />;
  }

  return children;
}
