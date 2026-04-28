// src/components/entrance/EntranceExamSession.jsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection, query, where, getDocs, addDoc,
  doc, deleteDoc, setDoc, serverTimestamp, limit, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Option button ─────────────────────────────────────────────────────────────
function OptionBtn({ label, text, selected, correct, revealed, onClick }) {
  let bg = 'var(--bg-card)', border = 'var(--border)', color = 'var(--text-primary)';
  if (revealed) {
    if (correct)        { bg = 'rgba(13,148,136,0.18)'; border = '#0D9488'; color = '#5EEAD4'; }
    else if (selected)  { bg = 'rgba(239,68,68,0.15)';  border = '#EF4444'; color = '#FCA5A5'; }
  } else if (selected) { bg = 'rgba(37,99,235,0.15)'; border = '#2563EB'; color = '#93C5FD'; }

  return (
    <button
      onClick={onClick}
      disabled={revealed}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        width: '100%', background: bg, border: `1.5px solid ${border}`,
        borderRadius: 12, padding: '13px 16px', cursor: revealed ? 'default' : 'pointer',
        color, textAlign: 'left', fontFamily: 'inherit', fontSize: 14,
        transition: 'background .2s, border-color .2s',
        marginBottom: 8,
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: revealed && correct ? '#0D9488' : revealed && selected ? '#EF4444' : 'var(--bg-tertiary)',
        border: `1.5px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 12, color: revealed ? '#fff' : 'var(--text-muted)',
        transition: 'background .2s',
      }}>{label}</span>
      <span style={{ lineHeight: 1.5, paddingTop: 2 }}>{text}</span>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EntranceExamSession() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const state     = location.state || {};

  const {
    mode          = 'daily-mock',   // 'daily-mock' | 'subject-drill' | 'school-past'
    schoolId      = null,
    schoolName    = 'Entrance Exam',
    subject       = null,
    totalQuestions = 50,
    timeLimit      = 60,            // minutes; 0 = untimed
    resumeMode     = false,
    pausedExamId   = null,
    resumeData     = null,
    examName       = 'Entrance Exam',
  } = state;

  const [questions,   setQuestions]   = useState([]);
  const [current,     setCurrent]     = useState(0);
  const [answers,     setAnswers]     = useState({});   // { [qIndex]: optionKey }
  const [revealed,    setRevealed]    = useState({});   // { [qIndex]: true }
  const [flagged,     setFlagged]     = useState([]);
  const [timeLeft,    setTimeLeft]    = useState(timeLimit * 60);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [showExit,    setShowExit]    = useState(false);
  const [showNav,     setShowNav]     = useState(false);
  const timerRef = useRef(null);

  // ── Load questions ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        if (resumeMode && resumeData) {
          // Reconstruct from saved IDs
          const snap = await getDocs(query(
            collection(db, 'entranceQuestions'),
            where('__name__', 'in', resumeData.questionIds.slice(0, 10)),
          ));
          // For >10 IDs we'd need batching; simple approach: fetch all for school/subject
          setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setAnswers(resumeData.answers || {});
          setRevealed(resumeData.revealed || {});
          setFlagged(resumeData.flagged || []);
          setCurrent(resumeData.currentQuestion || 0);
          setTimeLeft(resumeData.timeLeft ?? timeLimit * 60);
          setLoading(false);
          return;
        }

        let q;
        if (mode === 'daily-mock') {
          q = query(
            collection(db, 'entranceQuestions'),
            limit(totalQuestions),
          );
        } else if (mode === 'subject-drill' && schoolId && subject) {
          q = query(
            collection(db, 'entranceQuestions'),
            where('schoolId', '==', schoolId),
            where('subject', '==', subject),
            limit(totalQuestions),
          );
        } else if (schoolId) {
          q = query(
            collection(db, 'entranceQuestions'),
            where('schoolId', '==', schoolId),
            limit(totalQuestions),
          );
        } else {
          q = query(collection(db, 'entranceQuestions'), limit(totalQuestions));
        }

        const snap = await getDocs(q);
        const qs   = shuffle(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (qs.length === 0) {
          setError('No questions found for this selection. Please try another school or subject.');
          setLoading(false);
          return;
        }
        setQuestions(qs);
        if (timeLimit > 0) setTimeLeft(timeLimit * 60);
        setLoading(false);
      } catch (e) {
        console.error('EntranceExamSession load error:', e);
        setError('Failed to load questions. Please go back and try again.');
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || timeLimit === 0 || Object.keys(answers).length === questions.length) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); handleSubmit(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, questions.length]);

  // ── Answer / reveal ────────────────────────────────────────────────────────
  const handleAnswer = (optionKey) => {
    if (revealed[current]) return;
    setAnswers(prev => ({ ...prev, [current]: optionKey }));
    setRevealed(prev => ({ ...prev, [current]: true }));
  };

  const handleFlag = () => {
    setFlagged(prev =>
      prev.includes(current) ? prev.filter(i => i !== current) : [...prev, current],
    );
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (auto = false) => {
    if (!auto && !window.confirm('Submit this exam? You cannot change answers after submitting.')) return;
    clearInterval(timerRef.current);
    setSubmitting(true);

    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] && answers[i] === q.correctAnswer) correct++;
    });
    const total        = questions.length;
    const scorePercent = Math.round((correct / total) * 100);
    const timeTaken    = timeLimit > 0 ? timeLimit * 60 - timeLeft : 0;

    try {
      const sessionRef = await addDoc(collection(db, 'entranceExamSessions'), {
        userId:        user.uid,
        mode,
        schoolId:      schoolId || null,
        schoolName:    schoolName || null,
        subject:       subject   || null,
        examName,
        totalQuestions: total,
        correct,
        scorePercent,
        timeTaken,
        answers,
        questionIds:   questions.map(q => q.id),
        completedAt:   serverTimestamp(),
        isEntrance:    true,
      });

      // Remove paused doc if resuming
      if (pausedExamId) {
        await deleteDoc(doc(db, 'entrancePausedExams', pausedExamId)).catch(() => {});
      }

      navigate('/entrance-exam/review', {
        state: {
          sessionId: sessionRef.id,
          questions,
          answers,
          correct,
          total,
          scorePercent,
          timeTaken,
          schoolName,
          subject,
          examName,
          mode,
        },
      });
    } catch (e) {
      console.error('Submit error:', e);
      setSubmitting(false);
    }
  }, [questions, answers, timeLeft, timeLimit, user, mode, schoolId, schoolName, subject, examName, pausedExamId, navigate]);

  // ── Exit & Save ────────────────────────────────────────────────────────────
  const handleExitSave = async () => {
    clearInterval(timerRef.current);
    try {
      const docRef = pausedExamId
        ? doc(db, 'entrancePausedExams', pausedExamId)
        : doc(collection(db, 'entrancePausedExams'));
      await setDoc(docRef, {
        userId:          user.uid,
        mode,
        schoolId:        schoolId || null,
        schoolName:      schoolName || null,
        subject:         subject   || null,
        examName,
        timeLimit,
        timeLeft,
        totalQuestions:  questions.length,
        answeredCount:   Object.keys(answers).length,
        currentQuestion: current,
        questionIds:     questions.map(q => q.id),
        answers,
        revealed,
        flagged,
        savedAt:         serverTimestamp(),
        isEntrance:      true,
      });
    } catch (e) { console.error('Save error:', e); }
    navigate('/entrance-exam');
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen />;
  if (error)   return <ErrorScreen message={error} onBack={() => navigate('/entrance-exam')} />;

  const q            = questions[current];
  const options      = ['A', 'B', 'C', 'D'];
  const answeredCount = Object.keys(answers).length;
  const progress     = Math.round((answeredCount / questions.length) * 100);
  const isFlagged    = flagged.includes(current);
  const timerWarn    = timeLimit > 0 && timeLeft < 120;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => setShowExit(true)} style={Btn.ghost}>✕</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            🏫 {examName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Q{current + 1} of {questions.length} · {answeredCount} answered
          </div>
        </div>

        {timeLimit > 0 && (
          <div style={{
            padding: '6px 14px', borderRadius: 20,
            background: timerWarn ? 'rgba(239,68,68,0.15)' : 'rgba(13,148,136,0.12)',
            border: `1.5px solid ${timerWarn ? '#EF4444' : '#0D9488'}`,
            color: timerWarn ? '#EF4444' : '#0D9488',
            fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums',
          }}>
            ⏱ {formatTime(timeLeft)}
          </div>
        )}

        <button onClick={() => setShowNav(true)} style={Btn.ghost}>☰</button>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height: 3, background: 'var(--border)' }}>
        <div style={{ height: '100%', background: '#0D9488', width: `${progress}%`, transition: 'width .4s ease' }} />
      </div>

      {/* ── Question ── */}
      <div style={{ flex: 1, padding: '20px', maxWidth: 700, width: '100%', margin: '0 auto' }}>
        {/* Flag badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'rgba(13,148,136,0.12)', color: '#0D9488',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {q?.subject || q?.schoolName || schoolName}
          </span>
          <button
            onClick={handleFlag}
            style={{
              background: isFlagged ? 'rgba(245,158,11,0.15)' : 'transparent',
              border: `1.5px solid ${isFlagged ? '#F59E0B' : 'var(--border)'}`,
              borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
              color: isFlagged ? '#F59E0B' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            {isFlagged ? '🚩 Flagged' : '🏳 Flag'}
          </button>
        </div>

        {/* Question text */}
        <div style={{
          background: 'var(--bg-card)', border: '1.5px solid var(--border)',
          borderRadius: 16, padding: '20px 22px', marginBottom: 20,
          fontSize: 15, lineHeight: 1.7, color: 'var(--text-primary)', fontWeight: 500,
        }}>
          <span style={{ color: '#0D9488', fontWeight: 800, marginRight: 8 }}>{current + 1}.</span>
          {q?.question || q?.text || 'Question text unavailable'}
        </div>

        {/* Options */}
        {options.map(opt => {
          const text = q?.[`option${opt}`] || q?.options?.[opt];
          if (!text) return null;
          return (
            <OptionBtn
              key={opt}
              label={opt}
              text={text}
              selected={answers[current] === opt}
              correct={revealed[current] && q?.correctAnswer === opt}
              revealed={!!revealed[current]}
              onClick={() => handleAnswer(opt)}
            />
          );
        })}

        {/* Explanation */}
        {revealed[current] && q?.explanation && (
          <div style={{
            marginTop: 16, background: 'rgba(13,148,136,0.08)',
            border: '1.5px solid rgba(13,148,136,0.25)',
            borderLeft: '4px solid #0D9488',
            borderRadius: 12, padding: '14px 16px',
            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            <span style={{ fontWeight: 800, color: '#0D9488' }}>💡 Explanation: </span>
            {q.explanation}
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'space-between' }}>
          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            style={{ ...Btn.secondary, opacity: current === 0 ? 0.4 : 1 }}
          >← Prev</button>

          <button
            onClick={() => setShowExit(true)}
            style={Btn.ghost}
          >Exit & Save</button>

          {current < questions.length - 1 ? (
            <button onClick={() => setCurrent(c => c + 1)} style={Btn.primary}>Next →</button>
          ) : (
            <button onClick={() => handleSubmit(false)} disabled={submitting} style={Btn.submit}>
              {submitting ? 'Submitting…' : '✅ Submit'}
            </button>
          )}
        </div>
      </div>

      {/* ── Exit modal ── */}
      {showExit && (
        <Modal onClose={() => setShowExit(false)}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>Leave this exam?</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
              You've answered {answeredCount} of {questions.length} questions.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={handleExitSave} style={Btn.primary}>💾 Exit & Save Progress</button>
              <button onClick={() => handleSubmit(false)} style={Btn.submit}>✅ Submit Now</button>
              <button onClick={() => setShowExit(false)} style={Btn.ghost}>← Keep Going</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Question navigator ── */}
      {showNav && (
        <Modal onClose={() => setShowNav(false)} title="Question Navigator">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
            {questions.map((_, i) => {
              const isAns  = answers[i] !== undefined;
              const isFlag = flagged.includes(i);
              const isCur  = i === current;
              return (
                <button
                  key={i}
                  onClick={() => { setCurrent(i); setShowNav(false); }}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: 8, border: 'none',
                    cursor: 'pointer', fontWeight: 700, fontSize: 12,
                    background: isCur ? '#0D9488' : isFlag ? 'rgba(245,158,11,0.2)' : isAns ? 'rgba(37,99,235,0.2)' : 'var(--bg-tertiary)',
                    color: isCur ? '#fff' : isFlag ? '#F59E0B' : isAns ? '#93C5FD' : 'var(--text-muted)',
                    outline: isCur ? '2px solid #0D9488' : 'none',
                  }}
                >{i + 1}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { color: '#0D9488', label: 'Current' },
              { color: 'rgba(37,99,235,0.5)', label: 'Answered' },
              { color: 'rgba(245,158,11,0.5)', label: 'Flagged' },
              { color: 'var(--bg-tertiary)', label: 'Unanswered' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
                {label}
              </div>
            ))}
          </div>
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            style={{ ...Btn.submit, width: '100%', marginTop: 16 }}
          >
            {submitting ? 'Submitting…' : '✅ Submit Exam'}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function Modal({ children, onClose, title }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVis(true)); }, []);
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 20, padding: 24, width: '100%', maxWidth: 480,
        maxHeight: '85vh', overflowY: 'auto',
        opacity: vis ? 1 : 0, transform: vis ? 'scale(1)' : 'scale(.96)',
        transition: 'opacity .3s, transform .3s',
      }}>
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>{title}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid var(--border)', borderTop: '4px solid #0D9488', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading questions…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorScreen({ message, onBack }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>😕</div>
      <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)' }}>Something went wrong</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360, lineHeight: 1.6 }}>{message}</div>
      <button onClick={onBack} style={Btn.primary}>← Go Back</button>
    </div>
  );
}

const Btn = {
  primary:   { padding: '11px 24px', borderRadius: 10, border: 'none', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { padding: '11px 24px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  ghost:     { padding: '9px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  submit:    { padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0D9488,#2563EB)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
};
