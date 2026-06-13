// src/utils/entranceExamParser.js
// ─────────────────────────────────────────────────────────────────────
// Standalone parser for entrance exam questions.
//
// RICH TEXT SUPPORT:
//   **word or phrase**   → bold
//   __word or phrase__   → underline
//   *word or phrase*     → italic  (also _word or phrase_)
//
// EXPLANATION LINE BREAKS:
//   Multi-line explanations preserve \n so vertical math layout is kept.
//   Use <ExplanationText text={q.explanation} /> to render correctly.
//   Blank lines inside explanations are preserved as empty lines.
//   There is NO word/character limit on explanations.
//
// Supported input formats: A–H
// ─────────────────────────────────────────────────────────────────────

export const ENTRANCE_SUBJECTS = [
  'English Language', 'Biology', 'Chemistry', 'Physics',
  'Mathematics', 'General Studies', 'Nursing Aptitude', 'Current Affairs',
];

export const ENTRANCE_YEARS = [
  '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025',
];

const OPT_LETTERS = ['A', 'B', 'C', 'D', 'E'];

// ── Rich Text Renderer ────────────────────────────────────────────────

const _TOKEN_RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|_[^_\n]+_|\*[^*\n]+\*)/g;

function _getMarkerInfo(part) {
  if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { tag: 'strong', strip: 2 };
  if (part.startsWith('__') && part.endsWith('__') && part.length > 4) return { tag: 'u',      strip: 2 };
  if (part.startsWith('*')  && part.endsWith('*')  && part.length > 2) return { tag: 'em',     strip: 1 };
  if (part.startsWith('_')  && part.endsWith('_')  && part.length > 2) return { tag: 'em',     strip: 1 };
  return null;
}

export function renderWithItalics(text) {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split(_TOKEN_RE).filter(p => p !== undefined && p !== '');
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const info = _getMarkerInfo(part);
    if (info) return { type: info.tag, content: part.slice(info.strip, -info.strip), key: i };
    return part;
  });
}

export function renderWithItalicsJSX(text) {
  return renderWithItalics(text);
}

export function hasItalics(text) {
  _TOKEN_RE.lastIndex = 0;
  return _TOKEN_RE.test(text || '');
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
    if (currentNum !== null && currentRationale && trimmed) currentRationale += '\n' + trimmed;
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

// Lines that are section headings to skip (e.g. **MATHEMATICS**, ENGLISH LANGUAGE)
const isSubjectHeading = line => {
  const t = line.trim();
  // Bold headings like **MATHEMATICS** or **PHYSICS**
  if (/^\*{1,3}[A-Z\s]+\*{0,3}$/.test(t) && t.length < 60) return true;
  // ALL-CAPS heading with no option-letter prefix (e.g. ENGLISH LANGUAGE, CHEMISTRY)
  if (/^[A-Z][A-Z\s]+$/.test(t) && t.length < 60 && !/^[A-D]\s/.test(t)) return true;
  return false;
};

// Lines that are instruction/meta lines to skip (e.g. "Instructions: Choose the option…")
const isInstructionLine = line =>
  /^(instruction|instructions|choose\s+the\s+option|in\s+each\s+of\s+the\s+following)/i.test(line.trim());

// ═══════════════════════════════════════════════════════════════════════
// CRITICAL FIX: isQuestionLine regex was too broad — it matched lines
// starting with digits (like "35→17 r1,") as question lines, causing
// explanation steps to be truncated. Now requires number + punctuation.
// ═══════════════════════════════════════════════════════════════════════
const isQuestionLine = line =>
  /^(\d+[\.\):]\s+|Q\s*\d+[\.\):\s]\s+|Question\s*\d+[\.\):\s]\s+)/i.test(line);

const isOptionLine = line =>
  /^([A-Da-d][\.\)\-:]|\([A-Da-d]\)|\-\s*\([A-Da-d]\))\s*.+/i.test(line);

