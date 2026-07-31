// src/context/GroupCallContext.jsx
//
// Group Study voice call, lifted out of any single screen. Previously this
// lived entirely inside GroupCallBar.jsx, which meant the Agora connection
// was owned by whichever component happened to render the call bar — so
// navigating away (Submit, Exit, Retake, a fresh exam) unmounted it and
// silently dropped the call for that person, even though the rest of the
// group was untouched.
//
// The call is a property of the GROUP SESSION, not of any one exam attempt,
// so its state now lives here, mounted once at the app root (see App.jsx),
// and survives every route change until the person explicitly taps
// "Leave Call" or "Leave Group".
//
// GroupCallBar.jsx (rendered from the Lobby, the exam screen, and the
// review screen) is now just a thin UI over this context — same channel,
// same client, same "who's talking" state, wherever it's shown.

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { getFunctions, httpsCallable } from 'firebase/functions';

const APP_ID = process.env.REACT_APP_AGORA_APP_ID;

function toAgoraUid(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h) % 2147483647 || 1;
}

const GroupCallContext = createContext(null);

export function GroupCallProvider({ children }) {
  const [channel, setChannel]       = useState(null); // which studySessions/{id} we're connected to, if any
  const [joined, setJoined]         = useState(false);
  const [joining, setJoining]       = useState(false);
  const [muted, setMuted]           = useState(false);
  const [speaking, setSpeaking]     = useState(new Set());
  const [remoteUids, setRemoteUids] = useState([]);
  const [callErr, setCallErr]       = useState(null);

  const clientRef = useRef(null);
  const micRef    = useRef(null);
  const uidRef    = useRef(null);

  const leaveCall = useCallback(async () => {
    micRef.current?.close();
    micRef.current = null;
    try { await clientRef.current?.leave(); } catch {}
    clientRef.current = null;
    uidRef.current = null;
    setJoined(false);
    setJoining(false);
    setRemoteUids([]);
    setSpeaking(new Set());
    setChannel(null);
  }, []);

  const joinCall = useCallback(async (chan, uid) => {
    if (!APP_ID) { setCallErr('Group calling isn\u2019t configured yet.'); return; }
    // Already connected to this exact channel — nothing to do (covers
    // remounts of GroupCallBar on a different screen while still live).
    if (joined && channel === chan) return;
    // Connected to a *different* channel (shouldn't normally happen, but
    // be safe) — drop it first.
    if (clientRef.current) await leaveCall();

    setChannel(chan);
    uidRef.current = uid;
    const myAgoraUid = toAgoraUid(uid);
    setJoining(true);
    setCallErr(null);
    try {
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        if (mediaType !== 'audio') return; // audio-only room
        await client.subscribe(user, mediaType);
        user.audioTrack?.play();
        setRemoteUids(prev => prev.includes(user.uid) ? prev : [...prev, user.uid]);
      });
      client.on('user-left', (user) => {
        setRemoteUids(prev => prev.filter(id => id !== user.uid));
      });
      client.enableAudioVolumeIndicator();
      client.on('volume-indicator', (vols) => {
        const talking = new Set(vols.filter(v => v.level > 5).map(v => v.uid));
        setSpeaking(talking);
      });

      const mintToken = httpsCallable(getFunctions(), 'mintAgoraToken');
      const { data } = await mintToken({ channel: chan, agoraUid: myAgoraUid });

      await client.join(APP_ID, chan, data.token, myAgoraUid);
      const mic = await AgoraRTC.createMicrophoneAudioTrack();
      micRef.current = mic;
      await client.publish([mic]);

      setJoined(true);
    } catch (e) {
      console.error('Agora join failed', e);
      setCallErr('Could not start the call — check mic permission and try again.');
      clientRef.current = null;
      setChannel(null);
    } finally {
      setJoining(false);
    }
  }, [joined, channel, leaveCall]);

  const toggleMute = useCallback(() => {
    if (!micRef.current) return;
    setMuted(prev => {
      const next = !prev;
      micRef.current.setEnabled(!next);
      return next;
    });
  }, []);

  const value = {
    channel, joined, joining, muted, speaking, remoteUids, callErr,
    myAgoraUid: uidRef.current != null ? toAgoraUid(uidRef.current) : null,
    joinCall, leaveCall, toggleMute,
  };

  return <GroupCallContext.Provider value={value}>{children}</GroupCallContext.Provider>;
}

export function useGroupCall() {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error('useGroupCall must be used within a GroupCallProvider');
  return ctx;
}
