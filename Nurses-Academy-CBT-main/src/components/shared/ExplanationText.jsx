// src/components/shared/ExplanationText.jsx
//
// Smart explanation renderer — auto-detects calculation steps and
// inserts line breaks without any changes to Firestore data.
//
// Detection patterns (applied in order):
//   1. Existing \n newlines — always respected
//   2. Step arrows: →, ⟶, ->, =>
//   3. Equation chains: "25 = −3 + 10d" style (number/var = expr)
//   4. Numbered steps: "1. ... 2. ..."
//   5. Semicolons separating steps
//   6. "Therefore", "Hence", "So", "Thus" transition words
//   7. Long run-on sentences with calculation operators mid-string

import React from 'react';

/**
 * Splits an explanation string into logical lines for display.
 * Handles data stored without \n by detecting calculation patterns.
 */
function splitExplanation(text = '') {
  if (!text.trim()) return [];

  // Step 1 — honour any explicit newlines first
  if (text.includes('\n')) {
    return text.split('\n').map(l => l.trim()).filter(Boolean);
  }

  // Step 2 — numbered steps: "1. ... 2. ..." or "Step 1: ... Step 2:"
  if (/\b[Ss]tep\s*\d+[.:]/i.test(text) || /\s\d+\.\s/.test(text)) {
    const parts = text
      .split(/(?=\b(?:[Ss]tep\s*)?\d+[.:]\s)/)
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // Step 3 — arrow chains (→ ⟶ -> =>): split before each arrow
  // e.g. "35→17 r1, 17→8 r1" becomes separate lines per step
  if (/[→⟶]|->|=>/.test(text)) {
    // Split on comma+space OR space before a number followed by arrow
    const parts = text
      .split(/,\s*(?=\d)/)
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // Step 4 — transition keywords: break before them
  const transitionRe = /\s(?=(?:Therefore|Hence|Thus|So,|Reading|Verification|Note:|Check:|Substitut|From\s+(?:the|this)|Now,|Finally,|Then,|Next,)\s)/;
  if (transitionRe.test(text)) {
    const parts = text.split(transitionRe).map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // Step 5 — equation chains: break before each "VAR = EXPR" segment
  // Matches patterns like "25 = -3 + 10d" or "10d = 28" or "d = 2.8"
  // Only trigger if there are 3+ such segments (real chain, not simple equality)
  const eqParts = text.split(/(?<=\S)\s+(?=[A-Za-zα-ω\d]+\s*[=≥≤<>]\s*[-\d])/)
    .map(l => l.trim())
    .filter(Boolean);
  if (eqParts.length >= 3) return eqParts;

  // Step 6 — semicolons as step separators
  if (text.includes(';')) {
    const parts = text.split(';').map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // Step 7 — long single string (>120 chars) with mid-sentence calculation
  // Break on ". " followed by capital or number that looks like a new step
  if (text.length > 120) {
    const parts = text
      .split(/\.\s+(?=[A-Z\d])/)
      .map((l, i, arr) => i < arr.length - 1 ? l + '.' : l)
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // Fallback — return as single line
  return [text.trim()];
}

export default function ExplanationText({ text = '', style = {} }) {
  const lines = splitExplanation(text);
  return (
    <>
      {lines.map((line, i) => (
        <p key={i} style={{ margin: '0 0 4px', lineHeight: 1.65, ...style }}>
          {line}
        </p>
      ))}
    </>
  );
}