const isAnswerLine = line => {
  const t = line.trim();
  if (/^\*{1,3}[A-Da-d]\*{0,2}$/.test(t))  return true;  // *C  ***D**  **D**
  if (/^__[A-Da-d]__$/.test(t))              return true;
  if (/^\*\*[A-Da-d]\*\*$/.test(t))          return true;
  if (/^\([A-Da-d]\)$/.test(t))              return true;
  if (/^(answer|ans|correct(?:\s+answer)?|key|solution)[\s\.\:\-]/i.test(t)) return true;
  return false;
};

const isExplanationLine = line =>
  /^(\*{0,2}explanation|explain|rationale|reason|note)\*{0,2}[\s\.\:\-]*/i.test(line.trim());

const isDiagramUrl = line => /^https?:\/\//i.test(line.trim());

function extractAnswerLetter(line) {
  const t = line.trim();
  // ***D**  ***D***  **D**  *D  formats
  const multistar = t.match(/^\*{1,3}([A-Da-d])\*{0,2}$/i);  if (multistar) return multistar[1].toUpperCase();
  const dunder    = t.match(/^__([A-Da-d])__$/i);              if (dunder)    return dunder[1].toUpperCase();
  const dstar     = t.match(/^\*\*([A-Da-d])\*\*$/i);          if (dstar)     return dstar[1].toUpperCase();
  const paren     = t.match(/^\(([A-Da-d])\)$/i);              if (paren)     return paren[1].toUpperCase();
  const labelled  = t.replace(/^(answer|ans|correct(?:\s+answer)?|key|solution)[\s\.\:\-]*/i, '').trim();
  const m = labelled.match(/^([A-Da-d])\b/i);
  return m ? m[1].toUpperCase() : null;
}

function getQuestionNumber(line) {
  const m = line.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractOptionLetter(line) {
  // Handles: A. text  A) text  A- text  (A) text  - (A) text
  const m = line.match(/^(?:\-\s*)?\(([A-Da-d])\)|^([A-Da-d])[\.\)\-:]/i);
  return m ? (m[1] || m[2]).toUpperCase() : null;
}

function extractOptionText(line) {
  // Strip leading: - (A)   (A)   A.   A)   A-
  return line.replace(/^(?:\-\s*)?\(([A-Da-d])\)\s*|^([A-Da-d])[\.\)\-:]\s*/i, '').trim();
}

// ── Subject heading extractor ─────────────────────────────────────────
// Maps heading text → canonical ENTRANCE_SUBJECTS value

const SUBJECT_MAP = [
  { pattern: /math/i,                      subject: 'Mathematics'     },
  { pattern: /physics/i,                   subject: 'Physics'         },
  { pattern: /chem/i,                      subject: 'Chemistry'       },
  { pattern: /biol/i,                      subject: 'Biology'         },
  { pattern: /english|literature|lang/i,   subject: 'English Language'},
  { pattern: /general\s*stud/i,            subject: 'General Studies' },
  { pattern: /nursing\s*apt/i,             subject: 'Nursing Aptitude'},
  { pattern: /current\s*affairs/i,         subject: 'Current Affairs' },
];

