// src/components/admin/EntranceExamManager.jsx
// Route: /admin/entrance-exam
// Tabs: Manage Schools | Add Questions (Single) | Bulk Upload | Question Bank

import { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, where, orderBy, serverTimestamp, writeBatch, getCountFromServer,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';

const ENTRANCE_YEARS = ['2018','2019','2020','2021','2022','2023','2024','2025'];
const SUBJECTS = ['English Language','Biology','Chemistry','Physics','Mathematics','General Studies','Nursing Aptitude','Current Affairs'];

// ── Parse a block of text into entrance exam questions ────────────────────────────────────────────
// Supported formats (auto-detected):
//
// FORMAT A — Inline answer (original):
//   [optional: https://image.url]
//   Question text
//   A. Option A    or    A) Option A
//   B. Option B
//   C. Option C
//   D. Option D
//   *B              ← OR: "Answer: B" / "Ans: B" / "(B)"
//   Explanation: Optional explanation
//   [blank line between questions]
//
// FORMAT B — Numbered questions + separate answer key (NurseElite/NMCN doc style):
//   1. Question text
//      A. Option A          (tab or space indented options are fine)
//      B. Option B
//      C. Option C
//      D. Option D
//   2. Next question...
//   ...
//   ANSWER KEY  (or "Answers", "Answer Key", standalone heading)
//   1. B   2. C   3. A   4. D ...   (all on one line or multiple lines, any spacing)
//
function parseEntranceQuestions(rawText) {
  const results = [], errors = [];

  // ── Detect Format B: numbered questions with a separate answer key section ──
  // Heuristic: text contains a line like "1. B   2. C" or an "ANSWER KEY" heading
  // followed by number-letter pairs.
  const answerKeyHeadingRe = /^(?:answer\s*key|answers?|key)\s*[:\-]?$/im;
  const answerKeyLineRe    = /(?:^|\s)(\d+)[.)\s]+([A-D])(?=\s|$)/gi;

  // Count how many "N. LETTER" pairs exist anywhere in the text
  const allPairs = [...rawText.matchAll(/(?:^|\s)(\d+)[.)\s]+([A-D])(?=\s|$)/gim)];

  // Also look for numbered question starts
  const numberedQRe = /^\d+\.\s+\S/m;

  // Format B if: (a) there's an explicit answer key heading, OR
  // (b) numbered questions exist AND we have 4+ number-letter answer pairs.
  const hasAnswerKeyHeading = answerKeyHeadingRe.test(rawText);
  const isFormatB = numberedQRe.test(rawText) && (hasAnswerKeyHeading || allPairs.length >= 4);

  if (isFormatB) {
    // ── FORMAT B PARSER ────────────────────────────────────────────────────────
    // Step 1: Split into questions section and answer key section.
    // The answer key section starts at the LAST occurrence of a heading like
    // "ANSWER KEY" or at the first line that is ONLY number-answer pairs.
    const lines = rawText.split('\n');

    let answerKeyStartIdx = -1;

    // Look for explicit heading
    for (let i = 0; i < lines.length; i++) {
      if (answerKeyHeadingRe.test(lines[i].trim())) {
        answerKeyStartIdx = i;
        break;
      }
    }

    // If no explicit heading, find where questions end and answer pairs begin.
    // A line containing ONLY number-answer pairs (no A-D option text) is the key.
    if (answerKeyStartIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].trim();
        if (!stripped) continue;
        // Line has several "N. X" pairs and no long words (not an option line)
        const pairsOnLine = [...stripped.matchAll(/(\d+)[.)\s]+([A-D])(?=\s|$)/gi)];
        const longWords   = stripped.split(/\s+/).filter(w => w.length > 2 && !/^\d+$/.test(w) && !/^[A-D][.)]?$/.test(w));
        if (pairsOnLine.length >= 3 && longWords.length === 0) {
          answerKeyStartIdx = i;
          break;
        }
      }
    }

    if (answerKeyStartIdx === -1) {
      errors.push('Format B detected but no answer key section found. Add an "ANSWER KEY" heading followed by numbered answers.');
      return { results, errors };
    }

    // Step 2: Parse the answer key into a map { questionNumber: letter }
    const answerKeyText = lines.slice(answerKeyStartIdx).join(' ');
    const answerMap = {};
    for (const m of answerKeyText.matchAll(/(\d+)[.)\s]+([A-D])(?=\s|$)/gi)) {
      answerMap[parseInt(m[1], 10)] = m[2].toUpperCase();
    }

    if (Object.keys(answerMap).length === 0) {
      errors.push('Answer key section found but no valid answers parsed (expected format: "1. B  2. C  3. A").');
      return { results, errors };
    }

    // Step 3: Parse numbered questions from the questions section
    const questionsText = lines.slice(0, answerKeyStartIdx).join('\n');

    // Split on question boundaries: a line starting with a number + period
    const questionBlocks = questionsText.split(/(?=^\d+\.\s)/m).map(b => b.trim()).filter(Boolean);

    questionBlocks.forEach(block => {
      const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (blockLines.length < 2) return;

      // First line: "N. Question text"
      const qNumMatch = /^(\d+)\.\s+(.+)$/.exec(blockLines[0]);
      if (!qNumMatch) return;
      const qNum = parseInt(qNumMatch[1], 10);
      let questionText = qNumMatch[2].trim();

      // Remaining lines may continue the question text or be options
      let cursor = 1;
      let diagramUrl = '';

      // Check for diagram URL immediately after question number line
      if (cursor < blockLines.length && /^https?:\/\//i.test(blockLines[cursor])) {
        diagramUrl = blockLines[cursor]; cursor++;
      }

      // Collect multi-line question text (lines before the first A. option)
      while (cursor < blockLines.length && !/^[A-D][.)]/i.test(blockLines[cursor])) {
        questionText += ' ' + blockLines[cursor];
        cursor++;
      }
      questionText = questionText.trim();

      // Parse options A-D
      const options = {};
      while (cursor < blockLines.length && /^[A-D][.)]/i.test(blockLines[cursor])) {
        const letter = blockLines[cursor][0].toUpperCase();
        options[letter] = blockLines[cursor].replace(/^[A-D][.)][\s]*/i, '').trim();
        cursor++;
      }

      if (Object.keys(options).length < 4) {
        errors.push(`Q${qNum}: Need options A–D (found ${Object.keys(options).length})`);
        return;
      }

      const correctAnswer = answerMap[qNum];
      if (!correctAnswer) {
        errors.push(`Q${qNum}: No answer found in answer key for question ${qNum}`);
        return;
      }

      // Collect explanation if present
      let explanation = '';
      while (cursor < blockLines.length) {
        const l = blockLines[cursor];
        if (/^explanation:/i.test(l)) { explanation = l.replace(/^explanation:\s*/i, '').trim(); }
        cursor++;
      }

      results.push({
        questionText,
        options,
        correctAnswer,
        explanation,
        diagramUrl,
        questionType: diagramUrl ? 'diagram' : 'text',
      });
    });

    if (results.length === 0 && errors.length === 0) {
      errors.push('Format B: No questions could be parsed. Check that questions start with a number and period (e.g. "1. Question text").');
    }

  } else {
    // ── FORMAT A PARSER (original — blank-line-separated blocks with inline answers) ─
    const blocks = rawText.trim().split(/\n\s*\n/).filter(b => b.trim());

    blocks.forEach((block, idx) => {
      const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 5) { errors.push(`Block ${idx + 1}: Too few lines`); return; }

      let cursor = 0;
      let diagramUrl = '';

      if (/^https?:\/\//i.test(lines[0])) { diagramUrl = lines[0]; cursor = 1; }

      const questionText = lines[cursor]; cursor++;
      const options = {};
      while (cursor < lines.length && /^[A-D][.)]\s*/i.test(lines[cursor])) {
        const letter = lines[cursor][0].toUpperCase();
        options[letter] = lines[cursor].replace(/^[A-D][.)]\s*/i, '').trim();
        cursor++;
      }

      if (Object.keys(options).length < 4) { errors.push(`Block ${idx + 1}: Need options A–D`); return; }

      let correctAnswer = '', explanation = '';
      while (cursor < lines.length) {
        const l = lines[cursor];
        const starMatch   = /^\*([A-D])$/i.exec(l.trim());
        const answerMatch = /^(?:answer|ans|correct(?:\s+answer)?)\s*:\s*([A-D])\b/i.exec(l.trim());
        const parenMatch  = /^\(([A-D])\)$/i.exec(l.trim());
        if      (starMatch)   { correctAnswer = starMatch[1].toUpperCase(); }
        else if (answerMatch) { correctAnswer = answerMatch[1].toUpperCase(); }
        else if (parenMatch)  { correctAnswer = parenMatch[1].toUpperCase(); }
        else if (/^explanation:/i.test(l)) { explanation = l.replace(/^explanation:\s*/i, '').trim(); }
        cursor++;
      }

      if (!correctAnswer) { errors.push(`Block ${idx + 1}: Missing answer — use *B, "Answer: B", or "(B)"`); return; }

      results.push({
        questionText,
        options,
        correctAnswer,
        explanation,
        diagramUrl,
        questionType: diagramUrl ? 'diagram' : 'text',
      });
    });
  }

  return { results, errors };
}

