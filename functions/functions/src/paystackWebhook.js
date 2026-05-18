// functions/src/paystackWebhook.js
//
// Firebase Cloud Function — receives Paystack webhook events.
// Verifies the signature using your Paystack SECRET key (never exposed
// to the client), then activates the user's entrance exam access.
//
// DEPLOY:
//   cd functions
//   npm install
//   firebase deploy --only functions:paystackWebhook
//
// PAYSTACK DASHBOARD:
//   Settings → Webhooks → Add URL:
//   https://<your-region>-<project-id>.cloudfunctions.net/paystackWebhook

const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const crypto     = require('crypto');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────────────

function verifyPaystackSignature(rawBody, signature) {
  // Paystack signs with HMAC-SHA512 using your secret key
  const secret = functions.config().paystack.secret_key;
  const hash   = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
}

// ── Cloud Function ────────────────────────────────────────────────────────────

exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Verify signature — Paystack sends x-paystack-signature header
  const signature = req.headers['x-paystack-signature'];
  const rawBody   = JSON.stringify(req.body); // Firebase already parses JSON

  if (!signature || !verifyPaystackSignature(rawBody, signature)) {
    console.error('Invalid Paystack signature — possible spoofed request');
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;

  // We only care about successful charges
  if (event.event !== 'charge.success') {
    return res.status(200).send('Ignored');
  }

  const data     = event.data;
  const ref      = data.reference;
  const metadata = data.metadata || {};
  const userId   = metadata.userId;
  const type     = metadata.type; // 'entrance_exam'

  if (!userId || type !== 'entrance_exam') {
    console.warn('Webhook missing userId or wrong type:', { userId, type });
    return res.status(200).send('Skipped — missing metadata');
  }

  // Prevent duplicate processing
  const paymentRef = db.collection('payments').where('reference', '==', ref).limit(1);
  const existing   = await paymentRef.get();

  if (!existing.empty && existing.docs[0].data().status === 'confirmed') {
    console.log('Duplicate webhook — already confirmed:', ref);
    return res.status(200).send('Already processed');
  }

  try {
    const batch = db.batch();

    // 1. Update payment record status to confirmed
    if (!existing.empty) {
      batch.update(existing.docs[0].ref, {
        status:      'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Payment doc not yet created (webhook arrived before client write)
      const newPayRef = db.collection('payments').doc();
      batch.set(newPayRef, {
        userId,
        reference: ref,
        amount:    data.amount / 100, // convert from kobo
        currency:  data.currency,
        method:    'paystack',
        type:      'entrance_exam',
        status:    'confirmed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 2. Activate user's entrance exam access
    batch.update(db.collection('users').doc(userId), {
      entranceExamPaid:   true,
      entranceExamPaidAt: admin.firestore.FieldValue.serverTimestamp(),
      entranceExamRef:    ref,
    });

    // 3. Notify the user
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      userId,
      title:     '✅ Entrance Exam Access Activated',
      body:      `Your payment of ₦${(data.amount / 100).toLocaleString()} was confirmed. You now have full access.`,
      type:      'entrance_exam_activated',
      read:      false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log(`Entrance exam activated for userId=${userId} ref=${ref}`);
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).send('Internal error');
  }
});
