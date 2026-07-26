// src/components/admin/AutoTagQuestionsTab.jsx
//
// Finds every question missing a course and/or topic tag, sends them to the
// AI in batches of 100 for suggested { course, topic }, lets the admin
// review/edit every suggestion inline, then saves the approved batch to
// Firestore in one write. Repeats batch-by-batch until everything is tagged.
//
// Nothing is ever auto-saved — the AI only fills the review table; the admin
// always clicks "Save" for a batch before anything touches Firestore.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, getDocs, query, orderBy, writeBatch, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getAiTagsForBatch, toTagPayload } from '../../utils/aiAutoTag';

const H = "'Arial Black',Arial,sans-serif";
const TEAL  = '#0D9488';
const GOLD  = '#F59E0B';
const GREEN = '#22C55E';
const RED   = '#EF4444';
const GREY  = '#6B7280';
const BATCH_SIZE = 100;

const CONF_COLOR = { high: GREEN, medium: GOLD, low: RED };

function isUntagged(q) {
  return !q.course || !String(q.course).trim() || !q.topic || !String(q.topic).trim();
}

export default function AutoTagQuestionsTab({ firestoreCourses, toast }) {
  const [loading,     setLoading]     = useState(false);
  const [untagged,    setUntagged]    = useState([]);   // full backlog, oldest-first batching
  const [batchIndex,  setBatchIndex]  = useState(0);     // which BATCH_SIZE chunk we're on
  const [suggestions, setSuggestions] = useState({});    // { [id]: { courseId, topic, confidence } }
  const [excluded,    setExcluded]    = useState(new Set()); // ids the admin unchecked (skip on save)
  const [suggesting,  setSuggesting]  = useState(false);
  const [saving,      setSaving]      = useState(false);

  const courseLabel = useCallback(
    (id) => firestoreCourses.find(c => c.id === id)?.label || id,
    [firestoreCourses]
  );

  // ── load full untagged backlog once ──────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setSuggestions({});
    setExcluded(new Set());
    setBatchIndex(0);
    try {
      const snap = await getDocs(query(collection(db, 'questions'), orderBy('createdAt', 'desc')));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUntagged(all.filter(isUntagged));
    } catch (e) {
      toast('Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const totalBatches = Math.max(1, Math.ceil(untagged.length / BATCH_SIZE));
  const currentBatch = useMemo(
    () => untagged.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE),
    [untagged, batchIndex]
  );
  const hasSuggestions = currentBatch.length > 0 && currentBatch.every(q => suggestions[q.id] !== undefined);

  // ── ask the AI to tag the current batch ──────────────────────────────────
  const runAiSuggestions = async () => {
    if (currentBatch.length === 0) return;
    if (firestoreCourses.length === 0) {
      toast('No courses exist yet — create courses first so the AI has something to tag into.', 'error');
      return;
    }
    setSuggesting(true);
    try {
      const payload = currentBatch.map(toTagPayload);
      const results = await getAiTagsForBatch(
        payload,
        firestoreCourses.map(c => ({ id: c.id, label: c.label, category: c.category }))
      );
      const next = {};
      results.forEach(r => { next[r.id] = { courseId: r.courseId, topic: r.topic, confidence: r.confidence }; });
      setSuggestions(prev => ({ ...prev, ...next }));
      toast(`✨ Suggested tags for ${results.length} question(s) — review below.`, 'success');
    } catch (e) {
      toast('AI tagging failed: ' + e.message, 'error');
    } finally {
      setSuggesting(false);
    }
  };

  // ── edit a single suggestion inline ──────────────────────────────────────
  const editSuggestion = (id, field, value) => {
    setSuggestions(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const toggleExcluded = (id) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── save approved rows of the current batch, then advance ───────────────
  const saveBatch = async () => {
    const rows = currentBatch.filter(q => !excluded.has(q.id) && suggestions[q.id]?.courseId && suggestions[q.id]?.topic);
    if (rows.length === 0) { toast('Nothing to save — approve at least one suggestion first.', 'info'); return; }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      rows.forEach(q => {
        const s = suggestions[q.id];
        batch.update(doc(db, 'questions', q.id), {
          course: s.courseId,
          topic: s.topic,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      const savedIds = new Set(rows.map(q => q.id));
      setUntagged(prev => prev.filter(q => !savedIds.has(q.id)));
      setSuggestions({});
      setExcluded(new Set());
      setBatchIndex(0); // backlog shrank — restart at the new first batch
      toast(`✅ Tagged and saved ${rows.length} question${rows.length > 1 ? 's' : ''}.`, 'success');
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10, marginBottom: 16,
      }}>
        <div>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)' }}>
            🏷️ Auto-Tag Untagged Questions
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {loading
              ? 'Scanning question bank…'
              : `${untagged.length} question${untagged.length === 1 ? '' : 's'} missing a course or topic — ` +
                `working in batches of ${BATCH_SIZE}, batch ${Math.min(batchIndex + 1, totalBatches)} of ${totalBatches}.`}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          🔄 Rescan
        </button>
      </div>

      {!loading && untagged.length === 0 && (
        <div style={{
          padding: 24, borderRadius: 12, textAlign: 'center',
          background: 'rgba(34,197,94,0.08)', border: `1px solid ${GREEN}40`, color: GREEN, fontWeight: 700,
        }}>
          🎉 Every question already has a course and topic.
        </div>
      )}

      {!loading && currentBatch.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              onClick={runAiSuggestions}
              disabled={suggesting}
              style={{
                padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: TEAL, color: '#fff', fontWeight: 900, fontSize: 13, fontFamily: H,
              }}
            >
              {suggesting ? '⏳ Getting AI suggestions…' : `✨ Suggest Tags for This Batch (${currentBatch.length})`}
            </button>

            {hasSuggestions && (
              <button
                onClick={saveBatch}
                disabled={saving}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: GREEN, color: '#fff', fontWeight: 900, fontSize: 13, fontFamily: H,
                }}
              >
                {saving ? '⏳ Saving…' : `💾 Save Approved & Continue`}
              </button>
            )}
          </div>

          {hasSuggestions && (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', textAlign: 'left' }}>
                    <th style={{ padding: 8, width: 30 }}></th>
                    <th style={{ padding: 8 }}>Question</th>
                    <th style={{ padding: 8, width: 200 }}>Course</th>
                    <th style={{ padding: 8, width: 180 }}>Topic</th>
                    <th style={{ padding: 8, width: 80 }}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBatch.map(q => {
                    const s = suggestions[q.id] || { courseId: '', topic: '', confidence: 'low' };
                    const skip = excluded.has(q.id);
                    return (
                      <tr key={q.id} style={{ borderTop: '1px solid var(--border)', opacity: skip ? 0.45 : 1 }}>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={!skip}
                            onChange={() => toggleExcluded(q.id)}
                            title={skip ? 'Excluded — will not be saved' : 'Included — will be saved'}
                            style={{ accentColor: TEAL, cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: 8, maxWidth: 360 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {q.question || <em style={{ color: GREY }}>(no question text)</em>}
                          </div>
                        </td>
                        <td style={{ padding: 8 }}>
                          <select
                            className="form-input"
                            style={{ height: 30, fontSize: 12, padding: '2px 6px', width: '100%' }}
                            value={s.courseId}
                            onChange={e => editSuggestion(q.id, 'courseId', e.target.value)}
                          >
                            <option value="">— none —</option>
                            {firestoreCourses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 8 }}>
                          <input
                            className="form-input"
                            style={{ height: 30, fontSize: 12, padding: '2px 6px', width: '100%' }}
                            value={s.topic}
                            onChange={e => editSuggestion(q.id, 'topic', e.target.value)}
                            placeholder="topic…"
                          />
                        </td>
                        <td style={{ padding: 8 }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                            fontSize: 10, fontWeight: 800, fontFamily: H,
                            background: `${CONF_COLOR[s.confidence] || GREY}18`,
                            color: CONF_COLOR[s.confidence] || GREY,
                            border: `1px solid ${CONF_COLOR[s.confidence] || GREY}40`,
                          }}>
                            {s.confidence || 'low'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!hasSuggestions && !suggesting && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Click "Suggest Tags for This Batch" to get AI-suggested course + topic for these {currentBatch.length} questions.
              Nothing saves until you review and click "Save Approved & Continue".
            </div>
          )}
        </>
      )}
    </div>
  );
}
