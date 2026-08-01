// src/components/shared/EntranceExamRoute.jsx
//
// Guards ALL /entrance-exam/* routes.
//
// Access tiers:
//   - Not logged in              → /auth?redirect=...
//   - Profile still loading      → spinner
//   - Admin / Sub-Admin          → full access
//   - platform === 'nmcn'        → BLOCKED, sent to /dashboard
//                                  (NMCN-track students cannot cross into Entrance)
//   - entranceExamPaid === true  → full access (all questions)
//   - Logged-in, NOT paid        → FREE PREVIEW (10 questions per exam)
//                                  enforced inside each session component
//                                  via their isPaid / FREE_CAP logic.
//
// KEY RULE: entranceExamPaid is COMPLETELY SEPARATE from NMCN CBT subscription.
//   - profile.subscribed / profile.accessLevel  → NMCN CBT only
//   - profile.entranceExamPaid                  → Entrance Exam only
//   Neither grants access to the other platform.
//
// TRACK RULE: profile.platform decides which side of the app a student may
//   use at all. Accounts created before this field existed have
//   platform === undefined and are grandfathered through both sides until
//   an admin migrates them via Users Manager.

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

  // NMCN-track students are blocked from Entrance Exam pages entirely.
  const isAdminOrSubAdmin = profile?.role === 'admin' || profile?.role === 'subadmin';
  if (!isAdminOrSubAdmin && profile?.platform === 'nmcn') {
    return <Navigate to="/dashboard" replace />;
  }

  // All remaining logged-in users pass through.
  // Paid users  (entranceExamPaid === true OR admin) → full questions
  // Unpaid users                                      → capped at FREE_CAP (10)
  //   The cap is enforced inside:
  //     EntranceExamSession.jsx      (isPaid check, line ~68)
  //     EntranceSubjectSession.jsx   (isPaid check, line ~36)
  //     EntranceExamDailyMockHub.jsx (isPaid check, line ~48)
  return children;
}
