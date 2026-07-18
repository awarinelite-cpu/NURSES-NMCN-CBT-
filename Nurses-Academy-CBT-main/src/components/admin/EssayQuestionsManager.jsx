// src/components/admin/EssayQuestionsManager.jsx
//
// Route: /admin/essay-questions
//
// Admin adds essay-exam papers two ways:
//   1. Paste — paste one bulk "COMPLETE_ESSAY_SET_..." formatted paper
//   2. Upload — a .csv (structured or single-column) or .txt file, which
//      can contain MULTIPLE papers in one go (see utils/essayCsvImport.js
//      for the supported layouts)
// Both paths feed into the same preview → Save All flow. Students only
// ever see the parsed questions — no answers/marking guide is stored.
//
// FIRESTORE — essayQuestionSets collection:
//   {
//     specialtyId, specialtyLabel, setLabel, title, institution,
//     courseCode, courseTitle, examDate, timeAllowed, instruction,
//     questions: [{ number, stem, parts:[{label,text,marks}] }],
//     active, createdAt, updatedAt
//   }

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, getDocs, deleteDoc, updateDoc,
  doc, addDoc, serverTimestamp, orderBy, query, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { SPECIALTIES } from '../exam/MockExamPage';
import { parseEssayQuestions } from '../../utils/essayQuestionParser';
import { readEssayQuestionFile } from '../../utils/essayCsvImport';
import { useToast } from '../shared/Toast';

const H = "'Arial Black', Arial, sans-serif";

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 18, ...style,
    }}>
      {children}
    </div>
  );
}

