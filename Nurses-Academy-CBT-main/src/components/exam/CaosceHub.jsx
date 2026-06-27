// src/components/exam/CaosceHub.jsx
// Route: /caosce
//
// CAOSCE PREP — Computer-Based OSCE Practical Exam Prep
//
// FLOW:
//   Step 1 — Choose a Nursing Specialty (category grid, same pattern as Daily Practice)
//   Step 2 — Instructions + search bar (topic / year) + case list + Start button
//   Step 3 — CaosceExamSession (/caosce/exam) — scenario, procedure checklist, CBT questions
//
// FIRESTORE:
//   caosceCases collection — { specialty, topic, year, title, scenario,
//     procedures: [{id,text,isRequired}], cbtQuestions: [{id,question,options,correctIndex,explanation}],
//     active, createdAt }

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, getCountFromServer,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

export default function CaosceHub() {
  const navigate = useNavigate();

  const [step,         setStep]         = useState(1); // 1=specialty, 2=instructions/search
  const [specialty,    setSpecialty]    = useState(null);
  const [catStats,     setCatStats]     = useState({});
  const [statsLoading, setStatsLoading] = useState(true);

  const [cases,        setCases]        = useState([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [search,       setSearch]       = useState('');
  const [selectedCase, setSelectedCase] = useState(null);

  // ── Load case counts per specialty ──────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      setStatsLoading(true);
      try {
        const results = await Promise.all(
          NURSING_CATEGORIES.map(async cat => {
            try {
              const snap = await getCountFromServer(
                query(
                  collection(db, 'caosceCases'),
                  where('specialty', '==', cat.id),
                  where('active',    '==', true),
                )
              );
              return [cat.id, snap.data().count];
            } catch {
              return [cat.id, null];
            }
          })
        );
        setCatStats(Object.fromEntries(results));
      } finally {
        setStatsLoading(false);
      }
    };
    fetchAll();
  }, []);

  // ── Load cases for the selected specialty ───────────────────────────────────
  useEffect(() => {
    if (!specialty) return;
    setCasesLoading(true);
    setSelectedCase(null);
    getDocs(
      query(
        collection(db, 'caosceCases'),
        where('specialty', '==', specialty.id),
        where('active',    '==', true),
      )
    )
      .then(snap => setCases(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setCases([]))
      .finally(() => setCasesLoading(false));
  }, [specialty]);

  const handleSpecialtyClick = (cat) => {
    setSpecialty(cat);
    setStep(2);
  };

  const handleStart = () => {
    if (!selectedCase) return;
    navigate('/caosce/exam', {
      state: {
        caseIds:   [selectedCase.id],
        specialty: specialty.id,
      },
    });
  };

  const filtered = cases.filter(c => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (
      (c.topic   || '').toLowerCase().includes(s) ||
      (c.title   || '').toLowerCase().includes(s) ||
      String(c.year || '').includes(s)
    );
  });

  // ── STEP 1 — Specialty Picker ────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ padding: '24px', maxWidth: 900 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 32 }}>🩺</span>
              <h2 style={{ fontFamily: H, margin: 0, color: 'var(--text-primary)' }}>
                CAOSCE PREP
              </h2>
            </div>
            <button onClick={() => navigate('/caosce/history')} style={styles.historyBtn}>
              📜 My Past Results
            </button>
          </div>
          <p style={{ color: 'var(--teal)', fontSize: 13, margin: '0 0 6px 0', fontWeight: 600 }}>
            Computer-Based OSCE Practical Exam
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Practice real OSCE-style clinical stations: read the scenario, tick the procedures
            you'd actually perform, then answer follow-up CBT questions on the case.
          </p>
        </div>

        <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

        <div style={styles.catGrid}>
          {NURSING_CATEGORIES.map(cat => {
            const total   = catStats[cat.id];
            const loading = statsLoading && total === undefined;
            const noCases = !loading && total === 0;

            return (
              <button
                key={cat.id}
                onClick={() => !noCases && handleSpecialtyClick(cat)}
                disabled={noCases}
                style={{
                  ...styles.catCard,
                  borderColor: `${cat.color}60`,
                  background:  `${cat.color}0D`,
                  opacity:     noCases ? 0.45 : 1,
                  cursor:      noCases ? 'not-allowed' : 'pointer',
                }}
              >
                <div style={{ ...styles.catAccent, background: cat.color }} />
                <div style={{ ...styles.catIconBox, background: `${cat.color}20` }}>
                  <span style={{ fontSize: 26 }}>{cat.icon}</span>
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>
                    {cat.shortLabel}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: noCases ? 'var(--text-muted)' : cat.color }}>
                    {loading
                      ? 'Loading…'
                      : noCases
                        ? 'No cases yet'
                        : total === null
                          ? 'Available'
                          : `${total} case${total !== 1 ? 's' : ''} available`}
                  </div>
                </div>
                {!noCases && (
                  <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── STEP 2 — Instructions + Search + Start ──────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 760 }}>
      <button onClick={() => { setStep(1); setSpecialty(null); setCases([]); setSearch(''); }} style={styles.backBtn}>
        ← Back to Specialties
      </button>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
        background: `${specialty.color}12`, border: `1.5px solid ${specialty.color}30`,
        borderRadius: 14, padding: '14px 18px',
      }}>
        <span style={{ fontSize: 24 }}>{specialty.icon}</span>
        <div>
          <div style={{ fontSize: 11, color: specialty.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Selected Specialty
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{specialty.label}</div>
        </div>
      </div>

      {/* ── Instructions ── */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 10 }}>
          📋 How this exam works
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.8, fontFamily: F }}>
          <li>You'll be given a clinical <strong>scenario</strong> to read carefully.</li>
          <li>Below it, tick every <strong>procedure</strong> you would actually perform for this case. Your checklist is scored against the correct procedures for the case.</li>
          <li>Below the checklist, answer the <strong>CBT questions</strong> about the scenario by selecting the best option.</li>
          <li>When you're done, save the exam to see your score and review your answers.</li>
        </ol>
      </div>

      {/* ── Search ── */}
      <div style={styles.sectionHead}>🔍 Find a Case</div>
      <input
        className="form-input"
        placeholder="Search by topic or year… e.g. 'Wound Care' or '2024'"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 460 }}
      />

      {casesLoading ? (
        <div style={styles.emptyState}><div style={{ fontSize: 40 }}>⏳</div><div>Loading cases…</div></div>
      ) : filtered.length === 0 ? (
        <div style={styles.emptyState}><div style={{ fontSize: 40 }}>🔍</div><div>No cases found for this specialty yet</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {filtered.map(c => {
            const isSelected = selectedCase?.id === c.id;
            return (
              <div key={c.id}>
                <button
                  onClick={() => setSelectedCase(isSelected ? null : c)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    padding: '14px 16px', borderRadius: isSelected ? '12px 12px 0 0' : 12,
                    cursor: 'pointer', fontFamily: F,
                    border: `1.5px solid ${isSelected ? specialty.color : 'var(--border)'}`,
                    borderBottom: isSelected ? `1.5px solid ${specialty.color}40` : undefined,
                    background: isSelected ? `${specialty.color}18` : 'var(--bg-card)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isSelected ? specialty.color : 'var(--border)'}`,
                    background: isSelected ? specialty.color : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 12, fontWeight: 900,
                  }}>
                    {isSelected ? '✓' : ''}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                      {c.title || c.topic || 'Untitled Case'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {c.topic}{c.year ? ` · ${c.year}` : ''} · {c.procedures?.length || 0} procedures · {c.cbtQuestions?.length || 0} CBT Qs
                    </div>
                  </div>
                  <span style={{
                    color: isSelected ? specialty.color : 'var(--text-muted)',
                    fontSize: 16, fontWeight: 900, flexShrink: 0,
                    transform: isSelected ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'inline-block',
                  }}>›</span>
                </button>

                {/* ── Expanded action panel ── */}
                {isSelected && (
                  <div style={{
                    border: `1.5px solid ${specialty.color}`,
                    borderTop: 'none',
                    borderRadius: '0 0 12px 12px',
                    background: `${specialty.color}0A`,
                    padding: '16px 16px 18px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    animation: 'caosceExpand 0.2s ease',
                  }}>
                    <style>{`@keyframes caosceExpand { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }`}</style>

                    {/* Case summary chips */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { icon: '🗂️', label: c.topic || 'General' },
                        { icon: '📅', label: c.year ? String(c.year) : 'All Years' },
                        { icon: '✅', label: `${c.procedures?.length || 0} procedures` },
                        { icon: '❓', label: `${c.cbtQuestions?.length || 0} CBT Qs` },
                      ].map(chip => (
                        <span key={chip.label} style={{
                          fontSize: 11, fontWeight: 700, fontFamily: F,
                          padding: '4px 10px', borderRadius: 20,
                          background: `${specialty.color}18`,
                          border: `1px solid ${specialty.color}33`,
                          color: 'var(--text-primary)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          {chip.icon} {chip.label}
                        </span>
                      ))}
                    </div>

                    {/* Start button */}
                    <button
                      onClick={handleStart}
                      style={{
                        width: '100%', padding: '14px', borderRadius: 10, border: 'none',
                        fontFamily: H, fontWeight: 900, fontSize: 15, letterSpacing: 0.4,
                        cursor: 'pointer',
                        background: `linear-gradient(135deg, ${specialty.color}, ${specialty.color}cc)`,
                        color: '#fff',
                        boxShadow: `0 4px 16px ${specialty.color}44`,
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      ▶ Start Practical Exam
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  backBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  historyBtn: { background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 12.5, fontFamily: F },
  sectionHead:{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  catGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard:    { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', fontFamily: F, transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox: { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
};
