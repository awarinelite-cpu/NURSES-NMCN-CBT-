// src/components/entrance/EntranceExamReviewPage.jsx
// Route: /entrance-exam/review
//
// Standalone review page for ALL entrance-exam attempt types (Daily Mock,
// School Exam, Subject Drill) — shows every question in one scrollable list
// with correct/incorrect highlighting, a filter bar (All / Wrong / Correct /
// Skipped), and an AI-explain button per question.
//
// This mirrors the conventions of src/components/exam/ExamReviewPage.jsx
// (and CaosceReviewPage.jsx) so that review mode feels identical across the
// whole platform — replacing the old one-question-at-a-time reviewMode that
// used to live inside EntranceExamSession / EntranceSubjectSession.
//
// Two ways to reach this page:
//   1. Straight from a just-finished attempt — location.state carries the
//      questions + answers already in memory, so no extra Firestore reads
//      are needed for an instant review.
//   2. From a history list (Daily Mock hub, School exam setup, My Results)
//      — only a resultId (+ kind) is available, so we fetch the saved
//      session/drill doc and then the original entranceExamQuestions docs.
//
// location.state / searchParams:
//   resultId — Firestore doc id of the saved attempt
//   kind     — 'session' (entranceExamSessions, root collection — daily
//              mock + school exam) or 'drill' (users/{uid}/entranceSubjectDrills)
//   session  — optional: full session/drill doc already in memory (fast path)
//   questions — optional: full question docs already in memory (fast path)

import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  doc, getDoc, collection, getDocs, query, where, documentId,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import ItalicText from '../shared/ItalicText';
import ExplanationText from '../shared/ExplanationText';
import AiExplainButton from '../shared/AiExplainButton';

const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

