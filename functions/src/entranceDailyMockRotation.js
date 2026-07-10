// functions/src/entranceDailyMockRotation.js
//
// Entrance Exam — Daily Mock rotation + push notification.
// Mirrors dailyMockExamRotation.js (NMCN CBT), scoped to the Entrance Exam
// question bank.
//
// Runs every 24 hours (midnight Africa/Lagos). Builds a fresh 100-question
// set for the day's Entrance Exam Daily Mock:
//
//   • Any bank question with a pass rate ≤ 49% (and at least one attempt on
//     record, tracked in entranceQuestionStats) is carried over into today's
//     set automatically — it keeps repeating, day after day, until enough
//     students get it right to push its pass rate to 50% or above. Once it
//     recovers, it's treated as a normal question again and may or may not
//     be picked in future draws.
//   • The rest of the 100 slots are filled with a fresh random draw from the
//     Daily Mock bank (entranceExamQuestions where inDailyBank == true and
//     active == true), excluding both the carryover questions and every
//     question already used in a previous day's set — so students never see
//     a repeat until the whole bank has been cycled through.
//
// The result is written to dailyMockSchedule/{YYYY-MM-DD} — the exact
// collection/doc shape the app already reads (EntranceExamHub.jsx,
// EntranceExamDailyMockHub.jsx, and the admin DailyMockSchedule panel), so
// no client changes are needed. An idempotent "new mock available"
// announcement doc is written too (dailyAnnouncements/entrance-daily-{date},
// matching dailyNotifications.js), and a push notification is sent to every
// saved FCM token so students are alerted even when the app isn't open.
//
// DEPLOY:
//   cd functions
//   npm install
//   firebase deploy --only functions:rotateEntranceDailyMock,functions:manuallyRotateEntranceDailyMock

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const POOL_SIZE          = 100;
const LOW_PASS_THRESHOLD = 49; // pass rate (%) at or below this ⇒ must repeat

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Core rotation logic, shared by the scheduled + manual triggers ─────────
async function runRotation() {
  const date = todayKey();

  // 0. Idempotency guard — if today's mock is already published, don't
  //    regenerate it (e.g. manual trigger fired after the schedule already ran).
  const existing = await db.doc(`dailyMockSchedule/${date}`).get();
  if (existing.exists) {
    console.log(`[entranceDailyMockRotation] ${date} already published — skipping.`);
    return { ok: true, alreadyPublished: true, date };
  }

  // 1. Load the Daily Mock bank (admin-curated subset of the question bank).
  const bankSnap = await db.collection('entranceExamQuestions')
    .where('inDailyBank', '==', true)
    .where('active', '==', true)
    .get();
  const bankIds = bankSnap.docs.map(d => d.id);
  if (bankIds.length === 0) {
    console.warn('[entranceDailyMockRotation] Daily Mock bank is empty — skipping rotation.');
    return { ok: false, reason: 'empty-bank' };
  }

  // 2. Load per-question stats to find low-pass-rate carryovers.
  const statsSnap = await db.collection('entranceQuestionStats').get();
  const carryoverIds = [];
  statsSnap.forEach(d => {
    const { timesAnswered = 0, timesCorrect = 0 } = d.data() || {};
    if (timesAnswered <= 0) return;
    const passRate = (timesCorrect / timesAnswered) * 100;
    if (passRate <= LOW_PASS_THRESHOLD && bankIds.includes(d.id)) {
      carryoverIds.push(d.id);
    }
  });

  // 3. Work out which bank questions have never been used yet, so a fresh
  //    day always prefers questions the student hasn't seen before.
  const historySnap = await db.collection('dailyMockSchedule').get();
  const usedIds = new Set();
  historySnap.forEach(d => (d.data()?.questionIds || []).forEach(id => usedIds.add(id)));

  const carryoverSet = new Set(carryoverIds);
  let freshCandidates = bankIds.filter(id => !carryoverSet.has(id) && !usedIds.has(id));
  let cycleReset = false;

  // 4. If the unused pool can't fill the remaining slots, the bank has been
  //    fully cycled — reset and draw from the whole bank again (still
  //    excluding today's carryovers so they aren't double-counted).
  const remainingSlots = Math.max(0, POOL_SIZE - carryoverIds.length);
  if (freshCandidates.length < remainingSlots) {
    cycleReset = true;
    freshCandidates = bankIds.filter(id => !carryoverSet.has(id));
  }

  const freshPicks  = shuffle(freshCandidates).slice(0, remainingSlots);
  const questionIds = shuffle(carryoverIds.slice(0, POOL_SIZE).concat(freshPicks)).slice(0, POOL_SIZE);

  const now = admin.firestore.Timestamp.now();

  // 5. Publish today's set — same doc shape the admin manual-publish flow
  //    and the student-facing hub already use.
  await db.doc(`dailyMockSchedule/${date}`).set({
    date, questionIds, questionCount: questionIds.length,
    publishedAt: now, passRate: null, attemptCount: 0,
    carryoverCount: carryoverIds.length, isReset: cycleReset,
    source: 'auto',
  });

  // 6. Idempotent in-app announcement (won't duplicate if already posted today).
  const annRef = db.doc(`dailyAnnouncements/entrance-daily-${date}`);
  const annSnap = await annRef.get();
  if (!annSnap.exists) {
    await annRef.set({
      title: '🗓️ New Entrance Exam Daily Mock Ready!',
      message: `Today's Entrance Exam Daily Mock is live — ${questionIds.length} fresh questions. Tap to take it now.`,
      type: 'entrance_daily_mock',
      link: '/entrance-exam/daily-mock',
      date,
      createdAt: now,
    });
  }

  // 7. Push notification to every saved device token.
  const usersSnap = await db.collection('users').get();
  const tokens = [];
  usersSnap.forEach(u => {
    const t = u.data()?.fcmTokens;
    if (Array.isArray(t) && t.length > 0) tokens.push(...t);
  });

  let pushResult = { sent: 0, failed: 0 };
  if (tokens.length > 0) {
    const message = {
      notification: {
        title: '🗓️ New Entrance Exam Daily Mock!',
        body: `Today's ${questionIds.length}-question mock is ready. Tap to take it now.`,
      },
      data: { url: '/entrance-exam/daily-mock' },
    };
    // FCM allows up to 500 tokens per multicast call.
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      try {
        const resp = await admin.messaging().sendEachForMulticast({ ...message, tokens: batch });
        pushResult.sent   += resp.successCount;
        pushResult.failed += resp.failureCount;

        // Clean up dead tokens so the array doesn't grow forever.
        const deadTokens = [];
        resp.responses.forEach((r, idx) => {
          if (!r.success && (r.error?.code === 'messaging/registration-token-not-registered' || r.error?.code === 'messaging/invalid-registration-token')) {
            deadTokens.push(batch[idx]);
          }
        });
        if (deadTokens.length > 0) {
          const dead = new Set(deadTokens);
          const writes = [];
          usersSnap.forEach(u => {
            const t = u.data()?.fcmTokens || [];
            const stillGood = t.filter(tok => !dead.has(tok));
            if (stillGood.length !== t.length) {
              writes.push(u.ref.update({ fcmTokens: stillGood }));
            }
          });
          await Promise.all(writes);
        }
      } catch (e) {
        console.error('[entranceDailyMockRotation] Push batch failed:', e.message);
      }
    }
  }

  console.log(`[entranceDailyMockRotation] Rotated for ${date}: ${questionIds.length} questions (${carryoverIds.length} carried over, cycleReset=${cycleReset}). Push: ${pushResult.sent} sent, ${pushResult.failed} failed.`);
  return { ok: true, date, count: questionIds.length, carryoverCount: carryoverIds.length, cycleReset, push: pushResult };
}

// ── Scheduled trigger: every 24 hours at midnight, Africa/Lagos time ───────
exports.rotateEntranceDailyMock = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Africa/Lagos')
  .onRun(async () => {
    await runRotation();
    return null;
  });

// ── Manual trigger (admin-only) — handy for testing without waiting 24h ───
exports.manuallyRotateEntranceDailyMock = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const callerSnap = await db.doc(`users/${context.auth.uid}`).get();
  const role = callerSnap.data()?.role;
  if (role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin only.');
  }
  return runRotation();
});
