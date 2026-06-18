// src/components/student/NotesPage.jsx
// Route: /notes
// Lists every question the student has written a personal note on.
// Mirrors BookmarksPage.jsx so the two features stay visually consistent.

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';
import { saveNote } from '../../utils/notesUtils';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

export default function NotesPage() {
  const { user } = useAuth();
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText,  setEditText]  = useState('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'questionNotes'),
          where('userId', '==', user.uid),
        ));
        const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const qIds = [...new Set(raw.map(n => n.questionId))];
        const qDocs = await Promise.all(
          qIds.map(id => getDocs(query(collection(db, 'questions'), where('__name__', '==', id))))
        );
        const qMap = {};
        qDocs.forEach(snap => snap.docs.forEach(d => { qMap[d.id] = { id: d.id, ...d.data() }; }));
        const enriched = raw
          .map(n => ({ ...n, question: qMap[n.questionId] || null }))
          .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
        setNotes(enriched);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  const startEdit = (n) => { setEditingId(n.id); setEditText(n.text || ''); };
  const cancelEdit = () => { setEditingId(null); setEditText(''); };

  const saveEdit = async (n) => {
    const trimmed = editText.trim();
    try {
      const saved = await saveNote(user.uid, n.questionId, n.category, trimmed);
      if (!saved) {
        setNotes(prev => prev.filter(x => x.id !== n.id)); // emptied → deleted
      } else {
        setNotes(prev => prev.map(x => x.id === n.id ? { ...x, text: saved } : x));
      }
    } catch (e) { console.error(e); }
    finally { cancelEdit(); }
  };

  const deleteNote = async (n) => {
    try {
      await saveNote(user.uid, n.questionId, n.category, '');
      setNotes(prev => prev.filter(x => x.id !== n.id));
    } catch (e) { console.error(e); }
  };

  const filtered = notes.filter(n =>
    !search ||
    n.question?.question?.toLowerCase().includes(search.toLowerCase()) ||
    n.text?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: H, margin: 0 }}>📝 My Notes</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>{notes.length} personal notes</p>
        </div>
        <input className="form-input" placeholder="🔍 Search notes…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 250 }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <style>{`@keyframes notesShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
          {Array.from({length: 4}).map((_,i) => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ height: 12, width: '70%', borderRadius: 4, marginBottom: 10, background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)', backgroundSize: '200% 100%', animation: 'notesShimmer 1.4s infinite' }} />
              <div style={{ height: 12, width: '50%', borderRadius: 4, background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)', backgroundSize: '200% 100%', animation: 'notesShimmer 1.4s infinite' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>📝</div>
          <p style={{ marginTop: 12 }}>
            {notes.length === 0 ? 'No notes yet. Tap "Add Note" on any question during an exam to jot something down!' : 'No matching notes.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(n => {
            const q   = n.question;
            const cat = NURSING_CATEGORIES.find(c => c.id === (n.category || q?.category));
            const isEditing = editingId === n.id;
            return (
              <div key={n.id} className="card" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  {cat && <span style={{ fontSize: 13, color: cat.color, fontWeight: 700 }}>{cat.icon} {cat.shortLabel}</span>}
                  {q?.subject && <span className="badge badge-blue" style={{ fontSize: 10 }}>{q.subject}</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, fontFamily: F }}>
                  {q?.question || 'Question not found'}
                </div>

                <div style={{
                  background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                  borderRadius: 8, padding: '10px 12px', marginBottom: 10,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6366F1', marginBottom: 6, fontFamily: H }}>
                    📝 MY NOTE
                  </div>
                  {isEditing ? (
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%', minHeight: 70, resize: 'vertical', boxSizing: 'border-box',
                        background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: F,
                      }}
                    />
                  ) : (
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', fontFamily: F, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {n.text}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {isEditing ? (
                    <>
                      <button className="btn btn-sm" onClick={() => saveEdit(n)} style={{ background: '#6366F1', color: '#fff', border: 'none' }}>Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(n)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteNote(n)}>🗑️ Delete</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
