// src/components/admin/CoursesManager.jsx
//
// Route: /admin/courses
//
// LAYOUT:
//   Level 0 — All specialties as cards (with course count + question count)
//   Level 1 — Click specialty → see its courses
//             Each course shows: question count, active/inactive toggle, edit, delete
//             + Add Course button → inline form
//
// FIRESTORE:
//   Courses → 'courses' collection
//   { label, icon, category, description, active, createdAt, updatedAt }
//
//   active: true  → visible to students in Course Drill
//   active: false → hidden from students (course stays in DB, questions intact)
//
// Admin controls everything. No default/built-in courses. Firestore is the
// single source of truth.

import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, addDoc, deleteDoc, updateDoc,
  doc, setDoc, serverTimestamp, orderBy, query, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';
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
  const [courses,           setCourses]           = useState([]);   // all courses from Firestore
  const [questionCounts,    setQuestionCounts]    = useState({});   // { courseId: count }
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [deletingId,        setDeletingId]        = useState(null);
  const [togglingId,        setTogglingId]        = useState(null);
  const [showAddForm,       setShowAddForm]       = useState(false);
  const [editId,            setEditId]            = useState(null);
  const [search,            setSearch]            = useState('');
  const [locatorQuery,      setLocatorQuery]      = useState('');

  // Add/edit form state
  const [formLabel,      setFormLabel]      = useState('');
  const [formIcon,       setFormIcon]       = useState('📖');
  const [formDesc,       setFormDesc]       = useState('');
  const [formActive,     setFormActive]     = useState(true);
  const [formCategory,   setFormCategory]   = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);

  // ── Load all courses from Firestore ───────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'courses'), orderBy('label', 'asc')));
      const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCourses(all);

      // Fetch question counts for all courses in parallel
      const counts = await Promise.all(
        all.map(async c => {
          try {
            // NOTE: intentionally no examType filter here — Course Drill and
            // Topic Drill both query the questions collection by course/topic +
            // active only (see CourseDrillPage.jsx / TopicDrillPage.jsx), so this
            // count must match that, not just examType:'course_drill' docs, or it
            // will misleadingly show 0 for courses whose questions were tagged
            // 'past_questions' / 'question_bank' etc.
            const qSnap = await getDocs(query(
              collection(db, 'questions'),
              where('course',   '==', c.id),
              where('active',   '==', true),
            ));
            return [c.id, qSnap.size];
          } catch {
            return [c.id, 0];
          }
        })
      );
      setQuestionCounts(Object.fromEntries(counts));
    } catch (e) {
      console.error('CoursesManager load error:', e);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Data cleanup: orphaned questions + duplicate questions ─────────────────
  const [showCleanup,     setShowCleanup]     = useState(false);
  const [cleanupScanning, setCleanupScanning] = useState(false);
  const [cleanupResult,   setCleanupResult]   = useState(null); // { orphans:[], dupGroups:[{courseId,courseLabel,topic,keepId,removeIds}] }
  const [cleanupWorking,  setCleanupWorking]  = useState(false);

  // A question is a "duplicate" of another if question text + options +
  // correctIndex + topic all match within the same course. We keep the
  // oldest doc (by createdAt, falling back to doc id) and mark the rest
  // for removal. This matches how the bulk-upload retry loop created
  // near-identical copies (same CSV re-imported repeatedly).
  const dupKey = (q) => JSON.stringify({
    question: (q.question || '').trim().toLowerCase(),
    options:  (q.options || []).map(o => (o || '').trim().toLowerCase()),
    correctIndex: q.correctIndex,
    topic: (q.topic || '').trim().toLowerCase(),
  });

  const handleScanCleanup = async () => {
    setCleanupScanning(true);
    setCleanupResult(null);
    try {
      const [courseSnap, questionSnap] = await Promise.all([
        getDocs(collection(db, 'courses')),
        getDocs(collection(db, 'questions')),
      ]);
      const validCourseIds = new Set(courseSnap.docs.map(d => d.id));
      const allQuestions = questionSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Orphans: question.course doesn't match any existing course doc.
      const orphans = allQuestions.filter(q => q.course && !validCourseIds.has(q.course));

      // Duplicates: group by course, then by dupKey within that course.
      const byCourse = {};
      for (const q of allQuestions) {
        if (!q.course || !validCourseIds.has(q.course)) continue; // orphans handled separately
        (byCourse[q.course] ||= []).push(q);
      }
      const dupGroups = [];
      for (const [courseId, qs] of Object.entries(byCourse)) {
        const groups = {};
        for (const q of qs) (groups[dupKey(q)] ||= []).push(q);
        for (const group of Object.values(groups)) {
          if (group.length <= 1) continue;
          const sorted = [...group].sort((a, b) => {
            const at = a.createdAt?.seconds ?? Infinity;
            const bt = b.createdAt?.seconds ?? Infinity;
            if (at !== bt) return at - bt;
            return a.id.localeCompare(b.id);
          });
          const [keep, ...rest] = sorted;
          dupGroups.push({
            courseId,
            courseLabel: courses.find(c => c.id === courseId)?.label || courseId,
            topic: keep.topic || '',
            keepId: keep.id,
            removeIds: rest.map(r => r.id),
          });
        }
      }

      setCleanupResult({ orphans, dupGroups });
    } catch (e) {
      toast('Scan failed: ' + e.message, 'error');
    } finally {
      setCleanupScanning(false);
    }
  };

  const commitBatchDeletes = async (ids) => {
    // Firestore batches cap at 500 writes; chunk to be safe.
    const chunks = [];
    for (let i = 0; i < ids.length; i += 450) chunks.push(ids.slice(i, i + 450));
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(id => batch.delete(doc(db, 'questions', id)));
      await batch.commit();
    }
  };

  const handleDeleteOrphans = async () => {
    if (!cleanupResult?.orphans?.length) return;
    if (!window.confirm(
      `Permanently delete ${cleanupResult.orphans.length} orphaned question${cleanupResult.orphans.length !== 1 ? 's' : ''} ` +
      `(these belong to courses that no longer exist)? This cannot be undone.`
    )) return;
    setCleanupWorking(true);
    try {
      await commitBatchDeletes(cleanupResult.orphans.map(o => o.id));
      toast(`Deleted ${cleanupResult.orphans.length} orphaned question(s).`, 'success');
      setCleanupResult(r => ({ ...r, orphans: [] }));
      await loadData();
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    } finally {
      setCleanupWorking(false);
    }
  };

  const handleDedupe = async () => {
    const total = cleanupResult?.dupGroups?.reduce((s, g) => s + g.removeIds.length, 0) || 0;
    if (!total) return;
    if (!window.confirm(
      `Permanently delete ${total} duplicate question${total !== 1 ? 's' : ''} across ${cleanupResult.dupGroups.length} group(s), ` +
      `keeping one copy of each? This cannot be undone.`
    )) return;
    setCleanupWorking(true);
    try {
      const allRemoveIds = cleanupResult.dupGroups.flatMap(g => g.removeIds);
      await commitBatchDeletes(allRemoveIds);
      toast(`Removed ${allRemoveIds.length} duplicate question(s).`, 'success');
      setCleanupResult(r => ({ ...r, dupGroups: [] }));
      await loadData();
    } catch (e) {
      toast('Dedupe failed: ' + e.message, 'error');
    } finally {
      setCleanupWorking(false);
    }
  };

  // ── Merge similar courses ───────────────────────────────────────────────────
  // Catches the common case of the same course existing more than once
  // (typically from being recreated after the category self-heal bug, or from
  // manual re-entry) — e.g. "PHN 420" and "PHN-420" and "phn420" are all the
  // same course to a student but three separate docs to Firestore. Merging
  // reassigns every question from the "losing" course(s) onto the one kept,
  // then removes any exact duplicates that results in, and deletes the
  // now-empty course doc(s).
  const [showMerge,     setShowMerge]     = useState(false);
  const [mergeGroups,   setMergeGroups]   = useState([]);   // [{ key, courses:[...], keepId }]
  const [mergeScanning, setMergeScanning] = useState(false);
  const [mergeWorking,  setMergeWorking]  = useState(null); // group key currently merging, or 'manual'
  const [manualSourceId, setManualSourceId] = useState('');
  const [manualTargetId, setManualTargetId] = useState('');

  const normalizeCourseName = (label) =>
    (label || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const handleScanMerge = () => {
    setMergeScanning(true);
    const groups = {};
    for (const c of courses) {
      const key = normalizeCourseName(c.label);
      if (!key) continue;
      (groups[key] ||= []).push(c);
    }
    const candidates = Object.entries(groups)
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => {
        // Default "keep" = the one with the most questions (ties → oldest doc id)
        const sorted = [...list].sort((a, b) => {
          const diff = (questionCounts[b.id] || 0) - (questionCounts[a.id] || 0);
          if (diff !== 0) return diff;
          return a.id.localeCompare(b.id);
        });
        return { key, courses: sorted, keepId: sorted[0].id };
      });
    setMergeGroups(candidates);
    setMergeScanning(false);
  };

  // Reassigns every question from each id in removeIds onto keepId, dedupes
  // the merged course, then deletes the now-empty course doc(s).
  const mergeCoursesInto = async (keepId, removeIds) => {
    removeIds = removeIds.filter(id => id !== keepId);
    if (!removeIds.length) return;

    // 1) Move every question from the losing course(s) onto the keeper.
    for (const removeId of removeIds) {
      const qSnap = await getDocs(query(collection(db, 'questions'), where('course', '==', removeId)));
      const ids = qSnap.docs.map(d => d.id);
      for (let i = 0; i < ids.length; i += 450) {
        const batch = writeBatch(db);
        ids.slice(i, i + 450).forEach(id => batch.update(doc(db, 'questions', id), { course: keepId }));
        await batch.commit();
      }
    }

    // 2) Dedupe the merged course — the two courses may have had overlapping
    //    questions (e.g. the same CSV uploaded into both by mistake).
    const mergedSnap = await getDocs(query(collection(db, 'questions'), where('course', '==', keepId)));
    const mergedQs = mergedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const byKey = {};
    for (const q of mergedQs) (byKey[dupKey(q)] ||= []).push(q);
    const dupRemoveIds = [];
    for (const group of Object.values(byKey)) {
      if (group.length <= 1) continue;
      const sorted = [...group].sort((a, b) => {
        const at = a.createdAt?.seconds ?? Infinity;
        const bt = b.createdAt?.seconds ?? Infinity;
        if (at !== bt) return at - bt;
        return a.id.localeCompare(b.id);
      });
      dupRemoveIds.push(...sorted.slice(1).map(r => r.id));
    }
    if (dupRemoveIds.length) await commitBatchDeletes(dupRemoveIds);

    // 3) Delete the now-empty losing course doc(s).
    for (const removeId of removeIds) {
      await deleteDoc(doc(db, 'courses', removeId));
    }
  };

  const handleMergeGroup = async (group) => {
    const removeIds = group.courses.filter(c => c.id !== group.keepId).map(c => c.id);
    const keepCourse = group.courses.find(c => c.id === group.keepId);
    const movingQs = removeIds.reduce((s, id) => s + (questionCounts[id] || 0), 0);
    if (!window.confirm(
      `Merge ${group.courses.length} courses into "${keepCourse.label}"?\n\n` +
      `${movingQs} question(s) will move over, exact duplicates will be removed, ` +
      `and the other ${removeIds.length} course doc(s) will be deleted. This cannot be undone.`
    )) return;
    setMergeWorking(group.key);
    try {
      await mergeCoursesInto(group.keepId, removeIds);
      toast(`Merged into "${keepCourse.label}".`, 'success');
      setMergeGroups(gs => gs.filter(g => g.key !== group.key));
      await loadData();
    } catch (e) {
      toast('Merge failed: ' + e.message, 'error');
    } finally {
      setMergeWorking(null);
    }
  };

  const handleManualMerge = async () => {
    if (!manualSourceId || !manualTargetId || manualSourceId === manualTargetId) return;
    const source = courses.find(c => c.id === manualSourceId);
    const target = courses.find(c => c.id === manualTargetId);
    if (!source || !target) return;
    if (!window.confirm(
      `Merge "${source.label}" into "${target.label}"?\n\n` +
      `${questionCounts[source.id] || 0} question(s) will move over, exact duplicates will be removed, ` +
      `and "${source.label}" will be deleted. This cannot be undone.`
    )) return;
    setMergeWorking('manual');
    try {
      await mergeCoursesInto(manualTargetId, [manualSourceId]);
      toast(`Merged "${source.label}" into "${target.label}".`, 'success');
      setManualSourceId('');
      setManualTargetId('');
      setMergeGroups(gs => gs.filter(g => !g.courses.some(c => c.id === manualSourceId)));
      await loadData();
    } catch (e) {
      toast('Merge failed: ' + e.message, 'error');
    } finally {
      setMergeWorking(null);
    }
  };


  // A course whose category was silently changed (e.g. by the self-heal bug)
  // doesn't get deleted — it just moves, or ends up with a category that
  // doesn't match any NURSING_CATEGORIES id, in which case it's invisible in
  // every specialty grid. This searches ALL courses regardless of category,
  // so a "missing" course can be found and its specialty corrected directly.
  const [recategorizingId, setRecategorizingId] = useState(null);
  const locatorResults = locatorQuery.trim().length >= 2
    ? courses.filter(c => c.label.toLowerCase().includes(locatorQuery.trim().toLowerCase()))
    : [];

  const handleRecategorize = async (course, newCategory) => {
    if (newCategory === course.category) return;
    setRecategorizingId(course.id);
    try {
      await updateDoc(doc(db, 'courses', course.id), {
        category:  newCategory,
        updatedAt: serverTimestamp(),
      });
      const catLabel = NURSING_CATEGORIES.find(c => c.id === newCategory)?.shortLabel || newCategory;
      toast(`"${course.label}" moved to ${catLabel}.`, 'success');
      await loadData();
    } catch (e) {
      toast('Move failed: ' + e.message, 'error');
    } finally {
      setRecategorizingId(null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const coursesForSpecialty = (specialtyId) =>
    courses.filter(c => c.category === specialtyId);

  const resetForm = () => {
    setFormLabel(''); setFormIcon('📖'); setFormDesc(''); setFormActive(true);
    setFormCategory(''); setEditId(null); setShowAddForm(false); setShowIconPicker(false);
  };

  // ── Save (add or edit) ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formLabel.trim()) { toast('Course name is required.', 'error'); return; }
    if (!selectedSpecialty) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, 'courses', editId), {
          label:       formLabel.trim(),
          icon:        formIcon || '📖',
          description: formDesc.trim(),
          active:      formActive,
          category:    formCategory || selectedSpecialty.id,
          updatedAt:   serverTimestamp(),
        });
        toast('Course updated!', 'success');
      } else {
        const slug  = formLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const newId = `${selectedSpecialty.id}_${slug}_${Date.now()}`;
        await setDoc(doc(db, 'courses', newId), {
          label:       formLabel.trim(),
          icon:        formIcon || '📖',
          category:    selectedSpecialty.id,
          description: formDesc.trim(),
          active:      formActive,
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

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleEdit = (course) => {
    setFormLabel(course.label);
    setFormIcon(course.icon || '📖');
    setFormDesc(course.description || '');
    setFormActive(course.active !== false); // default true if field missing
    setFormCategory(course.category || selectedSpecialty?.id || '');
    setEditId(course.id);
    setShowAddForm(true);
    setShowIconPicker(false);
  };

  // ── Toggle active/inactive ────────────────────────────────────────────────
  const handleToggleActive = async (course) => {
    const newActive = course.active === false ? true : false;
    const label     = newActive ? 'visible to students' : 'hidden from students';
    setTogglingId(course.id);
    try {
      await updateDoc(doc(db, 'courses', course.id), {
        active:    newActive,
        updatedAt: serverTimestamp(),
      });
      toast(`"${course.label}" is now ${label}.`, 'success');
      await loadData();
    } catch (e) {
      toast('Toggle failed: ' + e.message, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (course) => {
    const qCount = questionCounts[course.id] || 0;
    const warn   = qCount > 0
      ? `\n\n⚠️ This course has ${qCount} question${qCount !== 1 ? 's' : ''} linked to it. Those questions will still exist in the database but won't be reachable from this course.`
      : '';
    if (!window.confirm(`Permanently delete "${course.label}"?${warn}`)) return;
    setDeletingId(course.id);
    try {
      await deleteDoc(doc(db, 'courses', course.id));
      toast(`"${course.label}" deleted.`, 'success');
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
    const allCourses   = coursesForSpecialty(selectedSpecialty.id);
    const activeCourses   = allCourses.filter(c => c.active !== false);
    const inactiveCourses = allCourses.filter(c => c.active === false);
    const filtered     = allCourses.filter(c =>
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
              {activeCourses.length} active · {inactiveCourses.length} inactive
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

            {/* Icon */}
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
                >{formIcon}</button>
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

            {/* Category (specialty) — only shown when editing an existing course.
                A bulk-upload bug previously let a course's category get silently
                overwritten, making it vanish from its specialty's list with no
                way to fix it except here. */}
            {editId && (
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Specialty / Category</label>
                <select
                  className="form-input"
                  style={{ maxWidth: 400 }}
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                >
                  {NURSING_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.shortLabel}</option>
                  ))}
                </select>
                {formCategory !== selectedSpecialty.id && (
                  <div style={{ fontSize: 11, color: '#EF4444', marginTop: 6 }}>
                    ⚠️ Saving will move this course out of {selectedSpecialty.shortLabel} into{' '}
                    {NURSING_CATEGORIES.find(c => c.id === formCategory)?.shortLabel || formCategory}.
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Description (optional)</label>
              <input
                className="form-input"
                style={{ maxWidth: 400 }}
                placeholder="Brief description…"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
              />
            </div>

            {/* Active toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              maxWidth: 400, background: 'var(--bg-secondary)', borderRadius: 10,
              padding: '12px 16px', marginBottom: 18,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Visible to Students
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {formActive ? 'Students can see and drill this course' : 'Hidden — students cannot see this course'}
                </div>
              </div>
              <button onClick={() => setFormActive(v => !v)} style={{
                width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: formActive ? 'var(--teal)' : 'var(--border)',
                position: 'relative', transition: 'background 0.25s', flexShrink: 0,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: formActive ? 23 : 3,
                  transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                }} />
              </button>
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
                    {selectedSpecialty.shortLabel} · {formActive ? '🟢 Active' : '🔴 Inactive'}
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

        {/* Search */}
        {allCourses.length > 4 && (
          <input className="form-input"
            style={{ maxWidth: 300, marginBottom: 16, height: 40 }}
            placeholder="🔍 Search courses…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}

        {/* Course list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(course => {
              const isActive = course.active !== false;
              const qCount   = questionCounts[course.id] || 0;
              return (
                <div key={course.id} style={{
                  ...styles.courseRow,
                  borderLeft: `4px solid ${isActive ? selectedSpecialty.color : 'var(--border)'}`,
                  opacity: isActive ? 1 : 0.65,
                }}>
                  <div style={{ ...styles.courseIcon, background: `${selectedSpecialty.color}18` }}>
                    {course.icon || '📖'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {course.label}
                      </span>
                      {/* Active/Inactive badge */}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: isActive ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.1)',
                        color:      isActive ? '#16A34A'               : '#EF4444',
                        border: `1px solid ${isActive ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}>
                        {isActive ? '🟢 Active' : '🔴 Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                      {/* Question count */}
                      <span style={{
                        fontSize: 11, color: qCount > 0 ? selectedSpecialty.color : 'var(--text-muted)',
                        fontWeight: 600,
                      }}>
                        {qCount > 0 ? `${qCount} question${qCount !== 1 ? 's' : ''}` : 'No questions yet'}
                      </span>
                      {course.description && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {course.description}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    {/* Active toggle button */}
                    <button
                      className={`btn btn-sm ${isActive ? 'btn-ghost' : 'btn-primary'}`}
                      disabled={togglingId === course.id}
                      onClick={() => handleToggleActive(course)}
                      style={{ minWidth: 80, fontSize: 11 }}
                    >
                      {togglingId === course.id
                        ? <span className="spinner spinner-sm" />
                        : isActive ? '🙈 Deactivate' : '✅ Activate'
                      }
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleEdit(course)}
                    >✏️</button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={deletingId === course.id}
                      onClick={() => handleDelete(course)}
                      style={{ minWidth: 36 }}
                    >
                      {deletingId === course.id
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
  const totalCourses = courses.length;
  const totalActive  = courses.filter(c => c.active !== false).length;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
          📖 Manage Courses
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '6px 0 0' }}>
          Courses appear in Course Drill for students.
          {!loading && ` ${totalActive} active · ${totalCourses - totalActive} inactive · ${totalCourses} total.`}
        </p>
      </div>

      {/* Info box */}
      <div style={{
        background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.25)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        💡 <strong>How it works:</strong> Click a specialty to manage its courses.
        Add courses, set them active or inactive, and see how many questions each course has.
        Only <strong>active</strong> courses are visible to students.
      </div>

      {/* Course locator */}
      <div style={{ marginBottom: 20 }}>
        <input
          className="form-input"
          style={{ maxWidth: 400 }}
          placeholder="🔍 Find a course by name (searches every specialty)…"
          value={locatorQuery}
          onChange={e => setLocatorQuery(e.target.value)}
        />
        {locatorQuery.trim().length >= 2 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
            {locatorResults.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                No course matches "{locatorQuery.trim()}".
              </div>
            ) : locatorResults.map(course => {
              const cat = NURSING_CATEGORIES.find(c => c.id === course.category);
              const qCount = questionCounts[course.id] || 0;
              return (
                <div key={course.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <span style={{ fontSize: 18 }}>{course.icon || '📖'}</span>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                      {course.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {qCount} question{qCount !== 1 ? 's' : ''} · {course.active !== false ? '🟢 Active' : '🔴 Inactive'}
                      {!cat && (
                        <span style={{ color: '#EF4444', fontWeight: 700 }}> · ⚠️ not visible in any specialty</span>
                      )}
                    </div>
                  </div>
                  <select
                    className="form-input"
                    style={{ width: 190, height: 34, fontSize: 12 }}
                    value={course.category || ''}
                    disabled={recategorizingId === course.id}
                    onChange={e => handleRecategorize(course, e.target.value)}
                  >
                    {!cat && <option value="">— pick a specialty —</option>}
                    {NURSING_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.shortLabel}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Data Cleanup toggle */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => { setShowCleanup(v => !v); if (!showCleanup) handleScanCleanup(); }}
        style={{ marginBottom: showCleanup ? 16 : 28 }}
      >
        🧹 {showCleanup ? 'Hide' : 'Data Cleanup'} (orphaned & duplicate questions)
      </button>

      {showCleanup && (
        <div className="card" style={{
          marginBottom: 28, padding: '18px 20px',
          border: '1.5px solid rgba(239,68,68,0.3)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
            🧹 Data Cleanup
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            Finds questions whose course was deleted (<strong>orphans</strong>) and questions that were
            imported more than once with identical text (<strong>duplicates</strong>), most often from
            re-uploading the same CSV before a bug was fixed. Nothing is deleted until you confirm.
          </div>

          {cleanupScanning ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)' }}>
              <span className="spinner spinner-sm" /> Scanning all questions…
            </div>
          ) : cleanupResult && (
            <>
              {/* Orphans */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 14px', marginBottom: 10,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                    Orphaned questions
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {cleanupResult.orphans.length === 0
                      ? 'None found — every question belongs to an existing course.'
                      : `${cleanupResult.orphans.length} question${cleanupResult.orphans.length !== 1 ? 's' : ''} reference a course that no longer exists.`}
                  </div>
                </div>
                {cleanupResult.orphans.length > 0 && (
                  <button className="btn btn-danger btn-sm" disabled={cleanupWorking} onClick={handleDeleteOrphans}>
                    {cleanupWorking ? <span className="spinner spinner-sm" /> : `🗑️ Delete ${cleanupResult.orphans.length}`}
                  </button>
                )}
              </div>

              {/* Duplicates */}
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: cleanupResult.dupGroups.length ? 10 : 0 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                      Duplicate questions
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {cleanupResult.dupGroups.length === 0
                        ? 'None found — no exact repeats detected.'
                        : `${cleanupResult.dupGroups.reduce((s, g) => s + g.removeIds.length, 0)} duplicate copies across ${cleanupResult.dupGroups.length} question${cleanupResult.dupGroups.length !== 1 ? 's' : ''}, one copy will be kept for each.`}
                    </div>
                  </div>
                  {cleanupResult.dupGroups.length > 0 && (
                    <button className="btn btn-danger btn-sm" disabled={cleanupWorking} onClick={handleDedupe}>
                      {cleanupWorking ? <span className="spinner spinner-sm" /> : `🗑️ Remove ${cleanupResult.dupGroups.reduce((s, g) => s + g.removeIds.length, 0)}`}
                    </button>
                  )}
                </div>

                {cleanupResult.dupGroups.length > 0 && (
                  <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(
                      cleanupResult.dupGroups.reduce((acc, g) => {
                        (acc[g.courseLabel] ||= { count: 0, removed: 0 });
                        acc[g.courseLabel].count += 1;
                        acc[g.courseLabel].removed += g.removeIds.length;
                        return acc;
                      }, {})
                    ).map(([label, info]) => (
                      <div key={label} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{label}</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {info.count} question{info.count !== 1 ? 's' : ''} · {info.removed} extra cop{info.removed !== 1 ? 'ies' : 'y'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 12 }}
                onClick={handleScanCleanup}
                disabled={cleanupScanning}
              >
                🔄 Re-scan
              </button>
            </>
          )}
        </div>
      )}

      {/* Merge Courses toggle */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => { setShowMerge(v => !v); if (!showMerge) handleScanMerge(); }}
        style={{ marginBottom: showMerge ? 16 : 28 }}
      >
        🔀 {showMerge ? 'Hide' : 'Merge Courses'} (join similar courses' questions together)
      </button>

      {showMerge && (
        <div className="card" style={{
          marginBottom: 28, padding: '18px 20px',
          border: '1.5px solid rgba(13,148,136,0.35)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
            🔀 Merge Courses
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            Finds courses that look like the same course under slightly different names
            (e.g. "PHN 420" vs "phn420"). Merging moves every question onto the one you keep,
            removes any exact duplicates that overlap, and deletes the other course doc(s).
            Nothing happens until you confirm.
          </div>

          {mergeScanning ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)' }}>
              <span className="spinner spinner-sm" /> Scanning courses…
            </div>
          ) : (
            <>
              {mergeGroups.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>
                  No look-alike courses found by name.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                  {mergeGroups.map(group => (
                    <div key={group.key} style={{
                      background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 14px',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
                        {group.courses.length} courses look like duplicates
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {group.courses.map(c => (
                          <label key={c.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                            color: c.id === group.keepId ? 'var(--text-primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}>
                            <input
                              type="radio"
                              name={`merge-keep-${group.key}`}
                              checked={c.id === group.keepId}
                              onChange={() => setMergeGroups(gs => gs.map(g =>
                                g.key === group.key ? { ...g, keepId: c.id } : g
                              ))}
                            />
                            <span>{c.icon || '📖'} {c.label}</span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              — {questionCounts[c.id] || 0} question{(questionCounts[c.id] || 0) !== 1 ? 's' : ''}
                              {NURSING_CATEGORIES.find(n => n.id === c.category)?.shortLabel
                                ? ` · ${NURSING_CATEGORIES.find(n => n.id === c.category).shortLabel}`
                                : ' · ⚠️ unrecognized specialty'}
                            </span>
                            {c.id === group.keepId && <span style={{ color: 'var(--teal)', fontWeight: 700 }}>(keep)</span>}
                          </label>
                        ))}
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={mergeWorking === group.key}
                        onClick={() => handleMergeGroup(group)}
                      >
                        {mergeWorking === group.key ? <span className="spinner spinner-sm" /> : '🔀 Merge into selected'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual merge — pick any two courses, regardless of how similar their names look */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Manual merge
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    className="form-input"
                    style={{ width: 220, height: 34, fontSize: 12.5 }}
                    value={manualSourceId}
                    onChange={e => setManualSourceId(e.target.value)}
                  >
                    <option value="">Merge this course…</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.label} ({questionCounts[c.id] || 0}q)</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>into</span>
                  <select
                    className="form-input"
                    style={{ width: 220, height: 34, fontSize: 12.5 }}
                    value={manualTargetId}
                    onChange={e => setManualTargetId(e.target.value)}
                  >
                    <option value="">…this course</option>
                    {courses.filter(c => c.id !== manualSourceId).map(c => (
                      <option key={c.id} value={c.id}>{c.label} ({questionCounts[c.id] || 0}q)</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!manualSourceId || !manualTargetId || mergeWorking === 'manual'}
                    onClick={handleManualMerge}
                  >
                    {mergeWorking === 'manual' ? <span className="spinner spinner-sm" /> : 'Merge'}
                  </button>
                </div>
              </div>

              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 14 }}
                onClick={handleScanMerge}
              >
                🔄 Re-scan
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {NURSING_CATEGORIES.map(cat => {
            const catCourses    = coursesForSpecialty(cat.id);
            const activeCount   = catCourses.filter(c => c.active !== false).length;
            const inactiveCount = catCourses.filter(c => c.active === false).length;
            const totalQs       = catCourses.reduce((sum, c) => sum + (questionCounts[c.id] || 0), 0);

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
                    {activeCount > 0
                      ? <span style={{ color: cat.color }}>{activeCount} active</span>
                      : <span>0 active</span>
                    }
                    {inactiveCount > 0 && <span style={{ color: '#EF4444' }}> · {inactiveCount} inactive</span>}
                    {totalQs > 0 && <span> · {totalQs} questions</span>}
                    {catCourses.length === 0 && <span> · No courses yet</span>}
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
