// src/components/entrance/EntranceSubjectSession.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, query, where, addDoc,
  serverTimestamp, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

function ExitModal({ onSaveExit, onAbandon, onCancel, saving, saveError, subject, answered, total, current, timeLeft }) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 20000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 20, padding: 28, maxWidth: 420, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
      }}>
        <div style={{ fontSize: 42, textAlign: 'center', marginBottom: 12 }}>🚪</div>
        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 20, fontWeight: 900 }}>
          Exit Subject Drill?
        </h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 20 }}>
          Your progress will be saved.<br />Returning to Dashboard...
        </p>

        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 700 }}>
            <span>{subject?.name || 'Subject Drill'}</span>
            <span>{answered}/{total}</span>
          </div>
          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', transition: 'width 0.3s' }} />
          </div>
        </div>

        {saveError && <div style={{ color: '#EF4444', marginBottom: 16, textAlign: 'center' }}>{saveError}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={onSaveExit}
            disabled={saving}
            style={{
              padding: '14px', borderRadius: 12, fontWeight: 800, fontSize: 16,
              background: 'var(--teal)', color: '#fff', border: 'none',
              opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? '💾 Saving & Returning...' : '💾 Save & Exit'}
          </button>

          <button
            onClick={onAbandon}
            disabled={saving}
            style={{
              padding: '12px', borderRadius: 12, fontWeight: 700,
              border: '1.5px solid #EF4444', color: '#EF4444', background: 'transparent'
            }}
          >
            🗑 Exit Without Saving
          </button>

          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '12px', borderRadius: 12, fontWeight: 700,
              border: '1px solid var(--border)', background: 'var(--bg-tertiary)'
            }}
          >
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
  const { user } = useAuth();

  const {
    subject = { name: 'Subject Drill' },
    year = 'All Years',
    count = 20,
    timeLimitMin = 20,
    resumeMode = false,
    pausedExamId = null,
    resumeData = null,
  } = location.state || {};

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeLimitMin * 60);
  const [loading, setLoading] = useState(true);
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
        if (resumeMode && resumeData?.questionIds?.length) {
          // Resume logic
          const ids = resumeData.questionIds;
          const chunks = [];
          for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
          
          const snaps = await Promise.all(chunks.map(ch => 
            getDocs(query(collection(db, 'entranceExamQuestions'), where('__name__', 'in', ch)))
          ));
          
          const byId = {};
          snaps.forEach(s => s.docs.forEach(d => byId[d.id] = { id: d.id, ...d.data() }));
          
          setQuestions(ids.map(id => byId[id]).filter(Boolean));
          if (resumeData.answers) setAnswers(resumeData.answers);
          if (resumeData.currentIndex != null) setCurrent(resumeData.currentIndex);
          if (resumeData.flagged) setFlagged(resumeData.flagged);
          if (resumeData.timeLeft != null) setTimeLeft(resumeData.timeLeft);

          if (pausedExamId) deleteDoc(doc(db, 'entrancePausedExams', pausedExamId));
          return;
        }

        // Normal load
        const q = query(collection(db, 'entranceExamQuestions'), where('subject', '==', subject.name));
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
    if (loading || timeLimitMin <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [loading, timeLimitMin]);

  // Save & Exit → Go to Dashboard
  const handleSaveExit = useCallback(async () => {
    setShowExitModal(false);
    const qs = questionsRef.current;
    const ans = answersRef.current;

    if (!user?.uid || qs.length === 0) {
      navigate('/dashboard', { replace: true });
      return;
    }

    setExitSaving(true);
    setSaveError('');

    try {
      await addDoc(collection(db, 'entrancePausedExams'), {
        userId: user.uid,
        examType: 'entrance_subject_drill',
        examName: `${subject.name} Drill`,
        subject: subject.name,
        year: year || 'All Years',
        timeLimitMin,
        questionIds: qs.map(q => q.id),
        answers: { ...ans },
        flagged: { ...flaggedRef.current },
        currentIndex: currentRef.current,
        timeLeft,
        totalQuestions: qs.length,
        answeredCount: Object.keys(ans).length,
        savedAt: serverTimestamp(),
      });

      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error(err);
      setSaveError('Failed to save progress. Please try again.');
      setExitSaving(false);
    }
  }, [user, subject, year, timeLimitMin, timeLeft, navigate]);

  const handleAbandon = () => {
    setShowExitModal(false);
    navigate('/dashboard', { replace: true });
  };

  // Main UI
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '20px', paddingTop: '80px' }}>
      {/* Your existing header, question display, options, navigation, timer display, etc. */}

      {/* Exit Button */}
      <button
        onClick={() => setShowExitModal(true)}
        style={{
          position: 'fixed', top: 20, right: 20, zIndex: 100,
          padding: '10px 18px', borderRadius: 12, background: '#EF4444',
          color: '#fff', border: 'none', fontWeight: 700
        }}
      >
        Exit
      </button>

      {showExitModal && (
        <ExitModal
          onSaveExit={handleSaveExit}
          onAbandon={handleAbandon}
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
    </div>
  );
}
