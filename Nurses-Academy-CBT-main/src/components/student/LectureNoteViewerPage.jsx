// src/components/student/LectureNoteViewerPage.jsx
// Route: /lecture-notes/:specialtyId/:noteId
// Step 3 of the Lecture Notes flow: read the note itself.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { fetchNote, specialtyMeta } from '../../utils/lectureNotesUtils';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

export default function LectureNoteViewerPage() {
  const { specialtyId, noteId } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const meta = specialtyMeta(specialtyId);

  useEffect(() => {
    (async () => {
      try {
        const n = await fetchNote(noteId);
        if (!n) { setError('This note could not be found.'); return; }
        setNote(n);
      } catch (e) { setError(e.message); }
    })();
  }, [noteId]);

  const clean = note?.contentHtml
    ? DOMPurify.sanitize(note.contentHtml, { ADD_ATTR: ['target'] })
    : '';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => navigate(`/lecture-notes/${specialtyId}`)}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: H, fontWeight: 900, fontSize: 13 }}
        >← {meta ? meta.shortLabel : 'Topics'}</button>
      </div>

      {!note && !error && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: F }}>Loading…</div>
      )}

      {error && (
        <div style={{ background: '#EF444418', border: '1.5px solid #EF444455', borderRadius: 12, padding: 14, color: '#EF4444', fontFamily: F, fontSize: 13 }}>
          {error}
        </div>
      )}

      {note && (
        <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '22px 20px' }}>
          <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.15rem,4.5vw,1.6rem)', color: 'var(--text-primary)', margin: '0 0 16px' }}>
            {note.topic}
          </h1>
          <div
            className="lecture-note-body"
            style={{ fontFamily: F, fontSize: 16, lineHeight: 1.75, color: 'var(--text-primary)' }}
            dangerouslySetInnerHTML={{ __html: clean }}
          />
        </div>
      )}

      <style>{`
        /* Belt-and-suspenders: never let this page scroll sideways */
        html, body { overflow-x: hidden; max-width: 100vw; }

        /* Neutralize fixed widths / no-wrap that rich text (pasted from
           Word/Google Docs) can carry as inline styles, which would
           otherwise push the note wider than the phone screen. */
        .lecture-note-body, .lecture-note-body * {
          max-width: 100% !important;
          width: auto !important;
          box-sizing: border-box !important;
          white-space: normal !important;
          overflow-wrap: break-word !important;
          word-break: break-word !important;
        }
        .lecture-note-body img { height: auto; border-radius: 10px; margin: 10px 0; }
        .lecture-note-body h1, .lecture-note-body h2, .lecture-note-body h3 { font-family: ${H}; color: var(--text-primary); }
        .lecture-note-body a { color: #0D9488; }
        .lecture-note-body blockquote { border-left: 3px solid #0D9488; margin: 10px 0; padding: 4px 14px; color: var(--text-muted); }
        .lecture-note-body pre { background: rgba(255,255,255,0.06); padding: 10px 12px; border-radius: 8px; overflow-x: auto !important; white-space: pre-wrap !important; }
        .lecture-note-body table { display: block; overflow-x: auto !important; }
      `}</style>
    </div>
  );
}
