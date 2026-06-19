// src/utils/questionFileImport.js
// ─────────────────────────────────────────────────────────────────────────────
// Converts uploaded files (CSV, Word .docx, plain .txt) into the same raw text
// string that parseQuestionsFromText() already understands, so all existing
// parser logic is reused without duplication.
//
// SUPPORTED FILE TYPES
// ────────────────────
// • .txt / .text  → read as-is (UTF-8)
// • .csv          → PapaParse → rows → reconstructed question text blocks
// • .docx         → mammoth  → extract raw text → feed to parser
// • .doc          → unsupported (prompt user to save as .docx)
//
// CSV COLUMN FORMATS SUPPORTED
// ────────────────────────────
// The CSV importer is flexible — it auto-detects columns by trying several
// common header conventions in order:
//
//   Style 1 — Standard 6-column (most common export):
//     question, option_a, option_b, option_c, option_d, answer[, explanation]
//
//   Style 2 — Numbered options:
//     question, a, b, c, d, answer[, explanation]
//     question, 1, 2, 3, 4, answer[, explanation]
//
//   Style 3 — Options array (JSON in one cell):
//     question, options, answer[, explanation]
//     where options = '["text A","text B","text C","text D"]'
//
//   Style 4 — Full text block in a single column:
//     question_text  (parser handles the rest inside the cell value)
//
//   Style 5 — Google Forms export:
//     Question, Option 1, Option 2, Option 3, Option 4, Correct Answer
//
// ANSWER COLUMN FORMATS SUPPORTED
// ─────────────────────────────────
//   "B"  /  "b"  /  "2"  /  "option_b"  /  "B. Some text"  /  the full text
//   of the correct option  /  "2nd option"  (position-based)
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

const OPT_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Normalize a header string for loose matching.
 * "Option A" → "optiona",  "option_a" → "optiona"
 */
function nh(s) {
  return String(s || '').toLowerCase().replace(/[\s_\-\.]/g, '');
}

/**
 * Given a row object (PapaParse with header:true) and the detected column map,
 * return { question, options[], answerLetter, explanation }.
 */
function extractRowFields(row, colMap) {
  const get = key => (key ? (row[key] || '').toString().trim() : '');

  const question    = get(colMap.question);
  const explanation = get(colMap.explanation);

  // Build options array
  let options = [];
  if (colMap.optionsJson) {
    // Style 3: JSON array in one cell
    try {
      const parsed = JSON.parse(get(colMap.optionsJson));
      if (Array.isArray(parsed)) options = parsed.map(o => String(o).trim());
    } catch (_) {
      // fallback: comma-split
      options = get(colMap.optionsJson).split(',').map(s => s.trim()).filter(Boolean);
    }
  } else {
    // Styles 1, 2, 5: individual columns
    (['optA', 'optB', 'optC', 'optD', 'optE']).forEach(k => {
      if (colMap[k]) {
        const v = get(colMap[k]);
        if (v) options.push(v);
      }
    });
  }

  // Resolve answer → letter A-E
  const rawAnswer = get(colMap.answer);
  const answerLetter = resolveAnswerLetter(rawAnswer, options);

  // Inline metadata
  const course = get(colMap.course);
  const topic  = get(colMap.topic);
  const year   = get(colMap.year);

  return { question, options, answerLetter, explanation, course, topic, year };
}

/**
 * Turn a freeform "answer" cell value into a letter A-E (or null).
 * Handles: "B", "b", "2", "B. Some text", full option text, "2nd option", etc.
 */
