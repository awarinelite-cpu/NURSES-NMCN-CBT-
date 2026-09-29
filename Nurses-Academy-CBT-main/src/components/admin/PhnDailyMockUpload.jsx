// src/components/admin/PhnDailyMockUpload.jsx
// Route: /admin/phn-daily-mock-upload
//
// PURPOSE: Upload questions DIRECTLY into the dedicated Public Health Nursing
// Daily Mock bank. Questions saved here:
//   - go to collection: phnDailyMockQuestions (NOT the shared `questions` bank)
//   - are used ONLY by the PHN Daily Mock Exam (category = public_health)
//   - never appear in Topic Drill, Past Questions, Daily Practice, etc.
//
// The document shape matches `questions` (question, options[], correctIndex,
// explanation ...) so ExamSession, AI review and pass-rate tracking work
// unchanged.

import { useState, useEffect, useRef } from 'react';
import {
  collection, getDoc, getDocs, query, where, writeBatch, doc, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import {
  parseQuestionsFromText, validateQuestion, formatQuestionForFirestore,
} from '../../utils/questionParser';
import { readQuestionFile } from '../../utils/questionFileImport';

const BANK = 'phnDailyMockQuestions';
const BATCH_SIZE = 400;

// CSV helpers for downloading the previous Public Health questions.
// Column names match what the uploader below already understands, so the
// downloaded file can be edited and uploaded straight back into the PHN bank.
const csvCell = v => {
  const t = String(v ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 16, marginBottom: 16,
};
const lbl = { fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 };
const inp = {
  width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)', fontSize: 14, resize: 'vertical', fontFamily: 'inherit',
};
const btn = {
  padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 14,
};

export default function PhnDailyMockUpload() {
  const { toast } = useToast();
  const fileRef = useRef(null);

  const [bankCount, setBankCount] = useState(null);
  const [text, setText]           = useState('');
  const [answerKey, setAnswerKey] = useState('');
  const [parsed, setParsed]       = useState([]);
  const [saving, setSaving]       = useState(false);
  const [fileInfo, setFileInfo]   = useState('');
  const [downloading, setDownloading] = useState(false);
  const [rotating, setRotating]         = useState(false);
  const [pool, setPool]                 = useState(undefined); // undefined = loading, null = none today

  // ── Manage / delete questions ──
  const [manageOpen, setManageOpen]   = useState(false);
  const [bankQs, setBankQs]           = useState([]);      // [{ id, question }]
  const [bankLoading, setBankLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [filter, setFilter]           = useState('');
  const [deleting, setDeleting]       = useState(false);
  const [editing, setEditing]         = useState(null);   // { id, question, options[], correctIndex, explanation, topic }
  const [savingEdit, setSavingEdit]   = useState(false);

  async function loadCount() {
    try {
      const snap = await getDocs(collection(db, BANK));
      setBankCount(snap.size);
    } catch { setBankCount(null); }
  }
  async function loadPool() {
    try {
      const snap = await getDoc(doc(db, 'dailyMockExam', 'public_health'));
      setPool(snap.exists() ? snap.data() : null);
    } catch { setPool(null); }
  }
  useEffect(() => { loadCount(); loadPool(); }, []);


  async function loadBank() {
    setBankLoading(true);
    try {
      const snap = await getDocs(collection(db, BANK));
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          question: String(data.question || '(no text)'),
          options: (Array.isArray(data.options) ? data.options : []).map(o => (typeof o === 'string' ? o : o?.text || '')),
          correctIndex: Number.isInteger(data.correctIndex) ? data.correctIndex : 0,
          explanation: data.explanation || '',
          topic: data.topic || '',
        };
      });
      setBankQs(list);
      setBankCount(list.length);
      setSelectedIds(prev => new Set([...prev].filter(id => list.some(q => q.id === id))));
    } catch (err) {
      toast('Could not load questions: ' + err.message, 'error');
    } finally {
      setBankLoading(false);
    }
  }

  function toggleManage() {
    const next = !manageOpen;
    setManageOpen(next);
    if (next) loadBank();
  }

  const visibleQs = bankQs.filter(q => q.question.toLowerCase().includes(filter.trim().toLowerCase()));
  const allVisibleSelected = visibleQs.length > 0 && visibleQs.every(q => selectedIds.has(q.id));

  function toggleOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleQs.forEach(q => next.delete(q.id));
      else visibleQs.forEach(q => next.add(q.id));
      return next;
    });
  }


  function startEdit(q) {
    const opts = q.options.length >= 2 ? [...q.options] : ['', ''];
    setEditing({ id: q.id, question: q.question === '(no text)' ? '' : q.question, options: opts,
                 correctIndex: Math.min(q.correctIndex, opts.length - 1), explanation: q.explanation, topic: q.topic });
  }
  const setEditField = (k, v) => setEditing(e => ({ ...e, [k]: v }));
  const setEditOption = (i, v) => setEditing(e => ({ ...e, options: e.options.map((o, j) => (j === i ? v : o)) }));
  function addEditOption() {
    setEditing(e => (e.options.length >= 5 ? e : { ...e, options: [...e.options, ''] }));
  }
  function removeEditOption(i) {
    setEditing(e => {
      if (e.options.length <= 2) return e;
      const options = e.options.filter((_, j) => j !== i);
      let correctIndex = e.correctIndex;
      if (i === correctIndex) correctIndex = 0;
      else if (i < correctIndex) correctIndex -= 1;
      return { ...e, options, correctIndex };
    });
  }
  async function saveEdit() {
    const e = editing;
    const question = e.question.trim();
    const options  = e.options.map(o => o.trim());
    if (!question) { toast('Question text cannot be empty', 'error'); return; }
    if (options.some(o => !o)) { toast('Fill in every option or remove the empty ones', 'error'); return; }
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, BANK, e.id), {
        question, options,
        correctIndex: e.correctIndex,
        explanation: e.explanation.trim(),
        topic: e.topic.trim(),
        updatedAt: serverTimestamp(),
      });
      toast('✅ Question updated', 'success');
      setEditing(null);
      await loadBank();
    } catch (err) {
      toast('Update failed: ' + err.message, 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteIds(ids) {
    setDeleting(true);
    try {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        ids.slice(i, i + BATCH_SIZE).forEach(id => batch.delete(doc(db, BANK, id)));
        await batch.commit();
      }
      toast(`🗑️ Deleted ${ids.length} question${ids.length === 1 ? '' : 's'}. Rotate the PHN pool to refresh today's exam.`, 'success', 4500);
      setSelectedIds(new Set());
      await loadBank();
    } catch (err) {
      toast('Delete failed: ' + err.message, 'error');
      await loadBank();
    } finally {
      setDeleting(false);
    }
  }

  function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) { toast('Select at least one question first', 'error'); return; }
    if (!window.confirm(`Delete ${ids.length} selected question${ids.length === 1 ? '' : 's'} from the PHN Daily Mock bank? This cannot be undone.`)) return;
    deleteIds(ids);
  }

  function deleteAll() {
    if (!bankQs.length) { toast('The PHN bank is already empty', 'error'); return; }
    if (!window.confirm(`Delete ALL ${bankQs.length} questions from the PHN Daily Mock bank? This cannot be undone.`)) return;
    const typed = window.prompt('Type DELETE to confirm deleting every question in the PHN bank:');
    if (typed !== 'DELETE') { toast('Cancelled. Nothing was deleted.', 'error'); return; }
    deleteIds(bankQs.map(q => q.id));
  }

  async function rotatePhn() {
    setRotating(true);
    try {
      const fn  = httpsCallable(getFunctions(), 'manuallyRotatePhnDailyMock');
      const res = (await fn()).data || {};
      if (res.ok) {
        toast(`✅ PHN pool rebuilt: ${res.count} questions from ${res.bankActive} active (${res.carryoverCount} carried over)`, 'success', 4500);
      } else if (res.reason === 'phn-bank-empty') {
        toast('PHN bank has no active questions. Upload some first.', 'error');
      } else {
        toast('Rotation did not complete', 'error');
      }
      loadPool();
    } catch (err) {
      toast('Rotation failed: ' + (err.message || 'unknown error'), 'error');
    } finally {
      setRotating(false);
    }
  }

  function runParse(raw = text) {
    if (!raw.trim()) { toast('Paste questions or choose a file first', 'error'); return; }
    const results = parseQuestionsFromText(raw, answerKey).map(q => ({
      ...q, _errors: validateQuestion(q),
    }));
    setParsed(results);
    if (!results.length) toast('No questions found in that text', 'error');
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { text: t, rowCount } = await readQuestionFile(file);
      if (!t.trim()) { toast('That file looks empty', 'error'); return; }
      setText(t);
      setFileInfo(`${file.name}${rowCount ? ` (${rowCount} rows)` : ''}`);
      runParse(t);
    } catch (err) {
      toast(err.message || 'Could not read that file', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function downloadPrevious() {
    setDownloading(true);
    try {
      const snap = await getDocs(query(collection(db, 'questions'), where('category', '==', 'public_health')));
      if (snap.empty) { toast('No previous Public Health questions found', 'error'); return; }

      const header = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'answer', 'explanation', 'topic', 'year'];
      const rows = snap.docs.map(d => {
        const q = d.data();
        const opts = Array.isArray(q.options) ? q.options : [];
        const optText = i => (typeof opts[i] === 'string' ? opts[i] : opts[i]?.text) || '';
        return [
          q.question, optText(0), optText(1), optText(2), optText(3), optText(4),
          LETTERS[q.correctIndex] || '', q.explanation, q.topic, q.year,
        ].map(csvCell).join(',');
      });

      const csv  = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
      const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a    = document.createElement('a');
      a.href = url;
      a.download = `public-health-previous-questions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast(`⬇️ Downloaded ${rows.length} previous Public Health questions`, 'success');
    } catch (err) {
      toast('Download failed: ' + err.message, 'error');
    } finally {
      setDownloading(false);
    }
  }

  const valid   = parsed.filter(q => q._errors.length === 0);
  const invalid = parsed.length - valid.length;

  async function save() {
    if (!valid.length) { toast('No valid questions to save', 'error'); return; }
    setSaving(true);
    try {
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        valid.slice(i, i + BATCH_SIZE).forEach(q => {
          const data = formatQuestionForFirestore(q, {
            category: 'public_health',
            examType: 'daily_mock_exam',
            source:   'phn_daily_mock_bank',
          });
          batch.set(doc(collection(db, BANK)), {
            ...data,
            active: true,
            inPhnDailyBank: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      toast(`✅ ${valid.length} questions added to the PHN Daily Mock bank`, 'success');
      setText(''); setAnswerKey(''); setParsed([]); setFileInfo('');
      loadCount();
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 16 }}>
      <h2 style={{ margin: '0 0 4px', color: 'var(--text-primary)' }}>🌍 PHN Daily Mock Bank</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 14 }}>
        Questions added here are used only by the Public Health Nursing Daily Mock Exam.
        They are kept apart from the main question bank.
      </p>

      <div style={card}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Questions in PHN bank</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--teal)' }}>
          {bankCount === null ? '…' : bankCount}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Today's PHN Daily Mock pool</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
          {pool === undefined ? 'Checking…'
            : pool === null ? 'No pool yet. Press the button to build one from the PHN bank.'
            : `${(pool.questionIds || []).length} questions, built for ${pool.date || 'unknown date'}${pool.source ? '' : ' (old pool, please rebuild)'}`}
        </div>
        <button style={{ ...btn, background: 'var(--teal)', color: '#fff', opacity: rotating ? 0.6 : 1 }}
                disabled={rotating} onClick={rotatePhn}>
          {rotating ? 'Rotating…' : '🔄 Rotate PHN pool now'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Only the Public Health pool is rebuilt. Other specialties are untouched and no notifications are sent.
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Manage questions</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
          Edit questions, select ones to delete, or clear the whole PHN bank.
        </div>
        <button style={{ ...btn, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                onClick={toggleManage}>
          {manageOpen ? '▲ Hide questions' : '🗂️ Edit / delete questions'}
        </button>

        {manageOpen && (
          <div style={{ marginTop: 14 }}>
            {bankLoading ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            ) : bankQs.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>The PHN bank is empty.</div>
            ) : (
              <>
                <input
                  value={filter} onChange={e => setFilter(e.target.value)}
                  placeholder="Search questions…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, marginBottom: 10,
                           border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                           color: 'var(--text-primary)', fontSize: 14 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700,
                                color: 'var(--text-primary)', marginBottom: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                         style={{ width: 18, height: 18 }} />
                  Select all{filter.trim() ? ' shown' : ''} ({visibleQs.length})
                </label>
                <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                  {visibleQs.map((q, i) => (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
                                             borderBottom: i < visibleQs.length - 1 ? '1px solid var(--border)' : 'none',
                                             background: selectedIds.has(q.id) ? 'rgba(220,38,38,0.08)' : 'transparent' }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0,
                                      fontSize: 13, lineHeight: 1.5, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={selectedIds.has(q.id)} onChange={() => toggleOne(q.id)}
                               style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{q.question}</span>
                      </label>
                      <button onClick={() => startEdit(q)} disabled={deleting}
                              style={{ ...btn, padding: '6px 12px', fontSize: 13, flexShrink: 0,
                                       background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                        ✏️ Edit
                      </button>
                    </div>
                  ))}
                  {visibleQs.length === 0 && (
                    <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No matches.</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  <button style={{ ...btn, background: '#DC2626', color: '#fff', opacity: deleting || !selectedIds.size ? 0.5 : 1 }}
                          disabled={deleting || !selectedIds.size} onClick={deleteSelected}>
                    {deleting ? 'Deleting…' : `🗑️ Delete selected (${selectedIds.size})`}
                  </button>
                  <button style={{ ...btn, background: 'transparent', color: '#DC2626', border: '2px solid #DC2626', opacity: deleting ? 0.5 : 1 }}
                          disabled={deleting} onClick={deleteAll}>
                    ⚠️ Delete all ({bankQs.length})
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Previous Public Health questions</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
          Download the Public Health questions still in the main bank as a CSV. You can edit it and upload it back below.
        </div>
        <button style={{ ...btn, background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                         border: '1px solid var(--border)', opacity: downloading ? 0.6 : 1 }}
                disabled={downloading} onClick={downloadPrevious}>
          {downloading ? 'Preparing…' : '⬇️ Download previous PHN questions (CSV)'}
        </button>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <button style={{ ...btn, background: 'var(--teal)', color: '#fff' }}
                  onClick={() => fileRef.current?.click()}>
            📂 Upload CSV / Word / TXT
          </button>
          <input ref={fileRef} type="file" accept=".csv,.docx,.txt,.text"
                 onChange={onFile} style={{ display: 'none' }} />
        </div>
        {fileInfo && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>📄 {fileInfo}</div>}

        <textarea
          value={text} onChange={e => setText(e.target.value)} rows={9}
          placeholder={'Paste questions here, e.g.\n1. What is the primary level of prevention?\nA. ...\nB. ...\nC. ...\nD. ...\nAnswer: B'}
          style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10,
                   border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                   color: 'var(--text-primary)', fontSize: 14, resize: 'vertical' }}
        />
        <textarea
          value={answerKey} onChange={e => setAnswerKey(e.target.value)} rows={2}
          placeholder="Optional answer key (e.g. 1.B 2.C 3.A)"
          style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, marginTop: 10,
                   border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                   color: 'var(--text-primary)', fontSize: 14, resize: 'vertical' }}
        />
        <button style={{ ...btn, marginTop: 12, background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                         border: '1px solid var(--border)' }}
                onClick={() => runParse()}>
          🔍 Preview
        </button>
      </div>

      {parsed.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {valid.length} ready{invalid > 0 ? `, ${invalid} with problems (skipped)` : ''}
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', margin: '10px 0' }}>
            {parsed.map((q, i) => (
              <div key={i} style={{
                padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
                color: q._errors.length ? '#EF4444' : 'var(--text-secondary)',
              }}>
                <strong>{i + 1}.</strong> {q.question}
                {q._errors.length > 0 && <div style={{ fontSize: 12 }}>⚠️ {q._errors.join(' ')}</div>}
              </div>
            ))}
          </div>
          <button style={{ ...btn, width: '100%', background: 'var(--teal)', color: '#fff',
                           opacity: saving || !valid.length ? 0.6 : 1 }}
                  disabled={saving || !valid.length} onClick={save}>
            {saving ? 'Saving…' : `💾 Save ${valid.length} to PHN Daily Mock bank`}
          </button>
        </div>
      )}
      {editing && (
        <div onClick={() => !savingEdit && setEditing(null)}
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 12 }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16,
                        width: '100%', maxWidth: 560, boxSizing: 'border-box', margin: '16px 0' }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', marginBottom: 12 }}>✏️ Edit question</div>

            <div style={lbl}>Question</div>
            <textarea value={editing.question} onChange={e => setEditField('question', e.target.value)} rows={4} style={inp} />

            <div style={{ ...lbl, marginTop: 12 }}>Options (tap the circle to mark the correct answer)</div>
            {editing.options.map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="radio" name="phn-correct" checked={editing.correctIndex === i}
                       onChange={() => setEditField('correctIndex', i)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, color: 'var(--text-muted)', width: 18, flexShrink: 0 }}>{LETTERS[i]}</span>
                <input value={o} onChange={e => setEditOption(i, e.target.value)}
                       style={{ ...inp, flex: 1, minWidth: 0, padding: 10 }} />
                {editing.options.length > 2 && (
                  <button onClick={() => removeEditOption(i)} title="Remove option"
                          style={{ ...btn, padding: '6px 10px', background: 'transparent', color: '#DC2626', border: '1px solid #DC2626' }}>✕</button>
                )}
              </div>
            ))}
            {editing.options.length < 5 && (
              <button onClick={addEditOption}
                      style={{ ...btn, padding: '6px 12px', fontSize: 13, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                + Add option
              </button>
            )}

            <div style={{ ...lbl, marginTop: 12 }}>Explanation</div>
            <textarea value={editing.explanation} onChange={e => setEditField('explanation', e.target.value)} rows={5} style={inp} />

            <div style={{ ...lbl, marginTop: 12 }}>Topic (optional)</div>
            <input value={editing.topic} onChange={e => setEditField('topic', e.target.value)} style={{ ...inp, padding: 10 }} />

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={{ ...btn, flex: 1, background: 'var(--teal)', color: '#fff', opacity: savingEdit ? 0.6 : 1 }}
                      disabled={savingEdit} onClick={saveEdit}>
                {savingEdit ? 'Saving…' : '💾 Save changes'}
              </button>
              <button style={{ ...btn, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                      disabled={savingEdit} onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
