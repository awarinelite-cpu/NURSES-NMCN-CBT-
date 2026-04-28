// src/components/entrance/EntranceMyResults.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

function ACard({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{ opacity: vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(14px)', transition: 'opacity .45s ease, transform .45s ease', ...s }}>
      {children}
    </div>
  );
}

function ScoreBar({ percent }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(percent), 300); return () => clearTimeout(t); }, [percent]);
  const color = percent >= 70 ? '#0D9488' : percent >= 50 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', background: color, width: `${w}%`, borderRadius: 3, transition: 'width .8s cubic-bezier(.4,0,.2,1)' }} />
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{ height: 90, borderRadius: 14, background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
    </>
  );
}

function modeLabel(mode) {
  switch (mode) {
    case 'daily-mock':    return '⚡ Daily Mock';
    case 'subject-drill': return '🎯 Subject Drill';
    case 'past-paper':    return '📜 Past Paper';
    default:              return mode?.replace(/-/g, ' ') || 'Exam';
  }
}

function ResultCard({ session, delay }) {
  const [vis, setVis] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);

  const date = session.completedAt?.toDate
    ? session.completedAt.toDate().toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Recently';
  const scoreColor = session.scorePercent >= 70 ? '#0D9488' : session.scorePercent >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <div
      onClick={() => navigate('/entrance-exam/review', { state: { sessionId: session.id, fromHistory: true } })}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--bg-card)', border: '1.5px solid var(--border)',
        borderRadius: 14, padding: '14px 18px', cursor: 'pointer',
        opacity: vis ? 1 : 0, transform: vis ? 'translateX(0)' : 'translateX(-14px)',
        transition: 'opacity .4s ease, transform .4s ease',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(13,148,136,0.4)'; e.currentTarget.style.background = 'rgba(13,148,136,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
    >
      {/* Score circle */}
      <div style={{
        width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
        background: `${scoreColor}18`, border: `2px solid ${scoreColor}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      }}>
        <span style={{ fontWeight: 900, fontSize: 14, color: scoreColor, lineHeight: 1 }}>{session.scorePercent}%</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1, marginTop: 1 }}>score</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.examName || session.schoolName || 'Entrance Exam'}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
            {modeLabel(session.mode)}
          </span>
          {session.subject && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(37,99,235,0.1)', color: '#60A5FA' }}>
              📚 {session.subject}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ScoreBar percent={session.scorePercent} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {session.correct}/{session.totalQuestions}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>📅 {date}</div>
      </div>

      <div style={{ color: 'var(--text-muted)', fontSize: 16 }}>→</div>
    </div>
  );
}

// ── Summary stats bar ─────────────────────────────────────────────────────────
function StatPill({ icon, label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 110,
      background: 'var(--bg-card)', border: '1.5px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 18, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const PAGE_SIZE = 15;

export default function EntranceMyResults() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessions,   setSessions]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc,    setLastDoc]    = useState(null);
  const [hasMore,    setHasMore]    = useState(true);
  const [filter,     setFilter]     = useState('all'); // 'all' | 'daily-mock' | 'subject-drill'

  const fetchSessions = async (reset = false) => {
    if (!user) return;
    reset ? setLoading(true) : setLoadingMore(true);
    try {
      let q = query(
        collection(db, 'entranceExamSessions'),
        where('userId', '==', user.uid),
        orderBy('completedAt', 'desc'),
        limit(PAGE_SIZE),
      );
      if (filter !== 'all') {
        q = query(
          collection(db, 'entranceExamSessions'),
          where('userId', '==', user.uid),
          where('mode', '==', filter),
          orderBy('completedAt', 'desc'),
          limit(PAGE_SIZE),
        );
      }
      if (!reset && lastDoc) q = query(q, startAfter(lastDoc));

      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSessions(prev => reset ? docs : [...prev, ...docs]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error('Failed to load entrance results:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchSessions(true); }, [user, filter]);

  // ── Derived summary stats ──────────────────────────────────────────────────
  const totalExams = sessions.length;
  const avgScore   = totalExams > 0
    ? Math.round(sessions.reduce((s, r) => s + (r.scorePercent || 0), 0) / totalExams)
    : 0;
  const best = totalExams > 0
    ? Math.max(...sessions.map(s => s.scorePercent || 0))
    : 0;
  const passed = sessions.filter(s => s.scorePercent >= 50).length;

  const FILTERS = [
    { key: 'all',          label: 'All' },
    { key: 'daily-mock',   label: '⚡ Daily Mock' },
    { key: 'subject-drill', label: '🎯 Subject Drill' },
    { key: 'past-paper',   label: '📜 Past Paper' },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <ACard delay={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => navigate('/entrance-exam')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, padding: 4 }}>←</button>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', color: 'var(--text-primary)', margin: 0 }}>
              📊 My Entrance Results
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0' }}>Your complete entrance exam history</p>
          </div>
        </div>
      </ACard>

      {/* Summary stats */}
      {!loading && totalExams > 0 && (
        <ACard delay={100} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <StatPill icon="📝" label="Total Exams"  value={totalExams} color="#0D9488" />
            <StatPill icon="📊" label="Avg Score"    value={`${avgScore}%`} color="#2563EB" />
            <StatPill icon="🏆" label="Best Score"   value={`${best}%`} color="#F59E0B" />
            <StatPill icon="✅" label="Passed (≥50%)" value={passed}    color="#16A34A" />
          </div>
        </ACard>
      )}

      {/* Filter tabs */}
      <ACard delay={150} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '8px 16px', borderRadius: 20, border: 'none',
                background: filter === f.key ? '#0D9488' : 'var(--bg-card)',
                color: filter === f.key ? '#fff' : 'var(--text-muted)',
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'inherit',
                border: filter === f.key ? 'none' : '1.5px solid var(--border)',
                transition: 'background .2s, color .2s',
              }}
            >{f.label}</button>
          ))}
        </div>
      </ACard>

      {/* Results list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading
          ? [1, 2, 3, 4, 5].map(k => <Skeleton key={k} />)
          : sessions.length === 0
            ? (
              <ACard delay={200}>
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>No results yet</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
                    Complete an entrance exam to see your results here.
                  </div>
                  <button
                    onClick={() => navigate('/entrance-exam')}
                    style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#0D9488', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Start an Exam →
                  </button>
                </div>
              </ACard>
            )
            : sessions.map((s, i) => <ResultCard key={s.id} session={s} delay={i * 60} />)
        }
      </div>

      {/* Load more */}
      {!loading && hasMore && sessions.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => fetchSessions(false)}
            disabled={loadingMore}
            style={{ padding: '10px 28px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {loadingMore ? 'Loading…' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
