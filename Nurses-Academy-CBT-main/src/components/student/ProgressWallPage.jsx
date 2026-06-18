// src/components/student/ProgressWallPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function last52WeeksGrid() {
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today); start.setDate(today.getDate() - 363);
  const dow = start.getDay();
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

// ── Responsive Heatmap ────────────────────────────────────────────────────────
function Heatmap({ dayMap, weeks, today }) {
  const wrapRef  = useRef(null);
  const [cell, setCell] = useState(11);

  // Recalculate cell size whenever the container width changes
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      // 24px for day-of-week labels + 3px gap per week
      const available = w - 28;
      const c = Math.max(6, Math.floor((available - (weeks.length - 1) * 3) / weeks.length));
      setCell(Math.min(c, 14)); // cap at 14px so it doesn't look bloated on desktop
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [weeks.length]);

  const gap = 3;

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabels = [];
  weeks.forEach((week, wi) => {
    if (week[0].getDate() <= 7) monthLabels[wi] = MONTH_LABELS[week[0].getMonth()];
  });

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      {/* Month labels */}
      <div style={{ display: 'flex', gap, marginBottom: 4, paddingLeft: 24 }}>
        {weeks.map((_, wi) => (
          <div key={wi} style={{
            width: cell, flexShrink: 0,
            fontFamily: F, fontSize: 8, color: 'var(--text-muted)',
            textAlign: 'center', overflow: 'visible', whiteSpace: 'nowrap',
          }}>
            {monthLabels[wi] || ''}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap }}>
        {/* Day-of-week labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap, marginRight: 4, width: 16, flexShrink: 0 }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} style={{ height: cell, fontFamily: F, fontSize: 8, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>{d}</div>
          ))}
        </div>

        {/* Week columns */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap }}>
            {week.map((day, di) => {
              const k = dateKey(day);
              const count = dayMap[k] || 0;
              const isFuture = day > today;
              const bg = isFuture ? 'rgba(255,255,255,0.03)'
                : count === 0 ? 'rgba(255,255,255,0.06)'
                : count === 1 ? '#0D948866'
                : count <= 3  ? '#0D9488'
                : '#F59E0B';
              return (
                <div key={di} style={{
                  width: cell, height: cell, borderRadius: Math.max(2, cell * 0.22),
                  background: bg, flexShrink: 0,
                }} title={!isFuture ? `${count} exam${count !== 1 ? 's' : ''} · ${dateKey(day)}` : ''} />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: F, fontSize: 10, color: 'var(--text-muted)' }}>Less</span>
        {['rgba(255,255,255,0.06)', '#0D948866', '#0D9488', '#F59E0B'].map((c, i) => (
          <div key={i} style={{ width: cell, height: cell, borderRadius: 3, background: c }} />
        ))}
        <span style={{ fontFamily: F, fontSize: 10, color: 'var(--text-muted)' }}>More</span>
      </div>
    </div>
  );
}

// ── Subject mastery bar ───────────────────────────────────────────────────────
function MasteryBar({ cat, avg, count, onDrill }) {
  const color = scoreColor(avg);
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '12px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{cat.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {cat.shortLabel || cat.label}
            </div>
            <div style={{ fontFamily: F, fontSize: 10, color: 'var(--text-muted)' }}>
              {count} exam{count !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontFamily: H, fontWeight: 900, fontSize: 16, color }}>{avg ?? '—'}%</span>
          <button
            onClick={() => onDrill(cat)}
            style={{
              background: '#0D948822', border: '1px solid #0D948855',
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
              fontFamily: H, fontWeight: 900, fontSize: 11, color: '#0D9488',
            }}
          >Drill →</button>
        </div>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
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
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);

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

  const dayMap = {};
  sessions.forEach(s => {
    if (!s.completedAt) return;
    const d = s.completedAt.toDate ? s.completedAt.toDate() : new Date(s.completedAt);
    dayMap[dateKey(d)] = (dayMap[dateKey(d)] || 0) + 1;
  });

  const weeks = last52WeeksGrid();
  const today = new Date(); today.setHours(0,0,0,0);

  const catData = NURSING_CATEGORIES.map(cat => {
    const cs  = sessions.filter(s => s.category === cat.id);
    const avg = cs.length ? Math.round(cs.reduce((a, x) => a + (x.scorePercent || x.score || 0), 0) / cs.length) : null;
    return { cat, avg, count: cs.length };
  }).filter(x => x.count > 0).sort((a, b) => (a.avg ?? 101) - (b.avg ?? 101));

  const weakTopics  = catData.filter(x => x.avg !== null && x.avg < 60 && x.count >= 2).slice(0, 3);
  const practiceDays = Object.keys(dayMap).length;
  const totalExams   = sessions.length;
  const overallAvg   = totalExams ? Math.round(sessions.reduce((a, x) => a + (x.scorePercent || x.score || 0), 0) / totalExams) : 0;

  const handleDrill = (cat) => navigate('/course-drill', { state: { category: cat.id } });

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#0D9488', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: '20px 14px 80px', maxWidth: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: H, fontWeight: 900, fontSize: 12 }}
        >← Back</button>
        <h1 style={{ fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.1rem,5vw,1.6rem)', color: 'var(--text-primary)', margin: 0 }}>📊 Progress Wall</h1>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Practice Days', value: practiceDays,      color: '#0D9488', icon: '📅' },
          { label: 'Total Exams',   value: totalExams,        color: '#3B82F6', icon: '📝' },
          { label: 'Avg Score',     value: `${overallAvg}%`,  color: scoreColor(overallAvg), icon: '🎯' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 20, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: F, fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Practice Heatmap */}
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '16px 14px', marginBottom: 20 }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)', marginBottom: 12 }}>📅 Practice History</div>
        <Heatmap dayMap={dayMap} weeks={weeks} today={today} />
      </div>

      {/* Weak Topics */}
      {weakTopics.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#EF444418,#F59E0B08)', border: '1.5px solid #EF444433', borderRadius: 16, padding: '16px 14px', marginBottom: 20 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: '#EF4444', marginBottom: 4 }}>⚠️ Needs Attention</div>
          <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Your weakest subjects — tap Drill to improve.</div>
          {weakTopics.map(({ cat, avg, count }) => (
            <MasteryBar key={cat.id} cat={cat} avg={avg} count={count} onDrill={handleDrill} />
          ))}
        </div>
      )}

      {/* Subject Mastery */}
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '16px 14px' }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>🎓 Subject Mastery</div>
        <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Sorted weakest → strongest</div>

        {catData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: F, color: 'var(--text-muted)' }}>
            No data yet — complete your first exam to see mastery levels.
          </div>
        ) : (
          catData.map(({ cat, avg, count }) => (
            <MasteryBar key={cat.id} cat={cat} avg={avg} count={count} onDrill={handleDrill} />
          ))
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {[
            { color: '#EF4444', label: '< 40%' },
            { color: '#F59E0B', label: '40–59%' },
            { color: '#0D9488', label: '60–79%' },
            { color: '#22C55E', label: '≥ 80%' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
              <span style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
