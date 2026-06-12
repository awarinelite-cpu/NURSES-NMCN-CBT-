// src/components/entrance/EntranceResultsPages.jsx
//
// Exports: EntranceMyResults, EntranceExamsTaken, EntranceBookmarks,
//          EntranceAnalysis, EntranceLeaderboard
//
// Fonts  : headings → Arial Black | body → Times New Roman Bold
// Colors : CSS variables throughout → light + dark mode
// Fixed  : Leaderboard + Analysis read from correct Firestore collections
//          Leaderboard reads entranceExamSessions (root) grouped by userId
//          Analysis reads entranceExamSessions + users/{uid}/entranceSubjectDrills

import { useEffect, useState, useCallback } from 'react';
import { useNavigate }                       from 'react-router-dom';
import { db }                                from '../../firebase/config';
import {
  collection, doc, getDocs, query, orderBy,
  limit, deleteDoc, where, Timestamp,
} from 'firebase/firestore';
import { useAuth }          from '../../context/AuthContext';
import ExplanationText      from '../shared/ExplanationText';

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
const gradeColor = (p) => p >= 70 ? '#16A34A' : p >= 50 ? '#F59E0B' : '#EF4444';

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
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
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

/* ── Progress row ───────────────────────────────────────────────────────────── */
function ProgressRow({ name, avgScore, sessions, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: F, color: 'var(--text-primary)' }}>{name}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
            {sessions} session{sessions !== 1 ? 's' : ''}
          </span>
          <span style={{ fontWeight: 700, fontSize: 13, color, fontFamily: F }}>{avgScore}%</span>
        </div>
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${avgScore}%`, background: color,
          borderRadius: 4, transition: 'width 0.8s ease',
        }} />
      </div>
    </div>
  );
}

/* ── Mini bar chart ─────────────────────────────────────────────────────────── */
function MiniBarChart({ data }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%', borderRadius: '4px 4px 0 0',
            height: `${(v / max) * 70}px`,
            background: gradeColor(v),
            transition: 'height 0.6s ease',
            minHeight: 4,
          }} title={`${v}%`} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>{v}%</span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   EntranceMyResults
══════════════════════════════════════════════════════════════════════════════ */
export function EntranceMyResults() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [sessions,  setSessions]  = useState([]);
  const [drills,    setDrills]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('sessions');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
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
                    {b.explanation && (
                      <div style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(13,148,136,0.35)', boxShadow: '0 2px 12px rgba(13,148,136,0.1)' }}>
                        <div style={{ background: 'var(--teal)', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>💡</span>
                          <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 14, color: '#fff' }}>Explanation</span>
                        </div>
                        <div style={{ padding: '14px 16px', background: 'rgba(13,148,136,0.06)' }}>
                          <ExplanationText text={b.explanation} />
                        </div>
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
   ─────────────────────────────────────────────────────────────────────────────
   Data sources:
     • entranceExamSessions  (root collection)  — daily mocks & school exams
     • users/{uid}/entranceSubjectDrills         — subject drill results

   Fields used from entranceExamSessions:
     userId, scorePercent, correct, totalQuestions,
     examType, examName, subject, completedAt

   Fields used from entranceSubjectDrills:
     subject, score (= percent), correct, totalQuestions, createdAt
══════════════════════════════════════════════════════════════════════════════ */
export function EntranceAnalysis() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [drills,   setDrills]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [activeTab, setActiveTab] = useState('sessions'); // sessions | drills | subjects

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        // ── 1. Root exam sessions ──────────────────────────────────────────
        const snap = await getDocs(query(
          collection(db, 'entranceExamSessions'),
          where('userId', '==', user.uid),
        ));
        const sessData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        sessData.sort((a, b) => {
          const ta = a.completedAt?.toDate?.()?.getTime?.() ?? 0;
          const tb = b.completedAt?.toDate?.()?.getTime?.() ?? 0;
          return tb - ta;
        });
        setSessions(sessData);

        // ── 2. Subject drills ──────────────────────────────────────────────
        let drillSnap;
        try {
          drillSnap = await getDocs(query(
            collection(db, 'users', user.uid, 'entranceSubjectDrills'),
            orderBy('createdAt', 'desc'),
            limit(100),
          ));
        } catch {
          drillSnap = await getDocs(
            collection(db, 'users', user.uid, 'entranceSubjectDrills')
          );
        }
        const drillData = drillSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        drillData.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
          const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
          return tb - ta;
        });
        setDrills(drillData);
      } catch (e) {
        console.error('EntranceAnalysis load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  // ── Compute stats ──────────────────────────────────────────────────────────
  const totalSessions   = sessions.length;
  const totalDrills     = drills.length;
  const totalExams      = totalSessions + totalDrills;

  // Session-based stats
  const sessionScores   = sessions.map(s => s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1));
  const avgScore        = totalSessions ? Math.round(sessionScores.reduce((a, b) => a + b, 0) / totalSessions) : 0;
  const bestScore       = totalSessions ? Math.max(...sessionScores) : 0;
  const passCount       = sessions.filter(s => (s.scorePercent ?? 0) >= 50).length;
  const passRate        = totalSessions ? Math.round((passCount / totalSessions) * 100) : 0;
  const totalQsDone     = sessions.reduce((s, x) => s + (x.totalQuestions || 0), 0)
                        + drills.reduce((s, x) => s + (x.totalQuestions || 0), 0);
  const totalCorrect    = sessions.reduce((s, x) => s + (x.correct || 0), 0)
                        + drills.reduce((s, x) => s + (x.correct || 0), 0);

  // Trend: last 10 sessions for sparkline
  const trend = sessions.slice(0, 10).reverse().map(s => s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1));

  // ── Per exam-type breakdown (from sessions) ────────────────────────────────
  const examTypeMap = {};
  sessions.forEach(s => {
    const t = (s.examType || 'unknown').replace(/_/g, ' ');
    if (!examTypeMap[t]) examTypeMap[t] = { scores: [], count: 0, correct: 0, total: 0 };
    const p = s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1);
    examTypeMap[t].scores.push(p);
    examTypeMap[t].count++;
    examTypeMap[t].correct += s.correct || 0;
    examTypeMap[t].total   += s.totalQuestions || 0;
  });
  const examTypes = Object.entries(examTypeMap).map(([name, v]) => ({
    name,
    avgScore:     Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
    sessionCount: v.count,
    correct:      v.correct,
    total:        v.total,
  })).sort((a, b) => b.avgScore - a.avgScore);

  // ── Per subject breakdown (from drills) ────────────────────────────────────
  const subjectMap = {};
  drills.forEach(d => {
    const sub = d.subject || 'Unknown';
    if (!subjectMap[sub]) subjectMap[sub] = { scores: [], correct: 0, total: 0, count: 0 };
    const p = d.score ?? pct(d.correct || 0, d.totalQuestions || 1);
    subjectMap[sub].scores.push(p);
    subjectMap[sub].correct += d.correct || 0;
    subjectMap[sub].total   += d.totalQuestions || 0;
    subjectMap[sub].count++;
  });
  const subjectStats = Object.entries(subjectMap).map(([name, v]) => ({
    name,
    avgScore:     Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
    sessionCount: v.count,
    correct:      v.correct,
    total:        v.total,
  })).sort((a, b) => a.avgScore - b.avgScore);

  const weakSubjects   = subjectStats.filter(s => s.avgScore < 50);
  const strongSubjects = subjectStats.filter(s => s.avgScore >= 70);

  // ── Loading / empty ────────────────────────────────────────────────────────
  if (loading) return (
    <PageShell title="Analysis" subtitle="Your performance trends">
      <Spinner />
    </PageShell>
  );

  if (totalExams === 0) return (
    <PageShell title="Analysis" subtitle="Your performance trends">
      <EmptyState
        icon="📊"
        title="No Data Yet"
        sub="Complete some exams and subject drills to unlock your performance analysis."
        action="Start Practising"
        onAction={() => navigate('/entrance-exam')}
      />
    </PageShell>
  );

  const TabBtn = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
        fontWeight: 700, fontSize: 13, fontFamily: F,
        background: activeTab === id ? 'var(--teal)' : 'var(--bg-tertiary)',
        color: activeTab === id ? '#fff' : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );

  return (
    <PageShell title="📊 My Performance Analytics" subtitle={`Based on ${totalSessions} exam${totalSessions !== 1 ? 's' : ''} + ${totalDrills} drill${totalDrills !== 1 ? 's' : ''}`}>

      {/* ── Top stat cards ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Exams Taken',     value: totalSessions,    icon: '📝', color: '#0D9488', bg: 'rgba(13,148,136,0.12)' },
          { label: 'Drills Done',     value: totalDrills,      icon: '📚', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
          { label: 'Average Score',   value: `${avgScore}%`,   icon: '📊', color: '#2563EB', bg: 'rgba(37,99,235,0.12)'  },
          { label: 'Best Score',      value: `${bestScore}%`,  icon: '🏆', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
          { label: 'Pass Rate',       value: `${passRate}%`,   icon: '✅', color: '#16A34A', bg: 'rgba(22,163,74,0.12)'  },
          { label: 'Questions Done',  value: totalQsDone,      icon: '❓', color: '#0891B2', bg: 'rgba(8,145,178,0.12)'  },
          { label: 'Correct Answers', value: totalCorrect,     icon: '✔️', color: '#EC4899', bg: 'rgba(236,72,153,0.12)' },
          { label: 'Grade',           value: grade(avgScore),  icon: '🎯', color: '#D97706', bg: 'rgba(217,119,6,0.12)'  },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border)',
            borderRadius: 14,
            padding: '16px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: s.bg, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: s.color, fontFamily: H, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, fontFamily: F, marginTop: 4 }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Score trend sparkline ───────────────────────────────────────────── */}
      {trend.length > 1 && (
        <SCard style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15, fontFamily: F, color: 'var(--text-primary)' }}>
            📈 Score Trend (Last {trend.length} Exams)
          </div>
          <MiniBarChart data={trend} />
          <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
            {[['#16A34A','70%+ Strong'],['#F59E0B','50–69% Pass'],['#EF4444','Below 50%']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>{label}</span>
              </div>
            ))}
          </div>
        </SCard>
      )}

      {/* ── Breakdown tabs ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <TabBtn id="sessions" label="⚡ By Exam Type" />
        <TabBtn id="drills"   label="📚 By Subject" />
        <TabBtn id="areas"    label="⚠️ Weak & Strong" />
      </div>

      {/* ── By Exam Type ────────────────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        <SCard style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18, fontFamily: F, color: 'var(--text-primary)' }}>
            ⚡ Performance by Exam Type (Mock Sessions)
          </div>
          {examTypes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
              No exam session data yet. Complete a daily mock or school exam.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {examTypes.map(t => (
                <div key={t.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: F, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                      {t.name}
                    </span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
                        {t.sessionCount} session{t.sessionCount !== 1 ? 's' : ''} · {t.correct}/{t.total} correct
                      </span>
                      <span style={{
                        fontWeight: 700, fontSize: 14, fontFamily: F,
                        color: gradeColor(t.avgScore),
                      }}>{t.avgScore}%</span>
                    </div>
                  </div>
                  <div style={{ height: 9, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${t.avgScore}%`,
                      background: gradeColor(t.avgScore),
                      borderRadius: 4, transition: 'width 0.8s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SCard>
      )}

      {/* ── By Subject ──────────────────────────────────────────────────────── */}
      {activeTab === 'drills' && (
        <SCard style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18, fontFamily: F, color: 'var(--text-primary)' }}>
            📚 Performance by Subject (Subject Drills)
          </div>
          {subjectStats.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
              No subject drill data yet. Complete a subject drill to see breakdown here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...subjectStats].sort((a, b) => b.avgScore - a.avgScore).map(s => (
                <div key={s.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: F, color: 'var(--text-primary)' }}>
                      {s.name}
                    </span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700 }}>
                        {s.sessionCount} drill{s.sessionCount !== 1 ? 's' : ''} · {s.correct}/{s.total} correct
                      </span>
                      <span style={{
                        fontWeight: 700, fontSize: 14, fontFamily: F,
                        color: gradeColor(s.avgScore),
                      }}>{s.avgScore}%</span>
                    </div>
                  </div>
                  <div style={{ height: 9, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${s.avgScore}%`,
                      background: gradeColor(s.avgScore),
                      borderRadius: 4, transition: 'width 0.8s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SCard>
      )}

      {/* ── Weak & Strong areas ─────────────────────────────────────────────── */}
      {activeTab === 'areas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
          {/* Weak subjects */}
          <SCard>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: '#EF4444', fontFamily: F }}>
              ⚠️ Weak Subjects (Below 50%)
            </div>
            {weakSubjects.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: F, fontWeight: 700 }}>
                Great! No weak subjects identified yet.
              </p>
            ) : weakSubjects.map(s => (
              <ProgressRow
                key={s.name}
                name={s.name}
                avgScore={s.avgScore}
                sessions={s.sessionCount}
                color="#EF4444"
              />
            ))}
          </SCard>

          {/* Strong subjects */}
          <SCard>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: '#16A34A', fontFamily: F }}>
              💪 Strong Subjects (70%+)
            </div>
            {strongSubjects.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: F, fontWeight: 700 }}>
                Keep practising to build strong subjects!
              </p>
            ) : strongSubjects.map(s => (
              <ProgressRow
                key={s.name}
                name={s.name}
                avgScore={s.avgScore}
                sessions={s.sessionCount}
                color="#16A34A"
              />
            ))}
          </SCard>
        </div>
      )}

      {/* ── Recent exam history table ────────────────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, fontFamily: F, color: 'var(--text-primary)' }}>
          🕓 Recent Exam History
        </div>
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1.5px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['Exam / Subject', 'Type', 'Score', 'Correct', 'Date'].map(h => (
                  <th key={h} style={{
                    padding: '12px 14px', textAlign: 'left',
                    fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    borderBottom: '1.5px solid var(--border)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Sessions */}
              {sessions.slice(0, 10).map(s => {
                const p = s.scorePercent ?? pct(s.correct || 0, s.totalQuestions || 1);
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: F }}>
                      {s.examName || s.subject || 'Entrance Exam'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: 'rgba(13,148,136,0.12)', color: 'var(--teal)',
                        border: '1px solid rgba(13,148,136,0.3)', fontFamily: F,
                        textTransform: 'capitalize', whiteSpace: 'nowrap',
                      }}>
                        {(s.examType || 'mock').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: gradeColor(p), fontFamily: F }}>{p}%</span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: F, fontWeight: 700 }}>
                      {s.correct ?? '—'}/{s.totalQuestions ?? '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {s.completedAt?.toDate ? new Date(s.completedAt.toDate()).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
              {/* Drills */}
              {drills.slice(0, 5).map(d => {
                const p = d.score ?? pct(d.correct || 0, d.totalQuestions || 1);
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(124,58,237,0.03)' }}>
                    <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: F }}>
                      📚 {d.subject || 'Subject Drill'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: 'rgba(124,58,237,0.12)', color: '#7C3AED',
                        border: '1px solid rgba(124,58,237,0.3)', fontFamily: F,
                      }}>
                        Subject Drill
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: gradeColor(p), fontFamily: F }}>{p}%</span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: F, fontWeight: 700 }}>
                      {d.correct ?? '—'}/{d.totalQuestions ?? '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {d.createdAt?.toDate ? new Date(d.createdAt.toDate()).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, fontFamily: F, fontWeight: 700 }}>
          Showing up to 10 recent exams + 5 recent drills. Go to <strong>My Results</strong> to see full history.
        </p>
      </div>

    </PageShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   EntranceLeaderboard
   Reads from entranceExamSessions (root collection) grouped by userId
══════════════════════════════════════════════════════════════════════════════ */
export function EntranceLeaderboard() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [board,        setBoard]       = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [filter,       setFilter]      = useState('month');
  const [error,        setError]       = useState('');
  const [mySchoolName, setMySchoolName] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const cutoff = new Date();
        if      (filter === 'week')  cutoff.setDate(cutoff.getDate() - 7);
        else if (filter === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
        else                         cutoff.setFullYear(2000);

        let mySchool = '';
        if (user?.uid) {
          try {
            const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');
            const uSnap = await getDoc(firestoreDoc(db, 'users', user.uid));
            if (uSnap.exists()) mySchool = uSnap.data().school || '';
          } catch (e) { console.warn('Could not read user school:', e); }
        }

        let snap;
        try {
          if (mySchool) {
            snap = await getDocs(query(
              collection(db, 'entranceExamSessions'),
              where('userSchool', '==', mySchool),
              where('completedAt', '>=', Timestamp.fromDate(cutoff)),
              orderBy('completedAt', 'desc'),
              limit(500),
            ));
          } else {
            snap = await getDocs(query(
              collection(db, 'entranceExamSessions'),
              where('completedAt', '>=', Timestamp.fromDate(cutoff)),
              orderBy('completedAt', 'desc'),
              limit(500),
            ));
          }
        } catch {
          if (mySchool) {
            snap = await getDocs(query(
              collection(db, 'entranceExamSessions'),
              where('userSchool', '==', mySchool),
              limit(500),
            ));
          } else {
            snap = await getDocs(query(
              collection(db, 'entranceExamSessions'),
              orderBy('completedAt', 'desc'),
              limit(500),
            ));
          }
        }

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

        const rows = Object.values(userMap).map(u => ({
          uid:   u.uid,
          name:  u.name,
          avg:   Math.round(u.scores.reduce((a, b) => a + b, 0) / u.scores.length),
          best:  Math.max(...u.scores),
          count: u.scores.length,
        }));

        rows.sort((a, b) => b.avg - a.avg || b.count - a.count);
        setMySchoolName(mySchool);
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterBtn id="week"  label="This Week" />
        <FilterBtn id="month" label="This Month" />
        <FilterBtn id="all"   label="All Time" />
      </div>

      <div style={{ marginBottom: 16, padding: '12px 18px', borderRadius: 12, background: 'var(--blue-glow)', border: '1.5px solid var(--blue-mid)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>🏫</span>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--text-primary)', fontFamily: H }}>
            {mySchoolName ? `${mySchoolName} Leaderboard` : 'All Schools Leaderboard'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', fontFamily: F }}>
            {mySchoolName ? 'Ranked among students from your school only' : 'Set your school in your profile to see school-specific rankings'}
          </div>
        </div>
      </div>

      {myRank > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, var(--teal), var(--blue-deep))',
          borderRadius: 14, padding: '16px 22px', marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#fff', fontFamily: F }}>🎯 Your Rank</span>
          <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: H }}>#{myRank}</span>
        </div>
      )}

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
                <div style={{
                  width: 40, textAlign: 'center', flexShrink: 0,
                  fontWeight: 900, fontSize: i < 3 ? 26 : 16,
                  color: i < 3 ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: i < 3 ? 'inherit' : H,
                }}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>
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
                <div style={{ fontFamily: H, fontWeight: 900, fontSize: 22, color: gradeColor(r.avg) }}>
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
