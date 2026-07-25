// functions/src/dailyMockExamRotation.js
//
// Daily Mock Exam rotation + push notification.
//
// Runs every 24 hours (midnight Africa/Lagos). Builds a fresh, SPECIALTY-
// SEPARATED question pool for the day's Daily Mock Exam: every active
// question's `category` field (the same specialty id used across Past
// Questions / Topic Drill / etc.) determines which specialty's pool it can
// be drawn into. Each specialty gets its own pool of up to 250 questions:
//
//   • Any question with a pass rate ≤ 49% (and at least one attempt on
//     record) is carried over into today's pool for its specialty
//     automatically — it keeps repeating, day after day, until enough
//     students get it right to push its pass rate to 50% or above. Once it
//     recovers, it's treated as a normal question again and may or may not
//     be picked in future draws.
//   • The rest of that specialty's slots are filled with a fresh random
//     draw from that specialty's active question bank (excluding the
//     carryover questions).
//
// Each specialty's pool is written to dailyMockExam/{categoryId}, which the
// app reads (after the student picks a specialty) to build their Daily Mock
// Exam session. dailyMockExam/_index lists every specialty that has a pool
// today, so the student picker can show live counts without querying every
// specialty individually. An idempotent "new exam available" announcement
// doc is written too (for the in-app banner), and a push notification is
// sent to every saved FCM token so students are notified even when the app
// isn't open.
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

  // 1. Load every active question and group its id by specialty (`category`).
  const questionsSnap = await db.collection('questions').where('active', '==', true).get();
  if (questionsSnap.empty) {
    console.warn('[dailyMockRotation] No active questions found — skipping rotation.');
    return { ok: false, reason: 'no-active-questions' };
  }
  const idsByCategory = {};
  questionsSnap.forEach(d => {
    const cat = d.data()?.category || 'uncategorized';
    (idsByCategory[cat] = idsByCategory[cat] || []).push(d.id);
  });

  // 2. Load per-question stats once to find low-pass-rate carryovers.
  const statsSnap = await db.collection('questionStats').get();
  const statsById = {};
  statsSnap.forEach(d => { statsById[d.id] = d.data() || {}; });

  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);

  // 3. Build one pool per specialty, drawing only from that specialty's
  //    active question bank so pools never mix categories.
  const perCategory = {};
  for (const [category, allIds] of Object.entries(idsByCategory)) {
    const carryoverIds = allIds.filter(id => {
      const { timesAnswered = 0, timesCorrect = 0 } = statsById[id] || {};
      if (timesAnswered <= 0) return false;
      return (timesCorrect / timesAnswered) * 100 <= LOW_PASS_THRESHOLD;
    });
    const carryoverSet = new Set(carryoverIds);
    const freshPool      = shuffle(allIds.filter(id => !carryoverSet.has(id)));
    const remainingSlots = Math.max(0, POOL_SIZE - carryoverIds.length);
    const freshPicks      = freshPool.slice(0, remainingSlots);

    const questionIds = shuffle(carryoverIds.slice(0, POOL_SIZE).concat(freshPicks)).slice(0, POOL_SIZE);

    await db.doc(`dailyMockExam/${category}`).set({
      category, questionIds, date,
      carryoverCount: carryoverIds.length,
      totalActive: allIds.length,
      generatedAt: now, expiresAt,
    });
    await db.doc(`dailyMockExamHistory/${category}_${date}`).set({
      category, questionIds, date, carryoverCount: carryoverIds.length, generatedAt: now,
    });
    perCategory[category] = { count: questionIds.length, carryoverCount: carryoverIds.length };
  }

  // 4. Index doc listing every specialty with a pool today — lets the
  //    student picker show live counts without querying each one.
  await db.doc('dailyMockExam/_index').set({
    date, categories: Object.keys(perCategory), perCategory, generatedAt: now,
  });

  const totalQuestionCount = Object.values(perCategory).reduce((a, c) => a + c.count, 0);
  const totalCarryover     = Object.values(perCategory).reduce((a, c) => a + c.carryoverCount, 0);

  // 5. Idempotent in-app announcement (won't duplicate if already posted today).
  const annRef = db.doc(`dailyAnnouncements/cbt-dailymock-${date}`);
  const annSnap = await annRef.get();
  if (!annSnap.exists) {
    await annRef.set({
      title: '🗓️ New Daily Mock Exam is Live!',
      message: `Today's Daily Mock Exam is ready across every specialty — pick yours, choose how many questions you want to tackle, and go for a new score.`,
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
        body: 'Fresh questions are ready in every specialty. Pick yours and take today\u2019s mock exam.',
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

  console.log(`[dailyMockRotation] Rotated for ${date}: ${Object.keys(perCategory).length} specialties, ${totalQuestionCount} total questions (${totalCarryover} carried over). Push: ${pushResult.sent} sent, ${pushResult.failed} failed.`);
  return { ok: true, date, categories: Object.keys(perCategory), perCategory, count: totalQuestionCount, carryoverCount: totalCarryover, push: pushResult };
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
