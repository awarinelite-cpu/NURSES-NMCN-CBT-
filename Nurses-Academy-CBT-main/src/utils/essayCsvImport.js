// src/utils/essayCsvImport.js
// ─────────────────────────────────────────────────────────────────────────────
// Converts an uploaded CSV or TXT file into one or more parsed essay question
// sets (same shape produced by essayQuestionParser.parseEssayQuestions).
//
// SUPPORTED FILE TYPES
// ────────────────────
// • .txt  → read as-is, fed straight to parseEssayQuestions. If the file
//           contains several papers back to back, each one must start its
//           own line with "COMPLETE_ESSAY_SET" (any case) — the file is
//           split on that marker and each chunk becomes its own set.
//
// • .csv  → PapaParse, two supported layouts (auto-detected):
//
//   Layout A — Structured (recommended for spreadsheets):
//     Columns: row_type, number, label, text, marks
//     row_type is one of: meta | question | part
//       meta rows     — label = field name (title, institution, courseCode,
//                        courseTitle, examDate, timeAllowed, instruction,
//                        setLabel), text = the value.
//                        A new "meta,,title,..." row starts a NEW set, so a
//                        single CSV can hold several past papers at once.
//       question rows — number = question number, text = the scenario/stem.
//       part rows     — number = question number, label = A/B/C..,
//                        text = the sub-part instruction, marks = optional
//                        ("5 Marks" / "1 mark each"). If the marks column is
//                        left blank, a trailing "5 Marks" inside text is
//                        auto-detected and stripped, same as the paste box.
//
//   Layout B — Single column of raw text:
//     One column (any header) whose rows are the lines of the same format
//     used in the paste box. All rows are re-joined with newlines and fed
//     through parseEssayQuestions. Multiple concatenated papers are split
//     the same way as the .txt case (on "COMPLETE_ESSAY_SET" markers).
// ─────────────────────────────────────────────────────────────────────────────

import { parseEssayQuestions, extractMarks, extractTable } from './essayQuestionParser';

function nh(s) {
  return String(s || '').toLowerCase().replace(/[\s_\-.]/g, '');
}

const META_KEY_MAP = {
  title: 'title',
  institution: 'institution',
  coursecode: 'courseCode',
  coursetitle: 'courseTitle',
  examdate: 'examDate',
  timeallowed: 'timeAllowed',
  instruction: 'instruction',
  setlabel: 'setLabel',
};

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file, 'UTF-8');
  });
}

/** Split a raw text blob into one or more paper chunks on "COMPLETE_ESSAY_SET" markers. */
function splitIntoDocs(text) {
  const parts = text.split(/(?=^COMPLETE_ESSAY_SET)/im).map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

/** Layout A — structured mixed-row-type CSV. */
function parseStructuredRows(rows, colMap) {
  const sets = [];
  let current = null;
  let questionMap = {};

  const finalize = () => {
    if (current && (current.meta.title || current.questions.length > 0)) {
      current.questions.sort((a, b) => a.number - b.number);
      current.questions.forEach(q => q.parts.sort((a, b) => (a.label > b.label ? 1 : -1)));
      sets.push({ meta: current.meta, questions: current.questions, warnings: [] });
    }
    current = null;
    questionMap = {};
  };

  rows.forEach(row => {
    const get = key => (colMap[key] ? String(row[colMap[key]] || '').trim() : '');
    const rowType = nh(get('rowType'));
    const number  = parseInt(get('number'), 10);
    const label   = get('label');
    const text    = get('text');
    const marksIn = get('marks');

    if (rowType === 'meta') {
      const metaKey = META_KEY_MAP[nh(label)];
      if (metaKey === 'title') {
        if (current) finalize();
        current = { meta: {}, questions: [] };
        current.meta.title = text;
      } else {
        if (!current) current = { meta: {}, questions: [] };
        if (metaKey) current.meta[metaKey] = text;
      }
      return;
    }

    if (!current) current = { meta: {}, questions: [] };

    if (rowType === 'question' && !Number.isNaN(number)) {
      const { text: stem, table } = extractTable(text);
      let q = questionMap[number];
      if (!q) {
        q = { number, stem, table, parts: [] };
        questionMap[number] = q;
        current.questions.push(q);
      } else {
        q.stem = stem;
        q.table = table;
      }
      return;
    }

    if (rowType === 'part' && !Number.isNaN(number)) {
      let q = questionMap[number];
      if (!q) {
        q = { number, stem: '', table: null, parts: [] };
        questionMap[number] = q;
        current.questions.push(q);
      }
      let partText = text, marks = marksIn;
      if (!marks) {
        const ex = extractMarks(text);
        partText = ex.text;
        marks = ex.marks;
      }
      q.parts.push({ label, text: partText, marks });
    }
  });

  finalize();
  return sets;
}

function detectStructuredCols(headers) {
  const map = {};
  headers.forEach(h => {
    const n = nh(h);
    if (['rowtype', 'type'].includes(n)) map.rowType = h;
    else if (['number', 'qnumber', 'questionnumber', 'q'].includes(n)) map.number = h;
    else if (['label', 'part', 'partlabel'].includes(n)) map.label = h;
    else if (['text', 'value', 'content', 'question', 'questiontext'].includes(n)) map.text = h;
    else if (['marks', 'mark'].includes(n)) map.marks = h;
  });
  return map;
}

function parseCsvText(rows, headers) {
  const colMap = detectStructuredCols(headers);

  if (colMap.rowType) {
    const sets = parseStructuredRows(rows, colMap);
    return sets.length > 0
      ? sets
      : [{ meta: {}, questions: [], warnings: ['No question rows found under the detected columns.'] }];
  }

  // Layout B — single/raw-text column: join every cell of every row, in order.
  const textCol = colMap.text || headers[0];
  const raw = rows.map(r => String(r[textCol] || '').trim()).filter(Boolean).join('\n');
  return splitIntoDocs(raw).map(doc => parseEssayQuestions(doc));
}

/**
 * Read a .csv or .txt File and return one or more parsed essay sets.
 * Returns Promise<{ sets: [{meta,questions,warnings}], fileWarnings: string[] }>
 */
export function readEssayQuestionFile(file) {
  const name = (file.name || '').toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.text')) {
    return readFileAsText(file).then(text => ({
      sets: splitIntoDocs(text).map(doc => parseEssayQuestions(doc)),
      fileWarnings: [],
    }));
  }

  if (!name.endsWith('.csv')) {
    return Promise.reject(new Error('Unsupported file type. Please upload a .csv or .txt file.'));
  }

  return new Promise((resolve, reject) => {
    import('papaparse').then(({ default: Papa }) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim(),
        complete: results => {
          const rows = results.data || [];
          const headers = results.meta?.fields || [];
          const fileWarnings = (results.errors || []).slice(0, 5)
            .map(e => `Row ${e.row}: ${e.message}`);

          if (rows.length === 0) {
            resolve({ sets: [], fileWarnings: ['CSV appears to be empty.', ...fileWarnings] });
            return;
          }
          resolve({ sets: parseCsvText(rows, headers), fileWarnings });
        },
        error: err => reject(new Error('CSV parse error: ' + err.message)),
      });
    }).catch(reject);
  });
}

export default readEssayQuestionFile;
