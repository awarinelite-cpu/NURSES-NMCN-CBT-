// src/components/entrance/EntranceResultsPages.jsx
//
// Exports: EntranceMyResults, EntranceExamsTaken, EntranceBookmarks,
//          EntranceAnalysis, EntranceLeaderboard
//
// Fonts  : headings → Arial Black | body → Times New Roman Bold
// Colors : CSS variables throughout → light + dark mode
// Fixed  : Leaderboard + Analysis read from correct Firestore collections
//          Leaderboard reads entranceExamSessions (root) grouped by userId
//          Analysis reads entranceExamSessions + entranceSubjectDrills

import { useEffect, useState, useCallback } from 'react';
import { useNavigate }                       from 'react-router-dom';
import { db }                                from '../../firebase/config';
import {
  collection, doc, getDocs, query, orderBy,
  limit, deleteDoc, where, Timestamp,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

/* ── Font constants ─────────────────────────────────────────────────────────── */
const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const fmt = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
};
const pct        = (score, total) => (total > 0 ? Math.round((score / total) * 100) : 0);
const grade      = (p) => p >= 80 ? 'Excellent' : p >= 60 ? 'Good' : p >= 45 ? 'Average' : 'Poor';
const gradeColor = (p) => p >= 80 ? '#16A34A' : p >= 60 ? '#2563EB' : p >= 45 ? '#F59E0B' : '#EF4444';

/* ── Spinner ────────────────────────────────────────────────────────────────── */
const Spinner = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
    <div style={{
      width: 44, height: 44,
      border: '3px solid var(--border)',
      borderTopColor: 'var(--teal)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  </div>
);

/* ── Empty state ────────────────────────────────────────────────────────────── */
const EmptyState = ({ icon, title, sub, action, onAction }) => (
  <div style={{ textAlign: 'center', padding: '64px 20px' }}>
    <div style={{ fontSize: 52, marginBottom: 14 }}>{icon}</div>
    <h3 style={{
      margin: '0 0 10px', fontFamily: H, fontWeight: 900,
      fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', color: 'var(--text-primary)',
    }}>{title}</h3>
    <p style={{
      fontFamily: F, fontWeight: 700, fontSize: 15,
      color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.7,
    }}>{sub}</p>
    {action && (
      <button onClick={onAction} style={{
        padding: '12px 28px', background: 'var(--teal)', color: '#fff',
        border: 'none', borderRadius: 10, cursor: 'pointer',
        fontSize: 15, fontWeight: 700, fontFamily: F,
      }}>{action}</button>
    )}
  </div>
);

/* ── Page shell ─────────────────────────────────────────────────────────────── */
const PageShell = ({ title, subtitle, back, children }) => {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: F,
      color: 'var(--text-primary)',
    }}>
      {/* Header bar */}
      <div style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          onClick={() => navigate(back || '/entrance-exam')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, color: 'var(--teal)', padding: 4, lineHeight: 1,
            fontWeight: 700,
          }}
        >←</button>
        <div>
          <h1 style={{
            margin: 0, fontFamily: H, fontWeight: 900,
            fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            color: 'var(--text-primary)',
          }}>{title}</h1>
          {subtitle && (
            <p style={{
              margin: 0, fontSize: 14, fontWeight: 700,
              fontFamily: F, color: 'var(--text-muted)',
            }}>{subtitle}</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </div>
    </div>
  );
};

/* ── Card wrapper ───────────────────────────────────────────────────────────── */
const SCard = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--bg-card)',
    border: '1.5px solid var(--border)',
    borderRadius: 14,
    padding: '20px 22px',
    ...style,
  }}>
    {children}
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════════
   EntranceMyResults
