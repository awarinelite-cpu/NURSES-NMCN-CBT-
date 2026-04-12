// src/components/exam/DailyPracticePage.jsx
// Route: /daily-practice
//
// FLOW:
//   Step 1 — Choose a Nursing Category (grid)
//   Step 2 — Set Up Your Exam (question count, time limit, shuffle, etc.)
//   Step 3 — /exam/session  (existing ExamSession, unchanged)
//
// On submit, ExamSession saves to the "dailyPracticeArchive" subcollection
// under the student's uid (first-time only — see DailyPracticeArchivePage).

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NURSING_CATEGORIES } from '../../data/categories';
import { useAuth } from '../../context/AuthContext';
import { fetchStreak, practicedToday, streakLabel } from '../../utils/streakUtils';

const QUESTION_COUNTS = [10, 20, 30, 50, 100];
const TIME_OPTIONS = [
  { label: 'No Timer',  value: 0   },
  { label: '15 mins',   value: 15  },
  { label: '30 mins',   value: 30  },
  { label: '1 hour',    value: 60  },
  { label: '2 hours',   value: 120 },
];

export default function DailyPracticePage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  // Step 1 = category picker, Step 2 = exam setup
  const [step,      setStep]      = useState(1);
  const [category,  setCategory]  = useState(null); // full category object
  const [count,     setCount]     = useState(20);
  const [timeLimit, setTimeLimit] = useState(30);
  const [shuffle,   setShuffle]   = useState(true);
  const [showExpl,  setShowExpl]  = useState(false);

  // ── Streak ─────────────────────────────────────────────────────────────────
  const [streakData, setStreakData] = useState(null);

  useEffect(() => {
    if (!profile?.uid) return;
    fetchStreak(profile.uid).then(setStreakData).catch(() => {});
  }, [profile?.uid]);

  // ── Step 1 handlers ────────────────────────────────────────────────────────
  const handleCategoryClick = (cat) => {
    setCategory(cat);
    setStep(2);
  };

  // ── Step 2 — start exam ────────────────────────────────────────────────────
  const handleStartExam = () => {
    const now    = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toISOString();               // full ISO for archive

    // Build a stable archiveId so we can deduplicate saves in ExamSession
    // Format: daily_{categoryId}_{YYYY-MM-DD}_{userId}
    const archiveId = `daily_${category.id}_${dateStr}_${profile?.uid || 'student'}`;

    const p = new URLSearchParams({
      category:    category.id,
      examType:    'daily_practice',
      count:       String(count),
      timeLimit:   String(timeLimit),
      shuffle:     String(shuffle),
      showExpl:    String(showExpl),
      archiveId,           // key used by ExamSession to save to archive once
      createdAt:   timeStr,
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  // ── STEP 1 — Category Picker ───────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>⚡</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              Daily Practice Quiz
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Choose a nursing category to begin today's practice quiz.
          </p>
        </div>

        {/* ── Streak banner ── */}
        {streakData && streakData.currentStreak >= 1 && (
          <StreakBanner streakData={streakData} />
        )}

        {/* Step indicator */}
        <StepIndicator step={1} />

        {/* Section label */}
        <div style={styles.sectionHead}>🏥 Choose a Nursing Category</div>

        {/* Category grid */}
        <div style={styles.catGrid}>
          {NURSING_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat)}
              style={{
                ...styles.catCard,
                borderColor: `${cat.color}60`,
                background: `${cat.color}0D`,
              }}
            >
              {/* Colour accent line */}
              <div style={{ ...styles.catAccent, background: cat.color }} />

              <div style={{ ...styles.catIconBox, background: `${cat.color}20` }}>
                <span style={{ fontSize: 26 }}>{cat.icon}</span>
              </div>

              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {cat.shortLabel}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {cat.examType === 'basic' ? 'Basic RN' : 'Post Basic'}
                </div>
              </div>

              <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── STEP 2 — Exam Setup ────────────────────────────────────────────────────
  const previewRows = [
    ['🏥 Category',  category?.shortLabel || '—'],
    ['📋 Type',      'Daily Practice'],
    ['❓ Questions',  count],
    ['⏱ Time',       timeLimit ? `${timeLimit} mins` : 'Unlimited'],
    ['🔀 Shuffle',    shuffle ? 'Yes' : 'No'],
    ['💡 Explain',    showExpl ? 'Yes' : 'No'],
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto' }}>

      {/* Back */}
      <button onClick={() => setStep(1)} style={styles.backBtn}>
        ← Back to Categories
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <StepIndicator step={2} />

        {/* Selected category pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: `${category.color}18`, border: `1.5px solid ${category.color}40`,
          borderRadius: 40, padding: '8px 16px', marginBottom: 18,
        }}>
          <span style={{ fontSize: 20 }}>{category.icon}</span>
          <div>
            <div style={{ fontSize: 11, color: category.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Selected Category
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {category.label}
            </div>
          </div>
          <button
            onClick={() => setStep(1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '0 0 0 4px' }}
          >✕</button>
        </div>

        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 4px', color: 'var(--text-primary)' }}>
          ⚙️ Set Up Your Exam
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Customise your daily practice session
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Question count */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHeadSm}>❓ Number of Questions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {QUESTION_COUNTS.map(n => (
              <button key={n} onClick={() => setCount(n)}
                style={{
                  ...styles.chipBtn,
                  borderColor: count === n ? 'var(--blue-mid)' : 'var(--border)',
                  background:  count === n ? 'var(--blue-glow)' : 'var(--bg-tertiary)',
                  color:       count === n ? 'var(--blue-mid)' : 'var(--text-secondary)',
                }}
              >
                {n} Qs
              </button>
            ))}
          </div>
        </div>

        {/* Time limit */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHeadSm}>⏱ Time Limit</div>
          <select
            className="form-input form-select"
            value={timeLimit}
            onChange={e => setTimeLimit(Number(e.target.value))}
            style={{ marginTop: 8, maxWidth: 220 }}
          >
            {TIME_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Toggles */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHeadSm}>⚙️ Options</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <ToggleRow
              label="🔀 Shuffle Questions"
              desc="Randomise question order each session"
              checked={shuffle}
              onChange={setShuffle}
            />
            <ToggleRow
              label="💡 Show Explanations After"
              desc="Display answer explanations during review"
              checked={showExpl}
              onChange={setShowExpl}
            />
          </div>
        </div>

        {/* Preview + Start */}
        <div className="card" style={{ ...styles.section, background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14, marginBottom: 14 }}>👁️ Exam Preview</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {previewRows.map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{v}</div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleStartExam}
            style={{ fontSize: 16, padding: '14px' }}
          >
            🚀 Start Exam
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-hint)', marginTop: 10 }}>
            Your result will be saved to your Daily Practice Archive automatically
          </p>
        </div>

      </div>
    </div>
  );
}

