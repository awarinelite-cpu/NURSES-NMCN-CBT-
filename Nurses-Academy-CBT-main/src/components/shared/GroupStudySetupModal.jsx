// src/components/shared/GroupStudySetupModal.jsx
//
// Host-only modal shown inside a live group call: pick a specialty, pick
// Reading Mode or Quiz Mode, pick how many questions, then draw that many
// question ids from that specialty's daily mock pool (same pool the solo
// Daily Mock Exam uses) and hand them up to useGroupCall.startStudy().

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";
const PRESETS = [10, 20, 30, 50];

function shuffleIds(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function GroupStudySetupModal({ defaultCategory, onStart, onCancel }) {
  const [category, setCategory] = useState(defaultCategory || NURSING_CATEGORIES[0]?.id);
  const [mode, setMode]         = useState('reading'); // 'reading' | 'quiz'
  const [count, setCount]       = useState(10);
  const [poolSize, setPoolSize] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState(null);

  const cat = NURSING_CATEGORIES.find(c => c.id === category) || NURSING_CATEGORIES[0];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDoc(doc(db, 'dailyMockExam', category))
      .then(snap => {
        if (cancelled) return;
        setPoolSize(snap.exists() ? (snap.data()?.questionIds?.length || 0) : 0);
      })
      .catch(() => !cancelled && setPoolSize(0))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [category]);

  const handleStart = async () => {
    setErr(null);
    setBusy(true);
    try {
      const snap = await getDoc(doc(db, 'dailyMockExam', category));
      const allIds = snap.exists() ? (snap.data()?.questionIds || []) : [];
      if (allIds.length === 0) { setErr("This specialty's pool isn't ready yet — pick another."); setBusy(false); return; }
      const questionIds = shuffleIds(allIds).slice(0, Math.min(count, allIds.length));
      await onStart({ mode, category, examName: cat.shortLabel || cat.label, questionIds });
    } catch (e) {
      console.error(e);
      setErr('Could not start the study session — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 16, fontFamily: F,
    }}>
      <div style={{
        background: '#1F2C34', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 20,
        padding: 24, maxWidth: 440, width: '100%', maxHeight: '88vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)', color: '#E9EDEF',
      }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 18, marginBottom: 4 }}>
          🎧 Start a Synced Study
        </div>
        <div style={{ fontSize: 12.5, color: '#8696A0', marginBottom: 18, lineHeight: 1.5 }}>
          Everyone currently on the call moves through this together, question by question.
        </div>

        {/* Specialty */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8696A0', marginBottom: 6 }}>SPECIALTY</div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{
            width: '100%', padding: '11px 12px', borderRadius: 10, marginBottom: 16,
            background: '#2A3942', border: '1px solid rgba(255,255,255,0.1)', color: '#E9EDEF',
            fontFamily: F, fontWeight: 700, fontSize: 14,
          }}
        >
          {NURSING_CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.shortLabel || c.label}</option>
          ))}
        </select>
        <div style={{ fontSize: 11.5, color: poolSize === 0 ? '#EF4444' : '#8696A0', marginBottom: 16, marginTop: -10 }}>
          {loading ? 'Checking today\u2019s pool…' : poolSize === 0 ? 'No questions available in this pool yet.' : `${poolSize} questions available today`}
        </div>

        {/* Mode */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8696A0', marginBottom: 6 }}>MODE</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'reading', icon: '📖', label: 'Reading Mode', desc: 'Walk through Qs together, host reveals answers' },
            { id: 'quiz',    icon: '⚡', label: 'Quiz Mode',    desc: 'Everyone answers, then see results together' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                flex: 1, textAlign: 'left', padding: '12px 12px', borderRadius: 12, cursor: 'pointer',
                border: mode === m.id ? '2px solid #0D9488' : '2px solid rgba(255,255,255,0.08)',
                background: mode === m.id ? 'rgba(13,148,136,0.14)' : 'rgba(255,255,255,0.02)',
                color: '#E9EDEF',
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 12.5 }}>{m.label}</div>
              <div style={{ fontSize: 10.5, color: '#8696A0', marginTop: 2, lineHeight: 1.3 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* Count */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8696A0', marginBottom: 6 }}>HOW MANY QUESTIONS</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {PRESETS.map(n => (
            <button
              key={n}
              onClick={() => setCount(n)}
              style={{
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: H, fontWeight: 900, fontSize: 13,
                border: count === n ? '2px solid #0D9488' : '2px solid rgba(255,255,255,0.08)',
                background: count === n ? 'rgba(13,148,136,0.14)' : 'rgba(255,255,255,0.02)',
                color: count === n ? '#2DD4BF' : '#E9EDEF',
              }}
            >{n}</button>
          ))}
        </div>

        {err && <div style={{ fontSize: 12.5, color: '#EF4444', marginBottom: 14 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={{
            flex: 1, padding: '13px', borderRadius: 12, cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 14,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8696A0',
          }}>Cancel</button>
          <button onClick={handleStart} disabled={busy || loading || poolSize === 0} style={{
            flex: 2, padding: '13px', borderRadius: 12, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: H, fontWeight: 900, fontSize: 14,
            border: 'none', background: '#0D9488', color: '#fff', opacity: (busy || loading || poolSize === 0) ? 0.6 : 1,
          }}>{busy ? 'Starting…' : 'Start for Everyone'}</button>
        </div>
      </div>
    </div>
  );
}
