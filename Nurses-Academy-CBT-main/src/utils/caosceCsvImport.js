// src/utils/caosceCsvImport.js
// ─────────────────────────────────────────────────────────────────────────────
// Converts an uploaded CSV file into the same case[] shape that the CAOSCE
// "paste JSON array" bulk importer already accepts, so CaosceManager.jsx can
// reuse handleBulkImport() unchanged — the CSV path just produces JSON text.
//
// CSV LAYOUT — "grouped rows" format (recommended)
// ──────────────────────────────────────────────────
// One CASE ROW followed by zero or more QUESTION ROWS directly under it.
// A row is a CASE ROW if its "scenario" cell is filled. A row with a blank
// scenario is treated as an extra CBT question (or extra procedures) that
// belongs to the case above it — so a case can have as many questions as
// you like, just keep adding rows underneath it.
//
//   specialty, topic, year, title, scenario, procedures, active,
//   question, option_a, option_b, option_c, option_d, answer, explanation
//
//   Row 1 (case):     paediatric, ..., "A baby is born...", "Dry & stimulate|...", yes, "Q1 text", A, B, C, D, A, "..."
//   Row 2 (question): (scenario blank) ,,,,,,, "Q2 text", A, B, C, D, B, "..."
//   Row 3 (question): (scenario blank) ,,,,,,, "Q3 text", A, B, C, D, C, "..."
//   Row 4 (new case): general_nursing, ..., "Next scenario...", ...
//
//   - procedures is pipe "|" separated; add "(optional)" after a step to
//     mark it not required, e.g. "Wash hands|Document findings (optional)"
//   - answer accepts a letter (A-D), a number (1-4), or the full option text
//   - active accepts yes/no/true/false (defaults to yes)
//
// LEGACY LAYOUT — wide numbered columns (still supported)
// ──────────────────────────────────────────────────────────
//   cbt1_question, cbt1_option_a..d, cbt1_answer, cbt1_explanation,
//   cbt2_question, cbt2_option_a..d, cbt2_answer, cbt2_explanation, ...
//   These can sit on the case row itself, or even on question rows —
//   any group with a non-empty question cell is included.
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
 * Detect question column groups in the header row. Supports both the plain
 * unprefixed columns (question, option_a, ..., answer, explanation) used on
 * "question rows", and legacy numbered columns (cbt1_question, cbt2_..., etc).
 * Returns Map<'generic'|number, { question, optA, optB, optC, optD, optE, answer, explanation }>
 */
function detectQuestionGroups(headers) {
  const groups = new Map();
  const re = /^(?:cbt(\d+))?(question|q|stem|optiona|optionb|optionc|optiond|optione|option1|option2|option3|option4|option5|a|b|c|d|e|answer|correct|correctanswer|key|explanation|rationale)$/;

  headers.forEach(h => {
    const n = nh(h);
    const m = n.match(re);
    if (!m) return;

    const idx = m[1] !== undefined ? Number(m[1]) : 'generic';
    const token = m[2];
    let field = null;
    if (token === 'question' || token === 'q' || token === 'stem') field = 'question';
    else if (token === 'optiona' || token === 'a' || token === 'option1') field = 'optA';
    else if (token === 'optionb' || token === 'b' || token === 'option2') field = 'optB';
    else if (token === 'optionc' || token === 'c' || token === 'option3') field = 'optC';
    else if (token === 'optiond' || token === 'd' || token === 'option4') field = 'optD';
    else if (token === 'optione' || token === 'e' || token === 'option5') field = 'optE';
    else if (token === 'answer' || token === 'correct' || token === 'correctanswer' || token === 'key') field = 'answer';
    else if (token === 'explanation' || token === 'rationale') field = 'explanation';
    if (!field) return;

    if (!groups.has(idx)) {
      groups.set(idx, { question: null, optA: null, optB: null, optC: null, optD: null, optE: null, answer: null, explanation: null });
    }
    groups.get(idx)[field] = h;
  });

  return groups;
}

/**
 * Build zero or more question objects from a single CSV row, using every
 * detected group (generic + any numbered legacy groups) that has text in
 * its question cell.
 */
