// src/components/admin/EntranceExamManager.jsx
// Route: /admin/entrance-exam
// Tabs: Manage Schools | Add Single | Bulk Upload | Question Bank | Daily Mock

import { useState, useEffect, useCallback } from 'react';
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc,
  query, where, orderBy, serverTimestamp, writeBatch, getCountFromServer,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';

const ENTRANCE_YEARS = ['2018','2019','2020','2021','2022','2023','2024','2025'];
const SUBJECTS = [
  'English Language','Biology','Chemistry','Physics',
  'Mathematics','General Studies','Nursing Aptitude','Current Affairs',
];

// ── Utility: get today's date string YYYY-MM-DD ───────────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ── Seeded shuffle (deterministic per day) ───────────────────────────────────
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dateSeed(dateStr) {
  return dateStr.split('-').reduce((acc, v) => acc * 100 + Number(v), 0);
}

// ── Parse a block of text into entrance exam questions ────────────────────────
function parseEntranceQuestions(text) {
  const blocks = text.trim().split(/\n\s*\n/).filter(b => b.trim());
  const results = [], errors = [];

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
      if      (starMatch)   correctAnswer = starMatch[1].toUpperCase();
      else if (answerMatch) correctAnswer = answerMatch[1].toUpperCase();
      else if (parenMatch)  correctAnswer = parenMatch[1].toUpperCase();
      else if (/^explanation:/i.test(l)) explanation = l.replace(/^explanation:\s*/i, '').trim();
      cursor++;
    }

    if (!correctAnswer) { errors.push(`Block ${idx + 1}: Missing answer — use *B, "Answer: B", or "(B)"`); return; }
    results.push({ questionText, options, correctAnswer, explanation, diagramUrl, questionType: diagramUrl ? 'diagram' : 'text' });
  });

  return { results, errors };
}

// ── Shared field row style ────────────────────────────────────────────────────
const S = {
  label: { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 },
  card: { background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '18px 20px' },
};

