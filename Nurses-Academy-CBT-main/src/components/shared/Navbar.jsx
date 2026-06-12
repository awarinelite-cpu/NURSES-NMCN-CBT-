// src/components/shared/Navbar.jsx
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import NotificationBell from './NotificationBell';
import AccessibilityToolbar from './AccessibilityToolbar';

// ─── Per-site last-visited location tracker ───────────────────────────────────
// Each time a user visits a clearly-site-specific page we store that path
// so that when they switch back we can resume from where they left off.
const SITE_KEY   = 'nmcn_site';
const CBT_LAST   = 'nmcn_last_cbt';
const ENT_LAST   = 'nmcn_last_entrance';

// Pages that belong unambiguously to one site
const entrancePrefixes = ['/entrance-exam', '/admin/entrance-exam'];
const cbtPrefixes      = [
  '/dashboard', '/admin', '/exams', '/daily-practice', '/course-drill',
  '/topic-drill', '/mock-exams', '/mock-reviews', '/performance',
  '/leaderboard', '/subscription',
];

function isEntrancePath(p) { return entrancePrefixes.some(x => p.startsWith(x)); }
function isCBTPath(p)      { return cbtPrefixes.some(x => p.startsWith(x)); }

// Tracks which "site" the user is in and remembers last location per site
function useSiteContext() {
  const location = useLocation();
  const path     = location.pathname;

  const definitelyEntrance = isEntrancePath(path);
  const definitelyCBT      = isCBTPath(path);

  useEffect(() => {
    if (definitelyEntrance) {
      localStorage.setItem(SITE_KEY,  'entrance');
      localStorage.setItem(ENT_LAST,  path + location.search);
    } else if (definitelyCBT) {
      localStorage.setItem(SITE_KEY,  'cbt');
      localStorage.setItem(CBT_LAST,  path + location.search);
    }
    // Neutral pages (/admin, /profile, /results) → don't overwrite stored context
  }, [path, definitelyEntrance, definitelyCBT, location.search]);

  const stored = localStorage.getItem(SITE_KEY) || 'cbt';
  if (definitelyEntrance) return 'entrance';
  if (definitelyCBT)      return 'cbt';
  return stored;
}

