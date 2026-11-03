// src/components/student/StudentDashboard.jsx
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, limit,
  getDocs, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';
import StreakMilestoneModal, { MILESTONES } from '../shared/StreakMilestoneModal';
import { fetchBadges, evaluateBadges, syncBadges, BADGES, BADGE_MAP } from '../../utils/badgeUtils';
import { fetchStreak } from '../../utils/streakUtils';
import DailyChallenge from '../shared/DailyChallenge';
import ExamCountdown from '../shared/ExamCountdown';
import TipOfDay from '../shared/TipOfDay';
import StreakReminderBanner from '../shared/StreakReminderBanner';

const F = "'Plus Jakarta Sans', system-ui, sans-serif";
const H = "'Plus Jakarta Sans', system-ui, sans-serif";

// ── Animated counter ──────────────────────────────────────────────────────────
function useCounter(target, duration = 1600, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    const to = setTimeout(() => {
      let n = 0;
      const step = target / (duration / 16);
      const t = setInterval(() => {
        n += step;
        if (n >= target) { setVal(target); clearInterval(t); }
        else setVal(Math.floor(n));
      }, 16);
      return () => clearInterval(t);
    }, delay);
    return () => clearTimeout(to);
  }, [target, duration, delay]);
  return val;
}

// ── Animated card fade-up ─────────────────────────────────────────────────────
function ACard({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity .55s ease, transform .55s ease',
      ...s,
    }}>
      {children}
    </div>
  );
}

// ── Animated score ring ───────────────────────────────────────────────────────
function ScoreRing({ percent, color = '#15803D', size = 72 }) {
  const r = 28, circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => { const t = setTimeout(() => setDash((percent / 100) * circ), 500); return () => clearTimeout(t); }, [percent, circ]);
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={circ - dash} strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)' }}
      />
      <text x="36" y="41" textAnchor="middle" fill={color} fontSize="13" fontWeight="800">{percent}%</text>
    </svg>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 14, r = 6 }) {
  return (
    <>
      <style>{`@keyframes sdShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{
        width: w, height: h, borderRadius: r,
        background: 'linear-gradient(90deg, var(--bg-tertiary) 25%, var(--border) 50%, var(--bg-tertiary) 75%)',
        backgroundSize: '200% 100%', animation: 'sdShimmer 1.4s infinite',
      }} />
    </>
  );
}

// ── Exam type label ───────────────────────────────────────────────────────────
function examTypeLabel(type) {
  switch (type) {
    case 'course_drill':   return '📖 Course Drill';
    case 'topic_drill':    return '🎯 Topic Drill';
    case 'daily_practice': return '⚡ Daily Practice';
    case 'mock_exam':      return '📋 Hospital Final Exam';
    case 'past_questions': return '📜 Past Questions';
    default:               return type?.replace(/_/g, ' ') || 'Exam';
  }
}

// ── Entrance exam type check ──────────────────────────────────────────────────
// ── FIX: Any paused exam that belongs to the entrance exam site must be
//         excluded from the main CBT dashboard. These are identified by their
//         examType value. The entrance exam session saves to the separate
//         `entrancePausedExams` collection, but school past-question flows may
//         still write to `pausedExams` with an entrance-style examType.
//         This guard catches both cases.
function isEntranceExamType(examType) {
  if (!examType) return false;
  const t = examType.toLowerCase();
  return (
    t.includes('entrance') ||
    t === 'entrance_daily_mock' ||
    t === 'entrance_past_questions' ||
    t === 'entrance_subject_drill' ||
    t === 'school_past_questions'
  );
}

// ── Weak Topic Detector ───────────────────────────────────────────────────────
// Analyses all of the student's examSessions to find topics where their
// average score is below 60%. Surfaces the 3 weakest as actionable drill cards.
// Only shown once the student has at least 5 sessions (enough signal to be
// meaningful). Queries examSessions on mount — no extra Firestore collection.

function useWeakTopics(user) {
  const [weakTopics, setWeakTopics] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [wtLoading, setWtLoading] = useState(true);

  useEffect(() => {
    if (!user) { setWtLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
        ));
        if (cancelled) return;

        const sessions = snap.docs.map(d => d.data());
        setSessionCount(sessions.length);

        if (sessions.length < 5) { setWtLoading(false); return; }

        // Aggregate by topic — only sessions that have a topic field
        const topicMap = {};
        sessions.forEach(s => {
          if (!s.topic) return;
          const key = `${s.course || ''}||${s.topic}`;
          if (!topicMap[key]) {
            topicMap[key] = {
              topic:       s.topic,
              course:      s.course      || '',
              courseLabel: s.courseLabel || '',
              category:    s.category    || '',
              total: 0, sumScore: 0,
            };
          }
          topicMap[key].total    += 1;
          topicMap[key].sumScore += (s.scorePercent || 0);
        });

        const results = Object.values(topicMap)
          .filter(t => t.total >= 2)                           // need ≥2 attempts for signal
          .map(t => ({ ...t, avg: Math.round(t.sumScore / t.total) }))
          .filter(t => t.avg < 60)                             // below pass threshold
          .sort((a, b) => a.avg - b.avg)                       // weakest first
          .slice(0, 3);

        setWeakTopics(results);
      } catch (e) {
        console.warn('WeakTopicDetector load error (non-fatal):', e.message);
      } finally {
        if (!cancelled) setWtLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { weakTopics, sessionCount, wtLoading };
}

function WeakTopicDetector({ user }) {
  const { weakTopics, sessionCount, wtLoading } = useWeakTopics(user);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  // Don't show until there's enough data, or after dismissal
  if (wtLoading || dismissed || sessionCount < 5 || weakTopics.length === 0) return null;

  const scoreColor = (avg) => {
    if (avg >= 50) return { text: '#F59E0B', bg: 'rgba(245,158,11,0.12)', bar: '#F59E0B' };
    return { text: '#EF4444', bg: 'rgba(239,68,68,0.12)', bar: '#EF4444' };
  };

  const handleDrill = (t) => {
    navigate('/exam/session', {
      state: {
        poolMode:    true,
        examType:    'topic_drill',
        examName:    `Drill: ${t.topic}`,
        category:    t.category,
        course:      t.course,
        courseLabel: t.courseLabel,
        topic:       t.topic,
        count:       20,
        doShuffle:   true,
        timeLimit:   0,
      },
    });
  };

  return (
    <ACard delay={780} style={{ marginBottom: 28 }}>
      <div style={{
        background: 'rgba(239,68,68,0.06)',
        border: '1.5px solid rgba(239,68,68,0.25)',
        borderRadius: 16,
        padding: '18px 18px 14px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>🎯</div>
            <div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>
                Weak Topics Detected
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                Based on your last {sessionCount} sessions — drill these to improve fast
              </div>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 16, padding: '2px 6px', lineHeight: 1,
              borderRadius: 6, flexShrink: 0,
            }}
            title="Dismiss"
          >✕</button>
        </div>

        {/* Topic cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {weakTopics.map((t, idx) => {
            const { text, bg, bar } = scoreColor(t.avg);
            const barWidth = Math.max(t.avg, 4);
            return (
              <div
                key={`${t.course}||${t.topic}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--bg-card)',
                  border: '1.5px solid var(--border)',
                  borderRadius: 12, padding: '12px 14px',
                }}
              >
                {/* Rank badge */}
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: bg, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 900, fontSize: 13, color: text,
                  fontFamily: H,
                }}>
                  {idx + 1}
                </div>

                {/* Topic info + bar */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: 13, color: 'var(--text-primary)',
                    marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {t.topic}
                  </div>
                  {t.courseLabel && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>
                      {t.courseLabel}
                    </div>
                  )}
                  {/* Score bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3, background: bar,
                        width: `${barWidth}%`,
                        transition: 'width 1s cubic-bezier(.4,0,.2,1)',
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: text, minWidth: 32 }}>
                      {t.avg}%
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      ({t.total} attempt{t.total !== 1 ? 's' : ''})
                    </span>
                  </div>
                </div>

                {/* Drill button */}
                <button
                  onClick={() => handleDrill(t)}
                  style={{
                    flexShrink: 0, padding: '8px 14px', borderRadius: 9,
                    cursor: 'pointer', fontWeight: 700, fontSize: 12,
                    fontFamily: F, border: 'none',
                    background: 'rgba(239,68,68,0.15)',
                    color: '#F87171',
                    transition: 'background .2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.28)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                >
                  Drill →
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer tip */}
        <div style={{
          marginTop: 12, fontSize: 11, color: 'var(--text-muted)',
          fontStyle: 'italic', fontFamily: F,
        }}>
          💡 Topics below 60% need attention. Drilling weak areas is the fastest way to raise your score.
        </div>
      </div>
    </ACard>
  );
}

