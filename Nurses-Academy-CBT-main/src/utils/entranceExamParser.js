// src/utils/entranceExamParser.js
// ─────────────────────────────────────────────────────────────────────
// Standalone parser for entrance exam questions.
// Mirrors the architecture of questionParser.js.
//
// Supported input formats:
//
// FORMAT A — Standard block (question + A–D options + answer marker):
//   What is the functional unit of the kidney?
//   A. Nephron
//   B. Neuron
//   C. Nodule
//   D. Nucleus
//   *A
//   Explanation: The nephron filters blood…
//
// FORMAT B — Diagram block (optional image URL first line):
//   https://i.imgur.com/abc123.png
//   In the diagram, part labeled A is ___
//   A. Bowman capsule
//   B. Nephron
//   C. Pyramid
//   D. Calyx
//   Answer: C
//
// FORMAT C — Inline options on one line:
//   Which organ produces insulin? A. Liver B. Pancreas C. Kidney D. Spleen
//   *B
//
// FORMAT D — Options with parentheses: (A) / (B) / (C) / (D)
//   What is H2O?
//   (A) Blood   (B) Water   (C) Oxygen   (D) Glucose
//   Answer: B
//
// FORMAT E — Short double options per line (2 per line):
//   A. Sympathy   C. Socialism
//   B. Criticism  D. Empathy
//
// FORMAT F — Numbered question blocks:
//   1. What is the capital of Nigeria?
//   A. Ibadan   B. Lagos   C. Abuja   D. Kano
//   Answer: C
//
// FORMAT G — Separate answer key (paste in answerKeyText):
//   1. B   2. A   3. C  …  or one per line: 1. B
//
// FORMAT H — JSON object per question:
//   { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
//     "answer": "B", "explanation": "...", "diagramUrl": "" }
//
// ANSWER MARKERS accepted anywhere after the options:
//   *B          — star-prefixed letter
//   Answer: B   — labelled (also "Ans:", "Correct:", "Key:", "Solution:")
//   (B)         — parenthesised letter alone on its own line
//
// ─────────────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────────
export const ENTRANCE_SUBJECTS = [
  'English Language', 'Biology', 'Chemistry', 'Physics',
  'Mathematics', 'General Studies', 'Nursing Aptitude', 'Current Affairs',
];

export const ENTRANCE_YEARS = [
  '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025',
];

const OPT_LETTERS = ['A', 'B', 'C', 'D', 'E'];

// ── Shuffle Utilities ─────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle — returns a NEW array, does not mutate original.
 */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Seeded shuffle — deterministic per seed value (e.g. for daily mocks).
 * Returns a NEW array.
 */
export function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Converts a YYYY-MM-DD date string to a numeric seed.
 */
export function dateSeed(dateStr) {
  return dateStr.split('-').reduce((acc, v) => acc * 100 + Number(v), 0);
}

/**
 * Shuffles the options of a single parsed entrance question and
 * updates correctAnswer to point to wherever the correct answer
 * landed after the shuffle.
 *
 * Works with the entrance question shape:
 *   { options: { A, B, C, D }, correctAnswer: 'B', ... }
 */
export function shuffleEntranceQuestionOptions(question) {
  const letters = OPT_LETTERS.filter(l => question.options[l] !== undefined);
  if (letters.length < 2) return question;

  const correctText = question.options[question.correctAnswer];
  const shuffledLetters = shuffleArray(letters);

  const newOptions = {};
  shuffledLetters.forEach((origLetter, i) => {
    newOptions[OPT_LETTERS[i]] = question.options[origLetter];
  });

  // Find which new letter now holds the correct answer text
  const newCorrectLetter = OPT_LETTERS[
    shuffledLetters.findIndex(l => question.options[l] === correctText)
  ];

  return {
    ...question,
    options: newOptions,
    correctAnswer: newCorrectLetter ?? question.correctAnswer,
  };
}

/**
 * Shuffles options for every question in an array.
 */
export function shuffleAllEntranceOptions(questions) {
  return questions.map(shuffleEntranceQuestionOptions);
}

