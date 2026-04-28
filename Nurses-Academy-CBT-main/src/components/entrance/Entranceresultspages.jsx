// src/components/entrance/EntranceResultsPages.jsx
// Contains: EntranceMyResults, EntranceExamsTaken, EntranceBookmarks,
//           EntranceAnalysis, EntranceLeaderboard
// All export named components

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection, getDocs, query, orderBy, limit, where,
  doc, deleteDoc, getDoc, setDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';

function formatTime(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}m ${sec}s`;
}

function ScoreChip({ score }) {
  const color = score >= 60 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <span style={{
      fontWeight: 800, fontSize: 14, color,
      background: color + '18', padding: '4px 10px',
      borderRadius: 20, fontFamily: 'monospace',
    }}>{score}%</span>
  );
}

function PageShell({ icon, title, subtitle, children, backPath = '/entrance-exam' }) {
  const navigate = useNavigate();
  return (
    <div style={p.wrap}>
      <button onClick={() => navigate(backPath)} style={p.back}>← Back to Hub</button>
      <div style={p.header}>
        <span style={{ fontSize: 36 }}>{icon}</span>
        <div>
          <h2 style={p.title}>{title}</h2>
          {subtitle && <p style={p.sub}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MY RESULTS — history of all entrance exam attempts
// ════════════════════════════════════════════════════════════════
export function EntranceMyResults() {
  const { user } = useAuth();
  const [attempts, setAttempts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [mockSnap, drillSnap] = await Promise.all([
          getDocs(query(collection(db, 'users', user.uid, 'entranceDailyMock'), orderBy('date', 'desc'))),
          getDocs(query(collection(db, 'users', user.uid, 'entranceSubjectDrills'), orderBy('createdAt', 'desc'))),
        ]);
        const mocks  = mockSnap.docs.map(d => ({ id: d.id, type: 'Daily Mock', ...d.data() }));
        const drills = drillSnap.docs.map(d => ({ id: d.id, type: 'Subject Drill', ...d.data() }));
        const all = [...mocks, ...drills].sort((a, b) => {
          const da = a.date || a.createdAt || '';
          const db2 = b.date || b.createdAt || '';
          return da > db2 ? -1 : 1;
        });
        setAttempts(all);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [user]);

  const filtered = typeFilter === 'all' ? attempts : attempts.filter(a => a.type === typeFilter);
  const avg = filtered.length ? Math.round(filtered.reduce((s, a) => s + (a.score || 0), 0) / filtered.length) : null;

  return (
    <PageShell icon="📋" title="My Results" subtitle="All your entrance exam attempts in one place.">
      {/* Filter + stats bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {['all', 'Daily Mock', 'Subject Drill'].map(f => (
          <button key={f} onClick={() => setTypeFilter(f)} style={{
            padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
            borderColor: typeFilter === f ? '#0D9488' : 'rgba(255,255,255,0.1)',
            background: typeFilter === f ? 'rgba(13,148,136,0.15)' : 'rgba(255,255,255,0.03)',
            color: typeFilter === f ? '#0D9488' : 'rgba(255,255,255,0.5)',
          }}>{f === 'all' ? 'All Types' : f}</button>
        ))}
        {avg !== null && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <div style={p.statBox}>
              <span style={p.statNum}>{filtered.length}</span>
              <span style={p.statLabel}>Attempts</span>
            </div>
            <div style={p.statBox}>
              <span style={{ ...p.statNum, color: avg >= 60 ? '#10B981' : avg >= 40 ? '#F59E0B' : '#EF4444' }}>{avg}%</span>
              <span style={p.statLabel}>Avg Score</span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={p.loadingBox}><div className="spinner" style={{ margin: '0 auto 10px' }} />Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={p.emptyBox}>
          <span style={{ fontSize: 48 }}>📭</span>
          <p>No attempts yet. Take a Daily Mock or Subject Drill to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((a, i) => {
            const color = (a.score || 0) >= 60 ? '#10B981' : (a.score || 0) >= 40 ? '#F59E0B' : '#EF4444';
            const isOpen = expanded === a.id;
            const label = a.type === 'Daily Mock' ? `📅 Daily Mock — ${a.date || ''}` : `📚 ${a.subject || 'Subject Drill'}`;
            return (
              <div key={a.id} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}
                >
                  <div style={{
                    width: 4, height: 36, borderRadius: 2, flexShrink: 0,
                    background: color,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                      {a.correct}/{a.total} correct · {formatTime(a.timeTaken)}
                    </div>
                  </div>
                  <ScoreChip score={a.score || 0} />
                  <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {/* Score bar */}
                <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', margin: '0 16px' }}>
                  <div style={{ height: '100%', width: `${a.score || 0}%`, background: color, borderRadius: 2 }} />
                </div>

                {/* Expanded review */}
                {isOpen && a.breakdown && (
                  <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', maxHeight: 320, overflowY: 'auto' }}>
                    {a.breakdown.map((item, j) => (
                      <div key={j} style={{
                        borderLeft: `3px solid ${item.isCorrect ? '#10B981' : '#EF4444'}`,
                        padding: '8px 12px', marginBottom: 8,
                        background: 'rgba(255,255,255,0.03)', borderRadius: '0 8px 8px 0',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                          Q{j + 1}: {item.question?.slice(0, 80)}{item.question?.length > 80 ? '…' : ''}
                        </div>
                        <div style={{ fontSize: 11 }}>
                          <span style={{ color: item.isCorrect ? '#10B981' : '#EF4444' }}>
                            {item.isCorrect ? '✅' : '❌'} {item.chosen || 'Skipped'}
                          </span>
                          {!item.isCorrect && (
                            <span style={{ color: '#10B981', marginLeft: 8 }}>✓ {item.correct}</span>
                          )}
                        </div>
                      </div>
                    ))}
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

// ════════════════════════════════════════════════════════════════
// EXAMS TAKEN — alias of MyResults (same data, different framing)
// ════════════════════════════════════════════════════════════════
export function EntranceExamsTaken() {
  return <EntranceMyResults />;
}

// ════════════════════════════════════════════════════════════════
// BOOKMARKS — saved questions
// ════════════════════════════════════════════════════════════════
export function EntranceBookmarks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState(null);
  const [filter, setFilter]       = useState('');

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'users', user.uid, 'entranceBookmarks'), orderBy('savedAt', 'desc'))
      );
      setBookmarks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function removeBookmark(bm) {
    setDeleting(bm.id);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'entranceBookmarks', bm.id));
      setBookmarks(prev => prev.filter(b => b.id !== bm.id));
    } catch (e) { alert('Failed to remove: ' + e.message); }
    setDeleting(null);
  }

  const filtered = filter
    ? bookmarks.filter(b =>
        b.questionText?.toLowerCase().includes(filter.toLowerCase()) ||
        b.subject?.toLowerCase().includes(filter.toLowerCase())
      )
    : bookmarks;

  return (
    <PageShell icon="🔖" title="Bookmarks" subtitle="Questions you've saved for later review.">
      {loading ? (
        <div style={p.loadingBox}><div className="spinner" style={{ margin: '0 auto 10px' }} />Loading…</div>
      ) : bookmarks.length === 0 ? (
        <div style={p.emptyBox}>
          <span style={{ fontSize: 48 }}>🔖</span>
          <p style={{ color: 'rgba(255,255,255,0.45)', maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}>
            No bookmarks yet. While taking a Daily Mock or Subject Drill,
            tap the 🏳 flag button on any question to save it here.
          </p>
          <button onClick={() => navigate('/entrance-exam/daily-mock')} style={p.primaryBtn}>
            📅 Go to Daily Mock
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              placeholder="🔍 Search bookmarks…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={p.searchInput}
            />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
              {filtered.length} bookmark{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(bm => (
              <div key={bm.id} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14, padding: '16px 18px',
              }}>
                {/* Meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  {bm.subject && (
                    <span style={p.tag}>{bm.subject}</span>
                  )}
                  {bm.school && (
                    <span style={{ ...p.tag, background: 'rgba(13,148,136,0.12)', color: '#0D9488', borderColor: 'rgba(13,148,136,0.2)' }}>
                      🏫 {bm.school}
                    </span>
                  )}
                  <button
                    onClick={() => removeBookmark(bm)}
                    disabled={deleting === bm.id}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18, opacity: deleting === bm.id ? 0.5 : 1 }}
                    title="Remove bookmark"
                  >🗑️</button>
                </div>

                {/* Question */}
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.6, marginBottom: 12, color: '#fff' }}>
                  {bm.questionText}
                </div>

                {/* Options */}
                {bm.options && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {['A','B','C','D'].map(opt => {
                      const text = bm.options?.[opt] || bm[`option${opt}`];
                      if (!text) return null;
                      const isCorrect = bm.correctAnswer === opt;
                      return (
                        <div key={opt} style={{
                          display: 'flex', gap: 10, alignItems: 'flex-start',
                          padding: '8px 12px', borderRadius: 8, fontSize: 13,
                          background: isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                          color: isCorrect ? '#10B981' : 'rgba(255,255,255,0.6)',
                        }}>
                          <span style={{ fontWeight: 700, flexShrink: 0 }}>{opt}.</span>
                          <span>{text}</span>
                          {isCorrect && <span style={{ marginLeft: 'auto', flexShrink: 0 }}>✅</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {bm.explanation && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                    💡 {bm.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

// ════════════════════════════════════════════════════════════════
// ANALYSIS — performance trends + weak areas
// ════════════════════════════════════════════════════════════════
export function EntranceAnalysis() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mocks,   setMocks]   = useState([]);
  const [drills,  setDrills]  = useState([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [ms, ds] = await Promise.all([
          getDocs(query(collection(db, 'users', user.uid, 'entranceDailyMock'), orderBy('date', 'asc'))),
          getDocs(query(collection(db, 'users', user.uid, 'entranceSubjectDrills'), orderBy('createdAt', 'asc'))),
        ]);
        setMocks(ms.docs.map(d => ({ id: d.id, ...d.data() })));
        setDrills(ds.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [user]);

  // Subject map from all breakdowns
  const subjectMap = {};
  [...mocks, ...drills].forEach(a => {
    (a.breakdown || []).forEach(item => {
      const sub = item.subject || (a.type === 'Subject Drill' ? a.subject : '') || 'General';
      if (!subjectMap[sub]) subjectMap[sub] = { correct: 0, total: 0 };
      subjectMap[sub].total++;
      if (item.isCorrect) subjectMap[sub].correct++;
    });
    // drills store subject at top level
    if (a.subject && a.total && !a.breakdown?.length) {
      if (!subjectMap[a.subject]) subjectMap[a.subject] = { correct: 0, total: 0 };
      subjectMap[a.subject].total += a.total;
      subjectMap[a.subject].correct += a.correct || 0;
    }
  });

  const subjects = Object.entries(subjectMap)
    .map(([name, { correct, total }]) => ({ name, pct: Math.round((correct / total) * 100), total }))
    .sort((a, b) => a.pct - b.pct); // weakest first

  const mockAvg = mocks.length ? Math.round(mocks.reduce((s, m) => s + (m.score || 0), 0) / mocks.length) : null;
  const drillAvg = drills.length ? Math.round(drills.reduce((s, d) => s + (d.score || 0), 0) / drills.length) : null;
  const totalAttempts = mocks.length + drills.length;

  return (
    <PageShell icon="📈" title="Analysis" subtitle="Your performance trends and areas to improve.">
      {loading ? (
        <div style={p.loadingBox}><div className="spinner" style={{ margin: '0 auto 10px' }} />Analysing your results…</div>
      ) : totalAttempts === 0 ? (
        <div style={p.emptyBox}>
          <span style={{ fontSize: 48 }}>📊</span>
          <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.6, maxWidth: 300 }}>
            No data yet. Complete some Daily Mocks or Subject Drills to see your analysis here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'Total Attempts', value: totalAttempts, icon: '📝' },
              { label: 'Daily Mocks', value: mocks.length, icon: '📅' },
              { label: 'Subject Drills', value: drills.length, icon: '📚' },
              ...(mockAvg !== null ? [{ label: 'Mock Avg', value: `${mockAvg}%`, icon: '📊', color: mockAvg >= 60 ? '#10B981' : mockAvg >= 40 ? '#F59E0B' : '#EF4444' }] : []),
              ...(drillAvg !== null ? [{ label: 'Drill Avg', value: `${drillAvg}%`, icon: '🏋️', color: drillAvg >= 60 ? '#10B981' : drillAvg >= 40 ? '#F59E0B' : '#EF4444' }] : []),
            ].map(({ label, value, icon, color }) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14, padding: '16px 14px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontWeight: 800, fontSize: 22, color: color || '#fff', fontFamily: "'Playfair Display',serif" }}>{value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Mock score trend */}
          {mocks.length > 1 && (
            <div style={p.analysisCard}>
              <div style={p.cardLabel}>📅 Daily Mock Score Trend ({mocks.length} sessions)</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, marginBottom: 8 }}>
                {mocks.map((m, i) => {
                  const color = (m.score || 0) >= 60 ? '#10B981' : (m.score || 0) >= 40 ? '#F59E0B' : '#EF4444';
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' }}>
                      <div style={{
                        width: '100%', minWidth: 6,
                        height: `${Math.max((m.score || 0), 4)}%`,
                        background: color, borderRadius: '3px 3px 0 0',
                        transition: 'height 0.5s ease',
                        position: 'relative',
                      }}
                        title={`${m.date}: ${m.score}%`}
                      />
                      {mocks.length <= 14 && (
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap', transform: 'rotate(-30deg)', transformOrigin: 'top' }}>
                          {m.date?.slice(5)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {mockAvg !== null && (
                <div style={{ textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  Average: <strong style={{ color: mockAvg >= 60 ? '#10B981' : mockAvg >= 40 ? '#F59E0B' : '#EF4444' }}>{mockAvg}%</strong>
                </div>
              )}
            </div>
          )}

          {/* Subject performance */}
          {subjects.length > 0 && (
            <div style={p.analysisCard}>
              <div style={p.cardLabel}>📚 Subject Performance — Weakest First</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {subjects.map(({ name, pct, total }) => {
                  const color = pct >= 60 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';
                  return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 140, fontSize: 13, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{name}</span>
                      <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 5, transition: 'width 0.6s ease' }} />
                      </div>
                      <span style={{ width: 36, fontSize: 13, fontWeight: 700, color, textAlign: 'right' }}>{pct}%</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', width: 36, textAlign: 'right' }}>({total}Q)</span>
                    </div>
                  );
                })}
              </div>
              {subjects.length > 0 && subjects[0].pct < 60 && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                  💡 <strong style={{ color: '#EF4444' }}>Focus area:</strong> Your weakest subject is <strong>{subjects[0].name}</strong> at {subjects[0].pct}%. Try a Subject Drill to improve!
                </div>
              )}
            </div>
          )}

          {/* Consistency */}
          {mocks.length > 0 && (
            <div style={p.analysisCard}>
              <div style={p.cardLabel}>🔥 Consistency Streak</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(() => {
                  // Build last 30 days calendar
                  const days = [];
                  for (let i = 29; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    const found = mocks.find(m => m.date === key);
                    days.push({ key, score: found?.score, done: !!found });
                  }
                  return days.map(({ key, score, done }) => {
                    const color = !done ? 'rgba(255,255,255,0.06)' :
                      score >= 60 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444';
                    return (
                      <div
                        key={key}
                        title={done ? `${key}: ${score}%` : key}
                        style={{
                          width: 20, height: 20, borderRadius: 4, background: color,
                          cursor: done ? 'pointer' : 'default',
                        }}
                      />
                    );
                  });
                })()}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                <span>⬛ Missed</span>
                <span style={{ color: '#10B981' }}>■ 60%+</span>
                <span style={{ color: '#F59E0B' }}>■ 40–59%</span>
                <span style={{ color: '#EF4444' }}>■ &lt;40%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

// ════════════════════════════════════════════════════════════════
// LEADERBOARD — top students by average mock score
// ════════════════════════════════════════════════════════════════
export function EntranceLeaderboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [board, setBoard]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank]   = useState(null);
  const [period, setPeriod]   = useState('week'); // week | month | all

  useEffect(() => {
    load();
  }, [period]);

  async function load() {
    setLoading(true);
    try {
      // Get all users with entrance mock attempts
      // We query the leaderboard collection which admins or a cloud function would maintain
      // As a fallback we compute from mock data
      const usersSnap = await getDocs(collection(db, 'users'));
      const entries = [];

      await Promise.all(usersSnap.docs.map(async (userDoc) => {
        try {
          const mockSnap = await getDocs(
            query(collection(db, 'users', userDoc.id, 'entranceDailyMock'), orderBy('date', 'desc'), limit(30))
          );
          if (mockSnap.empty) return;

          const attempts = mockSnap.docs.map(d => d.data());
          // Filter by period
          const cutoff = new Date();
          if (period === 'week')  cutoff.setDate(cutoff.getDate() - 7);
          if (period === 'month') cutoff.setDate(cutoff.getDate() - 30);
          const filtered = period === 'all' ? attempts : attempts.filter(a => {
            return a.date >= cutoff.toISOString().slice(0, 10);
          });
          if (filtered.length === 0) return;

          const avg = Math.round(filtered.reduce((s, a) => s + (a.score || 0), 0) / filtered.length);
          const name = userDoc.data().name || userDoc.data().displayName || 'Student';
          entries.push({
            uid: userDoc.id,
            name,
            avg,
            attempts: filtered.length,
            best: Math.max(...filtered.map(a => a.score || 0)),
            isMe: userDoc.id === user?.uid,
          });
        } catch (e) { /* user might not have attempts */ }
      }));

      entries.sort((a, b) => b.avg - a.avg || b.attempts - a.attempts);
      setBoard(entries.slice(0, 50));

      const myIdx = entries.findIndex(e => e.isMe);
      setMyRank(myIdx >= 0 ? myIdx + 1 : null);
    } catch (e) {
      console.error('Leaderboard load error:', e);
    }
    setLoading(false);
  }

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <PageShell icon="🏆" title="Leaderboard" subtitle="Top students on the Entrance Exam Daily Mock.">
      {/* Period filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{ v: 'week', l: 'This Week' }, { v: 'month', l: 'This Month' }, { v: 'all', l: 'All Time' }].map(({ v, l }) => (
          <button key={v} onClick={() => setPeriod(v)} style={{
            padding: '7px 16px', borderRadius: 20, border: '1.5px solid',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
            borderColor: period === v ? '#F59E0B' : 'rgba(255,255,255,0.1)',
            background: period === v ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
            color: period === v ? '#F59E0B' : 'rgba(255,255,255,0.5)',
          }}>{l}</button>
        ))}
      </div>

      {/* My rank banner */}
      {myRank && !loading && (
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>⭐</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>
            Your Rank: #{myRank}
          </span>
          {board[myRank - 1] && (
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
              · Avg: {board[myRank - 1].avg}% · {board[myRank - 1].attempts} attempts
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div style={p.loadingBox}>
          <div className="spinner" style={{ margin: '0 auto 10px' }} />Loading leaderboard…
        </div>
      ) : board.length === 0 ? (
        <div style={p.emptyBox}>
          <span style={{ fontSize: 48 }}>🏆</span>
          <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.6, maxWidth: 300 }}>
            No entries yet for this period. Be the first to complete a Daily Mock!
          </p>
          <button onClick={() => navigate('/entrance-exam/daily-mock')} style={p.primaryBtn}>
            📅 Take Today's Mock
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {board.map((entry, i) => {
            const rank = i + 1;
            const color = entry.avg >= 60 ? '#10B981' : entry.avg >= 40 ? '#F59E0B' : '#EF4444';
            const isTop3 = rank <= 3;
            return (
              <div key={entry.uid} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: entry.isMe
                  ? 'rgba(245,158,11,0.08)'
                  : isTop3 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${entry.isMe ? 'rgba(245,158,11,0.25)' : isTop3 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 12,
                transition: 'all 0.15s',
              }}>
                {/* Rank */}
                <div style={{
                  width: 36, textAlign: 'center', flexShrink: 0,
                  fontSize: isTop3 ? 22 : 14,
                  fontWeight: 800,
                  color: isTop3 ? '#fff' : 'rgba(255,255,255,0.3)',
                }}>
                  {isTop3 ? medals[i] : `#${rank}`}
                </div>

                {/* Avatar */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: `linear-gradient(135deg, ${entry.isMe ? '#F59E0B' : '#0D9488'}, #1E3A8A)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 16, color: '#fff',
                }}>
                  {(entry.name || 'S')[0].toUpperCase()}
                </div>

                {/* Name */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: entry.isMe ? '#F59E0B' : '#fff' }}>
                    {entry.name} {entry.isMe && '(You)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {entry.attempts} attempt{entry.attempts !== 1 ? 's' : ''} · Best: {entry.best}%
                  </div>
                </div>

                {/* Score */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, fontSize: 18, color, fontFamily: "'Playfair Display', serif" }}>
                    {entry.avg}%
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    avg
                  </div>
                </div>

                {/* Mini bar */}
                <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${entry.avg}%`, background: color, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────
const p = {
  wrap: {
    maxWidth: 780, margin: '0 auto', padding: '24px 16px 48px',
    color: '#fff', fontFamily: "'Inter', sans-serif",
  },
  back: {
    background: 'none', border: 'none', color: '#0D9488',
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
    padding: '0 0 20px', display: 'block',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24,
  },
  title: {
    fontFamily: "'Playfair Display', serif", fontSize: 26,
    fontWeight: 700, margin: '0 0 4px',
  },
  sub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: 0 },
  loadingBox: {
    textAlign: 'center', padding: '48px 24px',
    color: 'rgba(255,255,255,0.4)', fontSize: 14,
  },
  emptyBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 14, padding: '48px 24px', textAlign: 'center',
    color: 'rgba(255,255,255,0.45)', fontSize: 14,
  },
  statBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, padding: '10px 16px', minWidth: 70, textAlign: 'center',
  },
  statNum: { fontWeight: 800, fontSize: 18, fontFamily: "'Playfair Display',serif", color: '#fff' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 },
  tag: {
    fontSize: 11, fontWeight: 700,
    background: 'rgba(139,92,246,0.12)', color: '#8B5CF6',
    border: '1px solid rgba(139,92,246,0.2)',
    padding: '3px 10px', borderRadius: 20,
  },
  searchInput: {
    flex: 1, minWidth: 200,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '8px 14px', color: '#fff',
    fontSize: 14, outline: 'none', fontFamily: 'inherit',
  },
  primaryBtn: {
    background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
    border: 'none', color: '#fff', padding: '11px 24px',
    borderRadius: 10, cursor: 'pointer', fontSize: 14,
    fontWeight: 700, fontFamily: 'inherit',
  },
  analysisCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16, padding: '18px 20px',
  },
  cardLabel: {
    fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16,
  },
};
