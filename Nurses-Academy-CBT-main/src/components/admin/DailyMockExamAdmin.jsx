// src/components/admin/DailyMockExamAdmin.jsx
// Route: /admin/daily-mock-exam
//
// Shows today's Daily Mock Exam pool (250-question rotation) and lets an
// admin force an immediate rotation via the manuallyRotateDailyMockExam
// Cloud Function — handy for testing without waiting for the midnight
// schedule to fire.

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase/config';
import { useToast } from '../shared/Toast';

function fmt(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return d ? d.toLocaleString('en-NG') : '—';
}

export default function DailyMockExamAdmin() {
  const { toast } = useToast();
  const [pool,     setPool]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [rotating, setRotating] = useState(false);

  const load = () => {
    setLoading(true);
    getDoc(doc(db, 'dailyMockExam', 'current'))
      .then(snap => setPool(snap.exists() ? snap.data() : null))
      .catch(() => setPool(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const forceRotate = async () => {
    if (!window.confirm('Generate a new 250-question pool right now? This replaces today\u2019s pool for every student.')) return;
    setRotating(true);
    try {
      const fn = httpsCallable(getFunctions(), 'manuallyRotateDailyMockExam');
      const res = await fn();
      toast(`✅ Rotated — ${res.data?.count ?? '?'} questions (${res.data?.carryoverCount ?? 0} carried over for low pass rate)`, 'success', 4000);
      load();
    } catch (e) {
      toast(`❌ Rotation failed: ${e.message}`, 'error', 5000);
    } finally {
      setRotating(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h2 style={{ marginTop: 0 }}>🗓️ Daily Mock Exam</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
        The 250-question pool rotates automatically every 24 hours (midnight, Africa/Lagos).
        Questions with a pass rate of 49% or below are carried over automatically until they recover to 50%+.
      </p>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : !pool ? (
        <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 12, padding: 16, color: '#DC2626', fontWeight: 600 }}>
          No pool has been generated yet. Trigger a rotation below to create the first one.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
            <div><strong>Date:</strong> {pool.date}</div>
            <div><strong>Questions:</strong> {pool.questionIds?.length ?? 0}</div>
            <div><strong>Carried over (low pass rate):</strong> {pool.carryoverCount ?? 0}</div>
            <div><strong>Generated at:</strong> {fmt(pool.generatedAt)}</div>
          </div>
        </div>
      )}

      <button
        onClick={forceRotate}
        disabled={rotating}
        style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: '#0D9488', color: '#fff', fontWeight: 700, fontSize: 14, cursor: rotating ? 'default' : 'pointer' }}
      >
        {rotating ? 'Rotating…' : '🔄 Force Rotate Now'}
      </button>
    </div>
  );
}
