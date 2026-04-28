// src/components/entrance/EntranceExamStubs.jsx
// Stub pages for routes not yet built — renders a "Coming Soon" card
// matching the platform dark theme.

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

// ── Shared shell ─────────────────────────────────────────────────
function StubShell({ icon, title, subtitle, children, backPath = '/entrance-exam' }) {
  const navigate = useNavigate();
  return (
    <div style={s.wrap}>
      <button onClick={() => navigate(backPath)} style={s.back}>← Back to Hub</button>
      <div style={s.card}>
        <div style={s.icon}>{icon}</div>
        <h2 style={s.title}>{title}</h2>
        <p style={s.sub}>{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

// ── Subject Drill ────────────────────────────────────────────────
export function EntranceSubjectDrill() {
  return (
    <StubShell
      icon="📚"
      title="Subject Drill"
      subtitle="Practice entrance exam questions by subject/topic. Pick a subject, set a count, and drill until you're confident."
    >
      <div style={s.badge}>🔨 Coming Soon</div>
      <p style={s.hint}>This feature is being built. Check back shortly!</p>
    </StubShell>
  );
}

// ── My Results ───────────────────────────────────────────────────
export function EntranceMyResults() {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'entranceDailyMock'),
            orderBy('date', 'desc'),
            limit(30)
          )
        );
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setAttempts(list);
      } catch (e) { /* silent */ }
      setLoading(false);
    })();
  }, [user]);

  return (
    <StubShell
      icon="📋"
      title="My Results"
      subtitle="Your entrance exam attempt history."
    >
      {loading ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>Loading…</p>
      ) : attempts.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>
          No attempts yet. Take the Daily Mock to start!
        </p>
      ) : (
        <div style={s.resultList}>
          {attempts.map(a => {
            const color = a.score >= 60 ? '#10B981' : a.score >= 40 ? '#F59E0B' : '#EF4444';
            return (
              <div key={a.id} style={s.resultRow}>
                <span style={s.resultDate}>{a.date}</span>
                <span style={s.resultType}>Daily Mock</span>
                <div style={s.barWrap}>
                  <div style={{ ...s.bar, width: `${a.score}%`, background: color }} />
                </div>
                <span style={{ ...s.resultScore, color }}>{a.score}%</span>
                <span style={s.resultDetail}>{a.correct}/{a.total}</span>
              </div>
            );
          })}
        </div>
      )}
    </StubShell>
  );
}

// ── Exams Taken (same as My Results for now) ─────────────────────
export function EntranceExamsTaken() {
  return <EntranceMyResults />;
}

// ── Bookmarks ────────────────────────────────────────────────────
export function EntranceBookmarks() {
  return (
    <StubShell
      icon="🔖"
      title="Bookmarks"
      subtitle="Questions you've saved while practising entrance exam mocks."
    >
      <div style={s.badge}>🔨 Coming Soon</div>
      <p style={s.hint}>
        Bookmarking will be available once the Subject Drill is live.
        You'll be able to save tricky questions and review them here.
      </p>
    </StubShell>
  );
}

