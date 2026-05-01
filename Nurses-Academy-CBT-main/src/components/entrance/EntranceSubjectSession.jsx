// src/components/entrance/EntranceSubjectSession.jsx
// Route: /entrance-exam/subject-session
//
// Features:
//  - Countdown timer (timeLimitMin × 60 seconds, auto-submits on expiry)
//  - Exit button (confirm dialog, no save)
//  - Submit button (confirm unanswered count)
//  - Question Navigator (show/hide toggle)
//  - Flag (🚩) + Bookmark per question
//  - "Read Question" TTS button
//  - A/B/C/D answer picker with colour feedback
//  - Previous / Next / Finish navigation
//  - Result screen with full per-question breakdown
//  - Saves to Firestore: users/{uid}/entranceSubjectDrills

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation }                  from 'react-router-dom';
import { useAuth }                                   from '../../context/AuthContext';
import {
  collection, getDocs, query, where, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

const OPT_KEYS = ['A', 'B', 'C', 'D'];

function pad2(n) { return String(n).padStart(2, '0'); }
function formatTime(s) { return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; }

// ── Text-to-Speech helper ────────────────────────────────────────────────────
let utterance = null;
function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
function stopSpeech() { window.speechSynthesis?.cancel(); }

// ── Main Component ───────────────────────────────────────────────────────────
export default function EntranceSubjectSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const {
    subject      = { name: 'Unknown', icon: '📚', color: '#0D9488' },
    count        = 20,
    timeLimitMin = 20,
  } = location.state || {};

  // ── State ─────────────────────────────────────────────────────────────────
  const [questions,    setQuestions]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');
  const [answers,      setAnswers]      = useState({});   // qId → optKey
  const [bookmarks,    setBookmarks]    = useState({});   // qId → bool
  const [flagged,      setFlagged]      = useState({});   // qId → bool
  const [current,      setCurrent]      = useState(0);
  const [navOpen,      setNavOpen]      = useState(false);
  const [timeLeft,     setTimeLeft]     = useState(timeLimitMin * 60);
  const [submitted,    setSubmitted]    = useState(false);
  const [result,       setResult]       = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [showReview,   setShowReview]   = useState(false);

  const timerRef     = useRef(null);
  const questionsRef = useRef([]);
  const answersRef   = useRef({});
  questionsRef.current = questions;
  answersRef.current   = answers;

  // ── Load Questions ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'entranceExamQuestions'), where('subject', '==', subject.name))
        );
        let all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (all.length === 0) { setLoadError(`No questions found for ${subject.name}.`); return; }
        all = all.sort(() => Math.random() - 0.5).slice(0, Math.min(count, all.length));
        setQuestions(all);
      } catch (e) {
        setLoadError('Failed to load questions: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
    return () => { stopSpeech(); clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Countdown Timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || submitted || questions.length === 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          doSubmit();   // auto-submit
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, submitted, questions.length]);

  // Timer colour: red <60s, orange <120s, teal otherwise
  const timerColor = timeLeft < 60 ? '#EF4444' : timeLeft < 120 ? '#F59E0B' : '#0D9488';

  // ── Submit Logic ──────────────────────────────────────────────────────────
  const doSubmit = useCallback(async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    clearInterval(timerRef.current);
    stopSpeech();

    const qs  = questionsRef.current;
    const ans = answersRef.current;
    let correct = 0;
    const breakdown = qs.map((q, i) => {
      const chosen    = ans[q.id] || null;
      const isCorrect = chosen === q.correctAnswer;
      if (isCorrect) correct++;
      return { q, i, chosen, correct: q.correctAnswer, isCorrect };
    });
    const score = qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0;
    const res   = { subject: subject.name, score, correct, total: qs.length, breakdown };

    // Save to Firestore
    if (user?.uid) {
      try {
        await addDoc(collection(db, 'users', user.uid, 'entranceSubjectDrills'), {
          subject:        subject.name,
          score,
          correct,
          totalQuestions: qs.length,
          answers:        ans,
          questionIds:    qs.map(q => q.id),
          createdAt:      serverTimestamp(),
        });
      } catch (e) { console.warn('Could not save drill result:', e); }
    }

    setResult(res);
    setSubmitted(true);
    setSubmitting(false);
  }, [submitting, submitted, subject, user]);

  const handleSubmit = useCallback(() => {
    const unanswered = questions.length - Object.keys(answers).length;
    const msg = unanswered > 0
      ? `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`
      : 'Submit exam now?';
    if (window.confirm(msg)) doSubmit();
  }, [questions, answers, doSubmit]);

  // ── Answer / Nav helpers ──────────────────────────────────────────────────
  const handleSelect = (key) => {
    if (submitted) return;
    const qId = questions[current]?.id;
    if (!qId) return;
    setAnswers(prev => ({ ...prev, [qId]: key }));
  };

  const handleExit = () => {
    if (window.confirm('Exit drill? Your progress will be lost.')) {
      stopSpeech();
      clearInterval(timerRef.current);
      navigate(-1);
    }
  };

  const handleReadQuestion = () => {
    const q = questions[current];
    if (!q) return;
    if (isSpeaking) { stopSpeech(); setIsSpeaking(false); return; }
    const opts = OPT_KEYS.map(k => q.options?.[k] ? `Option ${k}: ${q.options[k]}` : '').filter(Boolean).join('. ');
    speakText(`${q.questionText}. ${opts}`);
    setIsSpeaking(true);
    const u = new SpeechSynthesisUtterance('');
    u.onend = () => setIsSpeaking(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const total       = questions.length;
  const answered    = Object.keys(answers).length;
  const currentQ    = questions[current] || null;
  const progress    = total > 0 ? (answered / total) * 100 : 0;

  // Option style helpers
  const getOptStyle = (key) => {
    if (!currentQ) return {};
    const chosen  = answers[currentQ.id];
    const correct = currentQ.correctAnswer;
    if (!submitted) {
      return chosen === key
        ? { background: subject.color + '22', border: `2px solid ${subject.color}`, color: '#fff' }
        : { background: 'rgba(255,255,255,0.03)', border: '2px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.82)' };
    }
    if (key === correct)                   return { background: 'rgba(22,163,74,0.14)', border: '2px solid #16A34A', color: '#fff' };
    if (key === chosen && key !== correct) return { background: 'rgba(239,68,68,0.12)', border: '2px solid #EF4444', color: '#fff' };
    return { background: 'rgba(255,255,255,0.03)', border: '2px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)' };
  };

  const getLetterStyle = (key) => {
    if (!currentQ) return {};
    const chosen  = answers[currentQ.id];
    const correct = currentQ.correctAnswer;
    if (!submitted) return {
      background: chosen === key ? subject.color : 'rgba(255,255,255,0.1)',
      color:      chosen === key ? '#fff' : 'rgba(255,255,255,0.4)',
    };
    if (key === correct)                   return { background: '#16A34A', color: '#fff' };
    if (key === chosen && key !== correct) return { background: '#EF4444', color: '#fff' };
    return { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.3)' };
  };

  const navTileStyle = (idx) => {
    const q   = questions[idx];
    const ans = q ? answers[q.id] : undefined;
    if (idx === current) return { background: subject.color, color: '#fff', border: `2px solid ${subject.color}` };
    if (ans)             return { background: subject.color + '20', color: subject.color, border: `2px solid ${subject.color}55` };
    return { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '2px solid rgba(255,255,255,0.07)' };
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 16 }}>
      <div className="spinner" style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: `3px solid ${subject.color}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading {subject.name} questions…</p>
    </div>
  );

  if (loadError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
      <h3 style={{ color: '#fff', marginBottom: 8 }}>Could not load questions</h3>
      <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>{loadError}</p>
      <button onClick={() => navigate(-1)} style={{ padding: '10px 24px', background: '#0D9488', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>← Go Back</button>
    </div>
  );

  // ── Result Screen ─────────────────────────────────────────────────────────
  if (submitted && result) {
    const passed     = result.score >= 50;
    const scoreColor = result.score >= 70 ? '#10B981' : result.score >= 50 ? '#F59E0B' : '#EF4444';
    const correctC   = result.breakdown.filter(b => b.isCorrect).length;
    const wrongC     = result.breakdown.filter(b => b.chosen && !b.isCorrect).length;
    const skippedC   = result.breakdown.filter(b => !b.chosen).length;

    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px 56px', color: '#fff', fontFamily: "'Inter', sans-serif" }}>

        {/* Score hero */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>{result.score >= 70 ? '🏆' : result.score >= 50 ? '🎯' : '💪'}</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", margin: '0 0 4px', fontSize: 26 }}>
            {passed ? 'Well Done!' : 'Keep Practising'}
          </h2>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
            {subject.icon} {result.subject} Drill
          </div>

          {/* Big score */}
          <div style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
            background: passed ? 'rgba(22,163,74,0.09)' : 'rgba(239,68,68,0.07)',
            border: `2px solid ${scoreColor}55`,
            borderRadius: 20, padding: '20px 44px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{result.score}%</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
              {result.correct} / {result.total} correct
            </div>
            <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1, color: scoreColor, textTransform: 'uppercase' }}>
              {passed ? '✓ PASS' : '✗ FAIL'}
            </div>
          </div>

          {/* Stat pills */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            {[
              { label: 'Correct',  v: correctC,  color: '#10B981', bg: 'rgba(16,185,129,0.08)',  icon: '✅' },
              { label: 'Wrong',    v: wrongC,    color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   icon: '❌' },
              { label: 'Skipped',  v: skippedC,  color: '#F59E0B', bg: 'rgba(245,158,11,0.09)',  icon: '⏭' },
              { label: 'Total',    v: result.total, color: subject.color, bg: subject.color + '12', icon: '📝' },
            ].map(st => (
              <div key={st.label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                background: st.bg, border: `1.5px solid ${st.color}33`,
                borderRadius: 12, padding: '10px 16px', minWidth: 72,
              }}>
                <div style={{ fontSize: 16 }}>{st.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: st.color, lineHeight: 1.2 }}>{st.v}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>{st.label}</div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
            <button onClick={() => navigate(-1)} style={btn.ghost}>← Back</button>
            <button onClick={() => setShowReview(v => !v)} style={{ ...btn.primary, background: subject.color }}>
              {showReview ? 'Hide Review' : '📋 Review Answers'}
            </button>
            <button onClick={() => navigate('/entrance-exam/subject-drill')} style={btn.ghost}>🔄 Drill Again</button>
          </div>
        </div>

        {/* Per-question breakdown */}
        {showReview && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 14 }}>
              📋 Question-by-Question Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.breakdown.map(({ q, i, chosen, correct, isCorrect }) => (
                <div key={q.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${isCorrect ? 'rgba(22,163,74,0.25)' : chosen ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                  borderLeft: `4px solid ${isCorrect ? '#16A34A' : chosen ? '#EF4444' : '#F59E0B'}`,
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{
                      flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                      background: isCorrect ? 'rgba(22,163,74,0.15)' : chosen ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                      color: isCorrect ? '#16A34A' : chosen ? '#EF4444' : '#F59E0B',
                    }}>{i + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5, flex: 1 }}>{q.questionText}</div>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{isCorrect ? '✅' : chosen ? '❌' : '⏭'}</span>
                  </div>

                  {/* Option pills */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 34, marginBottom: 8 }}>
                    {OPT_KEYS.map(key => {
                      const text = q.options?.[key];
                      if (!text) return null;
                      const isCorr = key === correct;
                      const isChos = key === chosen;
                      let bg = 'rgba(255,255,255,0.04)', border = 'rgba(255,255,255,0.08)', color = 'rgba(255,255,255,0.4)', weight = 400;
                      if (isCorr)              { bg = 'rgba(22,163,74,0.13)'; border = '#16A34A'; color = '#16A34A'; weight = 700; }
                      if (isChos && !isCorr)   { bg = 'rgba(239,68,68,0.1)'; border = '#EF4444'; color = '#EF4444'; weight = 700; }
                      return (
                        <div key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, fontSize: 12, background: bg, border: `1px solid ${border}`, color, fontWeight: weight }}>
                          <span style={{ fontWeight: 800 }}>{key}.</span> {text}
                          {isCorr && <span>✓</span>}
                          {isChos && !isCorr && <span>✗</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ paddingLeft: 34, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    {!chosen
                      ? <span style={{ color: '#F59E0B' }}>⏭ Skipped — Correct: <strong style={{ color: '#16A34A' }}>{correct}</strong></span>
                      : isCorrect
                        ? <span style={{ color: '#16A34A' }}>✓ Your answer: <strong>{chosen}</strong> — Correct!</span>
                        : <span style={{ color: '#EF4444' }}>✗ Your answer: <strong>{chosen}</strong> — Correct: <strong style={{ color: '#16A34A' }}>{correct}</strong></span>
                    }
                  </div>

                  {q.explanation && (
                    <div style={{ marginTop: 10, marginLeft: 34, padding: '10px 12px', borderRadius: 8, background: 'rgba(13,148,136,0.07)', border: '1px solid rgba(13,148,136,0.18)', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>
                      💡 {q.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 24 }}>
          <button onClick={() => navigate(-1)} style={btn.ghost}>← Back to Dashboard</button>
        </div>
      </div>
    );
  }

  // ── Exam UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-primary, #0A1628)', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Top row: exam name | timer | Exit | Submit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 58, flexWrap: 'nowrap' }}>

          {/* Left: name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ color: subject.color, marginRight: 6 }}>{subject.icon}</span>
              {subject.name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
              Q{current + 1} of {total} · {answered} answered
            </div>
          </div>

          {/* Timer */}
          <div style={{
            fontFamily: 'monospace', fontSize: 22, fontWeight: 900,
            color: timerColor,
            background: timerColor + '18',
            border: `1.5px solid ${timerColor}44`,
            padding: '4px 12px', borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>⏱</span>
            {formatTime(timeLeft)}
          </div>

          {/* Exit */}
          <button
            onClick={handleExit}
            style={{
              padding: '7px 14px', borderRadius: 10,
              background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.4)',
              color: '#F59E0B', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            🚪 Exit
          </button>

          {/* Submit */}
          {!submitted && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: '7px 16px', borderRadius: 10,
                background: '#EF4444', border: 'none',
                color: '#fff', fontWeight: 800, fontSize: 13,
                cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              {submitting ? 'Saving…' : 'Submit'}
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: subject.color, borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 100px' }}>

        {/* Question Navigator toggle */}
        <button
          onClick={() => setNavOpen(v => !v)}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
            color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
          }}
        >
          {navOpen ? '▲' : '▼'} {navOpen ? 'Hide' : 'Show'} Question Navigator
        </button>

        {/* Navigator grid */}
        {navOpen && (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '14px 12px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => { setCurrent(idx); setNavOpen(false); }}
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    fontFamily: 'inherit', fontWeight: 800, fontSize: 13,
                    cursor: 'pointer', transition: 'all 0.15s',
                    ...navTileStyle(idx),
                  }}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: subject.color, marginRight: 5 }} />Answered</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.1)', marginRight: 5 }} />Not answered</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: subject.color, marginRight: 5 }} />Current</span>
            </div>
          </div>
        )}

        {/* Question card */}
        {currentQ && (
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)',
            borderRadius: 18, padding: '20px 18px', marginBottom: 14,
          }}>
            {/* Card header: badge | flag | bookmark */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: subject.color + '18', border: `1px solid ${subject.color}44`,
                borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: subject.color,
              }}>
                {subject.icon} {subject.name.toLowerCase()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Flag */}
                <button
                  onClick={() => setFlagged(f => ({ ...f, [currentQ.id]: !f[currentQ.id] }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: flagged[currentQ.id] ? 1 : 0.3, transition: 'opacity 0.15s' }}
                  title="Flag question"
                >🚩</button>
                {/* Bookmark */}
                <button
                  onClick={() => setBookmarks(b => ({ ...b, [currentQ.id]: !b[currentQ.id] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                    background: bookmarks[currentQ.id] ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                    border: `1.5px solid ${bookmarks[currentQ.id] ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
                    color: bookmarks[currentQ.id] ? '#EF4444' : 'rgba(255,255,255,0.4)',
                    fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
                  }}
                >🔖 Bookmark</button>
              </div>
            </div>

            {/* Diagram */}
            {currentQ.diagramUrl && (
              <div style={{ marginBottom: 14, textAlign: 'center' }}>
                <img src={currentQ.diagramUrl} alt="Diagram" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }} onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}

            {/* Question text */}
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.6, marginBottom: 14 }}>
              {currentQ.questionText}
            </div>

            {/* Read Question button */}
            <button
              onClick={handleReadQuestion}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 16px', borderRadius: 20, marginBottom: 18, cursor: 'pointer',
                background: isSpeaking ? subject.color + '22' : 'rgba(255,255,255,0.05)',
                border: `1.5px solid ${isSpeaking ? subject.color : 'rgba(255,255,255,0.1)'}`,
                color: isSpeaking ? subject.color : 'rgba(255,255,255,0.5)',
                fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: 16 }}>{isSpeaking ? '🔊' : '🔉'}</span>
              <span>{isSpeaking ? 'Stop Reading' : 'Read Question'}</span>
            </button>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {OPT_KEYS.map(key => {
                const text = currentQ.options?.[key];
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
                      ...getOptStyle(key),
                    }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800, transition: 'all 0.15s',
                      ...getLetterStyle(key),
                    }}>
                      {key}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, flex: 1 }}>{text}</span>
                    {submitted && key === currentQ.correctAnswer && <span style={{ color: '#16A34A', fontWeight: 800 }}>✓</span>}
                    {submitted && key === answers[currentQ.id] && key !== currentQ.correctAnswer && <span style={{ color: '#EF4444', fontWeight: 800 }}>✗</span>}
                  </button>
                );
              })}
            </div>

            {/* Explanation (post-submit) */}
            {submitted && currentQ.explanation && (
              <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: 'rgba(13,148,136,0.07)', border: '1.5px solid rgba(13,148,136,0.2)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0D9488', marginBottom: 6 }}>💡 Explanation</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{currentQ.explanation}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Navigation ────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(10,22,40,0.97)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 50,
      }}>
        {/* Previous */}
        <button
          onClick={() => setCurrent(i => Math.max(0, i - 1))}
          disabled={current === 0}
          style={{
            padding: '12px 20px', borderRadius: 12, fontFamily: 'inherit',
            fontWeight: 700, fontSize: 14, cursor: current === 0 ? 'default' : 'pointer',
            background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.09)',
            color: current === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
          }}
        >← Previous</button>

        {/* Counter */}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.35)' }}>
          {current + 1} / {total}
        </span>

        {/* Next / Finish / Back */}
        {current < total - 1 ? (
          <button
            onClick={() => setCurrent(i => i + 1)}
            style={{
              padding: '12px 24px', borderRadius: 12, fontFamily: 'inherit',
              fontWeight: 800, fontSize: 14, cursor: 'pointer',
              background: subject.color, border: 'none', color: '#fff',
            }}
          >Next →</button>
        ) : !submitted ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '12px 20px', borderRadius: 12, fontFamily: 'inherit',
              fontWeight: 800, fontSize: 14, cursor: 'pointer',
              background: '#16A34A', border: 'none', color: '#fff',
            }}
          >✅ Finish</button>
        ) : (
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '12px 20px', borderRadius: 12, fontFamily: 'inherit',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.6)',
            }}
          >← Back</button>
        )}
      </div>
    </div>
  );
}

// ── Shared button styles ──────────────────────────────────────────────────────
const btn = {
  ghost: {
    padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
  },
  primary: {
    padding: '10px 22px', borderRadius: 10, cursor: 'pointer',
    border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
  },
};
