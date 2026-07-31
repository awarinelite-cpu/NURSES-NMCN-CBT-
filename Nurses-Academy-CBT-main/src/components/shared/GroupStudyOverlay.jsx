// src/components/shared/GroupStudyOverlay.jsx
//
// Renders on top of GroupChatPage while call.study is set. It never
// navigates anywhere — GroupCallBar (and the Agora connection it holds)
// stays mounted underneath the whole time, so the call itself is never
// interrupted by starting, finishing, or exiting a synced study.
//
// Reading Mode: everyone sees the same question. Host taps "Show Answer",
// which reveals the correct option + explanation to everyone at once. Host
// taps "Next" to move on.
//
// Quiz Mode: everyone picks their own option privately. The moment every
// participant currently on the call has answered, a results card appears
// for everyone showing the correct answer, the % who got it right, the %
// who got it wrong, and — tap either percentage — the names behind it.
// After the last question, everyone is walked through a synced review.

import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, documentId, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import ExplanationText from './ExplanationText';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function NameChip({ n, correct }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
      borderRadius: 20, background: correct ? 'rgba(22,163,74,0.14)' : 'rgba(239,68,68,0.12)',
      border: `1px solid ${correct ? 'rgba(22,163,74,0.4)' : 'rgba(239,68,68,0.35)'}`,
      fontSize: 12, fontWeight: 700, color: '#E9EDEF',
    }}>
      <span>{correct ? '✅' : '❌'}</span>{n}
    </div>
  );
}

