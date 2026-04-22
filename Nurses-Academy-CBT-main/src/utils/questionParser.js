// src/utils/questionParser.js
// ─────────────────────────────────────────────────────────────────────
// Supports ALL these formats:
//
// FORMAT A — Inline answer:
//   1. Question?
//   A. Option   B. Option   C. Option   D. Option
//   Answer: C
//
// FORMAT B — Separate answer key (paste in second textarea):
//   1. C    or    1. C  2. A  3. D ...
//   2. A
//
// FORMAT C — Options on separate lines:
//   1. Question?
//   A) Option one
//   B) Option two
//   C) Option three
//   D) Option four
//   ANS: B
//
// FORMAT D — Inline options on same line:
//   1. Question? A. Opt1 B. Opt2 C. Opt3 D. Opt4
//
// FORMAT E — Mixed short options (2 per line):
//   A. Sympathy   C. Socialism
//   B. Criticism  D. Empathy
//
// FORMAT F — Prose paragraph options (each lettered option on its own line,
//             with a multi-sentence option body), followed by Answer: X and
//             Explanation: … on subsequent lines:
//   1. Long question text spanning one or more lines?
//   A. Long option text here
//   B. Another option text
//   C. Another option text
//   D. Another option text
//   Answer: B
//   Explanation: Rationale text here.
//
// FORMAT G — JSON object per question (single object or comma-separated list):
//   { "q": "Question text", "options": ["A. Opt1","B. Opt2","C. Opt3","D. Opt4"],
//     "answer": "B", "explanation": "..." }
//
// FORMAT H — Markdown --- separator blocks, options embedded in prose:
//   --- (separator)
//   Question paragraph. Options may appear inline:
//   A. Option one  B. Option two  C. Option three  D. Option four
//   Answer: B
//   Explanation: Rationale text here.
//
// ─────────────────────────────────────────────────────────────────────

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
 * Shuffles the options of a single parsed question and
 * updates correctIndex to point to wherever the correct
 * answer landed after the shuffle.
 *
 * Expects question shape:
 *   { options: string[], correctIndex: number, ... }
 */
export function shuffleQuestionOptions(question) {
  const options = question.options.map(o =>
    typeof o === 'string' ? o : (o.text || '')
  );

  if (options.length < 2) return question;

  const correctText = options[question.correctIndex] ?? options[0];
  const shuffled    = shuffleArray(options);
  const newIndex    = shuffled.indexOf(correctText);

  return {
    ...question,
    options:      shuffled,
    correctIndex: newIndex >= 0 ? newIndex : 0,
  };
}

/**
 * Shuffles options for every question in an array.
 * Call this on the parsed result before uploading to Firestore.
 */
export function shuffleAllQuestionsOptions(questions) {
  return questions.map(shuffleQuestionOptions);
}

// ── Answer Key Parser ─────────────────────────────────────────────────

export function parseAnswerKey(answerText) {
  if (!answerText?.trim()) return {};

  const normalized = answerText
    .replace(/\r/g, '')
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, ' ');

  const map = {};

  // Universal pattern — handles: "1. B", "1) B", "1: B", "1 B", "1.B",
  //   "Q1: B", "Q1. B", "Q1. Answer: B" and packed "Q1: B    Q2: A" on one line.
  const pattern = /Q?(\d+)\s*[.):–\-]?\s*(?:Answer\s*:\s*)?([A-Ea-e])\b/gi;
  let m;
  while ((m = pattern.exec(normalized)) !== null) {
    map[parseInt(m[1], 10)] = m[2].toUpperCase();
  }

  // Fallback: letter-only lines with implied sequence (e.g. "B\nA\nC\nD")
  if (Object.keys(map).length === 0) {
    const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      const single = line.match(/^([A-Ea-e])\s*$/i);
      if (single) map[i + 1] = single[1].toUpperCase();
    });
  }

  return map;
}

