// src/components/student/PerformanceMonitorPage.jsx
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, query, where, orderBy, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 14, r = 8 }) {
  return (
    <>
      <style>{`@keyframes pmShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{
        width: w, height: h, borderRadius: r,
        background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)',
        backgroundSize: '200% 100%', animation: 'pmShimmer 1.4s infinite',
      }} />
    </>
  );
}

// ── Score badge colour ────────────────────────────────────────────────────────
function scoreColor(pct) {
  if (pct >= 70) return { bg: 'rgba(16,185,129,0.12)', text: '#10B981', label: 'Strong' };
  if (pct >= 50) return { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', label: 'Fair'   };
  return           { bg: 'rgba(239,68,68,0.12)',  text: '#EF4444', label: 'Needs Work' };
}

// ── Horizontal bar ────────────────────────────────────────────────────────────
function Bar({ pct, color, animated }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!animated) { setW(pct); return; }
    const t = setTimeout(() => setW(pct), 80);
    return () => clearTimeout(t);
  }, [pct, animated]);
  return (
    <div style={{ height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{
        height: '100%', borderRadius: 4, background: color,
        width: `${w}%`, transition: 'width 1s cubic-bezier(.4,0,.2,1)',
      }} />
    </div>
  );
}

// ── Score ring (SVG) ──────────────────────────────────────────────────────────
function Ring({ pct, color, size = 80 }) {
  const r = 30, circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => { const t = setTimeout(() => setDash((pct / 100) * circ), 300); return () => clearTimeout(t); }, [pct, circ]);
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={circ - dash} strokeLinecap="round"
        transform="rotate(-90 40 40)"
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)' }}
      />
      <text x="40" y="45" textAnchor="middle" fill={color} fontSize="14" fontWeight="800">{pct}%</text>
    </svg>
  );
}

// ── Fade-in card ──────────────────────────────────────────────────────────────
function FCard({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(14px)',
      transition: 'opacity .5s ease, transform .5s ease', ...s,
    }}>
      {children}
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function Tab({ active, onClick, icon, label, color }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontFamily: F,
      fontWeight: 700, fontSize: 13, border: 'none',
      background: active ? color + '22' : 'transparent',
      color: active ? color : 'var(--text-muted)',
      borderBottom: active ? `2.5px solid ${color}` : '2.5px solid transparent',
      transition: 'all .2s',
    }}>
      {icon} {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
// ── Score Trend Chart (pure SVG, no deps) ─────────────────────────────────────
function TrendChart({ data }) {
  const W = 600, H = 180, PAD = { top: 16, right: 16, bottom: 36, left: 36 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top  - PAD.bottom;

  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 100); return () => clearTimeout(t); }, []);

  if (!data || data.length < 2) return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
      Complete at least 2 exams to see your trend line.
    </div>
  );

  const scores = data.map(d => d.score);
  const minS = Math.max(0,  Math.min(...scores) - 10);
  const maxS = Math.min(100, Math.max(...scores) + 10);
  const range = maxS - minS || 1;

  const px = (i) => PAD.left + (i / (data.length - 1)) * iW;
  const py = (s) => PAD.top + iH - ((s - minS) / range) * iH;

  const points = data.map((d, i) => `${px(i)},${py(d.score)}`).join(' ');
  const fill   = data.map((d, i) => `${px(i)},${py(d.score)}`).join(' ')
               + ` ${px(data.length - 1)},${PAD.top + iH} ${px(0)},${PAD.top + iH}`;

  const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const avgY     = py(avgScore);

  const gridLines = [25, 50, 75].filter(v => v >= minS && v <= maxS);

  const [hovered, setHovered] = useState(null);

  const lineColor = avgScore >= 70 ? '#10B981' : avgScore >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 300, display: 'block' }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="trendClip">
            <rect x={PAD.left} y={PAD.top} width={iW} height={iH} />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {gridLines.map(v => (
          <g key={v}>
            <line x1={PAD.left} y1={py(v)} x2={PAD.left + iW} y2={py(v)}
              stroke="var(--border)" strokeWidth="1" strokeDasharray="4,4" />
            <text x={PAD.left - 6} y={py(v) + 4} textAnchor="end"
              fill="var(--text-muted)" fontSize="9">{v}%</text>
          </g>
        ))}

        {/* Avg line */}
        <line x1={PAD.left} y1={avgY} x2={PAD.left + iW} y2={avgY}
          stroke={lineColor} strokeWidth="1" strokeDasharray="6,4" opacity="0.4" />
        <text x={PAD.left + iW + 4} y={avgY + 4} fill={lineColor} fontSize="9" fontWeight="700">
          avg {avgScore}%
        </text>

        {/* Fill */}
        <polygon points={fill} fill="url(#trendFill)" clipPath="url(#trendClip)" />

        {/* Line */}
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" clipPath="url(#trendClip)"
          style={{ transition: animated ? 'none' : 'stroke-dashoffset 1.5s ease' }} />

        {/* Data points */}
        {data.map((d, i) => {
          const cx = px(i), cy = py(d.score);
          const col = d.score >= 70 ? '#10B981' : d.score >= 50 ? '#F59E0B' : '#EF4444';
          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={cx} cy={cy} r={hovered === i ? 7 : 4} fill={col}
                stroke="var(--bg-card)" strokeWidth="2"
                style={{ transition: 'r .15s' }} />
              {/* Hover label */}
              {hovered === i && (
                <g>
                  <rect x={cx - 28} y={cy - 30} width={56} height={22} rx={6}
                    fill="var(--bg-card)" stroke={col} strokeWidth="1" />
                  <text x={cx} y={cy - 14} textAnchor="middle" fill={col}
                    fontSize="11" fontWeight="800">{d.score}%</text>
                </g>
              )}
            </g>
          );
        })}

        {/* X-axis date labels (every ~4 points) */}
        {data.map((d, i) => {
          if (i % Math.max(1, Math.floor(data.length / 5)) !== 0 && i !== data.length - 1) return null;
          const label = d.date?.toLocaleDateString?.('en-NG', { day: 'numeric', month: 'short' }) || '';
          return (
            <text key={i} x={px(i)} y={H - 6} textAnchor="middle"
              fill="var(--text-muted)" fontSize="9">{label}</text>
          );
        })}
      </svg>
    </div>
  );
}

export default function PerformanceMonitorPage() {
  const { user } = useAuth();

  const [sessions,   setSessions]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('daily'); // 'daily' | 'course' | 'topic'
  const [expandedCourse, setExpandedCourse] = useState(null);

  // ── Load all exam sessions for this user ─────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
          orderBy('completedAt', 'desc'),
        ));
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('PerformanceMonitor load error:', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // ── Daily Practice — group by category ──────────────────────────────────────
  const dailyStats = useMemo(() => {
    const daily = sessions.filter(s => s.examType === 'daily_practice');
    if (!daily.length) return [];

    // Aggregate per category from session-level category field
    // Also try to aggregate from per-question breakdown if it exists (categoryBreakdown field)
    const map = {};

    daily.forEach(s => {
      // If session stores a categoryBreakdown object: { medSurg: { correct:3, total:5 }, ... }
      if (s.categoryBreakdown && typeof s.categoryBreakdown === 'object') {
        Object.entries(s.categoryBreakdown).forEach(([catId, data]) => {
          if (!map[catId]) map[catId] = { correct: 0, total: 0, sessions: 0 };
          map[catId].correct  += data.correct || 0;
          map[catId].total    += data.total   || 0;
          map[catId].sessions += 1;
        });
      } else {
        // Fallback: session-level category + score
        const catId = s.category || 'unknown';
        if (!map[catId]) map[catId] = { correct: 0, total: 0, sessions: 0 };
        const total   = s.totalQuestions || s.questionCount || 0;
        const correct = s.correctCount   || Math.round((s.scorePercent || 0) / 100 * total);
        map[catId].correct  += correct;
        map[catId].total    += total;
        map[catId].sessions += 1;
      }
    });

    return Object.entries(map)
      .map(([catId, data]) => {
        const cat = NURSING_CATEGORIES.find(c => c.id === catId);
        const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
        return { catId, cat, pct, ...data };
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [sessions]);

  // ── Course Drill — group by course, then by topic within course ──────────────
  const courseStats = useMemo(() => {
    const drills = sessions.filter(s => s.examType === 'course_drill' || s.examType === 'topic_drill');
    if (!drills.length) return [];

    const courseMap = {};

    drills.forEach(s => {
      const courseId    = s.course    || s.category || 'unknown';
      const courseLabel = s.courseLabel || s.category || courseId;
      const topic       = s.topic || null;
      const total       = s.totalQuestions || s.questionCount || 0;
      const correct     = s.correctCount   || Math.round((s.scorePercent || 0) / 100 * total);

      if (!courseMap[courseId]) {
        courseMap[courseId] = { courseId, courseLabel, correct: 0, total: 0, sessions: 0, topics: {} };
      }
      courseMap[courseId].correct  += correct;
      courseMap[courseId].total    += total;
      courseMap[courseId].sessions += 1;

      if (topic) {
        if (!courseMap[courseId].topics[topic]) {
          courseMap[courseId].topics[topic] = { correct: 0, total: 0, sessions: 0 };
        }
        courseMap[courseId].topics[topic].correct  += correct;
        courseMap[courseId].topics[topic].total    += total;
        courseMap[courseId].topics[topic].sessions += 1;
      }
    });

    return Object.values(courseMap)
      .map(c => ({
        ...c,
        pct: c.total > 0 ? Math.round((c.correct / c.total) * 100) : 0,
        topics: Object.entries(c.topics)
          .map(([name, d]) => ({
            name,
            pct: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
            ...d,
          }))
          .sort((a, b) => b.pct - a.pct),
      }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [sessions]);

  // ── Overall summary numbers ──────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!sessions.length) return null;
    const completed = sessions.filter(s => s.scorePercent !== undefined);
    const avg = completed.length
      ? Math.round(completed.reduce((s, r) => s + (r.scorePercent || 0), 0) / completed.length)
      : 0;
    const strong   = dailyStats.filter(d => d.pct >= 70).length;
    const needWork = dailyStats.filter(d => d.pct <  50).length;
    return { total: completed.length, avg, strong, needWork };
  }, [sessions, dailyStats]);

  // ── Score trend (last 20 exams, chronological) ───────────────────────────
  const trendData = useMemo(() => {
    const completed = sessions
      .filter(s => s.scorePercent !== undefined)
      .sort((a, b) => {
        const ta = a.completedAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.completedAt?.toDate?.()?.getTime?.() ?? 0;
        return ta - tb;
      })
      .slice(-20);
    return completed.map(s => ({
      score: s.scorePercent,
      date: s.completedAt?.toDate ? s.completedAt.toDate() : new Date(),
      label: s.examName || s.examType || '',
    }));
  }, [sessions]);

  // ── Weak topic alerts (< 50% across ≥ 2 sessions) ────────────────────────
  const weakAlerts = useMemo(() => {
    const alerts = [];
    // From daily stats
    dailyStats.forEach(d => {
      if (d.pct < 50 && d.sessions >= 2) {
        alerts.push({ icon: d.icon || '⚡', label: d.label, pct: d.pct, sessions: d.sessions, type: 'daily' });
      }
    });
    // From course stats
    courseStats.forEach(c => {
      if (c.total > 0 && Math.round((c.correct / c.total) * 100) < 50 && c.sessions >= 2) {
        const pct = Math.round((c.correct / c.total) * 100);
        alerts.push({ icon: '📖', label: c.courseLabel || c.courseId, pct, sessions: c.sessions, type: 'course' });
      }
    });
    return alerts.sort((a, b) => a.pct - b.pct).slice(0, 5);
  }, [dailyStats, courseStats]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 1100 }}>

      {/* ── Page header ── */}
      <FCard delay={0}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
            📊 Analytics
          </div>
          <h2 style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontSize: 'clamp(1.3rem,3vw,1.8rem)', margin: 0, color: 'var(--text-primary)' }}>
            Performance Monitor
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
            See where you're excelling and where you need more practice.
          </p>
        </div>
      </FCard>

      {/* ── Summary cards ── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 28 }}>
          {[1,2,3,4].map(k => <Skeleton key={k} h={88} r={14} />)}
        </div>
      ) : summary ? (
        <FCard delay={100} style={{ marginBottom: 28 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
            {[
              { icon: '📝', label: 'Total Exams',     value: summary.total,    color: '#0D9488', bg: 'rgba(13,148,136,0.1)'  },
              { icon: '📊', label: 'Average Score',   value: `${summary.avg}%`, color: '#2563EB', bg: 'rgba(37,99,235,0.1)'  },
              { icon: '💪', label: 'Strong Courses',  value: summary.strong,   color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
              { icon: '⚠️', label: 'Need Improvement',value: summary.needWork, color: '#EF4444', bg: 'rgba(239,68,68,0.1)'  },
            ].map((c, i) => (
              <FCard key={c.label} delay={150 + i * 60}>
                <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    {c.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontWeight: 600 }}>{c.label}</div>
                  </div>
                </div>
              </FCard>
            ))}
          </div>
        </FCard>
      ) : null}

      {/* ── Tab switcher ── */}
      <FCard delay={200} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          <Tab active={activeTab === 'trends'} onClick={() => setActiveTab('trends')} icon="📈" label="Score Trend"      color="#8B5CF6" />
          <Tab active={activeTab === 'daily'}  onClick={() => setActiveTab('daily')}  icon="⚡" label="Daily Practice"  color="#F59E0B" />
          <Tab active={activeTab === 'course'} onClick={() => setActiveTab('course')} icon="📖" label="Course Drill"    color="#0D9488" />
          <Tab active={activeTab === 'topic'}  onClick={() => setActiveTab('topic')}  icon="🎯" label="Topic Breakdown" color="#2563EB" />
        </div>
      </FCard>

      {/* ── Loading skeletons ── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3,4,5].map(k => <Skeleton key={k} h={64} r={12} />)}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* TAB: SCORE TREND                                                       */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'trends' && (
        <FCard delay={100}>
          {/* Weak topic alerts */}
          {weakAlerts.length > 0 && (
            <div style={{
              marginBottom: 24, background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: 18,
            }}>
              <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: '#EF4444', marginBottom: 12 }}>
                ⚠️ Areas Needing Attention
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {weakAlerts.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'var(--bg-card)', borderRadius: 10, padding: '10px 14px',
                    border: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 18 }}>{a.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{a.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {a.pct}% avg · {a.sessions} session{a.sessions !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                      background: 'rgba(239,68,68,0.12)', color: '#EF4444',
                    }}>
                      Practice now →
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trend chart */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '20px 16px',
          }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
              📈 Score Trend — Last {trendData.length} Exams
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Each dot is one completed exam. Hover for the score.
            </div>
            <TrendChart data={trendData} />
          </div>

          {/* Improvement delta */}
          {trendData.length >= 2 && (() => {
            const first = trendData[0].score;
            const last  = trendData[trendData.length - 1].score;
            const delta = last - first;
            const color = delta >= 0 ? '#10B981' : '#EF4444';
            return (
              <div style={{
                marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{
                  flex: 1, minWidth: 120, background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color }}>{delta >= 0 ? '+' : ''}{delta}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Overall change</div>
                </div>
                <div style={{
                  flex: 1, minWidth: 120, background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#F59E0B' }}>
                    {Math.round(trendData.reduce((s, d) => s + d.score, 0) / trendData.length)}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Average</div>
                </div>
                <div style={{
                  flex: 1, minWidth: 120, background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#10B981' }}>
                    {Math.max(...trendData.map(d => d.score))}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Best score</div>
                </div>
              </div>
            );
          })()}
        </FCard>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* TAB: DAILY PRACTICE — by course/category                              */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'daily' && (
        <>
          {dailyStats.length === 0 ? (
            <EmptyState
              icon="⚡"
              title="No Daily Practice data yet"
              sub="Complete some Daily Practice exams to see your course breakdown."
              linkTo="/daily-practice"
              linkLabel="Start Daily Practice"
            />
          ) : (
            <>
              {/* Strong courses */}
              <Section title="💪 Strong Courses" subtitle="Scoring 70% and above" delay={250}>
                {dailyStats.filter(d => d.pct >= 70).length === 0
                  ? <NoneYet msg="Keep practising — strong courses will appear here once you hit 70%." />
                  : dailyStats.filter(d => d.pct >= 70).map((d, i) => (
                      <CourseRow key={d.catId} data={d} rank={i + 1} delay={300 + i * 50} animated />
                    ))
                }
              </Section>

              {/* Fair courses */}
              {dailyStats.filter(d => d.pct >= 50 && d.pct < 70).length > 0 && (
                <Section title="📈 Making Progress" subtitle="Scoring between 50–69%" delay={400}>
                  {dailyStats.filter(d => d.pct >= 50 && d.pct < 70).map((d, i) => (
                    <CourseRow key={d.catId} data={d} rank={i + 1} delay={450 + i * 50} animated />
                  ))}
                </Section>
              )}

              {/* Needs work */}
              <Section title="⚠️ Needs Improvement" subtitle="Scoring below 50% — focus here!" delay={550} accent="#EF4444">
                {dailyStats.filter(d => d.pct < 50).length === 0
                  ? <NoneYet msg="Great — no weak courses detected!" positive />
                  : dailyStats.filter(d => d.pct < 50).map((d, i) => (
                      <CourseRow key={d.catId} data={d} rank={i + 1} delay={600 + i * 50} animated />
                    ))
                }
              </Section>
            </>
          )}
        </>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* TAB: COURSE DRILL — by course with topic breakdown                    */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'course' && (
        <>
          {courseStats.length === 0 ? (
            <EmptyState
              icon="📖"
              title="No Course Drill data yet"
              sub="Complete some Course Drill exams to see your performance by course."
              linkTo="/course-drill"
              linkLabel="Start Course Drill"
            />
          ) : (
            <FCard delay={250}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {courseStats.map((c, i) => {
                  const sc = scoreColor(c.pct);
                  const isOpen = expandedCourse === c.courseId;
                  return (
                    <FCard key={c.courseId} delay={280 + i * 60}>
                      <div style={{
                        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                        borderRadius: 14, overflow: 'hidden',
                      }}>
                        {/* Course header row — clickable to expand */}
                        <div
                          onClick={() => setExpandedCourse(isOpen ? null : c.courseId)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            padding: '16px 18px', cursor: 'pointer',
                            borderLeft: `4px solid ${sc.text}`,
                          }}
                        >
                          <Ring pct={c.pct} color={sc.text} size={64} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
                              {c.courseLabel}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>
                                {sc.label}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {c.correct}/{c.total} correct · {c.sessions} session{c.sessions !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 18, transition: 'transform .25s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                            ▾
                          </div>
                        </div>

                        {/* Topic breakdown — expandable */}
                        {isOpen && (
                          <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--bg-secondary)' }}>
                            {c.topics.length === 0 ? (
                              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
                                No topic-level data recorded for this course yet. Use Topic Drill for detailed breakdown.
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  Topic Breakdown
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  {c.topics.map((t, ti) => {
                                    const ts = scoreColor(t.pct);
                                    return (
                                      <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 8, background: ts.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: ts.text, flexShrink: 0 }}>
                                          {ti + 1}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</span>
                                            <span style={{ fontSize: 12, fontWeight: 800, color: ts.text }}>{t.pct}%</span>
                                          </div>
                                          <Bar pct={t.pct} color={ts.text} animated />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </FCard>
                  );
                })}
              </div>
            </FCard>
          )}
        </>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* TAB: TOPIC BREAKDOWN — flat list of all topics across all courses      */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'topic' && (
        <>
          {courseStats.every(c => c.topics.length === 0) ? (
            <EmptyState
              icon="🎯"
              title="No Topic Drill data yet"
              sub="Use Topic Drill to practise specific topics and see your detailed breakdown here."
              linkTo="/topic-drill"
              linkLabel="Start Topic Drill"
            />
          ) : (
            <>
              {/* Flatten all topics from all courses */}
              {(() => {
                const allTopics = courseStats.flatMap(c =>
                  c.topics.map(t => ({ ...t, courseLabel: c.courseLabel }))
                ).sort((a, b) => b.pct - a.pct);

                const strong   = allTopics.filter(t => t.pct >= 70);
                const fair     = allTopics.filter(t => t.pct >= 50 && t.pct < 70);
                const needWork = allTopics.filter(t => t.pct < 50);

                return (
                  <>
                    <Section title="💪 Strong Topics" subtitle="Scoring 70% and above" delay={250}>
                      {strong.length === 0
                        ? <NoneYet msg="Keep practising — strong topics will appear here once you hit 70%." />
                        : strong.map((t, i) => <TopicRow key={`${t.courseLabel}-${t.name}`} t={t} rank={i + 1} delay={300 + i * 40} />)
                      }
                    </Section>

                    {fair.length > 0 && (
                      <Section title="📈 Making Progress" subtitle="Scoring between 50–69%" delay={400}>
                        {fair.map((t, i) => <TopicRow key={`${t.courseLabel}-${t.name}`} t={t} rank={i + 1} delay={450 + i * 40} />)}
                      </Section>
                    )}

                    <Section title="⚠️ Needs Improvement" subtitle="Scoring below 50% — focus here!" delay={550} accent="#EF4444">
                      {needWork.length === 0
                        ? <NoneYet msg="Excellent — no weak topics detected!" positive />
                        : needWork.map((t, i) => <TopicRow key={`${t.courseLabel}-${t.name}`} t={t} rank={i + 1} delay={600 + i * 40} />)
                      }
                    </Section>
                  </>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Course row (Daily Practice tab) ──────────────────────────────────────────
function CourseRow({ data, rank, delay, animated }) {
  const sc  = scoreColor(data.pct);
  const cat = data.cat;
  return (
    <FCard delay={delay}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 12, padding: '14px 16px',
        borderLeft: `4px solid ${sc.text}`,
      }}>
        {/* Rank */}
        <div style={{ width: 28, height: 28, borderRadius: 8, background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: sc.text, flexShrink: 0 }}>
          {rank}
        </div>
        {/* Icon */}
        {cat && (
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cat.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            {cat.icon}
          </div>
        )}
        {/* Label + bar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {cat?.shortLabel || data.catId}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: sc.text }}>{data.pct}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bar pct={data.pct} color={sc.text} animated={animated} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
            {data.correct}/{data.total} correct · {data.sessions} session{data.sessions !== 1 ? 's' : ''}
          </div>
        </div>
        {/* Badge */}
        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text, flexShrink: 0 }}>
          {sc.label}
        </span>
      </div>
    </FCard>
  );
}

// ── Topic row (Topic tab) ─────────────────────────────────────────────────────
function TopicRow({ t, rank, delay }) {
  const sc = scoreColor(t.pct);
  return (
    <FCard delay={delay}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 12, padding: '14px 16px',
        borderLeft: `4px solid ${sc.text}`,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: sc.text, flexShrink: 0 }}>
          {rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: sc.text }}>{t.pct}%</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{t.courseLabel}</div>
          <Bar pct={t.pct} color={sc.text} animated />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
            {t.correct}/{t.total} correct · {t.sessions} session{t.sessions !== 1 ? 's' : ''}
          </div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text, flexShrink: 0 }}>
          {sc.label}
        </span>
      </div>
    </FCard>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, delay, accent, children }) {
  return (
    <FCard delay={delay} style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
        paddingBottom: 12, borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: accent || 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </FCard>
  );
}

// ── None-yet message ──────────────────────────────────────────────────────────
function NoneYet({ msg, positive }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 10,
      background: positive ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px dashed ${positive ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
      fontSize: 13, color: positive ? '#10B981' : 'var(--text-muted)', fontWeight: 600,
    }}>
      {positive ? '✅ ' : 'ℹ️ '}{msg}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ icon, title, sub, linkTo, linkLabel }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 340, margin: '0 auto 24px' }}>{sub}</div>
      <Link to={linkTo} className="btn btn-primary">{linkLabel}</Link>
    </div>
  );
}