export default function GroupStudyOverlay({ groupId, uid, isHost, study, participants, responses, actions, onExit }) {
  const { mode, examName, questionIds = [], currentIndex, revealed, status } = study;
  const [questionsById, setQuestionsById] = useState({});
  const [loadingQs, setLoadingQs] = useState(true);
  const [expanded, setExpanded] = useState(null); // null | 'correct' | 'wrong'
  const fetchedFor = useRef('');

  /* ── Fetch all questions in this study once, by id ── */
  useEffect(() => {
    const key = questionIds.join(',');
    if (!key || fetchedFor.current === key) return;
    fetchedFor.current = key;
    setLoadingQs(true);
    (async () => {
      const byId = {};
      const chunks = chunk(questionIds, 10);
      const snaps = await Promise.all(chunks.map(ch => getDocs(query(
        collection(db, 'questions'), where(documentId(), 'in', ch),
      ))));
      snaps.forEach(s => s.docs.forEach(d => { byId[d.id] = { id: d.id, ...d.data() }; }));
      setQuestionsById(byId);
      setLoadingQs(false);
    })().catch(() => setLoadingQs(false));
  }, [questionIds]);

  useEffect(() => { setExpanded(null); }, [currentIndex, status]);

  const total = questionIds.length;
  const q = questionsById[questionIds[currentIndex]];

  const answersForCurrent = useMemo(
    () => responses.filter(r => r.questionIndex === currentIndex),
    [responses, currentIndex],
  );
  const myAnswer = answersForCurrent.find(r => r.uid === uid);
  const answeredCount = answersForCurrent.length;
  const totalParticipants = Math.max(participants.length, 1);
  const allAnswered = answeredCount >= totalParticipants;

  const correctIdx = q?.correctIndex;
  const correctList = answersForCurrent.filter(r => r.choice === correctIdx);
  const wrongList    = answersForCurrent.filter(r => r.choice !== correctIdx);
  const correctPct = answeredCount ? Math.round((correctList.length / answeredCount) * 100) : 0;
  const wrongPct   = answeredCount ? 100 - correctPct : 0;

  const isLast = currentIndex >= total - 1;
  const isReviewing = status === 'reviewing';
  const isEnded = status === 'ended';

  const headerBadge = mode === 'quiz' ? '⚡ Quiz Mode' : '📖 Reading Mode';

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60, background: '#0B141A',
      display: 'flex', flexDirection: 'column', fontFamily: F, color: '#E9EDEF',
    }}>
      {/* ── Header ── */}
      <div style={{
        background: '#1F2C34', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14 }}>
            {isReviewing ? '🧾 Reviewing Together' : isEnded ? '✅ Session Complete' : headerBadge}
          </div>
          <div style={{ fontSize: 11.5, color: '#8696A0', marginTop: 1 }}>
            {examName} {!isEnded && total ? `· Q${Math.min(currentIndex + 1, total)} of ${total}` : ''}
          </div>
        </div>
        {isHost && !isEnded && (
          <button onClick={actions.endStudy} className="btn btn-sm" style={{
            background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)',
            color: '#EF4444', borderRadius: 10, padding: '7px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>End Study</button>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 100px' }}>
        {isEnded ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Great work, everyone!</div>
            <div style={{ fontSize: 13.5, color: '#8696A0', marginBottom: 24 }}>
              You covered {total} question{total !== 1 ? 's' : ''} on {examName} together.
            </div>
            {isHost ? (
              <button onClick={actions.endStudy} className="btn btn-primary" style={{ padding: '12px 28px', borderRadius: 12, fontWeight: 700 }}>
                Return to Group Chat
              </button>
            ) : (
              <div style={{ fontSize: 12.5, color: '#8696A0' }}>Waiting for the host to close the session…</div>
            )}
          </div>
        ) : loadingQs || !q ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(13,148,136,0.2)', borderTopColor: '#0D9488', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{
              background: 'var(--bg-card, #1F2C34)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: 18, marginBottom: 16,
            }}>
              <p style={{ margin: '0 0 14px', fontWeight: 700, fontSize: 15.5, lineHeight: 1.6 }}>{q.question}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {(q.options || []).map((opt, i) => {
                  const isCorrectOpt = i === correctIdx;
                  const isMine = myAnswer?.choice === i;

                  // Reading mode + reveal, or reviewing: show correctness once revealed.
                  const showCorrectness = (mode === 'reading' && revealed) || isReviewing;

                  let bg = 'rgba(255,255,255,0.03)', border = '1.5px solid rgba(255,255,255,0.08)';
                  if (showCorrectness && isCorrectOpt) { bg = 'rgba(22,163,74,0.14)'; border = '1.5px solid #16A34A'; }
                  else if (mode === 'quiz' && !isReviewing && isMine) { bg = 'rgba(13,148,136,0.14)'; border = '1.5px solid #0D9488'; }

                  const clickable = mode === 'quiz' && !isReviewing && !myAnswer;

                  return (
                    <button
                      key={i}
                      disabled={!clickable}
                      onClick={() => clickable && actions.submitQuizAnswer(currentIndex, i)}
                      style={{
                        textAlign: 'left', padding: '11px 13px', borderRadius: 11, background: bg, border,
                        color: '#E9EDEF', fontSize: 14, lineHeight: 1.5, cursor: clickable ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                      }}
                    >
                      <span style={{ fontWeight: 800, opacity: 0.6 }}>{String.fromCharCode(65 + i)}.</span>
                      <span style={{ flex: 1 }}>{opt}</span>
                      {showCorrectness && isCorrectOpt && <span>✅</span>}
                      {mode === 'quiz' && !isReviewing && isMine && !showCorrectness && <span>👆</span>}
                    </button>
                  );
                })}
              </div>

              {/* Explanation, shown once the answer is known */}
              {((mode === 'reading' && revealed) || isReviewing) && q.explanation && (
                <div style={{ marginTop: 14, padding: 12, background: 'rgba(13,148,136,0.08)', borderRadius: 10, borderLeft: '3px solid #0D9488' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#2DD4BF', marginBottom: 4 }}>EXPLANATION</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: '#D1D9DE' }}>
                    <ExplanationText text={q.explanation} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Quiz mode: waiting / results card ── */}
            {mode === 'quiz' && !isReviewing && (
              myAnswer && !allAnswered ? (
                <div style={{ textAlign: 'center', fontSize: 13, color: '#8696A0', padding: '10px 0' }}>
                  Waiting for others… {answeredCount}/{totalParticipants} answered
                </div>
              ) : allAnswered ? (
                <div style={{
                  background: '#1F2C34', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 16,
                  padding: 16, marginTop: 4,
                }}>
                  <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, marginBottom: 10 }}>
                    Correct answer: {String.fromCharCode(65 + correctIdx)}. {q.options?.[correctIdx]}
                  </div>

                  <button onClick={() => setExpanded(v => v === 'correct' ? null : 'correct')} style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#16A34A',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>✅ Got it right</span>
                    <span style={{ fontWeight: 900, fontSize: 15 }}>{correctPct}%</span>
                  </button>
                  {expanded === 'correct' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 4px 8px' }}>
                      {correctList.length ? correctList.map(r => <NameChip key={r.uid} n={r.name} correct />) : (
                        <span style={{ fontSize: 12, color: '#8696A0' }}>Nobody yet.</span>
                      )}
                    </div>
                  )}

                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />

                  <button onClick={() => setExpanded(v => v === 'wrong' ? null : 'wrong')} style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#EF4444',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>❌ Got it wrong</span>
                    <span style={{ fontWeight: 900, fontSize: 15 }}>{wrongPct}%</span>
                  </button>
                  {expanded === 'wrong' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 4px 4px' }}>
                      {wrongList.length ? wrongList.map(r => (
                        <NameChip key={r.uid} n={`${r.name} (${String.fromCharCode(65 + r.choice)})`} correct={false} />
                      )) : (
                        <span style={{ fontSize: 12, color: '#8696A0' }}>Nobody — great job!</span>
                      )}
                    </div>
                  )}
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* ── Footer controls ── */}
      {!isEnded && !loadingQs && q && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, background: '#1F2C34',
          borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', display: 'flex',
          gap: 10, justifyContent: 'center',
        }}>
          {isHost ? (
            <>
              {isReviewing && currentIndex > 0 && (
                <button onClick={actions.prevQuestion} className="btn btn-ghost" style={{ padding: '11px 18px', borderRadius: 12 }}>← Prev</button>
              )}
              {mode === 'reading' && !revealed && (
                <button onClick={actions.revealAnswer} className="btn btn-primary" style={{ padding: '11px 26px', borderRadius: 12, fontWeight: 700 }}>
                  Show the Answer
                </button>
              )}
              {mode === 'reading' && revealed && (
                <button onClick={actions.nextQuestion} className="btn btn-primary" style={{ padding: '11px 26px', borderRadius: 12, fontWeight: 700 }}>
                  {isLast ? 'Finish' : 'Next Question →'}
                </button>
              )}
              {mode === 'quiz' && !isReviewing && allAnswered && (
                <button onClick={actions.nextQuestion} className="btn btn-primary" style={{ padding: '11px 26px', borderRadius: 12, fontWeight: 700 }}>
                  {isLast ? 'Finish & Review Together →' : 'Next Question →'}
                </button>
              )}
              {isReviewing && (
                <button onClick={isLast ? actions.endStudy : actions.nextQuestion} className="btn btn-primary" style={{ padding: '11px 26px', borderRadius: 12, fontWeight: 700 }}>
                  {isLast ? 'Finish Review' : 'Next →'}
                </button>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: '#8696A0', padding: '11px 0' }}>
              {mode === 'reading' && !revealed && 'Waiting for host to reveal the answer…'}
              {mode === 'reading' && revealed && 'Waiting for host to continue…'}
              {mode === 'quiz' && !isReviewing && !myAnswer && 'Pick your answer above.'}
              {mode === 'quiz' && !isReviewing && myAnswer && allAnswered && 'Waiting for host to continue…'}
              {isReviewing && 'Waiting for host to continue…'}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
