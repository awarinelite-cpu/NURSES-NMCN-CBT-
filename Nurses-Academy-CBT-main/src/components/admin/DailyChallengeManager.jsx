// src/components/admin/DailyChallengeManager.jsx
// Admin tool to post or update today's "Question of the Day".
// Route: /admin/daily-challenge

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const BLANK = { question:'', optionA:'', optionB:'', optionC:'', optionD:'', answer:'A', explanation:'', subject:'General Nursing' };

export default function DailyChallengeManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [existing, setExisting] = useState(null);
  const today = todayKey();

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'dailyChallenge', today));
      if (snap.exists()) { setExisting(snap.data()); setForm(snap.data()); }
    })();
  }, [today]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.question || !form.optionA || !form.optionB || !form.answer) {
      setMsg({ type: 'error', text: 'Fill in question, at least A & B options, and the correct answer.' });
      return;
    }
    setSaving(true); setMsg(null);
    try {
      await setDoc(doc(db, 'dailyChallenge', today), {
        ...form,
        postedBy: user?.uid || 'admin',
        postedAt: new Date().toISOString(),
        correctCount: existing?.correctCount || 0,
      });
      setMsg({ type: 'success', text: `✅ Daily challenge saved for ${today}` });
      setExisting(form);
    } catch(e) { setMsg({ type: 'error', text: e.message }); }
    finally { setSaving(false); }
  };

  const inp = (label, key, multiline) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: H, fontWeight: 900, fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      {multiline ? (
        <textarea
          value={form[key]} onChange={e => set(key, e.target.value)} rows={4}
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontFamily: F, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
        />
      ) : (
        <input
          value={form[key]} onChange={e => set(key, e.target.value)}
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontFamily: F, fontSize: 14, boxSizing: 'border-box' }}
        />
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: H, fontWeight: 900, fontSize: 13 }}>← Admin</button>
        <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,4vw,1.6rem)', color: 'var(--text-primary)', margin: 0 }}>⚡ Daily Challenge</h1>
      </div>

      {existing && (
        <div style={{ background: '#0D948818', border: '1.5px solid #0D948855', borderRadius: 12, padding: '10px 16px', marginBottom: 20, fontFamily: F, fontSize: 13, color: '#0D9488' }}>
          ✓ A challenge exists for today ({today}). You can update it below.
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '24px' }}>
        {inp('Subject / Category', 'subject')}
        {inp('Question *', 'question', true)}
        {inp('Option A *', 'optionA')}
        {inp('Option B *', 'optionB')}
        {inp('Option C', 'optionC')}
        {inp('Option D', 'optionD')}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>CORRECT ANSWER *</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {['A','B','C','D'].map(k => (
              <button key={k} onClick={() => set('answer', k)} style={{
                padding: '10px 20px', borderRadius: 10, border: `2px solid ${form.answer === k ? '#0D9488' : 'rgba(255,255,255,0.1)'}`,
                background: form.answer === k ? '#0D948822' : 'transparent',
                color: form.answer === k ? '#0D9488' : 'var(--text-muted)',
                fontFamily: H, fontWeight: 900, fontSize: 14, cursor: 'pointer',
              }}>{k}</button>
            ))}
          </div>
        </div>

        {inp('Explanation / Rationale (shown after answering)', 'explanation', true)}

        {msg && (
          <div style={{ background: msg.type === 'success' ? '#15803D22' : '#EF444418', border: `1px solid ${msg.type === 'success' ? '#22C55E55' : '#EF444455'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontFamily: F, fontSize: 13, color: msg.type === 'success' ? '#22C55E' : '#EF4444' }}>{msg.text}</div>
        )}

        <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '14px', borderRadius: 12, background: '#0D9488', border: 'none', cursor: saving ? 'wait' : 'pointer', fontFamily: H, fontWeight: 900, fontSize: 15, color: '#fff' }}>
          {saving ? 'Saving…' : existing ? 'Update Challenge' : 'Post Challenge'}
        </button>
      </div>
    </div>
  );
}
