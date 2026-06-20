// src/utils/caosceCsvImport.js
// ─────────────────────────────────────────────────────────────────────────────
// Converts an uploaded CSV file into the same case[] shape that the CAOSCE
// "paste JSON array" bulk importer already accepts, so CaosceManager.jsx can
// reuse handleBulkImport() unchanged — the CSV path just produces JSON text.
//
// EXPECTED CSV COLUMNS (one row = one case)
// ──────────────────────────────────────────
//   specialty*   — e.g. "paediatric" (optional if a defaultSpecialty is passed,
//                  i.e. the admin is already inside that specialty's page)
//   topic
//   year
//   title
//   scenario*    — required, the clinical scenario text
//   procedures   — pipe "|" separated list. Mark a step optional by adding
//                  "(optional)" after it, e.g.:
//                  "Wash hands|Confirm patient ID|Document findings (optional)"
//   active       — "yes"/"no"/"true"/"false" (defaults to yes)
//
//   CBT questions — numbered column groups, as many as needed:
//     cbt1_question, cbt1_option_a, cbt1_option_b, cbt1_option_c, cbt1_option_d,
//     cbt1_answer, cbt1_explanation
//     cbt2_question, cbt2_option_a, ... etc.
//   The "answer" cell accepts a letter (A-D), a number (1-4), or the full
//   text of the correct option.
//
// * = required column
// ─────────────────────────────────────────────────────────────────────────────

import { resolveAnswerLetter, OPT_LETTERS } from './questionFileImport';

function nh(s) {
  return String(s || '').toLowerCase().replace(/[\s_\-.]/g, '');
}

function toBool(v, fallback = true) {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const s = String(v).trim().toLowerCase();
  return ['yes', 'y', 'true', '1', 'active', 'visible'].includes(s);
}

function parseProcedures(raw) {
  if (!raw) return [];
  return raw
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const optional = /\(optional\)\s*$/i.test(s);
      const text = s.replace(/\(optional\)\s*$/i, '').trim();
      return { text, isRequired: !optional };
    });
}

/**
 * Detect, for each header, whether it belongs to a numbered CBT question
 * group (cbt1_question, cbt2_option_a, ...) and which field it represents.
 * Returns a Map<number, { question, optA, optB, optC, optD, answer, explanation }>
 * where each value holds the actual header string for that field.
 */
function detectCbtGroups(headers) {
  const groups = new Map();
  const re = /^cbt(\d+)(question|q|optiona|optionb|optionc|optiond|optione|a|b|c|d|e|answer|correct|correctanswer|explanation|rationale)$/;

  headers.forEach(h => {
    const n = nh(h);
    const m = n.match(re);
    if (!m) return;
    const idx = Number(m[1]);
    const field = m[2];
    if (!groups.has(idx)) {
      groups.set(idx, { question: null, optA: null, optB: null, optC: null, optD: null, optE: null, answer: null, explanation: null });
    }
    const g = groups.get(idx);
    if (field === 'question' || field === 'q') g.question = h;
    else if (field === 'optiona' || field === 'a') g.optA = h;
    else if (field === 'optionb' || field === 'b') g.optB = h;
    else if (field === 'optionc' || field === 'c') g.optC = h;
    else if (field === 'optiond' || field === 'd') g.optD = h;
    else if (field === 'optione' || field === 'e') g.optE = h;
    else if (field === 'answer' || field === 'correct' || field === 'correctanswer') g.answer = h;
    else if (field === 'explanation' || field === 'rationale') g.explanation = h;
  });

  return groups;
}

function buildCbtQuestions(row, cbtGroups) {
  const out = [];
  const indices = [...cbtGroups.keys()].sort((a, b) => a - b);
  indices.forEach(idx => {
    const g = cbtGroups.get(idx);
    const question = (g.question ? row[g.question] : '') || '';
    if (!String(question).trim()) return; // skip empty CBT slots

    const options = [g.optA, g.optB, g.optC, g.optD, g.optE]
      .map(key => (key ? row[key] : ''))
      .map(v => String(v || '').trim())
      .filter((v, i, arr) => i < 4 || v); // keep first 4 always, 5th only if filled

    const rawAnswer = g.answer ? row[g.answer] : '';
    const letter = resolveAnswerLetter(String(rawAnswer || '').trim(), options);
    const correctIndex = letter ? OPT_LETTERS.indexOf(letter) : 0;

    out.push({
      question: String(question).trim(),
      options: options.length >= 2 ? options : ['', '', '', ''],
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      explanation: g.explanation ? String(row[g.explanation] || '').trim() : '',
    });
  });
  return out;
}

