// src/utils/dailyMockRotation.js
//
// Client-side Daily Mock Exam rotation.
//
// The midnight Cloud Function (rotateDailyMockExam) is the "ideal" trigger,
// but it can silently stop running (failed deploy, billing, runtime issues).
// This module lets the app rotate the pools itself: the first signed-in user
// to open the app after the Lagos-midnight boundary rebuilds the pools, and
// everyone after that just reads them.
//
// It mirrors the Cloud Function logic exactly:
//   - one pool per specialty (`category`), up to 250 questions
//   - Public Health Nursing draws only from `phnDailyMockQuestions`
//   - questions with pass rate <= 49% (and >= 1 attempt) are carried over
//   - writes dailyMockExam/{category}, dailyMockExam/_index and history docs
//
// Safety: a lock doc (dailyMockExam/_rotationLock) is taken inside a
// transaction so two students opening the app at once do not both rotate.
// Firestore rules only let a non-admin replace a pool that has expired.

import {
  collection, query, where, getDocs, getDoc, doc,
  runTransaction, writeBatch, setDoc, Timestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const POOL_SIZE          = 250;
const LOW_PASS_THRESHOLD = 49;
const PHN_CATEGORY       = 'public_health';
const PHN_COLLECTION     = 'phnDailyMockQuestions';
const LAGOS_OFFSET_MS    = 60 * 60 * 1000; // Africa/Lagos is UTC+1, no DST
const DAY_MS             = 24 * 60 * 60 * 1000;
const LOCK_MS            = 2 * 60 * 1000;
const BATCH_LIMIT        = 400;

// ── Lagos-time helpers ────────────────────────────────────────────────────
export function lagosDateKey(nowMs = Date.now()) {
  return new Date(nowMs + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}
// UTC ms of 00:00 Lagos time for the day containing nowMs.
export function lagosDayStartMs(nowMs = Date.now()) {
  return Math.floor((nowMs + LAGOS_OFFSET_MS) / DAY_MS) * DAY_MS - LAGOS_OFFSET_MS;
}
export function nextLagosMidnightMs(nowMs = Date.now()) {
  return lagosDayStartMs(nowMs) + DAY_MS;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildPool(allIds, statsById) {
  const carryoverIds = allIds.filter(id => {
    const { timesAnswered = 0, timesCorrect = 0 } = statsById[id] || {};
    if (timesAnswered <= 0) return false;
    return (timesCorrect / timesAnswered) * 100 <= LOW_PASS_THRESHOLD;
  });
  const carrySet   = new Set(carryoverIds);
  const freshPicks = shuffle(allIds.filter(id => !carrySet.has(id)))
    .slice(0, Math.max(0, POOL_SIZE - carryoverIds.length));
  const questionIds = shuffle(carryoverIds.slice(0, POOL_SIZE).concat(freshPicks)).slice(0, POOL_SIZE);
  return { questionIds, carryoverIds };
}

async function loadStats() {
  const snap = await getDocs(collection(db, 'questionStats'));
  const byId = {};
  snap.forEach(d => { byId[d.id] = d.data() || {}; });
  return byId;
}

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT).forEach(fn => fn(batch));
    await batch.commit();
  }
}

// ── Freshness check (cheap: one doc read) ─────────────────────────────────
export async function arePoolsFresh() {
  const snap = await getDoc(doc(db, 'dailyMockExam', '_index'));
  if (!snap.exists()) return false;
  const gen = snap.data()?.generatedAt;
  const ms  = gen?.toMillis ? gen.toMillis() : 0;
  return ms >= lagosDayStartMs();
}

// ── Lock: returns true if THIS client should perform the rotation ─────────
async function acquireLock(uid, { force }) {
  const lockRef  = doc(db, 'dailyMockExam', '_rotationLock');
  const indexRef = doc(db, 'dailyMockExam', '_index');
  return runTransaction(db, async tx => {
    const now = Date.now();
    const lock = await tx.get(lockRef);
    if (lock.exists() && (lock.data()?.lockedUntil || 0) > now) return false;
    if (!force) {
      const idx = await tx.get(indexRef);
      const ms  = idx.exists() ? (idx.data()?.generatedAt?.toMillis?.() || 0) : 0;
      if (ms >= lagosDayStartMs(now)) return false; // someone already rotated
    }
    tx.set(lockRef, { lockedUntil: now + LOCK_MS, by: uid || 'unknown' });
    return true;
  });
}
async function releaseLock() {
  try {
    await setDoc(doc(db, 'dailyMockExam', '_rotationLock'), { lockedUntil: 0 });
  } catch { /* lock expires on its own after 2 minutes */ }
}