export default function Navbar({ onMenuToggle }) {
  const { user, profile, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef    = useRef(null);

  const site      = useSiteContext();
  const isEntrance = site === 'entrance';

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Dashboard destination for the current site
  const dashboardTo = isEntrance
    ? '/entrance-exam'
    : isAdmin ? '/admin' : '/dashboard';

  // ── Site switch ────────────────────────────────────────────────────────────
  const handleSiteSwitch = () => {
    setDropOpen(false);
    if (isEntrance) {
      // Switch to NMCN CBT — resume where we left off, or land on the
      // main NMCN CBT interface (not the admin control panel) by default
      const last = localStorage.getItem(CBT_LAST);
      localStorage.setItem(SITE_KEY, 'cbt');
      navigate(last || '/dashboard');
    } else {
      // Switch to Entrance Exam — resume where we left off
      const last = localStorage.getItem(ENT_LAST);
      localStorage.setItem(SITE_KEY, 'entrance');
      navigate(last || '/entrance-exam');
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem(SITE_KEY);
    localStorage.removeItem(CBT_LAST);
    localStorage.removeItem(ENT_LAST);
    await logout();
    navigate('/');
  };

  return (
    <header style={styles.navbar}>

      {/* Top: big bold site banner */}
      <div style={styles.brandBanner}>
        <Link to={user ? dashboardTo : '/'} style={styles.brandLink}>
          <span style={styles.brandIcon}>📚</span>
          <span style={styles.brandText}>
            The Elite Nurses
            <span style={styles.brandTagline}>Your Path to Nursing Excellence</span>
          </span>
        </Link>
      </div>

      {/* Below: menu toggle + theme toggle + user dropdown */}
      <div style={styles.inner}>

        {/* Left: menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && (
            <button style={styles.menuBtn} onClick={onMenuToggle} aria-label="Toggle sidebar">
              ☰
            </button>
          )}
        </div>

        {/* Right: theme toggle + notifications + user dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AccessibilityToolbar />

          <button
            style={styles.themeBtn}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {user && <NotificationBell />}

          {user ? (
            <div style={{ position: 'relative' }} ref={dropRef}>
              <button
                style={styles.avatarBtn}
                onClick={() => setDropOpen(!dropOpen)}
                aria-haspopup="true"
                aria-expanded={dropOpen}
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
                <div style={styles.dropdown}>
                  {/* 1. Admin Panel — admins only, CBT side only */}
                  {isAdmin && !isEntrance && (
                    <Link to="/admin" style={styles.dropItem} onClick={() => setDropOpen(false)}>
                      🛡️ Admin Panel
                    </Link>
                  )}

                  {/* 2. Dashboard */}
                  <Link to={dashboardTo} style={styles.dropItem} onClick={() => setDropOpen(false)}>
                    🏠 Dashboard
                  </Link>

                  {/* 3. My Profile */}
                  <Link to="/profile" style={styles.dropItem} onClick={() => setDropOpen(false)}>
                    👤 My Profile
                  </Link>

                  {/* 4. My Results */}
                  <Link to="/results" style={styles.dropItem} onClick={() => setDropOpen(false)}>
                    📊 My Results
                  </Link>

                  {/* 5. Switch interface */}
                  <div style={styles.dropDivider} />
                  <button style={styles.dropItem} onClick={handleSiteSwitch}>
                    <span style={styles.switchLabel}>
                      <span style={styles.switchIcon}>
                        {isEntrance ? '🎓' : '🏫'}
                      </span>
                      <span>
                        <span style={styles.switchTitle}>
                          {isEntrance ? 'Switch to NMCN CBT' : 'Switch to Entrance Exam'}
                        </span>
                        <span style={styles.switchSub}>
                          {isEntrance
                            ? 'Resume your CBT prep'
                            : 'Resume entrance exam prep'}
                        </span>
                      </span>
                    </span>
                    {/* Pill badge showing current mode */}
                    <span style={{
                      ...styles.modeBadge,
                      background: isEntrance
                        ? 'linear-gradient(135deg,#0891b2,#0e7490)'
                        : 'linear-gradient(135deg,#0D9488,#0f766e)',
                    }}>
                      {isEntrance ? 'ENTRANCE' : 'NMCN'}
                    </span>
                  </button>

                  {/* 6. Sign Out */}
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
  brandBanner: {
    width: '100%',
    padding: '18px 20px 14px',
    textAlign: 'center',
    background: 'linear-gradient(135deg, rgba(13,148,136,0.18), rgba(30,58,138,0.18))',
    borderBottom: '1px solid var(--border)',
  },
  brandLink: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 14, textDecoration: 'none', flexWrap: 'wrap',
  },
  brandIcon: {
    fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1, flexShrink: 0,
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
    fontSize: 20, cursor: 'pointer', padding: '4px 6px',
    borderRadius: 6, display: 'none',
  },
  themeBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 38, height: 38, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
    transition: 'background 0.15s, transform 0.15s',
  },
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
    minWidth: 230, overflow: 'hidden', zIndex: 200,
    animation: 'fadeIn 0.15s ease',
  },
  dropItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '11px 16px', color: 'var(--text-secondary)',
    fontSize: 14, fontWeight: 600, textDecoration: 'none',
    transition: 'background 0.15s', cursor: 'pointer',
    background: 'none', border: 'none', width: '100%', textAlign: 'left',
    justifyContent: 'space-between',
  },
  dropDivider: { height: 1, background: 'var(--border)', margin: '4px 0' },
  logoutBtn:  { color: 'var(--red)', fontFamily: 'inherit' },

  // Switch item internals
  switchLabel: {
    display: 'flex', alignItems: 'center', gap: 10, flex: 1,
  },
  switchIcon: {
    fontSize: 20, lineHeight: 1,
  },
  switchTitle: {
    display: 'block', fontSize: 13, fontWeight: 700,
    color: 'var(--text-primary)', lineHeight: 1.3,
  },
  switchSub: {
    display: 'block', fontSize: 11, fontWeight: 400,
    color: 'var(--text-muted)', lineHeight: 1.4,
  },
  modeBadge: {
    fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
    color: '#fff', padding: '3px 7px', borderRadius: 20,
    textTransform: 'uppercase', flexShrink: 0, alignSelf: 'center',
  },
};
