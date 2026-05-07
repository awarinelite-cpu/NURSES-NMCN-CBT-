// src/components/entrance/EntranceExamDailyMockHub.jsx
// Route: /entrance-exam/daily-mock
//
// FLOW:
//   Phase 1 — Intro screen (exam info, rules, countdown, past attempts)
//   Phase 2 — Hub: Take New Exam (question count selector) + Previous Exams list

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const QUESTION_PRESETS = [10, 20, 30, 50];
const PASS_MARK        = 50; // percent

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EntranceExamDailyMockHub() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const { user }    = useAuth();
  const currentUser = user;

  // Subject from route state or default
  const subject = location.state?.subject ?? {
    id:         'entrance_general',
    label:      'Entrance Exam',
    shortLabel: 'Entrance Exam',
    icon:       '🎓',
    color:      '#0D9488',
  };

  // Phase: 'intro' | 'hub'
  const [phase,       setPhase]       = useState('intro');
  const [countdown,   setCountdown]   = useState(msToNextMidnight());
  const [sessions,    setSessions]    = useState([]);
  const [sessLoading, setSessLoading] = useState(false);
  const [qCount,      setQCount]      = useState(20);
  const [customCount, setCustomCount] = useState('');
  const [useCustom,   setUseCustom]   = useState(false);

  const countdownRef = useRef(null);

  // ── Countdown ticker ──────────────────────────────────────────────────────
  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(msToNextMidnight()), 1000);
    return () => clearInterval(countdownRef.current);
  }, []);

  // ── Load saved sessions ───────────────────────────────────────────────────
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

  // ── Handlers ──────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1 — INTRO SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div style={{ padding: '24px', maxWidth: 700 }}>

        {/* Back button */}
        <button
          onClick={() => navigate('/entrance-exam')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--teal)', fontWeight: 700, fontSize: 13,
            padding: 0, marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Back to Entrance Exam
        </button>

        {/* Intro card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1.5px solid var(--border)',
          borderRadius: 20, padding: '32px 28px',
          textAlign: 'center', marginBottom: 24,
        }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>📅</div>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 26, fontWeight: 700,
            color: 'var(--text-primary)', margin: '0 0 8px',
          }}>
            Daily Mock Exam
          </h2>
          <p style={{
            color: 'var(--text-muted)', fontSize: 14,
            marginBottom: 28, lineHeight: 1.6,
          }}>
            Practice with fresh questions every day. Track your progress and build exam confidence.
          </p>

          {/* Info tiles */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12, marginBottom: 24,
          }}>
            {[
              { icon: '❓', label: 'Questions',  value: 'Up to 250' },
              { icon: '⏱',  label: 'Time Limit', value: 'Untimed' },
              { icon: '📆', label: 'Date',        value: getTodayKey() },
              { icon: '🔄', label: 'Resets In',   value: formatCountdown(countdown), mono: true },
            ].map(({ icon, label, value, mono }) => (
              <div key={label} style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 12, padding: '14px 12px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 22 }}>{icon}</span>
                <span style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {label}
                </span>
                <span style={{
                  fontSize: 16, fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: mono ? 'monospace' : 'inherit',
                }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Rules */}
          <div style={{
            textAlign: 'left',
            background: 'rgba(13,148,136,0.06)',
            border: '1px solid rgba(13,148,136,0.15)',
            borderRadius: 12, padding: '16px 18px',
            marginBottom: 24,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {[
              '📌 Questions are randomly selected from the question bank',
              '🔢 Choose how many questions you want to attempt',
              '📊 Results are saved to your profile automatically',
              '🔍 Review your answers after each exam',
              '🔄 Fresh set of questions available every day',
              '⚡ No time limit — attempt at your own pace',
            ].map(rule => (
              <div key={rule} style={{
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4,
              }}>
                {rule}
              </div>
            ))}
          </div>

          <button
            onClick={() => setPhase('hub')}
            style={{
              width: '100%', padding: '14px',
              background: 'var(--teal)', border: 'none',
              borderRadius: 12, color: '#fff',
              fontFamily: 'inherit', fontWeight: 800,
              fontSize: 16, cursor: 'pointer',
              letterSpacing: 0.3,
            }}
          >
            🚀 Proceed to Exam
          </button>
        </div>

        {/* Past attempts preview */}
        {sessions.length > 0 && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border)',
            borderRadius: 16, padding: '20px 24px',
          }}>
            <div style={{
              fontWeight: 700, fontSize: 14,
              color: 'var(--text-primary)', marginBottom: 14,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              📋 Your Recent Attempts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.slice(0, 5).map(session => {
                const pct    = session.scorePercent
                  ?? Math.round(((session.correct || 0) / (session.totalQuestions || 1)) * 100);
                const passed = pct >= PASS_MARK;
                const date   = session.completedAt?.toDate
                  ? session.completedAt.toDate()
                  : session.completedAt ? new Date(session.completedAt) : null;
                const dateStr = date
                  ? date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—';

                return (
                  <div key={session.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <span style={{ width: 100, fontSize: 12, color: 'var(--text-muted)' }}>
                      {dateStr}
                    </span>
                    <div style={{
                      flex: 1, height: 8,
                      background: 'var(--bg-tertiary)',
                      borderRadius: 4, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: passed ? '#16A34A' : '#EF4444',
                        borderRadius: 4,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <span style={{
                      width: 40, fontSize: 13, fontWeight: 700,
                      textAlign: 'right',
                      color: passed ? '#16A34A' : '#EF4444',
                    }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2 — HUB (question selector + previous exams)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 860 }}>

      {/* Back to intro */}
      <button
        onClick={() => setPhase('intro')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--teal)', fontWeight: 700, fontSize: 13,
          padding: 0, marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ← Back
      </button>

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

      {/* Take New Exam card */}
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
            fontSize: 13, fontWeight: 700,
            color: 'var(--text-secondary)', marginBottom: 10,
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

      {/* Previous Exams */}
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
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
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
