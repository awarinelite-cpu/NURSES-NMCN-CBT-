// api/ai-explain.js — Vercel Serverless Function
// Explains a nursing/entrance exam question using Gemini.
// The prompt is built HERE (server-side) so the endpoint can't be abused
// as a general-purpose AI proxy. Key stays on the server.
//
// SETUP: uses the same GEMINI_API_KEY env var as /api/generate-plan.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    const text =
      data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    if (!text) return res.status(502).json({ error: 'Empty response from Gemini.' });

    return res.status(200).json({ text });
  } catch (err) {
    console.error('ai-explain error:', err);
    return res.status(500).json({ error: 'Failed to reach the Gemini API.' });
  }
}
