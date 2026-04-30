// src/components/entrance/EntranceExamHub.jsx
// Route: /entrance-exam

import { useState, useEffect } from 'react';
import { useNavigate, Link }   from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
  limit, getCountFromServer, deleteDoc, doc,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

/* ── Animation helpers ───────────────────────────────────────────────────── */
function ACard({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity .5s ease, transform .5s ease', ...s }}>
      {children}
    </div>
  );
}

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
        display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 16px',
        background: hov ? `${color}14` : 'var(--bg-card)',
        border: `1.5px solid ${hov ? color + '55' : 'var(--border)'}`,
        borderRadius: 14, textDecoration: 'none', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        opacity: vis ? 1 : 0,
        transform: vis ? (hov ? 'translateY(-3px)' : 'translateY(0)') : 'translateY(14px)',
        boxShadow: hov ? `0 6px 20px ${color}22` : 'none',
        transition: 'opacity .45s ease, transform .3s ease, background .2s, border-color .2s, box-shadow .2s',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color, borderRadius: '4px 0 0 4px' }} />
      <div style={{ paddingLeft: 8 }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <div style={{ position: 'absolute', right: 12, bottom: 12, color, fontWeight: 900, fontSize: 18, opacity: hov ? 1 : 0.3, transition: 'opacity .2s' }}>→</div>
    </Link>
  );
}

