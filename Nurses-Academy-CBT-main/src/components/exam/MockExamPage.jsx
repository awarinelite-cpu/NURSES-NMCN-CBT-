// src/components/exam/MockExamPage.jsx
// Route: /mock-exams
//
// SIMPLE FLOW:
//   - Shows "Hospital Final Mock Exam" card
//   - Start button launches ExamSession
//   - Previous attempts listed below the Start button (review-only)
//
// FIRESTORE:
//   mockExams collection — one doc with id = 'hospital_final_mock_exam'
//   examSessions — saved after each attempt with examType = 'mock_exam'
//                  and mockExamId = 'hospital_final_mock_exam'

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import {
  collection, query, where, getDocs, orderBy,
  doc, getDoc,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const EXAM_ID   = 'hospital_final_mock_exam';
const PASS_MARK = 50;

export default function MockExamPage() {
  const navigate    = useNavigate();
  const { user }    = useAuth();

  const [exam,        setExam]        = useState(null);
  const [examLoading, setExamLoading] = useState(true);
  const [qCount,      setQCount]      = useState(0);   // actual question count in Firestore
  const [sessions,    setSessions]    = useState([]);
  const [sessLoading, setSessLoading] = useState(true);

  // ── Load the exam doc + question count ─────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setExamLoading(true);
      try {
        const examSnap = await getDoc(doc(db, 'mockExams', EXAM_ID));
        if (examSnap.exists()) {
          setExam({ id: examSnap.id, ...examSnap.data() });
        } else {
          // Fallback: exam doc not created yet, still show the page
          setExam({
            id:          EXAM_ID,
            title:       'Hospital Final Mock Exam',
            description: 'Comprehensive mock exam covering all nursing specialties.',
            timeLimit:   0,
            active:      true,
          });
        }

        // Count active questions linked to this exam
        const qSnap = await getDocs(query(
          collection(db, 'questions'),
          where('mockExamId', '==', EXAM_ID),
          where('active',     '==', true),
        ));
        setQCount(qSnap.size);
      } catch (e) {
        console.error('MockExamPage load error:', e);
      } finally {
        setExamLoading(false);
      }
    };
    load();
  }, []);

  // ── Load this student's past attempts ──────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    setSessLoading(true);
    getDocs(query(
      collection(db, 'examSessions'),
      where('userId',     '==', user.uid),
      where('mockExamId', '==', EXAM_ID),
    ))
      .then(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const ta = a.completedAt?.toDate?.()?.getTime?.() ?? 0;
          const tb = b.completedAt?.toDate?.()?.getTime?.() ?? 0;
          return tb - ta;
        });
        setSessions(list);
      })
      .catch(() => setSessions([]))
      .finally(() => setSessLoading(false));
  }, [user]);

  // ── Start exam ──────────────────────────────────────────────────────────────
  const handleStart = () => {
    navigate('/exam/session', {
      state: {
        poolMode:   false,
        examType:   'mock_exam',
        mockExamId: EXAM_ID,
        examId:     EXAM_ID,
        examName:   exam?.title || 'Hospital Final Mock Exam',
        category:   'general_nursing',
        count:      qCount || 100,
        doShuffle:  true,
        timeLimit:  exam?.timeLimit || 0,
      },
    });
  };

  // ── Review past attempt ─────────────────────────────────────────────────────
  const handleReview = (session) => {
    navigate('/exam/session', {
      state: {
        reviewMode:   true,
        poolMode:     false,
        examType:     'mock_exam',
        examName:     session.examName || 'Hospital Final Mock Exam',
        category:     session.category || 'general_nursing',
        mockExamId:   EXAM_ID,
        savedSession: {
          questionIds:    session.questionIds,
          answers:        session.answers,
          correct:        session.correct,
          totalQuestions: session.totalQuestions,
        },
      },
    });
  };

  if (examLoading) {
    return (
      <div style={S.center}>
        <div className="spinner" style={{ width: 36, height: 36 }} />
        <p style={{ color: 'var(--text-muted)', marginTop: 14, fontSize: 14 }}>Loading exam…</p>
      </div>
    );
  }

  const bestScore = sessions.length
    ? Math.max(...sessions.map(s => s.scorePercent ?? 0))
    : null;

  return (
    <div style={{ padding: '28px 24px', maxWidth: 720, margin: '0 auto' }}>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 34 }}>🏥</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)', fontSize: 24 }}>
            Mock Exam
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Simulate a full hospital final exam. Complete it, then review every question below.
        </p>
      </div>

      {/* ── Exam Card ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '2px solid rgba(13,148,136,0.35)',
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 32,
        boxShadow: '0 4px 32px rgba(13,148,136,0.08)',
      }}>
        {/* Top accent bar */}
        <div style={{
          height: 5,
          background: 'linear-gradient(90deg, #0D9488, #1E3A8A)',
        }} />

        <div style={{ padding: '28px 28px 24px' }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, flexShrink: 0,
              background: 'rgba(13,148,136,0.12)',
              border: '1.5px solid rgba(13,148,136,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
            }}>📋</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                {exam?.title || 'Hospital Final Mock Exam'}
              </h3>
              {exam?.description && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {exam.description}
                </p>
              )}
            </div>
          </div>

          {/* Meta pills */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
            <MetaPill icon="📝" text={qCount > 0 ? `${qCount} questions` : 'Questions loading…'} />
            <MetaPill icon="⏱"  text={exam?.timeLimit > 0 ? `${exam.timeLimit} min limit` : 'No time limit'} />
            <MetaPill icon="📊" text={`Pass mark: ${PASS_MARK}%`} />
            {bestScore !== null && (
              <MetaPill
                icon="🏆"
                text={`Best score: ${bestScore}%`}
                color={bestScore >= PASS_MARK ? '#16A34A' : '#EF4444'}
              />
            )}
          </div>

          {/* Start button */}
          {qCount === 0 ? (
            <div style={{
              padding: '14px 20px', borderRadius: 12, textAlign: 'center',
              background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)',
              color: '#EF4444', fontSize: 14, fontWeight: 600,
            }}>
              ⚠️ No questions uploaded yet. Admin needs to add questions first.
            </div>
          ) : (
            <button
              onClick={handleStart}
              style={{
                width: '100%', padding: '15px 24px',
                background: 'linear-gradient(135deg, #0D9488, #0f7a70)',
                border: 'none', borderRadius: 14, cursor: 'pointer',
                color: '#fff', fontSize: 16, fontWeight: 800,
                fontFamily: 'inherit', letterSpacing: 0.3,
                boxShadow: '0 4px 20px rgba(13,148,136,0.35)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              🚀 Start Exam — {qCount} Questions
            </button>
          )}
        </div>
      </div>

      {/* ── Previous Attempts ── */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 18,
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
            📋 Previous Attempts
          </h3>
          {sessions.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}>
              {sessions.length}
            </span>
          )}
        </div>

        {sessLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>Loading history…</div>
          </div>

        ) : sessions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '44px 24px',
            background: 'var(--bg-card)', borderRadius: 16,
            border: '1.5px dashed var(--border)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontSize: 15 }}>
              No attempts yet
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Complete the exam above — your result will appear here for review.
            </div>
          </div>

        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map((session, idx) => {
              const pct    = session.scorePercent ?? Math.round(((session.correct || 0) / (session.totalQuestions || 1)) * 100);
              const passed = pct >= PASS_MARK;
              const date   = session.completedAt?.toDate?.() ?? null;
              const dateStr = date
                ? date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              const timeStr = date
                ? date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div key={session.id} style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderLeft: `4px solid ${passed ? '#16A34A' : '#EF4444'}`,
                  borderRadius: 14,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                }}>
                  {/* Attempt number + score */}
                  <div style={{
                    width: 58, height: 58, borderRadius: 14, flexShrink: 0,
                    background: passed ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `2px solid ${passed ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 1,
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: passed ? '#16A34A' : '#EF4444', lineHeight: 1 }}>
                      {pct}%
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: passed ? '#16A34A' : '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {passed ? 'PASS' : 'FAIL'}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 5 }}>
                      Attempt #{sessions.length - idx}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        📅 {dateStr}{timeStr ? ` · ${timeStr}` : ''}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        ✅ {session.correct ?? '?'} / {session.totalQuestions ?? '?'} correct
                      </span>
                    </div>
                  </div>

                  {/* Review button */}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleReview(session)}
                    style={{ flexShrink: 0, fontWeight: 700 }}
                  >
                    🔍 Review
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaPill({ icon, text, color }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 20,
      background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
      fontSize: 12, fontWeight: 600,
      color: color || 'var(--text-secondary)',
    }}>
      <span>{icon}</span> {text}
    </div>
  );
}

const S = {
  center: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh',
  },
};
