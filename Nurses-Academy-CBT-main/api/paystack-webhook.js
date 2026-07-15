// api/paystack-webhook.js — Vercel Serverless Function
//
// Receives Paystack webhook events, verifies the HMAC-SHA512 signature,
// then activates access for whichever platform paid:
//   metadata.type === 'entrance_exam' → entranceExamPaid, entranceExamPlan, etc.
//   metadata.type === 'nmcn_cbt'      → subscribed, subscriptionPlan, etc.
//
// This is the server-side safety net referenced by SubscriptionPage.jsx and
// EntranceExamPaymentPage.jsx: those pages can't write the protected fields
// themselves (firestore.rules blocks it), so activation always happens here,
// using the Firebase Admin SDK which is not subject to client security rules.
//
// SETUP (Vercel dashboard → your project → Settings → Environment Variables):
//   PAYSTACK_SECRET_KEY   — your live secret key (sk_live_...) from
//                           Paystack Dashboard → Settings → API Keys & Webhooks
//   FIREBASE_PROJECT_ID   — elitecarehub-a80da
//   FIREBASE_CLIENT_EMAIL — from a Firebase service account JSON
//                           (Firebase Console → Project settings →
//                           Service accounts → Generate new private key)
//   FIREBASE_PRIVATE_KEY  — from the same JSON. Paste it exactly as-is,
//                           including the literal \n line breaks — this
//                           file un-escapes them at runtime.
// Then redeploy (or just push — Vercel picks up new env vars on next deploy).
//
// PAYSTACK DASHBOARD:
//   Settings → API Keys & Webhooks → Webhook URL:
//   https://<your-vercel-domain>/api/paystack-webhook
//
// Vercel doesn't parse the body for us here — bodyParser is disabled below
// because signature verification needs the exact raw bytes Paystack sent.

import crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const config = {
  api: { bodyParser: false },
};

// ── Firebase Admin init (reused across warm invocations) ──────────────────
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

// ── Read raw request body (needed for signature verification) ─────────────
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('PAYSTACK_SECRET_KEY is not set in Vercel env vars.');
    return false;
  }
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return hash === signature;
}

// ── NMCN CBT plan config (mirrors SubscriptionPage.jsx) ───────────────────
const NMCN_PLANS = {
  basic:    { days: 30 },
  standard: { days: 90 },
  premium:  { days: 180 },
};

async function handleNmcnCbt({ batch, userId, ref, amount, planId, existing }) {
  const planConfig = NMCN_PLANS[planId] || NMCN_PLANS.standard;
  const expiresAt  = new Date(Date.now() + planConfig.days * 86_400_000);

  if (!existing.empty) {
    batch.update(existing.docs[0].ref, {
      status: 'confirmed',
      confirmedAt: FieldValue.serverTimestamp(),
    });
  } else {
    const newPayRef = db.collection('payments').doc();
    batch.set(newPayRef, {
      userId, reference: ref, amount, method: 'paystack', type: 'nmcn_cbt',
      plan: planId, days: planConfig.days, status: 'confirmed',
      createdAt: FieldValue.serverTimestamp(),
      confirmedAt: FieldValue.serverTimestamp(),
    });
  }

  batch.update(db.collection('users').doc(userId), {
    subscribed:         true,
    accessLevel:        planId,
    subscriptionPlan:   planId,
    subscriptionExpiry: expiresAt.toISOString(),
    subscribedAt:       FieldValue.serverTimestamp(),
  });

  const notifRef = db.collection('notifications').doc();
  batch.set(notifRef, {
    userId,
    title: '✅ NMCN CBT Subscription Activated',
    body:  `Your ₦${amount.toLocaleString()} payment was confirmed. Your ${planId} plan is now active for ${planConfig.days} days.`,
    type: 'nmcn_cbt_activated', read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`NMCN CBT activated: userId=${userId} plan=${planId} ref=${ref} expires=${expiresAt.toISOString()}`);
}

// ── Entrance Exam (mirrors EntranceExamPaymentPage.jsx) ────────────────────
async function handleEntranceExam({ batch, userId, ref, amount, existing }) {
  const ENTRANCE_DAYS = 36_500; // lifetime
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + ENTRANCE_DAYS);

  if (!existing.empty) {
    batch.update(existing.docs[0].ref, {
      status: 'confirmed',
      confirmedAt: FieldValue.serverTimestamp(),
    });
  } else {
    const newPayRef = db.collection('payments').doc();
    batch.set(newPayRef, {
      userId, reference: ref, amount, method: 'paystack', type: 'entrance_exam',
      plan: 'full', status: 'confirmed',
      createdAt: FieldValue.serverTimestamp(),
      confirmedAt: FieldValue.serverTimestamp(),
    });
  }

  batch.update(db.collection('users').doc(userId), {
    entranceExamPaid:   true,
    entranceExamPlan:   'full',
    entranceExamExpiry: expiry.toISOString(),
    entranceExamPaidAt: FieldValue.serverTimestamp(),
    entranceExamRef:    ref,
  });

  const notifRef = db.collection('notifications').doc();
  batch.set(notifRef, {
    userId,
    title: '✅ Entrance Exam Access Activated',
    body:  `Your payment of ₦${amount.toLocaleString()} was confirmed. You now have full lifetime access.`,
    type: 'entrance_exam_activated', read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`Entrance exam activated: userId=${userId} ref=${ref}`);
}

// ── Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-paystack-signature'];

  if (!signature || !verifySignature(rawBody, signature)) {
    console.error('Invalid Paystack signature — possible spoofed request');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return res.status(400).send('Bad JSON'); }

  if (event.event !== 'charge.success') {
    return res.status(200).send('Ignored');
  }

  const data     = event.data;
  const ref      = data.reference;
  const amount   = data.amount / 100; // kobo → naira
  const metadata = data.metadata || {};
  const userId   = metadata.userId;
  const type     = metadata.type; // 'nmcn_cbt' | 'entrance_exam'
  const planId   = metadata.plan;

  if (!userId || !['nmcn_cbt', 'entrance_exam'].includes(type)) {
    console.warn('Webhook skipped — missing userId or unrecognised type:', { userId, type, ref });
    return res.status(200).send('Skipped — missing or unknown metadata');
  }

  const existing = await db.collection('payments').where('reference', '==', ref).limit(1).get();
  if (!existing.empty && existing.docs[0].data().status === 'confirmed') {
    console.log('Duplicate webhook — already confirmed:', ref);
    return res.status(200).send('Already processed');
  }

  try {
    const batch = db.batch();
    if (type === 'nmcn_cbt') {
      await handleNmcnCbt({ batch, userId, ref, amount, planId, existing });
    } else {
      await handleEntranceExam({ batch, userId, ref, amount, existing });
    }
    await batch.commit();
    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).send('Internal error');
  }
}
