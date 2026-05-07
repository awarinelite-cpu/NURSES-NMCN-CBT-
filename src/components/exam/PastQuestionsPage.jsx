// src/components/exam/PastQuestionsPage.jsx
// Route: /past-questions
//
// FLOW:
//   Step 1 — Choose a Nursing Specialty (ALL specialties shown)
//   Step 2 — Set Up Exam (choose year, count, time limit, options)
//   Step 3 — ExamSession (/exam/session)
//
// Year selection is mandatory — student must pick a year before starting.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NURSING_CATEGORIES, EXAM_YEARS } from '../../data/categories';

const TIME_OPTIONS = [
  { label: 'No Timer',  value: 0   },
  { label: '15 mins',   value: 15  },
  { label: '30 mins',   value: 30  },
  { label: '1 hour',    value: 60  },
  { label: '2 hours',   value: 120 },
  { label: '3 hours',   value: 180 },
];

const QUESTION_COUNTS = [10, 20, 30, 40, 50, 100, 150, 200, 250];

function StepIndicator({ step }) {
  const steps = ['Choose Specialty', 'Set Up', 'Take Exam'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const num = i + 1;
        const done = step > num;
        const active = step === num;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: done || active ? 'var(--teal)' : 'var(--bg-tertiary)',
                border: `2px solid ${done || active ? 'var(--teal)' : 'var(--border)'}`,
                color: done || active ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 900, opacity: done ? 0.65 : 1,
              }}>{done ? '✓' : num}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--teal)' : 'var(--text-muted)' }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 16, height: 2, borderRadius: 2, margin: '0 4px', background: step > num ? 'var(--teal)' : 'var(--border)' }} />
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
      <button onClick={() => onChange(!checked)} style={{
        width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
        background: checked ? 'var(--teal)' : 'var(--border)',
        position: 'relative', transition: 'background 0.25s', flexShrink: 0,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3, left: checked ? 23 : 3,
          transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }} />
      </button>
    </div>
  );
}

export default function PastQuestionsPage() {
  const navigate = useNavigate();

  const [step,      setStep]      = useState(1);
  const [specialty, setSpecialty] = useState(null);
  const [year,      setYear]      = useState('');
  const [count,     setCount]     = useState(40);
  const [timeLimit, setTimeLimit] = useState(30);
  const [shuffle,   setShuffle]   = useState(true);
  const [showExpl,  setShowExpl]  = useState(false);
  const [error,     setError]     = useState('');

  const handleSpecialtySelect = (cat) => {
    setSpecialty(cat);
    setYear('');
    setError('');
    setStep(2);
  };

  const handleStart = () => {
    if (!year) {
      setError('Please select an exam year to continue.');
      return;
    }
    setError('');
    navigate('/exam/session', {
      state: {
        examType:    'past_questions',
        category:    specialty.id,
        courseLabel: specialty.label,
        examYear:    year,
        count,
        timeLimit,
        doShuffle:   shuffle,
        showExpl,
      },
    });
  };

  // ── STEP 1 — Specialty Picker ─────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 32 }}>📜</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
              Past Questions
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Practice with real NMCN past examination questions by specialty.
          </p>
        </div>

        <StepIndicator step={1} />
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
          🏥 Choose a Nursing Specialty
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {NURSING_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleSpecialtySelect(cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 18px', borderRadius: 14,
                border: `1.5px solid ${cat.color}60`,
                background: `${cat.color}0D`,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px', background: cat.color }} />
              <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, background: `${cat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 26 }}>{cat.icon}</span>
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {cat.shortLabel}
                </div>
                <div style={{ fontSize: 11, color: cat.color, fontWeight: 600 }}>
                  NMCN Past Questions
                </div>
              </div>
              <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── STEP 2 — Exam Setup ───────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>
      <button onClick={() => { setStep(1); setSpecialty(null); }} style={styles.backBtn}>
        ← Back to Specialties
      </button>

      {/* Specialty pill */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: `${specialty.color}18`, border: `1.5px solid ${specialty.color}40`,
        borderRadius: 40, padding: '8px 16px', marginBottom: 18,
      }}>
        <span style={{ fontSize: 20 }}>{specialty.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Selected Specialty
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {specialty.label}
          </div>
        </div>
        <button onClick={() => { setStep(1); setSpecialty(null); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
      </div>

      <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 4px', color: 'var(--text-primary)' }}>
        ⚙️ Set Up Your Exam
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' }}>
        Customise your session
      </p>

      <StepIndicator step={2} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Year — REQUIRED, student must choose */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>
            📅 Exam Year
            <span style={{ fontWeight: 400, fontSize: 12, color: '#EF4444', marginLeft: 8 }}>* required</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
            Select the year of past questions you want to attempt.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EXAM_YEARS.map(y => (
              <button key={y} onClick={() => { setYear(y); setError(''); }} style={{
                padding: '10px 18px', border: '2px solid', borderRadius: 8,
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', transition: 'all 0.2s',
                borderColor: year === y ? '#F59E0B' : 'var(--border)',
                background:  year === y ? 'rgba(245,158,11,0.15)' : 'var(--bg-tertiary)',
                color:       year === y ? '#92400E' : 'var(--text-secondary)',
                boxShadow:   year === y ? '0 0 0 3px rgba(245,158,11,0.2)' : 'none',
              }}>
                {y} {year === y && '✓'}
              </button>
            ))}
          </div>
        </div>

        {/* Question count */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>❓ Number of Questions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {QUESTION_COUNTS.map(n => (
              <button key={n} onClick={() => setCount(n)} style={{
                padding: '10px 18px', border: '2px solid', borderRadius: 8,
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', transition: 'all 0.2s',
                borderColor: count === n ? 'var(--teal)' : 'var(--border)',
                background:  count === n ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                color:       count === n ? 'var(--teal)' : 'var(--text-secondary)',
              }}>
                {n} Qs
              </button>
            ))}
          </div>
        </div>

        {/* Time limit */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>⏱ Time Limit</div>
          <select className="form-input form-select" value={timeLimit}
            onChange={e => setTimeLimit(Number(e.target.value))}
            style={{ marginTop: 8, maxWidth: 220 }}>
            {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Options */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>⚙️ Options</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <ToggleRow label="🔀 Shuffle Questions" desc="Randomise question order each session" checked={shuffle} onChange={setShuffle} />
            <ToggleRow label="💡 Show Explanations After" desc="Display answer explanations during review" checked={showExpl} onChange={setShowExpl} />
          </div>
        </div>

        {/* Preview + Start */}
        <div className="card" style={{ ...styles.section, background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14, marginBottom: 14 }}>
            👁️ Exam Preview
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              ['🏥 Specialty', specialty.shortLabel],
              ['📅 Year',      year || '— not selected —'],
              ['❓ Questions', `${count} Qs`],
              ['⏱ Time',       timeLimit ? `${timeLimit} mins` : 'Unlimited'],
              ['🔀 Shuffle',   shuffle ? 'Yes' : 'No'],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={{
                  fontWeight: 700, fontSize: 13,
                  color: (!year && k === '📅 Year') ? '#EF4444' : 'var(--text-primary)',
                }}>{v}</div>
              </div>
            ))}
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 14,
              fontSize: 13, color: '#EF4444',
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleStart}
            style={{ fontSize: 16, padding: '14px' }}
          >
            🚀 Start Exam
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  section:     { padding: '18px 16px' },
  sectionHead: { fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 },
};
