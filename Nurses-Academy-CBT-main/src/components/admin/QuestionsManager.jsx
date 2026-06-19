// src/components/admin/QuestionsManager.jsx
// PATCH: added 'mock_exam' to exam types + mockExamId field in bulk/single upload
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc,
  query, where, orderBy, serverTimestamp, writeBatch, arrayUnion
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES, ALL_EXAM_TYPES, EXAM_YEARS, DIFFICULTY_LEVELS, DEFAULT_NURSING_COURSES } from '../../data/categories';
import {
  parseQuestionsFromText,
  parseAnswerKey,
  validateQuestion,
  formatQuestionForFirestore,
  shuffleAllQuestionsOptions,
} from '../../utils/questionParser';
import { useToast } from '../shared/Toast';
import EditQuestionsTab from './EditQuestionsTab';
import { readQuestionFile, readCsvFileAsQuestions, generateCsvTemplate } from '../../utils/questionFileImport';

const MOCK_EXAM_SPECIALTIES = [
  { id: 'general_nursing',     label: '🏥 General Nursing'     },
  { id: 'midwifery',             label: '🤱 Midwifery'             },
  { id: 'public_health_nursing', label: '🌍 Public Health Nursing' },
  { id: 'orthopaedic',         label: '🦴 Orthopaedic'         },
  { id: 'ophthalmic',          label: '👁️ Ophthalmic'          },
  { id: 'paediatric',          label: '👦 Paediatric'          },
  { id: 'ane_nursing',         label: '🚨 A&E Nursing'         },
  { id: 'icu_critical_care',   label: '💊 ICU/Critical Care'   },
  { id: 'anaesthetics',        label: '💉 Anaesthetics'        },
  { id: 'ent_nursing',         label: '💡 ENT Nursing'         },
  { id: 'occupational_health', label: '🏭 Occupational Health' },
  { id: 'burns_plastics',      label: '🩹 Burns & Plastics'    },
  { id: 'cardio_thoracic',     label: '❤️ Cardio-thoracic'     },
  { id: 'nephrology',          label: '🫘 Nephrology'          },
  { id: 'oncology',            label: '🎗️ Oncology'            },
  { id: 'community_nursing',    label: '🏘️ Community Nursing'   },
];

const EXTENDED_EXAM_TYPES = [
  {
    id:    'question_bank',
    label: '⭐ Question Bank (All Drills)',
    hint:  'Tag with Course + Topic. One upload feeds Topic Drill, Course Drill, and Daily Practice automatically.',
  },
  // ── NEW: Mock Exam type ──────────────────────────────────────────────────
  {
    id:    'mock_exam',
    label: '🏥 Mock Exam (by Specialty)',
    hint:  'Select the specialty below. Questions appear instantly on the student Mock Exam page.',
  },
  // hospital_finals, past_questions, and all legacy types excluded from upload options
];

// Filter dropdown: active types + legacy (for viewing old data). No hospital/past_questions.
const FILTER_EXAM_TYPES = [
  ...EXTENDED_EXAM_TYPES,
  { id: 'topic_drill',    label: 'Topic Drill (Legacy)'    },
  { id: 'course_drill',   label: 'Course Drill (Legacy)'   },
  { id: 'daily_practice', label: 'Daily Practice (Legacy)' },
];

// ── Return courses relevant to a given category ───────────────────────────────
// Merges Firestore courses with DEFAULT_NURSING_COURSES, deduplicates by id,
// then filters to only those whose `category` matches the selected category.
// Falls back to ALL courses if none match (shouldn't happen in practice).
function filteredCoursesFor(firestoreCourses, category) {
  // Merge: Firestore wins on duplicates (admin may have customised labels)
  const firestoreIds = new Set(firestoreCourses.map(c => c.id));
  const merged = [
    ...firestoreCourses,
    ...DEFAULT_NURSING_COURSES.filter(c => !firestoreIds.has(c.id)),
  ];
  const filtered = merged.filter(c => c.category === category);
  // If no courses tagged for this specialty, fall back to all
  return filtered.length > 0 ? filtered : merged;
}

