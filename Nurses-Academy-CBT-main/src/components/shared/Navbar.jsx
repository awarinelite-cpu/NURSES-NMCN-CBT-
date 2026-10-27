// src/components/shared/Navbar.jsx
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import NotificationBell from './NotificationBell';
import FontSizeControl from './FontSizeControl';

// ─── Per-site last-visited location tracker ───────────────────────────────────
const SITE_KEY = 'nmcn_site';
const CBT_LAST = 'nmcn_last_cbt';
const ENT_LAST = 'nmcn_last_entrance';

const entrancePrefixes = ['/entrance-exam', '/admin/entrance-exam'];
const cbtPrefixes      = [
  '/dashboard', '/exams', '/daily-practice', '/daily-mock-exam', '/course-drill',
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

function useIsMobile(bp = 900) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth <= bp);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp}px)`);
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h); };
  }, [bp]);
  return m;
}

export default function Navbar({ onMenuToggle }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const site      = useSiteContext();
  const isEntrance = site === 'entrance';
  const dashboardTo = isEntrance ? '/entrance-exam' : '/dashboard';

  // Compact one-row header for the NMCN CBT side on phones
  if (user && isMobile && !isEntrance) {
    return (
      <header style={styles.compactNav}>
        <button style={styles.compactMenu} onClick={onMenuToggle} aria-label="Toggle sidebar">
          <span style={styles.bar} /><span style={styles.bar} /><span style={styles.bar} />
        </button>
        <Link to={dashboardTo} style={styles.compactBrand}>
          <img src="/logo.png" alt="The Elite Nurses Logo" style={{ height: 56, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          <span style={styles.compactText}>
            The Elite Nurses
            <span style={styles.compactTagline}>Your Path to Nursing Excellence</span>
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            style={{
              ...styles.themeBtn, width: 40, height: 40,
              background: theme === 'dark' ? 'rgba(245,158,11,0.15)' : theme === 'reading' ? 'rgba(160,132,92,0.2)' : 'rgba(30,58,138,0.15)',
              border: theme === 'dark' ? '1px solid rgba(245,158,11,0.45)' : theme === 'reading' ? '1px solid rgba(160,132,92,0.4)' : '1px solid rgba(99,102,241,0.35)',
            }}
            onClick={toggleTheme}
            aria-label="Switch theme"
          >
            <span style={{ fontSize: 18 }}>{theme === 'dark' ? '☀️' : theme === 'light' ? '📖' : '🌙'}</span>
          </button>
          <FontSizeControl />
          <NotificationBell />
        </div>
      </header>
    );
  }

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
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              style={{
                ...styles.themeBtn,
                background: theme === 'dark'    ? 'rgba(245,158,11,0.15)'
                          : theme === 'reading' ? 'rgba(160,132,92,0.2)'
                          : 'rgba(30,58,138,0.15)',
                border:     theme === 'dark'    ? '1px solid rgba(245,158,11,0.3)'
                          : theme === 'reading' ? '1px solid rgba(160,132,92,0.4)'
                          : '1px solid rgba(99,102,241,0.35)',
              }}
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : theme === 'light' ? 'Switch to Reading Mode' : 'Switch to Dark Mode'}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : theme === 'light' ? 'Switch to Reading Mode' : 'Switch to Dark Mode'}
            >
              <span style={{ fontSize: 18, transition: 'transform 0.35s', display: 'block' }}>
                {theme === 'dark' ? '☀️' : theme === 'light' ? '📖' : '🌙'}
              </span>
            </button>
          </div>

          <FontSizeControl />

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
  compactNav: {
    background: 'var(--nav-bg)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 100,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', minHeight: 64,
  },
  compactMenu: {
    background: 'none', border: 'none', cursor: 'pointer', padding: 6,
    display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0,
  },
  bar: { display: 'block', width: 24, height: 3, borderRadius: 2, background: '#fff' },
  compactBrand: {
    display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
    flex: 1, minWidth: 0,
  },
  compactText: {
    display: 'flex', flexDirection: 'column', minWidth: 0,
    fontFamily: "'Playfair Display', serif", fontWeight: 900, color: '#fff',
    fontSize: 'clamp(17px, 5.4vw, 26px)', lineHeight: 1.1, whiteSpace: 'nowrap',
  },
  compactTagline: {
    fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: '#14B8A8',
    fontSize: 'clamp(9px, 2.9vw, 13px)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis',
  },
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
