// src/utils/notesUtils.js
//
// Personal notes on questions. One note per (user, question) pair —
// unlike bookmarks, which are a simple boolean, a note carries free text
// the student writes themselves (e.g. "Remember: Digoxin toxicity causes
// bradycardia").
//
// Firestore collection: 'questionNotes'
// Doc shape: { userId, questionId, category, text, updatedAt }
//
// Deliberately mirrors the bookmark pattern in ExamSession.jsx /
// BookmarksPage.jsx so the two features stay consistent for future
// maintenance.

import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Fetch all notes for a user as a Map keyed by questionId → note text.
 * Used by ExamSession to know which questions already have a note.
 */
export async function fetchNotesMap(uid) {
  if (!uid) return new Map();
  try {
    const snap = await getDocs(query(
      collection(db, 'questionNotes'),
      where('userId', '==', uid),
    ));
    const map = new Map();
    snap.docs.forEach(d => {
      const data = d.data();
      map.set(data.questionId, { id: d.id, text: data.text || '' });
    });
    return map;
  } catch (e) {
    console.warn('fetchNotesMap failed (non-fatal):', e.message);
    return new Map();
  }
}

/**
 * Fetch all of a user's notes, enriched isn't done here (caller joins with
 * question data, same pattern as BookmarksPage).
 */
export async function fetchAllNotes(uid) {
  if (!uid) return [];
  const snap = await getDocs(query(
    collection(db, 'questionNotes'),
    where('userId', '==', uid),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Save (create or update) a note for a question. Empty/whitespace-only
 * text deletes the note instead of saving a blank one.
 *
 * Uses a deterministic doc ID (`${uid}_${questionId}`) so save is a single
 * setDoc rather than a query-then-write — avoids duplicate notes and races.
 */
export async function saveNote(uid, questionId, category, text) {
  if (!uid || !questionId) return;
  const trimmed = (text || '').trim();
  const ref = doc(db, 'questionNotes', `${uid}_${questionId}`);

  if (!trimmed) {
    await deleteDoc(ref).catch(() => {});
    return null;
  }

  await setDoc(ref, {
    userId: uid,
    questionId,
    category: category || null,
    text: trimmed,
    updatedAt: serverTimestamp(),
  });
  return trimmed;
}

export async function deleteNote(uid, questionId) {
  if (!uid || !questionId) return;
  await deleteDoc(doc(db, 'questionNotes', `${uid}_${questionId}`)).catch(() => {});
}
