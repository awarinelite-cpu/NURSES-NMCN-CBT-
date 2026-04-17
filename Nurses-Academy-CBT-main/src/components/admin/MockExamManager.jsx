// src/components/admin/MockExamManager.jsx
//
// Route: /admin/mock-exams
//
// LAYOUT:
//   Level 0 — All specialties as cards (mock exam count + question count)
//   Level 1 — Click specialty → list of its mock exams
//             Each exam: question count, active/inactive toggle, edit, delete
//             + Add Mock Exam inline form
//
// FIRESTORE — mockExams collection:
//   { title, category, description, timeLimit, active, createdAt, updatedAt }
//
//   active: true  → visible to students on MockExamPage
//   active: false → hidden from students
//
// FIRESTORE — questions collection (existing):
//   Questions are linked to a mock exam via:
//     examType:   'mock_exam'
//     mockExamId: <exam document id>
//     active:     true
//
//   When uploading questions for a mock exam in the Questions Manager,
//   set examType = 'mock_exam' and mockExamId = the exam's Firestore doc ID.

import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, deleteDoc, updateDoc,
  doc, setDoc, serverTimestamp, orderBy, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';
import { useToast } from '../shared/Toast';

export default function MockExamManager() {
  const { toast } = useToast();

  const [selectedSpecialty, setSelectedSpecialty] = useState(null);
  const [mockExams,         setMockExams]         = useState([]);
  const [questionCounts,    setQuestionCounts]    = useState({});  // { examId: count }
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [deletingId,        setDeletingId]        = useState(null);
  const [togglingId,        setTogglingId]        = useState(null);
  const [showAddForm,       setShowAddForm]       = useState(false);
  const [editId,            setEditId]            = useState(null);
  const [search,            setSearch]            = useState('');

  // Form state
  const [formTitle,     setFormTitle]     = useState('');
  const [formDesc,      setFormDesc]      = useState('');
  const [formTimeLimit, setFormTimeLimit] = useState('');   // empty string = no limit
  const [formActive,    setFormActive]    = useState(true);

  // ── Load all mock exams ─────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'mockExams'), orderBy('title', 'asc')));
      const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMockExams(all);

      // Fetch question counts per exam in parallel
      const counts = await Promise.all(
        all.map(async exam => {
          try {
            const qSnap = await getDocs(query(
              collection(db, 'questions'),
              where('examType',   '==', 'mock_exam'),
              where('mockExamId', '==', exam.id),
              where('active',     '==', true),
            ));
            return [exam.id, qSnap.size];
          } catch {
            return [exam.id, 0];
          }
        })
      );
      setQuestionCounts(Object.fromEntries(counts));
    } catch (e) {
      console.error('MockExamManager load error:', e);
      setMockExams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const examsForSpecialty = (specialtyId) =>
    mockExams.filter(e => e.category === specialtyId);

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormTimeLimit(''); setFormActive(true);
    setEditId(null); setShowAddForm(false);
  };

  // ── Save (add or edit) ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formTitle.trim()) { toast('Exam title is required.', 'error'); return; }
    if (!selectedSpecialty) return;
    setSaving(true);
    try {
      const timeLimitNum = formTimeLimit === '' || formTimeLimit === '0'
        ? 0
        : Math.max(1, parseInt(formTimeLimit, 10) || 0);

      if (editId) {
        await updateDoc(doc(db, 'mockExams', editId), {
          title:       formTitle.trim(),
          description: formDesc.trim(),
          timeLimit:   timeLimitNum,
          active:      formActive,
          updatedAt:   serverTimestamp(),
        });
        toast('Mock exam updated!', 'success');
      } else {
        const slug  = formTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const newId = `${selectedSpecialty.id}_${slug}_${Date.now()}`;
        await setDoc(doc(db, 'mockExams', newId), {
          title:       formTitle.trim(),
          category:    selectedSpecialty.id,
          description: formDesc.trim(),
          timeLimit:   timeLimitNum,
          active:      formActive,
          createdAt:   serverTimestamp(),
        });
        toast('Mock exam created! Copy the Exam ID to link questions to it.', 'success');
      }
      resetForm();
      await loadData();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const handleEdit = (exam) => {
    setFormTitle(exam.title || '');
    setFormDesc(exam.description || '');
    setFormTimeLimit(exam.timeLimit > 0 ? String(exam.timeLimit) : '');
    setFormActive(exam.active !== false);
    setEditId(exam.id);
    setShowAddForm(true);
  };

  // ── Toggle active ───────────────────────────────────────────────────────────
  const handleToggleActive = async (exam) => {
    const newActive = exam.active === false ? true : false;
    setTogglingId(exam.id);
    try {
      await updateDoc(doc(db, 'mockExams', exam.id), {
        active:    newActive,
        updatedAt: serverTimestamp(),
      });
      toast(
        `"${exam.title}" is now ${newActive ? 'visible to students' : 'hidden from students'}.`,
        'success'
      );
      await loadData();
    } catch (e) {
      toast('Toggle failed: ' + e.message, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (exam) => {
    const qCount = questionCounts[exam.id] || 0;
    const warn = qCount > 0
      ? `\n\n⚠️ This exam has ${qCount} question${qCount !== 1 ? 's' : ''} linked to it. Those questions will still exist in the database but won't appear in this exam.`
      : '';
    if (!window.confirm(`Permanently delete "${exam.title}"?${warn}`)) return;
    setDeletingId(exam.id);
    try {
      await deleteDoc(doc(db, 'mockExams', exam.id));
      toast(`"${exam.title}" deleted.`, 'success');
      await loadData();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // LEVEL 1 — Specialty detail view
  // ══════════════════════════════════════════════════════════════════════════
  if (selectedSpecialty) {
    const allExams     = examsForSpecialty(selectedSpecialty.id);
    const filtered     = search.trim()
      ? allExams.filter(e => e.title.toLowerCase().includes(search.toLowerCase()))
      : allExams;
    const activeCount  = allExams.filter(e => e.active !== false).length;

    return (
      <div style={{ padding: 24, maxWidth: 900 }}>

        {/* Back button */}
        <button
          style={styles.backBtn}
          onClick={() => { setSelectedSpecialty(null); resetForm(); setSearch(''); }}
        >
          ← Back to Specialties
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <div style={{ ...styles.specialtyIcon, background: `${selectedSpecialty.color}20`, width: 52, height: 52 }}>
            <span style={{ fontSize: 26 }}>{selectedSpecialty.icon}</span>
          </div>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              {selectedSpecialty.label}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '3px 0 0' }}>
              {activeCount} active · {allExams.length - activeCount} inactive · {allExams.length} total
            </p>
          </div>
        </div>

        {/* How questions link — info box */}
        <div style={{
          background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)',
          borderRadius: 12, padding: '12px 16px', marginTop: 16, marginBottom: 20,
          fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          💡 <strong>Linking questions:</strong> After creating a mock exam, copy its <strong>Exam ID</strong> shown on the card.
          In the Questions Manager, upload questions with{' '}
          <code style={{ background: 'rgba(13,148,136,0.15)', padding: '1px 6px', borderRadius: 4 }}>examType = mock_exam</code>{' '}
          and{' '}
          <code style={{ background: 'rgba(13,148,136,0.15)', padding: '1px 6px', borderRadius: 4 }}>mockExamId = &lt;Exam ID&gt;</code>.
        </div>

        {/* Search + Add button row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search exams…"
            style={{
              flex: 1, minWidth: 180, padding: '9px 14px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, outline: 'none',
            }}
          />
          {!showAddForm && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { resetForm(); setShowAddForm(true); }}
              style={{ fontWeight: 700 }}
            >
              ＋ Add Mock Exam
            </button>
          )}
        </div>

        {/* Add / Edit form */}
        {showAddForm && (
          <div style={{
            background: 'var(--bg-card)',
            border: `2px solid ${selectedSpecialty.color}50`,
            borderRadius: 14, padding: '20px 20px 16px', marginBottom: 20,
          }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
              {editId ? '✏️ Edit Mock Exam' : '➕ New Mock Exam'}
            </div>

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label style={styles.formLabel}>Exam Title *</label>
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="e.g. General Nursing Mock Exam 1"
                style={styles.input}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={styles.formLabel}>
                Description{' '}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
              </label>
              <input
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="e.g. Covers pharmacology, fundamentals, and medical-surgical nursing"
                style={styles.input}
              />
            </div>

            {/* Time limit + Visibility */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={styles.formLabel}>
                  Time Limit (minutes){' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(leave blank = no limit)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={formTimeLimit}
                  onChange={e => setFormTimeLimit(e.target.value)}
                  placeholder="e.g. 120"
                  style={{ ...styles.input, width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 1 }}>
                <label style={styles.formLabel}>Visibility</label>
                <button
                  onClick={() => setFormActive(v => !v)}
                  style={{
                    padding: '9px 18px', borderRadius: 10, border: '1.5px solid',
                    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
                    borderColor: formActive ? 'rgba(22,163,74,0.4)' : 'rgba(239,68,68,0.4)',
                    background:  formActive ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.08)',
                    color:       formActive ? '#16A34A' : '#EF4444',
                  }}
                >
                  {formActive ? '🟢 Active (visible to students)' : '🔴 Inactive (hidden from students)'}
                </button>
              </div>
            </div>

            {/* Form actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={saving || !formTitle.trim()}
                style={{ fontWeight: 700 }}
              >
                {saving
                  ? <span className="spinner spinner-sm" />
                  : editId ? '💾 Save Changes' : '✅ Create Exam'
                }
              </button>
              <button className="btn btn-ghost btn-sm" onClick={resetForm} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Exam list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {search ? 'No exams match your search' : 'No mock exams yet'}
            </div>
            <div style={{ fontSize: 13 }}>
              {search
                ? 'Try a different keyword.'
                : 'Click "+ Add Mock Exam" above to create the first one.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(exam => {
              const isActive = exam.active !== false;
              const qCount   = questionCounts[exam.id] || 0;
              return (
                <div key={exam.id} style={{
                  ...styles.examRow,
                  borderLeft: `4px solid ${isActive ? selectedSpecialty.color : 'var(--border)'}`,
                  opacity: isActive ? 1 : 0.65,
                }}>
                  {/* Left: info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title + badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {exam.title}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: isActive ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.1)',
                        color:      isActive ? '#16A34A' : '#EF4444',
                        border: `1px solid ${isActive ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}>
                        {isActive ? '🟢 Active' : '🔴 Inactive'}
                      </span>
                    </div>

                    {/* Meta */}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: qCount > 0 ? selectedSpecialty.color : 'var(--text-muted)',
                      }}>
                        {qCount > 0 ? `${qCount} question${qCount !== 1 ? 's' : ''}` : '⚠️ No questions yet'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        ⏱ {exam.timeLimit > 0 ? `${exam.timeLimit} min` : 'No time limit'}
                      </span>
                      {exam.description && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {exam.description}
                        </span>
                      )}
                    </div>

                    {/* Exam ID chip — copy to clipboard */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '3px 10px',
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.3 }}>
                        EXAM ID:
                      </span>
                      <code style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, letterSpacing: 0.3 }}>
                        {exam.id}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(exam.id);
                          toast('Exam ID copied!', 'success');
                        }}
                        title="Copy Exam ID"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 13, padding: '0 2px', lineHeight: 1,
                        }}
                      >
                        📋
                      </button>
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className={`btn btn-sm ${isActive ? 'btn-ghost' : 'btn-primary'}`}
                      disabled={togglingId === exam.id}
                      onClick={() => handleToggleActive(exam)}
                      style={{ minWidth: 90, fontSize: 11 }}
                    >
                      {togglingId === exam.id
                        ? <span className="spinner spinner-sm" />
                        : isActive ? '🙈 Deactivate' : '✅ Activate'
                      }
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleEdit(exam)}
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={deletingId === exam.id}
                      onClick={() => handleDelete(exam)}
                      style={{ minWidth: 36 }}
                    >
                      {deletingId === exam.id
                        ? <span className="spinner spinner-sm" />
                        : '🗑️'
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEVEL 0 — Specialty overview grid
  // ══════════════════════════════════════════════════════════════════════════
  const totalExams  = mockExams.length;
  const totalActive = mockExams.filter(e => e.active !== false).length;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
          📋 Manage Mock Exams
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '6px 0 0' }}>
          Mock exams appear in the student Mock Exams section.
          {!loading && ` ${totalActive} active · ${totalExams - totalActive} inactive · ${totalExams} total.`}
        </p>
      </div>

      {/* Info box */}
      <div style={{
        background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 28,
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        💡 <strong>How it works:</strong> Click a specialty to manage its mock exams.
        Create an exam, then link questions to it via the <strong>Exam ID</strong> shown on each card.
        In the Questions Manager set{' '}
        <code style={{ background: 'rgba(13,148,136,0.15)', padding: '1px 5px', borderRadius: 4 }}>examType = mock_exam</code>{' '}
        and{' '}
        <code style={{ background: 'rgba(13,148,136,0.15)', padding: '1px 5px', borderRadius: 4 }}>mockExamId = &lt;Exam ID&gt;</code>{' '}
        when uploading. Only <strong>active</strong> exams are visible to students.
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {NURSING_CATEGORIES.map(cat => {
            const catExams      = examsForSpecialty(cat.id);
            const activeCount   = catExams.filter(e => e.active !== false).length;
            const inactiveCount = catExams.filter(e => e.active === false).length;
            const totalQs       = catExams.reduce((sum, e) => sum + (questionCounts[e.id] || 0), 0);

            return (
              <button
                key={cat.id}
                onClick={() => { setSelectedSpecialty(cat); setSearch(''); resetForm(); }}
                style={{
                  ...styles.specialtyCard,
                  borderColor: `${cat.color}60`,
                  background:  `${cat.color}0D`,
                }}
              >
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: 4, borderRadius: '4px 0 0 4px', background: cat.color,
                }} />
                <div style={{ ...styles.specialtyIcon, background: `${cat.color}20` }}>
                  <span style={{ fontSize: 24 }}>{cat.icon}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
                    {cat.shortLabel}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {activeCount > 0
                      ? <span style={{ color: cat.color }}>{activeCount} active</span>
                      : <span>0 active</span>
                    }
                    {inactiveCount > 0 && (
                      <span style={{ color: '#EF4444' }}> · {inactiveCount} inactive</span>
                    )}
                    {totalQs > 0 && <span> · {totalQs} questions</span>}
                    {catExams.length === 0 && <span> · No exams yet</span>}
                  </div>
                </div>
                <span style={{ color: cat.color, fontSize: 18, fontWeight: 900, flexShrink: 0 }}>→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  specialtyCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '16px 18px', borderRadius: 14,
    border: '1.5px solid', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s',
    position: 'relative', overflow: 'hidden',
    background: 'var(--bg-card)',
  },
  specialtyIcon: {
    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  examRow: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '14px 16px',
    display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
  },
  formLabel: {
    display: 'block', fontSize: 13, fontWeight: 700,
    color: 'var(--text-primary)', marginBottom: 7,
  },
  input: {
    width: '100%', padding: '9px 13px', borderRadius: 10,
    border: '1.5px solid var(--border)', background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)', fontFamily: 'inherit',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  },
  emptyState: {
    textAlign: 'center', padding: '48px 24px',
    color: 'var(--text-muted)', fontSize: 14,
  },
};
