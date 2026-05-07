// src/components/admin/AnnouncementsManager.jsx
import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';

export default function AnnouncementsManager() {
  const { toast }             = useToast();
  const [items,    setItems]  = useState([]);
  const [loading,  setLoading]= useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', type: 'info', pinned: false });

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc')));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast('Load failed', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { toast('Fill all fields', 'error'); return; }
    try {
      const data = { ...form, createdAt: serverTimestamp() };
      const ref  = await addDoc(collection(db, 'announcements'), data);
      setItems(prev => [{ id: ref.id, ...data }, ...prev]);
      // Notify all users via a system notification
      await addDoc(collection(db, 'notifications'), {
        userId: 'all', title: form.title, body: form.body.slice(0, 100),
        type: 'announcement', read: false, createdAt: serverTimestamp(),
      });
      toast('Announcement published!', 'success');
      setForm({ title: '', body: '', type: 'info', pinned: false });
      setShowForm(false);
    } catch (e) { toast('Failed: ' + e.message, 'error'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    await deleteDoc(doc(db, 'announcements', id));
    setItems(prev => prev.filter(a => a.id !== id));
    toast('Deleted', 'success');
  };

  const togglePin = async (item) => {
    await updateDoc(doc(db, 'announcements', item.id), { pinned: !item.pinned });
    setItems(prev => prev.map(a => a.id === item.id ? { ...a, pinned: !a.pinned } : a));
  };

  const typeColors = { info: 'var(--teal)', warning: 'var(--gold)', success: 'var(--green)', urgent: 'var(--red)' };

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0 }}>📢 Announcements</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? '× Cancel' : '+ New Announcement'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="form-input" placeholder="Announcement title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {['info','warning','success','urgent'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Message *</label>
              <textarea className="form-input" rows={4} placeholder="Full announcement text…" value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary">📢 Publish</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} />
                📌 Pin to top
              </label>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(a => (
          <div key={a.id} style={{
            background: 'var(--bg-card)', border: `1.5px solid ${typeColors[a.type] || 'var(--border)'}40`,
            borderLeft: `4px solid ${typeColors[a.type] || 'var(--teal)'}`,
            borderRadius: 12, padding: '16px 18px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                  {a.pinned && '📌 '}{a.title}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>{a.body}</div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6 }}>
                  {a.createdAt?.toDate ? new Date(a.createdAt.toDate()).toLocaleString() : 'Just now'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => togglePin(a)}>{a.pinned ? '📌' : '📍'}</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(a.id)}>🗑️</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No announcements yet</div>
        )}
      </div>
    </div>
  );
}
