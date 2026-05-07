// src/components/exam/ExamConfigPage.jsx
// Step 2 of the Quick Actions flow:
// Category is already chosen. Student picks Type, Year, Settings, then starts.

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NURSING_CATEGORIES, EXAM_TYPES, EXAM_YEARS, DIFFICULTY_LEVELS } from '../../data/categories';
import { useAuth } from '../../context/AuthContext';

const QUESTION_COUNTS = [10, 20, 30, 50, 100, 200, 250];
const TIME_OPTIONS = [
  { label: 'No Timer',  value: 0   },
  { label: '30 mins',   value: 30  },
  { label: '1 hour',    value: 60  },
  { label: '2 hours',   value: 120 },
  { label: '3 hours',   value: 180 },
];

export default function ExamConfigPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [params]    = useSearchParams();

  const categoryId  = params.get('category') || '';
  const cat         = NURSING_CATEGORIES.find(c => c.id === categoryId);

  const [examType,   setExamType]   = useState(params.get('type') || 'past_questions');
  const [year,       setYear]       = useState('');
  const [count,      setCount]      = useState(40);
  const [timeLimit,  setTimeLimit]  = useState(60);
  const [shuffle,    setShuffle]    = useState(true);
  const [showExpl,   setShowExpl]   = useState(false);
  const [error,      setError]      = useState('');

  const isPremiumType = (t) => ['hospital_finals', 'topic_drill'].includes(t);
  const needsYear     = ['past_questions', 'hospital_finals'].includes(examType);
  const isDaily       = examType === 'daily_practice';

  const handleStart = () => {
    if (isPremiumType(examType) && !profile?.subscribed) {
      setError('This exam type requires a subscription. Please upgrade your plan.');
      return;
    }
    if (needsYear && !year) {
      setError('Please select an exam year.');
      return;
    }
    setError('');
    const p = new URLSearchParams({ category: categoryId, examType, count, timeLimit, shuffle, showExpl });
    if (year) p.set('year', year);
    navigate(`/exam/session?${p.toString()}`);
  };

  // Preview rows — hide Year for daily practice
  const previewRows = [
    ['🏥 Category', cat?.shortLabel || '—'],
    ['📋 Type',     EXAM_TYPES.find(e => e.id === examType)?.label || '—'],
    ...(!isDaily ? [['📅 Year', year || (needsYear ? '⚠️ Not selected' : 'N/A')]] : []),
    ['❓ Questions', count],
    ['⏱ Time',      timeLimit ? `${timeLimit} mins` : 'Unlimited'],
    ['🔀 Shuffle',   shuffle ? 'Yes' : 'No'],
  ];

  return (
    <div style={{ padding: '20px 16px', maxWidth: 720, margin: '0 auto' }}>

      {/* Back + Step indicator */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--teal)', fontWeight: 700, fontSize: 13,
            padding: 0, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Back to Categories
        </button>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={styles.stepDone}>✓</div>
          <div style={{ ...styles.stepLine, background: 'var(--teal)' }} />
          <div style={styles.stepActive}>2</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
            Category → Exam Setup
          </div>
        </div>

        {/* Selected category pill */}
        {cat && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: `${cat.color}18`, border: `1.5px solid ${cat.color}40`,
            borderRadius: 40, padding: '8px 16px', marginBottom: 16,
          }}>
            <span style={{ fontSize: 20 }}>{cat.icon}</span>
            <div>
              <div style={{ fontSize: 11, color: cat.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Selected Category
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {cat.label}
              </div>
            </div>
            <button
              onClick={() => navigate(-1)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 16, padding: '0 0 0 4px',
              }}
            >✕</button>
          </div>
        )}

        <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 4px', color: 'var(--text-primary)' }}>
          ⚙️ Set Up Your Exam
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Choose exam type, year and settings
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Exam Type */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>📋 Exam Type</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {EXAM_TYPES.map(et => {
              const locked = isPremiumType(et.id) && !profile?.subscribed;
              return (
                <button
                  key={et.id}
                  onClick={() => { if (!locked) { setExamType(et.id); setYear(''); } }}
                  style={{
                    ...styles.typeBtn,
                    borderColor: examType === et.id ? 'var(--teal)' : 'var(--border)',
                    background:  examType === et.id ? 'var(--teal-glow)' : 'var(--bg-tertiary)',
                    color:       examType === et.id ? 'var(--teal)' : 'var(--text-secondary)',
                    opacity:     locked ? 0.5 : 1,
                    cursor:      locked ? 'not-allowed' : 'pointer',
                  }}
                >
                  {et.icon} {et.label}
                  {locked && <span style={{ fontSize: 10, marginLeft: 4 }}>👑</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Year — only for past_questions / hospital_finals, never for daily_practice */}
        {needsYear && (
          <div className="card" style={styles.section}>
            <div style={styles.sectionHead}>📅 Exam Year</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EXAM_YEARS.map(y => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  style={{
                    ...styles.chipBtn,
                    borderColor: year === y ? 'var(--gold)' : 'var(--border)',
                    background:  year === y ? 'var(--gold-glow)' : 'var(--bg-tertiary)',
                    color:       year === y ? 'var(--gold-dark)' : 'var(--text-secondary)',
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Exam Settings */}
        <div className="card" style={styles.section}>
          <div style={styles.sectionHead}>⚙️ Exam Settings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Question count */}
            <div>
              <label className="form-label">Number of Questions</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
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
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Time Limit</label>
              <select
                className="form-input form-select"
                value={timeLimit}
                onChange={e => setTimeLimit(Number(e.target.value))}
                style={{ marginTop: 6 }}
              >
                {TIME_OPTIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ToggleRow
                label="🔀 Shuffle Questions"
                desc="Randomise question order each session"
                checked={shuffle}
                onChange={setShuffle}
              />
              <ToggleRow
                label="💡 Show Explanations"
                desc="Display answer explanations during review"
                checked={showExpl}
                onChange={setShowExpl}
              />
            </div>
          </div>
        </div>

        {/* Exam Preview */}
        <div className="card" style={{ ...styles.section, background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))' }}>
          <div style={styles.sectionHead}>👁️ Exam Preview</div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {previewRows.map(([k, v]) => (
              <div key={k} style={{
                background: 'var(--bg-tertiary)', borderRadius: 10,
                padding: '10px 12px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={{
                  fontWeight: 700, fontSize: 13,
                  color: String(v).includes('⚠️') ? 'var(--gold)' : 'var(--text-primary)',
                }}>{v}</div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleStart}
            style={{ fontSize: 16, padding: '14px' }}
          >
            🚀 Start Exam
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-hint)', marginTop: 10 }}>
            AI-powered explanations for every answer
          </p>
        </div>

      </div>
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
  stepActive: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--teal)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, flexShrink: 0,
  },
  stepDone: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--teal)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 900, flexShrink: 0,
    opacity: 0.6,
  },
  stepLine: {
    flex: 'none', width: 32, height: 2, borderRadius: 2,
    background: 'var(--teal)',
  },
  section: { padding: '18px 16px' },
  sectionHead: {
    fontWeight: 700, color: 'var(--text-primary)',
    fontSize: 14, marginBottom: 14,
  },
  typeBtn: {
    padding: '10px 12px', border: '2px solid', borderRadius: 10,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', transition: 'all 0.2s', textAlign: 'left',
  },
  chipBtn: {
    padding: '8px 16px', border: '2px solid', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', transition: 'all 0.2s',
  },
};
