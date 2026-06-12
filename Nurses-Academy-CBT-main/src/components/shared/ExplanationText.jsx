// src/components/shared/ExplanationText.jsx  — v3
//
// Layout mirrors this exact format:
//
//   Explanation:
//   Dividing 35 repeatedly by 2:
//     35→17 r1,
//     17→8 r1,
//     ...
//   Reading remainders upward gives 100011₂.
//   Verification: 32+2+1
//   = 35 ✓

import React from 'react';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ─────────────────────────────────────────────────────────────
   SECTION TYPES
   intro       — plain lead sentence (no operators)
   arrowStep   — contains → or r\d (remainder steps)
   transition  — starts with Reading/Therefore/Hence/Thus/Note/So
   verification — starts with Verification/Check/Proof/= 
   equation    — contains = with numbers on both sides
   plain       — anything else
───────────────────────────────────────────────────────────── */
function classifyLine(line) {
  const t = line.trim();
  if (/^(Verification|Check|Proof)\s*:/i.test(t))  return 'verification';
  if (/^=\s*/.test(t))                              return 'verification';
  if (/^(Reading|Therefore|Hence|Thus|So,|Note:|From the|Now,|Finally,|Then,|Next,)/i.test(t)) return 'transition';
  if (/[→⟶]|->/.test(t))                          return 'arrowStep';
  if (/\br\d\b/.test(t) && /\d/.test(t))           return 'arrowStep';
  if (/\d\s*=\s*\d/.test(t) || /[a-z]\s*=\s*[-\d]/i.test(t)) return 'equation';
  return 'plain';
}

