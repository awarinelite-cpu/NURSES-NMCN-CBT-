// src/components/exam/DailyMockExamHub.jsx
// Route: /daily-mock-exam
//
// Daily Mock Exam: specialty-separated. Students first pick a nursing
// specialty, then see that specialty's fixed pool of up to 250 questions
// which rotates every 24 hours. Students choose how many of that specialty's
// pool they want to answer; the exam is timed at 1 minute per question. Any
// question with a pass rate of 49% or below keeps repeating in that
// specialty's daily pool (handled server-side by the rotateDailyMockExam
// Cloud Function) until enough students get it right to push it back to 50%+.
//
// Completed attempts are saved to "Exams Taken" below (scoped to the
// selected specialty), and can be retaken any time for a fresh score (a new
// random draw from the SAME day's specialty pool) or reviewed
// question-by-question.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { enablePushNotifications, pushSupported, pushPermission } from '../../utils/pushNotifications';
import { NURSING_CATEGORIES } from '../../data/categories';
import GroupSessionLobby from './GroupSessionLobby';

function shuffleIds(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PRESETS   = [25, 50, 100, 150, 250];
const PASS_MARK = 50;

function msToNextMidnight() {
  const now = new Date(), midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}
function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}
function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  if (!d) return '—';
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}
// Give every specialty a border/glow derived from its category colour so the
// picker cards read consistently with the rest of the app (e.g. MockExamPage).
function withTint(cat) {
  return {
    ...cat,
    border: `${cat.color}66`,
    glow:   `${cat.color}1F`,
  };
}
const SPECIALTIES = NURSING_CATEGORIES.map(withTint);

