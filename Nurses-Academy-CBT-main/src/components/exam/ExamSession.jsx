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
//   • FIX: explanation text now splits on \n so calculation steps render
//     on separate lines instead of collapsing into one sentence.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection, query, where, getDocs, limit,
  addDoc, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove,
  deleteDoc, increment,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';
import VoiceExamMode         from '../shared/VoiceExamMode';
import { useToast }          from '../shared/Toast';
import { getSRSBoost }       from '../../hooks/useSpacedRepetition';
import QuestionNoteButton    from '../shared/QuestionNoteButton';
import { fetchNotesMap }     from '../../utils/notesUtils';
import ShareResultCard       from '../shared/ShareResultCard';

// ── Personal Note Modal ───────────────────────────────────────────────────────
function NoteModal({ questionId, userId, existingNote, onClose, onSaved }) {
  const [text, setText] = useState(existingNote || '');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const { doc: fDoc, setDoc: fSetDoc, serverTimestamp: fST, deleteDoc: fDel } = await import('firebase/firestore');
      const { db: fDb } = await import('../../firebase/config');
      const noteId = `${userId}_${questionId.replace(/\//g, '__')}`;
      const ref = fDoc(fDb, 'questionNotes', noteId);
      if (text.trim()) {
        await fSetDoc(ref, { userId, questionId, note: text.trim(), updatedAt: fST() }, { merge: true });
        onSaved(questionId, text.trim());
      } else {
        await fDel(ref).catch(() => {});
        onSaved(questionId, '');
      }
      onClose();
    } catch (e) { console.error('Note save error:', e); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '20px 20px 16px 16px', padding: 24, width: '100%', maxWidth: 560, boxShadow: '0 -8px 40px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 15, color: 'var(--text-primary)' }}>📝 Personal Note</div>
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontFamily: "'Times New Roman', Times, serif" }}>
          Private note — only you can see this.
        </div>
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          placeholder={'e.g. "Remember: Digoxin toxicity → bradycardia + yellow halos."'}
          rows={4}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-primary)', border: '1.5px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, fontFamily: "'Times New Roman', Times, serif", lineHeight: 1.65, resize: 'vertical', boxSizing: 'border-box' }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', background: 'var(--teal)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : text.trim() ? '💾 Save Note' : '🗑 Delete Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confetti burst (fires on score ≥ 70%) ────────────────────────────────────
function Confetti({ active }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const COLORS = ['#0D9488','#F59E0B','#EF4444','#22C55E','#A855F7','#3B82F6','#F97316'];
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 100,
      r: Math.random() * 7 + 3,
      d: Math.random() * 120 + 60,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: 0,
      tiltSpeed: Math.random() * 0.1 + 0.04,
    }));
    let alpha = 1;
    let frame;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = alpha;
      pieces.forEach(p => {
        p.tiltAngle += p.tiltSpeed;
        p.y += Math.cos(p.d) + 2.5;
        p.tilt = Math.sin(p.tiltAngle) * 15;
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      });
      alpha -= 0.004;
      if (alpha > 0) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [active]);
  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: 'none', width: '100%', height: '100%',
      }}
    />
  );
}

const DAILY_PRACTICE_LIMIT = 250;

const POOL_FETCH_LIMIT = 300;

