// src/components/admin/ScheduledExamsManager.jsx
//
// Drop this inside QuestionsManager.jsx as a new tab section:
//
//   import ScheduledExamsManager from './ScheduledExamsManager';
//   ...
//   {activeTab === 'scheduled' && <ScheduledExamsManager />}
//
// Writes to: 'exams' collection (examType: 'daily_practice' | 'mock_exam' | 'topic_drill')
// Questions are tagged via 'scheduledExamId' field in the 'questions' collection.
// ExamSession.jsx and DailyPracticeArchivePage.jsx already consume this shape.

import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';

// ── Constants ────────────────────────────────────────────────────────────────

const EXAM_TYPE_OPTIONS = [
  { value: 'daily_practice', label: 'Daily Practice Quiz', badge: 'D', color: 'teal' },
  { value: 'mock_exam',      label: 'Mock Exam',           badge: 'M', color: 'amber' },
  { value: 'topic_drill',    label: 'Topic Drill',         badge: 'T', color: 'blue'  },
];

const DIFFICULTY_OPTIONS = ['Easy', 'Medium', 'Hard', 'Mixed'];

const SOURCE_OPTIONS = [
  'Random from Bank',
  'NMCN Past Questions',
  'Practice Questions',
];

const VISIBILITY_OPTIONS = [
  { value: 'all',     label: 'All Subscribed Students' },
  { value: 'free',    label: 'Free Tier Only' },
  { value: 'premium', label: 'Premium Tier Only' },
];

// ── Colour helpers ───────────────────────────────────────────────────────────

const COLOR = {
  teal:  { bg: 'rgba(0,184,156,0.12)',  text: '#00b89c', border: 'rgba(0,184,156,0.3)'  },
  amber: { bg: 'rgba(245,166,35,0.12)', text: '#f5a623', border: 'rgba(245,166,35,0.3)' },
  blue:  { bg: 'rgba(74,158,255,0.12)', text: '#4a9eff', border: 'rgba(74,158,255,0.3)' },
  red:   { bg: 'rgba(224,92,92,0.12)',  text: '#e05c5c', border: 'rgba(224,92,92,0.3)'  },
};

function typeColor(examType) {
  const found = EXAM_TYPE_OPTIONS.find(o => o.value === examType);
  return COLOR[found?.color] || COLOR.teal;
}

function typeBadge(examType) {
  return EXAM_TYPE_OPTIONS.find(o => o.value === examType)?.badge || '?';
}

function typeLabel(examType) {
  return EXAM_TYPE_OPTIONS.find(o => o.value === examType)?.label || examType;
}

function scoreColor(pct) {
  return pct >= 70 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#EF4444';
}

// ── Empty form state ─────────────────────────────────────────────────────────

