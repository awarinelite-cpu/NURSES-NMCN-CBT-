// src/components/entrance/EntranceSubjectDrill.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase/config';

function ACard({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(14px)', transition: 'opacity .45s ease, transform .45s ease', ...s }}>
      {children}
    </div>
  );
}

function Skeleton({ h = 60, r = 12 }) {
  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{ height: h, borderRadius: r, background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
    </>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function Steps({ step }) {
  const steps = ['Choose School', 'Choose Subject', 'Start Drill'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {steps.map((label, i) => {
        const done   = i < step;
        const active = i === step;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: done ? '#0D9488' : active ? 'rgba(13,148,136,0.2)' : 'var(--bg-tertiary)',
                border: `2px solid ${done || active ? '#0D9488' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 12,
                color: done ? '#fff' : active ? '#0D9488' : 'var(--text-muted)',
                transition: 'background .3s, border-color .3s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#0D9488' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#0D9488' : 'var(--border)', margin: '0 6px', marginBottom: 18, transition: 'background .3s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── School card ───────────────────────────────────────────────────────────────
function SchoolCard({ school, onSelect, delay }) {
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div
      onClick={() => onSelect(school)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: hov ? 'rgba(13,148,136,0.08)' : 'var(--bg-card)',
        border: `1.5px solid ${hov ? 'rgba(13,148,136,0.5)' : 'var(--border)'}`,
        borderRadius: 14, padding: '14px 18px', cursor: 'pointer',
        opacity: vis ? 1 : 0, transform: vis ? 'translateX(0)' : 'translateX(-14px)',
        transition: 'opacity .4s ease, transform .4s ease, background .2s, border-color .2s',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: '#0D9488', borderRadius: '4px 0 0 4px', opacity: hov ? 1 : 0, transition: 'opacity .2s' }} />
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: 'rgba(13,148,136,0.12)', border: '1.5px solid rgba(13,148,136,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      }}>
        🏫
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
          {school.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {school.state || school.location || 'Nigeria'} · {school.questionCount || '—'} questions
        </div>
      </div>
      <div style={{ color: '#0D9488', fontWeight: 800, fontSize: 16 }}>→</div>
    </div>
  );
}

// ── Subject card ──────────────────────────────────────────────────────────────
function SubjectCard({ subject, count, onSelect, delay }) {
  const [vis, setVis] = useState(false);
  const [hov, setHov] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);

  const subjectColors = {
    'English': '#2563EB', 'Mathematics': '#0D9488', 'Biology': '#16A34A',
    'Chemistry': '#D97706', 'Physics': '#7C3AED', 'Government': '#EF4444',
    'Economics': '#F59E0B', 'Geography': '#059669',
  };
  const color = subjectColors[subject] || '#0D9488';

  return (
    <div
      onClick={() => onSelect(subject)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? `${color}12` : 'var(--bg-card)',
        border: `1.5px solid ${hov ? color + '55' : 'var(--border)'}`,
        borderRadius: 14, padding: '18px 16px', cursor: 'pointer', textAlign: 'center',
        opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity .4s ease, transform .4s ease, background .2s, border-color .2s',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, opacity: hov ? 1 : 0, transition: 'opacity .2s' }} />
      <div style={{
        width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px',
        background: `${color}18`, border: `1.5px solid ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      }}>
        📚
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>{subject}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{count} question{count !== 1 ? 's' : ''}</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EntranceSubjectDrill() {
  const navigate = useNavigate();

  const [step,         setStep]         = useState(0); // 0=school, 1=subject, 2=config
  const [schools,      setSchools]      = useState([]);
  const [subjects,     setSubjects]     = useState([]); // [{ name, count }]
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [questionCount, setQuestionCount] = useState(30);
  const [timeLimit,     setTimeLimit]    = useState(30);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [search,        setSearch]       = useState('');

  // ── Load schools ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const snap = await getDocs(collection(db, 'entranceExamSchools'));
        setSchools(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Failed to load schools:', e);
      } finally {
        setLoadingSchools(false);
      }
    };
    fetchSchools();
  }, []);

  // ── Load subjects for selected school ──────────────────────────────────────
  const handleSelectSchool = async (school) => {
    setSelectedSchool(school);
    setStep(1);
    setLoadingSubjects(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'entranceQuestions'),
        where('schoolId', '==', school.id),
      ));
      // Aggregate by subject
      const map = {};
      snap.docs.forEach(d => {
        const subj = d.data().subject || 'General';
        map[subj] = (map[subj] || 0) + 1;
      });
      setSubjects(Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
    } catch (e) {
      console.error('Failed to load subjects:', e);
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleSelectSubject = (subject) => {
    setSelectedSubject(subject);
    setStep(2);
  };

  const handleStart = () => {
    navigate('/entrance-exam/session', {
      state: {
        mode:          'subject-drill',
        schoolId:      selectedSchool.id,
        schoolName:    selectedSchool.name,
        subject:       selectedSubject,
        totalQuestions: questionCount,
        timeLimit,
        examName:      `${selectedSchool.name} — ${selectedSubject} Drill`,
        isEntrance:    true,
      },
    });
  };

  const filteredSchools = schools.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.state?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={{ padding: '24px', maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <ACard delay={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/entrance-exam')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, padding: 4 }}
          >←</button>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', color: 'var(--text-primary)', margin: 0 }}>
              🎯 Subject Drill
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0' }}>
              Pick a school, then a subject — and drill focused questions
            </p>
          </div>
        </div>
      </ACard>

      <ACard delay={100}>
        <Steps step={step} />
      </ACard>

      {/* ── Step 0: Choose School ── */}
      {step === 0 && (
        <ACard delay={150}>
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="🔍 Search schools or state…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '12px 16px', borderRadius: 12,
                background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadingSchools
              ? [1, 2, 3, 4].map(k => <Skeleton key={k} />)
              : filteredSchools.length === 0
                ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>🏫</div>
                    <div style={{ fontWeight: 700 }}>No schools found</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Try a different search term</div>
                  </div>
                )
                : filteredSchools.map((school, i) => (
                    <SchoolCard key={school.id} school={school} onSelect={handleSelectSchool} delay={i * 60} />
                  ))
            }
          </div>
        </ACard>
      )}

      {/* ── Step 1: Choose Subject ── */}
      {step === 1 && (
        <ACard delay={100}>
          <div style={{
            background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.2)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>🏫</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{selectedSchool?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedSchool?.state || 'Nigeria'}</div>
            </div>
            <button onClick={() => setStep(0)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#0D9488', fontSize: 12, fontWeight: 700 }}>Change</button>
          </div>

          <h3 style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 14 }}>
            Select a subject to drill:
          </h3>

          {loadingSubjects ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {[1, 2, 3, 4].map(k => <Skeleton key={k} h={110} />)}
            </div>
          ) : subjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div style={{ fontWeight: 700 }}>No subjects available</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>This school has no questions yet.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {subjects.map((s, i) => (
                <SubjectCard key={s.name} subject={s.name} count={s.count} onSelect={handleSelectSubject} delay={i * 60} />
              ))}
            </div>
          )}
        </ACard>
      )}

      {/* ── Step 2: Configure & Start ── */}
      {step === 2 && (
        <ACard delay={100}>
          {/* Selected context */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { icon: '🏫', label: selectedSchool?.name, onClear: () => { setStep(0); setSelectedSchool(null); setSelectedSubject(null); } },
              { icon: '📚', label: selectedSubject,       onClear: () => { setStep(1); setSelectedSubject(null); } },
            ].map(({ icon, label, onClear }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(13,148,136,0.08)', border: '1.5px solid rgba(13,148,136,0.2)',
                borderRadius: 10, padding: '8px 14px',
              }}>
                <span>{icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
                <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 0 0 4px' }}>✕</button>
              </div>
            ))}
          </div>

          {/* Config sliders */}
          <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '20px 20px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <ConfigRow
              label="Number of Questions"
              value={questionCount}
              min={10} max={80} step={5}
              onChange={setQuestionCount}
              display={`${questionCount} Questions`}
            />
            <ConfigRow
              label="Time Limit"
              value={timeLimit}
              min={0} max={120} step={5}
              onChange={setTimeLimit}
              display={timeLimit === 0 ? 'No Limit' : `${timeLimit} Minutes`}
            />
          </div>

          <button onClick={handleStart} style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #0D9488, #2563EB)',
            color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: 0.3,
          }}>
            🎯 Start Drill →
          </button>
        </ACard>
      )}
    </div>
  );
}

function ConfigRow({ label, value, min, max, step, onChange, display }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#0D9488' }}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#0D9488' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{min === 0 ? 'No Limit' : min}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{max}</span>
      </div>
    </div>
  );
}
