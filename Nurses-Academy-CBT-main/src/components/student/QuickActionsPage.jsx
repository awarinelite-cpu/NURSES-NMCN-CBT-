// src/components/student/QuickActionsPage.jsx
import { Link } from 'react-router-dom';

const F = "'Plus Jakarta Sans', system-ui, sans-serif";
const INK = '#10301d';

const actions = [
  { to: '/daily-mock-exam', icon: '🗓️', label: 'Daily Mock Exam',     desc: 'Fresh 250-question pool every day',  bg: '#e3f2fb', btn: '#16803a' },
  { to: '/course-drill',    icon: '📖', label: 'Course Drill',        desc: 'Take exam by courses',               bg: '#e4f4e8', btn: '#16803a' },
  { to: '/topic-drill',     icon: '🎯', label: 'Topic Drill',         desc: 'Take exam by topics',                bg: '#e4ecff', btn: '#16803a' },
  { to: '/mock-exams',      icon: '📋', label: 'Hospital Final Prep', desc: 'Study daily Hospital Final exam',    bg: '#ece4ff', btn: '#16803a' },
  { to: '/past-questions',  icon: '📜', label: 'Past Questions',      desc: 'Study NMCN past questions',          bg: '#fde6e4', btn: '#16803a' },
  { to: '/bookmarks',       icon: '🔖', label: 'Bookmarks',           desc: 'Review your Bookmarked questions',   bg: '#ece4ff', btn: '#16803a' },
  { to: '/caosce',          icon: '🩺', label: 'CAOSCE PREP',         desc: 'Computer-Based OSCE Practical Exam', bg: '#e4f4e8', btn: '#16803a' },
];

export default function QuickActionsPage() {
  return (
    <div style={{ padding: '18px 14px 24px', maxWidth: 720, margin: '0 auto', fontFamily: F }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 34, lineHeight: 1 }}>⚡</span>
        <h2 style={{ margin: 0, fontFamily: F, fontSize: 'clamp(1.6rem,7vw,2rem)', fontWeight: 800, color: INK, letterSpacing: -0.4 }}>Quick Actions</h2>
      </div>
      <p style={{ margin: '0 0 18px 2px', fontSize: 15, color: '#2f4a3a', fontWeight: 500 }}>Study smarter, faster</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        {actions.map(a => (
          <Link key={a.to} to={a.to} className="qa-card" style={{
            position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            padding: '16px 12px 18px', minHeight: 176, textDecoration: 'none', color: INK,
            background: 'linear-gradient(180deg,#ffffff 0%,#f1f7f3 100%)', border: '1.5px solid #dcebe0',
            borderRadius: 24, boxShadow: '0 4px 12px rgba(20,90,50,0.10)',
          }}>
            <span style={{ width: 62, height: 62, borderRadius: 20, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 10 }}>{a.icon}</span>
            <span style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.2 }}>{a.label}</span>
            <span style={{ fontSize: 12, color: '#3d5546', fontWeight: 500, lineHeight: 1.3, marginTop: 5, maxWidth: 150 }}>{a.desc}</span>
            <span style={{ position: 'absolute', right: 10, bottom: 10, width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(160deg,#2fa84a,${a.btn})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(10,80,30,.35)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </Link>
        ))}
      </div>

      {/* Aim Higher banner */}
      <div style={{ marginTop: 18, position: 'relative', borderRadius: 26, padding: '16px 14px 18px', background: 'linear-gradient(120deg,#e6f7df,#d2f0c9)', border: '1.5px solid #c1e5b8', boxShadow: '0 4px 12px rgba(20,90,50,0.10)', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
          <span style={{ fontSize: 50, lineHeight: 1 }}>🏆</span>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, color: INK, letterSpacing: -0.3 }}>Aim Higher!</div>
            <div style={{ fontSize: 13.5, color: '#2f4a3a', fontWeight: 500, marginTop: 2 }}>Prepare well and ace your exam.</div>
          </div>
        </div>
        <Link to="/daily-mock-exam" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '12px 34px', borderRadius: 999, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 15.5, background: 'linear-gradient(180deg,#169a3f,#0b6b2c)', boxShadow: '0 3px 8px rgba(2,52,31,.35)' }}>
          Start Studying
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
    </div>
  );
}
