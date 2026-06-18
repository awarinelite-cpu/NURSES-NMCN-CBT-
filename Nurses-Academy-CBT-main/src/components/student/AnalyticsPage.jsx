// src/components/student/AnalyticsPage.jsx
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// ─── Polished SVG Line Trend Chart ────────────────────────────────────────────
function LineTrendChart({ data }) {
  if (!data || data.length < 2) return null;
  const W = 600, H_SVG = 160, PAD = { top: 16, right: 16, bottom: 40, left: 44 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H_SVG - PAD.top - PAD.bottom;
  const max = Math.max(...data, 100);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const xOf = i  => PAD.left + (i / (data.length - 1)) * innerW;
  const yOf = v  => PAD.top  + innerH - ((v - min) / range) * innerH;

  const polyline = data.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ');

  // Area fill polygon
  const area = [
    `${xOf(0)},${yOf(min)}`,
    ...data.map((v, i) => `${xOf(i)},${yOf(v)}`),
    `${xOf(data.length - 1)},${yOf(min)}`,
  ].join(' ');

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H_SVG}`}
        style={{ width: '100%', minWidth: 280, display: 'block' }}
        aria-label="Score trend line chart"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0D9488" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0D9488" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#0D9488" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y-axis labels */}
        {yTicks.map(tick => {
          const y = PAD.top + innerH - ((tick - min) / range) * innerH;
          return (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                stroke="rgba(148,163,184,0.12)" strokeWidth="1"
                strokeDasharray={tick === 50 ? '4 3' : undefined}
              />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                fill={tick === 50 ? '#0D9488' : 'rgba(148,163,184,0.55)'}
                fontSize="10" fontFamily="Arial"
              >{tick}%</text>
            </g>
          );
        })}

        {/* 50% pass-line label */}
        <text
          x={W - PAD.right + 2}
          y={PAD.top + innerH - ((50 - min) / range) * innerH + 4}
          fill="#0D9488" fontSize="9" fontFamily="Arial"
        >pass</text>

        {/* Area fill */}
        <polygon points={area} fill="url(#trendFill)" />

        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke="url(#trendLine)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points + X-axis labels */}
        {data.map((v, i) => {
          const x = xOf(i), y = yOf(v);
          const color = v >= 70 ? '#16A34A' : v >= 50 ? '#F59E0B' : '#EF4444';
          const showLabel = data.length <= 10 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="4" fill={color} stroke="var(--bg-card, #0A1F35)" strokeWidth="2" />
              <text x={x} y={H_SVG - 8} textAnchor="middle"
                fill="rgba(148,163,184,0.5)" fontSize="9" fontFamily="Arial"
              >{showLabel ? `#${i + 1}` : ''}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Specialty Question Progress Bar ─────────────────────────────────────────
// Shows "X questions attempted across Y total sessions"
// totalPool is an optional estimate; if null we just show count + bar vs best possible
function SpecialtyProgressBar({ cat, attempted, sessions: sessionCount }) {
  const barPct = Math.min(100, attempted ? Math.min(100, (attempted / Math.max(attempted, 200)) * 100) : 0);
  const color  = cat.color || '#0D9488';

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{cat.icon}</span>
          <span>{cat.shortLabel}</span>
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F }}>
            {sessionCount} exam{sessionCount !== 1 ? 's' : ''}
          </span>
          <span style={{ fontWeight: 800, fontSize: 13, color, fontFamily: H }}>
            {attempted} Qs
          </span>
        </div>
      </div>
      <div style={{
        height: 8, borderRadius: 8, background: 'rgba(148,163,184,0.12)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${barPct}%`,
          background: `linear-gradient(90deg, ${color}, ${color}99)`,
          borderRadius: 8,
          transition: 'width 0.7s cubic-bezier(.4,0,.2,1)',
          minWidth: attempted > 0 ? 6 : 0,
        }} />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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
        ));
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => {
          const ta = a.completedAt?.toDate?.()?.getTime?.() ?? 0;
          const tb = b.completedAt?.toDate?.()?.getTime?.() ?? 0;
          return tb - ta;
        });
        setSessions(docs);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  // Compute summary stats
  const total        = sessions.length;
  const avgScore     = total ? Math.round(sessions.reduce((s, x) => s + (x.scorePercent || 0), 0) / total) : 0;
  const bestScore    = total ? Math.max(...sessions.map(s => s.scorePercent || 0)) : 0;
  const passCount    = sessions.filter(s => (s.scorePercent || 0) >= 50).length;
  const passRate     = total ? Math.round((passCount / total) * 100) : 0;
  const totalQs      = sessions.reduce((s, x) => s + (x.totalQuestions || 0), 0);
  const totalCorrect = sessions.reduce((s, x) => s + (x.correct || 0), 0);

  // Per category breakdown — avg score
  const catStats = NURSING_CATEGORIES.map(cat => {
    const catSessions = sessions.filter(s => s.category === cat.id);
    const avg = catSessions.length
      ? Math.round(catSessions.reduce((s, x) => s + (x.scorePercent || 0), 0) / catSessions.length)
      : null;
    const attempted = catSessions.reduce((s, x) => s + (x.totalQuestions || 0), 0);
    return { ...cat, sessionCount: catSessions.length, avgScore: avg, attempted };
  }).filter(c => c.sessionCount > 0).sort((a, b) => (a.avgScore || 0) - (b.avgScore || 0));

  // Trend (last 10 sessions for sparkline)
  const trend = sessions.slice(0, 10).reverse().map(s => s.scorePercent || 0);

  const weakAreas   = catStats.filter(c => c.avgScore !== null && c.avgScore < 60);
  const strongAreas = catStats.filter(c => c.avgScore !== null && c.avgScore >= 70);

  // All attempted categories — sorted by most questions attempted
  const allCats = [...catStats].sort((a, b) => b.attempted - a.attempted);

  if (loading) return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <style>{`@keyframes anShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{ height: 28, width: 220, borderRadius: 6, marginBottom: 8, background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)', backgroundSize: '200% 100%', animation: 'anShimmer 1.4s infinite' }} />
      <div style={{ height: 14, width: 160, borderRadius: 4, marginBottom: 28, background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)', backgroundSize: '200% 100%', animation: 'anShimmer 1.4s infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14, marginBottom: 28 }}>
        {Array.from({length: 4}).map((_,i) => (
          <div key={i} style={{ background: 'linear-gradient(90deg,#111827 25%,#1e293b 50%,#111827 75%)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 16px', height: 90, backgroundSize: '200% 100%', animation: `anShimmer 1.4s ${i*0.15}s infinite` }} />
        ))}
      </div>
      <div style={{ background: 'linear-gradient(90deg,#111827 25%,#1e293b 50%,#111827 75%)', border: '1px solid var(--border)', borderRadius: 14, height: 180, backgroundSize: '200% 100%', animation: 'anShimmer 1.4s 0.2s infinite' }} />
    </div>
  );

  if (total === 0) return (
    <div style={{ padding: 24, textAlign: 'center', maxWidth: 500, margin: '60px auto' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
      <h3 style={{ fontFamily: H }}>No Data Yet</h3>
      <p style={{ color: 'var(--text-muted)' }}>Take some exams to see your performance analytics!</p>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h2 style={{ fontFamily: H, marginBottom: 6 }}>📊 My Performance Analytics</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, fontFamily: F }}>
        Based on {total} exam{total !== 1 ? 's' : ''} taken
      </p>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 32 }}>
        {[
          { label: 'Exams Taken',     value: total,           icon: '📝', color: '#0D9488', bg: 'rgba(13,148,136,0.12)' },
          { label: 'Average Score',   value: `${avgScore}%`,  icon: '📊', color: '#2563EB', bg: 'rgba(37,99,235,0.12)' },
          { label: 'Best Score',      value: `${bestScore}%`, icon: '🏆', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
          { label: 'Pass Rate',       value: `${passRate}%`,  icon: '✅', color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
          { label: 'Questions Done',  value: totalQs,         icon: '❓', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
          { label: 'Correct Answers', value: totalCorrect,    icon: '✔️', color: '#0891B2', bg: 'rgba(8,145,178,0.12)' },
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

      {/* Score trend — polished SVG line chart */}
      {trend.length > 1 && (
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15, fontFamily: H }}>
            📈 Score Trend — Last {trend.length} Exams
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, marginBottom: 14 }}>
            Dashed line = 50% pass mark
          </div>
          <LineTrendChart data={trend} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 24, marginBottom: 28 }}>
        {/* Weak areas */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--red)', fontFamily: H }}>
            ⚠️ Weak Areas (Below 60%)
          </div>
          {weakAreas.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: F }}>Great! No weak areas identified yet.</p>
          ) : weakAreas.map(c => (
            <ProgressRow key={c.id} cat={c} color="var(--red)" />
          ))}
        </div>

        {/* Strong areas */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--green)', fontFamily: H }}>
            💪 Strong Areas (70%+)
          </div>
          {strongAreas.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: F }}>Keep practising to build strong areas!</p>
          ) : strongAreas.map(c => (
            <ProgressRow key={c.id} cat={c} color="var(--green)" />
          ))}
        </div>
      </div>

      {/* ── Specialty Coverage — questions attempted per specialty ── */}
      {allCats.length > 0 && (
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, fontFamily: H }}>
            🎯 Specialty Coverage
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, marginBottom: 18 }}>
            Total questions attempted per specialty across all exam types
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '0 24px' }}>
            {allCats.map(c => (
              <SpecialtyProgressBar
                key={c.id}
                cat={c}
                attempted={c.attempted}
                sessions={c.sessionCount}
              />
            ))}
          </div>
        </div>
      )}

      {/* Full category breakdown by avg score */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, fontFamily: H }}>🏥 Performance by Specialty</div>
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
        <h3 style={{ fontFamily: H, marginBottom: 14 }}>🕓 Recent Exam History</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Specialty</th><th>Type</th><th>Score</th><th>Correct</th><th>Date</th></tr>
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
