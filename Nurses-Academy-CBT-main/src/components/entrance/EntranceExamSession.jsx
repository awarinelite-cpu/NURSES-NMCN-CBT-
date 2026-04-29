// src/components/exam/EntranceExamSession.jsx
// Route: /entrance-exam/session
//
// LIVE mode (poolMode:true)   — loads from entranceExamQuestions where inDailyBank==true
// REVIEW mode (reviewMode:true) — re-fetches by saved questionIds, shows answers
// RESUME mode (resumeMode:true) — restores paused exam state
//
// On Submit  → saves to 'entranceExamSessions'  (shows in hub Previous Exams)
// On Save+Exit → saves to 'entrancePausedExams' (shows in hub as Continue card)
// VoiceExamMode — reads question+options, listens for A/B/C/D, auto-advances

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation }                  from 'react-router-dom';
import {
  collection, query, where, getDocs,
  addDoc, serverTimestamp, deleteDoc, doc,
}                                                    from 'firebase/firestore';
import { db }                                        from '../../firebase/config';
import { useAuth }                                   from '../../context/AuthContext';
import VoiceExamMode                                 from '../shared/VoiceExamMode';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export default function EntranceExamSession() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user }  = useAuth();
  const state     = location.state || {};

  const {
    poolMode     = false,
    reviewMode   = false,
    examType     = 'entrance_daily_mock',
    examName     = 'Entrance Exam — Daily Mock',
    count        = 20,
    doShuffle    = true,
    savedSession,
    resumeMode   = false,
    pausedExamId = null,
    resumeData   = null,
  } = state;

  const [questions,    setQuestions]    = useState([]);
  const [answers,      setAnswers]      = useState({});
  const [bookmarks,    setBookmarks]    = useState({});
  const [flagged,      setFlagged]      = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navOpen,      setNavOpen]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [result,       setResult]       = useState(null);
  const [showExitModal,setShowExitModal]= useState(false);
  const [exitSaving,   setExitSaving]   = useState(false);

  // Always-fresh refs for async handlers
  const questionsRef    = useRef([]);
  const answersRef      = useRef({});
  const currentIndexRef = useRef(0);
  const flaggedRef      = useRef({});
  questionsRef.current    = questions;
  answersRef.current      = answers;
  currentIndexRef.current = currentIndex;
  flaggedRef.current      = flagged;

  // ── Load questions ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Resume paused exam
        if (resumeMode && resumeData?.questionIds?.length) {
          const ids    = resumeData.questionIds;
          const chunks = [];
          for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
          const snaps  = await Promise.all(chunks.map(ch =>
            getDocs(query(collection(db, 'entranceExamQuestions'), where('__name__', 'in', ch)))
          ));
          const byId = {};
          snaps.forEach(s => s.docs.forEach(d => { byId[d.id] = { id: d.id, ...d.data() }; }));
          setQuestions(ids.map(id => byId[id]).filter(Boolean));
          if (resumeData.answers)      setAnswers(resumeData.answers);
          if (resumeData.currentIndex) setCurrentIndex(resumeData.currentIndex);
          if (resumeData.flagged)      setFlagged(resumeData.flagged);
          if (pausedExamId) deleteDoc(doc(db, 'entrancePausedExams', pausedExamId)).catch(() => {});
          return;
        }

        // Review mode
        if (reviewMode && savedSession?.questionIds?.length) {
          const ids    = savedSession.questionIds;
          const chunks = [];
          for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
          const snaps  = await Promise.all(chunks.map(ch =>
            getDocs(query(collection(db, 'entranceExamQuestions'), where('__name__', 'in', ch)))
          ));
          const byId = {};
          snaps.forEach(s => s.docs.forEach(d => { byId[d.id] = { id: d.id, ...d.data() }; }));
          setQuestions(ids.map(id => byId[id]).filter(Boolean));
          if (savedSession.answers) setAnswers(savedSession.answers);
          setSubmitted(true);
          return;
        }

        // Pool mode (daily mock)
        if (poolMode) {
          const snap = await getDocs(
            query(collection(db, 'entranceExamQuestions'), where('inDailyBank', '==', true))
          );
          let pool = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (doShuffle) pool = pool.sort(() => Math.random() - 0.5);
          setQuestions(pool.slice(0, count));
        }
      } catch (err) {
        console.error('EntranceExamSession load:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total      = questions.length;
  const answered   = Object.keys(answers).length;
  const unanswered = total - answered;
  const currentQ   = questions[currentIndex] || null;
  const progress   = total > 0 ? (answered / total) * 100 : 0;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSelect = (key) => {
    if (submitted || !currentQ) return;
    setAnswers(prev => ({ ...prev, [currentQ.id]: key }));
  };

  // VoiceExamMode gives numeric index 0-3
  const handleVoiceAnswer = (idx) => {
    const key = OPTION_KEYS[idx];
    if (key && !submitted && currentQ) {
      setAnswers(prev => ({ ...prev, [currentQ.id]: key }));
    }
  };

  const handleNext    = () => setCurrentIndex(i => Math.min(total - 1, i + 1));
  const handleBookmark = () => currentQ && setBookmarks(p => ({ ...p, [currentQ.id]: !p[currentQ.id] }));
  const handleFlag     = () => currentQ && setFlagged(p => ({ ...p, [currentQ.id]: !p[currentQ.id] }));

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return;
    const qs  = questionsRef.current;
    const ans = answersRef.current;
    if (!qs.length) return;
    setSubmitting(true);
    try {
      let correct = 0;
      qs.forEach(q => { if (ans[q.id] && ans[q.id] === q.correctAnswer) correct++; });
      const scorePercent = Math.round((correct / qs.length) * 100);
      await addDoc(collection(db, 'entranceExamSessions'), {
        userId:         user?.uid || null,
        examType,
        examName,
        questionIds:    qs.map(q => q.id),
        answers:        ans,
        correct,
        totalQuestions: qs.length,
        scorePercent,
        completedAt:    serverTimestamp(),
      });
      setResult({ correct, total: qs.length, scorePercent });
      setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, submitted, examType, examName, user]);

  // ── Save & Exit ─────────────────────────────────────────────────────────────
  const handleSaveExit = useCallback(async () => {
    const qs  = questionsRef.current;
    const ans = answersRef.current;
    if (!user?.uid || !qs.length) { navigate(-1); return; }
    setExitSaving(true);
    try {
      await addDoc(collection(db, 'entrancePausedExams'), {
        userId:         user.uid,
        examType,
        examName,
        questionIds:    qs.map(q => q.id),
        answers:        ans,
        flagged:        flaggedRef.current,
        currentIndex:   currentIndexRef.current,
        answeredCount:  Object.keys(ans).length,
        totalQuestions: qs.length,
        savedAt:        serverTimestamp(),
      });
      navigate(-1);
    } catch (err) {
      alert('Could not save progress: ' + err.message);
    } finally {
      setExitSaving(false);
    }
  }, [user, examType, examName, navigate]);

  // ── Option styles ────────────────────────────────────────────────────────────
  const getOptionStyle = (key) => {
    const chosen  = answers[currentQ?.id];
    const correct = currentQ?.correctAnswer;
    if (!submitted) {
      return chosen === key
        ? { background: 'rgba(13,148,136,0.15)', border: '1.5px solid var(--teal)', color: 'var(--text-primary)' }
        : { background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' };
    }
    if (key === correct)                   return { background: 'rgba(22,163,74,0.15)',  border: '1.5px solid #16A34A', color: 'var(--text-primary)' };
    if (key === chosen && key !== correct) return { background: 'rgba(239,68,68,0.12)', border: '1.5px solid #EF4444', color: 'var(--text-primary)' };
    return { background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', color: 'var(--text-muted)' };
  };

  const getLetterStyle = (key) => {
    const chosen  = answers[currentQ?.id];
    const correct = currentQ?.correctAnswer;
    if (!submitted) return {
      background: chosen === key ? 'var(--teal)' : 'var(--bg-card)',
      color:      chosen === key ? '#fff' : 'var(--text-muted)',
      border:     `1.5px solid ${chosen === key ? 'var(--teal)' : 'var(--border)'}`,
    };
    if (key === correct)                   return { background: '#16A34A', color: '#fff', border: '1.5px solid #16A34A' };
    if (key === chosen && key !== correct) return { background: '#EF4444', color: '#fff', border: '1.5px solid #EF4444' };
    return { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1.5px solid var(--border)' };
  };

  const navTileStyle = (idx) => {
    const q   = questions[idx];
    const ans = q ? answers[q.id] : undefined;
    if (idx === currentIndex) return { background: 'var(--teal)', color: '#fff', border: '2px solid var(--teal)' };
    if (ans)                  return { background: 'rgba(13,148,136,0.15)', color: 'var(--teal)', border: '2px solid rgba(13,148,136,0.4)' };
    return { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '2px solid var(--border)' };
  };

  // Options as string array for VoiceExamMode
  const voiceOptions = currentQ ? OPTION_KEYS.map(k => currentQ.options?.[k] || '').filter(Boolean) : [];

  // ── Loading / empty ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 16 }}>Loading questions…</div>
    </div>
  );

  if (!loading && total === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>No questions found</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>No questions are in the Daily Mock Bank yet.</p>
      <button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  );

  // ── Result screen ────────────────────────────────────────────────────────────
  if (submitted && result && !reviewMode) {
    const passed = result.scorePercent >= 50;
    return (
      <div style={{ padding: '32px 24px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{passed ? '🎉' : '📖'}</div>
        <h2 style={{ fontFamily: "'Playfair Display',serif", color: 'var(--text-primary)', margin: '0 0 8px' }}>
          {passed ? 'Well Done!' : 'Keep Practising'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28 }}>
          Your result has been saved. You can review it from the entrance exam dashboard.
        </p>
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
          background: passed ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.08)',
          border: `2px solid ${passed ? '#16A34A' : '#EF4444'}`,
          borderRadius: 20, padding: '24px 40px', marginBottom: 28,
        }}>
          <div style={{ fontSize: 52, fontWeight: 900, color: passed ? '#16A34A' : '#EF4444', lineHeight: 1 }}>
            {result.scorePercent}%
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            {result.correct} / {result.total} correct
          </div>
          <div style={{ marginTop: 10, fontSize: 11, fontWeight: 800, letterSpacing: 1, color: passed ? '#16A34A' : '#EF4444', textTransform: 'uppercase' }}>
            {passed ? '✓ PASS' : '✗ FAIL'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ fontWeight: 700 }}>← Back</button>
          <button className="btn btn-primary" onClick={() => { setSubmitted(false); setResult(null); setCurrentIndex(0); }} style={{ fontWeight: 700 }}>
            🔍 Review Answers
          </button>
        </div>
      </div>
    );
  }

  // ── Exit Modal ────────────────────────────────────────────────────────────────
  const ExitModal = () => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🚪</div>
        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>Exit Exam?</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
          Save your progress and continue later from the dashboard, or exit without saving.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={handleSaveExit} disabled={exitSaving} style={{ padding: '13px', borderRadius: 12, cursor: exitSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 15, border: 'none', background: 'var(--teal)', color: '#fff', opacity: exitSaving ? 0.7 : 1 }}>
            {exitSaving ? '💾 Saving…' : '💾 Save & Exit'}
          </button>
          <button onClick={() => { setShowExitModal(false); navigate(-1); }} disabled={exitSaving} style={{ padding: '11px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, border: '1.5px solid rgba(239,68,68,0.5)', background: 'transparent', color: '#EF4444' }}>
            🗑 Exit Without Saving
          </button>
          <button onClick={() => setShowExitModal(false)} disabled={exitSaving} style={{ padding: '10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            ← Keep Taking Exam
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main UI ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {showExitModal && <ExitModal />}

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                {reviewMode ? 'Review' : examName}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              Q{currentIndex + 1} of {total} · {answered} answered
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => reviewMode ? navigate(-1) : setShowExitModal(true)}
              style={{ padding: '7px 14px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.4)', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 5 }}
            >🚪 Exit</button>

            {!reviewMode && !submitted && (
              <button
                onClick={() => { if (window.confirm(`Submit?${unanswered > 0 ? ` ${unanswered} unanswered.` : ''}`)) handleSubmit(); }}
                disabled={submitting}
                style={{ padding: '7px 16px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: submitting ? 'wait' : 'pointer', background: '#EF4444', border: 'none', color: '#fff' }}
              >
                {submitting ? 'Saving…' : 'Submit'}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--border)' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--teal)', borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px' }}>

        {/* Navigator toggle */}
        <button
          onClick={() => setNavOpen(v => !v)}
          style={{ width: '100%', padding: '10px 16px', borderRadius: 12, background: 'var(--bg-card)', border: '1.5px solid var(--border)', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, textAlign: 'left' }}
        >
          {navOpen ? '▲' : '▼'} {navOpen ? 'Hide' : 'Show'} Question Navigator
        </button>

        {navOpen && (
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {questions.map((_, idx) => (
                <button key={idx} onClick={() => setCurrentIndex(idx)} style={{ width: 42, height: 42, borderRadius: 10, fontFamily: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', ...navTileStyle(idx) }}>
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Question card */}
        {currentQ ? (
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '20px 18px', marginBottom: 14 }}>

            {/* Badge + actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: 'var(--teal)' }}>
                {examType.replace(/_/g, ' ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={handleFlag} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: flagged[currentQ.id] ? 1 : 0.35, transition: 'opacity 0.15s' }} title="Flag">🚩</button>
                <button onClick={handleBookmark} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', background: bookmarks[currentQ.id] ? 'rgba(239,68,68,0.12)' : 'var(--bg-tertiary)', border: `1.5px solid ${bookmarks[currentQ.id] ? '#EF4444' : 'var(--border)'}`, color: bookmarks[currentQ.id] ? '#EF4444' : 'var(--text-muted)', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, transition: 'all 0.15s' }}>🔖 Bookmark</button>
              </div>
            </div>

            {/* Question ID */}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: 0.3 }}>· {currentQ.id}</div>

            {/* Diagram */}
            {currentQ.diagramUrl && (
              <div style={{ marginBottom: 14, textAlign: 'center' }}>
                <img src={currentQ.diagramUrl} alt="Diagram" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}

            {/* Question text */}
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: 16 }}>
              {currentQ.questionText}
            </div>

            {/* Voice Mode — live only */}
            {!submitted && (
              <div style={{ marginBottom: 20 }}>
                <VoiceExamMode
                  question={currentQ.questionText || ''}
                  options={voiceOptions}
                  questionId={currentQ.id}
                  onAnswer={handleVoiceAnswer}
                  onNext={handleNext}
                  hasNext={currentIndex < total - 1}
                />
              </div>
            )}

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {OPTION_KEYS.map((key, idx) => {
                const text = currentQ.options?.[key];
                if (!text) return null;
                return (
                  <button
                    key={key}
                    id={`vem-opt-${idx}`}
                    onClick={() => handleSelect(key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, fontFamily: 'inherit', cursor: submitted ? 'default' : 'pointer', textAlign: 'left', transition: 'all 0.15s', ...getOptionStyle(key) }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, ...getLetterStyle(key) }}>
                      {key}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4, flex: 1 }}>{text}</span>
                    {submitted && key === currentQ.correctAnswer && <span style={{ color: '#16A34A', fontWeight: 800 }}>✓</span>}
                    {submitted && key === answers[currentQ.id] && key !== currentQ.correctAnswer && <span style={{ color: '#EF4444', fontWeight: 800 }}>✗</span>}
                  </button>
                );
              })}
            </div>

            {/* Explanation */}
            {submitted && currentQ.explanation && (
              <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 12, background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.25)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', marginBottom: 6 }}>💡 Explanation</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{currentQ.explanation}</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>No questions loaded.</div>
        )}

        {/* Score bar in review mode */}
        {submitted && (
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 14, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {(() => {
              const correct = questions.reduce((a, q) => a + (answers[q.id] === q.correctAnswer ? 1 : 0), 0);
              const pct     = Math.round((correct / total) * 100);
              const passed  = pct >= 50;
              return (
                <>
                  <div style={{ fontSize: 32, fontWeight: 900, color: passed ? '#16A34A' : '#EF4444' }}>{pct}%</div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{correct} / {total} correct</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: passed ? '#16A34A' : '#EF4444' }}>{passed ? '✓ PASS' : '✗ FAIL'}</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 40 }}>
        <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0} style={{ padding: '12px 20px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: currentIndex === 0 ? 'default' : 'pointer', background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', color: currentIndex === 0 ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: currentIndex === 0 ? 0.5 : 1 }}>
          ← Previous
        </button>

        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>{currentIndex + 1} / {total}</span>

        {currentIndex < total - 1 ? (
          <button onClick={handleNext} style={{ padding: '12px 24px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer', background: 'var(--teal)', border: 'none', color: '#fff' }}>
            Next →
          </button>
        ) : !submitted && !reviewMode ? (
          <button onClick={() => { if (window.confirm(`Submit exam?${unanswered > 0 ? ` ${unanswered} unanswered.` : ''}`)) handleSubmit(); }} style={{ padding: '12px 20px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer', background: '#16A34A', border: 'none', color: '#fff' }}>
            ✅ Finish
          </button>
        ) : (
          <button onClick={() => navigate(-1)} style={{ padding: '12px 20px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer', background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', color: 'var(--text-secondary)' }}>
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
