// src/components/admin/EssayQuestionsManager.jsx
//
// Route: /admin/essay-questions
//
// Admin pastes a bulk essay-exam paper (e.g. "COMPLETE_ESSAY_SET_48_..."
// format), picks the specialty it belongs to, previews the parsed
// questions, then saves. Students only ever see the parsed questions
// (via EssayQuestionsPage) — no answers/marking guide is stored at all.
//
// FIRESTORE — essayQuestionSets collection:
//   {
//     specialtyId, specialtyLabel, setLabel, title, institution,
//     courseCode, courseTitle, examDate, timeAllowed, instruction,
//     questions: [{ number, stem, parts:[{label,text,marks}] }],
//     active, createdAt, updatedAt
//   }

import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, deleteDoc, updateDoc,
  doc, addDoc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { SPECIALTIES } from '../exam/MockExamPage';
import { parseEssayQuestions } from '../../utils/essayQuestionParser';
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

export default function EssayQuestionsManager() {
  const { toast } = useToast();

  const [sets,     setSets]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [showForm,   setShowForm]   = useState(false);
  const [specialtyId, setSpecialtyId] = useState(SPECIALTIES[0].id);
  const [rawText,    setRawText]    = useState('');
  const [parsed,     setParsed]     = useState(null);

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

  const handlePreview = () => {
    const result = parseEssayQuestions(rawText);
    setParsed(result);
  };

  const handleSave = async () => {
    if (!parsed || parsed.questions.length === 0) {
      toast?.('Nothing to save — preview it first.', 'error');
      return;
    }
    const sp = SPECIALTIES.find(s => s.id === specialtyId);
    setSaving(true);
    try {
      await addDoc(collection(db, 'essayQuestionSets'), {
        specialtyId,
        specialtyLabel: sp?.label || specialtyId,
        ...parsed.meta,
        questions: parsed.questions,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast?.('Essay question set saved', 'success');
      setRawText('');
      setParsed(null);
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
          onClick={() => { setShowForm(v => !v); setParsed(null); }}
          style={{ padding: '10px 18px', fontWeight: 700, borderRadius: 10 }}
        >
          {showForm ? 'Close' : '➕ Add Essay Set'}
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Specialty
          </label>
          <select
            value={specialtyId}
            onChange={e => setSpecialtyId(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10, marginBottom: 14,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 14,
            }}
          >
            {SPECIALTIES.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.icon} {sp.label}</option>
            ))}
          </select>

          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
            Paste the full essay paper text
          </label>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder={'Paste the "COMPLETE_ESSAY_SET_..." formatted paper here — header lines, then Q1., Q2., ... each with A. B. C. sub-parts.'}
            rows={12}
            style={{
              width: '100%', padding: 12, borderRadius: 10, marginBottom: 12,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button className="btn btn-secondary" onClick={handlePreview} disabled={!rawText.trim()}
              style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 700 }}>
              🔍 Preview Parse
            </button>
            {parsed && parsed.questions.length > 0 && (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}
                style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 700 }}>
                {saving ? 'Saving…' : `💾 Save (${parsed.questions.length} questions)`}
              </button>
            )}
          </div>

          {parsed && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              {parsed.warnings.length > 0 && (
                <div style={{
                  background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.30)',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#D97706',
                }}>
                  {parsed.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
              )}
              {parsed.questions.length === 0 ? (
                <div style={{ color: '#DC2626', fontSize: 13 }}>
                  No questions detected. Make sure each question starts a line with "Q1.", "Q2." etc.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                    <strong>{parsed.meta.title || '(no title detected)'}</strong><br />
                    {parsed.meta.institution} · {parsed.meta.courseCode} {parsed.meta.courseTitle && `- ${parsed.meta.courseTitle}`}<br />
                    {parsed.meta.examDate} · {parsed.meta.timeAllowed}<br />
                    {parsed.meta.instruction}
                  </div>
                  {parsed.questions.map(q => (
                    <div key={q.number} style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-primary)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Q{q.number}.</div>
                      {q.stem && <div style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>{q.stem}</div>}
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
