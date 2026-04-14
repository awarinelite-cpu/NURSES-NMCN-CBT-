// src/components/exam/DailyPracticePage.jsx
// Route: /daily-practice
//
// FLOW:
//   Step 1 — Choose a Nursing Specialty (category grid)
//   Step 2 — ExamSession (/exam/session) with poolMode:true + category filter
//            Pulls up to 250 random questions from ALL topics and courses
//            under the selected specialty, excluding already-seen questions.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function DailyPracticePage() {
  const navigate    = useNavigate();
  const { profile } = useAuth();

  // Map of categoryId → total question count
  const [catStats,     setCatStats]     = useState({});
  const [statsLoading, setStatsLoading] = useState(true);

  // Load question counts per specialty so each card shows useful info
  useEffect(() => {
    const fetchAll = async () => {
      setStatsLoading(true);
      try {
        const results = await Promise.all(
          NURSING_CATEGORIES.map(async cat => {
            try {
              const snap = await getCountFromServer(
                query(
                  collection(db, 'questions'),
                  where('category', '==', cat.id),
                  where('active',   '==', true),
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

  const handleStart = (cat) => {
    navigate('/exam/session', {
      state: {
        poolMode:  true,
        examType:  'daily_practice',
        category:  cat.id,
        examName:  `${cat.shortLabel} — Daily Practice`,
        doShuffle: true,
        timeLimit: 0,
      },
    });
  };

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
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Choose a nursing specialty. Questions from <strong style={{ color: 'var(--text-primary)' }}>all topics and courses</strong> under
          that specialty are mixed randomly — up to 250 fresh questions per session.
        </p>
      </div>

      <StepIndicator step={1} steps={['Choose Specialty', 'Take Exam']} />

      <div style={styles.sectionHead}>🏥 Choose a Nursing Specialty</div>

      <div style={styles.catGrid}>
        {NURSING_CATEGORIES.map(cat => {
          const total   = catStats[cat.id];
          const loading = statsLoading && total === undefined;
          const noQs    = !loading && total === 0;

          return (
            <button
              key={cat.id}
              onClick={() => !noQs && handleStart(cat)}
              disabled={noQs}
              style={{
                ...styles.catCard,
                borderColor: `${cat.color}60`,
                background:  `${cat.color}0D`,
                opacity:     noQs ? 0.45 : 1,
                cursor:      noQs ? 'not-allowed' : 'pointer',
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
                <div style={{ fontSize: 11, fontWeight: 600, color: noQs ? 'var(--text-muted)' : cat.color }}>
                  {loading
                    ? 'Loading…'
                    : noQs
                      ? 'No questions yet'
                      : total === null
                        ? 'Available'
                        : `${total} question${total !== 1 ? 's' : ''} available`}
                </div>
              </div>
              {!noQs && (
                <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
              )}
            </button>
          );
        })}
      </div>

      {/* How it works */}
      <div style={{
        marginTop: 28,
        background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.2)',
        borderRadius: 14, padding: '16px 20px',
      }}>
        <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 10, fontSize: 13 }}>
          📋 How Daily Practice Works
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            ['⚡', "Questions are picked randomly from ALL topics and courses under your chosen specialty"],
            ['🔀', "Each session is unique — questions you've already seen are skipped automatically"],
            ['🔄', "Once you've seen all questions in a specialty, the pool resets and starts fresh"],
            ['🔖', "Bookmark any question during the session to review it later"],
            ['💡', "Full explanations shown after every session"],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span style={{ flexShrink: 0 }}>{icon}</span>
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step, steps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const num = i + 1; const done = step > num; const active = step === num;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done || active ? 'var(--teal)' : 'var(--bg-tertiary)',
                border: `2px solid ${done || active ? 'var(--teal)' : 'var(--border)'}`,
                color: done || active ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 900, flexShrink: 0, opacity: done ? 0.65 : 1,
              }}>{done ? '✓' : num}</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--teal)' : 'var(--text-muted)' }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 20, height: 2, borderRadius: 2, margin: '0 6px', background: step > num ? 'var(--teal)' : 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  sectionHead: { fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16, letterSpacing: 0.2 },
  catGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  catCard:     { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, border: '1.5px solid', fontFamily: 'inherit', transition: 'all 0.2s', position: 'relative', overflow: 'hidden', background: 'var(--bg-card)' },
  catAccent:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '4px 0 0 4px' },
  catIconBox:  { width: 48, height: 48, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