// ── Streak Banner ──────────────────────────────────────────────────────────────
function StreakBanner({ streakData }) {
  const done    = practicedToday(streakData);
  const current = streakData?.currentStreak || 0;
  const longest = streakData?.longestStreak || 0;
  const label   = streakLabel(current);

  // Pick a motivational message based on streak length
  let message = "Keep it going!";
  if (done)         message = "✅ You've practiced today. Come back tomorrow!";
  else if (current >= 30) message = "Incredible discipline — don't stop now!";
  else if (current >= 14) message = "Two weeks strong. You're unstoppable!";
  else if (current >= 7)  message = "One week in — habits are forming!";
  else if (current >= 3)  message = "Nice momentum — practice again today!";
  else                    message = "Good start — keep the streak alive!";

  const flameColor = current >= 14 ? '#FF4500' : current >= 7 ? '#F97316' : '#F59E0B';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap',
      padding: '14px 20px', marginBottom: 24, borderRadius: 14,
      background: `linear-gradient(135deg, ${flameColor}12, ${flameColor}06)`,
      border: `1.5px solid ${flameColor}30`,
    }}>
      {/* Left: flame + streak count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: `${flameColor}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>
          🔥
        </div>
        <div>
          <div style={{
            fontWeight: 900, fontSize: 22, color: flameColor, lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {label}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {message}
          </div>
        </div>
      </div>

      {/* Right: best streak pill */}
      {longest > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 30, flexShrink: 0,
          background: `${flameColor}12`, border: `1px solid ${flameColor}30`,
        }}>
          <span style={{ fontSize: 13 }}>🏆</span>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Best
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: flameColor, lineHeight: 1 }}>
              {longest} days
            </div>
          </div>
        </div>
      )}

      {/* Today done indicator */}
      {done && (
        <div style={{
          fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
          background: 'rgba(22,163,74,0.12)', color: '#16A34A',
          border: '1px solid rgba(22,163,74,0.3)', flexShrink: 0,
        }}>
          ✅ Done today
        </div>
      )}
    </div>
  );
}

// ── Step Indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = ['Choose Category', 'Set Up Exam', 'Take Exam'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const num   = i + 1;
        const done  = step > num;
        const active = step === num;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? 'var(--teal)' : active ? 'var(--teal)' : 'var(--bg-tertiary)',
                border: `2px solid ${done || active ? 'var(--teal)' : 'var(--border)'}`,
                color: done || active ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 900, flexShrink: 0,
                opacity: done ? 0.65 : 1,
              }}>
                {done ? '✓' : num}
              </div>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: active ? 'var(--teal)' : done ? 'var(--text-muted)' : 'var(--text-muted)',
              }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 28, height: 2, borderRadius: 2, margin: '0 6px',
                background: step > num ? 'var(--teal)' : 'var(--border)',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
          background: checked ? 'var(--teal)' : 'var(--border)',
          position: 'relative', transition: 'background 0.25s', flexShrink: 0,
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3, left: checked ? 23 : 3,
          transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }} />
      </button>
    </div>
  );
}

const styles = {
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  sectionHead: {
    fontWeight: 700, fontSize: 15, color: 'var(--text-primary)',
    marginBottom: 16, letterSpacing: 0.2,
  },
  sectionHeadSm: {
    fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4,
  },
  section: { padding: '18px 16px' },
  catGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 12,
  },
  catCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '16px 18px', borderRadius: 14,
    border: '1.5px solid', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.2s',
    position: 'relative', overflow: 'hidden',
    background: 'var(--bg-card)',
  },
  catAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, borderRadius: '4px 0 0 4px',
  },
  catIconBox: {
    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  chipBtn: {
    padding: '8px 16px', border: '2px solid', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', transition: 'all 0.2s',
  },
};