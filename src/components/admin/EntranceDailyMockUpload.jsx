// src/components/admin/EntranceDailyMockUpload.jsx
// Route: /admin/entrance-exam/daily-mock-upload
//
// PURPOSE: Upload questions DIRECTLY into the Daily Entrance Mock Bank.
// This is completely separate from the past-questions route (school/year/subject).
// Questions saved here:
//   - go to collection: entranceExamQuestions
//   - always have inDailyBank: true
//   - have NO schoolId, NO year, NO subject (not past questions)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, addDoc, doc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';

// ── Parser (same robust parser used in EntranceExamManager) ──────────────────
const NUM_TO_LETTER = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };

function extractAnswerLetter(raw) {
  if (!raw) return '';
  const s = raw.trim();
  let m = /\*\*[^*]*?([A-D])[.)]/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^(?:answer|ans|correct(?:\s+answer)?|ansr?)\s*[:\-]?\s*\(?([A-D])\)?/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^(?:ans(?:wer)?)\s*:?\s*([A-D])\b/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^\*([A-D])$/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^[(\[]([A-D])[)\]]$/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^(?:answer|ans|correct(?:\s+answer)?)\s*[:\-]?\s*([1-4])\b/i.exec(s);
  if (m) return NUM_TO_LETTER[m[1]] || '';
  m = /^([A-D])$/i.exec(s);
  if (m) return m[1].toUpperCase();
  return '';
}

function extractAnswerInline(line) {
  const s = line.trim();
  let m = /\*\*[^*]*?\b([A-D])[.)]/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /(?:^|\s)(?:answer|ans(?:wer)?)\s*[:\-]?\s*\(?([A-D])\)?(?:\b|$)/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /\bans\s*:\s*([A-D])\b/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /\bANS\s*:?\s*([A-D])\b/i.exec(s);
  if (m) return m[1].toUpperCase();
  return '';
}

const OPTION_RE = /^(?:([A-Da-d])[.)]\s*|([A-Da-d])\t|([1-4])[.)]\s*|\{([a-d])\}\s*)/i;

