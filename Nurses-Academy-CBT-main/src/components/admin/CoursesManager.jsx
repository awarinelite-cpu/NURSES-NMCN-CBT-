// src/components/admin/CoursesManager.jsx
//
// Route: /admin/courses
// Admin can add, edit, delete courses that appear in Course Drill.
// Default courses from categories.js are shown as reference but
// custom courses are stored in Firestore 'courses' collection.

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, deleteDoc, updateDoc,
  doc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { DEFAULT_NURSING_COURSES } from '../../data/categories';
import { useToast } from '../shared/Toast';

export default function CoursesManager() {
  const { toast }    = useToast();
  const [courses,    setCourses]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [editId,     setEditId]     = useState(null); // id of course being edited
  const [form,       setForm]       = useState({ label: '', icon: '📖', description: '' });
  const [showForm,   setShowForm]   = useState(false);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'courses'), orderBy('label', 'asc')));
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      // Collection might be empty — that's fine
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCourses(); }, []);

  const handleSave = async () => {
    if (!form.label.trim()) { toast('Course name is required.', 'error'); return; }
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, 'courses', editId), {
          label:       form.label.trim(),
          icon:        form.icon.trim() || '📖',
          description: form.description.trim(),
          updatedAt:   serverTimestamp(),
        });
        toast('Course updated!', 'success');
      } else {
        // Generate a slug id from the label
        const id = form.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        await addDoc(collection(db, 'courses'), {
          id,
          label:       form.label.trim(),
          icon:        form.icon.trim() || '📖',
          description: form.description.trim(),
          createdAt:   serverTimestamp(),
        });
        toast('Course added!', 'success');
      }
      setForm({ label: '', icon: '📖', description: '' });
      setEditId(null);
      setShowForm(false);
      loadCourses();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (course) => {
    setForm({ label: course.label, icon: course.icon || '📖', description: course.description || '' });
    setEditId(course.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this course? Questions tagged to it will still exist but won\'t appear in Course Drill filters.')) return;
    try {
      await deleteDoc(doc(db, 'courses', id));
      toast('Course deleted.', 'success');
      loadCourses();
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  };

  const handleCancel = () => {
    setForm({ label: '', icon: '📖', description: '' });
    setEditId(null);
    setShowForm(false);
  };

  // All courses to display: custom (Firestore) + defaults not already overridden
  const customIds    = courses.map(c => c.id);
  const defaultOnly  = DEFAULT_NURSING_COURSES.filter(d => !customIds.includes(d.id));

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0 }}>📖 Manage Courses</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>
            Courses appear in Course Drill for students. {courses.length} custom course{courses.length !== 1 ? 's' : ''} added.
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            ➕ Add Course
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24, padding: '20px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
            {editId ? '✏️ Edit Course' : '➕ Add New Course'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Course Name *</label>
              <input
                className="form-input"
                placeholder="e.g. Anatomy, Pharmacology…"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Icon (emoji)</label>
              <input
                className="form-input"
                placeholder="📖"
                value={form.icon}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                style={{ maxWidth: 100 }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <input
                className="form-input"
                placeholder="Brief description…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner spinner-sm" /> Saving…</> : (editId ? '💾 Update' : '✅ Save Course')}
            </button>
            <button className="btn btn-ghost" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Custom courses (Firestore) */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : (
        <>
          {courses.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                Custom Courses ({courses.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                {courses.map(course => (
                  <div key={course.id} style={styles.courseRow}>
                    <div style={styles.courseIcon}>{course.icon || '📖'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{course.label}</div>
                      {course.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{course.description}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(course)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(course.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Default courses (read-only reference) */}
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Default Courses — built-in ({defaultOnly.length})
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            These are always available. Add a custom course with the same name to override them.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {defaultOnly.map(course => (
              <div key={course.id} style={{ ...styles.courseRow, opacity: 0.6, cursor: 'default' }}>
                <div style={styles.courseIcon}>{course.icon || '📖'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{course.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Built-in</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  courseRow: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  courseIcon: {
    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
    background: 'rgba(13,148,136,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20,
  },
};
