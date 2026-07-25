// src/components/admin/DailyMockExamAdmin.jsx
// Route: /admin/daily-mock-exam
//
// Shows today's Daily Mock Exam pools — one per nursing specialty — and lets
// an admin force an immediate rotation via the manuallyRotateDailyMockExam
// Cloud Function — handy for testing without waiting for the midnight
// schedule to fire. The Cloud Function groups active questions by their
// `category` field and builds a separate pool per specialty at
// dailyMockExam/{categoryId}, indexed by dailyMockExam/_index.

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';
import { NURSING_CATEGORIES } from '../../data/categories';

function fmt(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return d ? d.toLocaleString('en-NG') : '—';
}
function labelFor(categoryId) {
  return NURSING_CATEGORIES.find(c => c.id === categoryId)?.label || categoryId;
}

export default function DailyMockExamAdmin() {
  const { toast } = useToast();
  const [index,    setIndex]    = useState(null);   // dailyMockExam/_index doc
  const [pools,    setPools]    = useState([]);      // [{ categoryId, ...poolDoc }]
  const [loading,  setLoading]  = useState(true);
  const [rotating, setRotating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const idxSnap = await getDoc(doc(db, 'dailyMockExam', '_index'));
      const idx = idxSnap.exists() ? idxSnap.data() : null;
      setIndex(idx);

      const categoryIds = idx?.categories?.length ? idx.categories : NURSING_CATEGORIES.map(c => c.id);
      const results = await Promise.all(
        categoryIds.map(async catId => {
          try {
            const snap = await getDoc(doc(db, 'dailyMockExam', catId));
            return snap.exists() ? { categoryId: catId, ...snap.data() } : { categoryId: catId, questionIds: [] };
          } catch {
            return { categoryId: catId, questionIds: [] };
          }
        })
      );
      results.sort((a, b) => labelFor(a.categoryId).localeCompare(labelFor(b.categoryId)));
      setPools(results);
    } catch {
      setIndex(null);
      setPools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const forceRotate = async () => {
    if (!window.confirm('Generate a new pool right now for every specialty? This replaces today\u2019s pools for every student.')) return;
    setRotating(true);
    try {
      const fn = httpsCallable(getFunctions(), 'manuallyRotateDailyMockExam');
      const res = await fn();
      const specialtyCount = res.data?.categories?.length ?? '?';
      toast(`✅ Rotated — ${specialtyCount} specialties, ${res.data?.count ?? '?'} total questions (${res.data?.carryoverCount ?? 0} carried over for low pass rate)`, 'success', 4500);
      load();
    } catch (e) {
      toast(`❌ Rotation failed: ${e.message}`, 'error', 5000);
    } finally {
      setRotating(false);
    }
  };

  const totalQuestions  = pools.reduce((a, p) => a + (p.questionIds?.length || 0), 0);
  const totalCarryover  = pools.reduce((a, p) => a + (p.carryoverCount || 0), 0);
  const emptyPools      = pools.filter(p => (p.questionIds?.length || 0) === 0);

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h2 style={{ marginTop: 0 }}>🗓️ Daily Mock Exam — By Specialty</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
        Each nursing specialty gets its own pool (up to 250 questions), rotated automatically every 24 hours
        (midnight, Africa/Lagos), drawn only from that specialty's active questions.
        Questions with a pass rate of 49% or below are carried over automatically — in their own specialty's pool —
        until they recover to 50%+.
      </p>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : !index ? (
        <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 12, padding: 16, color: '#DC2626', fontWeight: 600, marginBottom: 20 }}>
          No pools have been generated yet. Trigger a rotation below to create the first ones.
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
              <div><strong>Date:</strong> {index.date}</div>
              <div><strong>Specialties with pools:</strong> {pools.length}</div>
              <div><strong>Total questions:</strong> {totalQuestions}</div>
              <div><strong>Total carried over:</strong> {totalCarryover}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong>Generated at:</strong> {fmt(index.generatedAt)}</div>
            </div>
          </div>

          {emptyPools.length > 0 && (
            <div style={{ background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 12, padding: 14, marginBottom: 16, color: '#D97706', fontSize: 13, fontWeight: 600 }}>
              ⚠️ {emptyPools.length} specialt{emptyPools.length === 1 ? 'y has' : 'ies have'} no active questions yet: {emptyPools.map(p => labelFor(p.categoryId)).join(', ')}
            </div>
          )}

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
            {pools.map((p, idx) => {
              const count = p.questionIds?.length || 0;
              return (
                <div key={p.categoryId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: idx < pools.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 14 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{labelFor(p.categoryId)}</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                    <span>{count} question{count !== 1 ? 's' : ''}</span>
                    <span>{p.carryoverCount || 0} carried over</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <button
        onClick={forceRotate}
        disabled={rotating}
        style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: 14, cursor: rotating ? 'default' : 'pointer' }}
      >
        {rotating ? 'Rotating…' : '🔄 Force Rotate Now (all specialties)'}
      </button>
    </div>
  );
}
