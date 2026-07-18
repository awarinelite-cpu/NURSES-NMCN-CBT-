// src/components/exam/EssayQuestionsPage.jsx
// Route: /essay-questions?specialty=<id>
//
// Read-only view of essay/theory exam papers for one specialty.
// Shows ONLY the questions (stem + lettered parts + marks allocation) —
// no answers, no marking guide. Two levels:
//   Level 1 — list of essay sets available for the specialty
//   Level 2 — the full paper, numbered questions with sub-parts

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { SPECIALTIES } from './MockExamPage';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

export default function EssayQuestionsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const specialtyId = params.get('specialty') || SPECIALTIES[0].id;
  const sp = SPECIALTIES.find(s => s.id === specialtyId) || SPECIALTIES[0];

  const [sets,    setSets]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSet, setOpenSet] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'essayQuestionSets'),
        where('specialtyId', '==', specialtyId),
      ));
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.active !== false);
      setSets(all);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [specialtyId]);

  useEffect(() => { load(); }, [load]);

  // ── Detail view ────────────────────────────────────────────────────────────
  if (openSet) {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 760, margin: '0 auto', fontFamily: F }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setOpenSet(null)}
          style={{ marginBottom: 18 }}
        >
          ← Back to Essay Sets
        </button>

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '20px 18px', marginBottom: 18, textAlign: 'center',
        }}>
          {openSet.institution && (
            <div style={{ fontFamily: H, fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>
              {openSet.institution}
            </div>
          )}
          {openSet.title && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {openSet.title}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            {openSet.courseCode && <span>{openSet.courseCode}{openSet.courseTitle ? ` - ${openSet.courseTitle}` : ''}</span>}
            {openSet.examDate && <span>📅 {openSet.examDate}</span>}
            {openSet.timeAllowed && <span>⏱ {openSet.timeAllowed}</span>}
          </div>
          {openSet.instruction && (
            <div style={{
              marginTop: 12, fontSize: 12, fontWeight: 700, color: sp.color,
              background: sp.glow, border: `1px solid ${sp.border}`,
              borderRadius: 10, padding: '8px 12px',
            }}>
              {openSet.instruction}
            </div>
          )}
        </div>

        {(openSet.questions || []).map(q => (
          <div key={q.number} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '16px 18px', marginBottom: 14,
          }}>
            <div style={{ fontFamily: H, fontWeight: 800, fontSize: 15, color: sp.color, marginBottom: 8 }}>
              Question {q.number}
            </div>
            {q.stem && (
              <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                {q.stem}
              </div>
            )}
            {(q.parts || []).map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {p.label && <span style={{ fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{p.label}.</span>}
                <span>
                  {p.text}
                  {p.marks && <span style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}> &nbsp;({p.marks})</span>}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 16px', maxWidth: 760, margin: '0 auto' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => navigate('/mock-exams')}
        style={{ marginBottom: 20 }}
      >
        ← Back
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 28 }}>{sp.icon}</span>
        <h2 style={{ margin: 0, fontFamily: H, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
          {sp.label} — Essay Questions
        </h2>
      </div>
      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 14 }}>
        Practice theory papers. Questions only — no answers provided.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
      ) : sets.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14,
        }}>
          No essay questions uploaded yet for {sp.label}. Check back soon.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sets.map(set => (
            <button
              key={set.id}
              onClick={() => setOpenSet(set)}
              style={{
                textAlign: 'left', cursor: 'pointer',
                background: 'var(--bg-card)', border: `1px solid ${sp.border}`,
                borderRadius: 16, padding: '16px 18px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                📜 {set.title || set.setLabel || 'Essay Question Set'}
              </div>
              <div style={{ fontSize: 12, color: sp.color, fontWeight: 600, marginTop: 4 }}>
                {set.courseCode} {set.courseTitle ? `- ${set.courseTitle}` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {(set.questions || []).length} questions
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
