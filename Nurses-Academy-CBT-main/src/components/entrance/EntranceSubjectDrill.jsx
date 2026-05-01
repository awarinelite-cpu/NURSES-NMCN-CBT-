// src/components/entrance/EntranceSubjectDrill.jsx
// Subject picker page → navigates to EntranceSubjectSession

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';

const SUBJECTS = [
  { name: 'English Language', icon: '🔤', color: '#3B82F6' },
  { name: 'Biology',          icon: '🧬', color: '#10B981' },
  { name: 'Chemistry',        icon: '⚗️', color: '#8B5CF6' },
  { name: 'Physics',          icon: '⚡', color: '#F59E0B' },
  { name: 'Mathematics',      icon: '➗', color: '#EF4444' },
  { name: 'General Studies',  icon: '📖', color: '#06B6D4' },
  { name: 'Nursing Aptitude', icon: '🏥', color: '#EC4899' },
  { name: 'Current Affairs',  icon: '🌍', color: '#F97316' },
];

const COUNTS = [10, 20, 30, 40, 50];

// Time limits in minutes per question count
const TIME_LIMITS = { 10: 10, 20: 20, 30: 30, 40: 40, 50: 50 };

export default function EntranceSubjectDrill() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedCount,   setSelectedCount]   = useState(20);
  const [subjectCounts,   setSubjectCounts]   = useState({});
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');

  // Load question counts per subject
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'entranceExamQuestions'));
        const counts = {};
        snap.forEach(d => {
          const s = d.data().subject;
          if (s) counts[s] = (counts[s] || 0) + 1;
        });
        setSubjectCounts(counts);
      } catch (e) { /* silent */ }
    })();
  }, []);

  async function handleStart() {
    if (!selectedSubject) return;
    setLoading(true);
    setError('');
    navigate('/entrance-exam/subject-session', {
      state: {
        subject:      selectedSubject,
        count:        selectedCount,
        timeLimitMin: TIME_LIMITS[selectedCount],
      },
    });
  }

  const timeLimitMin = TIME_LIMITS[selectedCount];

  return (
    <div style={s.page}>
      {/* Back */}
      <button onClick={() => navigate('/entrance-exam')} style={s.back}>
        ← Back to Hub
      </button>

      {/* Header */}
      <div style={s.hero}>
        <div style={s.heroLeft}>
          <div style={s.heroIcon}>📚</div>
          <div>
            <h1 style={s.heroTitle}>Subject Drill</h1>
            <p style={s.heroSub}>Focus on one subject. Drill until you're confident.</p>
          </div>
        </div>
        <div style={s.heroBadge}>
          <span style={s.heroBadgeNum}>{Object.values(subjectCounts).reduce((a, b) => a + b, 0)}</span>
          <span style={s.heroBadgeLabel}>Total Questions</span>
        </div>
      </div>

      {error && <div style={s.errorBox}>⚠️ {error}</div>}

      {/* Subject grid */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Choose a Subject</div>
        <div style={s.subjectGrid}>
          {SUBJECTS.map(sub => {
            const count  = subjectCounts[sub.name] || 0;
            const active = selectedSubject?.name === sub.name;
            return (
              <button
                key={sub.name}
                onClick={() => setSelectedSubject(sub)}
                style={{
                  ...s.subjectBtn,
                  borderColor:  active ? sub.color : 'rgba(255,255,255,0.07)',
                  background:   active ? sub.color + '18' : 'rgba(255,255,255,0.03)',
                  boxShadow:    active ? `0 0 0 1px ${sub.color}40, 0 4px 20px ${sub.color}18` : 'none',
                  transform:    active ? 'scale(1.03)' : 'scale(1)',
                }}
              >
                {/* Active indicator */}
                {active && (
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sub.color, boxShadow: `0 0 6px ${sub.color}` }} />
                  </div>
                )}

                <span style={{ fontSize: 30 }}>{sub.icon}</span>
                <span style={{
                  fontWeight: 700, fontSize: 13, lineHeight: 1.3, textAlign: 'center',
                  color: active ? sub.color : 'rgba(255,255,255,0.85)',
                }}>
                  {sub.name}
                </span>
                <span style={{
                  fontSize: 11, marginTop: 2,
                  color: count === 0 ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.3)',
                }}>
                  {count > 0 ? `${count} questions` : 'Empty'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Count picker */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Number of Questions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {COUNTS.map(c => {
            const active = selectedCount === c;
            return (
              <button
                key={c}
                onClick={() => setSelectedCount(c)}
                style={{
                  ...s.countBtn,
                  borderColor: active ? '#0D9488' : 'rgba(255,255,255,0.09)',
                  background:  active ? 'rgba(13,148,136,0.15)' : 'rgba(255,255,255,0.03)',
                  color:       active ? '#0D9488' : 'rgba(255,255,255,0.55)',
                  transform:   active ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {c}
              </button>
            );
          })}
          {/* Time hint */}
          <div style={s.timeHint}>
            ⏱ {timeLimitMin} min
          </div>
        </div>
      </div>

      {/* Summary strip (only when subject selected) */}
      {selectedSubject && (
        <div style={{
          ...s.summaryStrip,
          borderColor: selectedSubject.color + '40',
          background:  selectedSubject.color + '0C',
        }}>
          <span style={{ fontSize: 20 }}>{selectedSubject.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: selectedSubject.color }}>
              {selectedSubject.name}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {selectedCount} questions · {timeLimitMin} minutes · {subjectCounts[selectedSubject.name] || 0} available
            </div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: selectedSubject.color + '20', color: selectedSubject.color,
          }}>
            Ready
          </div>
        </div>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={!selectedSubject || loading}
        style={{
          ...s.startBtn,
          opacity: !selectedSubject || loading ? 0.4 : 1,
          cursor:  !selectedSubject ? 'not-allowed' : 'pointer',
          background: selectedSubject
            ? `linear-gradient(135deg, ${selectedSubject.color}, ${selectedSubject.color}99)`
            : 'linear-gradient(135deg,#0D9488,#1E3A8A)',
        }}
      >
        {loading
          ? '⏳ Loading…'
          : selectedSubject
            ? `🚀 Start ${selectedSubject.name} Drill · ${selectedCount}Q`
            : '👆 Select a subject to begin'}
      </button>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────
const s = {
  page: {
    maxWidth: 760, margin: '0 auto', padding: '20px 16px 56px',
    color: '#fff', fontFamily: "'Inter', sans-serif",
  },
  back: {
    background: 'none', border: 'none', color: '#0D9488',
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
    padding: '0 0 20px', display: 'block',
  },
  hero: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 28, gap: 16, flexWrap: 'wrap',
  },
  heroLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  heroIcon: { fontSize: 44 },
  heroTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: 26,
    fontWeight: 700, margin: '0 0 4px', color: '#fff',
  },
  heroSub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: 0 },
  heroBadge: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.25)',
    borderRadius: 14, padding: '10px 20px',
  },
  heroBadgeNum:   { fontSize: 22, fontWeight: 900, color: '#0D9488', lineHeight: 1 },
  heroBadgeLabel: { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: 0.5 },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10, padding: '12px 16px', color: '#EF4444',
    fontSize: 14, marginBottom: 20,
  },
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12,
  },
  subjectGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10,
  },
  subjectBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '16px 10px', borderRadius: 14, border: '1.5px solid',
    cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
    fontFamily: 'inherit',
  },
  countBtn: {
    width: 60, height: 44, borderRadius: 10, border: '1.5px solid',
    cursor: 'pointer', fontWeight: 800, fontSize: 15,
    fontFamily: 'inherit', transition: 'all 0.15s',
  },
  timeHint: {
    fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    padding: '6px 12px', borderRadius: 8,
  },
  summaryStrip: {
    display: 'flex', alignItems: 'center', gap: 14,
    border: '1.5px solid', borderRadius: 14,
    padding: '14px 18px', marginBottom: 20,
  },
  startBtn: {
    width: '100%', padding: '15px 24px',
    border: 'none', color: '#fff', borderRadius: 12,
    fontWeight: 800, fontSize: 15, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s',
    letterSpacing: 0.3,
  },
};