function resolveAnswerLetter(raw, options) {
  if (!raw) return null;
  const s = raw.trim();

  // Direct letter: "B" or "b"
  const directLetter = s.match(/^([A-Ea-e])\.?\s*$/);
  if (directLetter) return directLetter[1].toUpperCase();

  // Letter prefixed: "B. Option text" or "B) Option text"
  const prefixed = s.match(/^([A-Ea-e])[.\)]\s+/);
  if (prefixed) return prefixed[1].toUpperCase();

  // Numeric: "1"–"5" → A–E
  const num = s.match(/^(\d)\.?$/);
  if (num) {
    const idx = parseInt(num[1], 10) - 1;
    if (idx >= 0 && idx < OPT_LETTERS.length) return OPT_LETTERS[idx];
  }

  // "option_b", "optionb", "option b"
  const optNamed = s.toLowerCase().replace(/[\s_]/g, '').match(/^option([a-e])$/);
  if (optNamed) return optNamed[1].toUpperCase();

  // Full text match against options (case-insensitive)
  if (options.length > 0) {
    const idx = options.findIndex(o => o.trim().toLowerCase() === s.toLowerCase());
    if (idx >= 0) return OPT_LETTERS[idx];
    // Partial match (starts-with)
    const pidx = options.findIndex(o => o.trim().toLowerCase().startsWith(s.toLowerCase().slice(0, 15)));
    if (pidx >= 0) return OPT_LETTERS[pidx];
  }

  // "1st", "2nd", "3rd", "4th" option
  const ordinal = s.toLowerCase().match(/^(\d)(st|nd|rd|th)/);
  if (ordinal) {
    const idx = parseInt(ordinal[1], 10) - 1;
    if (idx >= 0 && idx < OPT_LETTERS.length) return OPT_LETTERS[idx];
  }

  return null;
}

/**
 * Auto-detect column map from PapaParse header fields.
 * Returns an object like { question, optA, optB, optC, optD, answer, explanation, optionsJson }
 * where each value is the actual header string in the CSV (or null if not found).
 */
function detectColumnMap(headers) {
  const map = {
    question: null, optA: null, optB: null, optC: null, optD: null, optE: null,
    answer: null, explanation: null, optionsJson: null,
    course: null, topic: null, year: null,
  };

  headers.forEach(h => {
    const n = nh(h);

    // Question
    if (!map.question && (n === 'question' || n === 'questiontext' || n === 'q' || n === 'stem'))
      map.question = h;

    // Options — individual columns
    if (!map.optA && (n === 'optiona' || n === 'a' || n === 'option1' || n === '1' || n === 'option_a' || n === 'answera' || n === 'choice1' || n === 'choicea'))
      map.optA = h;
    if (!map.optB && (n === 'optionb' || n === 'b' || n === 'option2' || n === '2' || n === 'option_b' || n === 'answerb' || n === 'choice2' || n === 'choiceb'))
      map.optB = h;
    if (!map.optC && (n === 'optionc' || n === 'c' || n === 'option3' || n === '3' || n === 'option_c' || n === 'answerc' || n === 'choice3' || n === 'choicec'))
      map.optC = h;
    if (!map.optD && (n === 'optiond' || n === 'd' || n === 'option4' || n === '4' || n === 'option_d' || n === 'answerd' || n === 'choice4' || n === 'choiced'))
      map.optD = h;
    if (!map.optE && (n === 'optione' || n === 'e' || n === 'option5' || n === '5' || n === 'option_e' || n === 'answere' || n === 'choice5' || n === 'choicee'))
      map.optE = h;

    // Options JSON array
    if (!map.optionsJson && (n === 'options' || n === 'choices' || n === 'optionsarray'))
      map.optionsJson = h;

    // Answer
    if (!map.answer && (n === 'answer' || n === 'correctanswer' || n === 'correct' || n === 'key' || n === 'ans' || n === 'correctoption' || n === 'rightanswer'))
      map.answer = h;

    // Explanation
    if (!map.explanation && (n === 'explanation' || n === 'rationale' || n === 'reason' || n === 'explain' || n === 'note' || n === 'notes' || n === 'solution'))
      map.explanation = h;

    // Inline metadata — course, topic, year
    if (!map.course && (n === 'course' || n === 'coursename' || n === 'subject' || n === 'module'))
      map.course = h;
    if (!map.topic && (n === 'topic' || n === 'topicname' || n === 'subtopic' || n === 'unit'))
      map.topic = h;
    if (!map.year && (n === 'year' || n === 'examyear' || n === 'pastyear' || n === 'date'))
      map.year = h;
  });

  return map;
}

