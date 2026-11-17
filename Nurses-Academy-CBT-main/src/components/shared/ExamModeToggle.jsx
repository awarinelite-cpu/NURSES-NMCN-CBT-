// Shared Exam Mode / Reading Mode chooser used on every exam launch screen.
//  - Exam Mode:    timed, answers revealed at the end.
//  - Reading Mode: untimed, correct answer + explanation shown right after
//                  each answer (handled by ExamSession via `readingMode`).
export const EXAM_MODES = [
  { id: 'exam',    icon: '📝', label: 'Exam Mode',    hint: 'Timed. Answers revealed at the end.' },
  { id: 'reading', icon: '📖', label: 'Reading Mode', hint: 'Untimed. Answer + explanation shown right after you answer.' },
];

// Helper: fields to spread into the navigate() state of an exam launch.
export const modeState = (mode, timeLimit) => ({
  readingMode: mode === 'reading',
  timeLimit:   mode === 'reading' ? 0 : timeLimit,
});

export default function ExamModeToggle({ value, onChange, accent = 'var(--teal)', style }) {
  return (
    <div style={{ marginBottom: 18, ...style }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>🎯 Mode</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {EXAM_MODES.map(m => {
          const on = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              style={{
                flex: '1 1 140px', padding: '10px 14px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${on ? accent : 'var(--border)'}`,
                background: on ? 'rgba(21,128,61,0.10)' : 'var(--bg-tertiary)',
                color: on ? accent : 'var(--text-secondary)',
              }}
            >
              <div>{m.icon} {m.label}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>{m.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
