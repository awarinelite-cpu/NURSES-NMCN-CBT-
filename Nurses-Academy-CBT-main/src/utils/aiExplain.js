// src/utils/aiExplain.js
// Shared AI explanation helper used by ALL exam surfaces
// (main exam session, review pages, entrance exams, subject drills).
//
// Strategy:
//   1) Call the secure backend proxy /api/ai-explain (GEMINI_API_KEY on server)
//   2) Fallback: direct Gemini call with REACT_APP_GEMINI_API_KEY (dev only)
//
// Accepts a question in ANY of the app's shapes:
//   • Main exams:     { question, options: [..array..], correctIndex, explanation }
//   • Entrance exams: { questionText, options: {A,B,C,D}, correctAnswer: 'A', explanation }

const API_BASE = process.env.REACT_APP_API_BASE || '';

/** Normalise any question shape into { question, options, correctAnswer, explanation, subject } */
function normalise(q) {
  const question = q.question || q.questionText || '';
  const options  = q.options || null;

  let correctAnswer = '';
  if (Array.isArray(options) && Number.isInteger(q.correctIndex)) {
    correctAnswer = `${String.fromCharCode(65 + q.correctIndex)}. ${options[q.correctIndex] ?? ''}`;
  } else if (options && typeof options === 'object' && q.correctAnswer) {
    correctAnswer = `${q.correctAnswer}. ${options[q.correctAnswer] ?? ''}`;
  } else if (q.correctAnswer) {
    correctAnswer = String(q.correctAnswer);
  }

  return {
    question,
    options,
    correctAnswer,
    explanation: q.explanation || '',
    subject: q.subject || q.course || q.category || '',
  };
}

/**
 * Get an AI explanation for a question. Returns a string.
 * Throws with a friendly message if everything fails.
 */
export async function getAiExplanation(q) {
  const payload = normalise(q);
  if (!payload.question || !payload.correctAnswer) {
    throw new Error('This question is missing data needed for an explanation.');
  }

  // ── 1) Secure backend proxy ────────────────────────────────────────────
  try {
    const res = await fetch(`${API_BASE}/api/ai-explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.text) return data.text;
    } else if (res.status !== 404 && res.status !== 405) {
      // Real server error — remember it in case the fallback also fails
      const errBody = await res.json().catch(() => ({}));
      if (!process.env.REACT_APP_GEMINI_API_KEY) {
        throw new Error(errBody?.error || `Server error ${res.status}`);
      }
    }
  } catch (e) {
    if (!process.env.REACT_APP_GEMINI_API_KEY) {
      // No fallback available — surface a clean message
      throw new Error(
        e.message && !e.message.includes('Failed to fetch')
          ? e.message
          : 'AI explanations are unavailable right now. Please check your connection.'
      );
    }
  }

  // ── 2) Fallback: direct Gemini (client-side key, dev/testing only) ─────
  const GEMINI_KEY = process.env.REACT_APP_GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    throw new Error('AI explanations are not configured yet.');
  }

  const optionsText = Array.isArray(payload.options)
    ? payload.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
    : payload.options && typeof payload.options === 'object'
      ? Object.entries(payload.options).map(([k, v]) => `${k}. ${v}`).join('\n')
      : '';

  const prompt = `You are a friendly, expert nursing tutor helping a Nigerian nursing student review an exam question.

QUESTION: ${payload.question}
${optionsText ? `OPTIONS:\n${optionsText}` : ''}
CORRECT ANSWER: ${payload.correctAnswer}
${payload.explanation ? `EXISTING EXPLANATION HINT: ${payload.explanation}` : ''}
${payload.subject ? `SUBJECT: ${payload.subject}` : ''}

Explain in 3-5 short sentences:
1. WHY the correct answer is right (the key concept or clinical reasoning)
2. Briefly why the most tempting wrong option is wrong
3. One memorable tip or mnemonic to remember this for the exam

Be concise, clinical, and encouraging. Plain text only — no markdown, no headings.`;

  const res = await fetch(
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

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Could not generate an explanation. Please try again.');
  return text;
}
