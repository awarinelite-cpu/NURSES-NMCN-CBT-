import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import {
  collection, doc, getDoc, getDocs, query, orderBy,
  limit, deleteDoc, where, Timestamp
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

// ─── shared helpers ────────────────────────────────────────────────────────────
const fmt = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
};
const pct = (score, total) => (total > 0 ? Math.round((score / total) * 100) : 0);
const grade = (p) => p >= 80 ? 'Excellent' : p >= 60 ? 'Good' : p >= 45 ? 'Average' : 'Poor';
const gradeColor = (p) => p >= 80 ? '#22c55e' : p >= 60 ? '#3b82f6' : p >= 45 ? '#f59e0b' : '#ef4444';

const Spinner = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
    <div style={{
      width: 40, height: 40, border: '3px solid #e2e8f0',
      borderTopColor: '#6366f1', borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const EmptyState = ({ icon, title, sub, action, onAction }) => (
  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
    <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
    <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: 18 }}>{title}</h3>
    <p style={{ color: '#64748b', margin: '0 0 20px', fontSize: 14 }}>{sub}</p>
    {action && (
      <button onClick={onAction} style={{
        padding: '10px 24px', background: '#6366f1', color: '#fff',
        border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600
      }}>{action}</button>
    )}
  </div>
);

const PageShell = ({ title, subtitle, back, children }) => {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16
      }}>
        <button onClick={() => navigate(back || '/entrance-exam')} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 20,
          color: '#64748b', padding: 4, lineHeight: 1
        }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{title}</h1>
          {subtitle && <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </div>
    </div>
  );
};