export default function EntranceExamReviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [searchParams] = useSearchParams();

  const resultId = state?.resultId || searchParams.get('resultId') || '';
  const kind      = state?.kind      || searchParams.get('kind')      || 'session'; // 'session' | 'drill'

  const [session,   setSession]   = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [reviewFilter, setReviewFilter] = useState('all'); // 'all' | 'wrong' | 'correct' | 'unanswered'

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        // ── Fast path: attempt just finished, everything already in memory ──
        if (state?.session && state?.questions?.length) {
          setSession(state.session);
          setQuestions(state.questions);
          setLoading(false);
          return;
        }

        if (!resultId) {
          setError('No exam result specified.');
          setLoading(false);
          return;
        }
        if (!user?.uid) { setLoading(false); return; }

        // ── Fetch path: revisiting from history ──────────────────────────
        const docRef = kind === 'drill'
          ? doc(db, 'users', user.uid, 'entranceSubjectDrills', resultId)
          : doc(db, 'entranceExamSessions', resultId);

        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          setError('This exam result could not be found. It may have been deleted.');
          setLoading(false);
          return;
        }
        const data = snap.data();
        if (kind !== 'drill' && data.userId && data.userId !== user.uid) {
          setError('You do not have permission to view this result.');
          setLoading(false);
          return;
        }
        setSession({ id: snap.id, ...data });

        const questionIds = data.questionIds || [];
        if (questionIds.length === 0) {
          setLoading(false);
          return;
        }

        const allQs = [];
        for (let i = 0; i < questionIds.length; i += 30) {
          const chunk = questionIds.slice(i, i + 30);
          try {
            const qSnap = await getDocs(
              query(collection(db, 'entranceExamQuestions'), where(documentId(), 'in', chunk))
            );
            qSnap.docs.forEach(d => allQs.push({ id: d.id, ...d.data() }));
          } catch (e) { console.warn('entranceExamQuestions fetch failed:', e); }
        }
        allQs.sort((a, b) => questionIds.indexOf(a.id) - questionIds.indexOf(b.id));
        setQuestions(allQs);
      } catch (e) {
        console.error('EntranceExamReviewPage load error:', e);
        setError('Failed to load review. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultId, kind, user?.uid]);

  const answers      = session?.answers || {};
  const score        = session?.correct ?? session?.score != null
    ? (session?.correct ?? questions.filter(q => answers[q.id] === q.correctAnswer).length)
    : questions.filter(q => answers[q.id] === q.correctAnswer).length;
  const total        = session?.totalQuestions ?? questions.length;
  const scorePercent = session?.scorePercent ?? session?.score ?? (total > 0 ? Math.round((score / total) * 100) : 0);
  const passed       = scorePercent >= 50;
  const scoreColor   = scorePercent >= 70 ? '#16A34A' : scorePercent >= 50 ? '#D97706' : '#DC2626';

  const wrongCount      = questions.filter(q => { const a = answers[q.id]; return a && a !== q.correctAnswer; }).length;
  const unansweredCount = questions.filter(q => !answers[q.id]).length;

  const filteredQuestions = questions.filter(q => {
    const userAns   = answers[q.id];
    const answered  = !!userAns;
    const isCorrect = answered && userAns === q.correctAnswer;
    if (reviewFilter === 'wrong')      return answered && !isCorrect;
    if (reviewFilter === 'correct')    return isCorrect;
    if (reviewFilter === 'unanswered') return !answered;
    return true;
  });

  const backRoute = kind === 'drill' ? '/entrance-exam/my-results' : '/entrance-exam/my-results';

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

  if (error || !session) return (
    <div style={S.center}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 8, fontFamily: H }}>Review Unavailable</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontFamily: F, fontWeight: 700 }}>{error || 'This result could not be found.'}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate('/entrance-exam/my-results')}>← My Results</button>
          <button className="btn btn-ghost" onClick={() => navigate('/entrance-exam')}>Entrance Exam Home</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px 16px', fontFamily: F }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(backRoute))} style={S.backBtn}>
          ← Back
        </button>

        {/* Score card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 20, padding: 28, marginBottom: 24, textAlign: 'center',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.3)',
            borderRadius: 20, padding: '4px 14px', marginBottom: 14,
            fontSize: 13, fontWeight: 700, color: 'var(--teal)',
          }}>
            {kind === 'drill' ? '📚' : '🎓'} {session.examName || session.subject || (kind === 'drill' ? 'Subject Drill' : 'Entrance Exam')}
          </div>
          <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1, fontFamily: H }}>
            {scorePercent}%
          </div>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 6px' }}>
            {session.correct ?? score} / {total} correct
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: scoreColor, textTransform: 'uppercase', marginBottom: 16 }}>
            {passed ? '✓ PASS' : '✗ FAIL'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Correct',   value: session.correct ?? score,       color: '#16A34A' },
              { label: 'Wrong',     value: wrongCount,                     color: '#EF4444' },
              { label: 'Skipped',   value: unansweredCount,                color: '#F59E0B' },
              { label: 'Questions', value: total,                          color: 'var(--text-muted)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: H }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            📅 {formatDate(session.completedAt || session.createdAt)}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/entrance-exam/my-results')}>
            📋 My Results
          </button>
          {kind === 'drill' ? (
            <button className="btn btn-primary" onClick={() => navigate('/entrance-exam/subject-drill')}>
              🔄 Drill Again
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => navigate('/entrance-exam/daily-mock')}>
              🔄 Take New Exam
            </button>
          )}
        </div>

        {/* Review filter bar */}
        {questions.length > 0 && (
          <div style={{
            display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '12px 16px',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, alignSelf: 'center', marginRight: 4 }}>
              Filter:
            </span>
            {[
              { key: 'all',        label: `All (${questions.length})`,          color: 'var(--text-muted)' },
              { key: 'wrong',      label: `❌ Wrong (${wrongCount})`,            color: '#EF4444' },
              { key: 'correct',    label: `✅ Correct (${session.correct ?? score})`, color: '#16A34A' },
              { key: 'unanswered', label: `⚪ Skipped (${unansweredCount})`,      color: '#64748B' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setReviewFilter(f.key)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 12, fontFamily: F,
                  background: reviewFilter === f.key ? f.color + '22' : 'transparent',
                  color: reviewFilter === f.key ? f.color : 'var(--text-muted)',
                  outline: reviewFilter === f.key ? `1.5px solid ${f.color}` : '1.5px solid transparent',
                  transition: 'all .15s',
                }}
              >{f.label}</button>
            ))}
          </div>
        )}

        {/* Questions */}
        {questions.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Score recorded — question breakdown unavailable
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 340, margin: '0 auto' }}>
              Your score of <strong style={{ color: scoreColor }}>{scorePercent}%</strong> has been saved,
              but individual question details aren't available for this attempt.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredQuestions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {reviewFilter === 'wrong' ? 'No wrong answers — great work!' : 'Nothing to show here.'}
                </div>
              </div>
            )}
            {filteredQuestions.map((q, i) => {
              const userAns    = answers[q.id];
              const isCorrect  = userAns === q.correctAnswer;
              const isAnswered = !!userAns;
              const qNumber    = questions.indexOf(q) + 1;

              return (
                <div key={q.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: 20,
                  borderLeft: `4px solid ${isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B'}`,
                }}>
                  <div style={{ marginBottom: 14 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: isCorrect ? '#16A34A' : isAnswered ? '#EF4444' : '#64748B',
                      color: '#fff', fontWeight: 800, fontSize: 12, fontFamily: H,
                      marginBottom: 10,
                    }}>{qNumber}</span>
                    {q.diagramUrl && (
                      <div style={{ marginBottom: 12, textAlign: 'center' }}>
                        <img src={q.diagramUrl} alt="Diagram" style={{ maxWidth: '100%', borderRadius: 10, border: '1px solid var(--border)' }} onError={e => { e.target.style.display = 'none'; }} />
                      </div>
                    )}
                    <p style={{
                      margin: 0, fontWeight: 700, fontSize: 15,
                      color: 'var(--text-primary)', lineHeight: 1.6,
                      textAlign: 'justify', width: '100%',
                      fontFamily: F,
                    }}>
                      <ItalicText text={q.questionText || q.question} />
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {OPTION_KEYS.map(key => {
                      const text = q.options?.[key]; if (!text) return null;
                      const isUser       = userAns === key;
                      const isCorrectOpt = q.correctAnswer === key;
                      let bg = 'var(--bg-tertiary)', color = 'var(--text-secondary)', border = 'var(--border)';
                      if (isCorrectOpt)            { bg = 'rgba(22,163,74,0.12)';  color = '#16A34A'; border = 'rgba(22,163,74,0.4)'; }
                      if (isUser && !isCorrectOpt) { bg = 'rgba(239,68,68,0.12)'; color = '#EF4444'; border = 'rgba(239,68,68,0.4)'; }
                      return (
                        <div key={key} style={{
                          padding: '10px 14px', borderRadius: 8, fontSize: 14,
                          background: bg, color, border: `1px solid ${border}`,
                          fontWeight: isCorrectOpt || isUser ? 700 : 400,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: isCorrectOpt ? '#16A34A' : isUser ? '#EF4444' : 'var(--bg-card)',
                            color: isCorrectOpt || isUser ? '#fff' : 'var(--text-muted)',
                            fontSize: 11, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px solid ${border}`,
                          }}>{key}</span>
                          <ItalicText text={text} />
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
                    <div style={{ marginBottom: 8, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <ExplanationText text={q.explanation} />
                    </div>
                  )}

                  <AiExplainButton q={q} collection="entranceExamQuestions" />
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(backRoute))}>
            ← Back to My Results
          </button>
        </div>
      </div>
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
    textAlign: 'center', padding: '40px 24px',
    color: 'var(--text-muted)', fontSize: 14,
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
  },
};
