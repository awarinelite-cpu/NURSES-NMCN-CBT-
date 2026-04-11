// src/components/admin/UsersManager.jsx
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import { ACCESS_PLANS } from '../../data/categories';

export default function UsersManager() {
  const { toast }       = useToast();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all'); // all | free | premium | admin
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing]   = useState(null); // user being edited

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast('Failed to load users', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = users.filter(u => {
    const matchSearch = !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' ? true : filter === 'admin' ? u.role === 'admin' : filter === 'premium' ? u.subscribed : !u.subscribed && u.role !== 'admin';
    return matchSearch && matchFilter;
  });

  const updateUser = async (uid, data) => {
    try {
      await updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() });
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, ...data } : u));
      toast('User updated', 'success');
    } catch (e) { toast('Update failed: ' + e.message, 'error'); }
  };

  const deleteUser = async (uid) => {
    if (!window.confirm('Delete this user account? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
      setUsers(prev => prev.filter(u => u.id !== uid));
      toast('User deleted', 'success');
    } catch (e) { toast('Delete failed', 'error'); }
  };

  const grantSubscription = (uid, plan) => {
    const planData = ACCESS_PLANS.find(p => p.id === plan);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + (plan === 'basic' ? 30 : plan === 'standard' ? 90 : plan === 'premium' ? 180 : 0));
    updateUser(uid, { subscribed: plan !== 'free', accessLevel: plan, subscriptionPlan: plan, subscriptionExpiry: expiry.toISOString() });
  };

  const toggleAdmin = (u) => {
    if (!window.confirm(`${u.role === 'admin' ? 'Revoke' : 'Grant'} admin access for ${u.name}?`)) return;
    updateUser(u.id, { role: u.role === 'admin' ? 'student' : 'admin' });
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0 }}>👥 Users Manager</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>
            {users.length} registered users · {users.filter(u => u.subscribed).length} subscribers
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Refresh</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" placeholder="🔍 Search name or email…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {[['all','All'], ['free','Free'], ['premium','Premium'], ['admin','Admin']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                background: filter === v ? 'var(--teal)' : 'transparent', color: filter === v ? '#fff' : 'var(--text-muted)',
              }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-center" style={{ padding: 40 }}><div className="spinner" /></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Plan</th>
                <th>Exams</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#0D9488,#7C3AED)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, color: '#fff', fontSize: 14, flexShrink: 0,
                      }}>
                        {(u.name || 'U')[0].toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{u.name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{u.email}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-red' : 'badge-grey'}`}>
                      {u.role || 'student'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.subscribed ? 'badge-teal' : 'badge-grey'}`}>
                      {u.subscriptionPlan || (u.subscribed ? 'premium' : 'free')}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>{u.totalExams || 0}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {u.createdAt?.toDate ? new Date(u.createdAt.toDate()).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {/* Grant subscription dropdown */}
                      <select
                        className="form-input form-select"
                        defaultValue=""
                        onChange={e => { if (e.target.value) grantSubscription(u.id, e.target.value); e.target.value = ''; }}
                        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, maxWidth: 110 }}
                        title="Grant subscription"
                      >
                        <option value="">Grant Plan…</option>
                        {ACCESS_PLANS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleAdmin(u)}
                        title={u.role === 'admin' ? 'Revoke admin' : 'Make admin'}>
                        {u.role === 'admin' ? '👤' : '🛡️'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No users found</div>
          )}
        </div>
      )}
    </div>
  );
}
