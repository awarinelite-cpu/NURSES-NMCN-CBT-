// src/components/exam/MockExamPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

// ─── Specialties ───────────────────────────────────────────────────────────────
// 'id' is written to questions as mockExamId in the admin bulk-upload panel.
// Icons, colours and labels match the screenshots exactly.
const SPECIALTIES = [
  { id: 'general_nursing',      label: 'General Nursing',       icon: '🏥',  color: '#0891B2', border: 'rgba(8,145,178,0.40)',   glow: 'rgba(8,145,178,0.12)'   },
  { id: 'midwifery',            label: 'Midwifery',             icon: '🤱',  color: '#DB2777', border: 'rgba(219,39,119,0.40)',  glow: 'rgba(219,39,119,0.12)'  },
  { id: 'public_health_nursing',label: 'Public Health Nursing', icon: '🌍',  color: '#059669', border: 'rgba(5,150,105,0.40)',   glow: 'rgba(5,150,105,0.12)'   },
  { id: 'orthopaedic',       label: 'Orthopaedic',        icon: '🦴',  color: '#D97706', border: 'rgba(217,119,6,0.40)',   glow: 'rgba(217,119,6,0.12)'   },
  { id: 'ophthalmic',        label: 'Ophthalmic',          icon: '👁️',  color: '#2563EB', border: 'rgba(37,99,235,0.40)',   glow: 'rgba(37,99,235,0.12)'   },
  { id: 'paediatric',        label: 'Paediatric',          icon: '👦',  color: '#D97706', border: 'rgba(217,119,6,0.40)',   glow: 'rgba(217,119,6,0.12)'   },
  { id: 'ane_nursing',       label: 'A&E Nursing',         icon: '🚨',  color: '#DC2626', border: 'rgba(220,38,38,0.40)',   glow: 'rgba(220,38,38,0.12)'   },
  { id: 'icu_critical_care', label: 'ICU/Critical Care',   icon: '💊',  color: '#7C3AED', border: 'rgba(124,58,237,0.40)', glow: 'rgba(124,58,237,0.12)'  },
  { id: 'anaesthetics',      label: 'Anaesthetics',        icon: '💉',  color: '#0E7490', border: 'rgba(14,116,144,0.40)',  glow: 'rgba(14,116,144,0.12)'  },
  { id: 'ent_nursing',       label: 'ENT Nursing',         icon: '💡',  color: '#D97706', border: 'rgba(217,119,6,0.40)',   glow: 'rgba(217,119,6,0.12)'   },
  { id: 'occupational_health',label:'Occupational Health', icon: '🏭',  color: '#059669', border: 'rgba(5,150,105,0.40)',   glow: 'rgba(5,150,105,0.12)'   },
  { id: 'burns_plastics',    label: 'Burns & Plastics',    icon: '🩹',  color: '#DB2777', border: 'rgba(219,39,119,0.40)',  glow: 'rgba(219,39,119,0.12)'  },
  { id: 'cardio_thoracic',   label: 'Cardio-thoracic',     icon: '❤️',  color: '#E11D48', border: 'rgba(225,29,72,0.40)',   glow: 'rgba(225,29,72,0.12)'   },
  { id: 'nephrology',        label: 'Nephrology',          icon: '🫘',  color: '#1D4ED8', border: 'rgba(29,78,216,0.40)',   glow: 'rgba(29,78,216,0.12)'   },
  { id: 'oncology',          label: 'Oncology',            icon: '🎗️',  color: '#7C3AED', border: 'rgba(124,58,237,0.40)', glow: 'rgba(124,58,237,0.12)'  },
  { id: 'community_nursing',     label: 'Community Nursing',     icon: '🏘️',  color: '#0D9488', border: 'rgba(13,148,136,0.40)',  glow: 'rgba(13,148,136,0.12)'  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function Chip({ children, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, fontWeight: 600,
      padding: '4px 11px', borderRadius: 20,
      background: color ? `${color}18` : 'var(--bg-tertiary)',
      border: `1px solid ${color ? `${color}44` : 'var(--border)'}`,
      color: color ?? 'var(--text-secondary)',
    }}>
      {children}
    </span>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function MockExamPage() {
  const navigate    = useNavigate();
  const auth        = useAuth();
  const currentUser = auth.currentUser || auth.user || null;

  const [view,            setView]            = useState('specialty');
  const [selected,        setSelected]        = useState(null);
  const [questionCount,   setQuestionCount]   = useState(null);
  const [loadingCount,    setLoadingCount]    = useState(false);
  const [attempts,        setAttempts]        = useState([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  // question counts for each specialty shown on the picker
  const [counts,          setCounts]          = useState({});

  // ── Load all specialty question counts on mount (for the picker badges) ─────
  useEffect(() => {
    const fetchCounts = async () => {
      const results = {};
      await Promise.all(
        SPECIALTIES.map(async sp => {
          try {
            const snap = await getDocs(query(
              collection(db, 'questions'),
              where('mockExamId', '==', sp.id),
              where('active',     '==', true),
            ));
            results[sp.id] = snap.size;
          } catch {
            results[sp.id] = 0;
          }
        })
      );
      setCounts(results);
    };
    fetchCounts();
  }, []);

  // ── Load question count + attempts when a specialty is selected ───────────
  useEffect(() => {
    if (!selected) return;

    setLoadingCount(true);
    getDocs(query(
      collection(db, 'questions'),
      where('mockExamId', '==', selected.id),
      where('active',     '==', true),
    ))
      .then(snap => setQuestionCount(snap.size))
      .catch(() => setQuestionCount(0))
      .finally(() => setLoadingCount(false));

    if (!currentUser?.uid) return;
    setLoadingAttempts(true);
    getDocs(query(
      collection(db, 'examSessions'),
      where('userId',     '==', currentUser.uid),
      where('examType',   '==', 'mock_exam'),
      where('mockExamId', '==', selected.id),
    ))
      .then(snap => {
        const results = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.completedAt?.toMillis?.() ?? 0;
            const tb = b.completedAt?.toMillis?.() ?? 0;
            return tb - ta; // newest first
          });
        setAttempts(results);
      })
      .catch(() => setAttempts([]))
      .finally(() => setLoadingAttempts(false));
  }, [selected]);

  const startExam = () => {
    navigate('/exam/session', {
      state: {
        examType:   'mock_exam',
        mockExamId: selected.id,
        examName:   selected.label,
        examId:     '',
        poolMode:   true,
        doShuffle:  true,
        count:      questionCount || 100,
        timeLimit:  0,
      },
    });
  };

  const reviewAttempt = (attempt) => {
    navigate('/exam/session', {
      state: {
        examType:     'mock_exam',
        examName:     selected.label,
        reviewMode:   true,
        savedSession: {
          questionIds:    attempt.questionIds || [],
          answers:        attempt.answers     || {},
          correct:        attempt.correct,
          totalQuestions: attempt.totalQuestions,
        },
      },
    });
  };

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: SPECIALTY PICKER  —  large horizontal cards like screenshot
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'specialty') {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 30 }}>🏫</span>
          <h2 style={{
            margin: 0,
            fontFamily: "'Playfair Display', serif",
            fontSize: 26, fontWeight: 800,
            color: 'var(--text-primary)',
          }}>
            Mock Exam
          </h2>
        </div>
        <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
          Select a nursing specialty to simulate a full hospital final exam.
        </p>

        {/* Specialty list — same large horizontal card style as the screenshot */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SPECIALTIES.map(sp => {
            const qCount = counts[sp.id];
            const hasQs  = qCount > 0;

            return (
              <button
                key={sp.id}
                onClick={() => {
                  setSelected(sp);
                  setQuestionCount(null);
                  setAttempts([]);
                  setView('exam');
                }}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          16,
                  background:   'var(--bg-card)',
                  border:       `1px solid ${sp.border}`,
                  borderRadius: 16,
                  padding:      '18px 20px',
                  textAlign:    'left',
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  width:        '100%',
                  position:     'relative',
                  overflow:     'hidden',
                  transition:   'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = sp.glow}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
              >
                {/* Left colour bar */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, bottom: 0, width: 4,
                  background: sp.color,
                  borderRadius: '16px 0 0 16px',
                }} />

                {/* Icon box */}
                <div style={{
                  width: 54, height: 54, borderRadius: 14, flexShrink: 0,
                  background: sp.glow,
                  border: `1px solid ${sp.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26,
                  marginLeft: 8,
                }}>
                  {sp.icon}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: 16,
                    color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>
                    {sp.label}
                  </div>
                  <div style={{
                    fontSize: 13,
                    color: hasQs ? sp.color : 'var(--text-muted)',
                    fontWeight: hasQs ? 600 : 400,
                  }}>
                    {qCount === undefined
                      ? 'Loading…'
                      : hasQs
                        ? `${qCount} question${qCount !== 1 ? 's' : ''} available`
                        : 'No questions yet'
                    }
                  </div>
                </div>

                {/* Arrow */}
                <div style={{
                  fontSize: 18, color: sp.color, opacity: 0.7, flexShrink: 0,
                }}>›</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: EXAM CARD + PREVIOUS ATTEMPTS
  // ════════════════════════════════════════════════════════════════════════════
  const sp           = selected;
  const noQuestions  = !loadingCount && questionCount === 0;
  const hasQuestions = !loadingCount && questionCount > 0;
  const best = attempts.length > 0
    ? Math.max(...attempts.map(a => a.scorePercent ?? 0))
    : null;

  return (
    <div style={{ padding: '24px 16px', maxWidth: 760, margin: '0 auto' }}>

      {/* Back */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => { setView('specialty'); setSelected(null); setAttempts([]); }}
        style={{ marginBottom: 20 }}
      >
        ← All Specialties
      </button>

      {/* Heading */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 28 }}>{sp.icon}</span>
        <h2 style={{
          margin: 0,
          fontFamily: "'Playfair Display', serif",
          fontSize: 22, fontWeight: 800,
          color: 'var(--text-primary)',
        }}>
          {sp.label}
        </h2>
      </div>
      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 14 }}>
        Simulate a full hospital final exam. Complete it, then review every question below.
      </p>

      {/* Exam card */}
      <div style={{
        background:   'var(--bg-card)',
        border:       `1px solid ${sp.border}`,
        borderRadius: 20,
        padding:      '22px 20px',
        marginBottom: 28,
        position:     'relative',
        overflow:     'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${sp.color}, transparent)`,
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0,
            background: sp.glow, border: `1px solid ${sp.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>
            📋
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', lineHeight: 1.25 }}>
              Hospital Final Mock Exam
            </div>
            <div style={{ fontSize: 12, color: sp.color, fontWeight: 600, marginTop: 2 }}>
              {sp.label}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Chip>
            📝 {loadingCount ? 'Loading…' : questionCount !== null ? `${questionCount} Questions` : '—'}
          </Chip>
          <Chip>⏱ No time limit</Chip>
          <Chip>📊 Pass mark: 50%</Chip>
          {best !== null && (
            <Chip color={best >= 70 ? '#16A34A' : best >= 50 ? '#D97706' : '#DC2626'}>
              🏆 Best: {best}%
            </Chip>
          )}
        </div>

        {noQuestions && (
          <div style={{
            background: 'rgba(220,38,38,0.10)',
            border: '1px solid rgba(220,38,38,0.30)',
            borderRadius: 10, padding: '12px 16px',
            color: '#F87171', fontSize: 13, fontWeight: 600,
            textAlign: 'center', marginBottom: 4,
          }}>
            ⚠️ No questions uploaded yet. Admin needs to add questions first.
          </div>
        )}

        {hasQuestions && (
          <button
            className="btn btn-primary"
            onClick={startExam}
            style={{
              background: sp.color, border: 'none',
              width: '100%', padding: '13px',
              fontSize: 15, fontWeight: 700, borderRadius: 12,
            }}
          >
            {attempts.length > 0 ? '🔄 Retake Exam' : '🚀 Start Exam'}
          </button>
        )}
      </div>

      {/* Previous Attempts */}
      <h3 style={{
        margin: '0 0 12px', fontSize: 16, fontWeight: 700,
        color: 'var(--text-primary)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        📋 Previous Attempts
        {attempts.length > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 700,
            padding: '2px 9px', borderRadius: 20,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}>
            {attempts.length}
          </span>
        )}
      </h3>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        {loadingAttempts && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 10px' }} />
            Loading attempts…
          </div>
        )}

        {!loadingAttempts && attempts.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📬</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              No attempts yet
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Complete the exam above — your result will appear here for review.
            </div>
          </div>
        )}

        {!loadingAttempts && attempts.map((attempt, idx) => {
          const pct      = attempt.scorePercent ?? 0;
          const scoreClr = pct >= 70 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
          const scoreBg  = pct >= 70 ? 'rgba(22,163,74,0.10)'  : pct >= 50 ? 'rgba(245,158,11,0.10)'  : 'rgba(220,38,38,0.10)';
          const scoreBdr = pct >= 70 ? 'rgba(22,163,74,0.30)'  : pct >= 50 ? 'rgba(245,158,11,0.30)'  : 'rgba(220,38,38,0.30)';

          return (
            <div key={attempt.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 18px',
              borderBottom: idx < attempts.length - 1 ? '1px solid var(--border)' : 'none',
              flexWrap: 'wrap',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                #{attempts.length - idx}
              </div>

              <div style={{
                width: 50, height: 50, borderRadius: 10, flexShrink: 0,
                background: scoreBg, border: `1.5px solid ${scoreBdr}`,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: scoreClr, lineHeight: 1 }}>{pct}%</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>score</div>
              </div>

              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {attempt.correct ?? '?'} / {attempt.totalQuestions ?? '?'} correct
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>📅 {fmtDate(attempt.completedAt)}</span>
                  <span>⏱ {fmtTime(attempt.timeTaken)}</span>
                </div>
              </div>

              <span style={{
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                padding: '4px 10px', borderRadius: 20,
                background: scoreBg, color: scoreClr,
                border: `1px solid ${scoreBdr}`,
              }}>
                {pct >= 70 ? '✅ Pass' : pct >= 50 ? '⚠️ Borderline' : '❌ Fail'}
              </span>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => reviewAttempt(attempt)}
                style={{ flexShrink: 0, fontSize: 12 }}
              >
                📖 Review
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