// Parses rationales from answer key textarea (e.g. "Q1. Answer: B\nRationale: ...")
export function parseRationaleKey(answerText) {
  if (!answerText?.trim()) return {};

  const rationaleMap = {};
  const lines = answerText.replace(/\r/g, '').split('\n');
  let currentNum = null;
  let currentRationale = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect Q1. Answer: B or Q1. B lines
    const qLine = trimmed.match(/^Q?(\d+)\s*[.):–\-]?\s*(?:Answer\s*:\s*)?[A-Ea-e]\b/i);
    if (qLine) {
      if (currentNum !== null && currentRationale) {
        rationaleMap[currentNum] = currentRationale.trim();
      }
      currentNum = parseInt(qLine[1], 10);
      currentRationale = '';
      continue;
    }

    // Detect Rationale: / Explanation: lines
    const ratLine = trimmed.match(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i);
    if (ratLine && currentNum !== null) {
      currentRationale = trimmed.replace(/^(rationale|explanation|explain|reason|note)[\s\.\:\-]*/i, '').trim();
      continue;
    }

    // Continuation of rationale text
    if (currentNum !== null && currentRationale && trimmed) {
      currentRationale += ' ' + trimmed;
    }
  }

  // Save last one
  if (currentNum !== null && currentRationale) {
    rationaleMap[currentNum] = currentRationale.trim();
  }

  return rationaleMap;
}

// ── FORMAT G: JSON Block Pre-processor ───────────────────────────────
//
// Detects JSON objects (Format G) anywhere in rawText, extracts them,
// parses them, and returns an array of normalised question objects that
// can be merged with the line-by-line parser output.
//
// Handles both single objects and arrays of objects.
// Tolerates the "q" key as well as "question" for the question text.
// Options can be:
//   ["A. text", "B. text", ...]  — letter-prefixed strings
//   ["text1", "text2", ...]      — plain strings (assigned A, B, C, D…)

function parseJsonBlocks(rawText) {
  const questions = [];
  const optLetters = ['A', 'B', 'C', 'D', 'E'];

  // Match JSON objects that look like question objects.
  // We use a balanced-brace scanner rather than a fragile regex.
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

  // Also try to parse a top-level JSON array
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

    const answerRaw = (obj.answer || obj.Answer || obj.correct || obj.Correct || '').toString().trim();
    const explanation = (obj.explanation || obj.Explanation || obj.rationale || obj.Rationale || '').toString().trim();

    // Normalise options — strip leading letter prefix if present
    const parsedOpts = rawOptions.map((o, idx) => {
      const str = (typeof o === 'string' ? o : JSON.stringify(o)).trim();
      const prefixMatch = str.match(/^([A-Ea-e])[\.\)\-:]\s*/);
      if (prefixMatch) {
        return { letter: prefixMatch[1].toUpperCase(), text: str.slice(prefixMatch[0].length).trim() };
      }
      return { letter: optLetters[idx] || String.fromCharCode(65 + idx), text: str };
    });

    // Sort A→E
    parsedOpts.sort((a, b) => optLetters.indexOf(a.letter) - optLetters.indexOf(b.letter));

    // Resolve correct answer
    const answerLetter = answerRaw.match(/^([A-Ea-e])\b/i)?.[1]?.toUpperCase() || null;
    const correctIdx = answerLetter !== null
      ? parsedOpts.findIndex(o => o.letter === answerLetter)
      : -1;

    questions.push({
      _fromJson: true,
      question:     qText.trim(),
      options:      parsedOpts.map(o => o.text),
      correctIndex: correctIdx >= 0 ? correctIdx : 0,
      explanation,
      imageUrl:     '',
      explanationImageUrl: '',
      _hasAnswer:   correctIdx >= 0,
      _sortedLetters: parsedOpts.map(o => o.letter),
    });
  }

  return questions;
}

// ── FORMAT H: Markdown Separator Block Pre-processor ─────────────────
//
// Splits text on "---" separators and parses each block independently
// when the block does NOT start with a numbered question line.
// Numbered blocks are left for the main line-by-line parser.
//
// KEY FIX: options on a single line like
//   "A. Long text with periods. B. Another long option C. Short D. Short"
// are split by scanning for (?:^|\s)X. positions rather than a lookahead
// regex, because lookaheads break when option bodies contain sentences.

function _splitInlineOptions(line) {
  // Find every position where a stand-alone "X." occurs (X = A-E).
  // "Stand-alone" means the letter is at the start of the string or
  // preceded by whitespace — this prevents matching mid-word periods.
  const positions = [];
  const re = /(?:^|\s)([A-Ea-e])[\.]\s+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    // m.index points to the space before the letter (or 0 at start)
    positions.push({
      letter: m[1].toUpperCase(),
      index:  m.index === 0 ? 0 : m.index + 1,
    });
  }
  if (positions.length < 2) return null;

  return positions.map((p, i) => {
    const end  = i + 1 < positions.length ? positions[i + 1].index : line.length;
    const text = line.slice(p.index, end).trim().replace(/^[A-Ea-e]\.\s*/i, '').trim();
    return { letter: p.letter, text };
  });
}

