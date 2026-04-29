// src/components/entrance/EntranceDailyMockUpload.jsx
import { useState } from 'react';
import { db } from '../../firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function EntranceDailyMockUpload() {
  const [jsonText, setJsonText]   = useState('');
  const [label, setLabel]         = useState('');
  const [status, setStatus]       = useState(null); // null | 'loading' | 'success' | 'error'
  const [message, setMessage]     = useState('');

  const handleUpload = async () => {
    setStatus('loading');
    setMessage('');

    let questions;
    try {
      questions = JSON.parse(jsonText);
      if (!Array.isArray(questions) || questions.length === 0) throw new Error();
    } catch {
      setStatus('error');
      setMessage('❌ Invalid JSON — must be a non-empty array of question objects.');
      return;
    }

    try {
      await addDoc(collection(db, 'entranceDailyMocks'), {
        label:     label.trim() || `Mock – ${new Date().toLocaleDateString()}`,
        questions,
        createdAt: serverTimestamp(),
      });
      setStatus('success');
      setMessage(`✅ Uploaded ${questions.length} question(s) successfully.`);
      setJsonText('');
      setLabel('');
    } catch (err) {
      setStatus('error');
      setMessage(`❌ Upload failed: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", marginBottom: 8 }}>
        📤 Upload Daily Mock — Entrance Exam
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        Paste a JSON array of question objects. Each object should follow the standard
        question schema used across the platform.
      </p>

      {/* Label */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Mock Label (optional)
        </label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Week 3 – Anatomy &amp; Physiology"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-secondary)',
            color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box',
          }}
        />
      </div>

      {/* JSON input */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Questions JSON <span style={{ color: 'var(--color-teal)' }}>*</span>
        </label>
        <textarea
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
          rows={16}
          placeholder={'[\n  {\n    "question": "...",\n    "options": ["A","B","C","D"],\n    "answer": "A",\n    "explanation": "..."\n  }\n]'}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-secondary)',
            color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace',
            resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Status message */}
      {message && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: status === 'success' ? 'rgba(13,148,136,0.12)' : 'rgba(220,38,38,0.1)',
          color:      status === 'success' ? '#0D9488' : '#DC2626',
          fontSize: 14, fontWeight: 600,
        }}>
          {message}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={status === 'loading' || !jsonText.trim()}
        className="btn btn-primary"
        style={{ minWidth: 160 }}
      >
        {status === 'loading' ? 'Uploading…' : '⬆ Upload Mock'}
      </button>
    </div>
  );
}
