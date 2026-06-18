// src/components/shared/QuestionNoteButton.jsx
// A small button that opens an inline textarea so a student can write a
// private note on a question (e.g. "Remember: Digoxin toxicity causes
// bradycardia"). Sits next to the Bookmark button in ExamSession.

import { useState } from 'react';
import { saveNote } from '../../utils/notesUtils';

const F = "'Times New Roman', Times, serif";

export default function QuestionNoteButton({ uid, question, initialText = '', onSaved }) {
  const [open, setOpen]   = useState(false);
  const [text, setText]   = useState(initialText);
  const [saving, setSaving] = useState(false);
  const hasNote = !!initialText?.trim();

  const handleToggle = () => setOpen(v => !v);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveNote(uid, question.id, question.category, text);
      onSaved?.(question.id, saved || '');
      setOpen(false);
    } catch (e) {
      console.error('Save note error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setText('');
    setSaving(true);
    try {
      await saveNote(uid, question.id, question.category, '');
      onSaved?.(question.id, '');
      setOpen(false);
    } catch (e) {
      console.error('Clear note error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
          borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${hasNote ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
          background: hasNote ? 'rgba(99,102,241,0.12)' : 'transparent',
          color: hasNote ? '#6366F1' : 'var(--text-muted)',
          fontSize: 12, fontWeight: 700,
        }}
      >
        📝 {hasNote ? 'My Note ✓' : 'Add Note'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 20,
          width: 280, background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Write a private note for yourself on this question…"
            autoFocus
            style={{
              width: '100%', minHeight: 80, resize: 'vertical',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 8, color: 'var(--text-primary)',
              fontSize: 13, fontFamily: F, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            {hasNote && (
              <button
                onClick={handleClear}
                disabled={saving}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 12, fontWeight: 700, padding: '6px 8px' }}
              >
                Delete
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              disabled={saving}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '6px 8px' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
