// src/components/shared/ExplanationText.jsx — v4
//
// Fixes:
//  • Equation chains split even when space-separated (e.g. "25 = -3+10d 10d=28 d=2.8")
//  • Each equation step shown as a bullet in the teal left-border block
//  • Card has no max-height — grows to fit any length
//  • Intro sentence peeled cleanly before equation steps

import React from 'react';

const F  = "'Times New Roman', Times, serif";
const MO = "'Courier New', Courier, monospace";

/* ── classify a single already-split line ── */
function classifyLine(line) {
  const t = line.trim();
  if (/^(Verification|Check|Proof)\s*:/i.test(t)) return 'verification';
  if (/^=\s*/.test(t))                            return 'verification';
  if (/^(Reading|Therefore|Hence|Thus|So,|Note:|From the|Now,|Finally,|Then,|Next,)/i.test(t))
    return 'transition';
  if (/[→⟶]|->/.test(t))  return 'arrowStep';
  if (/\br\d\b/.test(t) && /\d/.test(t)) return 'arrowStep';
  // equation: letter/number = something numeric
  if (/[A-Za-z\d]\s*[=≥≤<>]\s*[-\d(]/.test(t) || /^\d[\d\s+\-×÷*/().=]+$/.test(t))
    return 'equation';
  return 'plain';
}

/* ── master splitter ── */
function splitExplanation(raw = '') {
  const text = raw.trim();
  if (!text) return [];

  // 1. Explicit newlines — always win
  if (text.includes('\n')) {
    return text.split('\n').map(l => l.trim()).filter(Boolean);
  }

  // 2. Arrow chains — split on ", " before a digit
  if (/[→⟶]|->/.test(text)) {
    const parts = text.split(/,\s*(?=\d)/).map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 3. Numbered / Step labels
  if (/\b[Ss]tep\s*\d+[.:]/i.test(text) || /(?<!\d)\d+\.\s[A-Z]/.test(text)) {
    const parts = text.split(/(?=\b(?:[Ss]tep\s*)?\d+[.:]\s)/).map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 4. Transition keywords
  const transRe = /(?<=\S)\s+(?=(?:Therefore|Hence|Thus|So,|Reading|Verification|Note:|Check:|Proof:|Substitut|From\s+(?:the|this)|Now,|Finally,|Then,|Next,)\b)/;
  if (transRe.test(text)) {
    const parts = text.split(transRe).map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 5. Equation chain — the key fix for Q2 style text
  //    Splits before any token that looks like "VAR = EXPR" or "NUM op NUM = NUM"
  //    Works on both space-separated and tightly written chains
  {
    // First try: split on space before "word/num = -?num" pattern
    const eq1 = text
      .split(/\s+(?=[A-Za-zα-ωΑ-Ω\d]+\s*[=≥≤<>]\s*[-\d(])/)
      .map(l => l.trim())
      .filter(Boolean);
    if (eq1.length >= 2) {
      // Only use if at least one segment actually has an = sign
      const hasEq = eq1.filter(p => /[=≥≤<>]/.test(p));
      if (hasEq.length >= 2) return eq1;
    }
  }

  // 6. Semicolons
  if (text.includes(';')) {
    const parts = text.split(';').map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 7. Long run-on — break on ". " before capital/digit
  if (text.length > 100) {
    const parts = text
      .split(/\.\s+(?=[A-Z\d])/)
      .map((l, i, arr) => i < arr.length - 1 ? l + '.' : l)
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  return [text];
}

/* ── parse into { intro, steps[], rest[] } ── */
function parseExplanation(text = '') {
  const lines = splitExplanation(text);
  if (!lines.length) return { intro: '', steps: [], rest: [] };
  if (lines.length === 1) return { intro: '', steps: [], rest: [{ text: lines[0], type: 'plain' }] };

  const classified = lines.map(l => ({ text: l, type: classifyLine(l) }));

  // Peel intro: first line that is plain and has no math operators
  let introText = '';
  let remaining = classified;
  const hasSteps = classified.some(c => c.type === 'arrowStep' || c.type === 'equation');
  if (
    classified[0].type === 'plain' &&
    !/[=+\-×÷*/→⟶<>]/.test(classified[0].text) &&
    hasSteps
  ) {
    introText = classified[0].text;
    remaining = classified.slice(1);
  }

  // Collect consecutive step lines (arrowStep OR equation) into the bullet block
  let stepEnd = 0;
  while (
    stepEnd < remaining.length &&
    (remaining[stepEnd].type === 'arrowStep' || remaining[stepEnd].type === 'equation')
  ) stepEnd++;

  const steps = remaining.slice(0, stepEnd).map(c => c.text);
  const rest  = remaining.slice(stepEnd);

  return { intro: introText, steps, rest };
}

/* ── renderers ── */

function IntroLine({ text }) {
  return (
    <p style={{
      margin: '0 0 8px', fontSize: 15, fontWeight: 700,
      lineHeight: 1.75, fontFamily: F, color: 'var(--text-primary)',
      textAlign: 'justify', width: '100%',
    }}>
      {text}
    </p>
  );
}

function StepList({ steps }) {
  if (!steps.length) return null;
  return (
    <div style={{
      margin: '2px 0 10px 4px',
      borderLeft: '3px solid var(--teal)',
      paddingLeft: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--teal)', flexShrink: 0,
            marginTop: 7, display: 'inline-block',
          }} />
          <span style={{
            fontSize: 15, fontWeight: 700,
            fontFamily: MO,
            color: 'var(--text-primary)',
            lineHeight: 1.65,
            wordBreak: 'break-word',
          }}>
            {step}
          </span>
        </div>
      ))}
    </div>
  );
}

function RestLine({ item }) {
  const { text, type } = item;

  if (type === 'transition') return (
    <p style={{
      margin: '4px 0', fontSize: 15, fontWeight: 700,
      fontFamily: F, color: 'var(--text-primary)',
      fontStyle: 'italic', lineHeight: 1.7,
    }}>{text}</p>
  );

  if (type === 'verification') return (
    <div style={{
      marginTop: 10, padding: '10px 14px', borderRadius: 10,
      background: 'rgba(22,163,74,0.08)',
      border: '1.5px solid rgba(22,163,74,0.3)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>✅</span>
      <span style={{
        fontSize: 15, fontWeight: 700, fontFamily: MO,
        color: '#16A34A', lineHeight: 1.7, whiteSpace: 'pre-wrap',
      }}>{text}</span>
    </div>
  );

  if (type === 'equation') return (
    <p style={{
      margin: '3px 0', fontSize: 15, fontWeight: 700,
      fontFamily: MO, color: 'var(--text-primary)',
      lineHeight: 1.7, paddingLeft: 4,
    }}>{text}</p>
  );

  return (
    <p style={{
      margin: '4px 0', fontSize: 15, fontWeight: 700,
      fontFamily: F, color: 'var(--text-primary)', lineHeight: 1.75,
      textAlign: 'justify', width: '100%',
    }}>{text}</p>
  );
}

/* ── main export ── */
export default function ExplanationText({ text = '', style = {} }) {
  const { intro, steps, rest } = parseExplanation(text);
  const isStructured = intro || steps.length > 0 || rest.some(r => r.type !== 'plain');

  if (!isStructured && rest.length === 1) {
    return (
      <p style={{
        margin: 0, lineHeight: 1.75, fontSize: 15,
        fontWeight: 700, fontFamily: F,
        color: 'var(--text-primary)', textAlign: 'justify', width: '100%', ...style,
      }}>
        {text}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {intro           && <IntroLine text={intro} />}
      {steps.length > 0 && <StepList steps={steps} />}
      {rest.map((item, i) => <RestLine key={i} item={item} />)}
    </div>
  );
}
