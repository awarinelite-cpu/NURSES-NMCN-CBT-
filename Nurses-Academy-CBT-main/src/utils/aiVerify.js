// src/utils/aiVerify.js
// Client helper for the AI Answer Verification sweep (Admin > Answer Audit).
// Calls the secure backend proxy /api/verify-answer (GEMINI_API_KEY stays on server).

const API_BASE = process.env.REACT_APP_API_BASE || '';

/**
 * Ask the AI to independently check whether a question's stored correctIndex
 * is right. Returns:
 *   { agrees, currentIndex, suggestedIndex, suggestedLetter, confidence, reasoning }
 * Throws with a friendly message on failure.
 */
export async function verifyAnswer(q) {
  const question = q.question || '';
  const options = Array.isArray(q.options) ? q.options : [];
  const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : 0;
  const subject = q.subject || q.course || q.category || '';

  if (!question || options.length < 2) {
    throw new Error('Question is missing text or options.');
  }

  const res = await fetch(`${API_BASE}/api/verify-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, options, correctIndex, subject }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Verification failed (${res.status})`);
  }
  return data;
}

/**
 * Run verifyAnswer over a list of questions with limited concurrency,
 * calling onProgress after each one completes so the UI can show a live bar.
 * Never throws — failed items are returned with an `error` field instead.
 */
export async function verifyAnswersBatch(questions, { concurrency = 3, onProgress } = {}) {
  const results = new Array(questions.length);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < questions.length) {
      const i = cursor++;
      const q = questions[i];
      try {
        const verdict = await verifyAnswer(q);
        results[i] = { id: q.id, ...verdict };
      } catch (err) {
        results[i] = { id: q.id, error: err.message || 'Verification failed' };
      }
      done++;
      if (onProgress) onProgress(done, questions.length, results[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, questions.length) }, worker);
  await Promise.all(workers);
  return results;
}