// ─── EntranceMyResults ─────────────────────────────────────────────────────────
export function EntranceMyResults() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const cols = ['entranceDailyMock', 'entranceSubjectDrills'];
        const all = [];
        for (const col of cols) {
          const snap = await getDocs(
            query(collection(db, 'users', user.uid, col), orderBy('completedAt', 'desc'), limit(50))
          );
          snap.forEach(d => all.push({ id: d.id, col, ...d.data() }));
        }
        all.sort((a, b) => {
          const ta = a.completedAt?.toMillis?.() || 0;
          const tb = b.completedAt?.toMillis?.() || 0;
          return tb - ta;
        });
        setAttempts(all);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  return (
    <PageShell title="My Results" subtitle="All your exam attempts">
      {loading ? <Spinner /> : attempts.length === 0 ? (
        <EmptyState icon="📋" title="No attempts yet"
          sub="Complete a daily mock or subject drill to see results here."
          action="Start Daily Mock" onAction={() => navigate('/entrance-exam/daily-mock')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {attempts.map(a => {
            const p = pct(a.score ?? 0, a.total ?? a.questions?.length ?? 1);
            const isOpen = expanded === a.id;
            return (
              <div key={a.id} style={{
                background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
                overflow: 'hidden', transition: 'box-shadow 0.2s'
              }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '16px 20px', cursor: 'pointer'
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: gradeColor(p) + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800, color: gradeColor(p), flexShrink: 0
                  }}>{p}%</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
                      {a.col === 'entranceDailyMock' ? `Daily Mock — ${fmt(a.completedAt)}` : `${a.subject || 'Subject Drill'} — ${fmt(a.completedAt)}`}
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {a.score ?? 0}/{a.total ?? a.questions?.length ?? '?'} correct · {grade(p)}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, color: '#94a3b8', transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>▼</div>
                </div>
                {isOpen && a.questions && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px', background: '#fafafa' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {a.questions.map((q, i) => {
                        const userAns = a.answers?.[q.id] ?? a.answers?.[i];
                        const correct = userAns === q.answer;
                        return (
                          <div key={q.id || i} style={{
                            background: '#fff', border: `1px solid ${correct ? '#bbf7d0' : '#fecaca'}`,
                            borderRadius: 8, padding: '12px 16px'
                          }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <span style={{ fontSize: 16 }}>{correct ? '✅' : '❌'}</span>
                              <div style={{ flex: 1 }}>
                                <p style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b', fontWeight: 500 }}>
                                  {i + 1}. {q.question}
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {(q.options || []).map((opt, oi) => {
                                    const letter = String.fromCharCode(65 + oi);
                                    const isCorrect = letter === q.answer;
                                    const isUser = letter === userAns;
                                    return (
                                      <span key={oi} style={{
                                        padding: '4px 10px', borderRadius: 6, fontSize: 13,
                                        background: isCorrect ? '#dcfce7' : isUser && !correct ? '#fee2e2' : '#f1f5f9',
                                        color: isCorrect ? '#166534' : isUser && !correct ? '#991b1b' : '#475569',
                                        fontWeight: isCorrect || isUser ? 600 : 400,
                                        border: isCorrect ? '1px solid #86efac' : isUser && !correct ? '1px solid #fca5a5' : '1px solid transparent'
                                      }}>{letter}. {opt}</span>
                                    );
                                  })}
                                </div>
                                {!correct && (
                                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                                    ✓ Correct answer: <strong>{q.answer}</strong>
                                    {q.explanation ? ` — ${q.explanation}` : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

// ─── EntranceExamsTaken ────────────────────────────────────────────────────────
export function EntranceExamsTaken() {
  return <EntranceMyResults />;
}

// ─── EntranceBookmarks ─────────────────────────────────────────────────────────
export function EntranceBookmarks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'users', user.uid, 'entranceBookmarks'), orderBy('savedAt', 'desc'))
      );
      setBookmarks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'entranceBookmarks', id));
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <PageShell title="Bookmarks" subtitle="Questions you saved for review">
      {loading ? <Spinner /> : bookmarks.length === 0 ? (
        <EmptyState icon="🔖" title="No bookmarks yet"
          sub="Flag questions during exams to save them here for later review."
          action="Take a Mock Exam" onAction={() => navigate('/entrance-exam/daily-mock')} />
      ) : (
        <div>
          <div style={{ marginBottom: 16, fontSize: 14, color: '#64748b' }}>
            {bookmarks.length} saved question{bookmarks.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {bookmarks.map((b, i) => (
              <div key={b.id} style={{
                background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      {b.subject && (
                        <span style={{
                          background: '#ede9fe', color: '#7c3aed', padding: '2px 10px',
                          borderRadius: 20, fontSize: 12, fontWeight: 600
                        }}>{b.subject}</span>
                      )}
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>Saved {fmt(b.savedAt)}</span>
                    </div>
                    <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
                      {i + 1}. {b.question}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(b.options || []).map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi);
                        const isAns = letter === b.answer;
                        return (
                          <div key={oi} style={{
                            padding: '8px 14px', borderRadius: 8, fontSize: 14,
                            background: isAns ? '#dcfce7' : '#f8fafc',
                            border: isAns ? '1px solid #86efac' : '1px solid #e2e8f0',
                            color: isAns ? '#166534' : '#374151',
                            fontWeight: isAns ? 600 : 400,
                            display: 'flex', gap: 10, alignItems: 'center'
                          }}>
                            {isAns && <span style={{ fontSize: 12 }}>✓</span>}
                            <span>{letter}. {opt}</span>
                          </div>
                        );
                      })}
                    </div>
                    {b.explanation && (
                      <div style={{
                        marginTop: 12, padding: '10px 14px', background: '#fffbeb',
                        border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e'
                      }}>
                        💡 {b.explanation}
                      </div>
                    )}
                  </div>
                  <button onClick={() => remove(b.id)} style={{
                    background: '#fee2e2', border: 'none', color: '#dc2626',
                    borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, flexShrink: 0
                  }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ─── EntranceAnalysis ──────────────────────────────────────────────────────────
export function EntranceAnalysis() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users', user.uid, 'entranceDailyMock'), orderBy('completedAt', 'desc'), limit(30))
        );
        const attempts = snap.docs.map(d => d.data());

        // subject breakdown
        const subjectMap = {};
        const scores = [];
        const last7 = attempts.slice(0, 7).reverse();

        attempts.forEach(a => {
          scores.push(pct(a.score ?? 0, a.total ?? 1));
          (a.subjectBreakdown || []).forEach(sb => {
            if (!subjectMap[sb.subject]) subjectMap[sb.subject] = { correct: 0, total: 0 };
            subjectMap[sb.subject].correct += sb.correct || 0;
            subjectMap[sb.subject].total += sb.total || 0;
          });
        });

        const avg = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
        const best = scores.length ? Math.max(...scores) : 0;
        const trend = scores.slice(0, 5);

        setData({ attempts, subjectMap, avg, best, trend, last7, total: attempts.length });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) return <PageShell title="Analysis"><Spinner /></PageShell>;

  if (!data || data.total === 0) return (
    <PageShell title="Analysis" subtitle="Your performance trends">
      <EmptyState icon="📊" title="No data yet"
        sub="Complete some daily mocks to unlock your performance analysis."
        action="Start Daily Mock" onAction={() => navigate('/entrance-exam/daily-mock')} />
    </PageShell>
  );

  const subjects = Object.entries(data.subjectMap)
    .map(([name, v]) => ({ name, pct: pct(v.correct, v.total), correct: v.correct, total: v.total }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <PageShell title="Analysis" subtitle="Your performance trends">
      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Exams Taken', value: data.total, icon: '📝' },
          { label: 'Average Score', value: `${data.avg}%`, icon: '📈' },
          { label: 'Best Score', value: `${data.best}%`, icon: '🏆' },
          { label: 'Grade', value: grade(data.avg), icon: '🎯' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
            padding: '20px', textAlign: 'center'
          }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* score trend */}
      {data.last7.length > 1 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Recent Score Trend</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {data.last7.map((a, i) => {
              const p = pct(a.score ?? 0, a.total ?? 1);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{p}%</span>
                  <div style={{
                    width: '100%', height: `${p}px`, minHeight: 4,
                    background: gradeColor(p), borderRadius: '4px 4px 0 0',
                    transition: 'height 0.5s ease'
                  }} />
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>
                    {a.completedAt?.toDate?.()?.toLocaleDateString('en', { month: 'numeric', day: 'numeric' }) || '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* subject breakdown */}
      {subjects.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Subject Performance</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {subjects.map(s => (
              <div key={s.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{s.name}</span>
                  <span style={{ fontSize: 13, color: gradeColor(s.pct), fontWeight: 700 }}>
                    {s.pct}% ({s.correct}/{s.total})
                  </span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${s.pct}%`, background: gradeColor(s.pct),
                    borderRadius: 4, transition: 'width 0.8s ease'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ─── EntranceLeaderboard ───────────────────────────────────────────────────────
export function EntranceLeaderboard() {
  const { user } = useAuth();
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('week');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cutoff = new Date();
        if (filter === 'week') cutoff.setDate(cutoff.getDate() - 7);
        else if (filter === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
        else cutoff.setFullYear(2000);

        const usersSnap = await getDocs(collection(db, 'users'));
        const rows = [];
        await Promise.all(usersSnap.docs.map(async (uDoc) => {
          try {
            const q = query(
              collection(db, 'users', uDoc.id, 'entranceDailyMock'),
              where('completedAt', '>=', Timestamp.fromDate(cutoff)),
              orderBy('completedAt', 'desc')
            );
            const snap = await getDocs(q);
            if (snap.empty) return;
            const scores = snap.docs.map(d => {
              const data = d.data();
              return pct(data.score ?? 0, data.total ?? 1);
            });
            const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
            const uData = uDoc.data();
            rows.push({
              uid: uDoc.id,
              name: uData.displayName || uData.name || 'Student',
              avatar: uData.photoURL || null,
              avg,
              count: scores.length,
              best: Math.max(...scores),
            });
          } catch (_) {}
        }));
        rows.sort((a, b) => b.avg - a.avg || b.count - a.count);
        setBoard(rows.slice(0, 50));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [filter]);

  const myRank = board.findIndex(r => r.uid === user?.uid) + 1;

  return (
    <PageShell title="Leaderboard" subtitle="Top students ranked by average score">
      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13,
            background: filter === v ? '#6366f1' : '#fff',
            color: filter === v ? '#fff' : '#64748b',
            boxShadow: filter === v ? '0 2px 8px rgba(99,102,241,0.3)' : '0 0 0 1px #e2e8f0'
          }}>{l}</button>
        ))}
      </div>

      {myRank > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 12,
          padding: '14px 20px', marginBottom: 20, color: '#fff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 600 }}>Your Rank</span>
          <span style={{ fontSize: 22, fontWeight: 800 }}>#{myRank}</span>
        </div>
      )}

      {loading ? <Spinner /> : board.length === 0 ? (
        <EmptyState icon="🏆" title="No data for this period"
          sub="Complete exams to appear on the leaderboard." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {board.map((r, i) => {
            const isMe = r.uid === user?.uid;
            const medals = ['🥇', '🥈', '🥉'];
            return (
              <div key={r.uid} style={{
                background: isMe ? '#ede9fe' : '#fff',
                border: isMe ? '2px solid #6366f1' : '1px solid #e2e8f0',
                borderRadius: 12, padding: '14px 20px',
                display: 'flex', alignItems: 'center', gap: 14
              }}>
                <div style={{
                  width: 36, textAlign: 'center', fontWeight: 800,
                  fontSize: i < 3 ? 22 : 15, color: i < 3 ? '#1e293b' : '#94a3b8'
                }}>{i < 3 ? medals[i] : `#${i + 1}`}</div>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: '#e0e7ff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700, color: '#6366f1', fontSize: 16,
                  overflow: 'hidden'
                }}>
                  {r.avatar ? <img src={r.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : r.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
                    {r.name} {isMe && <span style={{ fontSize: 12, color: '#6366f1' }}>(You)</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{r.count} exam{r.count !== 1 ? 's' : ''} · Best: {r.best}%</div>
                </div>
                <div style={{
                  fontSize: 20, fontWeight: 800, color: gradeColor(r.avg)
                }}>{r.avg}%</div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