// ── Answer Key Parser ─────────────────────────────────────────────────

/**
 * Parses a standalone answer key into { questionNumber: 'Letter' } map.
 * Accepts formats like:
 *   "1. B", "1) B", "1: B", "Q1: B", "Q1. Answer: B",
 *   packed "Q1: B  Q2: A" on one line, or letter-only lines.
 */
export function parseAnswerKey(answerText) {
  if (!answerText?.trim()) return {};

  const normalized = answerText
    .replace(/\r/g, '')
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, ' ');

  const map = {};

  const pattern = /Q?(\d+)\s*[.):–\-]?\s*(?:Answer\s*:\s*)?([A-Da-d])\b/gi;
  let m;
  while ((m = pattern.exec(normalized)) !== null) {
    map[parseInt(m[1], 10)] = m[2].toUpperCase();
  }

  // Fallback: letter-only lines with implied sequence
  if (Object.keys(map).length === 0) {
    const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const single = line.match(/^([A-Da-d])\s*$/i);
      if (single) map[i + 1] = single[1].toUpperCase();
    });
  }

  return map;
}

/**
 * Parses rationale/explanation entries from the answer key textarea.
 * Returns { questionNumber: 'rationale text' }
 */
export function parseRationaleKey(answerText) {
  if (!answerText?.trim()) return {};

  const rationaleMap = {};
  const lines = answerText.replace(/\r/g, '').split('\n');
  let currentNum = null;
  let currentRationale = '';

  for (const line of lines) {
    const trimmed = line.trim();

    const qLine = trimmed.match(/^Q?(\d+)\s*[.):–\-]?\s*(?:Answer\s*:\s*)?[A-Da-d]\b/i);
    if (qLine) {
      if (currentNum !== null && currentRationale) {
        rationaleMap[currentNum] = currentRationale.trim();
      }
      currentNum = parseInt(qLine[1], 10);
      currentRationale = '';
      continue;
    }

    const ratLine = trimmed.match(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i);
    if (ratLine && currentNum !== null) {
      currentRationale = trimmed.replace(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i, '').trim();
      continue;
    }

    if (currentNum !== null && currentRationale && trimmed) {
      currentRationale += ' ' + trimmed;
    }
  }

  if (currentNum !== null && currentRationale) {
    rationaleMap[currentNum] = currentRationale.trim();
  }

  return rationaleMap;
}

// ── Format H: JSON Block Pre-processor ───────────────────────────────

/**
 * Extracts JSON question objects from raw text.
 * Returns an array of normalised entrance question objects.
 * Accepts both single objects and arrays of objects.
 */
function parseJsonBlocks(rawText) {
  const questions = [];

  // Balanced-brace scanner — more reliable than regex for nested JSON
  const segments = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        segments.push(rawText.slice(start, i + 1));
        start = -1;
      }
    }
  }

  // Also handle a top-level JSON array
  const arrayMatch = rawText.match(/^\s*(\[[\s\S]*\])\s*$/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[1]);
      if (Array.isArray(arr)) arr.forEach(obj => segments.push(JSON.stringify(obj)));
    } catch (_) { /* ignore */ }
  }

  for (const seg of segments) {
    let obj;
    try { obj = JSON.parse(seg); } catch (_) { continue; }

    // Must look like a question object
    const qText = obj.question || obj.q || obj.Question || obj.Q || '';
    if (!qText || typeof qText !== 'string') continue;

    const rawOptions = obj.options || obj.Options || obj.choices || obj.Choices || [];
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) continue;

    const answerRaw = (obj.answer || obj.Answer || obj.correct || obj.correctAnswer || '').toString().trim();
    const explanation = (obj.explanation || obj.Explanation || obj.rationale || '').toString().trim();
    const diagramUrl = (obj.diagramUrl || obj.imageUrl || obj.diagram || '').toString().trim();

    // Normalise options into { A: text, B: text, ... }
    const options = {};
    rawOptions.forEach((o, idx) => {
      const str = (typeof o === 'string' ? o : JSON.stringify(o)).trim();
      const prefixMatch = str.match(/^([A-Da-d])[\.\)\-:]\s*/);
      const letter = prefixMatch
        ? prefixMatch[1].toUpperCase()
        : OPT_LETTERS[idx] || String.fromCharCode(65 + idx);
      options[letter] = prefixMatch ? str.slice(prefixMatch[0].length).trim() : str;
    });

    const correctAnswer = answerRaw.match(/^([A-Da-d])\b/i)?.[1]?.toUpperCase() || null;

    questions.push({
      _fromJson:    true,
      questionText: qText.trim(),
      options,
      correctAnswer: correctAnswer || '',
      explanation,
      diagramUrl,
      questionType: diagramUrl ? 'diagram' : 'text',
      _hasAnswer:   !!correctAnswer,
    });
  }

  return questions;
}

