// src/components/admin/AdminDashboard.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getCountFromServer, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';

// ── Animated counter hook ─────────────────────────────────────────────────────
function useCounter(target, duration = 1800, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) return;
    const timeout = setTimeout(() => {
      let start = 0;
      const step = target / (duration / 16);
      const timer = setInterval(() => {
        start += step;
        if (start >= target) { setValue(target); clearInterval(timer); }
        else setValue(Math.floor(start));
      }, 16);
      return () => clearInterval(timer);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, duration, delay]);
  return value;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color, width = 80, height = 32 }) {
  if (!data?.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / (max - min || 1)) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', opacity: 0.8 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={`0,${height} ${pts} ${width},${height}`} fill={color} opacity="0.12" />
    </svg>
  );
}

// ── Pulsing live dot ──────────────────────────────────────────────────────────
function PulseDot({ color = '#10b981' }) {
  return (
    <>
      <style>{`@keyframes adminPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.7);opacity:.5}}`}</style>
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: color, animation: 'adminPulse 1.6s infinite',
      }} />
    </>
  );
}

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return <span style={{ color: '#0D9488', fontWeight: 700, fontSize: 13 }}>{t.toLocaleTimeString()}</span>;
}

// ── Animated card wrapper ─────────────────────────────────────────────────────
function ACard({ children, delay = 0, style: s = {} }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(18px)',
      transition: 'opacity .55s ease, transform .55s ease',
      ...s,
    }}>
      {children}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, rawValue, icon, color, bg, to, delay, spark }) {
  const animated = useCounter(rawValue, 1800, delay + 200);
  const [hov, setHov] = useState(false);
  const inner = (
    <ACard delay={delay}>
      <div
        className="stat-card"
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          cursor: to ? 'pointer' : 'default',
          transform: hov ? 'translateY(-3px)' : 'translateY(0)',
          boxShadow: hov ? `0 8px 24px ${color}22` : undefined,
          transition: 'transform .25s, box-shadow .25s',
        }}
      >
        <div className="stat-icon" style={{ background: bg }}><span>{icon}</span></div>
        <div style={{ flex: 1 }}>
          <div className="stat-value" style={{ color }}>{animated.toLocaleString()}</div>
          <div className="stat-label">{label}</div>
        </div>
        <Sparkline data={spark} color={color} />
      </div>
    </ACard>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 6 }) {
  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{
        width: w, height: h, borderRadius: r,
        background: 'linear-gradient(90deg,#1e293b 25%,#2d3f55 50%,#1e293b 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s infinite',
      }} />
    </>
  );
}

// ── Dummy spark data (visual decoration) ─────────────────────────────────────
const SPARKS = {
  questions: [30, 42, 38, 55, 48, 60, 52, 70, 65, 80, 75, 90],
  users:     [20, 28, 25, 35, 30, 42, 38, 50, 44, 58, 52, 65],
  payments:  [15, 22, 18, 28, 24, 35, 30, 40, 36, 48, 44, 56],
  sessions:  [40, 52, 46, 62, 55, 70, 62, 78, 70, 85, 78, 92],
};

