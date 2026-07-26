// src/utils/aiAutoTag.js
// Calls the secure backend proxy /api/ai-tag-questions to get AI-suggested
// { courseId, topic } for a batch (up to 100) of untagged questions.
// This NEVER writes to Firestore — it only returns suggestions for the
// admin to review, edit, and save in AutoTagQuestionsTab.jsx.

const API_BASE = process.env.REACT_APP_API_BASE || '';

/**
 * @param {Array} questions  [{ id, question, options, correctAnswer }]
 * @param {Array} courses    [{ id, label, category }]
 * @returns {Promise<Array>} [{ id, courseId, topic, confidence }]
 */
export async function getAiTagsForBatch(questions, courses) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  if (questions.length > 100) {
    throw new Error('Batch too large — send at most 100 questions at a time.');
  }

  const res = await fetch(`${API_BASE}/api/ai-tag-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions, courses }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `AI tagging failed (${res.status})`);
  }
  if (!Array.isArray(data.results)) {
    throw new Error('AI tagging returned no results.');
  }
  return data.results;
}

/** Turns a question's stored shape into the compact payload the endpoint expects. */
export function toTagPayload(q) {
  const options = Array.isArray(q.options)
    ? q.options.map(o => (typeof o === 'string' ? o : o?.text || ''))
    : undefined;
  let correctAnswer = '';
  if (options && Number.isInteger(q.correctIndex) && options[q.correctIndex] != null) {
    correctAnswer = `${String.fromCharCode(65 + q.correctIndex)}. ${options[q.correctIndex]}`;
  }
  return { id: q.id, question: q.question || '', options, correctAnswer };
}
