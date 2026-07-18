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
//         stem: 'Mrs. Grace Musa, a 24-year-old ... (scenario + any table lines)',
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
    const { text, marks } = extractMarks(body.trim());
    return { stem: '', parts: [{ label: '', text, marks }] };
  }

  const stem = body.slice(0, matches[0].index).trim();
  const parts = matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end   = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const raw   = body.slice(start, end).trim();
    const { text, marks } = extractMarks(raw);
    return { label: m[1], text, marks };
  });

  return { stem, parts };
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

    const { stem, parts } = parseQuestionBody(body);
    if (!stem && parts.length && !parts[0].label) {
      warnings.push(`Q${number}: no lettered sub-parts (A., B., ...) detected — check formatting.`);
    }
    return { number, stem, parts };
  });

  return { meta, questions, warnings };
}

export default parseEssayQuestions;
