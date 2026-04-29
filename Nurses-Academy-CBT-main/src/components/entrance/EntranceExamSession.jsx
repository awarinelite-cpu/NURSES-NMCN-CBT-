// src/components/exam/EntranceExamSession.jsx
// Route: /entrance-exam/session
//
// Handles both LIVE mode (poolMode: true) and REVIEW mode (reviewMode: true)
// Matches the UI in screenshot 2:
//   - Top header: exam name, Q counter, Exit + Submit buttons
//   - Progress bar
//   - Question Navigator toggle (Show/Hide) + numbered grid
//   - Question card: type badge, flag, bookmark, question text, Read Question TTS
//   - Answer options A / B / C / D
//   - Bottom bar: ← Previous · "1 / 20" · Next →

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation }                   from 'react-router-dom';
import {
  collection, query, where, getDocs,
  addDoc, serverTimestamp,
}                                                     from 'firebase/firestore';
import { db }                                         from '../../firebase/config';
import { useAuth }                                    from '../../context/AuthContext';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export default function EntranceExamSession() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user }  = useAuth();
  const state     = location.state || {};

  const {
    poolMode    = false,
    reviewMode  = false,
    examType    = 'entrance_daily_mock',
    examName    = 'Daily Mock',
    subject     = '',
    count       = 20,
    doShuffle   = true,
    savedSession,
  } = state;

  // ── Core state ─────────────────────────────────────────────────────────────
  const [questions,       setQuestions]       = useState([]);   // array of question objects
  const [answers,         setAnswers]         = useState({});   // { [qId]: 'A'|'B'|'C'|'D' }
  const [bookmarks,       setBookmarks]       = useState({});   // { [qId]: bool }
  const [flagged,         setFlagged]         = useState({});   // { [qId]: bool }
  const [currentIndex,    setCurrentIndex]    = useState(0);
  const [navOpen,         setNavOpen]         = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitted,       setSubmitted]       = useState(false);
  const [result,          setResult]          = useState(null);
  const [speaking,        setSpeaking]        = useState(false);

  const synthRef = useRef(window.speechSynthesis);

  // ── Load questions ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (reviewMode && savedSession) {
          // Re-fetch questions by ID for review
          const { questionIds, answers: savedAnswers } = savedSession;
          const snap = await getDocs(
            query(
              collection(db, 'entranceExamQuestions'),
              where('__name__', 'in', questionIds.slice(0, 10)), // Firestore 'in' limit
            )
          );
          // For full list: chunk into 10s and merge
          let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // Re-order to match original questionIds order
          const map = Object.fromEntries(all.map(q => [q.id, q]));
          all = questionIds.map(id => map[id]).filter(Boolean);
          setQuestions(all);
          setAnswers(savedAnswers || {});
          setSubmitted(true);
        } else if (poolMode) {
          // Fetch from pool
          const snap = await getDocs(
            query(
              collection(db, 'entranceExamQuestions'),
              where('subject',     '==', subject),
              where('inDailyBank', '==', true),
            )
          );
          let pool = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (doShuffle) pool = pool.sort(() => Math.random() - 0.5);
          setQuestions(pool.slice(0, count));
        }
      } catch (err) {
        console.error('Failed to load questions:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const total       = questions.length;
  const answered    = Object.keys(answers).length;
  const currentQ    = questions[currentIndex] || null;
  const progress    = total > 0 ? (answered / total) * 100 : 0;

  // In review mode, determine correctness
  const isCorrect = (q, chosen) => chosen && (q?.correctAnswer || q?.answer) && chosen === (q.correctAnswer || q.answer);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelect = (key) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [currentQ.id]: key }));
  };

  const handleBookmark = () => {
    if (!currentQ) return;
    setBookmarks(prev => ({ ...prev, [currentQ.id]: !prev[currentQ.id] }));
  };

  const handleFlag = () => {
    if (!currentQ) return;
    setFlagged(prev => ({ ...prev, [currentQ.id]: !prev[currentQ.id] }));
  };

  const handleReadQuestion = () => {
    if (!currentQ) return;
    const synth = synthRef.current;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const utter = new SpeechSynthesisUtterance(currentQ.question);
    utter.onend  = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utter);
  };

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      let correct = 0;
      questions.forEach(q => {
        if (answers[q.id] && answers[q.id] === (q.correctAnswer || q.answer)) correct++;
      });
      const scorePercent = Math.round((correct / total) * 100);
      const sessionData = {
        userId:         user?.uid,
        examType,
        examName,
        subject,
        questionIds:    questions.map(q => q.id),
        answers,
        correct,
        totalQuestions: total,
        scorePercent,
        completedAt:    serverTimestamp(),
      };
      await addDoc(collection(db, 'entranceExamSessions'), sessionData);
      setResult({ correct, total, scorePercent });
      setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  }, [answers, examName, examType, questions, subject, submitting, submitted, total, user]);

  const handleExit = () => {
    synthRef.current?.cancel();
    navigate(-1);
  };

  // ── Option styling ─────────────────────────────────────────────────────────
  const getOptionStyle = (key) => {
    const chosen = answers[currentQ?.id];
    const correct = currentQ?.correctAnswer || currentQ?.answer;

    if (!submitted) {
      // Live mode
      const selected = chosen === key;
      return {
        background: selected ? 'rgba(13,148,136,0.15)' : 'var(--bg-tertiary)',
        border:     `1.5px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
        color:      'var(--text-primary)',
      };
    }

    // Review / submitted mode
    if (key === correct) return { background: 'rgba(22,163,74,0.15)',  border: '1.5px solid #16A34A', color: 'var(--text-primary)' };
    if (key === chosen && key !== correct) return { background: 'rgba(239,68,68,0.12)', border: '1.5px solid #EF4444', color: 'var(--text-primary)' };
    return { background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', color: 'var(--text-muted)' };
  };

  const getOptionLetterStyle = (key) => {
    const chosen  = answers[currentQ?.id];
    const correct = currentQ?.correctAnswer || currentQ?.answer;
    if (!submitted) {
      return {
        background: chosen === key ? 'var(--teal)' : 'var(--bg-card)',
        color:      chosen === key ? '#fff' : 'var(--text-muted)',
        border:     `1.5px solid ${chosen === key ? 'var(--teal)' : 'var(--border)'}`,
      };
    }
    if (key === correct)                 return { background: '#16A34A', color: '#fff', border: '1.5px solid #16A34A' };
    if (key === chosen && key !== correct) return { background: '#EF4444', color: '#fff', border: '1.5px solid #EF4444' };
    return { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1.5px solid var(--border)' };
  };

  // Navigator tile color
  const navTileStyle = (idx) => {
    const q   = questions[idx];
    const ans = q ? answers[q.id] : undefined;
    const active = idx === currentIndex;
    if (active) return { background: 'var(--teal)', color: '#fff', border: '2px solid var(--teal)' };
    if (ans)    return { background: 'rgba(13,148,136,0.15)', color: 'var(--teal)', border: '2px solid rgba(13,148,136,0.4)' };
    return { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '2px solid var(--border)' };
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
        <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 16 }}>Loading questions…</div>
      </div>
    );
  }

  // ── Result screen (after submit) ───────────────────────────────────────────
  if (submitted && result && !reviewMode) {
    const passed = result.scorePercent >= 50;
    return (
      <div style={{ padding: '32px 24px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{passed ? '🎉' : '📖'}</div>
        <h2 style={{ fontFamily: "'Playfair Display',serif", color: 'var(--text-primary)', margin: '0 0 8px' }}>
          {passed ? 'Well Done!' : 'Keep Practising'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28 }}>
          You've completed the mock exam.
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
          <div style={{
            marginTop: 10, fontSize: 11, fontWeight: 800, letterSpacing: 1,
            color: passed ? '#16A34A' : '#EF4444', textTransform: 'uppercase',
          }}>
            {passed ? '✓ PASS' : '✗ FAIL'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={handleExit} style={{ fontWeight: 700 }}>
            ← Back to Hub
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setSubmitted(false); setResult(null); setCurrentIndex(0); setAnswers({}); }}
            style={{ fontWeight: 700 }}
          >
            🔍 Review Answers
          </button>
        </div>
      </div>
    );
  }

  // ── Main exam UI ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 56,
        }}>
          {/* Left: name + counter */}
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

          {/* Right: Exit + Submit */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleExit}
              style={{
                padding: '7px 14px', borderRadius: 10, fontFamily: 'inherit',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                background: 'var(--bg-tertiary)',
                border: '1.5px solid var(--border)',
                color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              🚪 Exit
            </button>
            {!reviewMode && (
              <button
                onClick={submitted ? undefined : handleSubmit}
                disabled={submitting || submitted}
                style={{
                  padding: '7px 16px', borderRadius: 10, fontFamily: 'inherit',
                  fontWeight: 800, fontSize: 13, cursor: submitting ? 'wait' : 'pointer',
                  background: '#EF4444', border: 'none', color: '#fff',
                }}
              >
                {submitting ? 'Saving…' : 'Submit'}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--border)', marginBottom: 0 }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'var(--teal)', borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px' }}>

        {/* Question Navigator toggle */}
        <button
          onClick={() => setNavOpen(v => !v)}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: 12,
            background: 'var(--bg-card)', border: '1.5px solid var(--border)',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
            color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 14, textAlign: 'left',
          }}
        >
          {navOpen ? '▲' : '▼'} {navOpen ? 'Hide' : 'Show'} Question Navigator
        </button>

        {/* Navigator grid */}
        {navOpen && (
          <div style={{
            background: 'var(--bg-card)', border: '1.5px solid var(--border)',
            borderRadius: 14, padding: '14px 12px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  style={{
                    width: 42, height: 42, borderRadius: 10,
                    fontFamily: 'inherit', fontWeight: 800, fontSize: 13,
                    cursor: 'pointer', transition: 'all 0.15s',
                    ...navTileStyle(idx),
                  }}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Question card ──────────────────────────────────────────────────── */}
        {currentQ ? (
          <div style={{
            background: 'var(--bg-card)', border: '1.5px solid var(--border)',
            borderRadius: 16, padding: '20px 18px', marginBottom: 14,
          }}>
            {/* Badge row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.3)',
                borderRadius: 20, padding: '4px 12px',
                fontSize: 11, fontWeight: 700, color: 'var(--teal)',
              }}>
                {examType.replace(/_/g, ' ')}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Flag */}
                <button
                  onClick={handleFlag}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 18, opacity: flagged[currentQ.id] ? 1 : 0.35,
                    transition: 'opacity 0.15s',
                  }}
                  title={flagged[currentQ.id] ? 'Unflag' : 'Flag question'}
                >
                  🚩
                </button>
                {/* Bookmark */}
                <button
                  onClick={handleBookmark}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                    background: bookmarks[currentQ.id] ? 'rgba(239,68,68,0.12)' : 'var(--bg-tertiary)',
                    border: `1.5px solid ${bookmarks[currentQ.id] ? '#EF4444' : 'var(--border)'}`,
                    color: bookmarks[currentQ.id] ? '#EF4444' : 'var(--text-muted)',
                    fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
                    transition: 'all 0.15s',
                  }}
                >
                  🔖 Bookmark
                </button>
              </div>
            </div>

            {/* Question ID (small) */}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: 0.3 }}>
              · {currentQ.id}
            </div>

            {/* Question text */}
            <div style={{
              fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
              lineHeight: 1.55, marginBottom: 16,
            }}>
              {currentQ.question}
            </div>

            {/* Read Question TTS */}
            <button
              onClick={handleReadQuestion}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
                background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)',
                color: 'var(--text-secondary)', fontFamily: 'inherit',
                fontWeight: 600, fontSize: 13, marginBottom: 20,
                transition: 'all 0.15s',
              }}
            >
              <span>{speaking ? '⏹️' : '🔊'}</span>
              <span>🎧</span>
              <span>Read Question</span>
            </button>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {OPTION_KEYS.map(key => {
                const text = currentQ[`option${key}`] || currentQ.options?.[key] || currentQ[key];
                if (!text) return null;
                return (
                  <button
                    key={key}
                    onClick={() => handleSelect(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', borderRadius: 12,
                      fontFamily: 'inherit', cursor: submitted ? 'default' : 'pointer',
                      textAlign: 'left', transition: 'all 0.15s',
                      ...getOptionStyle(key),
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800,
                      ...getOptionLetterStyle(key),
                    }}>
                      {key}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>
                      {text}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Explanation (review mode only) */}
            {submitted && currentQ.explanation && (
              <div style={{
                marginTop: 20, padding: '14px 16px', borderRadius: 12,
                background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.25)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', marginBottom: 6 }}>
                  💡 Explanation
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {currentQ.explanation}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            No questions loaded.
          </div>
        )}
      </div>

      {/* ── Bottom navigation bar ────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-primary)', borderTop: '1px solid var(--border)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 40,
      }}>
        <button
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          style={{
            padding: '12px 20px', borderRadius: 12, fontFamily: 'inherit',
            fontWeight: 700, fontSize: 14, cursor: currentIndex === 0 ? 'default' : 'pointer',
            background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)',
            color: currentIndex === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
            opacity: currentIndex === 0 ? 0.5 : 1,
          }}
        >
          ← Previous
        </button>

        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>
          {currentIndex + 1} / {total}
        </span>

        <button
          onClick={() => setCurrentIndex(i => Math.min(total - 1, i + 1))}
          disabled={currentIndex === total - 1}
          style={{
            padding: '12px 24px', borderRadius: 12, fontFamily: 'inherit',
            fontWeight: 800, fontSize: 14, cursor: currentIndex === total - 1 ? 'default' : 'pointer',
            background: currentIndex === total - 1 ? 'var(--bg-tertiary)' : 'var(--teal)',
            border: 'none',
            color: currentIndex === total - 1 ? 'var(--text-muted)' : '#fff',
            opacity: currentIndex === total - 1 ? 0.5 : 1,
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
