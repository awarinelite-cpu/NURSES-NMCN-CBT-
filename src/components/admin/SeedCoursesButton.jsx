// src/components/admin/SeedCoursesButton.jsx
//
// Drop this at the top of CoursesManager (Level 0 view, before the specialty grid).
//
// USAGE inside CoursesManager.jsx:
//   import SeedCoursesButton from './SeedCoursesButton';
//   // In your Level 0 JSX, just before the specialty grid:
//   <SeedCoursesButton onComplete={loadData} />
//
// `onComplete` (optional) — called after a successful seed so CoursesManager
// reloads its course list automatically.

import { useState } from 'react';
import { runSeed, SEED_COURSES } from '../../data/seedCourses';

// Human-readable labels for the preview pills
const SPECIALTY_LABELS = {
  general_nursing: 'General Nursing',
  basic_midwifery: 'Basic Midwifery',
  // extend as you add more specialties to SEED_COURSES
};

// Course counts per specialty for the preview strip
const previewCounts = SEED_COURSES.reduce((acc, c) => {
  acc[c.category] = (acc[c.category] || 0) + 1;
  return acc;
}, {});

export default function SeedCoursesButton({ onComplete }) {
  const [status,   setStatus]   = useState('idle');   // idle | running | done | error
  const [log,      setLog]      = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [expanded, setExpanded] = useState(false);

  const handleSeed = async () => {
    if (status === 'running') return;
    if (!window.confirm(
      `This will add up to ${SEED_COURSES.length} courses to Firestore.\n\n` +
      `Courses that already exist are automatically skipped — nothing will be overwritten.\n\n` +
      `Continue?`
    )) return;

    setStatus('running');
    setLog([]);
    setSummary(null);

    try {
      const result = await runSeed(msg => setLog(prev => [...prev, msg]));
      setSummary(result);
      setStatus(result.errors > 0 ? 'error' : 'done');
      if (result.added > 0 && typeof onComplete === 'function') {
        onComplete(); // refresh CoursesManager course list
      }
    } catch (e) {
      setLog(prev => [...prev, `Fatal error: ${e.message}`]);
      setStatus('error');
    }
  };

  const accentColor = {
    idle:    'var(--teal)',
    running: '#F59E0B',
    done:    '#16A34A',
    error:   '#EF4444',
  }[status];

  const btnLabel = {
    idle:    `🌱 Seed ${SEED_COURSES.length} Courses`,
    running: '⏳ Seeding…',
    done:    '✅ Seed Complete',
    error:   '⚠️ Completed with Errors',
  }[status];

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1.5px solid ${accentColor}30`,
      borderRadius: 14,
      padding: '18px 22px',
      marginBottom: 24,
    }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
            🌱 Seed NMCN Curriculum Courses
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Populates the{' '}
            <code style={{ fontSize: 11, background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4 }}>
              courses
            </code>{' '}
            collection from the official NMCN curriculum.
            Existing courses are never duplicated.
          </div>
        </div>

        <button
          onClick={handleSeed}
          disabled={status === 'running'}
          style={{
            padding: '9px 18px', borderRadius: 10, border: 'none',
            background: status === 'running' ? 'var(--bg-tertiary)' : accentColor,
            color: status === 'running' ? 'var(--text-muted)' : '#fff',
            fontWeight: 700, fontSize: 13,
            cursor: status === 'running' ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {status === 'running' && <span className="spinner spinner-sm" />}
          {btnLabel}
        </button>
      </div>

      {/* Specialty preview pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {Object.entries(previewCounts).map(([cat, count]) => (
          <div key={cat} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 12px', borderRadius: 8,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
              {SPECIALTY_LABELS[cat] || cat}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
              background: 'rgba(13,148,136,0.12)', color: 'var(--teal)',
              border: '1px solid rgba(13,148,136,0.25)',
            }}>
              {count} courses
            </span>
          </div>
        ))}
      </div>

      {/* Summary bar — shows after run */}
      {summary && (
        <div style={{
          display: 'flex', gap: 20, flexWrap: 'wrap',
          marginTop: 14, padding: '10px 14px', borderRadius: 10,
          background: summary.errors > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(22,163,74,0.06)',
          border: `1px solid ${summary.errors > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(22,163,74,0.25)'}`,
        }}>
          <Pill label="Added"   value={summary.added}   color="#16A34A" />
          <Pill label="Skipped" value={summary.skipped} color="#F59E0B" />
          {summary.errors > 0 && <Pill label="Errors" value={summary.errors} color="#EF4444" />}
        </div>
      )}

      {/* Expandable log */}
      {log.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--teal)', fontSize: 12, fontWeight: 700,
              padding: 0, fontFamily: 'inherit',
            }}
          >
            {expanded ? '▲ Hide' : '▼ Show'} log ({log.length} lines)
          </button>

          {expanded && (
            <div style={{
              marginTop: 8, maxHeight: 240, overflowY: 'auto',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px',
              fontFamily: 'monospace', fontSize: 11.5,
              lineHeight: 1.7,
            }}>
              {log.map((line, i) => (
                <div key={i} style={{
                  color: line.startsWith('✅') ? '#16A34A'
                       : line.startsWith('❌') ? '#EF4444'
                       : line.startsWith('⏭') ? 'var(--text-muted)'
                       : 'var(--text-secondary)',
                }}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 17, fontWeight: 900, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
    </div>
  );
}
