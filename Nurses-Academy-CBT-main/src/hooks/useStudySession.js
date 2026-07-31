// src/hooks/useStudySession.js
//
// Group Study sync layer. Lives entirely in Firestore — deliberately kept
// separate from the video/audio call, which is a different transport
// (Agora) with a different job. This doc is the single source of truth for
// "what question is everyone looking at right now."
//
// Data model:
//   studySessions/{sessionId}
//     hostId:        string
//     examType:      'daily_mock_exam'
//     category:      string (specialty id)
//     examName:      string
//     questionIds:   string[]              // fixed at session creation, same order for everyone
//     currentIndex:  number                // the question every participant should be showing
//     mode:          'reading' | 'quiz'     // locked in at the lobby, before Start
//     revealed:      boolean               // is the answer to the current question shown yet
//     status:        'lobby' | 'active' | 'review' | 'ended'
//     code:          6-char join code
//     createdAt:     serverTimestamp
//     participants/{uid}
//       name, joinedAt, lastSeen
//     responses/{uid}_{questionIndex}       // quiz mode only — one doc per person per question
//       uid, name, qIndex, choiceIndex, ts

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  doc, collection, setDoc, updateDoc, onSnapshot, serverTimestamp,
  query, where, getDocs, deleteDoc, limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function useStudySession({ uid, name }) {
  const [session, setSession]           = useState(null); // live session doc data + id
  const [participants, setParticipants] = useState([]);
  const [responses, setResponses]       = useState([]); // quiz mode: every {uid,qIndex,choiceIndex} so far
  const [error, setError]               = useState(null);
  const unsubSession = useRef(null);
  const unsubParts   = useRef(null);
  const unsubResp    = useRef(null);
  const heartbeat     = useRef(null);

  const isHost = !!session && session.hostId === uid;

  const cleanup = useCallback(() => {
    unsubSession.current?.();
    unsubParts.current?.();
    unsubResp.current?.();
    clearInterval(heartbeat.current);
    unsubSession.current = null;
    unsubParts.current = null;
    unsubResp.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const attach = useCallback((sessionId) => {
    cleanup();
    unsubSession.current = onSnapshot(doc(db, 'studySessions', sessionId), (snap) => {
      if (!snap.exists()) { setSession(null); setError('Session ended.'); return; }
      setSession({ id: snap.id, ...snap.data() });
    });
    unsubParts.current = onSnapshot(collection(db, 'studySessions', sessionId, 'participants'), (snap) => {
      setParticipants(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
    unsubResp.current = onSnapshot(collection(db, 'studySessions', sessionId, 'responses'), (snap) => {
      setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    // Presence heartbeat so the host / UI can tell who's actually still around.
    heartbeat.current = setInterval(() => {
      setDoc(doc(db, 'studySessions', sessionId, 'participants', uid),
        { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    }, 20000);
  }, [cleanup, uid]);

  // ── Create a new group session (host) ────────────────────────────────
  const createSession = useCallback(async ({ examType, examName, category, questionIds, mode }) => {
    const code = genCode();
    const ref = doc(collection(db, 'studySessions'));
    await setDoc(ref, {
      hostId: uid, examType, examName, category, questionIds,
      currentIndex: 0, mode: mode === 'quiz' ? 'quiz' : 'reading', revealed: false,
      status: 'lobby', code, createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'studySessions', ref.id, 'participants', uid),
      { name: name || 'Host', joinedAt: serverTimestamp(), lastSeen: serverTimestamp() });
    attach(ref.id);
    return { id: ref.id, code };
  }, [uid, name, attach]);

  // ── Join an existing session by 6-char code ──────────────────────────
  const joinByCode = useCallback(async (code) => {
    setError(null);
    const q = query(
      collection(db, 'studySessions'),
      where('code', '==', code.trim().toUpperCase()),
      where('status', 'in', ['lobby', 'active', 'review']),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) { setError('No active session with that code.'); return null; }
    const sessionDoc = snap.docs[0];
    await setDoc(doc(db, 'studySessions', sessionDoc.id, 'participants', uid),
      { name: name || 'Participant', joinedAt: serverTimestamp(), lastSeen: serverTimestamp() });
    attach(sessionDoc.id);
    return { id: sessionDoc.id, ...sessionDoc.data() };
  }, [uid, name, attach]);

  // ── Host starts the exam for everyone ────────────────────────────────
  // questionIds is optional: pass it when the question count/pool draw
  // happens on the Start Exam step (after the lobby), rather than being
  // fixed at session creation.
  const startSession = useCallback(async (questionIds) => {
    if (!session) return;
    await updateDoc(doc(db, 'studySessions', session.id), {
      status: 'active', currentIndex: 0, revealed: false,
      ...(questionIds?.length ? { questionIds } : {}),
    });
  }, [session]);

  // ── Host sets/changes the reading vs quiz mode (lobby only) ───────────
  const setSessionMode = useCallback(async (mode) => {
    if (!session) return;
    await updateDoc(doc(db, 'studySessions', session.id), { mode: mode === 'quiz' ? 'quiz' : 'reading' });
  }, [session]);

  // ── Host returns everyone to the lobby to set up another exam, without
  // ending the session (or the group call, which lives outside this doc
  // entirely — see GroupCallContext) ─────────────────────────────────────
  const backToLobby = useCallback(async () => {
    if (!session) return;
    const respSnap = await getDocs(collection(db, 'studySessions', session.id, 'responses'));
    await Promise.all(respSnap.docs.map(d => deleteDoc(d.ref)));
    await updateDoc(doc(db, 'studySessions', session.id), {
      status: 'lobby', currentIndex: 0, revealed: false,
    });
  }, [session]);

  // ── Host advances/rewinds the shared question index ──────────────────
  // Moving to a new question always resets `revealed` — nobody should see
  // last question's answer bleed into the next one.
  const goToIndex = useCallback(async (index) => {
    if (!session) return;
    const clamped = Math.max(0, Math.min(index, (session.questionIds?.length || 1) - 1));
    await updateDoc(doc(db, 'studySessions', session.id), { currentIndex: clamped, revealed: false });
  }, [session]);

  // ── Host reveals the current question's answer to everyone ───────────
  // In quiz mode this normally happens automatically once every
  // participant has answered (see the effect below), but the host can
  // also force it early for a straggler.
  const revealAnswer = useCallback(async () => {
    if (!session) return;
    await updateDoc(doc(db, 'studySessions', session.id), { revealed: true });
  }, [session]);

  // ── Everyone (quiz mode): lock in a choice for the current question ──
  const submitAnswer = useCallback(async (qIndex, choiceIndex) => {
    if (!session) return;
    await setDoc(doc(db, 'studySessions', session.id, 'responses', `${uid}_${qIndex}`), {
      uid, name: name || 'Participant', qIndex, choiceIndex, ts: serverTimestamp(),
    });
  }, [session, uid, name]);

  // ── Host ends the group exam — everyone flips to the synced review ───
  const finishSession = useCallback(async () => {
    if (!session) return;
    await updateDoc(doc(db, 'studySessions', session.id), { status: 'review' });
  }, [session]);

  // ── Leave / end ───────────────────────────────────────────────────────
  const leaveSession = useCallback(async () => {
    if (!session) return;
    try { await deleteDoc(doc(db, 'studySessions', session.id, 'participants', uid)); } catch {}
    if (isHost) {
      try { await updateDoc(doc(db, 'studySessions', session.id), { status: 'ended' }); } catch {}
    }
    cleanup();
    setSession(null);
    setParticipants([]);
  }, [session, uid, isHost, cleanup]);

  // ── Host ends the group's voice call for every participant, not just
  // themselves. Writes a timestamp everyone's GroupCallBar watches — the
  // exam/study session itself keeps going, only the call drops. ─────────
  const endCallForEveryone = useCallback(async () => {
    if (!session) return;
    await updateDoc(doc(db, 'studySessions', session.id), { callEndedAt: Date.now() });
  }, [session]);

  return {
    session, participants, responses, isHost, error,
    createSession, joinByCode, startSession, goToIndex, leaveSession,
    revealAnswer, submitAnswer, finishSession, setSessionMode, backToLobby,
    endCallForEveryone,
    attachExisting: attach,
  };
}
