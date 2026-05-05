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
import StudentDashboard       from './components/student/StudentDashboard';
import AnalyticsPage          from './components/student/AnalyticsPage';
import BookmarksPage          from './components/student/BookmarksPage';
import SubscriptionPage       from './components/student/SubscriptionPage';
import QuickActionsPage       from './components/student/QuickActionsPage';
import PerformanceMonitorPage from './components/student/PerformanceMonitorPage';
import NotificationSettings   from './components/student/NotificationSettings';

// ── Payment page (Paystack + Manual bank transfer) ──────────────
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

// ── Nursing Schools Entrance Exam (entrance folder — existing) ───
import EntranceExamHub          from './components/entrance/EntranceExamHub';
import EntranceSchoolList       from './components/entrance/EntranceSchoolList';
import EntranceExamSetup        from './components/entrance/EntranceExamSetup';
import EntranceSubjectDrill     from './components/entrance/EntranceSubjectDrill';
import EntranceSubjectSession   from './components/entrance/EntranceSubjectSession';   // ← NEW
import EntranceDailyMockUpload  from './components/entrance/EntranceDailyMockUpload';
import {
  EntranceMyResults,
  EntranceExamsTaken,
  EntranceBookmarks,
  EntranceAnalysis,
  EntranceLeaderboard,
} from './components/entrance/EntranceResultsPages';

// ── NEW: Daily Mock Hub + Session ───────────────────────────────
import EntranceExamDailyMockHub from './components/entrance/EntranceExamDailyMockHub';
import EntranceExamSession      from './components/entrance/EntranceExamSession';

