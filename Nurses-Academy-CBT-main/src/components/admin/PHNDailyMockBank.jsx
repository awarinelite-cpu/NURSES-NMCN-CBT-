// src/components/admin/PHNDailyMockBank.jsx
// Route: /admin/phn-daily-mock-bank
//
// Dedicated question bank for the Public Health Nursing Daily Mock Exam.
// Questions saved here use category 'phn_daily_mock', which no other exam mode
// queries, so they stay out of Past Questions / Topic Drill / Mock Exams.
// The daily rotation (functions/src/dailyMockExamRotation.js) builds the
// Public Health pool ONLY from this bank.

import { useState, useEffect, useRef } from 'react';
import {
  collection, doc, writeBatch, serverTimestamp,
  query, where, getDocs, getCountFromServer,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import { readQuestionFile, readCsvFileAsQuestions } from '../../utils/questionFileImport';
import { parseQuestionsFromText, formatQuestionForFirestore } from '../../utils/questionParser';

const BANK_CATEGORY = 'phn_daily_mock';

export default function PHNDailyMockBank() {
  const toast = useToast();
  const fileRef = useRef(null);

  const [bankCount, setBankCount] = useState(null);
  const [text,      setText]      = useState('');
  const [answers,   setAnswers]   = useState('');
  const [parsed,    setParsed]    = useState([]);
  const [info,      setInfo]      = useState('');
  const [busy,      setBusy]      = useState(false);

  const loadCount = async () => {
    try {
      const snap = await getCountFromServer(query(
        collection(db, 'questions'),
        where('category', '==', BANK_CATEGORY),
        where('active', '==', true),
      ));
      setBankCount(snap.data().count);
    } catch {
      setBankCount(null);
    }
  };
  useEffect(() => { loadCount(); }, []);

  const withIssues = (list) => list.map(q => {
    const issues = [];
    if (!q.question?.trim()) issues.push('Missing question');
    if ((q.options || []).filter(o => (typeof o === 'string' ? o : o?.text || '').trim()).length < 2) issues.push('Fewer than 2 options');
    if (q.correctIndex === undefined || q.correctIndex < 0) issues.push('No answer');
    return { ...q, _issues: issues };
  });

  const parseFile = async (file) => {
    if (!file) return;
    setBusy(true); setInfo(''); setParsed([]);
    try {
      const ext = (file.name || '').toLowerCase().split('.').pop();
      if (ext === 'csv') {
        const { questions } = await readCsvFileAsQuestions(file);
        const list = withIssues(questions.map(q => ({
          ...q, correctIndex: q._hasAnswer ? q.correctIndex : -1,
        })));
        setParsed(list);
        setInfo(`Parsed ${list.length} questions from CSV.`);
      } else {
        const { text: t } = await readQuestionFile(file);
        setText(t);
        const list = withIssues(parseQuestionsFromText(t, answers));
        setParsed(list);
        setInfo(`Parsed ${list.length} questions.`);
      }
    } catch (e) {
      toast('Could not read file: ' + e.message, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const parsePasted = () => {
    const list = withIssues(parseQuestionsFromText(text, answers));
    setParsed(list);
    setInfo(list.length ? `Parsed ${list.length} questions.` : 'No questions found — check the format.');
  };

  const valid = parsed.filter(q => q._issues.length === 0);

  const save = async () => {
    if (valid.length === 0) return;
    setBusy(true);
    try {
      for (let i = 0; i < valid.length; i += 400) {
        const batch = writeBatch(db);
        valid.slice(i, i + 400).forEach(q => {
          const ref = doc(collection(db, 'questions'));
          batch.set(ref, {
            ...formatQuestionForFirestore(q, {
              category: BANK_CATEGORY,
              examType: 'daily_mock_bank',
              difficulty: 'medium',
              source: 'PHN Daily Mock Bank',
            }),
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      toast(`✅ ${valid.length} questions added to the PHN Daily Mock bank`, 'success');
      setParsed([]); setText(''); setAnswers(''); setInfo('');
      loadCount();
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 };
  const btn  = { padding: '10px 16px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 720, margin: '0 auto', minWidth: 0 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 22, color: 'var(--text-primary)' }}>🌍 PHN Daily Mock Bank</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
        Questions added here are used <strong>only</strong> for the Public Health Nursing Daily Mock Exam.
        They won’t appear in any other exam mode, and the general Public Health questions won’t appear in the Daily Mock.
      </p>

      <div style={card}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Active questions in this bank</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{bankCount ?? '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          New questions go live at the next midnight rotation (or use Admin → Daily Mock Exam → rotate now).
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Upload a file</div>
        <input ref={fileRef} type="file" accept=".csv,.docx,.txt,.md"
          onChange={e => parseFile(e.target.files?.[0])} disabled={busy}
          style={{ maxWidth: '100%' }} />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          CSV columns: question, option_a–option_d, answer, explanation. The category column is ignored.
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Or paste questions</div>
        <textarea value={text} onChange={e => { setText(e.target.value); setParsed([]); }}
          rows={8} placeholder="Paste questions with options A–D here…"
          style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13 }} />
        <textarea value={answers} onChange={e => { setAnswers(e.target.value); setParsed([]); }}
          rows={3} placeholder="Answer key (optional, e.g. 1.B 2.D 3.A)"
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13 }} />
        <button onClick={parsePasted} disabled={busy || !text.trim()}
          style={{ ...btn, marginTop: 8, background: 'var(--teal)', color: '#fff', opacity: busy || !text.trim() ? 0.5 : 1 }}>
          Parse
        </button>
      </div>

      {parsed.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{info}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 10px' }}>
            {valid.length} ready to save{parsed.length - valid.length > 0 ? ` · ${parsed.length - valid.length} skipped (issues)` : ''}
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', fontSize: 12, marginBottom: 10 }}>
            {parsed.slice(0, 50).map((q, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', color: q._issues.length ? '#DC2626' : 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                {i + 1}. {q.question}{q._issues.length ? ` — ⚠️ ${q._issues.join(', ')}` : ''}
              </div>
            ))}
          </div>
          <button onClick={save} disabled={busy || valid.length === 0}
            style={{ ...btn, background: '#16A34A', color: '#fff', opacity: busy || valid.length === 0 ? 0.5 : 1 }}>
            {busy ? 'Saving…' : `Save ${valid.length} to PHN Daily Mock bank`}
          </button>
        </div>
      )}
    </div>
  );
}
