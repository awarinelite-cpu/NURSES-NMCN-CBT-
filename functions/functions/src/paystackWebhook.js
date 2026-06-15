// functions/src/paystackWebhook.js
//
// Firebase Cloud Function — receives Paystack webhook events.
// Verifies the HMAC-SHA512 signature using your Paystack SECRET key,
// then activates access for EITHER platform depending on metadata.type:
//
//   metadata.type === 'entrance_exam'  → sets entranceExamPaid, entranceExamExpiry, etc.
//   metadata.type === 'nmcn_cbt'       → sets subscribed, subscriptionExpiry, accessLevel, etc.
//
// This is a server-side safety net: it fires even if the client callback
// was interrupted (app closed, network drop, etc.), ensuring the user's
// access is always granted after a successful Paystack charge.
//
// DEPLOY:
//   cd functions
//   npm install
//   firebase deploy --only functions:paystackWebhook
//
// PAYSTACK DASHBOARD:
//   Settings → Webhooks → Add URL:
//   https://<your-region>-<project-id>.cloudfunctions.net/paystackWebhook

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const crypto    = require('crypto');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Signature verification ────────────────────────────────────────────────────

function verifyPaystackSignature(rawBody, signature) {
  const secret = functions.config().paystack.secret_key;
  const hash   = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
}

// ── NMCN CBT plan config (mirrors PaymentPage.jsx PLANS array) ────────────────

const NMCN_PLANS = {
  basic:    { days: 30  },
  standard: { days: 90  },
  premium:  { days: 180 },
};

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * Activate NMCN CBT subscription.
 * Mirrors what PaymentPage.jsx handlePaystack() does on the client.
 */
async function handleNmcnCbt({ batch, userId, ref, amount, planId, existing }) {
  const planConfig = NMCN_PLANS[planId] || NMCN_PLANS.standard;
  const expiresAt  = new Date(Date.now() + planConfig.days * 86_400_000);

  // 1. Payment record
  if (!existing.empty) {
    batch.update(existing.docs[0].ref, {
      status:      'confirmed',
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    const newPayRef = db.collection('payments').doc();
    batch.set(newPayRef, {
      userId,
      reference:  ref,
      amount,
      method:     'paystack',
      type:       'nmcn_cbt',
      plan:       planId,
      days:       planConfig.days,
      status:     'confirmed',
      createdAt:  admin.firestore.FieldValue.serverTimestamp(),
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // 2. Activate user subscription (same fields as PaymentPage.jsx)
  batch.update(db.collection('users').doc(userId), {
    subscribed:         true,
    accessLevel:        planId,
    subscriptionPlan:   planId,
    subscriptionExpiry: expiresAt.toISOString(),
    subscribedAt:       admin.firestore.FieldValue.serverTimestamp(),
  });

  // 3. Notify user
  const notifRef = db.collection('notifications').doc();
  batch.set(notifRef, {
    userId,
    title:     '✅ NMCN CBT Subscription Activated',
    body:      `Your ₦${amount.toLocaleString()} payment was confirmed. Your ${planId} plan is now active for ${planConfig.days} days.`,
    type:      'nmcn_cbt_activated',
    read:      false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`NMCN CBT activated: userId=${userId} plan=${planId} ref=${ref} expires=${expiresAt.toISOString()}`);
}

/**
 * Activate Entrance Exam access.
 * Same logic as before — extracted for clarity.
 */
async function handleEntranceExam({ batch, userId, ref, amount, existing }) {
  // Entrance exam is lifetime (36,500 days) — mirrors EntranceExamPaymentPage.jsx
  const ENTRANCE_DAYS = 36_500;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + ENTRANCE_DAYS);

  // 1. Payment record
  if (!existing.empty) {
    batch.update(existing.docs[0].ref, {
      status:      'confirmed',
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    const newPayRef = db.collection('payments').doc();
    batch.set(newPayRef, {
      userId,
      reference:  ref,
      amount,
      method:     'paystack',
      type:       'entrance_exam',
      plan:       'full',
      status:     'confirmed',
      createdAt:  admin.firestore.FieldValue.serverTimestamp(),
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // 2. Activate entrance exam access (same fields as EntranceExamPaymentPage.jsx grantAccess)
  batch.update(db.collection('users').doc(userId), {
    entranceExamPaid:   true,
    entranceExamPlan:   'full',
    entranceExamExpiry: expiry.toISOString(),
    entranceExamPaidAt: admin.firestore.FieldValue.serverTimestamp(),
    entranceExamRef:    ref,
  });

  // 3. Notify user
  const notifRef = db.collection('notifications').doc();
  batch.set(notifRef, {
    userId,
    title:     '✅ Entrance Exam Access Activated',
    body:      `Your payment of ₦${amount.toLocaleString()} was confirmed. You now have full lifetime access.`,
    type:      'entrance_exam_activated',
    read:      false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Entrance exam activated: userId=${userId} ref=${ref}`);
}

// ── Cloud Function ─────────────────────────────────────────────────────────────

exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  // Only POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Verify Paystack signature
  const signature = req.headers['x-paystack-signature'];
  const rawBody   = JSON.stringify(req.body);

  if (!signature || !verifyPaystackSignature(rawBody, signature)) {
    console.error('Invalid Paystack signature — possible spoofed request');
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;

  // Only handle successful charges
  if (event.event !== 'charge.success') {
    return res.status(200).send('Ignored');
  }

  const data     = event.data;
  const ref      = data.reference;
  const amount   = data.amount / 100; // convert from kobo to naira
  const metadata = data.metadata || {};
  const userId   = metadata.userId;
  const type     = metadata.type;   // 'nmcn_cbt' | 'entrance_exam'
  const planId   = metadata.plan;   // 'basic' | 'standard' | 'premium' (nmcn_cbt only)

  // Both platforms require userId and a known type
  if (!userId || !['nmcn_cbt', 'entrance_exam'].includes(type)) {
    console.warn('Webhook skipped — missing userId or unrecognised type:', { userId, type, ref });
    return res.status(200).send('Skipped — missing or unknown metadata');
  }

  // Duplicate prevention — check if this reference is already confirmed
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
});
