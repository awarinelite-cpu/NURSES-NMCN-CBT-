// src/hooks/useFreeTrialGate.js
//
// PURPOSE
// -------
// Free (unsubscribed) users get ONE free trial per exam mode with a hard cap
// of 10 questions. Subscribed users are never affected.
//
// USAGE (inside any exam page that starts a session)
// --------------------------------------------------
//   import { useFreeTrialGate } from '../../hooks/useFreeTrialGate';
//
//   const { isSubscribed, trialUsed, trialAvailable, markTrialUsed, FREE_TRIAL_COUNT } =
//     useFreeTrialGate('course_drill');        // pass the examType string
//
//   // In your UI — show a locked banner if !isSubscribed && trialUsed
//   // In handleTakeNew — cap count: Math.min(count, FREE_TRIAL_COUNT) if !isSubscribed
//   // After navigate to /exam/session — call markTrialUsed() (or on session start)
//
// EXAM MODE KEYS (use these exact strings as the `examMode` argument)
// -------------------------------------------------------------------
//   'course_drill'   | 'topic_drill'   | 'mock_exam'
//   'daily_practice' | 'past_questions'| 'quick_actions'
//   'exam_setup'     (the generic ExamSetup / ExamListPage flow)
//
// FIRESTORE SCHEMA
// ----------------
//   users/{uid}.freeTrialUsed: {
//     course_drill:   true,
//     topic_drill:    true,
//     ...
//   }
//
// The field is merged-written so no other profile fields are touched.

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

export const FREE_TRIAL_COUNT = 10; // questions allowed per free trial

export function useFreeTrialGate(examMode) {
  const { user, profile } = useAuth();

  // ── Is this user currently subscribed? ──────────────────────────────────────
  const isSubscribed = (() => {
    if (!profile) return false;
    const now    = new Date();
    const expiry = profile.subscriptionExpiry
      ? new Date(profile.subscriptionExpiry)
      : null;
    return (
      (profile.subscribed === true || profile.accessLevel === 'full') &&
      expiry !== null &&
      expiry > now
    );
  })();

  // ── Local trial state (avoid extra reads after first check) ─────────────────
  const [trialUsed,    setTrialUsed]    = useState(false);
  const [checkingTrial, setCheckingTrial] = useState(true);

  useEffect(() => {
    // Subscribed users never need this check
    if (isSubscribed) { setCheckingTrial(false); return; }
    if (!user?.uid || !examMode) { setCheckingTrial(false); return; }

    // Check Firestore for this mode's trial flag
    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        const data  = snap.data() || {};
        const used  = data.freeTrialUsed || {};
        setTrialUsed(used[examMode] === true);
      })
      .catch(() => {
        // On error, default to not blocking (fail open)
        setTrialUsed(false);
      })
      .finally(() => setCheckingTrial(false));
  }, [user?.uid, examMode, isSubscribed]);

  // ── Mark this mode's trial as used in Firestore ─────────────────────────────
  const markTrialUsed = useCallback(async () => {
    if (isSubscribed || !user?.uid || !examMode) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`freeTrialUsed.${examMode}`]: true,
      });
      setTrialUsed(true);
    } catch (e) {
      console.warn('useFreeTrialGate: could not mark trial used', e);
    }
  }, [isSubscribed, user?.uid, examMode]);

  return {
    isSubscribed,
    trialUsed,
    trialAvailable: !isSubscribed && !trialUsed,
    checkingTrial,
    markTrialUsed,
    FREE_TRIAL_COUNT,
  };
}
