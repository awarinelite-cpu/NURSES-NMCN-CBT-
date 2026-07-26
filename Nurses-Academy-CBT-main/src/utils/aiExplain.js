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

  const prompt = buildPrompt({
    question: payload.question,
    optionsText,
    correctAnswer: payload.correctAnswer,
    explanation: payload.explanation,
    subject: payload.subject,
  });

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

/**
 * "Ask AI to Explain", upgraded: independently re-checks whether the stored
 * correct answer is actually right, THEN explains whichever answer the AI
 * lands on. Calls /api/ai-review (secure backend, Gemini + Firebase Admin).
 *
 * collectionName must be a collection the backend knows how to verify/save
 * against — currently 'questions' (main CBT/mock exam bank) or
 * 'entranceExamQuestions'. For anything else (e.g. CAOSCE cases), fall back
 * to getAiExplanation() instead — this function needs a real stored answer
 * to check against.
 *
 * Returns: { agrees, currentLetter, suggestedLetter, confidence, reasoning,
 *            explanation, autoSaved, flaggedForReview }
 */
export async function getAiReview(q, collectionName) {
  const question = q.question || q.questionText || '';
  const options  = q.options || null;
  const subject  = q.subject || q.course || q.category || '';

  if (!question || !options) {
    throw new Error('This question is missing data needed for review.');
  }

  const payload = { questionId: q.id || null, collectionName, question, options, subject };
  if (Array.isArray(options)) {
    payload.correctIndex = q.correctIndex;
  } else {
    payload.correctAnswer = q.correctAnswer;
  }

  const res = await fetch(`${API_BASE}/api/ai-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `AI review failed (${res.status})`);
  return data;
}

/** Turn a getAiReview() result into the message shown to the student. */
export function formatAiReviewMessage(review) {
  if (!review.agrees) {
    let msg = `⚠️ The answer is wrong. The best answer to this question is option ${review.suggestedLetter}.`;
    if (review.reasoning) msg += ` ${review.reasoning}`;
    msg += `\n\n${review.explanation}`;
    if (review.flaggedForReview) {
      msg += `\n\n(This has been flagged for admin review since the AI wasn't fully confident.)`;
    } else if (review.autoSaved) {
      msg += `\n\n(This has been corrected and saved automatically.)`;
    }
    return msg;
  }
  return review.explanation;
}
