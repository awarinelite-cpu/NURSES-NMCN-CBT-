// src/components/shared/NmcnBottomNav.jsx
// Phone-only bottom tab bar for the NMCN CBT side:
// Home · Practice · Group Study · Library · Profile
import { NavLink, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/dashboard',    icon: '🏠', label: 'Home',        match: ['/dashboard'] },
  { to: '/quick-actions', icon: '📝', label: 'Practice',   match: ['/quick-actions', '/course-drill', '/topic-drill', '/mock-exams', '/daily-mock-exam', '/past-questions', '/exams', '/exam/', '/caosce', '/bookmarks', '/essay-questions'] },
  { to: '/group-chat',   icon: '👥', label: 'Group Study', match: ['/group-chat', '/chat', '/study-buddy', '/leaderboard'] },
  { to: '/lecture-notes', icon: '📚', label: 'Library',    match: ['/lecture-notes', '/notes'] },
  { to: '/profile',      icon: '👤', label: 'Profile',     match: ['/profile', '/results', '/performance', '/badges', '/subscription', '/notifications', '/study-plan', '/progress-wall'] },
];

export default function NmcnBottomNav() {
  const { pathname } = useLocation();
  const isActive = (t) => t.match.some(m => (m === '/dashboard' ? pathname === m : pathname.startsWith(m)));

  return (
    <>
      <style>{`
        .nmcn-bottom-nav { display: none; }
        @media (max-width: 900px) {
          .nmcn-bottom-nav {
            display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 150;
            background: var(--nav-bg); border-top: 1px solid var(--border);
            padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
            box-shadow: 0 -4px 20px rgba(0,0,0,0.35);
          }
          .nmcn-has-bottom-nav .main-content { padding-bottom: 84px; }
        }
        .nmcn-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
          text-decoration: none; padding: 4px 2px 6px; position: relative;
          font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.62); -webkit-tap-highlight-color: transparent; }
        .nmcn-tab .ico { font-size: 24px; line-height: 1.1; filter: grayscale(0.4); opacity: 0.85; }
        .nmcn-tab.active { color: #2dd4bf; }
        .nmcn-tab.active .ico { filter: none; opacity: 1; }
        .nmcn-tab.active::after { content: ''; position: absolute; bottom: 0; left: 22%; right: 22%; height: 3px; border-radius: 2px; background: #2dd4bf; }
      `}</style>
      <nav className="nmcn-bottom-nav" aria-label="Main navigation">
        {TABS.map(t => (
          <NavLink key={t.to} to={t.to} className={`nmcn-tab${isActive(t) ? ' active' : ''}`}>
            <span className="ico">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