function parseMarkdownSeparatorBlocks(rawText, startSeq = 1) {
  const optLetters = ['A', 'B', 'C', 'D', 'E'];
  const questions  = [];
  let seqCounter   = startSeq - 1;

  // Split on markdown horizontal rules (---, ***, ___ on their own line)
  const blocks = rawText.split(/^[\-\*\_]{3,}\s*$/m).map(b => b.trim()).filter(Boolean);

  for (const block of blocks) {
    // Skip blocks that start with a question number — handled by main parser
    if (/^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s])/.test(block)) continue;
    // Skip pure JSON blocks — handled by parseJsonBlocks
    if (/^\s*\{/.test(block)) continue;

    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    seqCounter++;

    let questionLines = [];
    let optionMap     = {};  // letter → text
    let answerLetter  = null;
    let explanationLines = [];
    let inExplanation = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Answer line
      if (/^(answer|ans|correct|key|solution)[\s\.\:\-]*/i.test(line)) {
        const cleaned = line.replace(/^(answer|ans|correct|key|solution)[\s\.\:\-]*/i, '').trim();
        const m = cleaned.match(/^([A-Ea-e])\b/i);
        if (m) answerLetter = m[1].toUpperCase();
        inExplanation = false;
        continue;
      }

      // Explanation line
      if (/^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i.test(line)) {
        const rest = line.replace(/^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i, '').trim();
        if (rest) explanationLines.push(rest);
        inExplanation = true;
        continue;
      }

      if (inExplanation) {
        explanationLines.push(line);
        continue;
      }

      // ── Try inline multi-option split first ───────────────────────────
      // Handles: "A. Long text B. More text C. Short D. Also short"
      // even when option bodies contain sentences with periods.
      const inlineOpts = _splitInlineOptions(line);
      if (inlineOpts && inlineOpts.length >= 2) {
        inlineOpts.forEach(o => { if (!optionMap[o.letter]) optionMap[o.letter] = o.text; });
        continue;
      }

      // Single option line: "A. text" or "A) text"
      const singleOpt = line.match(/^([A-Ea-e])[\.\)\-:]\s+(.+)$/i);
      if (singleOpt) {
        const letter = singleOpt[1].toUpperCase();
        const text   = singleOpt[2].trim();
        if (!optionMap[letter]) optionMap[letter] = text;
        continue;
      }

      // Otherwise this is question text (collected before any options appear)
      if (Object.keys(optionMap).length === 0) {
        questionLines.push(line);
      }
    }

    const questionText = questionLines.join(' ').trim();
    if (!questionText || Object.keys(optionMap).length < 2) continue;

    // Sort options A→E
    const sortedOpts = Object.entries(optionMap)
      .sort((a, b) => optLetters.indexOf(a[0]) - optLetters.indexOf(b[0]));

    const correctIdx = answerLetter !== null
      ? sortedOpts.findIndex(([letter]) => letter === answerLetter)
      : -1;

    questions.push({
      _fromSeparatorBlock: true,
      _seq:    seqCounter,
      _qNumber: seqCounter,
      question:     questionText,
      options:      sortedOpts.map(([, text]) => text),
      correctIndex: correctIdx >= 0 ? correctIdx : 0,
      explanation:  explanationLines.join(' ').trim(),
      imageUrl:     '',
      explanationImageUrl: '',
      _hasAnswer:   correctIdx >= 0,
      _sortedLetters: sortedOpts.map(([letter]) => letter),
    });
  }

  return questions;
}

// ── Main Parser ───────────────────────────────────────────────────────

