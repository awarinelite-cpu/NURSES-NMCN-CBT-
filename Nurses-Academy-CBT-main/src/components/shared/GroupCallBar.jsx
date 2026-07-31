// src/components/shared/GroupCallBar.jsx
//
// Audio-only group call UI. The actual Agora connection lives in
// GroupCallContext (see src/context/GroupCallContext.jsx) so it survives
// navigation between the Lobby, the exam screen, and the review screen —
// this component just renders whatever that shared connection is doing
// right now and lets the person join/mute/leave.
//
// Tokens come from the mintAgoraToken Cloud Function (functions/src/
// agoraToken.js), which checks the caller is a real participant of this
// studySessions doc before handing one out — see that file's SETUP
// comment for the two secrets it needs (AGORA_APP_ID, AGORA_APP_CERTIFICATE).

import { useGroupCall } from '../../context/GroupCallContext';

export default function GroupCallBar({ channel, uid, participants = [], onLeaveGroup }) {
  const {
    joined, joining, muted, speaking, remoteUids, callErr,
    myAgoraUid, joinCall, leaveCall, toggleMute,
  } = useGroupCall();

  // GroupCallContext only ever tracks one channel at a time, so "joined"
  // here effectively means "live on this channel."
  const liveHere = joined;

  const nameFor = (agoraUid) => {
    const p = participants.find(p => {
      // Recompute the same deterministic uid the context uses, without
      // importing it twice — participants carry the raw Firebase uid.
      let h = 0;
      const s = p.uid;
      for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
      return (Math.abs(h) % 2147483647 || 1) === agoraUid;
    });
    return p?.name || 'Participant';
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          🎙️ Group Call {liveHere && <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A' }}>● Live</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!liveHere ? (
            <button onClick={() => joinCall(channel, uid)} disabled={joining} className="btn btn-primary btn-sm">
              {joining ? 'Joining…' : '📞 Join Call'}
            </button>
          ) : (
            <>
              <button onClick={toggleMute} className="btn btn-ghost btn-sm">{muted ? '🔇 Unmute' : '🎤 Mute'}</button>
              <button onClick={leaveCall} className="btn btn-sm" style={{ background: '#DC2626', color: '#fff', border: 'none' }}>Leave Call</button>
            </>
          )}
          {onLeaveGroup && (
            <button onClick={onLeaveGroup} className="btn btn-ghost btn-sm" title="Leave the group study session entirely">
              🚪 Leave Group
            </button>
          )}
        </div>
      </div>

      {callErr && <div style={{ fontSize: 12, color: '#DC2626' }}>{callErr}</div>}

      {liveHere && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* You */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: speaking.has(myAgoraUid) && !muted ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)', border: `1.5px solid ${speaking.has(myAgoraUid) && !muted ? '#16A34A' : 'var(--border)'}` }}>
            <span style={{ fontSize: 11 }}>{muted ? '🔇' : '🎤'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>You</span>
          </div>
          {remoteUids.map(id => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: speaking.has(id) ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)', border: `1.5px solid ${speaking.has(id) ? '#16A34A' : 'var(--border)'}` }}>
              <span style={{ fontSize: 11 }}>🎤</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{nameFor(id)}</span>
            </div>
          ))}
          {participants.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {participants.length} in session
            </div>
          )}
        </div>
      )}
    </div>
  );
}
