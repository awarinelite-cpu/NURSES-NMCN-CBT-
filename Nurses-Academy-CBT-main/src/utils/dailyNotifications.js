// src/utils/dailyNotifications.js
// Idempotent "new exam available" announcements.
//
// Each notification is stored under a deterministic date-based document ID
// (e.g. "cbt-daily-2026-06-12") so it is only ever created once per day —
// no matter who or what triggers it first. Everything is read-only after
// creation; clients only ever check "does today's doc exist?" before writing.

import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function ensureDailyAnnouncement({ idPrefix, title, message, type, link, date }) {
  const key = date || todayKey();
  const ref = doc(db, 'dailyAnnouncements', `${idPrefix}-${key}`);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    await setDoc(ref, {
      title, message, type, link,
      date: key,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal — if this fails the notification simply won't appear today
  }
}

// ── NMCN CBT — Daily Practice ───────────────────────────────────────────────
export function ensureCbtDailyMockNotification() {
  return ensureDailyAnnouncement({
    idPrefix: 'cbt-daily',
    title: '📅 New Daily Practice Set Ready!',
    message: "Today's fresh set of practice questions is now available. Tap to start practising.",
    type: 'cbt_daily_mock',
    link: '/daily-practice',
  });
}

// ── Entrance Exam — Daily Mock ──────────────────────────────────────────────
export function ensureEntranceDailyMockNotification(date) {
  return ensureDailyAnnouncement({
    idPrefix: 'entrance-daily',
    title: '🗓️ New Entrance Exam Daily Mock Ready!',
    message: "Today's Entrance Exam Daily Mock has been published. Tap to take it now.",
    type: 'entrance_daily_mock',
    link: '/entrance-exam/daily-mock',
    date,
  });
}

// ── Browser push notification for new daily mock ─────────────────────────────
//
// Shows a native browser notification once per day if:
//   1. The user has granted notification permission
//   2. They haven't already seen today's push (tracked in localStorage)
//
// Call `maybePushDailyMockNotification()` from the dashboard on mount.

const PUSH_STORAGE_KEY = 'nmcn_last_push_date';

export function maybePushDailyMockNotification() {
  try {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const today = todayKey();
    const lastPush = localStorage.getItem(PUSH_STORAGE_KEY);
    if (lastPush === today) return; // already sent today

    // Send the push
    const notif = new Notification("📅 Today's Practice Set is Ready!", {
      body: "Fresh questions for today are available. Tap to start your daily practice now.",
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: `nmcn-daily-${today}`,   // prevents duplicates across tabs
      renotify: false,
      data: { url: '/daily-practice' },
    });

    notif.onclick = () => {
      window.focus();
      window.location.href = notif.data?.url || '/daily-practice';
      notif.close();
    };

    localStorage.setItem(PUSH_STORAGE_KEY, today);
  } catch (e) {
    // Never crash the app for a notification
    console.warn('Push notification failed (non-critical):', e.message);
  }
}

// ── Entrance Exam daily mock push ─────────────────────────────────────────────
const ENTRANCE_PUSH_KEY = 'nmcn_entrance_last_push_date';

export function maybePushEntranceDailyMockNotification() {
  try {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const today = todayKey();
    if (localStorage.getItem(ENTRANCE_PUSH_KEY) === today) return;

    const notif = new Notification("🗓️ New Entrance Exam Daily Mock!", {
      body: "Today's entrance exam mock is live. Tap to take it now.",
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: `entrance-daily-${today}`,
      renotify: false,
      data: { url: '/entrance-exam/daily-mock' },
    });

    notif.onclick = () => {
      window.focus();
      window.location.href = notif.data?.url || '/entrance-exam/daily-mock';
      notif.close();
    };

    localStorage.setItem(ENTRANCE_PUSH_KEY, today);
  } catch (e) {
    console.warn('Entrance push notification failed (non-critical):', e.message);
  }
}
