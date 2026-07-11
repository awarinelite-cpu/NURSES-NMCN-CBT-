// api/ai-explain.js — Vercel Serverless Function
// Explains a nursing/entrance exam question using Gemini.
// The prompt is built HERE (server-side) so the endpoint can't be abused
// as a general-purpose AI proxy. Key stays on the server.
//
// SETUP: uses the same GEMINI_API_KEY env var as /api/generate-plan.

// Detects whether a question needs a raw step-by-step calculation instead of
// a prose explanation — e.g. maths/physics/chemistry, or a nursing dosage/
// dilution question — so the AI output matches the style of a worked
// calculation (formula, substitution, simplification, final answer) rather
// than sentences.
function isCalculationQuestion(subject, questionText) {
  const subjHit = /math|physic|chemistry|dosage|calculation/i.test(subject || '');
  const hasNumber   = /\d/.test(questionText || '');
  const hasCalcCue  = /[=×x*/÷%]|calculate|find the (value|number|sum|area|volume|dose|dosage|rate|concentration|perimeter|angle)/i
    .test(questionText || '');
  return subjHit || (hasNumber && hasCalcCue);
}

function buildPrompt({ question, optionsText, correctAnswer, explanation, subject }) {
  const isCalc = isCalculationQuestion(subject, question);

  if (isCalc) {
    return `You are helping a Nigerian nursing/entrance-exam student see the worked calculation behind an exam answer.

QUESTION: ${question}
${optionsText ? `OPTIONS:\n${optionsText}` : ''}
CORRECT ANSWER: ${correctAnswer}
${subject ? `SUBJECT: ${subject}` : ''}

Show ONLY the raw step-by-step calculation that proves the correct answer. One short line per step:
• State the formula/relationship used
• Substitute the given numbers into the formula
• Simplify one step at a time
• End with the final answer isolated on its own line

STRICT RULES:
- No narrative sentences. No words like "first", "next", "therefore", "we can see that", "this means".
- No explanation of WHY the formula works — just the formula and the numbers.
- Each line is a short mathematical/chemical/physical expression only, e.g. "2340 = (n - 2) x 180" or "n - 2 = 2340/180".
- Plain text only — no LaTeX, no markdown headers, no bold, no numbering like "Step 1:".
- Prefix every line with "• ".
- Keep it as short as the calculation allows — typically 3-6 lines.`;
  }

  return `You are a friendly, expert nursing tutor helping a Nigerian nursing student review an exam question.

QUESTION: ${question}
${optionsText ? `OPTIONS:\n${optionsText}` : ''}
CORRECT ANSWER: ${correctAnswer}
${explanation ? `EXISTING EXPLANATION HINT: ${explanation}` : ''}
${subject ? `SUBJECT: ${subject}` : ''}

Explain in 3-5 short sentences:
1. WHY the correct answer is right (the key concept or clinical reasoning)
2. Briefly why the most tempting wrong option is wrong
3. One memorable tip or mnemonic to remember this for the exam

Be concise, clinical, and encouraging. Plain text only — no markdown, no headings.`;
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

  const prompt = buildPrompt({
    question: String(question).slice(0, 3000),
    optionsText: optionsText ? String(optionsText).slice(0, 2000) : '',
    correctAnswer: String(correctAnswer).slice(0, 500),
    explanation: explanation ? String(explanation).slice(0, 1000) : '',
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
