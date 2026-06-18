// src/utils/streakReminder.js
//
// "Your streak ends tonight" reminder.
//
// This app has no backend push server (no FCM, no cloud functions), so a true
// reminder that fires while the app is closed isn't possible here. Instead,
// this module drives an in-app banner — and, if the browser Notification
// permission is already granted, a local notification — shown once per day,
// in the evening, only to students who haven't practiced yet today and who
// have an active streak worth protecting.
//
// Firestore is NOT used for this — it's a same-day, same-device check using
// localStorage so we don't nag a student twice in one evening or across tabs.

const DISMISS_KEY_PREFIX = 'streakReminderDismissed_';

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Should we show the "streak ends tonight" reminder right now?
 *
 * Conditions:
 *  - It's evening (after `eveningHour`, local time — default 7pm)
 *  - The student has an active streak of at least 1 day
 *  - The student has NOT practiced today yet
 *  - The student hasn't already dismissed/seen this reminder today
 *
 * @param {{ currentStreak: number, lastPracticeDate: string } | null} streakData
 * @param {number} eveningHour 24-hour clock hour to start nagging (default 19 = 7pm)
 * @returns {boolean}
 */
export function shouldShowStreakReminder(streakData, eveningHour = 19) {
  if (!streakData || !streakData.currentStreak) return false;

  const now = new Date();
  if (now.getHours() < eveningHour) return false;

  const today = todayString();
  if (streakData.lastPracticeDate === today) return false; // already practiced today

  try {
    const dismissedDate = localStorage.getItem(DISMISS_KEY_PREFIX + 'date');
    if (dismissedDate === today) return false; // already shown/dismissed today
  } catch {
    // localStorage unavailable — fall through and show it anyway
  }

  return true;
}

/** Mark today's reminder as seen so we don't show it again until tomorrow. */
export function dismissStreakReminderForToday() {
  try {
    localStorage.setItem(DISMISS_KEY_PREFIX + 'date', todayString());
  } catch {
    // non-fatal
  }
}

/**
 * Fires a local browser notification (only if permission is already granted —
 * never requests permission here, that's handled elsewhere via usePushNotifications).
 * Safe no-op in unsupported environments (Android WebView, in-app browsers, etc).
 */
export function fireStreakReminderNotification(currentStreak) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const ua = navigator.userAgent || '';
    if (/wv\)/.test(ua)) return; // Android WebView — Notification API unreliable
    if (/FBAN|FBAV|Instagram|LinkedInApp/.test(ua)) return;

    new Notification('🔥 Your streak ends tonight!', {
      body: `You're on a ${currentStreak}-day streak. Practice now to keep it alive!`,
      icon: '/logo.png',
      tag: 'streak-reminder', // collapses duplicates instead of stacking
    });
  } catch {
    // Notification creation can throw in some embedded browsers — non-fatal
  }
}