// ── Full rotation (every specialty) ───────────────────────────────────────
// `asAdmin` true: rebuild every specialty and write history (admin rules).
// `asAdmin` false (student auto-rotation): only replace pools that have
// expired, and skip history, because that is all the Firestore rules allow.
async function rotateAllPools(uid, { asAdmin = false } = {}) {
  const nowMs = Date.now();
  const date  = lagosDateKey(nowMs);

  const questionsSnap = await getDocs(query(collection(db, 'questions'), where('active', '==', true)));
  const idsByCategory = {};
  questionsSnap.forEach(d => {
    const cat = d.data()?.category || 'uncategorized';
    (idsByCategory[cat] = idsByCategory[cat] || []).push(d.id);
  });

  // PHN never draws from the shared bank.
  delete idsByCategory[PHN_CATEGORY];
  const phnSnap = await getDocs(query(collection(db, PHN_COLLECTION), where('active', '==', true)));
  const phnEmpty = phnSnap.empty;
  if (!phnEmpty) idsByCategory[PHN_CATEGORY] = phnSnap.docs.map(d => d.id);

  if (!Object.keys(idsByCategory).length) {
    return { ok: false, reason: 'no-active-questions' };
  }

  const statsById = await loadStats();
  const now       = Timestamp.fromMillis(nowMs);
  const expiresAt = Timestamp.fromMillis(nextLagosMidnightMs(nowMs));

  // Non-admins may only overwrite an expired pool (an admin may already have
  // rebuilt one of them today, e.g. PHN). Keep those and rebuild the rest.
  const keepExisting = new Set();
  if (!asAdmin) {
    await Promise.all(Object.keys(idsByCategory).map(async category => {
      try {
        const snap = await getDoc(doc(db, 'dailyMockExam', category));
        const exp  = snap.exists() ? (snap.data()?.expiresAt?.toMillis?.() || 0) : 0;
        if (snap.exists() && exp > nowMs) keepExisting.add(category);
      } catch { /* treat as expired */ }
    }));
  }

  const ops = [];
  const perCategory = {};
  for (const [category, allIds] of Object.entries(idsByCategory)) {
    if (keepExisting.has(category)) {
      // Count what is already live so the _index stays accurate.
      try {
        const snap = await getDoc(doc(db, 'dailyMockExam', category));
        perCategory[category] = {
          count: snap.data()?.questionIds?.length || 0,
          carryoverCount: snap.data()?.carryoverCount || 0,
        };
      } catch { /* skip */ }
      continue;
    }
    const { questionIds, carryoverIds } = buildPool(allIds, statsById);
    ops.push(b => b.set(doc(db, 'dailyMockExam', category), {
      category, questionIds, date,
      carryoverCount: carryoverIds.length,
      totalActive: allIds.length,
      generatedAt: now, expiresAt,
    }));
    if (asAdmin) {
      ops.push(b => b.set(doc(db, 'dailyMockExamHistory', `${category}_${date}`), {
        category, questionIds, date, carryoverCount: carryoverIds.length, generatedAt: now,
      }));
    }
    perCategory[category] = { count: questionIds.length, carryoverCount: carryoverIds.length };
  }
  if (phnEmpty && asAdmin) {
    // No PHN questions: drop any stale PHN pool instead of serving old data.
    ops.push(b => b.delete(doc(db, 'dailyMockExam', PHN_CATEGORY)));
  }
  // _index goes last so students only see "fresh" once the pools exist.
  ops.push(b => b.set(doc(db, 'dailyMockExam', '_index'), {
    date, categories: Object.keys(perCategory), perCategory,
    generatedAt: now, expiresAt,
  }));
  await commitInChunks(ops);

  // In-app announcement (idempotent, create-only).
  try {
    const annRef  = doc(db, 'dailyAnnouncements', `cbt-dailymock-${date}`);
    const annSnap = await getDoc(annRef);
    if (!annSnap.exists()) {
      const batch = writeBatch(db);
      batch.set(annRef, {
        title: '🗓️ New Daily Mock Exam is Live!',
        message: "Today's Daily Mock Exam is ready across every specialty. Pick yours, choose how many questions you want to tackle, and go for a new score.",
        type: 'daily_mock_exam',
        link: '/daily-mock-exam',
        date,
        createdAt: now,
      });
      await batch.commit();
    }
  } catch { /* announcement is a nice-to-have */ }

  const count          = Object.values(perCategory).reduce((a, c) => a + c.count, 0);
  const carryoverCount = Object.values(perCategory).reduce((a, c) => a + c.carryoverCount, 0);
  return { ok: true, date, categories: Object.keys(perCategory), perCategory, count, carryoverCount, source: 'client' };
}

