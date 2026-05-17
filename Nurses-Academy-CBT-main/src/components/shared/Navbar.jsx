// src/components/shared/Navbar.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

// Tracks which "site" the user is in across shared pages like /profile, /results
// Written whenever the user is on a clearly-site-specific page
function useSiteContext() {
  const location = useLocation();
  const path = location.pathname;

  // Clearly entrance pages → remember 'entrance'
  const isDefinitelyEntrance =
    path.startsWith('/entrance-exam') ||
    path.startsWith('/admin/entrance-exam');

  // Clearly CBT pages → remember 'cbt'
  const isDefinitelyCBT =
    path.startsWith('/dashboard') ||
    path.startsWith('/exams') ||
    path.startsWith('/daily-practice') ||
    path.startsWith('/course-drill') ||
    path.startsWith('/topic-drill') ||
    path.startsWith('/mock-exams') ||
    path.startsWith('/mock-reviews') ||
    path.startsWith('/performance') ||
    path.startsWith('/leaderboard') ||
    path.startsWith('/subscription') ||
    path.startsWith('/admin');

  useEffect(() => {
    if (isDefinitelyEntrance) localStorage.setItem('nmcn_site', 'entrance');
    else if (isDefinitelyCBT)  localStorage.setItem('nmcn_site', 'cbt');
  }, [path, isDefinitelyEntrance, isDefinitelyCBT]);

  // Current site — from path first, then localStorage fallback
  const stored = localStorage.getItem('nmcn_site') || 'cbt';
  if (isDefinitelyEntrance) return 'entrance';
  if (isDefinitelyCBT)      return 'cbt';
  return stored; // shared pages like /profile, /results use remembered context
}

export default function Navbar({ onMenuToggle }) {
  const { user, profile, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [dropOpen, setDropOpen] = useState(false);

  const site = useSiteContext(); // 'entrance' | 'cbt'
  const isEntrance = site === 'entrance';

  // Dashboard destination — always stays within current site
  const dashboardTo = isEntrance
    ? '/entrance-exam'
    : isAdmin ? '/admin' : '/dashboard';

  const handleLogout = async () => {
    localStorage.removeItem('nmcn_site');
    await logout();
    navigate('/');
  };

  return (
    <header style={styles.navbar}>
      <div style={styles.inner}>

        {/* Left: menu + brand — brand logo always goes to current site's dashboard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && (
            <button style={styles.menuBtn} onClick={onMenuToggle} aria-label="Toggle sidebar">
              ☰
            </button>
          )}
          <Link to={user ? dashboardTo : '/'} style={styles.brand}>
            <span style={styles.brandIcon}>📚</span>
            <span>NMCN<span style={styles.brandAccent}>CBT</span></span>
          </Link>
        </div>

        {/* Right: theme toggle + user dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="toggle-track" onClick={toggleTheme} title="Toggle dark mode">
            <div className="toggle-thumb" />
            <span style={{ position: 'absolute', left: -9999 }}>
              {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </span>
          </button>

          {user ? (
            <div style={{ position: 'relative' }}>
              <button
                style={styles.avatarBtn}
                onClick={() => setDropOpen(!dropOpen)}
                aria-haspopup="true"
              >
                <div style={styles.avatar}>
                  {(profile?.name || user.displayName || 'U')[0].toUpperCase()}
                </div>
                <div style={styles.avatarInfo}>
                  <span style={styles.avatarName}>
                    {profile?.name || user.displayName || 'Student'}
                  </span>
                  <span style={styles.avatarRole}>
                    {isAdmin ? '🛡️ Admin' : '🎓 Student'}
                  </span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>▾</span>
              </button>

              {dropOpen && (
                <div style={styles.dropdown} onClick={() => setDropOpen(false)}>
                  {/* Admin Panel — only for admins, only on CBT/admin side */}
                  {isAdmin && !isEntrance && (
                    <Link to="/admin" style={styles.dropItem}>🛡️ Admin Panel</Link>
                  )}
                  {/* Dashboard — always goes back to current site's home */}
                  <Link to={dashboardTo} style={styles.dropItem}>🏠 Dashboard</Link>
                  <Link to="/profile" style={styles.dropItem}>👤 My Profile</Link>
                  <Link to="/results" style={styles.dropItem}>📊 My Results</Link>
                  <div style={styles.dropDivider} />
                  <button style={{ ...styles.dropItem, ...styles.logoutBtn }} onClick={handleLogout}>
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/auth" className="btn btn-primary btn-sm">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

const styles = {
  navbar: {
    background: 'var(--nav-bg)',
    borderBottom: '2px solid var(--teal)',
    position: 'sticky', top: 0, zIndex: 100,
    boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
  },
  inner: {
    maxWidth: 1400, margin: '0 auto', padding: '0 20px',
    height: 60, display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuBtn: {
    background: 'none', border: 'none', color: '#fff',
    fontSize: 20, cursor: 'pointer', padding: '4px 6px',
    borderRadius: 6, display: 'none',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: "'Playfair Display', serif",
    fontSize: 20, fontWeight: 900, color: '#FFFFFF',
    textDecoration: 'none', letterSpacing: 0.5,
  },
  brandIcon: { fontSize: 22 },
  brandAccent: { color: '#14B8A8' },
  avatarBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, padding: '6px 12px', cursor: 'pointer', color: '#fff',
  },
  avatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'linear-gradient(135deg, #0D9488, #1E3A8A)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 13, color: '#fff', flexShrink: 0,
  },
  avatarInfo: { display: 'flex', flexDirection: 'column', textAlign: 'left' },
  avatarName: { fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.3 },
  avatarRole: { fontSize: 10, color: 'rgba(255,255,255,0.55)' },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    minWidth: 200, overflow: 'hidden', zIndex: 200,
    animation: 'fadeIn 0.15s ease',
  },
  dropItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '11px 16px', color: 'var(--text-secondary)',
    fontSize: 14, fontWeight: 600, textDecoration: 'none',
    transition: 'background 0.15s', cursor: 'pointer',
    background: 'none', border: 'none', width: '100%', textAlign: 'left',
  },
  dropDivider: { height: 1, background: 'var(--border)', margin: '4px 0' },
  logoutBtn: { color: 'var(--red)', fontFamily: 'inherit' },
};
