// src/components/exam/CaosceHistoryPage.jsx
// Route: /caosce/history
//
// Lists every CAOSCE attempt the current student has saved, most recent
// first, each linking to CaosceReviewPage for the full question-by-question
// breakdown. Mirrors the daily-practice-archive → ExamReviewPage pattern.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

export default function CaosceHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      try {
        // Query by userId only (no orderBy) to avoid needing a composite
        // index, then sort client-side — same approach used elsewhere
        // for examSessions fallback queries.
        const snap = await getDocs(
          query(collection(db, 'caosceResults'), where('userId', '==', user.uid))
        );
        const rows = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
            const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
            return tb - ta;
          });
        setResults(rows);
      } catch (e) {
        console.error('CaosceHistoryPage load error:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid]);

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ padding: '24px 16px', maxWidth: 760, margin: '0 auto' }}>
      <button onClick={() => navigate('/caosce')} style={S.backBtn}>
        ← Back to CAOSCE Prep
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 28 }}>📜</span>
        <h2 style={{ fontFamily: H, margin: 0, color: 'var(--text-primary)' }}>My CAOSCE Results</h2>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: '0 0 24px' }}>
        Every practical exam you've saved, with full review available for each.
      </p>

      {loading ? (
        <div style={S.emptyState}><div style={{ fontSize: 36 }}>⏳</div><div>Loading your results…</div></div>
      ) : results.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: 40 }}>🩺</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>No saved results yet</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320 }}>
            Complete a CAOSCE practical exam and save it to see your results here.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/caosce')} style={{ marginTop: 8 }}>
            🩺 Start a Case
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map(r => {
            const specialty = NURSING_CATEGORIES.find(c => c.id === r.specialty);
            const scoreColor = r.scorePercent >= 70 ? '#16A34A' : r.scorePercent >= 50 ? '#D97706' : '#DC2626';
            const caseTitle = r.cases?.[0]?.title || r.cases?.[0]?.topic || 'CAOSCE Case';
            const extraCases = (r.cases?.length || 1) - 1;
            return (
              <button
                key={r.id}
                onClick={() => navigate('/caosce/review', { state: { resultId: r.id } })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                  padding: '14px 16px', borderRadius: 14, cursor: 'pointer', fontFamily: F,
                  border: '1.5px solid var(--border)', background: 'var(--bg-card)',
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${scoreColor}18`, border: `1.5px solid ${scoreColor}40`,
                  fontWeight: 900, fontSize: 15, color: scoreColor, fontFamily: H,
                }}>
                  {r.scorePercent}%
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                    {specialty ? `${specialty.icon} ${specialty.shortLabel}` : 'CAOSCE'} — {caseTitle}
                    {extraCases > 0 ? ` +${extraCases} more` : ''}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {r.totalCorrect}/{r.totalQuestions} correct · {formatDate(r.createdAt)}
                  </div>
                </div>
                <span style={{ color: 'var(--teal)', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  backBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontWeight: 700, fontSize: 13, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 },
  emptyState: { textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
};
