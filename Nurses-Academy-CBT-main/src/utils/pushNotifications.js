// src/utils/pushNotifications.js
//
// Real background push notifications (Firebase Cloud Messaging) so students
// are alerted about the new Daily Mock Exam even when the app is closed —
// unlike the older `dailyNotifications.js` helpers, which only fire while
// the app is open in a tab.
//
// IMPORTANT — one-time setup required in the Firebase console:
//   Project Settings → Cloud Messaging → Web configuration → generate a
//   "Web Push certificate" (VAPID key) and paste it below.

import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, getMessagingInstance } from '../firebase/config';

// TODO: replace with your project's actual VAPID key from the Firebase console.
const VAPID_KEY = 'REPLACE_WITH_YOUR_FIREBASE_VAPID_KEY';

export function pushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function pushPermission() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Call this from a user gesture (button tap) — browsers block silent
// permission prompts. Returns { ok, reason } so the caller can show
// appropriate feedback.
export async function enablePushNotifications(uid) {
  if (!uid) return { ok: false, reason: 'no-user' };
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const { getToken } = await import('firebase/messaging');
    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, reason: 'unsupported' };

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, reason: 'no-token' };

    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
    return { ok: true, token };
  } catch (e) {
    console.warn('enablePushNotifications failed:', e.message);
    return { ok: false, reason: 'error', error: e.message };
  }
}
