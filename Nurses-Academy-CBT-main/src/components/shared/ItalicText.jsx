// src/components/shared/ItalicText.jsx
//
// Renders text with *word* and _word_ italic markers as <em> elements.
//
// USAGE:
//   import ItalicText from '../shared/ItalicText';
//   <ItalicText text={question.questionText} />
//   <ItalicText text={option} style={{ fontSize: 14 }} />
//
// INPUT EXAMPLES:
//   "Choose the word nearest in meaning to *posterity*"
//   → "Choose the word nearest in meaning to " + <em>posterity</em>
//
//   "The _immune system_ protects the body"
//   → "The " + <em>immune system</em> + " protects the body"

import React from 'react';

export default function ItalicText({ text, style, className, tag: Tag = 'span' }) {
  if (!text || typeof text !== 'string') return null;

  // Split on *word* or _word_ markers
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);

  // No italic markers — render plain
  if (parts.length === 1) {
    return <Tag style={style} className={className}>{text}</Tag>;
  }

  return (
    <Tag style={style} className={className}>
      {parts.map((part, i) => {
        if (/^(\*[^*\n]+\*|_[^_\n]+_)$/.test(part)) {
          const inner = part.slice(1, -1); // strip * or _
          return (
            <em key={i} style={{ fontStyle: 'italic', fontWeight: 'inherit' }}>
              {inner}
            </em>
          );
        }
        return part;
      })}
    </Tag>
  );
}
