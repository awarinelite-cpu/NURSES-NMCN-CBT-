// src/hooks/useGroupCall.js
//
// Group-scoped call + synced study session.
//
// Unlike the older useStudySession (one throwaway `studySessions/{id}` doc
// per exam, joined by a 6-char code, which dies the moment the exam ends),
// this hook is anchored to the persistent subject group itself
// (`groupCalls/{groupId}`, one doc per subject group, id == groupId).
// That's the whole point: the call belongs to the group, not to whatever
// exam happens to be running inside it.
//
//   - Anyone can start a call in the group. Everyone who joins stays in the
//     same Agora channel (`groupcall_{groupId}`, constant forever) no matter
//     what's happening — hanging out, or mid-exam, or reviewing results.
//   - The host can start a "study" inside a live call (`study` field on the
//     same doc). Ending the exam / submitting / exiting just clears `study`
//     back to null — the call itself is untouched, so nobody gets dropped.
//   - Reading mode and quiz mode are both just states of `study`, advanced
//     by the host and mirrored to everyone else via onSnapshot.
//
// Data model:
//   groupCalls/{groupId}
//     active:      boolean
//     hostId:      string
//     hostName:    string
//     channel:     string                 // `groupcall_${groupId}`, constant
//     startedAt:   serverTimestamp
//     study:       null | {
//       mode:          'reading' | 'quiz'
//       examName:      string
//       category:      string
//       questionIds:   string[]           // fixed order for everyone
//       currentIndex:  number
//       revealed:      boolean            // reading mode: is this Q's answer shown
//       status:        'active' | 'reviewing' | 'ended'
//     }
//     participants/{uid}   { name, joinedAt, lastSeen }
//     responses/{uid_questionIndex}  { uid, name, questionIndex, choice, answeredAt }
//                                                     // quiz mode only — one doc per
//                                                     // participant per question, so
//                                                     // security rules can check
//                                                     // `request.resource.data.uid`.

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  doc, collection, setDoc, updateDoc, onSnapshot, serverTimestamp,
  deleteDoc, deleteField, query, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export function useGroupCall({ groupId, uid, name }) {
  const [call, setCall]                 = useState(null); // groupCalls/{groupId} doc data, or null
  const [participants, setParticipants] = useState([]);
  const [responses, setResponses]       = useState([]);   // all response docs for this call
  const [inCall, setInCall]             = useState(false); // am I personally joined right now
  const [error, setError]               = useState(null);

  const unsubCall  = useRef(null);
  const unsubParts = useRef(null);
  const unsubResp  = useRef(null);
  const heartbeat  = useRef(null);

  const channel = `groupcall_${groupId}`;
  const isHost  = !!call && call.hostId === uid;

  const callRef = useCallback(() => doc(db, 'groupCalls', groupId), [groupId]);

  /* ── Attach listeners the moment we know which group we're in ── */
  useEffect(() => {
    if (!groupId) return undefined;
    unsubCall.current = onSnapshot(callRef(), (snap) => {
      setCall(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }, () => {});
    unsubParts.current = onSnapshot(collection(db, 'groupCalls', groupId, 'participants'), (snap) => {
      setParticipants(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    }, () => {});
    unsubResp.current = onSnapshot(collection(db, 'groupCalls', groupId, 'responses'), (snap) => {
      setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return () => {
      unsubCall.current?.();
      unsubParts.current?.();
      unsubResp.current?.();
      clearInterval(heartbeat.current);
    };
  }, [groupId, callRef]);

  /* ── Presence heartbeat while I'm actually in the call ── */
  useEffect(() => {
    if (!inCall || !groupId || !uid) return undefined;
    const beat = () => setDoc(doc(db, 'groupCalls', groupId, 'participants', uid),
      { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    beat();
    heartbeat.current = setInterval(beat, 20000);
    return () => clearInterval(heartbeat.current);
  }, [inCall, groupId, uid]);

  /* ── Start a brand-new call in this group (becomes host) ── */
  const startCall = useCallback(async () => {
    setError(null);
    await setDoc(callRef(), {
      active: true, hostId: uid, hostName: name || 'Host',
      channel, startedAt: serverTimestamp(), study: null,
    });
    await setDoc(doc(db, 'groupCalls', groupId, 'participants', uid),
      { name: name || 'Host', joinedAt: serverTimestamp(), lastSeen: serverTimestamp() });
    setInCall(true);
  }, [callRef, uid, name, channel, groupId]);

  /* ── Join a call that's already running in this group ── */
  const joinCall = useCallback(async () => {
    setError(null);
    if (!call?.active) { setError('No live call in this group right now.'); return; }
    await setDoc(doc(db, 'groupCalls', groupId, 'participants', uid),
      { name: name || 'Participant', joinedAt: serverTimestamp(), lastSeen: serverTimestamp() });
    setInCall(true);
  }, [call, groupId, uid, name]);

  /* ── Leave the call. If the host leaves, the call ends for everyone —
     study sync and the shared channel don't make sense without a host. ── */
  const leaveCall = useCallback(async () => {
    try { await deleteDoc(doc(db, 'groupCalls', groupId, 'participants', uid)); } catch {}
    if (isHost) {
      try { await updateDoc(callRef(), { active: false, study: null }); } catch {}
    }
    setInCall(false);
  }, [groupId, uid, isHost, callRef]);

  /* ── Host: end the call outright for everyone ── */
  const endCall = useCallback(async () => {
    if (!isHost) return;
    await updateDoc(callRef(), { active: false, study: null });
    setInCall(false);
  }, [isHost, callRef]);

  /* ── Host: start a synced study inside the live call ── */
  const startStudy = useCallback(async ({ mode, examName, category, questionIds }) => {
    if (!isHost) return;
    await updateDoc(callRef(), {
      study: {
        mode, examName, category, questionIds,
        currentIndex: 0, revealed: false, status: 'active',
      },
    });
  }, [isHost, callRef]);

  /* ── Host (reading mode): reveal the current question's answer ── */
  const revealAnswer = useCallback(async () => {
    if (!isHost || !call?.study) return;
    await updateDoc(callRef(), { 'study.revealed': true });
  }, [isHost, call, callRef]);

  /* ── Host: advance to the next question / stage ── */
  const nextQuestion = useCallback(async () => {
    if (!isHost || !call?.study) return;
    const { mode, currentIndex, questionIds, status } = call.study;
    const lastIndex = (questionIds?.length || 1) - 1;

    if (status === 'reviewing') {
      if (currentIndex >= lastIndex) return; // host taps "Finish Review" instead
      await updateDoc(callRef(), { 'study.currentIndex': currentIndex + 1 });
      return;
    }

    if (currentIndex >= lastIndex) {
      // Last question just finished.
      if (mode === 'quiz') {
        await updateDoc(callRef(), { 'study.status': 'reviewing', 'study.currentIndex': 0 });
      } else {
        await updateDoc(callRef(), { 'study.status': 'ended' });
      }
      return;
    }
    await updateDoc(callRef(), { 'study.currentIndex': currentIndex + 1, 'study.revealed': false });
  }, [isHost, call, callRef]);

  /* ── Host: jump straight into review (quiz mode, if they want to skip ahead) ── */
  const goToReview = useCallback(async () => {
    if (!isHost || !call?.study) return;
    await updateDoc(callRef(), { 'study.status': 'reviewing', 'study.currentIndex': 0 });
  }, [isHost, call, callRef]);

  /* ── Host: step back one question during review ── */
  const prevQuestion = useCallback(async () => {
    if (!isHost || !call?.study) return;
    await updateDoc(callRef(), { 'study.currentIndex': Math.max(0, call.study.currentIndex - 1) });
  }, [isHost, call, callRef]);

  /* ── Host: close the study and drop everyone back into plain group chat.
     The call itself (and everyone's presence in it) is left completely
     alone — that's the whole point. ── */
  const endStudy = useCallback(async () => {
    if (!isHost) return;
    await updateDoc(callRef(), { study: null });
  }, [isHost, callRef]);

  /* ── Anyone: pick an answer in quiz mode ── */
  const submitQuizAnswer = useCallback(async (questionIndex, choice) => {
    const id = `${uid}_${questionIndex}`;
    await setDoc(doc(db, 'groupCalls', groupId, 'responses', id), {
      uid, name: name || 'Participant', questionIndex, choice, answeredAt: serverTimestamp(),
    });
  }, [groupId, uid, name]);

  return {
    call, participants, responses, inCall, isHost, error, channel,
    startCall, joinCall, leaveCall, endCall,
    startStudy, revealAnswer, nextQuestion, prevQuestion, goToReview, endStudy,
    submitQuizAnswer,
  };
}
