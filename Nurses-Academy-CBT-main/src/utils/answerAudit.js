// src/utils/answerAudit.js
// Helpers for Admin > Answer Audit:
//   1) Export the full question bank (with Firestore doc IDs) to CSV so it
//      can be corrected offline in Excel/Sheets and re-uploaded.
//   2) Parse a corrected CSV back into an id-keyed list of updates.
//
// Round-trip CSV columns:
//   id, question, option_a, option_b, option_c, option_d, option_e,
//   answer, explanation, category, examType, year, subject, difficulty,
//   course, topic
//
// The "id" column is what makes this a safe UPDATE (not a duplicate
// re-upload) — each row is matched back to its exact Firestore document.
// Admins should not edit or remove the id column.

import { OPT_LETTERS, resolveAnswerLetter } from './questionFileImport';

function csvEscape(val) {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Build a CSV Blob from an array of question objects (each must include `id`).
 */
export function exportQuestionsToCsv(questions) {
  const header = [
    'id', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e',
    'answer', 'explanation', 'category', 'examType', 'year', 'subject', 'difficulty',
    'course', 'topic',
  ];

  const lines = [header.join(',')];

  questions.forEach(q => {
    const opts = Array.isArray(q.options) ? q.options : [];
    const answerLetter = Number.isInteger(q.correctIndex) ? OPT_LETTERS[q.correctIndex] || '' : '';
    const row = [
      q.id,
      q.question || '',
      opts[0] || '', opts[1] || '', opts[2] || '', opts[3] || '', opts[4] || '',
      answerLetter,
      q.explanation || '',
      q.category || '',
      q.examType || '',
      q.year || '',
      q.subject || '',
      q.difficulty || '',
      q.course || '',
      q.topic || '',
    ].map(csvEscape);
    lines.push(row.join(','));
  });

  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parse a corrected CSV (must contain an `id` column) into a list of
 * { id, question, options[], correctIndex, explanation, category, examType,
 *   year, subject, difficulty, course, topic, _raw } updates.
 * Rows without a recognisable id are skipped and reported as warnings.
 */
export function parseCorrectionsCsv(file) {
  return new Promise((resolve, reject) => {
    import('papaparse').then(({ default: Papa }) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase(),
        complete: results => {
          const rows = results.data || [];
          const warnings = [];
          if (results.errors?.length > 0) {
            results.errors.slice(0, 3).forEach(e => warnings.push(`Row ${e.row}: ${e.message}`));
          }
          if (rows.length === 0) {
            resolve({ updates: [], warnings: ['CSV appears to be empty.'] });
            return;
          }

          const updates = [];
          rows.forEach((row, i) => {
            const id = (row.id || '').trim();
            if (!id) {
              warnings.push(`Row ${i + 2}: missing "id" — skipped (this row can't be matched to a question).`);
              return;
            }
            const options = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e']
              .map(k => (row[k] || '').trim())
              .filter((v, idx, arr) => idx < 4 || v !== ''); // keep A-D always, E only if filled

            const answerLetter = resolveAnswerLetter((row.answer || '').trim(), options);
            const correctIndex = answerLetter ? OPT_LETTERS.indexOf(answerLetter.toUpperCase()) : -1;

            if (options.length < 2) {
              warnings.push(`Row ${i + 2} (id ${id}): fewer than 2 options — skipped.`);
              return;
            }
            if (correctIndex < 0) {
              warnings.push(`Row ${i + 2} (id ${id}): could not resolve an answer letter — skipped.`);
              return;
            }

            updates.push({
              id,
              question: (row.question || '').trim(),
              options,
              correctIndex,
              explanation: (row.explanation || '').trim(),
              category: (row.category || '').trim(),
              examType: (row.examtype || '').trim(),
              year: (row.year || '').trim(),
              subject: (row.subject || '').trim(),
              difficulty: (row.difficulty || '').trim(),
              course: (row.course || '').trim(),
              topic: (row.topic || '').trim(),
            });
          });

          resolve({ updates, warnings });
        },
        error: err => reject(new Error('CSV parse error: ' + err.message)),
      });
    }).catch(reject);
  });
}

/**
 * Diff a parsed correction row against the currently-loaded question (by id)
 * so the UI can show what will actually change before writing to Firestore.
 */
export function diffUpdate(update, currentById) {
  const current = currentById.get(update.id);
  if (!current) return { id: update.id, isNew: false, notFound: true, changes: [] };

  const changes = [];
  if (update.question && update.question !== current.question) {
    changes.push({ field: 'question', from: current.question, to: update.question });
  }
  const curAnswerLetter = OPT_LETTERS[current.correctIndex] || '';
  const newAnswerLetter = OPT_LETTERS[update.correctIndex] || '';
  if (newAnswerLetter !== curAnswerLetter) {
    changes.push({ field: 'answer', from: curAnswerLetter, to: newAnswerLetter });
  }
  const curOpts = (current.options || []).join(' | ');
  const newOpts = update.options.join(' | ');
  if (newOpts !== curOpts) {
    changes.push({ field: 'options', from: curOpts, to: newOpts });
  }
  if (update.explanation && update.explanation !== (current.explanation || '')) {
    changes.push({ field: 'explanation', from: current.explanation || '', to: update.explanation });
  }

  return { id: update.id, notFound: false, changes };
}