// ── Paused Exams Modal ────────────────────────────────────────────────────────
function PausedExamsModal({ paused, onResume, onDelete, onClose }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVis(true)); }, []);
  return (
    <div style={M.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        ...M.modal,
        opacity: vis ? 1 : 0,
        transform: vis ? 'scale(1) translateY(0)' : 'scale(.96) translateY(20px)',
        transition: 'opacity .35s ease, transform .35s ease',
      }}>
        <div style={M.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>▶️</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>Continue an Exam</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {paused.length} paused exam{paused.length !== 1 ? 's' : ''} waiting
              </div>
            </div>
          </div>
          <button onClick={onClose} style={M.closeBtn}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 2 }}>
          {paused.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div style={{ fontWeight: 700 }}>No paused exams</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Exit an exam using "Exit &amp; Save" to continue it later.</div>
            </div>
          ) : paused.map((p, idx) => {
            const progress = p.totalQuestions > 0
              ? Math.round(((p.answeredCount || 0) / p.totalQuestions) * 100) : 0;
            const savedAt = p.savedAt?.toDate ? p.savedAt.toDate() : p.savedAt ? new Date(p.savedAt) : null;
            const dateStr = savedAt ? savedAt.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
            const timeStr = savedAt ? savedAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <PausedCard
                key={p.id} p={p} progress={progress}
                dateStr={dateStr} timeStr={timeStr}
                onResume={onResume} onDelete={onDelete}
                delay={idx * 80}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PausedCard({ p, progress, dateStr, timeStr, onResume, onDelete, delay }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      ...M.card,
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateX(0)' : 'translateX(-16px)',
      transition: 'opacity .4s ease, transform .4s ease',
    }}>
      <div style={{ ...M.cardAccent, background: 'var(--teal)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>
          {p.examName || 'Untitled Exam'}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={M.tag}>{examTypeLabel(p.examType)}</span>
          {p.courseLabel && <span style={{ ...M.tag, background: 'rgba(37,99,235,0.12)', color: '#60A5FA' }}>📚 {p.courseLabel}</span>}
          {p.topic && <span style={{ ...M.tag, background: 'rgba(124,58,237,0.12)', color: '#A78BFA' }}>📌 {p.topic}</span>}
        </div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Q{(p.currentQuestion || 0) + 1} of {p.totalQuestions} · {p.answeredCount || 0} answered
            </span>
            <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700 }}>{progress}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'var(--teal)', width: `${progress}%`, transition: 'width .6s ease' }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>💾 Saved {dateStr}{timeStr ? ` · ${timeStr}` : ''}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, marginLeft: 8 }}>
        <button onClick={() => onResume(p)} style={M.resumeBtn}>▶ Resume</button>
        <button onClick={() => onDelete(p.id)} style={M.deleteBtn}>🗑 Discard</button>
      </div>
    </div>
  );
}