function extractSubjectFromHeading(line) {
  const clean = line.replace(/\*/g, '').trim();
  for (const { pattern, subject } of SUBJECT_MAP) {
    if (pattern.test(clean)) return subject;
  }
  return null;
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

  // Normalize \r but DO NOT collapse \n — line breaks needed for explanation layout
  cleanedText = cleanedText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, ' ');

  // ── KEY CHANGE: split blocks by blank lines but work with RAW lines ──
  // We keep the full raw text per block so blank lines inside explanations
  // can be preserved when collecting multi-line explanation text.
  const rawBlocks = cleanedText.trim().split(/\n\s*\n/).filter(b => b.trim());
  const questions = [];
  const errors    = [];
  let seqCounter  = 0;

  // Track current subject heading from **MATHEMATICS** / ENGLISH LANGUAGE etc.
  let currentDetectedSubject = null;

  for (const block of rawBlocks) {
    // rawLines preserves blank lines; blockLines is the trimmed+filtered version
    // used only for structural detection (question, options, answer).
    const rawLines   = block.split('\n');
    const blockLines = rawLines.map(l => l.trim()).filter(Boolean);

    if (blockLines.length === 0) continue;

    // ── Pure subject-heading block → update tracker, don't count as question ──
    if (blockLines.length === 1 && isSubjectHeading(blockLines[0])) {
      const detected = extractSubjectFromHeading(blockLines[0]);
      if (detected) currentDetectedSubject = detected;
      continue;
    }

    // ── Block starts with a subject heading (heading + questions merged) ──
    // Peel off leading heading line(s) and update subject tracker
    let cursor = 0;
    while (cursor < blockLines.length && isSubjectHeading(blockLines[cursor])) {
      const detected = extractSubjectFromHeading(blockLines[cursor]);
      if (detected) currentDetectedSubject = detected;
      cursor++;
    }

    if (cursor >= blockLines.length) continue; // nothing left after heading

    // ── Collect any leading instruction lines — prepend to question text ──
    const instructionPrefix = [];
    while (cursor < blockLines.length && isInstructionLine(blockLines[cursor])) {
      instructionPrefix.push(blockLines[cursor]);
      cursor++;
    }

    if (cursor >= blockLines.length) continue; // only instructions, no question

    seqCounter++;

    if (blockLines.length - cursor < 2) {
      errors.push(`Block ${seqCounter}: Too few lines (got ${blockLines.length - cursor})`);
      continue;
    }

    let diagramUrl = '', qNumber = seqCounter;

    if (isDiagramUrl(blockLines[cursor])) { diagramUrl = blockLines[cursor].trim(); cursor++; }

    if (cursor >= blockLines.length) { errors.push(`Block ${seqCounter}: Missing question text`); continue; }

    let questionText = blockLines[cursor];
    if (isQuestionLine(questionText)) {
      qNumber = getQuestionNumber(questionText) || seqCounter;
      questionText = questionText.replace(/^(\d+[\.\)\s\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i, '').trim();
    }
    // Strip leading/trailing bold markers from question text (e.g. **text**)
    questionText = questionText.replace(/^\*{1,3}|\*{1,3}$/g, '').trim();

    // Prepend instruction context if present (e.g. "Instructions: Choose the option most nearly opposite…")
    if (instructionPrefix.length > 0) {
      questionText = instructionPrefix.join(' ') + '\n' + questionText;
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
        // Strip the "Explanation:" label (including bold markers); keep remainder as first content
        const firstPart = line.replace(/^\*{0,2}(explanation|explain|rationale|reason|note)\*{0,2}[\s\.\:\-]*/i, '').trim();
        const explLines = firstPart ? [firstPart] : [];

        // ── FIXED: Find explanation marker in rawLines, then collect ──
        const explMarkerText = rawLines.find(rl => rl.trim() === line);
        let rawIdx = rawLines.findIndex(rl => rl === explMarkerText);
        if (rawIdx === -1) rawIdx = rawLines.findIndex(rl => rl.trim() === line);

        if (rawIdx !== -1) {
          rawIdx++;
          while (rawIdx < rawLines.length) {
            const nextRaw     = rawLines[rawIdx];
            const nextTrimmed = nextRaw.trim();
            if (isQuestionLine(nextTrimmed) || isAnswerLine(nextTrimmed)) break;
            explLines.push(nextTrimmed);
            rawIdx++;
          }
          cursor = blockLines.length;
        } else {
          cursor++;
          while (cursor < blockLines.length) {
            const next = blockLines[cursor];
            if (isQuestionLine(next) || isOptionLine(next) || isAnswerLine(next)) break;
            explLines.push(next);
            cursor++;
          }
        }

        while (explLines.length && explLines[explLines.length - 1] === '') explLines.pop();
        explanation = explLines.join('\n');
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
      questionText:      questionText.trim(),
      options:           optionMap,
      correctAnswer,
      explanation,
      diagramUrl,
      questionType:      diagramUrl ? 'diagram' : 'text',
      _detectedSubject:  currentDetectedSubject,   // ← auto-tagged from heading
      _seq:              seqCounter,
      _qNumber:          qNumber,
      _hasAnswer:        !!correctAnswer,
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
    explanation:   q.explanation || '',
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