/**
 * Convert an array of CSV row objects (PapaParse header:true output) into
 * the plain-text question format that parseQuestionsFromText understands.
 *
 * Returns { text, warnings[] }
 */
function csvRowsToQuestionText(rows) {
  if (!rows || rows.length === 0) return { text: '', warnings: ['CSV file is empty.'] };

  const headers = Object.keys(rows[0]);
  const colMap  = detectColumnMap(headers);
  const warnings = [];

  // Validate we have the minimum columns
  const hasOptions = colMap.optA || colMap.optionsJson;
  if (!colMap.question) {
    // Try using the first column as the question
    colMap.question = headers[0];
    warnings.push(`No "question" column found — using first column "${headers[0]}" as question text.`);
  }
  if (!hasOptions) {
    warnings.push('No option columns detected. If your CSV has questions embedded with options, the text parser will handle them.');
  }
  if (!colMap.answer) {
    warnings.push('No answer column found — questions will be uploaded without a marked correct answer.');
  }

  const lines  = [];
  const rowMeta = []; // per-question inline metadata: [{course, topic, year}, ...]

  rows.forEach((row, i) => {
    const { question, options, answerLetter, explanation, course, topic, year } = extractRowFields(row, colMap);

    if (!question) return; // skip blank rows

    const qNum = i + 1;
    lines.push(`${qNum}. ${question}`);

    if (options.length >= 2) {
      options.forEach((opt, j) => {
        lines.push(`${OPT_LETTERS[j]}. ${opt}`);
      });
    }

    if (answerLetter) {
      lines.push(`Answer: ${answerLetter}`);
    }

    if (explanation) {
      lines.push(`Explanation: ${explanation}`);
    }

    lines.push(''); // blank separator between questions

    // Collect per-row metadata for inline course/topic/year override
    rowMeta.push({ course: course || '', topic: topic || '', year: year || '' });
  });

  return { text: lines.join('\n'), warnings, rowMeta };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read a .txt or .text file as UTF-8 text.
 * Returns Promise<{ text, warnings[] }>
 */
export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve({ text: e.target.result || '', warnings: [] });
    reader.onerror = () => reject(new Error('Failed to read text file.'));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Parse a CSV file using PapaParse.
 * Returns Promise<{ text, warnings[], rowCount }>
 */
export function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    import('papaparse').then(({ default: Papa }) => {
      Papa.parse(file, {
        header:           true,
        skipEmptyLines:   true,
        transformHeader:  h => h.trim(),
        complete: results => {
          const rows = results.data || [];
          if (rows.length === 0) {
            resolve({ text: '', warnings: ['CSV appears to be empty.'], rowCount: 0, rowMeta: [] });
            return;
          }
          const { text, warnings, rowMeta } = csvRowsToQuestionText(rows);
          // Add PapaParse errors as warnings
          if (results.errors?.length > 0) {
            const errMsgs = results.errors.slice(0, 3).map(e => `Row ${e.row}: ${e.message}`);
            warnings.push(...errMsgs);
          }
          resolve({ text, warnings, rowCount: rows.length, rowMeta });
        },
        error: err => reject(new Error('CSV parse error: ' + err.message)),
      });
    }).catch(reject);
  });
}

/**
 * Extract text from a .docx file using mammoth.
 * Returns Promise<{ text, warnings[], messages[] }>
 */
export function readDocxFile(file) {
  return new Promise((resolve, reject) => {
    import('mammoth').then(({ default: mammoth }) => {
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const arrayBuffer = e.target.result;
          const result = await mammoth.extractRawText({ arrayBuffer });
          const text = result.value || '';
          const messages = (result.messages || []).map(m => m.message).filter(Boolean);
          const warnings = messages.length > 0 ? messages.slice(0, 5) : [];
          resolve({ text, warnings });
        } catch (err) {
          reject(new Error('Word document parse error: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read Word document.'));
      reader.readAsArrayBuffer(file);
    }).catch(reject);
  });
}

/**
 * Main entry point — detect file type and return extracted text + metadata.
 * Returns Promise<{ text, warnings[], rowCount?, fileType }>
 */
