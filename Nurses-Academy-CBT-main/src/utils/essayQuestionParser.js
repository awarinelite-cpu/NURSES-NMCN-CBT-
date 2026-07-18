// src/utils/essayQuestionParser.js
// ─────────────────────────────────────────────────────────────────────────────
// Converts a pasted block of essay-exam text (the "COMPLETE_ESSAY_SET_.."
// format used for NACON theory papers) into structured data:
//
//   {
//     meta: {
//       setLabel, title, institution, courseCode, courseTitle,
//       examDate, timeAllowed, instruction
//     },
//     questions: [
//       {
//         number: 1,
//         stem: 'Mrs. Grace Musa, a 24-year-old ...' (scenario text, table lines stripped out),
//         table: { headers: ['Time', 'Cervical Dilatation (cm)', ...], rows: [[...], ...] } | null,
//         parts: [
//           { label: 'A', text: 'Plot all the above observations...', marks: '5 Marks' },
//           { label: 'B', text: 'Interpret the completed partograph...', marks: '1 Marks each' },
//           ...
//         ]
//       },
//       ...
//     ],
//     warnings: [ 'strings describing anything that looked off' ]
//   }
//
// Only question text is extracted — no answers/marking scheme, since these
// are theory/essay papers and students should only ever see the prompts.
// ─────────────────────────────────────────────────────────────────────────────

function firstMatch(re, text) {
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

/** Pull the header/meta block (everything before the first "Q1.") */
function parseMeta(headerText) {
  const lines = headerText.split('\n').map(l => l.trim()).filter(Boolean);

  const setLabel = firstMatch(/SET\s*(\d+)/i, headerText)
    ? `SET ${firstMatch(/SET\s*(\d+)/i, headerText)}`
    : '';

  // Title = the line mentioning "EXAMINATION" that isn't the very first
  // "COMPLETE_ESSAY_SET" marker line and isn't the institution line.
  const title = lines.find(l =>
    /EXAMINATION/i.test(l) && !/^COMPLETE_ESSAY_SET/i.test(l)
  ) || lines[0] || '';

  const institution = lines.find(l =>
    /COLLEGE|UNIVERSITY|SCHOOL OF NURSING|POLYTECHNIC/i.test(l)
  ) || '';

  const courseLine = firstMatch(/COURSE\s*CODE\s*\/?\s*TITLE\s*:\s*(.+)/i, headerText);
  let courseCode = '', courseTitle = '';
  if (courseLine) {
    const parts = courseLine.split(/\s*-\s*/);
    courseCode  = (parts.shift() || '').trim();
    courseTitle = parts.join(' - ').trim();
  }

  const examDate    = firstMatch(/DATE\s*:\s*(.+?)(?:\s+TIME ALLOWED|$)/i, headerText);
  const timeAllowed = firstMatch(/TIME ALLOWED\s*:\s*(.+)/i, headerText);
  const instruction = firstMatch(/INSTRUCTION\s*:\s*(.+)/i, headerText);

  return { setLabel, title, institution, courseCode, courseTitle, examDate, timeAllowed, instruction };
}

/** Split one "| a | b | c |" style row into trimmed cells. */
function splitTableRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map(c => c.trim());
}

/** True if a line is a markdown table separator row, e.g. "|---|:---:|---|". */
function isTableSeparator(line) {
  const t = line.trim();
  return /^[\s|:-]+$/.test(t) && t.includes('-') && t.includes('|');
}

/**
 * Detect a single markdown pipe-table block inside a stem (e.g. a partograph
 * observation chart embedded in a scenario) and pull it out into structured
 * { headers, rows }, returning the surrounding text with the table lines removed.
 * If no table is found, `table` is null and `text` is returned unchanged.
 */
export function extractTable(text) {
  const lines = String(text || '').split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const headerLine = lines[i];
    const sepLine = lines[i + 1];
    if ((headerLine.match(/\|/g) || []).length < 2) continue;
    if (!headerLine.trim() || !isTableSeparator(sepLine)) continue;

    const headers = splitTableRow(headerLine);

    let end = i + 2;
    const rows = [];
    while (end < lines.length && lines[end].trim() && lines[end].includes('|')) {
      rows.push(splitTableRow(lines[end]));
      end++;
    }

    if (rows.length === 0) continue; // separator with no data rows — not a real table

    const remaining = [...lines.slice(0, i), ...lines.slice(end)]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { text: remaining, table: { headers, rows } };
  }

  return { text: text.trim(), table: null };
}

/** Strip a trailing "5 Marks" / "1 mark each" / "4mark" style suffix off a part's text. */
export function extractMarks(text) {
  const re = /(\d+(?:\.\d+)?)\s*marks?\s*(each)?\.?\s*$/i;
  const m = text.match(re);
  if (!m) return { text: text.trim(), marks: '' };
  const marks = `${m[1]} mark${m[1] === '1' ? '' : 's'}${m[2] ? ' each' : ''}`;
  return { text: text.slice(0, m.index).trim(), marks };
}

/** Split one question's raw body into { stem, parts[] }. */
function parseQuestionBody(body) {
  const partRe = /^[ \t]*([A-J])\.\s+/gm;
  const matches = [...body.matchAll(partRe)];

  if (matches.length === 0) {
    // No lettered sub-parts — whole body is the stem (rare, but keep it usable).
    const { text: bodyText, table } = extractTable(body.trim());
    const { text, marks } = extractMarks(bodyText);
    return { stem: '', table, parts: [{ label: '', text, marks }] };
  }

  const stemRaw = body.slice(0, matches[0].index).trim();
  const { text: stem, table } = extractTable(stemRaw);
  const parts = matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end   = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const raw   = body.slice(start, end).trim();
    const { text, marks } = extractMarks(raw);
    return { label: m[1], text, marks };
  });

  return { stem, table, parts };
}

export function parseEssayQuestions(rawText) {
  const warnings = [];
  const text = String(rawText || '').replace(/\r\n/g, '\n');

  const qStartRe = /^Q(\d{1,2})\.\s?/gm;
  const starts = [...text.matchAll(qStartRe)];

  if (starts.length === 0) {
    return {
      meta: parseMeta(text),
      questions: [],
      warnings: ['No questions found. Questions must start a line with "Q1.", "Q2." etc.'],
    };
  }

  const headerText = text.slice(0, starts[0].index);
  const meta = parseMeta(headerText);

  const questions = starts.map((m, i) => {
    const number = parseInt(m[1], 10);
    const bodyStart = m.index + m[0].length;
    const bodyEnd   = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();

    const { stem, table, parts } = parseQuestionBody(body);
    if (!stem && !table && parts.length && !parts[0].label) {
      warnings.push(`Q${number}: no lettered sub-parts (A., B., ...) detected — check formatting.`);
    }
    return { number, stem, table, parts };
  });

  return { meta, questions, warnings };
}

export default parseEssayQuestions;
