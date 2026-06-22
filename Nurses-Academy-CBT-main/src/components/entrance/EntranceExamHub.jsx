// src/components/entrance/EntranceExamHub.jsx
// Route: /entrance-exam
//
// Feature parity with StudentDashboard:
//  ✅ Animated carousel banner with swipe + auto-advance
//  ✅ "Start Exam" modal (all entrance modes)
//  ✅ Paused exams modal with resume / discard
//  ✅ Weak Subject Detector (entrance exam sessions)
//  ✅ Streak reminder banner
//  ✅ Streak milestone modal
//  ✅ Tip of the Day (shared component)
//  ✅ Daily Challenge (shared component — uses dailyChallenge collection)
//  ✅ Exam Countdown banner (reads profile.entranceExamDate)
//  ✅ Surprise Me button (weighted toward weak entrance subjects)
//  ✅ Badge preview strip
//  ✅ Animated stat chips in banner
//  ✅ Progress Wall shortcut
//  ✅ Recent sessions table
//  ✅ Feature cards grid

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, Link }   from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
  limit, deleteDoc, doc, getDoc, Timestamp,
} from 'firebase/firestore';
import { db }        from '../../firebase/config';
import { useAuth }   from '../../context/AuthContext';
import {
  ensureEntranceDailyMockNotification, todayKey,
  maybePushEntranceDailyMockNotification,
} from '../../utils/dailyNotifications';
import { fetchBadges, evaluateBadges, syncBadges, BADGE_MAP } from '../../utils/badgeUtils';
import { fetchStreak } from '../../utils/streakUtils';
import TipOfDay          from '../shared/TipOfDay';
import DailyChallenge    from '../shared/DailyChallenge';
import StreakReminderBanner   from '../shared/StreakReminderBanner';
import StreakMilestoneModal, { MILESTONES } from '../shared/StreakMilestoneModal';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// ── Feature cards (carousel slides + quick-action grid) ───────────────────────
const FEATURE_CARDS = [
  {
    icon: '🗓️', label: 'Daily Mock Exam',
    sub: "Fresh questions every day — resets at midnight",
    desc: "A new set of entrance-style questions is published daily. Complete it to build exam stamina and stay on track.",
    color: '#F59E0B', to: '/entrance-exam/daily-mock',
  },
  {
    icon: '🏫', label: 'School Past Questions',
    sub: 'Practice with real past questions per school',
    desc: "Pick any Nigerian nursing school and drill their actual past questions. The fastest way to understand each school's pattern.",
    color: '#0D9488', to: '/entrance-exam/schools',
  },
  {
    icon: '📚', label: 'Subject Drill',
    sub: 'Topic-by-topic focused practice',
    desc: 'Pick a subject — Biology, Chemistry, English, etc. — and focus your practice exactly where you need improvement.',
    color: '#2563EB', to: '/entrance-exam/subject-drill',
  },
  {
    icon: '📋', label: 'Exams Taken',
    sub: 'Review your past exam sessions',
    desc: 'Browse all your completed entrance exam sessions, see scores, and go back to review any question.',
    color: '#7C3AED', to: '/entrance-exam/exams-taken',
  },
  {
    icon: '🔖', label: 'Bookmarks',
    sub: 'Your saved entrance questions',
    desc: 'Quickly revisit questions you bookmarked during practice. Master the ones that tripped you up.',
    color: '#A855F7', to: '/entrance-exam/bookmarks',
  },
  {
    icon: '📊', label: 'My Results',
    sub: 'All your scores in one place',
    desc: 'See your full results history, track your average score, and identify your strongest and weakest sittings.',
    color: '#16A34A', to: '/entrance-exam/my-results',
  },
  {
    icon: '📈', label: 'Analysis',
    sub: 'See your weak subjects',
    desc: 'Deep-dive into your performance by subject. Understand where your marks are going and what to drill next.',
    color: '#0891B2', to: '/entrance-exam/analysis',
  },
  {
    icon: '🏆', label: 'Leaderboard',
    sub: 'See top students nationwide',
    desc: 'Compete with other entrance exam candidates across Nigeria. See where you rank and push for the top.',
    color: '#EF4444', to: '/entrance-exam/leaderboard',
  },
];

// ── Animated counter ──────────────────────────────────────────────────────────
function useCounter(target, duration = 1400, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    const to = setTimeout(() => {
      let n = 0; const step = target / (duration / 16);
      const t = setInterval(() => {
        n += step;
        if (n >= target) { setVal(target); clearInterval(t); } else setVal(Math.floor(n));
      }, 16);
      return () => clearInterval(t);
    }, delay);
    return () => clearTimeout(to);
  }, [target, duration, delay]);
  return val;
}