══════════════════════════════════════════════════════════════════════════════ */
export function EntranceMyResults() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [sessions,  setSessions]  = useState([]);
  const [drills,    setDrills]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('sessions'); // sessions | drills

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Root collection sessions
        let sessSnap;
        try {
          sessSnap = await getDocs(query(
            collection(db, 'entranceExamSessions'),
            where('userId', '==', user.uid),
            orderBy('completedAt', 'desc'),
            limit(50),
          ));
        } catch {
          sessSnap = await getDocs(query(
            collection(db, 'entranceExamSessions'),
            where('userId', '==', user.uid),
            limit(50),
          ));
        }
        const sessData = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        sessData.sort((a, b) => (b.completedAt?.toMillis?.() || 0) - (a.completedAt?.toMillis?.() || 0));
        setSessions(sessData);

        // Subject drills subcollection
        let drillSnap;
        try {
          drillSnap = await getDocs(query(
            collection(db, 'users', user.uid, 'entranceSubjectDrills'),
            orderBy('createdAt', 'desc'),
            limit(50),
          ));
        } catch {
          drillSnap = await getDocs(
            collection(db, 'users', user.uid, 'entranceSubjectDrills')
          );
        }
        setDrills(drillSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('MyResults load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const TabBtn = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '9px 22px', borderRadius: 20, border: 'none', cursor: 'pointer',
        fontWeight: 700, fontSize: 14, fontFamily: F,
        background: tab === id ? 'var(--teal)' : 'var(--bg-tertiary)',
        color: tab === id ? '#fff' : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );

  return (
    <PageShell title="My Results" subtitle="All your exam attempts">
      {loading ? <Spinner /> : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <TabBtn id="sessions" label={`📝 Mock Sessions (${sessions.length})`} />
            <TabBtn id="drills"   label={`📚 Subject Drills (${drills.length})`} />
          </div>

          {tab === 'sessions' && (
            sessions.length === 0
              ? <EmptyState icon="📋" title="No sessions yet"
                  sub="Complete a daily mock or school exam to see results here."
                  action="Start Daily Mock" onAction={() => navigate('/entrance-exam/daily-mock')} />
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sessions.map(s => {
                    const p = s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1);
                    return (
                      <SCard key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: `5px solid ${gradeColor(p)}` }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                          background: gradeColor(p) + '18',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: H, fontSize: 16, fontWeight: 900, color: gradeColor(p),
                        }}>{p}%</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', fontFamily: F }}>
                            {s.examName || 'Entrance Exam'}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F, marginTop: 3 }}>
                            {fmt(s.completedAt)} · {s.correct ?? '?'}/{s.totalQuestions ?? '?'} correct · {grade(p)}
                          </div>
                        </div>
                        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 20, color: gradeColor(p) }}>{p}%</div>
                      </SCard>
                    );
                  })}
                </div>
          )}

          {tab === 'drills' && (
            drills.length === 0
              ? <EmptyState icon="📚" title="No drills yet"
                  sub="Complete a subject drill to see results here."
                  action="Start Subject Drill" onAction={() => navigate('/entrance-exam/subject-drill')} />
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {drills.map(d => {
                    const p = d.score ?? pct(d.correct || 0, d.totalQuestions || 1);
                    return (
                      <SCard key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: `5px solid ${gradeColor(p)}` }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                          background: gradeColor(p) + '18',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: H, fontSize: 16, fontWeight: 900, color: gradeColor(p),
                        }}>{p}%</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', fontFamily: F }}>
                            {d.subject || 'Subject Drill'}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F, marginTop: 3 }}>
                            {fmt(d.createdAt)} · {d.correct ?? '?'}/{d.totalQuestions ?? '?'} correct · {grade(p)}
                          </div>
                        </div>
                        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 20, color: gradeColor(p) }}>{p}%</div>
                      </SCard>
                    );
                  })}
                </div>
          )}
        </>
      )}
    </PageShell>
  );
}

/* ── EntranceExamsTaken — alias ─────────────────────────────────────────────── */
export function EntranceExamsTaken() { return <EntranceMyResults />; }

