// src/components/exam/PastQuestionsPage.jsx
// Route: /past-questions
//
// FLOW:
//   Step 1 — Choose a Nursing Specialty
//   Step 2 — ExamListPage (/exam/list) with examType='past_questions'

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function PastQuestionsPage() {
  const navigate = useNavigate();

  const [exams,   setExams]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Load all active past_questions exams to know which specialties have content
  useEffect(() => {
    getDocs(query(
      collection(db, 'exams'),
      where('examType', '==', 'past_questions'),
      where('active',   '==', true),
    ))
      .then(snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setExams(all.filter(e => (e.totalQuestions || 0) > 0));
      })
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
  }, []);

  // Only show specialties that actually have past_questions exams
  const specialtiesWithExams = NURSING_CATEGORIES.filter(cat =>
    exams.some(e => e.category === cat.id)
  );

  const countForCat = (catId) =>
    exams.filter(e => e.category === catId).length;

  const handleSpecialtyClick = (cat) => {
    navigate('/exam/list', {
      state: {
        examType:    'past_questions',
        category:    cat.id,
        courseLabel: cat.label,
      },
    });
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 32 }}>📜</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Past Questions
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Practice with real NMCN past examination questions by specialty.
        </p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {['Choose Specialty', 'Choose Exam', 'Set Up', 'Take Exam'].map((label, i) => {
          const active = i === 0;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: active ? 'var(--teal)' : 'var(--bg-tertiary)',
                  border: `2px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
                  color: active ? '#fff' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900,
                }}>{i + 1}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--teal)' : 'var(--text-muted)' }}>
                  {label}
                </span>
              </div>
              {i < 3 && (
                <div style={{ width: 16, height: 2, borderRadius: 2, margin: '0 4px', background: 'var(--border)' }} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>
        🏥 Choose a Nursing Specialty
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <span className="spinner" />
        </div>
      ) : specialtiesWithExams.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--text-primary)' }}>
            No past questions uploaded yet
          </div>
          <div>Admin hasn't uploaded any past questions exams.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {specialtiesWithExams.map(cat => {
            const count = countForCat(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => handleSpecialtyClick(cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 18px', borderRadius: 14,
                  border: `1.5px solid ${cat.color}60`,
                  background: `${cat.color}0D`,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Left accent bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: 4, borderRadius: '4px 0 0 4px', background: cat.color,
                }} />

                {/* Icon */}
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: `${cat.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 26 }}>{cat.icon}</span>
                </div>

                {/* Labels */}
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {cat.shortLabel}
                  </div>
                  <div style={{ fontSize: 11, color: cat.color, fontWeight: 600 }}>
                    {count} exam set{count !== 1 ? 's' : ''} available
                  </div>
                </div>

                <span style={{ color: cat.color, fontSize: 18, fontWeight: 900 }}>→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