// ── Animated fade-up card ─────────────────────────────────────────────────────
function ACard({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity .5s ease, transform .5s ease', ...s,
    }}>
      {children}
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 14, r = 6 }) {
  return (
    <>
      <style>{`@keyframes eShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{
        width: w, height: h, borderRadius: r,
        background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)',
        backgroundSize: '200% 100%', animation: 'eShimmer 1.4s infinite',
      }} />
    </>
  );
}

// ── Feature card (grid) ───────────────────────────────────────────────────────
function FeatureCard({ icon, label, sub, color, to, delay }) {
  const [hov, setHov] = useState(false);
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '20px 16px',
        background: hov ? `${color}12` : 'var(--bg-card)',
        border: `2px solid ${hov ? color + '66' : 'var(--border)'}`,
        borderRadius: 16, textDecoration: 'none', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        opacity: vis ? 1 : 0,
        transform: vis ? (hov ? 'translateY(-3px)' : 'translateY(0)') : 'translateY(14px)',
        boxShadow: hov ? `0 6px 24px ${color}22` : 'var(--shadow-sm)',
        transition: 'opacity .45s ease, transform .3s ease, background .2s, border-color .2s, box-shadow .2s',
        fontFamily: F,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, borderRadius: '4px 0 0 4px' }} />
      <div style={{ paddingLeft: 10 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', fontFamily: F, marginBottom: 4, lineHeight: 1.3 }}>
          {label}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>
          {sub}
        </div>
      </div>
      <div style={{
        position: 'absolute', right: 14, bottom: 14,
        color, fontWeight: 900, fontSize: 20,
        opacity: hov ? 1 : 0.3, transition: 'opacity .2s',
      }}>→</div>
    </Link>
  );
}

// ── Start Exam Modal ──────────────────────────────────────────────────────────
function StartExamModal({ onClose }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVis(true)); }, []);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 20, padding: 24, width: '100%', maxWidth: 480,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        opacity: vis ? 1 : 0,
        transform: vis ? 'scale(1) translateY(0)' : 'scale(.96) translateY(20px)',
        transition: 'opacity .35s ease, transform .35s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>⚡</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>Start an Exam</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Choose your entrance exam practice mode</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {FEATURE_CARDS.map((a, idx) => (
            <StartExamCard key={a.to} action={a} delay={idx * 60} onClose={onClose} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StartExamCard({ action, delay, onClose }) {
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <Link
      to={action.to}
      onClick={onClose}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: hov ? `${action.color}14` : 'var(--bg-primary)',
        border: `1.5px solid ${hov ? action.color + '55' : 'var(--border)'}`,
        borderRadius: 14, padding: '14px 16px', textDecoration: 'none',
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateX(0)' : 'translateX(-16px)',
        transition: 'opacity .4s ease, transform .4s ease, background .2s, border-color .2s',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: action.color, borderRadius: '4px 0 0 4px' }} />
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: `${action.color}22`, border: `1.5px solid ${action.color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      }}>
        {action.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>{action.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{action.desc}</div>
      </div>
      <div style={{ color: action.color, fontWeight: 900, fontSize: 18, flexShrink: 0 }}>→</div>
    </Link>
  );
}

// ── Paused Exams Modal ────────────────────────────────────────────────────────
function PausedModal({ exams, onContinue, onDiscard, onClose }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVis(true)); }, []);
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 20, padding: 24, maxWidth: 480, width: '100%',
        maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        opacity: vis ? 1 : 0,
        transform: vis ? 'scale(1) translateY(0)' : 'scale(.96) translateY(20px)',
        transition: 'opacity .35s ease, transform .35s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>▶</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', fontFamily: H }}>Continue an Exam</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>{exams.length} paused exam{exams.length !== 1 ? 's' : ''} waiting</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {exams.map((exam, idx) => {
            const pct  = exam.answeredCount && exam.totalQuestions ? Math.round((exam.answeredCount / exam.totalQuestions) * 100) : 0;
            const date = exam.savedAt?.toDate ? exam.savedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently';
            const time = exam.savedAt?.toDate ? exam.savedAt.toDate().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <div key={exam.id} style={{ background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'var(--teal)', borderRadius: '4px 0 0 4px' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📋</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: F, marginBottom: 2 }}>{exam.examName || 'Entrance Exam'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>Q{(exam.currentIndex || 0) + 1} of {exam.totalQuestions || '?'} · {exam.answeredCount || 0} answered</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>🕐 Saved {date}{time ? ` · ${time}` : ''}</span>
                  <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, fontFamily: F }}>{pct}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => onContinue(exam)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--teal)', color: '#fff', fontFamily: F, fontWeight: 800, fontSize: 14 }}>▶ Resume</button>
                  <button onClick={() => onDiscard(exam)} style={{ padding: '10px 14px', borderRadius: 10, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', fontFamily: F, fontWeight: 700, fontSize: 13 }}>🗑 Discard</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Weak Subject Detector ─────────────────────────────────────────────────────
// Mirrors StudentDashboard's WeakTopicDetector but uses entranceExamSessions
// and groups by subject (instead of topic/course).
function useWeakSubjects(user) {
  const [weakSubjects, setWeakSubjects] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'entranceExamSessions'),
          where('userId', '==', user.uid),
        ));
        if (cancelled) return;
        const sessions = snap.docs.map(d => d.data());
        setSessionCount(sessions.length);
        if (sessions.length < 5) { setLoading(false); return; }

        const subjectMap = {};
        sessions.forEach(s => {
          const key = s.subject || s.examName || null;
          if (!key) return;
          if (!subjectMap[key]) subjectMap[key] = { subject: key, total: 0, sumScore: 0 };
          subjectMap[key].total    += 1;
          subjectMap[key].sumScore += (s.scorePercent || 0);
        });

        const results = Object.values(subjectMap)
          .filter(t => t.total >= 2)
          .map(t => ({ ...t, avg: Math.round(t.sumScore / t.total) }))
          .filter(t => t.avg < 60)
          .sort((a, b) => a.avg - b.avg)
          .slice(0, 3);

        setWeakSubjects(results);
      } catch (e) {
        console.warn('WeakSubjectDetector error (non-fatal):', e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { weakSubjects, sessionCount, loading };
}

function WeakSubjectDetector({ user }) {
  const { weakSubjects, sessionCount, loading } = useWeakSubjects(user);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (loading || dismissed || sessionCount < 5 || weakSubjects.length === 0) return null;

  const scoreColor = (avg) =>
    avg >= 50
      ? { text: '#F59E0B', bg: 'rgba(245,158,11,0.12)', bar: '#F59E0B' }
      : { text: '#EF4444', bg: 'rgba(239,68,68,0.12)', bar: '#EF4444' };

  return (
    <ACard delay={780} style={{ marginBottom: 28 }}>
      <div style={{ background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 16, padding: '18px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎯</div>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>Weak Subjects Detected</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>Based on your last {sessionCount} sessions — drill these to improve fast</div>
            </div>
          </div>
          <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '2px 6px', lineHeight: 1, borderRadius: 6, flexShrink: 0 }} title="Dismiss">✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {weakSubjects.map((t, idx) => {
            const { text, bg, bar } = scoreColor(t.avg);
            return (
              <div key={t.subject} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: text, fontFamily: H }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: bar, width: `${Math.max(t.avg, 4)}%`, transition: 'width 1s cubic-bezier(.4,0,.2,1)' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: text, minWidth: 32 }}>{t.avg}%</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({t.total} attempt{t.total !== 1 ? 's' : ''})</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/entrance-exam/subject-drill', { state: { autoSubject: t.subject } })}
                  style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: F, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#F87171', transition: 'background .2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.28)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                >Drill →</button>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: F }}>
          💡 Subjects below 60% need attention. Drilling weak areas is the fastest way to raise your entrance score.
        </div>
      </div>
    </ACard>
  );
}

// ── Exam Countdown Banner ─────────────────────────────────────────────────────
// Reads profile.entranceExamDate (YYYY-MM-DD) set on ProfilePage.
function EntranceCountdownBanner({ profile }) {
  const navigate  = useNavigate();
  const examDate  = profile?.entranceExamDate || '';

  if (!profile) return null;

  if (!examDate) {
    return (
      <div
        onClick={() => navigate('/profile')}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: 'rgba(13,148,136,0.08)', border: '1px dashed rgba(13,148,136,0.35)', cursor: 'pointer', marginBottom: 20 }}
      >
        <span style={{ fontSize: 20 }}>📅</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
          Set your entrance exam date → get a personalised countdown
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--teal)', fontSize: 13, fontWeight: 700 }}>Set →</span>
      </div>
    );
  }

  const now    = new Date();
  const target = new Date(examDate);
  const days   = Math.ceil((target - now) / 86400000);
  if (days < -1) return null;

  const isToday  = days <= 0;
  const isUrgent = days > 0 && days <= 7;
  const isWarn   = days > 7 && days <= 30;
  const color    = isToday ? '#7C3AED' : isUrgent ? '#EF4444' : isWarn ? '#F59E0B' : '#0D9488';
  const bg       = isToday ? 'rgba(124,58,237,0.12)' : isUrgent ? 'rgba(239,68,68,0.1)' : isWarn ? 'rgba(245,158,11,0.1)' : 'rgba(13,148,136,0.08)';
  const label    = isToday ? '🎓 Exam Day!' : isUrgent ? `⚠️ ${days} day${days !== 1 ? 's' : ''} left!` : `📅 ${days} days to entrance exam`;
  const msg      = isToday ? "You've prepared well. Walk in with confidence."
                 : isUrgent ? "Final sprint! Focus on weak subjects and stay calm."
                 : days <= 30 ? "Under a month away — push hard on Subject Drill."
                 : "Stay consistent. Daily practice adds up fast.";

  return (
    <div
      onClick={() => navigate('/profile')}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, background: bg, border: `1.5px solid ${color}40`, cursor: 'pointer', marginBottom: 20, animation: isUrgent ? 'ePulse 2s ease infinite' : 'none' }}
    >
      <style>{`@keyframes ePulse { 0%,100%{box-shadow:0 0 0 0 ${color}30} 50%{box-shadow:0 0 0 6px ${color}00} }`}</style>
      <div style={{ minWidth: 48, height: 48, borderRadius: 10, flexShrink: 0, background: `${color}20`, border: `1px solid ${color}40`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {!isToday && <span style={{ fontSize: 18, fontWeight: 900, color, fontFamily: H, lineHeight: 1 }}>{days}</span>}
        {!isToday && <span style={{ fontSize: 9, color, fontWeight: 700, fontFamily: F }}>DAYS</span>}
        {isToday  && <span style={{ fontSize: 22 }}>🎓</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: H }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, marginTop: 2 }}>{msg}</div>
      </div>
      <span style={{ color, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>Profile →</span>
    </div>
  );
}

