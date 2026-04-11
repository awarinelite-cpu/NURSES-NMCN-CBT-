// src/components/admin/AccessCodesManager.jsx
import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import { ACCESS_PLANS } from '../../data/categories';

function generateCode(prefix = 'NMCN') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = prefix + '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function AccessCodesManager() {
  const { toast }        = useToast();
  const [codes,   setCodes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [plan,    setPlan]    = useState('standard');
  const [qty,     setQty]     = useState(1);
  const [note,    setNote]    = useState('');
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all'); // all | unused | used

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'accessCodes'), orderBy('createdAt', 'desc')));
      setCodes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast('Load failed', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const generateCodes = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const newCodes = [];
      for (let i = 0; i < qty; i++) {
        const code = generateCode();
        const ref  = doc(collection(db, 'accessCodes'));
        const data = { code, plan, note, used: false, usedBy: null, createdAt: serverTimestamp() };
        batch.set(ref, data);
        newCodes.push({ id: ref.id, ...data });
      }
      await batch.commit();
      setCodes(prev => [...newCodes, ...prev]);
      toast(`${qty} access code${qty > 1 ? 's' : ''} generated!`, 'success');
      setNote('');
    } catch (e) { toast('Generation failed: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  const deleteCode = async (id) => {
    if (!window.confirm('Delete this access code?')) return;
    try {
      await deleteDoc(doc(db, 'accessCodes', id));
      setCodes(prev => prev.filter(c => c.id !== id));
      toast('Code deleted', 'success');
    } catch (e) { toast('Delete failed', 'error'); }
  };

  const filtered = codes.filter(c => {
    const matchSearch = !search || c.code.includes(search.toUpperCase());
    const matchFilter = filter === 'all' ? true : filter === 'used' ? c.used : !c.used;
    return matchSearch && matchFilter;
  });

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast('Code copied!', 'info');
  };

  const copyAll = () => {
    const unused = filtered.filter(c => !c.used).map(c => c.code).join('\n');
    navigator.clipboard.writeText(unused);
    toast(`${filtered.filter(c => !c.used).length} codes copied!`, 'success');
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0 }}>🔑 Access Codes</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>
          Generate codes to grant manual access — {codes.filter(c => !c.used).length} unused · {codes.filter(c => c.used).length} used
        </p>
      </div>

      {/* Generator */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>🎲 Generate New Codes</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">Subscription Plan</label>
            <select className="form-input form-select" value={plan} onChange={e => setPlan(e.target.value)}>
              {ACCESS_PLANS.filter(p => p.id !== 'free').map(p => (
                <option key={p.id} value={p.id}>{p.label} — {p.duration}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Quantity</label>
            <input type="number" className="form-input" min={1} max={100} value={qty}
              onChange={e => setQty(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))} />
          </div>
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <input className="form-input" placeholder="e.g. Batch for March students" value={note}
              onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={generateCodes} disabled={loading}>
          {loading ? <><span className="spinner spinner-sm" /> Generating…</> : `🎲 Generate ${qty} Code${qty > 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Filters & search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" placeholder="🔍 Search code…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 200 }} />
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {[['all','All'], ['unused','Unused'], ['used','Used']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                background: filter === v ? 'var(--teal)' : 'transparent', color: filter === v ? '#fff' : 'var(--text-muted)',
              }}>
              {l}
            </button>
          ))}
        </div>
        {filtered.some(c => !c.used) && (
          <button className="btn btn-ghost btn-sm" onClick={copyAll}>📋 Copy All Unused</button>
        )}
      </div>

      {/* Codes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(c => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            background: 'var(--bg-card)', border: `1.5px solid ${c.used ? 'rgba(100,116,139,0.2)' : 'rgba(13,148,136,0.2)'}`,
            borderRadius: 12, padding: '12px 16px',
            opacity: c.used ? 0.65 : 1,
          }}>
            <code style={{
              fontFamily: 'monospace', fontSize: 16, fontWeight: 700, letterSpacing: 2,
              color: c.used ? 'var(--text-muted)' : 'var(--teal)',
              background: c.used ? 'var(--bg-tertiary)' : 'var(--teal-glow)',
              padding: '4px 12px', borderRadius: 8,
              textDecoration: c.used ? 'line-through' : 'none',
            }}>
              {c.code}
            </code>
            <span className={`badge ${ACCESS_PLANS.find(p => p.id === c.plan)?.popular ? 'badge-blue' : 'badge-teal'}`} style={{ fontSize: 10 }}>
              {c.plan}
            </span>
            {c.note && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.note}</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {c.used ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Used by {c.usedBy || 'someone'}</span>
              ) : (
                <span className="badge badge-green" style={{ fontSize: 10 }}>✅ Active</span>
              )}
              {!c.used && (
                <button className="btn btn-ghost btn-sm" onClick={() => copyCode(c.code)}>📋 Copy</button>
              )}
              <button className="btn btn-danger btn-sm" onClick={() => deleteCode(c.id)}>🗑️</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No codes found. Generate some above!
          </div>
        )}
      </div>
    </div>
  );
}