// ── Inline option splitter (used for single-line A. … B. … C. … D. …) ─

/**
 * Splits a line like "A. Long text here B. Another text C. Short D. Final"
 * using position scanning rather than lookaheads, so option bodies
 * containing periods don't cause false splits.
 */
function splitInlineOptions(line) {
  const positions = [];
  const re = /(?:^|\s)([A-Da-d])[\.]\s+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    positions.push({
      letter: m[1].toUpperCase(),
      index:  m.index === 0 ? 0 : m.index + 1,
    });
  }
  if (positions.length < 2) return null;

  return positions.map((p, i) => {
    const end  = i + 1 < positions.length ? positions[i + 1].index : line.length;
    const text = line.slice(p.index, end).trim().replace(/^[A-Da-d]\.\s*/i, '').trim();
    return { letter: p.letter, text };
  });
}

/**
 * Parses "(A) text  (B) text  (C) text  (D) text" style inline options.
 */
function splitParenOptions(line) {
  const positions = [];
  const re = /\(([A-Da-d])\)\s*/gi;
  let m;
  while ((m = re.exec(line)) !== null) {
    positions.push({ letter: m[1].toUpperCase(), index: m.index + m[0].length });
  }
  if (positions.length < 2) return null;

  return positions.map((p, i) => {
    const end  = i + 1 < positions.length ? positions[i + 1].index - 5 : line.length;
    const text = line.slice(p.index, end).trim();
    return { letter: p.letter, text };
  });
}

/**
 * Detects two options on same line: "A. Sympathy   C. Socialism"
 */
function extractDoubleOptions(line) {
  const m = line.match(
    /^([A-Da-d])[\.\)]\s*(.+?)\s{2,}([A-Da-d])[\.\)]\s*(.+)$/i
  );
  if (m) {
    return [
      { letter: m[1].toUpperCase(), text: m[2].trim() },
      { letter: m[3].toUpperCase(), text: m[4].trim() },
    ];
  }
  return null;
}

// ── Helper predicates ─────────────────────────────────────────────────

const isQuestionLine = line =>
  /^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i.test(line);

const isOptionLine = line =>
  /^([A-Da-d][\.\)\-:]|\([A-Da-d]\))\s*.+/i.test(line);

const isAnswerLine = line =>
  /^(answer|ans|correct(?:\s+answer)?|key|solution)[\s\.\:\-]*/i.test(line) ||
  /^\*[A-Da-d]$/i.test(line.trim()) ||
  /^\([A-Da-d]\)$/.test(line.trim());

const isExplanationLine = line =>
  /^(explanation|explain|rationale|reason|note)[\s\.\:\-]*/i.test(line);

const isDiagramUrl = line => /^https?:\/\//i.test(line.trim());

/**
 * Extracts the answer letter from a line that isAnswerLine() returned true for.
 */
function extractAnswerLetter(line) {
  const t = line.trim();
  // *B
  const star = t.match(/^\*([A-Da-d])$/i);
  if (star) return star[1].toUpperCase();
  // (B) alone
  const paren = t.match(/^\(([A-Da-d])\)$/i);
  if (paren) return paren[1].toUpperCase();
  // Answer: B / Ans: B / Correct: B …
  const labelled = t
    .replace(/^(answer|ans|correct(?:\s+answer)?|key|solution)[\s\.\:\-]*/i, '')
    .trim();
  const m = labelled.match(/^([A-Da-d])\b/i);
  return m ? m[1].toUpperCase() : null;
}