/* ─────────────────────────────────────────────────────────────
   SPLITTER
   Priority order so the most specific rule wins first.
───────────────────────────────────────────────────────────── */
function splitExplanation(text = '') {
  const raw = text.trim();
  if (!raw) return [];

  // 1. Explicit newlines — always honoured
  if (raw.includes('\n')) {
    return raw.split('\n').map(l => l.trim()).filter(Boolean);
  }

  // 2. Arrow chains: split on ", " before a digit (keeps arrow inline per step)
  if (/[→⟶]|->/.test(raw)) {
    const parts = raw
      .split(/,\s*(?=\d)/)          // comma before digit → new step
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 3. Numbered steps:  "1. …  2. …"  or  "Step 1: …"
  if (/\b[Ss]tep\s*\d+[.:]/i.test(raw) || /(?<!\d)\d+\.\s[A-Z]/.test(raw)) {
    const parts = raw
      .split(/(?=\b(?:[Ss]tep\s*)?\d+[.:]\s)/)
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 4. Transition/conclusion keywords — break before them
  const transRe = /(?<=\S)\s+(?=(?:Therefore|Hence|Thus|So,|Reading|Verification|Note:|Check:|Proof:|Substitut|From\s+(?:the|this)|Now,|Finally,|Then,|Next,)\s)/;
  if (transRe.test(raw)) {
    const parts = raw.split(transRe).map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 5. Equation chain (≥3 segments like "25 = -3+10d  10d=28  d=2.8")
  const eqParts = raw
    .split(/(?<=\S)\s+(?=[A-Za-zα-ω\d]+\s*[=≥≤<>]\s*[-\d])/)
    .map(l => l.trim())
    .filter(Boolean);
  if (eqParts.length >= 3) return eqParts;

  // 6. Semicolons
  if (raw.includes(';')) {
    const parts = raw.split(';').map(l => l.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 7. Long run-on: break on ". " before capital/digit
  if (raw.length > 120) {
    const parts = raw
      .split(/\.\s+(?=[A-Z\d])/)
      .map((l, i, arr) => (i < arr.length - 1 ? l + '.' : l))
      .map(l => l.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
  }

  return [raw];
}

/* ─────────────────────────────────────────────────────────────
   STRUCTURED PARSE
   Returns { intro, arrowSteps, rest }
   intro      — first line if it has no operators (the "Dividing X by Y:" line)
   arrowSteps — consecutive arrowStep lines
   rest       — remaining lines (transitions, verification, equations, plain)
───────────────────────────────────────────────────────────── */
function parseExplanation(text = '') {
  const lines = splitExplanation(text);
  if (lines.length === 0) return { intro: '', arrowSteps: [], rest: [] };
  if (lines.length === 1) return { intro: '', arrowSteps: [], rest: lines };

  const classified = lines.map(l => ({ text: l, type: classifyLine(l) }));

  // Peel off intro: first line that is 'plain' and has no math operators
  let introText = '';
  let remaining = classified;
  if (
    classified[0].type === 'plain' &&
    !/[=+\-×÷*/→⟶]/.test(classified[0].text) &&
    classified.some(c => c.type === 'arrowStep' || c.type === 'equation')
  ) {
    introText = classified[0].text;
    remaining = classified.slice(1);
  }

  // Collect consecutive arrowStep lines
  let arrowEnd = 0;
  while (arrowEnd < remaining.length && remaining[arrowEnd].type === 'arrowStep') arrowEnd++;
  const arrowSteps = remaining.slice(0, arrowEnd).map(c => c.text);
  const rest       = remaining.slice(arrowEnd).map(c => c);

  return { intro: introText, arrowSteps, rest };
}

/* ─────────────────────────────────────────────────────────────
   SUB-RENDERERS
───────────────────────────────────────────────────────────── */

function IntroLine({ text }) {
  return (
    <p style={{
      margin: '0 0 6px',
      fontSize: 15,
      fontWeight: 700,
      lineHeight: 1.7,
      fontFamily: F,
      color: 'var(--text-primary)',
    }}>
      {text}
    </p>
  );
}

function ArrowStepList({ steps }) {
  if (!steps.length) return null;
  return (
    <div style={{
      margin: '4px 0 8px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      borderLeft: '3px solid var(--teal)',
      paddingLeft: 14,
    }}>
      {steps.map((step, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {/* small teal bullet */}
          <span style={{
            width: 8, height: 8,
            borderRadius: '50%',
            background: 'var(--teal)',
            flexShrink: 0,
            display: 'inline-block',
          }} />
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "'Courier New', Courier, monospace",
            color: 'var(--text-primary)',
            letterSpacing: 0.2,
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

  if (type === 'transition') {
    return (
      <p style={{
        margin: '6px 0 4px',
        fontSize: 15,
        fontWeight: 700,
        fontFamily: F,
        color: 'var(--text-primary)',
        fontStyle: 'italic',
        lineHeight: 1.7,
      }}>
        {text}
      </p>
    );
  }

  if (type === 'verification') {
    return (
      <div style={{
        marginTop: 8,
        padding: '10px 14px',
        borderRadius: 10,
        background: 'rgba(22,163,74,0.08)',
        border: '1.5px solid rgba(22,163,74,0.3)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>✅</span>
        <span style={{
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "'Courier New', Courier, monospace",
          color: '#16A34A',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }}>
          {text}
        </span>
      </div>
    );
  }

  if (type === 'equation') {
    return (
      <p style={{
        margin: '4px 0',
        fontSize: 15,
        fontWeight: 700,
        fontFamily: "'Courier New', Courier, monospace",
        color: 'var(--text-primary)',
        lineHeight: 1.7,
        paddingLeft: 8,
      }}>
        {text}
      </p>
    );
  }

  // plain
  return (
    <p style={{
      margin: '4px 0',
      fontSize: 15,
      fontWeight: 700,
      fontFamily: F,
      color: 'var(--text-primary)',
      lineHeight: 1.75,
    }}>
      {text}
    </p>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────── */
export default function ExplanationText({ text = '', style = {} }) {
  const { intro, arrowSteps, rest } = parseExplanation(text);

  // Fully plain — no structure detected
  const isStructured = intro || arrowSteps.length > 0 || rest.some(r => r.type !== 'plain');

  if (!isStructured && rest.length === 1) {
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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {intro      && <IntroLine text={intro} />}
      {arrowSteps.length > 0 && <ArrowStepList steps={arrowSteps} />}
      {rest.map((item, i) => <RestLine key={i} item={item} />)}
    </div>
  );
}
