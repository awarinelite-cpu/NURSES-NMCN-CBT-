// src/components/admin/SubAdminDashboard.jsx
// Restricted dashboard for Sub-Admins — questions, announcements, payments only.
// No user management, no access codes, no Firebase settings.

import { useEffect, useState } from 'react';
import { Link, useNavigate }   from 'react-router-dom';
import {
  collection, getCountFromServer, query, where,
  orderBy, limit, getDocs,
} from 'firebase/firestore';
import { db }      from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return <span style={{ color: '#0D9488', fontWeight: 700, fontSize: 13 }}>{t.toLocaleTimeString()}</span>;
}

// ── Pulse dot ─────────────────────────────────────────────────────────────────
function PulseDot() {
  return (
    <>
      <style>{`@keyframes subPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.7);opacity:.5}}`}</style>
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: '#10b981', animation: 'subPulse 1.6s infinite',
      }} />
    </>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────
function useCounter(target, duration = 1600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setV(target); clearInterval(id); }
      else setV(Math.floor(start));
    }, 16);
    return () => clearInterval(id);
  }, [target]);
  return v;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, to }) {
  const animated = useCounter(value);
  const [hov, setHov] = useState(false);
  const inner = (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#0B1826',
        border: `1.5px solid ${hov ? color : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 16, padding: '20px 18px',
        display: 'flex', alignItems: 'center', gap: 16,
        transition: 'border-color .2s, transform .2s, box-shadow .2s',
        transform: hov ? 'translateY(-3px)' : 'none',
        boxShadow: hov ? `0 8px 24px ${color}22` : 'none',
        cursor: to ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24,
      }}>{icon}</div>
      <div>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 26, color }}>{animated.toLocaleString()}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

// ── Tool card ─────────────────────────────────────────────────────────────────
function ToolCard({ icon, label, desc, to, color, badge }) {
  const [hov, setHov] = useState(false);
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          background: '#0B1826',
          border: `1.5px solid ${hov ? color : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 16, padding: '20px 18px',
          cursor: 'pointer',
          transition: 'border-color .2s, transform .2s, box-shadow .2s',
          transform: hov ? 'translateY(-4px)' : 'none',
          boxShadow: hov ? `0 10px 28px ${color}25` : 'none',
          display: 'flex', flexDirection: 'column', gap: 10,
          position: 'relative',
        }}
      >
        {badge && (
          <span style={{
            position: 'absolute', top: 12, right: 12,
            background: color, color: '#fff',
            fontSize: 9, fontFamily: H, fontWeight: 900,
            padding: '2px 8px', borderRadius: 20, letterSpacing: 0.5,
          }}>{badge}</span>
        )}
        <div style={{ fontSize: 32 }}>{icon}</div>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 14, color }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </Link>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children, accent = '#0D9488' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
    }}>
      <div style={{ width: 4, height: 24, borderRadius: 4, background: accent, flexShrink: 0 }} />
      <h3 style={{
        fontFamily: H, fontWeight: 900, fontSize: 15,
        color: '#F1F5F9', margin: 0, letterSpacing: 0.3,
      }}>{children}</h3>
    </div>
  );
}