function getQuestionNumber(line) {
  const m = line.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractOptionLetter(line) {
  const m = line.match(/^([A-Da-d])[\.\)\-:]|\(([A-Da-d])\)/i);
  return m ? (m[1] || m[2]).toUpperCase() : null;
}

function extractOptionText(line) {
  return line.replace(/^([A-Da-d][\.\)\-:]|\([A-Da-d]\))\s*/i, '').trim();
}

// ── Main Parser ───────────────────────────────────────────────────────

/**
 * parseEntranceQuestions(rawText, answerKeyText?)
 *
 * Parses raw pasted text into an array of entrance exam question objects.
 *
 * Each returned question has the shape:
 * {
 *   questionText:  string,
 *   options:       { A: string, B: string, C: string, D: string },
 *   correctAnswer: string,   // 'A' | 'B' | 'C' | 'D'
 *   explanation:   string,
 *   diagramUrl:    string,
 *   questionType:  'text' | 'diagram',
 *   _seq:          number,   // internal sort key
 *   _qNumber:      number,   // original question number (if numbered)
 *   _hasAnswer:    boolean,
 * }
 *
 * Returns { results: Question[], errors: string[] }
 *
 * The optional answerKeyText supports a separate answer key pasted
 * in a second field, identical to questionParser.js's approach.
 */
