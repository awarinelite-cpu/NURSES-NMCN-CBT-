// src/components/shared/GroupCallBar.jsx
//
// Audio-only group call UI. The actual Agora connection lives in
// GroupCallContext (see src/context/GroupCallContext.jsx) so it survives
// navigation — between the Lobby, an exam screen, the review screen, and
// the persistent subject GroupChatPage. This component just renders
// whatever that shared connection is doing right now and lets the person
// join/mute/leave. Same channel, same client, same "who's talking" state,
// wherever it's shown.
//
// Two calling conventions are supported, since two different call-entry
// flows use this bar:
//   - Manual join (exam-session group study): pass channel/uid/participants,
//     person taps "Join Call" themselves. Optionally pass onLeaveGroup for
//     a second "Leave Group" action distinct from just leaving the call.
//   - Auto join (persistent subject GroupChatPage): pass autoJoin +
//     hideJoinButton once the group decides a call is active, plus onLeave
//     for a callback when the person leaves.
//
// Tokens come from the mintAgoraToken Cloud Function (functions/src/
// agoraToken.js), which checks the caller is a real participant of this
// studySessions doc before handing one out — see that file's SETUP
// comment for the two secrets it needs (AGORA_APP_ID, AGORA_APP_CERTIFICATE).

import { useEffect, useRef } from 'react';
import { useGroupCall, toAgoraUid } from '../../context/GroupCallContext';

export default function GroupCallBar({
  channel, uid, participants = [],
  autoJoin = false, hideJoinButton = false,
  onLeaveGroup, onLeave,
  isHost = false, onEndCallForEveryone, callEndedSignal, onCallEndedByHost,
}) {
  const {
    channel: liveChannel, joined, joining, muted, speaking, remoteUids, callErr,
    myAgoraUid, joinCall, leaveCall, toggleMute,
  } = useGroupCall();

  // GroupCallContext only ever tracks one channel at a time, so "joined"
  // here effectively means "live on this exact channel."
  const liveHere = joined && liveChannel === channel;
  const seenEndSignal = useRef(callEndedSignal || null);

  useEffect(() => {
    if (autoJoin && !liveHere && !joining) joinCall(channel, uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, channel]);

  // Host ended the call for everyone — anyone still on this channel drops
  // off automatically, without needing to tap "Leave Call" themselves.
  useEffect(() => {
    if (!callEndedSignal || callEndedSignal === seenEndSignal.current) return;
    seenEndSignal.current = callEndedSignal;
    if (liveHere) leaveCall();
    onCallEndedByHost?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callEndedSignal, liveHere]);

  const nameFor = (agoraUid) => {
    const p = participants.find(p => toAgoraUid(p.uid) === agoraUid);
    return p?.name || 'Participant';
  };

  const handleLeaveCall = async () => {
    await leaveCall();
    onLeave?.();
  };

  const handleEndCallForEveryone = async () => {
    await leaveCall();
    onEndCallForEveryone?.();
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
            !hideJoinButton && (
              <button onClick={() => joinCall(channel, uid)} disabled={joining} className="btn btn-primary btn-sm">
                {joining ? 'Joining…' : '📞 Join Call'}
              </button>
            )
          ) : (
            <>
              <button onClick={toggleMute} className="btn btn-ghost btn-sm">{muted ? '🔇 Unmute' : '🎤 Mute'}</button>
              <button onClick={handleLeaveCall} className="btn btn-sm" style={{ background: '#DC2626', color: '#fff', border: 'none' }}>Leave Call</button>
            </>
          )}
          {isHost && onEndCallForEveryone && (
            <button onClick={handleEndCallForEveryone} className="btn btn-sm" style={{ background: '#7F1D1D', color: '#fff', border: 'none' }} title="Ends the call for every participant, not just you">
              🔴 End Call
            </button>
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
