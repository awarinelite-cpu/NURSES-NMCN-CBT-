// src/App.jsx
import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider }          from './context/AuthContext';
import { ThemeProvider }         from './context/ThemeContext';
import { ToastProvider }         from './components/shared/Toast';
import { useAuth }               from './context/AuthContext';

import { ProtectedRoute, SubscribedRoute, FreeTrialRoute, AdminRoute, SubAdminRoute, GuestRoute } from './components/shared/ProtectedRoute';
import EntranceExamRoute  from './components/shared/EntranceExamRoute';
import AppLayout      from './components/shared/AppLayout';
import LandingPage    from './components/shared/LandingPage';
import AuthPage       from './components/auth/AuthPage';

// Student pages
import StudentDashboard       from './components/student/StudentDashboard';
import AnalyticsPage          from './components/student/AnalyticsPage';
import BookmarksPage          from './components/student/BookmarksPage';
import SubscriptionPage       from './components/student/SubscriptionPage';
import QuickActionsPage       from './components/student/QuickActionsPage';
import PerformanceMonitorPage from './components/student/PerformanceMonitorPage';
import NotificationSettings   from './components/student/NotificationSettings';
import StudentPublicProfile   from './components/student/StudentPublicProfile';
import ChatPage               from './components/student/ChatPage';
import ChatInbox              from './components/student/ChatInbox';
import GroupChatHub           from './components/student/GroupChatHub';
import GroupChatPage          from './components/student/GroupChatPage';
import LeaderboardPage        from './components/student/LeaderboardPage';
import StudyPlanPage          from './components/student/StudyPlanPage';
import BadgesPage             from './components/student/BadgesPage';
import ProgressWallPage       from './components/student/ProgressWallPage';
import ProfilePage            from './components/student/ProfilePage';
import AdminAnalytics         from './components/admin/AdminAnalytics';
import DailyChallengeManager from './components/admin/DailyChallengeManager';

// Payment pages
import PaymentPage from './components/payment/PaymentPage';

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

// Entrance Exam
import EntranceExamHub          from './components/entrance/EntranceExamHub';
import EntranceSchoolList       from './components/entrance/EntranceSchoolList';
import EntranceExamSetup        from './components/entrance/EntranceExamSetup';
import EntranceSubjectDrill     from './components/entrance/EntranceSubjectDrill';
import EntranceSubjectSession   from './components/entrance/EntranceSubjectSession';
import EntranceDailyMockUpload  from './components/entrance/EntranceDailyMockUpload';
import EntranceLeaderboard      from './components/entrance/EntranceLeaderboard';
import {
  EntranceMyResults,
  EntranceExamsTaken,
  EntranceBookmarks,
  EntranceAnalysis,
} from './components/entrance/EntranceResultsPages';
import EntranceExamDailyMockHub from './components/entrance/EntranceExamDailyMockHub';
import EntranceExamSession      from './components/entrance/EntranceExamSession';
import EntranceExamPaymentPage  from './components/entrance/EntranceExamPaymentPage';
import EntranceGroupChatHub    from './components/entrance/EntranceGroupChatHub';
import EntranceGroupChatPage   from './components/entrance/EntranceGroupChatPage';

// Admin pages
import AdminDashboard        from './components/admin/AdminDashboard';
import SubAdminDashboard     from './components/admin/SubAdminDashboard';
import QuestionsManager      from './components/admin/QuestionsManager';
import UsersManager          from './components/admin/UsersManager';
import PaymentsManager       from './components/admin/PaymentsManager';
import AccessCodesManager    from './components/admin/AccessCodesManager';
import AnnouncementsManager  from './components/admin/AnnouncementsManager';
import ScheduledExamsManager from './components/admin/ScheduledExamsManager';
import CoursesManager        from './components/admin/CoursesManager';
import EntranceExamManager   from './components/admin/EntranceExamManager';

import './styles/global.css';
import { useContentProtection } from './hooks/useContentProtection';

// Free trial question cap for entrance exam
export const ENTRANCE_FREE_LIMIT = 10;

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(console.error);
  });
}

const isCapacitor = () =>
  typeof window !== 'undefined' &&
  window.Capacitor !== undefined &&
  window.Capacitor.isNativePlatform?.();

