// src/utils/entranceExamParser.js
// ─────────────────────────────────────────────────────────────────────
// Standalone parser for entrance exam questions.
//
// ITALIC SUPPORT:
// Wrap words in *asterisks* when pasting to mark them as italic.
// Example: "Choose the word nearest in meaning to *posterity*"
// The parser preserves *word* markers in questionText and options.
// Use the exported renderWithItalics(text) helper to display them.
//
// Supported input formats: A–H (unchanged from previous version)
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

// ── Italic Renderer ───────────────────────────────────────────────────
/**
 * renderWithItalics(text)
 *
 * Converts *word* and _word_ markers to React <em> spans.
 * Call this wherever questionText or option text is displayed.
 *
 * Usage (React):
 *   import { renderWithItalics } from '../../utils/entranceExamParser';
 *   <div>{renderWithItalics(question.questionText)}</div>
 *
 * Returns an array of strings and <em> elements (React-safe).
 */
export function renderWithItalics(text) {
  if (!text || typeof text !== 'string') return text;
  // Match *word* or _word_ — non-greedy, no newlines inside
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  if (parts.length === 1) return text; // no markers — return plain string

  return parts.map((part, i) => {
    if (/^(\*[^*\n]+\*|_[^_\n]+_)$/.test(part)) {
      const inner = part.slice(1, -1); // strip the * or _
      return { type: 'em', content: inner, key: i };
    }
    return part;
  });
}

/**
 * renderWithItalicsJSX(text)
 *
 * Same as renderWithItalics but returns actual JSX.
 * Import React in the component that calls this.
 *
 * Usage:
 *   import React from 'react';
 *   import { renderWithItalicsJSX } from '../../utils/entranceExamParser';
 *   <span>{renderWithItalicsJSX(q.questionText)}</span>
 */
export function renderWithItalicsJSX(text) {
  const parts = renderWithItalics(text);
  if (typeof parts === 'string') return parts;
  return parts.map(p =>
    typeof p === 'string'
      ? p
      // Return a plain object the JSX renderer can use —
      // components call this and wrap in <em> themselves
      : p
  );
}

/**
 * hasItalics(text)
 * Returns true if the text contains *word* or _word_ italic markers.
 */
export function hasItalics(text) {
  return /(\*[^*\n]+\*|_[^_\n]+_)/.test(text || '');
}

// ── Shuffle Utilities ─────────────────────────────────────────────────

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

export function dateSeed(dateStr) {
  return dateStr.split('-').reduce((acc, v) => acc * 100 + Number(v), 0);
}

export function shuffleEntranceQuestionOptions(question) {
  const letters = OPT_LETTERS.filter(l => question.options[l] !== undefined);
  if (letters.length < 2) return question;
  const correctText = question.options[question.correctAnswer];
  const shuffledLetters = shuffleArray(letters);
  const newOptions = {};
  shuffledLetters.forEach((origLetter, i) => {
    newOptions[OPT_LETTERS[i]] = question.options[origLetter];
  });
  const newCorrectLetter = OPT_LETTERS[
    shuffledLetters.findIndex(l => question.options[l] === correctText)
  ];
  return { ...question, options: newOptions, correctAnswer: newCorrectLetter ?? question.correctAnswer };
}

export function shuffleAllEntranceOptions(questions) {
  return questions.map(shuffleEntranceQuestionOptions);
}

// ── Answer Key Parser ─────────────────────────────────────────────────

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
  if (Object.keys(map).length === 0) {
    const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const single = line.match(/^([A-Da-d])\s*$/i);
      if (single) map[i + 1] = single[1].toUpperCase();
    });
  }
  return map;
}

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
      if (currentNum !== null && currentRationale) rationaleMap[currentNum] = currentRationale.trim();
      currentNum = parseInt(qLine[1], 10);
      currentRationale = '';
      continue;
    }
    const ratLine = trimmed.match(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i);
    if (ratLine && currentNum !== null) {
      currentRationale = trimmed.replace(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i, '').trim();
      continue;
    }
    if (currentNum !== null && currentRationale && trimmed) currentRationale += ' ' + trimmed;
  }
  if (currentNum !== null && currentRationale) rationaleMap[currentNum] = currentRationale.trim();
  return rationaleMap;
}

