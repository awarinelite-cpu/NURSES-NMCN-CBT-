// src/components/entrance/EntranceTipOfDay.jsx
// "Tip of the Day" for the Nursing School Entrance Exam dashboard.
//
// AI-POWERED: Fetches a random sample of entrance exam questions from Firestore,
// sends them to Claude API, and receives a freshly generated study tip tailored
// to the actual question bank. The tip is cached in localStorage per day so
// the API is only called once per day per device.
//
// Fallback: If the API call fails or there are no questions yet, falls back to
// a local static tip so the component never shows an error to the student.
//
// Completely separate from the NMCN CBT TipOfDay (separate localStorage key).

import { useState, useEffect } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../../firebase/config';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

// ── Cache keys ───────────────────────────────────────────────────────────────
const CACHE_KEY    = 'entrance_ai_tip_v1';
const DISMISS_KEY  = 'entrance_tip_dismissed';

// ── Colour accent per subject ─────────────────────────────────────────────────
const SUBJECT_COLOR = {
  'English Language': '#2563EB',
  'English':          '#2563EB',
  'Mathematics':      '#7C3AED',
  'Maths':            '#7C3AED',
  'Biology':          '#16A34A',
  'Chemistry':        '#D97706',
  'Physics':          '#0891B2',
  'General Knowledge':'#DC2626',
  'General Science':  '#DC2626',
};

