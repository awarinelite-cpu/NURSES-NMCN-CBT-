// src/components/exam/CaosceReviewPage.jsx
// Route: /caosce/review
//
// Question-by-question review of a completed CAOSCE attempt — procedure
// checklist + CBT questions, both with correct/incorrect highlighting,
// mirroring the conventions of ExamReviewPage for other exam types.
//
// Two ways to reach this page:
//   1. Straight from CaosceExamSession after finishing — location.state
//      already carries the full case docs + answers in memory, so no
//      extra Firestore reads are needed for an instant review.
//   2. From CaosceHistoryPage (or a reload/shared link) — only a
//      resultId is available, so we fetch caosceResults/{resultId} and
//      then the original caosceCases docs to reconstruct the same view.

import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  doc, getDoc, collection, getDocs, query, where, documentId,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';
import ExplanationText from '../shared/ExplanationText';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

export default function CaosceReviewPage() {
  const { user }     = useAuth();
  const navigate      = useNavigate();
  const { state }     = useLocation();
  const [searchParams] = useSearchParams();

  const resultId = state?.resultId || searchParams.get('resultId') || '';

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [result,   setResult]   = useState(null);   // { specialty, scorePercent, totalCorrect, totalQuestions, createdAt, durationSeconds }
  const [merged,   setMerged]   = useState([]);      // [{ ...caseDoc, ...caseResultEntry }]

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        // ── Fast path: full data already in memory from just-finished exam ──
        if (state?.cases?.length && state?.caseResults?.length) {
          const byId = Object.fromEntries(state.cases.map(c => [c.id, c]));
          const mergedCases = state.caseResults.map(cr => ({ ...(byId[cr.caseId] || {}), ...cr }));
          setMerged(mergedCases);
          setResult({
            specialty:      state.specialty,
            scorePercent:   state.scorePercent,
            totalCorrect:   state.totalCorrect,
            totalQuestions: state.totalQuestions,
            createdAt:      null, // just happened — "just now"
            durationSeconds: state.durationSeconds,
          });
          setLoading(false);
          return;
        }

        // ── Fetch path: revisiting later, only have a resultId ──────────────
        if (!resultId) {
          setError('No exam result specified.');
          setLoading(false);
          return;
        }
        const snap = await getDoc(doc(db, 'caosceResults', resultId));
        if (!snap.exists()) {
          setError('This exam result could not be found. It may have been deleted.');
          setLoading(false);
          return;
        }
        const data = snap.data();
        if (user?.uid && data.userId && data.userId !== user.uid) {
          setError('You do not have permission to view this result.');
          setLoading(false);
          return;
        }

        const caseResults = data.cases || [];
        const caseIds = caseResults.map(c => c.caseId).filter(Boolean);

        let caseDocs = [];
        for (let i = 0; i < caseIds.length; i += 30) {
          const chunk = caseIds.slice(i, i + 30);
          try {
            const qSnap = await getDocs(
              query(collection(db, 'caosceCases'), where(documentId(), 'in', chunk))
            );
            qSnap.docs.forEach(d => caseDocs.push({ id: d.id, ...d.data() }));
          } catch (e) { console.warn('caosceCases fetch failed:', e); }
        }
        const byId = Object.fromEntries(caseDocs.map(c => [c.id, c]));
        const mergedCases = caseResults.map(cr => ({ ...(byId[cr.caseId] || {}), ...cr }));

        setMerged(mergedCases);
        setResult({
          specialty:       data.specialty,
          scorePercent:    data.scorePercent,
          totalCorrect:    data.totalCorrect,
          totalQuestions:  data.totalQuestions,
          createdAt:       data.createdAt,
          durationSeconds: data.durationSeconds,
        });
      } catch (e) {
        console.error('CaosceReviewPage load error:', e);
        setError('Failed to load review. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId, user?.uid]);

  const specialtyInfo = NURSING_CATEGORIES.find(c => c.id === result?.specialty);

  const formatDate = (ts) => {
    if (!ts) return 'Just now';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      + ' at ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return (
    <div style={S.center}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Loading your review…</p>
    </div>
  );

  if (error || !result) return (
    <div style={S.center}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Review Unavailable</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{error || 'This result could not be found.'}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate('/caosce/history')}>← My CAOSCE Results</button>
          <button className="btn btn-ghost" onClick={() => navigate('/caosce')}>Practice Again</button>
        </div>
      </div>
    </div>
  );

  const scoreColor = result.scorePercent >= 70 ? '#16A34A' : result.scorePercent >= 50 ? '#D97706' : '#DC2626';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        <button onClick={() => navigate('/caosce/history')} style={S.backBtn}>
          ← My CAOSCE Results
        </button>

        {/* Score card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center',
        }}>
          {specialtyInfo && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: `${specialtyInfo.color}18`, border: `1px solid ${specialtyInfo.color}40`,
              borderRadius: 20, padding: '4px 14px', marginBottom: 14,
              fontSize: 13, fontWeight: 700, color: specialtyInfo.color,
            }}>
              {specialtyInfo.icon} {specialtyInfo.shortLabel}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>CAOSCE Review</div>
          <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1, fontFamily: H }}>
            {result.scorePercent}%
          </div>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 20px' }}>
            {result.totalCorrect} / {result.totalQuestions} correct across {merged.length} case{merged.length !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📅 {formatDate(result.createdAt)}</div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/caosce/history')}>📜 My CAOSCE Results</button>
          <button className="btn btn-primary" onClick={() => navigate('/caosce')}>🩺 Practice Another Case</button>
        </div>

        {/* Per-case review */}
        {merged.map((c, ci) => (
          <CaseReview key={c.caseId || ci} c={c} index={ci} total={merged.length} />
        ))}

      </div>
    </div>
  );
}

