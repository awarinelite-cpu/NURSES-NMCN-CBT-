// src/components/entrance/EntranceExamHub.jsx
// Route: /entrance-exam
//
// Fonts  : h1/h2 titles → Arial Black | all other text → Times New Roman Bold
// Colors : CSS variables throughout → works in light AND dark mode
// Routes : all feature cards verified against App.jsx routes

import { useState, useEffect } from 'react';
import { useNavigate, Link }   from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
  limit, getCountFromServer, deleteDoc, doc,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ── Animated wrapper ──────────────────────────────────────────────────────── */
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

/* ── Animated counter ──────────────────────────────────────────────────────── */
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

/* ── Feature Card ──────────────────────────────────────────────────────────── */
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
      {/* Left accent bar */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, borderRadius: '4px 0 0 4px' }} />

      <div style={{ paddingLeft: 10 }}>
        {/* Icon */}
        <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>

        {/* Label — Times New Roman Bold, large */}
        <div style={{
          fontWeight: 700, fontSize: 16,
          color: 'var(--text-primary)',
          fontFamily: F, marginBottom: 4,
          lineHeight: 1.3,
        }}>
          {label}
        </div>

        {/* Sub — Times New Roman Bold, muted */}
        <div style={{
          fontSize: 13, fontWeight: 700,
          color: 'var(--text-muted)',
          fontFamily: F,
        }}>
          {sub}
        </div>
      </div>

      {/* Arrow */}
      <div style={{
        position: 'absolute', right: 14, bottom: 14,
        color, fontWeight: 900, fontSize: 20,
        opacity: hov ? 1 : 0.3, transition: 'opacity .2s',
      }}>→</div>
    </Link>
  );
}