export default function EntranceExamManager() {
  const { toast } = useToast();
  const [tab, setTab] = useState('schools'); // schools | add_single | bulk | bank

  // ── Schools loaded ONCE here, passed to all tabs so they stay in sync ────────
  const [schools,      setSchools]      = useState([]);
  const [schoolsReady, setSchoolsReady] = useState(false);

  const reloadSchools = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'entranceExamSchools'), orderBy('name', 'asc'))
      );
      setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('reloadSchools:', e); }
    finally { setSchoolsReady(true); }
  };

  useEffect(() => { reloadSchools(); }, []);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#0F2A4A,#065F46)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 28,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 50%, rgba(13,148,136,0.25) 0%, transparent 60%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ color: '#fff', fontFamily: "'Playfair Display',serif", margin: '0 0 4px' }}>
            🏫 Entrance Exam Manager
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: 0, fontSize: 14 }}>
            Manage nursing schools, upload questions, and configure the entrance exam hub
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {[
          { id: 'schools',    label: '🏫 Manage Schools'    },
          { id: 'add_single', label: '➕ Add Single Question' },
          { id: 'bulk',       label: '📤 Bulk Upload'        },
          { id: 'bank',       label: '📋 Question Bank'      },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 18px', borderRadius: 10, border: '1.5px solid',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
            transition: 'all .2s',
            borderColor: tab === t.id ? 'var(--teal)' : 'var(--border)',
            background:  tab === t.id ? 'rgba(13,148,136,0.15)' : 'var(--bg-card)',
            color:       tab === t.id ? 'var(--teal)' : 'var(--text-secondary)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'schools'    && <SchoolsTab    toast={toast} onSchoolsChanged={reloadSchools} />}
      {tab === 'add_single' && <AddSingleTab  toast={toast} schools={schools} schoolsReady={schoolsReady} />}
      {tab === 'bulk'       && <BulkUploadTab toast={toast} schools={schools} schoolsReady={schoolsReady} />}
      {tab === 'bank'       && <QuestionBankTab toast={toast} schools={schools} schoolsReady={schoolsReady} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — Manage Schools
// ══════════════════════════════════════════════════════════════════════════════
function SchoolsTab({ toast, onSchoolsChanged }) {
  const [schools,  setSchools]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showModal, setModal]   = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form, setForm] = useState({ name: '', shortName: '', state: '', isActive: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'entranceExamSchools'), orderBy('name','asc')));
      const list = await Promise.all(snap.docs.map(async d => {
        const data = { id: d.id, ...d.data() };
        try {
          const qSnap = await getCountFromServer(query(collection(db, 'entranceExamQuestions'), where('schoolId', '==', d.id)));
          data.questionCount = qSnap.data().count;
        } catch { data.questionCount = data.questionCount || 0; }
        return data;
      }));
      setSchools(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd  = () => { setEditing(null); setForm({ name: '', shortName: '', state: '', isActive: true }); setModal(true); };
  const openEdit = (s) => { setEditing(s); setForm({ name: s.name, shortName: s.shortName || '', state: s.state || '', isActive: s.isActive !== false }); setModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast('School name is required', 'error'); return; }
    setSaving(true);
    try {
      const data = {
        name:      form.name.trim(),
        shortName: form.shortName.trim() || form.name.trim().split(' ').slice(-2).join(' '),
        state:     form.state.trim(),
        isActive:  form.isActive,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'entranceExamSchools', editing.id), data);
        toast('School updated ✅', 'success');
      } else {
        await addDoc(collection(db, 'entranceExamSchools'), { ...data, questionCount: 0, createdAt: serverTimestamp() });
        toast('School added ✅', 'success');
      }
      setModal(false);
      load();
      onSchoolsChanged();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete "${s.name}"? This will NOT delete its questions.`)) return;
    try {
      await deleteDoc(doc(db, 'entranceExamSchools', s.id));
      toast('School deleted', 'success');
      load();
      onSchoolsChanged();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{schools.length} school{schools.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" onClick={openAdd}>➕ Add New School</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />Loading…
        </div>
      ) : schools.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No schools yet. Add one to get started!
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>School Name</th><th>Short Name</th><th>State</th><th>Questions</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {schools.map((s, i) => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ fontSize: 12 }}>{s.shortName || '—'}</td>
                  <td style={{ fontSize: 12 }}>{s.state || '—'}</td>
                  <td><span className="badge badge-teal">{s.questionCount || 0}</span></td>
                  <td>
                    <span className={`badge ${s.isActive !== false ? 'badge-green' : 'badge-grey'}`}>
                      {s.isActive !== false ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s)} style={{ color: '#EF4444' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontFamily: "'Playfair Display',serif", color: 'var(--text-primary)' }}>
                {editing ? '✏️ Edit School' : '➕ Add New School'}
              </h3>
              <button onClick={() => setModal(false)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'School Full Name *', key: 'name',      placeholder: 'e.g. Lagos University Teaching Hospital School of Nursing' },
                { label: 'Short Name',         key: 'shortName', placeholder: 'e.g. LASUTH SoN' },
                { label: 'State',              key: 'state',     placeholder: 'e.g. Lagos' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{f.label}</label>
                  <input
                    className="form-input"
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Status</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[{ v: true, l: '✅ Active' }, { v: false, l: '🙈 Hidden' }].map(o => (
                    <button key={String(o.v)} onClick={() => setForm(p => ({ ...p, isActive: o.v }))} style={{
                      padding: '8px 16px', borderRadius: 8, border: '2px solid', cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 700, fontSize: 13, transition: 'all .2s',
                      borderColor: form.isActive === o.v ? 'var(--teal)' : 'var(--border)',
                      background:  form.isActive === o.v ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                      color:       form.isActive === o.v ? 'var(--teal)' : 'var(--text-secondary)',
                    }}>{o.l}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                {saving ? '💾 Saving…' : '💾 Save School'}
              </button>
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — Add Single Question
// ══════════════════════════════════════════════════════════════════════════════
function AddSingleTab({ toast, schools, schoolsReady }) {
  const [schoolId, setSchoolId] = useState('');
  const [year,     setYear]     = useState('2024');
  const [subject,  setSubject]  = useState('Biology');
  const [rawText,  setRawText]  = useState('');
  const [parsed,   setParsed]   = useState(null);
  const [parseErr, setParseErr] = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleParse = () => {
    setParseErr('');
    const { results, errors } = parseEntranceQuestions(rawText);
    if (errors.length) { setParseErr(errors.join('\n')); setParsed(null); return; }
    if (results.length === 0) { setParseErr('No question detected. Check your formatting.'); return; }
    setParsed(results[0]);
  };

  const handleSave = async () => {
    if (!parsed) return;
    if (!schoolId) { toast('Please select a school', 'error'); return; }
    setSaving(true);
    try {
      const school = schools.find(s => s.id === schoolId);
      await addDoc(collection(db, 'entranceExamQuestions'), {
        schoolId, schoolName: school?.name || '',
        year, subject,
        questionType: parsed.questionType,
        diagramUrl:   parsed.diagramUrl || '',
        questionText: parsed.questionText,
        options:      parsed.options,
        correctAnswer: parsed.correctAnswer,
        explanation:  parsed.explanation || '',
        active: true,
        createdAt: serverTimestamp(),
      });
      // Update school question count
      try {
        const qSnap = await getCountFromServer(query(collection(db, 'entranceExamQuestions'), where('schoolId', '==', schoolId)));
        await updateDoc(doc(db, 'entranceExamSchools', schoolId), { questionCount: qSnap.data().count });
      } catch {}
      toast('Question saved ✅', 'success');
      setRawText(''); setParsed(null);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Meta */}
      <div className="card" style={{ padding: '18px 16px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 14 }}>📋 Question Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>🏫 School *</label>
            <select className="form-input form-select" value={schoolId} onChange={e => setSchoolId(e.target.value)} style={{ width: '100%' }}>
              <option value="">{schoolsReady ? (schools.length === 0 ? "No schools yet — add one first" : "Select school…") : "Loading schools…"}</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>📅 Year</label>
            <select className="form-input form-select" value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%' }}>
              {ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>📚 Subject</label>
            <select className="form-input form-select" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }}>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Format guide */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16, background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#60A5FA', marginBottom: 8 }}>📋 Format Guide</div>
        <pre style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{`TEXT QUESTION:
The functional unit of the kidney is ___
A. Nephron
B. Neuron
C. Nodule
D. Nucleus
*A
Explanation: The nephron filters blood...

DIAGRAM QUESTION (URL on first line):
https://i.imgur.com/abc123.png
In the kidney diagram, the part labeled A is ___
A. Bowman capsule
B. Nephron
C. Pyramid
D. Calyx
*C
Explanation: The pyramid is in renal medulla...`}</pre>
      </div>

      {/* Text area */}
      <div className="card" style={{ padding: '18px 16px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>📝 Paste Question</div>
        <textarea
          className="form-input"
          rows={12}
          placeholder="Paste your question here using the format above…"
          value={rawText}
          onChange={e => { setRawText(e.target.value); setParsed(null); setParseErr(''); }}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
        />
        <button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview</button>
      </div>

      {/* Parse error */}
      {parseErr && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>❌ Parse Error</div>
          <pre style={{ margin: 0, fontSize: 12, color: '#EF4444', whiteSpace: 'pre-wrap' }}>{parseErr}</pre>
        </div>
      )}

      {/* Preview */}
      {parsed && (
        <div className="card" style={{ padding: '18px 16px', border: '1.5px solid rgba(13,148,136,0.4)' }}>
          <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 12 }}>✅ Parsed Successfully — {parsed.questionType === 'diagram' ? '🖼️ Diagram Question' : '📝 Text Question'}</div>

          {parsed.diagramUrl && (
            <div style={{ marginBottom: 12 }}>
              <img src={parsed.diagramUrl} alt="Diagram preview" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
                onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
              <div style={{ display: 'none', color: '#EF4444', fontSize: 12 }}>⚠️ Image failed to load — check URL</div>
            </div>
          )}

          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>{parsed.questionText}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {Object.entries(parsed.options).map(([letter, text]) => (
              <div key={letter} style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: parsed.correctAnswer === letter ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)',
                border: `1.5px solid ${parsed.correctAnswer === letter ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`,
                color: parsed.correctAnswer === letter ? 'var(--green)' : 'var(--text-secondary)',
                fontWeight: parsed.correctAnswer === letter ? 700 : 400,
              }}>
                {letter}. {text} {parsed.correctAnswer === letter && '✅ Correct'}
              </div>
            ))}
          </div>
          {parsed.explanation && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
              💡 <strong>Explanation:</strong> {parsed.explanation}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '💾 Saving…' : '💾 Save Question'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setParsed(null); setRawText(''); }}>🗑️ Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — Bulk Upload
// ══════════════════════════════════════════════════════════════════════════════
function BulkUploadTab({ toast, schools, schoolsReady }) {
  const [schoolId,   setSchoolId]   = useState('');
  const [year,       setYear]       = useState('2024');
  const [subject,    setSubject]    = useState('Biology');
  const [rawText,    setRawText]    = useState('');
  const [parsed,     setParsed]     = useState([]);
  const [errors,     setErrors]     = useState([]);
  const [importing,  setImporting]  = useState(false);
  const [imported,   setImported]   = useState(null);

  const handleParse = () => {
    const { results, errors: errs } = parseEntranceQuestions(rawText);
    setParsed(results);
    setErrors(errs);
    setImported(null);
  };

  const handleImport = async () => {
    if (!schoolId) { toast('Please select a school', 'error'); return; }
    if (parsed.length === 0) { toast('Nothing to import', 'error'); return; }
    setImporting(true);
    try {
      const school = schools.find(s => s.id === schoolId);
      const batch = writeBatch(db);
      parsed.forEach(q => {
        const ref = doc(collection(db, 'entranceExamQuestions'));
        batch.set(ref, {
          schoolId, schoolName: school?.name || '',
          year, subject,
          questionType: q.questionType,
          diagramUrl:   q.diagramUrl || '',
          questionText: q.questionText,
          options:      q.options,
          correctAnswer: q.correctAnswer,
          explanation:  q.explanation || '',
          active: true,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();

      // Update school question count
      try {
        const qSnap = await getCountFromServer(query(collection(db, 'entranceExamQuestions'), where('schoolId', '==', schoolId)));
        await updateDoc(doc(db, 'entranceExamSchools', schoolId), { questionCount: qSnap.data().count });
      } catch {}

      setImported({ count: parsed.length, diagrams: parsed.filter(q => q.questionType === 'diagram').length });
      setParsed([]); setRawText('');
      toast(`Imported ${parsed.length} questions ✅`, 'success');
    } catch (e) { toast('Import failed: ' + e.message, 'error'); }
    finally { setImporting(false); }
  };

  const diagrams = parsed.filter(q => q.questionType === 'diagram').length;
  const texts    = parsed.filter(q => q.questionType === 'text').length;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Meta */}
      <div className="card" style={{ padding: '18px 16px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 14 }}>📋 Batch Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>🏫 School *</label>
            <select className="form-input form-select" value={schoolId} onChange={e => setSchoolId(e.target.value)} style={{ width: '100%' }}>
              <option value="">{schoolsReady ? (schools.length === 0 ? "No schools yet — add one first" : "Select school…") : "Loading schools…"}</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>📅 Year (default)</label>
            <select className="form-input form-select" value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%' }}>
              {ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>📚 Subject (default)</label>
            <select className="form-input form-select" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }}>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Format guide */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16, background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#60A5FA', marginBottom: 6 }}>📋 Format — separate each question with a blank line</div>
        <pre style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{`The functional unit of the kidney is ___
A. Nephron
B. Neuron
C. Nodule
D. Nucleus
*A
Explanation: Optional explanation...

https://i.imgur.com/abc123.png
In the diagram, part A is ___
A. Bowman capsule
B. Nephron
C. Pyramid
D. Calyx
*C`}</pre>
      </div>

      {/* Text area */}
      <div className="card" style={{ padding: '18px 16px', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>
          📝 Paste All Questions
        </div>
        <textarea
          className="form-input"
          rows={16}
          placeholder="Paste all your questions here, separated by blank lines…"
          value={rawText}
          onChange={e => { setRawText(e.target.value); setParsed([]); setErrors([]); setImported(null); }}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
        />
        <button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview All</button>
      </div>

      {/* Parse errors */}
      {errors.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>⚠️ {errors.length} parse error{errors.length !== 1 ? 's' : ''}</div>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#EF4444' }}>{e}</div>)}
        </div>
      )}

      {/* Preview table */}
      {parsed.length > 0 && (
        <div className="card" style={{ padding: '18px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>✅ Parsed: {parsed.length} questions</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                📝 {texts} text · 🖼️ {diagrams} diagram
                {errors.length > 0 && ` · ❌ ${errors.length} error${errors.length !== 1 ? 's' : ''}`}
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? '⬆️ Importing…' : `✅ Import All (${parsed.length})`}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Question Preview</th><th>Ans</th><th>Type</th></tr></thead>
              <tbody>
                {parsed.slice(0, 20).map((q, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ fontSize: 12 }}>{q.questionText.slice(0, 60)}{q.questionText.length > 60 ? '…' : ''}</td>
                    <td><span className="badge badge-teal">{q.correctAnswer}</span></td>
                    <td><span className="badge badge-grey">{q.questionType === 'diagram' ? '🖼️' : '📝'}</span></td>
                  </tr>
                ))}
                {parsed.length > 20 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>… and {parsed.length - 20} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import success */}
      {imported && (
        <div style={{ background: 'rgba(22,163,74,0.08)', border: '1.5px solid rgba(22,163,74,0.3)', borderRadius: 14, padding: '20px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)', marginBottom: 4 }}>Import Complete!</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Imported {imported.count} questions · {imported.diagrams} with diagrams · {imported.count - imported.diagrams} text only
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — Question Bank
// ══════════════════════════════════════════════════════════════════════════════
function QuestionBankTab({ toast, schools, schoolsReady }) {
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filterSchool, setFilterSchool] = useState('');
  const [filterYear,   setFilterYear]   = useState('');
  const [filterType,   setFilterType]   = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const constraints = [];
      if (filterSchool) constraints.push(where('schoolId', '==', filterSchool));
      if (filterYear)   constraints.push(where('year',     '==', filterYear));
      if (filterType)   constraints.push(where('questionType', '==', filterType));
      constraints.push(orderBy('createdAt', 'desc'));
      const snap = await getDocs(query(collection(db, 'entranceExamQuestions'), ...constraints));
      let qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (search) qs = qs.filter(q => q.questionText?.toLowerCase().includes(search.toLowerCase()));
      setQuestions(qs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterSchool, filterYear, filterType]);

  const handleDelete = async (q) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await deleteDoc(doc(db, 'entranceExamQuestions', q.id));
      toast('Deleted ✅', 'success');
      load();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  const filtered = search ? questions.filter(q => q.questionText?.toLowerCase().includes(search.toLowerCase())) : questions;

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="form-input form-select" value={filterSchool} onChange={e => setFilterSchool(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">All Schools</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}
        </select>
        <select className="form-input form-select" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ maxWidth: 120 }}>
          <option value="">All Years</option>
          {ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="form-input form-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ maxWidth: 140 }}>
          <option value="">All Types</option>
          <option value="text">📝 Text</option>
          <option value="diagram">🖼️ Diagram</option>
        </select>
        <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
          <input className="form-input" placeholder="🔍 Search questions…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
        </div>
        <button className="btn btn-ghost" onClick={load}>🔄 Refresh</button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {filtered.length} question{filtered.length !== 1 ? 's' : ''} found
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />Loading…
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Question</th><th>School</th><th>Year</th><th>Subject</th><th>Type</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.slice(0, 50).map((q, i) => (
                <tr key={q.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ fontSize: 12, maxWidth: 280 }}>{q.questionText?.slice(0, 60)}…</td>
                  <td style={{ fontSize: 11 }}>{q.schoolName?.split(' ').slice(-2).join(' ') || '—'}</td>
                  <td style={{ fontSize: 12 }}>{q.year || '—'}</td>
                  <td style={{ fontSize: 11 }}>{q.subject || '—'}</td>
                  <td><span className="badge badge-grey">{q.questionType === 'diagram' ? '🖼️' : '📝'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(q)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(q)} style={{ color: '#EF4444' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length > 50 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>
                  Showing first 50 of {filtered.length} — use filters to narrow down
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <EditQuestionModal
          question={editing}
          schools={schools}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast('Updated ✅', 'success'); }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Edit question modal ────────────────────────────────────────────────────────
function EditQuestionModal({ question, schools, onClose, onSaved, toast }) {
  const [form, setForm] = useState({
    schoolId:     question.schoolId || '',
    year:         question.year     || '2024',
    subject:      question.subject  || 'Biology',
    questionText: question.questionText || '',
    options:      question.options  || { A: '', B: '', C: '', D: '' },
    correctAnswer: question.correctAnswer || 'A',
    explanation:  question.explanation || '',
    diagramUrl:   question.diagramUrl   || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const school = schools.find(s => s.id === form.schoolId);
      await updateDoc(doc(db, 'entranceExamQuestions', question.id), {
        schoolId:     form.schoolId,
        schoolName:   school?.name || question.schoolName,
        year:         form.year,
        subject:      form.subject,
        questionText: form.questionText,
        options:      form.options,
        correctAnswer: form.correctAnswer,
        explanation:  form.explanation,
        diagramUrl:   form.diagramUrl,
        questionType: form.diagramUrl ? 'diagram' : 'text',
        updatedAt:    serverTimestamp(),
      });
      onSaved();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontFamily: "'Playfair Display',serif", color: 'var(--text-primary)' }}>✏️ Edit Question</h3>
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* School / Year / Subject */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: '🏫 School', key: 'schoolId', type: 'select', options: schools.map(s => ({ value: s.id, label: s.shortName || s.name })) },
              { label: '📅 Year',   key: 'year',     type: 'select', options: ENTRANCE_YEARS.map(y => ({ value: y, label: y })) },
              { label: '📚 Subject',key: 'subject',  type: 'select', options: SUBJECTS.map(s => ({ value: s, label: s })) },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <select className="form-input form-select" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: '100%' }}>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          {/* Diagram URL */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>🖼️ Diagram URL (optional)</label>
            <input className="form-input" value={form.diagramUrl} onChange={e => setForm(p => ({ ...p, diagramUrl: e.target.value }))} placeholder="https://…" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          {/* Question text */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>📝 Question Text</label>
            <textarea className="form-input" rows={3} value={form.questionText} onChange={e => setForm(p => ({ ...p, questionText: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          {/* Options */}
          {['A','B','C','D'].map(letter => (
            <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                background: form.correctAnswer === letter ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)',
                border: `2px solid ${form.correctAnswer === letter ? 'var(--green)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 12, color: form.correctAnswer === letter ? 'var(--green)' : 'var(--text-muted)',
                cursor: 'pointer', flexShrink: 0,
              }} onClick={() => setForm(p => ({ ...p, correctAnswer: letter }))}>
                {letter}
              </div>
              <input className="form-input" value={form.options[letter] || ''} onChange={e => setForm(p => ({ ...p, options: { ...p.options, [letter]: e.target.value } }))} style={{ flex: 1 }} />
              {form.correctAnswer === letter && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✅ Correct</span>}
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>👆 Click the letter button to set correct answer</p>
          {/* Explanation */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>💡 Explanation (optional)</label>
            <textarea className="form-input" rows={2} value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
            {saving ? '💾 Saving…' : '💾 Save Changes'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