/* ══════════════════════════════════════════════════════════════════════════════
   EntranceBookmarks
══════════════════════════════════════════════════════════════════════════════ */
export function EntranceBookmarks() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      let snap;
      try {
        snap = await getDocs(query(
          collection(db, 'users', user.uid, 'entranceBookmarks'),
          orderBy('savedAt', 'desc'),
        ));
      } catch {
        snap = await getDocs(collection(db, 'users', user.uid, 'entranceBookmarks'));
      }
      setBookmarks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Bookmarks load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'entranceBookmarks', id));
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (e) { console.error(e); }
  };

  return (
    <PageShell title="Bookmarks" subtitle="Questions you saved for review">
      {loading ? <Spinner /> : bookmarks.length === 0 ? (
        <EmptyState icon="🔖" title="No bookmarks yet"
          sub="Tap the Bookmark button during exams to save questions here for later review."
          action="Take a Mock Exam" onAction={() => navigate('/entrance-exam/daily-mock')} />
      ) : (
        <>
          <div style={{ marginBottom: 16, fontSize: 15, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>
            {bookmarks.length} saved question{bookmarks.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {bookmarks.map((b, i) => (
              <SCard key={b.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      {b.subject && (
                        <span style={{
                          background: 'var(--blue-glow)', color: 'var(--blue-mid)',
                          padding: '3px 12px', borderRadius: 20,
                          fontSize: 12, fontWeight: 700, fontFamily: F,
                          border: '1px solid var(--blue-mid)',
                        }}>{b.subject}</span>
                      )}
                      <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, fontFamily: F }}>
                        Saved {fmt(b.savedAt)}
                      </span>
                    </div>

                    <p style={{
                      margin: '0 0 14px', fontWeight: 700, fontSize: 16,
                      color: 'var(--text-primary)', fontFamily: F, lineHeight: 1.6,
                    }}>
                      {i + 1}. {b.question || b.questionText}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(['A','B','C','D']).map(letter => {
                        const text = b.options?.[letter] || (Array.isArray(b.options) ? b.options[letter.charCodeAt(0) - 65] : null);
                        if (!text) return null;
                        const isAns = letter === (b.answer || b.correctAnswer);
                        return (
                          <div key={letter} style={{
                            padding: '10px 16px', borderRadius: 10, fontSize: 15,
                            background: isAns ? 'rgba(22,163,74,0.1)' : 'var(--bg-tertiary)',
                            border: `1.5px solid ${isAns ? '#16A34A' : 'var(--border)'}`,
                            color: isAns ? '#16A34A' : 'var(--text-primary)',
                            fontWeight: 700, fontFamily: F,
                            display: 'flex', gap: 10, alignItems: 'center',
                          }}>
                            {isAns && <span>✓</span>}
                            <span>{letter}. {text}</span>
                          </div>
                        );
                      })}
                    </div>

                    {(b.explanation) && (
                      <div style={{
                        marginTop: 12, padding: '12px 16px',
                        background: 'var(--gold-glow)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        borderRadius: 10, fontSize: 14,
                        color: 'var(--text-primary)', fontWeight: 700, fontFamily: F,
                      }}>
                        💡 {b.explanation}
                      </div>
                    )}
                  </div>

                  <button onClick={() => remove(b.id)} style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1.5px solid rgba(239,68,68,0.35)',
                    color: '#EF4444', borderRadius: 10,
                    padding: '9px 14px', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, fontFamily: F, flexShrink: 0,
                  }}>Remove</button>
                </div>
              </SCard>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   EntranceAnalysis
   Reads from: entranceExamSessions (root) + users/{uid}/entranceSubjectDrills
══════════════════════════════════════════════════════════════════════════════ */
export function EntranceAnalysis() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // ── 1. Root exam sessions ──────────────────────────────────────────
        let sessSnap;
        try {
          sessSnap = await getDocs(query(
            collection(db, 'entranceExamSessions'),
            where('userId', '==', user.uid),
            orderBy('completedAt', 'desc'),
            limit(50),
          ));
        } catch {
          sessSnap = await getDocs(query(
            collection(db, 'entranceExamSessions'),
            where('userId', '==', user.uid),
            limit(50),
          ));
        }
        const sessions = sessSnap.docs.map(d => d.data());

        // ── 2. Subject drills ──────────────────────────────────────────────
        let drillSnap;
        try {
          drillSnap = await getDocs(query(
            collection(db, 'users', user.uid, 'entranceSubjectDrills'),
            orderBy('createdAt', 'desc'),
            limit(50),
          ));
        } catch {
          drillSnap = await getDocs(
            collection(db, 'users', user.uid, 'entranceSubjectDrills')
          );
        }
        const drills = drillSnap.docs.map(d => d.data());

        // ── 3. Aggregate ───────────────────────────────────────────────────
        const allScores = sessions.map(s => s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1));
        const avg  = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
        const best = allScores.length ? Math.max(...allScores) : 0;

        // Last 7 sessions for trend chart
        const sorted = [...sessions].sort((a, b) => (b.completedAt?.toMillis?.() || 0) - (a.completedAt?.toMillis?.() || 0));
        const last7  = sorted.slice(0, 7).reverse();

        // Subject breakdown from drills
        const subjectMap = {};
        drills.forEach(d => {
          const sub = d.subject || 'Unknown';
          if (!subjectMap[sub]) subjectMap[sub] = { correct: 0, total: 0, count: 0 };
          subjectMap[sub].correct += d.correct || 0;
          subjectMap[sub].total   += d.totalQuestions || 0;
          subjectMap[sub].count++;
        });

        // Exam type breakdown from sessions
        const examTypeMap = {};
        sessions.forEach(s => {
          const t = s.examType || 'unknown';
          if (!examTypeMap[t]) examTypeMap[t] = { scores: [], count: 0 };
          examTypeMap[t].scores.push(s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1));
          examTypeMap[t].count++;
        });

        setData({
          totalSessions: sessions.length,
          totalDrills:   drills.length,
          avg, best, last7,
          subjectMap, examTypeMap,
        });
      } catch (e) {
        console.error('Analysis load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) return <PageShell title="Analysis"><Spinner /></PageShell>;

  if (!data || (data.totalSessions === 0 && data.totalDrills === 0)) return (
    <PageShell title="Analysis" subtitle="Your performance trends">
      <EmptyState icon="📊" title="No data yet"
        sub="Complete some exams and subject drills to unlock your performance analysis."
        action="Start Practising" onAction={() => navigate('/entrance-exam')} />
    </PageShell>
  );

  const subjects = Object.entries(data.subjectMap)
    .map(([name, v]) => ({ name, pct: pct(v.correct, v.total), correct: v.correct, total: v.total, count: v.count }))
    .sort((a, b) => b.pct - a.pct);

  const SectionTitle = ({ children }) => (
    <h3 style={{
      fontFamily: H, fontWeight: 900,
      fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
      color: 'var(--text-primary)', margin: '0 0 16px',
    }}>{children}</h3>
  );

  return (
    <PageShell title="Analysis" subtitle="Your performance breakdown">

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Mock Sessions', value: data.totalSessions, icon: '📝' },
          { label: 'Subject Drills', value: data.totalDrills,  icon: '📚' },
          { label: 'Average Score',  value: `${data.avg}%`,    icon: '📈' },
          { label: 'Best Score',     value: `${data.best}%`,   icon: '🏆' },
          { label: 'Grade',          value: grade(data.avg),   icon: '🎯' },
        ].map(s => (
          <SCard key={s.label} style={{ textAlign: 'center', padding: '20px 12px' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>{s.icon}</div>
            <div style={{
              fontSize: 22, fontWeight: 900, color: 'var(--text-primary)',
              fontFamily: H, lineHeight: 1,
            }}>{s.value}</div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
              marginTop: 6, fontFamily: F,
            }}>{s.label}</div>
          </SCard>
        ))}
      </div>

      {/* ── Score trend ── */}
      {data.last7.length > 1 && (
        <SCard style={{ marginBottom: 20 }}>
          <SectionTitle>📉 Recent Score Trend</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {data.last7.map((s, i) => {
              const p = s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: gradeColor(p), fontFamily: F }}>{p}%</span>
                  <div style={{
                    width: '100%', height: `${Math.max(p, 4)}px`, minHeight: 4,
                    background: gradeColor(p), borderRadius: '4px 4px 0 0',
                    transition: 'height 0.5s ease',
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>
                    {s.completedAt?.toDate?.()?.toLocaleDateString('en', { month: 'numeric', day: 'numeric' }) || '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            {[['#16A34A','80%+ Excellent'],['#2563EB','60%+ Good'],['#F59E0B','45%+ Average'],['#EF4444','Below 45%']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>{label}</span>
              </div>
            ))}
          </div>
        </SCard>
      )}

      {/* ── Subject breakdown ── */}
      {subjects.length > 0 && (
        <SCard style={{ marginBottom: 20 }}>
          <SectionTitle>📚 Subject Performance (from Drills)</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {subjects.map(s => (
              <div key={s.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: F }}>{s.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: gradeColor(s.pct), fontFamily: F }}>
                    {s.pct}% · {s.correct}/{s.total} · {s.count} drill{s.count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${s.pct}%`,
                    background: gradeColor(s.pct),
                    borderRadius: 5, transition: 'width 0.8s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </SCard>
      )}

      {/* ── Weak areas ── */}
      {subjects.length > 0 && (
        <SCard>
          <SectionTitle>⚠️ Weak Areas to Focus On</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subjects.filter(s => s.pct < 60).length === 0 ? (
              <p style={{ fontFamily: F, fontWeight: 700, color: 'var(--text-muted)', fontSize: 15 }}>
                🎉 Great job! All subjects are above 60%.
              </p>
            ) : (
              subjects.filter(s => s.pct < 60).map(s => (
                <div key={s.name} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'rgba(239,68,68,0.07)',
                  border: '1.5px solid rgba(239,68,68,0.2)',
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 24 }}>📉</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', fontFamily: F }}>{s.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', fontFamily: F, marginTop: 2 }}>
                      Scoring {s.pct}% — needs improvement
                    </div>
                  </div>
                  <div style={{ fontFamily: H, fontWeight: 900, fontSize: 20, color: '#EF4444' }}>{s.pct}%</div>
                </div>
              ))
            )}
          </div>
        </SCard>
      )}
    </PageShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   EntranceLeaderboard
   Reads from entranceExamSessions (root collection) grouped by userId
   — much more efficient than querying every user's subcollection
══════════════════════════════════════════════════════════════════════════════ */
export function EntranceLeaderboard() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [board,    setBoard]   = useState([]);
  const [loading,  setLoading] = useState(true);
  const [filter,   setFilter]  = useState('month');
  const [error,    setError]   = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        // ── Build date cutoff ──────────────────────────────────────────────
        const cutoff = new Date();
        if      (filter === 'week')  cutoff.setDate(cutoff.getDate() - 7);
        else if (filter === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
        else                         cutoff.setFullYear(2000);

        // ── Query root entranceExamSessions ────────────────────────────────
        let snap;
        try {
          snap = await getDocs(query(
            collection(db, 'entranceExamSessions'),
            where('completedAt', '>=', Timestamp.fromDate(cutoff)),
            orderBy('completedAt', 'desc'),
            limit(500),
          ));
        } catch {
          // Index missing fallback — get recent without date filter
          snap = await getDocs(query(
            collection(db, 'entranceExamSessions'),
            orderBy('completedAt', 'desc'),
            limit(500),
          ));
        }

        // ── Group by userId ───────────────────────────────────────────────
        const userMap = {};
        snap.forEach(d => {
          const s = d.data();
          if (!s.userId) return;
          if (!userMap[s.userId]) {
            userMap[s.userId] = {
              uid:    s.userId,
              name:   s.userName || s.displayName || 'Student',
              scores: [],
            };
          }
          const p = s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1);
          userMap[s.userId].scores.push(p);
        });

        // ── Build rows ────────────────────────────────────────────────────
        const rows = Object.values(userMap).map(u => ({
          uid:   u.uid,
          name:  u.name,
          avg:   Math.round(u.scores.reduce((a, b) => a + b, 0) / u.scores.length),
          best:  Math.max(...u.scores),
          count: u.scores.length,
        }));

        rows.sort((a, b) => b.avg - a.avg || b.count - a.count);
        setBoard(rows.slice(0, 50));
      } catch (e) {
        console.error('Leaderboard error:', e);
        setError('Could not load leaderboard. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [filter]);

  const myRank = board.findIndex(r => r.uid === user?.uid) + 1;
  const medals = ['🥇', '🥈', '🥉'];

  const FilterBtn = ({ id, label }) => (
    <button
      onClick={() => setFilter(id)}
      style={{
        padding: '9px 22px', borderRadius: 20, border: 'none', cursor: 'pointer',
        fontWeight: 700, fontSize: 14, fontFamily: F,
        background: filter === id ? 'var(--teal)' : 'var(--bg-tertiary)',
        color: filter === id ? '#fff' : 'var(--text-muted)',
        transition: 'all 0.15s',
        boxShadow: filter === id ? 'var(--shadow-teal)' : 'none',
      }}
    >{label}</button>
  );

  return (
    <PageShell title="🏆 Leaderboard" subtitle="Top students ranked by average score">

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterBtn id="week"  label="This Week" />
        <FilterBtn id="month" label="This Month" />
        <FilterBtn id="all"   label="All Time" />
      </div>

      {/* My rank banner */}
      {myRank > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, var(--teal), var(--blue-deep))',
          borderRadius: 14, padding: '16px 22px', marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#fff', fontFamily: F }}>
            🎯 Your Rank
          </span>
          <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: H }}>
            #{myRank}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          fontSize: 14, color: '#EF4444', fontWeight: 700, fontFamily: F,
        }}>⚠️ {error}</div>
      )}

      {loading ? <Spinner /> : board.length === 0 ? (
        <EmptyState icon="🏆" title="No data for this period"
          sub="Complete entrance exams to appear on the leaderboard."
          action="Start Practising" onAction={() => navigate('/entrance-exam')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {board.map((r, i) => {
            const isMe = r.uid === user?.uid;
            return (
              <div key={r.uid} style={{
                background: isMe ? 'var(--teal-glow)' : 'var(--bg-card)',
                border: isMe ? '2px solid var(--teal)' : '1.5px solid var(--border)',
                borderRadius: 14, padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: 14,
                boxShadow: isMe ? 'var(--shadow-teal)' : 'var(--shadow-sm)',
              }}>
                {/* Rank */}
                <div style={{
                  width: 40, textAlign: 'center', flexShrink: 0,
                  fontWeight: 900, fontSize: i < 3 ? 26 : 16,
                  color: i < 3 ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: i < 3 ? 'inherit' : H,
                }}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>

                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: isMe ? 'var(--teal)' : 'var(--bg-tertiary)',
                  border: `2px solid ${isMe ? 'var(--teal)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 18,
                  color: isMe ? '#fff' : 'var(--text-muted)',
                  fontFamily: H,
                }}>
                  {r.name[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: 16,
                    color: 'var(--text-primary)', fontFamily: F,
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}>
                    {r.name}
                    {isMe && (
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--teal)',
                        background: 'var(--teal-glow)', padding: '2px 8px', borderRadius: 20,
                        border: '1px solid var(--teal)', fontFamily: F,
                      }}>You</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: 'var(--text-muted)', fontFamily: F, marginTop: 2,
                  }}>
                    {r.count} exam{r.count !== 1 ? 's' : ''} · Best: {r.best}%
                  </div>
                </div>

                {/* Score */}
                <div style={{
                  fontFamily: H, fontWeight: 900, fontSize: 22,
                  color: gradeColor(r.avg),
                }}>
                  {r.avg}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
