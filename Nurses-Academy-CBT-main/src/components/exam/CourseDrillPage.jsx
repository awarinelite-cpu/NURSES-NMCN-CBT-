// src/components/exam/CourseDrillPage.jsx
// Route: /course-drill
//
// UPDATED FLOW:
//   Step 1 — Choose a Nursing Specialty
//   Step 2 — Choose a Course
//   Step 3 — Exam Hub: "Take New Exam" (with question count selector)
//            + list of previous sessions for that course (review only)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where,
  getCountFromServer,
} from 'firebase/firestore';
import { db }       from '../../firebase/config';
import { useAuth }  from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const QUESTION_PRESETS = [10, 20, 30, 50];
const PASS_MARK        = 50; // percent

export default function CourseDrillPage() {
  const navigate          = useNavigate();
  const { user }          = useAuth();
  const currentUser       = user;

  const [step,       setStep]       = useState(1);
  const [specialty,  setSpecialty]  = useState(null);
  const [courses,    setCourses]    = useState([]);
  const [qCounts,    setQCounts]    = useState({});
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');

  // Step 3 — selected course
  const [selCourse,  setSelCourse]  = useState(null);

  // Hub state
  const [sessions,    setSessions]    = useState([]);
  const [sessLoading, setSessLoading] = useState(false);
  const [qCount,      setQCount]      = useState(20);
  const [customCount, setCustomCount] = useState('');
  const [useCustom,   setUseCustom]   = useState(false);

  // ── Load all courses once ───────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    getDocs(collection(db, 'courses'))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        all.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        setCourses(all);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  // ── Load question counts per course when specialty chosen ───────────────────
  useEffect(() => {
    if (!specialty) return;
    const inSpec = courses.filter(c => c.category === specialty.id && c.active !== false);
    if (inSpec.length === 0) return;

    Promise.all(
      inSpec.map(async c => {
        try {
          const snap = await getCountFromServer(
            query(collection(db, 'questions'), where('course', '==', c.id), where('active', '==', true))
          );
          return [c.id, snap.data().count];
        } catch {
          return [c.id, null];
        }
      })
    ).then(results => {
      setQCounts(prev => {
        const next = { ...prev };
        results.forEach(([id, count]) => { next[id] = count; });
        return next;
      });
    });
  }, [specialty, courses]);

  // ── Load saved sessions for selected course ─────────────────────────────────
  // FIX: Removed orderBy('completedAt', 'desc') which required a Firestore composite
  // index that didn't exist — causing the query to silently fail and return empty.
  // Now we fetch without orderBy and sort the results in JavaScript instead.
  useEffect(() => {
    if (!selCourse || !currentUser?.uid) return;
    setSessLoading(true);
    getDocs(
      query(
        collection(db, 'examSessions'),
        where('userId',   '==', currentUser.uid),
        where('examType', '==', 'course_drill'),
        where('course',   '==', selCourse.id),
      )
    )
      .then(snap => {
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort newest first in JS — no composite index needed
        results.sort((a, b) => {
          const ta = a.completedAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.completedAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        });
        setSessions(results);
      })
      .catch(e => { console.error('Sessions load error:', e); setSessions([]); })
      .finally(() => setSessLoading(false));
  }, [selCourse, currentUser]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const coursesForSpecialty = specialty
    ? courses.filter(c => c.category === specialty.id && c.active !== false)
    : [];

  const filteredCourses = coursesForSpecialty.filter(c =>
    c.label?.toLowerCase().includes(search.toLowerCase())
  );

  const finalCount = useCustom
    ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 500)
    : qCount;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleCourseClick = (course) => {
    if (qCounts[course.id] === 0) return;
    setSelCourse(course);
    setStep(3);
    setQCount(20);
    setCustomCount('');
    setUseCustom(false);
  };

  const handleTakeNew = () => {
    navigate('/exam/session', {
      state: {
        poolMode:    true,
        examType:    'course_drill',
        examName:    `${selCourse.label} — Course Drill`,
        category:    specialty.id,
        course:      selCourse.id,
        courseLabel: selCourse.label,
        count:       finalCount,
        doShuffle:   true,
        timeLimit:   0,
      },
    });
  };

  const handleReview = (session) => {
    navigate('/exam/session', {
      state: {
        reviewMode:   true,
        poolMode:     false,
        examType:     'course_drill',
        examName:     session.examName || `${selCourse.label} — Course Drill`,
        category:     session.category,
        course:       session.course,
        courseLabel:  session.courseLabel,
        savedSession: {
          questionIds:    session.questionIds,
          answers:        session.answers,
          correct:        session.correct,
          totalQuestions: session.totalQuestions,
        },
      },
    });
  };

  // ── STEP 1 — Specialty Picker ───────────────────────────────────────────────
  if (step === 1) {
    const specialtiesWithCourses = NURSING_CATEGORIES.filter(cat =>
      courses.some(c => c.category === cat.id && c.active !== false)
    );

    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>📖</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              Course Drill
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Pick a course and drill on <strong style={{ color: 'var(--text-primary)' }}>all topics under it</strong> — questions are pulled randomly from the shared question bank.
          </p>
        </div>

        <StepIndicator step={1} steps={['Choose Specialty', 'Choose Course', 'Configure & Start']} />
        <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
        ) : specialtiesWithCourses.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No courses available yet</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Admin hasn't added any active courses.</div>
          </div>
        ) : (
          <div style={styles.catGrid}>
            {specialtiesWithCourses.map(cat => {
              const count = courses.filter(c => c.category === cat.id && c.active !== false).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setSpecialty(cat); setStep(2); setSearch(''); }}
                  style={{ ...styles.catCard, borderColor: `${cat.color}60`, background: `${cat.color}0D` }}
                >
                  <div style={{ ...styles.catAccent, background: cat.color }} />
                  <div style={{ ...styles.catIconBox, background: `${cat.color}20` }}>
                    <span style={{ fontSize: 26 }}>{cat.icon}</span>
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {cat.shortLabel}
                    </div>
                    <div style={{ fontSize: 11, color: cat.color, fontWeight: 600 }}>
                      {count} course{count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 2 — Course Picker ──────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <button onClick={() => { setStep(1); setSpecialty(null); }} style={styles.backBtn}>
          ← Back to Specialties
        </button>

        <StepIndicator step={2} steps={['Choose Specialty', 'Choose Course', 'Configure & Start']} />

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: `${specialty.color}18`, border: `1.5px solid ${specialty.color}40`,
          borderRadius: 40, padding: '8px 16px', marginBottom: 20,
        }}>
          <span style={{ fontSize: 20 }}>{specialty.icon}</span>
          <div>
            <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Selected Specialty
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{specialty.label}</div>
          </div>
          <button onClick={() => { setStep(1); setSpecialty(null); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
        </div>

        <div style={styles.sectionHead}>📚 Choose a Course</div>
        <input className="form-input" placeholder="🔍 Search courses..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 16, maxWidth: 400 }} />

        {filteredCourses.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontWeight: 700 }}>No courses found</div>
          </div>
        ) : (
          <div style={styles.courseGrid}>
            {filteredCourses.map(course => {
              const qCount  = qCounts[course.id];
              const isLoading = qCount === undefined;

              return (
                <button
                  key={course.id}
                  onClick={() => handleCourseClick(course)}
                  disabled={qCount === 0}
                  style={{
                    ...styles.courseCard,
                    borderColor: `${specialty.color}40`,
                    opacity: qCount === 0 ? 0.5 : 1,
                    cursor: qCount === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div style={{ ...styles.courseIconBox, background: `${specialty.color}18`, marginBottom: 10 }}>
                    <span style={{ fontSize: 28 }}>{course.icon || '📖'}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 4 }}>
                    {course.label}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: qCount === 0 ? 'var(--text-muted)' : specialty.color }}>
                    {isLoading ? '…' : qCount === 0 ? 'No questions yet' : `${qCount} question${qCount !== 1 ? 's' : ''} →`}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 3 — Exam Hub for selected course ───────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 860 }}>
      <button onClick={() => { setStep(2); setSelCourse(null); setSessions([]); }} style={styles.backBtn}>
        ← Back to Courses
      </button>

      <StepIndicator step={3} steps={['Choose Specialty', 'Choose Course', 'Configure & Start']} />

      {/* Course badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `${specialty.color}18`, border: `1.5px solid ${specialty.color}40`,
        borderRadius: 40, padding: '8px 16px', marginBottom: 28,
      }}>
        <span style={{ fontSize: 20 }}>{selCourse.icon || '📖'}</span>
        <div>
          <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Course Drill
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{selCourse.label}</div>
        </div>
      </div>

      {/* ── Take New Exam card ────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card)', border: `2px solid ${specialty.color}`,
        borderRadius: 18, padding: 24, marginBottom: 32,
        boxShadow: `0 0 0 4px ${specialty.color}0A`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 24 }}>📖</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>Take New Exam</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {qCounts[selCourse.id] != null ? `${qCounts[selCourse.id]} questions in pool` : 'Questions from this course'}
            </div>
          </div>
        </div>

        {/* Question count selector */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>
            📊 Number of Questions
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {QUESTION_PRESETS.map(n => (
              <button
                key={n}
                onClick={() => { setQCount(n); setUseCustom(false); }}
                style={{
                  padding: '8px 18px', borderRadius: 10, fontFamily: 'inherit',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
                  border: `2px solid ${!useCustom && qCount === n ? specialty.color : 'var(--border)'}`,
                  background: !useCustom && qCount === n ? `${specialty.color}18` : 'var(--bg-tertiary)',
                  color: !useCustom && qCount === n ? specialty.color : 'var(--text-secondary)',
                }}
              >
                {n}
              </button>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setUseCustom(true)}
                style={{
                  padding: '8px 14px', borderRadius: 10, fontFamily: 'inherit',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
                  border: `2px solid ${useCustom ? specialty.color : 'var(--border)'}`,
                  background: useCustom ? `${specialty.color}18` : 'var(--bg-tertiary)',
                  color: useCustom ? specialty.color : 'var(--text-secondary)',
                }}
              >
                Custom
              </button>
              {useCustom && (
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={customCount}
                  onChange={e => setCustomCount(e.target.value)}
                  placeholder="e.g. 75"
                  autoFocus
                  style={{
                    width: 80, padding: '8px 10px', borderRadius: 10,
                    border: `2px solid ${specialty.color}`, background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)', fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 700, outline: 'none',
                  }}
                />
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            {useCustom
              ? customCount
                ? `Will attempt ${Math.min(Math.max(parseInt(customCount, 10) || 0, 1), 500)} questions`
                : 'Enter a number'
              : `${qCount} questions selected`}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleTakeNew}
          disabled={useCustom && !customCount}
          style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 800, borderRadius: 12 }}
        >
          🚀 Start Exam — {finalCount} Questions
        </button>
      </div>

      {/* ── Previous Exams list ────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          📋 Previous Exams
          {sessions.length > 0 && (
            <span style={{ fontSize: 12, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>
              {sessions.length}
            </span>
          )}
        </div>

        {sessLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>Loading exam history…</div>
          </div>
        ) : sessions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px dashed var(--border)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>No exams taken yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Take your first exam above — it'll appear here when done.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map(session => {
              const pct    = session.scorePercent ?? Math.round(((session.correct || 0) / (session.totalQuestions || 1)) * 100);
              const passed = pct >= PASS_MARK;
              const date   = session.completedAt?.toDate
                ? session.completedAt.toDate()
                : session.completedAt ? new Date(session.completedAt) : null;
              const dateStr = date ? date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
              const timeStr = date ? date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '';

              return (
                <div key={session.id} style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid var(--border)',
                  borderLeft: `4px solid ${passed ? '#16A34A' : '#EF4444'}`,
                  borderRadius: 14, padding: '16px 18px',
                  display: 'flex', alignItems: 'center', gap: 16,
                  flexWrap: 'wrap',
                }}>
                  {/* Score badge */}
                  <div style={{
                    width: 54, height: 54, borderRadius: 12, flexShrink: 0,
                    background: passed ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `2px solid ${passed ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: passed ? '#16A34A' : '#EF4444', lineHeight: 1 }}>
                      {pct}%
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: passed ? '#16A34A' : '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {passed ? 'PASS' : 'FAIL'}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {session.examName || `${selCourse.label} — Course Drill`}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        📅 {dateStr}{timeStr ? ` · ${timeStr}` : ''}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        ✅ {session.correct ?? '?'} / {session.totalQuestions ?? '?'} correct
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        📝 {session.totalQuestions ?? '?'} questions
                      </span>
                    </div>
                  </div>

                  {/* Review button */}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleReview(session)}
                    style={{ flexShrink: 0, fontWeight: 700 }}
                  >
                    🔍 Review
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function StepIndicator({ step, steps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const num = i + 1; const done = step > num; const active = step === num;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done || active ? 'var(--teal)' : 'var(--bg-tertiary)',
                border: `2px solid ${done || active ? 'var(--teal)' : 'var(--border)'}`,
                color: done || active ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 900, flexShrink: 0, opacity: done ? 0.65 : 1,
              }}>{done ? '✓' : num}</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--teal)' : 'var(--text-muted)' }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 20, height: 2, borderRadius: 2, margin: '0 6px', background: step > num ? 'var(--teal)' : 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  backBtn:     { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  sectionHead: { fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  catGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard:     { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox:  { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  courseGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  courseCard:  { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 12px 14px', borderRadius: 14, border: '1.5px solid', fontFamily: 'inherit', transition: 'all 0.18s', background: 'var(--bg-card)' },
  courseIconBox: { width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyState:  { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
};
