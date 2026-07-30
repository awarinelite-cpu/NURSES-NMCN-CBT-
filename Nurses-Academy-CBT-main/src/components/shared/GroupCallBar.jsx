// src/components/shared/GroupCallBar.jsx
//
// Handles the audio/video CALL only — question sync is a completely
// separate concern living in useStudySession.js (Firestore). This
// component just gets people's voices/faces into the same Agora channel.
//
// Tokens come from the mintAgoraToken Cloud Function (functions/src/
// agoraToken.js), which checks the caller is a real participant of this
// studySessions doc before handing one out — see that file's SETUP
// comment for the two secrets it needs (AGORA_APP_ID, AGORA_APP_CERTIFICATE).

import { useEffect, useRef, useState, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { getFunctions, httpsCallable } from 'firebase/functions';

const APP_ID = process.env.REACT_APP_AGORA_APP_ID;

// Deterministic string -> 31-bit int, so every client derives the same
// numeric Agora UID from a Firebase uid without any extra coordination.
function toAgoraUid(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h) % 2147483647 || 1;
}

export default function GroupCallBar({ channel, uid, participants = [] }) {
  const [joined, setJoined]     = useState(false);
  const [joining, setJoining]   = useState(false);
  const [muted, setMuted]       = useState(false);
  const [videoOn, setVideoOn]   = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [callErr, setCallErr]   = useState(null);

  const clientRef = useRef(null);
  const micRef    = useRef(null);
  const camRef    = useRef(null);
  const localVideoDivRef = useRef(null);

  const myAgoraUid = toAgoraUid(uid);
  const nameFor = (agoraUid) => {
    const p = participants.find(p => toAgoraUid(p.uid) === agoraUid);
    return p?.name || 'Participant';
  };

  const leaveCall = useCallback(async () => {
    micRef.current?.close();
    camRef.current?.close();
    micRef.current = null;
    camRef.current = null;
    try { await clientRef.current?.leave(); } catch {}
    setJoined(false);
    setRemoteUsers([]);
  }, []);

  useEffect(() => () => { leaveCall(); }, [leaveCall]);

  const joinCall = async () => {
    if (!APP_ID) { setCallErr('Group calling isn\u2019t configured yet.'); return; }
    setJoining(true);
    setCallErr(null);
    try {
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') {
          setRemoteUsers(prev => prev.some(u => u.uid === user.uid) ? prev : [...prev, user]);
          setTimeout(() => user.videoTrack?.play(`remote-video-${user.uid}`), 0);
        }
        if (mediaType === 'audio') user.audioTrack?.play();
      });
      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video') setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });
      client.on('user-left', (user) => {
        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      });

      const mintToken = httpsCallable(getFunctions(), 'mintAgoraToken');
      const { data } = await mintToken({ channel, agoraUid: myAgoraUid });

      await client.join(APP_ID, channel, data.token, myAgoraUid);
      const mic = await AgoraRTC.createMicrophoneAudioTrack();
      micRef.current = mic;
      await client.publish([mic]);

      setJoined(true);
    } catch (e) {
      console.error('Agora join failed', e);
      setCallErr('Could not start the call — check mic permission and try again.');
    } finally {
      setJoining(false);
    }
  };

  const toggleMute = () => {
    if (!micRef.current) return;
    const next = !muted;
    micRef.current.setEnabled(!next);
    setMuted(next);
  };

  const toggleVideo = async () => {
    if (!clientRef.current) return;
    if (!videoOn) {
      try {
        const cam = await AgoraRTC.createCameraVideoTrack();
        camRef.current = cam;
        await clientRef.current.publish([cam]);
        cam.play(localVideoDivRef.current);
        setVideoOn(true);
      } catch {
        setCallErr('Could not access camera.');
      }
    } else {
      camRef.current?.close();
      camRef.current = null;
      setVideoOn(false);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          🎙️ Group Call {joined && <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A' }}>● Live</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!joined ? (
            <button onClick={joinCall} disabled={joining} className="btn btn-primary btn-sm">
              {joining ? 'Joining…' : '📞 Join Call'}
            </button>
          ) : (
            <>
              <button onClick={toggleMute} className="btn btn-ghost btn-sm">{muted ? '🔇 Unmute' : '🎤 Mute'}</button>
              <button onClick={toggleVideo} className="btn btn-ghost btn-sm">{videoOn ? '📷 Stop Video' : '📷 Start Video'}</button>
              <button onClick={leaveCall} className="btn btn-sm" style={{ background: '#DC2626', color: '#fff', border: 'none' }}>Leave Call</button>
            </>
          )}
        </div>
      </div>

      {callErr && <div style={{ fontSize: 12, color: '#DC2626' }}>{callErr}</div>}

      {joined && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {videoOn && (
            <div ref={localVideoDivRef} style={{ width: 100, height: 76, borderRadius: 10, overflow: 'hidden', background: '#000', position: 'relative' }}>
              <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 10, color: '#fff', textShadow: '0 0 3px #000' }}>You</span>
            </div>
          )}
          {remoteUsers.map(u => (
            <div key={u.uid} id={`remote-video-${u.uid}`} style={{ width: 100, height: 76, borderRadius: 10, overflow: 'hidden', background: '#000', position: 'relative' }}>
              <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 10, color: '#fff', textShadow: '0 0 3px #000' }}>{nameFor(u.uid)}</span>
            </div>
          ))}
          {participants.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
              {participants.length} in session
            </div>
          )}
        </div>
      )}
    </div>
  );
}