// ── Fallback static tips (used if AI fails or no questions available) ─────────
const FALLBACK_TIPS = [
  { icon: '🧬', cat: 'Biology', tip: 'Photosynthesis equation: 6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂. Light reactions occur in thylakoids; the Calvin cycle (dark reaction) occurs in the stroma. Always remember both stages for entrance exam questions.' },
  { icon: '🔢', cat: 'Mathematics', tip: 'BODMAS rule: Brackets → Orders → Division → Multiplication → Addition → Subtraction. Apply strictly left-to-right within the same priority level. Nigerian entrance exams test this in nearly every paper.' },
  { icon: '⚗️', cat: 'Chemistry', tip: 'OILRIG: Oxidation Is Loss, Reduction Is Gain (of electrons). At the cathode (−ve): reduction occurs. At the anode (+ve): oxidation occurs. Memorise this for electrolysis questions.' },
  { icon: '⚡', cat: 'Physics', tip: 'Equations of motion: v = u + at · s = ut + ½at² · v² = u² + 2as. Identify which variable is missing, then pick the equation that does not contain it.' },
  { icon: '📝', cat: 'English Language', tip: 'Concord tip: Collective nouns (team, committee, jury) take a singular verb when acting as a unit ("The jury has reached a verdict") but plural when members act individually.' },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ── Fetch a random-ish sample of questions from Firestore ────────────────────
// Firestore doesn't support ORDER BY RAND(), so we read up to 40 docs and
// shuffle locally, then pass the first ~12 to Claude.
async function sampleQuestions(n = 40) {
  const snap = await getDocs(query(collection(db, 'entranceExamQuestions'), limit(n)));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Fisher-Yates shuffle
  for (let i = docs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [docs[i], docs[j]] = [docs[j], docs[i]];
  }
  return docs.slice(0, 12);
}

// ── Call Claude API to generate a tip ────────────────────────────────────────
async function generateAITip(questions) {
  // Build a compact question digest for the prompt
  const digest = questions.map((q, i) => {
    const text    = q.question || q.questionText || '';
    const subject = q.subject  || 'General';
    const answer  = q.answer   || '';
    const exp     = q.explanation ? ` Explanation: ${q.explanation.slice(0, 120)}` : '';
    return `Q${i + 1} [${subject}]: ${text.slice(0, 200)}${answer ? ` (Answer: ${answer})` : ''}${exp}`;
  }).join('\n');

  const prompt = `You are a study coach for Nigerian nursing school entrance exam candidates.
Below is a sample of actual questions from the exam question bank.

${digest}

Based on THESE specific questions, generate ONE concise, high-value "Tip of the Day" that:
- Targets a concept, pattern, or trick directly relevant to the questions shown
- Is practical and immediately actionable (not vague advice like "study hard")
- Is 2–4 sentences long
- Includes the subject name (English Language / Mathematics / Biology / Chemistry / Physics / General Knowledge)

Respond ONLY with a valid JSON object — no markdown, no backticks, no preamble:
{"icon":"<single emoji>","cat":"<subject>","tip":"<tip text>"}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);
  const data = await response.json();
  const raw  = data.content?.find(b => b.type === 'text')?.text || '';
  // Strip accidental code fences
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EntranceTipOfDay() {
  const today = todayKey();

  const [tip,       setTip]       = useState(null);   // { icon, cat, tip, ai }
  const [loading,   setLoading]   = useState(true);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === today);
  const [expanded,  setExpanded]  = useState(true);

  useEffect(() => {
    if (dismissed) { setLoading(false); return; }

    // Check cache first
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached?.date === today && cached?.tip) {
        setTip(cached.tip);
        setLoading(false);
        return;
      }
    } catch (_) { /* ignore bad cache */ }

    // Generate fresh tip
    (async () => {
      try {
        const questions = await sampleQuestions(40);
        if (questions.length === 0) throw new Error('no questions');

        const aiTip = await generateAITip(questions);
        const result = { ...aiTip, ai: true };
        localStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, tip: result }));
        setTip(result);
      } catch (err) {
        console.warn('[EntranceTipOfDay] AI generation failed, using fallback:', err.message);
        // Fallback: pick one of the static tips for today
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        const fallback  = { ...FALLBACK_TIPS[dayOfYear % FALLBACK_TIPS.length], ai: false };
        setTip(fallback);
      } finally {
        setLoading(false);
      }
    })();
  }, [dismissed, today]);

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, today);
    setDismissed(true);
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        background:    'linear-gradient(135deg, var(--teal)10 0%, var(--teal)06 100%)',
        border:        '1.5px solid var(--border)',
        borderRadius:  14,
        marginBottom:  20,
        padding:       '14px 16px',
        display:       'flex',
        alignItems:    'center',
        gap:           12,
      }}>
        <span style={{ fontSize: 20 }}>💡</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: 'var(--teal)', marginBottom: 6 }}>
            💡 Entrance Exam Tip of the Day
          </div>
          <div style={{
            height: 12, borderRadius: 6, background: 'var(--bg-tertiary)',
            width: '80%', marginBottom: 6,
            animation: 'pulse 1.4s ease-in-out infinite',
          }} />
          <div style={{
            height: 12, borderRadius: 6, background: 'var(--bg-tertiary)',
            width: '60%',
            animation: 'pulse 1.4s ease-in-out infinite',
          }} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F, marginTop: 6 }}>
            ✨ AI is generating your personalised tip…
          </div>
        </div>
      </div>
    );
  }

  if (!tip) return null;

  const catColor = SUBJECT_COLOR[tip.cat] || '#0D9488';

  return (
    <div style={{
      background:   `linear-gradient(135deg, ${catColor}10 0%, ${catColor}06 100%)`,
      border:       `1.5px solid ${catColor}30`,
      borderRadius: 14,
      marginBottom: 20,
      overflow:     'hidden',
    }}>
      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 20 }}>{tip.icon || '💡'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: catColor }}>
            💡 Entrance Exam Tip of the Day
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>
            {tip.cat} · {tip.ai ? '✨ AI-generated from your question bank' : 'Changes daily'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: `${catColor}18`, color: catColor,
          }}>
            {tip.cat}
          </span>
          <span style={{
            fontSize: 14, color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}>▾</span>
          <button
            onClick={e => { e.stopPropagation(); handleDismiss(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px',
              lineHeight: 1, borderRadius: 4,
            }}
            title="Dismiss for today"
          >✕</button>
        </div>
      </div>

      {/* ── Tip body ─────────────────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${catColor}18` }}>
          <p style={{
            fontFamily: F, fontSize: 14, color: 'var(--text-primary)',
            lineHeight: 1.75, margin: '12px 0 0', fontWeight: 700,
          }}>
            {tip.tip}
          </p>
          {tip.ai && (
            <div style={{
              marginTop: 10, fontSize: 11, color: 'var(--text-muted)',
              fontFamily: F, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span>✨</span>
              <span>Auto-generated from your live question bank · Refreshes tomorrow</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
