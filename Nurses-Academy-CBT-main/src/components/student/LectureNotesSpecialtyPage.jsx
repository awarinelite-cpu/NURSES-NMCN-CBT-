// src/components/student/LectureNotesSpecialtyPage.jsx
// Route: /lecture-notes
// Step 1 of the Lecture Notes flow: pick a specialty. Only shows specialties
// that actually have at least one published note.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSpecialtySummary } from '../../utils/lectureNotesUtils';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

export default function LectureNotesSpecialtyPage() {
  const navigate = useNavigate();
  const [specialties, setSpecialties] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setSpecialties(await fetchSpecialtySummary());
      } catch (e) {
        setError(e.message);
        setSpecialties([]);
      }
    })();
  }, []);

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

      <a
        href="https://drive.google.com/drive/folders/1Q5jVkR_7ocfZ0Qr9sICFwc_g-uUVcd_z"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14,
          padding: '16px 18px', marginBottom: 22, textDecoration: 'none',
          borderLeft: '4px solid #4285F4',
        }}
      >
        <span style={{ fontSize: 26 }}>📁</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>
            Open Lecture Notes Folder (Google Drive)
          </div>
          <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Browse all uploaded lecture note files directly on Drive
          </div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>↗</span>
      </a>

      {specialties === null && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F }}>Loading…</div>
      )}

      {error && (
        <div style={{ background: '#EF444418', border: '1.5px solid #EF444455', borderRadius: 12, padding: 14, color: '#EF4444', fontFamily: F, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {specialties && specialties.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F, fontSize: 14 }}>
          No lecture notes have been uploaded yet. Check back soon.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14 }}>
        {specialties && specialties.map(s => (
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
            <span style={{ fontFamily: F, fontSize: 11.5, color: 'var(--text-muted)' }}>
              {s.count} note{s.count === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
