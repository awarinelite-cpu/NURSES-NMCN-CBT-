// src/components/admin/AdminDashboard.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getCountFromServer, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';

export default function AdminDashboard() {
  const [stats,    setStats]    = useState({ questions: 0, users: 0, payments: 0, sessions: 0 });
  const [recent,   setRecent]   = useState({ payments: [], users: [] });
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
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
    { label: 'Total Questions', value: stats.questions, icon: '❓', color: '#0D9488', bg: 'rgba(13,148,136,0.12)', to: '/admin/questions' },
    { label: 'Registered Users', value: stats.users,    icon: '👥', color: '#2563EB', bg: 'rgba(37,99,235,0.12)', to: '/admin/users' },
    { label: 'Payments',         value: stats.payments, icon: '💰', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', to: '/admin/payments' },
    { label: 'Exam Sessions',    value: stats.sessions, icon: '📝', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)', to: '/admin/analytics' },
  ];

  const QUICK_ACTIONS = [
    { label: 'Add Question',      icon: '➕', to: '/admin/questions?action=add',  color: '#0D9488' },
    { label: 'Bulk Upload',       icon: '📤', to: '/admin/questions?action=bulk', color: '#2563EB' },
    { label: 'Manage Users',      icon: '👥', to: '/admin/users',                color: '#7C3AED' },
    { label: 'Access Codes',      icon: '🔑', to: '/admin/access-codes',         color: '#F59E0B' },
    { label: 'Announcements',     icon: '📢', to: '/admin/announcements',        color: '#EF4444' },
    { label: 'Confirm Payments',  icon: '✅', to: '/admin/payments',             color: '#16A34A' },
    { label: 'Manage Courses',    icon: '📖', to: '/admin/courses',              color: '#0891B2' },
    { label: 'Scheduled Exams',   icon: '📅', to: '/admin/scheduled-exams',     color: '#A855F7' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerGlow} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ color: '#fff', fontFamily: "'Playfair Display',serif", margin: 0 }}>
            🛡️ Admin Control Panel
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: '4px 0 0', fontSize: 14 }}>
            Full control over NMCN CBT platform — questions, users, payments & analytics
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        {STAT_CARDS.map(s => (
          <Link key={s.label} to={s.to} style={{ textDecoration: 'none' }}>
            <div className="stat-card" style={{ cursor: 'pointer' }}>
              <div className="stat-icon" style={{ background: s.bg }}>
                <span>{s.icon}</span>
              </div>
              <div>
                <div className="stat-value" style={{ color: s.color }}>
                  {loading ? '…' : s.value.toLocaleString()}
                </div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={styles.sectionTitle}>⚡ Quick Actions</h3>
        <div style={styles.actionsGrid}>
          {QUICK_ACTIONS.map(a => (
            <Link key={a.label} to={a.to} style={{ textDecoration: 'none' }}>
              <div style={{ ...styles.actionCard, borderColor: `${a.color}40`, background: `${a.color}10` }}>
                <span style={{ fontSize: 28 }}>{a.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: a.color }}>{a.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div style={styles.twoCol}>
        {/* Recent payments */}
        <div className="card">
          <div style={styles.cardHead}>
            💰 Recent Payments
            <Link to="/admin/payments" style={styles.viewAll}>View all →</Link>
          </div>
          {recent.payments.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No payments yet</p>
          ) : recent.payments.map(p => (
            <div key={p.id} style={styles.listItem}>
              <div style={styles.listAvatar}>{(p.userName || 'U')[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.userName || 'User'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  ₦{(p.amount || 0).toLocaleString()} · {p.plan || 'Plan'}
                </div>
              </div>
              <span className={`badge ${p.status === 'confirmed' ? 'badge-green' : p.status === 'rejected' ? 'badge-red' : 'badge-gold'}`}>
                {p.status || 'pending'}
              </span>
            </div>
          ))}
        </div>

        {/* Recent users */}
        <div className="card">
          <div style={styles.cardHead}>
            👥 Recent Registrations
            <Link to="/admin/users" style={styles.viewAll}>View all →</Link>
          </div>
          {recent.users.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No users yet</p>
          ) : recent.users.map(u => (
            <div key={u.id} style={styles.listItem}>
              <div style={styles.listAvatar}>{(u.name || 'U')[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</div>
              </div>
              <span className={`badge ${u.subscribed ? 'badge-teal' : 'badge-grey'}`}>
                {u.subscribed ? 'Premium' : 'Free'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    background: 'linear-gradient(135deg,#010810,#0F2A4A)',
    border: '1px solid rgba(13,148,136,0.3)',
    borderRadius: 20, padding: '28px 32px', marginBottom: 28,
    position: 'relative', overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(ellipse at 80% 50%, rgba(13,148,136,0.2) 0%, transparent 60%)',
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
    textAlign: 'center', cursor: 'pointer', transition: 'var(--transition)',
  },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 },
  cardHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--text-primary)',
  },
  viewAll: { fontSize: 13, color: 'var(--teal)', textDecoration: 'none', fontWeight: 700 },
  listItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' },
  listAvatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, color: '#fff', fontSize: 14, flexShrink: 0,
  },
};