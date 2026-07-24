// api/verify-answer.js — Vercel Serverless Function
// Uses Gemini to independently re-solve a nursing exam question and check
// whether the answer currently stored as "correct" in Firestore is actually
// right. Returns a strict JSON verdict so the client can auto-fix
// high-confidence disagreements and flag the rest for human review.
//
// SETUP: uses the same GEMINI_API_KEY env var as /api/ai-explain.

function buildPrompt({ question, optionsText, currentAnswerLetter, currentAnswerText, subject }) {
  return `You are a senior nursing tutor and NMCN exam setter cross-checking an exam answer key for correctness.

QUESTION: ${question}
OPTIONS:
${optionsText}
${subject ? `SUBJECT/CATEGORY: ${subject}` : ''}

The answer key currently marks option ${currentAnswerLetter} ("${currentAnswerText}") as correct.

Work out the correct answer yourself from clinical/nursing knowledge, independent of what the key says. Then compare your answer to the key.

Respond with ONLY a single JSON object, no markdown fences, no commentary, in exactly this shape:
{"agrees": true or false, "correctLetter": "A|B|C|D|E", "confidence": 0-100 integer, "reasoning": "one short sentence, max 30 words"}

Rules:
- "agrees" is true if your correctLetter matches the key's current answer (${currentAnswerLetter}).
- "confidence" reflects how certain you are in YOUR chosen correctLetter (not in the key). Use 90-100 only for unambiguous textbook facts. Use below 60 if the question is ambiguous, poorly worded, has more than one defensible answer, or you are unsure.
- If the question itself is broken (missing info, no correct option, multiple correct options), set confidence to 0 and explain briefly in reasoning.
- Output raw JSON only.`;
}

function parseLetterToIndex(letter) {
  if (!letter) return -1;
  const c = String(letter).trim().toUpperCase().charAt(0);
  return c.charCodeAt(0) - 65; // A=0
}

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

  const { question, options, correctIndex, subject } = req.body || {};
  if (!question || !Array.isArray(options) || options.length < 2 ||
      !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    return res.status(400).json({ error: 'question, options[] and a valid correctIndex are required.' });
  }
  if (String(question).length > 3000) {
    return res.status(400).json({ error: 'Question too large.' });
  }

  const optionsText = options
    .map((o, i) => `${String.fromCharCode(65 + i)}. ${String(o).slice(0, 500)}`)
    .join('\n');
  const currentAnswerLetter = String.fromCharCode(65 + correctIndex);
  const currentAnswerText = String(options[correctIndex] || '').slice(0, 500);

  const prompt = buildPrompt({
    question: String(question).slice(0, 3000),
    optionsText,
    currentAnswerLetter,
    currentAnswerText,
    subject: subject ? String(subject).slice(0, 100) : '',
  });

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.1,
            responseMimeType: 'application/json',
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

    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    if (!raw) return res.status(502).json({ error: 'Empty response from Gemini.' });

    let verdict;
    try {
      const cleaned = raw.replace(/^```json\s*|```$/g, '').trim();
      verdict = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'Could not parse AI verdict.', raw });
    }

    const suggestedIndex = parseLetterToIndex(verdict.correctLetter);
    const confidence = Number.isFinite(verdict.confidence)
      ? Math.max(0, Math.min(100, Math.round(verdict.confidence)))
      : 0;
    const agrees = suggestedIndex === correctIndex;

    return res.status(200).json({
      agrees,
      currentIndex: correctIndex,
      suggestedIndex: suggestedIndex >= 0 && suggestedIndex < options.length ? suggestedIndex : correctIndex,
      suggestedLetter: verdict.correctLetter || currentAnswerLetter,
      confidence,
      reasoning: String(verdict.reasoning || '').slice(0, 300),
    });
  } catch (err) {
    console.error('verify-answer error:', err);
    return res.status(500).json({ error: 'Failed to reach the Gemini API.' });
  }
}
