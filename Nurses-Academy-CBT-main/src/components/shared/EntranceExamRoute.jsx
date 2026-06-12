// src/components/shared/EntranceExamRoute.jsx
//
// Guards ALL /entrance-exam/* routes.
//
// Logic:
//   - Not logged in         → /auth?redirect=...
//   - Admin                 → full access (bypass everything)
//   - entranceExamPaid=true → full access
//   - Logged-in unpaid user → FREE PREVIEW (10 questions per exam)
//                             The cap is enforced inside each session
//                             component via the isPaid flag read from profile.
//
// NOTE: Unpaid users are no longer redirected to /entrance-exam/payment.
//       They see the hub and can start any exam, capped at FREE_CAP questions.
//       Upgrade CTAs inside each session nudge them to pay.

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth }               from '../../context/AuthContext';

export const ENTRANCE_FREE_CAP = 10;

export default function EntranceExamRoute({ children }) {
  const { user, loading } = useAuth();
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

  // Logged-in users (paid, unpaid, or admin) → always allowed through.
  // Paid/admin get full questions; unpaid get FREE_CAP questions per exam
  // (enforced inside EntranceExamSession, EntranceExamDailyMockHub,
  //  EntranceSubjectSession, etc.).
  return children;
}
