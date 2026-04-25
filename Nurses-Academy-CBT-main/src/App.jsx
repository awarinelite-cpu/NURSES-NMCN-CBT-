// src/App.jsx
import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider }          from './context/AuthContext';
import { ThemeProvider }         from './context/ThemeContext';
import { ToastProvider }         from './components/shared/Toast';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { useAuth }               from './context/AuthContext';

import { ProtectedRoute, SubscribedRoute, FreeTrialRoute, AdminRoute, GuestRoute } from './components/shared/ProtectedRoute';
import AppLayout      from './components/shared/AppLayout';
import LandingPage    from './components/shared/LandingPage';
import AuthPage       from './components/auth/AuthPage';

// Student pages
import StudentDashboard      from './components/student/StudentDashboard';
import AnalyticsPage         from './components/student/AnalyticsPage';
import BookmarksPage         from './components/student/BookmarksPage';
import SubscriptionPage      from './components/student/SubscriptionPage';
import QuickActionsPage      from './components/student/QuickActionsPage';
import PerformanceMonitorPage from './components/student/PerformanceMonitorPage';

// ── Payment page (Paystack + Manual bank transfer) ──────────────
import PaymentPage       from './components/payment/PaymentPage';

// Exam
import ExamSetup          from './components/exam/ExamSetup';
import ExamSession        from './components/exam/ExamSession';
import ExamReviewPage     from './components/exam/ExamReviewPage';
import CategoryPickerPage from './components/exam/CategoryPickerPage';
import ExamConfigPage     from './components/exam/ExamConfigPage';
import ExamListPage       from './components/exam/ExamListPage';
import ExamSetupPage      from './components/exam/ExamSetupPage';
import DailyPracticePage  from './components/exam/DailyPracticePage';
import MockExamPage       from './components/exam/MockExamPage';
import CourseDrillPage    from './components/exam/CourseDrillPage';
import TopicDrillPage     from './components/exam/TopicDrillPage';
import PastQuestionsPage  from './components/exam/PastQuestionsPage';

// Admin pages
import AdminDashboard        from './components/admin/AdminDashboard';
import QuestionsManager      from './components/admin/QuestionsManager';
import UsersManager          from './components/admin/UsersManager';
import PaymentsManager       from './components/admin/PaymentsManager';
import AccessCodesManager    from './components/admin/AccessCodesManager';
import AnnouncementsManager  from './components/admin/AnnouncementsManager';
import ScheduledExamsManager from './components/admin/ScheduledExamsManager';
import CoursesManager        from './components/admin/CoursesManager';

import './styles/global.css';

// ── Register PWA service worker (web only) ───────────────────────
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(console.error);
  });
}

// ── Detect Capacitor native shell ────────────────────────────────
const isCapacitor = () =>
  typeof window !== 'undefined' &&
  window.Capacitor !== undefined &&
  window.Capacitor.isNativePlatform?.();

// ── SW Navigation Handler ────────────────────────────────────────
// Listens for NAVIGATE messages posted by the service worker when
// the user taps a push notification while the app is already open.
function SwNavigationHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        navigate(event.data.url);
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);

  return null;
}

