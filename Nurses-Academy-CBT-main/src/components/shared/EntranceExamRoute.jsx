// src/components/shared/EntranceExamRoute.jsx
//
// Guards ALL /entrance-exam/* routes.
//
// Logic:
//   - Not logged in         → /auth?redirect=...
//   - Admin                 → full access (bypass everything)
//   - entranceExamPaid=true → full access (all questions)
//   - Otherwise             → redirect to /entrance-exam/payment
//
// The 10-question free cap is enforced inside each session component
// via the isPaid flag read from profile.

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth }               from '../../context/AuthContext';

export const ENTRANCE_FREE_CAP = 10;

export default function EntranceExamRoute({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // Wait for Firebase auth to resolve before making decisions
  if (loading) {
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
        to={`/auth?redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  // Admin → full access always
  if (profile?.role === 'admin') return children;

  // Paid → full access
  if (profile?.entranceExamPaid) return children;

  // Unpaid → redirect to payment page
  return <Navigate to="/entrance-exam/payment" replace />;
}