// Turn any freeform string (course label, topic name, category id) into a
// safe Firestore map-field key: lowercase, alphanumeric + underscore only.
// Used for the per-bucket mastery tracking fields (courseMastered.{key},
// topicMastered.{key}, categoryMastered.{key}, mockMastered.{key}).
function sanitizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function fisherYatesShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ── Explanation renderer — imported from shared ── */
import ExplanationText from '../shared/ExplanationText';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

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
          <button onClick={onSaveExit} disabled={saving} style={{ padding: '13px', borderRadius: 12, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: F, fontWeight: 800, fontSize: 15, border: 'none', background: 'var(--teal)', color: 'var(--text-primary)', opacity: saving ? 0.7 : 1 }}>
            {saving ? '💾 Saving…' : '💾 Save & Exit'}
          </button>
          <button onClick={onAbandon} disabled={saving} style={{ padding: '11px', borderRadius: 12, cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 14, border: '1.5px solid rgba(239,68,68,0.5)', background: 'transparent', color: '#EF4444' }}>
            🗑 Exit Without Saving
          </button>
          <button onClick={onCancel} disabled={saving} style={{ padding: '10px', borderRadius: 12, cursor: 'pointer', fontFamily: F, fontWeight: 600, fontSize: 14, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            ← Keep Taking Exam
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Upgrade modal shown when free user reaches Q10 ─────────────────── */
function UpgradeModal({ onContinue, onUpgrade }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '2px solid rgba(13,148,136,0.5)', borderRadius: 24, padding: 32, maxWidth: 420, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
        <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 22, fontWeight: 900, fontFamily: "'Arial Black', Arial, sans-serif" }}>
          You've reached your free limit!
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 8px' }}>
          Free users get <strong style={{ color: 'var(--teal)' }}>10 questions</strong> per session.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
          Upgrade to <strong style={{ color: '#F59E0B' }}>Nurses Academy Premium</strong> for <em>unlimited access</em> to all questions, mock exams, and daily practice.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onUpgrade}
            style={{ padding: '14px', borderRadius: 12, cursor: 'pointer', fontWeight: 900, fontSize: 15, border: 'none', background: 'linear-gradient(135deg, #0D9488, #0F766E)', color: '#fff', letterSpacing: 0.5, fontFamily: "'Arial Black', Arial, sans-serif" }}
          >
            🚀 Upgrade Now — Get Full Access
          </button>
          <button
            onClick={onContinue}
            style={{ padding: '11px', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            Finish this question & submit
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
  const [sp]        = useSearchParams();   // fallback for pages that navigate via URL params
  const navigate    = useNavigate();
  const auth        = useAuth();
  const currentUser = auth.currentUser || auth.user || null;
  const profile     = auth.profile;
  const { toast }   = useToast();

  // Helper: prefer router state, fall back to URL search param
  const sp_str  = (key, def = '')  => state?.[key]  ?? sp.get(key)  ?? def;
  const sp_num  = (key, def = 0)   => Number(state?.[key] ?? sp.get(key) ?? def);
  const sp_bool = (key, def = true) => state?.[key] !== undefined
    ? state[key]
    : sp.get(key) !== null
      ? sp.get(key) !== 'false'
      : def;

  const examId      = sp_str('examId');
  const examName    = sp_str('examName', 'Exam');
  const examType    = sp_str('examType', 'daily_practice');
  const category    = sp_str('category');
  const course      = sp_str('course');
  const courseLabel = sp_str('courseLabel');
  const topic       = sp_str('topic');
  const rawCount    = sp_num('count', 20);
  // Cap at 10 questions for free (unsubscribed) users
  const now        = new Date();
  const expiry     = profile?.subscriptionExpiry ? new Date(profile.subscriptionExpiry) : null;
  const PAID_LEVELS = ['full', 'basic', 'standard', 'premium'];
  const isSub      = (profile?.subscribed === true || PAID_LEVELS.includes(profile?.accessLevel)) && expiry && expiry > now;
  const count      = isSub ? rawCount : Math.min(rawCount, 10);
  const timeLimit   = sp_num('timeLimit', 0);
  const doShuffle   = sp_bool('shuffle', true);
  const showExpl    = sp_bool('showExpl', false);
  const reviewMode  = state?.reviewMode || false;
  // poolMode: set explicitly in state for pool-based pages; for URL-param flows
  // (ExamSetup/ExamConfigPage), derive from examType
  const poolMode    = state?.poolMode !== undefined
    ? state.poolMode
    : ['daily_practice','course_drill','topic_drill','mock_exam','past_questions'].includes(examType);
  const savedSession = state?.savedSession || null;
  const resumeMode   = state?.resumeMode   || false;
  const pausedExamId = state?.pausedExamId || null;
  const resumeData   = state?.resumeData   || null;

  // Past questions year filter
  const examYear = state?.examYear || '';

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
  const [notes,         setNotes]         = useState(new Map());
  const [reportedQs,    setReportedQs]    = useState(new Set());
  const [reportText,    setReportText]    = useState('');
  const [showReport,    setShowReport]    = useState(null);
  const [showExitModal,    setShowExitModal]    = useState(false);
  const [exitSaving,       setExitSaving]       = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showConfetti,     setShowConfetti]     = useState(false);
  // Voice mode first-time nudge — shown once ever; dismissed to localStorage
  const VOICE_NUDGE_KEY = 'nmcn_voice_nudge_seen';
  const [showVoiceNudge, setShowVoiceNudge] = useState(() => {
    try { return !localStorage.getItem(VOICE_NUDGE_KEY); }
    catch { return false; }
  });

  // Guard so the upgrade modal only fires once per session
  const upgradeModalShown = useRef(false);

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
          if (!isSub) pool.sort((a, b) => a.id < b.id ? -1 : 1); // unpaid: stable order = same 10 every time
          else if (doShuffle) pool.sort(() => Math.random() - 0.5);
          qs = pool.slice(0, count);
          setQuestions(qs); questionsRef.current = qs;
          setPhase('exam'); startedAt.current = Date.now();
          return;
        }

        // ── Pool mode (daily practice / course drill / topic drill / mock exam) ─
        if (poolMode) {
          // Note: course_drill / topic_drill / daily_practice / mock_exam now use
          // per-bucket mastery tracking (courseMastered / topicMastered /
          // categoryMastered / mockMastered) instead of the generic seenQuestions
          // list, so correctly-answered questions are excluded per-bank rather
          // than globally, and wrong answers always stay eligible to repeat.
          const fetchLim = Math.min(
            Math.max(count * 4, 100),
            POOL_FETCH_LIMIT
          );

          if (examType === 'course_drill' && course) {
            // ── Course Drill ──────────────────────────────────────────────────
            // Correctly-answered questions are excluded until the whole course
            // bank has been mastered (tracked in profile.courseMastered.{key}).
            // Wrongly-answered questions always stay eligible so they repeat.
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('course', '==', course),
              where('active', '==', true),
              limit(fetchLim),
            ));
            const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (all.length === 0) { setQuestions([]); setPhase('empty'); return; }
            const courseKey    = sanitizeKey(course);
            const masteredIds  = profile?.courseMastered?.[courseKey] || [];
            const notMastered  = all.filter(q => !masteredIds.includes(q.id));
            const pool = notMastered.length > 0 ? notMastered : all; // bank exhausted → reset
            fisherYatesShuffle(pool);
            qs = pool.slice(0, Math.min(count, pool.length));

          } else if (examType === 'topic_drill' && topic) {
            // ── Topic Drill ───────────────────────────────────────────────────
            // Same mastery-based exclusion as Course Drill, scoped per topic.
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('topic',  '==', topic),
              where('active', '==', true),
              limit(fetchLim),
            ));
            const all    = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const topicKey     = sanitizeKey(topic);
            const masteredIds2 = profile?.topicMastered?.[topicKey] || [];
            const notMastered2 = all.filter(q => !masteredIds2.includes(q.id));
            const pool = notMastered2.length > 0 ? notMastered2 : all; // bank exhausted → reset
            pool.sort(() => Math.random() - 0.5);
            qs = pool.slice(0, Math.min(count, pool.length));

          } else if (examType === 'daily_practice' && category) {
            // ── Daily Practice ────────────────────────────────────────────────
            // Same mastery-based exclusion, scoped per specialty category.
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
            const categoryKey  = sanitizeKey(category);
            const masteredIds3 = profile?.categoryMastered?.[categoryKey] || [];
            const notMastered3 = all.filter(q => !masteredIds3.includes(q.id));
            const pool = notMastered3.length > 0 ? notMastered3 : all; // bank exhausted → reset
            pool.sort(() => Math.random() - 0.5);

            // ── Spaced repetition boost: reorder pool so overdue/weak
            //    questions float to the top before we slice to `count`.
            const poolIds    = pool.map(q => q.id);
            const srsOrdered = await getSRSBoost(poolIds, currentUser?.uid);
            const poolById   = Object.fromEntries(pool.map(q => [q.id, q]));
            const srsPool    = srsOrdered.map(id => poolById[id]).filter(Boolean);

            qs = srsPool.slice(0, Math.min(count, DAILY_PRACTICE_LIMIT));

          } else if (examType === 'mock_exam') {
            // ── Hospital Final Exam (mock_exam) ─────────────────────────────────
            // No question-count selector here — every attempt draws from the
            // full active question bank for the chosen specialty, MINUS any
            // question the student has already answered correctly in a
            // previous attempt (tracked in profile.mockMastered.{mockId}).
            // Questions answered WRONGLY always stay eligible so they keep
            // being retested. Once every question in the bank has been
            // mastered, the bank is "complete" and is served again in full.
            const mockId = state?.mockExamId || examId || '';
            const mockFetchLim = Math.min(Math.max((count || 100) * 4, 100), 1000);
            const constraints = [where('active', '==', true), limit(mockFetchLim)];
            if (mockId) constraints.unshift(where('mockExamId', '==', mockId));
            const snap = await getDocs(query(collection(db, 'questions'), ...constraints));
            const allMock     = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const masteredIds = (mockId && profile?.mockMastered?.[mockId]) || [];
            const notMastered = allMock.filter(q => !masteredIds.includes(q.id));
            // Bank exhausted (everything mastered) → reset and serve full bank again
            qs = notMastered.length > 0 ? notMastered : allMock;
            qs.sort(() => Math.random() - 0.5);

          } else if (examType === 'past_questions' && category) {
            // ── Past Questions ────────────────────────────────────────────────
            // Query by category + examType; optionally filter by year client-side
            // (Firestore inequality filters need composite indexes; year filter in JS is safer)
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('examType',  '==', 'past_questions'),
              where('category',  '==', category),
              where('active',    '==', true),
              limit(fetchLim),
            ));
            let pool = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Filter by year in JS — no composite index needed
            if (examYear) {
              const filtered = pool.filter(q => String(q.year || '').trim() === String(examYear).trim());
              // Only apply year filter if it yields results — avoids empty exam if year mismatch
              if (filtered.length > 0) pool = filtered;
            }
            const seenIds2 = profile?.seenQuestions || [];
            const unseen2  = pool.filter(q => !seenIds2.includes(q.id));
            const activePool = unseen2.length >= 5 ? unseen2 : pool;
            if (doShuffle) activePool.sort(() => Math.random() - 0.5);
            qs = activePool.slice(0, Math.min(count, activePool.length));

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

        // Unpaid users always get the same fixed questions (sorted by ID) so they repeat until subscribed
        if (!isSub && qs.length > 0) qs = qs.sort((a, b) => a.id < b.id ? -1 : 1).slice(0, count);

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

  // ── Upgrade modal — fire when free user arrives at Q10 ─────────────────────
  useEffect(() => {
    if (phase !== 'exam') return;
    if (isSub) return;                          // paid users never see this
    if (upgradeModalShown.current) return;      // only once per session
    if (current === 9 && questions.length > 0) { // 0-indexed → question 10
      upgradeModalShown.current = true;
      setShowUpgradeModal(true);
    }
  }, [current, phase, isSub, questions.length]);

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
    // 🎉 Fire confetti for passing score
    if (scorePercent >= 70) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4500); }
    const questionIds = qs.map(q => q.id);
    const safeAnswers = Object.fromEntries(Object.entries(ans).map(([k, v]) => [k.replace(/\//g, '__'), v]));
    const sessionName = poolMode
      ? examType === 'daily_practice' ? `Daily Practice — ${new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : examType === 'course_drill'   ? `${courseLabel || course} — Course Drill`
      : examType === 'mock_exam'      ? `${examName} — Hospital Final Exam`
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

      // ── Mastery tracking (Hospital Final Exam / Course Drill / Topic Drill
      //    / Daily Practice — NOT Past Questions, which uses its own
      //    seenQuestions-based logic) ────────────────────────────────────────
      // Questions answered CORRECTLY are added to the mastery list for that
      // bucket so they stop appearing on future attempts. Questions answered
      // WRONGLY are removed from the mastery list (in case a previously-
      // mastered question slips back in) so they keep repeating until the
      // student gets them right. The whole bank resets once every question
      // has been mastered (handled at load time, not here).
      const masteryConfig = examType === 'mock_exam' && state?.mockExamId
        ? { field: 'mockMastered',     key: state.mockExamId }
        : examType === 'course_drill' && course
        ? { field: 'courseMastered',   key: sanitizeKey(course) }
        : examType === 'topic_drill' && topic
        ? { field: 'topicMastered',    key: sanitizeKey(topic) }
        : examType === 'daily_practice' && category
        ? { field: 'categoryMastered', key: sanitizeKey(category) }
        : null;

      if (masteryConfig) {
        const fieldPath  = `${masteryConfig.field}.${masteryConfig.key}`;
        const correctIds = qs.filter(q => ans[q.id] === q.correctIndex).map(q => q.id);
        const wrongIds   = qs.filter(q => ans[q.id] !== q.correctIndex).map(q => q.id);
        if (correctIds.length > 0) {
          updateDoc(doc(db, 'users', currentUser.uid), { [fieldPath]: arrayUnion(...correctIds) })
            .catch(e => console.warn('Mastery update (non-critical):', e.message));
        }
        if (wrongIds.length > 0) {
          updateDoc(doc(db, 'users', currentUser.uid), { [fieldPath]: arrayRemove(...wrongIds) })
            .catch(e => console.warn('Mastery update (non-critical):', e.message));
        }
      }
    } catch (e) { console.error('SAVE FAILED:', e); }

    // ── Spaced repetition: record each answer async (non-blocking) ────────
    if (examType === 'daily_practice' || examType === 'course_drill' || examType === 'topic_drill') {
      const uid = currentUser?.uid;
      if (uid) {
        import('../../hooks/useSpacedRepetition').then(({ recordSRSAnswer }) => {
          qs.forEach(q => {
            const wasCorrect = ans[q.id] === q.correctIndex;
            recordSRSAnswer(uid, q.id, wasCorrect).catch(() => {});
          });
        }).catch(() => {});
      }
    }
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
        : examType === 'mock_exam'      ? `${examName} — Hospital Final Exam`
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
      toast('✅ Progress auto-saved — resume anytime from your dashboard', 'success', 3000);
      navigate('/dashboard');
    } catch (e) {
      console.error('Save exit failed:', e);
      setExitSaving(false);
      alert(`Save failed: ${e.message}`);
    }
  }, [currentUser, poolMode, examType, examId, category, course, courseLabel, topic, examName, timeLimit, navigate, state]);

  const handleAbandonExit = useCallback(() => { setShowExitModal(false); navigate('/dashboard'); }, [navigate]);

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

  // ── Personal notes ───────────────────────────────────────────────────────────
  // Loaded once per session so existing notes show as "My Note ✓" immediately,
  // instead of only appearing after the student opens the popover.
  useEffect(() => {
    if (!currentUser?.uid) return;
    fetchNotesMap(currentUser.uid).then(setNotes);
  }, [currentUser?.uid]);

  const handleNoteSaved = useCallback((questionId, text) => {
    setNotes(prev => {
      const next = new Map(prev);
      if (text) next.set(questionId, { text });
      else next.delete(questionId);
      return next;
    });
  }, []);

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
        // Retake uses the same per-bucket mastery exclusion as the initial
        // load (courseMastered / topicMastered / categoryMastered /
        // mockMastered) — correct answers stay excluded, wrong answers
        // always stay eligible, and the bank resets once fully mastered.
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
            const courseKey   = sanitizeKey(course);
            const masteredIds = profile?.courseMastered?.[courseKey] || [];
            const notMastered = all.filter(q => !masteredIds.includes(q.id));
            const pool = notMastered.length > 0 ? notMastered : all;
            fisherYatesShuffle(pool);
            qs = pool.slice(0, Math.min(count, pool.length));

          } else if (examType === 'mock_exam') {
            const mockId = state?.mockExamId || examId || '';
            const mockFetchLim = Math.min(Math.max((count || 100) * 4, 100), 1000);
            const constraints = [where('active', '==', true), limit(mockFetchLim)];
            if (mockId) constraints.unshift(where('mockExamId', '==', mockId));
            const snap = await getDocs(query(collection(db, 'questions'), ...constraints));
            const allMock      = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const masteredIds  = (mockId && profile?.mockMastered?.[mockId]) || [];
            const notMastered  = allMock.filter(q => !masteredIds.includes(q.id));
            qs = notMastered.length > 0 ? notMastered : allMock;
            qs.sort(() => Math.random() - 0.5);

          } else {
            const bc = [where('active', '==', true), limit(fetchLim)];
            if (examType === 'topic_drill' && topic)          bc.unshift(where('topic',    '==', topic));
            else if (examType === 'daily_practice' && category) bc.unshift(where('category', '==', category));
            const snap = await getDocs(query(collection(db, 'questions'), ...bc));
            const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const bucketKey   = examType === 'daily_practice' ? sanitizeKey(category) : sanitizeKey(topic);
            const masteredIds = examType === 'daily_practice'
              ? (profile?.categoryMastered?.[bucketKey] || [])
              : (profile?.topicMastered?.[bucketKey] || []);
            const notMastered = all.filter(q => !masteredIds.includes(q.id));
            const pool = notMastered.length > 0 ? notMastered : all;
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
        <Confetti active={showConfetti} />
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {!reviewMode && (() => {
            // ── Celebration score card ───────────────────────────────────────
            const celebEmoji   = scorePct >= 70 ? '🎉' : scorePct >= 50 ? '👍' : '💪';
            const celebMsg     = scorePct >= 70
              ? "Outstanding! You're NMCN Ready 🎓"
              : scorePct >= 50
              ? "Good effort! Keep drilling your weak areas."
              : "Keep pushing — every nurse started here!";
            const celebSubMsg  = scorePct >= 70
              ? "You scored above the NMCN pass mark. Excellent preparation!"
              : scorePct >= 50
              ? "You're passing but there's room to improve. Review your wrong answers below."
              : "Don't give up. Consistent practice is the key to success.";
            const ringCirc     = 2 * Math.PI * 28;
            return (
              <div style={{ background: 'var(--bg-card)', border: `2px solid ${scoreColor}40`, borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes ringFill { from { stroke-dashoffset: ${ringCirc}; } }
                  @keyframes scorePop { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
                  @keyframes celFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
                `}</style>
                {/* Glow bg */}
                <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${scoreColor}15 0%, transparent 70%)`, pointerEvents: 'none' }} />
                {/* Exam type label */}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: F, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {poolMode ? examType === 'daily_practice' ? '⚡ Daily Practice' : examType === 'course_drill' ? `📖 Course Drill — ${courseLabel || course}` : examType === 'mock_exam' ? `🏥 Hospital Final Exam — ${examName}` : `🎯 Topic Drill — ${topic}` : examName}
                </div>
                {/* Animated score ring */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, animation: 'scorePop 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
                  <svg width={110} height={110} viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r="28" fill="none" stroke="var(--border)" strokeWidth="7" />
                    <circle cx="36" cy="36" r="28" fill="none" stroke={scoreColor} strokeWidth="7"
                      strokeDasharray={ringCirc}
                      strokeDashoffset={ringCirc - (scorePct / 100) * ringCirc}
                      strokeLinecap="round" transform="rotate(-90 36 36)"
                      style={{ animation: `ringFill 1.4s cubic-bezier(.4,0,.2,1) forwards`, transition: 'stroke-dashoffset 1.4s' }}
                    />
                    <text x="36" y="38" textAnchor="middle" fill={scoreColor} fontSize="13" fontWeight="900" fontFamily="Arial Black, Arial">{scorePct}%</text>
                  </svg>
                </div>
                {/* Celebration message */}
                <div style={{ fontSize: 30, marginBottom: 6, animation: 'celFadeUp 0.5s 0.6s both' }}>{celebEmoji}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: scoreColor, fontFamily: H, marginBottom: 4, animation: 'celFadeUp 0.5s 0.7s both' }}>{celebMsg}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, marginBottom: 20, lineHeight: 1.6, animation: 'celFadeUp 0.5s 0.8s both' }}>{celebSubMsg}</div>
                {/* Stats row */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', animation: 'celFadeUp 0.5s 0.9s both' }}>
                  {[{ label: 'Correct', value: score, color: '#16A34A' }, { label: 'Wrong', value: questions.length - score, color: '#EF4444' }, { label: 'Unanswered', value: unanswered, color: 'var(--text-muted)' }].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: 10, padding: '10px 18px' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

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

          {/* ── Share Result Row (only after a real exam, not reviewMode) ── */}
          {!reviewMode && (() => {
            const examLabel = poolMode
              ? examType === 'daily_practice' ? 'Daily Practice'
              : examType === 'course_drill'   ? (courseLabel || course || 'Course Drill')
              : examType === 'mock_exam'      ? (examName || 'Hospital Final Exam')
              : (topic || 'Topic Drill')
              : (examName || 'Exam');
            const shareText = `🎓 I just scored ${scorePct}% in ${examLabel} on NurseAcademy CBT!
${scorePct >= 70 ? "✅ NMCN Pass mark cleared!" : scorePct >= 50 ? "📚 Practicing hard for NMCN!" : "💪 Every attempt makes me stronger!"}

Practice free: https://nurses-nmcn-cbt.vercel.app`;
            const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
            const handleCopy = () => {
              navigator.clipboard?.writeText(shareText).then(() => {
                const btn = document.getElementById('nmcn-copy-btn');
                if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy Text'; }, 2000); }
              });
            };
            return (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F, flex: '1 1 120px' }}>📤 Share your result:</span>
                <a href={waUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 13, textDecoration: 'none', fontFamily: H }}>
                  <span style={{ fontSize: 16 }}>📱</span> WhatsApp
                </a>
                <button id="nmcn-copy-btn" onClick={handleCopy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: F }}>
                  📋 Copy Text
                </button>
                <ShareResultCard
                  scorePct={scorePct}
                  examLabel={examLabel}
                  correct={score}
                  total={questions.length}
                />
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
                  <div style={{ marginBottom: 14 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B', color: '#fff', fontWeight: 800, fontSize: 12, marginBottom: 10 }}>{i + 1}</span>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6, textAlign: 'justify', width: '100%', fontFamily: F }}>{q.question}</p>
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

                  {/* ── Explanation — upgraded panel ── */}
                  {q.explanation && (
                    <div style={{ marginBottom: 8, borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(13,148,136,0.35)', boxShadow: '0 2px 12px rgba(13,148,136,0.1)', width: '100%' }}>
                      <div style={{ background: 'var(--teal)', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>💡</span>
                        <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>Explanation</span>
                      </div>
                      <div style={{ padding: '14px 16px', background: 'rgba(13,148,136,0.06)' }}>
                        <ExplanationText text={q.explanation} />
                        {q.explanationImageUrl && (
                          <div style={{ marginTop: 10, textAlign: 'center' }}>
                            <img src={q.explanationImageUrl} alt="Explanation" style={{ maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => getAiExplain(q)} disabled={aiLoading && !aiExplain[q.id]} style={{ fontSize: 12 }}>{aiExplain[q.id] ? '🤖 AI Explained' : aiLoading ? '⏳ Loading…' : '🤖 Ask AI to Explain'}</button>
                    <button onClick={() => toggleBookmark(q)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${bookmarked.has(q.id) ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`, background: bookmarked.has(q.id) ? 'rgba(245,158,11,0.12)' : 'transparent', color: bookmarked.has(q.id) ? '#F59E0B' : 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>🔖 {bookmarked.has(q.id) ? 'Bookmarked ✓' : 'Bookmark this Question'}</button>
                    <QuestionNoteButton uid={currentUser?.uid} question={q} initialText={notes.get(q.id)?.text || ''} onSaved={handleNoteSaved} />
                    {!reportedQs.has(q.id) && <button onClick={() => setShowReport(showReport === q.id ? null : q.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '5px 8px' }}>🚩 Report</button>}
                    {reportedQs.has(q.id)  && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>✓ Reported</span>}
                  </div>

                  {/* ── AI explanation — also multi-line aware ───────────── */}
                  {aiExplain[q.id] && (
                    <div style={{ marginTop: 8, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      🤖 <ExplanationText text={aiExplain[q.id]} />
                    </div>
                  )}

                  {showReport === q.id && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <input value={reportText} onChange={e => setReportText(e.target.value)} placeholder="Describe the issue (wrong answer, typo, etc.)" style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }} />
                      <button className="btn btn-sm" onClick={() => submitReport(q)} style={{ background: '#EF4444', color: 'var(--text-primary)', border: 'none', borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Submit</button>
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

  const watermarkText = profile?.name ? profile.name.toUpperCase() : '';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', position: 'relative' }}>
      {/* Watermark overlay — deters screenshots */}
      {watermarkText && (
        <div aria-hidden="true" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: 'none', zIndex: 9998, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 'clamp(16px,3.5vw,26px)', fontWeight: 900, letterSpacing: 3,
            color: 'rgba(13,148,136,0.07)', transform: 'rotate(-30deg)',
            whiteSpace: 'nowrap', userSelect: 'none',
            textShadow: 'none', fontFamily: "'Arial Black', Arial, sans-serif",
          }}>
            {watermarkText} &nbsp;&nbsp; NMCN CBT &nbsp;&nbsp; {watermarkText}
          </span>
        </div>
      )}
      {showExitModal && <ExitModal onSaveExit={handleSaveExit} onAbandon={handleAbandonExit} onCancel={() => setShowExitModal(false)} saving={exitSaving} />}
      {showUpgradeModal && (
        <UpgradeModal
          onUpgrade={() => { setShowUpgradeModal(false); navigate('/subscription'); }}
          onContinue={() => setShowUpgradeModal(false)}
        />
      )}

      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '10px 16px' }}>
        {/* ── Free trial ribbon — only for unpaid users ── */}
        {!isSub && phase === 'exam' && (
          <div style={{ background: 'linear-gradient(90deg, rgba(13,148,136,0.15), rgba(245,158,11,0.1))', borderBottom: '1px solid rgba(13,148,136,0.25)', margin: '-10px -16px 10px', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>
              🎯 Free Trial — {current + 1}/{questions.length} questions used
            </span>
            <button
              onClick={() => navigate('/subscription')}
              style={{ padding: '3px 12px', borderRadius: 20, border: '1.5px solid var(--teal)', background: 'transparent', color: 'var(--teal)', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Upgrade for unlimited →
            </button>
          </div>
        )}
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.2 }}>{poolMode ? examType === 'daily_practice' ? '⚡ Daily Practice' : examType === 'course_drill' ? `📖 ${courseLabel || 'Course Drill'}` : examType === 'mock_exam' ? `🏥 ${examName}` : `🎯 ${topic || 'Topic Drill'}` : examName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Q{current + 1} of {questions.length} · {answered} answered</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {timeLimit > 0 && <div style={{ fontWeight: 800, fontSize: 22, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>⏱ {mins}:{secs}</div>}
              <button onClick={() => setShowExitModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, cursor: 'pointer', background: 'rgba(245,158,11,0.12)', border: '1.5px solid rgba(245,158,11,0.4)', color: '#F59E0B', fontWeight: 700, fontSize: 12, fontFamily: F }} title="Save your progress and exit">🚪 Exit</button>
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
                return <button key={q.id} onClick={() => setCurrent(i)} style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: F, borderColor: isCurrent ? 'var(--teal)' : isFlagged ? '#F59E0B' : isAnswered ? '#16A34A' : 'var(--border)', background: isCurrent ? 'var(--teal)' : isFlagged ? '#F59E0B18' : isAnswered ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)', color: isCurrent ? '#fff' : isFlagged ? '#F59E0B' : isAnswered ? '#16A34A' : 'var(--text-muted)' }}>{i + 1}</button>;
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
                <QuestionNoteButton uid={currentUser?.uid} question={q} initialText={notes.get(q.id)?.text || ''} onSaved={handleNoteSaved} />
              </div>
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.65, color: 'var(--text-primary)', margin: '0 0 12px' }}>{q.question}</p>
            <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {/* ── Voice Mode first-time discovery nudge ── */}
              {showVoiceNudge && (
                <div style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(37,99,235,0.1))',
                  border: '1.5px solid rgba(124,58,237,0.3)',
                  borderRadius: 12, padding: '10px 14px',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>🎙️</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#A78BFA', fontFamily: "'Arial Black',Arial,sans-serif" }}>
                      Try Voice Mode!
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>
                      Tap the 🎙️ button below to answer questions hands-free — perfect for studying on the go.
                      Just say "A", "B", "C", or "D" and the exam moves to the next question automatically.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      try { localStorage.setItem(VOICE_NUDGE_KEY, '1'); } catch {}
                      setShowVoiceNudge(false);
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 18, padding: '0 2px',
                      lineHeight: 1, flexShrink: 0,
                    }}
                    title="Dismiss"
                  >✕</button>
                </div>
              )}
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
                  <button key={i} id={`vem-opt-${i}`} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: i }))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: F, fontSize: 15, textAlign: 'left', border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`, background: selected ? 'rgba(13,148,136,0.1)' : 'var(--bg-tertiary)', color: selected ? 'var(--teal)' : 'var(--text-primary)', fontWeight: selected ? 700 : 400, transition: 'all 0.15s' }}>
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

        {/* ── Upgrade nudge banner — visible on the last free question ── */}
        {!isSub && current === questions.length - 1 && (
          <div style={{ marginTop: 20, borderRadius: 14, background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(15,118,110,0.08))', border: '1.5px solid rgba(13,148,136,0.35)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 28 }}>🔒</span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>This is your last free question</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Upgrade to unlock unlimited questions, mock exams &amp; more.</div>
            </div>
            <button
              onClick={() => navigate('/subscription')}
              style={{ padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 13, border: 'none', background: 'var(--teal)', color: '#fff', whiteSpace: 'nowrap', fontFamily: "'Arial Black', Arial, sans-serif" }}
            >
              Upgrade Now 🚀
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const S = { center: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-primary)' } };