// ── Back Button Handler ──────────────────────────────────────────
function BackButtonHandler() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [showExit, setShowExit] = useState(false);
  const exitReady = useRef(false);
  const exitTimer = useRef(null);

  const isHome = location.pathname === '/' || location.pathname === '/dashboard';

  useEffect(() => {
    if (!isHome) {
      exitReady.current = false;
      setShowExit(false);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    }
  }, [isHome]);

  const handleBack = (exitFn) => {
    if (isHome) {
      if (exitReady.current) { exitFn(); return; }
      exitReady.current = true;
      setShowExit(true);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => {
        exitReady.current = false;
        setShowExit(false);
      }, 2500);
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    if (!isCapacitor()) return;
    let listenerHandle = null;
    const register = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        listenerHandle = await CapApp.addListener('backButton', () => {
          handleBack(() => CapApp.exitApp());
        });
      } catch (e) {
        console.warn('Capacitor backButton registration failed:', e);
      }
    };
    register();
    return () => { if (listenerHandle?.remove) listenerHandle.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isHome]);

  useEffect(() => {
    if (isCapacitor()) return;
    window.history.pushState({ pwa: true }, '');
    const onPopState = () => {
      handleBack(() => window.history.go(-1));
      window.history.pushState({ pwa: true }, '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isHome]);

  useEffect(() => {
    return () => { if (exitTimer.current) clearTimeout(exitTimer.current); };
  }, []);

  if (!showExit) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(2,11,24,0.92)', color: '#fff', padding: '13px 28px',
      borderRadius: 28, fontSize: 14, fontWeight: 700, zIndex: 99999,
      backdropFilter: 'blur(10px)', border: '1px solid rgba(13,148,136,0.4)',
      boxShadow: '0 4px 32px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
      letterSpacing: 0.3, animation: 'fadeInUp 0.22s ease', pointerEvents: 'none',
    }}>
      Press back again to exit
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AccessibilityProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <BackButtonHandler />
              <SwNavigationHandler />

              <Routes>
                {/* Public */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<GuestRoute><AuthPage /></GuestRoute>} />

                {/* Full-screen exam session — free trial users allowed (10Q cap enforced in ExamSession) */}
                <Route path="/exam/session" element={<FreeTrialRoute><ExamSession /></FreeTrialRoute>} />
                <Route path="/exam/review"  element={<FreeTrialRoute><ExamReviewPage /></FreeTrialRoute>} />

                {/* Payment page — any logged-in user (free users need this to upgrade) */}
                <Route path="/payment" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />

                {/* Authenticated layout */}
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>

                  {/* Free users can see dashboard, profile, subscription, results */}
                  <Route path="/dashboard"    element={<StudentDashboard />} />
                  <Route path="/results"      element={<AnalyticsPage />} />
                  <Route path="/performance"  element={<PerformanceMonitorPage />} />
                  <Route path="/bookmarks"    element={<BookmarksPage />} />
                  <Route path="/subscription" element={<SubscriptionPage />} />
                  <Route path="/leaderboard"  element={<LeaderboardPage />} />
                  <Route path="/profile"      element={<ProfilePage />} />

                  {/* Exam modes — free trial users get 10 questions once per mode */}
                  <Route path="/exams"           element={<FreeTrialRoute><ExamSetup /></FreeTrialRoute>} />
                  <Route path="/past-questions"  element={<FreeTrialRoute><PastQuestionsPage /></FreeTrialRoute>} />
                  <Route path="/quick-actions"   element={<FreeTrialRoute><QuickActionsPage /></FreeTrialRoute>} />
                  <Route path="/daily-practice"  element={<FreeTrialRoute><DailyPracticePage /></FreeTrialRoute>} />
                  <Route path="/daily-reviews"   element={<FreeTrialRoute><DailyPracticePage /></FreeTrialRoute>} />
                  <Route path="/course-drill"    element={<FreeTrialRoute><CourseDrillPage /></FreeTrialRoute>} />
                  <Route path="/topic-drill"     element={<FreeTrialRoute><TopicDrillPage /></FreeTrialRoute>} />
                  <Route path="/exam/list"       element={<FreeTrialRoute><ExamListPage /></FreeTrialRoute>} />
                  <Route path="/exam/setup"      element={<FreeTrialRoute><ExamSetupPage /></FreeTrialRoute>} />
                  <Route path="/mock-exams"      element={<FreeTrialRoute><MockExamPage /></FreeTrialRoute>} />
                  <Route path="/exam/categories" element={<FreeTrialRoute><CategoryPickerPage /></FreeTrialRoute>} />
                  <Route path="/exam/config"     element={<FreeTrialRoute><ExamConfigPage /></FreeTrialRoute>} />

                  {/* Admin */}
                  <Route path="/admin"                 element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                  <Route path="/admin/questions"       element={<AdminRoute><QuestionsManager /></AdminRoute>} />
                  <Route path="/admin/users"           element={<AdminRoute><UsersManager /></AdminRoute>} />
                  <Route path="/admin/payments"        element={<AdminRoute><PaymentsManager /></AdminRoute>} />
                  <Route path="/admin/access-codes"    element={<AdminRoute><AccessCodesManager /></AdminRoute>} />
                  <Route path="/admin/announcements"   element={<AdminRoute><AnnouncementsManager /></AdminRoute>} />
                  <Route path="/admin/analytics"       element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
                  <Route path="/admin/scheduled-exams" element={<AdminRoute><ScheduledExamsManager /></AdminRoute>} />
                  <Route path="/admin/courses"         element={<AdminRoute><CoursesManager /></AdminRoute>} />
                </Route>

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}

// ── Inline simple pages ──────────────────────────────────────────

function LeaderboardPage() {
  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif" }}>🏆 Leaderboard</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Top performers coming soon — take more exams to rank!
      </p>
    </div>
  );
}

function ProfilePage() {
  const { user, profile } = useAuth();
  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", marginBottom: 24 }}>👤 My Profile</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 26, color: '#fff',
          }}>
            {(profile?.name || user?.displayName || 'S')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {profile?.name || user?.displayName || 'Student'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{user?.email}</div>
            <span
              className={`badge ${profile?.subscribed ? 'badge-teal' : 'badge-grey'}`}
              style={{ marginTop: 4, display: 'inline-flex' }}
            >
              {profile?.subscribed ? '⭐ Premium' : '🆓 Free'}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['Total Exams', profile?.totalExams || 0],
            ['Avg Score',   profile?.totalExams ? Math.round((profile?.totalScore || 0) / profile.totalExams) + '%' : '—'],
            ['Plan',        profile?.subscriptionPlan || 'Free'],
            ['Expires',     profile?.subscriptionExpiry ? new Date(profile.subscriptionExpiry).toLocaleDateString() : 'N/A'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Notification Settings */}
        <NotificationSettings />
      </div>
    </div>
  );
}

function AdminAnalytics() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif" }}>📈 Platform Analytics</h2>
      <p style={{ color: 'var(--text-muted)' }}>Advanced analytics dashboard — coming in next release.</p>
    </div>
  );
}

function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
      textAlign: 'center', padding: 24,
      background: '#020B18', color: '#fff',
    }}>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '6rem', fontWeight: 900, color: 'rgba(255,255,255,0.07)' }}>
        404
      </div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#fff' }}>Page Not Found</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)' }}>This page doesn't exist.</p>
      <a href="/" className="btn btn-primary">← Go Home</a>
    </div>
  );
}
