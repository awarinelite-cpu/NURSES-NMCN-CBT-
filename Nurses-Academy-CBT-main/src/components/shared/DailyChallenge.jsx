// src/components/shared/DailyChallenge.jsx
// "Question of the Day" — one question shown to all students on the same day.
// Admins set it via Firestore doc: dailyChallenge/{YYYY-MM-DD}
// Shape: { question, optionA, optionB, optionC, optionD, answer, explanation, subject, postedBy }
// Student responses are aggregated in dailyChallenge/{YYYY-MM-DD}/responses/{uid}
// This component is embedded in StudentDashboard.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  doc, getDoc, setDoc, collection, getCountFromServer,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const OPTS = ['A','B','C','D'];

export default function DailyChallenge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);   // 'A'|'B'|'C'|'D'
  const [answered,  setAnswered]  = useState(false);
  const [stats,     setStats]     = useState(null);   // { total, correct }
  const [submitting,setSubmitting]= useState(false);
  const [expanded,  setExpanded]  = useState(true);

  const today = todayKey();

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch today's challenge
        const snap = await getDoc(doc(db, 'dailyChallenge', today));
        if (!snap.exists()) { setLoading(false); return; }
        setChallenge(snap.data());

        // Check if user already answered
        const resSnap = await getDoc(doc(db, 'dailyChallenge', today, 'responses', user.uid));
        if (resSnap.exists()) {
          setSelected(resSnap.data().answer);
          setAnswered(true);
          await loadStats();
        }
      } catch(e) { console.warn('DailyChallenge load:', e.message); }
      finally { setLoading(false); }
    })();
  }, [user?.uid, today]);

  const loadStats = async () => {
    try {
      const allRef   = collection(db, 'dailyChallenge', today, 'responses');
      const totalSnap = await getCountFromServer(allRef);
      const total = totalSnap.data().count;

      // Count correct — we read all to compute; Firestore doesn't support server-side filter+count on subcollections easily
      // Use a small reads approach: store correctCount on the parent doc
      const snap = await getDoc(doc(db, 'dailyChallenge', today));
      const correctCount = snap.data()?.correctCount || 0;
      setStats({ total, correct: correctCount });
    } catch(e) { console.warn('stats load:', e.message); }
  };

  const handleSubmit = async () => {
    if (!selected || answered || submitting || !challenge) return;
    setSubmitting(true);
    const isCorrect = selected === challenge.answer;
    try {
      // Save response
      await setDoc(doc(db, 'dailyChallenge', today, 'responses', user.uid), {
        answer: selected, isCorrect, uid: user.uid,
        answeredAt: new Date().toISOString(),
      });
      // Increment correctCount on parent doc (simple counter)
      if (isCorrect) {
        const parentRef = doc(db, 'dailyChallenge', today);
        const pSnap = await getDoc(parentRef);
        const prev = pSnap.data()?.correctCount || 0;
        await setDoc(parentRef, { ...pSnap.data(), correctCount: prev + 1 }, { merge: true });
      }
      setAnswered(true);
      await loadStats();
    } catch(e) { console.warn('submit:', e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return null;
  if (!challenge) return null;

  const isCorrect = answered && selected === challenge.answer;
  const pctCorrect = stats ? Math.round((stats.correct / Math.max(stats.total, 1)) * 100) : null;

  const optLabel = (k) => {
    const map = { A: challenge.optionA, B: challenge.optionB, C: challenge.optionC, D: challenge.optionD };
    return map[k];
  };

  const optColor = (k) => {
    if (!answered) return selected === k ? '#1E3A8A' : 'rgba(255,255,255,0.04)';
    if (k === challenge.answer) return '#15803D22';
    if (k === selected && !isCorrect) return '#EF444418';
    return 'rgba(255,255,255,0.02)';
  };
  const optBorder = (k) => {
    if (!answered) return selected === k ? '#3B82F6' : 'rgba(255,255,255,0.1)';
    if (k === challenge.answer) return '#22C55E';
    if (k === selected && !isCorrect) return '#EF4444';
    return 'rgba(255,255,255,0.07)';
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1E3A8A18 0%, #0D948818 100%)',
      border: '1.5px solid rgba(59,130,246,0.25)',
      borderRadius: 18, marginBottom: 20, overflow: 'hidden',
    }}>
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: '#3B82F6' }}>
              Question of the Day
            </div>
            <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)' }}>
              {challenge.subject || 'NMCN'} • {today}
              {answered && (
                <span style={{ marginLeft: 8, color: isCorrect ? '#22C55E' : '#EF4444', fontWeight: 700 }}>
                  {isCorrect ? '✓ Correct' : '✗ Wrong'}
                </span>
              )}
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '0 18px 18px' }}>
          {/* Question */}
          <div style={{
            fontFamily: F, fontWeight: 700, fontSize: 15,
            color: 'var(--text-primary)', lineHeight: 1.6,
            marginBottom: 16, padding: '12px 16px',
            background: 'rgba(255,255,255,0.04)', borderRadius: 12,
          }}>
            {challenge.question}
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {OPTS.map(k => optLabel(k) ? (
              <button
                key={k}
                onClick={() => !answered && setSelected(k)}
                disabled={answered}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: optColor(k),
                  border: `1.5px solid ${optBorder(k)}`,
                  borderRadius: 12, padding: '11px 16px',
                  cursor: answered ? 'default' : 'pointer',
                  textAlign: 'left', transition: 'all 0.2s',
                  width: '100%',
                }}
              >
                <span style={{
                  fontFamily: H, fontWeight: 900, fontSize: 13,
                  color: answered && k === challenge.answer ? '#22C55E'
                        : answered && k === selected && !isCorrect ? '#EF4444'
                        : selected === k ? '#93C5FD' : 'var(--text-muted)',
                  minWidth: 20,
                }}>{k}.</span>
                <span style={{
                  fontFamily: F, fontWeight: 700, fontSize: 14,
                  color: 'var(--text-primary)',
                }}>{optLabel(k)}</span>
                {answered && k === challenge.answer && <span style={{ marginLeft: 'auto', fontSize: 16 }}>✅</span>}
                {answered && k === selected && !isCorrect && k !== challenge.answer && <span style={{ marginLeft: 'auto', fontSize: 16 }}>❌</span>}
              </button>
            ) : null)}
          </div>

          {/* Submit button */}
          {!answered && (
            <button
              onClick={handleSubmit}
              disabled={!selected || submitting}
              style={{
                width: '100%', padding: '13px', borderRadius: 12,
                background: selected ? '#3B82F6' : 'rgba(255,255,255,0.05)',
                border: 'none', cursor: selected ? 'pointer' : 'not-allowed',
                fontFamily: H, fontWeight: 900, fontSize: 14,
                color: selected ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}
            >{submitting ? 'Submitting…' : 'Submit Answer'}</button>
          )}

          {/* Post-answer: explanation + stats */}
          {answered && (
            <div style={{ marginTop: 12 }}>
              {/* Result banner */}
              <div style={{
                background: isCorrect ? '#15803D22' : '#EF444418',
                border: `1.5px solid ${isCorrect ? '#22C55E55' : '#EF444455'}`,
                borderRadius: 12, padding: '12px 16px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 24 }}>{isCorrect ? '🎉' : '📚'}</span>
                <div>
                  <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: isCorrect ? '#22C55E' : '#EF4444' }}>
                    {isCorrect ? 'Correct! Well done.' : `Correct answer: ${challenge.answer}`}
                  </div>
                  {challenge.explanation && (
                    <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                      {challenge.explanation}
                    </div>
                  )}
                </div>
              </div>

              {/* Community stats */}
              {stats && (
                <div style={{
                  display: 'flex', gap: 12, flexWrap: 'wrap',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: '12px 16px',
                }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontFamily: H, fontWeight: 900, fontSize: 22, color: '#3B82F6' }}>{stats.total}</div>
                    <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)' }}>Attempted</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontFamily: H, fontWeight: 900, fontSize: 22, color: '#22C55E' }}>{pctCorrect}%</div>
                    <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)' }}>Got it Right</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontFamily: H, fontWeight: 900, fontSize: 22, color: '#F59E0B' }}>{100 - pctCorrect}%</div>
                    <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)' }}>Got it Wrong</div>
                  </div>
                </div>
              )}

              {/* Discuss in group chat */}
              <button
                onClick={() => navigate('/group-chat')}
                style={{
                  marginTop: 12, width: '100%', padding: '11px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, cursor: 'pointer',
                  fontFamily: H, fontWeight: 900, fontSize: 13,
                  color: 'var(--text-muted)',
                }}
              >💬 Discuss in Group Chat</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