/**
 * Parse a CSV file into an array of CAOSCE case objects ready to be
 * JSON.stringify'd into the bulk-import textarea.
 *
 * @param {File} file
 * @param {string} [defaultSpecialty] - used when a row has no specialty column
 * @returns {Promise<{ cases: object[], warnings: string[], rowCount: number }>}
 */
export function readCaosceCsvFile(file, defaultSpecialty) {
  return new Promise((resolve, reject) => {
    import('papaparse').then(({ default: Papa }) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim(),
        complete: results => {
          const rows = results.data || [];
          const warnings = [];

          if (rows.length === 0) {
            resolve({ cases: [], warnings: ['CSV appears to be empty.'], rowCount: 0 });
            return;
          }

          const headers = Object.keys(rows[0]);
          const colMap = {
            specialty: null, topic: null, year: null, title: null, scenario: null,
            procedures: null, active: null,
          };
          headers.forEach(h => {
            const n = nh(h);
            if (!colMap.specialty && (n === 'specialty' || n === 'category' || n === 'speciality')) colMap.specialty = h;
            if (!colMap.topic && n === 'topic') colMap.topic = h;
            if (!colMap.year && n === 'year') colMap.year = h;
            if (!colMap.title && (n === 'title' || n === 'casetitle')) colMap.title = h;
            if (!colMap.scenario && (n === 'scenario' || n === 'casescenario' || n === 'description')) colMap.scenario = h;
            if (!colMap.procedures && (n === 'procedures' || n === 'procedurechecklist' || n === 'checklist' || n === 'steps')) colMap.procedures = h;
            if (!colMap.active && (n === 'active' || n === 'visible' || n === 'published')) colMap.active = h;
          });

          if (!colMap.scenario) {
            resolve({ cases: [], warnings: ['No "scenario" column found — every case needs a scenario. Check your CSV headers.'], rowCount: rows.length });
            return;
          }
          if (!colMap.specialty && !defaultSpecialty) {
            warnings.push('No "specialty" column found and no default specialty selected — rows may be skipped.');
          }

          const cbtGroups = detectCbtGroups(headers);

          const cases = [];
          let skipped = 0;
          rows.forEach(row => {
            const scenario = (row[colMap.scenario] || '').trim();
            if (!scenario) { skipped++; return; }

            const specialty = colMap.specialty ? (row[colMap.specialty] || '').trim() : '';

            cases.push({
              specialty: specialty || defaultSpecialty || '',
              topic: colMap.topic ? (row[colMap.topic] || '').trim() : '',
              year: colMap.year ? (row[colMap.year] || '').trim() : '',
              title: colMap.title ? (row[colMap.title] || '').trim() : '',
              scenario,
              procedures: parseProcedures(colMap.procedures ? row[colMap.procedures] : ''),
              cbtQuestions: buildCbtQuestions(row, cbtGroups),
              active: colMap.active ? toBool(row[colMap.active]) : true,
            });
          });

          if (skipped > 0) warnings.push(`Skipped ${skipped} row${skipped !== 1 ? 's' : ''} with no scenario text.`);
          if (results.errors?.length > 0) {
            results.errors.slice(0, 3).forEach(e => warnings.push(`Row ${e.row}: ${e.message}`));
          }

          resolve({ cases, warnings, rowCount: rows.length });
        },
        error: err => reject(new Error('CSV parse error: ' + err.message)),
      });
    }).catch(reject);
  });
}

/**
 * Generate a downloadable CSV template so admins know the expected format.
 * Returns a Blob the caller can trigger a download from.
 */
export function generateCaosceCsvTemplate() {
  const header = [
    'specialty', 'topic', 'year', 'title', 'scenario', 'procedures', 'active',
    'cbt1_question', 'cbt1_option_a', 'cbt1_option_b', 'cbt1_option_c', 'cbt1_option_d', 'cbt1_answer', 'cbt1_explanation',
    'cbt2_question', 'cbt2_option_a', 'cbt2_option_b', 'cbt2_option_c', 'cbt2_option_d', 'cbt2_answer', 'cbt2_explanation',
  ].join(',');

  const row1 = [
    'paediatric',
    'Neonatal Resuscitation',
    '2024',
    'Station 2 — Neonatal Resuscitation',
    '"A baby is born at term and is not breathing spontaneously..."',
    '"Dry and stimulate the baby|Call for senior help immediately|Give the baby to the mother for skin-to-skin first (optional)"',
    'yes',
    'What is the first step in neonatal resuscitation?',
    'Dry and stimulate', 'Give oxygen', 'Chest compressions', 'Call doctor',
    'A',
    'Drying and stimulating often initiates breathing.',
    '', '', '', '', '', '', '',
  ].join(',');

  const csv = [header, row1].join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}
