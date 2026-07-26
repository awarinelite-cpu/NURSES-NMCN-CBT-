// api/ai-review.js — Vercel Serverless Function
//
// Called live whenever a student taps "Ask AI to Explain" on a question.
// One Gemini call does double duty:
//   1) Independently re-solves the question and checks it against the
//      answer currently stored as "correct".
//   2) Writes a student-facing explanation for whichever answer the AI
//      lands on.
//
// Server-side outcome (uses Firebase Admin, so it bypasses firestore.rules
// the same way /api/paystack-webhook does):
//   - AI agrees, confidence >= AUTO_THRESHOLD  -> explanation is cached on
//     the question doc so future taps skip the AI call entirely.
//   - AI disagrees, confidence >= AUTO_THRESHOLD -> the stored answer is
//     corrected automatically. The old answer is kept in
//     aiPreviousCorrectIndex / aiPreviousCorrectAnswer so it can be
//     reversed, and the explanation is cached too.
//   - AI disagrees, confidence < AUTO_THRESHOLD -> nothing on the question
//     is changed. It's written into a review queue collection for an admin
//     to accept/dismiss (same "answerReviewQueue" the Admin > Answer Audit
//     AI sweep already uses, for the main `questions` bank).
//   - AI agrees, confidence < AUTO_THRESHOLD -> shown to the student as-is,
//     nothing is saved (question may be ambiguous).
//
// SETUP: same GEMINI_API_KEY as /api/ai-explain and /api/verify-answer,
// plus FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
// (already configured on Vercel for /api/paystack-webhook).

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

const AUTO_THRESHOLD = 85; // matches AnswerAuditTab's AUTO_FIX_CONFIDENCE

// Collections this endpoint knows how to read/write, and how each one
// represents "the correct option".
const SHAPES = {
  questions:             { kind: 'index',  reviewQueue: 'answerReviewQueue' },
  entranceExamQuestions: { kind: 'letter', reviewQueue: 'entranceAnswerReviewQueue' },
};

function optionsToLetterList(options) {
  return Array.isArray(options)
    ? options.map((o, i) => ({ letter: String.fromCharCode(65 + i), text: String(o) }))
    : Object.entries(options || {}).map(([k, v]) => ({ letter: k, text: String(v) }));
}