const M = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 16, borderBottom: '1px solid var(--border)' },
  closeBtn: { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  card: { display: 'flex', alignItems: 'flex-start', gap: 12, background: 'var(--bg-primary)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '14px 14px 14px 18px', position: 'relative', overflow: 'hidden' },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  tag: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(21,128,61,0.12)', color: 'var(--teal)' },
  resumeBtn: { padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: 'var(--teal)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, fontFamily: F, whiteSpace: 'nowrap' },
  deleteBtn: { padding: '5px 10px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', fontWeight: 600, fontSize: 11, fontFamily: F, whiteSpace: 'nowrap' },
};

// ── Quick actions data ────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    to: '/course-drill', icon: '📖', label: 'Course Drill',
    sub: 'Take exam by courses',
    desc: 'Pick any nursing course and drill questions specifically from that course. Perfect for targeted revision before a test.',
    color: '#15803D',
  },
  {
    to: '/topic-drill', icon: '🎯', label: 'Topic Drill',
    sub: 'Take exam by topics',
    desc: 'Narrow down to a specific topic within a course and focus your practice exactly where you need improvement.',
    color: '#2563EB',
  },
  {
    to: '/mock-exams', icon: '📋', label: 'Hospital Final Prep',
    sub: 'Study daily Hospital Final exam',
    desc: 'Simulate a real hospital final exam under timed conditions. Tests your full readiness before the actual NMCN exam.',
    color: '#7C3AED',
  },
  {
    to: '/daily-mock-exam', icon: '🗓️', label: 'Daily Mock Exam',
    sub: '250 new questions every 24hrs',
    desc: 'A fresh 250-question pool every day, timed at 1 minute per question. Pick how many you want to answer — low-scoring questions keep repeating until the class masters them. Retake anytime for a new score.',
    color: '#0891B2',
  },
  {
    to: '/past-questions', icon: '📜', label: 'Past Questions',
    sub: 'Study NMCN past questions',
    desc: 'Practice with real NMCN past questions. Understand exam patterns, common topics, and boost your confidence.',
    color: '#EF4444',
  },
  {
    to: '/bookmarks', icon: '🔖', label: 'Bookmarks',
    sub: 'Review your Bookmarked questions',
    desc: 'Review questions you saved during past exams. Great for revisiting difficult questions you want to master.',
    color: '#A855F7',
  },
  {
    to: '/study-plan', icon: '📅', label: 'Study Plan',
    sub: 'AI-generated week-by-week plan',
    desc: 'Get a personalised study plan built around your exam date, weak topics, and available time. Powered by Claude AI.',
    color: '#7C3AED',
  },
  {
    to: '/lecture-notes', icon: '📚', label: 'Lecture Notes',
    sub: 'Read notes by specialty',
    desc: 'Browse lecture notes organised by specialty and topic, written and illustrated by your tutors.',
    color: '#16A34A',
  },
  {
    to: '/caosce', icon: '🩺', label: 'CAOSCE PREP',
    sub: 'Computer-Based OSCE Practical Exam',
    desc: 'Practice real OSCE-style clinical stations: read the scenario, tick the procedures you would perform, then answer CBT questions on the case.',
    color: '#15803D',
  },
  {
    to: '/essay-questions', icon: '✍️', label: 'Essay Questions',
    sub: 'Practice written answers',
    desc: 'Practice long-form essay questions with model answers to sharpen your written exam technique.',
    color: '#F59E0B',
  },
];

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
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Choose how you want to practice</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {QUICK_ACTIONS.map((a, idx) => (
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

// ── Banner Action Buttons ─────────────────────────────────────────────────────
function BannerButtonStrip({ pausedExams, profile, onContinue, onStartExam }) {
  const trackRef    = useRef(null);
  const dragStartX  = useRef(null);
  const scrollStart = useRef(null);
  const isDragging  = useRef(false);

  const btnBase = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '10px 22px', borderRadius: 10, cursor: 'pointer',
    fontWeight: 700, fontSize: 13, fontFamily: F,
    whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0,
    transition: 'opacity .2s, transform .15s', userSelect: 'none',
  };

  const onDown = (e) => {
    dragStartX.current  = e.touches ? e.touches[0].clientX : e.clientX;
    scrollStart.current = trackRef.current?.scrollLeft || 0;
    isDragging.current  = true;
  };
  const onMove = (e) => {
    if (!isDragging.current || !trackRef.current) return;
    const x  = e.touches ? e.touches[0].clientX : e.clientX;
    const dx = dragStartX.current - x;
    trackRef.current.scrollLeft = scrollStart.current + dx;
  };
  const onUp = () => { isDragging.current = false; };

  return (
    <div
      style={{
        borderTop: '1px solid rgba(255,255,255,0.12)',
        padding: '12px 0',
        position: 'relative', zIndex: 2,
        background: 'rgba(0,0,0,0.18)',
        borderRadius: '0 0 20px 20px',
      }}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, zIndex: 3, background: 'linear-gradient(to right, rgba(0,0,0,0.30), transparent)', borderRadius: '0 0 0 20px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 28, zIndex: 3, background: 'linear-gradient(to left, rgba(0,0,0,0.30), transparent)', borderRadius: '0 0 20px 0', pointerEvents: 'none' }} />
      <div
        ref={trackRef}
        className="btn-strip-track"
        style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 20px', cursor: 'grab', WebkitOverflowScrolling: 'touch' }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      >
        <button
          onClick={e => { e.stopPropagation(); onStartExam(); }}
          style={{ ...btnBase, background: '#F59E0B', color: '#1a1a1a', border: 'none' }}
        >
          ⚡ Start Exam
        </button>

        {pausedExams.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onContinue(); }}
            style={{ ...btnBase, background: 'rgba(21,128,61,0.25)', border: '1.5px solid rgba(21,128,61,0.65)', color: '#5EEAD4' }}
          >
            ▶ Continue
            <span style={{ background: '#15803D', color: '#fff', borderRadius: 20, fontSize: 10, fontWeight: 900, padding: '1px 7px', lineHeight: '16px' }}>
              {pausedExams.length}
            </span>
          </button>
        )}

        {!profile?.subscribed && (
          <Link
            to="/subscription"
            onClick={e => e.stopPropagation()}
            style={{ ...btnBase, background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.4)', color: '#fff' }}
          >
            👑 Upgrade
          </Link>
        )}

        <div style={{ flexShrink: 0, width: 12 }} />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [recentSessions, setRecentSessions] = useState([]);
  const [pausedExams,    setPausedExams]    = useState([]);
  const [showModal,      setShowModal]      = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [bannerVis,      setBannerVis]      = useState(false);
  const [slideIdx,       setSlideIdx]       = useState(0);
  const [slideFade,      setSlideFade]      = useState(true);
  const [earnedBadges,   setEarnedBadges]   = useState([]);
  const [streakReminderData, setStreakReminderData] = useState(null);

  const swipeStartX  = useRef(null);
  const swipeStartY  = useRef(null);
  const isDragging   = useRef(false);
  const slideIdxRef  = useRef(0);
  const autoTimer    = useRef(null);

  const goToSlide = useCallback((idx) => {
    const next = ((idx % QUICK_ACTIONS.length) + QUICK_ACTIONS.length) % QUICK_ACTIONS.length;
    setSlideFade(false);
    setTimeout(() => {
      slideIdxRef.current = next;
      setSlideIdx(next);
      setSlideFade(true);
    }, 300);
  }, []);

  const startAuto = useCallback(() => {
    clearInterval(autoTimer.current);
    autoTimer.current = setInterval(() => {
      goToSlide(slideIdxRef.current + 1);
    }, 4000);
  }, [goToSlide]);

  useEffect(() => {
    startAuto();
    return () => clearInterval(autoTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (Math.abs(dx) > 40 && Math.abs(dx) > dy) {
      goToSlide(slideIdxRef.current + (dx < 0 ? 1 : -1));
      startAuto();
    }
  };

  useEffect(() => {
    setTimeout(() => setBannerVis(true), 80);
    if (!user) { setLoading(false); return; }

    // Daily Mock Exam's rotateDailyMockExam Cloud Function already sends a
    // server-side FCM push to every device when a new pool goes live — more
    // reliable than a client-side Notification (works even if the app isn't
    // open), so there's no separate "Daily Practice" reminder needed here.

    const loadData = async () => {
      // Recent exam sessions
      try {
        const sessSnap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
          limit(5),
        ));
        setRecentSessions(sessSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.warn('examSessions load failed (non-fatal):', e.message); }

      // Paused exams — FIX: filter out any entrance exam types that may have
      // been accidentally written to the main `pausedExams` collection.
      // Entrance exam paused exams belong only on the entrance exam dashboard.
      try {
        const pausedSnap = await getDocs(query(
          collection(db, 'pausedExams'),
          where('userId', '==', user.uid),
        ));
        const paused = pausedSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => !isEntranceExamType(p.examType)); // ← KEY FIX

        paused.sort((a, b) => {
          const ta = a.savedAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.savedAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        });
        setPausedExams(paused);
      } catch (e) { console.warn('pausedExams load failed (non-fatal):', e.message); }

      setLoading(false);

      // Load & sync badges (non-blocking)
      try {
        const allSessSnap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
        ));
        const allSessions = allSessSnap.docs.map(d => d.data());
        const streakData  = await fetchStreak(user.uid);
        setStreakReminderData(streakData);
        const earned = evaluateBadges({ sessions: allSessions, streakData, bookmarkCount: profile?.bookmarkCount || 0 });
        await syncBadges(user.uid, earned);
        setEarnedBadges(earned);
      } catch (e) { console.warn('badge sync failed (non-fatal):', e.message); }
    };

    loadData();
  }, [user]);

  const handleResume = useCallback((paused) => {
    setShowModal(false);
    navigate('/exam/session', {
      state: {
        resumeMode: true, pausedExamId: paused.id,
        poolMode: paused.poolMode ?? true, examType: paused.examType,
        examName: paused.examName, category: paused.category,
        course: paused.course, courseLabel: paused.courseLabel,
        topic: paused.topic, examId: paused.examId || '',
        count: paused.totalQuestions, doShuffle: false,
        timeLimit: paused.timeLimit || 0,
        resumeData: {
          questionIds: paused.questionIds, answers: paused.answers,
          currentQuestion: paused.currentQuestion || 0,
          totalQuestions: paused.totalQuestions, flagged: paused.flagged || [],
        },
      },
    });
  }, [navigate]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Discard this paused exam? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'pausedExams', id));
      setPausedExams(prev => prev.filter(p => p.id !== id));
    } catch (e) { console.error('Delete paused exam error:', e); }
  }, []);

  const totalExams    = profile?.totalExams    || 0;
  const totalScore    = profile?.totalScore    || 0;
  const avgScore      = totalExams > 0 ? Math.round(totalScore / totalExams) : 0;
  const streak        = profile?.streak        || 0;
  const bookmarks     = profile?.bookmarkCount || 0;

  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const animExams     = useCounter(totalExams, 1600, 400);
  const animStreak    = useCounter(streak,     1400, 550);
  const animBookmarks = useCounter(bookmarks,  1400, 700);

  // ── Streak milestone detection ───────────────────────────────────────────
  const [streakMilestone, setStreakMilestone] = useState(0);
  const streakCheckedRef = useRef(false);
  useEffect(() => {
    if (streakCheckedRef.current || !streak) return;
    streakCheckedRef.current = true;
    if (!MILESTONES[streak]) return;
    const key = `nmcn_streak_milestone_${streak}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const t = setTimeout(() => setStreakMilestone(streak), 800);
    return () => clearTimeout(t);
  }, [streak]);

  const firstName = (profile?.name || user?.displayName || 'Nurse').split(' ')[0];
  const slide = QUICK_ACTIONS[slideIdx] || QUICK_ACTIONS[0];

  const statChips = [
    { icon: '📄', label: 'Exams Taken', value: animExams,       to: '/results',   tint: '#2563EB' },
    { icon: '📊', label: 'Avg. Score',  value: `${avgScore}%`,  to: '/performance', tint: '#22C55E' },
    { icon: '🔥', label: 'Day Streak',  value: animStreak,      to: '/progress-wall', tint: '#F97316' },
    { icon: '🔖', label: 'Bookmarked',  value: animBookmarks,   to: '/bookmarks', tint: '#14B8A6' },
  ];

  return (
    <div className="nmcn-dash" style={{ padding: '14px 14px 24px', maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <style>{`
        .btn-strip-track::-webkit-scrollbar { display: none; }
        .btn-strip-track { -ms-overflow-style: none; scrollbar-width: none; }
        .nmcn-dash a { -webkit-tap-highlight-color: transparent; }
        .nmcn-qgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        @media (min-width: 901px) { .nmcn-qgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .nmcn-dash { padding: 24px !important; } }
        .nmcn-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        @media (min-width: 640px) { .nmcn-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .nmcn-qcard:active, .nmcn-slidecard:active { transform: scale(0.985); }
      `}</style>

      {streakMilestone > 0 && (
        <StreakMilestoneModal streak={streakMilestone} onClose={() => setStreakMilestone(0)} />
      )}

      {streakReminderData && <StreakReminderBanner streakData={streakReminderData} />}

      {showModal && (
        <PausedExamsModal paused={pausedExams} onResume={handleResume} onDelete={handleDelete} onClose={() => setShowModal(false)} />
      )}

      {showStartModal && <StartExamModal onClose={() => setShowStartModal(false)} />}

      {/* ── Badge strip ── */}
      <div
        onClick={() => navigate('/badges')}
        role="button"
        style={{
          ...S.panel, display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', cursor: 'pointer', marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 34, lineHeight: 1, flexShrink: 0 }}>🏅</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: H, fontWeight: 800, fontSize: 16, color: 'var(--accent-text)' }}>
            {earnedBadges.length > 0
              ? `${earnedBadges.length} Badge${earnedBadges.length !== 1 ? 's' : ''} Earned`
              : 'No badges yet'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {earnedBadges.length > 0 ? 'Tap to view your collection' : 'Complete an exam to earn your first badge'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {earnedBadges.slice(0, 2).map(id => {
            const b = BADGE_MAP[id];
            return b ? (
              <span key={id} title={b.label} style={{
                width: 46, height: 46, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, background: 'rgba(245,158,11,0.12)', border: '2px solid rgba(245,158,11,0.7)',
              }}>{b.icon}</span>
            ) : null;
          })}
          <span style={{ fontSize: 26, color: 'var(--text-primary)', fontWeight: 700, marginLeft: 2 }}>›</span>
        </div>
      </div>

      {/* ── Hero banner ── */}
      <div
        style={{
          ...S.banner,
          opacity: bannerVis ? 1 : 0,
          transform: bannerVis ? 'translateY(0)' : 'translateY(-14px)',
          transition: 'opacity .6s ease, transform .6s ease',
          userSelect: 'none',
        }}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
      >
        <div style={{ position: 'absolute', right: 10, top: 18, fontSize: 'clamp(90px, 28vw, 150px)', opacity: 0.14, pointerEvents: 'none', lineHeight: 1, transform: 'rotate(-12deg)' }}>🩺</div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 30 }}>📋</span>
            <h1 style={{ margin: 0, fontFamily: H, fontWeight: 800, color: '#fff', letterSpacing: 0.5, fontSize: 'clamp(1.15rem, 5.6vw, 1.7rem)', lineHeight: 1.15 }}>
              NMCN CBT Platform
            </h1>
          </div>
          <h2 style={{ margin: '4px 0 6px', color: '#fff', fontWeight: 800, fontSize: 'clamp(1.35rem, 6.4vw, 2.1rem)', lineHeight: 1.2 }}>
            {greet}, {firstName}! <span style={{ display: 'inline-block' }}>👋</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.92)', fontSize: 'clamp(0.85rem, 3.4vw, 1.05rem)', marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>{profile?.subscribed ? '👑' : '🎯'}</span>
            <span>{profile?.subscribed ? 'Premium subscriber — all content unlocked' : 'Free plan — upgrade to unlock everything'}</span>
          </div>

          {/* Rotating featured action (swipe / dots) */}
          <Link
            to={slide.to}
            className="nmcn-slidecard"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
              background: 'rgba(8,40,36,0.55)', border: '1.5px solid rgba(45,212,191,0.4)',
              borderRadius: 16, padding: '14px 14px', marginBottom: 10, boxSizing: 'border-box',
              opacity: slideFade ? 1 : 0, transition: 'opacity .35s ease, transform .15s',
            }}
          >
            <span style={{ fontSize: 44, lineHeight: 1, flexShrink: 0 }}>{slide.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 'clamp(1.05rem, 4.4vw, 1.35rem)', color: '#fff', marginBottom: 3 }}>{slide.label}</div>
              <div style={{ fontSize: 'clamp(0.8rem, 3.2vw, 0.98rem)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {slide.desc}
              </div>
            </div>
            <span style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(45,212,191,0.7)', color: '#fff', fontSize: 20, background: 'rgba(21,128,61,0.25)' }}>→</span>
          </Link>

          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 12 }}>
            {QUICK_ACTIONS.map((a, di) => (
              <button
                key={di}
                aria-label={`Show ${a.label}`}
                onClick={e => { e.stopPropagation(); goToSlide(di); startAuto(); }}
                style={{
                  width: di === slideIdx ? 20 : 6, height: 6, borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0,
                  background: di === slideIdx ? '#2dd4bf' : 'rgba(255,255,255,0.28)',
                  transition: 'width .3s ease, background .3s ease',
                }}
              />
            ))}
          </div>

          {(pausedExams.length > 0 || !profile?.subscribed) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }} onClick={e => e.stopPropagation()}>
              {pausedExams.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setShowModal(true); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: F, background: 'rgba(21,128,61,0.28)', border: '1.5px solid rgba(45,212,191,0.7)', color: '#5EEAD4' }}
                >
                  ▶ Continue
                  <span style={{ background: '#15803D', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 900, padding: '1px 7px' }}>{pausedExams.length}</span>
                </button>
              )}
              {!profile?.subscribed && (
                <Link
                  to="/subscription"
                  onClick={e => e.stopPropagation()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14, fontFamily: F, background: 'rgba(245,158,11,0.18)', border: '1.5px solid rgba(245,158,11,0.7)', color: '#FCD34D', textDecoration: 'none' }}
                >
                  👑 Upgrade
                </Link>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="nmcn-stats" onClick={e => e.stopPropagation()}>
            {statChips.map(c => (
              <Link
                key={c.label}
                to={c.to}
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', minWidth: 0,
                  background: '#14532D', border: '1.5px solid #22C55E',
                  borderRadius: 14, padding: '10px 10px',
                }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: `${c.tint}33`, flexShrink: 0 }}>{c.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 'clamp(1.1rem, 4.6vw, 1.45rem)', color: '#fff', lineHeight: 1.05, fontFamily: H }}>{c.value}</div>
                  <div style={{ fontSize: 'clamp(11px, 3.2vw, 14px)', color: 'rgba(255,255,255,0.8)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ textAlign: 'right', marginTop: 4, fontFamily: "'Segoe Script', 'Brush Script MT', cursive", fontStyle: 'italic', color: '#F5D88A', fontSize: 'clamp(15px, 4.6vw, 21px)', lineHeight: 1.15 }}>
            Study Today<br />Pass Tomorrow
            <div style={{ height: 2, width: '70%', marginLeft: 'auto', marginTop: 3, background: '#F5D88A', borderRadius: 2, opacity: 0.8 }} />
          </div>
        </div>
      </div>

      {/* ── Paused exam inline banner ── */}
      {pausedExams.length > 0 && (
        <ACard delay={300} style={{ marginBottom: 14 }}>
          <div
            onClick={() => setShowModal(true)}
            style={{ ...S.panel, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'rgba(21,128,61,0.18)', border: '1.5px solid rgba(21,128,61,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>▶️</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 2 }}>
                You have {pausedExams.length} paused exam{pausedExams.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pausedExams[0]?.examName || 'Exam'} · tap to resume
              </div>
            </div>
            <span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: 18 }}>→</span>
          </div>
        </ACard>
      )}

      {/* ── Free plan notice ── */}
      {!profile?.subscribed && (
        <ACard delay={330} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(245,158,11,0.07)', border: '1.5px solid rgba(245,158,11,0.35)', borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'rgba(245,158,11,0.15)', border: '1.5px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎯</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#F59E0B', marginBottom: 3 }}>Free Plan — 10 Question Preview</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Try any exam mode below. Each session gives you the same 10 starter questions before you upgrade.
              </div>
            </div>
            <Link to="/subscription" style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 8, background: '#F59E0B', color: '#1a1a1a', fontWeight: 700, fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap', alignSelf: 'center' }}>
              👑 Upgrade
            </Link>
          </div>
        </ACard>
      )}

      {/* ── Exam date ── */}
      <ExamCountdownBanner user={user} profile={profile} />
      <ExamCountdown />

      {/* ── Quick Actions ── */}
      <ACard delay={380} style={{ marginBottom: 22 }}>
        <h3 style={{ ...S.sectionTitle, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: '#F59E0B' }}>⚡</span> Quick Actions
        </h3>
        <SurpriseMeButton profile={profile} user={user} />
        <div className="nmcn-qgrid">
          {QUICK_ACTIONS.map((a, i) => <QuickCard key={a.label} {...a} delay={420 + i * 50} />)}
        </div>
      </ACard>

      {/* ── Daily challenge + tip ── */}
      <DailyChallenge />
      <TipOfDay />

      {/* ── Weak topics ── */}
      <WeakTopicDetector user={user} />

      {/* ── Shortcuts ── */}
      <ACard delay={600} style={{ marginBottom: 12 }}>
        <ShortcutRow icon="🗺️" title="Progress Wall" sub="Heatmap · Subject mastery · Weak spots" to="/progress-wall" />
      </ACard>
      <ACard delay={640} style={{ marginBottom: 12 }}>
        <ShortcutRow icon="🤝" title="Study Buddy Finder" sub="Match with students who complement your weak subjects" to="/study-buddy" />
      </ACard>
      <ACard delay={680} style={{ marginBottom: 22 }}>
        <ShortcutRow icon="🏆" title="Leaderboard" sub="See how you rank against other students" to="/leaderboard" />
      </ACard>

      {/* ── Categories ── */}
      <ACard delay={720} style={{ marginBottom: 24 }}>
        <h3 style={{ ...S.sectionTitle, marginBottom: 12 }}>🏥 Exam Categories</h3>
        <div style={S.categoriesGrid}>
          {NURSING_CATEGORIES.slice(0, 8).map((cat, i) => (
            <CatCard key={cat.id} cat={cat} delay={760 + i * 50} />
          ))}
        </div>
      </ACard>

      {/* ── Recent sessions ── */}
      {recentSessions.length > 0 && (
        <ACard delay={900}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={S.sectionTitle}>🕓 Recent Exams</h3>
            <Link to="/results" style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 700 }}>All results →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Category</th><th>Type</th><th>Score</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                {recentSessions.map((s, i) => {
                  const cat = NURSING_CATEGORIES.find(c => c.id === s.category);
                  return <SessionRow key={s.id} s={s} cat={cat} delay={940 + i * 80} />;
                })}
              </tbody>
            </table>
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

// ── Stat card inner ───────────────────────────────────────────────────────────
function StatInner({ icon, label, value, color, bg, ring }) {
  return (
    <>
      <div className="stat-icon" style={{ background: bg }}><span>{icon}</span></div>
      <div style={{ flex: 1 }}>
        <div className="stat-value" style={{ color }}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
      {ring !== undefined && <ScoreRing percent={ring} color={color} />}
    </>
  );
}

// ── Quick action card ─────────────────────────────────────────────────────────
// ── Exam Date Countdown Banner ───────────────────────────────────────────────
// Reads the student's studyPlan doc for their examDate and shows a countdown.
// Color shifts: green (>60d) → amber (30–60d) → red (<30d) → purple (today).
function ExamCountdownBanner({ user, profile }) {
  const navigate = useNavigate();
  const [examDate, setExamDate] = useState('');
  const [loaded,   setLoaded]   = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    import('firebase/firestore').then(({ getDoc, doc: fd }) => {
      import('../../firebase/config').then(({ db: fdb }) => {
        getDoc(fd(fdb, 'studyPlans', user.uid)).then(snap => {
          if (snap.exists()) setExamDate(snap.data().examDate || '');
          setLoaded(true);
        }).catch(() => setLoaded(true));
      });
    });
  }, [user]);

  if (!loaded) return null;
  // profile.examDate is rendered by the shared <ExamCountdown /> widget
  if (profile?.examDate) return null;

  if (!examDate) {
    return (
      <div
        onClick={() => navigate('/study-plan')}
        role="button"
        style={{ ...S.panel, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 14px', cursor: 'pointer', marginBottom: 20 }}
      >
        <span style={{ fontSize: 44, lineHeight: 1, flexShrink: 0 }}>🗓️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(15px, 4.6vw, 19px)', color: 'var(--text-primary)' }}>Set your NMCN exam date</div>
          <div style={{ fontSize: 'clamp(12px, 3.6vw, 15px)', color: 'var(--text-muted)', marginTop: 3 }}>Personalised countdown &amp; study plan</div>
        </div>
        <span style={{ flexShrink: 0, padding: '10px 18px', borderRadius: 24, background: 'linear-gradient(135deg,#15803D,#0f766e)', color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: '0 3px 12px rgba(21,128,61,0.45)' }}>Set ›</span>
      </div>
    );
  }

  const now   = new Date();
  const target = new Date(examDate);
  const days  = Math.ceil((target - now) / 86400000);

  if (days < -1) return null; // exam passed more than a day ago

  const isToday  = days <= 0;
  const isUrgent = days > 0 && days <= 7;
  const isWarn   = days > 7 && days <= 30;
  const color    = isToday ? '#7C3AED' : isUrgent ? '#EF4444' : isWarn ? '#F59E0B' : '#15803D';
  const bg       = isToday ? 'rgba(124,58,237,0.12)' : isUrgent ? 'rgba(239,68,68,0.1)' : isWarn ? 'rgba(245,158,11,0.1)' : 'rgba(21,128,61,0.08)';
  const label    = isToday ? '🎓 Exam Day!' : isUrgent ? `⚠️ ${days} day${days !== 1 ? 's' : ''} left!` : `📅 ${days} days to NMCN exam`;
  const msg      = isToday ? "You've got this. Everything you've practiced has led to today."
                 : isUrgent ? "Final sprint! Focus on your weak areas and trust your preparation."
                 : days <= 30 ? "Under a month away — now is the time to push hard."
                 : "Stay consistent. Every session brings you closer.";

  return (
    <div
      onClick={() => navigate('/study-plan')}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        borderRadius: 12, background: bg,
        border: `1.5px solid ${color}40`,
        cursor: 'pointer', marginBottom: 20,
        animation: isUrgent ? 'countdownPulse 2s ease infinite' : 'none',
      }}
    >
      <style>{`@keyframes countdownPulse { 0%,100%{box-shadow:0 0 0 0 ${color}30} 50%{box-shadow:0 0 0 6px ${color}00} }`}</style>
      <div style={{
        minWidth: 48, height: 48, borderRadius: 10, flexShrink: 0,
        background: `${color}20`, border: `1px solid ${color}40`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        {!isToday && <span style={{ fontSize: 18, fontWeight: 900, color, fontFamily: H, lineHeight: 1 }}>{days}</span>}
        {!isToday && <span style={{ fontSize: 9, color, fontWeight: 700, fontFamily: F }}>DAYS</span>}
        {isToday  && <span style={{ fontSize: 22 }}>🎓</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: H }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, marginTop: 2 }}>{msg}</div>
      </div>
      <span style={{ color, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>Study Plan →</span>
    </div>
  );
}

// ── Surprise Me Button ───────────────────────────────────────────────────────
// Picks a random pool mode exam (10 questions) weighted toward weak areas.
// Uses examSessions weak topic data from Firestore if available, otherwise
// picks a random NMCN category.
function SurpriseMeButton({ profile, user }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse]     = useState(false);

  // Bounce pulse every 4 seconds to draw attention
  useEffect(() => {
    const t = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const handleSurprise = async () => {
    setLoading(true);
    try {
      // Try to find a weak category from recent sessions
      let pickedCat = null;
      const uid = user?.uid || profile?.uid;
      if (uid) {
        try {
          const { getDocs: gd, collection: col, query: q, where: w } = await import('firebase/firestore');
          const { db: fireDb } = await import('../../firebase/config');
          const snap = await gd(q(col(fireDb, 'examSessions'), w('userId', '==', uid)));
          const sessions = snap.docs.map(d => d.data()).filter(s => s.scorePercent !== undefined);
          if (sessions.length >= 3) {
            const catMap = {};
            sessions.forEach(s => {
              if (!s.category) return;
              if (!catMap[s.category]) catMap[s.category] = { total: 0, sum: 0 };
              catMap[s.category].total++;
              catMap[s.category].sum += s.scorePercent;
            });
            const weakCats = Object.entries(catMap)
              .map(([id, v]) => ({ id, avg: Math.round(v.sum / v.total) }))
              .filter(c => c.avg < 65)
              .sort((a, b) => a.avg - b.avg);
            if (weakCats.length > 0) {
              pickedCat = weakCats[0].id;
            }
          }
        } catch (e) { /* fall through to random */ }
      }

      // Fall back to random category
      if (!pickedCat) {
        const cats = NURSING_CATEGORIES.filter(c => c.id);
        pickedCat = cats[Math.floor(Math.random() * cats.length)].id;
      }

      navigate('/exam/session', {
        state: {
          poolMode:  true,
          examType:  'daily_practice',
          category:  pickedCat,
          count:     10,
          examName:  '⚡ Surprise Practice',
          surpriseMode: true,
        },
      });
    } catch (e) {
      console.error('Surprise Me error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSurprise}
      disabled={loading}
      style={{
        width: '100%', padding: '14px 16px', borderRadius: 18,
        border: '1.5px solid rgba(45,212,191,0.55)',
        background: 'linear-gradient(135deg, #0b5f4f 0%, #0f766e 55%, #0d4a45 100%)',
        color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12,
        boxShadow: '0 4px 20px rgba(21,128,61,0.3)',
        transform: pulse ? 'scale(1.015)' : 'scale(1)',
        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s',
        opacity: loading ? 0.7 : 1, textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 46, lineHeight: 1, flexShrink: 0 }}>{loading ? '⏳' : '🎲'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'clamp(1.1rem, 4.8vw, 1.4rem)', fontWeight: 900, fontFamily: H }}>
          {loading ? 'Finding questions…' : 'Surprise Me!'}
        </div>
        <div style={{ fontSize: 'clamp(0.8rem, 3.3vw, 1rem)', opacity: 0.92, lineHeight: 1.35, marginTop: 2 }}>
          10 smart questions based on your weak areas • No setup needed
        </div>
      </div>
      {!loading && (
        <span style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(255,255,255,0.7)', fontSize: 20 }}>→</span>
      )}
    </button>
  );
}

function QuickCard({ to, icon, label, sub, color, delay }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  const c = color || '#15803D';
  return (
    <Link
      to={to}
      className="nmcn-qcard"
      style={{
        ...S.panel, display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 10px 14px 12px', textDecoration: 'none', color: 'var(--text-primary)',
        minWidth: 0, minHeight: 78, boxSizing: 'border-box',
        opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity .4s ease, transform .2s ease',
      }}
    >
      <span style={{
        width: 46, height: 46, borderRadius: '50%', flexShrink: 0, fontSize: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${c}22`, border: `1.5px solid ${c}55`,
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 'clamp(14px, 4vw, 17px)', lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 'clamp(11.5px, 3.3vw, 13.5px)', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.3 }}>{sub}</div>
      </div>
      <span style={{ fontSize: 22, color: 'var(--text-muted)', flexShrink: 0 }}>›</span>
    </Link>
  );
}

