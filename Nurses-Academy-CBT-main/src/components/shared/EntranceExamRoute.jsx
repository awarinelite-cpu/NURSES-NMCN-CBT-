// src/components/shared/EntranceExamRoute.jsx
//
// Guards ALL /entrance-exam/* routes.
//
// Access tiers:
//   - Not logged in              → /auth?redirect=...
//   - Profile still loading      → spinner
//   - Admin                      → full access
//   - entranceExamPaid === true  → full access (all questions)
//   - Logged-in, NOT paid        → FREE PREVIEW (10 questions per exam)
//                                  enforced inside each session component
//                                  via their isPaid / FREE_CAP logic.
//
// KEY RULE: entranceExamPaid is COMPLETELY SEPARATE from NMCN CBT subscription.
//   - profile.subscribed / profile.accessLevel  → NMCN CBT only
//   - profile.entranceExamPaid                  → Entrance Exam only
//   Neither grants access to the other platform.

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth }               from '../../context/AuthContext';

export const ENTRANCE_FREE_CAP = 10; // imported by session components

export default function EntranceExamRoute({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // Wait for Firebase auth + profile to resolve
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

  // All logged-in users pass through.
  // Paid users  (entranceExamPaid === true OR admin) → full questions
  // Unpaid users                                      → capped at FREE_CAP (10)
  //   The cap is enforced inside:
  //     EntranceExamSession.jsx      (isPaid check, line ~68)
  //     EntranceSubjectSession.jsx   (isPaid check, line ~36)
  //     EntranceExamDailyMockHub.jsx (isPaid check, line ~48)
  return children;
}
