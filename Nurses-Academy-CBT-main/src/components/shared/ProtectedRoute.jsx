// src/components/shared/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

export function AdminRoute({ children }) {
  const { user, isAdmin } = useAuth();
  if (!user)    return <Navigate to="/auth"      replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

export function GuestRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}
