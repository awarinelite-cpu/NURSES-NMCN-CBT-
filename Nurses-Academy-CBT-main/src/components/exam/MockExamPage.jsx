// src/components/exam/MockExamPage.jsx
// Route: /mock-exams
//
// FLOW:
//   Step 1 — Choose a Nursing Specialty (category grid)
//   Step 2 — Exam Hub: list of available Mock Exams for that specialty
//            + question count selector + previous saved sessions
//   Step 3 — ExamSession (/exam/session) in live mode OR review mode

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, orderBy,
} from 'firebase/firestore';
import { db }       from '../../firebase/config';
import { useAuth }  from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const QUESTION_PRESETS = [10, 20, 30, 50];
const PASS_MARK        = 50; // percent

export default function MockExamPage() {
  const navigate          = useNavigate();
  const { user }          = useAuth();
  const currentUser       = user;

  const [step,         setStep]         = useState(1);         // 1=specialty, 2=hub
  const [specialty,    setSpecialty]    = useState(null);
  const [selExam,      setSelExam]      = useState(null);

  // Mock exam list for chosen specialty
  const [mockExams,    setMockExams]    = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);

  // Hub state
  const [sessions,     setSessions]     = useState([]);
  const [sessLoading,  setSessLoading]  = useState(false);
  const [qCount,       setQCount]       = useState(20);
  const [customCount,  setCustomCount]  = useState('');
  const [useCustom,    setUseCustom]    = useState(false);

  // ── Load mock exams when specialty is chosen ────────────────────────────────
  useEffect(() => {
    if (!specialty) return;
    setExamsLoading(true);
    getDocs(
      query(
        collection(db, 'mockExams'),
        where('category', '==', specialty.id),
        where('active',   '==', true),
      )
    )
      .then(snap => {
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        results.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        setMockExams(results);
      })
      .catch(() => setMockExams([]))
      .finally(() => setExamsLoading(false));
  }, [specialty]);

  // ── Load saved sessions for selected mock exam ──────────────────────────────
  useEffect(() => {
    if (!selExam || !currentUser?.uid) return;
    setSessLoading(true);
    getDocs(
      query(
        collection(db, 'examSessions'),
        where('userId',   '==', currentUser.uid),
        where('examType', '==', 'mock_exam'),
        where('mockExamId', '==', selExam.id),
      )
    )
      .then(snap => {
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        results.sort((a, b) => {
          const ta = a.completedAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.completedAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        });
        setSessions(results);
      })
      .catch(() => setSessions([]))
      .finally(() => setSessLoading(false));
  }, [selExam, currentUser]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSpecialtyClick = (cat) => {
    setSpecialty(cat);
    setMockExams([]);
    setSelExam(null);
    setSessions([]);
    setStep(2);
  };

  const handleExamClick = (exam) => {
    setSelExam(exam);
    setQCount(20);
    setCustomCount('');
    setUseCustom(false);
  };

  const handleTakeNew = () => {
    if (!selExam) return;
    const finalCount = useCustom
      ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 500)
      : qCount;

    navigate('/exam/session', {
      state: {
        poolMode:    true,
        examType:    'mock_exam',
        mockExamId:  selExam.id,
        examName:    `${selExam.title} — Mock Exam`,
        category:    specialty.id,
        count:       finalCount,
        doShuffle:   true,
        timeLimit:   selExam.timeLimit || 0,
      },
    });
  };

  const handleReview = (session) => {
    navigate('/exam/session', {
      state: {
        reviewMode:   true,
        poolMode:     false,
        examType:     'mock_exam',
        examName:     session.examName || 'Mock Exam',
        category:     session.category,
        mockExamId:   session.mockExamId,
        savedSession: {
          questionIds:    session.questionIds,
          answers:        session.answers,
          correct:        session.correct,
          totalQuestions: session.totalQuestions,
        },
      },
    });
  };

  const finalCount = useCustom
    ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 500)
    : qCount;

  // ── STEP 1 — Specialty Picker ───────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>📋</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              Mock Exams
            </h2>
          </div>
          <p style={{ color: 'var(--teal)', fontSize: 13, margin: '0 0 6px 0', fontWeight: 600 }}>
            Study daily Hospital Final exam
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Simulate a real hospital final exam experience. Choose your specialty, pick a mock exam, and test yourself under exam conditions.
          </p>
        </div>

        <StepIndicator step={1} steps={['Choose Specialty', 'Pick Exam & Start']} />

        <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

        <div style={styles.catGrid}>
          {NURSING_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleSpecialtyClick(cat)}
              style={{
                ...styles.catCard,
                borderColor: `${cat.color}60`,
                background:  `${cat.color}0D`,
              }}
            >
              <div style={{ ...styles.catAccent, background: cat.color }} />
              <div style={{ ...styles.catIconBox, background: `${cat.color}20` }}>
                <span style={{ fontSize: 26 }}>{cat.icon}</span>
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {cat.shortLabel}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: cat.color }}>
                  View Mock Exams →
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── STEP 2 — Exam Hub ───────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>

      {/* Back button */}
      <button onClick={() => { setStep(1); setSpecialty(null); setSelExam(null); }} style={styles.backBtn}>
        ← Back to Specialties
      </button>

      <StepIndicator step={2} steps={['Choose Specialty', 'Pick Exam & Start']} />

      {/* Selected specialty pill */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `${specialty.color}18`, border: `1.5px solid ${specialty.color}40`,
        borderRadius: 40, padding: '8px 16px', marginBottom: 24,
      }}>
        <span style={{ fontSize: 20 }}>{specialty.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Selected Specialty
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{specialty.label}</div>
        </div>
        <button
          onClick={() => { setStep(1); setSpecialty(null); setSelExam(null); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}
        >✕</button>
      </div>

      {/* Two-column layout: exam list + hub panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selExam ? '1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Available Mock Exams ────────────────────────────────────────────── */}
        <div>
          <div style={styles.sectionHead}>📋 Available Mock Exams</div>

          {examsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>Loading exams…</div>
            </div>
          ) : mockExams.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              background: 'var(--bg-card)', borderRadius: 14,
              border: '1.5px dashed var(--border)',
            }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>No mock exams yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Mock exams for {specialty.shortLabel} will appear here once added.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mockExams.map(exam => {
                const isSelected = selExam?.id === exam.id;
                return (
                  <button
                    key={exam.id}
                    onClick={() => handleExamClick(exam)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px 18px', borderRadius: 14,
                      background: isSelected ? `${specialty.color}12` : 'var(--bg-card)',
                      border: `2px solid ${isSelected ? specialty.color : 'var(--border)'}`,
                      cursor: 'pointer', fontFamily: 'inherit',
                      textAlign: 'left', transition: 'all 0.18s',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {/* Left accent */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
                      borderRadius: '4px 0 0 4px',
                      background: isSelected ? specialty.color : 'var(--border)',
                      transition: 'background 0.18s',
                    }} />

                    {/* Icon box */}
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                      background: `${specialty.color}20`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 24 }}>{exam.icon || '📋'}</span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
                        {exam.title}
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {exam.questionCount && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                            📝 {exam.questionCount} questions
                          </span>
                        )}
                        {exam.timeLimit > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                            ⏱ {exam.timeLimit} mins
                          </span>
                        )}
                        {exam.year && (
                          <span style={{ fontSize: 11, color: specialty.color, fontWeight: 700 }}>
                            📅 {exam.year}
                          </span>
                        )}
                      </div>
                      {exam.description && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                          {exam.description}
                        </div>
                      )}
                    </div>

                    <span style={{
                      color: isSelected ? specialty.color : 'var(--text-muted)',
                      fontSize: 18, fontWeight: 900, flexShrink: 0,
                    }}>→</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Exam Hub (shown when an exam is selected) ──────────────────────── */}
        {selExam && (
          <div>
            {/* Selected exam info card */}
            <div style={{
              background: `${specialty.color}0D`,
              border: `2px solid ${specialty.color}40`,
              borderRadius: 14, padding: '18px 20px', marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 28 }}>{selExam.icon || '📋'}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                    {selExam.title}
                  </div>
                  <div style={{ fontSize: 12, color: specialty.color, fontWeight: 700 }}>
                    {specialty.shortLabel}
                  </div>
                </div>
              </div>
              {selExam.description && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                  {selExam.description}
                </p>
              )}
            </div>

            {/* Question count selector */}
            <div style={{
              background: 'var(--bg-card)', border: '1.5px solid var(--border)',
              borderRadius: 14, padding: '18px 20px', marginBottom: 20,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 12 }}>
                📊 How many questions?
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {QUESTION_PRESETS.map(n => (
                  <button
                    key={n}
                    onClick={() => { setQCount(n); setUseCustom(false); }}
                    style={{
                      padding: '8px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      border: `2px solid ${!useCustom && qCount === n ? specialty.color : 'var(--border)'}`,
                      background: !useCustom && qCount === n ? `${specialty.color}18` : 'var(--bg-tertiary)',
                      color: !useCustom && qCount === n ? specialty.color : 'var(--text-secondary)',
                    }}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setUseCustom(true)}
                  style={{
                    padding: '8px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
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
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {useCustom
                  ? customCount
                    ? `Will attempt ${Math.min(Math.max(parseInt(customCount, 10) || 0, 1), 500)} questions`
                    : 'Enter a number between 1 and 500'
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

            {/* ── Previous Exams list ──────────────────────────────────────── */}
            <div style={{ marginTop: 28 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                📋 Previous Attempts
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
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>No attempts yet</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Take your first attempt above — it'll appear here when done.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sessions.map(session => {
                    const pct    = session.scorePercent ?? Math.round(((session.correct || 0) / (session.totalQuestions || 1)) * 100);
                    const passed = pct >= PASS_MARK;
                    const date   = session.completedAt?.toDate
                      ? session.completedAt.toDate()
                      : session.completedAt ? new Date(session.completedAt) : null;
                    const dateStr = date
                      ? date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—';
                    const timeStr = date
                      ? date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
                      : '';

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
                            {session.examName || selExam.title}
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
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────
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
  backBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  sectionHead:{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  catGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard:    { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox: { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
