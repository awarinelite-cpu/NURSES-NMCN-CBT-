// functions/src/phnDailyMockRotation.js
//
// Rotates ONLY the Public Health Nursing Daily Mock pool.
//
// Unlike manuallyRotateDailyMockExam, this does not touch any other specialty
// and does NOT send push notifications or announcements, so an admin can run
// it as often as needed while loading or fixing the PHN question bank.
//
// Draws only from the dedicated `phnDailyMockQuestions` collection and writes
// dailyMockExam/public_health (plus its history doc and the _index entry).
//
// DEPLOY:
//   firebase deploy --only functions:manuallyRotatePhnDailyMock

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CATEGORY           = 'public_health';
const BANK               = 'phnDailyMockQuestions';
const POOL_SIZE          = 250;
const LOW_PASS_THRESHOLD = 49; // pass rate (%) at or below this => must repeat

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

async function rotatePhnPool() {
  const date = todayKey();

  const bankSnap = await db.collection(BANK).where('active', '==', true).get();
  if (bankSnap.empty) {
    // Nothing to serve: clear any stale pool and drop PHN from the index.
    await db.doc(`dailyMockExam/${CATEGORY}`).delete().catch(() => {});
    return { ok: false, reason: 'phn-bank-empty', bankActive: 0 };
  }
  const allIds = bankSnap.docs.map(d => d.id);

  // Low-pass-rate questions stay in the pool until students recover on them.
  const statsSnap = await db.collection('questionStats').get();
  const statsById = {};
  statsSnap.forEach(d => { statsById[d.id] = d.data() || {}; });

  const carryoverIds = allIds.filter(id => {
    const { timesAnswered = 0, timesCorrect = 0 } = statsById[id] || {};
    if (timesAnswered <= 0) return false;
    return (timesCorrect / timesAnswered) * 100 <= LOW_PASS_THRESHOLD;
  });
  const carrySet   = new Set(carryoverIds);
  const freshPicks = shuffle(allIds.filter(id => !carrySet.has(id)))
    .slice(0, Math.max(0, POOL_SIZE - carryoverIds.length));
  const questionIds = shuffle(carryoverIds.slice(0, POOL_SIZE).concat(freshPicks)).slice(0, POOL_SIZE);

  const now       = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);

  await db.doc(`dailyMockExam/${CATEGORY}`).set({
    category: CATEGORY, questionIds, date,
    carryoverCount: carryoverIds.length,
    totalActive: allIds.length,
    source: BANK,
    generatedAt: now, expiresAt,
  });
  await db.doc(`dailyMockExamHistory/${CATEGORY}_${date}`).set({
    category: CATEGORY, questionIds, date, carryoverCount: carryoverIds.length, generatedAt: now,
  });

  // Keep the student picker's live counts in sync, leaving other specialties alone.
  await db.doc('dailyMockExam/_index').set({
    date,
    categories: admin.firestore.FieldValue.arrayUnion(CATEGORY),
    perCategory: { [CATEGORY]: { count: questionIds.length, carryoverCount: carryoverIds.length } },
    generatedAt: now,
  }, { merge: true });

  return {
    ok: true, date, bank: BANK,
    bankActive: allIds.length, count: questionIds.length,
    carryoverCount: carryoverIds.length,
  };
}

exports.manuallyRotatePhnDailyMock = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const callerSnap = await db.doc(`users/${context.auth.uid}`).get();
  const role = callerSnap.data()?.role;
  if (role !== 'admin' && role !== 'subadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin only.');
  }
  return rotatePhnPool();
});
