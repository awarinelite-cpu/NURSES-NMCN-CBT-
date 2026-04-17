// src/components/admin/AdminAnalytics.jsx
import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where,
  orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── Helpers ──────────────────────────────────────────────────────
const ago = days => new Date(Date.now() - days * 86400000);

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function pct(a, b) {
  return b === 0 ? '—' : Math.round((a / b) * 100) + '%';
}

// ── Mini sparkline (SVG) ─────────────────────────────────────────
function Sparkline({ data = [], color = '#0D9488', height = 36 }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const w = 120, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Bar chart (horizontal) ────────────────────────────────────────
function HBar({ label, value, max, color = '#0D9488' }) {
  const pctW = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 160, fontSize: 12, color: '#94A3B8', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pctW}%`, background: color, height: '100%', borderRadius: 4, transition: 'width .6s ease' }} />
      </div>
      <div style={{ width: 36, fontSize: 12, fontWeight: 700, color: '#F1F5F9', textAlign: 'right', flexShrink: 0 }}>
        {value}
      </div>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, spark, sparkColor, trend }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            {icon} {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#F1F5F9', lineHeight: 1 }}>
            {value === null ? <span style={{ fontSize: 16, color: '#475569' }}>Loading…</span> : fmt(value)}
          </div>
          {sub && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{sub}</div>}
        </div>
        {spark && <Sparkline data={spark} color={sparkColor} />}
      </div>
      {trend !== undefined && (
        <div style={{ marginTop: 8, fontSize: 12, color: trend >= 0 ? '#10B981' : '#F87171', fontWeight: 600 }}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last 7d
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14,
  padding: '18px 20px',
};

// ── Main Component ───────────────────────────────────────────────
export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30); // days
  const [data, setData] = useState(null);

  useEffect(() => {
    loadData();
  }, [range]);

  async function loadData() {
    setLoading(true);
    try {
      const since = Timestamp.fromDate(ago(range));
      const since7 = Timestamp.fromDate(ago(7));
      const since14 = Timestamp.fromDate(ago(14));

      // ── Users ─────────────────────────────────────────────
      const usersSnap = await getDocs(collection(db, 'users'));
      const allUsers = usersSnap.docs.map(d => d.data());
      const totalUsers = allUsers.length;
      const premiumUsers = allUsers.filter(u => u.subscribed).length;
      const newUsers = allUsers.filter(u => u.createdAt?.toDate?.() >= ago(range)).length;
      const newUsers7 = allUsers.filter(u => u.createdAt?.toDate?.() >= ago(7)).length;
      const newUsersPrev7 = allUsers.filter(u => {
        const d = u.createdAt?.toDate?.();
        return d >= ago(14) && d < ago(7);
      }).length;
      const userTrend = newUsersPrev7 === 0 ? null
        : Math.round(((newUsers7 - newUsersPrev7) / newUsersPrev7) * 100);

      // Daily new-user spark (last 7 days)
      const userSpark = Array.from({ length: 7 }, (_, i) => {
        const dayStart = ago(6 - i);
        const dayEnd   = ago(5 - i);
        return allUsers.filter(u => {
          const d = u.createdAt?.toDate?.();
          return d >= dayStart && d < dayEnd;
        }).length;
      });

      // ── Exam sessions ─────────────────────────────────────
      let sessions = [];
      try {
        const sessSnap = await getDocs(
          query(collection(db, 'examSessions'),
            where('completedAt', '>=', since),
            orderBy('completedAt', 'desc'))
        );
        sessions = sessSnap.docs.map(d => d.data());
      } catch {
        // collection may not exist yet
      }

      const totalSessions = sessions.length;
      const avgScore = totalSessions
        ? Math.round(sessions.reduce((s, x) => s + (x.score || 0), 0) / totalSessions)
        : null;

      const sessions7 = sessions.filter(s => s.completedAt?.toDate?.() >= ago(7)).length;
      const sessionsSpark = Array.from({ length: 7 }, (_, i) => {
        const dayStart = ago(6 - i);
        const dayEnd   = ago(5 - i);
        return sessions.filter(s => {
          const d = s.completedAt?.toDate?.();
          return d >= dayStart && d < dayEnd;
        }).length;
      });

      // ── Questions ─────────────────────────────────────────
      let totalQuestions = 0;
      const courseMap = {};
      try {
        const qSnap = await getDocs(collection(db, 'questions'));
        totalQuestions = qSnap.size;
        qSnap.docs.forEach(d => {
          const course = d.data().course || 'Uncategorized';
          courseMap[course] = (courseMap[course] || 0) + 1;
        });
      } catch { /* ignore */ }

      const topCourses = Object.entries(courseMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      // ── Payments ──────────────────────────────────────────
      let paymentsTotal = 0, paymentsCount = 0, pendingPayments = 0;
      try {
        const paySnap = await getDocs(
          query(collection(db, 'payments'), where('createdAt', '>=', since))
        );
        paySnap.docs.forEach(d => {
          const p = d.data();
          if (p.status === 'verified' || p.status === 'success') {
            paymentsTotal += (p.amount || 0);
            paymentsCount++;
          }
          if (p.status === 'pending') pendingPayments++;
        });
      } catch { /* ignore */ }

      // ── Access codes ──────────────────────────────────────
      let usedCodes = 0, unusedCodes = 0;
      try {
        const codeSnap = await getDocs(collection(db, 'accessCodes'));
        codeSnap.docs.forEach(d => {
          const c = d.data();
          if (c.usedBy) usedCodes++; else unusedCodes++;
        });
      } catch { /* ignore */ }

      setData({
        totalUsers, premiumUsers, newUsers, userTrend, userSpark,
        freeUsers: totalUsers - premiumUsers,
        totalSessions, avgScore, sessions7, sessionsSpark,
        totalQuestions, topCourses,
        paymentsTotal, paymentsCount, pendingPayments,
        usedCodes, unusedCodes,
        conversionRate: totalUsers ? Math.round((premiumUsers / totalUsers) * 100) : 0,
      });
    } catch (err) {
      console.error('AdminAnalytics error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      {/* ── Header ────────────────────────────────────────── */}
      <div style={styles.pageHeader}>
        <div>
          <h2 style={styles.pageTitle}>📈 Platform Analytics</h2>
          <p style={styles.pageSub}>Live overview of users, exams, and revenue</p>
        </div>
        <div style={styles.rangeBar}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setRange(d)}
              style={{ ...styles.rangeBtn, ...(range === d ? styles.rangeBtnActive : {}) }}
            >
              {d}d
            </button>
          ))}
          <button onClick={loadData} style={styles.refreshBtn} title="Refresh">
            🔄
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569', fontSize: 14 }}>
          Loading analytics…
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── KPI grid ──────────────────────────────────── */}
          <div style={styles.kpiGrid}>
            <StatCard
              icon="👥" label={`Total Users`}
              value={data.totalUsers}
              sub={`+${data.newUsers} in last ${range}d`}
              spark={data.userSpark}
              sparkColor="#0D9488"
              trend={data.userTrend}
            />
            <StatCard
              icon="⭐" label="Premium Users"
              value={data.premiumUsers}
              sub={`${data.conversionRate}% conversion rate`}
            />
            <StatCard
              icon="📝" label={`Exam Sessions`}
              value={data.totalSessions}
              sub={`${data.sessions7} in last 7d`}
              spark={data.sessionsSpark}
              sparkColor="#3B82F6"
            />
            <StatCard
              icon="🎯" label="Avg Exam Score"
              value={data.avgScore ?? '—'}
              sub={data.avgScore ? `${data.avgScore >= 70 ? 'Good performance' : data.avgScore >= 50 ? 'Average performance' : 'Needs improvement'}` : 'No data'}
            />
            <StatCard
              icon="💰" label="Revenue"
              value={data.paymentsTotal}
              sub={`${data.paymentsCount} verified payments`}
            />
            <StatCard
              icon="⏳" label="Pending Payments"
              value={data.pendingPayments}
              sub="Awaiting verification"
            />
            <StatCard
              icon="❓" label="Questions Bank"
              value={data.totalQuestions}
              sub={`${data.topCourses.length} courses`}
            />
            <StatCard
              icon="🔑" label="Access Codes"
              value={data.usedCodes + data.unusedCodes}
              sub={`${data.usedCodes} used · ${data.unusedCodes} unused`}
            />
          </div>

          {/* ── 2-col lower section ───────────────────────── */}
          <div style={styles.lowerGrid}>
            {/* Questions per Course */}
            <div style={cardStyle}>
              <div style={styles.sectionTitle}>📚 Questions by Course</div>
              {data.topCourses.length === 0 ? (
                <p style={{ color: '#475569', fontSize: 13 }}>No questions found.</p>
              ) : (
                data.topCourses.map(([course, count]) => (
                  <HBar
                    key={course}
                    label={course}
                    value={count}
                    max={data.topCourses[0][1]}
                    color="#0D9488"
                  />
                ))
              )}
            </div>

            {/* User breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={cardStyle}>
                <div style={styles.sectionTitle}>👥 User Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Free Users',    value: data.freeUsers,    color: '#64748B' },
                    { label: 'Premium Users', value: data.premiumUsers, color: '#0D9488' },
                    { label: `New (${range}d)`, value: data.newUsers,   color: '#3B82F6' },
                  ].map(r => (
                    <HBar key={r.label} label={r.label} value={r.value} max={data.totalUsers} color={r.color} />
                  ))}
                </div>
                {/* Donut-like summary */}
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  {[
                    { label: 'Free', value: pct(data.freeUsers, data.totalUsers), color: '#64748B' },
                    { label: 'Premium', value: pct(data.premiumUsers, data.totalUsers), color: '#0D9488' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Access code status */}
              <div style={cardStyle}>
                <div style={styles.sectionTitle}>🔑 Access Code Status</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { label: 'Used', value: data.usedCodes, color: '#0D9488' },
                    { label: 'Unused', value: data.unusedCodes, color: '#F59E0B' },
                    { label: 'Total', value: data.usedCodes + data.unusedCodes, color: '#3B82F6' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick links */}
              <div style={cardStyle}>
                <div style={styles.sectionTitle}>⚡ Quick Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: '👥 Manage Users', href: '/admin/users' },
                    { label: '💰 Review Payments', href: '/admin/payments', badge: data.pendingPayments > 0 ? data.pendingPayments : null },
                    { label: '❓ Manage Questions', href: '/admin/questions' },
                    { label: '🔑 Access Codes', href: '/admin/access-codes' },
                  ].map(l => (
                    <a key={l.href} href={l.href} style={styles.quickLink}>
                      <span>{l.label}</span>
                      {l.badge && (
                        <span style={{ background: '#EF4444', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
                          {l.badge}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Daily activity spark (full width) ────────── */}
          <div style={{ ...cardStyle, marginTop: 12 }}>
            <div style={styles.sectionTitle}>📊 Exam Activity — Last 7 Days</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 12, height: 60 }}>
              {data.sessionsSpark.map((v, i) => {
                const maxV = Math.max(...data.sessionsSpark, 1);
                const h = Math.max(4, Math.round((v / maxV) * 56));
                const dayLabel = new Date(ago(6 - i)).toLocaleDateString('en-NG', { weekday: 'short' });
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: '#475569' }}>{v}</div>
                    <div style={{
                      width: '100%', height: h,
                      background: 'linear-gradient(180deg,#0D9488,#0F766E)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height .4s ease',
                    }} />
                    <div style={{ fontSize: 10, color: '#475569' }}>{dayLabel}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────
const styles = {
  page: {
    padding: '20px 16px 48px',
    maxWidth: 960,
    margin: '0 auto',
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  pageTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 22,
    fontWeight: 900,
    color: '#F1F5F9',
    margin: 0,
  },
  pageSub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  rangeBar: { display: 'flex', gap: 4, alignItems: 'center' },
  rangeBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)', color: '#64748B',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  rangeBtnActive: {
    background: 'rgba(13,148,136,0.15)', color: '#2DD4BF',
    borderColor: 'rgba(13,148,136,0.3)',
  },
  refreshBtn: {
    padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: 14,
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 12,
    marginBottom: 12,
  },
  lowerGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: 700, color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },
  quickLink: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '9px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
    color: '#CBD5E1', fontSize: 13, fontWeight: 500,
    textDecoration: 'none', transition: 'background .15s',
  },
};
