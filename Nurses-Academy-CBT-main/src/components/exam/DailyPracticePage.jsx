// src/components/exam/DailyPracticePage.jsx
// Route: /daily-practice
//
// UPDATED FLOW:
//   Step 1 — Choose a Nursing Specialty (category grid)
//   Step 2 — Exam Hub: "Take New Exam" (with question count selector)
//            + list of previous saved sessions for that specialty
//   Step 3 — ExamSession (/exam/session) in live mode OR review mode

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getCountFromServer,
  getDocs, orderBy,
} from 'firebase/firestore';
import { db }       from '../../firebase/config';
import { useAuth }  from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const QUESTION_PRESETS = [10, 20, 30, 50];
const PASS_MARK        = 50; // percent

export default function DailyPracticePage() {
  const navigate          = useNavigate();
  const { profile, user } = useAuth();
  const currentUser       = user;

  const [step,         setStep]         = useState(1);         // 1=specialty, 2=hub
  const [specialty,    setSpecialty]    = useState(null);
  const [catStats,     setCatStats]     = useState({});
  const [statsLoading, setStatsLoading] = useState(true);

  // Hub state
  const [sessions,     setSessions]     = useState([]);
  const [sessLoading,  setSessLoading]  = useState(false);
  const [qCount,       setQCount]       = useState(20);
  const [customCount,  setCustomCount]  = useState('');
  const [useCustom,    setUseCustom]    = useState(false);

  // ── Load question counts per specialty ─────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      setStatsLoading(true);
      try {
        const results = await Promise.all(
          NURSING_CATEGORIES.map(async cat => {
            try {
              const snap = await getCountFromServer(
                query(
                  collection(db, 'questions'),
                  where('category', '==', cat.id),
                  where('active',   '==', true),
                )
              );
              return [cat.id, snap.data().count];
            } catch {
              return [cat.id, null];
            }
          })
        );
        setCatStats(Object.fromEntries(results));
      } finally {
        setStatsLoading(false);
      }
    };
    fetchAll();
  }, []);

  // ── Load saved sessions for selected specialty ──────────────────────────────
  useEffect(() => {
    if (!specialty || !currentUser?.uid) return;
    setSessLoading(true);
    getDocs(
      query(
        collection(db, 'examSessions'),
        where('userId',   '==', currentUser.uid),
        where('examType', '==', 'daily_practice'),
        where('category', '==', specialty.id),
        orderBy('completedAt', 'desc'),
      )
    )
      .then(snap => {
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch(() => setSessions([]))
      .finally(() => setSessLoading(false));
  }, [specialty, currentUser]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSpecialtyClick = (cat) => {
    setSpecialty(cat);
    setStep(2);
  };

  const handleTakeNew = () => {
    const finalCount = useCustom
      ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 250)
      : qCount;

    navigate('/exam/session', {
      state: {
        poolMode:  true,
        examType:  'daily_practice',
        category:  specialty.id,
        examName:  `${specialty.shortLabel} — Daily Practice`,
        count:     finalCount,
        doShuffle: true,
        timeLimit: 0,
      },
    });
  };

  const handleReview = (session) => {
    navigate('/exam/session', {
      state: {
        reviewMode:  true,
        poolMode:    false,
        examType:    'daily_practice',
        examName:    session.examName || 'Daily Practice',
        category:    session.category,
        // Pass saved questions + answers so ExamSession renders in review mode
        savedSession: {
          questionIds: session.questionIds,
          answers:     session.answers,
          correct:     session.correct,
          totalQuestions: session.totalQuestions,
        },
      },
    });
  };

  const finalCount = useCustom
    ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 250)
    : qCount;

  // ── STEP 1 — Specialty Picker ───────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>⚡</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              Daily Practice Quiz
            </h2>
          </div>
          <p style={{ color: 'var(--teal)', fontSize: 13, margin: '0 0 6px 0', fontWeight: 600 }}>
            Take daily exam
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Stay sharp with daily practice! Answer mixed questions from all courses and topics under your chosen specialty to prepare for your exam.
          </p>
        </div>

        <StepIndicator step={1} steps={['Choose Specialty', 'Configure & Start']} />

        <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

        <div style={styles.catGrid}>
          {NURSING_CATEGORIES.map(cat => {
            const total   = catStats[cat.id];
            const loading = statsLoading && total === undefined;
            const noQs    = !loading && total === 0;

            return (
              <button
                key={cat.id}
                onClick={() => !noQs && handleSpecialtyClick(cat)}
                disabled={noQs}
                style={{
                  ...styles.catCard,
                  borderColor: `${cat.color}60`,
                  background:  `${cat.color}0D`,
                  opacity:     noQs ? 0.45 : 1,
                  cursor:      noQs ? 'not-allowed' : 'pointer',
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
                  <div style={{ fontSize: 11, fontWeight: 600, color: noQs ? 'var(--text-muted)' : cat.color }}>
                    {loading
                      ? 'Loading…'
                      : noQs
                        ? 'No questions yet'
                        : total === null
                          ? 'Available'
                          : `${total} question${total !== 1 ? 's' : ''} available`}
                  </div>
                </div>
                {!noQs && (
                  <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── STEP 2 — Exam Hub ───────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 860 }}>

      {/* Back button */}
      <button onClick={() => { setStep(1); setSpecialty(null); setSessions([]); }} style={styles.backBtn}>
        ← Back to Specialties
      </button>

      <StepIndicator step={2} steps={['Choose Specialty', 'Configure & Start']} />

      {/* Specialty badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `${specialty.color}18`, border: `1.5px solid ${specialty.color}40`,
        borderRadius: 40, padding: '8px 16px', marginBottom: 28,
      }}>
        <span style={{ fontSize: 20 }}>{specialty.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Daily Practice
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{specialty.label}</div>
        </div>
      </div>

      {/* ── Take New Exam card ──────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card)', border: '2px solid var(--teal)',
        borderRadius: 18, padding: 24, marginBottom: 32,
        boxShadow: '0 0 0 4px rgba(13,148,136,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 24 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>Take New Exam</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fresh questions, randomly selected</div>
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
                  border: `2px solid ${!useCustom && qCount === n ? 'var(--teal)' : 'var(--border)'}`,
                  background: !useCustom && qCount === n ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                  color: !useCustom && qCount === n ? 'var(--teal)' : 'var(--text-secondary)',
                }}
              >
                {n}
              </button>
            ))}

            {/* Custom input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setUseCustom(true)}
                style={{
                  padding: '8px 14px', borderRadius: 10, fontFamily: 'inherit',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
                  border: `2px solid ${useCustom ? 'var(--teal)' : 'var(--border)'}`,
                  background: useCustom ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                  color: useCustom ? 'var(--teal)' : 'var(--text-secondary)',
                }}
              >
                Custom
              </button>
              {useCustom && (
                <input
                  type="number"
                  min={1}
                  max={250}
                  value={customCount}
                  onChange={e => setCustomCount(e.target.value)}
                  placeholder="e.g. 75"
                  autoFocus
                  style={{
                    width: 80, padding: '8px 10px', borderRadius: 10,
                    border: '2px solid var(--teal)', background: 'var(--bg-tertiary)',
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
                ? `Will attempt ${Math.min(Math.max(parseInt(customCount, 10) || 0, 1), 250)} questions`
                : 'Enter a number between 1 and 250'
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

      {/* ── Previous Exams list ─────────────────────────────────────────────── */}
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
                : session.completedAt
                  ? new Date(session.completedAt)
                  : null;
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
                      {session.examName || 'Daily Practice'}
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
  catCard:    { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox: { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
};