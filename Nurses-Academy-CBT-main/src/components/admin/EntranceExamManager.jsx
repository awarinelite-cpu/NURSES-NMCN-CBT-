// src/components/admin/EntranceExamManager.jsx
import { useEffect, useState, useCallback } from 'react';
import {
  collection, getDocs, doc, deleteDoc,
  query, orderBy, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

const TABS = ['Question Bank', 'Manage Schools', 'Add Single Question', 'Bulk Upload', 'Daily Mock'];

// ── helpers ──────────────────────────────────────────────────────
const ALL = 'All';

export default function EntranceExamManager() {
  const [activeTab,   setActiveTab]   = useState('Question Bank');

  return (
    <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto', fontFamily: F, color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#041428,#0A1F35)',
        borderRadius: 16, padding: '24px 20px', marginBottom: 24,
        border: '1px solid rgba(13,148,136,0.25)',
      }}>
        <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.6rem,4vw,2.4rem)', margin: 0, color: '#fff' }}>
          🏫 Entrance Exam Manager
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', margin: '8px 0 0', fontSize: 14, fontWeight: 700 }}>
          Manage schools · upload questions · configure smart daily mock rotation
        </p>
      </div>

      {/* Tab strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700,
            fontSize: 13, fontFamily: F,
            background: activeTab === tab ? 'var(--teal)' : 'var(--bg-secondary)',
            color:      activeTab === tab ? '#fff'        : 'var(--text-secondary)',
            border: activeTab === tab
              ? '1.5px solid var(--teal)'
              : '1.5px solid var(--border)',
            transition: 'all 0.18s',
          }}>
            {tab === 'Question Bank'        && '📋 '}
            {tab === 'Manage Schools'       && '🏫 '}
            {tab === 'Add Single Question'  && '➕ '}
            {tab === 'Bulk Upload'          && '📤 '}
            {tab === 'Daily Mock'           && '📅 '}
            {tab}
          </button>
        ))}
      </div>

      {/* Panels */}
      {activeTab === 'Question Bank'       && <QuestionBankPanel />}
      {activeTab === 'Manage Schools'      && <ManageSchoolsPanel />}
      {activeTab === 'Add Single Question' && <AddSingleQuestionPanel />}
      {activeTab === 'Bulk Upload'         && <BulkUploadPanel />}
      {activeTab === 'Daily Mock'          && <DailyMockPanel />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// QUESTION BANK PANEL — with bulk delete matching QuestionsManager
// ════════════════════════════════════════════════════════════════
function QuestionBankPanel() {
  const [questions,   setQuestions]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterSchool,setFilterSchool]= useState(ALL);
  const [filterYear,  setFilterYear]  = useState(ALL);
  const [filterType,  setFilterType]  = useState(ALL);
  const [filterBank,  setFilterBank]  = useState(ALL);           // All / Daily / Non-Daily
  const [selected,    setSelected]    = useState(new Set());
  const [deleting,    setDeleting]    = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);

  // Stats
  const totalQ     = questions.length;
  const inDaily    = questions.filter(q => q.inDailyBank).length;
  const notInBank  = totalQ - inDaily;

  // Derived lists for filters
  const schools = [ALL, ...new Set(questions.map(q => q.school).filter(Boolean))].sort();
  const years   = [ALL, ...new Set(questions.map(q => String(q.year)).filter(Boolean))].sort((a,b) => b-a);
  const types   = [ALL, ...new Set(questions.map(q => q.subject || q.type).filter(Boolean))].sort();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'entranceExamQuestions'), orderBy('createdAt', 'desc')));
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      // fallback without orderBy if index missing
      const snap = await getDocs(collection(db, 'entranceExamQuestions'));
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered list
  const filtered = questions.filter(q => {
    const matchSearch = !search ||
      (q.question || '').toLowerCase().includes(search.toLowerCase());
    const matchSchool = filterSchool === ALL || q.school === filterSchool;
    const matchYear   = filterYear   === ALL || String(q.year) === filterYear;
    const matchType   = filterType   === ALL || (q.subject || q.type) === filterType;
    const matchBank   =
      filterBank === ALL         ? true :
      filterBank === 'Daily'     ? q.inDailyBank :
      filterBank === 'Non-Daily' ? !q.inDailyBank : true;
    return matchSearch && matchSchool && matchYear && matchType && matchBank;
  });

  // ── selection helpers ──
  const allFilteredIds  = filtered.map(q => q.id);
  const allSelected     = allFilteredIds.length > 0 && allFilteredIds.every(id => selected.has(id));
  const someSelected    = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        allFilteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── bulk delete ──
  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      const ids   = [...selected];
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, 'entranceExamQuestions', id)));
      await batch.commit();
      setSelected(new Set());
      setConfirmDel(false);
      await load();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => setConfirmDel(false);

  // ── single question delete ──
  const deleteSingle = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    await deleteDoc(doc(db, 'entranceExamQuestions', id));
    setQuestions(prev => prev.filter(q => q.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          ['📋', totalQ,    'Total Questions', '#F59E0B'],
          ['📅', inDaily,   'In Daily Bank',   '#8B5CF6'],
          ['📁', notInBank, 'Not in Bank',     '#F59E0B'],
        ].map(([icon, val, label, color]) => (
          <div key={label} style={{
            background: 'var(--bg-secondary)', borderRadius: 12,
            padding: '16px 14px', border: '1px solid var(--border)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22 }}>{icon}</div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 26, color, margin: '4px 0 2px' }}>{val}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} className="form-input form-select" style={{ fontFamily: F, fontWeight: 700, fontSize: 13 }}>
          {schools.map(s => <option key={s} value={s}>{s === ALL ? 'All Schools' : s}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="form-input form-select" style={{ fontFamily: F, fontWeight: 700, fontSize: 13 }}>
          {years.map(y => <option key={y} value={y}>{y === ALL ? 'All Years' : y}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-input form-select" style={{ fontFamily: F, fontWeight: 700, fontSize: 13 }}>
          {types.map(t => <option key={t} value={t}>{t === ALL ? 'All Types' : t}</option>)}
        </select>
        <select value={filterBank} onChange={e => setFilterBank(e.target.value)} className="form-input form-select" style={{ fontFamily: F, fontWeight: 700, fontSize: 13 }}>
          {['All (Daily + Non)', 'Daily', 'Non-Daily'].map(b => <option key={b} value={b === 'All (Daily + Non)' ? ALL : b}>{b}</option>)}
        </select>
      </div>

      {/* Search + refresh */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search questions..."
            className="form-input"
            style={{ paddingLeft: 36, fontFamily: F, fontWeight: 700, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button onClick={load} style={{
          padding: '0 16px', borderRadius: 10, cursor: 'pointer',
          background: 'var(--bg-secondary)', border: '1.5px solid var(--border)',
          color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13, fontFamily: F,
        }}>↻ Refresh</button>
      </div>

      {/* ── DELETE BUTTON — matches QuestionsManager style ── */}
      {someSelected && (
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {!confirmDel ? (
            <button
              onClick={handleDelete}
              style={{
                padding: '10px 22px', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(239,68,68,0.15)',
                border: '1.5px solid rgba(239,68,68,0.5)',
                color: '#EF4444', fontWeight: 900, fontSize: 14, fontFamily: F,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              🗑️ Delete {selected.size}
            </button>
          ) : (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '10px 22px', borderRadius: 10, cursor: deleting ? 'wait' : 'pointer',
                  background: '#EF4444', border: 'none',
                  color: '#fff', fontWeight: 900, fontSize: 14, fontFamily: F,
                }}
              >
                {deleting ? 'Deleting…' : `⚠️ Confirm Delete ${selected.size}`}
              </button>
              <button
                onClick={cancelDelete}
                style={{
                  padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                  background: 'var(--bg-secondary)', border: '1.5px solid var(--border)',
                  color: 'var(--text-secondary)', fontWeight: 700, fontSize: 13, fontFamily: F,
                }}
              >Cancel</button>
            </>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>
            {selected.size} selected
          </span>
        </div>
      )}

      {/* Count */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, fontFamily: F }}>
        {filtered.length} questions found
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontWeight: 700 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: F }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                {/* Select-all checkbox */}
                <th style={{ padding: '12px 10px', textAlign: 'center', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--teal)' }}
                  />
                </th>
                {['#', 'QUESTION', 'SCHOOL', 'YEAR', 'SUBJECT', 'BANK', ''].map(h => (
                  <th key={h} style={{
                    padding: '12px 10px', textAlign: 'left', fontWeight: 900,
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                    color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>
                    No questions found
                  </td>
                </tr>
              )}
              {filtered.map((q, i) => (
                <tr
                  key={q.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selected.has(q.id)
                      ? 'rgba(239,68,68,0.06)'
                      : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Row checkbox */}
                  <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(q.id)}
                      onChange={() => toggleOne(q.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#EF4444' }}
                    />
                  </td>
                  <td style={{ padding: '12px 10px', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '12px 10px', maxWidth: 200 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {q.question || '—'}
                    </div>
                    {q.options?.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontWeight: 700 }}>
                        {q.options.length} options
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {q.school || '—'}
                  </td>
                  <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {q.year || '—'}
                  </td>
                  <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--teal)', fontSize: 12 }}>
                    {q.subject || q.type || '—'}
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 900,
                      background: q.inDailyBank ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
                      color: q.inDailyBank ? '#8B5CF6' : 'var(--text-muted)',
                      border: `1px solid ${q.inDailyBank ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
                    }}>
                      {q.inDailyBank ? '📅 Daily' : 'Non'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <button
                      onClick={() => deleteSingle(q.id)}
                      style={{
                        padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        color: '#EF4444', fontWeight: 700, fontFamily: F,
                      }}
                    >🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MANAGE SCHOOLS PANEL
// ════════════════════════════════════════════════════════════════
function ManageSchoolsPanel() {
  const [schools,  setSchools]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState('');
  const [saving,   setSaving]   = useState(false);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'entranceExamSchools'));
    setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const { setDoc, doc: firestoreDoc, serverTimestamp } = {};

  const addSchool = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { setDoc, doc: fDoc, serverTimestamp: sTs } = await import('firebase/firestore');
      const id = newName.trim().toLowerCase().replace(/\s+/g, '_');
      await setDoc(fDoc(db, 'entranceExamSchools', id), {
        name: newName.trim(), createdAt: sTs(),
      });
      setNewName('');
      await load();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const deleteSchool = async (id) => {
    if (!window.confirm('Delete this school?')) return;
    await deleteDoc(doc(db, 'entranceExamSchools', id));
    setSchools(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="School name..."
          className="form-input" style={{ flex: 1, fontFamily: F, fontWeight: 700 }}
          onKeyDown={e => e.key === 'Enter' && addSchool()}
        />
        <button onClick={addSchool} disabled={saving} style={{
          padding: '0 20px', borderRadius: 10, cursor: 'pointer',
          background: 'var(--teal)', border: 'none', color: '#fff',
          fontWeight: 700, fontFamily: F,
        }}>{saving ? 'Adding…' : '+ Add'}</button>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {schools.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: 'var(--bg-secondary)',
              borderRadius: 10, border: '1px solid var(--border)',
            }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: F }}>🏫 {s.name}</span>
              <button onClick={() => deleteSchool(s.id)} style={{
                padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#EF4444', fontWeight: 700, fontSize: 12, fontFamily: F,
              }}>🗑️ Remove</button>
            </div>
          ))}
          {schools.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center', padding: 24 }}>No schools yet</p>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ADD SINGLE QUESTION PANEL
// ════════════════════════════════════════════════════════════════
function AddSingleQuestionPanel() {
  const blank = { question: '', options: ['','','',''], answer: '', school: '', year: '', subject: '', inDailyBank: false };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      setMsg('❌ Question and answer are required.'); return;
    }
    setSaving(true);
    try {
      const { addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'entranceExamQuestions'), {
        ...form,
        options: form.options.filter(Boolean),
        createdAt: serverTimestamp(),
      });
      setMsg('✅ Question added!');
      setForm(blank);
    } catch (e) { setMsg('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600 }}>
      <h3 style={{ fontFamily: H, fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>➕ Add Single Question</h3>

      <textarea
        value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
        placeholder="Question text..."
        className="form-input" rows={3}
        style={{ fontFamily: F, fontWeight: 700, resize: 'vertical' }}
      />

      {form.options.map((opt, i) => (
        <input key={i} value={opt}
          onChange={e => setForm(f => { const o = [...f.options]; o[i] = e.target.value; return { ...f, options: o }; })}
          placeholder={`Option ${String.fromCharCode(65 + i)}`}
          className="form-input" style={{ fontFamily: F, fontWeight: 700 }}
        />
      ))}

      <input value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
        placeholder="Correct answer (e.g. A or full text)"
        className="form-input" style={{ fontFamily: F, fontWeight: 700 }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))}
          placeholder="School" className="form-input" style={{ fontFamily: F, fontWeight: 700 }} />
        <input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
          placeholder="Year (e.g. 2023)" className="form-input" style={{ fontFamily: F, fontWeight: 700 }} />
        <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
          placeholder="Subject" className="form-input" style={{ fontFamily: F, fontWeight: 700 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontFamily: F, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.inDailyBank} onChange={e => setForm(f => ({ ...f, inDailyBank: e.target.checked }))}
            style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
          Add to Daily Bank
        </label>
      </div>

      {msg && <div style={{ fontWeight: 700, fontSize: 14, fontFamily: F, color: msg.startsWith('✅') ? '#16A34A' : '#EF4444' }}>{msg}</div>}

      <button onClick={save} disabled={saving} style={{
        padding: '12px 28px', borderRadius: 10, cursor: saving ? 'wait' : 'pointer',
        background: 'var(--teal)', border: 'none', color: '#fff',
        fontWeight: 700, fontSize: 14, fontFamily: F, alignSelf: 'flex-start',
      }}>
        {saving ? 'Saving…' : '💾 Save Question'}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BULK UPLOAD PANEL
// ════════════════════════════════════════════════════════════════
function BulkUploadPanel() {
  return (
    <div style={{ padding: 24, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
      <h3 style={{ fontFamily: H, fontWeight: 900, margin: '0 0 12px', color: 'var(--text-primary)' }}>📤 Bulk Upload</h3>
      <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>
        Use the <strong style={{ color: 'var(--text-primary)' }}>EntranceDailyMockUpload</strong> page at{' '}
        <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
          /admin/entrance-exam/daily-mock-upload
        </code>{' '}
        for bulk question uploads.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// DAILY MOCK PANEL
// ════════════════════════════════════════════════════════════════
function DailyMockPanel() {
  return (
    <div style={{ padding: 24, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
      <h3 style={{ fontFamily: H, fontWeight: 900, margin: '0 0 12px', color: 'var(--text-primary)' }}>📅 Daily Mock Config</h3>
      <p style={{ color: 'var(--text-muted)', fontWeight: 700, fontFamily: F }}>
        Daily mock rotation settings — coming soon.
      </p>
    </div>
  );
}
