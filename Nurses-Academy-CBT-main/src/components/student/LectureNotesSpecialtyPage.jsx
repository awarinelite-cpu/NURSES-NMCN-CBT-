// src/components/student/LectureNotesSpecialtyPage.jsx
// Route: /lecture-notes
// Step 1 of the Lecture Notes flow: pick a specialty. Shows every specialty
// in the system so a Drive-link-only specialty (no uploaded notes yet) is
// still reachable.

import { useNavigate } from 'react-router-dom';
import { NURSING_CATEGORIES } from '../../data/categories';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

export default function LectureNotesSpecialtyPage() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: H, fontWeight: 900, fontSize: 13 }}
        >← Dashboard</button>
        <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,4vw,1.6rem)', color: 'var(--text-primary)', margin: 0 }}>
          📚 Lecture Notes
        </h1>
      </div>
      <p style={{ fontFamily: F, fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
        Choose a specialty to browse its lecture notes.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14 }}>
        {NURSING_CATEGORIES.map(s => (
          <button
            key={s.id}
            onClick={() => navigate(`/lecture-notes/${s.id}`)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
              background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16,
              padding: '18px 16px', cursor: 'pointer', textAlign: 'left',
              borderLeft: `4px solid ${s.color}`,
            }}
          >
            <span style={{ fontSize: 28 }}>{s.icon}</span>
            <div style={{ fontFamily: H, fontWeight: 800, fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {s.shortLabel}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
