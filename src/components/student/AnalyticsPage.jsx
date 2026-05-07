// src/components/student/AnalyticsPage.jsx
import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
        ));
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  // Compute stats
  const total       = sessions.length;
  const avgScore    = total ? Math.round(sessions.reduce((s, x) => s + (x.scorePercent || 0), 0) / total) : 0;
  const bestScore   = total ? Math.max(...sessions.map(s => s.scorePercent || 0)) : 0;
  const passCount   = sessions.filter(s => (s.scorePercent || 0) >= 50).length;
  const passRate    = total ? Math.round((passCount / total) * 100) : 0;
  const totalQs     = sessions.reduce((s, x) => s + (x.totalQuestions || 0), 0);
  const totalCorrect= sessions.reduce((s, x) => s + (x.correct || 0), 0);

  // Per category breakdown
  const catStats = NURSING_CATEGORIES.map(cat => {
    const catSessions = sessions.filter(s => s.category === cat.id);
    const avg = catSessions.length ? Math.round(catSessions.reduce((s, x) => s + (x.scorePercent || 0), 0) / catSessions.length) : null;
    return { ...cat, sessionCount: catSessions.length, avgScore: avg };
  }).filter(c => c.sessionCount > 0).sort((a, b) => (a.avgScore || 0) - (b.avgScore || 0));

  // Trend (last 10 exams for sparkline)
  const trend = sessions.slice(0, 10).reverse().map(s => s.scorePercent || 0);

  const weakAreas = catStats.filter(c => c.avgScore !== null && c.avgScore < 60);
  const strongAreas = catStats.filter(c => c.avgScore !== null && c.avgScore >= 70);

  if (loading) return (
    <div className="flex-center" style={{ padding: 60, flexDirection: 'column', gap: 16 }}>
      <div className="spinner" />
      <p style={{ color: 'var(--text-muted)' }}>Loading your performance data…</p>
    </div>
  );

  if (total === 0) return (
    <div style={{ padding: 24, textAlign: 'center', maxWidth: 500, margin: '60px auto' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
      <h3 style={{ fontFamily: "'Playfair Display',serif" }}>No Data Yet</h3>
      <p style={{ color: 'var(--text-muted)' }}>Take some exams to see your performance analytics!</p>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", marginBottom: 6 }}>📊 My Performance Analytics</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
        Based on {total} exam{total !== 1 ? 's' : ''} taken
      </p>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 32 }}>
        {[
          { label: 'Exams Taken',   value: total,        icon: '📝', color: '#0D9488', bg: 'rgba(13,148,136,0.12)' },
          { label: 'Average Score', value: `${avgScore}%`, icon: '📊', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
          { label: 'Best Score',    value: `${bestScore}%`,icon: '🏆', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
          { label: 'Pass Rate',     value: `${passRate}%`, icon: '✅', color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
          { label: 'Questions Done',value: totalQs,       icon: '❓', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
          { label: 'Correct Answers',value: totalCorrect, icon: '✔️', color: '#0891B2', bg: 'rgba(8,145,178,0.12)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg }}><span>{s.icon}</span></div>
            <div>
              <div className="stat-value" style={{ color: s.color, fontSize: '1.5rem' }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Score trend */}
      {trend.length > 1 && (
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>📈 Score Trend (Last {trend.length} Exams)</div>
          <MiniBarChart data={trend} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 24, marginBottom: 28 }}>
        {/* Weak areas */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--red)' }}>
            ⚠️ Weak Areas (Below 60%)
          </div>
          {weakAreas.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Great! No weak areas identified yet.</p>
          ) : weakAreas.map(c => (
            <ProgressRow key={c.id} cat={c} color="var(--red)" />
          ))}
        </div>
        {/* Strong areas */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--green)' }}>
            💪 Strong Areas (70%+)
          </div>
          {strongAreas.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Keep practicing to build strong areas!</p>
          ) : strongAreas.map(c => (
            <ProgressRow key={c.id} cat={c} color="var(--green)" />
          ))}
        </div>
      </div>

      {/* Full category breakdown */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>🏥 Performance by Category</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {catStats.map(c => (
            <div key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {c.icon} {c.shortLabel}
                </span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.sessionCount} exam{c.sessionCount !== 1 ? 's' : ''}</span>
                  <span style={{
                    fontWeight: 700, fontSize: 14,
                    color: c.avgScore >= 70 ? 'var(--green)' : c.avgScore >= 50 ? 'var(--gold)' : 'var(--red)',
                  }}>
                    {c.avgScore}%
                  </span>
                </div>
              </div>
              <div className="progress-bar">
                <div className="progress-fill"
                  style={{
                    width: `${c.avgScore}%`,
                    background: c.avgScore >= 70 ? 'var(--green)' : c.avgScore >= 50 ? 'var(--gold)' : 'var(--red)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent exams table */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontFamily: "'Playfair Display',serif", marginBottom: 14 }}>🕓 Recent Exam History</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Category</th><th>Type</th><th>Score</th><th>Correct</th><th>Date</th></tr>
            </thead>
            <tbody>
              {sessions.slice(0, 15).map(s => {
                const cat = NURSING_CATEGORIES.find(c => c.id === s.category);
                return (
                  <tr key={s.id}>
                    <td>{cat?.icon} {cat?.shortLabel || s.category}</td>
                    <td><span className="badge badge-teal" style={{ fontSize: 10 }}>{s.examType}</span></td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: s.scorePercent >= 70 ? 'var(--green)' : s.scorePercent >= 50 ? 'var(--gold)' : 'var(--red)',
                      }}>
                        {s.scorePercent || 0}%
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{s.correct}/{s.totalQuestions}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.completedAt?.toDate ? new Date(s.completedAt.toDate()).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProgressRow({ cat, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.icon} {cat.shortLabel}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color }}>{cat.avgScore}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${cat.avgScore}%`, background: color }} />
      </div>
    </div>
  );
}

function MiniBarChart({ data }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%', borderRadius: '4px 4px 0 0',
            height: `${(v / max) * 70}px`,
            background: v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--gold)' : 'var(--red)',
            transition: 'height 0.6s ease',
            minHeight: 4,
          }} title={`${v}%`} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{v}%</span>
        </div>
      ))}
    </div>
  );
}