function buildQuestionsFromRow(row, questionGroups) {
  const indices = [...questionGroups.keys()].sort((a, b) => {
    if (a === 'generic') return -1;
    if (b === 'generic') return 1;
    return a - b;
  });

  const out = [];
  indices.forEach(idx => {
    const g = questionGroups.get(idx);
    const question = (g.question ? row[g.question] : '') || '';
    if (!String(question).trim()) return;

    const options = [g.optA, g.optB, g.optC, g.optD, g.optE]
      .map(key => (key ? row[key] : ''))
      .map(v => String(v || '').trim())
      .filter((v, i) => i < 4 || v);

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
 * JSON.stringify'd into the bulk-import textarea. A row with a filled
 * "scenario" cell starts a new case; a row with a blank scenario adds its
 * question(s) (and any procedures) to the case directly above it.
 *
 * @param {File} file
 * @param {string} [defaultSpecialty] - used when a case row has no specialty
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
            resolve({ cases: [], warnings: ['No "scenario" column found — every case row needs a scenario. Check your CSV headers.'], rowCount: rows.length });
            return;
          }
          if (!colMap.specialty && !defaultSpecialty) {
            warnings.push('No "specialty" column found and no default specialty selected — rows may be skipped.');
          }

          const questionGroups = detectQuestionGroups(headers);

          const cases = [];
          let currentCase = null;
          let orphanRows = 0;
          let blankRows = 0;

          rows.forEach(row => {
            const scenario = (row[colMap.scenario] || '').trim();
            const rowQuestions = buildQuestionsFromRow(row, questionGroups);
            const rowProcedures = parseProcedures(colMap.procedures ? row[colMap.procedures] : '');

            if (scenario) {
              if (currentCase) cases.push(currentCase);
              const specialty = colMap.specialty ? (row[colMap.specialty] || '').trim() : '';
              currentCase = {
                specialty: specialty || defaultSpecialty || '',
                topic: colMap.topic ? (row[colMap.topic] || '').trim() : '',
                year: colMap.year ? (row[colMap.year] || '').trim() : '',
                title: colMap.title ? (row[colMap.title] || '').trim() : '',
                scenario,
                procedures: rowProcedures,
                cbtQuestions: rowQuestions,
                active: colMap.active ? toBool(row[colMap.active]) : true,
              };
            } else if (rowQuestions.length || rowProcedures.length) {
              if (!currentCase) {
                orphanRows++;
                return;
              }
              currentCase.cbtQuestions.push(...rowQuestions);
              currentCase.procedures.push(...rowProcedures);
            } else {
              blankRows++;
            }
          });
          if (currentCase) cases.push(currentCase);

          if (orphanRows > 0) warnings.push(`Skipped ${orphanRows} question row${orphanRows !== 1 ? 's' : ''} that appeared before any case row.`);
          if (blankRows > 0) warnings.push(`Skipped ${blankRows} row${blankRows !== 1 ? 's' : ''} with no scenario, question, or procedures.`);
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
 * Demonstrates one case with 3 stacked CBT questions, then a second case.
 * Returns a Blob the caller can trigger a download from.
 */
export function generateCaosceCsvTemplate() {
  const header = [
    'specialty', 'topic', 'year', 'title', 'scenario', 'procedures', 'active',
    'question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'explanation',
  ].join(',');

  const rows = [
    [
      'paediatric', 'Neonatal Resuscitation', '2024', 'Station 2 — Neonatal Resuscitation',
      '"A baby is born at term and is not breathing spontaneously..."',
      '"Dry and stimulate the baby|Call for senior help immediately|Give the baby to the mother for skin-to-skin first (optional)"',
      'yes',
      'What is the first step in neonatal resuscitation?',
      'Dry and stimulate', 'Give oxygen', 'Chest compressions', 'Call doctor', 'A',
      'Drying and stimulating often initiates breathing.',
    ].join(','),
    [
      '', '', '', '', '', '', '',
      'Which sign indicates successful resuscitation?',
      'Crying and pink color', 'Cyanosis', 'Apnea', 'Bradycardia', 'A',
      'Crying and improving color confirm effective resuscitation.',
    ].join(','),
    [
      '', '', '', '', '', '', '',
      'What should be done if heart rate remains below 60 bpm after ventilation?',
      'Continue ventilation only', 'Begin chest compressions', 'Stop resuscitation', 'Give oral fluids', 'B',
      'Chest compressions are indicated when heart rate stays below 60 bpm despite adequate ventilation.',
    ].join(','),
    [
      'general_nursing', 'Wound Care', '2023', 'Station 5 — Post-operative Wound Dressing',
      '"A patient is 2 days post-laparotomy with a clean surgical wound requiring dressing change."',
      '"Perform hand hygiene|Don sterile gloves|Clean wound with antiseptic|Apply sterile dressing|Document procedure (optional)"',
      'yes',
      'What is the priority action before starting a dressing change?',
      'Perform hand hygiene', 'Inform the doctor', 'Give analgesia', 'Take photographs', 'A',
      'Hand hygiene reduces infection risk and is the first step in any aseptic procedure.',
    ].join(','),
  ];

  const csv = [header, ...rows].join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}
