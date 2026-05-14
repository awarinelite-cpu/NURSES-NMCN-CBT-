// src/components/entrance/EntranceExamSession.jsx
// Route: /entrance-exam/session
//
// CHANGES:
//  - Added schoolMode: loads questions by schoolId (from EntranceExamSetup)
//  - handleSubmit saves userName + userSchool for leaderboard
//  - handleSaveExit also saves userName + userSchool

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
  const navigate          = useNavigate();
  const location          = useLocation();
  const { user, profile } = useAuth();
  const state             = location.state || {};

  const {
    // existing modes
    poolMode     = false,
    reviewMode   = false,
    resumeMode   = false,
    pausedExamId = null,
    resumeData   = null,
    savedSession,
    // NEW: school past questions mode
    schoolMode   = false,
    schoolId     = null,
    schoolName   = '',
    examYear     = 'all',
    // common
    examType     = 'entrance_daily_mock',
    examName     = 'Entrance Exam — Daily Mock',
    subject      = 'entrance_general',
    count        = 20,
    doShuffle    = true,
    timeLimitMin = 0,
  } = state;

  const [questions,     setQuestions]     = useState([]);
  const [answers,       setAnswers]       = useState({});
  const [bookmarks,     setBookmarks]     = useState({});
  const [flagged,       setFlagged]       = useState({});
  const [currentIndex,  setCurrentIndex]  = useState(0);
  const [navOpen,       setNavOpen]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [result,        setResult]        = useState(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitSaving,    setExitSaving]    = useState(false);
  const [saveError,     setSaveError]     = useState('');

  const questionsRef    = useRef([]);
  const answersRef      = useRef({});
  const currentIndexRef = useRef(0);
  const flaggedRef      = useRef({});
  questionsRef.current    = questions;
  answersRef.current      = answers;
  currentIndexRef.current = currentIndex;
  flaggedRef.current      = flagged;

  // ── Load questions ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {

        // ── RESUME MODE ────────────────────────────────────────────────────
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
          if (pausedExamId) {
            deleteDoc(doc(db, 'entrancePausedExams', pausedExamId)).catch(e =>
              console.warn('Could not delete paused exam doc:', e)
            );
          }
          return;
        }

        // ── REVIEW MODE ────────────────────────────────────────────────────
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
          setResult(null);
          return;
        }

        // ── SCHOOL MODE (School Past Questions) ────────────────────────────
        // Loads questions filtered by schoolId (and optional year)
        if (schoolMode && schoolId) {
          const constraints = [where('schoolId', '==', schoolId)];
          if (examYear && examYear !== 'all') {
            constraints.push(where('year', '==', examYear));
          }
          const snap = await getDocs(
            query(collection(db, 'entranceExamQuestions'), ...constraints)
          );
          let pool = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // fallback: if no results by schoolId, try schoolName
          if (!pool.length && schoolName) {
            const fallbackConstraints = [where('schoolName', '==', schoolName)];
            if (examYear && examYear !== 'all') {
              fallbackConstraints.push(where('year', '==', examYear));
            }
            const fallbackSnap = await getDocs(
              query(collection(db, 'entranceExamQuestions'), ...fallbackConstraints)
            );
            pool = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
          if (doShuffle) pool = pool.sort(() => Math.random() - 0.5);
          setQuestions(pool.slice(0, count));
          return;
        }

        // ── DAILY MOCK POOL MODE ───────────────────────────────────────────
        if (poolMode) {
          const snap = await getDocs(
            query(collection(db, 'entranceExamQuestions'), where('inDailyBank', '==', true))
          );
          let pool = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (doShuffle) pool = pool.sort(() => Math.random() - 0.5);
          setQuestions(pool.slice(0, count));
        }

      } catch (err) {
        console.error('EntranceExamSession load error:', err);
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

  // ── Handlers ──────────────────────────────────────────────────────────[...]
  const handleSelect = (key) => {
    if (submitted || !currentQ) return;
    setAnswers(prev => ({ ...prev, [currentQ.id]: key }));
  };

  const handleVoiceAnswer = useCallback((idxOrKey) => {
    if (submitted) return;
    const qId = questionsRef.current[currentIndexRef.current]?.id;
    if (!qId) return;
    let key;
    if (typeof idxOrKey === 'number') key = OPTION_KEYS[idxOrKey];
    else if (typeof idxOrKey === 'string' && OPTION_KEYS.includes(idxOrKey.toUpperCase())) key = idxOrKey.toUpperCase();
    if (key) setAnswers(prev => ({ ...prev, [qId]: key }));
  }, [submitted]);

  const handleNext     = () => setCurrentIndex(i => Math.min(total - 1, i + 1));
  const handleBookmark = () => currentQ && setBookmarks(p => ({ ...p, [currentQ.id]: !p[currentQ.id] }));
  const handleFlag     = () => currentQ && setFlagged(p => ({ ...p, [currentQ.id]: !p[currentQ.id] }));

  // ── Submit ────────────────────────────────────────────────────────────[...]
  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return;
    const qs  = questionsRef.current;
    const ans = answersRef.current;
    if (!qs.length) return;
    if (!user?.uid) { setSaveError('You must be logged in to save results.'); return; }

    setSubmitting(true);
    setSaveError('');
    try {
      let correct = 0;
      qs.forEach(q => { if (ans[q.id] && ans[q.id] === q.correctAnswer) correct++; });
      const scorePercent = Math.round((correct / qs.length) * 100);

      const payload = {
        userId:         user.uid,
        userName:       profile?.name || user.displayName || user.email?.split('@')[0] || 'Student',
        userSchool:     profile?.school || '',
        examType,
        examName,
        subject,
        // school exam extra fields (ignored for daily mock)
        ...(schoolMode ? { schoolId, schoolName } : {}),
        questionIds:    qs.map(q => q.id),
        answers:        ans,
        correct,
        totalQuestions: qs.length,
        scorePercent,
        completedAt:    serverTimestamp(),
      };

      await addDoc(collection(db, 'entranceExamSessions'), payload);

      setResult({ correct, total: qs.length, scorePercent });
      setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err.code, err.message, err);
      setSaveError(`Failed to save (${err.code || err.message}). Check your connection and try again.`);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, submitted, examType, examName, subject, schoolMode, schoolId, schoolName, user, profile]);

  // ── Save & Exit ──────────────────────────────────────────────────────────
  const handleSaveExit = useCallback(async () => {
    const qs  = questionsRef.current;
    const ans = answersRef.current;
    if (!qs.length) { navigate(-1); return; }
    if (!user?.uid) { navigate(-1); return; }

    setExitSaving(true);
    setSaveError('');
    try {
      const payload = {
        userId:         user.uid,
        userName:       profile?.name || user.displayName || user.email?.split('@')[0] || 'Student',
        userSchool:     profile?.school || '',
        examType,
        examName,
        subject,
        ...(schoolMode ? { schoolId, schoolName } : {}),
        questionIds:    qs.map(q => q.id),
        answers:        ans,
        flagged:        flaggedRef.current,
        currentIndex:   currentIndexRef.current,
        answeredCount:  Object.keys(ans).length,
        totalQuestions: qs.length,
        savedAt:        serverTimestamp(),
      };

      await addDoc(collection(db, 'entrancePausedExams'), payload);
      setExitSaving(false);
      navigate(-1);
    } catch (err) {
      console.error('Save+Exit error:', err.code, err.message, err);
      setSaveError(`Could not save progress (${err.code || err.message}). Check connection.`);
      setExitSaving(false);
    }
  }, [user, profile, examType, examName, subject, schoolMode, schoolId, schoolName, navigate]);

  // ── Option styles ────────────────────────────────────────────────────────–[...]
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

  const voiceOptions = currentQ ? OPTION_KEYS.map(k => currentQ.options?.[k] || '').filter(Boolean) : [];

  // ── Loading ──────────────────────────────────────────────────────────–[...]
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 16, fontFamily: "'Times New Roman',Times,serif", fontWeight: 700 }}>Loading questions…</div>
    </div>
  );

  if (!loading && total === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontFamily: "'Arial Black',Arial,sans-serif" }}>No questions found</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontFamily: "'Times New Roman',Times,serif", fontWeight: 700 }}>
        {schoolMode
          ? `No questions found for ${schoolName}${examYear && examYear !== 'all' ? ` (${examYear})` : ''}.`
          : 'No questions are in the Daily Mock Bank yet.'}
      </p>
      <button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  );

  // ── Result screen ────────────────────────────────────────────────────────–[...]
  if (submitted && result && !reviewMode) {
    const passed       = result.scorePercent >= 50;
    const breakdown    = questions.map((q, i) => {
      const chosen  = answers[q.id];
      const correct = q.correctAnswer;
      const isRight = chosen && chosen === correct;
      return { q, i, chosen, correct, isRight };
    });
    const correctCount = breakdown.filter(b => b.isRight).length;
    const wrongCount   = breakdown.filter(b => b.chosen && !b.isRight).length;
    const skippedCount = breakdown.filter(b => !b.chosen).length;

    return (
      <div style={{ padding: '24px 16px', maxWidth: 680, margin: '0 auto', fontFamily: "'Times New Roman',Times,serif" }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>{passed ? '🎉' : '📖'}</div>
          <h2 style={{ fontFamily: "'Arial Black',Arial,sans-serif", fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            {passed ? 'Well Done!' : 'Keep Practising'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px', fontWeight: 700 }}>
            Your result has been saved. Review all questions below.
          </p>

          <div style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
            background: passed ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.08)',
            border: `2px solid ${passed ? '#16A34A' : '#EF4444'}`,
            borderRadius: 20, padding: '20px 40px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: passed ? '#16A34A' : '#EF4444', lineHeight: 1, fontFamily: "'Arial Black',Arial,sans-serif" }}>
              {result.scorePercent}%
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6, fontWeight: 700 }}>
              {result.correct} / {result.total} correct
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, letterSpacing: 1, color: passed ? '#16A34A' : '#EF4444', textTransform: 'uppercase' }}>
              {passed ? '✓ PASS' : '✗ FAIL'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { label: 'Correct',  value: correctCount,  color: '#16A34A', bg: 'rgba(22,163,74,0.1)',       icon: '✅' },
              { label: 'Wrong',    value: wrongCount,    color: '#EF4444', bg: 'rgba(239,68,68,0.08)',      icon: '❌' },
              { label: 'Skipped',  value: skippedCount,  color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',      icon: '⏭' },
              { label: 'Total',    value: result.total,  color: 'var(--teal)', bg: 'rgba(13,148,136,0.08)', icon: '📝' },
            ].map(s => (
              <div key={s.label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                background: s.bg, border: `1.5px solid ${s.color}33`,
                borderRadius: 12, padding: '10px 16px', minWidth: 70,
              }}>
                <div style={{ fontSize: 16 }}>{s.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1.2, fontFamily: "'Arial Black',Arial,sans-serif" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
            <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ fontWeight: 700, fontFamily: "'Times New Roman',Times,serif" }}>← Back</button>
            <button className="btn btn-primary" onClick={() => { setResult(null); setCurrentIndex(0); }} style={{ fontWeight: 700, fontFamily: "'Times New Roman',Times,serif" }}>
              🔍 Review All Answers
            </button>
          </div>
        </div>

        {/* Per-question breakdown */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--text-primary)', marginBottom: 14, fontFamily: "'Arial Black',Arial,sans-serif" }}>
            📋 Question-by-Question Breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {breakdown.map(({ q, i, chosen, correct, isRight }) => (
              <div key={q.id} style={{
                background: 'var(--bg-card)',
                border: `1.5px solid ${isRight ? 'rgba(22,163,74,0.3)' : chosen ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                borderLeft: `4px solid ${isRight ? '#16A34A' : chosen ? '#EF4444' : '#F59E0B'}`,
                borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{
                    flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                    background: isRight ? 'rgba(22,163,74,0.15)' : chosen ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900, fontFamily: "'Arial Black',Arial,sans-serif",
                    color: isRight ? '#16A34A' : chosen ? '#EF4444' : '#F59E0B',
                  }}>{i + 1}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.55, flex: 1, fontFamily: "'Times New Roman',Times,serif" }}>
                    {q.questionText}
                  </div>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{isRight ? '✅' : chosen ? '❌' : '⏭'}</span>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 36 }}>
                  {OPTION_KEYS.map(key => {
                    const text = q.options?.[key];
                    if (!text) return null;
                    const isCorrectKey = key === correct;
                    const isChosenKey  = key === chosen;
                    let bg = 'var(--bg-tertiary)', border = 'var(--border)', color = 'var(--text-muted)', weight = 700;
                    if (isCorrectKey)                 { bg = 'rgba(22,163,74,0.15)'; border = '#16A34A'; color = '#16A34A'; }
                    if (isChosenKey && !isCorrectKey) { bg = 'rgba(239,68,68,0.12)'; border = '#EF4444'; color = '#EF4444'; }
                    return (
                      <div key={key} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: 8, fontSize: 13,
                        background: bg, border: `1px solid ${border}`, color, fontWeight: weight,
                        fontFamily: "'Times New Roman',Times,serif",
                      }}>
                        <span style={{ fontWeight: 900 }}>{key}.</span> {text}
                        {isCorrectKey && <span>✓</span>}
                        {isChosenKey && !isCorrectKey && <span>✗</span>}
                      </div>
                    );
                  })}
                </div>

                <div style={{ paddingLeft: 36, marginTop: 8, fontSize: 13, fontWeight: 700, fontFamily: "'Times New Roman',Times,serif" }}>
                  {!chosen
                    ? <span style={{ color: '#F59E0B' }}>⏭ Skipped — Correct: <strong style={{ color: '#16A34A' }}>{correct}</strong></span>
                    : isRight
                      ? <span style={{ color: '#16A34A' }}>✓ Your answer: <strong>{chosen}</strong> — Correct!</span>
                      : <span style={{ color: '#EF4444' }}>✗ Your answer: <strong>{chosen}</strong> — Correct: <strong style={{ color: '#16A34A' }}>{correct}</strong></span>
                  }
                </div>

                {q.explanation && (
                  <div style={{
                    marginTop: 10, marginLeft: 36, padding: '10px 12px',
                    borderRadius: 8, background: 'rgba(13,148,136,0.08)',
                    border: '1px solid rgba(13,148,136,0.2)',
                    fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.5,
                    fontFamily: "'Times New Roman',Times,serif",
                  }}>
                    💡 {q.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ fontWeight: 700, fontFamily: "'Times New Roman',Times,serif" }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Exit Modal ─────────────────────────────────────────────────────────–[...]
  const ExitModal = () => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🚪</div>
        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: "'Arial Black',Arial,sans-serif", fontWeight: 900 }}>Exit Exam?</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, margin: '0 0 4px', lineHeight: 1.6, fontFamily: "'Times New Roman',Times,serif", fontWeight: 700 }}>
          Save your progress and continue later, or exit without saving.
        </p>

        {saveError ? (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#EF4444', lineHeight: 1.5 }}>
            ⚠️ {saveError}
          </div>
        ) : <div style={{ marginBottom: 24 }} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={handleSaveExit} disabled={exitSaving}
            style={{ padding: '13px', borderRadius: 12, cursor: exitSaving ? 'not-allowed' : 'pointer', fontFamily: "'Times New Roman',Times,serif", fontWeight: 800, fontSize: 15, border: 'none', background: 'var(--teal)', color: '#fff', opacity: exitSaving ? 0.7 : 1 }}>
            {exitSaving ? '💾 Saving…' : '💾 Save & Exit'}
          </button>
          <button onClick={() => { setShowExitModal(false); navigate(-1); }} disabled={exitSaving}
            style={{ padding: '11px', borderRadius: 12, cursor: 'pointer', fontFamily: "'Times New Roman',Times,serif", fontWeight: 700, fontSize: 14, border: '1.5px solid rgba(239,68,68,0.5)', background: 'transparent', color: '#EF4444' }}>
            🗑 Exit Without Saving
          </button>
          <button onClick={() => { setShowExitModal(false); setSaveError(''); }} disabled={exitSaving}
            style={{ padding: '10px', borderRadius: 12, cursor: 'pointer', fontFamily: "'Times New Roman',Times,serif", fontWeight: 700, fontSize: 14, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
            ← Keep Taking Exam
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main UI ──────────────────────────────────────────────────────────–[...]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: "'Times New Roman',Times,serif" }}>

      {showExitModal && <ExitModal />}

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 58 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>{schoolMode ? '🏫' : '⚡'}</span>
              <span style={{ fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', fontFamily: "'Arial Black',Arial,sans-serif" }}>
                {reviewMode ? 'Review' : examName}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, fontWeight: 700 }}>
              Q{currentIndex + 1} of {total} · {answered} answered
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => reviewMode ? navigate(-1) : setShowExitModal(true)}
              style={{ padding: '7px 14px', borderRadius: 10, fontFamily: "'Times New Roman',Times,serif", fontWeight: 700, fontSize: 13, cursor: 'pointer', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--text-primary)' }}
            >🚪 Exit</button>

            {!reviewMode && !submitted && (
              <button
                onClick={() => { if (window.confirm(`Submit?${unanswered > 0 ? ` ${unanswered} unanswered.` : ''}`)) handleSubmit(); }}
                disabled={submitting}
                style={{ padding: '7px 16px', borderRadius: 10, fontFamily: "'Times New Roman',Times,serif", fontWeight: 800, fontSize: 13, cursor: submitting ? 'wait' : 'pointer', background: '#16A34A', border: 'none', color: '#fff', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Saving…' : 'Submit'}
              </button>
            )}
          </div>
        </div>

        <div style={{ height: 3, background: 'var(--border)' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--teal)', borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {saveError && !showExitModal && (
        <div style={{ background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)', padding: '10px 16px', fontSize: 13, color: '#EF4444', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
          ⚠️ {saveError}
          <button onClick={() => setSaveError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px' }}>

        {submitted && !result && (
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '14px 18px', marginBottom: 14, display: 'flex', gap: 16, alignItems: 'center' }}>
            {(() => {
              const correct = questions.reduce((a, q) => a + (answers[q.id] === q.correctAnswer ? 1 : 0), 0);
              const p       = Math.round((correct / total) * 100);
              const passed  = p >= 50;
              return (
                <>
                  <div style={{ fontSize: 28, fontWeight: 900, color: passed ? '#16A34A' : '#EF4444', fontFamily: "'Arial Black',Arial,sans-serif" }}>{p}%</div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>{correct} / {total} correct</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: passed ? '#16A34A' : '#EF4444' }}>{passed ? '✓ PASS' : '✗ FAIL'}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginLeft: 'auto' }}>← Back</button>
                </>
              );
            })()}
          </div>
        )}

        {/* Navigator toggle */}
        <button
          onClick={() => setNavOpen(v => !v)}
          style={{ width: '100%', padding: '10px 16px', borderRadius: 12, background: 'var(--bg-card)', border: '1.5px solid var(--border)', fontFamily: "'Times New Roman',Times,serif", fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          {navOpen ? '▲' : '▼'} {navOpen ? 'Hide' : 'Show'} Question Navigator
        </button>

        {navOpen && (
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '14px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {questions.map((_, idx) => (
                <button key={idx} onClick={() => setCurrentIndex(idx)} style={{ width: 42, height: 42, borderRadius: 10, fontFamily: "'Times New Roman',Times,serif", fontWeight: 800, fontSize: 13, cursor: 'pointer', ...navTileStyle(idx) }}>
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Question card */}
        {currentQ ? (
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '20px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: 'var(--teal)' }}>
                {examType.replace(/_/g, ' ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={handleFlag} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: flagged[currentQ.id] ? 1 : 0.35, transition: 'opacity 0.15s' }}>🚩</button>
                <button onClick={handleBookmark} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', background: bookmarks[currentQ.id] ? 'rgba(59,130,246,0.2)' : 'var(--bg-tertiary)', border: bookmarks[currentQ.id] ? '1px solid #3B82F6' : '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: "'Times New Roman',Times,serif", fontWeight: 700, fontSize: 13 }}>
                  🔖 Bookmark
                </button>
              </div>
            </div>

            {currentQ.diagramUrl && (
              <div style={{ marginBottom: 14, textAlign: 'center' }}>
                <img src={currentQ.diagramUrl} alt="Diagram" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}

            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 16, fontFamily: "'Times New Roman',Times,serif" }}>
              {currentQ.questionText}
            </div>

            {!submitted && (
              <div style={{ marginBottom: 20 }}>
                <VoiceExamMode
                  question={currentQ.questionText || ''}
                  options={voiceOptions}
                  questionId={currentQ.id}
                  onAnswer={handleVoiceAnswer}
                  onNext={handleNext}
                  hasNext={currentIndex < total - 1}
                  continuousListen={true}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {OPTION_KEYS.map((key, idx) => {
                const text = currentQ.options?.[key];
                if (!text) return null;
                return (
                  <button
                    key={key}
                    id={`vem-opt-${idx}`}
                    onClick={() => handleSelect(key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, fontFamily: "'Times New Roman',Times,serif", cursor: submitted ? 'default' : 'pointer', ...getOptionStyle(key) }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, ...getLetterStyle(key) }}>
                      {key}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, flex: 1 }}>{text}</span>
                    {submitted && key === currentQ.correctAnswer && <span style={{ color: '#16A34A', fontWeight: 800 }}>✓</span>}
                    {submitted && key === answers[currentQ.id] && key !== currentQ.correctAnswer && <span style={{ color: '#EF4444', fontWeight: 800 }}>✗</span>}
                  </button>
                );
              })}
            </div>

            {submitted && currentQ.explanation && (
              <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 12, background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.25)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginBottom: 6, fontFamily: "'Times New Roman',Times,serif" }}>💡 Explanation</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: "'Times New Roman',Times,serif" }}>{currentQ.explanation}</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontWeight: 700 }}>No questions loaded.</div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          style={{ padding: '12px 20px', borderRadius: 12, fontFamily: "'Times New Roman',Times,serif", fontWeight: 700, fontSize: 14, cursor: currentIndex === 0 ? 'default' : 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', opacity: currentIndex === 0 ? 0.5 : 1 }}
        >← Previous</button>

        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', fontFamily: "'Times New Roman',Times,serif" }}>{currentIndex + 1} / {total}</span>

        {currentIndex < total - 1 ? (
          <button onClick={handleNext} style={{ padding: '12px 24px', borderRadius: 12, fontFamily: "'Times New Roman',Times,serif", fontWeight: 800, fontSize: 14, cursor: 'pointer', background: 'var(--teal)', border: 'none', color: '#fff' }}>
            Next →
          </button>
        ) : !submitted && !reviewMode ? (
          <button
            onClick={() => { if (window.confirm(`Submit exam?${unanswered > 0 ? ` ${unanswered} unanswered.` : ''}`)) handleSubmit(); }}
            style={{ padding: '12px 20px', borderRadius: 12, fontFamily: "'Times New Roman',Times,serif", fontWeight: 800, fontSize: 14, cursor: 'pointer', background: '#16A34A', border: 'none', color: '#fff' }}
          >✅ Finish</button>
        ) : (
          <button onClick={() => navigate(-1)} style={{ padding: '12px 20px', borderRadius: 12, fontFamily: "'Times New Roman',Times,serif", fontWeight: 700, fontSize: 14, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
