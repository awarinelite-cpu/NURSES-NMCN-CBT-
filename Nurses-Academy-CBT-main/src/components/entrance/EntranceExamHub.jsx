// src/components/entrance/EntranceExamHub.jsx
// ─────────────────────────────────────────────────────────────────
//  FIXED:
//  1. Stats (Schools / Questions / Your Exams) now load correctly
//     — waits for auth, queries 'entranceExamQuestions' collection
//  2. All 8 cards use correct registered routes
//  3. "... schools" replaced with live loaded count
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';

export default function EntranceExamHub() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [schools, setSchools]       = useState(null); // null = loading
  const [questions, setQuestions]   = useState(null);
  const [examsTaken, setExamsTaken] = useState(null);

  // ── Load global stats (schools + question count) ──────────────
  useEffect(() => {
    if (!user) return; // wait for auth to resolve first

    let cancelled = false;

    async function loadStats() {
      try {
        // ✅ CORRECT collection name — must match what admin uploads to
        const snap = await getDocs(collection(db, 'entranceExamQuestions'));
        if (cancelled) return;

        const schoolSet = new Set();
        let qCount = 0;

        snap.forEach(doc => {
          qCount++;
          const school = doc.data().school;
          if (school) schoolSet.add(school);
        });

        setSchools(schoolSet.size);
        setQuestions(qCount);
      } catch (err) {
        console.error('EntranceExamHub: failed to load stats', err);
        setSchools(0);
        setQuestions(0);
      }
    }

    loadStats();
    return () => { cancelled = true; };
  }, [user]); // re-runs once user resolves from null → object

  // ── Load user's own exam count ────────────────────────────────
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadUserStats() {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'entranceDailyMock'),
            orderBy('date', 'desc'),
            limit(100)
          )
        );
        if (!cancelled) setExamsTaken(snap.size);
      } catch {
        if (!cancelled) setExamsTaken(0);
      }
    }

    loadUserStats();
    return () => { cancelled = true; };
  }, [user]);

  // ── Card definitions ─────────────────────────────────────────
  const CARDS = [
    {
      icon: '📅',
      emoji: '📅',
      title: 'Daily Mock Exam',
      subtitle: "Today's mock is ready!",
      path: '/entrance-exam/daily-mock',
      color: '#F59E0B',
    },
    {
      icon: '🏫',
      title: 'School Past Questions',
      subtitle: schools === null ? 'Loading…' : `${schools} school${schools !== 1 ? 's' : ''}`,
      path: '/entrance-exam/schools',
      color: '#0D9488',
    },
    {
      icon: '📚',
      title: 'Subject Drill',
      subtitle: 'Topic-by-topic practice',
      path: '/entrance-exam/subject-drill',
      color: '#8B5CF6',
    },
    {
      icon: '📋',
      title: 'Exams Taken',
      subtitle: examsTaken === null ? 'Loading…' : `${examsTaken} exam${examsTaken !== 1 ? 's' : ''}`,
      path: '/entrance-exam/exams-taken',
      color: '#1E3A8A',
    },
    {
      icon: '🔖',
      title: 'Bookmarks',
      subtitle: 'Saved questions',
      path: '/entrance-exam/bookmarks',
      color: '#EC4899',
    },
    {
      icon: '📊',
      title: 'My Results',
      subtitle: examsTaken === null ? 'Loading…' : examsTaken === 0 ? 'No exams yet' : `${examsTaken} attempt${examsTaken !== 1 ? 's' : ''}`,
      path: '/entrance-exam/my-results',
      color: '#10B981',
    },
    {
      icon: '📈',
      title: 'Analysis',
      subtitle: 'See weak areas',
      path: '/entrance-exam/analysis',
      color: '#06B6D4',
    },
    {
      icon: '🏆',
      title: 'Leaderboard',
      subtitle: 'Top students',
      path: '/entrance-exam/leaderboard',
      color: '#F59E0B',
    },
  ];

  return (
    <div style={styles.wrap}>
      {/* ── Hero banner ─────────────────────────────────────── */}
      <div style={styles.hero}>
        <div style={styles.heroLabel}>🏫 NMCN CBT PLATFORM</div>
        <h1 style={styles.heroTitle}>🏫 Nursing Schools Entrance Exam</h1>
        <p style={styles.heroSub}>
          Past Questions &amp; Daily Mock — Practice Smart. Pass First. Enter Your Dream School.
        </p>

        {/* Stat chips */}
        <div style={styles.statRow}>
          <StatChip icon="🏫" value={schools} label="Schools" />
          <StatChip icon="❓" value={questions} label="Questions" />
          <StatChip icon="📄" value={examsTaken} label="Your Exams" />
        </div>
      </div>

      {/* ── Cards grid ──────────────────────────────────────── */}
      <div style={styles.sectionHead}>
        <span style={styles.bolt}>⚡</span>
        <span style={styles.sectionTitle}>What do you want to do?</span>
      </div>

      <div style={styles.grid}>
        {CARDS.map(card => (
          <button
            key={card.path}
            style={{ ...styles.card, borderLeftColor: card.color }}
            onClick={() => navigate(card.path)}
          >
            <div style={styles.cardIcon}>{card.icon}</div>
            <div style={styles.cardBody}>
              <div style={styles.cardTitle}>{card.title}</div>
              <div style={{ ...styles.cardSub, color: card.color }}>{card.subtitle}</div>
            </div>
            <span style={styles.arrow}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Stat chip ────────────────────────────────────────────────────
function StatChip({ icon, value, label }) {
  return (
    <div style={styles.chip}>
      <span style={styles.chipIcon}>{icon}</span>
      <div>
        <div style={styles.chipValue}>
          {value === null ? (
            <span style={styles.chipLoading}>…</span>
          ) : (
            value.toLocaleString()
          )}
        </div>
        <div style={styles.chipLabel}>{label}</div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────
const styles = {
  wrap: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '24px 16px 48px',
    fontFamily: "'Inter', sans-serif",
    color: '#fff',
  },
  hero: {
    background: 'linear-gradient(135deg, #0f4c3a 0%, #0d3b5c 100%)',
    borderRadius: 20,
    padding: '32px 28px',
    marginBottom: 32,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 28,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  heroSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    margin: '0 0 24px',
    lineHeight: 1.5,
  },
  statRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: '10px 16px',
    minWidth: 110,
  },
  chipIcon: { fontSize: 22 },
  chipValue: {
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1,
    color: '#fff',
  },
  chipLoading: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: 400,
  },
  chipLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  bolt: { fontSize: 20 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 14,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderLeft: '4px solid',
    borderRadius: 14,
    padding: '18px 16px',
    cursor: 'pointer',
    textAlign: 'left',
    color: '#fff',
    transition: 'background 0.15s, transform 0.1s',
    fontFamily: "'Inter', sans-serif",
  },
  cardIcon: { fontSize: 28, flexShrink: 0 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: 700, marginBottom: 3 },
  cardSub: { fontSize: 13, fontWeight: 500 },
  arrow: { color: 'rgba(255,255,255,0.25)', fontSize: 16, flexShrink: 0 },
};
