// src/components/entrance/EntranceExamHub.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, query, where, orderBy, limit, getCountFromServer, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

// ── Animated counter ────────────────────────────────────────────
function useCountUp(target, duration = 1000) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      setVal(Math.round(p * p * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

function StatPill({ icon, value, label, loading }) {
  const displayed = useCountUp(loading ? 0 : value);
  return (
    <div style={{
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 14,
      padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 12,
      backdropFilter: 'blur(8px)',
      minWidth: 120,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <div>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 24, fontWeight: 900, color: '#fff',
          lineHeight: 1,
        }}>
          {loading ? '—' : displayed}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ── Hub card ────────────────────────────────────────────────────
function HubCard({ icon, title, subtitle, path, accent, badge, disabled }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => !disabled && navigate(path)}
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: `1.5px solid ${disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 16,
        padding: '22px 20px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        opacity: disabled ? 0.45 : 1,
      }}
      onMouseEnter={e => {
        if (disabled) return;
        e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
        e.currentTarget.style.borderColor = accent + '55';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 32px ${accent}22`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.035)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: '20%', bottom: '20%',
        width: 3, borderRadius: '0 3px 3px 0',
        background: disabled ? 'rgba(255,255,255,0.1)' : accent,
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 30, marginBottom: 10, lineHeight: 1 }}>{icon}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{subtitle}</div>
        </div>
        {badge && (
          <span style={{
            background: accent + '22',
            border: `1px solid ${accent}44`,
            color: accent,
            fontSize: 10, fontWeight: 800,
            padding: '3px 8px', borderRadius: 20,
            textTransform: 'uppercase', letterSpacing: 0.5,
            flexShrink: 0,
          }}>{badge}</span>
        )}
      </div>

      {/* Arrow */}
      {!disabled && (
        <div style={{
          position: 'absolute', right: 16, bottom: 16,
          color: 'rgba(255,255,255,0.2)', fontSize: 16,
          transition: 'all 0.2s',
        }}>→</div>
      )}
    </div>
  );
}