export function parseQuestionsFromText(rawText, answerKeyText = '') {
  const answerKey    = parseAnswerKey(answerKeyText);
  const rationaleMap = parseRationaleKey(answerKeyText);

  // ── Pre-pass 1: Extract JSON blocks (Format G) ──────────────────────
  // Remove JSON objects from rawText so they don't confuse the line parser.
  let cleanedText = rawText;
  const jsonQuestions = parseJsonBlocks(rawText);

  if (jsonQuestions.length > 0) {
    // Strip JSON segments from the text fed to the line parser
    // Using the same balanced-brace scanner
    let depth = 0;
    let start = -1;
    let stripped = '';
    let lastEnd = 0;
    for (let i = 0; i < rawText.length; i++) {
      const ch = rawText[i];
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          // Check if the object looks like a question object (has "q" or "question" key)
          const seg = rawText.slice(start, i + 1);
          let isQ = false;
          try {
            const obj = JSON.parse(seg);
            if (obj && (obj.q || obj.question || obj.Question || obj.Q)) isQ = true;
          } catch (_) {}
          if (isQ) {
            stripped += rawText.slice(lastEnd, start);
            lastEnd = i + 1;
          }
          start = -1;
        }
      }
    }
    stripped += rawText.slice(lastEnd);
    cleanedText = stripped;
  }

  // ── Pre-pass 2: Extract --- separator blocks (Format H) ─────────────
  // Only extract blocks that don't begin with a numbered question.
  const separatorQuestions = parseMarkdownSeparatorBlocks(cleanedText);

  // Remove separator-block content from cleanedText if blocks were found
  if (separatorQuestions.length > 0) {
    // Strip non-numbered blocks between --- markers so line parser ignores them
    cleanedText = cleanedText.replace(
      /(^|\n)[\-\*\_]{3,}\s*\n([\s\S]*?)(?=([\-\*\_]{3,}|\d+[\.\)]\s|\Z))/gm,
      (match, prefix, body) => {
        // Keep numbered blocks intact
        if (/^\d+[\.\)]\s/.test(body.trim())) return match;
        return prefix + '\n';
      }
    );
  }

  // ── Line-by-line parser (Formats A–F) ───────────────────────────────
  const lines = cleanedText.split('\n').map(l => l.trim()).filter(Boolean);
  const questions = [];
  let current = null;
  let seqCounter = 0;

  const optLetters = ['A', 'B', 'C', 'D', 'E'];

  const isQuestionLine = (line) =>
    /^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i.test(line);

  const isOptionLine = (line) =>
    /^([A-Ea-e][\.\)\-:]|\([A-Ea-e]\))\s*.+/i.test(line);

  const isAnswerLine = (line) =>
    /^(answer|ans|correct|key|solution)[\s\.\:\-]*/i.test(line);

  const isExplanationLine = (line) =>
    /^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i.test(line);

  // Extract [image: URL] tag from any line
  const extractImageTag = (text) => {
    const m = text.match(/\[image:\s*(https?:\/\/[^\]]+)\]/i);
    return m ? { url: m[1].trim(), text: text.replace(m[0], '').trim() } : { url: '', text };
  };

  const getQuestionNumber = (line) => {
    const m = line.match(/^(\d+)/);
    return m ? parseInt(m[1]) : null;
  };

  const extractOptionLetter = (line) => {
    const m = line.match(/^([A-Ea-e])[\.\)\-:]|\(([A-Ea-e])\)/i);
    return m ? (m[1] || m[2]).toUpperCase() : null;
  };

  const extractOptionText = (line) => {
    return line.replace(/^([A-Ea-e][\.\)\-:]|\([A-Ea-e]\))\s*/i, '').trim();
  };

  const extractAnswerLetter = (line) => {
    const cleaned = line.replace(/^(answer|ans|correct|key|solution)[\s\.\:\-]*/i, '').trim();
    const m = cleaned.match(/^([A-Ea-e])\b/i);
    return m ? m[1].toUpperCase() : null;
  };

  // Try to detect inline options on same line as question
  // e.g. "1. Question text? A. Opt1 B. Opt2 C. Opt3 D. Opt4"
  const extractInlineOptions = (line) => {
    const optPattern = /\b([A-D])\.\s*([^A-D\.]{2,}?)(?=\s+[A-D]\.|$)/g;
    const opts = [];
    let m;
    while ((m = optPattern.exec(line)) !== null) {
      opts.push({ letter: m[1].toUpperCase(), text: m[2].trim() });
    }
    return opts.length >= 2 ? opts : null;
  };

  // Detect two options on same line (short format):
  // "A. Sympathy   C. Socialism"
  const extractDoubleOptions = (line) => {
    const m = line.match(
      /^([A-Ea-e])[\.\)]\s*(.+?)\s{2,}([A-Ea-e])[\.\)]\s*(.+)$/i
    );
    if (m) {
      return [
        { letter: m[1].toUpperCase(), text: m[2].trim() },
        { letter: m[3].toUpperCase(), text: m[4].trim() },
      ];
    }
    return null;
  };

  // ── Format F detection helper ────────────────────────────────────────
  // Detects a line that contains ONLY a letter+dot option prefix followed
  // by a long prose body (no trailing letter-dot patterns) — characteristic
  // of Format F where each option is on its own full line.
  const isProseParagraphOption = (line) => {
    return /^[A-Ea-e][\.\)]\s+.{10,}$/i.test(line) && !extractDoubleOptions(line);
  };

  const saveQuestion = () => {
    if (!current) return;
    if (current.question && current.options.length >= 2) {
      const sortedOpts = [...current.options].sort(
        (a, b) => optLetters.indexOf(a.letter) - optLetters.indexOf(b.letter)
      );

      let correctLetter = null;
      if (current.answerLetter) {
        correctLetter = current.answerLetter;
      } else if (answerKey[current.qNumber] !== undefined) {
        correctLetter = answerKey[current.qNumber];
      }

      const correctIdx = correctLetter !== null
        ? sortedOpts.findIndex(o => o.letter === correctLetter)
        : -1;

      questions.push({
        question:       current.question.trim(),
        options:        sortedOpts.map(o => o.text),
        correctIndex:   correctIdx >= 0 ? correctIdx : -1,
        explanation:    current.explanation || '',
        imageUrl:       current.imageUrl || '',
        explanationImageUrl: current.explanationImageUrl || '',
        _seq:           current.seq,
        _qNumber:       current.qNumber,
        _hasAnswer:     correctIdx >= 0,
        _sortedLetters: sortedOpts.map(o => o.letter),
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip markdown separator lines (--- / *** / ___)
    if (/^[\-\*\_]{3,}\s*$/.test(line)) continue;

    if (isQuestionLine(line)) {
      saveQuestion();
      seqCounter++;
      const labelNum = getQuestionNumber(line) || seqCounter;

      let qText = line.replace(/^(\d+[\.\)]\s*|Q\s*\d+[\.\):\s]\s*|Question\s*\d+[\.\):\s]\s*)/i, '').trim();

      const qImg = extractImageTag(qText);
      qText = qImg.text;

      const inlineOpts = extractInlineOptions(qText);
      if (inlineOpts && inlineOpts.length >= 2) {
        const firstOptPos = qText.search(/\b[A-D]\.\s/);
        if (firstOptPos > 0) qText = qText.substring(0, firstOptPos).trim();
        current = {
          question: qText, options: inlineOpts, answerLetter: null,
          explanation: '', seq: seqCounter, qNumber: labelNum,
          imageUrl: qImg.url, explanationImageUrl: '',
        };
      } else {
        current = {
          question: qText, options: [], answerLetter: null,
          explanation: '', seq: seqCounter, qNumber: labelNum,
          imageUrl: qImg.url, explanationImageUrl: '',
        };
      }
      continue;
    }

    if (!current) continue;

    // Double options on one line (e.g. "A. Sympathy   C. Socialism")
    if (!isAnswerLine(line) && !isExplanationLine(line)) {
      const double = extractDoubleOptions(line);
      if (double) {
        double.forEach(o => {
          if (!current.options.find(x => x.letter === o.letter)) {
            current.options.push(o);
          }
        });
        continue;
      }
    }

    // ── Format F: prose paragraph options ─────────────────────────────
    // A single option may span multiple lines. We collect continuation
    // lines (not starting with another option/answer/explanation) as part
    // of the same option body.
    if (isProseParagraphOption(line) && !isAnswerLine(line) && !isExplanationLine(line)) {
      const letter = extractOptionLetter(line);
      let text     = extractOptionText(line);

      // Collect continuation lines for this option (Format F multi-line body)
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (
          isQuestionLine(next) ||
          isOptionLine(next) ||
          isAnswerLine(next) ||
          isExplanationLine(next) ||
          /^[\-\*\_]{3,}\s*$/.test(next)
        ) break;
        text += ' ' + next;
        i++;
      }

      if (letter && text && !current.options.find(o => o.letter === letter)) {
        current.options.push({ letter, text: text.trim() });
      }
      continue;
    }

    // Single option line
    if (isOptionLine(line)) {
      const letter = extractOptionLetter(line);
      const text   = extractOptionText(line);
      if (letter && text && !current.options.find(o => o.letter === letter)) {
        current.options.push({ letter, text });
      }
      continue;
    }

    // Answer line
    if (isAnswerLine(line)) {
      current.answerLetter = extractAnswerLetter(line);
      continue;
    }

    // Explanation line
    if (isExplanationLine(line)) {
      let explText = line.replace(/^(explanation|explain|rationale|reason|note|solution)[\s\.\:\-]*/i, '').trim();
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (isQuestionLine(next) || isOptionLine(next) || isAnswerLine(next) || /^[\-\*\_]{3,}/.test(next)) break;
        explText += ' ' + next;
        i++;
      }
      const explImg = extractImageTag(explText);
      current.explanation = explImg.text;
      if (explImg.url) current.explanationImageUrl = explImg.url;
      continue;
    }

    // Continuation of question text (before any options)
    if (current.options.length === 0 && !isOptionLine(line)) {
      current.question += ' ' + line;
    }
  }

  saveQuestion();

  // ── Merge all sources ────────────────────────────────────────────────
  // Assign sequential positions to JSON and separator-block questions
  // so they sort correctly relative to line-parser questions.
  let mergedSeq = questions.length;
  jsonQuestions.forEach(q => {
    mergedSeq++;
    q._seq = mergedSeq;
    q._qNumber = mergedSeq;
  });
  separatorQuestions.forEach(q => {
    mergedSeq++;
    q._seq = mergedSeq;
    q._qNumber = mergedSeq;
  });

  const allQuestions = [...questions, ...jsonQuestions, ...separatorQuestions];

  // Sort by sequential position
  allQuestions.sort((a, b) => (a._seq || 0) - (b._seq || 0));

  // ── Apply separate answer key ────────────────────────────────────────
  if (Object.keys(answerKey).length > 0) {
    const positionalAnswers = Object.entries(answerKey)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([, letter]) => letter);

    allQuestions.forEach((q, posIdx) => {
      if (!q.explanation && rationaleMap[q._qNumber]) {
        q.explanation = rationaleMap[q._qNumber];
      }

      if (q._hasAnswer) return;

      let letter = answerKey[q._qNumber];
      if (letter === undefined && posIdx < positionalAnswers.length) {
        letter = positionalAnswers[posIdx];
      }

      if (letter !== undefined) {
        const idx = q._sortedLetters
          ? q._sortedLetters.indexOf(letter)
          : optLetters.indexOf(letter);
        q.correctIndex = idx >= 0 ? idx : 0;
        q._hasAnswer   = true;
      } else {
        q.correctIndex = 0;
      }
    });
  } else {
    allQuestions.forEach(q => { if (q.correctIndex < 0) q.correctIndex = 0; });
  }

  return allQuestions;
}

