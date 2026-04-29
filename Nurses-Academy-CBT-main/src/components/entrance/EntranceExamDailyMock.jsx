// src/components/entrance/EntranceExamDailyMock.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc, limit, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';

// ── Deterministic seeded shuffle (date-based) ────────────────────
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getTodaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function msToNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Normalise a raw Firestore question doc into a consistent shape ──
// Admin stores: questionText, options:{A,B,C,D}, correctAnswer
// Legacy upload stored: question, optionA-D, answer
// We normalise everything to: question, optionA-D, answer
function normaliseQuestion(raw) {
  // Already normalised (legacy format)
  if (raw.question && raw.optionA) return raw;

  // Admin format: questionText + options object + correctAnswer
  const opts = raw.options || {};
  return {
    ...raw,
    question:    raw.questionText || raw.question || '',
    optionA:     opts.A || raw.optionA || '',
    optionB:     opts.B || raw.optionB || '',
    optionC:     opts.C || raw.optionC || '',
    optionD:     opts.D || raw.optionD || '',
    answer:      raw.correctAnswer  || raw.answer || '',
    explanation: raw.explanation    || '',
    subject:     raw.subject        || '',
    school:      raw.schoolName     || raw.school || '',
  };
}

// ── Shuffle options keeping track of correct answer ──────────────
function shuffleOptions(question, seed, idx) {
  const opts = ['A', 'B', 'C', 'D'];
  const optionMap = {
    A: question.optionA,
    B: question.optionB,
    C: question.optionC,
    D: question.optionD,
  };
  const correctText = optionMap[question.answer];
  if (!correctText) return { options: optionMap, answer: question.answer };

  const shuffled = seededShuffle(opts, seed + idx);
  const newMap = {};
  shuffled.forEach((origKey, newIdx) => {
    newMap[opts[newIdx]] = optionMap[origKey];
  });
  const newCorrectKey = opts.find(k => newMap[k] === correctText);
  return { options: newMap, answer: newCorrectKey };
}

