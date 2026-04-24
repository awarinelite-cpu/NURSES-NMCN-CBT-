// server.js
// Place this file in the ROOT of your project (same level as package.json)
//
// RENDER ENVIRONMENT VARIABLES needed:
//   PAYSTACK_SECRET_KEY   — your Paystack secret key (sk_live_...)
//   FIREBASE_PROJECT_ID   — nurseexamprep-6956a
//   FIREBASE_CLIENT_EMAIL — from your Firebase service account JSON
//   FIREBASE_PRIVATE_KEY  — from your Firebase service account JSON

const express    = require('express');
const cors       = require('cors');
const crypto     = require('crypto');
const https      = require('https');
const path       = require('path');
const admin      = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Firebase Admin init ──────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// ── Middleware ───────────────────────────────────────────────────
// Raw body needed for webhook signature verification — must come BEFORE express.json()
app.use('/api/paystack/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(cors({ origin: '*' }));

// ── Serve React build ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'build')));

// ── Helper: verify transaction with Paystack ─────────────────────
function paystackVerify(reference) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      port:     443,
      path:     `/transaction/verify/${encodeURIComponent(reference)}`,
      method:   'GET',
      headers:  { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    };
    let data = '';
    const req = https.request(options, res => {
      res.on('data', chunk => { data += chunk; });
      res.on('end',  ()    => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Helper: activate subscription in Firestore ───────────────────
async function activateSubscription(userId, planId, days, reference) {
  const expiresAt = new Date(Date.now() + days * 86400000);

  await db.collection('payments').add({
    userId,
    plan:      planId,
    days,
    method:    'paystack',
    reference,
    status:    'confirmed',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
  });

  await db.collection('users').doc(userId).update({
    subscribed:         true,
    accessLevel:        'full',
    subscriptionPlan:   planId,
    subscriptionExpiry: expiresAt.toISOString(),
    subscribedAt:       admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ── PLAN DAYS lookup ─────────────────────────────────────────────
const PLAN_DAYS = { basic: 30, standard: 90, premium: 180 };

// ─────────────────────────────────────────────────────────────────
// POST /api/paystack/verify
// Called by PaymentPage.jsx after Paystack popup callback fires.
// Verifies the reference server-side before activating subscription.
// ─────────────────────────────────────────────────────────────────
app.post('/api/paystack/verify', async (req, res) => {
  const { reference, userId, planId } = req.body;

  if (!reference || !userId || !planId) {
    return res.status(400).json({ success: false, message: 'Missing reference, userId or planId' });
  }

  try {
    const result = await paystackVerify(reference);

    if (!result.status || result.data?.status !== 'success') {
      return res.status(400).json({ success: false, message: 'Payment not successful' });
    }

    // Extra guard: amount paid must match plan price
    const expectedAmounts = { basic: 250000, standard: 500000, premium: 800000 }; // kobo
    const paid = result.data.amount;
    if (paid < expectedAmounts[planId]) {
      return res.status(400).json({ success: false, message: 'Amount mismatch' });
    }

    const days = PLAN_DAYS[planId] || 30;
    await activateSubscription(userId, planId, days, reference);

    return res.json({ success: true, message: 'Subscription activated' });
  } catch (e) {
    console.error('Verify error:', e);
    return res.status(500).json({ success: false, message: 'Server error during verification' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/paystack/webhook
// Paystack calls this automatically for every successful payment.
// Acts as a backup in case the frontend verify call fails.
// Set this URL in your Paystack Dashboard → Settings → Webhooks:
//   https://nurses-nmcn-cbt.onrender.com/api/paystack/webhook
// ─────────────────────────────────────────────────────────────────
app.post('/api/paystack/webhook', async (req, res) => {
  const secret    = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers['x-paystack-signature'];
  const hash      = crypto.createHmac('sha512', secret).update(req.body).digest('hex');

  if (hash !== signature) {
    return res.status(401).send('Invalid signature');
  }

  let event;
  try { event = JSON.parse(req.body); }
  catch { return res.status(400).send('Bad JSON'); }

  if (event.event === 'charge.success') {
    const { reference, metadata, amount } = event.data;
    const userId = metadata?.userId;
    const planId = metadata?.plan;

    if (userId && planId) {
      // Check if already activated by frontend verify (avoid double write)
      const existing = await db.collection('payments')
        .where('reference', '==', reference)
        .limit(1)
        .get();

      if (existing.empty) {
        const days = PLAN_DAYS[planId] || 30;
        await activateSubscription(userId, planId, days, reference).catch(console.error);
      }
    }
  }

  res.sendStatus(200);
});

// ── Catch-all: serve React app for all other routes ──────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