/* ── Continue Card ─────────────────────────────────────────────────────────── */
function ContinueCard({ exam, onContinue, onDiscard }) {
  const pct  = exam.answeredCount && exam.totalQuestions
    ? Math.round((exam.answeredCount / exam.totalQuestions) * 100) : 0;
  const date = exam.savedAt?.toDate
    ? exam.savedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })
    : 'Recently';
  return (
    <div style={{
      background: 'rgba(255,255,255,0.12)',
      backdropFilter: 'blur(8px)',
      border: '1.5px solid rgba(255,255,255,0.25)',
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📋</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 2, fontFamily: F }}>
          {exam.examName || 'Daily Mock Exam'}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontFamily: F, fontWeight: 700 }}>
          {exam.answeredCount || 0}/{exam.totalQuestions || '?'} answered · {date}
        </div>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#F59E0B', borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={onContinue} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#F59E0B', color: '#000', fontFamily: F, fontWeight: 800, fontSize: 14 }}>
          ▶ Continue
        </button>
        <button onClick={onDiscard} style={{ padding: '9px 12px', borderRadius: 10, cursor: 'pointer', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#EF4444', fontFamily: F, fontWeight: 700, fontSize: 13 }}>
          ✕
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
export default function EntranceExamHub() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats,          setStats]          = useState({ schools: 0, questions: 0 });
  const [completedExams, setCompletedExams] = useState([]);
  const [pausedExams,    setPausedExams]    = useState([]);
  const [avgScore,       setAvgScore]       = useState(0);
  const [bannerVis,      setBannerVis]      = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [loadError,      setLoadError]      = useState('');

  const animSchools   = useCounter(stats.schools,   1200, 300);
  const animQuestions = useCounter(stats.questions, 1400, 400);

  useEffect(() => {
    setTimeout(() => setBannerVis(true), 60);
    if (!user) { setLoading(false); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    setLoading(true);
    setLoadError('');

    try {
      const [sc, qc] = await Promise.all([
        getCountFromServer(collection(db, 'entranceExamSchools')),
        getCountFromServer(collection(db, 'entranceExamQuestions')),
      ]);
      setStats({ schools: sc.data().count, questions: qc.data().count });
    } catch (e) { console.error('Stats count error:', e.code, e.message); }

    try {
      let snap;
      try {
        snap = await getDocs(query(
          collection(db, 'entranceExamSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
          limit(20),
        ));
      } catch {
        snap = await getDocs(query(
          collection(db, 'entranceExamSessions'),
          where('userId', '==', user.uid),
          limit(20),
        ));
      }
      let sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      sessions.sort((a, b) => {
        const ta = a.completedAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.completedAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
      const avg = sessions.length
        ? Math.round(sessions.reduce((s, a) => s + (a.scorePercent || 0), 0) / sessions.length) : 0;
      setCompletedExams(sessions.slice(0, 5));
      setAvgScore(avg);
    } catch (e) {
      console.error('Sessions load error:', e.code, e.message);
      setLoadError(`Could not load your exams (${e.code || e.message})`);
    }

    try {
      const pausedSnap = await getDocs(query(
        collection(db, 'entrancePausedExams'),
        where('userId', '==', user.uid),
      ));
      const paused = pausedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      paused.sort((a, b) => {
        const ta = a.savedAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.savedAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
      setPausedExams(paused);
    } catch (e) { console.error('Paused exams load error:', e.code, e.message); }

    setLoading(false);
  };

  const handleContinue = (exam) => {
    navigate('/entrance-exam/session', {
      state: {
        resumeMode:   true,
        pausedExamId: exam.id,
        examType:     exam.examType || 'entrance_daily_mock',
        examName:     exam.examName || 'Entrance Exam — Daily Mock',
        resumeData: {
          questionIds:  exam.questionIds,
          answers:      exam.answers,
          flagged:      exam.flagged,
          currentIndex: exam.currentIndex || 0,
        },
      },
    });
  };

  const handleDiscard = async (exam) => {
    if (!window.confirm('Discard this paused exam?')) return;
    try {
      await deleteDoc(doc(db, 'entrancePausedExams', exam.id));
      setPausedExams(prev => prev.filter(e => e.id !== exam.id));
    } catch (e) { console.error('Discard error:', e); }
  };

  // ── Feature cards — routes verified against App.jsx ──────────────────────
  const FEATURE_CARDS = [
    { icon: '🗓️', label: 'Daily Mock Exam',      sub: "Today's mock is ready!",                              color: '#F59E0B', to: '/entrance-exam/daily-mock',   delay: 350 },
    { icon: '🏫', label: 'School Past Questions', sub: `${animSchools || '…'} schools available`,             color: '#0D9488', to: '/entrance-exam/schools',       delay: 420 },
    { icon: '📚', label: 'Subject Drill',          sub: 'Topic-by-topic practice',                             color: '#2563EB', to: '/entrance-exam/subject-drill', delay: 490 },
    { icon: '📋', label: 'Exams Taken',            sub: `${completedExams.length} recent session${completedExams.length !== 1 ? 's' : ''}`, color: '#7C3AED', to: '/entrance-exam/exams-taken', delay: 560 },
    { icon: '🔖', label: 'Bookmarks',              sub: 'Your saved questions',                                color: '#A855F7', to: '/entrance-exam/bookmarks',     delay: 630 },
    { icon: '📊', label: 'My Results',             sub: avgScore > 0 ? `Avg score: ${avgScore}%` : 'No exams yet', color: '#16A34A', to: '/entrance-exam/my-results', delay: 700 },
    { icon: '📈', label: 'Analysis',               sub: 'See your weak areas',                                 color: '#0891B2', to: '/entrance-exam/analysis',      delay: 770 },
    { icon: '🏆', label: 'Leaderboard',            sub: 'See top students',                                    color: '#EF4444', to: '/entrance-exam/leaderboard',   delay: 840 },
  ];

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, fontFamily: F, color: 'var(--text-primary)' }}>

      {/* Back */}
      <button
        onClick={() => navigate('/dashboard')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--teal)', fontWeight: 700, fontSize: 15,
          padding: 0, marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: F,
        }}
      >
        ← Back to Dashboard
      </button>

      {/* Load error */}
      {loadError && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          fontSize: 14, color: '#EF4444', fontWeight: 700, fontFamily: F,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          ⚠️ {loadError}
          <button onClick={load} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: F }}>Retry</button>
        </div>
      )}

      {/* ── Welcome Banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F2A5E 0%, #065F46 100%)',
        borderRadius: 20, marginBottom: 32, overflow: 'hidden', position: 'relative',
        opacity: bannerVis ? 1 : 0,
        transform: bannerVis ? 'translateY(0)' : 'translateY(-16px)',
        transition: 'opacity .6s ease, transform .6s ease',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 75% 50%, rgba(13,148,136,0.35) 0%, transparent 60%)' }} />

        <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px,4vw,36px)' }}>

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, fontFamily: F }}>
            🏥 NMCN CBT Platform
          </div>

          {/* Banner heading → Arial Black */}
          <h2 style={{
            fontFamily: H, fontWeight: 900,
            fontSize: 'clamp(1.5rem, 4vw, 2.4rem)',
            color: '#FFFFFF', margin: '0 0 10px', lineHeight: 1.2,
          }}>
            🏫 Nursing Schools Entrance Exam
          </h2>

          {/* Banner sub → Times New Roman Bold */}
          <p style={{
            fontFamily: F, fontWeight: 700, fontSize: 15,
            color: 'rgba(255,255,255,0.82)', margin: '0 0 24px', lineHeight: 1.6,
          }}>
            Past Questions &amp; Daily Mock — Practice Smart. Pass First. Enter Your Dream School.
          </p>

          {/* Stat pills */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: pausedExams.length > 0 ? 24 : 0 }}>
            {[
              { label: 'Schools',    value: loading ? '…' : animSchools,           icon: '🏫' },
              { label: 'Questions',  value: loading ? '…' : animQuestions,         icon: '❓' },
              { label: 'Your Exams', value: loading ? '…' : completedExams.length, icon: '📝' },
              ...(avgScore > 0 ? [{ label: 'Avg Score', value: `${avgScore}%`, icon: '📊' }] : []),
            ].map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(255,255,255,0.14)',
                backdropFilter: 'blur(6px)',
                border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: 12, padding: '10px 16px',
              }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: '#fff', lineHeight: 1, fontFamily: H }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, marginTop: 2, fontFamily: F }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Continue cards */}
          {pausedExams.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', fontFamily: F }}>▶ Continue Exam</div>
                <div style={{ background: '#F59E0B', color: '#000', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 800, fontFamily: F }}>{pausedExams.length}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pausedExams.map(exam => (
                  <ContinueCard key={exam.id} exam={exam} onContinue={() => handleContinue(exam)} onDiscard={() => handleDiscard(exam)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Feature Cards ── */}
      <ACard delay={280} style={{ marginBottom: 32 }}>
        {/* Section heading → Arial Black */}
        <h2 style={{
          fontFamily: H, fontWeight: 900,
          fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          color: 'var(--text-primary)', margin: '0 0 16px',
        }}>
          ⚡ What do you want to do?
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {FEATURE_CARDS.map(card => <FeatureCard key={card.label} {...card} />)}
        </div>
      </ACard>

      {/* ── Recommendation ── */}
      <ACard delay={900} style={{ marginBottom: 24 }}>
        <div style={{
          background: 'var(--teal-glow)',
          border: '1.5px solid rgba(13,148,136,0.25)',
          borderRadius: 14, padding: '18px 22px',
        }}>
          {/* Subheading → Arial Black */}
          <h3 style={{
            fontFamily: H, fontWeight: 900,
            fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
            color: 'var(--text-primary)', margin: '0 0 12px',
          }}>
            💡 Recommended For You
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              avgScore < 70 && avgScore > 0
                ? `Your average is ${avgScore}% — try Subject Drill to boost weak areas`
                : avgScore >= 70
                  ? `You're averaging ${avgScore}% — great! Try a harder school's questions`
                  : "Start with any school's past questions to get your first score",
              "Don't forget today's Daily Mock Exam",
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: F, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--teal)', fontWeight: 900, flexShrink: 0 }}>→</span>
                {tip}
              </div>
            ))}
          </div>
        </div>
      </ACard>

      {/* ── Recent Exams ── */}
      {completedExams.length > 0 && (
        <ACard delay={1000} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{
              fontFamily: H, fontWeight: 900,
              fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
              color: 'var(--text-primary)', margin: 0,
            }}>
              🕓 Recent Exams
            </h3>
            <Link to="/entrance-exam/my-results" style={{ color: 'var(--teal)', fontSize: 14, fontWeight: 700, fontFamily: F }}>
              All results →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {completedExams.map(s => {
              const pct    = s.scorePercent ?? Math.round(((s.correct || 0) / (s.totalQuestions || 1)) * 100);
              const passed = pct >= 50;
              const date   = s.completedAt?.toDate
                ? s.completedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Recently';
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderLeft: `5px solid ${passed ? '#16A34A' : '#EF4444'}`,
                  borderRadius: 12, padding: '12px 16px',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', fontFamily: F }}>
                      {s.examName || 'Entrance Exam'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F, marginTop: 2 }}>
                      {date} · {s.correct ?? '?'}/{s.totalQuestions ?? '?'} correct
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: passed ? '#16A34A' : '#EF4444', fontFamily: H }}>
                    {pct}%
                  </div>
                </div>
              );
            })}
          </div>
        </ACard>
      )}

      {/* ── Empty state ── */}
      {!loading && completedExams.length === 0 && pausedExams.length === 0 && (
        <ACard delay={900}>
          <div style={{
            textAlign: 'center', padding: '40px 28px',
            background: 'var(--bg-card)',
            border: '2px solid var(--border)', borderRadius: 18,
          }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>🏫</div>
            <h3 style={{
              fontFamily: H, fontWeight: 900,
              fontSize: 'clamp(1.3rem, 3vw, 2rem)',
              color: 'var(--text-primary)', margin: '0 0 10px',
            }}>
              Start Your Entrance Exam Prep
            </h3>
            <p style={{
              fontFamily: F, fontWeight: 700, fontSize: 15,
              color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.7,
            }}>
              Browse nursing schools and start practising with real past questions.
            </p>
            <Link
              to="/entrance-exam/schools"
              className="btn btn-primary"
              style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 15, fontFamily: F, fontWeight: 700 }}
            >
              🏫 Browse Schools
            </Link>
          </div>
        </ACard>
      )}

    </div>
  );
}
