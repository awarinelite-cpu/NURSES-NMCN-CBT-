// src/components/entrance/EntranceSubjectDrill.jsx
// Route: /entrance-exam/subject-drill
//
// PURPOSE:
//   1. Load subjects from `entranceExamSubjects` collection (admin-managed)
//   2. For each subject, count available questions in `entranceExamQuestions`
//   3. Let user select a subject and configure exam (count, time limit, year)
//   4. Navigate to EntranceSubjectSession to take the drill
//
// DATA FLOW:
//   Admin creates subjects in EntranceExamManager → "Subjects" tab
//   Admin uploads questions with matching `subject` field
//   This page joins them: subjects (icon/color) + question counts

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where,
  getCountFromServer, orderBy, setDoc, doc, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { ENTRANCE_SUBJECTS } from '../../utils/entranceExamParser';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// Default icon + colour for each known subject (used when seeding entranceExamSubjects)
const SUBJECT_META = {
  'English Language':  { icon: '📖', color: '#2563EB' },
  'Biology':           { icon: '🫀', color: '#16A34A' },
  'Chemistry':         { icon: '🧪', color: '#7C3AED' },
  'Physics':           { icon: '🔭', color: '#0891B2' },
  'Mathematics':       { icon: '📐', color: '#F59E0B' },
  'General Studies':   { icon: '🌍', color: '#0D9488' },
  'Nursing Aptitude':  { icon: '💉', color: '#EF4444' },
  'Current Affairs':   { icon: '📰', color: '#64748B' },
};

/**
 * Seed the `entranceExamSubjects` collection with default subjects.
 * Uses setDoc with the subject name as the document ID so it is idempotent.
 */
async function seedSubjectsCollection() {
  try {
    const batch = writeBatch(db);
    ENTRANCE_SUBJECTS.forEach((name, i) => {
      const meta = SUBJECT_META[name] || { icon: '📚', color: '#0D9488' };
      batch.set(doc(db, 'entranceExamSubjects', name), {
        name,
        icon:  meta.icon,
        color: meta.color,
        order: i,
      }, { merge: true }); // merge:true so existing docs are not overwritten
    });
    await batch.commit();
  } catch (e) {
    console.warn('Subject seeding failed (non-critical):', e.message);
  }
}

const QUESTION_PRESETS = [10, 20, 30, 50];
const TIME_OPTIONS = [
  { label: 'No Timer',  value: 0  },
  { label: '10 mins',   value: 10 },
  { label: '15 mins',   value: 15 },
  { label: '20 mins',   value: 20 },
  { label: '30 mins',   value: 30 },
  { label: '45 mins',   value: 45 },
  { label: '1 hour',    value: 60 },
];

