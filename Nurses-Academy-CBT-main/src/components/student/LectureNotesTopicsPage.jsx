// src/components/student/LectureNotesTopicsPage.jsx
// Route: /lecture-notes/:specialtyId
// Step 2 of the Lecture Notes flow: list the topics (notes) inside a specialty.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchTopics, specialtyMeta } from '../../utils/lectureNotesUtils';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

export default function LectureNotesTopicsPage() {
  const { specialtyId } = useParams();
  const navigate = useNavigate();
  const [topics, setTopics] = useState(null);
  const meta = specialtyMeta(specialtyId);

  useEffect(() => {
    (async () => setTopics(await fetchTopics(specialtyId)))();
  }, [specialtyId]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => navigate('/lecture-notes')}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: H, fontWeight: 900, fontSize: 13 }}
        >← Specialties</button>
        <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.05rem,4vw,1.5rem)', color: 'var(--text-primary)', margin: 0 }}>
          {meta ? `${meta.icon} ${meta.shortLabel}` : 'Lecture Notes'}
        </h1>
      </div>

      {topics === null && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F }}>Loading…</div>
      )}

      {topics && topics.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F, fontSize: 14 }}>
          No notes in this specialty yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {topics && topics.map(t => (
          <button
            key={t.id}
            onClick={() => navigate(`/lecture-notes/${specialtyId}/${t.id}`)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14,
              padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              {t.topic}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
