// api/paystack-initialize.js — Vercel Serverless Function
// Starts a Paystack transaction and returns a hosted checkout URL so the
// client can do a full-page redirect instead of opening the inline iframe.
//
// Why: the inline iframe popup shares the same document as the app, and on
// some Android WebViews the anti-screenshot blur script can get stuck when
// the iframe briefly steals focus. A full-page redirect avoids that class
// of bug entirely, since the checkout runs on Paystack's own page.
//
// SETUP: set PAYSTACK_SECRET_KEY in your Vercel project's environment
// variables (Project → Settings → Environment Variables). Use the LIVE
// secret key (sk_live_...) to match the existing pk_live_ public key.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY is not configured on the server.' });
  }

  const { email, amount, currency, metadata, callback_url, reference } = req.body || {};

  if (!email || !amount) {
    return res.status(400).json({ error: 'email and amount are required.' });
  }
  if (!callback_url) {
    return res.status(400).json({ error: 'callback_url is required.' });
  }

  try {
    const upstream = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount,
        currency: currency || 'NGN',
        metadata:  metadata || {},
        callback_url,
        // Let Paystack generate a reference unless the client provided one.
        ...(reference ? { reference } : {}),
        channels: ['card', 'bank', 'ussd', 'bank_transfer', 'qr', 'mobile_money'],
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok || !data?.status) {
      return res.status(upstream.status || 502).json({
        error: data?.message || `Paystack initialize error ${upstream.status}`,
      });
    }

    return res.status(200).json({
      authorization_url: data.data.authorization_url,
      access_code:        data.data.access_code,
      reference:           data.data.reference,
    });
  } catch (err) {
    console.error('paystack-initialize error:', err);
    return res.status(500).json({ error: 'Failed to reach Paystack.' });
  }
}
