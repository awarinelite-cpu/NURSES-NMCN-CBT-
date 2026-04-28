// src/components/entrance/EntranceExamSchools.jsx
// ─────────────────────────────────────────────────────────────────
//  FIXED:
//  - Reads from 'entranceExamQuestions' (same collection admin writes to)
//  - Groups questions by school
//  - Student can tap a school → start an exam session
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

export default function EntranceExamSchools() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [schools, setSchools]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      try {
        // ✅ Same collection the admin manager writes to
        const snap = await getDocs(collection(db, 'entranceExamQuestions'));
        if (cancelled) return;

        // Group by school
        const map = {};
        snap.forEach(doc => {
          const d = doc.data();
          const school = d.school || 'General';
          if (!map[school]) map[school] = { name: school, count: 0, subjects: new Set() };
          map[school].count++;
          if (d.subject) map[school].subjects.add(d.subject);
        });

        const list = Object.values(map).map(s => ({
          ...s,
          subjects: Array.from(s.subjects),
        })).sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setSchools(list);
          setLoading(false);
        }
      } catch (err) {
        console.error('EntranceExamSchools load error:', err);
        if (!cancelled) {
          setError('Failed to load schools. Check your internet connection and try again.');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user]);

  function startExam(schoolName) {
    // Pass school name as state to ExamSession
    navigate('/entrance-exam/exam-session', {
      state: { mode: 'school', school: schoolName },
    });
  }

  return (
    <div style={s.wrap}>
      <button onClick={() => navigate('/entrance-exam')} style={s.back}>
        ← Back to Hub
      </button>

      <h2 style={s.heading}>🏫 School Past Questions</h2>
      <p style={s.sub}>Select a school to start a past question session.</p>

      {loading && (
        <div style={s.center}>
          <div style={s.spinner} />
          <p style={s.loadText}>Loading schools…</p>
        </div>
      )}

      {error && (
        <div style={s.errorBox}>
          <span>⚠️</span> {error}
        </div>
      )}

      {!loading && !error && schools.length === 0 && (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🏫</div>
          <p style={s.emptyTitle}>No questions uploaded yet</p>
          <p style={s.emptySub}>
            The admin hasn't uploaded entrance exam questions yet.
            Check back soon!
          </p>
        </div>
      )}

      {!loading && schools.length > 0 && (
        <div style={s.grid}>
          {schools.map(school => (
            <div key={school.name} style={s.card}>
              <div style={s.cardTop}>
                <div style={s.schoolIcon}>🏫</div>
                <div style={s.schoolInfo}>
                  <div style={s.schoolName}>{school.name}</div>
                  <div style={s.schoolMeta}>
                    {school.count} question{school.count !== 1 ? 's' : ''}
                    {school.subjects.length > 0 && (
                      <span style={s.dot}> · {school.subjects.slice(0, 3).join(', ')}{school.subjects.length > 3 ? '…' : ''}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                style={s.startBtn}
                onClick={() => startExam(school.name)}
              >
                Start Practice →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '24px 16px 48px',
    fontFamily: "'Inter', sans-serif",
    color: '#fff',
  },
  back: {
    background: 'none',
    border: 'none',
    color: '#0D9488',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    padding: '0 0 16px',
    display: 'block',
  },
  heading: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    fontWeight: 700,
    margin: '0 0 6px',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginBottom: 24,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '48px 0',
    gap: 12,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid rgba(255,255,255,0.1)',
    borderTop: '3px solid #0D9488',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#EF4444',
    borderRadius: 12,
    padding: '14px 18px',
    fontSize: 14,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  emptyBox: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  emptySub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, lineHeight: 1.6 },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '18px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  schoolIcon: { fontSize: 28, flexShrink: 0 },
  schoolInfo: { flex: 1 },
  schoolName: { fontSize: 15, fontWeight: 700, marginBottom: 3 },
  schoolMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  dot: { color: 'rgba(255,255,255,0.3)' },
  startBtn: {
    background: 'linear-gradient(135deg, #0D9488, #0891b2)',
    border: 'none',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 18px',
    borderRadius: 10,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontFamily: "'Inter', sans-serif",
  },
};