function buildPrompt({ question, letterList, currentLetter, subject }) {
  const optionsText = letterList.map(o => `${o.letter}. ${o.text}`).join('\n');
  const currentText = letterList.find(o => o.letter === currentLetter)?.text || '';
  return `You are a senior nursing tutor and NMCN exam setter cross-checking an exam answer key, and then explaining it to a Nigerian nursing student.

QUESTION: ${question}
OPTIONS:
${optionsText}
${subject ? `SUBJECT/CATEGORY: ${subject}` : ''}

The answer key currently marks option ${currentLetter} ("${currentText}") as correct.

Step 1: Work out the correct answer yourself from clinical/nursing knowledge, independent of what the key says.
Step 2: Compare your answer to the key.
Step 3: Write a short student-facing explanation of YOUR answer (the one you consider correct), in 3-5 short sentences: why it's right, briefly why the most tempting wrong option is wrong, and one memorable tip or mnemonic.

Respond with ONLY a single JSON object, no markdown fences, no commentary, in exactly this shape:
{"agrees": true or false, "correctLetter": "A|B|C|D|E", "confidence": 0-100 integer, "reasoning": "one short sentence, max 25 words, on why the key might be wrong (blank if it agrees)", "explanation": "3-5 short sentences, plain text, no markdown"}

Rules:
- "agrees" is true if your correctLetter matches the key's current answer (${currentLetter}).
- "confidence" reflects how certain you are in YOUR correctLetter. Use 90-100 only for unambiguous textbook facts. Use below 60 if the question is ambiguous, poorly worded, has more than one defensible answer, or you are unsure.
- If the question itself is broken (missing info, no correct option, multiple correct options), set confidence to 0 and explain briefly in reasoning.
- Output raw JSON only.`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });

  const {
    questionId, collectionName, question, options, correctIndex, correctAnswer, subject,
  } = req.body || {};

  const shape = SHAPES[collectionName];
  if (!question || !options || !shape) {
    return res.status(400).json({ error: 'question, options and a supported collectionName are required.' });
  }
  if (String(question).length > 3000) return res.status(400).json({ error: 'Question too large.' });

  const letterList = optionsToLetterList(options).map(o => ({ letter: o.letter, text: String(o.text).slice(0, 500) }));
  // Resolve from whichever field was actually sent — a caller may normalize
  // an entrance question into array/correctIndex form before it gets here,
  // even though the target collection is letter-based.
  const currentLetter = Number.isInteger(correctIndex) && letterList[correctIndex]
    ? letterList[correctIndex].letter
    : String(correctAnswer || '').trim().toUpperCase().charAt(0);

  if (!currentLetter) return res.status(400).json({ error: 'Could not resolve the current correct option.' });

  const prompt = buildPrompt({
    question: String(question).slice(0, 3000),
    letterList,
    currentLetter,
    subject: subject ? String(subject).slice(0, 100) : '',
  });

  let verdict;
  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 700,
            temperature: 0.3,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error?.message || `Gemini API error ${upstream.status}` });
    }
    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    if (!raw) return res.status(502).json({ error: 'Empty response from Gemini.' });
    const cleaned = raw.replace(/^```json\s*|```$/g, '').trim();
    verdict = JSON.parse(cleaned);
  } catch (err) {
    console.error('ai-review error:', err);
    const msg = err instanceof SyntaxError ? 'Could not parse AI verdict.' : 'Failed to reach the Gemini API.';
    return res.status(500).json({ error: msg });
  }

  const suggestedLetter = String(verdict.correctLetter || currentLetter).trim().toUpperCase().charAt(0);
  const confidence = Number.isFinite(verdict.confidence)
    ? Math.max(0, Math.min(100, Math.round(verdict.confidence)))
    : 0;
  const agrees = suggestedLetter === currentLetter;
  const explanationText = String(verdict.explanation || '').slice(0, 1500) || 'No explanation returned.';
  const reasoning = String(verdict.reasoning || '').slice(0, 300);

  let autoSaved = false;
  let flaggedForReview = false;

  // Only persist when we have a real Firestore doc to write back to.
  if (questionId) {
    try {
      const ref = db.collection(collectionName).doc(questionId);

      if (confidence >= AUTO_THRESHOLD) {
        const payload = {
          explanation: explanationText,
          aiConfidence: confidence,
          aiReasoning: reasoning,
          aiReviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!agrees) {
          if (shape.kind === 'index') {
            const suggestedIndex = letterList.findIndex(o => o.letter === suggestedLetter);
            if (suggestedIndex >= 0) {
              payload.correctIndex = suggestedIndex;
              payload.aiPreviousCorrectIndex = correctIndex;
            }
          } else {
            payload.correctAnswer = suggestedLetter;
            payload.aiPreviousCorrectAnswer = currentLetter;
          }
        }
        await ref.set(payload, { merge: true });
        autoSaved = true;
      } else if (!agrees) {
        if (shape.kind === 'index') {
          const suggestedIndex = letterList.findIndex(o => o.letter === suggestedLetter);
          await db.collection(shape.reviewQueue).doc(questionId).set({
            questionId,
            question,
            options,
            currentIndex: correctIndex,
            suggestedIndex: suggestedIndex >= 0 ? suggestedIndex : correctIndex,
            suggestedLetter,
            confidence,
            reasoning,
            explanation: explanationText,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        } else {
          await db.collection(shape.reviewQueue).doc(questionId).set({
            questionId,
            question,
            options,
            currentLetter,
            suggestedLetter,
            confidence,
            reasoning,
            explanation: explanationText,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        flaggedForReview = true;
      }
    } catch (err) {
      console.error('ai-review save error:', err);
      // Non-fatal — the student still gets their explanation even if the save failed.
    }
  }

  return res.status(200).json({
    agrees,
    currentLetter,
    suggestedLetter,
    confidence,
    reasoning,
    explanation: explanationText,
    autoSaved,
    flaggedForReview,
  });
}
