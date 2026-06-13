// src/hooks/useSpacedRepetition.js
//
// Lightweight spaced repetition for the CBT platform.
//
// HOW IT WORKS
// ─────────────
// For each question a student answers, we update a per-user Firestore doc
// (`userProgress/{uid}`) that stores a map: { [questionId]: SRSRecord }
//
// SRSRecord shape:
//   attempts   : number   — total times seen
//   wrong      : number   — total wrong answers
//   lastSeen   : timestamp
//   nextDue    : timestamp — when this question should resurface
//   interval   : days     — current interval between reviews (SM-2 inspired)
//   efactor    : number   — easiness factor (≥1.3, starts at 2.5)
//
// SURFACING
// ─────────
// `getSRSBoost(questionIds, uid)` returns a re-ordered array where
// overdue / weak questions are pushed to the front.
// This is called by DailyPracticePage to reorder the pool before slicing.
//
// RECORDING
// ─────────
// `recordSRSAnswer(uid, questionId, wasCorrect)` updates the SRS record
// using a simplified SM-2 algorithm:
//   - Correct → interval × efactor (capped at 30 days), efactor += 0.1
//   - Wrong   → reset interval to 1 day, efactor -= 0.2 (min 1.3)

import { useState, useCallback } from 'react';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const COLLECTION = 'userProgress';
const MIN_EF     = 1.3;
const MAX_INT    = 30; // days

// ── SM-2 update ───────────────────────────────────────────────────────────────
function computeNextReview(record, wasCorrect) {
  let { interval = 1, efactor = 2.5, attempts = 0, wrong = 0 } = record || {};

  attempts += 1;
  if (!wasCorrect) wrong += 1;

  let newInterval, newEf;

  if (wasCorrect) {
    newInterval = Math.min(Math.round(interval * efactor), MAX_INT);
    newEf       = Math.max(efactor + 0.1, MIN_EF);
  } else {
    newInterval = 1;
    newEf       = Math.max(efactor - 0.2, MIN_EF);
  }

  const now     = Date.now();
  const nextDue = now + newInterval * 86400000;

  return { interval: newInterval, efactor: newEf, attempts, wrong, lastSeen: now, nextDue };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Record a student's answer for spaced repetition.
 * Call this from ExamSession after each answer is submitted (or on session complete).
 *
 * @param {string} uid          Firebase user uid
 * @param {string} questionId   Firestore question doc ID
 * @param {boolean} wasCorrect
 */
export async function recordSRSAnswer(uid, questionId, wasCorrect) {
  if (!uid || !questionId) return;
  try {
    const ref  = doc(db, COLLECTION, uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const prev = data[questionId] || {};
    const next = computeNextReview(prev, wasCorrect);

    // Use a safe key (replace / with __)
    const safeKey = questionId.replace(/\//g, '__');
    const update  = { [safeKey]: next, updatedAt: serverTimestamp() };

    if (snap.exists()) {
      await updateDoc(ref, update);
    } else {
      await setDoc(ref, update);
    }
  } catch (e) {
    // Non-critical — don't break the exam
    console.warn('SRS record failed (non-critical):', e.message);
  }
}

/**
 * Reorder a list of question IDs so that overdue / weak questions come first.
 *
 * @param {string[]} questionIds
 * @param {string}   uid
 * @returns {Promise<string[]>} reordered IDs
 */
export async function getSRSBoost(questionIds, uid) {
  if (!uid || !questionIds?.length) return questionIds;
  try {
    const ref  = doc(db, COLLECTION, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return questionIds;

    const data = snap.data();
    const now  = Date.now();

    // Score each question: higher = resurface sooner
    const scored = questionIds.map(id => {
      const safeKey = id.replace(/\//g, '__');
      const r       = data[safeKey];
      if (!r) return { id, score: 0 };  // never seen — normal priority

      const overdueDays = Math.max(0, (now - (r.nextDue || now)) / 86400000);
      const failRate    = r.attempts > 0 ? r.wrong / r.attempts : 0;
      // Score: overdueMax(10) + failRate * 10 → range 0–20
      const score = Math.min(overdueDays, 10) + failRate * 10;
      return { id, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.id);
  } catch (e) {
    console.warn('SRS boost failed (non-critical):', e.message);
    return questionIds;
  }
}

/**
 * React hook — returns `recordAnswer` for use inside exam components.
 * Wraps recordSRSAnswer so components don't import the async function directly.
 */
export function useSpacedRepetition(uid) {
  const [pending, setPending] = useState(false);

  const recordAnswer = useCallback(async (questionId, wasCorrect) => {
    if (!uid) return;
    setPending(true);
    await recordSRSAnswer(uid, questionId, wasCorrect);
    setPending(false);
  }, [uid]);

  return { recordAnswer, pending };
}