export function parseEntranceQuestions(rawText, answerKeyText = '') {
  const answerKey    = parseAnswerKey(answerKeyText);
  const rationaleMap = parseRationaleKey(answerKeyText);

  // ── Pre-pass: Extract JSON blocks ───────────────────────────────────
  let cleanedText = rawText;
  const jsonQuestions = parseJsonBlocks(rawText);

  if (jsonQuestions.length > 0) {
    // Strip extracted JSON segments from line-parser input
    let depth = 0, start = -1, stripped = '', lastEnd = 0;
    for (let i = 0; i < rawText.length; i++) {
      const ch = rawText[i];
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const seg = rawText.slice(start, i + 1);
          let isQ = false;
          try {
            const obj = JSON.parse(seg);
            if (obj && (obj.q || obj.question || obj.Question || obj.Q)) isQ = true;
          } catch (_) {}
          if (isQ) { stripped += rawText.slice(lastEnd, start); lastEnd = i + 1; }
          start = -1;
        }
      }
    }
    stripped += rawText.slice(lastEnd);
    cleanedText = stripped;
  }

  // ── Normalise Unicode whitespace ─────────────────────────────────────
  cleanedText = cleanedText
    .replace(/\r/g, '')
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, ' ');

  // ── Block-based parsing ──────────────────────────────────────────────
  // Primary strategy: split on blank lines → each block = one question.
  // Falls back to line-by-line when blocks don't contain enough lines.
  const rawBlocks = cleanedText.trim().split(/\n\s*\n/).filter(b => b.trim());

  const questions = [];
  const errors    = [];
  let seqCounter  = 0;

  for (const block of rawBlocks) {
    seqCounter++;
    const blockLines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);

    // Minimum: question + 2 options + answer = 4 lines
    // (allow 3 for inline-option formats)
    if (blockLines.length < 2) {
      errors.push(`Block ${seqCounter}: Too few lines (got ${blockLines.length})`);
      continue;
    }

    let cursor      = 0;
    let diagramUrl  = '';
    let qNumber     = seqCounter;

    // Optional leading image URL
    if (isDiagramUrl(blockLines[0])) {
      diagramUrl = blockLines[0].trim();
      cursor = 1;
    }

    // Question text line — may be numbered
    if (cursor >= blockLines.length) {
      errors.push(`Block ${seqCounter}: Missing question text`);
      continue;
    }

    let questionText = blockLines[cursor];
    if (isQuestionLine(questionText)) {
      qNumber = getQuestionNumber(questionText) || seqCounter;
      questionText = questionText
        .replace(/^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i, '')
        .trim();
    }
    cursor++;

    // ── Collect options ──────────────────────────────────────────────
    const optionMap  = {};   // { A: text, B: text, ... }
    let correctAnswer = '';
    let explanation   = '';

    // Check if the very next line is an inline options line
    // (all A–D options packed onto one or two lines)
    if (cursor < blockLines.length) {
      // Try standard dot-inline: "A. X  B. Y  C. Z  D. W"
      const inlineDot = splitInlineOptions(blockLines[cursor]);
      if (inlineDot && inlineDot.length >= 2) {
        inlineDot.forEach(o => { optionMap[o.letter] = o.text; });
        cursor++;
      }

      // Try parenthesis-inline: "(A) X  (B) Y  (C) Z  (D) W"
      if (Object.keys(optionMap).length < 2) {
        const inlineParen = splitParenOptions(blockLines[cursor] || '');
        if (inlineParen && inlineParen.length >= 2) {
          inlineParen.forEach(o => { optionMap[o.letter] = o.text; });
          cursor++;
        }
      }
    }

    // Process remaining lines for options / double-options / answer / explanation
    while (cursor < blockLines.length) {
      const line = blockLines[cursor];

      // Skip additional diagram URLs that appear mid-block
      if (isDiagramUrl(line) && !diagramUrl) {
        diagramUrl = line.trim();
        cursor++;
        continue;
      }

      // Answer line (must check before option line — *B, Answer: B, (B) alone)
      if (isAnswerLine(line)) {
        const letter = extractAnswerLetter(line);
        if (letter) correctAnswer = letter;
        cursor++;
        continue;
      }

      // Explanation line
      if (isExplanationLine(line)) {
        explanation = line.replace(/^(explanation|explain|rationale|reason|note)[\s\.\:\-]*/i, '').trim();
        cursor++;
        // Collect continuation lines
        while (cursor < blockLines.length) {
          const next = blockLines[cursor];
          if (isQuestionLine(next) || isOptionLine(next) || isAnswerLine(next)) break;
          explanation += ' ' + next;
          cursor++;
        }
        continue;
      }

      // Double option on one line: "A. Sympathy   C. Socialism"
      const double = extractDoubleOptions(line);
      if (double) {
        double.forEach(o => { if (!optionMap[o.letter]) optionMap[o.letter] = o.text; });
        cursor++;
        continue;
      }

      // Single standard option: "A. text" or "A) text"
      if (isOptionLine(line)) {
        const letter = extractOptionLetter(line);
        const text   = extractOptionText(line);
        if (letter && text && !optionMap[letter]) {
          optionMap[letter] = text;
          cursor++;
          // Collect multi-line option body (Format F style)
          while (cursor < blockLines.length) {
            const next = blockLines[cursor];
            if (
              isQuestionLine(next) || isOptionLine(next) ||
              isAnswerLine(next) || isExplanationLine(next) ||
              isDiagramUrl(next)
            ) break;
            optionMap[letter] += ' ' + next;
            cursor++;
          }
          optionMap[letter] = optionMap[letter].trim();
          continue;
        }
      }

      // Continuation of question text (before any options appear)
      if (Object.keys(optionMap).length === 0 && !isAnswerLine(line)) {
        questionText += ' ' + line;
        cursor++;
        continue;
      }

      cursor++;
    }

    // ── Validation ──────────────────────────────────────────────────
    if (!questionText.trim()) {
      errors.push(`Block ${seqCounter}: Missing question text`);
      continue;
    }

    if (Object.keys(optionMap).length < 2) {
      errors.push(`Block ${seqCounter}: Need at least 2 options (A–D). Got: ${Object.keys(optionMap).join(', ') || 'none'}`);
      continue;
    }

    // Apply separate answer key if no inline answer found
    if (!correctAnswer) {
      const keyLetter =
        answerKey[qNumber] ??
        answerKey[seqCounter] ??
        null;
      if (keyLetter) {
        correctAnswer = keyLetter;
      } else {
        errors.push(`Block ${seqCounter}: Missing answer — use *B, "Answer: B", or "(B)"`);
        continue;
      }
    }

    // Apply rationale from key if no inline explanation
    if (!explanation && (rationaleMap[qNumber] || rationaleMap[seqCounter])) {
      explanation = rationaleMap[qNumber] ?? rationaleMap[seqCounter] ?? '';
    }

    questions.push({
      questionText: questionText.trim(),
      options:      optionMap,
      correctAnswer,
      explanation:  explanation.trim(),
      diagramUrl,
      questionType: diagramUrl ? 'diagram' : 'text',
      _seq:         seqCounter,
      _qNumber:     qNumber,
      _hasAnswer:   !!correctAnswer,
    });
  }

  // ── Merge JSON questions ─────────────────────────────────────────────
  let mergedSeq = questions.length;
  jsonQuestions.forEach(q => {
    mergedSeq++;
    q._seq     = mergedSeq;
    q._qNumber = mergedSeq;
  });

  const allQuestions = [...questions, ...jsonQuestions];
  allQuestions.sort((a, b) => (a._seq || 0) - (b._seq || 0));

  // ── Apply leftover answer key entries (positional fallback) ──────────
  if (Object.keys(answerKey).length > 0) {
    const positionalAnswers = Object.entries(answerKey)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([, letter]) => letter);

    allQuestions.forEach((q, posIdx) => {
      if (!q.explanation && rationaleMap[q._qNumber]) {
        q.explanation = rationaleMap[q._qNumber];
      }
      if (q._hasAnswer) return;

      const letter =
        answerKey[q._qNumber] ??
        (posIdx < positionalAnswers.length ? positionalAnswers[posIdx] : undefined);

      if (letter !== undefined) {
        q.correctAnswer = letter;
        q._hasAnswer    = true;
      }
    });
  }

  return { results: allQuestions, errors };
}

