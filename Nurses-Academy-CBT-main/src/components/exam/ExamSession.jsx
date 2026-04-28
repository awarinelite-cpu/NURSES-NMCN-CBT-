// src/components/exam/ExamSession.jsx
// READ-OPTIMISED: all pool queries now use limit() so Firestore never scans
// the entire questions collection on every exam start.
//
// Key changes vs previous version:
//   • poolMode queries add limit(POOL_FETCH_LIMIT) — we fetch a larger-than-
//     needed sample, filter seen questions in JS, then slice to `count`.
//     This caps reads at POOL_FETCH_LIMIT per session instead of unbounded.
//   • The fallback "else" branch (no examType filter) is tightened the same way.
//   • handleRetake reuses the same strategy.
//   • Everything else (UI, submit, save/exit, AI, bookmarks, report) is unchanged.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, limit,
  addDoc, serverTimestamp, doc, updateDoc, arrayUnion,
  deleteDoc, increment,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';
import VoiceExamMode         from '../shared/VoiceExamMode';

const DAILY_PRACTICE_LIMIT = 250;

// Maximum questions to fetch from Firestore in a single pool query.
// We fetch more than the user asked for so we have headroom to filter out
// already-seen questions in JS and still hit the requested `count`.
// 300 is generous (most sessions are 10–50 questions) and keeps reads low.
const POOL_FETCH_LIMIT = 300;

function fisherYatesShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function ExitModal({ onSaveExit, onAbandon, onCancel, saving }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🚪</div>
        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>Exit Exam?</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
          Your progress will be saved. You can resume this exam later from the dashboard.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onSaveExit} disabled={saving} style={{ padding: '13px', borderRadius: 12, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 15, border: 'none', background: 'var(--teal)', color: '#fff', opacity: saving ? 0.7 : 1 }}>
            {saving ? '💾 Saving…' : '💾 Save & Exit'}
          </button>
          <button onClick={onAbandon} disabled={saving} style={{ padding: '11px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, border: '1.5px solid rgba(239,68,68,0.5)', background: 'transparent', color: '#EF4444' }}>
            🗑 Exit Without Saving
          </button>
          <button onClick={onCancel} disabled={saving} style={{ padding: '10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            ← Keep Taking Exam
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Simple read-aloud button used in the review panel ──────────────── */
function ReviewReadButton({ text = '' }) {
  const [speaking, setSpeaking] = React.useState(false);
  const toggle = () => {
    if (speaking) { window.speechSynthesis?.cancel(); setSpeaking(false); return; }
    if (!text.trim() || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.lang = 'en-US';
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };
  return (
    <button onClick={toggle} title={speaking ? 'Stop reading' : 'Read question aloud'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
      border: `1px solid ${speaking ? 'rgba(13,148,136,.5)' : 'rgba(13,148,136,.25)'}`,
      background: speaking ? 'rgba(13,148,136,.12)' : 'transparent',
      color: speaking ? '#14B8A6' : '#0D9488', transition: 'all .15s',
    }}>
      {speaking ? '■' : '🔊'} {speaking ? 'Stop' : 'Read'}
    </button>
  );
}

export default function ExamSession() {
  const { state }   = useLocation();
  const navigate    = useNavigate();
  const auth        = useAuth();
  const currentUser = auth.currentUser || auth.user || null;
  const profile     = auth.profile;

  const examId      = state?.examId      || '';
  const examName    = state?.examName    || 'Exam';
  const examType    = state?.examType    || 'daily_practice';
  const category    = state?.category   || '';
  const course      = state?.course     || '';
  const courseLabel = state?.courseLabel || '';
  const topic       = state?.topic      || '';
  const rawCount    = Number(state?.count     || 20);
  // Cap at 10 questions for free (unsubscribed) users
  const now        = new Date();
  const expiry     = profile?.subscriptionExpiry ? new Date(profile.subscriptionExpiry) : null;
  const isSub      = (profile?.subscribed === true || profile?.accessLevel === 'full') && expiry && expiry > now;
  const count      = isSub ? rawCount : Math.min(rawCount, 10);
  const timeLimit   = Number(state?.timeLimit || 0);
  const doShuffle   = state?.doShuffle  !== false;
  const reviewMode  = state?.reviewMode || false;
  const poolMode    = state?.poolMode   || false;
  const savedSession = state?.savedSession || null;
  const resumeMode   = state?.resumeMode   || false;
  const pausedExamId = state?.pausedExamId || null;
  const resumeData   = state?.resumeData   || null;

  // Entrance exam fields
  const isEntranceExam       = state?.isEntranceExam       || false;
  const entranceSchoolId     = state?.entranceSchoolId     || '';
  const entranceSchoolName   = state?.entranceSchoolName   || '';
  const entranceYear         = state?.entranceYear         || '';

  const [questions,     setQuestions]     = useState([]);
  const [phase,         setPhase]         = useState('loading');
  const [current,       setCurrent]       = useState(0);
  const [answers,       setAnswers]       = useState({});
  const [flagged,       setFlagged]       = useState(new Set());
  const [showNav,       setShowNav]       = useState(false);
  const [timeLeft,      setTimeLeft]      = useState(timeLimit * 60);
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiExplain,     setAiExplain]     = useState({});
  const [submitted,     setSubmitted]     = useState(false);
  const [bookmarked,    setBookmarked]    = useState(new Set());
  const [reportedQs,    setReportedQs]    = useState(new Set());
  const [reportText,    setReportText]    = useState('');
  const [showReport,    setShowReport]    = useState(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitSaving,    setExitSaving]    = useState(false);

  const startedAt = useRef(null);

  const questionsRef = useRef([]);
  const answersRef   = useRef({});
  const flaggedRef   = useRef(new Set());
  const currentRef   = useRef(0);

  questionsRef.current = questions;
  answersRef.current   = answers;
  flaggedRef.current   = flagged;
  currentRef.current   = current;

  // ── Load questions ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        let qs = [];

        // ── Resume paused exam (load by saved question IDs) ─────────────────
        if (resumeMode && resumeData?.questionIds?.length) {
          const ids = resumeData.questionIds;
          const chunks = [];
          for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
          const fetched = await Promise.all(chunks.map(chunk =>
            getDocs(query(collection(db, 'questions'), where('__name__', 'in', chunk)))
          ));
          const byId = {};
          fetched.forEach(snap => snap.docs.forEach(d => { byId[d.id] = { id: d.id, ...d.data() }; }));
          qs = ids.map(id => byId[id]).filter(Boolean);

          if (resumeData.answers) {
            const restored = Object.fromEntries(Object.entries(resumeData.answers).map(([k, v]) => [k.replace(/__/g, '/'), v]));
            setAnswers(restored); answersRef.current = restored;
          }
          const resumeQ = resumeData.currentQuestion || 0;
          setCurrent(resumeQ); currentRef.current = resumeQ;
          if (resumeData.flagged?.length) {
            const rf = new Set(resumeData.flagged);
            setFlagged(rf); flaggedRef.current = rf;
          }
          setQuestions(qs); questionsRef.current = qs;
          setPhase('exam'); startedAt.current = Date.now();
          if (pausedExamId) deleteDoc(doc(db, 'pausedExams', pausedExamId)).catch(() => {});
          return;
        }

        // ── Review mode (load by saved question IDs) ────────────────────────
        if (reviewMode && savedSession?.questionIds?.length) {
          const ids = savedSession.questionIds;
          const chunks = [];
          for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
          const fetched = await Promise.all(chunks.map(chunk =>
            getDocs(query(collection(db, 'questions'), where('__name__', 'in', chunk)))
          ));
          const byId = {};
          fetched.forEach(snap => snap.docs.forEach(d => { byId[d.id] = { id: d.id, ...d.data() }; }));
          qs = ids.map(id => byId[id]).filter(Boolean);
          if (savedSession.answers) {
            const restored = Object.fromEntries(Object.entries(savedSession.answers).map(([k, v]) => [k.replace(/__/g, '/'), v]));
            setAnswers(restored);
          }
          setQuestions(qs); setPhase('review'); return;
        }

        // ── Entrance Exam mode — MUST come before poolMode check ──────────────
        if (isEntranceExam && entranceSchoolId) {
          const constraints = [where('schoolId', '==', entranceSchoolId)];
          if (entranceYear && entranceYear !== 'all') {
            constraints.push(where('year', '==', entranceYear));
          }
          // Note: no active filter — entrance questions use 'active' too but
          // let's fetch all and filter client-side to avoid missing index issues
          const snap = await getDocs(query(collection(db, 'entranceExamQuestions'), ...constraints));
          let pool = snap.docs.map(d => {
            const data = d.data();
            const opts = data.options || {};
            return {
              id:           d.id,
              question:     data.questionText || '',
              options:      ['A','B','C','D'].map(l => opts[l] || ''),
              correctIndex: ['A','B','C','D'].indexOf(data.correctAnswer),
              explanation:  data.explanation  || '',
              imageUrl:     data.diagramUrl   || '',
              questionType: data.questionType || 'text',
              subject:      data.subject      || '',
              year:         data.year         || '',
              schoolName:   data.schoolName   || '',
            };
          }).filter(q => q.question && q.options.some(o => o));

          if (pool.length === 0) { setQuestions([]); setPhase('empty'); return; }
          if (doShuffle) pool.sort(() => Math.random() - 0.5);
          qs = pool.slice(0, count);
          setQuestions(qs); questionsRef.current = qs;
          setPhase('exam'); startedAt.current = Date.now();
          return;
        }

        // ── Pool mode (daily practice / course drill / topic drill / mock exam) ─
        if (poolMode) {
          const seenIds  = profile?.seenQuestions || [];
          // How many to fetch: enough to filter seen + still hit `count`.
          // We cap at POOL_FETCH_LIMIT to prevent full-collection scans.
          const fetchLim = Math.min(
            Math.max(count * 4, 100), // fetch 4× requested so seen-filter has room
            POOL_FETCH_LIMIT
          );

          if (examType === 'course_drill' && course) {
            // ── Course Drill ──────────────────────────────────────────────────
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('course', '==', course),
              where('active', '==', true),
              limit(fetchLim),
            ));
            const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (all.length === 0) { setQuestions([]); setPhase('empty'); return; }
            const unseen = all.filter(q => !seenIds.includes(q.id));
            const pool   = unseen.length >= 5 ? unseen : all;
            fisherYatesShuffle(pool);
            qs = pool.slice(0, Math.min(count, pool.length));

          } else if (examType === 'topic_drill' && topic) {
            // ── Topic Drill ───────────────────────────────────────────────────
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('topic',  '==', topic),
              where('active', '==', true),
              limit(fetchLim),
            ));
            const all    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const unseen = all.filter(q => !seenIds.includes(q.id));
            const pool   = unseen.length >= 5 ? unseen : all;
            pool.sort(() => Math.random() - 0.5);
            qs = pool.slice(0, Math.min(count, pool.length));

          } else if (examType === 'daily_practice' && category) {
            // ── Daily Practice ────────────────────────────────────────────────
            const dailyFetchLim = Math.min(
              Math.max(count * 4, 100),
              POOL_FETCH_LIMIT,
            );
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('category', '==', category),
              where('active',   '==', true),
              limit(dailyFetchLim),
            ));
            const all    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const unseen = all.filter(q => !seenIds.includes(q.id));
            const pool   = unseen.length >= 10 ? unseen : all;
            pool.sort(() => Math.random() - 0.5);
            qs = pool.slice(0, Math.min(count, DAILY_PRACTICE_LIMIT));

          } else if (examType === 'mock_exam') {
            // ── Mock Exam ─────────────────────────────────────────────────────
            // mockExamId is passed in state; use it if available, fall back to examId
            const mockId = state?.mockExamId || examId || '';
            const constraints = [where('active', '==', true), limit(fetchLim)];
            if (mockId) constraints.unshift(where('mockExamId', '==', mockId));
            const snap = await getDocs(query(collection(db, 'questions'), ...constraints));
            qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            qs.sort(() => Math.random() - 0.5);
            qs = qs.slice(0, count || qs.length);

          } else {
            // ── Generic fallback (avoid full-collection scan) ─────────────────
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('active', '==', true),
              limit(fetchLim),
            ));
            qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            qs.sort(() => Math.random() - 0.5);
            qs = qs.slice(0, Math.min(count, qs.length));
          }

        } else {
          // ── Non-pool mode: load by examId (fixed exam) ──────────────────────
          if (examId) {
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('examId', '==', examId),
              where('active', '==', true),
            ));
            qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
          // Fallback: query by examType + category
          if (qs.length === 0 && examType && category) {
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('examType',  '==', examType),
              where('category',  '==', category),
              where('active',    '==', true),
            ));
            qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
          const seenIds = profile?.seenQuestions || [];
          const unseen  = qs.filter(q => !seenIds.includes(q.id));
          const pool    = unseen.length >= Math.min(count, 5) ? unseen : qs;
          if (doShuffle) pool.sort(() => Math.random() - 0.5);
          qs = pool.slice(0, count);
        }

        setQuestions(qs); questionsRef.current = qs;
        setPhase(reviewMode ? 'review' : qs.length > 0 ? 'exam' : 'empty');
        startedAt.current = Date.now();
      } catch (e) {
        console.error('ExamSession load error:', e);
        setPhase('error');
      }
    };
    load();
  }, []);

  // ── Timer ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'exam' || timeLimit === 0) return;
    const timer = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { clearInterval(timer); handleSubmit(); return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitted) return;
    setSubmitted(true); setPhase('review');
    if (!currentUser?.uid) return;

    const qs = questionsRef.current;
    const ans = answersRef.current;
    const timeTaken = Math.round((Date.now() - startedAt.current) / 1000);
    const correct = qs.reduce((a, q) => a + (ans[q.id] === q.correctIndex ? 1 : 0), 0);
    const scorePercent = Math.round((correct / qs.length) * 100);
    const questionIds = qs.map(q => q.id);
    const safeAnswers = Object.fromEntries(Object.entries(ans).map(([k, v]) => [k.replace(/\//g, '__'), v]));
    const sessionName = poolMode
      ? examType === 'daily_practice' ? `Daily Practice — ${new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : examType === 'course_drill'   ? `${courseLabel || course} — Course Drill`
      : examType === 'mock_exam'      ? `${examName} — Mock Exam`
      : `${topic} — Topic Drill`
      : examName;

    try {
      await addDoc(collection(db, 'examSessions'), {
        userId: currentUser.uid, examId: examId || null, examName: sessionName,
        category: category || '', examType: examType || '', course: course || '',
        courseLabel: courseLabel || '', topic: topic || '',
        mockExamId: state?.mockExamId || '',
        poolMode, correct,
        totalQuestions: qs.length, scorePercent, timeTaken,
        answers: safeAnswers, questionIds, completedAt: serverTimestamp(),
      });

      // ── Save entrance exam attempt separately ─────────────────────────────
      if (isEntranceExam && entranceSchoolId) {
        await addDoc(collection(db, 'entranceExamAttempts'), {
          userId: currentUser.uid,
          schoolId: entranceSchoolId,
          schoolName: entranceSchoolName,
          year: entranceYear || 'all',
          mode: state?.timeLimit > 0 ? 'timed' : 'practice',
          score: scorePercent,
          correct,
          totalQuestions: qs.length,
          timeTaken,
          answers: safeAnswers,
          questionIds,
          date: serverTimestamp(),
        }).catch(() => {});
      }
      const today     = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const newStreak = profile?.lastPracticeDate === yesterday
        ? (profile?.streak || 0) + 1
        : profile?.lastPracticeDate === today
          ? (profile?.streak || 0)
          : 1;
      await updateDoc(doc(db, 'users', currentUser.uid), {
        completedExams: arrayUnion(examId || sessionName),
        ...(questionIds.length > 0 && { seenQuestions: arrayUnion(...questionIds) }),
        totalExams: increment(1), totalScore: increment(scorePercent),
        totalQuestionsAnswered: increment(qs.length),
        bestScore: Math.max(profile?.bestScore || 0, scorePercent || 0),
        streak: newStreak, lastPracticeDate: today,
        [`examScores.${examId || 'pool'}`]: scorePercent,
      }).catch(e => console.warn('Profile update (non-critical):', e.message));
    } catch (e) { console.error('SAVE FAILED:', e); }
  }, [submitted, currentUser, examId, examName, category, examType, course, courseLabel, topic, profile, poolMode, state]);

  // ── Exit & Save ─────────────────────────────────────────────────────────────
  const handleSaveExit = useCallback(async () => {
    const qs  = questionsRef.current;
    const ans = answersRef.current;
    const fl  = flaggedRef.current;
    const cur = currentRef.current;

    if (!currentUser?.uid) { alert('You must be logged in to save.'); return; }
    if (qs.length === 0) { navigate(-1); return; }

    setExitSaving(true);
    try {
      const safeAnswers = Object.fromEntries(Object.entries(ans).map(([k, v]) => [k.replace(/\//g, '__'), v]));
      const sessionName = poolMode
        ? examType === 'daily_practice' ? `Daily Practice — ${new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`
        : examType === 'course_drill'   ? `${courseLabel || course} — Course Drill`
        : examType === 'mock_exam'      ? `${examName} — Mock Exam`
        : `${topic} — Topic Drill`
        : examName;

      await addDoc(collection(db, 'pausedExams'), {
        userId: currentUser.uid, examName: sessionName,
        examType: examType || '', examId: examId || null,
        category: category || '', course: course || '',
        courseLabel: courseLabel || '', topic: topic || '',
        mockExamId: state?.mockExamId || '',
        poolMode, timeLimit,
        questionIds: qs.map(q => q.id),
        answers: safeAnswers, flagged: [...fl],
        currentQuestion: cur, answeredCount: Object.keys(ans).length,
        totalQuestions: qs.length, savedAt: serverTimestamp(),
      });

      setExitSaving(false); setShowExitModal(false);
      navigate(-1);
    } catch (e) {
      console.error('Save exit failed:', e);
      setExitSaving(false);
      alert(`Save failed: ${e.message}`);
    }
  }, [currentUser, poolMode, examType, examId, category, course, courseLabel, topic, examName, timeLimit, navigate, state]);

  const handleAbandonExit = useCallback(() => { setShowExitModal(false); navigate(-1); }, [navigate]);

  // ── AI Explain ──────────────────────────────────────────────────────────────
  const getAiExplain = async (q) => {
    if (aiExplain[q.id]) return;
    setAiLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 400,
          messages: [{ role: 'user', content: `Explain this nursing exam question in 3-4 sentences. Be concise and clinical.\n\nQuestion: ${q.question}\nOptions: ${q.options?.map((o,i)=>`${String.fromCharCode(65+i)}. ${o}`).join(', ')}\nCorrect answer: ${q.options?.[q.correctIndex]}\n${q.explanation ? `Explanation hint: ${q.explanation}` : ''}` }],
        }),
      });
      const data = await res.json();
      setAiExplain(prev => ({ ...prev, [q.id]: data.content?.[0]?.text || 'Could not generate explanation.' }));
    } catch {
      setAiExplain(prev => ({ ...prev, [q.id]: 'AI explanation unavailable.' }));
    } finally { setAiLoading(false); }
  };

  // ── Bookmark ────────────────────────────────────────────────────────────────
  const toggleBookmark = async (q) => {
    if (!currentUser?.uid) return;
    const isBookmarked = bookmarked.has(q.id);
    try {
      if (isBookmarked) {
        const snap = await getDocs(query(collection(db, 'bookmarks'), where('userId', '==', currentUser.uid), where('questionId', '==', q.id)));
        snap.docs.forEach(d => deleteDoc(doc(db, 'bookmarks', d.id)));
        setBookmarked(prev => { const s = new Set(prev); s.delete(q.id); return s; });
        await updateDoc(doc(db, 'users', currentUser.uid), { bookmarkCount: Math.max((profile?.bookmarkCount || 1) - 1, 0) }).catch(() => {});
      } else {
        await addDoc(collection(db, 'bookmarks'), { userId: currentUser.uid, questionId: q.id, category: q.category || category, createdAt: serverTimestamp() });
        setBookmarked(prev => new Set(prev).add(q.id));
        await updateDoc(doc(db, 'users', currentUser.uid), { bookmarkCount: increment(1) }).catch(() => {});
      }
    } catch (e) { console.error('Bookmark error:', e); }
  };

  // ── Report ──────────────────────────────────────────────────────────────────
  const submitReport = async (q) => {
    if (!reportText.trim() || !currentUser?.uid) return;
    try {
      await addDoc(collection(db, 'questionReports'), { questionId: q.id, question: q.question, userId: currentUser.uid, report: reportText.trim(), createdAt: serverTimestamp(), status: 'pending' });
      setReportedQs(prev => new Set(prev).add(q.id)); setShowReport(null); setReportText('');
    } catch (e) { console.error('Report error:', e); }
  };

  // ── Retake ──────────────────────────────────────────────────────────────────
  const handleRetake = () => {
    setAnswers({}); answersRef.current = {};
    setFlagged(new Set()); flaggedRef.current = new Set();
    setCurrent(0); currentRef.current = 0;
    setSubmitted(false); setAiExplain({}); setPhase('loading');

    const load = async () => {
      try {
        let qs = [];
        const justSeen  = questionsRef.current.map(q => q.id);
        const seenIds   = [...(profile?.seenQuestions || []), ...justSeen];
        const fetchLim  = Math.min(Math.max(count * 4, 100), POOL_FETCH_LIMIT);

        if (poolMode) {
          if (examType === 'course_drill' && course) {
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('course', '==', course),
              where('active', '==', true),
              limit(fetchLim),
            ));
            const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const pool = all.filter(q => !seenIds.includes(q.id)).length >= 5
              ? all.filter(q => !seenIds.includes(q.id)) : all;
            fisherYatesShuffle(pool);
            qs = pool.slice(0, Math.min(count, pool.length));

          } else if (examType === 'mock_exam') {
            const mockId = state?.mockExamId || examId || '';
            const constraints = [where('active', '==', true), limit(fetchLim)];
            if (mockId) constraints.unshift(where('mockExamId', '==', mockId));
            const snap = await getDocs(query(collection(db, 'questions'), ...constraints));
            qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            qs.sort(() => Math.random() - 0.5);
            qs = qs.slice(0, count || qs.length);

          } else {
            const bc = [where('active', '==', true), limit(fetchLim)];
            if (examType === 'topic_drill' && topic)          bc.unshift(where('topic',    '==', topic));
            else if (examType === 'daily_practice' && category) bc.unshift(where('category', '==', category));
            const snap = await getDocs(query(collection(db, 'questions'), ...bc));
            const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const minV = examType === 'daily_practice' ? 10 : 5;
            const pool = all.filter(q => !seenIds.includes(q.id)).length >= minV
              ? all.filter(q => !seenIds.includes(q.id)) : all;
            pool.sort(() => Math.random() - 0.5);
            qs = pool.slice(0, Math.min(count, examType === 'daily_practice' ? DAILY_PRACTICE_LIMIT : pool.length));
          }
        } else {
          const snap = await getDocs(query(
            collection(db, 'questions'),
            where('examId', '==', examId),
            where('active', '==', true),
          ));
          qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (doShuffle) qs.sort(() => Math.random() - 0.5);
          qs = qs.slice(0, count);
        }

        setQuestions(qs); questionsRef.current = qs;
        setTimeLeft(timeLimit * 60);
        setPhase(qs.length > 0 ? 'exam' : 'empty');
        startedAt.current = Date.now();
      } catch { setPhase('error'); }
    };
    load();
  };

  const answered   = Object.keys(answers).length;
  const unanswered = questions.length - answered;
  const mins       = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs       = String(timeLeft % 60).padStart(2, '0');
  const timerColor = timeLeft < 60 ? '#EF4444' : timeLeft < 300 ? '#F59E0B' : 'var(--teal)';
  const score      = questions.reduce((a, q) => a + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
  const scorePct   = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const scoreColor = scorePct >= 70 ? '#16A34A' : scorePct >= 50 ? '#F59E0B' : '#EF4444';

  if (phase === 'loading') return (<div style={S.center}><div className="spinner" style={{ width: 40, height: 40 }} /><p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Loading questions…</p></div>);
  if (phase === 'empty')   return (<div style={S.center}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 16 }}>📭</div><h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>No questions found</h3><p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>{poolMode ? examType === 'topic_drill' ? `No questions for topic "${topic}" yet.` : examType === 'course_drill' ? 'No questions for this course yet.' : 'No questions available yet.' : 'No questions available for this exam yet.'}</p><button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button></div></div>);
  if (phase === 'error')   return (<div style={S.center}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div><h3>Error loading questions</h3><button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button></div></div>);

  const q = questions[current];

  if (phase === 'review') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {!reviewMode && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{poolMode ? examType === 'daily_practice' ? '⚡ Daily Practice' : examType === 'course_drill' ? `📖 Course Drill — ${courseLabel || course}` : examType === 'mock_exam' ? `🏥 Mock Exam — ${examName}` : `🎯 Topic Drill — ${topic}` : examName}</div>
              <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{scorePct}%</div>
              <div style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 20px' }}>{score} / {questions.length} correct</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                {[{ label: 'Correct', value: score, color: '#16A34A' }, { label: 'Wrong', value: questions.length - score, color: '#EF4444' }, { label: 'Unanswered', value: unanswered, color: '#64748B' }].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div></div>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const isCD = examType === 'course_drill';
            const stats = {};
            questions.forEach(q => {
              const cat = isCD ? (q.topic || 'General') : (q.courseLabel || q.course || q.category || 'Uncategorized');
              if (!stats[cat]) stats[cat] = { correct: 0, total: 0 };
              stats[cat].total++;
              if (answers[q.id] === q.correctIndex) stats[cat].correct++;
            });
            const cats = Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
            if (!cats.length) return null;
            return (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>{isCD ? 'Performance by Topic' : 'Performance by Category'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{isCD ? 'Topic breakdown for this course drill.' : 'Areas of strength and opportunities for review.'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {cats.map(([cat, { correct, total }]) => {
                    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
                    const bc  = pct >= 70 ? 'var(--teal)' : pct >= 50 ? '#F59E0B' : '#EF4444';
                    return (
                      <div key={cat}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{cat}</span><span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{correct}/{total} ({pct}%)</span></div>
                        <div style={{ height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 4, background: bc, width: `${pct}%`, transition: 'width 0.5s ease' }} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-primary)', paddingBottom: 12, paddingTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => navigate(poolMode ? -1 : -2)} style={{ flex: '1 1 100px' }}>🏠 Back Home</button>
            {!reviewMode && <button className="btn btn-primary" onClick={handleRetake} style={{ flex: '1 1 100px' }}>🔄 Retake</button>}
            {reviewMode  && <button className="btn btn-ghost"   onClick={() => navigate(-1)} style={{ flex: '1 1 100px' }}>← Back</button>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {questions.map((q, i) => {
              const userAns = answers[q.id], isCorrect = userAns === q.correctIndex, isAnswered = userAns !== undefined;
              return (
                <div key={q.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, borderLeft: `4px solid ${isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B'}` }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B', color: '#fff', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.5, flex: 1 }}>{q.question}</p>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
                      <ReviewReadButton text={q.question} />
                      {q.topic  && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 20, background: 'rgba(13,148,136,0.08)', color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>📌 {q.topic}</span>}
                      {q.course && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 20, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.course}</span>}
                    </div>
                  </div>
                  {q.imageUrl && <div style={{ marginBottom: 12, textAlign: 'center' }}><img src={q.imageUrl} alt="Question" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1px solid var(--border)', objectFit: 'contain' }} /></div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {q.options?.map((opt, j) => {
                      const isUser = userAns === j, isCorrectOpt = q.correctIndex === j;
                      let bg = 'var(--bg-tertiary)', color = 'var(--text-secondary)', border = 'var(--border)';
                      if (isCorrectOpt)            { bg = 'rgba(22,163,74,0.12)';  color = '#16A34A'; border = 'rgba(22,163,74,0.4)'; }
                      if (isUser && !isCorrectOpt) { bg = 'rgba(239,68,68,0.12)'; color = '#EF4444'; border = 'rgba(239,68,68,0.4)'; }
                      return (
                        <div key={j} style={{ padding: '10px 14px', borderRadius: 8, fontSize: 14, background: bg, color, border: `1px solid ${border}`, fontWeight: isCorrectOpt || isUser ? 700 : 400, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: isCorrectOpt ? '#16A34A' : isUser ? '#EF4444' : 'var(--bg-card)', color: isCorrectOpt || isUser ? '#fff' : 'var(--text-muted)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${border}` }}>{String.fromCharCode(65 + j)}</span>
                          {typeof opt === 'string' ? opt : opt.text}
                          {isCorrectOpt && <span style={{ marginLeft: 'auto' }}>✓</span>}
                          {isUser && !isCorrectOpt && <span style={{ marginLeft: 'auto' }}>✗</span>}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 4, fontSize: 12 }}>💡 Explanation</div>
                      {q.explanation}
                      {q.explanationImageUrl && <div style={{ marginTop: 10, textAlign: 'center' }}><img src={q.explanationImageUrl} alt="Explanation" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, objectFit: 'contain' }} /></div>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => getAiExplain(q)} disabled={aiLoading && !aiExplain[q.id]} style={{ fontSize: 12 }}>{aiExplain[q.id] ? '🤖 AI Explained' : aiLoading ? '⏳ Loading…' : '🤖 Ask AI to Explain'}</button>
                    <button onClick={() => toggleBookmark(q)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${bookmarked.has(q.id) ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`, background: bookmarked.has(q.id) ? 'rgba(245,158,11,0.12)' : 'transparent', color: bookmarked.has(q.id) ? '#F59E0B' : 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>🔖 {bookmarked.has(q.id) ? 'Bookmarked ✓' : 'Bookmark this Question'}</button>
                    {!reportedQs.has(q.id) && <button onClick={() => setShowReport(showReport === q.id ? null : q.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '5px 8px' }}>🚩 Report</button>}
                    {reportedQs.has(q.id)  && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>✓ Reported</span>}
                  </div>
                  {aiExplain[q.id] && <div style={{ marginTop: 8, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>🤖 {aiExplain[q.id]}</div>}
                  {showReport === q.id && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <input value={reportText} onChange={e => setReportText(e.target.value)} placeholder="Describe the issue (wrong answer, typo, etc.)" style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }} />
                      <button className="btn btn-sm" onClick={() => submitReport(q)} style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Submit</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {showExitModal && <ExitModal onSaveExit={handleSaveExit} onAbandon={handleAbandonExit} onCancel={() => setShowExitModal(false)} saving={exitSaving} />}

      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '10px 16px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.2 }}>{poolMode ? examType === 'daily_practice' ? '⚡ Daily Practice' : examType === 'course_drill' ? `📖 ${courseLabel || 'Course Drill'}` : examType === 'mock_exam' ? `🏥 ${examName}` : `🎯 ${topic || 'Topic Drill'}` : examName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Q{current + 1} of {questions.length} · {answered} answered</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {timeLimit > 0 && <div style={{ fontWeight: 800, fontSize: 22, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>⏱ {mins}:{secs}</div>}
              <button onClick={() => setShowExitModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, cursor: 'pointer', background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.4)', color: '#F59E0B', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }} title="Save your progress and exit">🚪 Exit</button>
              <button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm('Submit exam now?')) handleSubmit(); }}>Submit</button>
            </div>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'var(--teal)', width: `${(answered / questions.length) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px' }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setShowNav(v => !v)}>{showNav ? '▲ Hide' : '▼ Show'} Question Navigator</button>
        {showNav && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {questions.map((q, i) => {
                const isAnswered = answers[q.id] !== undefined, isFlagged = flagged.has(q.id), isCurrent = i === current;
                return <button key={q.id} onClick={() => setCurrent(i)} style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit', borderColor: isCurrent ? 'var(--teal)' : isFlagged ? '#F59E0B' : isAnswered ? '#16A34A' : 'var(--border)', background: isCurrent ? 'var(--teal)' : isFlagged ? '#F59E0B18' : isAnswered ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)', color: isCurrent ? '#fff' : isFlagged ? '#F59E0B' : isAnswered ? '#16A34A' : 'var(--text-muted)' }}>{i + 1}</button>;
              })}
            </div>
          </div>
        )}

        {q && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {examType && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(13,148,136,0.12)', color: 'var(--teal)', border: '1px solid rgba(13,148,136,0.3)' }}>{examType.replace(/_/g, ' ')}</span>}
              {q.topic  && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📌 {q.topic}</span>}
              {q.course && poolMode && examType === 'daily_practice' && <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>· {q.course}</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => setFlagged(prev => { const s = new Set(prev); s.has(q.id) ? s.delete(q.id) : s.add(q.id); return s; })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: flagged.has(q.id) ? 1 : 0.35 }}>🚩</button>
                <button onClick={() => toggleBookmark(q)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: bookmarked.has(q.id) ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${bookmarked.has(q.id) ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: bookmarked.has(q.id) ? '#F59E0B' : 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>🔖 {bookmarked.has(q.id) ? 'Bookmarked' : 'Bookmark'}</button>
              </div>
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.65, color: 'var(--text-primary)', margin: '0 0 12px' }}>{q.question}</p>
            <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <VoiceExamMode
                question={q.question}
                options={q.options || []}
                questionId={q.id}
                onAnswer={(idx) => setAnswers(prev => ({ ...prev, [q.id]: idx }))}
                onNext={() => setCurrent(c => Math.min(c + 1, questions.length - 1))}
                hasNext={current < questions.length - 1}
              />
            </div>
            {q.imageUrl && <div style={{ marginBottom: 16, textAlign: 'center' }}><img src={q.imageUrl} alt="Question diagram" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 10, border: '1px solid var(--border)', objectFit: 'contain' }} /></div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {q.options?.map((opt, i) => {
                const selected = answers[q.id] === i;
                return (
                  <button key={i} id={`vem-opt-${i}`} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: i }))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, textAlign: 'left', border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`, background: selected ? 'rgba(13,148,136,0.1)' : 'var(--bg-tertiary)', color: selected ? 'var(--teal)' : 'var(--text-primary)', fontWeight: selected ? 700 : 400, transition: 'all 0.15s' }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: selected ? 'var(--teal)' : 'var(--bg-card)', color: selected ? '#fff' : 'var(--text-muted)', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}` }}>{String.fromCharCode(65 + i)}</span>
                    {typeof opt === 'string' ? opt : opt.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost" disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>← Previous</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{current + 1} / {questions.length}</span>
          {current < questions.length - 1
            ? <button className="btn btn-primary" onClick={() => setCurrent(c => c + 1)}>Next →</button>
            : <button className="btn btn-primary" onClick={() => { if (window.confirm(`Submit exam? ${unanswered > 0 ? `You have ${unanswered} unanswered question(s).` : 'All questions answered.'}`)) handleSubmit(); }}>✅ Finish</button>
          }
        </div>
      </div>
    </div>
  );
}

const S = { center: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-primary)' } };