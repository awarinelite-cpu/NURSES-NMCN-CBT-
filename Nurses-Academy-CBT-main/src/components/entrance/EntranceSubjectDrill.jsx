// src/components/entrance/EntranceSubjectDrill.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, query, where, orderBy, addDoc, setDoc, doc, serverTimestamp,
} from 'firebase/firestore';
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

function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function EntranceSubjectDrill() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('pick'); // pick | loading | exam | result
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedCount, setSelectedCount] = useState(20);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [subjectCounts, setSubjectCounts] = useState({});
  const [showReview, setShowReview] = useState(false);

  const timerRef = useRef(null);
  const startRef = useRef(null);

  // Load question counts per subject for display
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

  // Timer
  useEffect(() => {
    if (phase !== 'exam') { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => setTimeElapsed(t => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  async function startDrill() {
    if (!selectedSubject) return;
    setPhase('loading');
    setError('');
    try {
      const snap = await getDocs(
        query(
          collection(db, 'entranceExamQuestions'),
          where('subject', '==', selectedSubject.name),
        )
      );
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (all.length === 0) {
        setError(`No questions found for ${selectedSubject.name}. Try another subject.`);
        setPhase('pick');
        return;
      }
      // Shuffle
      const shuffled = all.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(selectedCount, shuffled.length));
      setQuestions(selected);
      setAnswers({});
      setFlagged({});
      setCurrent(0);
      setTimeElapsed(0);
      startRef.current = Date.now();
      setPhase('exam');
    } catch (e) {
      setError('Failed to load questions: ' + e.message);
      setPhase('pick');
    }
  }

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    clearInterval(timerRef.current);

    let correct = 0;
    const breakdown = questions.map((q, i) => {
      const chosen = answers[i] || null;
      const isCorrect = chosen === q.correctAnswer;
      if (isCorrect) correct++;
      return { question: q.questionText, chosen, correct: q.correctAnswer, isCorrect, explanation: q.explanation || '' };
    });

    const score = Math.round((correct / questions.length) * 100);
    const res = {
      subject: selectedSubject.name,
      score, correct,
      total: questions.length,
      timeTaken: timeElapsed,
      breakdown,
      date: new Date().toISOString(),
    };

    // Save to Firestore
    try {
      await addDoc(collection(db, 'users', user.uid, 'entranceSubjectDrills'), {
        ...res, createdAt: serverTimestamp(),
      });
    } catch (e) { /* silent */ }

    setResult(res);
    setPhase('result');
    setSubmitting(false);
  }, [submitting, questions, answers, selectedSubject, timeElapsed, user]);

  const answeredCount = Object.keys(answers).length;

  // ── PICK PHASE ──────────────────────────────────────────────
  if (phase === 'pick' || phase === 'loading') return (
    <div style={s.wrap}>
      <button onClick={() => navigate('/entrance-exam')} style={s.back}>← Back to Hub</button>

      <div style={s.header}>
        <div style={s.headerIcon}>📚</div>
        <div>
          <h2 style={s.headerTitle}>Subject Drill</h2>
          <p style={s.headerSub}>Focus on one subject at a time. Drill until you're confident.</p>
        </div>
      </div>

      {error && (
        <div style={s.errorBox}>{error}</div>
      )}

      {/* Subject grid */}
      <div style={{ marginBottom: 28 }}>
        <div style={s.sectionLabel}>Choose a Subject</div>
        <div style={s.subjectGrid}>
          {SUBJECTS.map(sub => {
            const count = subjectCounts[sub.name] || 0;
            const active = selectedSubject?.name === sub.name;
            return (
              <button
                key={sub.name}
                onClick={() => setSelectedSubject(sub)}
                style={{
                  ...s.subjectBtn,
                  borderColor: active ? sub.color : 'rgba(255,255,255,0.08)',
                  background: active ? sub.color + '20' : 'rgba(255,255,255,0.03)',
                  transform: active ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: 28 }}>{sub.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: active ? sub.color : '#fff' }}>{sub.name}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {count > 0 ? `${count} questions` : 'No questions yet'}
                </span>
                {count === 0 && (
                  <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#EF4444', padding: '2px 6px', borderRadius: 8, fontWeight: 700 }}>
                    Empty
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Count picker */}
      <div style={{ marginBottom: 28 }}>
        <div style={s.sectionLabel}>Number of Questions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {COUNTS.map(c => (
            <button
              key={c}
              onClick={() => setSelectedCount(c)}
              style={{
                ...s.countBtn,
                borderColor: selectedCount === c ? '#0D9488' : 'rgba(255,255,255,0.1)',
                background: selectedCount === c ? 'rgba(13,148,136,0.15)' : 'rgba(255,255,255,0.03)',
                color: selectedCount === c ? '#0D9488' : 'rgba(255,255,255,0.6)',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={startDrill}
        disabled={!selectedSubject || phase === 'loading'}
        style={{
          ...s.startBtn,
          opacity: !selectedSubject || phase === 'loading' ? 0.4 : 1,
          cursor: !selectedSubject ? 'not-allowed' : 'pointer',
        }}
      >
        {phase === 'loading' ? '⏳ Loading questions…' : selectedSubject ? `🚀 Start ${selectedSubject.name} Drill (${selectedCount}Q)` : '👆 Select a subject first'}
      </button>
    </div>
  );

  // ── EXAM PHASE ──────────────────────────────────────────────
  if (phase === 'exam') {
    const q = questions[current];
    const progress = ((current + 1) / questions.length) * 100;
    return (
      <div style={s.examWrap}>
        {/* Top bar */}
        <div style={s.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => { if (window.confirm('Exit drill? Progress will be lost.')) navigate('/entrance-exam'); }} style={s.exitBtn}>✕ Exit</button>
            <span style={s.drillLabel}>
              <span style={{ color: selectedSubject.color }}>{selectedSubject.icon}</span>
              {' '}{selectedSubject.name} Drill
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={s.timerBadge}>⏱ {formatTime(timeElapsed)}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{answeredCount}/{questions.length}</span>
          </div>
        </div>

        {/* Progress */}
        <div style={s.progressTrack}>
          <div style={{ ...s.progressFill, width: `${progress}%`, background: selectedSubject.color }} />
        </div>

        {/* Question nav dots */}
        <div style={s.dotNav}>
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                width: i === current ? 28 : 20,
                height: 8,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: i === current ? selectedSubject.color :
                  answers[i] ? (flagged[i] ? '#F59E0B' : 'rgba(255,255,255,0.3)') : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>

        {/* Question */}
        <div style={s.qWrap}>
          <div style={s.qMeta}>
            <span style={{ ...s.qNum, background: selectedSubject.color + '20', color: selectedSubject.color }}>
              Q{current + 1} / {questions.length}
            </span>
            <button
              onClick={() => setFlagged(f => ({ ...f, [current]: !f[current] }))}
              style={{ ...s.flagBtn, color: flagged[current] ? '#F59E0B' : 'rgba(255,255,255,0.25)' }}
            >
              {flagged[current] ? '🚩 Flagged' : '🏳 Flag'}
            </button>
          </div>

          {q.diagramUrl && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <img
                src={q.diagramUrl} alt="Question diagram"
                style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          )}

          <div style={s.qText}>{q.questionText}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['A','B','C','D'].map(opt => {
              const text = q.options?.[opt] || q[`option${opt}`];
              if (!text) return null;
              const selected = answers[current] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => setAnswers(a => ({ ...a, [current]: opt }))}
                  style={{
                    ...s.optBtn,
                    background: selected ? selectedSubject.color + '20' : 'rgba(255,255,255,0.03)',
                    borderColor: selected ? selectedSubject.color : 'rgba(255,255,255,0.08)',
                    transform: selected ? 'scale(1.01)' : 'scale(1)',
                  }}
                >
                  <span style={{
                    ...s.optLetter,
                    background: selected ? selectedSubject.color : 'rgba(255,255,255,0.08)',
                    color: selected ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}>{opt}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.5, textAlign: 'left', color: selected ? '#fff' : 'rgba(255,255,255,0.8)' }}>{text}</span>
                </button>
              );
            })}
          </div>

          {/* Nav */}
          <div style={s.navRow}>
            <button
              onClick={() => setCurrent(c => Math.max(0, c - 1))}
              disabled={current === 0}
              style={{ ...s.navBtn, opacity: current === 0 ? 0.3 : 1 }}
            >← Prev</button>

            {current < questions.length - 1 ? (
              <button onClick={() => setCurrent(c => c + 1)} style={s.navBtnPrimary}>Next →</button>
            ) : (
              <button
                onClick={() => {
                  const unanswered = questions.length - answeredCount;
                  if (unanswered > 0 && !window.confirm(`${unanswered} unanswered. Submit anyway?`)) return;
                  handleSubmit();
                }}
                disabled={submitting}
                style={s.submitBtn}
              >
                {submitting ? 'Submitting…' : '✅ Submit'}
              </button>
            )}
          </div>
        </div>

        {/* Bottom summary */}
        <div style={s.summaryBar}>
          <span>✅ {answeredCount} answered</span>
          <span>⬜ {questions.length - answeredCount} left</span>
          {answeredCount === questions.length && (
            <button onClick={handleSubmit} disabled={submitting} style={s.quickSubmit}>
              Submit Now
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── RESULT PHASE ────────────────────────────────────────────
  if (phase === 'result' && result) {
    const color = result.score >= 60 ? '#10B981' : result.score >= 40 ? '#F59E0B' : '#EF4444';
    return (
      <div style={s.wrap}>
        <div style={s.resultCard}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>
            {result.score >= 70 ? '🏆' : result.score >= 50 ? '📊' : '💪'}
          </div>
          <h2 style={s.resultTitle}>Drill Complete!</h2>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
            {selectedSubject.icon} {result.subject}
          </div>

          <div style={s.bigScore}>
            <span style={{ ...s.bigScoreNum, color }}>{result.score}%</span>
            <span style={s.bigScoreSub}>{result.correct} / {result.total} correct · ⏱ {formatTime(result.timeTaken)}</span>
          </div>

          {/* Mini bar */}
          <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden', margin: '0 0 24px' }}>
            <div style={{ height: '100%', width: `${result.score}%`, background: color, borderRadius: 5, transition: 'width 0.8s ease' }} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => setShowReview(v => !v)} style={s.navBtnPrimary}>
              {showReview ? 'Hide Review' : '📋 Review Answers'}
            </button>
            <button onClick={() => { setPhase('pick'); setResult(null); }} style={s.navBtn}>
              🔄 Drill Again
            </button>
            <button onClick={() => navigate('/entrance-exam')} style={s.navBtn}>← Hub</button>
          </div>

          {showReview && (
            <div style={{ marginTop: 24, maxHeight: 400, overflowY: 'auto', textAlign: 'left' }}>
              {result.breakdown.map((item, i) => (
                <div key={i} style={{
                  ...s.reviewItem,
                  borderLeft: `4px solid ${item.isCorrect ? '#10B981' : '#EF4444'}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Q{i + 1}: {item.question}</div>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: item.isCorrect ? '#10B981' : '#EF4444' }}>
                      {item.isCorrect ? '✅' : '❌'} Your answer: {item.chosen || 'Not answered'}
                    </span>
                    {!item.isCorrect && <span style={{ color: '#10B981', marginLeft: 10 }}>Correct: {item.correct}</span>}
                  </div>
                  {item.explanation && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', marginTop: 6 }}>{item.explanation}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ── Styles ──────────────────────────────────────────────────────
const s = {
  wrap: {
    maxWidth: 720, margin: '0 auto', padding: '24px 16px 48px',
    color: '#fff', fontFamily: "'Inter', sans-serif",
  },
  back: {
    background: 'none', border: 'none', color: '#0D9488',
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
    padding: '0 0 20px', display: 'block',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28,
  },
  headerIcon: { fontSize: 40 },
  headerTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: 26,
    fontWeight: 700, margin: '0 0 4px',
  },
  headerSub: { color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: 0 },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10, padding: '12px 16px', color: '#EF4444',
    fontSize: 14, marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  subjectGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 10,
  },
  subjectBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '16px 12px', borderRadius: 14, border: '2px solid',
    cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
    fontFamily: 'inherit',
  },
  countBtn: {
    width: 64, height: 44, borderRadius: 10, border: '2px solid',
    cursor: 'pointer', fontWeight: 800, fontSize: 16,
    fontFamily: 'inherit', transition: 'all 0.15s',
  },
  startBtn: {
    width: '100%', padding: '14px 24px',
    background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
    border: 'none', color: '#fff', borderRadius: 12,
    fontWeight: 700, fontSize: 15, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'opacity 0.15s',
  },
  // Exam styles
  examWrap: {
    minHeight: '100vh',
    background: 'var(--bg-primary, #020B18)',
    color: '#fff', display: 'flex', flexDirection: 'column',
    fontFamily: "'Inter', sans-serif",
  },
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px',
    background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(255,255,255,0.06)',
    position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)',
  },
  exitBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)', padding: '5px 12px', borderRadius: 8,
    cursor: 'pointer', fontSize: 12, fontWeight: 600,
  },
  drillLabel: { fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' },
  timerBadge: {
    fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
    color: '#0D9488', background: 'rgba(13,148,136,0.12)',
    padding: '4px 10px', borderRadius: 8,
  },
  progressTrack: { height: 3, background: 'rgba(255,255,255,0.06)' },
  progressFill: { height: '100%', borderRadius: 2, transition: 'width 0.3s' },
  dotNav: {
    display: 'flex', gap: 4, padding: '10px 20px',
    overflowX: 'auto', flexWrap: 'wrap',
    background: 'rgba(255,255,255,0.02)',
  },
  qWrap: { flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '20px 16px' },
  qMeta: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  qNum: { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20 },
  flagBtn: {
    marginLeft: 'auto', background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'color 0.15s',
  },
  qText: {
    fontSize: 16, lineHeight: 1.65, fontWeight: 500, marginBottom: 20,
    padding: '16px 18px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)',
  },
  optBtn: {
    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px',
    borderRadius: 10, border: '2px solid', cursor: 'pointer',
    textAlign: 'left', transition: 'all 0.15s', color: '#fff',
    fontFamily: 'inherit',
  },
  optLetter: {
    width: 26, height: 26, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 12, flexShrink: 0, transition: 'all 0.15s',
  },
  navRow: { display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 24 },
  navBtn: {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', padding: '10px 22px', borderRadius: 10,
    cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
  },
  navBtnPrimary: {
    background: 'linear-gradient(135deg,#0D9488,#0f766e)',
    border: 'none', color: '#fff', padding: '10px 22px',
    borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700,
    fontFamily: 'inherit',
  },
  submitBtn: {
    background: 'linear-gradient(135deg,#10B981,#059669)',
    border: 'none', color: '#fff', padding: '10px 22px',
    borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700,
    fontFamily: 'inherit',
  },
  summaryBar: {
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '10px 20px',
    background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)',
    fontSize: 13, color: 'rgba(255,255,255,0.4)',
    position: 'sticky', bottom: 0, backdropFilter: 'blur(12px)',
  },
  quickSubmit: {
    marginLeft: 'auto',
    background: 'linear-gradient(135deg,#10B981,#059669)',
    border: 'none', color: '#fff',
    padding: '6px 16px', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
  },
  // Result
  resultCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: '32px 28px', textAlign: 'center',
  },
  resultTitle: {
    fontFamily: "'Playfair Display', serif", fontSize: 26,
    fontWeight: 700, margin: '0 0 4px',
  },
  bigScore: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, margin: '16px 0' },
  bigScoreNum: { fontSize: 60, fontWeight: 900, lineHeight: 1, fontFamily: "'Playfair Display', serif" },
  bigScoreSub: { fontSize: 14, color: 'rgba(255,255,255,0.45)' },
  reviewItem: {
    background: 'rgba(255,255,255,0.03)', borderRadius: 8,
    padding: '12px 14px', marginBottom: 10,
  },
};