function CaseReview({ c, index, total }) {
  const procedures = c.procedures || [];
  const cbtQuestions = c.cbtQuestions || [];
  const tickedIds = new Set(c.tickedProcedureIds || []);
  const cbtAnswers = c.cbtAnswers || {};
  const noContent = procedures.length === 0 && cbtQuestions.length === 0 && !c.scenario;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', fontFamily: H }}>
          {total > 1 ? `Case ${index + 1} of ${total} — ` : ''}{c.title || c.topic || 'Case'}{c.year ? ` · ${c.year}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: 'var(--text-muted)', fontFamily: F }}>
          <span>✅ Procedures: <strong style={{ color: 'var(--text-primary)' }}>{c.procedureCorrect}/{c.procedureTotal}</strong></span>
          <span>📝 CBT: <strong style={{ color: 'var(--text-primary)' }}>{c.cbtCorrect}/{c.cbtTotal}</strong></span>
        </div>
      </div>

      {noContent && (
        <div style={S.emptyState}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            Score recorded — case details unavailable
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            This case may have since been edited or removed, so the original scenario and
            questions can no longer be shown, but your score above is preserved.
          </p>
        </div>
      )}

      {c.scenario && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 16, border: '1.5px solid rgba(13,148,136,0.3)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            🩺 Scenario
          </div>
          <div style={{ fontFamily: F, fontSize: 14.5, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {c.scenario}
          </div>
        </div>
      )}

      {procedures.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 10 }}>
            ✅ Procedure Checklist
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {procedures.map(p => {
              const wasTicked = tickedIds.has(p.id);
              const shouldTick = !!p.isRequired;
              const isCorrect = wasTicked === shouldTick;
              const borderColor = isCorrect ? 'rgba(22,163,74,0.4)' : 'rgba(239,68,68,0.4)';
              const bg = isCorrect ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)';
              return (
                <div key={p.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '11px 14px', borderRadius: 10, fontFamily: F,
                  border: `1.5px solid ${borderColor}`, background: bg,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{isCorrect ? '✅' : '❌'}</span>
                    <span style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>{p.text}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', paddingLeft: 24 }}>
                    You {wasTicked ? 'ticked this' : "didn't tick this"}
                    {!isCorrect && (
                      <> — correct: should {shouldTick ? 'be ticked (perform this step)' : 'be left unticked (not part of this case)'}</>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cbtQuestions.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 10 }}>
            📝 CBT Questions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {cbtQuestions.map((q, qi) => {
              const userAns = cbtAnswers[q.id];
              const isAnswered = userAns !== undefined;
              const isCorrect = userAns === q.correctIndex;
              return (
                <div key={q.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: 18,
                  borderLeft: `4px solid ${isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B'}`,
                }}>
                  <p style={{
                    margin: '0 0 12px', fontWeight: 700, fontSize: 14,
                    color: 'var(--text-primary)', lineHeight: 1.6, fontFamily: F,
                  }}>
                    {qi + 1}. {q.question}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {(q.options || []).map((opt, oi) => {
                      const isUser = userAns === oi;
                      const isCorrectOpt = q.correctIndex === oi;
                      let bg = 'var(--bg-tertiary)', color = 'var(--text-secondary)', border = 'var(--border)';
                      if (isCorrectOpt)            { bg = 'rgba(22,163,74,0.12)'; color = '#16A34A'; border = 'rgba(22,163,74,0.4)'; }
                      if (isUser && !isCorrectOpt) { bg = 'rgba(239,68,68,0.12)'; color = '#EF4444'; border = 'rgba(239,68,68,0.4)'; }
                      return (
                        <div key={oi} style={{
                          padding: '9px 13px', borderRadius: 8, fontSize: 13.5,
                          background: bg, color, border: `1px solid ${border}`,
                          fontWeight: isCorrectOpt || isUser ? 700 : 400,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            background: isCorrectOpt ? '#16A34A' : isUser ? '#EF4444' : 'var(--bg-card)',
                            color: isCorrectOpt || isUser ? '#fff' : 'var(--text-muted)',
                            fontSize: 10.5, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px solid ${border}`,
                          }}>{String.fromCharCode(65 + oi)}</span>
                          {opt}
                          {isCorrectOpt && <span style={{ marginLeft: 'auto' }}>✓</span>}
                          {isUser && !isCorrectOpt && <span style={{ marginLeft: 'auto' }}>✗</span>}
                        </div>
                      );
                    })}
                  </div>
                  {!isAnswered && (
                    <div style={{
                      fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8,
                      padding: '4px 10px', background: 'rgba(100,116,139,0.08)',
                      borderRadius: 6, display: 'inline-block',
                    }}>⚪ Not answered</div>
                  )}
                  {q.explanation && (
                    <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <ExplanationText text={q.explanation} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  center: {
    display: 'flex', flexDirection: 'column',
    justifyContent: 'center', alignItems: 'center',
    minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px',
  },
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--teal)', fontWeight: 700, fontSize: 13,
    padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
  },
  emptyState: {
    textAlign: 'center', padding: '32px 20px',
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
    marginBottom: 16,
  },
};