// ── Validation ─────────────────────────────────────────────────────────

/**
 * Validates a single entrance exam question object.
 * Returns an array of error strings (empty = valid).
 */
export function validateEntranceQuestion(q) {
  const errors = [];
  if (!q.questionText || q.questionText.trim().length < 5)
    errors.push('Question text too short.');
  if (!q.options || Object.keys(q.options).length < 2)
    errors.push('Need at least 2 options.');
  if (!q.correctAnswer)
    errors.push('No correct answer marked.');
  if (q.correctAnswer && !q.options[q.correctAnswer])
    errors.push(`Correct answer "${q.correctAnswer}" not found in options.`);
  return errors;
}

// ── Firestore Formatter ─────────────────────────────────────────────────

/**
 * Formats a parsed entrance question for Firestore storage.
 *
 * meta shape (all optional):
 * {
 *   schoolId:    string,
 *   schoolName:  string,
 *   year:        string,   // e.g. '2024'
 *   subject:     string,   // e.g. 'Biology'
 *   inDailyBank: boolean,
 *   active:      boolean,
 * }
 */
export function formatEntranceQuestionForFirestore(q, meta = {}) {
  // Normalise options to a plain object { A, B, C, D }
  const options = {};
  if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
    OPT_LETTERS.forEach(l => {
      if (q.options[l] !== undefined) options[l] = q.options[l].trim();
    });
  } else if (Array.isArray(q.options)) {
    // Support for array-style options (from JSON blocks)
    q.options.forEach((text, i) => {
      if (i < OPT_LETTERS.length) options[OPT_LETTERS[i]] = (text || '').trim();
    });
  }

  return {
    questionText:  q.questionText.trim(),
    options,
    correctAnswer: q.correctAnswer || '',
    explanation:   q.explanation?.trim() || '',
    diagramUrl:    q.diagramUrl || '',
    questionType:  q.diagramUrl ? 'diagram' : 'text',

    // Meta
    schoolId:    meta.schoolId    || null,
    schoolName:  meta.schoolName  || '',
    year:        meta.year        || new Date().getFullYear().toString(),
    subject:     meta.subject     || '',
    inDailyBank: meta.inDailyBank ?? false,
    active:      meta.active      ?? true,

    createdAt: new Date().toISOString(),
  };
}