function ContinueCard({ exam, onContinue, onDiscard }) {
  const pct  = exam.answeredCount && exam.totalQuestions
    ? Math.round((exam.answeredCount / exam.totalQuestions) * 100) : 0;
  const date = exam.savedAt?.toDate
    ? exam.savedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })
    : 'Recently';
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📋</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 2 }}>{exam.examName || 'Daily Mock Exam'}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>{exam.answeredCount || 0}/{exam.totalQuestions || '?'} answered · {date}</div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#F59E0B', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={onContinue} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#F59E0B', color: '#000', fontFamily: 'inherit', fontWeight: 800, fontSize: 13 }}>▶ Continue</button>
        <button onClick={onDiscard} style={{ padding: '8px 10px', borderRadius: 10, cursor: 'pointer', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', fontFamily: 'inherit', fontWeight: 700, fontSize: 12 }}>✕</button>
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

    // ── 1. Schools + questions count ──────────────────────────────────────────
    try {
      const [sc, qc] = await Promise.all([
        getCountFromServer(collection(db, 'entranceExamSchools')),
        getCountFromServer(collection(db, 'entranceExamQuestions')),
      ]);
      setStats({ schools: sc.data().count, questions: qc.data().count });
    } catch (e) {
      console.error('Stats count error:', e.code, e.message);
    }

    // ── 2. Completed sessions ─────────────────────────────────────────────────
    // Try with orderBy first (requires composite index). If that fails (missing
    // index), fall back to a simple where-only query and sort client-side.
    try {
      let snap;
      try {
        snap = await getDocs(query(
          collection(db, 'entranceExamSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
          limit(20),
        ));
      } catch (indexErr) {
        console.warn('orderBy failed (missing index?), trying without orderBy:', indexErr.code);
        snap = await getDocs(query(
          collection(db, 'entranceExamSessions'),
          where('userId', '==', user.uid),
          limit(20),
        ));
      }

      let sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Sort client-side (works even if orderBy index is missing)
      sessions.sort((a, b) => {
        const ta = a.completedAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.completedAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });

      const avg = sessions.length
        ? Math.round(sessions.reduce((s, a) => s + (a.scorePercent || 0), 0) / sessions.length)
        : 0;

      setCompletedExams(sessions.slice(0, 5));
      setAvgScore(avg);
      console.log(`Loaded ${sessions.length} completed sessions, avg ${avg}%`);
    } catch (e) {
      console.error('Sessions load error:', e.code, e.message);
      setLoadError(`Could not load your exams (${e.code || e.message})`);
    }

    // ── 3. Paused exams ───────────────────────────────────────────────────────
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
      console.log(`Loaded ${paused.length} paused exams`);
    } catch (e) {
      console.error('Paused exams load error:', e.code, e.message);
    }

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

  const FEATURE_CARDS = [
    { icon: '🗓️', label: 'Daily Mock Exam',      sub: "Today's mock is ready!",                           color: '#F59E0B', to: '/entrance-exam/daily-mock',   delay: 350 },
    { icon: '🏫', label: 'School Past Questions', sub: `${animSchools || '…'} schools`,                    color: '#0D9488', to: '/entrance-exam/schools',       delay: 420 },
    { icon: '📚', label: 'Subject Drill',          sub: 'Topic-by-topic practice',                          color: '#2563EB', to: '/entrance-exam/subject-drill', delay: 490 },
    { icon: '📋', label: 'Exams Taken',            sub: `${completedExams.length} recent`,                  color: '#7C3AED', to: '/entrance-exam/my-results',    delay: 560 },
    { icon: '🔖', label: 'Bookmarks',              sub: 'Saved questions',                                  color: '#A855F7', to: '/entrance-exam/bookmarks',     delay: 630 },
    { icon: '📊', label: 'My Results',             sub: avgScore > 0 ? `Avg: ${avgScore}%` : 'No exams yet', color: '#16A34A', to: '/entrance-exam/my-results',  delay: 700 },
    { icon: '📈', label: 'Analysis',               sub: 'See weak areas',                                   color: '#0891B2', to: '/entrance-exam/analysis',       delay: 770 },
    { icon: '🏆', label: 'Leaderboard',            sub: 'Top students',                                     color: '#EF4444', to: '/entrance-exam/leaderboard',    delay: 840 },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1100 }}>

      <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        ← Back to Dashboard
      </button>

      {/* load error banner */}
      {loadError && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#EF4444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          ⚠️ {loadError}
          <button onClick={load} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Retry</button>
        </div>
      )}

      {/* ── Welcome Banner ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F2A4A 0%, #065F46 100%)',
        borderRadius: 20, marginBottom: 28, overflow: 'hidden', position: 'relative',
        opacity: bannerVis ? 1 : 0, transform: bannerVis ? 'translateY(0)' : 'translateY(-16px)',
        transition: 'opacity .6s ease, transform .6s ease',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 75% 50%, rgba(13,148,136,0.3) 0%, transparent 60%)' }} />

        <div style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px,4vw,32px)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
            🏥 NMCN CBT Platform
          </div>
          <h2 style={{ color: '#fff', fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.1rem,4vw,1.7rem)', margin: '0 0 6px', lineHeight: 1.3 }}>
            🏫 Nursing Schools Entrance Exam
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
            Past Questions &amp; Daily Mock — Practice Smart. Pass First. Enter Your Dream School.
          </p>

          {/* Stat pills */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: pausedExams.length > 0 ? 20 : 0 }}>
            {[
              { label: 'Schools',    value: loading ? '…' : animSchools,           icon: '🏫' },
              { label: 'Questions',  value: loading ? '…' : animQuestions,         icon: '❓' },
              { label: 'Your Exams', value: loading ? '…' : completedExams.length, icon: '📝' },
              ...(avgScore > 0 ? [{ label: 'Avg Score', value: `${avgScore}%`, icon: '📊' }] : []),
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 14px' }}>
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Continue cards */}
          {pausedExams.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>▶ Continue Exam</div>
                <div style={{ background: 'rgba(245,158,11,0.9)', color: '#000', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 800 }}>{pausedExams.length}</div>
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

      {/* ── Feature cards ────────────────────────────────────────────────────── */}
      <ACard delay={280} style={{ marginBottom: 28 }}>
        <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: '1rem', color: 'var(--text-primary)', margin: '0 0 14px' }}>⚡ What do you want to do?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {FEATURE_CARDS.map(card => <FeatureCard key={card.label} {...card} />)}
        </div>
      </ACard>

      {/* ── Recommendation ───────────────────────────────────────────────────── */}
      <ACard delay={900} style={{ marginBottom: 20 }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.08), rgba(37,99,235,0.06))', border: '1.5px solid rgba(13,148,136,0.2)', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>💡 Recommended For You</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
              <span style={{ color: '#0D9488' }}>→</span>
              {avgScore < 70 && avgScore > 0
                ? `Your average is ${avgScore}% — try Subject Drill to boost weak areas`
                : avgScore >= 70
                  ? `You're averaging ${avgScore}% — great! Try a harder school's questions`
                  : "Start with any school's past questions to get your first score"}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
              <span style={{ color: '#0D9488' }}>→</span>
              Don't forget today's Daily Mock Exam
            </div>
          </div>
        </div>
      </ACard>

      {/* ── Recent completed sessions ─────────────────────────────────────────── */}
      {completedExams.length > 0 && (
        <ACard delay={1000}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: '1rem', color: 'var(--text-primary)', margin: 0 }}>🕓 Recent Exams</h3>
            <Link to="/entrance-exam/my-results" style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 700 }}>All results →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completedExams.map(s => {
              const pct    = s.scorePercent ?? Math.round(((s.correct || 0) / (s.totalQuestions || 1)) * 100);
              const passed = pct >= 50;
              const date   = s.completedAt?.toDate
                ? s.completedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Recently';
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `4px solid ${passed ? '#16A34A' : '#EF4444'}`, borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{s.examName || 'Entrance Exam'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {date} · {s.correct ?? '?'}/{s.totalQuestions ?? '?'} correct
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: passed ? '#16A34A' : '#EF4444' }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </ACard>
      )}

      {/* Empty state */}
      {!loading && completedExams.length === 0 && pausedExams.length === 0 && (
        <ACard delay={900}>
          <div style={{ textAlign: 'center', padding: '32px 24px', background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16 }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🏫</div>
            <h3 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 8px', color: 'var(--text-primary)' }}>Start Your Entrance Exam Prep</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px' }}>Browse nursing schools and start practicing with real past questions.</p>
            <Link to="/entrance-exam/schools" className="btn btn-primary" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>🏫 Browse Schools</Link>
          </div>
        </ACard>
      )}
    </div>
  );
}