export default function AdminDashboard() {
  const [stats,   setStats]   = useState({ questions: 0, users: 0, payments: 0, sessions: 0 });
  const [recent,  setRecent]  = useState({ payments: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [headerVis, setHeaderVis] = useState(false);

  useEffect(() => {
    setTimeout(() => setHeaderVis(true), 80);
    const load = async () => {
      try {
        const [qSnap, uSnap, pSnap, sSnap] = await Promise.all([
          getCountFromServer(query(collection(db, 'questions'), where('active', '==', true))),
          getCountFromServer(collection(db, 'users')),
          getCountFromServer(collection(db, 'payments')),
          getCountFromServer(collection(db, 'examSessions')),
        ]);
        setStats({
          questions: qSnap.data().count,
          users:     uSnap.data().count,
          payments:  pSnap.data().count,
          sessions:  sSnap.data().count,
        });
        const [pDocs, uDocs] = await Promise.all([
          getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(5))),
          getDocs(query(collection(db, 'users'),    orderBy('createdAt', 'desc'), limit(5))),
        ]);
        setRecent({
          payments: pDocs.docs.map(d => ({ id: d.id, ...d.data() })),
          users:    uDocs.docs.map(d => ({ id: d.id, ...d.data() })),
        });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const STAT_CARDS = [
    { label: 'Total Questions', value: stats.questions, icon: '❓', color: '#0D9488', bg: 'rgba(13,148,136,0.12)', to: '/admin/questions', spark: SPARKS.questions },
    { label: 'Registered Users', value: stats.users,    icon: '👥', color: '#2563EB', bg: 'rgba(37,99,235,0.12)',  to: '/admin/users',     spark: SPARKS.users     },
    { label: 'Payments',         value: stats.payments, icon: '💰', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', to: '/admin/payments',  spark: SPARKS.payments  },
    { label: 'Exam Sessions',    value: stats.sessions, icon: '📝', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', to: '/admin/analytics', spark: SPARKS.sessions  },
  ];

  const QUICK_ACTIONS = [
    { label: 'Add Question',     icon: '➕', to: '/admin/questions?action=add',  color: '#0D9488' },
    { label: 'Bulk Upload',      icon: '📤', to: '/admin/questions?action=bulk', color: '#2563EB' },
    { label: 'Manage Users',     icon: '👥', to: '/admin/users',                 color: '#7C3AED' },
    { label: 'Access Codes',     icon: '🔑', to: '/admin/access-codes',          color: '#F59E0B' },
    { label: 'Announcements',    icon: '📢', to: '/admin/announcements',         color: '#EF4444' },
    { label: 'Confirm Payments', icon: '✅', to: '/admin/payments',              color: '#16A34A' },
    { label: 'Manage Courses',   icon: '📖', to: '/admin/courses',               color: '#0891B2' },
    { label: 'Scheduled Exams',  icon: '📅', to: '/admin/scheduled-exams',      color: '#A855F7' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>

      {/* ── Header ── */}
      <div style={{
        ...S.header,
        opacity: headerVis ? 1 : 0,
        transform: headerVis ? 'translateY(0)' : 'translateY(-16px)',
        transition: 'opacity .6s ease, transform .6s ease',
      }}>
        <div style={S.headerGlow} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ color: '#fff', fontFamily: "'Playfair Display',serif", margin: 0 }}>
            🛡️ Admin Control Panel
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: '4px 0 0', fontSize: 14 }}>
            Full control over NMCN CBT platform — questions, users, payments &amp; analytics
          </p>
        </div>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <PulseDot />
          <span style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>LIVE</span>
          <LiveClock />
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={S.statsGrid}>
        {STAT_CARDS.map((s, i) => (
          <StatCard
            key={s.label}
            label={s.label}
            rawValue={loading ? 0 : s.value}
            icon={s.icon}
            color={s.color}
            bg={s.bg}
            to={s.to}
            delay={i * 120}
            spark={s.spark}
          />
        ))}
      </div>

      {/* ── Quick actions ── */}
      <ACard delay={550} style={{ marginBottom: 32 }}>
        <h3 style={S.sectionTitle}>⚡ Quick Actions</h3>
        <div style={S.actionsGrid}>
          {QUICK_ACTIONS.map((a, i) => (
            <QuickActionBtn key={a.label} {...a} delay={600 + i * 60} />
          ))}
        </div>
      </ACard>

      {/* ── Recent activity ── */}
      <div style={S.twoCol}>
        <RecentCard
          title="💰 Recent Payments"
          to="/admin/payments"
          viewLabel="View all →"
          delay={800}
          empty={recent.payments.length === 0}
          emptyText="No payments yet"
          loading={loading}
        >
          {recent.payments.map((p, i) => (
            <ListItem
              key={p.id}
              delay={900 + i * 80}
              primary={p.userName || 'User'}
              secondary={`₦${(p.amount || 0).toLocaleString()} · ${p.plan || 'Plan'}`}
              initial={(p.userName || 'U')[0]}
              badge={p.status || 'pending'}
              badgeClass={p.status === 'confirmed' ? 'badge-green' : p.status === 'rejected' ? 'badge-red' : 'badge-gold'}
            />
          ))}
        </RecentCard>

        <RecentCard
          title="👥 Recent Registrations"
          to="/admin/users"
          viewLabel="View all →"
          delay={850}
          empty={recent.users.length === 0}
          emptyText="No users yet"
          loading={loading}
        >
          {recent.users.map((u, i) => (
            <ListItem
              key={u.id}
              delay={950 + i * 80}
              primary={u.name}
              secondary={u.email}
              initial={(u.name || 'U')[0]}
              badge={u.subscribed ? 'Premium' : 'Free'}
              badgeClass={u.subscribed ? 'badge-teal' : 'badge-grey'}
            />
          ))}
        </RecentCard>
      </div>
    </div>
  );
}

// ── Quick action button ───────────────────────────────────────────────────────
function QuickActionBtn({ label, icon, to, color, delay }) {
  const [vis, setVis]   = useState(false);
  const [hov, setHov]   = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          ...S.actionCard,
          borderColor: `${color}40`,
          background: hov ? `${color}22` : `${color}10`,
          transform: vis ? (hov ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)') : 'translateY(12px)',
          opacity: vis ? 1 : 0,
          boxShadow: hov ? `0 6px 20px ${color}30` : 'none',
          transition: 'opacity .4s ease, transform .35s ease, background .2s, box-shadow .2s',
        }}
      >
        <span style={{ fontSize: 28 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
      </div>
    </Link>
  );
}

// ── Recent card wrapper ───────────────────────────────────────────────────────
function RecentCard({ title, to, viewLabel, delay, empty, emptyText, loading, children }) {
  return (
    <ACard delay={delay}>
      <div className="card">
        <div style={S.cardHead}>
          {title}
          <Link to={to} style={S.viewAll}>{viewLabel}</Link>
        </div>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(k => <Skeleton key={k} h={40} r={8} />)}
          </div>
        ) : empty ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{emptyText}</p>
        ) : children}
      </div>
    </ACard>
  );
}