function parseEntranceDailyQuestions(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text.trim().split(/\n{2,}/).filter(b => b.trim());
  const results = [], warnings = [];

  blocks.forEach((block, idx) => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return;

    let cursor = 0;
    let diagramUrl = '';
    if (/^https?:\/\//i.test(lines[0])) { diagramUrl = lines[0]; cursor++; }

    let questionLine = (lines[cursor] || '').trim();
    questionLine = questionLine.replace(/^(?:MCQ\s*\d+|FBQ\s*\d+|Q\.?\s*\d+|Q\d+|\d+[.)]\s*)/i, '').trim();
    if (!questionLine && cursor < lines.length) { cursor++; questionLine = (lines[cursor] || '').trim(); }
    cursor++;

    const options = {};
    while (cursor < lines.length) {
      const l = lines[cursor];
      const lTrimmed = l.trim();
      if (/^(?:answer|ans(?:wer)?|correct)\s*[:\-]?\s*[A-D1-4\*\(\[]/i.test(lTrimmed)) break;
      if (/^\*[A-D]$/i.test(lTrimmed)) break;
      if (/^[(\[]([A-D])[)\]]$/i.test(lTrimmed)) break;
      if (/^(?:explanation|rationale)\s*:/i.test(lTrimmed)) break;
      if (/^(?:ans\s*:?\s*[A-D]\b|ANS\s*:?\s*[A-D]\b)/i.test(lTrimmed)) break;

      const optMatch = OPTION_RE.exec(lTrimmed);
      if (optMatch) {
        let letter = (optMatch[1] || optMatch[2] || '').toUpperCase();
        if (!letter && optMatch[3]) letter = NUM_TO_LETTER[optMatch[3]] || '';
        if (!letter && optMatch[4]) letter = optMatch[4].toUpperCase();
        if (!letter) { cursor++; continue; }
        let optText = lTrimmed.replace(OPTION_RE, '').trim();
        const inlineAns = extractAnswerInline(optText);
        if (inlineAns) {
          optText = optText.replace(/\s*(?:ans(?:wer)?)\s*[:\-]?\s*[A-D]\b.*/i, '').trim();
        }
        options[letter] = optText;
        cursor++;
        continue;
      }
      if (Object.keys(options).length > 0) break;
      questionLine += ' ' + lTrimmed;
      cursor++;
    }

    let correctAnswer = '', explanation = '';

    for (const line of lines) {
      if (!OPTION_RE.test(line.trim())) continue;
      const optText = line.trim().replace(OPTION_RE, '');
      const ia = extractAnswerInline(optText);
      if (ia) { correctAnswer = ia; break; }
    }

    while (cursor < lines.length) {
      const l = lines[cursor];
      if (/^(?:explanation|rationale)\s*:/i.test(l)) {
        explanation = l.replace(/^(?:explanation|rationale)\s*:\s*/i, '').trim();
        cursor++; continue;
      }
      const a = extractAnswerLetter(l);
      if (a) { if (!correctAnswer) correctAnswer = a; cursor++; continue; }
      const ia = extractAnswerInline(l);
      if (ia) { if (!correctAnswer) correctAnswer = ia; cursor++; continue; }
      cursor++;
    }

    if (!questionLine) return;
    if (Object.keys(options).length < 2) return;

    const needsReview = !correctAnswer;
    if (needsReview) {
      warnings.push(`Block ${idx + 1}: No answer found — "${questionLine.slice(0, 55)}…" (saved for review)`);
    }

    results.push({
      questionText: questionLine,
      options,
      correctAnswer,
      explanation,
      diagramUrl,
      questionType: diagramUrl ? 'diagram' : 'text',
      needsReview,
    });
  });

  return { results, warnings };
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  label: { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 },
  card:  { background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '20px 22px' },
};

// ═════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function EntranceDailyMockUpload() {
  const { toast } = useToast();
  const navigate  = useNavigate();
  const [mode, setMode] = useState('bulk'); // 'single' | 'bulk'

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#1E1B4B,#065F46)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 28,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 50%, rgba(139,92,246,0.25) 0%, transparent 60%)' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: '#fff', fontFamily: "'Playfair Display',serif", margin: '0 0 4px' }}>
              📅 Daily Entrance Mock — Upload
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: 14 }}>
              Questions added here go <strong style={{ color: '#A78BFA' }}>directly</strong> into the daily rotation — no school, no year, no subject required.
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/entrance-exam')}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0 }}
          >
            ← Back to Manager
          </button>
        </div>
      </div>

      {/* Difference callout */}
      <div style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 14 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>💡</span>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>This page is for Daily Mock questions only.</strong><br />
          For past questions tied to a school and year, use the <strong>Bulk Upload</strong> tab in the main Entrance Exam Manager.
          Questions here are picked automatically every 24 hours and served to all students regardless of school.
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { id: 'single', label: '➕ Single Question' },
          { id: 'bulk',   label: '📦 Bulk Paste'      },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding: '10px 20px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 13, transition: 'all .2s',
            borderColor: mode === m.id ? '#8B5CF6' : 'var(--border)',
            background:  mode === m.id ? 'rgba(139,92,246,0.12)' : 'var(--bg-card)',
            color:       mode === m.id ? '#8B5CF6' : 'var(--text-secondary)',
          }}>{m.label}</button>
        ))}
      </div>

      {mode === 'single' && <SingleForm toast={toast} />}
      {mode === 'bulk'   && <BulkForm   toast={toast} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SINGLE FORM
// ═════════════════════════════════════════════════════════════════════════════
function SingleForm({ toast }) {
  const [mode, setMode] = useState('form'); // 'form' | 'paste'
  const [form, setForm] = useState({
    questionText: '', options: { A: '', B: '', C: '', D: '' },
    correctAnswer: 'A', explanation: '', diagramUrl: '',
  });
  const [rawText,  setRawText]  = useState('');
  const [parsed,   setParsed]   = useState(null);
  const [parseErr, setParseErr] = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleParse = () => {
    setParseErr('');
    const { results, warnings } = parseEntranceDailyQuestions(rawText);
    if (!results.length) { setParseErr('No question detected.'); return; }
    if (warnings.length) setParseErr('⚠️ No answer found — set it manually before saving.');
    setParsed(results[0]);
  };

  const buildPayload = (q) => ({
    // Daily mock questions: NO schoolId, NO year, NO subject
    schoolId:     null,
    schoolName:   '',
    year:         '',
    subject:      '',
    questionType: q.diagramUrl ? 'diagram' : 'text',
    diagramUrl:   q.diagramUrl || '',
    questionText: q.questionText,
    options:      q.options,
    correctAnswer: q.correctAnswer,
    explanation:  q.explanation || '',
    needsReview:  q.needsReview || false,
    active:       true,
    inDailyBank:  true,   // ← always true — this is the whole point
    createdAt:    serverTimestamp(),
  });

  const saveForm = async () => {
    if (!form.questionText.trim()) { toast('Question text is required', 'error'); return; }
    if (!form.options.A || !form.options.B || !form.options.C || !form.options.D) {
      toast('All four options (A–D) are required', 'error'); return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'entranceExamQuestions'), buildPayload({
        ...form, needsReview: false,
      }));
      toast('✅ Added to Daily Mock Bank!', 'success');
      setForm({ questionText: '', options: { A: '', B: '', C: '', D: '' }, correctAnswer: 'A', explanation: '', diagramUrl: '' });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveParsed = async (q) => {
    setSaving(true);
    try {
      await addDoc(collection(db, 'entranceExamQuestions'), buildPayload(q));
      toast('✅ Added to Daily Mock Bank!', 'success');
      setParsed(null); setRawText(''); setParseErr('');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Sub-mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ id: 'form', label: '🖊️ Type It' }, { id: 'paste', label: '📋 Paste & Parse' }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding: '8px 16px', borderRadius: 8, border: '1.5px solid', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 12, transition: 'all .2s',
            borderColor: mode === m.id ? 'var(--teal)' : 'var(--border)',
            background:  mode === m.id ? 'rgba(13,148,136,0.12)' : 'var(--bg-card)',
            color:       mode === m.id ? 'var(--teal)' : 'var(--text-muted)',
          }}>{m.label}</button>
        ))}
      </div>

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
            {['A', 'B', 'C', 'D'].map(letter => (
              <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div
                  onClick={() => setForm(p => ({ ...p, correctAnswer: letter }))}
                  style={{
                    width: 32, height: 32, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
                    background: form.correctAnswer === letter ? 'rgba(22,163,74,0.15)' : 'var(--bg-tertiary)',
                    border: `2px solid ${form.correctAnswer === letter ? 'var(--green)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 13,
                    color: form.correctAnswer === letter ? 'var(--green)' : 'var(--text-muted)',
                  }}
                >{letter}</div>
                <input className="form-input" value={form.options[letter] || ''} onChange={e => setForm(p => ({ ...p, options: { ...p.options, [letter]: e.target.value } }))} style={{ flex: 1 }} placeholder={`Option ${letter}`} />
                {form.correctAnswer === letter && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>✅</span>}
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>👆 Click a letter to mark it as correct</p>
            <div>
              <label style={S.label}>💡 Explanation (optional)</label>
              <textarea className="form-input" rows={2} value={form.explanation} onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <button className="btn btn-primary" onClick={saveForm} disabled={saving || !form.questionText.trim()} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>
              {saving ? '📅 Saving…' : '📅 Add to Daily Mock Bank'}
            </button>
          </div>
        </div>
      )}

      {mode === 'paste' && (
        <>
          <FormatGuide />
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>📝 Paste Question</div>
            <textarea
              className="form-input" rows={12}
              placeholder="Paste your question here…"
              value={rawText}
              onChange={e => { setRawText(e.target.value); setParsed(null); setParseErr(''); }}
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
            />
            <button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview</button>
          </div>
          {parseErr && <ParseError msg={parseErr} />}
          {parsed && (
            <QuestionPreview q={parsed}>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" onClick={() => saveParsed(parsed)} disabled={saving} style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}>
                  {saving ? '📅 Saving…' : '📅 Add to Daily Bank'}
                </button>
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
// BULK FORM
// ═════════════════════════════════════════════════════════════════════════════
function BulkForm({ toast }) {
  const [rawText,   setRawText]   = useState('');
  const [parsed,    setParsed]    = useState([]);
  const [warnings,  setWarnings]  = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [imported,  setImported]  = useState(null);

  const handleParse = () => {
    const { results, warnings: warns } = parseEntranceDailyQuestions(rawText);
    setParsed(results);
    setWarnings(warns);
    setImported(null);
  };

  const handleImport = async () => {
    if (!parsed.length) { toast('Nothing to import', 'error'); return; }
    setSaving(true);
    try {
      // Firestore batch limit is 500 — split if needed
      const chunks = [];
      for (let i = 0; i < parsed.length; i += 499) chunks.push(parsed.slice(i, i + 499));

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(q => {
          const ref = doc(collection(db, 'entranceExamQuestions'));
          batch.set(ref, {
            // Daily mock: NO schoolId, NO year, NO subject
            schoolId:     null,
            schoolName:   '',
            year:         '',
            subject:      '',
            questionType: q.questionType,
            diagramUrl:   q.diagramUrl || '',
            questionText: q.questionText,
            options:      q.options,
            correctAnswer: q.correctAnswer,
            explanation:  q.explanation || '',
            needsReview:  q.needsReview || false,
            active:       true,
            inDailyBank:  true,   // ← ALWAYS true — no toggle needed
            createdAt:    serverTimestamp(),
          });
        });
        await batch.commit();
      }

      const reviewCount = parsed.filter(q => q.needsReview).length;
      const diagrams    = parsed.filter(q => q.questionType === 'diagram').length;
      setImported({ count: parsed.length, diagrams, reviewCount });
      setParsed([]); setRawText(''); setWarnings([]);
      toast(`📅 ${parsed.length} questions added to Daily Mock Bank!${reviewCount ? ` (${reviewCount} need answer review)` : ''}`, reviewCount ? 'warning' : 'success');
    } catch (e) { toast('Import failed: ' + e.message, 'error'); }
    finally { setSaving(false); }
  };

  const withAnswer  = parsed.filter(q => !q.needsReview).length;
  const reviewNeeded = parsed.filter(q => q.needsReview).length;
  const diagrams    = parsed.filter(q => q.questionType === 'diagram').length;

  return (
    <div style={{ maxWidth: 900 }}>
      <FormatGuide bulk />

      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>📦 Paste All Questions</div>
        <textarea
          className="form-input" rows={18}
          placeholder="Paste all your daily mock questions here, separated by blank lines…"
          value={rawText}
          onChange={e => { setRawText(e.target.value); setParsed([]); setWarnings([]); setImported(null); }}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
        />
        <button className="btn btn-ghost" onClick={handleParse} style={{ marginTop: 10 }}>🔍 Parse &amp; Preview All</button>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>
            ⚠️ {warnings.length} question{warnings.length !== 1 ? 's' : ''} missing answers — flagged for review
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            These will still be saved. Fix their answers in the Question Bank tab.
          </div>
          <details>
            <summary style={{ fontSize: 12, color: '#F59E0B', cursor: 'pointer' }}>Show details</summary>
            <div style={{ marginTop: 8 }}>
              {warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: '#F59E0B', lineHeight: 1.6 }}>{w}</div>)}
            </div>
          </details>
        </div>
      )}

      {/* Preview table */}
      {parsed.length > 0 && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>
                ✅ {parsed.length} questions ready
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                📝 {parsed.length - diagrams} text · 🖼️ {diagrams} diagram
                {reviewNeeded > 0 && <span style={{ color: '#F59E0B', marginLeft: 8 }}>· ⚠️ {reviewNeeded} need answer · ✅ {withAnswer} complete</span>}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={saving}
              style={{ background: 'linear-gradient(135deg,#8B5CF6,#6D28D9)' }}
            >
              {saving ? '📅 Importing…' : `📅 Add All to Daily Bank (${parsed.length})`}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question Preview</th>
                  <th>Answer</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 30).map((q, i) => (
                  <tr key={i} style={q.needsReview ? { background: 'rgba(245,158,11,0.04)' } : {}}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ fontSize: 12 }}>
                      {q.questionText.slice(0, 70)}{q.questionText.length > 70 ? '…' : ''}
                    </td>
                    <td>
                      {q.correctAnswer
                        ? <span className="badge badge-teal">{q.correctAnswer}</span>
                        : <span style={{ fontSize: 11, color: '#F59E0B' }}>⚠️ review</span>}
                    </td>
                    <td>
                      <span className="badge badge-grey">{q.questionType === 'diagram' ? '🖼️' : '📝'}</span>
                    </td>
                  </tr>
                ))}
                {parsed.length > 30 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>
                      … and {parsed.length - 30} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Success banner */}
      {imported && (
        <div style={{
          background: imported.reviewCount ? 'rgba(245,158,11,0.07)' : 'rgba(139,92,246,0.08)',
          border: `1.5px solid ${imported.reviewCount ? 'rgba(245,158,11,0.3)' : 'rgba(139,92,246,0.3)'}`,
          borderRadius: 14, padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: imported.reviewCount ? '#F59E0B' : '#8B5CF6', marginBottom: 6 }}>
            Added to Daily Mock Bank!
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {imported.count} questions are now eligible for daily rotation
            {imported.diagrams > 0 && ` · ${imported.diagrams} with diagrams`}
            {imported.reviewCount > 0 && <span style={{ color: '#F59E0B' }}> · {imported.reviewCount} need answer review</span>}
          </div>
          {imported.reviewCount > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Go to the <strong>Question Bank</strong> in the Entrance Exam Manager to fill in missing answers.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function FormatGuide({ bulk }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ padding: '14px 16px', marginBottom: 16, background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#A78BFA' }}>
          📋 Format Guide{bulk ? ' — separate questions with a blank line' : ''}
        </div>
        <button onClick={() => setExpanded(p => !p)} style={{ fontSize: 11, background: 'none', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: '#A78BFA' }}>
          {expanded ? '▲ Less' : '▼ All formats'}
        </button>
      </div>
      <pre style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{`What is the functional unit of the kidney?
A. Nephron
B. Neuron
C. Nodule
D. Nucleus
*A
Explanation: The nephron filters blood...${bulk ? `\n\nhttps://i.imgur.com/abc123.png\nDiagram question here\nA. Option one\nB. Option two\nC. Option three\nD. Option four\n*C` : ''}`}</pre>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid rgba(139,92,246,0.15)', paddingTop: 12 }}>
          <pre style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.9, margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{`A. text   A) text   1. text   {a} text     ← all option styles OK
*A  ·  Answer: A  ·  Ans: A  ·  (A)  ·  [A]  ← answer formats
Explanation: text here                        ← optional`}</pre>
        </div>
      )}
    </div>
  );
}

function ParseError({ msg }) {
  return (
    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>⚠️ Parse Note</div>
      <pre style={{ margin: 0, fontSize: 12, color: '#EF4444', whiteSpace: 'pre-wrap' }}>{msg}</pre>
    </div>
  );
}

function QuestionPreview({ q, children }) {
  return (
    <div style={{ ...S.card, border: '1.5px solid rgba(139,92,246,0.4)', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#8B5CF6', marginBottom: 12 }}>
        ✅ Parsed — {q.questionType === 'diagram' ? '🖼️ Diagram' : '📝 Text'} Question
      </div>
      {q.diagramUrl && (
        <img src={q.diagramUrl} alt="Diagram" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }} onError={e => { e.target.style.display = 'none'; }} />
      )}
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>{q.questionText}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {Object.entries(q.options).map(([letter, text]) => (
          <div key={letter} style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: q.correctAnswer === letter ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)',
            border: `1.5px solid ${q.correctAnswer === letter ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`,
            color: q.correctAnswer === letter ? 'var(--green)' : 'var(--text-secondary)',
            fontWeight: q.correctAnswer === letter ? 700 : 400,
          }}>
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
