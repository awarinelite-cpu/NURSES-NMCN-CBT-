// src/components/entrance/EntranceSubjectSession.jsx
// Route: /entrance-exam/subject-session
//
// CHANGES:
//  - FREE_CAP (10 questions) enforced for unpaid users on fresh start
//  - Upgrade banner shown in exam header for unpaid users
//  - All other logic (pause/resume, timer, submit) unchanged

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation }                  from 'react-router-dom';
import { useAuth }                                   from '../../context/AuthContext';
import {
  collection, getDocs, query, where, addDoc,
  serverTimestamp, deleteDoc, doc, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import ItalicText      from '../shared/ItalicText';
import ExplanationText from '../shared/ExplanationText';

const OPT_KEYS = ['A', 'B', 'C', 'D'];
const F        = "'Times New Roman', Times, serif";
const H        = "'Arial Black', Arial, sans-serif";
const FREE_CAP = 10; // max questions for unpaid users

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtTime(s) { return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; }
function speakText(text) { if (!window.speechSynthesis) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.92; window.speechSynthesis.speak(u); }
function stopSpeech() { window.speechSynthesis?.cancel(); }

export default function EntranceSubjectSession() {
  const navigate             = useNavigate();
  const location             = useLocation();
  const { user, profile }    = useAuth();

  // ── Paid / cap logic ───────────────────────────────────────────────────────
  const isPaid = profile?.entranceExamPaid || profile?.role === 'admin';

  const {
    subject      = { name: 'Subject Drill', icon: '📚', color: '#0D9488' },
    year         = 'All Years',
    count        = 20,
    timeLimitMin = 20,
    resumeMode   = false,
    pausedExamId = null,
    resumeData   = null,
  } = location.state || {};

  const [questions,     setQuestions]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState('');
  const [answers,       setAnswers]       = useState({});
  const [bookmarks,     setBookmarks]     = useState({});
  const [flagged,       setFlagged]       = useState({});
  const [current,       setCurrent]       = useState(0);
  const [navOpen,       setNavOpen]       = useState(false);
  const [timeLeft,      setTimeLeft]      = useState(timeLimitMin * 60);
  const [submitted,     setSubmitted]     = useState(false);
  const [result,        setResult]        = useState(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [isSpeaking,    setIsSpeaking]    = useState(false);
  const [showReview,    setShowReview]    = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [saveError,     setSaveError]     = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const upgradeModalShown = useRef(false);

  const timerRef     = useRef(null);
  const isSavingRef  = useRef(false);
  const questionsRef = useRef([]);
  const answersRef   = useRef({});
  const currentRef   = useRef(0);
  const flaggedRef   = useRef({});
  const timeLeftRef  = useRef(timeLimitMin * 60);

  questionsRef.current = questions;
  answersRef.current   = answers;
  currentRef.current   = current;
  flaggedRef.current   = flagged;
  timeLeftRef.current  = timeLeft;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Load questions ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // RESUME MODE
        if (resumeMode && resumeData?.questionIds?.length) {
          const ids = resumeData.questionIds;
          const chunks = [];
          for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
          const snaps = await Promise.all(chunks.map(ch => getDocs(query(collection(db, 'entranceExamQuestions'), where('__name__', 'in', ch)))));
          const byId = {};
          snaps.forEach(s => s.docs.forEach(d => { byId[d.id] = { id: d.id, ...d.data() }; }));
          const loaded = ids.map(id => byId[id]).filter(Boolean);
          setQuestions(loaded);
          if (resumeData.answers)              { setAnswers(resumeData.answers);            answersRef.current = resumeData.answers; }
          if (resumeData.currentIndex != null) { setCurrent(resumeData.currentIndex);      currentRef.current = resumeData.currentIndex; }
          if (resumeData.flagged)              { setFlagged(resumeData.flagged);            flaggedRef.current = resumeData.flagged; }
          if (resumeData.timeLeft != null)     { setTimeLeft(resumeData.timeLeft);          timeLeftRef.current = resumeData.timeLeft; }
          if (pausedExamId) deleteDoc(doc(db, 'entrancePausedExams', pausedExamId)).catch(e => console.warn(e));
          return;
        }

        // FRESH START — apply FREE_CAP for unpaid users
        // Fetch tagged questions for this subject AND untagged ones (subject='')
        const constraints = [where('subject', '==', subject.name)];
        if (year && year !== 'All Years') constraints.push(where('year', '==', year));
        const [taggedSnap, untaggedSnap] = await Promise.all([
          getDocs(query(collection(db, 'entranceExamQuestions'), ...constraints)),
          // Untagged questions: only fetch if no year filter (they have no year set)
          (year && year !== 'All Years')
            ? Promise.resolve(null)
            : getDocs(query(collection(db, 'entranceExamQuestions'), where('subject', '==', ''))),
        ]);
        const taggedDocs   = taggedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const untaggedDocs = untaggedSnap ? untaggedSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        // Deduplicate by id (in case a question has been re-tagged)
        const seen = new Set();
        let all = [...taggedDocs, ...untaggedDocs].filter(q => {
          if (seen.has(q.id)) return false;
          seen.add(q.id);
          return true;
        });
        if (!all.length) { setLoadError(year && year !== 'All Years' ? `No ${subject.name} questions found for ${year}.` : `No questions found for ${subject.name}.`); return; }
        const effectiveCount = isPaid ? count : Math.min(count, FREE_CAP);
        if (isPaid) all = all.sort(() => Math.random() - 0.5);
        else all = all.sort((a, b) => a.id < b.id ? -1 : 1); // unpaid: same fixed 10 every time
        all = all.slice(0, Math.min(effectiveCount, all.length));
        setQuestions(all);
      } catch (e) {
        setLoadError('Failed to load: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
    // Load existing bookmarks so button shows correct saved state
    if (user?.uid) {
      getDocs(collection(db, 'users', user.uid, 'entranceBookmarks'))
        .then(snap => {
          const bm = {};
          snap.docs.forEach(d => { bm[d.id] = true; });
          setBookmarks(bm);
        })
        .catch(() => {});
    }
    return () => { stopSpeech(); clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || submitted || questions.length === 0 || timeLimitMin === 0) return;
    if (showExitModal) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); doSubmit(); return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, submitted, questions.length, showExitModal]);

  const timerColor = timeLeft < 60 ? '#EF4444' : timeLeft < 120 ? '#F59E0B' : '#0D9488';

  // ── Submit ─────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    clearInterval(timerRef.current);
    stopSpeech();
    const qs = questionsRef.current, ans = answersRef.current;
    let correct = 0;
    const breakdown = qs.map((q, i) => {
      const chosen = ans[q.id] || null, isCorrect = chosen === q.correctAnswer;
      if (isCorrect) correct++;
      return { q, i, chosen, correct: q.correctAnswer, isCorrect };
    });
    const score = qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0;
    if (user?.uid) {
      try {
        await addDoc(collection(db, 'users', user.uid, 'entranceSubjectDrills'), {
          subject: subject.name, subjectIcon: subject.icon || '📚', subjectColor: subject.color || '#0D9488',
          year: year || 'All Years', score, correct, totalQuestions: qs.length,
          answers: ans, questionIds: qs.map(q => q.id), createdAt: serverTimestamp(),
        });
      } catch (e) { console.warn('Save drill error:', e); }
    }
    setResult({ subject: subject.name, score, correct, total: qs.length, breakdown });
    setSubmitted(true);
    setSubmitting(false);
  }, [submitting, submitted, subject, year, user]);

  const handleSubmit = useCallback(() => {
    const unanswered = questions.length - Object.keys(answers).length;
    if (window.confirm(unanswered > 0 ? `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?` : 'Submit drill now?')) doSubmit();
  }, [questions, answers, doSubmit]);

  // ── Save & Exit ────────────────────────────────────────────────────────────
  const handleSaveExit = useCallback(() => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    const qs = questionsRef.current, ans = { ...answersRef.current };
    const flagSnap = { ...flaggedRef.current }, idxSnap = currentRef.current, timeSnap = timeLeftRef.current;
    clearInterval(timerRef.current); stopSpeech();
    setShowExitModal(false);
    navigate('/entrance-exam');
    if (qs.length && user?.uid) {
      addDoc(collection(db, 'entrancePausedExams'), {
        userId: user.uid, examType: 'entrance_subject_drill', examName: `${subject.name} Drill`,
        subject: subject.name, subjectIcon: subject.icon || '📚', subjectColor: subject.color || '#0D9488',
        year: year || 'All Years', timeLimitMin, questionIds: qs.map(q => q.id),
        answers: ans, flagged: flagSnap, currentIndex: idxSnap, timeLeft: timeSnap,
        answeredCount: Object.keys(ans).length, totalQuestions: qs.length, savedAt: serverTimestamp(),
      }).catch(err => console.error('Background save failed:', err.code, err.message));
    }
  }, [user, subject, year, timeLimitMin, navigate]);

  const handleSelect = (key) => {
    if (submitted) return;
    const qId = questions[current]?.id;
    if (qId) setAnswers(prev => ({ ...prev, [qId]: key }));
  };

  const handleReadQuestion = () => {
    const q = questions[current]; if (!q) return;
    if (isSpeaking) { stopSpeech(); setIsSpeaking(false); return; }
    const opts = OPT_KEYS.map(k => q.options?.[k] ? `Option ${k}: ${q.options[k]}` : '').filter(Boolean).join('. ');
    speakText(`${q.questionText}. ${opts}`);
    setIsSpeaking(true);
    setTimeout(() => setIsSpeaking(false), (q.questionText.length + opts.length) * 60 + 2000);
  };

  const total    = questions.length;
  const answered = Object.keys(answers).length;
  const currentQ = questions[current] || null;
  const progress = total > 0 ? ((current + 1) / total) * 100 : 0;

  const handleBookmark = () => {
    if (!currentQ || !user?.uid) return;
    const qId      = currentQ.id;
    const nowSaved = !bookmarks[qId];
    setBookmarks(b => ({ ...b, [qId]: nowSaved }));
    const ref = doc(db, 'users', user.uid, 'entranceBookmarks', qId);
    if (nowSaved) {
      setDoc(ref, {
        questionId:    qId,
        questionText:  currentQ.question || currentQ.questionText || '',
        options:       currentQ.options   || {},
        correctAnswer: currentQ.correctAnswer || '',
        explanation:   currentQ.explanation || '',
        subject:       subject?.id || subject?.name || '',
        examName:      subject?.label || 'Subject Drill',
        savedAt:       serverTimestamp(),
      }).catch(e => console.error('Bookmark save failed:', e));
    } else {
      deleteDoc(ref).catch(e => console.error('Bookmark delete failed:', e));
    }
  };

  const getOptStyle = (key) => {
    if (!currentQ) return {};
    const chosen = answers[currentQ.id], correct = currentQ.correctAnswer;
    if (!submitted) return chosen === key ? { background: subject.color + '25', border: `2px solid ${subject.color}`, color: 'var(--text-primary)' } : { background: 'var(--bg-tertiary)', border: '2px solid var(--border)', color: 'var(--text-primary)' };
    if (key === correct) return { background: 'rgba(22,163,74,0.15)', border: '2px solid #16A34A', color: 'var(--text-primary)' };
    if (key === chosen && key !== correct) return { background: 'rgba(239,68,68,0.12)', border: '2px solid #EF4444', color: 'var(--text-primary)' };
    return { background: 'var(--bg-tertiary)', border: '2px solid var(--border)', color: 'var(--text-muted)' };
  };

  const getLetterStyle = (key) => {
    if (!currentQ) return {};
    const chosen = answers[currentQ.id], correct = currentQ.correctAnswer;
    if (!submitted) return { background: chosen === key ? subject.color : 'var(--bg-tertiary)', color: chosen === key ? '#fff' : 'var(--text-muted)' };
    if (key === correct) return { background: '#16A34A', color: '#fff' };
    if (key === chosen && key !== correct) return { background: '#EF4444', color: '#fff' };
    return { background: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
  };

  const navTileStyle = (idx) => {
    const q = questions[idx], ans = q ? answers[q.id] : undefined;
    if (idx === current) return { background: subject.color, color: '#fff', border: `2px solid ${subject.color}` };
    if (ans) return { background: subject.color + '22', color: subject.color, border: `2px solid ${subject.color}55` };
    return { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '2px solid var(--border)' };
  };

  if (loading) return (
    <div style={S.overlay}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, margin: '0 auto 16px', border: `3px solid ${subject.color}33`, borderTop: `3px solid ${subject.color}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: F, fontWeight: 700 }}>{resumeMode ? 'Restoring your drill…' : `Loading ${subject.name} questions…`}</p>
      </div>
    </div>
  );

  if (loadError) return (
    <div style={{ ...S.overlay, flexDirection: 'column', gap: 16, padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>😕</div>
      <h3 style={{ color: 'var(--text-primary)', margin: 0, fontFamily: H }}>Could not load questions</h3>
      <p style={{ color: 'var(--text-muted)', margin: 0, fontFamily: F, fontWeight: 700 }}>{loadError}</p>
      <button onClick={() => navigate(-1)} style={{ padding: '10px 24px', background: subject.color, border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontFamily: F }}>← Go Back</button>
    </div>
  );

  // Result screen
  if (submitted && result) {
    const passed = result.score >= 50, scoreColor = result.score >= 70 ? '#10B981' : result.score >= 50 ? '#F59E0B' : '#EF4444';
    const correctC = result.breakdown.filter(b => b.isCorrect).length;
    const wrongC   = result.breakdown.filter(b => b.chosen && !b.isCorrect).length;
    const skippedC = result.breakdown.filter(b => !b.chosen).length;
    return (
      <div style={{ ...S.overlay, alignItems: 'flex-start', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 680, margin: '0 auto', padding: '28px 16px 64px' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>{result.score >= 70 ? '🏆' : result.score >= 50 ? '🎯' : '💪'}</div>
            <h2 style={{ fontFamily: H, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px', fontSize: 26 }}>{passed ? 'Well Done!' : 'Keep Practising'}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, fontFamily: F, fontWeight: 700 }}>{subject.icon} {result.subject} Drill</div>
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: passed ? 'rgba(22,163,74,0.09)' : 'rgba(239,68,68,0.07)', border: `2px solid ${scoreColor}55`, borderRadius: 20, padding: '20px 44px', marginBottom: 20 }}>
              <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor, lineHeight: 1, fontFamily: H }}>{result.score}%</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, fontFamily: F, fontWeight: 700 }}>{result.correct} / {result.total} correct</div>
              <div style={{ marginTop: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1, color: scoreColor, textTransform: 'uppercase', fontFamily: H }}>{passed ? '✓ PASS' : '✗ FAIL'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
              {[{ label: 'Correct', v: correctC, color: '#10B981', bg: 'rgba(16,185,129,0.08)', icon: '✅' }, { label: 'Wrong', v: wrongC, color: '#EF4444', bg: 'rgba(239,68,68,0.08)', icon: '❌' }, { label: 'Skipped', v: skippedC, color: '#F59E0B', bg: 'rgba(245,158,11,0.09)', icon: '⏭' }, { label: 'Total', v: result.total, color: subject.color, bg: subject.color + '12', icon: '📝' }].map(st => (
                <div key={st.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: st.bg, border: `1.5px solid ${st.color}33`, borderRadius: 12, padding: '10px 16px', minWidth: 72 }}>
                  <div style={{ fontSize: 16 }}>{st.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: st.color, lineHeight: 1.2, fontFamily: H }}>{st.v}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>{st.label}</div>
                </div>
              ))}
            </div>

            {/* Upgrade prompt for unpaid users */}
            {!isPaid && (
              <div style={{ background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#F59E0B', fontFamily: F }}>⚡ Free preview used — {FREE_CAP} questions only</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, marginTop: 2 }}>Pay ₦3,000 once to unlock all questions</div>
                </div>
                <button onClick={() => navigate('/entrance-exam/payment')} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#F59E0B', color: '#000', fontWeight: 800, fontSize: 13, fontFamily: F, cursor: 'pointer', whiteSpace: 'nowrap' }}>Upgrade Now →</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
              <button onClick={() => navigate(-1)} style={S.btnGhost}>← Back</button>
              <button onClick={() => setShowReview(v => !v)} style={{ ...S.btnPrimary, background: subject.color }}>{showReview ? 'Hide Review' : '📋 Review Answers'}</button>
              <button onClick={() => { stopSpeech(); navigate('/entrance-exam/subject-drill'); }} style={S.btnGhost}>🔄 Drill Again</button>
            </div>
          </div>

          {showReview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, fontFamily: H }}>📋 Question-by-Question Breakdown</div>
              {result.breakdown.map(({ q, i, chosen, correct, isCorrect }) => (
                <div key={q.id} style={{ background: 'var(--bg-tertiary)', border: `1.5px solid ${isCorrect ? 'rgba(22,163,74,0.2)' : chosen ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, borderLeft: `4px solid ${isCorrect ? '#16A34A' : chosen ? '#EF4444' : '#F59E0B'}`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: isCorrect ? 'rgba(22,163,74,0.15)' : chosen ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', fontSize: 11, fontWeight: 800, fontFamily: H, color: isCorrect ? '#16A34A' : chosen ? '#EF4444' : '#F59E0B', marginBottom: 8 }}>{i + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.6, width: '100%', textAlign: 'justify', fontFamily: F }}><ItalicText text={q.questionText} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 34, marginBottom: 8 }}>
                    {OPT_KEYS.map(key => {
                      const text = q.options?.[key]; if (!text) return null;
                      const isCorr = key === correct, isChos = key === chosen;
                      let bg = 'var(--bg-tertiary)', border = 'var(--border)', color = 'var(--text-muted)', weight = 400;
                      if (isCorr) { bg = 'rgba(22,163,74,0.13)'; border = '#16A34A'; color = '#16A34A'; weight = 700; }
                      if (isChos && !isCorr) { bg = 'rgba(239,68,68,0.1)'; border = '#EF4444'; color = '#EF4444'; weight = 700; }
                      return <div key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, fontSize: 12, background: bg, border: `1px solid ${border}`, color, fontWeight: weight, fontFamily: F }}><span style={{ fontWeight: 800 }}>{key}.</span> <ItalicText text={text} />{isCorr && <span>✓</span>}{isChos && !isCorr && <span>✗</span>}</div>;
                    })}
                  </div>
                  <div style={{ paddingLeft: 34, fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
                    {!chosen ? <span style={{ color: '#F59E0B' }}>⏭ Skipped — Correct: <strong style={{ color: '#16A34A' }}>{correct}</strong></span>
                      : isCorrect ? <span style={{ color: '#16A34A' }}>✓ Your answer: <strong>{chosen}</strong> — Correct!</span>
                      : <span style={{ color: '#EF4444' }}>✗ Your answer: <strong>{chosen}</strong> — Correct: <strong style={{ color: '#16A34A' }}>{correct}</strong></span>}
                  </div>
                  {q.explanation && (
                    <div style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(13,148,136,0.35)', width: '100%' }}>
                      <div style={{ background: 'var(--teal)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15 }}>💡</span>
                        <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 13, color: '#fff' }}>Explanation</span>
                      </div>
                      <div style={{ padding: '12px 14px', background: 'rgba(13,148,136,0.06)' }}>
                        <ExplanationText text={q.explanation} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 24 }}>
            <button onClick={() => navigate('/entrance-exam')} style={S.btnGhost}>← Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  // Exit Modal
  const ExitModal = () => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🚪</div>
        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: H, fontWeight: 900 }}>Exit Drill?</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, margin: '0 0 4px', lineHeight: 1.6, fontFamily: F, fontWeight: 700 }}>Save your progress and continue later, or exit without saving.</p>
        <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', margin: '14px 0', display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 22 }}>{subject.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4, fontFamily: F }}>{subject.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, marginBottom: 6 }}>{answered}/{total} answered · Q{current + 1} of {total}{timeLimitMin > 0 && ` · ⏱ ${fmtTime(timeLeft)} left`}</div>
            <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${total > 0 ? (answered / total) * 100 : 0}%`, background: subject.color, borderRadius: 2 }} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={handleSaveExit} style={{ padding: '13px', borderRadius: 12, cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 15, border: 'none', background: subject.color, color: '#fff' }}>💾 Save & Continue Later</button>
          <button onClick={() => { stopSpeech(); clearInterval(timerRef.current); setShowExitModal(false); navigate('/entrance-exam'); }} style={{ padding: '11px', borderRadius: 12, cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 14, border: '1.5px solid rgba(239,68,68,0.5)', background: 'transparent', color: '#EF4444' }}>🗑 Exit Without Saving</button>
          <button onClick={() => { setShowExitModal(false); setSaveError(''); isSavingRef.current = false; }} style={{ padding: '10px', borderRadius: 12, cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 14, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>← Keep Drilling</button>
        </div>
      </div>
    </div>
  );

  // Main Exam UI
  return (
    <div style={S.overlay}>
      {showExitModal && <ExitModal />}

      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg-card)', border: '2px solid rgba(245,158,11,0.5)', borderRadius: 24, padding: 32, maxWidth: 420, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
            <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 22, fontWeight: 900, fontFamily: "'Arial Black', Arial, sans-serif" }}>
              You've reached your free limit!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 8px' }}>
              Free users get <strong style={{ color: '#F59E0B' }}>{FREE_CAP} questions</strong> per session.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
              Pay <strong style={{ color: '#F59E0B' }}>₦3,000 once</strong> for <em>unlimited access</em> to all entrance exam questions, subject drills, and more.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => navigate('/entrance-exam/payment')}
                style={{ padding: '14px', borderRadius: 12, cursor: 'pointer', fontWeight: 900, fontSize: 15, border: 'none', background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#000', letterSpacing: 0.5, fontFamily: "'Arial Black', Arial, sans-serif" }}
              >
                🚀 Upgrade Now — ₦3,000 Only
              </button>
              <button
                onClick={() => setShowUpgradeModal(false)}
                style={{ padding: '11px', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                Finish this question &amp; submit
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 58, gap: 10, padding: '0 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: H }}>
                {subject.icon} {subject.name}
                {year && year !== 'All Years' && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', padding: '2px 7px', borderRadius: 20, fontFamily: F }}>📅 {year}</span>}
                {resumeMode && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#8B5CF6', background: 'rgba(139,92,246,0.12)', padding: '2px 7px', borderRadius: 20, fontFamily: F }}>▶ Resumed</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, fontFamily: F, fontWeight: 700 }}>Q{current + 1} of {total} · {answered} answered</div>
            </div>
            {timeLimitMin > 0 && (
              <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 900, color: timerColor, background: timerColor + '18', border: `1.5px solid ${timerColor}44`, padding: '5px 11px', borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 13 }}>⏱</span>{fmtTime(timeLeft)}
              </div>
            )}
            <button onClick={() => setShowExitModal(true)} style={{ padding: '7px 13px', borderRadius: 10, background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.35)', color: '#F59E0B', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>🚪 Exit</button>
            {!submitted && <button onClick={handleSubmit} disabled={submitting} style={{ padding: '7px 15px', borderRadius: 10, background: '#EF4444', border: 'none', color: '#fff', fontWeight: 800, fontSize: 13, cursor: submitting ? 'wait' : 'pointer', fontFamily: F, flexShrink: 0 }}>{submitting ? 'Saving…' : 'Submit'}</button>}
          </div>
          {/* Progress bar */}
          <div style={{ height: 3, background: 'var(--border)' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: subject.color, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
          {/* ── Free preview banner ── */}
          {!isPaid && (
            <div style={{ background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.25)', padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', fontFamily: F }}>⚡ Free preview — {FREE_CAP} questions only</span>
              <button onClick={() => { stopSpeech(); clearInterval(timerRef.current); navigate('/entrance-exam/payment'); }} style={{ padding: '3px 12px', borderRadius: 20, border: '1.5px solid #F59E0B', background: 'transparent', color: '#F59E0B', fontSize: 11, fontWeight: 700, fontFamily: F, cursor: 'pointer' }}>Upgrade →</button>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 100px' }}>
          <button onClick={() => setNavOpen(v => !v)} style={{ width: '100%', padding: '10px 16px', borderRadius: 12, background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', fontFamily: F, fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {navOpen ? '▲' : '▼'} {navOpen ? 'Hide' : 'Show'} Question Navigator
          </button>
          {navOpen && (
            <div style={{ background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '14px 12px', marginBottom: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {questions.map((_, idx) => <button key={idx} onClick={() => { setCurrent(idx); setNavOpen(false); }} style={{ width: 40, height: 40, borderRadius: 10, fontFamily: F, fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', ...navTileStyle(idx) }}>{idx + 1}</button>)}
              </div>
            </div>
          )}

          {currentQ && (
            <div style={{ background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '18px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: subject.color + '18', border: `1px solid ${subject.color}44`, borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: subject.color, fontFamily: F }}>{subject.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setFlagged(f => ({ ...f, [currentQ.id]: !f[currentQ.id] }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, opacity: flagged[currentQ.id] ? 1 : 0.28, transition: 'opacity 0.15s' }}>🚩</button>
                  <button onClick={handleBookmark} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', background: bookmarks[currentQ.id] ? 'rgba(239,68,68,0.12)' : 'var(--bg-tertiary)', border: `1.5px solid ${bookmarks[currentQ.id] ? '#EF4444' : 'var(--border)'}`, color: bookmarks[currentQ.id] ? '#EF4444' : 'var(--text-muted)', fontFamily: F, fontWeight: 700, fontSize: 12 }}>🔖 Bookmark</button>
                </div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', background: subject.color + '22', color: subject.color, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 800, marginBottom: 12, fontFamily: F }}>Q{current + 1} / {total}</div>
              {currentQ.diagramUrl && <div style={{ marginBottom: 14, textAlign: 'center' }}><img src={currentQ.diagramUrl} alt="Diagram" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} onError={e => { e.target.style.display = 'none'; }} /></div>}
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.65, marginBottom: 16, fontFamily: F, textAlign: 'justify', width: '100%' }}><ItalicText text={currentQ.questionText} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {OPT_KEYS.map(key => {
                  const text = currentQ.options?.[key]; if (!text) return null;
                  return <button key={key} onClick={() => handleSelect(key)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, fontFamily: F, cursor: submitted ? 'default' : 'pointer', textAlign: 'left', transition: 'all 0.15s', ...getOptStyle(key) }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, transition: 'all 0.15s', ...getLetterStyle(key) }}>{key}</div>
                    <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, flex: 1 }}><ItalicText text={text} /></span>
                    {submitted && key === currentQ.correctAnswer && <span style={{ color: '#16A34A', fontWeight: 800 }}>✓</span>}
                    {submitted && key === answers[currentQ.id] && key !== currentQ.correctAnswer && <span style={{ color: '#EF4444', fontWeight: 800 }}>✗</span>}
                  </button>;
                })}
              </div>
              {submitted && currentQ.explanation && (
                <div style={{ marginTop: 18, borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(13,148,136,0.35)', boxShadow: '0 2px 12px rgba(13,148,136,0.1)', width: '100%' }}>
                  <div style={{ background: 'var(--teal)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>💡</span>
                    <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>Explanation</span>
                  </div>
                  <div style={{ padding: '14px 16px', background: 'rgba(13,148,136,0.06)' }}>
                    <ExplanationText text={currentQ.explanation} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div style={{ flexShrink: 0, background: 'var(--bg-primary)', borderTop: '1px solid var(--border)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setCurrent(i => Math.max(0, i - 1))} disabled={current === 0} style={{ padding: '12px 20px', borderRadius: 12, fontFamily: F, fontWeight: 700, fontSize: 14, cursor: current === 0 ? 'default' : 'pointer', background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', color: current === 0 ? 'var(--text-muted)' : 'var(--text-secondary)' }}>← Previous</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>{current + 1} / {total}</span>
          {current < total - 1 ? (
            <button onClick={() => {
              if (!isPaid && current >= FREE_CAP - 1) {
                if (!upgradeModalShown.current) { upgradeModalShown.current = true; setShowUpgradeModal(true); }
                return;
              }
              setCurrent(i => i + 1);
            }} style={{ padding: '12px 24px', borderRadius: 12, fontFamily: F, fontWeight: 800, fontSize: 14, cursor: 'pointer', background: subject.color, border: 'none', color: '#fff' }}>Next →</button>
          ) : !submitted ? (
            <button onClick={handleSubmit} disabled={submitting} style={{ padding: '12px 20px', borderRadius: 12, fontFamily: F, fontWeight: 800, fontSize: 14, cursor: 'pointer', background: '#16A34A', border: 'none', color: '#fff' }}>✅ Finish</button>
          ) : (
            <button onClick={() => navigate(-1)} style={{ padding: '12px 20px', borderRadius: 12, fontFamily: F, fontWeight: 700, fontSize: 14, cursor: 'pointer', background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', color: 'var(--text-secondary)' }}>← Back</button>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: "'Times New Roman', Times, serif", display: 'flex', alignItems: 'center', justifyContent: 'center' },
  btnGhost: { padding: '10px 20px', borderRadius: 10, cursor: 'pointer', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 700, fontSize: 13, fontFamily: "'Times New Roman', Times, serif" },
  btnPrimary: { padding: '10px 22px', borderRadius: 10, cursor: 'pointer', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: "'Times New Roman', Times, serif" },
};