// ── Surprise Me ───────────────────────────────────────────────────────────────
// Picks a random entrance subject drill, weighted toward weak subjects.
const ENTRANCE_SUBJECTS = ['Biology', 'Chemistry', 'English Language', 'Mathematics', 'Physics', 'General Knowledge', 'Current Affairs'];

function SurpriseMeButton({ user }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pulse,   setPulse]   = useState(false);

  useEffect(() => {
    const t = setInterval(() => { setPulse(true); setTimeout(() => setPulse(false), 600); }, 4000);
    return () => clearInterval(t);
  }, []);

  const handleSurprise = async () => {
    setLoading(true);
    let picked = null;
    try {
      if (user?.uid) {
        const snap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid)));
        const sessions = snap.docs.map(d => d.data()).filter(s => s.scorePercent !== undefined && s.subject);
        if (sessions.length >= 3) {
          const subjMap = {};
          sessions.forEach(s => {
            if (!subjMap[s.subject]) subjMap[s.subject] = { total: 0, sum: 0 };
            subjMap[s.subject].total++;
            subjMap[s.subject].sum += s.scorePercent;
          });
          const weak = Object.entries(subjMap)
            .map(([id, v]) => ({ id, avg: Math.round(v.sum / v.total) }))
            .filter(c => c.avg < 65)
            .sort((a, b) => a.avg - b.avg);
          if (weak.length > 0) picked = weak[0].id;
        }
      }
    } catch (e) { /* fall through */ }

    if (!picked) picked = ENTRANCE_SUBJECTS[Math.floor(Math.random() * ENTRANCE_SUBJECTS.length)];

    navigate('/entrance-exam/subject-drill', { state: { autoSubject: picked, surpriseMode: true } });
    setLoading(false);
  };

  return (
    <button
      onClick={handleSurprise}
      disabled={loading}
      style={{
        width: '100%', padding: '16px 20px', borderRadius: 14, border: 'none',
        background: 'linear-gradient(135deg, #0F2A5E 0%, #0D9488 100%)',
        color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16,
        boxShadow: '0 4px 20px rgba(13,148,136,0.35)',
        transform: pulse ? 'scale(1.02)' : 'scale(1)',
        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s',
        opacity: loading ? 0.7 : 1,
      }}
    >
      <span style={{ fontSize: 28 }}>{loading ? '⏳' : '🎲'}</span>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: H, letterSpacing: 0.3 }}>
          {loading ? 'Finding questions…' : 'Surprise Me!'}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, fontFamily: F, fontWeight: 700 }}>
          Smart subject drill based on your weak areas • No setup needed
        </div>
      </div>
      {!loading && <span style={{ marginLeft: 'auto', fontSize: 20, opacity: 0.7 }}>→</span>}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════ */
