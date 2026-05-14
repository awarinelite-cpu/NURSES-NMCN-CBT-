// src/components/entrance/EntranceSubjectDrill.jsx
// Subject picker page → navigates to EntranceSubjectSession
//
// CHANGES:
//  - Added paused drills section with Continue / Discard cards
//  - Reads entrancePausedExams where examType == 'entrance_subject_drill'
//  - Fonts: Arial Black headings | Times New Roman Bold body

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, query, where, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

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

const COUNTS      = [10, 20, 30, 40, 50];
const TIME_LIMITS = { 10: 10, 20: 20, 30: 30, 40: 40, 50: 50 };
const ALL_YEARS   = 'All Years';
const YEARS       = ['2025','2024','2023','2022','2021','2020','2019','2018'];

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtTime(s) {
  if (!s) return '—';
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

// ── Continue Card ─────────────────────────────────────────────────────────────
function PausedDrillCard({ exam, onContinue, onDiscard }) {
  const color    = exam.subjectColor || '#0D9488';
  const icon     = exam.subjectIcon  || '📚';
  const pct      = exam.answeredCount && exam.totalQuestions
    ? Math.round((exam.answeredCount / exam.totalQuestions) * 100) : 0;
  const date     = exam.savedAt?.toDate
    ? exam.savedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })
    : 'Recently';
  const timeLeft = exam.timeLeft;

  return (
    <div style={{
      background: `${color}0E`,
      border: `2px solid ${color}44`,
      borderRadius: 14, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      {/* Icon */}
      <div style={{
        width: 46, height: 46, borderRadius: 12, flexShrink: 0,
        background: color + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>{icon}</div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2, fontFamily: F }}>
          {exam.subject || 'Subject Drill'}
          {exam.year && exam.year !== 'All Years' && (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#F59E0B', fontWeight: 700, fontFamily: F }}>
              📅 {exam.year}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontFamily: F, fontWeight: 700 }}>
          {exam.answeredCount || 0}/{exam.totalQuestions || '?'} answered
          {timeLeft != null && ` · ⏱ ${fmtTime(timeLeft)} left`}
          {' · '}{date}
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onContinue}
          style={{
            padding: '9px 18px', borderRadius: 10, border: 'none',
            cursor: 'pointer', background: color, color: '#fff',
            fontFamily: F, fontWeight: 800, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ▶ Continue
        </button>
        <button
          onClick={onDiscard}
          style={{
            padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
            color: '#EF4444', fontFamily: F, fontWeight: 700, fontSize: 13,
          }}
        >✕</button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EntranceSubjectDrill() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedCount,   setSelectedCount]   = useState(20);
  const [selectedYear,    setSelectedYear]     = useState(ALL_YEARS);
  const [loading,         setLoading]          = useState(false);
  const [error,           setError]            = useState('');
  const [allDocs,         setAllDocs]          = useState([]);
  const [dataLoading,     setDataLoading]      = useState(true);

  // paused drills
  const [pausedDrills,    setPausedDrills]    = useState([]);
  const [pausedLoading,   setPausedLoading]   = useState(true);

  // ── Load question counts ─────────────────────────────────────────────────
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

  // ── Load paused drills ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) { setPausedLoading(false); return; }
    (async () => {
      setPausedLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'entrancePausedExams'),
          where('userId',   '==', user.uid),
          where('examType', '==', 'entrance_subject_drill'),
        ));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) =>
          (b.savedAt?.toMillis?.() || 0) - (a.savedAt?.toMillis?.() || 0)
        );
        setPausedDrills(list);
      } catch (e) {
        console.error('Paused drills load error:', e);
      } finally {
        setPausedLoading(false);
      }
    })();
  }, [user]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleContinue = (exam) => {
    // find the subject object by name for color/icon
    const subjectObj = SUBJECTS.find(s => s.name === exam.subject) || {
      name:  exam.subject  || 'Subject Drill',
      icon:  exam.subjectIcon  || '📚',
      color: exam.subjectColor || '#0D9488',
    };
    navigate('/entrance-exam/subject-session', {
      state: {
        subject:      subjectObj,
        year:         exam.year || 'All Years',
        count:        exam.totalQuestions || 20,
        timeLimitMin: exam.timeLimitMin || 0,
        resumeMode:   true,
        pausedExamId: exam.id,
        resumeData: {
          questionIds:  exam.questionIds,
          answers:      exam.answers,
          flagged:      exam.flagged,
          currentIndex: exam.currentIndex || 0,
          timeLeft:     exam.timeLeft,
        },
      },
    });
  };

  const handleDiscard = async (exam) => {
    if (!window.confirm(`Discard this paused ${exam.subject} drill?`)) return;
    try {
      await deleteDoc(doc(db, 'entrancePausedExams', exam.id));
      setPausedDrills(prev => prev.filter(e => e.id !== exam.id));
    } catch (e) { console.error('Discard error:', e); }
  };

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
        year:         selectedYear,
        count:        selectedCount,
        timeLimitMin: TIME_LIMITS[selectedCount],
      },
    });
  }

  const timeLimitMin   = TIME_LIMITS[selectedCount];
  const availableCount = subjectCounts[selectedSubject?.name] || 0;

  return (
    <div style={{
      maxWidth: 760, margin: '0 auto', padding: '20px 16px 56px',
      fontFamily: F, color: 'var(--text-primary)',
    }}>

      {/* Back */}
      <button
        onClick={() => navigate('/entrance-exam')}
        style={{
          background: 'none', border: 'none', color: 'var(--teal)',
          cursor: 'pointer', fontSize: 15, fontWeight: 700,
          padding: '0 0 20px', display: 'block', fontFamily: F,
        }}
      >
        ← Back to Hub
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 48 }}>📚</div>
          <div>
            <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3.2rem)', margin: '0 0 6px', color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Subject Drill
            </h1>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 16, color: 'var(--text-muted)', margin: 0 }}>
              Focus on one subject. Drill until you're confident.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--teal-glow)', border: '2px solid var(--teal)', borderRadius: 14, padding: '12px 22px' }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--teal)', lineHeight: 1, fontFamily: H }}>
            {dataLoading ? '…' : totalForYear}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginTop: 3, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: F }}>
            {selectedYear === ALL_YEARS ? 'Total Questions' : `${selectedYear} Questions`}
          </span>
        </div>
      </div>

      {/* ── Paused Drills Section ─────────────────────────────────────────────── */}
      {!pausedLoading && pausedDrills.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,2vw,1.4rem)', color: 'var(--text-primary)' }}>
              ▶ Continue Drill
            </div>
            <div style={{
              background: '#F59E0B', color: '#000', borderRadius: 20,
              padding: '2px 10px', fontSize: 12, fontWeight: 800, fontFamily: F,
            }}>
              {pausedDrills.length}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pausedDrills.map(exam => (
              <PausedDrillCard
                key={exam.id}
                exam={exam}
                onContinue={() => handleContinue(exam)}
                onDiscard={() => handleDiscard(exam)}
              />
            ))}
          </div>
          {/* divider */}
          <div style={{ height: 1, background: 'var(--border)', margin: '28px 0 0' }} />
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, padding: '12px 16px', color: '#EF4444', fontSize: 15, fontWeight: 700, marginBottom: 20, fontFamily: F }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Year Selector ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, fontFamily: F }}>
          Select Exam Year
        </div>

        {dataLoading ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ width: 72, height: 48, borderRadius: 10, background: 'var(--border)', animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setSelectedYear(ALL_YEARS)}
              style={{
                minWidth: 80, padding: '10px 16px', borderRadius: 10,
                border: `2px solid ${selectedYear === ALL_YEARS ? 'var(--teal)' : 'var(--border)'}`,
                background: selectedYear === ALL_YEARS ? 'var(--teal-glow)' : 'var(--bg-tertiary)',
                color: selectedYear === ALL_YEARS ? 'var(--teal)' : 'var(--text-primary)',
                fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: F,
                transform: selectedYear === ALL_YEARS ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.15s',
              }}
            >
              All Years
            </button>

            {YEARS.map(yr => {
              const active  = selectedYear === yr;
              const yrCount = allDocs.filter(d => d.year === yr).length;
              const hasData = yrCount > 0;
              return (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  style={{
                    minWidth: 72, padding: '8px 14px', borderRadius: 10,
                    border: `2px solid ${active ? '#F59E0B' : 'var(--border)'}`,
                    background: active ? 'rgba(245,158,11,0.15)' : 'var(--bg-tertiary)',
                    color: active ? '#F59E0B' : hasData ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: active ? 800 : 700, fontSize: 14,
                    cursor: 'pointer', opacity: hasData || active ? 1 : 0.5,
                    fontFamily: F,
                    transform: active ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}
                >
                  <span>{yr}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#F59E0B' : 'var(--text-muted)' }}>
                    {hasData ? `${yrCount}Q` : 'empty'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectedYear !== ALL_YEARS && !dataLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.3)' }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: F }}>
              Showing questions from <strong style={{ color: '#F59E0B' }}>{selectedYear}</strong> only · {totalForYear} question{totalForYear !== 1 ? 's' : ''} available
            </span>
          </div>
        )}
      </div>

      {/* ── Subject Grid ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, fontFamily: F }}>
          Choose a Subject
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {SUBJECTS.map(sub => {
            const count  = subjectCounts[sub.name] || 0;
            const active = selectedSubject?.name === sub.name;
            const empty  = count === 0;
            return (
              <button
                key={sub.name}
                onClick={() => { if (!empty) setSelectedSubject(sub); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '18px 10px', borderRadius: 16, position: 'relative',
                  border: `2px solid ${active ? sub.color : 'var(--border)'}`,
                  background: active ? sub.color + '18' : 'var(--bg-card)',
                  boxShadow: active ? `0 0 0 1px ${sub.color}40, 0 4px 20px ${sub.color}18` : 'var(--shadow-sm)',
                  transform: active ? 'scale(1.03)' : 'scale(1)',
                  cursor: empty ? 'not-allowed' : 'pointer',
                  opacity: empty ? 0.6 : 1,
                  transition: 'all 0.2s', fontFamily: F,
                }}
              >
                {active && (
                  <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: sub.color, boxShadow: `0 0 6px ${sub.color}` }} />
                )}
                <span style={{ fontSize: 32 }}>{sub.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, textAlign: 'center', color: active ? sub.color : 'var(--text-primary)', fontFamily: F }}>
                  {sub.name}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: empty ? '#EF4444' : 'var(--text-muted)', fontFamily: F }}>
                  {empty ? 'Empty' : `${count} question${count !== 1 ? 's' : ''}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Count Picker ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, fontFamily: F }}>
          Number of Questions
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {COUNTS.map(c => {
            const active  = selectedCount === c;
            const tooMany = selectedSubject && c > availableCount;
            return (
              <button
                key={c}
                onClick={() => setSelectedCount(c)}
                style={{
                  width: 64, height: 48, borderRadius: 10,
                  border: `2px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
                  background: active ? 'var(--teal-glow)' : 'var(--bg-tertiary)',
                  color: active ? 'var(--teal)' : tooMany ? 'var(--text-muted)' : 'var(--text-primary)',
                  fontWeight: 800, fontSize: 16, cursor: 'pointer', transition: 'all 0.15s',
                  transform: active ? 'scale(1.08)' : 'scale(1)', fontFamily: F,
                }}
              >
                {c}
              </button>
            );
          })}
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 8, fontFamily: F }}>
            ⏱ {timeLimitMin} min
          </div>
        </div>

        {selectedSubject && availableCount < selectedCount && (
          <div style={{ fontSize: 13, color: '#F59E0B', marginTop: 10, fontWeight: 700, fontFamily: F }}>
            ⚠️ Only {availableCount} questions available for {selectedSubject.name}
            {selectedYear !== ALL_YEARS ? ` in ${selectedYear}` : ''} — all will be used.
          </div>
        )}
      </div>

      {/* ── Summary Strip ─────────────────────────────────────────────────────── */}
      {selectedSubject && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          border: `2px solid ${selectedSubject.color}55`,
          background: selectedSubject.color + '0E',
          borderRadius: 14, padding: '16px 18px', marginBottom: 20,
        }}>
          <span style={{ fontSize: 24 }}>{selectedSubject.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: selectedSubject.color, fontFamily: F, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {selectedSubject.name}
              {selectedYear !== ALL_YEARS && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.15)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(245,158,11,0.4)', fontFamily: F }}>
                  📅 {selectedYear}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, fontWeight: 700, fontFamily: F }}>
              {Math.min(selectedCount, availableCount)} questions · {timeLimitMin} min · {availableCount} available
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: selectedSubject.color + '22', color: selectedSubject.color, border: `1px solid ${selectedSubject.color}55`, fontFamily: F }}>
            Ready ✓
          </div>
        </div>
      )}

      {/* ── Start Button ──────────────────────────────────────────────────────── */}
      <button
        onClick={handleStart}
        disabled={!selectedSubject || loading || dataLoading}
        style={{
          width: '100%', padding: '16px 24px',
          border: 'none', color: '#fff', borderRadius: 12,
          fontWeight: 800, fontSize: 17, cursor: !selectedSubject ? 'not-allowed' : 'pointer',
          fontFamily: F, transition: 'all 0.2s', letterSpacing: 0.3,
          opacity: !selectedSubject || loading || dataLoading ? 0.45 : 1,
          background: selectedSubject
            ? `linear-gradient(135deg, ${selectedSubject.color}, ${selectedSubject.color}cc)`
            : 'linear-gradient(135deg, var(--teal), var(--blue-deep))',
          boxShadow: selectedSubject ? `0 4px 20px ${selectedSubject.color}44` : 'none',
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
