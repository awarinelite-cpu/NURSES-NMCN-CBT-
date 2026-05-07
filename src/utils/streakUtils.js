// src/utils/streakUtils.js
//
// Streak tracking for Daily Practice.
//
// Firestore path: users/{uid}/streakData  (single doc, not a subcollection)
//
// Doc shape:
//   {
//     currentStreak:  number,   // days in a row (including today if practiced)
//     longestStreak:  number,   // all-time best
//     lastPracticeDate: string, // 'YYYY-MM-DD' in the student's local timezone
//     updatedAt: string,        // ISO timestamp of last write
//   }
//
// Rules:
//   - lastPracticeDate === today  → already counted today, no change
//   - lastPracticeDate === yesterday → currentStreak + 1
//   - anything older (or no doc)   → reset to 1
//   - longestStreak is updated whenever currentStreak exceeds it

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns 'YYYY-MM-DD' in the user's local timezone */
export function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns 'YYYY-MM-DD' for yesterday in local timezone */
function yesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Core update ───────────────────────────────────────────────────────────────

/**
 * Called after a daily practice session completes.
 * Reads the streak doc, computes the new streak, and writes it back.
 *
 * Returns the updated streak object so the caller can show feedback.
 *
 * @param {string} uid
 * @returns {Promise<{ currentStreak: number, longestStreak: number, isNewRecord: boolean }>}
 */
export async function updateStreak(uid) {
  if (!uid) return null;

  const ref  = doc(db, 'users', uid, 'streakData', 'current');
  const snap = await getDoc(ref);

  const today     = todayString();
  const yesterday = yesterdayString();

  let currentStreak = 1;
  let longestStreak = 1;
  let isNewRecord   = false;

  if (snap.exists()) {
    const data = snap.data();
    const last = data.lastPracticeDate || '';

    if (last === today) {
      // Already practiced today — don't double-count, just return current state
      return {
        currentStreak: data.currentStreak,
        longestStreak: data.longestStreak,
        isNewRecord:   false,
        alreadyDoneToday: true,
      };
    } else if (last === yesterday) {
      // Continuing a streak
      currentStreak = (data.currentStreak || 0) + 1;
    } else {
      // Gap — reset
      currentStreak = 1;
    }

    longestStreak = Math.max(data.longestStreak || 0, currentStreak);
    isNewRecord   = currentStreak > (data.longestStreak || 0);
  } else {
    // First ever session
    longestStreak = 1;
    isNewRecord   = true;
  }

  await setDoc(ref, {
    currentStreak,
    longestStreak,
    lastPracticeDate: today,
    updatedAt: new Date().toISOString(),
  });

  return { currentStreak, longestStreak, isNewRecord, alreadyDoneToday: false };
}

// ── Read-only fetch ───────────────────────────────────────────────────────────

/**
 * Reads the current streak without modifying it.
 * Returns null if no streak doc exists yet.
 *
 * @param {string} uid
 * @returns {Promise<{ currentStreak: number, longestStreak: number, lastPracticeDate: string } | null>}
 */
export async function fetchStreak(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'streakData', 'current'));
    if (!snap.exists()) return null;
    return snap.data();
  } catch {
    return null;
  }
}

// ── Display helpers ───────────────────────────────────────────────────────────

/**
 * Returns true if the student has already practiced today.
 */
export function practicedToday(streakData) {
  if (!streakData?.lastPracticeDate) return false;
  return streakData.lastPracticeDate === todayString();
}

/**
 * Returns a human-readable label for the streak flame.
 * e.g. "5-day streak" or "1-day streak"
 */
export function streakLabel(currentStreak) {
  if (!currentStreak || currentStreak < 1) return null;
  return `${currentStreak}-day streak`;
}
