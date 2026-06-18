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
import { ensureCbtDailyMockNotification, maybePushDailyMockNotification } from '../../utils/dailyNotifications';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

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
function ScoreRing({ percent, color = '#0D9488', size = 72 }) {
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
        background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)',
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
    case 'mock_exam':      return '📋 Mock Exam';
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
  tag: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(13,148,136,0.12)', color: 'var(--teal)' },
  resumeBtn: { padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: 'var(--teal)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, fontFamily: F, whiteSpace: 'nowrap' },
  deleteBtn: { padding: '5px 10px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', fontWeight: 600, fontSize: 11, fontFamily: F, whiteSpace: 'nowrap' },
};

// ── Quick actions data ────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    to: '/daily-practice', icon: '⚡', label: 'Daily Practice',
    sub: 'Take daily exam',
    desc: 'Get a fresh set of random questions every day. Builds your exam stamina and keeps your knowledge sharp across all nursing topics.',
    color: '#F59E0B',
  },
  {
    to: '/course-drill', icon: '📖', label: 'Course Drill',
    sub: 'Take exam by courses',
    desc: 'Pick any nursing course and drill questions specifically from that course. Perfect for targeted revision before a test.',
    color: '#0D9488',
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
            style={{ ...btnBase, background: 'rgba(13,148,136,0.25)', border: '1.5px solid rgba(13,148,136,0.65)', color: '#5EEAD4' }}
          >
            ▶ Continue
            <span style={{ background: '#0D9488', color: '#fff', borderRadius: 20, fontSize: 10, fontWeight: 900, padding: '1px 7px', lineHeight: '16px' }}>
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

    // Make sure today's "Daily Practice" notification exists (idempotent)
    ensureCbtDailyMockNotification();
    // Fire browser push once per day (no-op if permission not granted or already sent today)
    maybePushDailyMockNotification();

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

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <style>{`
        .btn-strip-track::-webkit-scrollbar { display: none; }
        .btn-strip-track { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {showModal && (
        <PausedExamsModal
          paused={pausedExams}
          onResume={handleResume}
          onDelete={handleDelete}
          onClose={() => setShowModal(false)}
        />
      )}

      {showStartModal && (
        <StartExamModal onClose={() => setShowStartModal(false)} />
      )}

      {/* ── Full-width carousel banner ── */}
      <div
        style={{
          ...S.banner,
          opacity: bannerVis ? 1 : 0,
          transform: bannerVis ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'opacity .6s ease, transform .6s ease',
          padding: 0, userSelect: 'none',
          display: 'flex', flexDirection: 'column',
        }}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
      >
        <div style={{ position: 'relative' }}>
          {QUICK_ACTIONS.map((action, i) => (
            <div
              key={action.label}
              style={{
                display: i === slideIdx ? 'flex' : 'none',
                alignItems: 'flex-start', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 12, width: '100%',
                padding: 'clamp(18px, 4vw, 28px) clamp(16px, 4vw, 32px)',
                opacity: slideFade ? 1 : 0,
                transition: 'opacity .38s ease',
                background: `linear-gradient(135deg, #1E3A8A 0%, ${action.color}bb 100%)`,
                borderRadius: 20, boxSizing: 'border-box',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 20, background: `radial-gradient(ellipse at 75% 50%, ${action.color}33 0%, transparent 65%)` }} />

              <div style={{ position: 'relative', zIndex: 1, flex: '1 1 260px', minWidth: 0 }}>
                <h1 style={{ fontSize: 'clamp(1rem,5vw,1.4rem)', color: 'rgba(255,255,255,0.9)', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  🏥 NMCN CBT Platform
                </h1>
                <h1 style={{ color: '#fff', fontFamily: "'Arial Black', Arial, sans-serif", fontSize: 'clamp(1.4rem,6vw,2.4rem)', margin: '0 0 8px', lineHeight: 1.2 }}>
                  {greet}, {(profile?.name || user?.displayName || 'Student').split(' ')[0]}! 👋
                </h1>
                <h2 style={{ color: 'rgba(255,255,255,0.88)', fontSize: 'clamp(0.85rem,3vw,1.1rem)', fontWeight: 500, margin: '0 0 16px', lineHeight: 1.4 }}>
                  {profile?.subscribed
                    ? '🌟 Premium subscriber — all content unlocked'
                    : '🎯 Free plan — upgrade to unlock all past questions'}
                </h2>
                <Link
                  to={action.to}
                  onClick={e => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    textDecoration: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                >
                  <div style={{ fontSize: 32, flexShrink: 0 }}>
                    {action.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontWeight: 800, fontSize: 'clamp(1rem,3.5vw,1.3rem)', color: '#fff', margin: '0 0 3px' }}>{action.label}</h2>
                    <h2 style={{ fontSize: 'clamp(0.78rem,2.5vw,1rem)', fontWeight: 400, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {action.desc}
                    </h2>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 900, fontSize: 22, flexShrink: 0 }}>→</div>
                </Link>

                <div style={{ display: 'flex', gap: 5, marginTop: 10, marginBottom: 14 }}>
                  {QUICK_ACTIONS.map((a, di) => (
                    <button
                      key={di}
                      onClick={e => { e.stopPropagation(); goToSlide(di); startAuto(); }}
                      style={{
                        width: di === slideIdx ? 20 : 6, height: 6,
                        borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0,
                        background: di === slideIdx ? action.color : 'rgba(255,255,255,0.28)',
                        transition: 'width .3s ease, background .3s ease',
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={e => { e.stopPropagation(); setShowStartModal(true); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '12px 26px', borderRadius: 10, cursor: 'pointer',
                      fontWeight: 700, fontSize: 15, fontFamily: F,
                      background: '#F59E0B', color: '#1a1a1a', border: 'none',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    ⚡ Start Exam
                  </button>

                  {pausedExams.length > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); setShowModal(true); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '12px 26px', borderRadius: 10, cursor: 'pointer',
                        fontWeight: 700, fontSize: 15, fontFamily: F,
                        background: 'rgba(13,148,136,0.25)', border: '1.5px solid rgba(13,148,136,0.65)', color: '#5EEAD4',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      ▶ Continue
                      <span style={{ background: '#0D9488', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 900, padding: '1px 7px' }}>
                        {pausedExams.length}
                      </span>
                    </button>
                  )}

                  {!profile?.subscribed && (
                    <Link
                      to="/subscription"
                      onClick={e => e.stopPropagation()}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '12px 26px', borderRadius: 10, cursor: 'pointer',
                        fontWeight: 700, fontSize: 15, fontFamily: F,
                        background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.4)', color: '#fff',
                        whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none',
                      }}
                    >
                      👑 Upgrade
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={S.statsGrid}>
        {[
          { icon: '📝', label: 'Exams Taken', value: animExams,      raw: totalExams, color: '#0D9488', bg: 'rgba(13,148,136,0.12)', to: null,         delay: 200 },
          { icon: '📊', label: 'Avg. Score',  value: `${avgScore}%`, raw: null,       color: '#2563EB', bg: 'rgba(37,99,235,0.12)',  to: null,         delay: 320, ring: avgScore },
          { icon: '🔥', label: 'Day Streak',  value: animStreak,     raw: streak,     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', to: null,         delay: 440 },
          { icon: '🔖', label: 'Bookmarked',  value: animBookmarks,  raw: bookmarks,  color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', to: '/bookmarks', delay: 560 },
        ].map(s => (
          <ACard key={s.label} delay={s.delay}>
            {s.to ? (
              <Link to={s.to} className="stat-card" style={{ textDecoration: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <StatInner {...s} />
              </Link>
            ) : (
              <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <StatInner {...s} />
              </div>
            )}
          </ACard>
        ))}
      </div>

      {/* ── Paused inline banner ── */}
      {pausedExams.length > 0 && (
        <ACard delay={700} style={{ marginBottom: 24 }}>
          <div
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.3)',
              borderRadius: 14, padding: '14px 18px', cursor: 'pointer',
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'rgba(13,148,136,0.15)', border: '1.5px solid rgba(13,148,136,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>▶️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                You have {pausedExams.length} paused exam{pausedExams.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {pausedExams[0]?.examName || 'Exam'} · click to resume
              </div>
            </div>
            <span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: 16 }}>→</span>
          </div>
        </ACard>
      )}

      {/* ── Free plan notice for unpaid users ── */}
      {!profile?.subscribed && (
        <ACard delay={730} style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            background: 'rgba(245,158,11,0.07)',
            border: '1.5px solid rgba(245,158,11,0.35)',
            borderRadius: 14, padding: '14px 18px',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'rgba(245,158,11,0.15)', border: '1.5px solid rgba(245,158,11,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>🎯</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#F59E0B', marginBottom: 3 }}>
                Free Plan — 10 Question Preview
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                You can try any exam mode below. Each session gives you the same 10 starter questions
                so you can experience the platform before upgrading.
              </div>
            </div>
            <Link
              to="/subscription"
              style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 8,
                background: '#F59E0B', color: '#1a1a1a',
                fontWeight: 700, fontSize: 12, textDecoration: 'none',
                whiteSpace: 'nowrap', alignSelf: 'center',
              }}
            >
              👑 Upgrade
            </Link>
          </div>
        </ACard>
      )}

      {/* ── Quick actions ── */}
      <ACard delay={750} style={{ marginBottom: 32 }}>
        <h3 style={{ ...S.sectionTitle, marginBottom: 14 }}>⚡ Quick Actions</h3>
        <div style={S.quickGrid}>
          {QUICK_ACTIONS.map((a, i) => <QuickCard key={a.label} {...a} delay={800 + i * 70} />)}
        </div>
      </ACard>

      {/* ── Weak Topic Detector ── */}
      <WeakTopicDetector user={user} />

      {/* ── Categories ── */}
      <ACard delay={1000} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={S.sectionTitle}>🏥 Exam Categories</h3>
        </div>
        <div style={S.categoriesGrid}>
          {NURSING_CATEGORIES.slice(0, 8).map((cat, i) => (
            <CatCard key={cat.id} cat={cat} delay={1050 + i * 60} />
          ))}
        </div>
      </ACard>

      {/* ── Recent sessions ── */}
      {recentSessions.length > 0 && (
        <ACard delay={1300}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
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
                  return <SessionRow key={s.id} s={s} cat={cat} delay={1350 + i * 80} />;
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
function QuickCard({ to, icon, label, sub, delay }) {
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...S.quickCard,
        opacity: vis ? 1 : 0,
        transform: vis ? (hov ? 'translateY(-4px)' : 'translateY(0)') : 'translateY(14px)',
        boxShadow: hov ? '0 8px 24px rgba(13,148,136,0.15)' : 'none',
        borderColor: hov ? 'var(--teal)' : 'var(--border)',
        transition: 'opacity .4s ease, transform .3s ease, box-shadow .25s, border-color .25s',
      }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, lineHeight: 1.3 }}>{sub}</span>
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
  banner: {
    background: 'linear-gradient(135deg, #1E3A8A 0%, #0D9488 100%)',
    borderRadius: 20, marginBottom: 28,
    position: 'relative', overflow: 'hidden',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16, marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: "'Arial Black', Arial, sans-serif", fontSize: '1.1rem',
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
