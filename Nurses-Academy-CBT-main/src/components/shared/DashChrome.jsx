// src/components/shared/DashChrome.jsx
// Shared "Elite dashboard" chrome: green wave AppHeader + navy DashBottomNav.
// Used by the dashboard and by every other NMCN page so the app looks like one product.
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import DashMenuSheet from './DashMenuSheet';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
export const DEEP = '#04472b';
export const DEEPER = '#02341f';
export const LIME = '#8be04e';
export const NAVY = '#0b1f4a';
export const NAVY_DEEP = '#06122e';

const PATHS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  book: <path d="M12 6.5C10.3 5.2 8 4.7 3.5 5v13c4.5-.3 6.8.2 8.5 1.5 1.7-1.3 4-1.8 8.5-1.5V5c-4.5-.3-6.8.2-8.5 1.5zM12 6.5v13" />,
  home: <path d="M3.5 11 12 3.5 20.5 11M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  bars: <path d="M6 20V11M11 20V6M16 20V9M21 20V14" />,
  community: <><circle cx="12" cy="8" r="3" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /><path d="M6.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M1.5 18c0-2.2 1.5-3.7 3.5-4M22.5 18c0-2.2-1.5-3.7-3.5-4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8" /></>,
  moon: <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.8 6.8 0 0 0 9.7 9.7z" />,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9zM9 13l2 2 4-4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
};
export function ChromeIcon({ name, size = 22, stroke = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

export const ctlBtn = {
  width: 34, height: 34, flex: '0 0 auto', borderRadius: '50%', padding: 0, cursor: 'pointer', color: '#fff',
  background: 'linear-gradient(160deg,#2f9a45,#0b5a31)', border: '2px solid rgba(160,230,110,.75)',
  boxShadow: '0 2px 6px rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: FONT,
};

// Round profile picture (falls back to the student's initial)
function Avatar({ size = 40 }) {
  const { user, profile } = useAuth();
  const [broken, setBroken] = useState(false);
  const src = profile?.photoURL || profile?.photo || profile?.avatar || user?.photoURL;
  const name = profile?.name || user?.displayName || 'S';
  return src && !broken ? (
    <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)}
      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  ) : (
    <span style={{ fontSize: size * 0.45, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{name.trim()[0].toUpperCase()}</span>
  );
}

// compact = slimmer wave, sticky (inner pages). Dashboard passes compact={false}.
export function AppHeader({ onMenu, compact = true, waveFill = 'var(--bg-primary)' }) {
  const { theme, toggleTheme } = useTheme();
  const themeIcon = theme === 'light' ? 'sun' : theme === 'reading' ? 'book' : 'moon';
  return (
    <header className="dc-head" style={{
      position: compact ? 'sticky' : 'relative', top: 0, zIndex: compact ? 100 : 3,
      background: `linear-gradient(100deg,#1b8a32 0%,${DEEP} 38%,${DEEPER} 100%)`,
      padding: `calc(env(safe-area-inset-top, 0px) + ${compact ? 8 : 14}px) 0 ${compact ? 22 : 38}px`,
    }}>
      <svg viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true"
        style={{ position: 'absolute', left: 0, right: 0, bottom: -1, width: '100%', height: compact ? 22 : 34, pointerEvents: 'none' }}>
        <path d="M0 40V10C60 30 120 36 190 24 270 8 330 4 400 16V40z" fill={waveFill} />
        <path d="M0 10C60 30 120 36 190 24 270 8 330 4 400 16" fill="none" stroke={LIME} strokeWidth="3" />
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', position: 'relative' }}>
        <button type="button" onClick={onMenu} aria-label="Profile"
          style={{ ...ctlBtn, width: 40, height: 40, flex: '0 0 auto', overflow: 'hidden', background: 'linear-gradient(160deg,#2f9a45,#0b5a31)', border: '2px solid rgba(160,230,110,.75)' }}>
          <Avatar size={40} />
        </button>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 0', minWidth: 0, overflow: 'hidden', textDecoration: 'none' }}>
          <img src="/logo.png" alt="The Elite Nurses" style={{ height: compact ? 40 : 44, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', color: '#fff' }}>
            <span style={{ fontWeight: 800, fontSize: 'clamp(13px,4.2vw,18px)', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>The Elite Nurses</span>
            <span style={{ fontSize: 'clamp(9px,2.8vw,11.5px)', opacity: .92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Your Path to Nursing Excellence...</span>
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
          <button type="button" onClick={toggleTheme} aria-label="Switch theme" style={ctlBtn}>
            <ChromeIcon name={themeIcon} size={20} stroke={2.2} />
          </button>
          <NotificationBell
            btnStyle={{ ...ctlBtn, fontSize: 18 }}
            badgeStyle={{ top: -5, right: -5, minWidth: 18, height: 18, lineHeight: '18px', boxShadow: '0 0 0 2px #fff' }}
          />
        </div>
      </div>
    </header>
  );
}

const NAV = [
  { to: '/dashboard',    label: 'Home',     icon: 'home',      match: ['/dashboard'] },
  { to: '/quick-actions', label: 'Practice', icon: 'clipboard', match: ['/quick-actions', '/course-drill', '/topic-drill', '/mock-exams', '/daily-mock-exam', '/past-questions', '/exams', '/exam/', '/caosce', '/bookmarks', '/essay-questions', '/lecture-notes', '/notes'] },
  { to: '/results',      label: 'Results',  icon: 'bars',      match: ['/results', '/performance'] },
];

// Navy bar docked to the bottom of the screen on phones: Home · Practice · Results · Menu
export function DashBottomNav() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = n => n.match.some(m => (m === '/dashboard' ? pathname === m : pathname.startsWith(m)));
  const itemStyle = on => ({
    flex: 1, height: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
    textDecoration: 'none', position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: FONT,
    WebkitTapHighlightColor: 'transparent', color: on ? LIME : '#fff', fontSize: 12.5, fontWeight: on ? 800 : 600, padding: 0,
  });
  const bar = on => on && <span style={{ position: 'absolute', top: 0, width: 32, height: 3, borderRadius: 2, background: LIME }} />;
  return (
    <>
      <style>{`.dc-nav{display:none}@media(max-width:900px){.dc-nav{display:flex}.main-content{padding-bottom:calc(72px + env(safe-area-inset-bottom,0px)) !important}}`}</style>
      <nav className="dc-nav" aria-label="Main navigation" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 150,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)', alignItems: 'stretch', justifyContent: 'space-around',
        background: `linear-gradient(180deg,${NAVY},${NAVY_DEEP})`, borderTop: '1px solid rgba(255,255,255,.12)',
        boxShadow: '0 -4px 18px rgba(0,0,0,.30)', fontFamily: FONT,
      }}>
        {NAV.map(n => {
          const on = isActive(n) && !menuOpen;
          return (
            <Link key={n.label} to={n.to} style={itemStyle(on)}>
              {bar(on)}
              <ChromeIcon name={n.icon} size={24} stroke={on ? 2.3 : 2} />
              <span>{n.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" style={itemStyle(menuOpen)}>
          {bar(menuOpen)}
          <ChromeIcon name="menu" size={24} stroke={menuOpen ? 2.5 : 2.2} />
          <span>Menu</span>
        </button>
      </nav>
      <DashMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