export default function DailyMockExamHub() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const currentUser = user;
  const isSub = profile?.subscribed || profile?.role === 'admin';

  const [view,         setView]        = useState('specialty'); // 'specialty' | 'exam' | 'group-lobby'
  const [selected,     setSelected]    = useState(null);         // chosen SPECIALTIES entry
  const [studyMode,    setStudyMode]   = useState('single');      // 'single' | 'group'

  const [poolCounts,   setPoolCounts]  = useState({});  // { [categoryId]: questionCount }
  const [pool,         setPool]        = useState(null);   // dailyMockExam/{category} doc
  const [poolLoading,  setPoolLoading] = useState(true);
  const [countdown,    setCountdown]   = useState(msToNextMidnight());
  const [qCount,       setQCount]      = useState(50);
  const [customCount,  setCustomCount] = useState('');
  const [useCustom,    setUseCustom]   = useState(false);
  const [attempts,     setAttempts]    = useState([]);
  const [loadingAtt,   setLoadingAtt]  = useState(false);
  const [pushState,    setPushState]   = useState(pushPermission()); // 'default'|'granted'|'denied'|'unsupported'
  const [pushBusy,     setPushBusy]    = useState(false);
  const countdownRef = useRef(null);

  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown(msToNextMidnight()), 1000);
    return () => clearInterval(countdownRef.current);
  }, []);

  // ── Load today's pool size for every specialty, for the picker badges ─────
  useEffect(() => {
    const fetchCounts = async () => {
      const results = {};
      await Promise.all(
        SPECIALTIES.map(async sp => {
          try {
            const snap = await getDoc(doc(db, 'dailyMockExam', sp.id));
            results[sp.id] = snap.exists() ? (snap.data()?.questionIds?.length || 0) : 0;
          } catch {
            results[sp.id] = 0;
          }
        })
      );
      setPoolCounts(results);
    };
    fetchCounts();
  }, []);

  // ── Load the selected specialty's pool + this student's attempts in it ───
  useEffect(() => {
    if (!selected) return;

    setPoolLoading(true);
    getDoc(doc(db, 'dailyMockExam', selected.id))
      .then(snap => setPool(snap.exists() ? snap.data() : null))
      .catch(() => setPool(null))
      .finally(() => setPoolLoading(false));

    if (!currentUser?.uid) return;
    setLoadingAtt(true);
    getDocs(query(
      collection(db, 'examSessions'),
      where('userId',   '==', currentUser.uid),
      where('examType', '==', 'daily_mock_exam'),
      where('category',  '==', selected.id),
    ))
      .then(snap => {
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.completedAt?.toMillis?.() ?? 0) - (a.completedAt?.toMillis?.() ?? 0));
        setAttempts(results);
      })
      .catch(() => setAttempts([]))
      .finally(() => setLoadingAtt(false));
  }, [selected, currentUser]);

  const totalAvailable = pool?.questionIds?.length || 0;
  const finalCount = useCustom
    ? Math.min(Math.max(parseInt(customCount, 10) || 1, 1), totalAvailable || 250)
    : Math.min(qCount, totalAvailable || qCount);

  const handleEnablePush = async () => {
    if (!currentUser?.uid) return;
    setPushBusy(true);
    const res = await enablePushNotifications(currentUser.uid);
    setPushState(res.ok ? 'granted' : (pushPermission() === 'denied' ? 'denied' : pushState));
    setPushBusy(false);
  };

  const pickSpecialty = (sp) => {
    setSelected(sp);
    setPool(null);
    setAttempts([]);
    setQCount(50);
    setUseCustom(false);
    setCustomCount('');
    setView('exam');
  };

  const backToSpecialties = () => {
    setView('specialty');
    setSelected(null);
    setPool(null);
    setAttempts([]);
  };

  const startExam = () => {
    if (studyMode === 'group') {
      // Question count is now chosen on the Group Study page's Start Exam
      // step, after the group is set up and the call is initiated — not
      // here.
      setView('group-lobby');
      return;
    }
    navigate('/exam/session', {
      state: {
        examType:  'daily_mock_exam',
        examName:  `Daily Mock Exam — ${selected.label}`,
        category:  selected.id,
        poolMode:  true,
        doShuffle: true,
        count:     finalCount,
        timeLimit: finalCount, // 1 minute per question
      },
    });
  };

  const reviewAttempt = (attempt) => {
    navigate('/exam/session', {
      state: {
        examType:   'daily_mock_exam',
        examName:   `Daily Mock Exam — ${selected.label}`,
        category:   selected.id,
        reviewMode: true,
        savedSession: {
          questionIds:    attempt.questionIds || [],
          answers:        attempt.answers     || {},
          correct:        attempt.correct,
          totalQuestions: attempt.totalQuestions,
        },
      },
    });
  };

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: SPECIALTY PICKER
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'specialty') {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 30 }}>🗓️</span>
          <h2 style={{ margin: 0, fontFamily: "'Arial Black', Arial, sans-serif", fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
            Daily Mock Exam
          </h2>
        </div>
        <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
          Pick your specialty first — each specialty has its own fresh pool of questions that rotates every 24 hours.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SPECIALTIES.map(sp => {
            const qCountAvail = poolCounts[sp.id];
            const hasQs = qCountAvail > 0;
            return (
              <button
                key={sp.id}
                onClick={() => pickSpecialty(sp)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: 'var(--bg-card)', border: `1px solid ${sp.border}`,
                  borderRadius: 16, padding: '18px 20px', textAlign: 'left',
                  cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                  position: 'relative', overflow: 'hidden', transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = sp.glow}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: sp.color, borderRadius: '16px 0 0 16px' }} />
                <div style={{
                  width: 54, height: 54, borderRadius: 14, flexShrink: 0,
                  background: sp.glow, border: `1px solid ${sp.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, marginLeft: 8,
                }}>
                  {sp.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {sp.label}
                  </div>
                  <div style={{ fontSize: 13, color: hasQs ? sp.color : 'var(--text-muted)', fontWeight: hasQs ? 600 : 400 }}>
                    {qCountAvail === undefined
                      ? 'Loading…'
                      : hasQs
                        ? `${qCountAvail} question${qCountAvail !== 1 ? 's' : ''} in today's pool`
                        : "Today's pool not ready yet"}
                  </div>
                </div>
                <div style={{ fontSize: 18, color: sp.color, opacity: 0.7, flexShrink: 0 }}>›</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: GROUP STUDY LOBBY
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'group-lobby') {
    return (
      <GroupSessionLobby
        uid={currentUser?.uid}
        name={profile?.name || currentUser?.displayName || 'Participant'}
        examSetup={{
          examType: 'daily_mock_exam',
          examName: `Daily Mock Exam — ${selected.label}`,
          category: selected.id,
        }}
        onCancel={() => setView('exam')}
      />
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // VIEW: EXAM CARD + EXAMS TAKEN  (for the selected specialty)
  // ══════════════════════════════════════════════════════════════════════
  const sp = selected;

  return (
    <div style={{ padding: '24px 16px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={backToSpecialties}>
          ← All Specialties
        </button>
        <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <button
            onClick={() => setStudyMode('single')}
            style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: studyMode === 'single' ? sp.color : 'var(--bg-tertiary)', color: studyMode === 'single' ? '#fff' : 'var(--text-secondary)' }}
          >
            🧍 Single
          </button>
          <button
            onClick={() => setStudyMode('group')}
            style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: studyMode === 'group' ? sp.color : 'var(--bg-tertiary)', color: studyMode === 'group' ? '#fff' : 'var(--text-secondary)' }}
          >
            👥 Group
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 28 }}>{sp.icon}</span>
        <h2 style={{ margin: 0, fontFamily: "'Arial Black', Arial, sans-serif", fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
          Daily Mock Exam — {sp.label}
        </h2>
      </div>
      <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
        A fresh pool of up to 250 {sp.label} questions every 24 hours. Choose how many you want to answer — the exam is timed at 1 minute per question.
      </p>

      {/* Push notification prompt */}
      {pushSupported() && pushState !== 'granted' && pushState !== 'unsupported' && (
        <div style={{ background: 'rgba(124,58,237,0.08)', border: '1.5px solid rgba(124,58,237,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Get notified about new mock exams</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>We'll alert you the moment a new daily pool goes live — even when the app is closed.</div>
          </div>
          {pushState === 'denied' ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Notifications blocked — enable in browser settings</span>
          ) : (
            <button onClick={handleEnablePush} disabled={pushBusy} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 13, cursor: pushBusy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            {pushBusy ? 'Enabling…' : 'Enable Notifications'}
          </button>
          )}
        </div>
      )}

      {/* Today's pool card */}
      <div style={{ background: 'var(--bg-card)', border: `2px solid ${sp.color}`, borderRadius: 18, padding: 24, marginBottom: 28, boxShadow: `0 0 0 4px ${sp.glow}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>📚</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>
                {poolLoading ? 'Loading today\u2019s pool…' : `${totalAvailable || 0} Questions Available`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>New pool in {formatCountdown(countdown)}</div>
            </div>
          </div>
        </div>

        {!poolLoading && totalAvailable === 0 && (
          <div style={{ background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.30)', borderRadius: 10, padding: '12px 16px', color: '#F87171', fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>
            ⚠️ Today's {sp.label} mock exam hasn't been generated yet. Please check back shortly.
          </div>
        )}

        {studyMode === 'single' && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>📊 Number of Questions</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESETS.map(n => (
                <button key={n} onClick={() => { setQCount(n); setUseCustom(false); }} style={{ padding: '8px 16px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', border: `2px solid ${!useCustom && qCount === n ? sp.color : 'var(--border)'}`, background: !useCustom && qCount === n ? sp.glow : 'var(--bg-tertiary)', color: !useCustom && qCount === n ? sp.color : 'var(--text-secondary)' }}>{n}</button>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setUseCustom(true)} style={{ padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', border: `2px solid ${useCustom ? sp.color : 'var(--border)'}`, background: useCustom ? sp.glow : 'var(--bg-tertiary)', color: useCustom ? sp.color : 'var(--text-secondary)' }}>Custom</button>
                {useCustom && <input type="number" min={1} max={totalAvailable || 250} value={customCount} onChange={e => setCustomCount(e.target.value)} placeholder={`1–${totalAvailable || 250}`} autoFocus style={{ width: 80, padding: '8px 10px', borderRadius: 10, border: `2px solid ${sp.color}`, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, outline: 'none' }} />}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              ⏱ {finalCount} questions ≈ {finalCount} minute{finalCount === 1 ? '' : 's'}
            </div>
            {!isSub && (
              <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 4 }}>⚡ Free preview is capped — upgrade for the full pool.</div>
            )}
          </div>
        )}

        <button className="btn btn-primary" onClick={startExam} disabled={poolLoading || totalAvailable === 0} style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 700, borderRadius: 12, background: sp.color, border: 'none' }}>
          {studyMode === 'group' ? '👥 Continue to Group Study' : `🚀 Start Daily Mock Exam — ${finalCount} Questions`}
        </button>
        {studyMode === 'group' && (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            You'll pick your group, exam type, and start the call on the next screen — the question count comes right before you start.
          </div>
        )}
      </div>

      {/* Exams Taken */}
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        📋 Exams Taken — {sp.label}
        {attempts.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{attempts.length}</span>}
      </h3>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {loadingAtt && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 10px' }} />
            Loading your exams…
          </div>
        )}

        {!loadingAtt && attempts.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No {sp.label} exams taken yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>Start your first Daily Mock Exam above — it'll be saved here for you to retake or review any time.</div>
          </div>
        )}

        {!loadingAtt && attempts.map((attempt, idx) => {
          const pct    = attempt.scorePercent ?? 0;
          const passed = pct >= PASS_MARK;
          const clr    = passed ? '#16A34A' : '#DC2626';
          const bg     = passed ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)';
          const bdr    = passed ? 'rgba(22,163,74,0.30)' : 'rgba(220,38,38,0.30)';
          return (
            <div key={attempt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: idx < attempts.length - 1 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ width: 50, height: 50, borderRadius: 10, flexShrink: 0, background: bg, border: `1.5px solid ${bdr}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: clr, lineHeight: 1 }}>{pct}%</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>score</div>
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {attempt.correct ?? '?'} / {attempt.totalQuestions ?? '?'} correct
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📅 {fmtDate(attempt.completedAt)}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, padding: '4px 10px', borderRadius: 20, background: bg, color: clr, border: `1px solid ${bdr}` }}>
                {passed ? '✅ Pass' : '❌ Fail'}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => reviewAttempt(attempt)} style={{ flexShrink: 0, fontSize: 12 }}>📖 Review</button>
              <button className="btn btn-primary btn-sm" onClick={startExam} disabled={totalAvailable === 0} style={{ flexShrink: 0, fontSize: 12 }}>🔄 Retake</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
