// src/components/entrance/EntranceSubjectDrill.jsx
// Route: /entrance-exam/subject-drill
//
// PURPOSE:
//   1. Show list of available subjects/topics from entranceExamQuestions
//   2. Let user select a subject and configure exam (count, time limit, year)
//   3. Navigate to EntranceSubjectSession to take the drill
//
// CHANGES:
//   - Rebuilt from scratch to match existing entrance exam patterns
//   - Groups questions by subject
//   - Displays question counts per subject
//   - Supports filtering by year
//   - Clean UI consistent with EntranceExamDailyMockHub, EntranceExamSetup

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";
const ENTRANCE_YEARS = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
const QUESTION_PRESETS = [10, 20, 30, 50];
const TIME_OPTIONS = [
  { label: 'No Timer', value: 0 },
  { label: '10 mins', value: 10 },
  { label: '15 mins', value: 15 },
  { label: '20 mins', value: 20 },
  { label: '30 mins', value: 30 },
  { label: '45 mins', value: 45 },
  { label: '1 hour', value: 60 },
];

function SubjectCard({ subject, available, selected, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        background: selected ? 'rgba(13,148,136,0.12)' : hov ? 'rgba(255,255,255,0.02)' : 'var(--bg-card)',
        border: `2px solid ${selected ? 'var(--teal)' : hov ? 'rgba(13,148,136,0.3)' : 'var(--border)'}`,
        borderRadius: 16,
        padding: '18px 20px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        transition: 'all 0.2s',
        transform: hov && !selected ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hov && !selected ? '0 8px 20px rgba(13,148,136,0.1)' : 'none',
      }}
    >
      {/* Subject Icon */}
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: 12,
          background: selected ? 'var(--teal)' : 'var(--bg-tertiary)',
          border: `2px solid ${selected ? 'var(--teal)' : 'var(--border)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0,
        }}
      >
        {subject.icon}
      </div>

      {/* Subject Info */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--text-primary)',
            fontFamily: F,
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {subject.name}
          {selected && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: 'var(--teal)',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: 20,
                fontFamily: H,
              }}
            >
              ✓ Selected
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            fontFamily: F,
            fontWeight: 700,
          }}
        >
          {available} question{available !== 1 ? 's' : ''} available
        </div>
      </div>

      {/* Arrow */}
      <div
        style={{
          fontSize: 20,
          color: 'var(--teal)',
          opacity: selected ? 1 : 0.3,
          transition: 'opacity 0.2s',
          fontWeight: 900,
        }}
      >
        →
      </div>
    </div>
  );
}

export default function EntranceSubjectDrill() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Configuration
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedYear, setSelectedYear] = useState('');
  const [questionCount, setQuestionCount] = useState(20);
  const [customCount, setCustomCount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [timeLimit, setTimeLimit] = useState(20);

  // Load subjects
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'entranceExamQuestions'));
        const subjectMap = {};

        snap.forEach(doc => {
          const data = doc.data();
          const subj = data.subject || 'General';

          if (!subjectMap[subj]) {
            subjectMap[subj] = {
              name: subj,
              icon: data.subjectIcon || '📚',
              available: 0,
              years: new Set(),
            };
          }
          subjectMap[subj].available++;
          if (data.year) subjectMap[subj].years.add(data.year);
        });

        // Convert to array and sort
        const list = Object.values(subjectMap)
          .map(s => ({
            ...s,
            years: Array.from(s.years).sort(),
          }))
          .sort((a, b) => b.available - a.available);

        setSubjects(list);
        if (list.length > 0) setSelectedSubject(list[0]);
      } catch (err) {
        console.error('Load subjects error:', err);
        setError('Failed to load subjects. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (user) load();
  }, [user]);

  const handleStart = () => {
    if (!selectedSubject) {
      setError('Please select a subject to continue.');
      return;
    }

    const finalCount = useCustom
      ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 250)
      : questionCount;

    navigate('/entrance-exam/subject-session', {
      state: {
        subject: selectedSubject,
        year: selectedYear || 'All Years',
        count: Math.min(finalCount, selectedSubject.available),
        timeLimitMin: timeLimit,
        doShuffle: true,
      },
    });
  };

  const availableYears = selectedSubject?.years || [];
  const finalCount = useCustom
    ? Math.min(Math.max(parseInt(customCount, 10) || 20, 1), 250)
    : questionCount;

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto', fontFamily: F }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/entrance-exam')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--teal)',
          fontWeight: 700,
          fontSize: 13,
          padding: 0,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: F,
        }}
      >
        ← Back to Entrance Exam
      </button>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h2
          style={{
            fontFamily: H,
            fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
            fontWeight: 900,
            margin: '0 0 8px',
            color: 'var(--text-primary)',
          }}
        >
          📚 Subject Drill
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, fontWeight: 700 }}>
          Practice entrance exam questions by subject. Master topics one at a time.
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div
            className="spinner"
            style={{
              width: 40,
              height: 40,
              margin: '0 auto 12px',
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: 'var(--teal)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 700 }}>
            Loading subjects…
          </p>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1.5px solid rgba(239,68,68,0.3)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 24,
            color: '#EF4444',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {!loading && subjects.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            background: 'var(--bg-card)',
            borderRadius: 16,
            border: '1.5px dashed var(--border)',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
            No subjects available yet
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            An admin needs to upload entrance exam questions first.
          </p>
        </div>
      )}

      {!loading && subjects.length > 0 && (
        <>
          {/* Step 1: Select Subject */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1.5px solid var(--border)',
              borderRadius: 16,
              padding: '20px 24px',
              marginBottom: 28,
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: 14,
                color: 'var(--text-primary)',
                marginBottom: 16,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                fontFamily: H,
              }}
            >
              📖 Step 1: Select a Subject
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {subjects.map(subj => (
                <SubjectCard
                  key={subj.name}
                  subject={subj}
                  available={subj.available}
                  selected={selectedSubject?.name === subj.name}
                  onClick={() => {
                    setSelectedSubject(subj);
                    setSelectedYear('');
                    setError('');
                  }}
                />
              ))}
            </div>
          </div>

          {/* Step 2: Configure Exam */}
          {selectedSubject && (
            <>
              {/* Year selection */}
              {availableYears.length > 0 && (
                <div
                  style={{
                    background: 'var(--bg-card)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 16,
                    padding: '20px 24px',
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      marginBottom: 12,
                      fontFamily: F,
                    }}
                  >
                    📅 Exam Year (optional)
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setSelectedYear('')}
                      style={{
                        padding: '10px 18px',
                        border: `2px solid ${selectedYear === '' ? 'var(--teal)' : 'var(--border)'}`,
                        background:
                          selectedYear === '' ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                        color: selectedYear === '' ? 'var(--teal)' : 'var(--text-secondary)',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: F,
                        transition: 'all 0.2s',
                      }}
                    >
                      All Years
                    </button>
                    {availableYears.map(y => (
                      <button
                        key={y}
                        onClick={() => setSelectedYear(y)}
                        style={{
                          padding: '10px 18px',
                          border: `2px solid ${selectedYear === y ? 'var(--teal)' : 'var(--border)'}`,
                          background:
                            selectedYear === y ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                          color:
                            selectedYear === y ? 'var(--teal)' : 'var(--text-secondary)',
                          borderRadius: 10,
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 700,
                          fontFamily: F,
                          transition: 'all 0.2s',
                        }}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Question count */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid var(--border)',
                  borderRadius: 16,
                  padding: '20px 24px',
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    marginBottom: 12,
                    fontFamily: F,
                  }}
                >
                  ❓ Number of Questions
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {QUESTION_PRESETS.map(n => (
                    <button
                      key={n}
                      onClick={() => {
                        setQuestionCount(n);
                        setUseCustom(false);
                      }}
                      disabled={n > selectedSubject.available}
                      style={{
                        padding: '10px 18px',
                        border: `2px solid ${!useCustom && questionCount === n ? 'var(--teal)' : 'var(--border)'}`,
                        background:
                          !useCustom && questionCount === n
                            ? 'rgba(13,148,136,0.12)'
                            : 'var(--bg-tertiary)',
                        color:
                          !useCustom && questionCount === n
                            ? 'var(--teal)'
                            : 'var(--text-secondary)',
                        borderRadius: 10,
                        cursor: n > selectedSubject.available ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: F,
                        transition: 'all 0.2s',
                        opacity: n > selectedSubject.available ? 0.5 : 1,
                      }}
                    >
                      {n}
                    </button>
                  ))}

                  {/* Custom */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setUseCustom(true)}
                      style={{
                        padding: '10px 14px',
                        border: `2px solid ${useCustom ? 'var(--teal)' : 'var(--border)'}`,
                        background:
                          useCustom ? 'rgba(13,148,136,0.12)' : 'var(--bg-tertiary)',
                        color: useCustom ? 'var(--teal)' : 'var(--text-secondary)',
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: F,
                        transition: 'all 0.2s',
                      }}
                    >
                      Custom
                    </button>
                    {useCustom && (
                      <input
                        type="number"
                        min={1}
                        max={selectedSubject.available}
                        value={customCount}
                        onChange={e => setCustomCount(e.target.value)}
                        placeholder="e.g. 25"
                        autoFocus
                        style={{
                          width: 100,
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '2px solid var(--teal)',
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          fontFamily: F,
                          fontSize: 13,
                          fontWeight: 700,
                          outline: 'none',
                        }}
                      />
                    )}
                  </div>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    margin: 0,
                    fontWeight: 700,
                    fontFamily: F,
                  }}
                >
                  {useCustom && customCount
                    ? `Will attempt ${Math.min(parseInt(customCount, 10), selectedSubject.available)} questions (${selectedSubject.available} available)`
                    : `${Math.min(finalCount, selectedSubject.available)}/${selectedSubject.available} questions selected`}
                </p>
              </div>

              {/* Time limit */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1.5px solid var(--border)',
                  borderRadius: 16,
                  padding: '20px 24px',
                  marginBottom: 28,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    marginBottom: 12,
                    fontFamily: F,
                  }}
                >
                  ⏱️ Time Limit
                </div>
                <select
                  value={timeLimit}
                  onChange={e => setTimeLimit(Number(e.target.value))}
                  style={{
                    width: '100%',
                    maxWidth: 240,
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1.5px solid var(--border)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {TIME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start button */}
              <button
                onClick={handleStart}
                style={{
                  width: '100%',
                  padding: '16px 24px',
                  background: 'var(--teal)',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontFamily: H,
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  letterSpacing: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
                onMouseEnter={e =>
                  (e.target.style.transform = 'translateY(-2px)')
                }
                onMouseLeave={e =>
                  (e.target.style.transform = 'translateY(0)')
                }
              >
                🚀 Start {selectedSubject.name} Drill — {Math.min(finalCount, selectedSubject.available)} Questions
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