// ── Subject Card ─────────────────────────────────────────────────────────────
function SubjectCard({ subject, selected, onClick }) {
  const [hov, setHov] = useState(false);
  const accentColor = subject.color || 'var(--teal)';
  const available   = subject.questionCount || 0;
  const isEmpty     = available === 0;

  return (
    <div
      onMouseEnter={() => !isEmpty && setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => !isEmpty && onClick()}
      style={{
        background: selected
          ? `${accentColor}18`
          : hov
            ? 'rgba(255,255,255,0.02)'
            : 'var(--bg-card)',
        border: `2px solid ${
          selected
            ? accentColor
            : hov
              ? `${accentColor}55`
              : 'var(--border)'
        }`,
        borderRadius: 16,
        padding: '18px 20px',
        cursor: isEmpty ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        transition: 'all 0.2s',
        transform: hov && !selected ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov && !selected ? `0 8px 20px ${accentColor}18` : 'none',
        opacity: isEmpty ? 0.5 : 1,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: 12,
          background: selected ? accentColor : 'var(--bg-tertiary)',
          border: `2px solid ${selected ? accentColor : 'var(--border)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0,
          transition: 'all 0.2s',
        }}
      >
        {subject.icon || '📚'}
      </div>

      {/* Info */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--text-primary)',
            fontFamily: F,
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {subject.name}
          {selected && (
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              background: accentColor,
              color: '#fff',
              padding: '2px 8px',
              borderRadius: 20,
              fontFamily: H,
            }}>
              ✓ Selected
            </span>
          )}
          {isEmpty && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              background: 'rgba(239,68,68,0.1)',
              color: '#EF4444',
              padding: '2px 8px',
              borderRadius: 20,
              fontFamily: F,
            }}>
              No questions yet
            </span>
          )}
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          fontFamily: F,
          fontWeight: 700,
        }}>
          {isEmpty
            ? 'Admin needs to upload questions for this subject'
            : `${available} question${available !== 1 ? 's' : ''} available`}
        </div>
        {/* Year tags */}
        {subject.years?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {subject.years.slice(0, 6).map(y => (
              <span key={y} style={{
                fontSize: 10,
                fontWeight: 700,
                fontFamily: F,
                padding: '1px 7px',
                borderRadius: 20,
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}>
                {y}
              </span>
            ))}
            {subject.years.length > 6 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
                +{subject.years.length - 6} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Arrow */}
      <div style={{
        fontSize: 20,
        color: accentColor,
        opacity: selected ? 1 : isEmpty ? 0.1 : 0.3,
        transition: 'opacity 0.2s',
        fontWeight: 900,
      }}>
        →
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function EntranceSubjectDrill() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [subjects,  setSubjects]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // Config state
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedYear,    setSelectedYear]    = useState('');
  const [questionCount,   setQuestionCount]   = useState(20);
  const [customCount,     setCustomCount]     = useState('');
  const [useCustom,       setUseCustom]       = useState(false);
  const [timeLimit,       setTimeLimit]       = useState(20);

  // ── Load subjects from `entranceExamSubjects`, then count questions ────────
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        // 1. Load admin-defined subjects
        let subjectSnap;
        try {
          subjectSnap = await getDocs(
            query(collection(db, 'entranceExamSubjects'), orderBy('order', 'asc'))
          );
        } catch {
          subjectSnap = await getDocs(collection(db, 'entranceExamSubjects'));
        }

        let adminSubjects = subjectSnap.docs.map(d => ({
          id:    d.id,
          name:  d.data().name  || d.id,
          icon:  d.data().icon  || '📚',
          color: d.data().color || '#0D9488',
          order: d.data().order ?? 999,
        }));

        // ── Auto-seed if collection is empty ────────────────────────────────
        if (adminSubjects.length === 0) {
          await seedSubjectsCollection();
          // Re-read after seeding
          try {
            const snap2 = await getDocs(collection(db, 'entranceExamSubjects'));
            adminSubjects = snap2.docs.map(d => ({
              id:    d.id,
              name:  d.data().name  || d.id,
              icon:  d.data().icon  || '📚',
              color: d.data().color || '#0D9488',
              order: d.data().order ?? 999,
            }));
          } catch { /* ignore — use hardcoded fallback below */ }
        }

        // ── If still empty (e.g. Firestore write rules block it), use hardcoded list ──
        if (adminSubjects.length === 0) {
          adminSubjects = ENTRANCE_SUBJECTS.map((name, i) => ({
            id:    name,
            name,
            icon:  SUBJECT_META[name]?.icon  || '📚',
            color: SUBJECT_META[name]?.color || '#0D9488',
            order: i,
          }));
        }

        // 2. Count questions per subject.
        //    Also count questions with subject='' (untagged) — add them to all subjects.
        let untaggedCount = 0;
        try {
          const utSnap = await getCountFromServer(
            query(collection(db, 'entranceExamQuestions'), where('subject', '==', ''))
          );
          untaggedCount = utSnap.data().count;
        } catch { /* non-critical */ }

        const enriched = await Promise.all(
          adminSubjects.map(async subj => {
            try {
              const countSnap = await getCountFromServer(
                query(
                  collection(db, 'entranceExamQuestions'),
                  where('subject', '==', subj.name)
                )
              );
              const taggedCount  = countSnap.data().count;
              const questionCount = taggedCount + untaggedCount;

              // Available years (only read if there are tagged questions)
              let years = [];
              if (taggedCount > 0) {
                const yearSnap = await getDocs(
                  query(
                    collection(db, 'entranceExamQuestions'),
                    where('subject', '==', subj.name)
                  )
                );
                const yearSet = new Set();
                yearSnap.forEach(d => { if (d.data().year) yearSet.add(d.data().year); });
                years = Array.from(yearSet).sort();
              }

              return { ...subj, questionCount, years };
            } catch {
              return { ...subj, questionCount: untaggedCount, years: [] };
            }
          })
        );

        // Sort: subjects with questions first, then by admin order
        const sorted = enriched.sort((a, b) => {
          if (a.questionCount > 0 && b.questionCount === 0) return -1;
          if (a.questionCount === 0 && b.questionCount > 0) return  1;
          return (a.order ?? 999) - (b.order ?? 999);
        });

        setSubjects(sorted);

        // Auto-select first subject that has questions
        const first = sorted.find(s => s.questionCount > 0);
        if (first) setSelectedSubject(first);

      } catch (err) {
        console.error('Load subjects error:', err);
        setError('Failed to load subjects. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  // ── Start drill ────────────────────────────────────────────────────────────
  const handleStart = () => {
    if (!selectedSubject) {
      setError('Please select a subject to continue.');
      return;
    }
    if ((selectedSubject.questionCount || 0) === 0) {
      setError('This subject has no questions yet. Please select another.');
      return;
    }

    const finalCount = useCustom
      ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 250)
      : questionCount;

    navigate('/entrance-exam/subject-session', {
      state: {
        subject:      selectedSubject,
        year:         selectedYear || 'All Years',
        count:        Math.min(finalCount, selectedSubject.questionCount),
        timeLimitMin: timeLimit,
        doShuffle:    true,
      },
    });
  };

  const availableYears = selectedSubject?.years || [];
  const available      = selectedSubject?.questionCount || 0;
  const finalCount     = useCustom
    ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 250)
    : questionCount;

  const accentColor = selectedSubject?.color || 'var(--teal)';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto', fontFamily: F }}>

      {/* Back */}
      <button
        onClick={() => navigate('/entrance-exam')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--teal)', fontWeight: 700, fontSize: 13,
          padding: 0, marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 6, fontFamily: F,
        }}
      >
        ← Back to Entrance Exam
      </button>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{
          fontFamily: H,
          fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
          fontWeight: 900,
          margin: '0 0 8px',
          color: 'var(--text-primary)',
        }}>
          📚 Subject Drill
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, fontWeight: 700 }}>
          Practice entrance exam questions by subject. Master topics one at a time.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{
            width: 40, height: 40, margin: '0 auto 12px',
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: 'var(--teal)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 700 }}>
            Loading subjects…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1.5px solid rgba(239,68,68,0.3)',
          borderRadius: 12, padding: '14px 16px', marginBottom: 24,
          color: '#EF4444', fontSize: 14, fontWeight: 700,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && subjects.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: 'var(--bg-card)', borderRadius: 16,
          border: '1.5px dashed var(--border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
            No subjects available yet
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            An admin needs to create subjects and upload questions first.
          </p>
        </div>
      )}

      {/* Subject list */}
      {!loading && subjects.length > 0 && (
        <>
          {/* Step 1 */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border)',
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 28,
          }}>
            <div style={{
              fontWeight: 800, fontSize: 14,
              color: 'var(--text-primary)', marginBottom: 16,
              textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: H,
            }}>
              📖 Step 1: Select a Subject
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {subjects.map(subj => (
                <SubjectCard
                  key={subj.id || subj.name}
                  subject={subj}
                  selected={selectedSubject?.name === subj.name}
                  onClick={() => {
                    setSelectedSubject(subj);
                    setSelectedYear('');
                    setError('');
                  }}
                />
              ))}
            </div>
          </div>

          {/* Step 2: Config — only if a valid subject is selected */}
          {selectedSubject && available > 0 && (
            <>
              {/* Year filter */}
              {availableYears.length > 0 && (
                <div style={{
                  background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                  borderRadius: 16, padding: '20px 24px', marginBottom: 20,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, fontFamily: F }}>
                    📅 Exam Year (optional)
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['', ...availableYears].map(y => (
                      <button
                        key={y || 'all'}
                        onClick={() => setSelectedYear(y)}
                        style={{
                          padding: '10px 18px',
                          border: `2px solid ${selectedYear === y ? accentColor : 'var(--border)'}`,
                          background: selectedYear === y ? `${accentColor}18` : 'var(--bg-tertiary)',
                          color: selectedYear === y ? accentColor : 'var(--text-secondary)',
                          borderRadius: 10, cursor: 'pointer',
                          fontSize: 13, fontWeight: 700, fontFamily: F, transition: 'all 0.2s',
                        }}
                      >
                        {y || 'All Years'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Question count */}
              <div style={{
                background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                borderRadius: 16, padding: '20px 24px', marginBottom: 20,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, fontFamily: F }}>
                  ❓ Number of Questions
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {QUESTION_PRESETS.map(n => (
                    <button
                      key={n}
                      onClick={() => { setQuestionCount(n); setUseCustom(false); }}
                      disabled={n > available}
                      style={{
                        padding: '10px 18px',
                        border: `2px solid ${!useCustom && questionCount === n ? accentColor : 'var(--border)'}`,
                        background: !useCustom && questionCount === n ? `${accentColor}18` : 'var(--bg-tertiary)',
                        color: !useCustom && questionCount === n ? accentColor : 'var(--text-secondary)',
                        borderRadius: 10,
                        cursor: n > available ? 'not-allowed' : 'pointer',
                        fontSize: 13, fontWeight: 700, fontFamily: F, transition: 'all 0.2s',
                        opacity: n > available ? 0.5 : 1,
                      }}
                    >
                      {n}
                    </button>
                  ))}

                  {/* Custom */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setUseCustom(true)}
                      style={{
                        padding: '10px 14px',
                        border: `2px solid ${useCustom ? accentColor : 'var(--border)'}`,
                        background: useCustom ? `${accentColor}18` : 'var(--bg-tertiary)',
                        color: useCustom ? accentColor : 'var(--text-secondary)',
                        borderRadius: 10, cursor: 'pointer',
                        fontSize: 13, fontWeight: 700, fontFamily: F, transition: 'all 0.2s',
                      }}
                    >
                      Custom
                    </button>
                    {useCustom && (
                      <input
                        type="number" min={1} max={available}
                        value={customCount}
                        onChange={e => setCustomCount(e.target.value)}
                        placeholder={`1–${available}`}
                        autoFocus
                        style={{
                          width: 100, padding: '10px 12px', borderRadius: 10,
                          border: `2px solid ${accentColor}`,
                          background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                          fontFamily: F, fontSize: 13, fontWeight: 700, outline: 'none',
                        }}
                      />
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontWeight: 700, fontFamily: F }}>
                  {useCustom && customCount
                    ? `Will attempt ${Math.min(parseInt(customCount, 10) || 1, available)} questions (${available} available)`
                    : `${Math.min(finalCount, available)} / ${available} questions selected`}
                </p>
              </div>

              {/* Time limit */}
              <div style={{
                background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                borderRadius: 16, padding: '20px 24px', marginBottom: 28,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 12, fontFamily: F }}>
                  ⏱️ Time Limit
                </div>
                <select
                  value={timeLimit}
                  onChange={e => setTimeLimit(Number(e.target.value))}
                  style={{
                    width: '100%', maxWidth: 240, padding: '12px 16px',
                    borderRadius: 10, border: '1.5px solid var(--border)',
                    background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                    fontFamily: F, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', outline: 'none',
                  }}
                >
                  {TIME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Start */}
              <button
                onClick={handleStart}
                style={{
                  width: '100%', padding: '16px 24px',
                  background: accentColor,
                  border: 'none', borderRadius: 12,
                  color: '#fff', fontFamily: H, fontSize: 16, fontWeight: 900,
                  cursor: 'pointer', transition: 'all 0.2s', letterSpacing: 0.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                🚀 Start {selectedSubject.name} Drill — {Math.min(finalCount, available)} Questions
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