export default function EntranceExamHub() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Stats
  const [statsLoading, setStatsLoading] = useState(true);
  const [totalSchools,    setTotalSchools]    = useState(0);
  const [totalQuestions,  setTotalQuestions]  = useState(0);
  const [yourExams,       setYourExams]       = useState(0);
  const [todayDone,       setTodayDone]       = useState(false);
  const [lastScore,       setLastScore]       = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadStats() {
      try {
        // Total questions in entrance bank
        const qCount = await getCountFromServer(collection(db, 'entranceExamQuestions'));
        // Active schools
        const schoolSnap = await getDocs(
          query(collection(db, 'entranceExamSchools'), where('isActive', '!=', false))
        );
        // User's daily mock attempts
        const attSnap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'entranceDailyMock'),
            orderBy('date', 'desc'),
            limit(1)
          )
        );

        if (cancelled) return;

        setTotalQuestions(qCount.data().count);
        setTotalSchools(schoolSnap.size);
        setYourExams(attSnap.size > 0 ? attSnap.size : 0); // most recent only here; extend if needed

        // Get full count of attempts
        const allAttSnap = await getDocs(
          collection(db, 'users', user.uid, 'entranceDailyMock')
        );
        if (!cancelled) setYourExams(allAttSnap.size);

        // Check if today's mock is done
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        const todaySnap = await getDoc(doc(db, 'users', user.uid, 'entranceDailyMock', todayKey));
        if (!cancelled) {
          if (todaySnap.exists()) {
            setTodayDone(true);
            setLastScore(todaySnap.data().score);
          }
        }
      } catch (e) {
        console.error('EntranceExamHub stats:', e);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    loadStats();
    return () => { cancelled = true; };
  }, [user]);

  const cards = [
    {
      icon: '📅',
      title: 'Daily Mock Exam',
      subtitle: todayDone
        ? `Today done · ${lastScore}% · New mock tomorrow`
        : "Today's mock is ready!",
      path: '/entrance-exam/daily-mock',
      accent: '#F59E0B',
      badge: todayDone ? 'Done' : 'New',
    },
    {
      icon: '🏫',
      title: 'School Past Questions',
      subtitle: statsLoading ? '…' : `${totalSchools} school${totalSchools !== 1 ? 's' : ''}`,
      path: '/entrance-exam/schools',
      accent: '#0D9488',
    },
    {
      icon: '📚',
      title: 'Subject Drill',
      subtitle: 'Topic-by-topic practice',
      path: '/entrance-exam/subject-drill',
      accent: '#8B5CF6',
    },
    {
      icon: '📋',
      title: 'Exams Taken',
      subtitle: yourExams > 0 ? `${yourExams} attempt${yourExams !== 1 ? 's' : ''} total` : '0 this session',
      path: '/entrance-exam/exams-taken',
      accent: '#1E40AF',
    },
    {
      icon: '🔖',
      title: 'Bookmarks',
      subtitle: 'Saved questions',
      path: '/entrance-exam/bookmarks',
      accent: '#EC4899',
    },
    {
      icon: '📊',
      title: 'My Results',
      subtitle: yourExams > 0 ? `${yourExams} exam${yourExams !== 1 ? 's' : ''} recorded` : 'No exams yet',
      path: '/entrance-exam/my-results',
      accent: '#10B981',
    },
    {
      icon: '📈',
      title: 'Analysis',
      subtitle: 'See weak areas',
      path: '/entrance-exam/analysis',
      accent: '#06B6D4',
    },
    {
      icon: '🏆',
      title: 'Leaderboard',
      subtitle: 'Top students',
      path: '/entrance-exam/leaderboard',
      accent: '#F59E0B',
    },
  ];

  // Recommendations
  const recommendations = [];
  if (!todayDone) recommendations.push({ icon: '📅', text: "Don't forget today's Daily Mock Exam" });
  if (totalSchools > 0) recommendations.push({ icon: '🏫', text: "Start with any school's past questions to get your first score" });
  if (yourExams > 0 && !todayDone) recommendations.push({ icon: '📈', text: 'Check your Analysis to find weak subjects' });
  if (recommendations.length === 0) {
    recommendations.push({ icon: '✅', text: "You've completed today's mock — check your Analysis for insights" });
    recommendations.push({ icon: '🏫', text: "Practise a school's past questions to reinforce weak areas" });
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary, #020B18)',
      color: '#fff',
      fontFamily: "'Inter', sans-serif",
      paddingBottom: 48,
    }}>
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #0F2A4A 0%, #065F46 60%, #0D9488 100%)',
        padding: '32px 28px 36px',
        position: 'relative',
        overflow: 'hidden',
        marginBottom: 0,
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 70% 50%, rgba(13,148,136,0.3) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            🏥 NMCN CBT PLATFORM
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(22px, 4vw, 32px)',
            fontWeight: 900,
            color: '#fff',
            margin: '0 0 6px',
            lineHeight: 1.2,
          }}>
            🏫 Nursing Schools Entrance Exam
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 24px', fontSize: 14, lineHeight: 1.5 }}>
            Past Questions &amp; Daily Mock — Practice Smart. Pass First. Enter Your Dream School.
          </p>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatPill icon="🏫" value={totalSchools}   label="Schools"    loading={statsLoading} />
            <StatPill icon="❓" value={totalQuestions} label="Questions"  loading={statsLoading} />
            <StatPill icon="📝" value={yourExams}      label="Your Exams" loading={statsLoading} />
          </div>
        </div>
      </div>

      {/* Today's mock status banner (if done) */}
      {todayDone && (
        <div style={{
          background: 'rgba(16,185,129,0.1)',
          borderBottom: '1px solid rgba(16,185,129,0.2)',
          padding: '12px 28px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontSize: 14, color: '#10B981', fontWeight: 700 }}>
            Today's Daily Mock complete — Score: {lastScore}%
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
            · New mock at midnight
          </span>
        </div>
      )}

      <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Section label */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <span style={{
            fontWeight: 800, fontSize: 17, color: '#fff',
            fontFamily: "'Playfair Display', serif",
          }}>What do you want to do?</span>
        </div>

        {/* Cards grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 32,
        }}>
          {cards.map(card => (
            <HubCard key={card.path} {...card} />
          ))}
        </div>

        {/* Recommended section */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16,
          padding: '20px 22px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Recommended For You</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recommendations.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  color: '#0D9488', fontSize: 14, fontWeight: 700,
                  flexShrink: 0, marginTop: 1,
                }}>→</span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                  {r.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