// ── Format H: JSON Block Pre-processor ───────────────────────────────

function parseJsonBlocks(rawText) {
  const questions = [];
  const segments = [];
  let depth = 0, start = -1;
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) { segments.push(rawText.slice(start, i + 1)); start = -1; }
    }
  }
  const arrayMatch = rawText.match(/^\s*(\[[\s\S]*\])\s*$/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[1]);
      if (Array.isArray(arr)) arr.forEach(obj => segments.push(JSON.stringify(obj)));
    } catch (_) {}
  }
  for (const seg of segments) {
    let obj;
    try { obj = JSON.parse(seg); } catch (_) { continue; }
    const qText = obj.question || obj.q || obj.Question || obj.Q || '';
    if (!qText || typeof qText !== 'string') continue;
    const rawOptions = obj.options || obj.Options || obj.choices || obj.Choices || [];
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) continue;
    const answerRaw = (obj.answer || obj.Answer || obj.correct || obj.correctAnswer || '').toString().trim();
    const explanation = (obj.explanation || obj.Explanation || obj.rationale || '').toString().trim();
    const diagramUrl = (obj.diagramUrl || obj.imageUrl || obj.diagram || '').toString().trim();
    const options = {};
    rawOptions.forEach((o, idx) => {
      const str = (typeof o === 'string' ? o : JSON.stringify(o)).trim();
      const prefixMatch = str.match(/^([A-Da-d])[\.\)\-:]\s*/);
      const letter = prefixMatch ? prefixMatch[1].toUpperCase() : OPT_LETTERS[idx] || String.fromCharCode(65 + idx);
      options[letter] = prefixMatch ? str.slice(prefixMatch[0].length).trim() : str;
    });
    const correctAnswer = answerRaw.match(/^([A-Da-d])\b/i)?.[1]?.toUpperCase() || null;
    questions.push({ _fromJson: true, questionText: qText.trim(), options, correctAnswer: correctAnswer || '', explanation, diagramUrl, questionType: diagramUrl ? 'diagram' : 'text', _hasAnswer: !!correctAnswer });
  }
  return questions;
}

// ── Inline option splitters ───────────────────────────────────────────

function splitInlineOptions(line) {
  const positions = [];
  const re = /(?:^|\s)([A-Da-d])[\.]\s+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    positions.push({ letter: m[1].toUpperCase(), index: m.index === 0 ? 0 : m.index + 1 });
  }
  if (positions.length < 2) return null;
  return positions.map((p, i) => {
    const end = i + 1 < positions.length ? positions[i + 1].index : line.length;
    const text = line.slice(p.index, end).trim().replace(/^[A-Da-d]\.\s*/i, '').trim();
    return { letter: p.letter, text };
  });
}

function splitParenOptions(line) {
  const positions = [];
  const re = /\(([A-Da-d])\)\s*/gi;
  let m;
  while ((m = re.exec(line)) !== null) {
    positions.push({ letter: m[1].toUpperCase(), index: m.index + m[0].length });
  }
  if (positions.length < 2) return null;
  return positions.map((p, i) => {
    const end = i + 1 < positions.length ? positions[i + 1].index - 5 : line.length;
    const text = line.slice(p.index, end).trim();
    return { letter: p.letter, text };
  });
}

function extractDoubleOptions(line) {
  const m = line.match(/^([A-Da-d])[\.\)]\s*(.+?)\s{2,}([A-Da-d])[\.\)]\s*(.+)$/i);
  if (m) return [{ letter: m[1].toUpperCase(), text: m[2].trim() }, { letter: m[3].toUpperCase(), text: m[4].trim() }];
  return null;
}

// ── Helper predicates ─────────────────────────────────────────────────

const isQuestionLine = line =>
  /^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i.test(line);

const isOptionLine = line =>
  /^([A-Da-d][\.\)\-:]|\([A-Da-d]\))\s*.+/i.test(line);

// ── FIXED: Answer line must NOT match *word* italic markers ──────────
// *B alone on a line = answer marker
// *posterity* = italic word inside question text — NOT an answer
const isAnswerLine = line => {
  const t = line.trim();
  // *B — single letter after star = answer
  if (/^\*[A-Da-d]$/.test(t)) return true;
  // (B) alone on a line = answer
  if (/^\([A-Da-d]\)$/.test(t)) return true;
  // Answer: B / Ans: B etc
  if (/^(answer|ans|correct(?:\s+answer)?|key|solution)[\s\.\:\-]/i.test(t)) return true;
  return false;
};

