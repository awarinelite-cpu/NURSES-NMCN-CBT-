// src/components/entrance/EntranceExamSession.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, query, where, addDoc,
  serverTimestamp, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

function ExitModal({ onSaveExit, onAbandon, onCancel, saving, saveError, examName, answered, total, currentIndex }) {
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
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🚪</div>
        <h3 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 18, fontWeight: 900 }}>Exit Exam?</h3>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Your progress has been saved.<br />Returning to Dashboard...
        </p>

        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span>{examName}</span>
            <span>{answered}/{total}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)' }} />
          </div>
        </div>

        {saveError && <div style={{ color: '#EF4444', marginBottom: 12 }}>{saveError}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button 
            onClick={onSaveExit} 
            disabled={saving} 
            style={{ padding: '13px', borderRadius: 12, background: 'var(--teal)', color: '#fff', fontWeight: 800 }}
          >
            {saving ? '💾 Saving & Returning...' : '💾 Save & Exit'}
          </button>
          <button 
            onClick={onAbandon} 
            disabled={saving} 
            style={{ padding: '11px', borderRadius: 12, border: '1.5px solid #EF4444', color: '#EF4444', background: 'transparent' }}
          >
            🗑 Exit Without Saving
          </button>
          <button 
            onClick={onCancel} 
            disabled={saving} 
            style={{ padding: '10px', borderRadius: 12, border: '1px solid var(--border)' }}
          >
            ← Keep Taking Exam
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EntranceExamSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  const state = location.state || {};
  const {
    examName = 'Entrance Exam',
    schoolMode = false,
    schoolId = null,
    schoolName = '',
    examYear = 'all',
    count = 20,
    resumeMode = false,
    pausedExamId = null,
    resumeData = null,
    // ... other props you use
  } = state;

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitSaving, setExitSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const questionsRef = useRef([]);
  const answersRef = useRef({});
  const currentIndexRef = useRef(0);
  const flaggedRef = useRef({});

  // Sync refs
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { flaggedRef.current = flagged; }, [flagged]);

  // Load questions logic (resume + normal) — keep your existing load code here...

  // Save & Exit → Go directly to Dashboard
  const handleSaveExit = useCallback(async () => {
    setShowExitModal(false);
    if (!user?.uid || questionsRef.current.length === 0) {
      navigate('/dashboard');
      return;
    }

    setExitSaving(true);
    try {
      await addDoc(collection(db, 'entrancePausedExams'), {
        userId: user.uid,
        examType: 'entrance_exam',
        examName,
        ...(schoolMode ? { schoolId, schoolName } : {}),
        questionIds: questionsRef.current.map(q => q.id),
        answers: { ...answersRef.current },
        flagged: { ...flaggedRef.current },
        currentIndex: currentIndexRef.current,
        totalQuestions: questionsRef.current.length,
        answeredCount: Object.keys(answersRef.current).length,
        savedAt: serverTimestamp(),
      });

      // ✅ Immediately navigate to Dashboard
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      setSaveError('Failed to save progress');
      setExitSaving(false);
    }
  }, [user, examName, schoolMode, schoolId, schoolName, navigate]);

  const handleExitClick = () => setShowExitModal(true);

  return (
    <>
      {/* Your full exam UI (questions, navigation, timer, etc.) */}

      {/* Exit Button */}
      <button 
        onClick={handleExitClick}
        style={{ position: 'fixed', top: 20, right: 20, zIndex: 100, padding: '8px 16px' }}
      >
        Exit
      </button>

      {showExitModal && (
        <ExitModal
          onSaveExit={handleSaveExit}
          onAbandon={() => navigate('/dashboard')}
          onCancel={() => setShowExitModal(false)}
          saving={exitSaving}
          saveError={saveError}
          examName={examName}
          answered={Object.keys(answers).length}
          total={questions.length}
          currentIndex={currentIndex}
        />
      )}
    </>
  );
}
