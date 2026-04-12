// src/components/admin/CoursesManager.jsx
//
// Route: /admin/courses
//
// LAYOUT:
//   Level 0 — All specialties as cards (with course count)
//   Level 1 — Click specialty → see its courses (built-ins + custom)
//             + Add Course button → inline form
//             + Edit button on EVERY course (built-in or custom)
//             + Delete/Hide button on every course
//
// FIRESTORE:
//   Custom courses      → 'courses' collection  { label, icon, category, description, createdAt }
//   Built-in overrides  → 'courses' collection with SAME id as the default course
//                         (same collection, just an override doc that replaces label/icon)
//   Deleted defaults    → 'deletedDefaultCourses' collection  { label, deletedAt }
//     CourseDrillPage skips any default course whose id appears in deletedDefaultCourses.

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, deleteDoc, updateDoc,
  doc, setDoc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { DEFAULT_NURSING_COURSES, NURSING_CATEGORIES } from '../../data/categories';
import { useToast } from '../shared/Toast';

const ICON_OPTIONS = [
  '📖','📋','🏥','💊','🦴','🫀','🧠','👶','🌍','🔬','🩺','⚖️','🧪','💉',
  '🚨','🔪','🧤','🛏️','❤️','🫘','🎗️','👁️','👂','⚕️','🩹','🔥','🏃',
  '🫁','📊','📢','🌿','🧸','📈','🦺','🏠','🏘️','🤰','🍼','⚠️','😴','🩸',
  '🕊️','🔴','📌','🏋️','🧬','🦷','💆','🧘','🩻','🏨','🎓','⭐',
];