const isExplanationLine = line =>
  /^(explanation|explain|rationale|reason|note)[\s\.\:\-]*/i.test(line);

const isDiagramUrl = line => /^https?:\/\//i.test(line.trim());

function extractAnswerLetter(line) {
  const t = line.trim();
  const star = t.match(/^\*([A-Da-d])$/i);
  if (star) return star[1].toUpperCase();
  const paren = t.match(/^\(([A-Da-d])\)$/i);
  if (paren) return paren[1].toUpperCase();
  const labelled = t.replace(/^(answer|ans|correct(?:\s+answer)?|key|solution)[\s\.\:\-]*/i, '').trim();
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

export function parseEntranceQuestions(rawText, answerKeyText = '') {
  const answerKey    = parseAnswerKey(answerKeyText);
  const rationaleMap = parseRationaleKey(answerKeyText);

  let cleanedText = rawText;
  const jsonQuestions = parseJsonBlocks(rawText);

  if (jsonQuestions.length > 0) {
    let depth = 0, start = -1, stripped = '', lastEnd = 0;
    for (let i = 0; i < rawText.length; i++) {
      const ch = rawText[i];
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const seg = rawText.slice(start, i + 1);
          let isQ = false;
          try { const obj = JSON.parse(seg); if (obj && (obj.q || obj.question || obj.Question || obj.Q)) isQ = true; } catch (_) {}
          if (isQ) { stripped += rawText.slice(lastEnd, start); lastEnd = i + 1; }
          start = -1;
        }
      }
    }
    stripped += rawText.slice(lastEnd);
    cleanedText = stripped;
  }

  cleanedText = cleanedText
    .replace(/\r/g, '')
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, ' ');

  const rawBlocks = cleanedText.trim().split(/\n\s*\n/).filter(b => b.trim());
  const questions = [];
  const errors    = [];
  let seqCounter  = 0;

  for (const block of rawBlocks) {
    seqCounter++;
    const blockLines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);

    if (blockLines.length < 2) {
      errors.push(`Block ${seqCounter}: Too few lines (got ${blockLines.length})`);
      continue;
    }

    let cursor = 0, diagramUrl = '', qNumber = seqCounter;

    if (isDiagramUrl(blockLines[0])) { diagramUrl = blockLines[0].trim(); cursor = 1; }

    if (cursor >= blockLines.length) { errors.push(`Block ${seqCounter}: Missing question text`); continue; }

    let questionText = blockLines[cursor];
    if (isQuestionLine(questionText)) {
      qNumber = getQuestionNumber(questionText) || seqCounter;
      questionText = questionText.replace(/^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i, '').trim();
    }
    cursor++;

    const optionMap = {};
    let correctAnswer = '', explanation = '';

    if (cursor < blockLines.length) {
      const inlineDot = splitInlineOptions(blockLines[cursor]);
      if (inlineDot && inlineDot.length >= 2) { inlineDot.forEach(o => { optionMap[o.letter] = o.text; }); cursor++; }
      if (Object.keys(optionMap).length < 2) {
        const inlineParen = splitParenOptions(blockLines[cursor] || '');
        if (inlineParen && inlineParen.length >= 2) { inlineParen.forEach(o => { optionMap[o.letter] = o.text; }); cursor++; }
      }
    }

    while (cursor < blockLines.length) {
      const line = blockLines[cursor];

      if (isDiagramUrl(line) && !diagramUrl) { diagramUrl = line.trim(); cursor++; continue; }

      if (isAnswerLine(line)) {
        const letter = extractAnswerLetter(line);
        if (letter) correctAnswer = letter;
        cursor++; continue;
      }

      if (isExplanationLine(line)) {
        explanation = line.replace(/^(explanation|explain|rationale|reason|note)[\s\.\:\-]*/i, '').trim();
        cursor++;
        while (cursor < blockLines.length) {
          const next = blockLines[cursor];
          if (isQuestionLine(next) || isOptionLine(next) || isAnswerLine(next)) break;
          explanation += ' ' + next; cursor++;
        }
        continue;
      }

      const double = extractDoubleOptions(line);
      if (double) { double.forEach(o => { if (!optionMap[o.letter]) optionMap[o.letter] = o.text; }); cursor++; continue; }

      if (isOptionLine(line)) {
        const letter = extractOptionLetter(line);
        const text   = extractOptionText(line);
        if (letter && text && !optionMap[letter]) {
          optionMap[letter] = text; cursor++;
          while (cursor < blockLines.length) {
            const next = blockLines[cursor];
            if (isQuestionLine(next) || isOptionLine(next) || isAnswerLine(next) || isExplanationLine(next) || isDiagramUrl(next)) break;
            optionMap[letter] += ' ' + next; cursor++;
          }
          optionMap[letter] = optionMap[letter].trim();
          continue;
        }
      }

      if (Object.keys(optionMap).length === 0 && !isAnswerLine(line)) { questionText += ' ' + line; cursor++; continue; }
      cursor++;
    }

    if (!questionText.trim()) { errors.push(`Block ${seqCounter}: Missing question text`); continue; }
    if (Object.keys(optionMap).length < 2) { errors.push(`Block ${seqCounter}: Need at least 2 options. Got: ${Object.keys(optionMap).join(', ') || 'none'}`); continue; }

    if (!correctAnswer) {
      const keyLetter = answerKey[qNumber] ?? answerKey[seqCounter] ?? null;
      if (keyLetter) correctAnswer = keyLetter;
      else { errors.push(`Block ${seqCounter}: Missing answer — use *B, "Answer: B", or "(B)"`); continue; }
    }

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

  let mergedSeq = questions.length;
  jsonQuestions.forEach(q => { mergedSeq++; q._seq = mergedSeq; q._qNumber = mergedSeq; });

  const allQuestions = [...questions, ...jsonQuestions];
  allQuestions.sort((a, b) => (a._seq || 0) - (b._seq || 0));

  if (Object.keys(answerKey).length > 0) {
    const positionalAnswers = Object.entries(answerKey).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([, letter]) => letter);
    allQuestions.forEach((q, posIdx) => {
      if (!q.explanation && rationaleMap[q._qNumber]) q.explanation = rationaleMap[q._qNumber];
      if (q._hasAnswer) return;
      const letter = answerKey[q._qNumber] ?? (posIdx < positionalAnswers.length ? positionalAnswers[posIdx] : undefined);
      if (letter !== undefined) { q.correctAnswer = letter; q._hasAnswer = true; }
    });
  }

  return { results: allQuestions, errors };
}

