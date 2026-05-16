// src/components/shared/EntranceExamRoute.jsx
//
// Guards ALL /entrance-exam/* routes.
//
// Logic:
//   - Not logged in  → /auth?redirect=...
//   - Logged in      → render children always
//
// The paid/unpaid gate is handled INSIDE EntranceExamHub itself
// (shows upgrade card for unpaid users, full hub for paid/admin).
// Sub-routes like /schools, /session etc. enforce isPaid inside
// each component via profile.entranceExamPaid.

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

  // Logged in → always render; paid/unpaid gate is inside each component
  return children;
}
