// api/ai-tag-questions.js — Vercel Serverless Function
// Suggests { courseId, topic } for a BATCH of untagged questions using Gemini.
// The admin reviews/edits every suggestion in the UI before anything is
// written to Firestore — this endpoint never writes to the database itself,
// it only returns suggestions.
//
// SETUP: uses the same GEMINI_API_KEY env var as /api/ai-explain.

const MAX_BATCH = 100;

function buildPrompt({ questions, courses }) {
  const courseList = courses
    .map(c => `- id: "${c.id}" | label: "${c.label}"${c.category ? ` | specialty: ${c.category}` : ''}`)
    .join('\n');

  const questionList = questions
    .map(q => {
      const opts = Array.isArray(q.options)
        ? q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join(' ')
        : '';
      return `#### id: ${q.id}\nQ: ${q.question}\n${opts ? `Options: ${opts}\n` : ''}${q.correctAnswer ? `Correct: ${q.correctAnswer}\n` : ''}`;
    })
    .join('\n');

  return `You are tagging nursing exam questions for a Nigerian nursing school CBT (computer-based test) platform.

AVAILABLE COURSES (you MUST pick courseId only from this list, or "" if truly none fit):
${courseList}

For EACH question below, decide:
1. courseId — the single best-matching course id from the list above (exact id string, or "" if none fit)
2. topic — a short, standard nursing topic label within that course (2-5 words, Title Case, e.g. "Fluid and Electrolyte Balance", "Postpartum Hemorrhage", "Drug Calculation"). Keep topic labels consistent and reusable — don't invent an overly specific one-off phrase when a standard nursing topic name applies.
3. confidence — "high", "medium", or "low"

QUESTIONS:
${questionList}

Respond with ONLY a JSON array, one object per question, in the SAME ORDER as given, with EXACTLY these keys: "id", "courseId", "topic", "confidence". No markdown, no commentary, no code fences — raw JSON array only.`;
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

  const { questions, courses } = req.body || {};
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'questions (non-empty array) is required.' });
  }
  if (questions.length > MAX_BATCH) {
    return res.status(400).json({ error: `Batch too large — max ${MAX_BATCH} questions per request.` });
  }
  if (!Array.isArray(courses) || courses.length === 0) {
    return res.status(400).json({ error: 'courses (non-empty array) is required.' });
  }

  const validIds = new Set(courses.map(c => String(c.id)));

  // Keep each question compact so 100 of them stay well inside Gemini's
  // context window.
  const cleaned = questions.map(q => ({
    id: String(q.id),
    question: String(q.question || '').slice(0, 500),
    options: Array.isArray(q.options) ? q.options.slice(0, 6).map(o => String(o).slice(0, 200)) : undefined,
    correctAnswer: q.correctAnswer ? String(q.correctAnswer).slice(0, 200) : undefined,
  }));

  const prompt = buildPrompt({
    questions: cleaned,
    courses: courses.map(c => ({
      id: String(c.id),
      label: String(c.label || c.id),
      category: c.category ? String(c.category) : '',
    })),
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
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
            temperature: 0.2,
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
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'AI returned unparseable output. Try a smaller batch.' });
    }
    if (!Array.isArray(parsed)) {
      return res.status(502).json({ error: 'AI response was not a list. Try again.' });
    }

    // Validate + sanitize every suggestion before it goes back to the client.
    const byId = new Map(parsed.map(item => [String(item?.id), item]));
    const results = cleaned.map(q => {
      const item = byId.get(q.id) || {};
      const courseId = validIds.has(String(item.courseId)) ? String(item.courseId) : '';
      const topic = typeof item.topic === 'string' ? item.topic.trim().slice(0, 80) : '';
      const confidence = ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'low';
      return { id: q.id, courseId, topic, confidence };
    });

    return res.status(200).json({ results });
  } catch (err) {
    console.error('ai-tag-questions error:', err);
    return res.status(500).json({ error: 'Failed to reach the Gemini API.' });
  }
}
