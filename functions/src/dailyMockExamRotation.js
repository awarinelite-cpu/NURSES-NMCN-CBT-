// functions/src/dailyMockExamRotation.js
//
// Daily Mock Exam rotation + push notification.
//
// Runs every 24 hours (midnight Africa/Lagos). Builds a fresh 250-question
// pool for the day's Daily Mock Exam:
//
//   • Any question with a pass rate ≤ 49% (and at least one attempt on
//     record) is carried over into today's pool automatically — it keeps
//     repeating, day after day, until enough students get it right to push
//     its pass rate to 50% or above. Once it recovers, it's treated as a
//     normal question again and may or may not be picked in future draws.
//   • The rest of the 250 slots are filled with a fresh random draw from
//     the full active question bank (excluding the carryover questions).
//
// The resulting list is written to dailyMockExam/current, which the app
// reads to build each student's Daily Mock Exam session. An idempotent
// "new exam available" announcement doc is written too (for the in-app
// banner), and a push notification is sent to every saved FCM token so
// students are notified even when the app isn't open.
//
// DEPLOY:
//   cd functions
//   npm install
//   firebase deploy --only functions:rotateDailyMockExam,functions:manuallyRotateDailyMockExam

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const POOL_SIZE  = 250;
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

  // 1. Load every active question (id only needed, but keep doc for safety).
  const questionsSnap = await db.collection('questions').where('active', '==', true).get();
  const allActiveIds  = questionsSnap.docs.map(d => d.id);
  if (allActiveIds.length === 0) {
    console.warn('[dailyMockRotation] No active questions found — skipping rotation.');
    return { ok: false, reason: 'no-active-questions' };
  }

  // 2. Load per-question stats to find low-pass-rate carryovers.
  const statsSnap = await db.collection('questionStats').get();
  const carryoverIds = [];
  statsSnap.forEach(d => {
    const { timesAnswered = 0, timesCorrect = 0 } = d.data() || {};
    if (timesAnswered <= 0) return;
    const passRate = (timesCorrect / timesAnswered) * 100;
    if (passRate <= LOW_PASS_THRESHOLD && allActiveIds.includes(d.id)) {
      carryoverIds.push(d.id);
    }
  });

  // 3. Fill the remaining slots with a fresh random draw, excluding carryovers.
  const carryoverSet = new Set(carryoverIds);
  const freshPool     = shuffle(allActiveIds.filter(id => !carryoverSet.has(id)));
  const remainingSlots = Math.max(0, POOL_SIZE - carryoverIds.length);
  const freshPicks     = freshPool.slice(0, remainingSlots);

  const questionIds = shuffle(carryoverIds.slice(0, POOL_SIZE).concat(freshPicks)).slice(0, POOL_SIZE);

  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);

  // 4. Publish today's pool.
  await db.doc('dailyMockExam/current').set({
    questionIds, date, carryoverCount: carryoverIds.length,
    generatedAt: now, expiresAt,
  });
  await db.doc(`dailyMockExamHistory/${date}`).set({
    questionIds, date, carryoverCount: carryoverIds.length, generatedAt: now,
  });

  // 5. Idempotent in-app announcement (won't duplicate if already posted today).
  const annRef = db.doc(`dailyAnnouncements/cbt-dailymock-${date}`);
  const annSnap = await annRef.get();
  if (!annSnap.exists) {
    await annRef.set({
      title: '🗓️ New Daily Mock Exam is Live!',
      message: `Today's Daily Mock Exam is ready — 250 fresh questions. Pick how many you want to tackle and go for a new score.`,
      type: 'daily_mock_exam',
      link: '/daily-mock-exam',
      date,
      createdAt: now,
    });
  }

  // 6. Push notification to every saved device token.
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
        title: '🗓️ New Daily Mock Exam is Live!',
        body: '250 fresh questions are ready. Pick your count and take today\u2019s mock exam.',
      },
      data: { url: '/daily-mock-exam' },
    };
    // FCM allows up to 500 tokens per multicast call.
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      try {
        const resp = await admin.messaging().sendEachForMulticast({ ...message, tokens: batch });
        pushResult.sent += resp.successCount;
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
        console.error('[dailyMockRotation] Push batch failed:', e.message);
      }
    }
  }

  console.log(`[dailyMockRotation] Rotated for ${date}: ${questionIds.length} questions (${carryoverIds.length} carried over). Push: ${pushResult.sent} sent, ${pushResult.failed} failed.`);
  return { ok: true, date, count: questionIds.length, carryoverCount: carryoverIds.length, push: pushResult };
}

// ── Scheduled trigger: every 24 hours at midnight, Africa/Lagos time ───────
exports.rotateDailyMockExam = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Africa/Lagos')
  .onRun(async () => {
    await runRotation();
    return null;
  });

// ── Manual trigger (admin-only) — handy for testing without waiting 24h ───
exports.manuallyRotateDailyMockExam = functions.https.onCall(async (data, context) => {
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
