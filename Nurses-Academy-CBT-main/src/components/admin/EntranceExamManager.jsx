// src/components/admin/EntranceExamManager.jsx
// Route: /admin/entrance-exam
//
// CHANGES (latest):
//   - Added "Subjects" tab — full CRUD for `entranceExamSubjects` collection
//   - Each subject has: name, icon (emoji), color, order (drag sort order)
//   - Subject Drill reads from this collection via subject.name matching questions

import { useState, useEffect, useCallback } from 'react';
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc,
  query, where, orderBy, serverTimestamp, writeBatch, getCountFromServer,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import {
  parseEntranceQuestions,
  seededShuffle,
  dateSeed,
  ENTRANCE_YEARS,
  ENTRANCE_SUBJECTS as SUBJECTS,
} from '../../utils/entranceExamParser';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const S = {
  label: { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 },
  card:  { background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '18px 20px' },
};

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// Preset colour palette for subject cards
const COLOR_PALETTE = [
  '#0D9488', // teal
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // emerald
  '#EF4444', // red
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6366F1', // indigo
];

// Popular emoji picks for quick selection
const EMOJI_PICKS = ['📚','🔬','⚗️','🧬','🧪','🫀','🫁','💊','🩺','🧠','🦷','👁️','🩻','📐','📊','🔭','🌡️','🩹','💉','🧫'];

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
    { id: 'subjects',   label: '📚 Manage Subjects'   },   // ← NEW
    { id: 'add_single', label: '➕ Add Single Question' },
    { id: 'bulk',       label: '📤 Bulk Upload'        },
    { id: 'bank',       label: '📋 Question Bank'      },
    { id: 'daily_mock', label: '📅 Daily Mock'         },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200, fontFamily: F }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#0F2A4A,#065F46)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 28,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 50%, rgba(13,148,136,0.25) 0%, transparent 60%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{ color: '#fff', fontFamily: H, fontWeight: 900, margin: '0 0 6px', fontSize: 'clamp(1.6rem,4vw,2.4rem)' }}>
            🏫 Entrance Exam Manager
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: 0, fontSize: 14, fontFamily: F, fontWeight: 700 }}>
            Manage schools · subjects · upload questions · configure smart daily mock rotation
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 18px', borderRadius: 10, border: '1.5px solid',
            cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 13,
            transition: 'all .2s',
            borderColor: tab === t.id ? 'var(--teal)' : 'var(--border)',
            background:  tab === t.id ? 'rgba(13,148,136,0.15)' : 'var(--bg-card)',
            color:       tab === t.id ? 'var(--teal)' : 'var(--text-secondary)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'schools'    && <SchoolsTab    toast={toast} onSchoolsChanged={reloadSchools} />}
      {tab === 'subjects'   && <SubjectsTab   toast={toast} />}
      {tab === 'add_single' && <AddSingleTab  toast={toast} schools={schools} schoolsReady={schoolsReady} />}
      {tab === 'bulk'       && <BulkUploadTab toast={toast} schools={schools} schoolsReady={schoolsReady} />}
      {tab === 'bank'       && <QuestionBankTab toast={toast} schools={schools} schoolsReady={schoolsReady} />}
      {tab === 'daily_mock' && <DailyMockTab  toast={toast} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB — Manage Subjects  (NEW)
// ═════════════════════════════════════════════════════════════════════════════
function SubjectsTab({ toast }) {
  const [subjects,  setSubjects]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setModal]     = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form, setForm] = useState({
    name: '', icon: '📚', color: COLOR_PALETTE[0], order: 0,
  });
  const [saving,    setSaving]    = useState(false);
  const [counts,    setCounts]    = useState({});  // name → questionCount

  // Load subjects + question counts
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'entranceExamSubjects'), orderBy('order', 'asc'))
      ).catch(() => getDocs(collection(db, 'entranceExamSubjects')));

      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSubjects(list);

      // Fetch question counts in parallel
      const countEntries = await Promise.all(
        list.map(async subj => {
          try {
            const c = await getCountFromServer(
              query(collection(db, 'entranceExamQuestions'), where('subject', '==', subj.name))
            );
            return [subj.name, c.data().count];
          } catch {
            return [subj.name, 0];
          }
        })
      );
      setCounts(Object.fromEntries(countEntries));
    } catch (e) { console.error('SubjectsTab load:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    const nextOrder = subjects.length > 0
      ? Math.max(...subjects.map(s => s.order ?? 0)) + 1
      : 0;
    setEditing(null);
    setForm({ name: '', icon: '📚', color: COLOR_PALETTE[subjects.length % COLOR_PALETTE.length], order: nextOrder });
    setModal(true);
  };

  const openEdit = s => {
    setEditing(s);
    setForm({ name: s.name, icon: s.icon || '📚', color: s.color || COLOR_PALETTE[0], order: s.order ?? 0 });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast('Subject name is required', 'error'); return; }
    // Check for duplicate name (excluding current edit)
    const duplicate = subjects.find(
      s => s.name.toLowerCase() === form.name.trim().toLowerCase() && s.id !== editing?.id
    );
    if (duplicate) { toast('A subject with this name already exists', 'error'); return; }

    setSaving(true);
    try {
      const data = {
        name:      form.name.trim(),
        icon:      form.icon || '📚',
        color:     form.color || COLOR_PALETTE[0],
        order:     Number(form.order) || 0,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'entranceExamSubjects', editing.id), data);
        toast('Subject updated ✅', 'success');
      } else {
        await addDoc(collection(db, 'entranceExamSubjects'), { ...data, createdAt: serverTimestamp() });
        toast('Subject added ✅', 'success');
      }
      setModal(false);
      load();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async s => {
    const qCount = counts[s.name] || 0;
    const msg = qCount > 0
      ? `Delete "${s.name}"? This will NOT delete its ${qCount} questions, but they will be invisible in Subject Drill until a new subject with this name is created.`
      : `Delete subject "${s.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteDoc(doc(db, 'entranceExamSubjects', s.id));
      toast('Subject deleted', 'success');
      load();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  // Move up/down in order
  const moveOrder = async (subj, direction) => {
    const sorted = [...subjects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = sorted.findIndex(s => s.id === subj.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'entranceExamSubjects', subj.id),  { order: other.order ?? swapIdx });
      batch.update(doc(db, 'entranceExamSubjects', other.id), { order: subj.order  ?? idx     });
      await batch.commit();
      load();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  return (
    <div style={{ maxWidth: 900 }}>

      {/* Info banner */}
      <div style={{
        background: 'rgba(13,148,136,0.07)',
        border: '1px solid rgba(13,148,136,0.25)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 20 }}>📌</span>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, fontFamily: F, fontWeight: 700 }}>
          Subjects defined here appear in the <strong style={{ color: 'var(--teal)' }}>Subject Drill</strong> section.
          When uploading questions, set the <code>subject</code> field to <strong>exactly match</strong> the name you define here.
          The drill will automatically show question counts and available years.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: F }}>
          {subjects.length} subject{subjects.length !== 1 ? 's' : ''} defined
        </div>
        <button className="btn btn-primary" onClick={openAdd}>➕ Add New Subject</button>
      </div>

      {loading ? <Spinner /> : subjects.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: 'var(--bg-card)', borderRadius: 16,
          border: '1.5px dashed var(--border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
            No subjects yet
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 20px' }}>
            Add your first subject — students will see these in Subject Drill.
          </p>
          <button className="btn btn-primary" onClick={openAdd}>➕ Add First Subject</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...subjects]
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
            .map((s, idx, arr) => (
              <div key={s.id} style={{
                background: 'var(--bg-card)',
                border: '1.5px solid var(--border)',
                borderRadius: 14, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                {/* Colour swatch + icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: s.color || 'var(--teal)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>
                  {s.icon || '📚'}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', fontFamily: F }}>
                    {s.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontFamily: F,
                      padding: '2px 8px', borderRadius: 20,
                      background: `${s.color || '#0D9488'}18`,
                      color: s.color || '#0D9488',
                      border: `1px solid ${s.color || '#0D9488'}33`,
                    }}>
                      {counts[s.name] ?? '…'} question{counts[s.name] !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
                      Order: {s.order ?? 0}
                    </span>
                    <span style={{
                      fontSize: 11, fontFamily: 'monospace',
                      color: 'var(--text-muted)', padding: '2px 6px',
                      background: 'var(--bg-tertiary)', borderRadius: 4,
                    }}>
                      {s.color || '#0D9488'}
                    </span>
                  </div>
                </div>

                {/* Order controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => moveOrder(s, 'up')}
                    disabled={idx === 0}
                    title="Move up"
                    style={{ padding: '3px 8px', opacity: idx === 0 ? 0.3 : 1 }}
                  >
                    ▲
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => moveOrder(s, 'down')}
                    disabled={idx === arr.length - 1}
                    title="Move down"
                    style={{ padding: '3px 8px', opacity: idx === arr.length - 1 ? 0.3 : 1 }}
                  >
                    ▼
                  </button>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>✏️ Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s)} style={{ color: '#EF4444' }}>🗑️</button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <Modal title={editing ? '✏️ Edit Subject' : '➕ Add New Subject'} onClose={() => setModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Name */}
            <div>
              <label style={S.label}>Subject Name *</label>
              <input
                className="form-input"
                placeholder="e.g. Biology, Chemistry, Physics…"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>
                ⚠️ Must match the <code>subject</code> field in uploaded questions exactly (case-sensitive).
              </p>
            </div>

            {/* Icon */}
            <div>
              <label style={S.label}>Icon (emoji)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input
                  className="form-input"
                  value={form.icon}
                  onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                  placeholder="📚"
                  style={{ width: 80, textAlign: 'center', fontSize: 22 }}
                  maxLength={4}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F }}>or pick below:</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {EMOJI_PICKS.map(e => (
                  <button
                    key={e}
                    onClick={() => setForm(p => ({ ...p, icon: e }))}
                    style={{
                      width: 36, height: 36, borderRadius: 8, fontSize: 18,
                      border: `2px solid ${form.icon === e ? 'var(--teal)' : 'var(--border)'}`,
                      background: form.icon === e ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Colour */}
            <div>
              <label style={S.label}>Accent Colour</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(p => ({ ...p, color: c }))}
                    title={c}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: c, cursor: 'pointer', flexShrink: 0,
                      border: form.color === c ? '3px solid #fff' : '2px solid transparent',
                      outline: form.color === c ? `3px solid ${c}` : 'none',
                      transition: 'all 0.15s',
                    }}
                  />
                ))}
                {/* Custom hex */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                    style={{ width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 0 }}
                    title="Custom colour"
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{form.color}</span>
                </div>
              </div>

              {/* Preview */}
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 10,
                background: `${form.color}18`,
                border: `2px solid ${form.color}55`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: form.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>
                  {form.icon || '📚'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: F }}>
                    {form.name || 'Subject Name'}
                  </div>
                  <div style={{ fontSize: 12, color: form.color, fontWeight: 700, fontFamily: F }}>
                    Preview
                  </div>
                </div>
              </div>
            </div>

            {/* Order */}
            <div>
              <label style={S.label}>Display Order</label>
              <input
                type="number"
                className="form-input"
                value={form.order}
                onChange={e => setForm(p => ({ ...p, order: Number(e.target.value) || 0 }))}
                style={{ width: 100 }}
                min={0}
              />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>
                Lower number = appears first. You can also reorder using ▲ ▼ buttons.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              style={{ flex: 1 }}
            >
              {saving ? '💾 Saving…' : editing ? '💾 Save Changes' : '➕ Add Subject'}
            </button>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1 — Manage Schools
// ═════════════════════════════════════════════════════════════════════════════
function SchoolsTab({ toast, onSchoolsChanged }) {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState({ name: '', shortName: '', state: '', isActive: true });
  const [saving, setSaving]   = useState(false);

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
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: F }}>{schools.length} school{schools.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary" onClick={openAdd}>➕ Add New School</button>
      </div>
      {loading ? <Spinner /> : schools.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F }}>No schools yet. Add one to get started!</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>School Name</th><th>Short Name</th><th>State</th><th>Questions</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {schools.map((s, i) => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{s.name}</td>
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
                  <button key={String(o.v)} onClick={() => setForm(p => ({ ...p, isActive: o.v }))} style={{ padding: '8px 16px', borderRadius: 8, border: '2px solid', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 13, transition: 'all .2s', borderColor: form.isActive === o.v ? 'var(--teal)' : 'var(--border)', background: form.isActive === o.v ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)', color: form.isActive === o.v ? 'var(--teal)' : 'var(--text-secondary)' }}>{o.l}</button>
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
  const [subject,  setSubject]  = useState('');
  const [customSubjects, setCustomSubjects] = useState([]);
  const [addToDailyBank, setAddToDailyBank] = useState(false);
  const [mode, setMode]         = useState('form');
  const [form, setForm] = useState({ questionText: '', options: { A:'', B:'', C:'', D:'' }, correctAnswer: 'A', explanation: '', diagramUrl: '' });
  const [rawText,  setRawText]  = useState('');
  const [parsed,   setParsed]   = useState(null);
  const [parseErr, setParseErr] = useState('');
  const [saving,   setSaving]   = useState(false);

  // Load admin-defined subjects
  useEffect(() => {
    getDocs(query(collection(db, 'entranceExamSubjects'), orderBy('order', 'asc')))
      .catch(() => getDocs(collection(db, 'entranceExamSubjects')))
      .then(snap => {
        const names = snap.docs.map(d => d.data().name).filter(Boolean);
        setCustomSubjects(names);
        if (names.length > 0 && !subject) setSubject(names[0]);
      })
      .catch(() => {});
  }, []);

  // Merged subject list: admin-defined first, then legacy SUBJECTS fallback
  const subjectOptions = customSubjects.length > 0
    ? [...new Set([...customSubjects, ...SUBJECTS])]
    : SUBJECTS;

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
      const payload = { schoolId: schoolId || null, schoolName: school?.name || '', year, subject, questionType: qData.diagramUrl ? 'diagram' : 'text', diagramUrl: qData.diagramUrl || '', questionText: qData.questionText, options: qData.options, correctAnswer: qData.correctAnswer, explanation: qData.explanation || '', active: true, inDailyBank: addToDailyBank, createdAt: serverTimestamp() };
      await addDoc(collection(db, 'entranceExamQuestions'), payload);
      if (schoolId) {
        try { const c = await getCountFromServer(query(collection(db, 'entranceExamQuestions'), where('schoolId', '==', schoolId))); await updateDoc(doc(db, 'entranceExamSchools', schoolId), { questionCount: c.data().count }); } catch {}
      }
      toast('Question saved ✅', 'success');
      setRawText(''); setParsed(null); setParseErr('');
      setForm({ questionText: '', options: { A:'', B:'', C:'', D:'' }, correctAnswer: 'A', explanation: '', diagramUrl: '' });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 14, fontFamily: H }}>📋 Question Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div><label style={S.label}>🏫 School</label><select className="form-input form-select" value={schoolId} onChange={e => setSchoolId(e.target.value)} style={{ width: '100%' }}><option value="">{schoolsReady ? (schools.length === 0 ? 'No schools yet' : 'Select school…') : 'Loading…'}</option>{schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}</select></div>
          <div><label style={S.label}>📅 Year</label><select className="form-input form-select" value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%' }}>{ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
          <div>
            <label style={S.label}>📚 Subject</label>
            <select className="form-input form-select" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select subject…</option>
              {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setAddToDailyBank(v => !v)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: addToDailyBank ? 'var(--teal)' : 'var(--bg-tertiary)', transition: 'background .2s' }}><span style={{ position: 'absolute', top: 3, left: addToDailyBank ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', display: 'block' }} /></button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 700, fontFamily: F }}>📅 Add to <strong style={{ color: 'var(--teal)' }}>Daily Mock Bank</strong></span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ id: 'form', label: '🖊️ Form Entry' }, { id: 'paste', label: '📋 Paste & Parse' }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 13, transition: 'all .2s', borderColor: mode === m.id ? 'var(--teal)' : 'var(--border)', background: mode === m.id ? 'rgba(13,148,136,0.12)' : 'var(--bg-card)', color: mode === m.id ? 'var(--teal)' : 'var(--text-muted)' }}>{m.label}</button>
        ))}
      </div>
      {mode === 'form' && (
        <div style={S.card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={S.label}>🖼️ Diagram URL (optional)</label><input className="form-input" value={form.diagramUrl} onChange={e => setForm(p => ({ ...p, diagramUrl: e.target.value }))} placeholder="https://…" style={{ width: '100%', boxSizing: 'border-box' }} /></div>
            <div><label style={S.label}>📝 Question Text *</label><textarea className="form-input" rows={3} value={form.questionText} onChange={e => setForm(p => ({ ...p, questionText: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} placeholder="Type the question here…" /></div>
            {['A','B','C','D'].map(letter => (
              <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div onClick={() => setForm(p => ({ ...p, correctAnswer: letter }))} style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: form.correctAnswer === letter ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)', border: `2px solid ${form.correctAnswer === letter ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: form.correctAnswer === letter ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer' }}>{letter}</div>
                <input className="form-input" value={form.options[letter]||''} onChange={e => setForm(p => ({ ...p, options: { ...p.options, [letter]: e.target.value } }))} style={{ flex: 1 }} placeholder={`Option ${letter}`} />
                {form.correctAnswer === letter && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✅</span>}
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>👆 Click a letter to mark as correct answer</p>
            <div><label style={S.label}>💡 Explanation (optional)</label><textarea className="form-input" rows={2} value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
            <button className="btn btn-primary" onClick={() => saveQuestion(form)} disabled={saving || !form.questionText.trim()}>{saving ? '💾 Saving…' : '💾 Save Question'}</button>
          </div>
        </div>
      )}
      {mode === 'paste' && (
        <>
          <FormatGuide />
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10, fontFamily: H }}>📝 Paste Question</div>
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
  const [subject,   setSubject]   = useState('');
  const [customSubjects, setCustomSubjects] = useState([]);
  const [addToDailyBank, setAddToDailyBank] = useState(false);
  const [rawText,   setRawText]   = useState('');
  const [parsed,    setParsed]    = useState([]);
  const [errors,    setErrors]    = useState([]);
  const [importing, setImporting] = useState(false);
  const [imported,  setImported]  = useState(null);

  useEffect(() => {
    getDocs(query(collection(db, 'entranceExamSubjects'), orderBy('order', 'asc')))
      .catch(() => getDocs(collection(db, 'entranceExamSubjects')))
      .then(snap => {
        const names = snap.docs.map(d => d.data().name).filter(Boolean);
        setCustomSubjects(names);
        if (names.length > 0 && !subject) setSubject(names[0]);
      })
      .catch(() => {});
  }, []);

  const subjectOptions = customSubjects.length > 0
    ? [...new Set([...customSubjects, ...SUBJECTS])]
    : SUBJECTS;

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
        batch.set(ref, { schoolId: schoolId || null, schoolName: school?.name || '', year, subject, questionType: q.questionType, diagramUrl: q.diagramUrl || '', questionText: q.questionText, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation || '', active: true, inDailyBank: addToDailyBank, createdAt: serverTimestamp() });
      });
      await batch.commit();
      if (schoolId) {
        try { const c = await getCountFromServer(query(collection(db, 'entranceExamQuestions'), where('schoolId', '==', schoolId))); await updateDoc(doc(db, 'entranceExamSchools', schoolId), { questionCount: c.data().count }); } catch {}
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
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 14, fontFamily: H }}>📋 Batch Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div><label style={S.label}>🏫 School</label><select className="form-input form-select" value={schoolId} onChange={e => setSchoolId(e.target.value)} style={{ width: '100%' }}><option value="">{schoolsReady ? (schools.length === 0 ? 'No schools yet' : 'Select school…') : 'Loading…'}</option>{schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}</select></div>
          <div><label style={S.label}>📅 Year (default)</label><select className="form-input form-select" value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%' }}>{ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
          <div>
            <label style={S.label}>📚 Subject (default)</label>
            <select className="form-input form-select" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select subject…</option>
              {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setAddToDailyBank(v => !v)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: addToDailyBank ? 'var(--teal)' : 'var(--bg-tertiary)', transition: 'background .2s' }}><span style={{ position: 'absolute', top: 3, left: addToDailyBank ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', display: 'block' }} /></button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 700, fontFamily: F }}>📅 Add all to <strong style={{ color: 'var(--teal)' }}>Daily Mock Bank</strong></span>
        </div>
      </div>
      <FormatGuide bulk />
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10, fontFamily: H }}>📝 Paste All Questions</div>
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
                  <tr key={i}><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</td><td style={{ fontSize: 12 }}>{q.questionText.slice(0, 60)}{q.questionText.length > 60 ? '…' : ''}</td><td><span className="badge badge-teal">{q.correctAnswer}</span></td><td><span className="badge badge-grey">{q.questionType === 'diagram' ? '🖼️' : '📝'}</span></td></tr>
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
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)', marginBottom: 4, fontFamily: H }}>Import Complete!</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: F }}>Imported {imported.count} questions · {imported.diagrams} with diagrams · {imported.count - imported.diagrams} text only</div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4 — Question Bank
// ═════════════════════════════════════════════════════════════════════════════
function QuestionBankTab({ toast, schools, schoolsReady }) {
  const [questions,    setQuestions]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filterSchool, setFilterSchool] = useState('');
  const [filterYear,   setFilterYear]   = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterType,   setFilterType]   = useState('');
  const [filterDaily,  setFilterDaily]  = useState('');
  const [search,       setSearch]       = useState('');
  const [editing,      setEditing]      = useState(null);
  const [selected,      setSelected]      = useState(new Set());
  const [bulkDeleting,  setBulkDeleting]  = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [adminSubjects, setAdminSubjects] = useState([]);

  useEffect(() => {
    getDocs(query(collection(db, 'entranceExamSubjects'), orderBy('order', 'asc')))
      .catch(() => getDocs(collection(db, 'entranceExamSubjects')))
      .then(snap => setAdminSubjects(snap.docs.map(d => d.data().name).filter(Boolean)))
      .catch(() => {});
  }, []);

  // Load the full collection once and filter/sort client-side. Doing this with
  // Firestore `where(...)` + `orderBy('createdAt')` requires a composite index
  // per filter combination — none exist for entranceExamQuestions, so those
  // queries throw FAILED_PRECONDITION, get swallowed by the catch block, and
  // `questions` silently stays stuck on the last successful (unfiltered) load.
  // That made the filters appear to do nothing and made post-delete reloads
  // appear to "not delete" anything.
  const load = async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const snap = await getDocs(collection(db, 'entranceExamQuestions'));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const toMillis = (ts) => ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : 0);
      all.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setQuestions(all);
    } catch (e) { console.error(e); toast('Failed to load questions: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Clear any selection whenever the active filters/search change, so stale
  // selections from a different filter view can't be bulk-deleted by mistake.
  useEffect(() => { setSelected(new Set()); }, [filterSchool, filterYear, filterSubject, filterType, filterDaily, search]);

  const filtered = questions.filter(q => {
    if (filterSchool && q.schoolId !== filterSchool) return false;
    if (filterYear && String(q.year) !== String(filterYear)) return false;
    if (filterSubject && q.subject !== filterSubject) return false;
    if (filterType && q.questionType !== filterType) return false;
    if (filterDaily === 'yes' && !q.inDailyBank) return false;
    if (filterDaily === 'no' && q.inDailyBank) return false;
    if (search && !q.questionText?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const displayed = filtered.slice(0, 100);

  const allDisplayedSelected = displayed.length > 0 && displayed.every(q => selected.has(q.id));
  const someSelected         = selected.size > 0;

  const toggleSelectAll = () => {
    if (allDisplayedSelected) {
      setSelected(prev => { const next = new Set(prev); displayed.forEach(q => next.delete(q.id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); displayed.forEach(q => next.add(q.id)); return next; });
    }
  };

  const toggleOne = (id) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleDelete = async q => {
    if (!window.confirm('Delete this question?')) return;
    try { await deleteDoc(doc(db, 'entranceExamQuestions', q.id)); toast('Deleted ✅', 'success'); load(); }
    catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected question${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const ids = [...selected];
      const size = 400;
      for (let i = 0; i < ids.length; i += size) {
        const batch = writeBatch(db);
        ids.slice(i, i + size).forEach(id => batch.delete(doc(db, 'entranceExamQuestions', id)));
        await batch.commit();
      }
      toast(`Deleted ${ids.length} questions ✅`, 'success');
      load();
    } catch (e) { toast('Bulk delete failed: ' + e.message, 'error'); }
    finally { setBulkDeleting(false); }
  };

  const handleDeleteAllFiltered = async () => {
    const count = filtered.length;
    if (count === 0) { toast('No questions to delete', 'error'); return; }
    const input = window.prompt(`⚠️ DELETE ALL ${count} QUESTIONS?\n\nThis will permanently delete all ${count} questions matching the current filters.\n\nType "DELETE" to confirm.`);
    if (input?.trim().toUpperCase() !== 'DELETE') { toast('Delete cancelled', 'info'); return; }
    setDeleteAllBusy(true);
    try {
      const ids = filtered.map(q => q.id);
      const size = 400;
      for (let i = 0; i < ids.length; i += size) {
        const batch = writeBatch(db);
        ids.slice(i, i + size).forEach(id => batch.delete(doc(db, 'entranceExamQuestions', id)));
        await batch.commit();
      }
      toast(`Deleted all ${ids.length} questions ✅`, 'success');
      load();
    } catch (e) { toast('Delete all failed: ' + e.message, 'error'); }
    finally { setDeleteAllBusy(false); }
  };

  const toggleDailyBank = async q => {
    try {
      await updateDoc(doc(db, 'entranceExamQuestions', q.id), { inDailyBank: !q.inDailyBank });
      toast(!q.inDailyBank ? '📅 Added to Daily Bank' : '❌ Removed from Daily Bank', 'success');
      load();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  const dailyCount = questions.filter(q => q.inDailyBank).length;

  // Build subject filter options: union of admin subjects + unique subjects in loaded questions
  const questionSubjects = [...new Set(questions.map(q => q.subject).filter(Boolean))];
  const allSubjectOptions = [...new Set([...adminSubjects, ...questionSubjects])].sort();

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Questions', value: questions.length,              icon: '📋', color: 'var(--teal)'       },
          { label: 'In Daily Bank',   value: dailyCount,                    icon: '📅', color: '#8B5CF6'           },
          { label: 'Not in Bank',     value: questions.length - dailyCount, icon: '📁', color: 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, textAlign: 'center', padding: '14px 12px' }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontWeight: 900, fontSize: 22, color: s.color, fontFamily: H }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="form-input form-select" value={filterSchool} onChange={e => setFilterSchool(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All Schools</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}
        </select>
        <select className="form-input form-select" value={filterSubject} onChange={e => setFilterSubject(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All Subjects</option>
          {allSubjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
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
        <select className="form-input form-select" value={filterDaily} onChange={e => setFilterDaily(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">All (Daily + Non)</option>
          <option value="yes">📅 Daily Bank Only</option>
          <option value="no">📁 Non-Daily Only</option>
        </select>
        <input className="form-input" placeholder="🔍 Search questions…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button className="btn btn-ghost" onClick={load} title="Reload">🔄</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>
          {filtered.length} question{filtered.length !== 1 ? 's' : ''} found
          {filtered.length > 100 && <span style={{ color: '#F59E0B', marginLeft: 8 }}>(showing first 100)</span>}
        </div>
        <button onClick={handleDeleteAllFiltered} disabled={deleteAllBusy || filtered.length === 0} style={{ padding: '8px 18px', borderRadius: 10, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.4)', color: '#EF4444', fontWeight: 700, fontSize: 13, fontFamily: F, opacity: filtered.length === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          🗑️ {deleteAllBusy ? 'Deleting…' : `Delete All ${filtered.length} (Filtered)`}
        </button>
      </div>

      {someSelected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderRadius: 12, marginBottom: 12, background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.3)', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#EF4444', fontFamily: F, flex: 1 }}>☑️ {selected.size} question{selected.size !== 1 ? 's' : ''} selected</div>
          <button onClick={handleDeleteSelected} disabled={bulkDeleting} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: '#EF4444', color: '#fff', cursor: bulkDeleting ? 'wait' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: F, display: 'flex', alignItems: 'center', gap: 6 }}>
            🗑️ {bulkDeleting ? 'Deleting…' : `Delete Selected (${selected.size})`}
          </button>
          <button onClick={() => setSelected(new Set())} disabled={bulkDeleting} style={{ padding: '9px 16px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1.5px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: F }}>✕ Clear</button>
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 10, marginBottom: 10 }}>
          <input type="checkbox" checked={allDisplayedSelected} onChange={toggleSelectAll} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--teal)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>{allDisplayedSelected ? 'Deselect All' : 'Select All'} ({displayed.length})</span>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayed.map((q, i) => {
            const isSelected = selected.has(q.id);
            return (
              <div key={q.id} style={{ background: isSelected ? 'rgba(239,68,68,0.06)' : 'var(--bg-card)', border: isSelected ? '1.5px solid rgba(239,68,68,0.4)' : '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleOne(q.id)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#EF4444', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: F, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>#{i + 1}</span>
                    {q.questionText?.slice(0, 80)}{q.questionText?.length > 80 ? '…' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(q)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(q)} style={{ color: '#EF4444' }}>🗑️</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', paddingLeft: 28 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '2px 8px', fontFamily: F }}>📅 {q.year || '—'}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '2px 8px', fontFamily: F }}>📚 {q.subject || '—'}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '2px 8px', fontFamily: F }}>🏫 {q.schoolName?.split(' ').slice(-2).join(' ') || '—'}</span>
                  <button onClick={() => toggleDailyBank(q)} style={{ padding: '2px 10px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 11, transition: 'all .15s', borderColor: q.inDailyBank ? '#8B5CF6' : 'var(--border)', background: q.inDailyBank ? 'rgba(139,92,246,0.12)' : 'var(--bg-tertiary)', color: q.inDailyBank ? '#8B5CF6' : 'var(--text-muted)' }}>
                    {q.inDailyBank ? '📅 In Bank' : '➕ Add to Bank'}
                  </button>
                  <span className="badge badge-grey">{q.questionType === 'diagram' ? '🖼️' : '📝'}</span>
                </div>
              </div>
            );
          })}
          {filtered.length > 100 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 14, fontFamily: F }}>
              Showing 100 of {filtered.length} — use filters to narrow down
            </div>
          )}
        </div>
      )}

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

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5 — Daily Mock
// ═════════════════════════════════════════════════════════════════════════════
function DailyMockTab({ toast }) {
  const [subTab, setSubTab] = useState('settings');
  const SUB_TABS = [
    { id: 'settings', label: '⚙️ Settings'          },
    { id: 'upload',   label: '📤 Upload Questions'   },
    { id: 'schedule', label: '🗓️ Schedule & History' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12, transition: 'all .2s', borderColor: subTab === t.id ? '#8B5CF6' : 'var(--border)', background: subTab === t.id ? 'rgba(139,92,246,0.12)' : 'var(--bg-card)', color: subTab === t.id ? '#8B5CF6' : 'var(--text-muted)' }}>{t.label}</button>
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
  const bankSize   = stats?.totalQuestions || 0;
  const maxAllowed = Math.max(bankSize, 5);

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 24 }}>📅</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 6, fontFamily: H }}>How Smart Daily Mock Works</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: F }}>Every 24 hours, a new question set is selected from the <strong>Daily Mock Bank</strong>. The system tracks which questions each student has seen and <strong>never repeats</strong> them — unless the pass rate was below the threshold you set. Once all questions are exhausted, the cycle resets automatically.</div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#8B5CF6', fontFamily: F }}>📦 {bankSize} questions currently in Daily Mock Bank</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={S.card}><label style={{ ...S.label, fontSize: 13 }}>❓ Questions Per Mock</label><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, fontFamily: F }}>How many questions per daily session. Capped at your bank size ({bankSize}).</div><SliderWithPresets value={config.questionCount} min={5} max={Math.min(60, maxAllowed)} step={5} presets={[10,20,30,40,50].filter(n => n <= maxAllowed)} onChange={v => setConfig(c => ({ ...c, questionCount: v }))} displayFn={v => String(v)} color="var(--teal)" /></div>
        <div style={S.card}><label style={{ ...S.label, fontSize: 13 }}>⏱ Time Limit</label><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, fontFamily: F }}>Set to 0 for untimed. Mock auto-submits when time runs out.</div><SliderWithPresets value={config.timeLimit} min={0} max={120} step={5} presets={[{ v: 0, l: 'Untimed' }, { v: 20, l: '20m' }, { v: 30, l: '30m' }, { v: 45, l: '45m' }, { v: 60, l: '60m' }]} onChange={v => setConfig(c => ({ ...c, timeLimit: v }))} displayFn={v => v === 0 ? '∞' : `${v}m`} color="#F59E0B" /></div>
        <div style={S.card}><label style={{ ...S.label, fontSize: 13 }}>🎯 Pass Mark (%)</label><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, fontFamily: F }}>Score percentage a student must reach to be considered "passed".</div><SliderWithPresets value={config.passMark} min={30} max={80} step={5} presets={[40,50,60,70]} onChange={v => setConfig(c => ({ ...c, passMark: v }))} displayFn={v => `${v}%`} color="#10B981" /></div>
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><label style={{ ...S.label, fontSize: 13, marginBottom: 0 }}>🔁 Repeat Threshold (Pass Rate %)</label><span style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Smart Repeat</span></div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, fontFamily: F }}>If a question's overall pass rate falls <strong>below this threshold</strong>, it gets re-queued. Set to 0 to disable repeats.</div>
          <SliderWithPresets value={config.repeatThreshold} min={0} max={80} step={5} presets={[{ v: 0, l: 'Off' }, { v: 30, l: '30%' }, { v: 50, l: '50%' }, { v: 60, l: '60%' }]} onChange={v => setConfig(c => ({ ...c, repeatThreshold: v }))} displayFn={v => v === 0 ? 'Off' : `${v}%`} color="#EF4444" />
        </div>
        <div style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(13,148,136,0.08))', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 14, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontFamily: F }}>Preview — What students will see</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2, fontFamily: F, fontWeight: 700 }}>
            📅 Daily Mock: <strong style={{ color: 'var(--text-primary)' }}>{Math.min(config.questionCount, bankSize || config.questionCount)} questions</strong> · {config.timeLimit > 0 ? <><strong style={{ color: '#F59E0B' }}>{config.timeLimit} minutes</strong></> : <strong style={{ color: '#10B981' }}>Untimed</strong>}<br />
            ✅ Pass mark: <strong>{config.passMark}%</strong><br />
            🔁 No repeats unless pass rate {'<'} <strong style={{ color: '#EF4444' }}>{config.repeatThreshold > 0 ? `${config.repeatThreshold}%` : 'disabled'}</strong><br />
            ⚠️ Each student: <strong>one attempt per day</strong>
          </div>
        </div>
        <button onClick={save} disabled={saving} style={{ background: saved ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#8B5CF6,#6D28D9)', border: 'none', color: '#fff', padding: '14px 32px', borderRadius: 12, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700, fontFamily: F, alignSelf: 'flex-start', opacity: saving ? 0.7 : 1, transition: 'all 0.2s' }}>
          {saving ? '💾 Saving…' : saved ? '✅ Saved!' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ── Daily Mock: Upload ────────────────────────────────────────────────────────
function DailyMockUpload({ toast }) {
  const [mode, setMode] = useState('form');
  const [form, setForm] = useState({ questionText: '', options: { A:'', B:'', C:'', D:'' }, correctAnswer: 'A', explanation: '', diagramUrl: '' });
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
      await addDoc(collection(db, 'entranceExamQuestions'), { schoolId: null, schoolName: '', year: '', subject: '', questionType: form.diagramUrl ? 'diagram' : 'text', diagramUrl: form.diagramUrl || '', questionText: form.questionText, options: form.options, correctAnswer: form.correctAnswer, explanation: form.explanation || '', active: true, inDailyBank: true, createdAt: serverTimestamp() });
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
      parsed.forEach(q => { const ref = doc(collection(db, 'entranceExamQuestions')); batch.set(ref, { schoolId: null, schoolName: '', year: '', subject: '', questionType: q.questionType, diagramUrl: q.diagramUrl || '', questionText: q.questionText, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation || '', active: true, inDailyBank: true, createdAt: serverTimestamp() }); });
      await batch.commit();
      setImported({ count: parsed.length }); setParsed([]); setRawText('');
      toast(`${parsed.length} questions added to Daily Mock Bank ✅`, 'success');
    } catch (e) { toast('Import failed: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 22 }}>📅</span>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: F, fontWeight: 700 }}>Questions added here go <strong style={{ color: '#8B5CF6' }}>directly into the Daily Mock Bank</strong>. The system will select from them automatically every 24 hours.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ id: 'form', label: '🖊️ Single (Form)' }, { id: 'paste_single', label: '📋 Single (Paste)' }, { id: 'paste_bulk', label: '📦 Bulk Paste' }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12, transition: 'all .2s', borderColor: mode === m.id ? '#8B5CF6' : 'var(--border)', background: mode === m.id ? 'rgba(139,92,246,0.12)' : 'var(--bg-card)', color: mode === m.id ? '#8B5CF6' : 'var(--text-muted)' }}>{m.label}</button>
        ))}
      </div>
      {mode === 'form' && (
        <div style={S.card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><label style={S.label}>🖼️ Diagram URL (optional)</label><input className="form-input" value={form.diagramUrl} onChange={e => setForm(p => ({ ...p, diagramUrl: e.target.value }))} placeholder="https://…" style={{ width: '100%', boxSizing: 'border-box' }} /></div>
            <div><label style={S.label}>📝 Question Text *</label><textarea className="form-input" rows={3} value={form.questionText} onChange={e => setForm(p => ({ ...p, questionText: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} placeholder="Type the question here…" /></div>
            {['A','B','C','D'].map(letter => (<div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div onClick={() => setForm(p => ({ ...p, correctAnswer: letter }))} style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, background: form.correctAnswer === letter ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)', border: `2px solid ${form.correctAnswer === letter ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: form.correctAnswer === letter ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer' }}>{letter}</div><input className="form-input" value={form.options[letter]||''} onChange={e => setForm(p => ({ ...p, options: { ...p.options, [letter]: e.target.value } }))} style={{ flex: 1 }} placeholder={`Option ${letter}`} />{form.correctAnswer === letter && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>✅</span>}</div>))}
            <div><label style={S.label}>💡 Explanation (optional)</label><textarea className="form-input" rows={2} value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
            <button className="btn btn-primary" onClick={saveSingle} disabled={saving || !form.questionText.trim()} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>{saving ? '💾 Saving…' : '📅 Add to Daily Mock Bank'}</button>
          </div>
        </div>
      )}
      {mode === 'paste_single' && (<SinglePasteUpload onSave={async qData => { setSaving(true); try { await addDoc(collection(db, 'entranceExamQuestions'), { schoolId: null, schoolName: '', year: '', subject: '', questionType: qData.questionType, diagramUrl: qData.diagramUrl||'', questionText: qData.questionText, options: qData.options, correctAnswer: qData.correctAnswer, explanation: qData.explanation||'', active: true, inDailyBank: true, createdAt: serverTimestamp() }); toast('Added to Daily Mock Bank ✅', 'success'); } catch (e) { toast('Error: ' + e.message, 'error'); } finally { setSaving(false); } }} saving={saving} />)}
      {mode === 'paste_bulk' && (
        <>
          <FormatGuide bulk />
          <div style={{ ...S.card, marginBottom: 16 }}><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10, fontFamily: H }}>📦 Paste Multiple Questions</div><textarea className="form-input" rows={16} placeholder="Paste all questions here, separated by blank lines…" value={rawText} onChange={e => { setRawText(e.target.value); setParsed([]); setErrors([]); setImported(null); }} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} /><button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview</button></div>
          {errors.length > 0 && (<div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}><div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>⚠️ {errors.length} parse error{errors.length !== 1 ? 's' : ''}</div>{errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#EF4444' }}>{e}</div>)}</div>)}
          {parsed.length > 0 && (<div style={{ ...S.card, marginBottom: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: H }}>✅ {parsed.length} questions ready</div><button className="btn btn-primary" onClick={saveBulk} disabled={saving} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>{saving ? '📅 Importing…' : `📅 Add All to Daily Bank (${parsed.length})`}</button></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Question Preview</th><th>Ans</th><th>Type</th></tr></thead><tbody>{parsed.slice(0, 15).map((q, i) => (<tr key={i}><td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</td><td style={{ fontSize: 12 }}>{q.questionText.slice(0, 70)}{q.questionText.length > 70 ? '…' : ''}</td><td><span className="badge badge-teal">{q.correctAnswer}</span></td><td><span className="badge badge-grey">{q.questionType === 'diagram' ? '🖼️' : '📝'}</span></td></tr>))}{parsed.length > 15 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>… and {parsed.length - 15} more</td></tr>}</tbody></table></div></div>)}
          {imported && (<div style={{ background: 'rgba(139,92,246,0.08)', border: '1.5px solid rgba(139,92,246,0.3)', borderRadius: 14, padding: '20px 24px', textAlign: 'center' }}><div style={{ fontSize: 36, marginBottom: 8 }}>📅</div><div style={{ fontWeight: 800, fontSize: 16, color: '#8B5CF6', marginBottom: 4, fontFamily: H }}>Added to Daily Mock Bank!</div><div style={{ fontSize: 14, color: 'var(--text-muted)', fontFamily: F }}>{imported.count} questions are now eligible for daily rotation</div></div>)}
        </>
      )}
    </div>
  );
}