export function validateQuestion(q) {
  const errors = [];
  if (!q.question || q.question.trim().length < 5) errors.push('Question text too short.');
  if (!q.options || q.options.length < 2) errors.push('Need at least 2 options.');
  if (q.correctIndex === undefined || q.correctIndex < 0) errors.push('No correct answer marked.');
  if (q.options && q.correctIndex >= q.options.length) errors.push('Correct index out of range.');
  return errors;
}

export function formatQuestionForFirestore(q, meta = {}) {
  const options = Array.isArray(q.options)
    ? q.options.map(o => (typeof o === 'string' ? o : o.text || '').trim())
    : [];
  return {
    question:     q.question.trim(),
    options,
    correctIndex: (q.correctIndex !== undefined && q.correctIndex >= 0) ? q.correctIndex : 0,
    explanation:  q.explanation?.trim() || '',
    imageUrl:     q.imageUrl || '',
    explanationImageUrl: q.explanationImageUrl || '',
    category:     meta.category     || 'general_nursing',
    examType:     meta.examType     || 'past_questions',
    year:         meta.year         || '2024',
    subject:      meta.subject      || '',
    difficulty:   meta.difficulty   || 'medium',
    tags:         meta.tags         || [],
    source:       meta.source       || '',
    course:       meta.course       || '',
    topic:        meta.topic        || '',
    active:       true,
    createdAt:    new Date().toISOString(),
  };
}
