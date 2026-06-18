// src/components/student/ProgressWallPage.jsx
// Route: /progress-wall
// Visual mastery dashboard:
//   1. GitHub-style practice heatmap (last 52 weeks)
//   2. Subject mastery bars (0–100%) with colour coding
//   3. Weak topics callout — top 3 with one-tap drill

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

// ── Helpers ──────────────────────────────────────────────────────────────────
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function last52WeeksGrid() {
  const today = new Date(); today.setHours(0,0,0,0);
  // start on the Sunday 364 days ago
  const start = new Date(today); start.setDate(today.getDate() - 363);
  const dow = start.getDay(); // day of week of start
  // pad to previous Sunday
  start.setDate(start.getDate() - dow);

  const weeks = [];
  let cur = new Date(start);
  while (cur <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function scoreColor(pct) {
  if (pct === null) return '#64748B';
  if (pct >= 80) return '#22C55E';
  if (pct >= 60) return '#0D9488';
  if (pct >= 40) return '#F59E0B';
  return '#EF4444';
}

// ── Heatmap cell ─────────────────────────────────────────────────────────────
function HeatCell({ count, date, today }) {
  const [tip, setTip] = useState(false);
  const isFuture = date > today;
  const bg = isFuture ? 'rgba(255,255,255,0.03)'
    : count === 0 ? 'rgba(255,255,255,0.06)'
    : count === 1 ? '#0D948866'
    : count <= 3  ? '#0D9488'
    : '#F59E0B';

  const ds = dateKey(date);
  return (
    <div
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
      style={{
        width: 13, height: 13, borderRadius: 3,
        background: bg, cursor: 'default', position: 'relative',
        flexShrink: 0,
      }}
    >
      {tip && !isFuture && (
        <div style={{
          position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
          background: '#0F172A', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 7, padding: '5px 9px', whiteSpace: 'nowrap', zIndex: 99,
          fontFamily: F, fontSize: 11, color: '#F1F5F9',
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {count} exam{count !== 1 ? 's' : ''} on {ds}
        </div>
      )}
    </div>
  );
}

// ── Subject mastery bar ───────────────────────────────────────────────────────
function MasteryBar({ cat, avg, count, onDrill }) {
  const [hov, setHov] = useState(false);
  const color = scoreColor(avg);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12, padding: '12px 16px',
        transition: 'background 0.2s', marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{cat.icon}</span>
          <div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: 'var(--text-primary)' }}>
              {cat.shortLabel || cat.label}
            </div>
            <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)' }}>
              {count} exam{count !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: H, fontWeight: 900, fontSize: 18, color }}>{avg ?? '—'}%</span>
          <button
            onClick={() => onDrill(cat)}
            style={{
              background: '#0D948822', border: '1px solid #0D948855',
              borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
              fontFamily: H, fontWeight: 900, fontSize: 11, color: '#0D9488',
            }}
          >Drill →</button>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${avg ?? 0}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 4, transition: 'width 1.2s cubic-bezier(.4,0,.2,1)',
        }} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProgressWallPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions,  setSessions]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'examSessions'),
          where('userId', '==', user.uid),
        ));
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [user?.uid]);

  // Build date → count map
  const dayMap = {};
  sessions.forEach(s => {
    if (!s.completedAt) return;
    const d = s.completedAt.toDate ? s.completedAt.toDate() : new Date(s.completedAt);
    const k = dateKey(d);
    dayMap[k] = (dayMap[k] || 0) + 1;
  });

  const weeks = last52WeeksGrid();
  const today = new Date(); today.setHours(0,0,0,0);

  // Subject mastery
  const catData = NURSING_CATEGORIES.map(cat => {
    const cs = sessions.filter(s => s.category === cat.id);
    const avg = cs.length ? Math.round(cs.reduce((a, x) => a + (x.scorePercent || x.score || 0), 0) / cs.length) : null;
    return { cat, avg, count: cs.length };
  }).filter(x => x.count > 0).sort((a, b) => (a.avg ?? 101) - (b.avg ?? 101));

  // Weak topics (avg < 60, at least 2 sessions)
  const weakTopics = catData.filter(x => x.avg !== null && x.avg < 60 && x.count >= 2).slice(0, 3);

  // Total practice days
  const practiceDays = Object.keys(dayMap).length;
  const totalExams   = sessions.length;
  const overallAvg   = totalExams ? Math.round(sessions.reduce((a, x) => a + (x.scorePercent || x.score || 0), 0) / totalExams) : 0;

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Generate month label positions
  const monthLabels = [];
  weeks.forEach((week, wi) => {
    const firstDay = week[0];
    if (firstDay.getDate() <= 7) {
      monthLabels[wi] = MONTH_LABELS[firstDay.getMonth()];
    }
  });

  const handleDrill = (cat) => {
    navigate('/course-drill', { state: { category: cat.id } });
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#0D9488', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: H, fontWeight: 900, fontSize: 13 }}>← Back</button>
        <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.3rem,4vw,2rem)', color: 'var(--text-primary)', margin: 0 }}>📊 Progress Wall</h1>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Practice Days', value: practiceDays, color: '#0D9488', icon: '📅' },
          { label: 'Total Exams',   value: totalExams,   color: '#3B82F6', icon: '📝' },
          { label: 'Avg Score',     value: `${overallAvg}%`, color: scoreColor(overallAvg), icon: '🎯' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '16px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 22, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Practice Heatmap ── */}
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '20px', marginBottom: 24, overflowX: 'auto' }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', marginBottom: 14 }}>📅 Practice History</div>

        {/* Inner wrapper enforces minimum width so content isn't squashed */}
        <div style={{ minWidth: `${weeks.length * 16 + 32}px` }}>
        {/* Month labels */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 4, paddingLeft: 24 }}>
          {weeks.map((_, wi) => (
            <div key={wi} style={{ width: 13, flexShrink: 0, fontFamily: F, fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', overflow: 'visible', whiteSpace: 'nowrap' }}>
              {monthLabels[wi] || ''}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 3 }}>
          {/* Day-of-week labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginRight: 4 }}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} style={{ height: 13, fontFamily: F, fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>{d}</div>
            ))}
          </div>

          {/* Week columns */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {week.map((day, di) => {
                const k = dateKey(day);
                return <HeatCell key={di} count={dayMap[k] || 0} date={day} today={today} />;
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
          <span style={{ fontFamily: F, fontSize: 10, color: 'var(--text-muted)' }}>Less</span>
          {['rgba(255,255,255,0.06)', '#0D948866', '#0D9488', '#F59E0B'].map((c, i) => (
            <div key={i} style={{ width: 13, height: 13, borderRadius: 3, background: c }} />
          ))}
          <span style={{ fontFamily: F, fontSize: 10, color: 'var(--text-muted)' }}>More</span>
        </div>
        </div>{/* end minWidth wrapper */}
      </div>

      {/* ── Weak Topics ── */}
      {weakTopics.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#EF444418,#F59E0B08)', border: '1.5px solid #EF444433', borderRadius: 18, padding: '20px', marginBottom: 24 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color: '#EF4444', marginBottom: 4 }}>⚠️ Needs Attention</div>
          <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Your weakest subjects this period — tap Drill to start improving now.</div>
          {weakTopics.map(({ cat, avg, count }) => (
            <MasteryBar key={cat.id} cat={cat} avg={avg} count={count} onDrill={handleDrill} />
          ))}
        </div>
      )}

      {/* ── Subject Mastery ── */}
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '20px' }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>🎓 Subject Mastery</div>
        <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Sorted from weakest to strongest
        </div>

        {catData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: F, color: 'var(--text-muted)' }}>
            No data yet — complete your first exam to see your mastery levels.
          </div>
        ) : (
          catData.map(({ cat, avg, count }) => (
            <MasteryBar key={cat.id} cat={cat} avg={avg} count={count} onDrill={handleDrill} />
          ))
        )}

        {/* Mastery legend */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          {[
            { color: '#EF4444', label: '< 40% — Needs Work' },
            { color: '#F59E0B', label: '40–59% — Improving' },
            { color: '#0D9488', label: '60–79% — Good' },
            { color: '#22C55E', label: '≥ 80% — Mastered' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
              <span style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
