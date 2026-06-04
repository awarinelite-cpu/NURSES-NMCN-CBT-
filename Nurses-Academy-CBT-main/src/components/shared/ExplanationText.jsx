// src/components/shared/ExplanationText.jsx
//
// Renders explanation text with:
//   • Preserved line breaks (vertical math layout)
//   • Larger readable font size
//   • Rich text markers: **bold**, __underline__, *italic*, _italic_
//
// USAGE:
//   import ExplanationText from '../shared/ExplanationText';
//   <ExplanationText text={question.explanation} />
//   <ExplanationText text={question.explanation} fontSize={15} />
//
// Replaces plain <p>{explanation}</p> wherever explanations are shown.

import React from 'react';

// TOKEN_RE — no lookbehind; safe for all Android WebViews
const TOKEN_RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|_[^_\n]+_|\*[^*\n]+\*)/g;

function getMarkerInfo(part) {
  if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { tag: 'strong', strip: 2 };
  if (part.startsWith('__') && part.endsWith('__') && part.length > 4) return { tag: 'u',      strip: 2 };
  if (part.startsWith('*')  && part.endsWith('*')  && part.length > 2) return { tag: 'em',     strip: 1 };
  if (part.startsWith('_')  && part.endsWith('_')  && part.length > 2) return { tag: 'em',     strip: 1 };
  return null;
}

// Renders a single line with rich text markers
function RichLine({ text }) {
  const parts = text.split(TOKEN_RE).filter(p => p !== undefined && p !== '');
  if (parts.length === 1 && !getMarkerInfo(parts[0])) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        const info = getMarkerInfo(part);
        if (info) {
          const Tag = info.tag;
          return <Tag key={i}>{part.slice(info.strip, -info.strip)}</Tag>;
        }
        return part;
      })}
    </>
  );
}

export default function ExplanationText({ text, fontSize = 14, style = {} }) {
  if (!text || typeof text !== 'string') return null;

  // Split on \n to get each line — preserves vertical math layout
  const lines = text.split('\n');

  return (
    <div style={{
      fontSize,
      lineHeight: 1.75,
      color: 'var(--text-secondary)',
      fontFamily: 'var(--font-body)',
      ...style,
    }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        // Empty line → small spacer gap
        if (!trimmed) {
          return <div key={i} style={{ height: '0.5em' }} />;
        }
        // Indented line (starts with spaces in original) → show with indent
        const isIndented = line.length > trimmed.length;
        return (
          <div
            key={i}
            style={{
              paddingLeft: isIndented ? 16 : 0,
              marginBottom: 2,
            }}
          >
            <RichLine text={trimmed} />
          </div>
        );
      })}
    </div>
  );
}