export default function CoursesManager() {
  const { toast } = useToast();

  const [selectedSpecialty, setSelectedSpecialty] = useState(null);
  const [customCourses,     setCustomCourses]     = useState([]);
  const [deletedDefaults,   setDeletedDefaults]   = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [deletingId,        setDeletingId]        = useState(null);
  const [showAddForm,       setShowAddForm]       = useState(false);
  const [editId,            setEditId]            = useState(null);
  const [search,            setSearch]            = useState('');

  // Add/edit form state
  const [formLabel,       setFormLabel]       = useState('');
  const [formIcon,        setFormIcon]        = useState('📖');
  const [formDesc,        setFormDesc]        = useState('');
  const [showIconPicker,  setShowIconPicker]  = useState(false);

  // ── Load data ──────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [courseSnap, deletedSnap] = await Promise.all([
        getDocs(query(collection(db, 'courses'), orderBy('label', 'asc'))),
        getDocs(collection(db, 'deletedDefaultCourses')),
      ]);
      setCustomCourses(courseSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDeletedDefaults(deletedSnap.docs.map(d => d.id));
    } catch (e) {
      try {
        const courseSnap = await getDocs(collection(db, 'courses'));
        setCustomCourses(courseSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { setCustomCourses([]); }
      setDeletedDefaults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ── Computed lists ─────────────────────────────────────────────
  // All active courses for a given specialty
  const coursesForSpecialty = (specialtyId) => {
    // Default courses, excluding hidden ones, with Firestore overrides applied
    const defaults = DEFAULT_NURSING_COURSES
      .filter(c => c.category === specialtyId && !deletedDefaults.includes(c.id))
      .map(c => {
        // Check if admin has saved an override for this built-in course
        const override = customCourses.find(fc => fc.id === c.id);
        if (override) {
          return { ...c, label: override.label, icon: override.icon, description: override.description, _source: 'default', _overridden: true };
        }
        return { ...c, _source: 'default', _overridden: false };
      });

    // Custom courses (those whose id is NOT in DEFAULT_NURSING_COURSES)
    const defaultIds = DEFAULT_NURSING_COURSES.map(c => c.id);
    const customs = customCourses
      .filter(c => c.category === specialtyId && !defaultIds.includes(c.id))
      .map(c => ({ ...c, _source: 'custom' }));

    return [...defaults, ...customs];
  };

  // Deleted default courses for a specialty (for restore section)
  const deletedForSpecialty = (specialtyId) =>
    DEFAULT_NURSING_COURSES.filter(c =>
      c.category === specialtyId && deletedDefaults.includes(c.id)
    );

  const totalCustom = customCourses.filter(c =>
    !DEFAULT_NURSING_COURSES.find(d => d.id === c.id)
  ).length;

  // ── Reset form ─────────────────────────────────────────────────
  const resetForm = () => {
    setFormLabel(''); setFormIcon('📖'); setFormDesc('');
    setEditId(null); setShowAddForm(false); setShowIconPicker(false);
  };

  // ── Save (add or edit) ─────────────────────────────────────────
  const handleSave = async () => {
    if (!formLabel.trim()) { toast('Course name is required.', 'error'); return; }
    if (!selectedSpecialty) return;
    setSaving(true);
    try {
      if (editId) {
        // Both custom and built-in overrides are saved to 'courses' collection with their id
        await setDoc(doc(db, 'courses', editId), {
          label:       formLabel.trim(),
          icon:        formIcon || '📖',
          category:    selectedSpecialty.id,
          description: formDesc.trim(),
          updatedAt:   serverTimestamp(),
        }, { merge: true });
        toast('Course updated!', 'success');
      } else {
        // New custom course
        const slug  = formLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const newId = `${selectedSpecialty.id}_${slug}_${Date.now()}`;
        await setDoc(doc(db, 'courses', newId), {
          label:       formLabel.trim(),
          icon:        formIcon || '📖',
          category:    selectedSpecialty.id,
          description: formDesc.trim(),
          createdAt:   serverTimestamp(),
        });
        toast('Course added!', 'success');
      }
      resetForm();
      await loadData();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────
  const handleEdit = (course) => {
    setFormLabel(course.label);
    setFormIcon(course.icon || '📖');
    setFormDesc(course.description || '');
    setEditId(course.id);
    setShowAddForm(true);
    setShowIconPicker(false);
  };

  // ── Delete / Hide ──────────────────────────────────────────────
  const handleDelete = async (course) => {
    const isDefault = course._source === 'default';
    const msg = isDefault
      ? `Hide "${course.label}"?\n\nThis built-in course will be hidden from students but can be restored later.`
      : `Delete "${course.label}"?\n\nThis custom course will be permanently removed.`;
    if (!window.confirm(msg)) return;
    setDeletingId(course.id);
    try {
      if (isDefault) {
        // Also remove any override doc so restore brings back original
        try { await deleteDoc(doc(db, 'courses', course.id)); } catch { /* may not exist */ }
        await setDoc(doc(db, 'deletedDefaultCourses', course.id), {
          label: course.label,
          deletedAt: serverTimestamp(),
        });
        toast(`"${course.label}" hidden from students.`, 'success');
      } else {
        await deleteDoc(doc(db, 'courses', course.id));
        toast(`"${course.label}" deleted.`, 'success');
      }
      await loadData();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Restore hidden default ─────────────────────────────────────
  const handleRestore = async (course) => {
    if (!window.confirm(`Restore "${course.label}"? It will reappear for students.`)) return;
    try {
      await deleteDoc(doc(db, 'deletedDefaultCourses', course.id));
      toast(`"${course.label}" restored.`, 'success');
      await loadData();
    } catch (e) {
      toast('Restore failed: ' + e.message, 'error');
    }
  };

  // ══════════════════════════════════════════════════════════════
  // LEVEL 1 — Specialty detail view
  // ══════════════════════════════════════════════════════════════
  if (selectedSpecialty) {
    const allCourses    = coursesForSpecialty(selectedSpecialty.id);
    const hiddenCourses = deletedForSpecialty(selectedSpecialty.id);
    const filtered      = allCourses.filter(c =>
      c.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div style={{ padding: 24, maxWidth: 900 }}>

        {/* Back */}
        <button onClick={() => { setSelectedSpecialty(null); resetForm(); setSearch(''); }} style={styles.backBtn}>
          ← Back to Specialties
        </button>

        {/* Specialty header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
          padding: '16px 20px',
          background: `${selectedSpecialty.color}12`,
          border: `1.5px solid ${selectedSpecialty.color}30`,
          borderRadius: 14,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: `${selectedSpecialty.color}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>
            {selectedSpecialty.icon}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              {selectedSpecialty.label}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {allCourses.length} active course{allCourses.length !== 1 ? 's' : ''}
              {hiddenCourses.length > 0 && ` · ${hiddenCourses.length} hidden`}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { resetForm(); setShowAddForm(v => !v); }}
          >
            {showAddForm && !editId ? '✕ Cancel' : '➕ Add Course'}
          </button>
        </div>

        {/* ── Add / Edit form ── */}
        {showAddForm && (
          <div className="card" style={{
            marginBottom: 24, padding: '20px',
            border: `2px solid ${selectedSpecialty.color}40`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
              {editId ? '✏️ Edit Course' : `➕ Add New Course to ${selectedSpecialty.shortLabel}`}
            </div>

            {/* Icon row */}
            <div style={{ marginBottom: 14 }}>
              <div style={styles.formLabel}>Course Icon</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowIconPicker(v => !v)}
                  style={{
                    fontSize: 26, background: 'var(--bg-tertiary)',
                    border: '2px solid var(--border)', borderRadius: 10,
                    padding: '8px 14px', cursor: 'pointer',
                  }}
                >
                  {formIcon}
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {showIconPicker ? 'Click an icon to select' : 'Click to change icon'}
                </span>
              </div>
              {showIconPicker && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10,
                  background: 'var(--bg-secondary)', borderRadius: 10, padding: 12,
                  maxWidth: 400,
                }}>
                  {ICON_OPTIONS.map(ico => (
                    <button key={ico}
                      onClick={() => { setFormIcon(ico); setShowIconPicker(false); }}
                      style={{
                        fontSize: 22, cursor: 'pointer',
                        background: formIcon === ico ? 'var(--teal)' : 'var(--bg-card)',
                        border: `2px solid ${formIcon === ico ? 'var(--teal)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '5px 8px',
                      }}
                    >{ico}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Course name */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Course Name *</label>
              <input
                className="form-input"
                style={{ maxWidth: 400 }}
                placeholder="e.g. Advanced Wound Management"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>

            {/* Description */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">Description (optional)</label>
              <input
                className="form-input"
                style={{ maxWidth: 400 }}
                placeholder="Brief description…"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
              />
            </div>

            {/* Preview */}
            {formLabel.trim() && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: `${selectedSpecialty.color}10`,
                border: `1.5px solid ${selectedSpecialty.color}30`,
                borderRadius: 12, padding: '10px 16px', marginBottom: 16,
              }}>
                <span style={{ fontSize: 22 }}>{formIcon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{formLabel}</div>
                  <div style={{ fontSize: 11, color: selectedSpecialty.color, fontWeight: 600 }}>
                    {selectedSpecialty.shortLabel}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formLabel.trim()}>
                {saving
                  ? <><span className="spinner spinner-sm" /> Saving…</>
                  : editId ? '💾 Update Course' : '✅ Save Course'
                }
              </button>
              <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Search ── */}
        {allCourses.length > 4 && (
          <input className="form-input"
            style={{ maxWidth: 300, marginBottom: 16, height: 40 }}
            placeholder="🔍 Search courses…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}

        {/* ── Course list ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
        ) : filtered.length === 0 && !hiddenCourses.length ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              {search ? `No courses match "${search}"` : 'No courses yet'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Click "+ Add Course" above to add the first course for this specialty.
            </div>
          </div>
        ) : (
          <>
            {/* Active courses */}
            {filtered.length > 0 && (
              <>
                <div style={styles.sectionLabel}>
                  Active Courses ({filtered.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {filtered.map(course => (
                    <div key={course.id} style={{
                      ...styles.courseRow,
                      borderLeft: `4px solid ${course._source === 'custom' ? selectedSpecialty.color : course._overridden ? '#F59E0B' : 'var(--border)'}`,
                    }}>
                      <div style={{ ...styles.courseIcon, background: `${selectedSpecialty.color}18` }}>
                        {course.icon || '📖'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                            {course.label}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                            background: course._source === 'custom'
                              ? `${selectedSpecialty.color}20`
                              : course._overridden
                                ? 'rgba(245,158,11,0.15)'
                                : 'var(--bg-tertiary)',
                            color: course._source === 'custom'
                              ? selectedSpecialty.color
                              : course._overridden
                                ? '#F59E0B'
                                : 'var(--text-muted)',
                            border: `1px solid ${course._source === 'custom' ? `${selectedSpecialty.color}40` : course._overridden ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                          }}>
                            {course._source === 'custom' ? '✨ Custom' : course._overridden ? '✏️ Edited' : '⚙️ Built-in'}
                          </span>
                        </div>
                        {course.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {course.description}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {/* Edit available for ALL courses — both custom and built-in */}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleEdit(course)}
                        >✏️ Edit</button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={deletingId === course.id}
                          onClick={() => handleDelete(course)}
                          style={{ minWidth: 36 }}
                        >
                          {deletingId === course.id
                            ? <span className="spinner spinner-sm" />
                            : course._source === 'default' ? '🙈 Hide' : '🗑️'
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Hidden / deleted defaults (restore section) */}
            {hiddenCourses.length > 0 && (
              <>
                <div style={{ ...styles.sectionLabel, color: '#EF4444' }}>
                  Hidden Built-in Courses ({hiddenCourses.length}) — Not visible to students
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {hiddenCourses.map(course => (
                    <div key={course.id} style={{ ...styles.courseRow, opacity: 0.6 }}>
                      <div style={styles.courseIcon}>{course.icon || '📖'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                          {course.label}
                        </div>
                        <div style={{ fontSize: 11, color: '#EF4444' }}>Hidden from students</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRestore(course)}
                      >
                        ↩️ Restore
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // LEVEL 0 — Specialty overview grid
  // ══════════════════════════════════════════════════════════════
  const totalCourses = NURSING_CATEGORIES.reduce(
    (sum, cat) => sum + coursesForSpecialty(cat.id).length, 0
  );

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
          📖 Manage Courses
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '6px 0 0' }}>
          Courses appear in Course Drill for students.
          {!loading && ` ${totalCourses} total courses · ${totalCustom} custom added.`}
        </p>
      </div>

      {/* Info box */}
      <div style={{
        background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 28,
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        💡 <strong>How it works:</strong> Click a specialty to view and manage its courses.
        Built-in courses can be <strong>edited</strong> or <strong>hidden</strong>. You can also add custom courses.
        All changes reflect instantly on the student Course Drill page.
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {NURSING_CATEGORIES.map(cat => {
            const courses     = coursesForSpecialty(cat.id);
            const hidden      = deletedForSpecialty(cat.id).length;
            const customCount = customCourses.filter(c => {
              const defaultIds = DEFAULT_NURSING_COURSES.map(d => d.id);
              return c.category === cat.id && !defaultIds.includes(c.id);
            }).length;

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
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px', background: cat.color }} />
                <div style={{ ...styles.specialtyIcon, background: `${cat.color}20` }}>
                  <span style={{ fontSize: 24 }}>{cat.icon}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
                    {cat.shortLabel}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {courses.length} course{courses.length !== 1 ? 's' : ''}
                    {customCount > 0 && <span style={{ color: cat.color }}> · {customCount} custom</span>}
                    {hidden > 0 && <span style={{ color: '#EF4444' }}> · {hidden} hidden</span>}
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
  sectionLabel: {
    fontWeight: 700, fontSize: 12, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12,
  },
  courseRow: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  courseIcon: {
    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
    background: 'rgba(13,148,136,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
  },
  formLabel: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8,
  },
  emptyState: { textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', fontSize: 14 },
};