// ── Public API ────────────────────────────────────────────────────────────

// Called on app open for any signed-in user. No-op unless pools are stale.
// Never throws: a failure here must never break the app.
export async function ensureDailyMockFresh(uid, { isAdmin = false } = {}) {
  try {
    if (await arePoolsFresh()) return { ok: true, skipped: 'fresh' };
    if (!(await acquireLock(uid, { force: false }))) return { ok: true, skipped: 'locked-or-fresh' };
    try {
      return await rotateAllPools(uid, { asAdmin: isAdmin });
    } finally {
      await releaseLock();
    }
  } catch (e) {
    console.warn('[dailyMock] auto-rotate skipped:', e?.code || e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

// Admin "Force rotate" fallback (all specialties). Throws on failure.
export async function forceRotateAllClient(uid) {
  if (!(await acquireLock(uid, { force: true }))) {
    throw new Error('Another rotation is already running. Try again in a minute.');
  }
  try {
    return await rotateAllPools(uid, { asAdmin: true });
  } finally {
    await releaseLock();
  }
}

// Admin "Rotate PHN pool now" fallback (PHN only, no notifications).
export async function rotatePhnClient() {
  const nowMs = Date.now();
  const date  = lagosDateKey(nowMs);

  const bankSnap = await getDocs(query(collection(db, PHN_COLLECTION), where('active', '==', true)));
  if (bankSnap.empty) {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'dailyMockExam', PHN_CATEGORY));
      await batch.commit();
    } catch { /* nothing to delete */ }
    return { ok: false, reason: 'phn-bank-empty', bankActive: 0 };
  }
  const allIds    = bankSnap.docs.map(d => d.id);
  const statsById = await loadStats();
  const { questionIds, carryoverIds } = buildPool(allIds, statsById);

  const now       = Timestamp.fromMillis(nowMs);
  const expiresAt = Timestamp.fromMillis(nextLagosMidnightMs(nowMs));

  const batch = writeBatch(db);
  batch.set(doc(db, 'dailyMockExam', PHN_CATEGORY), {
    category: PHN_CATEGORY, questionIds, date,
    carryoverCount: carryoverIds.length,
    totalActive: allIds.length,
    source: PHN_COLLECTION,
    generatedAt: now, expiresAt,
  });
  batch.set(doc(db, 'dailyMockExamHistory', `${PHN_CATEGORY}_${date}`), {
    category: PHN_CATEGORY, questionIds, date, carryoverCount: carryoverIds.length, generatedAt: now,
  });
  // Deliberately leaves _index.date / generatedAt alone so a PHN-only rotation
  // never makes the other specialties look fresh to the auto-rotation check.
  batch.set(doc(db, 'dailyMockExam', '_index'), {
    categories: arrayUnion(PHN_CATEGORY),
    perCategory: { [PHN_CATEGORY]: { count: questionIds.length, carryoverCount: carryoverIds.length } },
    phnRotatedAt: now,
  }, { merge: true });
  await batch.commit();

  return {
    ok: true, date, bank: PHN_COLLECTION,
    bankActive: allIds.length, count: questionIds.length,
    carryoverCount: carryoverIds.length, source: 'client',
  };
}
