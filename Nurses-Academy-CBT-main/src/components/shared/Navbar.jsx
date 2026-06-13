// src/components/shared/Navbar.jsx
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import NotificationBell from './NotificationBell';

// ─── Per-site last-visited location tracker ───────────────────────────────────
const SITE_KEY = 'nmcn_site';
const CBT_LAST = 'nmcn_last_cbt';
const ENT_LAST = 'nmcn_last_entrance';

const entrancePrefixes = ['/entrance-exam', '/admin/entrance-exam'];
const cbtPrefixes      = [
  '/dashboard', '/exams', '/daily-practice', '/course-drill',
  '/topic-drill', '/mock-exams', '/mock-reviews', '/performance',
  '/leaderboard', '/subscription',
];

function isEntrancePath(p) { return entrancePrefixes.some(x => p.startsWith(x)); }
function isCBTPath(p)      { return cbtPrefixes.some(x => p.startsWith(x)); }

function useSiteContext() {
  const location = useLocation();
  const path     = location.pathname;

  const definitelyEntrance = isEntrancePath(path);
  const definitelyCBT      = isCBTPath(path);

  useEffect(() => {
    if (definitelyEntrance) {
      localStorage.setItem(SITE_KEY, 'entrance');
      localStorage.setItem(ENT_LAST, path + location.search);
    } else if (definitelyCBT) {
      localStorage.setItem(SITE_KEY, 'cbt');
      localStorage.setItem(CBT_LAST, path + location.search);
    }
  }, [path, definitelyEntrance, definitelyCBT, location.search]);

  const stored = localStorage.getItem(SITE_KEY) || 'cbt';
  if (definitelyEntrance) return 'entrance';
  if (definitelyCBT)      return 'cbt';
  return stored;
}

export default function Navbar({ onMenuToggle }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const site      = useSiteContext();
  const isEntrance = site === 'entrance';
  const dashboardTo = isEntrance ? '/entrance-exam' : '/dashboard';

  return (
    <header style={styles.navbar}>

      {/* Top: brand banner */}
      <div style={styles.brandBanner}>
        <Link to={user ? dashboardTo : '/'} style={styles.brandLink}>
          <img
            src="/logo.png"
            alt="The Elite Nurses Logo"
            style={{ height: 'clamp(70px, 14vw, 110px)', width: 'auto', flexShrink: 0, objectFit: 'contain' }}
          />
          <span style={styles.brandText}>
            The Elite Nurses
            <span style={styles.brandTagline}>Your Path to Nursing Excellence</span>
          </span>
        </Link>
      </div>

      {/* Bottom bar: ☰ left — theme + bell right */}
      <div style={styles.inner}>

        {/* Left: hamburger */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {user && (
            <button style={styles.menuBtn} onClick={onMenuToggle} aria-label="Toggle sidebar">
              ☰
            </button>
          )}
        </div>

        {/* Right: theme toggle + notifications */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            style={styles.themeBtn}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {user && <NotificationBell />}

          {!user && (
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
  brandBanner: {
    width: '100%',
    padding: '18px 20px 14px',
    textAlign: 'center',
    background: 'linear-gradient(135deg, rgba(13,148,136,0.18), rgba(30,58,138,0.18))',
    borderBottom: '1px solid var(--border)',
  },
  brandLink: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 4, textDecoration: 'none', flexWrap: 'wrap',
  },
  brandText: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    fontFamily: "'Playfair Display', serif",
    fontWeight: 900, color: '#FFFFFF',
    fontSize: 'clamp(24px, 5.5vw, 48px)',
    lineHeight: 1.15, letterSpacing: 0.5,
  },
  brandTagline: {
    display: 'block',
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 600, color: '#14B8A8',
    fontSize: 'clamp(11px, 2.2vw, 18px)',
    letterSpacing: 0.6, marginTop: 4,
  },
  inner: {
    maxWidth: 1400, margin: '0 auto', padding: '0 20px',
    height: 52, display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuBtn: {
    background: 'none', border: 'none', color: '#fff',
    fontSize: 22, cursor: 'pointer', padding: '4px 6px',
    borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  themeBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 38, height: 38, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
    transition: 'background 0.15s, transform 0.15s',
  },
};