export default function EntranceExamDailyMock() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase]           = useState('loading');
  const [questions, setQuestions]   = useState([]);
  const [processedQ, setProcessedQ] = useState([]);
  const [config, setConfig]         = useState({ count: 30, timeLimit: 30 });
  const [current, setCurrent]       = useState(0);
  const [answers, setAnswers]       = useState({});
  const [flagged, setFlagged]       = useState({});
  const [timeLeft, setTimeLeft]     = useState(null);
  const [countdown, setCountdown]   = useState(msToNextMidnight());
  const [todayResult, setTodayResult] = useState(null);
  const [pastAttempts, setPastAttempts] = useState([]);
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sourceInfo, setSourceInfo] = useState(''); // for debugging

  const timerRef     = useRef(null);
  const countdownRef = useRef(null);
  const startTimeRef = useRef(null);

  // ── Countdown to next mock ─────────────────────────────────────
  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(msToNextMidnight()), 1000);
    return () => clearInterval(countdownRef.current);
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  // ── Main load function ─────────────────────────────────────────
  async function load() {
    try {
      // 1. Load admin config
      const cfgDoc = await getDoc(doc(db, 'entranceExamConfig', 'dailyMock'));
      let cfgCount = 30;
      let cfgTimeLimit = 30;
      if (cfgDoc.exists()) {
        const d = cfgDoc.data();
        cfgCount     = d.questionCount || 30;
        cfgTimeLimit = d.timeLimit ?? 30;
        setConfig({ count: cfgCount, timeLimit: cfgTimeLimit });
      }

      // 2. Check if student already attempted today
      const todayKey = getTodayKey();
      const attRef  = doc(db, 'users', user.uid, 'entranceDailyMock', todayKey);
      const attSnap = await getDoc(attRef);
      if (attSnap.exists()) {
        setTodayResult(attSnap.data());
        setPhase('already-done');
        loadPastAttempts(); // fire-and-forget
        return;
      }

      // 3. Try to load today's PUBLISHED schedule from admin
      //    Admin publishes to: dailyMockSchedule/{YYYY-MM-DD}
      const scheduleDoc = await getDoc(doc(db, 'dailyMockSchedule', todayKey));

      let selectedQuestions = [];

      if (scheduleDoc.exists()) {
        // ── PATH A: Admin has published today's set ──────────────
        const scheduleData = scheduleDoc.data();
        const questionIds  = scheduleData.questionIds || [];

        if (questionIds.length > 0) {
          // Firestore has no "fetch by array of IDs" — batch with getDoc
          const qDocs = await Promise.all(
            questionIds.map(id => getDoc(doc(db, 'entranceExamQuestions', id)))
          );
          selectedQuestions = qDocs
            .filter(d => d.exists())
            .map(d => normaliseQuestion({ id: d.id, ...d.data() }));

          setSourceInfo('admin-schedule');
        }
      }

      // ── PATH B: Fallback — no published schedule yet ──────────
      // Pull all inDailyBank questions and do seeded shuffle locally
      // (matches exactly what the admin preview does)
      if (selectedQuestions.length === 0) {
        const bankSnap = await getDocs(
          query(
            collection(db, 'entranceExamQuestions'),
            where('inDailyBank', '==', true)
          )
        );

        let allQ = [];
        bankSnap.forEach(d => allQ.push(normaliseQuestion({ id: d.id, ...d.data() })));

        // If no inDailyBank questions exist at all, fall back to ALL questions
        if (allQ.length === 0) {
          const allSnap = await getDocs(collection(db, 'entranceExamQuestions'));
          allSnap.forEach(d => allQ.push(normaliseQuestion({ id: d.id, ...d.data() })));
          setSourceInfo('all-questions-fallback');
        } else {
          setSourceInfo('daily-bank-fallback');
        }

        if (allQ.length === 0) {
          setError('No questions available yet. Please check back later.');
          setPhase('error');
          return;
        }

        const seed     = getTodaySeed();
        const shuffled = seededShuffle(allQ, seed);
        selectedQuestions = shuffled.slice(0, Math.min(cfgCount, shuffled.length));
      }

      if (selectedQuestions.length === 0) {
        setError('No questions available for today. Please check back later.');
        setPhase('error');
        return;
      }

      setQuestions(selectedQuestions);

      // 4. Shuffle each question's options deterministically
      const seed      = getTodaySeed();
      const processed = selectedQuestions.map((q, i) => {
        const { options, answer } = shuffleOptions(q, seed, i);
        return {
          ...q,
          optionA: options.A,
          optionB: options.B,
          optionC: options.C,
          optionD: options.D,
          answer,
        };
      });
      setProcessedQ(processed);

      // ⚠️ loadPastAttempts is intentionally outside the main try/catch.
      // A missing Firestore index or permission error here must NEVER
      // prevent the exam from loading — it only affects the history panel.
      setPhase('intro');
      loadPastAttempts(); // fire-and-forget — errors are silenced inside

    } catch (e) {
      console.error('EntranceExamDailyMock load error:', e);
      setError('Failed to load daily mock. Please try again.');
      setPhase('error');
    }
  }

  async function loadPastAttempts() {
    try {
      // Query without orderBy to avoid requiring a composite Firestore index.
      // We sort client-side instead.
      const snap = await getDocs(
        query(
          collection(db, 'users', user.uid, 'entranceDailyMock'),
          limit(7)
        )
      );
      const past = [];
      snap.forEach(d => past.push({ id: d.id, ...d.data() }));
      // Sort by date descending client-side
      past.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setPastAttempts(past);
    } catch (e) {
      // Silent — history panel is non-critical
      console.warn('loadPastAttempts failed (non-critical):', e.message);
    }
  }

  // ── Start exam ─────────────────────────────────────────────────
  function startExam() {
    startTimeRef.current = Date.now();
    if (config.timeLimit > 0) setTimeLeft(config.timeLimit * 60);
    setPhase('exam');
  }

  // ── Timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'exam' || timeLeft === null) return;
    if (timeLeft <= 0) { handleSubmit(true); return; }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [phase, timeLeft]);

  // ── Answer / flag ──────────────────────────────────────────────
  function selectAnswer(qIdx, option) {
    setAnswers(prev => ({ ...prev, [qIdx]: option }));
  }

  function toggleFlag(qIdx) {
    setFlagged(prev => ({ ...prev, [qIdx]: !prev[qIdx] }));
  }

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting) return;
    setSubmitting(true);
    clearTimeout(timerRef.current);

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    let correct = 0;

    const breakdown = processedQ.map((q, i) => {
      const chosen    = answers[i] || null;
      const isCorrect = chosen === q.answer;
      if (isCorrect) correct++;
      return {
        question:    q.question,
        chosen,
        correct:     q.answer,
        isCorrect,
        explanation: q.explanation || '',
        subject:     q.subject     || '',
        school:      q.school      || '',
      };
    });

    const score    = Math.round((correct / processedQ.length) * 100);
    const todayKey = getTodayKey();

    const result = {
      date: todayKey,
      score,
      correct,
      total:       processedQ.length,
      timeTaken,
      breakdown,
      submittedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'users', user.uid, 'entranceDailyMock', todayKey), result);
    } catch (e) { console.error('Failed to save result', e); }

    setTodayResult(result);
    setPhase('done');
    setSubmitting(false);
  }, [submitting, processedQ, answers, user]);

  const answeredCount = Object.keys(answers).length;
  const flaggedCount  = Object.values(flagged).filter(Boolean).length;

  // ── Render ─────────────────────────────────────────────────────
  if (phase === 'loading')      return <LoadingScreen />;
  if (phase === 'error')        return <ErrorScreen message={error} onBack={() => navigate('/entrance-exam')} />;
  if (phase === 'intro')        return (
    <IntroScreen
      config={config}
      questionCount={processedQ.length}
      pastAttempts={pastAttempts}
      countdown={countdown}
      onStart={startExam}
      onBack={() => navigate('/entrance-exam')}
    />
  );
  if (phase === 'already-done') return (
    <AlreadyDoneScreen
      result={todayResult}
      pastAttempts={pastAttempts}
      countdown={countdown}
      onBack={() => navigate('/entrance-exam')}
    />
  );
  if (phase === 'done' || phase === 'review') return (
    <ResultScreen
      result={todayResult}
      pastAttempts={pastAttempts}
      countdown={countdown}
      onBack={() => navigate('/entrance-exam')}
    />
  );

  // ── Exam phase ─────────────────────────────────────────────────
  const q        = processedQ[current];
  const progress = ((current + 1) / processedQ.length) * 100;

  return (
    <div style={styles.examWrap}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <button onClick={() => navigate('/entrance-exam')} style={styles.backBtn}>← Exit</button>
          <span style={styles.mockLabel}>📅 Daily Mock — {getTodayKey()}</span>
        </div>
        <div style={styles.topRight}>
          {config.timeLimit > 0 && timeLeft !== null && (
            <div style={{ ...styles.timer, color: timeLeft < 120 ? '#EF4444' : '#10B981' }}>
              ⏱ {formatTime(timeLeft)}
            </div>
          )}
          <span style={styles.progress}>{answeredCount}/{processedQ.length} answered</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={styles.progressBarWrap}>
        <div style={{ ...styles.progressBar, width: `${progress}%` }} />
      </div>

      {/* Question grid nav */}
      <div style={styles.gridNav}>
        <div style={styles.gridNavInner}>
          {processedQ.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                ...styles.gridBtn,
                background: i === current ? '#0D9488'
                  : answers[i] ? (flagged[i] ? '#F59E0B' : '#1E3A8A')
                  : 'rgba(255,255,255,0.06)',
                border: i === current ? '2px solid #0D9488' : '2px solid transparent',
                color: answers[i] || i === current ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Question card */}
      <div style={styles.qCard}>
        <div style={styles.qMeta}>
          <span style={styles.qNum}>Q{current + 1} of {processedQ.length}</span>
          {q.subject && <span style={styles.qSubject}>{q.subject}</span>}
          {q.school  && <span style={styles.qSchool}>🏫 {q.school}</span>}
          <button
            onClick={() => toggleFlag(current)}
            style={{ ...styles.flagBtn, color: flagged[current] ? '#F59E0B' : 'rgba(255,255,255,0.3)' }}
          >
            {flagged[current] ? '🚩 Flagged' : '🏳 Flag'}
          </button>
        </div>

        {/* Diagram */}
        {q.diagramUrl && (
          <div style={{ marginBottom: 16 }}>
            <img
              src={q.diagramUrl}
              alt="Question diagram"
              style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}
              onError={e => { e.target.style.display = 'none'; }}
            />
          </div>
        )}

        <div style={styles.qText}>{q.question}</div>

        <div style={styles.optionsGrid}>
          {['A', 'B', 'C', 'D'].map(opt => {
            const text     = q[`option${opt}`];
            if (!text) return null;
            const selected = answers[current] === opt;
            return (
              <button
                key={opt}
                onClick={() => selectAnswer(current, opt)}
                style={{
                  ...styles.optBtn,
                  background: selected
                    ? 'linear-gradient(135deg,#0D9488,#0f766e)'
                    : 'rgba(255,255,255,0.04)',
                  border: selected ? '2px solid #0D9488' : '2px solid rgba(255,255,255,0.08)',
                  transform: selected ? 'scale(1.01)' : 'scale(1)',
                }}
              >
                <span style={styles.optLabel}>{opt}</span>
                <span style={styles.optText}>{text}</span>
              </button>
            );
          })}
        </div>

        {/* Nav buttons */}
        <div style={styles.navRow}>
          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            style={{ ...styles.navBtn, opacity: current === 0 ? 0.3 : 1 }}
          >
            ← Prev
          </button>

          {current < processedQ.length - 1 ? (
            <button onClick={() => setCurrent(c => c + 1)} style={styles.navBtnPrimary}>
              Next →
            </button>
          ) : (
            <button
              onClick={() => {
                const unanswered = processedQ.length - answeredCount;
                if (unanswered > 0 && !window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
                handleSubmit();
              }}
              disabled={submitting}
              style={styles.submitBtn}
            >
              {submitting ? 'Submitting…' : '✅ Submit Mock'}
            </button>
          )}
        </div>
      </div>

      {/* Summary bar */}
      <div style={styles.summaryBar}>
        <span>✅ {answeredCount} answered</span>
        <span>⬜ {processedQ.length - answeredCount} unanswered</span>
        {flaggedCount > 0 && <span>🚩 {flaggedCount} flagged</span>}
        {answeredCount === processedQ.length && (
          <button onClick={() => handleSubmit()} disabled={submitting} style={styles.quickSubmit}>
            Submit Now
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={styles.centered}>
      <div style={styles.spinner} />
      <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Loading today's mock…</p>
    </div>
  );
}

function ErrorScreen({ message, onBack }) {
  return (
    <div style={styles.centered}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <p style={{ color: '#EF4444', margin: '12px 0' }}>{message}</p>
      <button onClick={onBack} style={styles.navBtnPrimary}>← Go Back</button>
    </div>
  );
}

function IntroScreen({ config, questionCount, pastAttempts, countdown, onStart, onBack }) {
  return (
    <div style={styles.introWrap}>
      <button onClick={onBack} style={styles.backLink}>← Back to Hub</button>

      <div style={styles.introCard}>
        <div style={styles.introIcon}>📅</div>
        <h1 style={styles.introTitle}>Daily Mock Exam</h1>
        <p style={styles.introSub}>
          Today's mock is freshly generated and the same for every student. Give it your best shot!
        </p>

        <div style={styles.infoGrid}>
          <InfoTile icon="❓" label="Questions"  value={questionCount} />
          <InfoTile icon="⏱" label="Time Limit" value={config.timeLimit > 0 ? `${config.timeLimit} min` : 'Untimed'} />
          <InfoTile icon="📆" label="Date"       value={getTodayKey()} />
          <InfoTile icon="🔄" label="Resets In"  value={formatCountdown(countdown)} mono />
        </div>

        <div style={styles.rules}>
          <div style={styles.ruleItem}>📌 Questions are date-seeded — same for all students today</div>
          <div style={styles.ruleItem}>🚩 Flag questions to revisit before submitting</div>
          <div style={styles.ruleItem}>📊 Results saved to your profile automatically</div>
          {config.timeLimit > 0 && <div style={styles.ruleItem}>⏰ Auto-submits when time runs out</div>}
          <div style={styles.ruleItem}>⚠️ You can only attempt this mock once per day</div>
        </div>

        <button onClick={onStart} style={styles.startBtn}>🚀 Start Today's Mock</button>
      </div>

      {pastAttempts.length > 0 && <PastAttemptsPanel pastAttempts={pastAttempts} />}
    </div>
  );
}

function AlreadyDoneScreen({ result, pastAttempts, countdown, onBack }) {
  return (
    <div style={styles.introWrap}>
      <button onClick={onBack} style={styles.backLink}>← Back to Hub</button>

      <div style={styles.introCard}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>
          {result.score >= 60 ? '🏆' : result.score >= 40 ? '📊' : '💪'}
        </div>
        <h1 style={styles.introTitle}>Today's Mock Complete!</h1>
        <p style={styles.introSub}>You've already attempted today's daily mock.</p>

        <div style={styles.bigScore}>
          <span style={{
            ...styles.bigScoreNum,
            color: result.score >= 60 ? '#10B981' : result.score >= 40 ? '#F59E0B' : '#EF4444',
          }}>
            {result.score}%
          </span>
          <span style={styles.bigScoreSub}>{result.correct} / {result.total} correct</span>
        </div>

        <div style={styles.nextMock}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Next mock available in</span>
          <span style={styles.countdownBig}>{formatCountdown(countdown)}</span>
        </div>

        <button onClick={onBack} style={styles.navBtnPrimary}>← Back to Hub</button>
      </div>

      {pastAttempts.length > 0 && <PastAttemptsPanel pastAttempts={pastAttempts} />}
    </div>
  );
}

function ResultScreen({ result, pastAttempts, countdown, onBack }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const subjectMap = {};
  (result.breakdown || []).forEach(item => {
    const s = item.subject || 'General';
    if (!subjectMap[s]) subjectMap[s] = { correct: 0, total: 0 };
    subjectMap[s].total++;
    if (item.isCorrect) subjectMap[s].correct++;
  });
  const subjects = Object.entries(subjectMap).sort((a, b) => b[1].total - a[1].total);

  return (
    <div style={styles.introWrap}>
      <button onClick={onBack} style={styles.backLink}>← Back to Hub</button>

      <div style={styles.introCard}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>
          {result.score >= 60 ? '🏆' : result.score >= 40 ? '📊' : '💪'}
        </div>
        <h1 style={styles.introTitle}>Mock Complete!</h1>

        <div style={styles.bigScore}>
          <span style={{
            ...styles.bigScoreNum,
            color: result.score >= 60 ? '#10B981' : result.score >= 40 ? '#F59E0B' : '#EF4444',
          }}>
            {result.score}%
          </span>
          <span style={styles.bigScoreSub}>
            {result.correct} / {result.total} correct
            {result.timeTaken ? ` · ${formatTime(result.timeTaken)}` : ''}
          </span>
        </div>

        {subjects.length > 1 && (
          <div style={styles.subjectBreakdown}>
            <h4 style={styles.breakdownTitle}>Performance by Subject</h4>
            {subjects.map(([name, { correct, total }]) => {
              const pct = Math.round((correct / total) * 100);
              return (
                <div key={name} style={styles.subjectRow}>
                  <span style={styles.subjectName}>{name}</span>
                  <div style={styles.subjectBarWrap}>
                    <div style={{
                      ...styles.subjectBar,
                      width: `${pct}%`,
                      background: pct >= 60 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444',
                    }} />
                  </div>
                  <span style={styles.subjectPct}>{pct}%</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={styles.nextMock}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Next mock available in</span>
          <span style={styles.countdownBig}>{formatCountdown(countdown)}</span>
        </div>

        <button onClick={() => setShowBreakdown(b => !b)} style={{ ...styles.navBtnPrimary, marginBottom: 12 }}>
          {showBreakdown ? 'Hide Review' : '📋 Review Answers'}
        </button>

        {showBreakdown && (
          <div style={styles.reviewList}>
            {(result.breakdown || []).map((item, i) => (
              <div key={i} style={{
                ...styles.reviewItem,
                borderLeft: `4px solid ${item.isCorrect ? '#10B981' : '#EF4444'}`,
              }}>
                <div style={styles.reviewQ}><strong>Q{i + 1}:</strong> {item.question}</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  <span style={{ color: item.isCorrect ? '#10B981' : '#EF4444' }}>
                    {item.isCorrect ? '✅' : '❌'} Your answer: {item.chosen || 'Not answered'}
                  </span>
                  {!item.isCorrect && (
                    <span style={{ color: '#10B981', marginLeft: 12 }}>Correct: {item.correct}</span>
                  )}
                </div>
                {item.explanation && <div style={styles.explanation}>{item.explanation}</div>}
              </div>
            ))}
          </div>
        )}

        <button onClick={onBack} style={styles.navBtn}>← Back to Hub</button>
      </div>

      {pastAttempts.length > 0 && <PastAttemptsPanel pastAttempts={pastAttempts} />}
    </div>
  );
}

function PastAttemptsPanel({ pastAttempts }) {
  return (
    <div style={styles.pastWrap}>
      <h3 style={styles.pastTitle}>Your History (Last 7 Days)</h3>
      <div style={styles.pastList}>
        {pastAttempts.map(a => (
          <div key={a.id} style={styles.pastItem}>
            <span style={styles.pastDate}>{a.date}</span>
            <div style={styles.pastScore}>
              <div style={{
                ...styles.pastBar,
                width: `${a.score}%`,
                background: a.score >= 60 ? '#10B981' : a.score >= 40 ? '#F59E0B' : '#EF4444',
              }} />
            </div>
            <span style={{
              ...styles.pastPct,
              color: a.score >= 60 ? '#10B981' : a.score >= 40 ? '#F59E0B' : '#EF4444',
            }}>{a.score}%</span>
            <span style={styles.pastDetail}>{a.correct}/{a.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoTile({ icon, label, value, mono }) {
  return (
    <div style={styles.infoTile}>
      <span style={styles.infoIcon}>{icon}</span>
      <span style={styles.infoLabel}>{label}</span>
      <span style={{ ...styles.infoValue, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  examWrap: { minHeight: '100vh', background: 'var(--bg-primary, #020B18)', color: 'var(--text-primary, #fff)', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif" },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' },
  topLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  topRight: { display: 'flex', alignItems: 'center', gap: 16 },
  backBtn: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  mockLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600 },
  timer: { fontFamily: 'monospace', fontSize: 18, fontWeight: 700, background: 'rgba(0,0,0,0.3)', padding: '4px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' },
  progress: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  progressBarWrap: { height: 3, background: 'rgba(255,255,255,0.06)', position: 'sticky', top: 53, zIndex: 99 },
  progressBar: { height: '100%', background: 'linear-gradient(90deg,#0D9488,#1E3A8A)', transition: 'width 0.3s ease' },
  gridNav: { padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' },
  gridNavInner: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  gridBtn: { width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' },
  qCard: { flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '24px 20px' },
  qMeta: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  qNum: { fontSize: 12, fontWeight: 700, color: '#0D9488', background: 'rgba(13,148,136,0.12)', padding: '3px 10px', borderRadius: 20 },
  qSubject: { fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: 20 },
  qSchool: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  flagBtn: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'color 0.15s' },
  qText: { fontSize: 17, lineHeight: 1.65, fontWeight: 500, marginBottom: 24, padding: '16px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' },
  optionsGrid: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 },
  optBtn: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', color: '#fff' },
  optLabel: { width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  optText: { fontSize: 15, lineHeight: 1.5, paddingTop: 2 },
  navRow: { display: 'flex', justifyContent: 'space-between', gap: 12 },
  navBtn: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', padding: '10px 22px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  navBtnPrimary: { background: 'linear-gradient(135deg,#0D9488,#0f766e)', border: 'none', color: '#fff', padding: '10px 22px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  submitBtn: { background: 'linear-gradient(135deg,#10B981,#059669)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  summaryBar: { display: 'flex', alignItems: 'center', gap: 20, padding: '10px 20px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: 'rgba(255,255,255,0.5)', position: 'sticky', bottom: 0, backdropFilter: 'blur(12px)' },
  quickSubmit: { marginLeft: 'auto', background: 'linear-gradient(135deg,#10B981,#059669)', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  centered: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12, padding: 24 },
  spinner: { width: 40, height: 40, border: '3px solid rgba(13,148,136,0.2)', borderTop: '3px solid #0D9488', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  introWrap: { maxWidth: 700, margin: '0 auto', padding: '24px 16px 48px', color: 'var(--text-primary, #fff)' },
  backLink: { background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: '0 0 16px', display: 'block' },
  introCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '32px 28px', textAlign: 'center', marginBottom: 24 },
  introIcon: { fontSize: 52, marginBottom: 8 },
  introTitle: { fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, margin: '0 0 8px' },
  introSub: { color: 'rgba(255,255,255,0.5)', fontSize: 15, marginBottom: 28, lineHeight: 1.5 },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 },
  infoTile: { background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  infoIcon: { fontSize: 22 },
  infoLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 18, fontWeight: 700 },
  rules: { textAlign: 'left', background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)', borderRadius: 12, padding: '16px 18px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 8 },
  ruleItem: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 },
  startBtn: { background: 'linear-gradient(135deg,#0D9488,#1E3A8A)', border: 'none', color: '#fff', padding: '14px 36px', borderRadius: 12, cursor: 'pointer', fontSize: 16, fontWeight: 700, letterSpacing: 0.3 },
  bigScore: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, margin: '20px 0' },
  bigScoreNum: { fontSize: 64, fontWeight: 900, lineHeight: 1, fontFamily: "'Playfair Display', serif" },
  bigScoreSub: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  nextMock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, margin: '16px 0 24px', padding: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: 12 },
  countdownBig: { fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color: '#0D9488' },
  subjectBreakdown: { textAlign: 'left', marginBottom: 20, width: '100%' },
  breakdownTitle: { fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
  subjectRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  subjectName: { width: 130, fontSize: 13, color: 'rgba(255,255,255,0.6)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  subjectBarWrap: { flex: 1, height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' },
  subjectBar: { height: '100%', borderRadius: 4, transition: 'width 0.5s ease' },
  subjectPct: { width: 38, fontSize: 13, fontWeight: 700, textAlign: 'right' },
  reviewList: { textAlign: 'left', maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, padding: '4px 0' },
  reviewItem: { background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 16px' },
  reviewQ: { fontSize: 14, lineHeight: 1.5 },
  explanation: { marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', lineHeight: 1.5 },
  pastWrap: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' },
  pastTitle: { fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  pastList: { display: 'flex', flexDirection: 'column', gap: 10 },
  pastItem: { display: 'flex', alignItems: 'center', gap: 12 },
  pastDate: { width: 90, fontSize: 13, color: 'rgba(255,255,255,0.5)', flexShrink: 0 },
  pastScore: { flex: 1, height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' },
  pastBar: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
  pastPct: { width: 40, fontSize: 13, fontWeight: 700, textAlign: 'right' },
  pastDetail: { width: 50, fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'right' },
};
