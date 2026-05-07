// src/components/exam/ExamSetup.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NURSING_CATEGORIES, EXAM_TYPES, EXAM_YEARS } from '../../data/categories';
import { useAuth } from '../../context/AuthContext';

// ── FIX: Extended to support up to 250 questions.
// The displayed buttons are dynamically filtered so only counts ≤ availableCount
// are shown — meaning this list automatically adapts without further code changes
// as the question bank grows.
const QUESTION_COUNTS = [10, 20, 30, 50, 100, 150, 200, 250];

const TIME_OPTIONS    = [
  { label: 'No Timer',   value: 0 },
  { label: '30 mins',    value: 30 },
  { label: '1 hour',     value: 60 },
  { label: '2 hours',    value: 120 },
  { label: '3 hours',    value: 180 },
];

export default function ExamSetup() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [params]    = useSearchParams();

  const [category, setCategory]     = useState(params.get('category') || '');
  const [examType, setExamType]     = useState(params.get('type')     || 'past_questions');
  const [year, setYear]             = useState('');
  const [count, setCount]           = useState(40);
  const [timeLimit, setTimeLimit]   = useState(60);
  const [shuffle, setShuffle]       = useState(true);
  const [showExpl, setShowExpl]     = useState(false);
  const [error, setError]           = useState('');

  // ── FIX: Track how many questions are available for the selected filters.
  // Replace `availableCount` with a real Firestore count query wired to your
  // data layer; this default keeps the UI fully functional in the meantime.
  const [availableCount, setAvailableCount] = useState(
    parseInt(params.get('available') || '250', 10)
  );

  // ── FIX: When the selected count exceeds availableCount (e.g. after
  // switching to a smaller category), clamp it to the largest valid preset.
  useEffect(() => {
    const validCounts = QUESTION_COUNTS.filter(n => n <= availableCount);
    if (validCounts.length > 0 && count > availableCount) {
      setCount(validCounts[validCounts.length - 1]);
    }
  }, [availableCount, count]);

  const isPremiumType = (t) => ['hospital_finals', 'topic_drill'].includes(t);
  const needsYear     = ['past_questions', 'hospital_finals'].includes(examType);

  const handleStart = () => {
    if (!category) { setError('Please select a nursing category.'); return; }
    if (needsYear && !year) { setError('Please select an exam year.'); return; }
    if (isPremiumType(examType) && !profile?.subscribed) {
      setError('This exam type requires a subscription. Please upgrade your plan.');
      return;
    }
    setError('');
    const p = new URLSearchParams({ category, examType, count, timeLimit, shuffle, showExpl });
    if (year) p.set('year', year);
    navigate(`/exam/session?${p.toString()}`);
  };

  const selectedCat = NURSING_CATEGORIES.find(c => c.id === category);

  // ── FIX: Only show count options that are ≤ availableCount.
  // Always include the "all" option (availableCount itself) so the user can
  // always select everything available, even if it doesn't match a preset.
  const visibleCounts = [
    ...new Set([
      ...QUESTION_COUNTS.filter(n => n <= availableCount),
      availableCount,   // always show the exact available total
    ]),
  ].sort((a, b) => a - b);

  return (
    <div style={{ padding: '16px', maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", color: 'var(--text-primary)', marginBottom: 6 }}>
          📝 Set Up Your Exam
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Customise your exam session parameters before starting
        </p>
      </div>

      <div style={styles.grid}>
        {/* Left: Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Category */}
          <div className="card" style={styles.section}>
            <div style={styles.sectionHead}>🏥 Nursing Category</div>
            <div style={styles.catGrid}>
              {NURSING_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  style={{
                    ...styles.catBtn,
                    borderColor: category === cat.id ? cat.color : 'var(--border)',
                    background: category === cat.id ? `${cat.color}18` : 'var(--bg-tertiary)',
                    color: category === cat.id ? cat.color : 'var(--text-secondary)',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{cat.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>
                    {cat.shortLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Exam type */}
          <div className="card" style={styles.section}>
            <div style={styles.sectionHead}>📋 Exam Type</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {EXAM_TYPES.map(et => (
                <button
                  key={et.id}
                  onClick={() => setExamType(et.id)}
                  style={{
                    ...styles.typeBtn,
                    borderColor: examType === et.id ? 'var(--teal)' : 'var(--border)',
                    background: examType === et.id ? 'var(--teal-glow)' : 'var(--bg-tertiary)',
                    color: examType === et.id ? 'var(--teal)' : 'var(--text-secondary)',
                    opacity: isPremiumType(et.id) && !profile?.subscribed ? 0.6 : 1,
                  }}
                >
                  {et.icon} {et.label}
                  {isPremiumType(et.id) && <span style={{ fontSize: 10, marginLeft: 4 }}>👑</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Year */}
          {needsYear && (
            <div className="card" style={styles.section}>
              <div style={styles.sectionHead}>📅 Exam Year</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXAM_YEARS.map(y => (
                  <button
                    key={y}
                    onClick={() => setYear(y)}
                    style={{
                      ...styles.yearBtn,
                      borderColor: year === y ? 'var(--gold)' : 'var(--border)',
                      background: year === y ? 'var(--gold-glow)' : 'var(--bg-tertiary)',
                      color: year === y ? 'var(--gold-dark)' : 'var(--text-secondary)',
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="card" style={styles.section}>
            <div style={styles.sectionHead}>⚙️ Exam Settings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Question count */}
              <div>
                {/* ── FIX: Label now shows how many questions are available */}
                <label className="form-label">
                  Number of Questions{' '}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                    ({availableCount} available)
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {visibleCounts.map(n => (
                    <button key={n} onClick={() => setCount(n)}
                      style={{
                        ...styles.yearBtn,
                        borderColor: count === n ? 'var(--blue-mid)' : 'var(--border)',
                        background: count === n ? 'var(--blue-glow)' : 'var(--bg-tertiary)',
                        color: count === n ? 'var(--blue-mid)' : 'var(--text-secondary)',
                      }}
                    >
                      {n === availableCount && !QUESTION_COUNTS.includes(n) ? `All (${n})` : `${n} Qs`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time limit */}
              <div className="form-group">
                <label className="form-label">Time Limit</label>
                <select
                  className="form-input form-select"
                  value={timeLimit}
                  onChange={e => setTimeLimit(Number(e.target.value))}
                >
                  {TIME_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ToggleRow
                  label="🔀 Shuffle Questions" desc="Randomize question order each session"
                  checked={shuffle} onChange={setShuffle}
                />
                <ToggleRow
                  label="💡 Show Explanations After" desc="Display answer explanations during review"
                  checked={showExpl} onChange={setShowExpl}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Preview card */}
        <div>
          <div style={styles.previewCard}>
            <div style={styles.previewHead}>Exam Preview</div>

            {selectedCat ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: `${selectedCat.color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, margin: '0 auto 10px',
                }}>
                  {selectedCat.icon}
                </div>
                <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>
                  {selectedCat.label}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>
                Select a category to start
              </div>
            )}

            <div style={styles.previewRows}>
              {[
                ['Category',  selectedCat?.label || '-'],
                ['Type',      EXAM_TYPES.find(e => e.id === examType)?.label || '-'],
                ['Year',      year || (needsYear ? 'Not selected' : 'N/A')],
                ['Questions', `${count} / ${availableCount}`],
                ['Time',      timeLimit ? `${timeLimit} mins` : 'Unlimited'],
                ['Shuffle',   shuffle ? 'Yes' : 'No'],
              ].map(([k, v]) => (
                <div key={k} style={styles.previewRow}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{k}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>
                ⚠️ {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleStart}
              disabled={!category}
            >
              🚀 Start Exam
            </button>

            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-hint)', marginTop: 10 }}>
              AI-powered explanations for every answer
            </p>
          </div>
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
    gap: 24,
    alignItems: 'start',
  },
  section: { padding: '20px 20px' },
  sectionHead: { fontWeight: 700, color: 'var(--text-primary)', fontSize: 14, marginBottom: 14 },
  catGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8,
  },
  catBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '12px 8px', border: '2px solid', borderRadius: 10,
    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
  },
  typeBtn: {
    padding: '10px 12px', border: '2px solid', borderRadius: 10,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', transition: 'all 0.2s',
  },
  yearBtn: {
    padding: '8px 14px', border: '2px solid', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', transition: 'all 0.2s',
  },
  previewCard: {
    background: 'var(--bg-card)', border: '1.5px solid var(--border)',
    borderRadius: 20, padding: '24px 20px',
  },
  previewHead: {
    fontFamily: "'Playfair Display',serif", fontWeight: 700,
    fontSize: 16, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 16,
  },
  previewRows: { marginBottom: 20 },
  previewRow: {
    display: 'flex', justifyContent: 'space-between',
    padding: '8px 0', borderBottom: '1px solid var(--border)',
  },
};