// ── Analysis ─────────────────────────────────────────────────────
export function EntranceAnalysis() {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users', user.uid, 'entranceDailyMock'),
            orderBy('date', 'desc'),
            limit(14)
          )
        );
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setAttempts(list.reverse()); // chronological for chart
      } catch (e) { /* silent */ }
      setLoading(false);
    })();
  }, [user]);

  // Compute weak subjects across all attempts
  const subjectMap = {};
  attempts.forEach(a => {
    (a.breakdown || []).forEach(item => {
      const s = item.subject || 'General';
      if (!subjectMap[s]) subjectMap[s] = { correct: 0, total: 0 };
      subjectMap[s].total++;
      if (item.isCorrect) subjectMap[s].correct++;
    });
  });
  const subjects = Object.entries(subjectMap)
    .map(([name, { correct, total }]) => ({ name, pct: Math.round((correct / total) * 100), total }))
    .sort((a, b) => a.pct - b.pct); // weakest first

  const avg = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length)
    : null;

  return (
    <StubShell
      icon="📈"
      title="Analysis"
      subtitle="Your performance trends and weak areas."
    >
      {loading ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>Loading…</p>
      ) : attempts.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>
          No data yet. Complete some Daily Mocks to see your analysis.
        </p>
      ) : (
        <>
          {/* Score trend mini-chart */}
          <div style={s.trendWrap}>
            <div style={s.trendTitle}>Score Trend ({attempts.length} sessions)</div>
            <div style={s.trendChart}>
              {attempts.map((a, i) => {
                const color = a.score >= 60 ? '#10B981' : a.score >= 40 ? '#F59E0B' : '#EF4444';
                return (
                  <div key={i} style={s.trendBar}>
                    <div style={{ ...s.trendFill, height: `${a.score}%`, background: color }} />
                    <span style={s.trendLabel}>{a.score}%</span>
                  </div>
                );
              })}
            </div>
            {avg !== null && (
              <div style={s.avgLine}>
                Average: <strong style={{ color: avg >= 60 ? '#10B981' : avg >= 40 ? '#F59E0B' : '#EF4444' }}>{avg}%</strong>
              </div>
            )}
          </div>

          {/* Weak subjects */}
          {subjects.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={s.trendTitle}>Subject Performance (weakest first)</div>
              {subjects.map(({ name, pct, total }) => (
                <div key={name} style={s.subRow}>
                  <span style={s.subName}>{name}</span>
                  <div style={s.subBarWrap}>
                    <div style={{
                      ...s.subBar,
                      width: `${pct}%`,
                      background: pct >= 60 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444',
                    }} />
                  </div>
                  <span style={{ ...s.subPct, color: pct >= 60 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444' }}>
                    {pct}%
                  </span>
                  <span style={s.subTotal}>({total}Q)</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </StubShell>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────
export function EntranceLeaderboard() {
  return (
    <StubShell
      icon="🏆"
      title="Leaderboard"
      subtitle="Top-scoring students on the Entrance Exam Daily Mock."
    >
      <div style={s.badge}>🔨 Coming Soon</div>
      <p style={s.hint}>
        Leaderboard rankings will be available once enough students have
        completed the Daily Mock. Keep practising!
      </p>
    </StubShell>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const s = {
  wrap: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '24px 16px 48px',
    color: 'var(--text-primary, #fff)',
    fontFamily: "'Inter', sans-serif",
  },
  back: {
    background: 'none',
    border: 'none',
    color: '#0D9488',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    padding: '0 0 16px',
    display: 'block',
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '32px 28px',
  },
  icon: { fontSize: 48, marginBottom: 8 },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    fontWeight: 700,
    margin: '0 0 8px',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  badge: {
    display: 'inline-block',
    background: 'rgba(245,158,11,0.15)',
    border: '1px solid rgba(245,158,11,0.3)',
    color: '#F59E0B',
    padding: '4px 14px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 12,
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    lineHeight: 1.6,
    marginTop: 8,
  },
  resultList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginTop: 16,
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  resultDate: { width: 90, fontSize: 13, color: 'rgba(255,255,255,0.5)', flexShrink: 0 },
  resultType: {
    width: 80,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.05)',
    padding: '2px 8px',
    borderRadius: 20,
    textAlign: 'center',
    flexShrink: 0,
  },
  barWrap: {
    flex: 1,
    height: 8,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
  resultScore: { width: 42, fontSize: 13, fontWeight: 700, textAlign: 'right' },
  resultDetail: { width: 48, fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'right' },

  trendWrap: {
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: '16px',
    marginTop: 16,
  },
  trendTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  trendChart: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 6,
    height: 80,
  },
  trendBar: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 4,
  },
  trendFill: {
    width: '100%',
    borderRadius: '4px 4px 0 0',
    minHeight: 4,
    transition: 'height 0.4s ease',
  },
  trendLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  avgLine: {
    marginTop: 8,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'right',
  },
  subRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  subName: {
    width: 130,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subBarWrap: {
    flex: 1,
    height: 8,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  subBar: { height: '100%', borderRadius: 4 },
  subPct: { width: 38, fontSize: 13, fontWeight: 700, textAlign: 'right' },
  subTotal: { fontSize: 11, color: 'rgba(255,255,255,0.3)', width: 36, textAlign: 'right' },
};