function SetPreview({ result }) {
  const { meta, questions, warnings } = result;
  return (
    <div>
      {warnings.length > 0 && (
        <div style={{
          background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.30)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#D97706',
        }}>
          {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      )}
      {questions.length === 0 ? (
        <div style={{ color: '#DC2626', fontSize: 13 }}>
          No questions detected in this set.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            <strong>{meta.title || '(no title detected)'}</strong><br />
            {meta.institution} · {meta.courseCode} {meta.courseTitle && `- ${meta.courseTitle}`}<br />
            {meta.examDate} · {meta.timeAllowed}<br />
            {meta.instruction}
          </div>
          {questions.map(q => (
            <div key={q.number} style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-primary)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Q{q.number}.</div>
              {q.stem && <div style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>{q.stem}</div>}
              {q.table && q.table.rows && q.table.rows.length > 0 && (
                <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0, marginBottom: 8, boxSizing: 'border-box' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr>
                        {q.table.headers.map((h, i) => (
                          <th key={i} style={{ border: '1px solid var(--border)', padding: '4px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {q.table.rows.map((row, ri) => (
                        <tr key={ri}>
                          {(row.cells || []).map((cell, ci) => (
                            <td key={ci} style={{ border: '1px solid var(--border)', padding: '4px 6px', whiteSpace: 'nowrap' }}>{cell || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {q.parts.map((p, i) => (
                <div key={i} style={{ marginLeft: 14, marginBottom: 2 }}>
                  {p.label && <strong>{p.label}. </strong>}{p.text} {p.marks && <em style={{ color: 'var(--text-muted)' }}>({p.marks})</em>}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function EssayQuestionsManager() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [sets,       setSets]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [selectedIds,  setSelectedIds]  = useState(() => new Set());
  const [bulkBusy,      setBulkBusy]      = useState(false);
  const [bulkSpecialty, setBulkSpecialty] = useState(SPECIALTIES[0].id);

  const [editingSet, setEditingSet] = useState(null);   // deep copy of the set being edited
  const [savingEdit, setSavingEdit] = useState(false);

  const [showForm,    setShowForm]    = useState(false);
  const [specialtyId,  setSpecialtyId] = useState(SPECIALTIES[0].id);
  const [rawText,      setRawText]     = useState('');
  const [previewSets,  setPreviewSets] = useState(null);   // array of {meta,questions,warnings}
  const [fileName,     setFileName]    = useState('');
  const [fileLoading,  setFileLoading] = useState(false);
  const [fileWarnings, setFileWarnings] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'essayQuestionSets'), orderBy('createdAt', 'desc')));
      setSets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast?.(e.message || 'Failed to load essay sets', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const resetPreview = () => {
    setPreviewSets(null);
    setFileName('');
    setFileWarnings([]);
  };

  const handlePreviewPaste = () => {
    setFileName('');
    setFileWarnings([]);
    setPreviewSets([parseEssayQuestions(rawText)]);
  };

  const handleFilePicked = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileLoading(true);
    setRawText('');
    setFileName(file.name);
    try {
      const { sets: parsedSets, fileWarnings: fw } = await readEssayQuestionFile(file);
      setPreviewSets(parsedSets);
      setFileWarnings(fw);
      if (parsedSets.length > 1) {
        toast?.(`Found ${parsedSets.length} papers in this file`, 'success');
      }
    } catch (err) {
      toast?.(err.message || 'Failed to read file', 'error');
      setPreviewSets(null);
    } finally {
      setFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalQuestions = (previewSets || []).reduce((sum, s) => sum + s.questions.length, 0);
  const validSetCount   = (previewSets || []).filter(s => s.questions.length > 0).length;

  const handleSaveAll = async () => {
    if (!previewSets || validSetCount === 0) {
      toast?.('Nothing to save — preview it first.', 'error');
      return;
    }
    const sp = SPECIALTIES.find(s => s.id === specialtyId);
    setSaving(true);
    try {
      const toSave = previewSets.filter(s => s.questions.length > 0);
      await Promise.all(toSave.map(result => addDoc(collection(db, 'essayQuestionSets'), {
        specialtyId,
        specialtyLabel: sp?.label || specialtyId,
        ...result.meta,
        questions: result.questions,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })));
      toast?.(`Saved ${toSave.length} essay set${toSave.length === 1 ? '' : 's'}`, 'success');
      setRawText('');
      resetPreview();
      setShowForm(false);
      loadData();
    } catch (e) {
      toast?.(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (set) => {
    try {
      await updateDoc(doc(db, 'essayQuestionSets', set.id), { active: !set.active });
      setSets(prev => prev.map(s => s.id === set.id ? { ...s, active: !s.active } : s));
    } catch (e) {
      toast?.(e.message || 'Failed to update', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this essay question set? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'essayQuestionSets', id));
      setSets(prev => prev.filter(s => s.id !== id));
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      toast?.('Deleted', 'success');
    } catch (e) {
      toast?.(e.message || 'Failed to delete', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Bulk selection ──────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allSelected = sets.length > 0 && selectedIds.size === sets.length;
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(sets.map(s => s.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Bulk delete ──────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} essay question set${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, 'essayQuestionSets', id)));
      await batch.commit();
      setSets(prev => prev.filter(s => !selectedIds.has(s.id)));
      clearSelection();
      toast?.(`Deleted ${ids.length} set${ids.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      toast?.(e.message || 'Failed to delete selected sets', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Bulk edit: active / hidden ──────────────────────────────────────────
  const handleBulkSetActive = async (active) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const batch = writeBatch(db);
      ids.forEach(id => batch.update(doc(db, 'essayQuestionSets', id), { active, updatedAt: serverTimestamp() }));
      await batch.commit();
      setSets(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, active } : s));
      toast?.(`${active ? 'Activated' : 'Hidden'} ${ids.length} set${ids.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      toast?.(e.message || 'Failed to update selected sets', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Bulk edit: move to a different specialty ─────────────────────────────
  const handleBulkMoveSpecialty = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const sp = SPECIALTIES.find(s => s.id === bulkSpecialty);
    if (!window.confirm(`Move ${ids.length} set${ids.length === 1 ? '' : 's'} to "${sp?.label || bulkSpecialty}"?`)) return;
    setBulkBusy(true);
    try {
      const batch = writeBatch(db);
      ids.forEach(id => batch.update(doc(db, 'essayQuestionSets', id), {
        specialtyId: bulkSpecialty,
        specialtyLabel: sp?.label || bulkSpecialty,
        updatedAt: serverTimestamp(),
      }));
      await batch.commit();
      setSets(prev => prev.map(s => selectedIds.has(s.id)
        ? { ...s, specialtyId: bulkSpecialty, specialtyLabel: sp?.label || bulkSpecialty }
        : s));
      toast?.(`Moved ${ids.length} set${ids.length === 1 ? '' : 's'} to ${sp?.label || bulkSpecialty}`, 'success');
    } catch (e) {
      toast?.(e.message || 'Failed to move selected sets', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Edit a single set's content ──────────────────────────────────────────
  const startEdit = (set) => setEditingSet(JSON.parse(JSON.stringify(set)));
  const cancelEdit = () => setEditingSet(null);

  const setMetaField = (field, value) =>
    setEditingSet(prev => ({ ...prev, [field]: value }));

  const setQuestionField = (qi, field, value) =>
    setEditingSet(prev => {
      const questions = [...prev.questions];
      questions[qi] = { ...questions[qi], [field]: value };
      return { ...prev, questions };
    });

  const addQuestion = () =>
    setEditingSet(prev => {
      const questions = [...(prev.questions || []), { number: (prev.questions?.length || 0) + 1, stem: '', parts: [] }];
      return { ...prev, questions };
    });

  const removeQuestion = (qi) =>
    setEditingSet(prev => {
      const questions = (prev.questions || [])
        .filter((_, idx) => idx !== qi)
        .map((q, idx) => ({ ...q, number: idx + 1 }));
      return { ...prev, questions };
    });

  const setPartField = (qi, pi, field, value) =>
    setEditingSet(prev => {
      const questions = [...prev.questions];
      const parts = [...(questions[qi].parts || [])];
      parts[pi] = { ...parts[pi], [field]: value };
      questions[qi] = { ...questions[qi], parts };
      return { ...prev, questions };
    });

  const addPart = (qi) =>
    setEditingSet(prev => {
      const questions = [...prev.questions];
      const parts = [...(questions[qi].parts || []), { label: '', text: '', marks: '' }];
      questions[qi] = { ...questions[qi], parts };
      return { ...prev, questions };
    });

  const removePart = (qi, pi) =>
    setEditingSet(prev => {
      const questions = [...prev.questions];
      const parts = (questions[qi].parts || []).filter((_, idx) => idx !== pi);
      questions[qi] = { ...questions[qi], parts };
      return { ...prev, questions };
    });

  // Optional embedded table (e.g. a partograph) on a question
  const setTableHeader = (qi, hi, value) =>
    setEditingSet(prev => {
      const questions = [...prev.questions];
      const headers = [...(questions[qi].table?.headers || [])];
      headers[hi] = value;
      questions[qi] = { ...questions[qi], table: { ...questions[qi].table, headers } };
      return { ...prev, questions };
    });

  const setTableCell = (qi, ri, ci, value) =>
    setEditingSet(prev => {
      const questions = [...prev.questions];
      const rows = [...(questions[qi].table?.rows || [])];
      const cells = [...(rows[ri].cells || [])];
      cells[ci] = value;
      rows[ri] = { ...rows[ri], cells };
      questions[qi] = { ...questions[qi], table: { ...questions[qi].table, rows } };
      return { ...prev, questions };
    });

  const addTableRow = (qi) =>
    setEditingSet(prev => {
      const questions = [...prev.questions];
      const headerCount = questions[qi].table?.headers?.length || 0;
      const rows = [...(questions[qi].table?.rows || []), { cells: Array(headerCount).fill('') }];
      questions[qi] = { ...questions[qi], table: { ...questions[qi].table, rows } };
      return { ...prev, questions };
    });

  const removeTableRow = (qi, ri) =>
    setEditingSet(prev => {
      const questions = [...prev.questions];
      const rows = (questions[qi].table?.rows || []).filter((_, idx) => idx !== ri);
      questions[qi] = { ...questions[qi], table: { ...questions[qi].table, rows } };
      return { ...prev, questions };
    });

  const handleSaveEdit = async () => {
    if (!editingSet) return;
    setSavingEdit(true);
    try {
      const sp = SPECIALTIES.find(s => s.id === editingSet.specialtyId);
      const payload = {
        specialtyId:     editingSet.specialtyId,
        specialtyLabel:  sp?.label || editingSet.specialtyLabel,
        title:           editingSet.title || '',
        institution:     editingSet.institution || '',
        courseCode:      editingSet.courseCode || '',
        courseTitle:     editingSet.courseTitle || '',
        examDate:        editingSet.examDate || '',
        timeAllowed:     editingSet.timeAllowed || '',
        instruction:     editingSet.instruction || '',
        questions:       editingSet.questions || [],
        updatedAt:       serverTimestamp(),
      };
      await updateDoc(doc(db, 'essayQuestionSets', editingSet.id), payload);
      setSets(prev => prev.map(s => s.id === editingSet.id ? { ...s, ...payload } : s));
      toast?.('Changes saved', 'success');
      setEditingSet(null);
    } catch (e) {
      toast?.(e.message || 'Failed to save changes', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div style={{ padding: '24px 16px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontFamily: H, fontSize: 20, color: 'var(--text-primary)' }}>
          📜 Essay Questions
        </h2>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(v => !v); resetPreview(); setRawText(''); }}
          style={{ padding: '10px 18px', fontWeight: 700, borderRadius: 10 }}
        >
          {showForm ? 'Close' : '➕ Add Essay Set'}
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Specialty (applies to everything saved below)
          </label>
          <select
            value={specialtyId}
            onChange={e => setSpecialtyId(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10, marginBottom: 18,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 14,
            }}
          >
            {SPECIALTIES.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.icon} {sp.label}</option>
            ))}
          </select>

          {/* ── Upload CSV/TXT ── */}
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Upload a CSV or TXT file
          </label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            A .txt (or single-column .csv) can hold several papers — start each new one with a line beginning "COMPLETE_ESSAY_SET".
            A structured .csv uses columns <code>row_type, number, label, text, marks</code> (row_type: meta / question / part) and can hold multiple papers too — one addDoc per <code>meta,,title,...</code> row.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFilePicked}
              style={{ display: 'none' }}
              id="essay-file-input"
            />
            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={fileLoading}
              style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 700 }}
            >
              {fileLoading ? 'Reading…' : '📁 Choose File'}
            </button>
            {fileName && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fileName}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 18px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>OR PASTE ONE PAPER</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* ── Paste text ── */}
          <textarea
            value={rawText}
            onChange={e => { setRawText(e.target.value); setFileName(''); }}
            placeholder={'Paste the "COMPLETE_ESSAY_SET_..." formatted paper here — header lines, then Q1., Q2., ... each with A. B. C. sub-parts.'}
            rows={10}
            style={{
              width: '100%', padding: 12, borderRadius: 10, marginBottom: 12,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={handlePreviewPaste} disabled={!rawText.trim()}
              style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 700 }}>
              🔍 Preview Parse
            </button>
            {previewSets && validSetCount > 0 && (
              <button className="btn btn-primary" onClick={handleSaveAll} disabled={saving}
                style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 700 }}>
                {saving
                  ? 'Saving…'
                  : `💾 Save ${validSetCount > 1 ? `${validSetCount} sets` : 'set'} (${totalQuestions} questions)`}
              </button>
            )}
          </div>

          {previewSets && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              {fileWarnings.length > 0 && (
                <div style={{
                  background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.30)',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#DC2626',
                }}>
                  {fileWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
              )}
              {previewSets.length > 1 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                  {previewSets.length} papers detected in this file:
                </div>
              )}
              {previewSets.map((result, i) => (
                <div key={i} style={{ marginBottom: previewSets.length > 1 ? 20 : 0 }}>
                  {previewSets.length > 1 && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Paper {i + 1} of {previewSets.length}
                    </div>
                  )}
                  <SetPreview result={result} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
      ) : sets.length === 0 ? (
        <Card style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          No essay question sets yet. Add one above.
        </Card>
      ) : (
        <>
          {/* ── Select-all + bulk action bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ width: 16, height: 16 }} />
              Select all ({sets.length})
            </label>

            {selectedIds.size > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '8px 10px', flex: '1 1 auto',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedIds.size} selected
                </span>

                <button
                  onClick={() => handleBulkSetActive(true)}
                  disabled={bulkBusy}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid rgba(22,163,74,0.30)', color: '#16A34A', background: 'rgba(22,163,74,0.10)', cursor: 'pointer' }}
                >
                  ✅ Activate
                </button>
                <button
                  onClick={() => handleBulkSetActive(false)}
                  disabled={bulkBusy}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}
                >
                  🙈 Hide
                </button>

                <select
                  value={bulkSpecialty}
                  onChange={e => setBulkSpecialty(e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: 8, fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  {SPECIALTIES.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.icon} {sp.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkMoveSpecialty}
                  disabled={bulkBusy}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}
                >
                  ↪️ Move
                </button>

                <button
                  onClick={handleBulkDelete}
                  disabled={bulkBusy}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid rgba(220,38,38,0.30)', color: '#DC2626', background: 'rgba(220,38,38,0.10)', cursor: 'pointer' }}
                >
                  {bulkBusy ? '…' : `🗑️ Delete ${selectedIds.size}`}
                </button>

                <button
                  onClick={clearSelection}
                  disabled={bulkBusy}
                  style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer' }}
                >
                  ✕ Clear
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sets.map(set => {
              const sp = SPECIALTIES.find(s => s.id === set.specialtyId);
              const isSelected = selectedIds.has(set.id);

              // ── Editing this set: show the full editor instead of the summary row ──
              if (editingSet && editingSet.id === set.id) {
                const inputStyle = {
                  width: '100%', padding: '8px 10px', borderRadius: 8, marginBottom: 10,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box',
                };
                const smallInputStyle = { ...inputStyle, marginBottom: 0 };

                return (
                  <Card key={set.id} style={{ border: '1px solid var(--accent, #0D9488)' }}>
                    <div style={{ fontFamily: H, fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 14 }}>
                      ✏️ Editing: {editingSet.title || editingSet.setLabel || 'Untitled Set'}
                    </div>

                    {/* ── Meta fields ── */}
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Specialty</label>
                    <select
                      value={editingSet.specialtyId}
                      onChange={e => setMetaField('specialtyId', e.target.value)}
                      style={inputStyle}
                    >
                      {SPECIALTIES.map(s => (
                        <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
                      ))}
                    </select>

                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Title</label>
                    <input value={editingSet.title || ''} onChange={e => setMetaField('title', e.target.value)} style={inputStyle} />

                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Institution</label>
                    <input value={editingSet.institution || ''} onChange={e => setMetaField('institution', e.target.value)} style={inputStyle} />

                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Course Code</label>
                        <input value={editingSet.courseCode || ''} onChange={e => setMetaField('courseCode', e.target.value)} style={inputStyle} />
                      </div>
                      <div style={{ flex: 2 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Course Title</label>
                        <input value={editingSet.courseTitle || ''} onChange={e => setMetaField('courseTitle', e.target.value)} style={inputStyle} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Exam Date</label>
                        <input value={editingSet.examDate || ''} onChange={e => setMetaField('examDate', e.target.value)} style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Time Allowed</label>
                        <input value={editingSet.timeAllowed || ''} onChange={e => setMetaField('timeAllowed', e.target.value)} style={inputStyle} />
                      </div>
                    </div>

                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Instruction</label>
                    <input value={editingSet.instruction || ''} onChange={e => setMetaField('instruction', e.target.value)} style={inputStyle} />

                    <div style={{ height: 1, background: 'var(--border)', margin: '6px 0 16px' }} />

                    {/* ── Questions ── */}
                    {(editingSet.questions || []).map((q, qi) => (
                      <div key={qi} style={{
                        border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Question {q.number}</span>
                          <button
                            onClick={() => removeQuestion(qi)}
                            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid rgba(220,38,38,0.30)', color: '#DC2626', background: 'transparent', cursor: 'pointer' }}
                          >
                            Remove Question
                          </button>
                        </div>

                        <textarea
                          value={q.stem || ''}
                          onChange={e => setQuestionField(qi, 'stem', e.target.value)}
                          rows={3}
                          placeholder="Question stem / scenario text"
                          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                        />

                        {/* Embedded table (e.g. a partograph) */}
                        {q.table && q.table.headers && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Table</div>
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <thead>
                                  <tr>
                                    {q.table.headers.map((h, hi) => (
                                      <th key={hi} style={{ padding: 4 }}>
                                        <input
                                          value={h}
                                          onChange={e => setTableHeader(qi, hi, e.target.value)}
                                          style={{ ...smallInputStyle, minWidth: 90, fontWeight: 700 }}
                                        />
                                      </th>
                                    ))}
                                    <th />
                                  </tr>
                                </thead>
                                <tbody>
                                  {(q.table.rows || []).map((row, ri) => (
                                    <tr key={ri}>
                                      {(row.cells || []).map((cell, ci) => (
                                        <td key={ci} style={{ padding: 4 }}>
                                          <input
                                            value={cell}
                                            onChange={e => setTableCell(qi, ri, ci, e.target.value)}
                                            style={{ ...smallInputStyle, minWidth: 90 }}
                                          />
                                        </td>
                                      ))}
                                      <td style={{ padding: 4 }}>
                                        <button
                                          onClick={() => removeTableRow(qi, ri)}
                                          style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, border: '1px solid rgba(220,38,38,0.30)', color: '#DC2626', background: 'transparent', cursor: 'pointer' }}
                                        >
                                          ✕
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <button
                              onClick={() => addTableRow(qi)}
                              style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}
                            >
                              + Add Row
                            </button>
                          </div>
                        )}

                        {/* Parts (A, B, C sub-questions) */}
                        {(q.parts || []).map((p, pi) => (
                          <div key={pi} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                            <input
                              value={p.label || ''}
                              onChange={e => setPartField(qi, pi, 'label', e.target.value)}
                              placeholder="A"
                              style={{ ...smallInputStyle, width: 40, flexShrink: 0 }}
                            />
                            <input
                              value={p.text || ''}
                              onChange={e => setPartField(qi, pi, 'text', e.target.value)}
                              placeholder="Part text"
                              style={{ ...smallInputStyle, flex: 1, minWidth: 0 }}
                            />
                            <input
                              value={p.marks || ''}
                              onChange={e => setPartField(qi, pi, 'marks', e.target.value)}
                              placeholder="Marks"
                              style={{ ...smallInputStyle, width: 80, flexShrink: 0 }}
                            />
                            <button
                              onClick={() => removePart(qi, pi)}
                              style={{ padding: '8px 10px', borderRadius: 8, fontSize: 12, border: '1px solid rgba(220,38,38,0.30)', color: '#DC2626', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addPart(qi)}
                          style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}
                        >
                          + Add Part
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={addQuestion}
                      style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', marginBottom: 16 }}
                    >
                      + Add Question
                    </button>

                    <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        style={{ padding: '10px 18px', borderRadius: 10, fontWeight: 700 }}
                      >
                        {savingEdit ? 'Saving…' : '💾 Save Changes'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        style={{ padding: '10px 18px', borderRadius: 10, fontWeight: 700, border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </Card>
                );
              }

              // ── Normal summary row ──
              return (
                <Card
                  key={set.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    border: isSelected ? '1px solid var(--accent, #0D9488)' : '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(set.id)}
                      style={{ width: 16, height: 16, flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {sp?.icon || '📜'} {set.title || set.setLabel || 'Untitled Set'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {set.specialtyLabel} · {set.courseCode} · {(set.questions || []).length} questions
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => startEdit(set)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: '1px solid var(--border)', color: 'var(--text-secondary)',
                        background: 'transparent', cursor: 'pointer',
                      }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => toggleActive(set)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: '1px solid var(--border)', cursor: 'pointer',
                        background: set.active ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)',
                        color: set.active ? '#16A34A' : '#DC2626',
                      }}
                    >
                      {set.active ? 'Active' : 'Hidden'}
                    </button>
                    <button
                      onClick={() => handleDelete(set.id)}
                      disabled={deletingId === set.id}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: '1px solid rgba(220,38,38,0.30)', color: '#DC2626',
                        background: 'transparent', cursor: 'pointer',
                      }}
                    >
                      {deletingId === set.id ? '…' : '🗑️ Delete'}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