// ── Daily Mock: Schedule ──────────────────────────────────────────────────────
function DailyMockSchedule({ toast }) {
  const [config,     setConfig]     = useState(null);
  const [bankIds,    setBankIds]    = useState([]);
  const [history,    setHistory]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [preview,    setPreview]    = useState(null);
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
        setBankIds(bankSnap.docs.map(d => d.id));
        setHistory(histSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const computeUsedIds = useCallback((hist, repeatThreshold) => {
    const usedMap = {};
    hist.forEach(day => {
      if (!day.questionIds) return;
      const passRate = day.passRate ?? 100;
      if (passRate >= (repeatThreshold ?? 50)) {
        day.questionIds.forEach(id => { usedMap[id] = (usedMap[id] || 0) + 1; });
      }
    });
    return usedMap;
  }, []);

  const generatePreview = () => {
    if (!config || !bankIds.length) return;
    const today = todayKey();
    const alreadyScheduled = history.find(h => h.date === today);
    if (alreadyScheduled) { toast('Today already has a scheduled set!', 'warning'); setPreview({ date: today, questionIds: alreadyScheduled.questionIds, alreadyExists: true }); return; }
    const usedMap  = computeUsedIds(history, config.repeatThreshold ?? 50);
    const eligible = bankIds.filter(id => !usedMap[id]);
    let pool = eligible.length >= (config.questionCount || 30) ? eligible : bankIds;
    const shuffled = seededShuffle(pool, dateSeed(today));
    const selected = shuffled.slice(0, config.questionCount || 30);
    setPreview({ date: today, questionIds: selected, alreadyExists: false, isReset: eligible.length < (config.questionCount || 30) });
  };

  const publishToday = async () => {
    if (!preview || preview.alreadyExists) return;
    setGenerating(true);
    try {
      await setDoc(doc(db, 'dailyMockSchedule', preview.date), { date: preview.date, questionIds: preview.questionIds, questionCount: preview.questionIds.length, publishedAt: serverTimestamp(), passRate: null, attemptCount: 0, isReset: preview.isReset || false });
      toast(`Daily Mock published for ${preview.date} ✅`, 'success');
      setPreview(null);
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        {[{ icon: '📦', label: 'Bank Size', value: bankIds.length, color: '#8B5CF6' }, { icon: '✅', label: 'Questions Used', value: usedCount, color: 'var(--teal)' }, { icon: '🆕', label: 'Fresh Questions', value: freshCount, color: '#10B981' }, { icon: '📅', label: 'Days Scheduled', value: history.length, color: '#F59E0B' }].map(s => (
          <div key={s.label} style={{ ...S.card, textAlign: 'center', padding: '14px 12px' }}><div style={{ fontSize: 20 }}>{s.icon}</div><div style={{ fontWeight: 900, fontSize: 24, color: s.color, fontFamily: H }}>{s.value}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: F }}>{s.label}</div></div>
        ))}
      </div>
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6, fontFamily: H }}>📅 Today's Mock — {todayKey()}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6, fontFamily: F, fontWeight: 700 }}>Preview the question set the system will serve today. Publishing locks in today's set.{freshCount < (config?.questionCount || 30) && (<span style={{ color: '#F59E0B', fontWeight: 700 }}> ⚠️ Only {freshCount} fresh questions available — system will recycle from full bank.</span>)}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={generatePreview}>🔍 Preview Today's Set</button>
          {preview && !preview.alreadyExists && (<button className="btn btn-primary" onClick={publishToday} disabled={generating} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>{generating ? '📤 Publishing…' : "📤 Publish Today's Mock"}</button>)}
        </div>
        {preview && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: preview.alreadyExists ? 'rgba(245,158,11,0.08)' : 'rgba(139,92,246,0.08)', border: `1px solid ${preview.alreadyExists ? 'rgba(245,158,11,0.25)' : 'rgba(139,92,246,0.25)'}`, borderRadius: 10 }}>
            {preview.alreadyExists ? (<div style={{ fontSize: 13, color: '#F59E0B', fontWeight: 700, fontFamily: F }}>⚠️ Today's mock is already published with {preview.questionIds.length} questions.</div>) : (<div><div style={{ fontWeight: 700, fontSize: 13, color: '#8B5CF6', marginBottom: 6, fontFamily: F }}>✅ Preview: {preview.questionIds.length} questions selected{preview.isReset && <span style={{ marginLeft: 8, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>🔄 Cycle Reset</span>}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F }}>Question IDs: {preview.questionIds.slice(0, 5).join(', ')}{preview.questionIds.length > 5 ? ` … +${preview.questionIds.length - 5} more` : ''}</div></div>)}
          </div>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 12, fontFamily: H }}>📜 Schedule History</div>
      {history.length === 0 ? (<div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F }}>No history yet. Publish today's mock to start.</div>) : (
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Questions</th><th>Attempts</th><th>Pass Rate</th><th>Status</th></tr></thead><tbody>{history.map(h => { const passRate = h.passRate != null ? h.passRate : null; const threshold = config?.repeatThreshold ?? 50; const flagRepeat = passRate !== null && passRate < threshold; return (<tr key={h.id}><td style={{ fontWeight: 700 }}>{h.date}</td><td><span className="badge badge-teal">{h.questionCount || h.questionIds?.length || '—'}</span></td><td>{h.attemptCount ?? '—'}</td><td>{passRate !== null ? (<span style={{ fontWeight: 700, color: flagRepeat ? '#EF4444' : '#10B981' }}>{passRate}% {flagRepeat ? '🔁' : '✅'}</span>) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Pending</span>}</td><td>{h.isReset ? <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>🔄 Reset</span> : <span className="badge badge-green">✅ Active</span>}</td></tr>); })}</tbody></table></div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EDIT QUESTION MODAL
// ═════════════════════════════════════════════════════════════════════════════
function EditQuestionModal({ question, schools, onClose, onSaved, toast }) {
  const [form, setForm] = useState({ schoolId: question.schoolId || '', year: question.year || '2024', subject: question.subject || '', questionText: question.questionText || '', options: question.options || { A:'', B:'', C:'', D:'' }, correctAnswer: question.correctAnswer || 'A', explanation: question.explanation || '', diagramUrl: question.diagramUrl || '', inDailyBank: question.inDailyBank || false });
  const [saving, setSaving] = useState(false);
  const [adminSubjects, setAdminSubjects] = useState([]);

  useEffect(() => {
    getDocs(query(collection(db, 'entranceExamSubjects'), orderBy('order', 'asc')))
      .catch(() => getDocs(collection(db, 'entranceExamSubjects')))
      .then(snap => setAdminSubjects(snap.docs.map(d => d.data().name).filter(Boolean)))
      .catch(() => {});
  }, []);

  const subjectOptions = adminSubjects.length > 0
    ? [...new Set([...adminSubjects, ...SUBJECTS])]
    : SUBJECTS;

  const handleSave = async () => {
    setSaving(true);
    try {
      const school = schools.find(s => s.id === form.schoolId);
      await updateDoc(doc(db, 'entranceExamQuestions', question.id), { schoolId: form.schoolId || null, schoolName: school?.name || question.schoolName, year: form.year, subject: form.subject, questionText: form.questionText, options: form.options, correctAnswer: form.correctAnswer, explanation: form.explanation, diagramUrl: form.diagramUrl, questionType: form.diagramUrl ? 'diagram' : 'text', inDailyBank: form.inDailyBank, updatedAt: serverTimestamp() });
      onSaved();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="✏️ Edit Question" onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ ...S.label, fontSize: 11 }}>🏫 School</label>
            <select className="form-input form-select" value={form.schoolId} onChange={e => setForm(p => ({ ...p, schoolId: e.target.value }))} style={{ width: '100%' }}>
              <option value="">None</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.shortName || s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...S.label, fontSize: 11 }}>📅 Year</label>
            <select className="form-input form-select" value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} style={{ width: '100%' }}>
              {ENTRANCE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...S.label, fontSize: 11 }}>📚 Subject</label>
            <select className="form-input form-select" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} style={{ width: '100%' }}>
              <option value="">Select subject…</option>
              {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div><label style={{ ...S.label, fontSize: 11 }}>🖼️ Diagram URL (optional)</label><input className="form-input" value={form.diagramUrl} onChange={e => setForm(p => ({ ...p, diagramUrl: e.target.value }))} placeholder="https://…" style={{ width: '100%', boxSizing: 'border-box' }} /></div>
        <div><label style={{ ...S.label, fontSize: 11 }}>📝 Question Text</label><textarea className="form-input" rows={3} value={form.questionText} onChange={e => setForm(p => ({ ...p, questionText: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
        {['A','B','C','D'].map(letter => (<div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div onClick={() => setForm(p => ({ ...p, correctAnswer: letter }))} style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: form.correctAnswer === letter ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)', border: `2px solid ${form.correctAnswer === letter ? 'var(--green)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: form.correctAnswer === letter ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer' }}>{letter}</div><input className="form-input" value={form.options[letter]||''} onChange={e => setForm(p => ({ ...p, options: { ...p.options, [letter]: e.target.value } }))} style={{ flex: 1 }} />{form.correctAnswer === letter && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✅ Correct</span>}</div>))}
        <div><label style={{ ...S.label, fontSize: 11 }}>💡 Explanation (optional)</label><textarea className="form-input" rows={2} value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(139,92,246,0.06)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)' }}>
          <button onClick={() => setForm(p => ({ ...p, inDailyBank: !p.inDailyBank }))} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', background: form.inDailyBank ? '#8B5CF6' : 'var(--bg-tertiary)', transition: 'background .2s' }}><span style={{ position: 'absolute', top: 2, left: form.inDailyBank ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', display: 'block' }} /></button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, fontFamily: F }}>📅 Include in Daily Mock Bank</span>
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
          <h3 style={{ margin: 0, fontFamily: H, fontWeight: 900, color: 'var(--text-primary)', fontSize: 'clamp(1.1rem,2vw,1.5rem)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return (<div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F }}><div className="spinner" style={{ margin: '0 auto 12px' }} />Loading…</div>);
}

function FormatGuide({ bulk }) {
  return (
    <div style={{ padding: '14px 16px', marginBottom: 16, background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#60A5FA', marginBottom: 6, fontFamily: F }}>📋 Format Guide{bulk ? ' — separate questions with a blank line' : ''}</div>
      <pre style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{`What is the functional unit of the kidney?\nA. Nephron\nB. Neuron\nC. Nodule\nD. Nucleus\n*A\nExplanation: The nephron filters blood...${bulk ? `\n\nhttps://i.imgur.com/abc123.png\nIn the diagram, part labeled A is ___\nA. Bowman capsule\nB. Nephron\nC. Pyramid\nD. Calyx\n*C` : ''}`}</pre>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>✅ Answer formats accepted: <code>*A</code> · <code>Answer: A</code> · <code>(A)</code></div>
    </div>
  );
}

function ParseError({ msg }) {
  return (<div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}><div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 4, fontFamily: F }}>❌ Parse Error</div><pre style={{ margin: 0, fontSize: 12, color: '#EF4444', whiteSpace: 'pre-wrap' }}>{msg}</pre></div>);
}

function QuestionPreview({ q, children }) {
  return (
    <div style={{ ...S.card, border: '1.5px solid rgba(13,148,136,0.4)', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 12, fontFamily: F }}>✅ Parsed — {q.questionType === 'diagram' ? '🖼️ Diagram' : '📝 Text'} Question</div>
      {q.diagramUrl && (<div style={{ marginBottom: 12 }}><img src={q.diagramUrl} alt="Diagram" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} onError={e => { e.target.style.display = 'none'; }} /></div>)}
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10, fontFamily: F }}>{q.questionText}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {Object.entries(q.options).map(([letter, text]) => (<div key={letter} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: q.correctAnswer === letter ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)', border: `1.5px solid ${q.correctAnswer === letter ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`, color: q.correctAnswer === letter ? 'var(--green)' : 'var(--text-secondary)', fontWeight: q.correctAnswer === letter ? 700 : 400, fontFamily: F }}>{letter}. {text} {q.correctAnswer === letter && '✅'}</div>))}
      </div>
      {q.explanation && (<div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: F, fontWeight: 700 }}>💡 <strong>Explanation:</strong> {q.explanation}</div>)}
      {children}
    </div>
  );
}

function SinglePasteUpload({ onSave, saving }) {
  const [rawText,  setRawText]  = useState('');
  const [parsed,   setParsed]   = useState(null);
  const [parseErr, setParseErr] = useState('');
  const handleParse = () => { setParseErr(''); const { results, errors } = parseEntranceQuestions(rawText); if (errors.length) { setParseErr(errors.join('\n')); setParsed(null); return; } if (!results.length) { setParseErr('No question detected.'); return; } setParsed(results[0]); };
  return (<><FormatGuide /><div style={{ ...S.card, marginBottom: 16 }}><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10, fontFamily: H }}>📝 Paste Question</div><textarea className="form-input" rows={12} placeholder="Paste your question here…" value={rawText} onChange={e => { setRawText(e.target.value); setParsed(null); setParseErr(''); }} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }} /><button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview</button></div>{parseErr && <ParseError msg={parseErr} />}{parsed && (<QuestionPreview q={parsed}><div style={{ display: 'flex', gap: 10, marginTop: 14 }}><button className="btn btn-primary" onClick={() => { onSave(parsed); setParsed(null); setRawText(''); }} disabled={saving} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>{saving ? '📅 Saving…' : '📅 Add to Daily Bank'}</button><button className="btn btn-ghost" onClick={() => { setParsed(null); setRawText(''); }}>🗑️ Discard</button></div></QuestionPreview>)}</>);
}

function SliderWithPresets({ value, min, max, step, presets, onChange, displayFn, color }) {
  return (<><div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: color }} /><div style={{ minWidth: 58, textAlign: 'center', fontWeight: 800, fontSize: 22, color, background: 'rgba(0,0,0,0.08)', borderRadius: 10, padding: '6px 10px', fontFamily: H }}>{displayFn(value)}</div></div><div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>{presets.map(p => { const v = typeof p === 'object' ? p.v : p; const l = typeof p === 'object' ? p.l : String(p); return (<button key={v} onClick={() => onChange(v)} style={{ padding: '5px 14px', borderRadius: 20, border: '1.5px solid', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12, transition: 'all .15s', borderColor: value === v ? color : 'var(--border)', background: value === v ? `${color}22` : 'var(--bg-tertiary)', color: value === v ? color : 'var(--text-muted)' }}>{l}</button>); })}</div></>);
}
