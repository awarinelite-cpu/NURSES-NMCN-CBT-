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
// POST /api/generate-plan
// Securely proxies AI study-plan generation to the Gemini API.
// Requires env var: GEMINI_API_KEY (https://aistudio.google.com/apikey)
// Node 18+ has global fetch.
// ─────────────────────────────────────────────────────────────────
app.post('/api/generate-plan', async (req, res) => {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const { systemPrompt, userPrompt } = req.body || {};
  if (!systemPrompt || !userPrompt) {
    return res.status(400).json({ error: 'systemPrompt and userPrompt are required.' });
  }
  if (String(systemPrompt).length > 8000 || String(userPrompt).length > 8000) {
    return res.status(400).json({ error: 'Prompt too large.' });
  }

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `Gemini API error ${upstream.status}`,
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) return res.status(502).json({ error: 'Empty response from Gemini.' });

    return res.json({ text });
  } catch (err) {
    console.error('generate-plan error:', err);
    return res.status(500).json({ error: 'Failed to reach the Gemini API.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/ai-explain
// Explains an exam question using Gemini. Prompt is built server-side
// so this endpoint can't be abused as a general AI proxy.
// Requires env var: GEMINI_API_KEY
// ─────────────────────────────────────────────────────────────────
app.post('/api/ai-explain', async (req, res) => {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const { question, options, correctAnswer, explanation, subject } = req.body || {};
  if (!question || !correctAnswer) {
    return res.status(400).json({ error: 'question and correctAnswer are required.' });
  }
  if (String(question).length > 3000) {
    return res.status(400).json({ error: 'Question too large.' });
  }

  const optionsText = Array.isArray(options)
    ? options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
    : options && typeof options === 'object'
      ? Object.entries(options).map(([k, v]) => `${k}. ${v}`).join('\n')
      : '';

  const prompt = `You are a friendly, expert nursing tutor helping a Nigerian nursing student review an exam question.

QUESTION: ${String(question).slice(0, 3000)}
${optionsText ? `OPTIONS:\n${String(optionsText).slice(0, 2000)}` : ''}
CORRECT ANSWER: ${String(correctAnswer).slice(0, 500)}
${explanation ? `EXISTING EXPLANATION HINT: ${String(explanation).slice(0, 1000)}` : ''}
${subject ? `SUBJECT: ${String(subject).slice(0, 100)}` : ''}

Explain in 3-5 short sentences:
1. WHY the correct answer is right (the key concept or clinical reasoning)
2. Briefly why the most tempting wrong option is wrong
3. One memorable tip or mnemonic to remember this for the exam

Be concise, clinical, and encouraging. Plain text only — no markdown, no headings.`;

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 512,
            temperature: 0.4,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `Gemini API error ${upstream.status}`,
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    if (!text) return res.status(502).json({ error: 'Empty response from Gemini.' });

    return res.json({ text });
  } catch (err) {
    console.error('ai-explain error:', err);
    return res.status(500).json({ error: 'Failed to reach the Gemini API.' });
  }
});

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
