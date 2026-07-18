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
  doc, addDoc, serverTimestamp, orderBy, query,
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
      toast?.('Deleted', 'success');
    } catch (e) {
      toast?.(e.message || 'Failed to delete', 'error');
    } finally {
      setDeletingId(null);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sets.map(set => {
            const sp = SPECIALTIES.find(s => s.id === set.specialtyId);
            return (
              <Card key={set.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                    {sp?.icon || '📜'} {set.title || set.setLabel || 'Untitled Set'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {set.specialtyLabel} · {set.courseCode} · {(set.questions || []).length} questions
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
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
      )}
    </div>
  );
}
