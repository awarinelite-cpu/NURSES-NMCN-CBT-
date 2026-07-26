// src/components/shared/AiExplainButton.jsx
// Drop-in "🤖 Ask AI to Explain" button + answer box for ANY question shape.
// Manages its own loading/result state, powered by Gemini via utils/aiExplain.
//
// Usage:  <AiExplainButton q={question} />
//
// Pass `collection="questions"` or `collection="entranceExamQuestions"` to
// upgrade to the review flow: the AI independently re-checks the stored
// answer, tells the student directly if it's wrong (and what the right one
// is), auto-saves high-confidence corrections, and flags low-confidence
// disagreements for admin review. Omit `collection` for question shapes
// that flow doesn't support yet (e.g. CAOSCE cases) — falls back to a plain
// explanation of the stored answer.

import { useState } from 'react';
import { getAiExplanation, getAiReview, formatAiReviewMessage } from '../../utils/aiExplain';

export default function AiExplainButton({ q, collection = null, style = {} }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isWrong, setIsWrong] = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (text || loading) return;
    setLoading(true);
    setIsError(false);
    try {
      if (collection) {
        const review = await getAiReview(q, collection);
        setText(formatAiReviewMessage(review));
        setIsWrong(!review.agrees);
      } else {
        const result = await getAiExplanation(q);
        setText(result);
      }
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
          background: isError ? 'rgba(239,68,68,0.08)' : isWrong ? 'rgba(245,158,11,0.1)' : 'rgba(124,58,237,0.08)',
          border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : isWrong ? 'rgba(245,158,11,0.4)' : 'rgba(124,58,237,0.25)'}`,
          fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          color: isError ? '#EF4444' : 'var(--text-primary)',
          fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        }}>
          🤖 {text}
          {isError && (
            <button
              onClick={() => { setText(''); setIsError(false); setIsWrong(false); }}
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
