// src/components/student/LectureNotesTopicsPage.jsx
// Route: /lecture-notes/:specialtyId
// Step 2 of the Lecture Notes flow: list the topics (notes) inside a specialty.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchTopics, specialtyMeta, fetchDriveLink } from '../../utils/lectureNotesUtils';

const H = "'Plus Jakarta Sans', system-ui, sans-serif";
const F = "'Plus Jakarta Sans', system-ui, sans-serif";

export default function LectureNotesTopicsPage() {
  const { specialtyId } = useParams();
  const navigate = useNavigate();
  const [topics, setTopics] = useState(null);
  const [driveLinks, setDriveLinks] = useState([]);
  const [openIds, setOpenIds] = useState({}); // semester folders start collapsed
  const toggle = id => setOpenIds(o => ({ ...o, [id]: !o[id] }));
  const meta = specialtyMeta(specialtyId);

  useEffect(() => {
    (async () => setTopics(await fetchTopics(specialtyId)))();
  }, [specialtyId]);

  useEffect(() => {
    setDriveLinks([]);
    (async () => setDriveLinks(await fetchDriveLink(specialtyId)))();
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

      {driveLinks.map((link, i) => {
        const isOpen = !!openIds[link.id];
        const title = link.label || (driveLinks.length > 1 ? `Drive Folder ${i + 1}` : 'Lecture Notes Drive Folder');
        return (
          <div key={link.id} style={{ marginBottom: 12, background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px 4px 0' }}>
              <button
                onClick={() => toggle(link.id)}
                aria-expanded={isOpen}
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '12px 0 12px 14px' }}
              >
                <span style={{ fontSize: 22 }}>{isOpen ? '📂' : '📁'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)' }}>{title}</span>
                  <span style={{ display: 'block', fontFamily: F, fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                    {isOpen ? 'Tap a file below to open it right here' : 'Tap to show files'}
                  </span>
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 16, transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
              </button>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: H, fontWeight: 800, fontSize: 11, color: '#4285F4', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                Open in Drive ↗
              </a>
            </div>
            {isOpen && (
              <iframe
                src={`https://drive.google.com/embeddedfolderview?id=${link.folderId}#list`}
                title={title}
                style={{ display: 'block', width: '100%', height: 420, border: 'none', borderTop: '1px solid var(--border)', background: '#fff' }}
              />
            )}
          </div>
        );
      })}

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
