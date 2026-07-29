// src/components/admin/LectureNoteEditor.jsx
//
// Word-style rich text editor for a single lecture note, built on Quill.
// Long-press anywhere in the text (or right-click on desktop) to pop up an
// "Add image" box where you paste a direct ImgChest / Imgur image link —
// it gets inserted at that point in the note.

import { useMemo, useRef, useState, useCallback } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE = 10;

// Best-effort conversion of a page link into a direct image link so images
// actually render. If we don't recognize the host, pass the URL through
// unchanged (the admin may already have a direct link).
function normalizeImageUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';

  // imgur.com/abc123  or  imgur.com/gallery/abc123  →  i.imgur.com/abc123.jpg
  const imgurPage = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/(?:gallery\/|a\/)?([a-zA-Z0-9]+)\/?$/);
  if (imgurPage) return `https://i.imgur.com/${imgurPage[1]}.jpg`;

  // Already a direct i.imgur.com / imgchest cdn / any URL ending in an
  // image extension — use as-is.
  return url;
}

function looksLikeUrl(s) {
  return /^https?:\/\/\S+$/i.test(String(s || '').trim());
}

const TOOLBAR_ID = 'lecture-note-toolbar';

function Toolbar() {
  return (
    <div id={TOOLBAR_ID}>
      <span className="ql-formats">
        <select className="ql-header" defaultValue="">
          <option value="1" />
          <option value="2" />
          <option value="3" />
          <option value="" />
        </select>
      </span>
      <span className="ql-formats">
        <button className="ql-bold" />
        <button className="ql-italic" />
        <button className="ql-underline" />
        <button className="ql-strike" />
      </span>
      <span className="ql-formats">
        <select className="ql-color" />
        <select className="ql-background" />
      </span>
      <span className="ql-formats">
        <button className="ql-list" value="ordered" />
        <button className="ql-list" value="bullet" />
        <button className="ql-indent" value="-1" />
        <button className="ql-indent" value="+1" />
      </span>
      <span className="ql-formats">
        <select className="ql-align" />
      </span>
      <span className="ql-formats">
        <button className="ql-blockquote" />
        <button className="ql-code-block" />
        <button className="ql-link" />
        <button className="ql-image" />
      </span>
      <span className="ql-formats">
        <button className="ql-clean" />
      </span>
    </div>
  );
}

export default function LectureNoteEditor({ value, onChange }) {
  const quillRef = useRef(null);
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const savedIndex = useRef(null);
  const [imagePrompt, setImagePrompt] = useState(null); // { index } | null
  const [imageUrl, setImageUrl] = useState('');

  const insertImageAt = useCallback((index, url) => {
    const editor = quillRef.current?.getEditor?.();
    if (!editor || !url) return;
    const direct = normalizeImageUrl(url);
    editor.insertEmbed(index, 'image', direct, 'user');
    editor.setSelection(index + 1, 0, 'user');
  }, []);

  const openImagePromptAtCursor = useCallback(() => {
    const editor = quillRef.current?.getEditor?.();
    if (!editor) return;
    const sel = editor.getSelection(true);
    const index = sel ? sel.index : editor.getLength();
    savedIndex.current = index;
    setImageUrl('');
    setImagePrompt({ index });
  }, []);

  // Toolbar's built-in image button also opens the URL prompt instead of a
  // file picker, so every image insertion goes through the same path.
  const modules = useMemo(() => ({
    toolbar: { container: `#${TOOLBAR_ID}`, handlers: { image: openImagePromptAtCursor } },
  }), [openImagePromptAtCursor]);

  // ── Long-press detection on the editor surface ──────────────────────────
  const clearPressTimer = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  const handlePointerDown = (e) => {
    // Only left click / primary touch, and ignore presses on the toolbar.
    if (e.button !== undefined && e.button !== 0) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPressTimer();
    pressTimer.current = setTimeout(() => {
      openImagePromptAtCursor();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e) => {
    if (!pressStart.current) return;
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clearPressTimer();
  };

  const handlePointerUp = () => { clearPressTimer(); pressStart.current = null; };

  // Desktop convenience: right-click also opens the image prompt.
  const handleContextMenu = (e) => {
    e.preventDefault();
    openImagePromptAtCursor();
  };

  const confirmImage = () => {
    if (imagePrompt && looksLikeUrl(imageUrl)) {
      insertImageAt(imagePrompt.index, imageUrl);
    }
    setImagePrompt(null);
    setImageUrl('');
  };

  return (
    <div style={{ position: 'relative' }}>
      <Toolbar />
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value}
          onChange={onChange}
          modules={modules}
          placeholder="Write the lecture note here… long-press anywhere to insert an image."
        />
      </div>

      <div style={{ fontFamily: F, fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
        Tip: long-press (or right-click) inside the note to insert an image from an ImgChest or Imgur link.
      </div>

      <style>{`
        #${TOOLBAR_ID} { background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.15) !important; border-bottom: none !important; border-radius: 10px 10px 0 0; }
        .ql-container { border: 1.5px solid rgba(255,255,255,0.15) !important; border-radius: 0 0 10px 10px; background: rgba(255,255,255,0.03); }
        .ql-editor { min-height: 260px; color: var(--text-primary); font-family: ${F}; font-size: 15px; }
        .ql-editor.ql-blank::before { color: rgba(255,255,255,0.35); font-style: normal; }
        .ql-snow .ql-stroke { stroke: var(--text-primary); opacity: 0.85; }
        .ql-snow .ql-fill { fill: var(--text-primary); opacity: 0.85; }
        .ql-snow .ql-picker { color: var(--text-primary); }
        .ql-snow .ql-picker-options { background: #0A1F35; border: 1px solid rgba(255,255,255,0.15) !important; }
        .ql-snow .ql-tooltip { background: #0A1F35; color: var(--text-primary); border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .ql-snow .ql-tooltip input[type=text] { background: rgba(255,255,255,0.08); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.15); }
        .ql-editor img { max-width: 100%; border-radius: 8px; }
      `}</style>


      {imagePrompt && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setImagePrompt(null); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
              🖼️ Add image
            </div>
            <div style={{ fontFamily: F, fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
              Paste a direct ImgChest or Imgur image link (ideally ending in .jpg, .png, or .gif).
            </div>
            <input
              autoFocus
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmImage(); if (e.key === 'Escape') setImagePrompt(null); }}
              placeholder="https://i.imgur.com/xxxxx.jpg"
              style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontFamily: F, fontSize: 14, marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setImagePrompt(null)}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: H, fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
              >Cancel</button>
              <button
                onClick={confirmImage}
                disabled={!looksLikeUrl(imageUrl)}
                style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: looksLikeUrl(imageUrl) ? '#0D9488' : 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: H, fontWeight: 800, fontSize: 12.5, cursor: looksLikeUrl(imageUrl) ? 'pointer' : 'not-allowed' }}
              >Insert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
