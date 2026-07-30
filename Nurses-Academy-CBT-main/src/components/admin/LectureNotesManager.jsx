// src/components/admin/LectureNotesManager.jsx
// Route: /admin/lecture-notes
// Admin CRUD + CSV bulk upload for the Lecture Notes feature, and the entry
// point into the rich text LectureNoteEditor.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';
import {
  fetchAllNotesForAdmin, createNote, updateNote, deleteNote,
  bulkImportNotes, CSV_TEMPLATE_HEADER, CSV_TEMPLATE_EXAMPLE,
} from '../../utils/lectureNotesUtils';
import LectureNoteEditor from './LectureNoteEditor';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

const btn = (bg, color = '#fff') => ({
  padding: '9px 16px', borderRadius: 10, border: 'none', background: bg, color,
  fontFamily: H, fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
});
const ghostBtn = {
  padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-primary)', fontFamily: H, fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
};

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE_HEADER + CSV_TEMPLATE_EXAMPLE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'lecture-notes-template.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function LectureNotesManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [notes, setNotes] = useState(null);
  const [msg, setMsg] = useState(null);
  const [importing, setImporting] = useState(false);
  const [filterSpecialty, setFilterSpecialty] = useState('all');
  const [search, setSearch] = useState('');
  const [bulkSpecialty, setBulkSpecialty] = useState(NURSING_CATEGORIES[0].id);

  // Editor state: null = list view, 'new' = creating, or a note id = editing
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ specialty: NURSING_CATEGORIES[0].id, topic: '', contentHtml: '', published: true });
  const [saving, setSaving] = useState(false);

  const reload = async () => setNotes(await fetchAllNotesForAdmin());
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    if (!notes) return [];
    return notes.filter(n => {
      if (filterSpecialty !== 'all' && n.specialty !== filterSpecialty) return false;
      if (search && !n.topic?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [notes, filterSpecialty, search]);

  const startNew = () => {
    setForm({ specialty: NURSING_CATEGORIES[0].id, topic: '', contentHtml: '', published: true });
    setEditing('new');
  };

  const startEdit = (note) => {
    setForm({ specialty: note.specialty, topic: note.topic, contentHtml: note.contentHtml || '', published: note.published !== false });
    setEditing(note.id);
  };

  const cancelEdit = () => setEditing(null);

  const saveForm = async () => {
    if (!form.topic.trim()) { setMsg({ type: 'error', text: 'Give the note a topic/title.' }); return; }
    setSaving(true); setMsg(null);
    try {
      if (editing === 'new') {
        await createNote(form, user?.uid);
        setMsg({ type: 'success', text: '✅ Note created.' });
      } else {
        await updateNote(editing, form, user?.uid);
        setMsg({ type: 'success', text: '✅ Note updated.' });
      }
      setEditing(null);
      await reload();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setSaving(false); }
  };

  const removeNote = async (note) => {
    if (!window.confirm(`Delete "${note.topic}"? This cannot be undone.`)) return;
    await deleteNote(note.id);
    await reload();
  };

  const handleCsvSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true); setMsg(null);
    import('papaparse').then(({ default: Papa }) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase(),
        complete: async (results) => {
          try {
            const { written, skipped, total } = await bulkImportNotes(results.data || [], user?.uid, { defaultSpecialty: bulkSpecialty });
            const skipMsg = skipped.length
              ? ` ${skipped.length} row(s) skipped: ${skipped.slice(0, 4).map(s => `row ${s.row} (${s.reason})`).join(', ')}${skipped.length > 4 ? '…' : ''}`
              : '';
            setMsg({ type: skipped.length ? 'warn' : 'success', text: `✅ Imported ${written}/${total} notes.${skipMsg}` });
            await reload();
          } catch (err) {
            setMsg({ type: 'error', text: err.message });
          } finally {
            setImporting(false);
          }
        },
        error: (err) => { setMsg({ type: 'error', text: 'CSV parse error: ' + err.message }); setImporting(false); },
      });
    });
  };

  // ── Editor view ────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 100px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={cancelEdit} style={ghostBtn}>← Back</button>
          <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.05rem,4vw,1.4rem)', color: 'var(--text-primary)', margin: 0 }}>
            {editing === 'new' ? '➕ New Lecture Note' : '✏️ Edit Lecture Note'}
          </h1>
        </div>

        {msg && (
          <div style={{ marginBottom: 16, borderRadius: 10, padding: '10px 14px', fontFamily: F, fontSize: 13, background: msg.type === 'error' ? '#EF444418' : '#0D948818', color: msg.type === 'error' ? '#EF4444' : '#0D9488', border: `1px solid ${msg.type === 'error' ? '#EF444455' : '#0D948855'}` }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 220px' }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>SPECIALTY</div>
            <select
              value={form.specialty}
              onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
              style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontFamily: F, fontSize: 14 }}
            >
              {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '2 1 260px' }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>TOPIC / TITLE</div>
            <input
              value={form.topic}
              onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
              placeholder="e.g. Heart Failure Management"
              style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontFamily: F, fontSize: 14 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: F, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} />
              Published (visible to students)
            </label>
          </div>
        </div>

        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>NOTE CONTENT</div>
        <LectureNoteEditor
          value={form.contentHtml}
          onChange={html => setForm(f => ({ ...f, contentHtml: html }))}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={saveForm} disabled={saving} style={btn('#0D9488')}>{saving ? 'Saving…' : '💾 Save Note'}</button>
          <button onClick={cancelEdit} style={ghostBtn}>Cancel</button>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/admin')} style={ghostBtn}>← Admin</button>
        <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,4vw,1.6rem)', color: 'var(--text-primary)', margin: 0, flex: 1 }}>
          📚 Lecture Notes
        </h1>
        <button onClick={startNew} style={btn('#0D9488')}>➕ New Note</button>
        <select
          value={bulkSpecialty}
          onChange={e => setBulkSpecialty(e.target.value)}
          title="Used for CSVs that don't have their own specialty column, and as a fallback for unrecognized ones"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-primary)', fontFamily: F, fontSize: 12.5 }}
        >
          {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button onClick={() => fileInputRef.current?.click()} disabled={importing} style={btn('#2563EB')}>
          {importing ? 'Importing…' : '📤 Bulk Upload CSV'}
        </button>
        <button onClick={downloadCsvTemplate} style={ghostBtn}>⬇ CSV Template</button>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvSelected} />
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, fontFamily: F, fontSize: 12.5, color: 'var(--text-muted)' }}>
        Two CSV layouts are supported. <b>Simple:</b> columns <b>specialty, topic, content</b> — one row per note. <b>Course export:</b> columns <b>Unit, Section Title, Subtopic / Concept, Detailed Content / Description</b> — rows sharing a Section Title are merged into one note, with each subtopic as its own heading. Course-export files have no specialty column, so pick one from the dropdown above before uploading — it applies to the whole file. Content can be plain text (blank lines = new paragraph) or pasted HTML. Add images afterward by opening a note and long-pressing inside the editor.
      </div>

      {msg && (
        <div style={{ marginBottom: 16, borderRadius: 10, padding: '10px 14px', fontFamily: F, fontSize: 13, background: msg.type === 'error' ? '#EF444418' : '#0D948818', color: msg.type === 'error' ? '#EF4444' : '#0D9488', border: `1px solid ${msg.type === 'error' ? '#EF444455' : '#0D948855'}` }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterSpecialty}
          onChange={e => setFilterSpecialty(e.target.value)}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-primary)', fontFamily: F, fontSize: 13 }}
        >
          <option value="all">All specialties</option>
          {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search topic…"
          style={{ flex: 1, minWidth: 160, background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '9px 12px', color: 'var(--text-primary)', fontFamily: F, fontSize: 13 }}
        />
      </div>

      {notes === null && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F }}>Loading…</div>}
      {notes && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F, fontSize: 14 }}>No notes match.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(n => {
          const cat = NURSING_CATEGORIES.find(c => c.id === n.specialty);
          return (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
              <span style={{ fontSize: 18 }}>{cat?.icon || '📄'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.topic}
                </div>
                <div style={{ fontFamily: F, fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {cat?.shortLabel || n.specialty}{n.published === false ? ' · draft' : ''}
                </div>
              </div>
              <button onClick={() => startEdit(n)} style={ghostBtn}>Edit</button>
              <button onClick={() => removeNote(n)} style={{ ...ghostBtn, border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444' }}>Delete</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