function emptyForm() {
  return {
    examType:       'daily_practice',
    category:       '',
    totalQuestions: 20,
    difficulty:     'Medium',
    timeLimitMins:  30,
    customTitle:    '',
    source:         'Random from Bank',
    visibility:     'all',
    publishNow:     true,
    shuffleQ:       true,
    showAnswers:    false,
  };
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ScheduledExamsManager() {
  const [exams,      setExams]      = useState([]);
  const [sessions,   setSessions]   = useState({}); // { examId: count }
  const [loading,    setLoading]    = useState(true);
  const [view,       setView]       = useState('list'); // 'list' | 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(emptyForm());
  const [saving,     setSaving]     = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [search,     setSearch]     = useState('');
  const [toast,      setToast]      = useState(null);

  // ── Load ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [examSnap, sessSnap] = await Promise.all([
        getDocs(query(collection(db, 'exams'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'examSessions')),
      ]);

      const allExams = examSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setExams(allExams);

      // Count attempts per exam
      const counts = {};
      sessSnap.docs.forEach(d => {
        const s = d.data();
        const key = s.scheduledExamId || s.examId;
        if (key) counts[key] = (counts[key] || 0) + 1;
      });
      setSessions(counts);
    } catch (e) {
      console.error('ScheduledExamsManager load error:', e);
      showToast('Failed to load exams.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Toast ─────────────────────────────────────────────────────

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Derived stats ─────────────────────────────────────────────

  const activeExams  = exams.filter(e => e.active !== false);
  const totalAttempts = Object.values(sessions).reduce((a, v) => a + v, 0);
  const totalQuestions = exams.reduce((a, e) => a + (Number(e.totalQuestions) || 0), 0);

  // ── Filtered list ─────────────────────────────────────────────

  const filteredExams = exams.filter(e => {
    const matchType   = filterType === 'all' || e.examType === filterType;
    const matchSearch = !search || (e.name || '').toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  // ── Build exam name ───────────────────────────────────────────

  function buildName(f) {
    if (f.customTitle.trim()) return f.customTitle.trim();
    const cat  = NURSING_CATEGORIES.find(c => c.id === f.category)?.name || f.category || 'General';
    const type = typeLabel(f.examType);
    const now  = new Date().toLocaleDateString('en-NG', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    return `${cat} ${type} — ${now}`;
  }

  // ── Save (create / update) ────────────────────────────────────

  async function handleSave() {
    if (!form.category) { showToast('Please select a category.', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name:           buildName(form),
        examType:       form.examType,
        category:       form.category,
        totalQuestions: Number(form.totalQuestions) || 20,
        difficulty:     form.difficulty.toLowerCase(),
        timeLimitMins:  Number(form.timeLimitMins) || 0,
        timeLimit:      Number(form.timeLimitMins) || 0, // alias consumed by ExamSession
        source:         form.source,
        visibility:     form.visibility,
        shuffleQ:       form.shuffleQ,
        showAnswers:    form.showAnswers,
        active:         form.publishNow,
        updatedAt:      serverTimestamp(),
      };

      if (editTarget) {
        await updateDoc(doc(db, 'exams', editTarget.id), payload);
        showToast('Exam updated.');
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'exams'), payload);
        showToast('Exam published!');
      }

      setView('list');
      setEditTarget(null);
      setForm(emptyForm());
      await loadData();
    } catch (e) {
      console.error('Save error:', e);
      showToast('Save failed. Check console.', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle active ─────────────────────────────────────────────

  async function toggleActive(exam) {
    try {
      await updateDoc(doc(db, 'exams', exam.id), {
        active:    !exam.active,
        updatedAt: serverTimestamp(),
      });
      showToast(exam.active ? 'Exam unpublished.' : 'Exam published.');
      await loadData();
    } catch (e) {
      showToast('Update failed.', 'error');
    }
  }

  // ── Delete ────────────────────────────────────────────────────

  async function handleDelete(exam) {
    const attempts = sessions[exam.id] || 0;
    const msg = attempts > 0
      ? `Delete "${exam.name}"? It has ${attempts} student attempt(s). This cannot be undone.`
      : `Delete "${exam.name}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await deleteDoc(doc(db, 'exams', exam.id));
      showToast('Exam deleted.');
      await loadData();
    } catch (e) {
      showToast('Delete failed.', 'error');
    }
  }

  // ── Open edit ─────────────────────────────────────────────────

  function openEdit(exam) {
    setEditTarget(exam);
    setForm({
      examType:       exam.examType       || 'daily_practice',
      category:       exam.category       || '',
      totalQuestions: exam.totalQuestions || 20,
      difficulty:     exam.difficulty     ? exam.difficulty.charAt(0).toUpperCase() + exam.difficulty.slice(1) : 'Medium',
      timeLimitMins:  exam.timeLimitMins  || exam.timeLimit || 30,
      customTitle:    exam.name           || '',
      source:         exam.source         || 'Random from Bank',
      visibility:     exam.visibility     || 'all',
      publishNow:     exam.active         !== false,
      shuffleQ:       exam.shuffleQ       !== false,
      showAnswers:    exam.showAnswers     || false,
    });
    setView('create');
  }

  // ── Field helper ──────────────────────────────────────────────

  function field(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'error' ? '#EF4444' : 'var(--teal)',
          color: '#fff', padding: '10px 18px', borderRadius: 10,
          fontWeight: 700, fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Section header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            🗓️ Scheduled Exams Manager
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Create daily practice quizzes and mock exams. Students can take them anytime.
          </p>
        </div>
        {view === 'list' && (
          <button
            className="btn btn-primary"
            onClick={() => { setForm(emptyForm()); setEditTarget(null); setView('create'); }}
          >
            + New Scheduled Exam
          </button>
        )}
      </div>

      {/* ── STATS ROW ── */}
      {view === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Active Exams',    value: activeExams.length,  color: 'var(--teal)' },
            { label: 'Total Questions', value: totalQuestions,       color: '#F59E0B'     },
            { label: 'Student Attempts',value: totalAttempts,        color: 'var(--text-primary)' },
          ].map(s => (
            <div key={s.label} style={S.statCard}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="form-input"
              style={{ height: 36, width: 220, fontSize: 13 }}
              placeholder="🔍 Search exams…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { value: 'all',            label: 'All'   },
                { value: 'daily_practice', label: 'Daily' },
                { value: 'mock_exam',      label: 'Mock'  },
                { value: 'topic_drill',    label: 'Topic' },
              ].map(t => (
                <button
                  key={t.value}
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFilterType(t.value)}
                  style={{
                    borderColor: filterType === t.value ? 'var(--teal)' : 'var(--border)',
                    color:       filterType === t.value ? 'var(--teal)' : 'var(--text-muted)',
                    background:  filterType === t.value ? 'rgba(13,148,136,0.08)' : 'transparent',
                    fontWeight:  filterType === t.value ? 700 : 400,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Info note */}
          <div style={S.noteBox}>
            ℹ️ Scheduled exams go live immediately when published. Students can attempt them anytime from the Practice tab.
          </div>

          {/* Exam list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <span className="spinner" style={{ width: 28, height: 28 }} />
              <p style={{ marginTop: 10 }}>Loading exams…</p>
            </div>
          ) : filteredExams.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {search || filterType !== 'all' ? 'No matching exams' : 'No scheduled exams yet'}
              </div>
              <div style={{ fontSize: 13 }}>
                {search || filterType !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Click "+ New Scheduled Exam" to create your first one.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredExams.map(exam => {
                const col      = typeColor(exam.examType);
                const attempts = sessions[exam.id] || 0;
                const date     = exam.createdAt?.toDate
                  ? new Date(exam.createdAt.toDate()).toLocaleDateString('en-NG', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })
                  : '—';
                const isNew = exam.createdAt?.seconds
                  && (Date.now() / 1000 - exam.createdAt.seconds) < 86400;

                return (
                  <div key={exam.id} style={{
                    ...S.listRow,
                    opacity: exam.active === false ? 0.6 : 1,
                    borderLeft: `4px solid ${col.text}`,
                  }}>
                    {/* Badge */}
                    <div style={{
                      ...S.badge,
                      background: col.bg,
                      color: col.text,
                      border: `1px solid ${col.border}`,
                    }}>
                      {typeBadge(exam.examType)}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                          {exam.name}
                        </span>
                        {isNew && <span style={{ ...S.pill, background: 'rgba(13,148,136,0.15)', color: 'var(--teal)', border: '1px solid rgba(13,148,136,0.3)' }}>NEW</span>}
                        <span style={{
                          ...S.pill,
                          background: exam.active !== false ? 'rgba(22,163,74,0.1)' : 'var(--bg-tertiary)',
                          color:      exam.active !== false ? '#16A34A' : 'var(--text-muted)',
                          border:     `1px solid ${exam.active !== false ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
                        }}>
                          {exam.active !== false ? 'Active' : 'Draft'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {exam.totalQuestions || '?'} questions
                        {exam.category ? ` · ${exam.category}` : ''}
                        {exam.difficulty ? ` · ${exam.difficulty}` : ''}
                        {` · ${date}`}
                        {attempts > 0 && (
                          <span style={{ color: 'var(--teal)', fontWeight: 700, marginLeft: 8 }}>
                            {attempts} attempt{attempts !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        title={exam.active !== false ? 'Unpublish' : 'Publish'}
                        onClick={() => toggleActive(exam)}
                        style={{ fontSize: 14 }}
                      >
                        {exam.active !== false ? '⏸' : '▶'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Edit"
                        onClick={() => openEdit(exam)}
                        style={{ fontSize: 14 }}
                      >
                        ✎
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Delete"
                        onClick={() => handleDelete(exam)}
                        style={{ fontSize: 14, color: '#EF4444' }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── CREATE / EDIT FORM ── */}
      {view === 'create' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setView('list'); setEditTarget(null); setForm(emptyForm()); }}
            >
              ← Back
            </button>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              {editTarget ? 'Edit Exam' : 'New Scheduled Exam'}
            </span>
          </div>

          {/* Preview name */}
          <div style={{ ...S.noteBox, marginBottom: 16 }}>
            📌 Exam will be named: <strong style={{ color: 'var(--teal)' }}>{buildName(form)}</strong>
          </div>

          {/* Card 1: Exam Details */}
          <div style={S.formCard}>
            <div style={S.cardTitle}>📋 Exam Details</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={S.field}>
                <label style={S.label}>Exam Type *</label>
                <select className="form-select" value={form.examType} onChange={e => field('examType', e.target.value)}>
                  {EXAM_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Category *</label>
                <select className="form-select" value={form.category} onChange={e => field('category', e.target.value)}>
                  <option value="">— Select Category —</option>
                  {NURSING_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={S.field}>
                <label style={S.label}>No. of Questions *</label>
                <input
                  className="form-input"
                  type="number" min="5" max="200"
                  value={form.totalQuestions}
                  onChange={e => field('totalQuestions', Number(e.target.value))}
                />
              </div>
              <div style={S.field}>
                <label style={S.label}>Difficulty</label>
                <select className="form-select" value={form.difficulty} onChange={e => field('difficulty', e.target.value)}>
                  {DIFFICULTY_OPTIONS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Time Limit (mins)</label>
                <input
                  className="form-input"
                  type="number" min="0" max="300"
                  placeholder="0 = no limit"
                  value={form.timeLimitMins}
                  onChange={e => field('timeLimitMins', Number(e.target.value))}
                />
              </div>
            </div>

            <div style={S.field}>
              <label style={S.label}>Custom Title (optional)</label>
              <input
                className="form-input"
                type="text"
                placeholder="Auto-generated if blank"
                value={form.customTitle}
                onChange={e => field('customTitle', e.target.value)}
              />
            </div>
          </div>

          {/* Card 2: Source & Visibility */}
          <div style={S.formCard}>
            <div style={S.cardTitle}>⚙️ Source & Availability</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={S.field}>
                <label style={S.label}>Question Source</label>
                <select className="form-select" value={form.source} onChange={e => field('source', e.target.value)}>
                  {SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Visible To</label>
                <select className="form-select" value={form.visibility} onChange={e => field('visibility', e.target.value)}>
                  {VISIBILITY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Toggles */}
            {[
              { key: 'publishNow',  label: 'Publish immediately (students can start right away)' },
              { key: 'shuffleQ',    label: 'Shuffle question order for each student' },
              { key: 'showAnswers', label: 'Show correct answers after submission' },
            ].map(t => (
              <div key={t.key} style={S.toggleRow}>
                <label style={S.toggleWrap}>
                  <input
                    type="checkbox"
                    checked={form[t.key]}
                    onChange={e => field(t.key, e.target.checked)}
                    style={{ display: 'none' }}
                    id={`toggle-${t.key}`}
                  />
                  <div
                    style={{
                      width: 40, height: 22, borderRadius: 11,
                      background: form[t.key] ? 'var(--teal)' : 'var(--border)',
                      position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    onClick={() => field(t.key, !form[t.key])}
                  >
                    <div style={{
                      position: 'absolute', top: 3,
                      left: form[t.key] ? 21 : 3,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s',
                    }} />
                  </div>
                </label>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t.label}</span>
              </div>
            ))}
          </div>

          {/* Save row */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              className="btn btn-ghost"
              onClick={() => { setView('list'); setEditTarget(null); setForm(emptyForm()); }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '⏳ Saving…' : editTarget ? '✓ Update Exam' : '✓ Save & Publish'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const S = {
  statCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '14px 16px',
  },
  noteBox: {
    background: 'rgba(13,148,136,0.08)',
    border: '1px solid rgba(13,148,136,0.2)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 20,
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    transition: 'border-color 0.15s',
  },
  badge: {
    minWidth: 34, height: 34,
    borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 13, flexShrink: 0,
  },
  pill: {
    fontSize: 10, fontWeight: 800,
    padding: '2px 8px', borderRadius: 20,
  },
  formCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 12, fontWeight: 700,
    color: 'var(--teal)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' },
  toggleWrap: { cursor: 'pointer', display: 'flex' },
};