// ── Question Usage Stats Tab ──────────────────────────────────────────────────
function QuestionStatsTab() {
  const [stats,   setStats]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy,  setSortBy]  = useState('attempts'); // 'attempts' | 'failRate'

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Read the questions collection for attemptCount / wrongCount fields
        // (written by ExamSession via increment())
        const snap = await getDocs(collection(db, 'questions'));
        const rows = snap.docs
          .map(d => {
            const q = d.data();
            const attempts = q.attemptCount || 0;
            const wrong    = q.wrongCount   || 0;
            const failRate = attempts > 0 ? Math.round((wrong / attempts) * 100) : null;
            return {
              id: d.id,
              question: (q.question || '').slice(0, 90),
              category: q.category || '',
              attempts,
              wrong,
              failRate,
            };
          })
          .filter(r => r.attempts > 0);

        rows.sort((a, b) =>
          sortBy === 'failRate'
            ? (b.failRate ?? 0) - (a.failRate ?? 0)
            : b.attempts - a.attempts
        );
        setStats(rows.slice(0, 50));
      } catch (e) { console.error('Stats load error:', e); }
      finally { setLoading(false); }
    };
    load();
  }, [sortBy]);

  if (loading) return (
    <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
      <div className="spinner" style={{ width:36, height:36, margin:'0 auto 12px' }} />
      Loading question stats…
    </div>
  );

  if (stats.length === 0) return (
    <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
      <div style={{ fontWeight:700, marginBottom:6 }}>No usage data yet</div>
      <p style={{ fontSize:13 }}>
        Stats appear once students start answering questions.<br />
        Data is written to each question document via <code>attemptCount</code> and <code>wrongCount</code> fields.
      </p>
    </div>
  );

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontWeight:900, fontSize:16, color:'var(--text-primary)', marginBottom:3 }}>Question Usage Stats</div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>Top {stats.length} questions by usage. Updates as students answer.</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['attempts','Most answered'],['failRate','Highest fail rate']].map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)} style={{
              padding:'6px 14px', borderRadius:20, border:'none', cursor:'pointer',
              fontSize:12, fontWeight:700,
              background: sortBy === key ? 'var(--teal)' : 'var(--bg-tertiary)',
              color:      sortBy === key ? '#fff' : 'var(--text-muted)',
              transition:'all .15s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {stats.map((r, i) => {
          const failColor = r.failRate >= 70 ? '#EF4444' : r.failRate >= 50 ? '#F59E0B' : '#10B981';
          return (
            <div key={r.id} style={{
              background:'var(--bg-card)', border:'1px solid var(--border)',
              borderRadius:10, padding:'12px 16px',
              display:'flex', gap:12, alignItems:'center',
            }}>
              <div style={{
                width:28, height:28, borderRadius:8, flexShrink:0, fontSize:12, fontWeight:900,
                background:'rgba(13,148,136,0.1)', color:'var(--teal)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>{i + 1}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {r.question}{r.question.length >= 90 ? '…' : ''}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{r.category}</div>
              </div>
              <div style={{ display:'flex', gap:14, flexShrink:0, textAlign:'center' }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:900, color:'var(--teal)' }}>{r.attempts}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>attempts</div>
                </div>
                {r.failRate !== null && (
                  <div>
                    <div style={{ fontSize:16, fontWeight:900, color:failColor }}>{r.failRate}%</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)' }}>fail rate</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function QuestionsManager() {
  const { toast }    = useToast();
  const [urlParams]  = useSearchParams();
  const defaultTab   = urlParams.get('action') === 'bulk' ? 'bulk_upload'
                     : urlParams.get('action') === 'add'  ? 'add_single' : 'list';

  const [tab,       setTab]       = useState(defaultTab);
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(new Set());

  // Filters
  const [filterCat,  setFilterCat]  = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(0);
  const PAGE_SIZE = 20;

  const BLANK = {
    question: '', options: ['', '', '', ''], correctIndex: 0,
    explanation: '', category: 'general_nursing', examType: 'question_bank',
    year: '2024', subject: '', difficulty: 'medium', source: '', tags: '',
    topic: '', course: '', imageUrl: '', explanationImageUrl: '',
    mockExamId: '',
  };
  const [form, setForm] = useState({ ...BLANK });

  const [bulkText,       setBulkText]       = useState('');
  const [answerText,     setAnswerText]     = useState('');
  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  // ── File import state ──────────────────────────────────────────────────────
  const [fileImporting,  setFileImporting]  = useState(false);
  const [fileImportInfo, setFileImportInfo] = useState('');
  const [fileWarnings,   setFileWarnings]   = useState([]);
  const [csvRowMeta,     setCsvRowMeta]     = useState([]); // per-row {course,topic,year} from CSV
  const [bulkMeta,       setBulkMeta]       = useState({
    category: 'general_nursing', examType: 'question_bank',
    year: '2024', subject: '', difficulty: 'medium', source: '',
    topic: '', course: '', mockExamId: '',
  });
  const [parsedQs,  setParsedQs]  = useState([]);
  const [parseErr,  setParseErr]  = useState('');
  const [parseInfo, setParseInfo] = useState('');

  const [firestoreCourses, setFirestoreCourses] = useState([]);
  useEffect(() => {
    getDocs(collection(db, 'courses'))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        all.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        setFirestoreCourses(all);
      })
      .catch(() => {});
  }, []);

  // ── Load questions ─────────────────────────────────────────────────────────
  const loadQuestions = async () => {
    setLoading(true);
    try {
      const constraints = [];
      if (filterCat)  constraints.push(where('category', '==', filterCat));
      if (filterType) constraints.push(where('examType', '==', filterType));
      if (filterYear) constraints.push(where('year',     '==', filterYear));
      constraints.push(orderBy('createdAt', 'desc'));
      const snap = await getDocs(query(collection(db, 'questions'), ...constraints));
      let qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (search) qs = qs.filter(q => q.question?.toLowerCase().includes(search.toLowerCase()));
      setQuestions(qs);
      setPage(0);
    } catch (e) { toast('Failed to load: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (tab === 'list') loadQuestions(); }, [tab, filterCat, filterType, filterYear]);

  // ── Single add ────────────────────────────────────────────────────────────
  const handleSingleAdd = async (e) => {
    e.preventDefault();
    const q = { ...form, options: form.options.filter(o => o.trim()), tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) };
    const errs = validateQuestion(q);
    if (errs.length) { toast(errs[0], 'error'); return; }
    setLoading(true);
    try {
      const data = {
        ...formatQuestionForFirestore(q, q),
        // Tag with selected specialty id for mock_exam type
        ...(form.examType === 'mock_exam' && form.mockExamId && { mockExamId: form.mockExamId }),
        active: true,
      };
      if (form.id) {
        await updateDoc(doc(db, 'questions', form.id), { ...data, updatedAt: serverTimestamp() });
        toast('Question updated!', 'success');
      } else {
        await addDoc(collection(db, 'questions'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast('Question saved!', 'success');
      }
      setForm({ ...BLANK });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  // ── File import handler ────────────────────────────────────────────────────
  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';

    setFileImporting(true);
    setFileImportInfo('');
    setFileWarnings([]);
    setParsedQs([]);
    setBulkText('');
    setParseErr('');
    setParseInfo('');

    try {
      const ext = (file.name || '').toLowerCase().split('.').pop();

      if (ext === 'csv') {
        // ── Direct CSV parse: bypass text round-trip to preserve course/topic/year ──
        const { questions: directQs, warnings, rowCount } = await readCsvFileAsQuestions(file);
        if (directQs.length === 0) {
          setParseErr('CSV appears to be empty or could not be parsed. Check the format and try again.');
          setFileImporting(false);
          return;
        }
        if (warnings?.length > 0) setFileWarnings(warnings);
        // Validate each question
        const validated = directQs.map((q, i) => {
          const issues = [];
          if (!q.question?.trim())               issues.push('Missing question text');
          if (!q._hasAnswer)                     issues.push('No answer set');
          const nonEmpty = (q.options || []).filter(o => o.trim());
          if (nonEmpty.length < 2)               issues.push('Fewer than 2 options');
          if (nonEmpty.length < 4)               issues.push(`Only ${nonEmpty.length} options (expected 4)`);
          return { ...q, _validationIssues: issues };
        });
        const withIssues = validated.filter(q => q._validationIssues.length > 0).length;
        const withoutAnswer = validated.filter(q => !q._hasAnswer).length;
        setParsedQs(validated);
        let info = `Parsed ${validated.length} questions from CSV.`;
        if (withoutAnswer > 0) info += ` ⚠️ ${withoutAnswer} have no answer.`;
        if (withIssues > 0)    info += ` 🔴 ${withIssues} have validation issues.`;
        setParseInfo(info);
        setBulkText(''); // clear text area — not needed for CSV
        setFileImportInfo(`📂 "${file.name}" — ${rowCount} CSV rows parsed directly. ${validated.length} questions ready to upload.`);
        toast(`${validated.length} questions parsed! Review then upload.`, 'success');
        setFileImporting(false);
        return;
      }

      // ── Non-CSV (docx, txt): use text round-trip as before ──
      const { text, warnings, rowCount, fileType, rowMeta } = await readQuestionFile(file);

      if (!text.trim()) {
        setParseErr('The file appears to be empty or could not be read. Check the format and try again.');
        setFileImporting(false);
        return;
      }

      setBulkText(text);
      if (warnings?.length > 0) setFileWarnings(warnings);
      if (rowMeta?.length > 0)  setCsvRowMeta(rowMeta); else setCsvRowMeta([]);

      const lines = text.split('\n').filter(l => l.trim()).length;
      const typeLabel = fileType === 'docx' ? 'Word document' : 'text file';
      setFileImportInfo(`📂 "${file.name}" loaded as ${typeLabel} — ${lines} lines of question text extracted. Click "Parse Questions" to preview.`);

      toast(`File loaded! Click Parse Questions to continue.`, 'success');
    } catch (err) {
      setParseErr('⚠️ ' + err.message);
    } finally {
      setFileImporting(false);
    }
  };

  // ── CSV template download ──────────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    const blob = generateCsvTemplate();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'nurses_academy_questions_template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Template downloaded!', 'success');
  };

  const handleParse = () => {
    setParseErr(''); setParseInfo('');
    if (!bulkText.trim()) { setParseErr('Paste questions first.'); return; }
    let parsed = parseQuestionsFromText(bulkText, answerText);
    if (parsed.length === 0) { setParseErr('Could not parse questions. Check the format guide below.'); return; }
    if (shuffleEnabled) parsed = shuffleAllQuestionsOptions(parsed);

    // ── Merge inline CSV row metadata for non-CSV uploads (txt/docx) ───────
    // For CSV files this is handled at parse time in readCsvFileAsQuestions.
    // For text/docx, use index-based rowMeta as best-effort fallback.
    if (csvRowMeta.length > 0) {
      parsed = parsed.map((q, i) => {
        const meta = csvRowMeta[i] || {};
        return {
          ...q,
          _inlineCourse: q._inlineCourse || meta.course || '',
          _inlineTopic:  q._inlineTopic  || meta.topic  || '',
          _inlineYear:   q._inlineYear   || meta.year   || '',
        };
      });
    }

    // ── Per-question validation ──────────────────────────────────────────
    const validated = parsed.map((q, i) => {
      const issues = [];
      if (!q.question?.trim())               issues.push('Missing question text');
      if (!q._hasAnswer && q.correctIndex < 0) issues.push('No answer set');
      const nonEmpty = (q.options || []).filter(o => (typeof o === 'string' ? o : o?.text || '').trim());
      if (nonEmpty.length < 2)               issues.push('Fewer than 2 options');
      if (nonEmpty.length < 4)               issues.push(`Only ${nonEmpty.length} options (expected 4)`);
      const emptyOpts = (q.options || []).map((o, j) => (typeof o === 'string' ? o : o?.text || '').trim() ? null : `Option ${String.fromCharCode(65+j)}`).filter(Boolean);
      if (emptyOpts.length > 0)             issues.push(`Empty: ${emptyOpts.join(', ')}`);
      return { ...q, _validationIssues: issues };
    });

    const withAnswer    = validated.filter(q => q._hasAnswer || q.correctIndex >= 0).length;
    const withoutAnswer = validated.length - withAnswer;
    const withIssues    = validated.filter(q => q._validationIssues.length > 0).length;
    setParsedQs(validated);
    let info = `Parsed ${validated.length} questions.`;
    if (shuffleEnabled) info += ' 🔀 Options shuffled.';
    if (withoutAnswer > 0) info += ` ⚠️ ${withoutAnswer} have no answer.`;
    if (withIssues > 0)    info += ` 🔴 ${withIssues} have validation issues — review below.`;
    setParseInfo(info);
    toast(`${validated.length} questions parsed!`, 'success');
  };

  // ── Bulk upload ───────────────────────────────────────────────────────────
  const handleBulkUpload = async () => {
    if (parsedQs.length === 0) { toast('Nothing to upload.', 'error'); return; }

    const isMockExam = bulkMeta.examType === 'mock_exam';
    const isQBank    = bulkMeta.examType === 'question_bank';

    if (isMockExam && !bulkMeta.mockExamId) {
      toast('⚠️ Please select a Specialty for Mock Exam uploads.', 'error'); return;
    }
    // For Question Bank: course is optional when CSV has inline course per question
    const hasInlineCourses = parsedQs.some(q => q._inlineCourse);
    if (isQBank && !bulkMeta.course && !hasInlineCourses) {
      toast('⚠️ Please select a Course, or use a CSV with a "course" column for per-question courses.', 'error'); return;
    }
    if (!isQBank && bulkMeta.examType === 'course_drill' && !bulkMeta.course) {
      toast('⚠️ Please select a Course before uploading course drill questions.', 'error'); return;
    }
    if (!isQBank && bulkMeta.examType === 'topic_drill' && (!bulkMeta.course || !bulkMeta.topic)) {
      toast('⚠️ Please set both Course and Topic for topic drill questions.', 'error'); return;
    }

    setLoading(true);
    try {
      const now     = new Date();
      const dateStr = now.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });

      let examName = '';
      if (isMockExam) {
        const spObj = MOCK_EXAM_SPECIALTIES.find(s => s.id === bulkMeta.mockExamId);
        examName = `Mock Exam — ${spObj?.label?.replace(/^.{2}/,'').trim() || bulkMeta.mockExamId} — ${dateStr}, ${timeStr}`;
      } else if (isQBank) {
        const courseObj = firestoreCourses.find(c => c.id === bulkMeta.course);
        const topicPart = bulkMeta.topic ? ` › ${bulkMeta.topic}` : '';
        examName = `${courseObj?.label || bulkMeta.course}${topicPart} — ${dateStr}, ${timeStr}`;
      } else {
        const catObj  = NURSING_CATEGORIES.find(c => c.id === bulkMeta.category);
        const typeObj = EXTENDED_EXAM_TYPES.find(t => t.id === bulkMeta.examType);
        examName = `${catObj?.shortLabel || bulkMeta.category} ${typeObj?.label || bulkMeta.examType} — ${dateStr}, ${timeStr}`;
      }

      // Create exam reference doc
      const examDoc = await addDoc(collection(db, 'exams'), {
        name:           examName,
        examType:       bulkMeta.examType,
        mockExamId:     isMockExam ? bulkMeta.mockExamId : null,
        category:       bulkMeta.category  || '',
        course:         bulkMeta.course    || '',
        topic:          bulkMeta.topic     || '',
        subject:        bulkMeta.subject   || '',
        year:           bulkMeta.year      || '2024',
        difficulty:     bulkMeta.difficulty || 'medium',
        totalQuestions: parsedQs.length,
        isPool:         isQBank,
        active:         !isQBank,
        createdAt:      serverTimestamp(),
      });
      const examId = examDoc.id;

      // ── Resolve inline CSV course names → real course doc IDs ────────────
      // Course/Topic Drill query questions with where('course','==', course.id),
      // so a question's `course` field must always be an actual courses/{id},
      // never the raw CSV label. Look up existing courses by label first;
      // only fall back to a fresh slug for genuinely new courses.
      const hasInlineCourseRows = parsedQs.some(q => q._inlineCourse);
      let existingCoursesSnap = null;
      const labelToId = new Map();
      if (hasInlineCourseRows) {
        existingCoursesSnap = await getDocs(collection(db, 'courses'));
        existingCoursesSnap.docs.forEach(d => {
          const label = (d.data().label || '').toLowerCase().trim();
          if (label) labelToId.set(label, d.id);
        });
      }
      const resolveCourseId = (rawName) => {
        const trimmed = (rawName || '').trim();
        if (!trimmed) return '';
        return labelToId.get(trimmed.toLowerCase())
          || trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      };

      // Upload questions in batches of 500
      const batchSize = 500;
      for (let i = 0; i < parsedQs.length; i += batchSize) {
        const batch = writeBatch(db);
        parsedQs.slice(i, i + batchSize).forEach(q => {
          const ref  = doc(collection(db, 'questions'));
          // Per-question inline course/topic/year overrides global bulkMeta.
          // Inline course names are resolved to a real course doc ID above.
          const qMeta = {
            ...bulkMeta,
            course: q._inlineCourse ? resolveCourseId(q._inlineCourse) : (bulkMeta.course || ''),
            topic:  q._inlineTopic  || bulkMeta.topic  || '',
            year:   q._inlineYear   || bulkMeta.year   || '2024',
          };
          const data = formatQuestionForFirestore(q, qMeta);
          batch.set(ref, {
            ...data,
            examId,
            // Tag with the selected specialty id so MockExamPage can query it
            ...(isMockExam && { mockExamId: bulkMeta.mockExamId }),
            active:    true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      // ── Auto-create any missing courses in Firestore ─────────────────────
      // Group inline CSV rows by the *same resolved course ID* used on the
      // questions above, so topics and course docs stay in sync with them.
      if (hasInlineCourseRows) {
        const existingIds = new Set(existingCoursesSnap.docs.map(d => d.id));
        const courseGroups = {}; // courseId -> { label, topics: Set }

        parsedQs.forEach(q => {
          const rawName = (q._inlineCourse || '').trim();
          if (!rawName) return;
          const courseId = resolveCourseId(rawName);
          if (!courseId) return;
          if (!courseGroups[courseId]) courseGroups[courseId] = { label: rawName, topics: new Set() };
          const tp = (q._inlineTopic || '').trim();
          if (tp) courseGroups[courseId].topics.add(tp);
        });

        const newCoursesBatch = writeBatch(db);
        let newCoursesCount = 0;

        for (const [courseId, { label, topics: topicSet }] of Object.entries(courseGroups)) {
          const topics    = [...topicSet];
          const courseRef = doc(db, 'courses', courseId);

          if (!existingIds.has(courseId)) {
            // New course — create with topics array populated from the CSV
            newCoursesBatch.set(courseRef, {
              label,
              icon:        '📖',
              category:    bulkMeta.category || 'general_nursing',
              active:      true,
              order:       999,
              topics,
              createdAt:   serverTimestamp(),
              autoCreated: true,
            }, { merge: true });
            newCoursesCount++;
          } else if (topics.length > 0) {
            // Existing course — merge new topics without overwriting existing ones
            newCoursesBatch.update(courseRef, {
              topics: arrayUnion(...topics),
            });
          }
        }

        if (Object.keys(courseGroups).length > 0) {
          await newCoursesBatch.commit();
          // Refresh local courses list
          const refreshed = await getDocs(collection(db, 'courses'));
          const all = refreshed.docs.map(d => ({ id: d.id, ...d.data() }));
          all.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
          setFirestoreCourses(all);
          if (newCoursesCount > 0)
            toast(`✅ ${newCoursesCount} new course(s) auto-created with topics!`, 'success');
        }
      }

      toast(`✅ "${examName}" — ${parsedQs.length} questions uploaded!`, 'success');
      setParsedQs([]); setBulkText(''); setAnswerText(''); setParseInfo('');
    } catch (e) { toast('Upload failed: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  // ── Sync exam question count after deletions ─────────────────────────────
  const syncExamQuestionCount = async (examId) => {
    try {
      const snap = await getDocs(query(collection(db, 'questions'), where('examId', '==', examId)));
      const remaining = snap.size;
      await updateDoc(doc(db, 'exams', examId), {
        totalQuestions: remaining,
        ...(remaining === 0 ? { active: false } : { active: true }),
      });
    } catch (e) { console.warn('syncExamQuestionCount failed for', examId, e); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      const qSnap  = await getDoc(doc(db, 'questions', id));
      const examId = qSnap.exists() ? qSnap.data().examId : null;
      await deleteDoc(doc(db, 'questions', id));
      setQuestions(prev => prev.filter(q => q.id !== id));
      if (examId) await syncExamQuestionCount(examId);
      toast('Deleted.', 'success');
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected question(s)? This cannot be undone.`)) return;
    try {
      const examIds = new Set(
        questions.filter(q => selected.has(q.id) && q.examId).map(q => q.examId)
      );
      const batch = writeBatch(db);
      selected.forEach(id => batch.delete(doc(db, 'questions', id)));
      await batch.commit();
      setQuestions(prev => prev.filter(q => !selected.has(q.id)));
      setSelected(new Set());
      await Promise.all([...examIds].map(syncExamQuestionCount));
      toast('Deleted.', 'success');
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
  };

  const paged = questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const showCourseField = (t) => ['question_bank', 'course_drill', 'topic_drill'].includes(t);
  const showTopicField  = (t) => ['question_bank', 'topic_drill', 'course_drill'].includes(t);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 20px', color: 'var(--text-primary)' }}>
        ❓ Questions Manager
      </h2>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {[
          ['list',        '📋 All\nQuestions'],
          ['add_single',  '➕ Add\nSingle'],
          ['bulk_upload', '📤 Bulk\nUpload'],
          ['stats',       '📊 Usage\nStats'],
          ['edit',        '✏️ Quick\nEdit'],
        ].map(([id, label]) => (
          <button key={id} style={{
            ...styles.tabBtn,
            background: tab === id ? 'var(--teal)' : 'transparent',
            color:      tab === id ? '#fff' : 'var(--text-secondary)',
          }} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <div>
          <div style={styles.filterBar}>
            <select className="form-input" style={{ height:38, width:180 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">All Categories</option>
              {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.shortLabel}</option>)}
            </select>
            <select className="form-input" style={{ height:38, width:230 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              {FILTER_EXAM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select className="form-input" style={{ height:38, width:120 }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="">All Years</option>
              {EXAM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <input className="form-input" style={{ height:38, width:220 }} placeholder="🔍 Search…" value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn btn-secondary btn-sm" onClick={loadQuestions}>↻ Refresh</button>
            {selected.size > 0 && (
              <button className="btn btn-danger btn-sm" onClick={deleteSelected}>🗑️ Delete {selected.size}</button>
            )}
          </div>

          {loading ? <div className="flex-center" style={{ padding:40 }}><div className="spinner"/></div> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(questions.map(q=>q.id)) : new Set())} /></th>
                      <th>TYPE</th><th>COURSE</th><th>TOPIC</th><th>CATEGORY</th><th>CREATED</th><th>D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(q => (
                      <tr key={q.id}>
                        <td><input type="checkbox" checked={selected.has(q.id)} onChange={e => {
                          const s = new Set(selected);
                          e.target.checked ? s.add(q.id) : s.delete(q.id);
                          setSelected(s);
                        }}/></td>
                        <td>
                          <span className={`badge ${
                            q.examType === 'question_bank' ? 'badge-teal'
                          : q.examType === 'mock_exam'     ? 'badge-gold'
                          : 'badge-grey'}`}>
                            {q.examType === 'question_bank' ? '⭐ Pool'
                           : q.examType === 'mock_exam'
                             ? `🏥 ${MOCK_EXAM_SPECIALTIES.find(s => s.id === q.mockExamId)?.label?.replace(/^.{2}/,'').trim() || 'Mock'}`
                           : q.examType === 'topic_drill'    ? '📚 Topic (Legacy)'
                           : q.examType === 'course_drill'   ? '📖 Course (Legacy)'
                           : q.examType === 'daily_practice' ? '📅 Daily (Legacy)'
                           : q.examType}
                          </span>
                        </td>
                        <td style={{ fontSize:12 }}>{firestoreCourses.find(c=>c.id===q.course)?.label || q.course || '—'}</td>
                        <td style={{ fontSize:12 }}>{q.topic || '—'}</td>
                        <td>{NURSING_CATEGORIES.find(c=>c.id===q.category)?.icon} {NURSING_CATEGORIES.find(c=>c.id===q.category)?.shortLabel || q.category}</td>
                        <td style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                          {q.createdAt?.toDate
                            ? q.createdAt.toDate().toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' }) + ' ' +
                              q.createdAt.toDate().toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' })
                            : '—'}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setForm({...q, tags: (q.tags||[]).join(',')}); setTab('add_single'); }}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q.id)}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:12, alignItems:'center' }}>
                <button className="btn btn-ghost btn-sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}>← Prev</button>
                <span style={{ fontSize:13, color:'var(--text-muted)' }}>Page {page+1} of {Math.max(1,Math.ceil(questions.length/PAGE_SIZE))} ({questions.length} total)</span>
                <button className="btn btn-ghost btn-sm" disabled={(page+1)*PAGE_SIZE>=questions.length} onClick={()=>setPage(p=>p+1)}>Next →</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ADD SINGLE TAB ── */}
      {tab === 'add_single' && (
        <form onSubmit={handleSingleAdd} style={{ maxWidth:700 }}>
          <div style={styles.metaGrid}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value,course:''}))}>
                {NURSING_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.shortLabel}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Exam Type</label>
              <select className="form-input" value={form.examType} onChange={e=>setForm(f=>({...f,examType:e.target.value,course:'',topic:'',mockExamId:''}))}>
                {EXTENDED_EXAM_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <div className="form-hint" style={{ color:'var(--teal)', fontSize:11 }}>
                💡 Use <strong>Question Bank</strong> for all drills (replaces legacy Topic/Course/Daily types)
              </div>
            </div>

            {/* Mock Exam specialty picker */}
            {form.examType === 'mock_exam' && (
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{
                  background: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.35)',
                  borderRadius: 10, padding: '12px 16px', fontSize: 13,
                  color: 'var(--text-primary)', marginBottom: 12,
                }}>
                  🏥 <strong>Mock Exam</strong> — select the specialty below. This question will appear
                  instantly on the student Mock Exam page under that specialty.
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gold)' }}>Specialty * (required)</label>
                  <select className="form-input" value={form.mockExamId}
                    onChange={e => setForm(f => ({ ...f, mockExamId: e.target.value }))} required>
                    <option value="">— Select Specialty —</option>
                    {MOCK_EXAM_SPECIALTIES.map(sp => (
                      <option key={sp.id} value={sp.id}>{sp.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Question Bank banner */}
            {form.examType === 'question_bank' && (
              <div style={{
                gridColumn: '1/-1',
                background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.35)',
                borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)',
              }}>
                ⭐ <strong>Question Bank</strong> — set <strong>Course</strong> and <strong>Topic</strong> below.
                This question will automatically appear in <strong>Course Drill</strong>, <strong>Topic Drill</strong>, and <strong>Daily Practice</strong>.
              </div>
            )}

            {showCourseField(form.examType) && (
              <div className="form-group">
                <label className="form-label">Course *</label>
                <select className="form-input" value={form.course} onChange={e=>setForm(f=>({...f,course:e.target.value}))}>
                  <option value="">— Select Course —</option>
                  {filteredCoursesFor(firestoreCourses, form.category).map(c=>(
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <div className="form-hint" style={{ fontSize:11 }}>
                  Showing courses for <strong>{NURSING_CATEGORIES.find(c=>c.id===form.category)?.shortLabel || form.category}</strong>
                </div>
              </div>
            )}
            {showTopicField(form.examType) && (
              <div className="form-group">
                <label className="form-label">Topic {form.examType === 'topic_drill' ? '* (required)' : '(optional)'}</label>
                <input className="form-input" placeholder="e.g. Fluid & Electrolytes" value={form.topic} onChange={e=>setForm(f=>({...f,topic:e.target.value}))} />
              </div>
            )}

            {!['course_drill','topic_drill','question_bank','mock_exam'].includes(form.examType) && (
              <div className="form-group">
                <label className="form-label">Year</label>
                <select className="form-input" value={form.year} onChange={e=>setForm(f=>({...f,year:e.target.value}))}>
                  {EXAM_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Difficulty</label>
              <select className="form-input" value={form.difficulty} onChange={e=>setForm(f=>({...f,difficulty:e.target.value}))}>
                {DIFFICULTY_LEVELS.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginTop:16 }}>
            <label className="form-label">Question *</label>
            <textarea className="form-input" rows={3} value={form.question} onChange={e=>setForm(f=>({...f,question:e.target.value}))} />
          </div>

          {form.options.map((opt, i) => (
            <div key={i} className="form-group">
              <label className="form-label" style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="radio" name="correct" checked={form.correctIndex===i} onChange={()=>setForm(f=>({...f,correctIndex:i}))} />
                Option {String.fromCharCode(65+i)} {form.correctIndex===i && <span style={{color:'var(--green)',fontSize:12}}>✓ Correct</span>}
              </label>
              <input className="form-input" value={opt} onChange={e=>{
                const opts=[...form.options]; opts[i]=e.target.value; setForm(f=>({...f,options:opts}));
              }} />
            </div>
          ))}

          <div className="form-group">
            <label className="form-label">Explanation (optional)</label>
            <textarea className="form-input" rows={2} value={form.explanation} onChange={e=>setForm(f=>({...f,explanation:e.target.value}))} />
          </div>

          <div className="form-group">
            <label className="form-label">📷 Question Image URL (optional)</label>
            <input className="form-input" placeholder="Paste image URL…" value={form.imageUrl} onChange={e=>setForm(f=>({...f,imageUrl:e.target.value}))} />
          </div>

          <div className="form-group">
            <label className="form-label">🖼️ Explanation Image URL (optional)</label>
            <input className="form-input" placeholder="Paste image URL for explanation diagram…" value={form.explanationImageUrl} onChange={e=>setForm(f=>({...f,explanationImageUrl:e.target.value}))} />
          </div>

          <div style={{ display:'flex', gap:10, marginTop:16 }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? <><span className="spinner spinner-sm"/> Saving…</> : form.id ? '💾 Update' : '➕ Add Question'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={()=>setForm({...BLANK})}>Clear</button>
          </div>
        </form>
      )}

      {/* ── BULK UPLOAD TAB ── */}
      {tab === 'bulk_upload' && (
        <div>
          {/* Meta fields */}
          <div style={{ ...styles.metaGrid, marginBottom:20, padding:'16px 18px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12 }}>
            <div style={{ gridColumn:'1/-1', fontWeight:700, fontSize:14, color:'var(--teal)', marginBottom:4 }}>
              📋 Exam Metadata — set these BEFORE uploading
            </div>

            <div className="form-group">
              <label className="form-label">Exam Type *</label>
              <select className="form-input" value={bulkMeta.examType} onChange={e=>setBulkMeta(m=>({...m,examType:e.target.value,course:'',topic:'',mockExamId:''}))}>
                {EXTENDED_EXAM_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <div className="form-hint" style={{ color:'var(--teal)', fontSize:11 }}>
                💡 Use <strong>Question Bank</strong> for all drills — it replaces Topic Drill, Course Drill &amp; Daily Practice (legacy types removed from upload)
              </div>
            </div>

            {bulkMeta.examType !== 'mock_exam' && (
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-input" value={bulkMeta.category} onChange={e=>setBulkMeta(m=>({...m,category:e.target.value,course:''}))}>
                  {NURSING_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.shortLabel}</option>)}
                </select>
              </div>
            )}

            {/* Mock Exam specialty picker */}
            {bulkMeta.examType === 'mock_exam' && (
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{
                  background: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.35)',
                  borderRadius: 10, padding: '12px 16px', fontSize: 13,
                  color: 'var(--text-primary)', marginBottom: 12,
                }}>
                  🏥 <strong>Mock Exam</strong> — select the specialty below. Questions will be tagged
                  with the specialty id and appear instantly on the student Mock Exam page under that specialty.
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gold)' }}>Specialty * (required)</label>
                  <select className="form-input"
                    value={bulkMeta.mockExamId}
                    onChange={e => setBulkMeta(m => ({ ...m, mockExamId: e.target.value }))}>
                    <option value="">— Select Specialty —</option>
                    {MOCK_EXAM_SPECIALTIES.map(sp => (
                      <option key={sp.id} value={sp.id}>{sp.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Question Bank banner */}
            {bulkMeta.examType === 'question_bank' && (
              <div style={{
                gridColumn: '1/-1',
                background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.35)',
                borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)',
              }}>
                ⭐ <strong>Question Bank (Unified Pool)</strong> — upload once, used everywhere.<br />
                Tag with <strong>Course + Topic + Year</strong> either here (applies to all) or per-row in your CSV.<br />
                <span style={{ color:'var(--teal)', fontSize:12 }}>
                  💡 CSV tip: add <code>course</code>, <code>topic</code>, <code>year</code> columns — each question will be tagged individually.
                  Missing courses will be <strong>auto-created</strong> and instantly visible to students.
                </span>
              </div>
            )}

            {showCourseField(bulkMeta.examType) && (
              <div className="form-group">
                <label className="form-label">
                  Course {parsedQs.some(q => q._inlineCourse) ? '(optional — CSV has inline courses)' : '* (required)'}
                </label>
                <select className="form-input" value={bulkMeta.course} onChange={e=>setBulkMeta(m=>({...m,course:e.target.value}))}>
                  <option value="">— Select Course (fallback) —</option>
                  {filteredCoursesFor(firestoreCourses, bulkMeta.category).map(c=>(
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <div className="form-hint" style={{ fontSize:11 }}>
                  {parsedQs.some(q => q._inlineCourse)
                    ? `✅ ${[...new Set(parsedQs.map(q=>q._inlineCourse).filter(Boolean))].length} unique course(s) detected in CSV — will be auto-assigned per question`
                    : `Showing courses for ${NURSING_CATEGORIES.find(c=>c.id===bulkMeta.category)?.shortLabel || bulkMeta.category}`
                  }
                </div>
              </div>
            )}
            {showTopicField(bulkMeta.examType) && (
              <div className="form-group">
                <label className="form-label" style={{ color: bulkMeta.examType === 'topic_drill' ? 'var(--gold)' : 'var(--text-secondary)' }}>
                  Topic {bulkMeta.examType === 'topic_drill' ? '* (required)' : '(optional)'}
                </label>
                <input className="form-input"
                  placeholder={bulkMeta.examType === 'course_drill' ? 'Optional' : 'e.g. Fluid & Electrolytes'}
                  value={bulkMeta.topic}
                  onChange={e=>setBulkMeta(m=>({...m,topic:e.target.value}))}
                />
              </div>
            )}

            {!['course_drill','topic_drill','daily_practice','question_bank','mock_exam'].includes(bulkMeta.examType) && (
              <div className="form-group">
                <label className="form-label">Year {parsedQs.some(q => q._inlineYear) ? '(fallback — CSV has inline years)' : ''}</label>
                <select className="form-input" value={bulkMeta.year} onChange={e=>setBulkMeta(m=>({...m,year:e.target.value}))}>
                  {EXAM_YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                {parsedQs.some(q => q._inlineYear) && (
                  <div className="form-hint" style={{ color:'var(--teal)', fontSize:11 }}>
                    ✅ Per-question years detected in CSV — used as override; this is only the fallback
                  </div>
                )}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Difficulty</label>
              <select className="form-input" value={bulkMeta.difficulty} onChange={e=>setBulkMeta(m=>({...m,difficulty:e.target.value}))}>
                {DIFFICULTY_LEVELS.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
          </div>

          {/* Shuffle toggle */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:4 }}>
              <div onClick={()=>setShuffleEnabled(v=>!v)} style={{
                width:44, height:24, borderRadius:12, position:'relative', cursor:'pointer',
                background: shuffleEnabled ? 'var(--teal)' : 'var(--bg-tertiary)',
                border:'1px solid var(--border)', transition:'background 0.2s',
              }}>
                <div style={{
                  position:'absolute', top:3, left: shuffleEnabled ? 23 : 3,
                  width:18, height:18, borderRadius:'50%', background:'#fff',
                  transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </div>
              <span style={{ fontWeight:600, fontSize:14 }}>🔀 Shuffle answer positions</span>
            </label>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>
              {shuffleEnabled ? 'ON — correct answers will be spread across A, B, C, D randomly' : 'OFF — options stay in original order'}
            </span>
          </div>

          {/* Format guide */}
          <div className="alert alert-info" style={{ marginBottom:16, fontSize:12 }}>
            <strong>📋 Accepted formats:</strong>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginTop:10 }}>
              {[
                ['Standard (answer inline)', '1. Question?\nA. Option  B. Option  C. Option  D. Option\nAnswer: C'],
                ['Options on separate lines', '1. Question?\nA) Option one\nB) Option two\nC) Option three\nD) Option four\nANS: B'],
                ['Short 2-per-line options', '1. Question?\nA. Sympathy   C. Socialism\nB. Criticism  D. Empathy\nAnswer: D'],
                ['✨ Bold correct answer (NEW)', 'Blood makes up about --- of body weight\na. 5%\n**b. 7%**\nc. 6.5%\nd. 8%\n\n2. The osmotic pressure is\na. 45mmHg\nb. 35mmHg\n**c. 25mmHg**\nd. 15mmHg'],
                ['Separate answer key box', 'Paste questions above with NO answers,\nthen paste answer key below:\n1. C\n2. A\n3. D\n4. B'],
              ].map(([title, example]) => (
                <div key={title} style={{ background:'var(--bg-tertiary)', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontWeight:700, marginBottom:6, color:'var(--teal)', fontSize:12 }}>{title}</div>
                  <pre style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-secondary)', margin:0, whiteSpace:'pre-wrap' }}>{example}</pre>
                </div>
              ))}
            </div>
          </div>

          {/* ── File Upload Zone ── */}
          <div style={{
            marginBottom: 20, padding: '20px 20px', borderRadius: 14,
            border: '2px dashed var(--border)', background: 'var(--bg-card)',
            transition: 'border-color .2s',
          }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--teal)'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--border)';
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileImport({ target: { files: [file], value: '' } });
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                  📁 Upload from File
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Supports <strong>.csv</strong> (spreadsheet), <strong>.docx</strong> (Word), or <strong>.txt</strong> (plain text).
                  Drag &amp; drop here or click the button. The file content will be extracted and placed in the text area below for you to preview before uploading.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                <label style={{
                  padding: '9px 18px', borderRadius: 10, cursor: fileImporting ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 13, border: 'none',
                  background: 'var(--teal)', color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: fileImporting ? 0.6 : 1, transition: 'opacity .2s',
                }}>
                  {fileImporting
                    ? <><span className="spinner spinner-sm" /> Reading…</>
                    : <><span>📂</span> Choose File</>}
                  <input
                    type="file"
                    accept=".csv,.docx,.txt,.text,.md"
                    style={{ display: 'none' }}
                    onChange={handleFileImport}
                    disabled={fileImporting}
                  />
                </label>

                <button
                  onClick={handleDownloadTemplate}
                  style={{
                    padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
                    fontWeight: 700, fontSize: 12, border: '1px solid var(--border)',
                    background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                  title="Download a sample CSV template"
                >
                  ⬇️ CSV Template
                </button>
              </div>
            </div>

            {/* Import status */}
            {fileImportInfo && (
              <div style={{
                marginTop: 12, padding: '8px 14px', borderRadius: 9,
                background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)',
                fontSize: 12, color: 'var(--text-primary)', fontWeight: 600,
              }}>
                {fileImportInfo}
              </div>
            )}

            {/* Import warnings */}
            {fileWarnings.length > 0 && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 9,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                fontSize: 12,
              }}>
                <div style={{ fontWeight: 800, color: 'var(--gold)', marginBottom: 4 }}>⚠️ Import notes:</div>
                {fileWarnings.map((w, i) => (
                  <div key={i} style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>• {w}</div>
                ))}
              </div>
            )}

            {/* CSV format guide */}
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                📋 CSV column formats supported
              </summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                {[
                  ['Standard 6-column (recommended)', 'question, option_a, option_b, option_c, option_d, answer, explanation'],
                  ['Numbered columns', 'question, a, b, c, d, answer'],
                  ['Google Forms export', 'Question, Option 1, Option 2, Option 3, Option 4, Correct Answer'],
                  ['JSON options', 'question, options (JSON array), answer, explanation'],
                ].map(([title, fmt]) => (
                  <div key={title} style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--teal)', marginBottom: 4 }}>{title}</div>
                    <pre style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>{fmt}</pre>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                <strong>Answer column</strong> accepts: <code>B</code>, <code>b</code>, <code>2</code>, <code>B. Option text</code>, or the full option text.
              </div>
            </details>
          </div>

          {/* Textareas */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize:14, fontWeight:700 }}>
                📝 Questions <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:12, marginLeft:6 }}>(paste here, or upload a file above)</span>
              </label>
              <textarea className="form-input" rows={16}
                placeholder={"1. What is the normal adult heart rate?\nA. 40-60 bpm\nB. 60-100 bpm\nC. 100-120 bpm\nD. 120-160 bpm\nAnswer: B"}
                value={bulkText}
                onChange={e => { setBulkText(e.target.value); setParsedQs([]); setParseInfo(''); }}
                style={{ fontFamily:'monospace', fontSize:12, resize:'vertical', minHeight:260 }}
              />
              <div className="form-hint">{bulkText ? `~${bulkText.split('\n').filter(l=>l.trim()).length} lines` : 'Supports 1000+ questions at once'}</div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize:14, fontWeight:700 }}>
                🔑 Answer Key <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:12, marginLeft:6 }}>(optional)</span>
              </label>
              <textarea className="form-input" rows={16}
                placeholder={"1. B\n2. C\n3. A\n4. D\n5. B"}
                value={answerText}
                onChange={e => { setAnswerText(e.target.value); setParsedQs([]); setParseInfo(''); }}
                style={{ fontFamily:'monospace', fontSize:12, resize:'vertical', minHeight:260 }}
              />
              <div className="form-hint">
                {answerText ? `${Object.keys(parseAnswerKey(answerText)).length} answers detected` : 'Leave blank if answers are inside question text'}
              </div>
            </div>
          </div>

          {parseErr  && <div className="alert alert-error"  style={{ marginBottom:12 }}>⚠️ {parseErr}</div>}
          {parseInfo && <div className="alert alert-info"   style={{ marginBottom:12 }}>ℹ️ {parseInfo}</div>}

          <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
            <button className="btn btn-secondary" onClick={handleParse} disabled={!bulkText.trim()}>
              🔍 Parse Questions
            </button>
            {parsedQs.length > 0 && (
              <button className="btn btn-primary" onClick={handleBulkUpload} disabled={loading}>
                {loading ? <><span className="spinner spinner-sm" /> Uploading…</> : `✅ Upload ${parsedQs.length} Questions`}
              </button>
            )}
            {(bulkText || answerText || parsedQs.length > 0) && (
              <button className="btn btn-ghost" onClick={() => { setParsedQs([]); setBulkText(''); setAnswerText(''); setParseInfo(''); setParseErr(''); setFileImportInfo(''); setFileWarnings([]); }}>
                🗑️ Clear All
              </button>
            )}
          </div>

          {/* Parsed preview */}
          {parsedQs.length > 0 && (() => {
            const errCount = parsedQs.filter(q => q._validationIssues?.length > 0).length;
            const okCount  = parsedQs.length - errCount;
            return (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
                <div style={{ fontWeight:700, color:'var(--teal)', fontSize:15 }}>
                  {parsedQs.length} questions parsed — review before uploading:
                </div>
                {errCount > 0 && (
                  <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:800, background:'rgba(239,68,68,0.12)', color:'#EF4444', border:'1px solid rgba(239,68,68,0.3)' }}>
                    🔴 {errCount} with issues
                  </span>
                )}
                {okCount > 0 && (
                  <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:800, background:'rgba(22,163,74,0.12)', color:'var(--green)', border:'1px solid rgba(22,163,74,0.3)' }}>
                    ✅ {okCount} ready
                  </span>
                )}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:600, overflowY:'auto', paddingRight:4 }}>
                {parsedQs.map((q, i) => {
                  const issues = q._validationIssues || [];
                  const hasErr = issues.length > 0;
                  const noAns  = !q._hasAnswer && q.correctIndex < 0;
                  const bColor = hasErr ? '#EF4444' : noAns ? 'var(--gold)' : 'var(--green)';
                  return (
                  <div key={i} style={{ ...styles.parsedCard, borderLeft:`4px solid ${bColor}` }}>
                    <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                      <span style={{ fontWeight:700, color:'var(--teal)', flexShrink:0, fontSize:13 }}>Q{i+1}.</span>
                      <div style={{ flex:1 }}>
                        {/* Inline validation errors */}
                        {hasErr && (
                          <div style={{ marginBottom:8, padding:'6px 10px', borderRadius:8, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)' }}>
                            {issues.map((issue, k) => (
                              <div key={k} style={{ fontSize:12, color:'#EF4444', fontWeight:700, display:'flex', gap:5, lineHeight:1.6 }}>
                                <span>⚠</span><span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ fontWeight:600, fontSize:14, marginBottom:8 }}>{q.question}</div>
                        {/* Inline metadata badges */}
                        {(q._inlineCourse || q._inlineTopic || q._inlineYear) && (
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                            {q._inlineCourse && (
                              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:'rgba(13,148,136,0.12)', color:'var(--teal)', border:'1px solid rgba(13,148,136,0.3)', fontWeight:700 }}>
                                📖 {q._inlineCourse}
                              </span>
                            )}
                            {q._inlineTopic && (
                              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:'rgba(99,102,241,0.1)', color:'#6366f1', border:'1px solid rgba(99,102,241,0.25)', fontWeight:700 }}>
                                🎯 {q._inlineTopic}
                              </span>
                            )}
                            {q._inlineYear && (
                              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:12, background:'rgba(245,158,11,0.1)', color:'var(--gold)', border:'1px solid rgba(245,158,11,0.25)', fontWeight:700 }}>
                                📅 {q._inlineYear}
                              </span>
                            )}
                          </div>
                        )}
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          {q.options.map((opt, j) => (
                            <div key={j} style={{
                              fontSize:13, padding:'4px 10px', borderRadius:6,
                              background: j===q.correctIndex ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)',
                              color: j===q.correctIndex ? 'var(--green)' : 'var(--text-secondary)',
                              fontWeight: j===q.correctIndex ? 700 : 400,
                              border: `1px solid ${j===q.correctIndex ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
                            }}>
                              {String.fromCharCode(65+j)}. {typeof opt === 'string' ? opt : opt.text} {j===q.correctIndex && '✓'}
                            </div>
                          ))}
                        </div>
                        {q.explanation && (
                          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:6, fontStyle:'italic' }}>💡 {q.explanation}</div>
                        )}
                      </div>
                      <button className="btn btn-danger btn-sm" style={{ flexShrink:0 }}
                        onClick={() => setParsedQs(prev => prev.filter((_,j)=>j!==i))}>×</button>
                    </div>
                  </div>
                );})}
              </div>
            </div>
          );})()}
          )}
        </div>
      )}

      {/* ── EDIT TAB ── */}
      {tab === 'edit' && (
        <EditQuestionsTab
          firestoreCourses={firestoreCourses}
          toast={toast}
        />
      )}

      {/* ── STATS TAB ── */}
      {tab === 'stats' && <QuestionStatsTab />}
    </div>
  );
}

const styles = {
  tabBar:     { display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:4, background:'var(--bg-tertiary)', border:'1px solid var(--border)', borderRadius:12, padding:4, marginBottom:24, width:'100%', boxSizing:'border-box' },
  tabBtn:     { padding:'8px 4px', borderRadius:9, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700, transition:'all 0.2s', textAlign:'center', lineHeight:1.3, whiteSpace:'normal', wordBreak:'break-word' },
  filterBar:  { display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' },
  metaGrid:   { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14 },
  parsedCard: { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' },
};
