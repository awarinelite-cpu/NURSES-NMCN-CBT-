// src/components/student/QuickActionsPage.jsx
import { Link } from 'react-router-dom';

const actions = [
  {
    to: '/daily-practice',
    icon: '⚡',
    label: 'Daily Practice',
    desc: 'Take daily exam',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
  },
  {
    to: '/course-drill',
    icon: '📖',
    label: 'Course Drill',
    desc: 'Take exam by courses',
    color: '#0D9488',
    bg: 'rgba(13,148,136,0.12)',
  },
  {
    to: '/topic-drill',
    icon: '🎯',
    label: 'Topic Drill',
    desc: 'Take exam by topics',
    color: '#2563EB',
    bg: 'rgba(37,99,235,0.12)',
  },
  {
    to: '/mock-exams',
    icon: '📋',
    label: 'Mock Exams',
    desc: 'Study daily Hospital Final exam',
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.12)',
  },
  {
    to: '/past-questions',
    icon: '📜',
    label: 'Past Questions',
    desc: 'Study NMCN past questions',
    color: '#DC2626',
    bg: 'rgba(220,38,38,0.12)',
  },
  {
    to: '/bookmarks',
    icon: '🔖',
    label: 'Bookmarks',
    desc: 'Review your Bookmarked questions',
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.12)',
  },
];

export default function QuickActionsPage() {
  return (
    <div style={{ padding: '24px', maxWidth: 800 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(1.3rem, 3vw, 1.8rem)',
          color: 'var(--text-primary)',
          margin: '0 0 6px',
        }}>
          ⚡ Quick Actions
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Choose how you want to study today
        </p>
      </div>

      {/* Grid */}
      <div style={styles.quickGrid}>
        {actions.map(action => (
          <Link key={action.to} to={action.to} style={styles.quickCard}>
            <div style={{ ...styles.iconBox, background: action.bg }}>
              <span style={{ fontSize: 28 }}>{action.icon}</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {action.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3, textAlign: 'center' }}>
              {action.desc}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const styles = {
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 14,
  },
  quickCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    padding: '24px 16px',
    background: 'var(--bg-card)',
    border: '1.5px solid var(--border)',
    borderRadius: 14,
    textDecoration: 'none',
    color: 'var(--text-primary)',
    transition: 'var(--transition)',
    textAlign: 'center',
    cursor: 'pointer',
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
