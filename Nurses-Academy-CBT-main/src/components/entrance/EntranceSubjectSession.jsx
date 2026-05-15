// src/components/entrance/EntranceSubjectSession.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, query, where, addDoc,
  serverTimestamp, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

const OPT_KEYS = ['A', 'B', 'C', 'D'];

function ExitModal({ onSaveExit, onAbandon, onCancel, saving, saveError, subject, answered, total, current, timeLeft }) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🚪</div>
        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 900 }}>Exit Drill?</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>Your progress will be saved. You can resume later.</p>

        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span>{subject?.name || 'Subject Drill'}</span>
            <span>{answered}/{total}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', borderRadius: 3 }} />
          </div>
        </div>

        {saveError && <div style={{ color: '#EF4444', marginBottom: 12 }}>{saveError}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onSaveExit} disabled={saving} style={{ padding: '13px', borderRadius: 12, background: 'var(--teal)', color: '#fff', fontWeight: 800 }}>
            {saving ? 'Saving…' : '💾 Save & Exit'}
          </button>
          <button onClick={onAbandon} disabled={saving} style={{ padding: '11px', borderRadius: 12, border: '1.5px solid #EF4444', color: '#EF4444', background: 'transparent' }}>
            🗑 Exit Without Saving
          </button>
          <button onClick={onCancel} disabled={saving} style={{ padding: '10px', borderRadius: 12, border: '1px solid var(--border)' }}>
            ← Keep Drilling
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EntranceSubjectSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  const { subject, year, count = 20, timeLimitMin = 20, resumeMode = false, pausedExamId = null, resumeData = null } = location.state || {};

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeLimitMin * 60);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitSaving, setExitSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const questionsRef = useRef([]);
  const answersRef = useRef({});
  const currentRef = useRef(0);
  const flaggedRef = useRef({});
  const timerRef = useRef(null);

  // Sync refs
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { flaggedRef.current = flagged; }, [flagged]);

  // Load Questions
  useEffect(() => {
    const loadQuestions = async () => {
      setLoading(true);
      try {
        if (resumeMode && resumeData?.questionIds) {
          // Resume logic (same as before)
          // ... (keep your existing resume chunk loading)
          if (pausedExamId) deleteDoc(doc(db, 'entrancePausedExams', pausedExamId));
          return;
        }

        // Normal load logic...
        const q = query(collection(db, 'entranceExamQuestions'), where('subject', '==', subject?.name));
        const snap = await getDocs(q);
        let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list = list.sort(() => Math.random() - 0.5).slice(0, count);
        setQuestions(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadQuestions();
  }, [resumeMode, resumeData, subject, count, pausedExamId]);

  // Timer
  useEffect(() => {
    if (loading || timeLimitMin === 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // Auto submit
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [loading, timeLimitMin]);

  // Save & Exit
  const handleSaveExit = useCallback(async () => {
    setShowExitModal(false);
    if (!user?.uid || questionsRef.current.length === 0) {
      navigate(-1);
      return;
    }

    setExitSaving(true);
    try {
      await addDoc(collection(db, 'entrancePausedExams'), {
        userId: user.uid,
        examType: 'entrance_subject_drill',
        examName: `${subject?.name} Drill`,
        subject: subject?.name,
        questionIds: questionsRef.current.map(q => q.id),
        answers: { ...answersRef.current },
        flagged: { ...flaggedRef.current },
        currentIndex: currentRef.current,
        timeLeft: timeLeft,
        totalQuestions: questionsRef.current.length,
        savedAt: serverTimestamp(),
      });
      navigate(-1);
    } catch (err) {
      console.error(err);
      setSaveError('Failed to save. Try again.');
    } finally {
      setExitSaving(false);
    }
  }, [user, subject, timeLeft, navigate]);

  const handleExitClick = () => setShowExitModal(true);

  // ... rest of your UI (question display, options, navigation, etc.)

  return (
    <>
      {/* Your main exam UI here */}

      {/* Exit Button */}
      <button onClick={handleExitClick} style={{ position: 'fixed', top: 20, right: 20, padding: '8px 16px', zIndex: 100 }}>
        Exit
      </button>

      {showExitModal && (
        <ExitModal
          onSaveExit={handleSaveExit}
          onAbandon={() => navigate(-1)}
          onCancel={() => setShowExitModal(false)}
          saving={exitSaving}
          saveError={saveError}
          subject={subject}
          answered={Object.keys(answers).length}
          total={questions.length}
          current={current}
          timeLeft={timeLeft}
        />
      )}
    </>
  );
}