// ── List item with slide-in animation ────────────────────────────────────────
function ListItem({ primary, secondary, initial, badge, badgeClass, delay }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      ...S.listItem,
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateX(0)' : 'translateX(-14px)',
      transition: 'opacity .45s ease, transform .45s ease',
    }}>
      <div style={S.listAvatar}>{initial}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{primary}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{secondary}</div>
      </div>
      <span className={`badge ${badgeClass}`}>{badge}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  header: {
    background: 'linear-gradient(135deg,#010810,#0F2A4A)',
    border: '1px solid rgba(13,148,136,0.3)',
    borderRadius: 20, padding: '28px 32px', marginBottom: 28,
    position: 'relative', overflow: 'hidden',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
  },
  headerGlow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse at 80% 50%, rgba(13,148,136,0.25) 0%, transparent 60%)',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
    gap: 16, marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: "'Playfair Display',serif", fontSize: '1.1rem',
    color: 'var(--text-primary)', margin: '0 0 14px',
  },
  actionsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12,
  },
  actionCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '18px 12px', border: '1.5px solid', borderRadius: 14,
    textAlign: 'center', cursor: 'pointer',
  },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 },
  cardHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--text-primary)',
  },
  viewAll: { fontSize: 13, color: 'var(--teal)', textDecoration: 'none', fontWeight: 700 },
  listItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 0', borderBottom: '1px solid var(--border)',
  },
  listAvatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, color: '#fff', fontSize: 14, flexShrink: 0,
  },
};
