// src/components/entrance/EntranceSubjectDrill.jsx
// Subject picker page → navigates to EntranceSubjectSession
//
// ADDED: Year selector — loads available years from Firestore dynamically.
// Subject counts update reactively when the selected year changes.
// "All Years" option is always available as a fallback.

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

const COUNTS     = [10, 20, 30, 40, 50];
const TIME_LIMITS = { 10: 10, 20: 20, 30: 30, 40: 40, 50: 50 };
const ALL_YEARS  = 'All Years';
// Fixed year range 2018 – 2025, newest first
const YEARS = ['2025','2024','2023','2022','2021','2020','2019','2018'];

export default function EntranceSubjectDrill() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedCount,   setSelectedCount]   = useState(20);
  const [selectedYear,    setSelectedYear]     = useState(ALL_YEARS);
  const [loading,         setLoading]          = useState(false);
  const [error,           setError]            = useState('');

  // Raw data from Firestore: array of { subject, year } per question
  const [allDocs,     setAllDocs]     = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Load all questions once (subject + year fields only — lightweight)
  useEffect(() => {
    (async () => {
      setDataLoading(true);
      try {
        const snap = await getDocs(collection(db, 'entranceExamQuestions'));
        const docs = [];
        snap.forEach(d => {
          const { subject, year } = d.data();
          docs.push({ subject: subject || '', year: year ? String(year) : '' });
        });
        setAllDocs(docs);
      } catch (e) {
        console.error('SubjectDrill load error:', e);
      } finally {
        setDataLoading(false);
      }
    })();
  }, []);

  // Compute subject counts based on selected year
  const subjectCounts = (() => {
    const counts = {};
    allDocs.forEach(({ subject, year }) => {
      if (!subject) return;
      if (selectedYear !== ALL_YEARS && year !== selectedYear) return;
      counts[subject] = (counts[subject] || 0) + 1;
    });
    return counts;
  })();

  const totalForYear = Object.values(subjectCounts).reduce((a, b) => a + b, 0);

  // When year changes, reset subject if it has 0 questions in the new year
  useEffect(() => {
    if (selectedSubject && (subjectCounts[selectedSubject.name] || 0) === 0) {
      setSelectedSubject(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  function handleStart() {
    if (!selectedSubject) return;
    setLoading(true);
    navigate('/entrance-exam/subject-session', {
      state: {
        subject:      selectedSubject,
        year:         selectedYear,          // ← passed to session
        count:        selectedCount,
        timeLimitMin: TIME_LIMITS[selectedCount],
      },
    });
  }

  const timeLimitMin   = TIME_LIMITS[selectedCount];
  const availableCount = subjectCounts[selectedSubject?.name] || 0;

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
          <span style={s.heroBadgeNum}>
            {dataLoading ? '…' : totalForYear}
          </span>
          <span style={s.heroBadgeLabel}>
            {selectedYear === ALL_YEARS ? 'Total Questions' : `${selectedYear} Questions`}
          </span>
        </div>
      </div>

      {error && <div style={s.errorBox}>⚠️ {error}</div>}

      {/* ── YEAR SELECTOR ─────────────────────────────────────────────── */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Select Exam Year</div>

        {dataLoading ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ width: 72, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

            {/* All Years pill */}
            <button
              onClick={() => setSelectedYear(ALL_YEARS)}
              style={{
                ...s.yearBtn,
                borderColor: selectedYear === ALL_YEARS ? '#0D9488' : 'rgba(255,255,255,0.09)',
                background:  selectedYear === ALL_YEARS ? 'rgba(13,148,136,0.15)' : 'rgba(255,255,255,0.03)',
                color:       selectedYear === ALL_YEARS ? '#0D9488' : 'rgba(255,255,255,0.55)',
                transform:   selectedYear === ALL_YEARS ? 'scale(1.05)' : 'scale(1)',
                fontWeight:  selectedYear === ALL_YEARS ? 800 : 600,
              }}
            >
              All Years
            </button>

            {/* Static year pills 2018 – 2025 */}
            {YEARS.map(yr => {
              const active  = selectedYear === yr;
              const yrCount = allDocs.filter(d => d.year === yr).length;
              const hasData = yrCount > 0;
              return (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  style={{
                    ...s.yearBtn,
                    borderColor: active ? '#F59E0B' : hasData ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                    background:  active ? 'rgba(245,158,11,0.15)' : hasData ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                    color:       active ? '#F59E0B' : hasData ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
                    transform:   active ? 'scale(1.05)' : 'scale(1)',
                    fontWeight:  active ? 800 : 600,
                    opacity:     hasData || active ? 1 : 0.45,
                  }}
                >
                  {yr}
                  <span style={{
                    display: 'block', fontSize: 9, fontWeight: 700, marginTop: 1,
                    color: active ? '#F59E0B' : hasData ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                  }}>
                    {dataLoading ? '…' : hasData ? `${yrCount}Q` : 'empty'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Year info strip */}
        {selectedYear !== ALL_YEARS && !dataLoading && (
          <div style={s.yearInfo}>
            <span style={{ fontSize: 16 }}>📅</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              Showing questions from <strong style={{ color: '#F59E0B' }}>{selectedYear}</strong> only
              &nbsp;·&nbsp; {totalForYear} question{totalForYear !== 1 ? 's' : ''} available
            </span>
          </div>
        )}
      </div>

      {/* ── SUBJECT GRID ──────────────────────────────────────────────── */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Choose a Subject</div>
        <div style={s.subjectGrid}>
          {SUBJECTS.map(sub => {
            const count  = subjectCounts[sub.name] || 0;
            const active = selectedSubject?.name === sub.name;
            const empty  = count === 0;
            return (
              <button
                key={sub.name}
                onClick={() => { if (!empty) setSelectedSubject(sub); }}
                style={{
                  ...s.subjectBtn,
                  borderColor: active ? sub.color : empty ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)',
                  background:  active ? sub.color + '18' : empty ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)',
                  boxShadow:   active ? `0 0 0 1px ${sub.color}40, 0 4px 20px ${sub.color}18` : 'none',
                  transform:   active ? 'scale(1.03)' : 'scale(1)',
                  cursor:      empty ? 'not-allowed' : 'pointer',
                  opacity:     empty ? 0.5 : 1,
                }}
              >
                {active && (
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sub.color, boxShadow: `0 0 6px ${sub.color}` }} />
                  </div>
                )}
                <span style={{ fontSize: 28 }}>{sub.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, textAlign: 'center', color: active ? sub.color : 'rgba(255,255,255,0.85)' }}>
                  {sub.name}
                </span>
                <span style={{ fontSize: 11, marginTop: 2, color: empty ? 'rgba(239,68,68,0.55)' : 'rgba(255,255,255,0.3)' }}>
                  {empty ? 'Empty' : `${count} question${count !== 1 ? 's' : ''}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── COUNT PICKER ──────────────────────────────────────────────── */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Number of Questions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {COUNTS.map(c => {
            const active  = selectedCount === c;
            const tooMany = selectedSubject && c > availableCount;
            return (
              <button
                key={c}
                onClick={() => setSelectedCount(c)}
                style={{
                  ...s.countBtn,
                  borderColor: active ? '#0D9488' : 'rgba(255,255,255,0.09)',
                  background:  active ? 'rgba(13,148,136,0.15)' : 'rgba(255,255,255,0.03)',
                  color:       active ? '#0D9488' : tooMany ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)',
                  transform:   active ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {c}
              </button>
            );
          })}
          <div style={s.timeHint}>⏱ {timeLimitMin} min</div>
        </div>
        {selectedSubject && availableCount < selectedCount && (
          <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 8 }}>
            ⚠️ Only {availableCount} questions available for {selectedSubject.name}
            {selectedYear !== ALL_YEARS ? ` in ${selectedYear}` : ''} — all will be used.
          </div>
        )}
      </div>

      {/* ── SUMMARY STRIP ─────────────────────────────────────────────── */}
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
              {selectedYear !== ALL_YEARS && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 20 }}>
                  📅 {selectedYear}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
              {Math.min(selectedCount, availableCount)} questions · {timeLimitMin} min · {availableCount} available
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: selectedSubject.color + '20', color: selectedSubject.color }}>
            Ready ✓
          </div>
        </div>
      )}

      {/* ── START BUTTON ──────────────────────────────────────────────── */}
      <button
        onClick={handleStart}
        disabled={!selectedSubject || loading || dataLoading}
        style={{
          ...s.startBtn,
          opacity:    !selectedSubject || loading || dataLoading ? 0.4 : 1,
          cursor:     !selectedSubject ? 'not-allowed' : 'pointer',
          background: selectedSubject
            ? `linear-gradient(135deg, ${selectedSubject.color}, ${selectedSubject.color}bb)`
            : 'linear-gradient(135deg,#0D9488,#1E3A8A)',
        }}
      >
        {loading || dataLoading
          ? '⏳ Loading…'
          : selectedSubject
            ? `🚀 Start ${selectedSubject.name} Drill${selectedYear !== ALL_YEARS ? ` · ${selectedYear}` : ''} · ${Math.min(selectedCount, availableCount)}Q`
            : '👆 Select a subject to begin'}
      </button>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
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
  // Year selector
  yearBtn: {
    minWidth: 68, padding: '8px 14px', borderRadius: 10, border: '1.5px solid',
    cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
    transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  yearInfo: {
    display: 'flex', alignItems: 'center', gap: 8,
    marginTop: 12, padding: '10px 14px', borderRadius: 10,
    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
  },
  // Subject grid
  subjectGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10,
  },
  subjectBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '16px 10px', borderRadius: 14, border: '1.5px solid',
    transition: 'all 0.2s', position: 'relative', fontFamily: 'inherit',
  },
  // Count picker
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
  // Summary
  summaryStrip: {
    display: 'flex', alignItems: 'center', gap: 14,
    border: '1.5px solid', borderRadius: 14, padding: '14px 18px', marginBottom: 20,
  },
  startBtn: {
    width: '100%', padding: '15px 24px',
    border: 'none', color: '#fff', borderRadius: 12,
    fontWeight: 800, fontSize: 15, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s', letterSpacing: 0.3,
  },
};
