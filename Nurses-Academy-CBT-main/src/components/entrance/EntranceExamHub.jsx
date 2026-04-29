// src/components/exam/EntranceExamHub.jsx
// Route: /entrance-exam/daily-mock
//
// Shows:
//   - Subject badge (passed via route state or props)
//   - Take New Exam card (question count selector + start button)
//   - Previous Exams list (with pass/fail badges + Review button)

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const QUESTION_PRESETS = [10, 20, 30, 50];
const PASS_MARK        = 50; // percent

export default function EntranceExamHub() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const { user }     = useAuth();
  const currentUser  = user;

  // Subject can come from route state or a default
  const subject = location.state?.subject ?? {
    id:         'entrance_general',
    label:      'Entrance Exam',
    shortLabel: 'Entrance Exam',
    icon:       '🎓',
    color:      '#0D9488',
  };

  // Hub state
  const [sessions,    setSessions]    = useState([]);
  const [sessLoading, setSessLoading] = useState(false);
  const [qCount,      setQCount]      = useState(20);
  const [customCount, setCustomCount] = useState('');
  const [useCustom,   setUseCustom]   = useState(false);

  // ── Load saved sessions ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid) return;
    setSessLoading(true);
    getDocs(
      query(
        collection(db, 'entranceExamSessions'),
        where('userId',   '==', currentUser.uid),
        where('examType', '==', 'entrance_daily_mock'),
        where('subject',  '==', subject.id),
      )
    )
      .then(snap => {
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        results.sort((a, b) => {
          const ta = a.completedAt?.toDate?.()?.getTime?.() || 0;
          const tb = b.completedAt?.toDate?.()?.getTime?.() || 0;
          return tb - ta;
        });
        setSessions(results);
      })
      .catch(() => setSessions([]))
      .finally(() => setSessLoading(false));
  }, [currentUser, subject.id]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const finalCount = useCustom
    ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 250)
    : qCount;

  const handleTakeNew = () => {
    navigate('/entrance-exam/session', {
      state: {
        poolMode:  true,
        examType:  'entrance_daily_mock',
        subject:   subject.id,
        examName:  `${subject.shortLabel} — Daily Mock`,
        count:     finalCount,
        doShuffle: true,
        timeLimit: 0,
      },
    });
  };

  const handleReview = (session) => {
    navigate('/entrance-exam/session', {
      state: {
        reviewMode:   true,
        poolMode:     false,
        examType:     'entrance_daily_mock',
        examName:     session.examName || 'Daily Mock',
        subject:      session.subject,
        savedSession: {
          questionIds:    session.questionIds,
          answers:        session.answers,
          correct:        session.correct,
          totalQuestions: session.totalQuestions,
        },
      },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 860 }}>

      {/* Subject badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `${subject.color}18`,
        border: `1.5px solid ${subject.color}40`,
        borderRadius: 40, padding: '8px 16px', marginBottom: 28,
      }}>
        <span style={{ fontSize: 20 }}>{subject.icon}</span>
        <div>
          <div style={{
            fontSize: 11, color: subject.color, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            DAILY MOCK
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {subject.label}
          </div>
        </div>
      </div>

      {/* ── Take New Exam card ────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card)', border: '2px solid var(--teal)',
        borderRadius: 18, padding: 24, marginBottom: 32,
        boxShadow: '0 0 0 4px rgba(13,148,136,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 24 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>
              Take New Exam
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Fresh questions, randomly selected
            </div>
          </div>
        </div>

        {/* Question count selector */}
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10,
          }}>
            📊 Number of Questions
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {QUESTION_PRESETS.map(n => (
              <button
                key={n}
                onClick={() => { setQCount(n); setUseCustom(false); }}
                style={{
                  padding: '8px 18px', borderRadius: 10, fontFamily: 'inherit',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
                  border: `2px solid ${!useCustom && qCount === n ? 'var(--teal)' : 'var(--border)'}`,
                  background: !useCustom && qCount === n ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                  color: !useCustom && qCount === n ? 'var(--teal)' : 'var(--text-secondary)',
                }}
              >
                {n}
              </button>
            ))}

            {/* Custom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setUseCustom(true)}
                style={{
                  padding: '8px 14px', borderRadius: 10, fontFamily: 'inherit',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
                  border: `2px solid ${useCustom ? 'var(--teal)' : 'var(--border)'}`,
                  background: useCustom ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                  color: useCustom ? 'var(--teal)' : 'var(--text-secondary)',
                }}
              >
                Custom
              </button>
              {useCustom && (
                <input
                  type="number" min={1} max={250}
                  value={customCount}
                  onChange={e => setCustomCount(e.target.value)}
                  placeholder="e.g. 75"
                  autoFocus
                  style={{
                    width: 80, padding: '8px 10px', borderRadius: 10,
                    border: '2px solid var(--teal)', background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)', fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 700, outline: 'none',
                  }}
                />
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            {useCustom
              ? customCount
                ? `Will attempt ${Math.min(Math.max(parseInt(customCount, 10) || 0, 1), 250)} questions`
                : 'Enter a number between 1 and 250'
              : `${qCount} questions selected`}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleTakeNew}
          disabled={useCustom && !customCount}
          style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 800, borderRadius: 12 }}
        >
          🚀 Start Exam — {finalCount} Questions
        </button>
      </div>

      {/* ── Previous Exams ────────────────────────────────────────────────── */}
      <div>
        <div style={{
          fontWeight: 800, fontSize: 15, color: 'var(--text-primary)',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          📋 Previous Exams
          {sessions.length > 0 && (
            <span style={{
              fontSize: 12, background: 'var(--bg-tertiary)',
              color: 'var(--text-muted)', padding: '2px 10px',
              borderRadius: 20, fontWeight: 700,
            }}>
              {sessions.length}
            </span>
          )}
        </div>

        {sessLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>
              Loading exam history…
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1.5px dashed var(--border)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              No exams taken yet
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Take your first mock above — it'll appear here when done.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map(session => {
              const pct    = session.scorePercent
                ?? Math.round(((session.correct || 0) / (session.totalQuestions || 1)) * 100);
              const passed = pct >= PASS_MARK;
              const date   = session.completedAt?.toDate
                ? session.completedAt.toDate()
                : session.completedAt ? new Date(session.completedAt) : null;
              const dateStr = date
                ? date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              const timeStr = date
                ? date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div key={session.id} style={{
                  background:   'var(--bg-card)',
                  border:       '1.5px solid var(--border)',
                  borderLeft:   `4px solid ${passed ? '#16A34A' : '#EF4444'}`,
                  borderRadius: 14, padding: '16px 18px',
                  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                }}>
                  {/* Score badge */}
                  <div style={{
                    width: 54, height: 54, borderRadius: 12, flexShrink: 0,
                    background: passed ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `2px solid ${passed ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      fontSize: 15, fontWeight: 900,
                      color: passed ? '#16A34A' : '#EF4444', lineHeight: 1,
                    }}>
                      {pct}%
                    </div>
                    <div style={{
                      fontSize: 9, fontWeight: 700,
                      color: passed ? '#16A34A' : '#EF4444',
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      {passed ? 'PASS' : 'FAIL'}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 14,
                      color: 'var(--text-primary)', marginBottom: 4,
                    }}>
                      {session.examName || 'Daily Mock'}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        📅 {dateStr}{timeStr ? ` · ${timeStr}` : ''}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        ✅ {session.correct ?? '?'} / {session.totalQuestions ?? '?'} correct
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        📝 {session.totalQuestions ?? '?'} questions
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
