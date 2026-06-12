// src/components/shared/ExplanationText.jsx
//
// Upgraded explanation renderer — v2
// • Bigger, clearer text
// • Calculation steps shown as numbered visual step cards, not sentences
// • Intro text separated from steps
// • Handles \n, semicolons, arrows, transition words, equation chains

import React from 'react';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ── Detect whether text is a calculation/multi-step explanation ── */
function isCalculation(text) {
  return (
    /[→⟶]|->|=>/.test(text) ||
    /\b[Ss]tep\s*\d+[.:]/i.test(text) ||
    /\d+\s*[+\-×÷*/=]\s*\d/.test(text) ||
    /\b(Therefore|Hence|Thus|So,|Substitut|From the|Now,|Finally,|Then,|Next,)\b/i.test(text) ||
    (text.includes(';') && text.split(';').length > 2) ||
    (text.includes('=') && (text.match(/=/g) || []).length >= 2)
  );
}

/* ── Split text into logical steps ── */
function splitIntoSteps(text = '') {
  if (!text.trim()) return [];

  // 1. Explicit newlines
  if (text.includes('\n')) {
    return text.split('\n').map(l => l.trim()).filter(Boolean);
  }

  // 2. Numbered steps: "1. ... 2. ..." or "Step 1: ... Step 2:"
  if (/\b[Ss]tep\s*\d+[.:]/i.test(text) || /(?<!\d)\d+\.\s[A-Z]/.test(text)) {
    const parts = text
      .split(/(?=\b(?:[Ss]tep\s*)?\d+[.:]\s)/)
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 3. Arrow chains — split on comma or space before step
  if (/[→⟶]|->|=>/.test(text)) {
    const parts = text
      .split(/,\s*(?=\S)/)
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 4. Transition keywords
  const transRe = /\s(?=(?:Therefore|Hence|Thus|So,|Reading|Verification|Note:|Check:|Substitut|From\s+(?:the|this)|Now,|Finally,|Then,|Next,)\s)/;
  if (transRe.test(text)) {
    const parts = text.split(transRe).map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 5. Equation chains (3+ equation segments)
  const eqParts = text
    .split(/(?<=\S)\s+(?=[A-Za-zα-ω\d]+\s*[=≥≤<>]\s*[-\d])/)
    .map(l => l.trim())
    .filter(Boolean);
  if (eqParts.length >= 3) return eqParts;

  // 6. Semicolons
  if (text.includes(';')) {
    const parts = text.split(';').map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 7. Long text — break on ". " followed by capital/number
  if (text.length > 120) {
    const parts = text
      .split(/\.\s+(?=[A-Z\d])/)
      .map((l, i, arr) => (i < arr.length - 1 ? l + '.' : l))
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  return [text.trim()];
}

/* ── Separate intro sentence(s) from steps ── */
function parseExplanation(text = '') {
  const steps = splitIntoSteps(text);
  if (steps.length <= 1) return { intro: text.trim(), steps: [] };

  // If first part looks like an intro (doesn't contain an operator or equation) keep it separate
  const first = steps[0];
  const looksLikeIntro =
    !/[=+\-×÷*/→⟶]/.test(first) &&
    first.length < 120 &&
    steps.length > 2;

  if (looksLikeIntro) {
    return { intro: first, steps: steps.slice(1) };
  }
  return { intro: '', steps };
}

/* ── Step label helper ── */
function stepLabel(line, index) {
  const numberedMatch = line.match(/^([Ss]tep\s*\d+[.:]|\d+[.:])\s*/);
  if (numberedMatch) return null; // label already in text
  return `Step ${index + 1}`;
}

/* ── Main component ── */
export default function ExplanationText({ text = '', style = {} }) {
  const calc = isCalculation(text);
  const { intro, steps } = parseExplanation(text);

  if (!calc || steps.length === 0) {
    // Plain text — just render bigger and cleaner
    return (
      <p style={{
        margin: 0,
        lineHeight: 1.75,
        fontSize: 15,
        fontWeight: 700,
        fontFamily: F,
        color: 'var(--text-primary)',
        ...style,
      }}>
        {text}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Intro sentence */}
      {intro && (
        <p style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1.75,
          fontFamily: F,
          color: 'var(--text-primary)',
          ...style,
        }}>
          {intro}
        </p>
      )}

      {/* Step cards */}
      {steps.map((line, i) => {
        const label = stepLabel(line, i);
        const cleanLine = label ? line : line.replace(/^([Ss]tep\s*\d+[.:]|\d+[.])\s*/, '');
        return (
          <div key={i} style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            background: 'rgba(13,148,136,0.06)',
            border: '1px solid rgba(13,148,136,0.18)',
            borderRadius: 10,
            padding: '10px 14px',
          }}>
            {/* Step number badge */}
            <div style={{
              minWidth: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--teal)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 900,
              fontFamily: H,
              flexShrink: 0,
              marginTop: 1,
            }}>
              {i + 1}
            </div>

            {/* Step text */}
            <p style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.7,
              fontFamily: F,
              color: 'var(--text-primary)',
              flex: 1,
            }}>
              {cleanLine}
            </p>
          </div>
        );
      })}
    </div>
  );
}