// ── Recent payment row ────────────────────────────────────────────────────────
function PaymentRow({ p }) {
  const badgeColor = p.status === 'confirmed' ? '#10b981' : p.status === 'rejected' ? '#EF4444' : '#F59E0B';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: H, fontWeight: 900, color: '#fff', fontSize: 13,
      }}>{(p.userName || 'U')[0]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#F1F5F9' }}>{p.userName || 'Unknown'}</div>
        <div style={{ fontSize: 12, color: '#64748B' }}>₦{(p.amount || 0).toLocaleString()} · {p.plan || 'Plan'}</div>
      </div>
      <span style={{
        fontSize: 10, fontFamily: H, fontWeight: 900, padding: '3px 10px',
        borderRadius: 20, background: `${badgeColor}20`, color: badgeColor,
        border: `1px solid ${badgeColor}40`,
      }}>{p.status || 'pending'}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SubAdminDashboard() {
  const { profile } = useAuth();
  const [stats,   setStats]   = useState({ nmcnQs: 0, entranceQs: 0, payments: 0 });
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [vis,      setVis]      = useState(false);

  useEffect(() => {
    setTimeout(() => setVis(true), 80);
    (async () => {
      try {
        const [nmcnSnap, entSnap, paySnap, payDocs] = await Promise.all([
          getCountFromServer(query(collection(db, 'questions'), where('active', '==', true))),
          getCountFromServer(collection(db, 'entranceExamQuestions')),
          getCountFromServer(collection(db, 'payments')),
          getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(5))),
        ]);
        setStats({
          nmcnQs:     nmcnSnap.data().count,
          entranceQs: entSnap.data().count,
          payments:   paySnap.data().count,
        });
        setPayments(payDocs.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error('SubAdmin stats error:', e); }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Tool sections ──────────────────────────────────────────────────────────
  const NMCN_TOOLS = [
    { icon: '➕', label: 'Add Question',    desc: 'Add a single NMCN CBT question',       to: '/admin/questions?action=add',  color: '#0D9488' },
    { icon: '📤', label: 'Bulk Upload',     desc: 'Upload many NMCN questions at once',    to: '/admin/questions?action=bulk', color: '#2563EB' },
    { icon: '📋', label: 'Question Bank',   desc: 'Browse, edit or delete NMCN questions', to: '/admin/questions',             color: '#7C3AED' },
  ];

  const ENTRANCE_TOOLS = [
    { icon: '➕', label: 'Add Question',    desc: 'Add a single entrance exam question',        to: '/admin/entrance-exam?tab=add_single', color: '#0D9488' },
    { icon: '📤', label: 'Bulk Upload',     desc: 'Upload many entrance questions at once',     to: '/admin/entrance-exam?tab=bulk',       color: '#3B82F6' },
    { icon: '📋', label: 'Question Bank',   desc: 'Browse, edit or delete entrance questions',  to: '/admin/entrance-exam?tab=bank',       color: '#8B5CF6' },
    { icon: '📅', label: 'Daily Mock Bank', desc: 'Set up daily mock question rotation',        to: '/admin/entrance-exam?tab=daily_mock', color: '#F59E0B', badge: 'DAILY' },
    { icon: '🏫', label: 'Manage Schools',  desc: 'Add or edit schools for past questions',     to: '/admin/entrance-exam?tab=schools',    color: '#065F46' },
    { icon: '📚', label: 'Manage Subjects', desc: 'Subjects for the Subject Drill section',     to: '/admin/entrance-exam?tab=subjects',   color: '#0891B2' },
  ];

  const OTHER_TOOLS = [
    { icon: '💰', label: 'Confirm Payments',  desc: 'Approve or reject payment submissions',  to: '/admin/payments',       color: '#16A34A' },
    { icon: '📢', label: 'Announcements',     desc: 'Post announcements to students',         to: '/admin/announcements',  color: '#EF4444' },
    { icon: '📅', label: 'Scheduled Exams',   desc: 'Schedule and manage timed exams',        to: '/admin/scheduled-exams', color: '#A855F7' },
  ];

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, fontFamily: F }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg,#020E1C,#0A2040)',
        border: '1px solid rgba(13,148,136,0.3)',
        borderRadius: 20, padding: '24px 28px', marginBottom: 28,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        position: 'relative', overflow: 'hidden',
        opacity: vis ? 1 : 0,
        transform: vis ? 'translateY(0)' : 'translateY(-14px)',
        transition: 'opacity .5s ease, transform .5s ease',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 20% 60%, rgba(13,148,136,0.18) 0%, transparent 60%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 22, color: '#F1F5F9' }}>
            🔧 Sub-Admin Panel
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            Welcome, <span style={{ color: '#0D9488', fontWeight: 700 }}>{profile?.name || 'Sub-Admin'}</span> · Questions, payments &amp; announcements
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <PulseDot />
          <span style={{ fontSize: 12, color: '#10b981', fontWeight: 700, fontFamily: H }}>LIVE</span>
          <LiveClock />
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
        gap: 14, marginBottom: 32,
      }}>
        <StatCard icon="❓" label="NMCN Questions"     value={loading ? 0 : stats.nmcnQs}     color="#0D9488" to="/admin/questions" />
        <StatCard icon="🏫" label="Entrance Questions" value={loading ? 0 : stats.entranceQs} color="#3B82F6" to="/admin/entrance-exam?tab=bank" />
        <StatCard icon="💰" label="Total Payments"     value={loading ? 0 : stats.payments}   color="#F59E0B" to="/admin/payments" />
      </div>

      {/* ── NMCN CBT Questions ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel accent="#0D9488">NMCN CBT Questions</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {NMCN_TOOLS.map(t => <ToolCard key={t.label} {...t} />)}
        </div>
      </div>

      {/* ── Entrance Exam Questions ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel accent="#3B82F6">Entrance Exam Questions</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {ENTRANCE_TOOLS.map(t => <ToolCard key={t.label} {...t} />)}
        </div>
      </div>

      {/* ── Other tools ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel accent="#A855F7">Other Tools</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {OTHER_TOOLS.map(t => <ToolCard key={t.label} {...t} />)}
        </div>
      </div>

      {/* ── Recent Payments ── */}
      <div style={{
        background: '#0B1826', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, padding: '20px 20px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
        }}>
          <SectionLabel accent="#16A34A">Recent Payments</SectionLabel>
          <Link to="/admin/payments" style={{
            fontSize: 12, color: '#0D9488', fontWeight: 700, textDecoration: 'none', fontFamily: H,
          }}>View all →</Link>
        </div>
        {loading ? (
          <div style={{ color: '#64748B', fontSize: 13 }}>Loading…</div>
        ) : payments.length === 0 ? (
          <div style={{ color: '#64748B', fontSize: 13 }}>No payments yet.</div>
        ) : payments.map(p => <PaymentRow key={p.id} p={p} />)}
      </div>

      {/* ── Not available notice ── */}
      <div style={{
        marginTop: 28, padding: '14px 18px',
        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 12,
      }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 12, color: '#EF4444', marginBottom: 4 }}>
          🔒 SUPER-ADMIN ONLY
        </div>
        <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.6 }}>
          User management, access codes, analytics, and account settings are only available to the Super Admin.
          Contact Elite if you need those actions performed.
        </div>
      </div>

    </div>
  );
}
