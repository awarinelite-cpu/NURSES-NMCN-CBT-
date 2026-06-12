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
