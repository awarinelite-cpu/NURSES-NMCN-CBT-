// src/components/shared/AiExplainButton.jsx
// Drop-in "🤖 Ask AI to Explain" button + answer box for ANY question shape.
// Manages its own loading/result state, powered by Gemini via utils/aiExplain.
//
// Usage:  <AiExplainButton q={question} />

import { useState } from 'react';
import { getAiExplanation } from '../../utils/aiExplain';

export default function AiExplainButton({ q, style = {} }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (text || loading) return;
    setLoading(true);
    setIsError(false);
    try {
      const result = await getAiExplanation(q);
      setText(result);
    } catch (err) {
      setText(err.message || 'AI explanation unavailable.');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 8, ...style }}>
      {!text && (
        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            padding: '6px 12px', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
            border: '1px solid rgba(124,58,237,0.35)',
            background: 'rgba(124,58,237,0.1)',
            color: '#A78BFA', fontSize: 12, fontWeight: 700,
            fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
          }}
        >
          {loading ? '⏳ Thinking…' : '🤖 Ask AI to Explain'}
        </button>
      )}
      {text && (
        <div style={{
          marginTop: 6, padding: '10px 14px', borderRadius: 10,
          background: isError ? 'rgba(239,68,68,0.08)' : 'rgba(124,58,237,0.08)',
          border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'rgba(124,58,237,0.25)'}`,
          fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          color: isError ? '#EF4444' : 'var(--text-primary)',
          fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        }}>
          🤖 {text}
          {isError && (
            <button
              onClick={() => { setText(''); setIsError(false); }}
              style={{
                display: 'block', marginTop: 6, padding: '4px 10px', borderRadius: 6,
                border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
                color: '#EF4444', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >↻ Try again</button>
          )}
        </div>
      )}
    </div>
  );
}
