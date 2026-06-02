// src/components/shared/ItalicText.jsx
//
// Renders text with rich inline formatting markers:
//   **word**             → <strong> (bold)
//   __word__             → <u>      (underline)
//   *word*  or  _word_   → <em>     (italic)
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
//   "The __immune system__ protects the body"
//   → "The " + <u>immune system</u> + " protects the body"
//
//   "This is **very important** for the exam"
//   → "This is " + <strong>very important</strong> + " for the exam"
//
//   "The **brachial plexus** contains __C5–T1__ roots, named *after* their segments"
//   → bold + underline + italic all in one string

import React from 'react';

// Split regex — order is critical:
//   1. **bold**   must come before *italic* so "**" isn't consumed as two "*"
//   2. __underline__ must come before _italic_ for the same reason
const SPLIT_RE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|(?<!\*)\*(?!\*)[^*\n]+?(?<!\*)\*(?!\*)|(?<!_)_(?!_)[^_\n]+?(?<!_)_(?!_))/g;

function getMarkerInfo(part) {
  if (/^\*\*[^*\n]+?\*\*$/.test(part)) return { tag: 'strong', strip: 2 };
  if (/^__[^_\n]+?__$/.test(part))     return { tag: 'u',      strip: 2 };
  if (/^\*[^*\n]+?\*$/.test(part))     return { tag: 'em',     strip: 1 };
  if (/^_[^_\n]+?_$/.test(part))       return { tag: 'em',     strip: 1 };
  return null;
}

export default function ItalicText({ text, style, className, tag: Tag = 'span' }) {
  if (!text || typeof text !== 'string') return null;

  const parts = text.split(SPLIT_RE).filter(p => p !== undefined && p !== '');

  // No markers found — render plain text
  if (parts.length === 1 && !getMarkerInfo(parts[0])) {
    return <Tag style={style} className={className}>{text}</Tag>;
  }

  return (
    <Tag style={style} className={className}>
      {parts.map((part, i) => {
        const info = getMarkerInfo(part);
        if (info) {
          const inner = part.slice(info.strip, -info.strip);
          const InlineTag = info.tag;
          return <InlineTag key={i}>{inner}</InlineTag>;
        }
        return part;
      })}
    </Tag>
  );
}