// Admin pages
import AdminDashboard        from './components/admin/AdminDashboard';
import QuestionsManager      from './components/admin/QuestionsManager';
import UsersManager          from './components/admin/UsersManager';
import PaymentsManager       from './components/admin/PaymentsManager';
import AccessCodesManager    from './components/admin/AccessCodesManager';
import AnnouncementsManager  from './components/admin/AnnouncementsManager';
import ScheduledExamsManager from './components/admin/ScheduledExamsManager';
import CoursesManager        from './components/admin/CoursesManager';
import EntranceExamManager   from './components/admin/EntranceExamManager';

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

                  {/* ── Nursing Schools Entrance Exam ── */}
                  <Route path="/entrance-exam"                 element={<FreeTrialRoute><EntranceExamHub /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/schools"         element={<FreeTrialRoute><EntranceSchoolList /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/setup"           element={<FreeTrialRoute><EntranceExamSetup /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/subject-drill"   element={<FreeTrialRoute><EntranceSubjectDrill /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/subject-session" element={<FreeTrialRoute><EntranceSubjectSession /></FreeTrialRoute>} />  {/* ← NEW */}
                  <Route path="/entrance-exam/my-results"      element={<FreeTrialRoute><EntranceMyResults /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/exams-taken"     element={<FreeTrialRoute><EntranceExamsTaken /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/bookmarks"       element={<FreeTrialRoute><EntranceBookmarks /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/analysis"        element={<FreeTrialRoute><EntranceAnalysis /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/leaderboard"     element={<FreeTrialRoute><EntranceLeaderboard /></FreeTrialRoute>} />

                  {/* ── Daily Mock Hub → Session flow ── */}
                  <Route path="/entrance-exam/daily-mock" element={<FreeTrialRoute><EntranceExamDailyMockHub /></FreeTrialRoute>} />
                  <Route path="/entrance-exam/session"    element={<FreeTrialRoute><EntranceExamSession /></FreeTrialRoute>} />

                  {/* Admin */}
                  <Route path="/admin"                                    element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                  <Route path="/admin/questions"                          element={<AdminRoute><QuestionsManager /></AdminRoute>} />
                  <Route path="/admin/users"                              element={<AdminRoute><UsersManager /></AdminRoute>} />
                  <Route path="/admin/payments"                           element={<AdminRoute><PaymentsManager /></AdminRoute>} />
                  <Route path="/admin/access-codes"                       element={<AdminRoute><AccessCodesManager /></AdminRoute>} />
                  <Route path="/admin/announcements"                      element={<AdminRoute><AnnouncementsManager /></AdminRoute>} />
                  <Route path="/admin/analytics"                          element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
                  <Route path="/admin/scheduled-exams"                    element={<AdminRoute><ScheduledExamsManager /></AdminRoute>} />
                  <Route path="/admin/courses"                            element={<AdminRoute><CoursesManager /></AdminRoute>} />
                  <Route path="/admin/entrance-exam"                      element={<AdminRoute><EntranceExamManager /></AdminRoute>} />
                  {/* ── Entrance Exam Daily Mock Upload ── */}
                  <Route path="/admin/entrance-exam/daily-mock-upload"    element={<AdminRoute><EntranceDailyMockUpload /></AdminRoute>} />

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
      <h2 style={{ fontFamily: "'Arial Black', Arial, sans-serif" }}>🏆 Leaderboard</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Top performers coming soon — take more exams to rank!
      </p>
    </div>
  );
}

function ProfilePage() {
  const { user, profile, updateUserProfile } = useAuth();
  const F = "'Times New Roman', Times, serif";
  const H = "'Arial Black', Arial, sans-serif";

  const [editing,     setEditing]     = useState(false);
  const [name,        setName]        = useState('');
  const [school,      setSchool]      = useState('');
  const [schools,     setSchools]     = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState('');

  // Load schools for dropdown
  useEffect(() => {
    if (!editing) return;
    import('firebase/firestore').then(({ collection, getDocs, query, orderBy }) => {
      import('../firebase/config').then(({ db }) => {
        getDocs(collection(db, 'entranceExamSchools')).then(snap => {
          const list = snap.docs.map(d => d.data().name || d.id).filter(Boolean).sort();
          setSchools(list);
        }).catch(() => {});
      });
    });
  }, [editing]);

  const startEdit = () => {
    setName(profile?.name || user?.displayName || '');
    setSchool(profile?.school || '');
    setSaveMsg('');
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUserProfile({ name, school });
      setSaveMsg('✅ Profile updated!');
      setEditing(false);
    } catch (e) {
      setSaveMsg('❌ Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, fontFamily: F, color: 'var(--text-primary)' }}>
      <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.8rem)', marginBottom: 24, color: 'var(--text-primary)' }}>
        👤 My Profile
      </h1>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Avatar + info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 68, height: 68, borderRadius: '50%',
            background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 28, color: '#fff', fontFamily: H, flexShrink: 0,
          }}>
            {(profile?.name || user?.displayName || 'S')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, fontFamily: H, color: 'var(--text-primary)' }}>
              {profile?.name || user?.displayName || 'Student'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, fontFamily: F, marginTop: 2 }}>
              {user?.email}
            </div>
            {profile?.school && (
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginTop: 4, fontFamily: F }}>
                🏫 {profile.school}
              </div>
            )}
            <span className={`badge ${profile?.subscribed ? 'badge-teal' : 'badge-grey'}`} style={{ marginTop: 6, display: 'inline-flex' }}>
              {profile?.subscribed ? '⭐ Premium' : '🆓 Free'}
            </span>
          </div>
          {!editing && (
            <button onClick={startEdit} style={{
              padding: '9px 18px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--teal-glow)', border: '1.5px solid var(--teal)',
              color: 'var(--teal)', fontWeight: 700, fontSize: 14, fontFamily: F,
            }}>✏️ Edit</button>
          )}
        </div>

        {/* Edit form */}
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1.5px solid var(--border)' }}>
            <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,2vw,1.5rem)', margin: 0, color: 'var(--text-primary)' }}>
              Edit Profile
            </h3>

            <div className="form-group">
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: 'var(--text-secondary)' }}>Full Name</label>
              <input
                type="text" className="form-input"
                value={name} onChange={e => setName(e.target.value)}
                style={{ fontFamily: F, fontWeight: 700 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontFamily: F, fontWeight: 700, color: 'var(--text-secondary)' }}>🏫 Your School</label>
              <select
                className="form-input form-select"
                value={school} onChange={e => setSchool(e.target.value)}
                style={{ fontFamily: F, fontWeight: 700 }}
              >
                <option value="">— Select your school —</option>
                {schools.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="Other">Other</option>
              </select>
              <p style={{ fontSize: 12, fontFamily: F, fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
                This determines which leaderboard you appear on.
              </p>
            </div>

            {saveMsg && (
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: F, color: saveMsg.startsWith('✅') ? '#16A34A' : '#EF4444' }}>
                {saveMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '10px 24px', background: 'var(--teal)', border: 'none',
                color: '#fff', borderRadius: 10, cursor: saving ? 'wait' : 'pointer',
                fontWeight: 700, fontSize: 14, fontFamily: F,
              }}>
                {saving ? 'Saving…' : '💾 Save Changes'}
              </button>
              <button onClick={() => setEditing(false)} style={{
                padding: '10px 18px', background: 'var(--bg-tertiary)',
                border: '1.5px solid var(--border)', color: 'var(--text-secondary)',
                borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: F,
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['Total Exams', profile?.totalExams || 0],
            ['Avg Score',   profile?.totalExams ? Math.round((profile?.totalScore || 0) / profile.totalExams) + '%' : '—'],
            ['Plan',        profile?.subscriptionPlan || 'Free'],
            ['Expires',     profile?.subscriptionExpiry ? new Date(profile.subscriptionExpiry).toLocaleDateString() : 'N/A'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: F }}>{k}</div>
              <div style={{ fontWeight: 900, fontSize: 18, marginTop: 4, color: 'var(--text-primary)', fontFamily: H }}>{v}</div>
            </div>
          ))}
        </div>

        <NotificationSettings />
      </div>
    </div>
  );
}

function AdminAnalytics() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontFamily: "'Arial Black', Arial, sans-serif" }}>📈 Platform Analytics</h2>
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
      <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontSize: '6rem', fontWeight: 900, color: 'rgba(255,255,255,0.07)' }}>
        404
      </div>
      <h2 style={{ fontFamily: "'Arial Black', Arial, sans-serif", color: '#fff' }}>Page Not Found</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)' }}>This page doesn't exist.</p>
      <a href="/" className="btn btn-primary">← Go Home</a>
    </div>
  );
}
