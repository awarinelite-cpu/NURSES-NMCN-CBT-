// src/components/exam/GroupSessionLobby.jsx
//
// Sits between "pick specialty / question count" and the synced exam
// itself. Host creates a session (gets a 6-char code to share), everyone
// else joins with that code, then the host taps Start and everyone is
// dropped into ExamSession together, locked to the same question.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudySession } from '../../hooks/useStudySession';

export default function GroupSessionLobby({ uid, name, examSetup, onCancel }) {
  const navigate = useNavigate();
  const study = useStudySession({ uid, name });
  const [choice, setChoice] = useState(null); // 'create' | 'join' | null
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);

  const { session, participants, isHost, error, createSession, joinByCode, startSession, leaveSession } = study;

  const handleCreate = async () => {
    setBusy(true);
    await createSession({
      examType: examSetup.examType,
      examName: examSetup.examName,
      category: examSetup.category,
      questionIds: examSetup.questionIds, // pre-drawn so every participant gets the identical set, in order
    });
    setBusy(false);
  };

  const handleJoin = async () => {
    if (codeInput.trim().length !== 6) return;
    setBusy(true);
    await joinByCode(codeInput);
    setBusy(false);
  };

  const handleStart = async () => {
    await startSession();
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

  return (
    <div style={{ padding: '24px 16px', maxWidth: 520, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => { leaveSession(); onCancel(); }} style={{ marginBottom: 16 }}>
        ← Back
      </button>

      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>👥 Group Study</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
        Study {examSetup.examName} together with audio or video call, everyone on the same question at the same time.
      </p>

      {!session && !choice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => { setChoice('create'); handleCreate(); }}>
            🚀 Create a Group Session
          </button>
          <button className="btn btn-ghost" onClick={() => setChoice('join')}>
            🔑 Join with a Code
          </button>
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
            {busy ? 'Joining…' : 'Join Session'}
          </button>
          {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
        </div>
      )}

      {session && session.status === 'lobby' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Share this code</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 6, color: 'var(--teal)' }}>{session.code}</div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {participants.length} joined
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {participants.map(p => (
              <div key={p.uid} style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                🟢 {p.name} {p.uid === session.hostId && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(host)</span>}
              </div>
            ))}
          </div>

          {isHost ? (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleStart} disabled={participants.length < 1}>
              Start for Everyone
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Waiting for the host to start…</div>
          )}
        </div>
      )}
    </div>
  );
}
