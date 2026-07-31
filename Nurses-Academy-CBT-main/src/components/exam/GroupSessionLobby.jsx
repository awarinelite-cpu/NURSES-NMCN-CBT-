// src/components/exam/GroupSessionLobby.jsx
// The "Group Study" page.
//
// Flow: pick a group (create a new one or join by code) → pick exam type
// (Reading or Quiz) → initiate the group call → press Continue → Start
// Exam step (pick question count) → into the shared ExamSession.
//
// The person who creates the group is the host. The host controls exam
// type and question count; everyone else waits and can join the call.
//
// This component is also reused to come BACK to the group study page
// after an exam ends: pass `existingSessionId` (and no `examSetup`) to
// re-attach to a session that's already live and go straight to picking
// the next exam type / question count, without dropping the call.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useStudySession } from '../../hooks/useStudySession';
import GroupCallBar from '../shared/GroupCallBar';

function shuffleIds(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PRESETS = [25, 50, 100, 150, 250];

export default function GroupSessionLobby({ uid, name, examSetup, existingSessionId, onCancel }) {
  const navigate = useNavigate();
  const study = useStudySession({ uid, name });
  const [choice, setChoice] = useState(null); // 'mode' | 'join' | null
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('setup'); // 'setup' | 'count'  (host, once in the lobby)
  const [pool, setPool] = useState(null); // dailyMockExam/{category} doc — fetched here so the
  const [poolLoading, setPoolLoading] = useState(true); // count step can draw questions itself
  const [qCount, setQCount] = useState(50);
  const [customCount, setCustomCount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const attachedExisting = useRef(false);

  const { session, participants, isHost, error, createSession, joinByCode, startSession, leaveSession, setSessionMode } = study;

  // ── Re-attach to an already-live session (returning from a finished exam) ──
  useEffect(() => {
    if (existingSessionId && !attachedExisting.current) {
      attachedExisting.current = true;
      study.attachExisting(existingSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSessionId]);

  // ── Load the question pool for whichever category this group is studying ──
  const category = examSetup?.category || session?.category;
  useEffect(() => {
    if (!category) return;
    setPoolLoading(true);
    getDoc(doc(db, 'dailyMockExam', category))
      .then(snap => setPool(snap.exists() ? snap.data() : null))
      .catch(() => setPool(null))
      .finally(() => setPoolLoading(false));
  }, [category]);

  const totalAvailable = pool?.questionIds?.length || 0;
  const finalCount = useCustom
    ? Math.min(Math.max(parseInt(customCount, 10) || 1, 1), totalAvailable || 250)
    : Math.min(qCount, totalAvailable || qCount);

  const handleCreate = async (chosenMode) => {
    setBusy(true);
    await createSession({
      examType: examSetup.examType,
      examName: examSetup.examName,
      category: examSetup.category,
      questionIds: [], // drawn on the Start Exam step, once the count is chosen
      mode: chosenMode,
    });
    setBusy(false);
  };

  const handleJoin = async () => {
    if (codeInput.trim().length !== 6) return;
    setBusy(true);
    await joinByCode(codeInput);
    setBusy(false);
  };

  const handleContinue = () => setStep('count');

  const handleStartExam = async () => {
    const ids = shuffleIds(pool?.questionIds || []).slice(0, finalCount);
    await startSession(ids);
  };

  // Once the session flips to 'active', everyone (host included) gets
  // dropped into the shared exam screen.
  if (session?.status === 'active') {
    navigate('/exam/session', {
      state: {
        examType: session.examType,
        examName: session.examName,
        category: session.category,
        poolMode: false,
        doShuffle: false,
        presetQuestionIds: session.questionIds,
        timeLimit: session.questionIds.length,
        groupSessionId: session.id,
        groupUid: uid,
        groupName: name,
      },
      replace: true,
    });
    return null;
  }

  const backLabel = existingSessionId ? '← Dashboard' : '← Back';
  const handleBack = () => {
    if (existingSessionId) { leaveSession(); navigate('/dashboard'); return; }
    leaveSession(); onCancel?.();
  };

  return (
    <div style={{ padding: '24px 16px', maxWidth: 520, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={handleBack} style={{ marginBottom: 16 }}>
        {backLabel}
      </button>

      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>👥 Group Study</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
        Study {examSetup?.examName || session?.examName || 'together'} on a live voice call, everyone on the same question at the same time.
      </p>

      {/* ── Pick a group: create one, or join with a code ───────────────── */}
      {!session && !existingSessionId && !choice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => setChoice('mode')}>
            🚀 Create a Group
          </button>
          <button className="btn btn-ghost" onClick={() => setChoice('join')}>
            🔑 Join with a Code
          </button>
        </div>
      )}

      {/* ── Pick exam type (Reading or Quiz) — locked in before the group is created ── */}
      {!session && choice === 'mode' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 2 }}>
            Pick your exam type
          </div>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => handleCreate('reading')}
            style={{ textAlign: 'left', padding: '14px 16px' }}
          >
            📖 Reading Mode
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.85, marginTop: 3 }}>
              Everyone reads together — reveal the answer + explanation, then move to the next question.
            </div>
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => handleCreate('quiz')}
            style={{ textAlign: 'left', padding: '14px 16px' }}
          >
            🎯 Quiz Mode
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.85, marginTop: 3 }}>
              Everyone picks their own answer. Once all have answered, see who got it right vs wrong.
            </div>
          </button>
          {busy && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Setting up…</div>}
        </div>
      )}

      {!session && choice === 'join' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            placeholder="6-character code"
            maxLength={6}
            autoFocus
            style={{ padding: '12px 14px', borderRadius: 10, border: '2px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, letterSpacing: 3, textAlign: 'center', textTransform: 'uppercase' }}
          />
          <button className="btn btn-primary" onClick={handleJoin} disabled={busy || codeInput.length !== 6}>
            {busy ? 'Joining…' : 'Join Group'}
          </button>
          {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
        </div>
      )}

      {/* ── In the group: initiate/join the call, then Continue ─────────── */}
      {session && session.status === 'lobby' && step === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Share this code</div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 6, color: 'var(--teal)' }}>{session.code}</div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {participants.length} joined
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {participants.map(p => (
                <div key={p.uid} style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🟢 {p.name} {p.uid === session.hostId && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(host)</span>}
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' }}>
              <button
                onClick={() => setSessionMode('reading')}
                style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: session.mode === 'reading' ? 'var(--teal)' : 'var(--bg-tertiary)', color: session.mode === 'reading' ? '#fff' : 'var(--text-secondary)' }}
              >
                📖 Reading
              </button>
              <button
                onClick={() => setSessionMode('quiz')}
                style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: session.mode === 'quiz' ? 'var(--teal)' : 'var(--bg-tertiary)', color: session.mode === 'quiz' ? '#fff' : 'var(--text-secondary)' }}
              >
                🎯 Quiz
              </button>
            </div>
          )}

          {/* Call initiation lives right here in the group study page */}
          <GroupCallBar channel={session.id} uid={uid} participants={participants} />

          {isHost ? (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleContinue}>
              Continue →
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Waiting for the host to continue…</div>
          )}
        </div>
      )}

      {/* ── Start Exam step: host picks the question count ───────────────── */}
      {session && session.status === 'lobby' && step === 'count' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GroupCallBar channel={session.id} uid={uid} participants={participants} />

          {isHost ? (
            <div style={{ background: 'var(--bg-card)', border: '2px solid var(--teal)', borderRadius: 16, padding: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
                {poolLoading ? 'Loading questions…' : `${totalAvailable} Questions Available`}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', margin: '14px 0 10px' }}>📊 Number of Questions</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {PRESETS.map(n => (
                  <button key={n} onClick={() => { setQCount(n); setUseCustom(false); }} style={{ padding: '8px 16px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', border: `2px solid ${!useCustom && qCount === n ? 'var(--teal)' : 'var(--border)'}`, background: !useCustom && qCount === n ? 'rgba(20,184,166,0.12)' : 'var(--bg-tertiary)', color: !useCustom && qCount === n ? 'var(--teal)' : 'var(--text-secondary)' }}>{n}</button>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => setUseCustom(true)} style={{ padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', border: `2px solid ${useCustom ? 'var(--teal)' : 'var(--border)'}`, background: useCustom ? 'rgba(20,184,166,0.12)' : 'var(--bg-tertiary)', color: useCustom ? 'var(--teal)' : 'var(--text-secondary)' }}>Custom</button>
                  {useCustom && <input type="number" min={1} max={totalAvailable || 250} value={customCount} onChange={e => setCustomCount(e.target.value)} placeholder={`1–${totalAvailable || 250}`} autoFocus style={{ width: 80, padding: '8px 10px', borderRadius: 10, border: '2px solid var(--teal)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, outline: 'none' }} />}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 16px' }}>
                ⏱ {finalCount} question{finalCount === 1 ? '' : 's'} ≈ {finalCount} minute{finalCount === 1 ? '' : 's'}
              </div>
              <button className="btn btn-primary" onClick={handleStartExam} disabled={poolLoading || totalAvailable === 0} style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 700 }}>
                🚀 Start Exam — {finalCount} Questions
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', padding: '20px 0' }}>Waiting for the host to start the exam…</div>
          )}
        </div>
      )}
    </div>
  );
}