export default function EntranceExamHub() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stats,           setStats]           = useState({ schools: 0, questions: 0 });
  const [completedExams,  setCompletedExams]  = useState([]);
  const [pausedExams,     setPausedExams]     = useState([]);
  const [avgScore,        setAvgScore]        = useState(0);
  const [bannerVis,       setBannerVis]       = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [loadError,       setLoadError]       = useState('');
  const [showPausedModal, setShowPausedModal] = useState(false);
  const [showStartModal,  setShowStartModal]  = useState(false);
  const [mockReady,       setMockReady]       = useState(false);
  const [todayMockDone,   setTodayMockDone]   = useState(false);
  const [earnedBadges,    setEarnedBadges]    = useState([]);
  const [streakReminderData, setStreakReminderData] = useState(null);

  // Carousel state
  const [slideIdx,    setSlideIdx]    = useState(0);
  const [slideFade,   setSlideFade]   = useState(true);
  const slideIdxRef  = useRef(0);
  const autoTimer    = useRef(null);
  const swipeStartX  = useRef(null);
  const swipeStartY  = useRef(null);
  const isDragging   = useRef(false);

  const animSchools   = useCounter(stats.schools,   1200, 300);
  const animQuestions = useCounter(stats.questions, 1400, 400);

  // Streak milestone
  const [streakMilestone, setStreakMilestone] = useState(0);
  const streakCheckedRef = useRef(false);
  const streak = streakReminderData?.currentStreak || 0;
  useEffect(() => {
    if (streakCheckedRef.current || !streak) return;
    streakCheckedRef.current = true;
    if (!MILESTONES[streak]) return;
    const key = `entrance_streak_milestone_${streak}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const t = setTimeout(() => setStreakMilestone(streak), 800);
    return () => clearTimeout(t);
  }, [streak]);

  // Carousel helpers
  const goToSlide = useCallback((idx) => {
    const next = ((idx % FEATURE_CARDS.length) + FEATURE_CARDS.length) % FEATURE_CARDS.length;
    setSlideFade(false);
    setTimeout(() => { slideIdxRef.current = next; setSlideIdx(next); setSlideFade(true); }, 300);
  }, []);

  const startAuto = useCallback(() => {
    clearInterval(autoTimer.current);
    autoTimer.current = setInterval(() => goToSlide(slideIdxRef.current + 1), 4000);
  }, [goToSlide]);

  useEffect(() => { startAuto(); return () => clearInterval(autoTimer.current); }, []);

  const handlePointerDown = (e) => {
    swipeStartX.current = e.touches ? e.touches[0].clientX : e.clientX;
    swipeStartY.current = e.touches ? e.touches[0].clientY : e.clientY;
    isDragging.current  = true;
  };
  const handlePointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const endX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const endY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const dx   = endX - swipeStartX.current;
    const dy   = Math.abs(endY - swipeStartY.current);
    if (Math.abs(dx) > 40 && Math.abs(dx) > dy) { goToSlide(slideIdxRef.current + (dx < 0 ? 1 : -1)); startAuto(); }
  };

  // Data load
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const schoolSnap  = await getDocs(collection(db, 'entranceExamSchools'));
      const questionCount = schoolSnap.docs.reduce((sum, d) => sum + (d.data().questionCount || 0), 0);
      setStats({ schools: schoolSnap.size, questions: questionCount });
    } catch (e) { setLoadError(`Stats failed (${e.code || e.message})`); }

    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid), orderBy('completedAt', 'desc'), limit(20)));
      } catch {
        snap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid), limit(20)));
      }
      let sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      sessions.sort((a, b) => { const ta = a.completedAt?.toDate?.()?.getTime?.() ?? 0; const tb = b.completedAt?.toDate?.()?.getTime?.() ?? 0; return tb - ta; });
      const avg = sessions.length ? Math.round(sessions.reduce((s, a) => s + (a.scorePercent || 0), 0) / sessions.length) : 0;
      setCompletedExams(sessions.slice(0, 5));
      setAvgScore(avg);
    } catch (e) { setLoadError(`Could not load your exams (${e.code || e.message})`); }

    try {
      const pausedSnap = await getDocs(query(collection(db, 'entrancePausedExams'), where('userId', '==', user.uid)));
      const paused = pausedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      paused.sort((a, b) => { const ta = a.savedAt?.toDate?.()?.getTime?.() ?? 0; const tb = b.savedAt?.toDate?.()?.getTime?.() ?? 0; return tb - ta; });
      setPausedExams(paused);
    } catch (e) { console.error('Paused exams load error:', e); }

    try {
      const key = todayKey();
      const todaySnap = await getDoc(doc(db, 'dailyMockSchedule', key));
      const ready = todaySnap.exists();
      setMockReady(ready);
      if (ready) { ensureEntranceDailyMockNotification(key); maybePushEntranceDailyMockNotification(); }
      if (user && ready) {
        try {
          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
          const doneSnap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid), where('examType', '==', 'entrance_daily_mock'), where('completedAt', '>=', Timestamp.fromDate(todayStart)), limit(1)));
          setTodayMockDone(!doneSnap.empty);
        } catch { setTodayMockDone(false); }
      }
    } catch (e) { console.error('Daily mock check error:', e); }

    // Badges + streak (non-blocking)
    try {
      const streakData = await fetchStreak(user.uid);
      setStreakReminderData(streakData);
      const allSnap = await getDocs(query(collection(db, 'entranceExamSessions'), where('userId', '==', user.uid)));
      const allSessions = allSnap.docs.map(d => d.data());
      const earned = evaluateBadges({ sessions: allSessions, streakData, bookmarkCount: profile?.bookmarkCount || 0 });
      await syncBadges(user.uid, earned);
      setEarnedBadges(earned);
    } catch (e) { console.warn('Badge/streak load failed (non-fatal):', e.message); }

    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    setTimeout(() => setBannerVis(true), 60);
    if (!user) { setLoading(false); return; }
    load();
  }, [user, authLoading, load]);

  const handleContinue = (exam) => {
    setShowPausedModal(false);
    navigate('/entrance-exam/session', {
      state: {
        resumeMode: true, pausedExamId: exam.id,
        examType: exam.examType || 'entrance_daily_mock',
        examName: exam.examName || 'Entrance Exam',
        resumeData: { questionIds: exam.questionIds, answers: exam.answers, flagged: exam.flagged, currentIndex: exam.currentIndex || 0 },
      },
    });
  };

  const handleDiscard = async (exam) => {
    if (!window.confirm('Discard this paused exam?')) return;
    try {
      await deleteDoc(doc(db, 'entrancePausedExams', exam.id));
      setPausedExams(prev => { const updated = prev.filter(e => e.id !== exam.id); if (updated.length === 0) setShowPausedModal(false); return updated; });
    } catch (e) { console.error('Discard error:', e); }
  };

  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile?.name || user?.displayName || 'Student').split(' ')[0];

  // Feature cards with dynamic daily mock state
  const dynamicFeatureCards = FEATURE_CARDS.map(c =>
    c.to === '/entrance-exam/daily-mock'
      ? { ...c, icon: todayMockDone ? '✅' : mockReady ? '🗓️' : '🗓️', sub: todayMockDone ? "Done today! Tap to review or retry" : mockReady ? "Today's mock is ready!" : "Check back — mock coming soon", color: todayMockDone ? '#16A34A' : mockReady ? '#F59E0B' : '#64748B' }
      : c
  );

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, fontFamily: F, color: 'var(--text-primary)' }}>
      <style>{`.btn-strip-track::-webkit-scrollbar{display:none}.btn-strip-track{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      {/* Modals */}
      {streakMilestone > 0 && <StreakMilestoneModal streak={streakMilestone} onClose={() => setStreakMilestone(0)} />}
      {showPausedModal && <PausedModal exams={pausedExams} onContinue={handleContinue} onDiscard={handleDiscard} onClose={() => setShowPausedModal(false)} />}
      {showStartModal  && <StartExamModal onClose={() => setShowStartModal(false)} />}

      {/* Error banner */}
      {loadError && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#EF4444', fontWeight: 700, fontFamily: F, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          ⚠️ {loadError}
          <button onClick={load} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: F }}>Retry</button>
        </div>
      )}

      {/* Streak reminder */}
      {streakReminderData && <StreakReminderBanner streakData={streakReminderData} />}

      {/* Badge strip */}
      {earnedBadges.length > 0 && (
        <div onClick={() => navigate('/badges')} style={{ background: 'linear-gradient(135deg, #0D948818 0%, #1E3A8A18 100%)', border: '1.5px solid rgba(13,148,136,0.25)', borderRadius: 14, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🏅</span>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: '#0D9488' }}>{earnedBadges.length} Badge{earnedBadges.length !== 1 ? 's' : ''} Earned</div>
              <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)' }}>Tap to view your collection</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {earnedBadges.slice(0, 5).map(id => { const b = BADGE_MAP[id]; return b ? <span key={id} style={{ fontSize: 22 }} title={b.label}>{b.icon}</span> : null; })}
            <span style={{ fontFamily: H, fontWeight: 900, fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>›</span>
          </div>
        </div>
      )}

      {/* Tip of the Day */}
      <TipOfDay />

      {/* Daily Challenge */}
      <DailyChallenge />

      {/* ── Carousel Banner ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F2A5E 0%, #065F46 100%)',
          borderRadius: 20, marginBottom: 28, position: 'relative', overflow: 'hidden',
          opacity: bannerVis ? 1 : 0,
          transform: bannerVis ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'opacity .6s ease, transform .6s ease',
          userSelect: 'none',
        }}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
      >
        {dynamicFeatureCards.map((action, i) => (
          <div
            key={action.label}
            style={{
              display: i === slideIdx ? 'flex' : 'none',
              alignItems: 'flex-start', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 12, width: '100%',
              padding: 'clamp(18px,4vw,28px) clamp(16px,4vw,32px)',
              opacity: slideFade ? 1 : 0,
              transition: 'opacity .38s ease',
              background: `linear-gradient(135deg, #0F2A5E 0%, ${action.color}bb 100%)`,
              borderRadius: 20, boxSizing: 'border-box',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 20, background: `radial-gradient(ellipse at 75% 50%, ${action.color}33 0%, transparent 65%)` }} />
            <div style={{ position: 'relative', zIndex: 1, flex: '1 1 260px', minWidth: 0 }}>
              <h1 style={{ fontSize: 'clamp(0.9rem,3.5vw,1.1rem)', color: 'rgba(255,255,255,0.75)', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 6px', fontFamily: F }}>
                🏥 NMCN CBT Platform
              </h1>
              <h1 style={{ color: '#fff', fontFamily: H, fontSize: 'clamp(1.4rem,6vw,2.2rem)', margin: '0 0 6px', lineHeight: 1.2 }}>
                {greet}, {firstName}! 👋
              </h1>
              <h2 style={{ color: 'rgba(255,255,255,0.88)', fontSize: 'clamp(0.85rem,2.8vw,1rem)', fontWeight: 500, margin: '0 0 16px', lineHeight: 1.4, fontFamily: F }}>
                🏫 Nursing Schools Entrance Exam Prep
              </h2>

              <Link
                to={action.to}
                onClick={e => e.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}
              >
                <div style={{ fontSize: 32, flexShrink: 0 }}>{action.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontWeight: 800, fontSize: 'clamp(1rem,3.5vw,1.3rem)', color: '#fff', margin: '0 0 3px', fontFamily: H }}>{action.label}</h2>
                  <h2 style={{ fontSize: 'clamp(0.78rem,2.5vw,1rem)', fontWeight: 400, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontFamily: F }}>
                    {action.desc}
                  </h2>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 900, fontSize: 22, flexShrink: 0 }}>→</div>
              </Link>

              {/* Dots */}
              <div style={{ display: 'flex', gap: 5, marginTop: 10, marginBottom: 14 }}>
                {dynamicFeatureCards.map((_, di) => (
                  <button key={di} onClick={e => { e.stopPropagation(); goToSlide(di); startAuto(); }} style={{ width: di === slideIdx ? 20 : 6, height: 6, borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0, background: di === slideIdx ? action.color : 'rgba(255,255,255,0.28)', transition: 'width .3s ease, background .3s ease' }} />
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => { e.stopPropagation(); setShowStartModal(true); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 26px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: F, background: '#F59E0B', color: '#1a1a1a', border: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  ⚡ Start Exam
                </button>

                {pausedExams.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowPausedModal(true); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 26px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: F, background: 'rgba(13,148,136,0.25)', border: '1.5px solid rgba(13,148,136,0.65)', color: '#5EEAD4', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    ▶ Continue
                    <span style={{ background: '#0D9488', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 900, padding: '1px 7px' }}>{pausedExams.length}</span>
                  </button>
                )}

                {!authLoading && !profile?.entranceExamPaid && profile?.role !== 'admin' && (
                  <Link
                    to="/entrance-exam/payment"
                    onClick={e => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 26px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: F, background: 'rgba(245,158,11,0.2)', border: '1.5px solid rgba(245,158,11,0.55)', color: '#FBBF24', whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none' }}
                  >
                    🔓 Unlock Full Access
                  </Link>
                )}
              </div>

              {/* Live stat chips */}
              <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }} onClick={e => e.stopPropagation()}>
                {[
                  { icon: '🏫', label: 'Schools',    value: loading ? '…' : animSchools },
                  { icon: '❓', label: 'Questions',  value: loading ? '…' : animQuestions },
                  { icon: '📝', label: 'Exams Done', value: loading ? '…' : completedExams.length },
                  ...(avgScore > 0 ? [{ icon: '📊', label: 'Avg Score', value: `${avgScore}%` }] : []),
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 12, padding: '10px 16px' }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 18, color: '#fff', lineHeight: 1, fontFamily: H }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, marginTop: 2, fontFamily: F }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Paused inline hint */}
      {pausedExams.length > 0 && (
        <ACard delay={650} style={{ marginBottom: 20 }}>
          <div onClick={() => setShowPausedModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.3)', borderRadius: 14, padding: '14px 18px', cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'rgba(13,148,136,0.15)', border: '1.5px solid rgba(13,148,136,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>▶️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>You have {pausedExams.length} paused exam{pausedExams.length !== 1 ? 's' : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pausedExams[0]?.examName || 'Exam'} · click to resume</div>
            </div>
            <span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: 16 }}>→</span>
          </div>
        </ACard>
      )}

      {/* Free preview notice */}
      {!authLoading && !profile?.entranceExamPaid && profile?.role !== 'admin' && (
        <ACard delay={680} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: 'rgba(245,158,11,0.07)', border: '1.5px solid rgba(245,158,11,0.35)', borderRadius: 14, padding: '14px 18px' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'rgba(245,158,11,0.15)', border: '1.5px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎯</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#F59E0B', marginBottom: 3 }}>Free Preview — 10 Questions per Exam</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>All features are open. Each session is capped at 10 questions until you unlock full access.</div>
            </div>
            <Link to="/entrance-exam/payment" style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 8, background: '#F59E0B', color: '#1a1a1a', fontWeight: 700, fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap', alignSelf: 'center' }}>
              🔓 Unlock ₦3,000
            </Link>
          </div>
        </ACard>
      )}

      {/* Exam countdown */}
      <EntranceCountdownBanner profile={profile} />

      {/* Feature cards */}
      <ACard delay={700} style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.2rem,3vw,1.6rem)', color: 'var(--text-primary)', margin: '0 0 12px' }}>⚡ What do you want to do?</h2>
        <SurpriseMeButton user={user} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {dynamicFeatureCards.map((card, i) => <FeatureCard key={card.label} {...card} delay={750 + i * 60} />)}
        </div>
      </ACard>

      {/* Weak Subject Detector */}
      <WeakSubjectDetector user={user} />

      {/* Progress Wall shortcut */}
      <ACard delay={980} style={{ marginBottom: 20 }}>
        <div onClick={() => navigate('/progress-wall')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg,rgba(13,148,136,0.12),rgba(15,42,94,0.12))', border: '1.5px solid rgba(13,148,136,0.25)', borderRadius: 14, padding: '16px 20px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>🗺️</span>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)' }}>Progress Wall</div>
              <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Heatmap · Subject mastery · Weak spots</div>
            </div>
          </div>
          <span style={{ fontFamily: H, fontWeight: 900, fontSize: 18, color: 'var(--text-muted)' }}>›</span>
        </div>
      </ACard>

      {/* Recommendation panel */}
      <ACard delay={1000} style={{ marginBottom: 24 }}>
        <div style={{ background: 'var(--teal-glow)', border: '1.5px solid rgba(13,148,136,0.25)', borderRadius: 14, padding: '18px 22px' }}>
          <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,2vw,1.4rem)', color: 'var(--text-primary)', margin: '0 0 12px' }}>💡 Recommended For You</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              avgScore < 70 && avgScore > 0
                ? `Your average is ${avgScore}% — try Subject Drill to boost weak subjects`
                : avgScore >= 70
                  ? `You're averaging ${avgScore}% — great! Try a harder school's questions`
                  : "Start with any school's past questions to get your first score",
              todayMockDone
                ? "Great job completing today's Daily Mock! Try a School Past Questions next"
                : mockReady
                  ? "Don't miss today's Daily Mock Exam — it resets at midnight"
                  : "Try Subject Drill to sharpen your weak subjects",
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: F, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--teal)', fontWeight: 900, flexShrink: 0 }}>→</span>
                {tip}
              </div>
            ))}
          </div>
        </div>
      </ACard>

      {/* Recent sessions */}
      {completedExams.length > 0 && (
        <ACard delay={1100} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,2vw,1.4rem)', color: 'var(--text-primary)', margin: 0 }}>🕓 Recent Exams</h3>
            <Link to="/entrance-exam/my-results" style={{ color: 'var(--teal)', fontSize: 14, fontWeight: 700, fontFamily: F }}>All results →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {completedExams.map(s => {
              const pct    = s.scorePercent ?? Math.round(((s.correct || 0) / (s.totalQuestions || 1)) * 100);
              const passed = pct >= 50;
              const date   = s.completedAt?.toDate ? s.completedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently';
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `5px solid ${passed ? '#16A34A' : '#EF4444'}`, borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', fontFamily: F }}>{s.examName || 'Entrance Exam'}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F, marginTop: 2 }}>{date} · {s.correct ?? '?'}/{s.totalQuestions ?? '?'} correct</div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: passed ? '#16A34A' : '#EF4444', fontFamily: H }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </ACard>
      )}

      {/* Empty state */}
      {!loading && completedExams.length === 0 && pausedExams.length === 0 && (
        <ACard delay={900}>
          <div style={{ textAlign: 'center', padding: '40px 28px', background: 'var(--bg-card)', border: '2px solid var(--border)', borderRadius: 18 }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>🏫</div>
            <h3 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.3rem,3vw,2rem)', color: 'var(--text-primary)', margin: '0 0 10px' }}>Start Your Entrance Exam Prep</h3>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.7 }}>Browse nursing schools and start practising with real past questions.</p>
            <Link to="/entrance-exam/schools" className="btn btn-primary" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 15, fontFamily: F, fontWeight: 700 }}>🏫 Browse Schools</Link>
          </div>
        </ACard>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 0' }}>
          {[1,2,3].map(k => <Skeleton key={k} h={48} r={12} />)}
        </div>
      )}
    </div>
  );
}
