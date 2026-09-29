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
  collection, getDocs, writeBatch, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import {
  parseQuestionsFromText, validateQuestion, formatQuestionForFirestore,
} from '../../utils/questionParser';
import { readQuestionFile } from '../../utils/questionFileImport';

const BANK = 'phnDailyMockQuestions';
const BATCH_SIZE = 400;

const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 16, marginBottom: 16,
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

  async function loadCount() {
    try {
      const snap = await getDocs(collection(db, BANK));
      setBankCount(snap.size);
    } catch { setBankCount(null); }
  }
  useEffect(() => { loadCount(); }, []);

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
    </div>
  );
}
