// src/components/student/StudentDashboard.jsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, limit,
  getDocs, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

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

// ── Paused Exams Modal (unchanged logic, animated entrance) ───────────────────
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
  resumeBtn: { padding: '7px 14px', borderRadius: 8, cursor: 'pointer', background: 'var(--teal)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap' },
  deleteBtn: { padding: '5px 10px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', fontWeight: 600, fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap' },
};

// ── Quick actions data (single source of truth) ───────────────────────────────
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
    to: '/mock-exams', icon: '📋', label: 'Mock Exams',
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [recentSessions, setRecentSessions] = useState([]);
  const [pausedExams,    setPausedExams]    = useState([]);
  const [showModal,      setShowModal]      = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [bannerVis,   setBannerVis]   = useState(false);
  const [slideIdx,    setSlideIdx]    = useState(0);
  const [slideFade,   setSlideFade]   = useState(true);

  // swipe tracking
  const swipeStartX  = useRef(null);
  const swipeStartY  = useRef(null);
  const isDragging   = useRef(false);

  // ── slide ref keeps auto-advance in sync without stale closures ─────────────
  const slideIdxRef = useRef(0);
  const autoTimer   = useRef(null);

  // ── go to a specific slide with fade ─────────────────────────────────────────
  const goToSlide = useCallback((idx) => {
    const next = ((idx % QUICK_ACTIONS.length) + QUICK_ACTIONS.length) % QUICK_ACTIONS.length;
    setSlideFade(false);
    setTimeout(() => {
      slideIdxRef.current = next;
      setSlideIdx(next);
      setSlideFade(true);
    }, 300);
  }, []);

  // ── start / restart the 4-second auto-advance ────────────────────────────────
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

  // ── Swipe / drag handlers ─────────────────────────────────────────────────────
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
      startAuto(); // restart timer after manual swipe
    }
  };

  useEffect(() => {
    setTimeout(() => setBannerVis(true), 80);
    if (!user) { setLoading(false); return; }
    const loadData = async () => {
      try {
        const sessSnap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
          limit(5),
        ));
        setRecentSessions(sessSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.warn('examSessions load failed (non-fatal):', e.message); }

      try {
        const pausedSnap = await getDocs(query(
          collection(db, 'pausedExams'),
          where('userId', '==', user.uid),
        ));
        const paused = pausedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  const totalExams = profile?.totalExams || 0;
  const totalScore = profile?.totalScore || 0;
  const avgScore   = totalExams > 0 ? Math.round(totalScore / totalExams) : 0;
  const streak     = profile?.streak        || 0;
  const bookmarks  = profile?.bookmarkCount || 0;

  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Animated stat values
  const animExams = useCounter(totalExams, 1600, 400);
  const animStreak = useCounter(streak,    1400, 550);
  const animBookmarks = useCounter(bookmarks, 1400, 700);

  return (
    <div style={{ padding: '24px', maxWidth: 1200 }}>
      <style>{`
        @media (max-width: 520px) {
          .banner-actions { display: none !important; }
        }
      `}</style>

      {/* Paused exams modal */}
      {showModal && (
        <PausedExamsModal
          paused={pausedExams}
          onResume={handleResume}
          onDelete={handleDelete}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── Full-width carousel banner ── */}
      <div
        style={{
          ...S.banner,
          opacity: bannerVis ? 1 : 0,
          transform: bannerVis ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'opacity .6s ease, transform .6s ease',
          padding: 0, overflow: 'hidden', userSelect: 'none',
          minHeight: 200,
        }}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
      >
        {/* Each slide is the FULL banner */}
        {QUICK_ACTIONS.map((action, i) => (
          <div
            key={action.label}
            style={{
              position: i === slideIdx ? 'relative' : 'absolute',
              inset: 0,
              width: '100%',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              padding: 'clamp(18px, 4vw, 28px) clamp(16px, 4vw, 32px)',
              opacity: i === slideIdx ? (slideFade ? 1 : 0) : 0,
              pointerEvents: i === slideIdx ? 'auto' : 'none',
              transition: 'opacity .38s ease',
              background: `linear-gradient(135deg, #1E3A8A 0%, ${action.color}bb 100%)`,
              borderRadius: 20,
              boxSizing: 'border-box',
            }}
          >
            {/* Glow overlay */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 20,
              background: `radial-gradient(ellipse at 75% 50%, ${action.color}33 0%, transparent 65%)`,
            }} />

            {/* LEFT — greeting + action info */}
            <div style={{ position: 'relative', zIndex: 1, flex: '1 1 260px', minWidth: 0 }}>
              {/* Platform label */}
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                🏥 NMCN CBT Platform
              </div>

              {/* Greeting */}
              <h2 style={{ color: '#fff', fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1rem,4vw,1.5rem)', margin: 0, lineHeight: 1.3 }}>
                {greet}, {(profile?.name || user?.displayName || 'Student').split(' ')[0]}! 👋
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '4px 0 14px', lineHeight: 1.4 }}>
                {profile?.subscribed
                  ? '🌟 Premium subscriber — all content unlocked'
                  : '🎯 Free plan — upgrade to unlock all past questions'}
              </p>

              {/* Feature pill */}
              <Link
                to={action.to}
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(10px)',
                  border: `1.5px solid ${action.color}66`,
                  borderLeft: `4px solid ${action.color}`,
                  borderRadius: 12, padding: '10px 14px',
                  textDecoration: 'none', width: '100%', boxSizing: 'border-box',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `${action.color}2a`,
                  border: `1.5px solid ${action.color}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                }}>
                  {action.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', marginBottom: 2 }}>
                    {action.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {action.desc}
                  </div>
                </div>
                <div style={{ color: action.color, fontWeight: 900, fontSize: 16, flexShrink: 0 }}>→</div>
              </Link>

              {/* Dot indicators */}
              <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
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
            </div>

            {/* RIGHT — action buttons (hidden on small screens via flex shrink) */}
            <div className="banner-actions" style={{
              ...S.bannerActions,
              position: 'relative', zIndex: 1,
              flexShrink: 0, flexDirection: 'column', alignItems: 'stretch',
            }}>
              <Link to="/quick-actions" className="btn btn-gold btn-sm" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>⚡ Start Exam</Link>
              {pausedExams.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setShowModal(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(13,148,136,0.25)',
                    border: '1.5px solid rgba(13,148,136,0.6)',
                    color: '#5EEAD4',
                    fontWeight: 700, fontSize: 12, fontFamily: 'inherit', transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ▶ Continue
                  <span style={{ background: 'var(--teal)', color: '#fff', borderRadius: 20, fontSize: 10, fontWeight: 900, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>
                    {pausedExams.length}
                  </span>
                </button>
              )}
              {!profile?.subscribed && (
                <Link to="/subscription" className="btn btn-outline btn-sm" onClick={e => e.stopPropagation()} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  Upgrade
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Stats row ── */}
      <div style={S.statsGrid}>
        {[
          { icon: '📝', label: 'Exams Taken', value: animExams,    raw: totalExams,  color: '#0D9488', bg: 'rgba(13,148,136,0.12)', to: null,          delay: 200 },
          { icon: '📊', label: 'Avg. Score',  value: `${avgScore}%`, raw: null,      color: '#2563EB', bg: 'rgba(37,99,235,0.12)',  to: null,          delay: 320, ring: avgScore },
          { icon: '🔥', label: 'Day Streak',  value: animStreak,  raw: streak,       color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', to: null,          delay: 440 },
          { icon: '🔖', label: 'Bookmarked',  value: animBookmarks, raw: bookmarks,  color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', to: '/bookmarks',  delay: 560 },
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
              transition: 'background .2s',
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

      {/* ── Quick actions ── */}
      <ACard delay={750} style={{ marginBottom: 32 }}>
        <h3 style={{ ...S.sectionTitle, marginBottom: 14 }}>⚡ Quick Actions</h3>
        <div style={S.quickGrid}>
          {QUICK_ACTIONS.map((a, i) => <QuickCard key={a.label} {...a} delay={800 + i * 70} />)}
        </div>
      </ACard>

      {/* ── Categories ── */}
      <ACard delay={1100} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={S.sectionTitle}>🏥 Exam Categories</h3>
        </div>
        <div style={S.categoriesGrid}>
          {NURSING_CATEGORIES.slice(0, 8).map((cat, i) => (
            <CatCard key={cat.id} cat={cat} delay={1150 + i * 60} />
          ))}
        </div>
      </ACard>

      {/* ── Recent sessions ── */}
      {recentSessions.length > 0 && (
        <ACard delay={1400}>
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
                  return (
                    <SessionRow key={s.id} s={s} cat={cat} delay={1450 + i * 80} />
                  );
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
        <span style={{
          fontWeight: 700,
          color: s.scorePercent >= 70 ? 'var(--green)' : s.scorePercent >= 50 ? 'var(--gold)' : 'var(--red)',
        }}>
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
  bannerGlow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse at 70% 50%, rgba(245,158,11,0.15) 0%, transparent 60%)',
  },
  bannerActions: {
    display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16, marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: '1.1rem',
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