function ShortcutRow({ icon, title, sub, to }) {
  return (
    <Link to={to} style={{ ...S.panel, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textDecoration: 'none', color: 'var(--text-primary)' }}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{ fontSize: 22, color: 'var(--text-muted)' }}>›</span>
    </Link>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────
function CatCard({ cat, delay }) {
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...S.catCard,
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateY(0)' : 'translateY(12px)',
        boxShadow: hov ? `0 4px 16px ${cat.color}22` : 'none',
        borderColor: hov ? `${cat.color}55` : 'var(--border)',
        transition: 'opacity .4s ease, transform .4s ease, box-shadow .2s, border-color .2s',
      }}
    >
      <div style={{ ...S.catIcon, background: `${cat.color}22` }}>{cat.icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{cat.shortLabel}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {cat.examType === 'basic' ? 'Basic RN' : 'Post Basic'}
        </div>
      </div>
    </div>
  );
}

// ── Recent session row ────────────────────────────────────────────────────────
function SessionRow({ s, cat, delay }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <tr style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateX(0)' : 'translateX(-10px)',
      transition: 'opacity .4s ease, transform .4s ease',
    }}>
      <td>{cat?.icon} {cat?.shortLabel || s.category}</td>
      <td><span className="badge badge-teal">{s.examType}</span></td>
      <td>
        <span style={{ fontWeight: 700, color: s.scorePercent >= 70 ? 'var(--green)' : s.scorePercent >= 50 ? 'var(--gold)' : 'var(--red)' }}>
          {s.scorePercent || 0}%
        </span>
      </td>
      <td style={{ fontSize: 12 }}>
        {s.completedAt?.toDate ? new Date(s.completedAt.toDate()).toLocaleDateString() : 'Recently'}
      </td>
      <td>
        <Link to={`/exam/review?resultId=${s.id}&category=${s.category}&examType=${s.examType}`} className="btn btn-ghost btn-sm">
          Review
        </Link>
      </td>
    </tr>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  panel: {
    background: 'var(--bg-card)',
    border: '1.5px solid #BBF7D0',
    borderRadius: 20,
    boxShadow: '0 4px 16px rgba(20,83,45,0.08)',
  },
  banner: {
    background: '#166534',
    border: 'none',
    borderRadius: 28, marginBottom: 14, padding: 'clamp(14px, 4vw, 24px)',
    position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16, marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: '1.1rem',
    color: 'var(--text-primary)', margin: 0,
  },
  quickGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12, marginTop: 14,
  },
  quickCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '20px 16px', background: 'var(--bg-card)',
    border: '1.5px solid var(--border)', borderRadius: 14,
    textDecoration: 'none', color: 'var(--text-primary)',
    textAlign: 'center', cursor: 'pointer',
  },
  categoriesGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12,
  },
  catCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', background: 'var(--bg-card)',
    border: '1.5px solid var(--border)', borderRadius: 12, cursor: 'default',
  },
  catIcon: {
    width: 40, height: 40, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, flexShrink: 0,
  },
};
