// src/components/admin/AnswerAuditTab.jsx
// Admin tool for auditing/correcting answers across the entire question bank.
//
// Two ways to fix wrong answers:
//   A) EXPORT → correct in Excel/Sheets → RE-UPLOAD (matched by doc id, safe update, not a duplicate import)
//   B) AI VERIFICATION SWEEP → Gemini independently re-solves every question,
//      auto-fixes high-confidence disagreements, flags the rest into a
//      review queue for you to accept/dismiss one by one.
//
// Both tools operate on the `questions` collection (Question Bank / Mock
// Exam / Past Questions) — the same collection the "All Questions" and
// "Quick Edit" tabs use.

import { useState, useRef, useCallback } from 'react';
import {
  collection, getDocs, doc, writeBatch, serverTimestamp, setDoc, deleteDoc, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import { OPT_LETTERS } from '../../utils/questionFileImport';
import {
  exportQuestionsToCsv, downloadBlob, parseCorrectionsCsv, diffUpdate,
  extractIdsFromCsvFiles, exportRemainingBatched,
} from '../../utils/answerAudit';
import { verifyAnswersBatch } from '../../utils/aiVerify';

const BATCH_SIZE = 400;
const AUTO_FIX_CONFIDENCE = 85; // >= this and AI disagrees → auto-fix, else flag for review

async function fetchAllQuestions() {
  const snap = await getDocs(collection(db, 'questions'));
  return snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
}

export default function AnswerAuditTab() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(null);

  // Export/reimport state
  const [correctionRows, setCorrectionRows] = useState(null); // { updates, warnings, diffs }
  const [applyingCorrections, setApplyingCorrections] = useState(false);

  // "Download remaining" state
  const reviewedFilesRef = useRef(null);
  const [reviewedIdInfo, setReviewedIdInfo] = useState(null); // { idSet, perFile }
  const [remainingPreview, setRemainingPreview] = useState(null); // { batches, remainingCount, excludedCount }
  const [remainingLoading, setRemainingLoading] = useState(false);
  const [downloadingBatches, setDownloadingBatches] = useState(false);

  // AI sweep state
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepProgress, setSweepProgress] = useState({ done: 0, total: 0 });
  const [sweepSummary, setSweepSummary] = useState(null); // { agree, autoFixed, flagged, errors }

  // Review queue state
  const [reviewItems, setReviewItems] = useState(null); // null = not loaded
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewBusyId, setReviewBusyId] = useState(null);

  // ── Export ────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setLoading(true);
    try {
      const questions = await fetchAllQuestions();
      setQuestionCount(questions.length);
      if (questions.length === 0) {
        toast('No questions found in the question bank.', 'warning');
        return;
      }
      const blob = exportQuestionsToCsv(questions);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `question-bank-export-${stamp}.csv`);
      toast(`Exported ${questions.length} questions. Open in Excel/Sheets, fix the "answer" column, then upload it back below.`, 'success');
    } catch (e) {
      console.error(e);
      toast('Export failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Re-upload corrected CSV → preview diff ──────────────────────────────
  const handleCorrectionFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setCorrectionRows(null);
    try {
      const { updates, warnings } = await parseCorrectionsCsv(file);
      if (updates.length === 0) {
        toast('No valid corrected rows found in that CSV.', 'error');
        setLoading(false);
        return;
      }
      const current = await fetchAllQuestions();
      const currentById = new Map(current.map(q => [q.id, q]));
      const diffs = updates
        .map(u => ({ update: u, diff: diffUpdate(u, currentById) }))
        .filter(({ diff }) => !diff.notFound && diff.changes.length > 0);
      const notFoundCount = updates.length - (updates.length - updates.filter(u => !currentById.has(u.id)).length);
      const missing = updates.filter(u => !currentById.has(u.id)).length;
      const unchanged = updates.length - diffs.length - missing;

      setCorrectionRows({ diffs, warnings, missing, unchanged, currentById });
      toast(`Found ${diffs.length} question(s) with real changes to apply.`, diffs.length ? 'info' : 'warning');
    } catch (err) {
      console.error(err);
      toast('Could not read that CSV: ' + err.message, 'error');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const applyCorrections = async () => {
    if (!correctionRows || correctionRows.diffs.length === 0) return;
    setApplyingCorrections(true);
    try {
      const { diffs, currentById } = correctionRows;
      let applied = 0;
      for (let i = 0; i < diffs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const slice = diffs.slice(i, i + BATCH_SIZE);
        slice.forEach(({ update }) => {
          const current = currentById.get(update.id);
          const payload = { updatedAt: serverTimestamp() };
          if (update.question) payload.question = update.question;
          payload.options = update.options.length >= (current.options?.length || 0)
            ? update.options
            : [...update.options, ...(current.options || []).slice(update.options.length)];
          payload.correctIndex = update.correctIndex;
          if (update.explanation) payload.explanation = update.explanation;
          if (update.category) payload.category = update.category;
          if (update.examType) payload.examType = update.examType;
          if (update.year) payload.year = update.year;
          if (update.subject) payload.subject = update.subject;
          if (update.difficulty) payload.difficulty = update.difficulty;
          if (update.course) payload.course = update.course;
          if (update.topic) payload.topic = update.topic;
          batch.update(current.ref, payload);
        });
        await batch.commit();
        applied += slice.length;
      }
      toast(`Applied corrections to ${applied} question(s).`, 'success');
      setCorrectionRows(null);
    } catch (err) {
      console.error(err);
      toast('Failed to apply corrections: ' + err.message, 'error');
    } finally {
      setApplyingCorrections(false);
    }
  };

  // ── Download remaining (skip already-reviewed batches) ─────────────────
  const handleReviewedFiles = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setRemainingPreview(null);
    try {
      const info = await extractIdsFromCsvFiles(files);
      setReviewedIdInfo(info);
      toast(`Found ${info.idSet.size} already-reviewed question ID(s) across ${files.length} file(s).`, 'info');
    } catch (err) {
      console.error(err);
      toast('Could not read those CSVs: ' + err.message, 'error');
    } finally {
      if (reviewedFilesRef.current) reviewedFilesRef.current.value = '';
    }
  };

  const previewRemaining = async () => {
    if (!reviewedIdInfo || reviewedIdInfo.idSet.size === 0) {
      toast('Upload your already-reviewed CSV(s) first.', 'warning');
      return;
    }
    setRemainingLoading(true);
    try {
      const questions = await fetchAllQuestions();
      setQuestionCount(questions.length);
      const result = exportRemainingBatched(questions, reviewedIdInfo.idSet, { batchSize: 300 });
      setRemainingPreview(result);
      if (result.remainingCount === 0) {
        toast('Every question in the bank is already covered by the files you uploaded. 🎉', 'success');
      }
    } catch (err) {
      console.error(err);
      toast('Failed to compute remaining questions: ' + err.message, 'error');
    } finally {
      setRemainingLoading(false);
    }
  };

  const downloadAllRemainingBatches = async () => {
    if (!remainingPreview || remainingPreview.batches.length === 0) return;
    setDownloadingBatches(true);
    try {
      // Stagger downloads slightly — browsers can drop rapid-fire same-tick downloads.
      for (const batch of remainingPreview.batches) {
        downloadBlob(batch.blob, batch.filename);
        await new Promise(r => setTimeout(r, 250));
      }
      toast(`Downloaded ${remainingPreview.batches.length} batch file(s).`, 'success');
    } finally {
      setDownloadingBatches(false);
    }
  };

  // ── AI Verification Sweep ────────────────────────────────────────────
  const runAiSweep = async () => {
    if (!window.confirm(
      'This will ask the AI to re-check every question in the bank. It may take a while and use API quota. Continue?'
    )) return;

    setSweepRunning(true);
    setSweepSummary(null);
    setSweepProgress({ done: 0, total: 0 });
    try {
      const questions = await fetchAllQuestions();
      setQuestionCount(questions.length);
      setSweepProgress({ done: 0, total: questions.length });

      let agree = 0, autoFixed = 0, flagged = 0, errors = 0;
      const byId = new Map(questions.map(q => [q.id, q]));
      let batch = writeBatch(db);
      let opsInBatch = 0;

      const flushBatch = async () => {
        if (opsInBatch > 0) {
          await batch.commit();
          batch = writeBatch(db);
          opsInBatch = 0;
        }
      };

      const results = await verifyAnswersBatch(questions, {
        concurrency: 3,
        onProgress: (done, total) => setSweepProgress({ done, total }),
      });

      for (const r of results) {
        if (r.error) { errors++; continue; }
        if (r.agrees) { agree++; continue; }

        const q = byId.get(r.id);
        if (!q) continue;

        if (r.confidence >= AUTO_FIX_CONFIDENCE) {
          batch.update(q.ref, {
            correctIndex: r.suggestedIndex,
            aiPreviousCorrectIndex: q.correctIndex,
            aiAutoFixedAt: serverTimestamp(),
            aiConfidence: r.confidence,
            aiReasoning: r.reasoning,
            updatedAt: serverTimestamp(),
          });
          opsInBatch++;
          autoFixed++;
        } else {
          const reviewRef = doc(db, 'answerReviewQueue', r.id);
          batch.set(reviewRef, {
            questionId: r.id,
            question: q.question,
            options: q.options,
            currentIndex: r.currentIndex,
            suggestedIndex: r.suggestedIndex,
            suggestedLetter: r.suggestedLetter,
            confidence: r.confidence,
            reasoning: r.reasoning,
            status: 'pending',
            createdAt: serverTimestamp(),
          });
          opsInBatch++;
          flagged++;
        }

        if (opsInBatch >= BATCH_SIZE) await flushBatch();
      }
      await flushBatch();

      setSweepSummary({ agree, autoFixed, flagged, errors, total: questions.length });
      toast(`Sweep complete: ${autoFixed} auto-fixed, ${flagged} flagged for review, ${agree} confirmed correct.`, 'success');
      setReviewItems(null); // force reload of queue next time it's opened
    } catch (err) {
      console.error(err);
      toast('AI sweep failed: ' + err.message, 'error');
    } finally {
      setSweepRunning(false);
    }
  };

  // ── Review queue ─────────────────────────────────────────────────────
  const loadReviewQueue = async () => {
    setReviewLoading(true);
    try {
      const q = query(collection(db, 'answerReviewQueue'), where('status', '==', 'pending'));
      const snap = await getDocs(q);
      setReviewItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast('Could not load review queue: ' + err.message, 'error');
    } finally {
      setReviewLoading(false);
    }
  };

  const acceptSuggestion = async (item) => {
    setReviewBusyId(item.id);
    try {
      const qRef = doc(db, 'questions', item.questionId);
      const batch = writeBatch(db);
      batch.update(qRef, {
        correctIndex: item.suggestedIndex,
        aiPreviousCorrectIndex: item.currentIndex,
        aiReviewedAt: serverTimestamp(),
        aiConfidence: item.confidence,
        aiReasoning: item.reasoning,
        updatedAt: serverTimestamp(),
      });
      batch.delete(doc(db, 'answerReviewQueue', item.id));
      await batch.commit();
      setReviewItems(prev => prev.filter(x => x.id !== item.id));
      toast('Updated to AI suggestion.', 'success');
    } catch (err) {
      toast('Failed: ' + err.message, 'error');
    } finally {
      setReviewBusyId(null);
    }
  };

  const dismissSuggestion = async (item) => {
    setReviewBusyId(item.id);
    try {
      await deleteDoc(doc(db, 'answerReviewQueue', item.id));
      setReviewItems(prev => prev.filter(x => x.id !== item.id));
      toast('Kept original answer.', 'info');
    } catch (err) {
      toast('Failed: ' + err.message, 'error');
    } finally {
      setReviewBusyId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 6 }}>🩺 Answer Audit</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Two ways to fix wrong answers across the whole question bank{questionCount != null ? ` (currently ${questionCount} questions)` : ''}:
          export &amp; correct offline, or let AI re-check every question and either auto-fix
          confident cases or flag uncertain ones for you to review.
        </p>
      </div>

      {/* ── A) EXPORT / CORRECT / RE-UPLOAD ── */}
      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>📥 1. Download, correct, re-upload</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
          Downloads every question as a CSV (Excel-friendly), including a hidden <code>id</code> column.
          Fix the <code>answer</code> column (or anything else) and upload the same file back —
          rows are matched by <code>id</code> and update the existing question, they don't create duplicates.
          Don't remove or edit the <code>id</code> column.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <button className="btn btn-primary" disabled={loading} onClick={handleExport}>
            {loading ? 'Working…' : '⬇️ Download full question bank (CSV)'}
          </button>
          <button className="btn btn-secondary" disabled={loading} onClick={() => fileInputRef.current?.click()}>
            ⬆️ Upload corrected CSV
          </button>
          <input
            ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={handleCorrectionFile}
          />
        </div>

        {correctionRows && (
          <div style={{ marginTop: 16 }}>
            {correctionRows.warnings?.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--warning, #b45309)', marginBottom: 10 }}>
                {correctionRows.warnings.slice(0, 6).map((w, i) => <div key={i}>⚠️ {w}</div>)}
              </div>
            )}
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              <b>{correctionRows.diffs.length}</b> question(s) will change ·{' '}
              {correctionRows.unchanged} unchanged ·{' '}
              {correctionRows.missing} row(s) not matched to any question
            </div>

            {correctionRows.diffs.length > 0 && (
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {correctionRows.diffs.slice(0, 200).map(({ update, diff }) => (
                  <div key={update.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                      {(update.question || '').slice(0, 100) || '(question text unchanged)'}
                    </div>
                    {diff.changes.map((c, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        <b>{c.field}:</b>{' '}
                        <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{String(c.from).slice(0, 80)}</span>
                        {' → '}
                        <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{String(c.to).slice(0, 80)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {correctionRows.diffs.length > 0 && (
              <button
                className="btn btn-primary" style={{ marginTop: 12 }}
                disabled={applyingCorrections}
                onClick={applyCorrections}
              >
                {applyingCorrections ? 'Applying…' : `✅ Apply ${correctionRows.diffs.length} correction(s) to Firestore`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── A2) DOWNLOAD REMAINING (skip already-reviewed batches) ── */}
      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>📦 Download only what's left to review</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
          Already reviewed some batches offline? Upload the CSV file(s) you've finished — same format as above —
          and this pulls every question <em>not</em> in those files and downloads it split into fresh
          300-row batches, so you're never re-reviewing the same questions twice.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <button className="btn btn-secondary" disabled={remainingLoading} onClick={() => reviewedFilesRef.current?.click()}>
            📁 Select already-reviewed CSV(s)
          </button>
          <input
            ref={reviewedFilesRef} type="file" accept=".csv" multiple style={{ display: 'none' }}
            onChange={handleReviewedFiles}
          />
          {reviewedIdInfo && (
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              {reviewedIdInfo.idSet.size} reviewed ID(s) loaded from {reviewedIdInfo.perFile.length} file(s)
            </span>
          )}
        </div>

        {reviewedIdInfo && (
          <button
            className="btn btn-primary" style={{ marginTop: 12 }}
            disabled={remainingLoading} onClick={previewRemaining}
          >
            {remainingLoading ? 'Checking against live question bank…' : '🔍 Find what\'s left'}
          </button>
        )}

        {remainingPreview && remainingPreview.remainingCount > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              <b>{remainingPreview.remainingCount}</b> question(s) left to review
              ({remainingPreview.excludedCount} already covered) —
              will download as <b>{remainingPreview.batches.length}</b> file(s) of up to 300 rows each.
            </div>
            <button
              className="btn btn-primary" disabled={downloadingBatches}
              onClick={downloadAllRemainingBatches}
            >
              {downloadingBatches ? 'Downloading…' : `⬇️ Download all ${remainingPreview.batches.length} remaining batch(es)`}
            </button>
          </div>
        )}
      </section>

      {/* ── B) AI VERIFICATION SWEEP ── */}
      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>🤖 2. AI verification sweep</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
          Gemini independently re-solves every question and compares its answer to what's stored.
          Disagreements with confidence ≥ {AUTO_FIX_CONFIDENCE}% are <b>auto-fixed</b> immediately
          (the original answer is kept in <code>aiPreviousCorrectIndex</code> so it can be reversed).
          Lower-confidence disagreements are <b>flagged</b> below for you to accept or dismiss.
        </p>

        <button className="btn btn-primary" disabled={sweepRunning} onClick={runAiSweep}>
          {sweepRunning ? `Verifying… (${sweepProgress.done}/${sweepProgress.total})` : '🚀 Run AI verification on entire question bank'}
        </button>

        {sweepRunning && sweepProgress.total > 0 && (
          <div style={{ marginTop: 12, background: 'var(--bg-tertiary)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
            <div style={{
              width: `${(sweepProgress.done / sweepProgress.total) * 100}%`,
              background: 'var(--teal)', height: '100%', transition: 'width 0.2s',
            }} />
          </div>
        )}

        {sweepSummary && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, fontSize: 13 }}>
            <div>✅ Confirmed correct: <b>{sweepSummary.agree}</b></div>
            <div>🔧 Auto-fixed: <b>{sweepSummary.autoFixed}</b></div>
            <div>🚩 Flagged for review: <b>{sweepSummary.flagged}</b></div>
            {sweepSummary.errors > 0 && <div>⚠️ Errors: <b>{sweepSummary.errors}</b></div>}
          </div>
        )}
      </section>

      {/* ── REVIEW QUEUE ── */}
      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>🚩 3. Flagged for your review</div>
          <button className="btn btn-secondary btn-sm" disabled={reviewLoading} onClick={loadReviewQueue}>
            {reviewLoading ? 'Loading…' : (reviewItems ? '↻ Refresh' : 'Load queue')}
          </button>
        </div>

        {reviewItems && reviewItems.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing pending review right now. 🎉</p>
        )}

        {reviewItems && reviewItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {reviewItems.map(item => {
              const opts = item.options || [];
              const curLetter = OPT_LETTERS[item.currentIndex] || '?';
              return (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{item.question}</div>
                  {opts.map((o, i) => {
                    const letter = OPT_LETTERS[i];
                    const isCurrent = i === item.currentIndex;
                    const isSuggested = i === item.suggestedIndex;
                    return (
                      <div key={i} style={{
                        fontSize: 12.5, padding: '4px 8px', borderRadius: 6, marginBottom: 3,
                        background: isSuggested ? 'rgba(20,184,166,0.15)' : isCurrent ? 'rgba(239,68,68,0.1)' : 'transparent',
                      }}>
                        <b>{letter}.</b> {o}
                        {isCurrent && <span style={{ marginLeft: 8, fontSize: 10.5, color: '#ef4444', fontWeight: 700 }}>CURRENT ANSWER</span>}
                        {isSuggested && <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--teal)', fontWeight: 700 }}>AI SUGGESTS</span>}
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                    Confidence: {item.confidence}% — {item.reasoning}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      className="btn btn-primary btn-sm" disabled={reviewBusyId === item.id}
                      onClick={() => acceptSuggestion(item)}
                    >
                      ✅ Accept AI ({item.suggestedLetter})
                    </button>
                    <button
                      className="btn btn-secondary btn-sm" disabled={reviewBusyId === item.id}
                      onClick={() => dismissSuggestion(item)}
                    >
                      ✖️ Keep current ({curLetter})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
