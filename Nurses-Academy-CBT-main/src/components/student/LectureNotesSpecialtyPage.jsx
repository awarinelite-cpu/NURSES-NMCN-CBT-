// src/components/student/LectureNotesSpecialtyPage.jsx
// Route: /lecture-notes — step 1: pick a specialty (all specialties shown so a
// Drive-link-only specialty with no uploaded notes yet is still reachable).
import { useNavigate } from 'react-router-dom';
import { NURSING_CATEGORIES } from '../../data/categories';

const F = "'Plus Jakarta Sans', system-ui, sans-serif";
const INK = '#10301d';

export default function LectureNotesSpecialtyPage() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 14px 40px', fontFamily: F }}>
      <style>{`.ln-nurse{mask-image:linear-gradient(to right,transparent 0%,#000 32%);-webkit-mask-image:linear-gradient(to right,transparent 0%,#000 32%)}`}</style>
      <div style={{ position: 'relative', minHeight: 150, marginBottom: 14 }}>
        <img className="ln-nurse" src="/dash-nurse.png" alt="" aria-hidden="true"
          style={{ position: 'absolute', right: -14, top: -6, height: 160, width: 'auto', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: '62%', paddingTop: 8 }}>
          <h1 style={{ margin: 0, fontFamily: F, fontSize: 'clamp(1.7rem,8vw,2.3rem)', fontWeight: 800, color: INK, lineHeight: 1.1, letterSpacing: -0.5 }}>Choose Your Specialty</h1>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: '#2f4a3a', fontWeight: 500, lineHeight: 1.4 }}>Browse and select your preferred nursing specialty</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        {NURSING_CATEGORIES.map(s => (
          <button key={s.id} onClick={() => navigate(`/lecture-notes/${s.id}`)} style={{
            display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textAlign: 'left', cursor: 'pointer',
            padding: '12px 10px 12px 12px', borderRadius: 22, fontFamily: F,
            background: `linear-gradient(135deg,#ffffff 0%,${s.color}1f 100%)`, border: '1.5px solid #e1eee5',
            boxShadow: '0 3px 10px rgba(20,90,50,0.10)',
          }}>
            <span style={{ width: 46, height: 46, borderRadius: 16, flexShrink: 0, background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{s.icon}</span>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 13.5, color: INK, lineHeight: 1.2 }}>{s.shortLabel}</span>
            <span style={{ color: INK, fontSize: 20, fontWeight: 700, flexShrink: 0 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