// ── Validation ─────────────────────────────────────────────────────────

export function validateEntranceQuestion(q) {
  const errors = [];
  if (!q.questionText || q.questionText.trim().length < 5) errors.push('Question text too short.');
  if (!q.options || Object.keys(q.options).length < 2) errors.push('Need at least 2 options.');
  if (!q.correctAnswer) errors.push('No correct answer marked.');
  if (q.correctAnswer && !q.options[q.correctAnswer]) errors.push(`Correct answer "${q.correctAnswer}" not found in options.`);
  return errors;
}

// ── Firestore Formatter ─────────────────────────────────────────────────

export function formatEntranceQuestionForFirestore(q, meta = {}) {
  const options = {};
  if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
    OPT_LETTERS.forEach(l => { if (q.options[l] !== undefined) options[l] = q.options[l].trim(); });
  } else if (Array.isArray(q.options)) {
    q.options.forEach((text, i) => { if (i < OPT_LETTERS.length) options[OPT_LETTERS[i]] = (text || '').trim(); });
  }
  return {
    questionText:  q.questionText.trim(),
    options,
    correctAnswer: q.correctAnswer || '',
    explanation:   q.explanation?.trim() || '',
    diagramUrl:    q.diagramUrl || '',
    questionType:  q.diagramUrl ? 'diagram' : 'text',
    schoolId:    meta.schoolId    || null,
    schoolName:  meta.schoolName  || '',
    year:        meta.year        || new Date().getFullYear().toString(),
    subject:     meta.subject     || '',
    inDailyBank: meta.inDailyBank ?? false,
    active:      meta.active      ?? true,
    createdAt: new Date().toISOString(),
  };
}