export async function readQuestionFile(file) {
  const name = (file.name || '').toLowerCase();
  const ext  = name.split('.').pop();

  if (ext === 'csv') {
    const result = await readCsvFile(file);
    return { ...result, fileType: 'csv' };
  }

  if (ext === 'docx') {
    const result = await readDocxFile(file);
    return { ...result, fileType: 'docx' };
  }

  if (ext === 'doc') {
    throw new Error(
      'Old .doc format is not supported. Please open the file in Microsoft Word or Google Docs and save it as .docx, then upload again.'
    );
  }

  if (ext === 'txt' || ext === 'text' || ext === 'md') {
    const result = await readTextFile(file);
    return { ...result, fileType: 'txt' };
  }

  throw new Error(
    `Unsupported file type ".${ext}". Please upload a .csv, .docx, or .txt file.`
  );
}


/**
 * Parse a CSV file directly into question objects — bypasses the text round-trip
 * so course/topic/year per row are always accurately preserved.
 * Returns Promise<{ questions[], warnings[], rowCount }>
 * Each question object has the same shape as parseQuestionsFromText output plus
 * _inlineCourse, _inlineTopic, _inlineYear fields.
 */
export function readCsvFileAsQuestions(file) {
  return new Promise((resolve, reject) => {
    import('papaparse').then(({ default: Papa }) => {
      Papa.parse(file, {
        header:           true,
        skipEmptyLines:   true,
        transformHeader:  h => h.trim(),
        complete: results => {
          const rows = results.data || [];
          if (rows.length === 0) {
            resolve({ questions: [], warnings: ['CSV appears to be empty.'], rowCount: 0 });
            return;
          }

          const headers = Object.keys(rows[0]);
          const colMap  = detectColumnMap(headers);
          const warnings = [];

          if (!colMap.question) {
            colMap.question = headers[0];
            warnings.push(`No "question" column — using first column "${headers[0]}" as question text.`);
          }
          if (!colMap.answer) {
            warnings.push('No answer column found — questions uploaded without a marked correct answer.');
          }
          if (results.errors?.length > 0) {
            results.errors.slice(0, 3).forEach(e => warnings.push(`Row ${e.row}: ${e.message}`));
          }

          const questions = [];
          rows.forEach((row, i) => {
            const { question, options, answerLetter, explanation, course, topic, year } = extractRowFields(row, colMap);
            if (!question) return; // skip blank rows

            // Resolve correctIndex from answerLetter
            const letterIdx = answerLetter ? OPT_LETTERS.indexOf(answerLetter.toUpperCase()) : -1;
            const correctIndex = letterIdx >= 0 ? letterIdx : 0;

            questions.push({
              question:             question.trim(),
              options:              options.length >= 2 ? options : ['', '', '', ''],
              correctIndex,
              explanation:          explanation || '',
              imageUrl:             '',
              explanationImageUrl:  '',
              _hasAnswer:           letterIdx >= 0,
              _inlineCourse:        course || '',
              _inlineTopic:         topic  || '',
              _inlineYear:          year   || '',
            });
          });

          resolve({ questions, warnings, rowCount: rows.length });
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
export function generateCsvTemplate() {
  const header = 'question,option_a,option_b,option_c,option_d,answer,explanation,course,topic,year';
  const rows = [
    'What is the normal adult resting heart rate?,40–60 bpm,60–100 bpm,100–120 bpm,120–160 bpm,B,The normal adult resting heart rate is 60–100 beats per minute.,Medical-Surgical,Cardiovascular,2023',
    'Which electrolyte imbalance causes Chvostek\'s sign?,Hyponatremia,Hypocalcemia,Hypokalemia,Hypermagnesemia,B,Hypocalcemia causes increased neuromuscular excitability.,Medical-Surgical,Fluid & Electrolytes,2022',
    'The priority nursing action for a patient in anaphylaxis is:,Administer antihistamine,Elevate the head of bed,Administer epinephrine IM,Apply a cold pack,C,Epinephrine is the first-line treatment for anaphylaxis.,Pharmacology,Emergency Drugs,2024',
  ];
  const csv = [header, ...rows].join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}
