// api/generate-plan.js — Vercel Serverless Function
// Securely proxies study-plan generation to the Gemini API.
// The key stays on the server — it is NEVER shipped in the React bundle or APK.
//
// SETUP (Vercel dashboard → your project → Settings → Environment Variables):
//   GEMINI_API_KEY = your key from https://aistudio.google.com/apikey
// Then redeploy.

export default async function handler(req, res) {
  // CORS (allows the Capacitor Android app, which serves from a different origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured on the server. Add it in Vercel → Settings → Environment Variables and redeploy.',
    });
  }

  const { systemPrompt, userPrompt } = req.body || {};
  if (!systemPrompt || !userPrompt) {
    return res.status(400).json({ error: 'systemPrompt and userPrompt are required.' });
  }
  // Basic abuse guard — study-plan prompts are small
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

    const text =
      data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';

    if (!text) {
      return res.status(502).json({ error: 'Empty response from Gemini.' });
    }

    return res.status(200).json({ text });
  } catch (err) {
    console.error('generate-plan error:', err);
    return res.status(500).json({ error: 'Failed to reach the Gemini API.' });
  }
}