function ContentProtectionActivator() {
  const { user, profile } = useAuth();
  const isAdminOrSubAdmin = profile?.role === 'admin' || profile?.role === 'subadmin';

  // Enable protection only for logged-in non-admin users
  useContentProtection(!!user && !isAdminOrSubAdmin);

  // Toggle a body class so CSS user-select rules also lift for admins
  useEffect(() => {
    if (isAdminOrSubAdmin) {
      document.body.classList.add('admin-mode');
    } else {
      document.body.classList.remove('admin-mode');
    }
    return () => document.body.classList.remove('admin-mode');
  }, [isAdminOrSubAdmin]);

  return null;
}

function SwNavigationHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) navigate(event.data.url);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);
  return null;
}

function BackButtonHandler() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [showExit, setShowExit] = useState(false);
  const exitReady = useRef(false);
  const exitTimer = useRef(null);

  const isHome = location.pathname === '/' ||
               location.pathname === '/dashboard' ||
               location.pathname === '/entrance-exam';

  useEffect(() => {
    if (!isHome) { exitReady.current = false; setShowExit(false); if (exitTimer.current) clearTimeout(exitTimer.current); }
  }, [isHome]);

  const handleBack = (exitFn) => {
    if (isHome) {
      if (exitReady.current) { exitFn(); return; }
      exitReady.current = true; setShowExit(true);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => { exitReady.current = false; setShowExit(false); }, 2500);
    } else { navigate(-1); }
  };

  useEffect(() => {
    if (!isCapacitor()) return;
    let listenerHandle = null;
    const register = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        listenerHandle = await CapApp.addListener('backButton', () => { handleBack(() => CapApp.exitApp()); });
      } catch (e) { console.warn('Capacitor backButton registration failed:', e); }
    };
    register();
    return () => { if (listenerHandle?.remove) listenerHandle.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isHome]);

  useEffect(() => {
    if (isCapacitor()) return;
    window.history.pushState({ pwa: true }, '');
    const onPopState = () => { handleBack(() => window.history.go(-1)); window.history.pushState({ pwa: true }, ''); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isHome]);

  useEffect(() => { return () => { if (exitTimer.current) clearTimeout(exitTimer.current); }; }, []);

  if (!showExit) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(2,11,24,0.92)', color: 'var(--text-primary)', padding: '13px 28px',
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
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <BackButtonHandler />
            <SwNavigationHandler />
            <ContentProtectionActivator />

            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<GuestRoute><AuthPage /></GuestRoute>} />

              {/* Full-screen exam sessions */}
              <Route path="/exam/session" element={<FreeTrialRoute><ExamSession /></FreeTrialRoute>} />
              <Route path="/exam/review"  element={<FreeTrialRoute><ExamReviewPage /></FreeTrialRoute>} />

              {/* Payment pages — any logged-in user */}
              <Route path="/payment"               element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
              <Route path="/entrance-exam/payment" element={<ProtectedRoute><EntranceExamPaymentPage /></ProtectedRoute>} />

              {/* Authenticated layout */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>

                {/* Student pages */}
                <Route path="/dashboard"    element={<StudentDashboard />} />
                <Route path="/results"      element={<AnalyticsPage />} />
                <Route path="/performance"  element={<PerformanceMonitorPage />} />
                <Route path="/bookmarks"    element={<BookmarksPage />} />
                <Route path="/subscription" element={<SubscriptionPage />} />
                <Route path="/leaderboard"       element={<LeaderboardPage />} />
                <Route path="/study-plan"        element={<StudyPlanPage />} />
                <Route path="/badges"            element={<BadgesPage />} />
                <Route path="/progress-wall"     element={<ProgressWallPage />} />
                <Route path="/profile"           element={<ProfilePage />} />
                <Route path="/student/:uid"       element={<StudentPublicProfile />} />
                <Route path="/entrance-exam/chat/:uid"    element={<ChatPage />} />
                <Route path="/entrance-exam/chat-inbox"   element={<ChatInbox />} />
                {/* CBT (NMCN) direct chat routes */}
                <Route path="/chat/:uid"    element={<ChatPage />} />
                <Route path="/chat-inbox"   element={<ChatInbox />} />
                <Route path="/group-chat"                 element={<GroupChatHub />} />
                <Route path="/group-chat/:subjectId"      element={<GroupChatPage />} />

                {/* NMCN exam modes */}
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

                {/* ── Entrance Exam — ALL routes gated by EntranceExamRoute ── */}
                {/* Unpaid users hit any of these → redirected to /entrance-exam/payment */}
                {/* Paid users get full access; question cap enforced in session components */}
                <Route path="/entrance-exam"                 element={<EntranceExamRoute><EntranceExamHub /></EntranceExamRoute>} />
                <Route path="/entrance-exam/schools"         element={<EntranceExamRoute><EntranceSchoolList /></EntranceExamRoute>} />
                <Route path="/entrance-exam/setup"           element={<EntranceExamRoute><EntranceExamSetup /></EntranceExamRoute>} />
                <Route path="/entrance-exam/subject-drill"   element={<EntranceExamRoute><EntranceSubjectDrill /></EntranceExamRoute>} />
                <Route path="/entrance-exam/subject-session" element={<EntranceExamRoute><EntranceSubjectSession /></EntranceExamRoute>} />
                <Route path="/entrance-exam/my-results"      element={<EntranceExamRoute><EntranceMyResults /></EntranceExamRoute>} />
                <Route path="/entrance-exam/exams-taken"     element={<EntranceExamRoute><EntranceExamsTaken /></EntranceExamRoute>} />
                <Route path="/entrance-exam/bookmarks"       element={<EntranceExamRoute><EntranceBookmarks /></EntranceExamRoute>} />
                <Route path="/entrance-exam/analysis"        element={<EntranceExamRoute><EntranceAnalysis /></EntranceExamRoute>} />
                <Route path="/entrance-exam/leaderboard"     element={<EntranceExamRoute><EntranceLeaderboard /></EntranceExamRoute>} />
                <Route path="/entrance-exam/daily-mock"      element={<EntranceExamRoute><EntranceExamDailyMockHub /></EntranceExamRoute>} />
                <Route path="/entrance-exam/session"         element={<EntranceExamRoute><EntranceExamSession /></EntranceExamRoute>} />
                <Route path="/entrance-exam/group-chat"          element={<EntranceExamRoute><EntranceGroupChatHub /></EntranceExamRoute>} />
                <Route path="/entrance-exam/group-chat/:subjectId" element={<EntranceExamRoute><EntranceGroupChatPage /></EntranceExamRoute>} />

                {/* Admin */}
                <Route path="/admin"                                 element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/subadmin"                             element={<SubAdminRoute><SubAdminDashboard /></SubAdminRoute>} />
                <Route path="/admin/questions"                       element={<SubAdminRoute><QuestionsManager /></SubAdminRoute>} />
                <Route path="/admin/users"                           element={<AdminRoute><UsersManager /></AdminRoute>} />
                <Route path="/admin/payments"                        element={<SubAdminRoute><PaymentsManager /></SubAdminRoute>} />
                <Route path="/admin/access-codes"                    element={<AdminRoute><AccessCodesManager /></AdminRoute>} />
                <Route path="/admin/announcements"                   element={<SubAdminRoute><AnnouncementsManager /></SubAdminRoute>} />
                <Route path="/admin/analytics"                       element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
                <Route path="/admin/daily-challenge"                 element={<AdminRoute><DailyChallengeManager /></AdminRoute>} />
                <Route path="/admin/scheduled-exams"                 element={<SubAdminRoute><ScheduledExamsManager /></SubAdminRoute>} />
                <Route path="/admin/courses"                         element={<AdminRoute><CoursesManager /></AdminRoute>} />
                <Route path="/admin/entrance-exam"                   element={<SubAdminRoute><EntranceExamManager /></SubAdminRoute>} />
                <Route path="/admin/entrance-exam/daily-mock-upload" element={<SubAdminRoute><EntranceDailyMockUpload /></SubAdminRoute>} />

              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// ── Inline pages ─────────────────────────────────────────────────

// LeaderboardPage → now imported from components/student/LeaderboardPage.jsx
function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, textAlign: 'center', padding: 24, background: '#020B18', color: 'var(--text-primary)' }}>
      <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontSize: '6rem', fontWeight: 900, color: 'rgba(255,255,255,0.07)' }}>404</div>
      <h2 style={{ fontFamily: "'Arial Black', Arial, sans-serif", color: 'var(--text-primary)' }}>Page Not Found</h2>
      <p style={{ color: 'var(--text-muted)' }}>This page doesn't exist.</p>
      <a href="/" className="btn btn-primary">← Go Home</a>
    </div>
  );
}