// ═════════════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════════════
export default function EntranceExamManager() {
  const { toast } = useToast();
  const [tab, setTab] = useState('schools');
  const [schools, setSchools] = useState([]);
  const [schoolsReady, setSchoolsReady] = useState(false);

  const reloadSchools = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'entranceExamSchools'), orderBy('name', 'asc')));
      setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('reloadSchools:', e); }
    finally { setSchoolsReady(true); }
  };

  useEffect(() => { reloadSchools(); }, []);

  const TABS = [
    { id: 'schools',    label: '🏫 Manage Schools'    },
    { id: 'add_single', label: '➕ Add Single Question' },
    { id: 'bulk',       label: '📤 Bulk Upload'        },
    { id: 'bank',       label: '📋 Question Bank'      },
    { id: 'daily_mock', label: '📅 Daily Mock'         },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
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
            Manage schools · upload questions · configure smart daily mock rotation
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {TABS.map(t => (
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
      {tab === 'daily_mock' && <DailyMockTab  toast={toast} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1 — Manage Schools
// ═════════════════════════════════════════════════════════════════════════════
function SchoolsTab({ toast, onSchoolsChanged }) {
  const [schools, setSchools]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setModal]     = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState({ name: '', shortName: '', state: '', isActive: true });
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'entranceExamSchools'), orderBy('name', 'asc')));
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
  const openEdit = s  => { setEditing(s); setForm({ name: s.name, shortName: s.shortName||'', state: s.state||'', isActive: s.isActive !== false }); setModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast('School name is required', 'error'); return; }
    setSaving(true);
    try {
      const data = { name: form.name.trim(), shortName: form.shortName.trim()||form.name.trim().split(' ').slice(-2).join(' '), state: form.state.trim(), isActive: form.isActive, updatedAt: serverTimestamp() };
      if (editing) { await updateDoc(doc(db, 'entranceExamSchools', editing.id), data); toast('School updated ✅', 'success'); }
      else { await addDoc(collection(db, 'entranceExamSchools'), { ...data, questionCount: 0, createdAt: serverTimestamp() }); toast('School added ✅', 'success'); }
      setModal(false); load(); onSchoolsChanged();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async s => {
    if (!window.confirm(`Delete "${s.name}"? This will NOT delete its questions.`)) return;
    try { await deleteDoc(doc(db, 'entranceExamSchools', s.id)); toast('Deleted', 'success'); load(); onSchoolsChanged(); }
    catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{schools.length} school{schools.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" onClick={openAdd}>➕ Add New School</button>
      </div>
      {loading ? <Spinner /> : schools.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No schools yet. Add one to get started!</div>
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
                  <td><span className={`badge ${s.isActive !== false ? 'badge-green' : 'badge-grey'}`}>{s.isActive !== false ? 'Active' : 'Hidden'}</span></td>
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

      {showModal && (
        <Modal title={editing ? '✏️ Edit School' : '➕ Add New School'} onClose={() => setModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'School Full Name *', key: 'name',      placeholder: 'e.g. Lagos University Teaching Hospital School of Nursing' },
              { label: 'Short Name',         key: 'shortName', placeholder: 'e.g. LASUTH SoN' },
              { label: 'State',              key: 'state',     placeholder: 'e.g. Lagos' },
            ].map(f => (
              <div key={f.key}>
                <label style={S.label}>{f.label}</label>
                <input className="form-input" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={S.label}>Status</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ v: true, l: '✅ Active' }, { v: false, l: '🙈 Hidden' }].map(o => (
                  <button key={String(o.v)} onClick={() => setForm(p => ({ ...p, isActive: o.v }))} style={{ padding: '8px 16px', borderRadius: 8, border: '2px solid', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, transition: 'all .2s', borderColor: form.isActive === o.v ? 'var(--teal)' : 'var(--border)', background: form.isActive === o.v ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)', color: form.isActive === o.v ? 'var(--teal)' : 'var(--text-secondary)' }}>{o.l}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>{saving ? '💾 Saving…' : '💾 Save School'}</button>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2 — Add Single Question
// ═════════════════════════════════════════════════════════════════════════════
function AddSingleTab({ toast, schools, schoolsReady }) {
  const [schoolId, setSchoolId] = useState('');
  const [year,     setYear]     = useState('2024');
  const [subject,  setSubject]  = useState('Biology');
  const [addToDailyBank, setAddToDailyBank] = useState(false);
  // mode: 'paste' or 'form'
  const [mode, setMode]         = useState('form');
  // form fields
  const [form, setForm] = useState({ questionText: '', options: { A:'', B:'', C:'', D:'' }, correctAnswer: 'A', explanation: '', diagramUrl: '' });
  // paste mode
  const [rawText,  setRawText]  = useState('');
  const [parsed,   setParsed]   = useState(null);
  const [parseErr, setParseErr] = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleParse = () => {
    setParseErr('');
    const { results, errors } = parseEntranceQuestions(rawText);
    if (errors.length) { setParseErr(errors.join('\n')); setParsed(null); return; }
    if (!results.length) { setParseErr('No question detected.'); return; }
    setParsed(results[0]);
  };

  const saveQuestion = async (qData) => {
    if (!schoolId && !addToDailyBank) { toast('Select a school or add to Daily Mock Bank', 'error'); return; }
    setSaving(true);
    try {
      const school = schools.find(s => s.id === schoolId);
      const payload = {
        schoolId: schoolId || null,
        schoolName: school?.name || '',
        year, subject,
        questionType: qData.diagramUrl ? 'diagram' : 'text',
        diagramUrl:   qData.diagramUrl || '',
        questionText: qData.questionText,
        options:      qData.options,
        correctAnswer: qData.correctAnswer,
        explanation:  qData.explanation || '',
        active: true,
        inDailyBank: addToDailyBank,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'entranceExamQuestions'), payload);
      if (schoolId) {
        try {
          const c = await getCountFromServer(query(collection(db, 'entranceExamQuestions'), where('schoolId', '==', schoolId)));
          await updateDoc(doc(db, 'entranceExamSchools', schoolId), { questionCount: c.data().count });
        } catch {}
      }
      toast('Question saved ✅' + (addToDailyBank ? ' — added to Daily Mock Bank' : ''), 'success');
      setRawText(''); setParsed(null); setParseErr('');
      setForm({ questionText: '', options: { A:'', B:'', C:'', D:'' }, correctAnswer: 'A', explanation: '', diagramUrl: '' });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Meta row */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 14 }}>📋 Question Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>🏫 School</label>
            <select className="form-input form-select" value={schoolId} onChange={e => setSchoolId(e.target.value)} style={{ width: '100%' }}>
              <option value="">{schoolsReady ? (schools.length === 0 ? 'No schools yet' : 'Select school…') : 'Loading…'}</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>📅 Year</label>
            <select className="form-input form-select" value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%' }}>
              {ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>📚 Subject</label>
            <select className="form-input form-select" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }}>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {/* Daily bank toggle */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setAddToDailyBank(v => !v)}
            style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
              background: addToDailyBank ? 'var(--teal)' : 'var(--bg-tertiary)', transition: 'background .2s',
            }}
          >
            <span style={{ position: 'absolute', top: 3, left: addToDailyBank ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', display: 'block' }} />
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            📅 Add to <strong style={{ color: 'var(--teal)' }}>Daily Mock Bank</strong> (question will be eligible for daily rotation)
          </span>
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ id: 'form', label: '🖊️ Form Entry' }, { id: 'paste', label: '📋 Paste & Parse' }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, transition: 'all .2s', borderColor: mode === m.id ? 'var(--teal)' : 'var(--border)', background: mode === m.id ? 'rgba(13,148,136,0.12)' : 'var(--bg-card)', color: mode === m.id ? 'var(--teal)' : 'var(--text-muted)' }}>{m.label}</button>
        ))}
      </div>

      {mode === 'form' && (
        <div style={{ ...S.card }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={S.label}>🖼️ Diagram URL (optional)</label>
              <input className="form-input" value={form.diagramUrl} onChange={e => setForm(p => ({ ...p, diagramUrl: e.target.value }))} placeholder="https://…" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={S.label}>📝 Question Text *</label>
              <textarea className="form-input" rows={3} value={form.questionText} onChange={e => setForm(p => ({ ...p, questionText: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} placeholder="Type the question here…" />
            </div>
            {['A','B','C','D'].map(letter => (
              <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div
                  onClick={() => setForm(p => ({ ...p, correctAnswer: letter }))}
                  style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: form.correctAnswer === letter ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)', border: `2px solid ${form.correctAnswer === letter ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: form.correctAnswer === letter ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer' }}
                >{letter}</div>
                <input className="form-input" value={form.options[letter]||''} onChange={e => setForm(p => ({ ...p, options: { ...p.options, [letter]: e.target.value } }))} style={{ flex: 1 }} placeholder={`Option ${letter}`} />
                {form.correctAnswer === letter && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✅</span>}
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>👆 Click a letter to mark as correct answer</p>
            <div>
              <label style={S.label}>💡 Explanation (optional)</label>
              <textarea className="form-input" rows={2} value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <button className="btn btn-primary" onClick={() => saveQuestion(form)} disabled={saving || !form.questionText.trim()}>
              {saving ? '💾 Saving…' : '💾 Save Question'}
            </button>
          </div>
        </div>
      )}

      {mode === 'paste' && (
        <>
          <FormatGuide />
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>📝 Paste Question</div>
            <textarea className="form-input" rows={12} placeholder="Paste your question here…" value={rawText} onChange={e => { setRawText(e.target.value); setParsed(null); setParseErr(''); }} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }} />
            <button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview</button>
          </div>
          {parseErr && <ParseError msg={parseErr} />}
          {parsed && (
            <QuestionPreview q={parsed}>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" onClick={() => saveQuestion(parsed)} disabled={saving}>{saving ? '💾 Saving…' : '💾 Save Question'}</button>
                <button className="btn btn-ghost" onClick={() => { setParsed(null); setRawText(''); }}>🗑️ Discard</button>
              </div>
            </QuestionPreview>
          )}
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3 — Bulk Upload
// ═════════════════════════════════════════════════════════════════════════════
function BulkUploadTab({ toast, schools, schoolsReady }) {
  const [schoolId,  setSchoolId]  = useState('');
  const [year,      setYear]      = useState('2024');
  const [subject,   setSubject]   = useState('Biology');
  const [addToDailyBank, setAddToDailyBank] = useState(false);
  const [rawText,   setRawText]   = useState('');
  const [parsed,    setParsed]    = useState([]);
  const [errors,    setErrors]    = useState([]);
  const [importing, setImporting] = useState(false);
  const [imported,  setImported]  = useState(null);

  const handleParse = () => {
    const { results, errors: errs } = parseEntranceQuestions(rawText);
    setParsed(results); setErrors(errs); setImported(null);
  };

  const handleImport = async () => {
    if (!schoolId && !addToDailyBank) { toast('Select a school or enable Daily Mock Bank', 'error'); return; }
    if (!parsed.length) { toast('Nothing to import', 'error'); return; }
    setImporting(true);
    try {
      const school = schools.find(s => s.id === schoolId);
      const batch = writeBatch(db);
      parsed.forEach(q => {
        const ref = doc(collection(db, 'entranceExamQuestions'));
        batch.set(ref, {
          schoolId: schoolId || null, schoolName: school?.name || '',
          year, subject,
          questionType: q.questionType, diagramUrl: q.diagramUrl || '',
          questionText: q.questionText, options: q.options,
          correctAnswer: q.correctAnswer, explanation: q.explanation || '',
          active: true, inDailyBank: addToDailyBank,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      if (schoolId) {
        try {
          const c = await getCountFromServer(query(collection(db, 'entranceExamQuestions'), where('schoolId', '==', schoolId)));
          await updateDoc(doc(db, 'entranceExamSchools', schoolId), { questionCount: c.data().count });
        } catch {}
      }
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
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 14 }}>📋 Batch Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>🏫 School</label>
            <select className="form-input form-select" value={schoolId} onChange={e => setSchoolId(e.target.value)} style={{ width: '100%' }}>
              <option value="">{schoolsReady ? (schools.length === 0 ? 'No schools yet' : 'Select school…') : 'Loading…'}</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>📅 Year (default)</label>
            <select className="form-input form-select" value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%' }}>
              {ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>📚 Subject (default)</label>
            <select className="form-input form-select" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }}>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {/* Daily bank toggle */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setAddToDailyBank(v => !v)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: addToDailyBank ? 'var(--teal)' : 'var(--bg-tertiary)', transition: 'background .2s' }}>
            <span style={{ position: 'absolute', top: 3, left: addToDailyBank ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', display: 'block' }} />
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            📅 Add all to <strong style={{ color: 'var(--teal)' }}>Daily Mock Bank</strong>
          </span>
        </div>
      </div>

      <FormatGuide bulk />

      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>📝 Paste All Questions</div>
        <textarea className="form-input" rows={16} placeholder="Paste all your questions here, separated by blank lines…" value={rawText} onChange={e => { setRawText(e.target.value); setParsed([]); setErrors([]); setImported(null); }} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
        <button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview All</button>
      </div>

      {errors.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>⚠️ {errors.length} parse error{errors.length !== 1 ? 's' : ''}</div>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#EF4444' }}>{e}</div>)}
        </div>
      )}

      {parsed.length > 0 && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>✅ Parsed: {parsed.length} questions</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>📝 {texts} text · 🖼️ {diagrams} diagram</div>
            </div>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>{importing ? '⬆️ Importing…' : `✅ Import All (${parsed.length})`}</button>
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
                {parsed.length > 20 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>… and {parsed.length - 20} more</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {imported && (
        <div style={{ background: 'rgba(22,163,74,0.08)', border: '1.5px solid rgba(22,163,74,0.3)', borderRadius: 14, padding: '20px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)', marginBottom: 4 }}>Import Complete!</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Imported {imported.count} questions · {imported.diagrams} with diagrams · {imported.count - imported.diagrams} text only</div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4 — Question Bank
// ═════════════════════════════════════════════════════════════════════════════
function QuestionBankTab({ toast, schools, schoolsReady }) {
  const [questions, setQuestions]       = useState([]);
  const [loading,   setLoading]         = useState(true);
  const [filterSchool, setFilterSchool] = useState('');
  const [filterYear,   setFilterYear]   = useState('');
  const [filterType,   setFilterType]   = useState('');
  const [filterDaily,  setFilterDaily]  = useState('');
  const [search, setSearch]             = useState('');
  const [editing, setEditing]           = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const constraints = [];
      if (filterSchool) constraints.push(where('schoolId', '==', filterSchool));
      if (filterYear)   constraints.push(where('year', '==', filterYear));
      if (filterType)   constraints.push(where('questionType', '==', filterType));
      if (filterDaily === 'yes') constraints.push(where('inDailyBank', '==', true));
      if (filterDaily === 'no')  constraints.push(where('inDailyBank', '==', false));
      constraints.push(orderBy('createdAt', 'desc'));
      const snap = await getDocs(query(collection(db, 'entranceExamQuestions'), ...constraints));
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterSchool, filterYear, filterType, filterDaily]);

  const handleDelete = async q => {
    if (!window.confirm('Delete this question?')) return;
    try { await deleteDoc(doc(db, 'entranceExamQuestions', q.id)); toast('Deleted ✅', 'success'); load(); }
    catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  const toggleDailyBank = async q => {
    try {
      await updateDoc(doc(db, 'entranceExamQuestions', q.id), { inDailyBank: !q.inDailyBank });
      toast(!q.inDailyBank ? '📅 Added to Daily Bank' : '❌ Removed from Daily Bank', 'success');
      load();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  const filtered = search ? questions.filter(q => q.questionText?.toLowerCase().includes(search.toLowerCase())) : questions;
  const dailyCount = questions.filter(q => q.inDailyBank).length;

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Questions', value: questions.length, icon: '📋', color: 'var(--teal)' },
          { label: 'In Daily Bank',   value: dailyCount,       icon: '📅', color: '#8B5CF6' },
          { label: 'Not in Bank',     value: questions.length - dailyCount, icon: '📁', color: 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, textAlign: 'center', padding: '14px 12px' }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="form-input form-select" value={filterSchool} onChange={e => setFilterSchool(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All Schools</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}
        </select>
        <select className="form-input form-select" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ maxWidth: 110 }}>
          <option value="">All Years</option>
          {ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="form-input form-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ maxWidth: 130 }}>
          <option value="">All Types</option>
          <option value="text">📝 Text</option>
          <option value="diagram">🖼️ Diagram</option>
        </select>
        <select className="form-input form-select" value={filterDaily} onChange={e => setFilterDaily(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All (Daily + Non)</option>
          <option value="yes">📅 Daily Bank Only</option>
          <option value="no">📁 Non-Daily Only</option>
        </select>
        <input className="form-input" placeholder="🔍 Search questions…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button className="btn btn-ghost" onClick={load}>🔄</button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{filtered.length} question{filtered.length !== 1 ? 's' : ''} found</div>

      {loading ? <Spinner /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Question</th><th>School</th><th>Year</th><th>Subject</th><th>Daily Bank</th><th>Type</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.slice(0, 50).map((q, i) => (
                <tr key={q.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ fontSize: 12, maxWidth: 280 }}>{q.questionText?.slice(0, 60)}…</td>
                  <td style={{ fontSize: 11 }}>{q.schoolName?.split(' ').slice(-2).join(' ') || '—'}</td>
                  <td style={{ fontSize: 12 }}>{q.year || '—'}</td>
                  <td style={{ fontSize: 11 }}>{q.subject || '—'}</td>
                  <td>
                    <button
                      onClick={() => toggleDailyBank(q)}
                      title={q.inDailyBank ? 'Remove from Daily Bank' : 'Add to Daily Bank'}
                      style={{ padding: '3px 10px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 11, transition: 'all .15s', borderColor: q.inDailyBank ? '#8B5CF6' : 'var(--border)', background: q.inDailyBank ? 'rgba(139,92,246,0.12)' : 'var(--bg-tertiary)', color: q.inDailyBank ? '#8B5CF6' : 'var(--text-muted)' }}>
                      {q.inDailyBank ? '📅 In Bank' : '➕ Add'}
                    </button>
                  </td>
                  <td><span className="badge badge-grey">{q.questionType === 'diagram' ? '🖼️' : '📝'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(q)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(q)} style={{ color: '#EF4444' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length > 50 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>Showing first 50 of {filtered.length} — use filters to narrow down</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditQuestionModal question={editing} schools={schools}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast('Updated ✅', 'success'); }}
          toast={toast} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5 — Daily Mock (Settings + Question Bank Upload + Rotation Logic)
// ═════════════════════════════════════════════════════════════════════════════
function DailyMockTab({ toast }) {
  const [subTab, setSubTab] = useState('settings');

  const SUB_TABS = [
    { id: 'settings',  label: '⚙️ Settings'        },
    { id: 'upload',    label: '📤 Upload Questions' },
    { id: 'schedule',  label: '🗓️ Schedule & History' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, transition: 'all .2s', borderColor: subTab === t.id ? '#8B5CF6' : 'var(--border)', background: subTab === t.id ? 'rgba(139,92,246,0.12)' : 'var(--bg-card)', color: subTab === t.id ? '#8B5CF6' : 'var(--text-muted)' }}>{t.label}</button>
        ))}
      </div>

      {subTab === 'settings' && <DailyMockSettings toast={toast} />}
      {subTab === 'upload'   && <DailyMockUpload   toast={toast} />}
      {subTab === 'schedule' && <DailyMockSchedule toast={toast} />}
    </div>
  );
}

// ── Daily Mock: Settings ──────────────────────────────────────────────────────
function DailyMockSettings({ toast }) {
  const [config,  setConfig]  = useState({ questionCount: 30, timeLimit: 30, repeatThreshold: 50, passMark: 50 });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats,   setStats]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'entranceExamConfig', 'dailyMock'));
        if (snap.exists()) setConfig(c => ({ ...c, ...snap.data() }));
        const countSnap = await getCountFromServer(query(collection(db, 'entranceExamQuestions'), where('inDailyBank', '==', true)));
        setStats({ totalQuestions: countSnap.data().count });
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await setDoc(doc(db, 'entranceExamConfig', 'dailyMock'), { ...config, updatedAt: new Date().toISOString() });
      setSaved(true); toast('Daily Mock settings saved ✅', 'success');
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { toast('Save failed: ' + e.message, 'error'); }
    setSaving(false);
  };

  if (loading) return <Spinner />;

  const bankSize  = stats?.totalQuestions || 0;
  const maxAllowed = Math.max(bankSize, 5);

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Info banner */}
      <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 24 }}>📅</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 6 }}>How Smart Daily Mock Works</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Every 24 hours, a new question set is selected from the <strong>Daily Mock Bank</strong>. The system tracks which questions each student has seen and <strong>never repeats</strong> them — unless the pass rate was below the threshold you set. Once all questions are exhausted, the cycle resets automatically.
          </div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#8B5CF6' }}>
            📦 {bankSize} questions currently in Daily Mock Bank
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Question Count */}
        <div style={S.card}>
          <label style={{ ...S.label, fontSize: 13 }}>❓ Questions Per Mock</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>How many questions per daily session. Capped at your bank size ({bankSize}).</div>
          <SliderWithPresets value={config.questionCount} min={5} max={Math.min(60, maxAllowed)} step={5} presets={[10,20,30,40,50].filter(n => n <= maxAllowed)} onChange={v => setConfig(c => ({ ...c, questionCount: v }))} displayFn={v => String(v)} color="var(--teal)" />
        </div>

        {/* Time Limit */}
        <div style={S.card}>
          <label style={{ ...S.label, fontSize: 13 }}>⏱ Time Limit</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Set to 0 for untimed. Mock auto-submits when time runs out.</div>
          <SliderWithPresets value={config.timeLimit} min={0} max={120} step={5} presets={[{ v: 0, l: 'Untimed' }, { v: 20, l: '20m' }, { v: 30, l: '30m' }, { v: 45, l: '45m' }, { v: 60, l: '60m' }]} onChange={v => setConfig(c => ({ ...c, timeLimit: v }))} displayFn={v => v === 0 ? '∞' : `${v}m`} color="#F59E0B" />
        </div>

        {/* Pass Mark */}
        <div style={S.card}>
          <label style={{ ...S.label, fontSize: 13 }}>🎯 Pass Mark (%)</label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Score percentage a student must reach to be considered "passed" on a question set.</div>
          <SliderWithPresets value={config.passMark} min={30} max={80} step={5} presets={[40,50,60,70]} onChange={v => setConfig(c => ({ ...c, passMark: v }))} displayFn={v => `${v}%`} color="#10B981" />
        </div>

        {/* Repeat Threshold */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <label style={{ ...S.label, fontSize: 13, marginBottom: 0 }}>🔁 Repeat Threshold (Pass Rate %)</label>
            <span style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Smart Repeat</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            If a question's overall pass rate falls <strong>below this threshold</strong>, it gets re-queued and shown again to students who failed it. Set to 0 to disable repeats entirely.
          </div>
          <SliderWithPresets value={config.repeatThreshold} min={0} max={80} step={5} presets={[{ v: 0, l: 'Off' }, { v: 30, l: '30%' }, { v: 50, l: '50%' }, { v: 60, l: '60%' }]} onChange={v => setConfig(c => ({ ...c, repeatThreshold: v }))} displayFn={v => v === 0 ? 'Off' : `${v}%`} color="#EF4444" />
          {config.repeatThreshold > 0 && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              ⚠️ Questions where fewer than <strong style={{ color: '#EF4444' }}>{config.repeatThreshold}%</strong> of students passed will be re-assigned to those who failed.
            </div>
          )}
        </div>

        {/* Preview */}
        <div style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(13,148,136,0.08))', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Preview — What students will see</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2 }}>
            📅 Daily Mock: <strong style={{ color: 'var(--text-primary)' }}>{Math.min(config.questionCount, bankSize || config.questionCount)} questions</strong>
            {' '}·{' '}
            {config.timeLimit > 0 ? <><strong style={{ color: '#F59E0B' }}>{config.timeLimit} minutes</strong></> : <strong style={{ color: '#10B981' }}>Untimed</strong>}<br />
            ✅ Pass mark: <strong>{config.passMark}%</strong><br />
            🔁 No question repeats unless pass rate {'<'} <strong style={{ color: '#EF4444' }}>{config.repeatThreshold > 0 ? `${config.repeatThreshold}%` : 'disabled'}</strong><br />
            ⚠️ Each student: <strong>one attempt per day</strong>
          </div>
        </div>

        <button onClick={save} disabled={saving} style={{ background: saved ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#8B5CF6,#6D28D9)', border: 'none', color: '#fff', padding: '14px 32px', borderRadius: 12, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700, alignSelf: 'flex-start', opacity: saving ? 0.7 : 1, transition: 'all 0.2s' }}>
          {saving ? '💾 Saving…' : saved ? '✅ Saved!' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ── Daily Mock: Upload Questions to Daily Bank ────────────────────────────────
function DailyMockUpload({ toast }) {
  const [mode, setMode] = useState('form');
  // form fields (no subject/year — daily mock questions are generic)
  const [form, setForm] = useState({ questionText: '', options: { A:'', B:'', C:'', D:'' }, correctAnswer: 'A', explanation: '', diagramUrl: '' });
  // paste mode
  const [rawText,  setRawText]  = useState('');
  const [parsed,   setParsed]   = useState([]);
  const [errors,   setErrors]   = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [imported, setImported] = useState(null);

  const handleParse = () => {
    const { results, errors: errs } = parseEntranceQuestions(rawText);
    setParsed(results); setErrors(errs); setImported(null);
  };

  const saveSingle = async () => {
    if (!form.questionText.trim()) { toast('Question text is required', 'error'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'entranceExamQuestions'), {
        schoolId: null, schoolName: '',
        year: '', subject: '',
        questionType: form.diagramUrl ? 'diagram' : 'text',
        diagramUrl: form.diagramUrl || '',
        questionText: form.questionText,
        options: form.options,
        correctAnswer: form.correctAnswer,
        explanation: form.explanation || '',
        active: true,
        inDailyBank: true,
        createdAt: serverTimestamp(),
      });
      toast('Question added to Daily Mock Bank ✅', 'success');
      setForm({ questionText: '', options: { A:'', B:'', C:'', D:'' }, correctAnswer: 'A', explanation: '', diagramUrl: '' });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveBulk = async () => {
    if (!parsed.length) { toast('Nothing to import', 'error'); return; }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      parsed.forEach(q => {
        const ref = doc(collection(db, 'entranceExamQuestions'));
        batch.set(ref, {
          schoolId: null, schoolName: '',
          year: '', subject: '',
          questionType: q.questionType, diagramUrl: q.diagramUrl || '',
          questionText: q.questionText, options: q.options,
          correctAnswer: q.correctAnswer, explanation: q.explanation || '',
          active: true, inDailyBank: true,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setImported({ count: parsed.length });
      setParsed([]); setRawText('');
      toast(`${parsed.length} questions added to Daily Mock Bank ✅`, 'success');
    } catch (e) { toast('Import failed: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header info */}
      <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 22 }}>📅</span>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Questions added here go <strong style={{ color: '#8B5CF6' }}>directly into the Daily Mock Bank</strong>. The system will select from them automatically every 24 hours. You can add questions at any time — they'll be included in upcoming rotations.
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ id: 'form', label: '🖊️ Single (Form)' }, { id: 'paste_single', label: '📋 Single (Paste)' }, { id: 'paste_bulk', label: '📦 Bulk Paste' }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, transition: 'all .2s', borderColor: mode === m.id ? '#8B5CF6' : 'var(--border)', background: mode === m.id ? 'rgba(139,92,246,0.12)' : 'var(--bg-card)', color: mode === m.id ? '#8B5CF6' : 'var(--text-muted)' }}>{m.label}</button>
        ))}
      </div>


      {/* Form entry */}
      {mode === 'form' && (
        <div style={S.card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={S.label}>🖼️ Diagram URL (optional)</label>
              <input className="form-input" value={form.diagramUrl} onChange={e => setForm(p => ({ ...p, diagramUrl: e.target.value }))} placeholder="https://…" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={S.label}>📝 Question Text *</label>
              <textarea className="form-input" rows={3} value={form.questionText} onChange={e => setForm(p => ({ ...p, questionText: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} placeholder="Type the question here…" />
            </div>
            {['A','B','C','D'].map(letter => (
              <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div onClick={() => setForm(p => ({ ...p, correctAnswer: letter }))} style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: form.correctAnswer === letter ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)', border: `2px solid ${form.correctAnswer === letter ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: form.correctAnswer === letter ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer' }}>{letter}</div>
                <input className="form-input" value={form.options[letter]||''} onChange={e => setForm(p => ({ ...p, options: { ...p.options, [letter]: e.target.value } }))} style={{ flex: 1 }} placeholder={`Option ${letter}`} />
                {form.correctAnswer === letter && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>✅</span>}
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>👆 Click a letter to mark as correct answer</p>
            <div>
              <label style={S.label}>💡 Explanation (optional)</label>
              <textarea className="form-input" rows={2} value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <button className="btn btn-primary" onClick={saveSingle} disabled={saving || !form.questionText.trim()} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>
              {saving ? '💾 Saving…' : '📅 Add to Daily Mock Bank'}
            </button>
          </div>
        </div>
      )}

      {/* Single paste */}
      {mode === 'paste_single' && (
        <SinglePasteUpload
          onSave={async qData => {
            setSaving(true);
            try {
              await addDoc(collection(db, 'entranceExamQuestions'), { schoolId: null, schoolName: '', year: form.year, subject: form.subject, questionType: qData.questionType, diagramUrl: qData.diagramUrl||'', questionText: qData.questionText, options: qData.options, correctAnswer: qData.correctAnswer, explanation: qData.explanation||'', active: true, inDailyBank: true, createdAt: serverTimestamp() });
              toast('Added to Daily Mock Bank ✅', 'success');
            } catch (e) { toast('Error: ' + e.message, 'error'); }
            finally { setSaving(false); }
          }}
          saving={saving}
        />
      )}

      {/* Bulk paste */}
      {mode === 'paste_bulk' && (
        <>
          <FormatGuide bulk />
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>📦 Paste Multiple Questions</div>
            <textarea className="form-input" rows={16} placeholder="Paste all questions here, separated by blank lines…" value={rawText} onChange={e => { setRawText(e.target.value); setParsed([]); setErrors([]); setImported(null); }} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
            <button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview</button>
          </div>
          {errors.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>⚠️ {errors.length} parse error{errors.length !== 1 ? 's' : ''}</div>
              {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#EF4444' }}>{e}</div>)}
            </div>
          )}
          {parsed.length > 0 && (
            <div style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>✅ {parsed.length} questions ready</div>
                <button className="btn btn-primary" onClick={saveBulk} disabled={saving} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>
                  {saving ? '📅 Importing…' : `📅 Add All to Daily Bank (${parsed.length})`}
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Question Preview</th><th>Ans</th><th>Type</th></tr></thead>
                  <tbody>
                    {parsed.slice(0, 15).map((q, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td style={{ fontSize: 12 }}>{q.questionText.slice(0, 70)}{q.questionText.length > 70 ? '…' : ''}</td>
                        <td><span className="badge badge-teal">{q.correctAnswer}</span></td>
                        <td><span className="badge badge-grey">{q.questionType === 'diagram' ? '🖼️' : '📝'}</span></td>
                      </tr>
                    ))}
                    {parsed.length > 15 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>… and {parsed.length - 15} more</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {imported && (
            <div style={{ background: 'rgba(139,92,246,0.08)', border: '1.5px solid rgba(139,92,246,0.3)', borderRadius: 14, padding: '20px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#8B5CF6', marginBottom: 4 }}>Added to Daily Mock Bank!</div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{imported.count} questions are now eligible for daily rotation</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Daily Mock: Schedule & History ────────────────────────────────────────────
function DailyMockSchedule({ toast }) {
  const [config,   setConfig]   = useState(null);
  const [bankIds,  setBankIds]  = useState([]);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [preview,  setPreview]  = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cfgSnap, bankSnap, histSnap] = await Promise.all([
          getDoc(doc(db, 'entranceExamConfig', 'dailyMock')),
          getDocs(query(collection(db, 'entranceExamQuestions'), where('inDailyBank', '==', true), orderBy('createdAt', 'asc'))),
          getDocs(query(collection(db, 'dailyMockSchedule'), orderBy('date', 'desc'))),
        ]);
        const cfg = cfgSnap.exists() ? cfgSnap.data() : { questionCount: 30, timeLimit: 30, repeatThreshold: 50, passMark: 50 };
        setConfig(cfg);
        const ids = bankSnap.docs.map(d => d.id);
        setBankIds(ids);
        setHistory(histSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  // Compute which question IDs have been used (no repeat unless fail rate < threshold)
  const computeUsedIds = useCallback((hist, repeatThreshold) => {
    const usedMap = {};
    hist.forEach(day => {
      if (!day.questionIds) return;
      const passRate = day.passRate ?? 100;
      if (passRate >= (repeatThreshold ?? 50)) {
        // Questions passed well — mark as fully used
        day.questionIds.forEach(id => { usedMap[id] = (usedMap[id] || 0) + 1; });
      }
      // else: pass rate too low → these questions are eligible to recur
    });
    return usedMap;
  }, []);

  const generatePreview = () => {
    if (!config || !bankIds.length) return;
    const today = todayKey();
    const alreadyScheduled = history.find(h => h.date === today);
    if (alreadyScheduled) {
      toast('Today already has a scheduled set!', 'warning');
      setPreview({ date: today, questionIds: alreadyScheduled.questionIds, alreadyExists: true });
      return;
    }

    const usedMap = computeUsedIds(history, config.repeatThreshold ?? 50);
    // Eligible = not used, OR repeat-eligible (those not in usedMap)
    const eligible = bankIds.filter(id => !usedMap[id]);

    let pool = eligible.length >= (config.questionCount || 30) ? eligible : bankIds; // fallback: full reset
    const shuffled = seededShuffle(pool, dateSeed(today));
    const selected = shuffled.slice(0, config.questionCount || 30);

    setPreview({ date: today, questionIds: selected, alreadyExists: false, isReset: eligible.length < (config.questionCount || 30) });
  };

  const publishToday = async () => {
    if (!preview || preview.alreadyExists) return;
    setGenerating(true);
    try {
      await setDoc(doc(db, 'dailyMockSchedule', preview.date), {
        date: preview.date,
        questionIds: preview.questionIds,
        questionCount: preview.questionIds.length,
        publishedAt: serverTimestamp(),
        passRate: null,
        attemptCount: 0,
        isReset: preview.isReset || false,
      });
      toast(`Daily Mock published for ${preview.date} ✅`, 'success');
      setPreview(null);
      // Reload history
      const snap = await getDocs(query(collection(db, 'dailyMockSchedule'), orderBy('date', 'desc')));
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setGenerating(false); }
  };

  if (loading) return <Spinner />;

  const usedCount  = Object.keys(computeUsedIds(history, config?.repeatThreshold ?? 50)).length;
  const freshCount = bankIds.length - usedCount;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { icon: '📦', label: 'Bank Size',       value: bankIds.length,    color: '#8B5CF6' },
          { icon: '✅', label: 'Questions Used',   value: usedCount,         color: 'var(--teal)' },
          { icon: '🆕', label: 'Fresh Questions',  value: freshCount,        color: '#10B981' },
          { icon: '📅', label: 'Days Scheduled',   value: history.length,    color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, textAlign: 'center', padding: '14px 12px' }}>
            <div style={{ fontSize: 20 }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 24, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Generate today's mock */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>📅 Today's Mock — {todayKey()}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          Preview the question set the system will serve today. This respects the no-repeat and smart-repeat rules. Publishing locks in today's set.
          {freshCount < (config?.questionCount || 30) && (
            <span style={{ color: '#F59E0B', fontWeight: 700 }}> ⚠️ Only {freshCount} fresh questions available — system will recycle from full bank.</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={generatePreview}>🔍 Preview Today's Set</button>
          {preview && !preview.alreadyExists && (
            <button className="btn btn-primary" onClick={publishToday} disabled={generating} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>
              {generating ? '📤 Publishing…' : '📤 Publish Today\'s Mock'}
            </button>
          )}
        </div>

        {preview && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: preview.alreadyExists ? 'rgba(245,158,11,0.08)' : 'rgba(139,92,246,0.08)', border: `1px solid ${preview.alreadyExists ? 'rgba(245,158,11,0.25)' : 'rgba(139,92,246,0.25)'}`, borderRadius: 10 }}>
            {preview.alreadyExists ? (
              <div style={{ fontSize: 13, color: '#F59E0B', fontWeight: 700 }}>⚠️ Today's mock is already published with {preview.questionIds.length} questions.</div>
            ) : (
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#8B5CF6', marginBottom: 6 }}>
                  ✅ Preview: {preview.questionIds.length} questions selected
                  {preview.isReset && <span style={{ marginLeft: 8, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>🔄 Cycle Reset</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Question IDs: {preview.questionIds.slice(0, 5).join(', ')}{preview.questionIds.length > 5 ? ` … +${preview.questionIds.length - 5} more` : ''}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* History table */}
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 12 }}>📜 Schedule History</div>
      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No history yet. Publish today's mock to start.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Questions</th><th>Attempts</th><th>Pass Rate</th><th>Status</th></tr></thead>
            <tbody>
              {history.map(h => {
                const passRate = h.passRate != null ? h.passRate : null;
                const threshold = config?.repeatThreshold ?? 50;
                const flagRepeat = passRate !== null && passRate < threshold;
                return (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 700 }}>{h.date}</td>
                    <td><span className="badge badge-teal">{h.questionCount || h.questionIds?.length || '—'}</span></td>
                    <td>{h.attemptCount ?? '—'}</td>
                    <td>
                      {passRate !== null ? (
                        <span style={{ fontWeight: 700, color: flagRepeat ? '#EF4444' : '#10B981' }}>
                          {passRate}% {flagRepeat ? '🔁' : '✅'}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Pending</span>}
                    </td>
                    <td>
                      {h.isReset
                        ? <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>🔄 Reset</span>
                        : <span className="badge badge-green">✅ Active</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EDIT QUESTION MODAL
// ═════════════════════════════════════════════════════════════════════════════
function EditQuestionModal({ question, schools, onClose, onSaved, toast }) {
  const [form, setForm] = useState({
    schoolId: question.schoolId || '', year: question.year || '2024', subject: question.subject || 'Biology',
    questionText: question.questionText || '', options: question.options || { A:'', B:'', C:'', D:'' },
    correctAnswer: question.correctAnswer || 'A', explanation: question.explanation || '',
    diagramUrl: question.diagramUrl || '', inDailyBank: question.inDailyBank || false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const school = schools.find(s => s.id === form.schoolId);
      await updateDoc(doc(db, 'entranceExamQuestions', question.id), {
        schoolId: form.schoolId || null, schoolName: school?.name || question.schoolName,
        year: form.year, subject: form.subject,
        questionText: form.questionText, options: form.options,
        correctAnswer: form.correctAnswer, explanation: form.explanation,
        diagramUrl: form.diagramUrl, questionType: form.diagramUrl ? 'diagram' : 'text',
        inDailyBank: form.inDailyBank, updatedAt: serverTimestamp(),
      });
      onSaved();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="✏️ Edit Question" onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { label: '🏫 School', key: 'schoolId', options: [{ value: '', label: 'None' }, ...schools.map(s => ({ value: s.id, label: s.shortName || s.name }))] },
            { label: '📅 Year',   key: 'year',     options: ENTRANCE_YEARS.map(y => ({ value: y, label: y })) },
            { label: '📚 Subject',key: 'subject',  options: SUBJECTS.map(s => ({ value: s, label: s })) },
          ].map(f => (
            <div key={f.key}>
              <label style={{ ...S.label, fontSize: 11 }}>{f.label}</label>
              <select className="form-input form-select" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: '100%' }}>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div>
          <label style={{ ...S.label, fontSize: 11 }}>🖼️ Diagram URL (optional)</label>
          <input className="form-input" value={form.diagramUrl} onChange={e => setForm(p => ({ ...p, diagramUrl: e.target.value }))} placeholder="https://…" style={{ width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ ...S.label, fontSize: 11 }}>📝 Question Text</label>
          <textarea className="form-input" rows={3} value={form.questionText} onChange={e => setForm(p => ({ ...p, questionText: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>
        {['A','B','C','D'].map(letter => (
          <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div onClick={() => setForm(p => ({ ...p, correctAnswer: letter }))} style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: form.correctAnswer === letter ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)', border: `2px solid ${form.correctAnswer === letter ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: form.correctAnswer === letter ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer' }}>{letter}</div>
            <input className="form-input" value={form.options[letter]||''} onChange={e => setForm(p => ({ ...p, options: { ...p.options, [letter]: e.target.value } }))} style={{ flex: 1 }} />
            {form.correctAnswer === letter && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✅ Correct</span>}
          </div>
        ))}
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>👆 Click the letter to set correct answer</p>
        <div>
          <label style={{ ...S.label, fontSize: 11 }}>💡 Explanation (optional)</label>
          <textarea className="form-input" rows={2} value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>
        {/* Daily bank toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(139,92,246,0.06)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)' }}>
          <button onClick={() => setForm(p => ({ ...p, inDailyBank: !p.inDailyBank }))} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', background: form.inDailyBank ? '#8B5CF6' : 'var(--bg-tertiary)', transition: 'background .2s' }}>
            <span style={{ position: 'absolute', top: 2, left: form.inDailyBank ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', display: 'block' }} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>📅 Include in Daily Mock Bank</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>{saving ? '💾 Saving…' : '💾 Save Changes'}</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: 28, width: '100%', maxWidth: wide ? 600 : 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontFamily: "'Playfair Display',serif", color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
      <div className="spinner" style={{ margin: '0 auto 12px' }} />Loading…
    </div>
  );
}

function FormatGuide({ bulk }) {
  return (
    <div style={{ padding: '14px 16px', marginBottom: 16, background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#60A5FA', marginBottom: 6 }}>
        📋 Format Guide{bulk ? ' — separate questions with a blank line' : ''}
      </div>
      <pre style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{`What is the functional unit of the kidney?
A. Nephron
B. Neuron
C. Nodule
D. Nucleus
*A
Explanation: The nephron filters blood...${bulk ? `\n\nhttps://i.imgur.com/abc123.png\nIn the diagram, part labeled A is ___\nA. Bowman capsule\nB. Nephron\nC. Pyramid\nD. Calyx\n*C` : ''}`}</pre>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        ✅ Answer formats accepted: <code>*A</code> · <code>Answer: A</code> · <code>(A)</code>
      </div>
    </div>
  );
}

function ParseError({ msg }) {
  return (
    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>❌ Parse Error</div>
      <pre style={{ margin: 0, fontSize: 12, color: '#EF4444', whiteSpace: 'pre-wrap' }}>{msg}</pre>
    </div>
  );
}

function QuestionPreview({ q, children }) {
  return (
    <div style={{ ...S.card, border: '1.5px solid rgba(13,148,136,0.4)', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 12 }}>
        ✅ Parsed — {q.questionType === 'diagram' ? '🖼️ Diagram' : '📝 Text'} Question
      </div>
      {q.diagramUrl && (
        <div style={{ marginBottom: 12 }}>
          <img src={q.diagramUrl} alt="Diagram" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} onError={e => { e.target.style.display = 'none'; }} />
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>{q.questionText}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {Object.entries(q.options).map(([letter, text]) => (
          <div key={letter} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: q.correctAnswer === letter ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)', border: `1.5px solid ${q.correctAnswer === letter ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`, color: q.correctAnswer === letter ? 'var(--green)' : 'var(--text-secondary)', fontWeight: q.correctAnswer === letter ? 700 : 400 }}>
            {letter}. {text} {q.correctAnswer === letter && '✅'}
          </div>
        ))}
      </div>
      {q.explanation && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
          💡 <strong>Explanation:</strong> {q.explanation}
        </div>
      )}
      {children}
    </div>
  );
}

function SinglePasteUpload({ onSave, saving }) {
  const [rawText, setRawText]   = useState('');
  const [parsed,  setParsed]    = useState(null);
  const [parseErr, setParseErr] = useState('');

  const handleParse = () => {
    setParseErr('');
    const { results, errors } = parseEntranceQuestions(rawText);
    if (errors.length) { setParseErr(errors.join('\n')); setParsed(null); return; }
    if (!results.length) { setParseErr('No question detected.'); return; }
    setParsed(results[0]);
  };

  return (
    <>
      <FormatGuide />
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>📝 Paste Question</div>
        <textarea className="form-input" rows={12} placeholder="Paste your question here…" value={rawText} onChange={e => { setRawText(e.target.value); setParsed(null); setParseErr(''); }} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }} />
        <button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview</button>
      </div>
      {parseErr && <ParseError msg={parseErr} />}
      {parsed && (
        <QuestionPreview q={parsed}>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => { onSave(parsed); setParsed(null); setRawText(''); }} disabled={saving} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>
              {saving ? '📅 Saving…' : '📅 Add to Daily Bank'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setParsed(null); setRawText(''); }}>🗑️ Discard</button>
          </div>
        </QuestionPreview>
      )}
    </>
  );
}

function SliderWithPresets({ value, min, max, step, presets, onChange, displayFn, color }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: color }} />
        <div style={{ minWidth: 58, textAlign: 'center', fontWeight: 800, fontSize: 22, color, background: 'rgba(0,0,0,0.08)', borderRadius: 10, padding: '6px 10px' }}>
          {displayFn(value)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {presets.map(p => {
          const v = typeof p === 'object' ? p.v : p;
          const l = typeof p === 'object' ? p.l : String(p);
          return (
            <button key={v} onClick={() => onChange(v)} style={{ padding: '5px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, transition: 'all .15s', borderColor: value === v ? color : 'var(--border)', background: value === v ? `${color}22` : 'var(--bg-tertiary)', color: value === v ? color : 'var(--text-muted)' }}>{l}</button>
          );
        })}
      </div>
    </>
  );
}
