// src/components/entrance/EntranceExamSetup.jsx
// Route: /entrance-exam/setup
// Receives { school } via location.state from EntranceSchoolList.

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection, query, where, getDocs, orderBy, limit,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const ENTRANCE_YEARS = ['2018','2019','2020','2021','2022','2023','2024','2025'];
const QUESTION_COUNTS = [10, 20, 30, 40, 50, 60];
const TIME_OPTIONS = [
  { label: 'No Timer',   value: 0  },
  { label: '30 mins',    value: 30 },
  { label: '45 mins',    value: 45 },
  { label: '1 hour',     value: 60 },
  { label: '1.5 hours',  value: 90 },
  { label: '2 hours',    value: 120 },
];

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

export default function EntranceExamSetup() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user }  = useAuth();

  const school = location.state?.school;

  const [year,        setYear]      = useState('');
  const [count,       setCount]     = useState(40);
  const [timeLimit,   setTimeLimit] = useState(60);
  const [shuffle,     setShuffle]   = useState(true);
  const [showExpl,    setShowExpl]  = useState(false);
  const [mode,        setMode]      = useState('timed'); // 'practice' | 'timed'
  const [error,       setError]     = useState('');
  const [yearCounts,  setYearCounts] = useState({});  // { '2022': 40, ... }
  const [prevAttempts, setPrevAttempts] = useState([]);
  const [loadingMeta, setLoadingMeta]  = useState(true);

  // If no school in state, redirect back
  useEffect(() => {
    if (!school) { navigate('/entrance-exam/schools'); return; }

    // Load per-year question counts and previous attempts
    const load = async () => {
      try {
        // Get question counts per year for this school
        const qSnap = await getDocs(query(
          collection(db, 'entranceExamQuestions'),
          where('schoolId', '==', school.id),
        ));
        const counts = {};
        qSnap.docs.forEach(d => {
          const y = d.data().year;
          if (y) counts[y] = (counts[y] || 0) + 1;
        });
        setYearCounts(counts);

        // Previous attempts for this school
        if (user) {
          const attSnap = await getDocs(query(
            collection(db, 'entranceExamAttempts'),
            where('userId',   '==', user.uid),
            where('schoolId', '==', school.id),
            orderBy('date', 'desc'),
            limit(5),
          ));
          setPrevAttempts(attSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (e) { console.warn('EntranceExamSetup meta:', e.message); }
      finally { setLoadingMeta(false); }
    };
    load();
  }, [school, user, navigate]);

  const availableYears = ENTRANCE_YEARS.filter(y => (yearCounts[y] || 0) > 0);
  const allCount = year ? (yearCounts[year] || 0) : Object.values(yearCounts).reduce((a, b) => a + b, 0);

  const handleStart = () => {
    if (!year && availableYears.length > 0) {
      setError('Please select an exam year to continue.');
      return;
    }
    setError('');
    navigate('/exam/session', {
      state: {
        examType:    'entrance_exam',
        schoolId:           school.id,
        entranceSchoolName: school.name,
        entranceYear:       year || 'all',
        category:    'entrance_exam',
        courseLabel: school.name,
        examYear:    year || 'All Years',
        count,
        timeLimit:   mode === 'practice' ? 0 : timeLimit,
        doShuffle:   shuffle,
        showExpl,
        poolMode:    true,
        // ExamSession will use these to query entranceExamQuestions
        isEntranceExam: true,
      },
    });
  };

  if (!school) return null;

  const SEC = { padding: '18px 16px' };
  const HEAD = { fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 };

  return (
    <div style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => navigate('/entrance-exam/schools')} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)',
        fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>← Back to Schools</button>

      {/* School pill */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: 'rgba(13,148,136,0.12)', border: '1.5px solid rgba(13,148,136,0.35)',
        borderRadius: 40, padding: '8px 16px', marginBottom: 18,
      }}>
        <span style={{ fontSize: 20 }}>🏫</span>
        <div>
          <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Selected School</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{school.name}</div>
        </div>
      </div>

      <h2 style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 4px', color: 'var(--text-primary)' }}>
        ⚙️ Set Up Your Exam
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 24px' }}>
        {school.state ? `📍 ${school.state}` : ''} · {allCount > 0 ? `${allCount} questions available` : 'Questions loading…'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Year */}
        <div className="card" style={SEC}>
          <div style={HEAD}>
            📅 Exam Year
            {availableYears.length > 0 && <span style={{ fontWeight: 400, fontSize: 12, color: '#EF4444', marginLeft: 8 }}>* required</span>}
          </div>
          {loadingMeta ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading available years…</p>
          ) : availableYears.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Questions not yet uploaded for this school. Check back soon!</p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
                Select the year of past questions you want to attempt.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {availableYears.map(y => (
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
                    {yearCounts[y] > 0 && (
                      <span style={{ fontSize: 10, display: 'block', fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                        {yearCounts[y]} Qs
                      </span>
                    )}
                  </button>
                ))}
                {availableYears.length > 1 && (
                  <button onClick={() => { setYear('all'); setError(''); }} style={{
                    padding: '10px 18px', border: '2px solid', borderRadius: 8,
                    cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit', transition: 'all 0.2s',
                    borderColor: year === 'all' ? '#F59E0B' : 'var(--border)',
                    background:  year === 'all' ? 'rgba(245,158,11,0.15)' : 'var(--bg-tertiary)',
                    color:       year === 'all' ? '#92400E' : 'var(--text-secondary)',
                    boxShadow:   year === 'all' ? '0 0 0 3px rgba(245,158,11,0.2)' : 'none',
                  }}>
                    All Years {year === 'all' && '✓'}
                    <span style={{ fontSize: 10, display: 'block', fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                      {allCount} Qs
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Exam Mode */}
        <div className="card" style={SEC}>
          <div style={HEAD}>📝 Exam Mode</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {[
              { id: 'timed',    icon: '⏱️', label: 'Timed Exam Mode',  desc: 'Real exam simulation · Timer running' },
              { id: 'practice', icon: '📖', label: 'Practice Mode',    desc: 'No timer · See answers immediately' },
            ].map(m => (
              <div
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  border: `2px solid ${mode === m.id ? 'var(--teal)' : 'var(--border)'}`,
                  borderRadius: 10, cursor: 'pointer',
                  background: mode === m.id ? 'rgba(13,148,136,0.08)' : 'var(--bg-tertiary)',
                  transition: 'all .2s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', border: `2px solid ${mode === m.id ? 'var(--teal)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {mode === m.id && <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--teal)' }} />}
                </div>
                <span style={{ fontSize: 18 }}>{m.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Question count */}
        <div className="card" style={SEC}>
          <div style={HEAD}>❓ Number of Questions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {QUESTION_COUNTS.filter(n => n <= Math.max(allCount, 10)).concat(
              allCount > 0 && !QUESTION_COUNTS.includes(allCount) ? [allCount] : []
            ).map(n => (
              <button key={n} onClick={() => setCount(n)} style={{
                padding: '10px 18px', border: '2px solid', borderRadius: 8,
                cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.2s',
                borderColor: count === n ? 'var(--teal)' : 'var(--border)',
                background:  count === n ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                color:       count === n ? 'var(--teal)' : 'var(--text-secondary)',
              }}>
                {n === allCount && n !== Math.max(...QUESTION_COUNTS) ? `All (${n})` : `${n} Qs`}
              </button>
            ))}
          </div>
        </div>

        {/* Timer (timed mode only) */}
        {mode === 'timed' && (
          <div className="card" style={SEC}>
            <div style={HEAD}>⏱️ Time Limit</div>
            <select className="form-input form-select" value={timeLimit}
              onChange={e => setTimeLimit(Number(e.target.value))}
              style={{ marginTop: 8, maxWidth: 220 }}>
              {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}

        {/* Options */}
        <div className="card" style={SEC}>
          <div style={HEAD}>⚙️ Options</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <ToggleRow label="🔀 Shuffle Questions" desc="Randomise question order each session" checked={shuffle} onChange={setShuffle} />
            <ToggleRow label="💡 Show Explanations After" desc="Display answer explanations during review" checked={showExpl} onChange={setShowExpl} />
          </div>
        </div>

        {/* Previous attempts for this school */}
        {prevAttempts.length > 0 && (
          <div className="card" style={SEC}>
            <div style={HEAD}>📋 Your Previous Attempts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {prevAttempts.map(a => (
                <div key={a.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'var(--bg-tertiary)', borderRadius: 8, padding: '8px 12px',
                }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                      {a.year || 'All Years'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {a.date?.toDate ? new Date(a.date.toDate()).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div style={{
                    fontWeight: 800, fontSize: 14,
                    color: (a.score || 0) >= 70 ? 'var(--green)' : (a.score || 0) >= 50 ? 'var(--gold)' : 'var(--red)',
                  }}>
                    {a.score || 0}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview + Start */}
        <div className="card" style={{ ...SEC, background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14, marginBottom: 14 }}>👁️ Exam Preview</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              ['🏫 School', school.shortName || school.name],
              ['📅 Year',   year === 'all' ? 'All Years' : year || '— not selected —'],
              ['📝 Mode',   mode === 'timed' ? 'Timed' : 'Practice'],
              ['❓ Questions', `${count} Qs`],
              ['⏱ Time',   mode === 'practice' ? 'Unlimited' : `${timeLimit} mins`],
              ['🔀 Shuffle', shuffle ? 'Yes' : 'No'],
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
            }}>⚠️ {error}</div>
          )}

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleStart}
            disabled={availableYears.length > 0 && !year}
            style={{ fontSize: 16, padding: '14px', opacity: (availableYears.length > 0 && !year) ? 0.5 : 1 }}
          >
            🚀 Start Exam
          </button>
        </div>
      </div>
    </div>
  );
}
