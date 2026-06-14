// src/components/shared/AppLayout.jsx
import { useState }          from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar                from './Navbar';
import Sidebar               from './Sidebar';
import EntranceBottomNav     from '../entrance/EntranceBottomNav';

const entrancePrefixes = ['/entrance-exam', '/admin/entrance-exam'];
function isEntrancePath(p) { return entrancePrefixes.some(x => p.startsWith(x)); }

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const showEntranceNav = isEntrancePath(location.pathname);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar onMenuToggle={() => setSidebarOpen(o => !o)} />
      <div className="dashboard-layout" style={{ minHeight: 'calc(100vh - 60px)' }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main-content" style={{ minHeight: 'calc(100vh - 60px)', overflowX: 'hidden' }}>
          <Outlet />
        </main>
      </div>
      {/* Draggable FAB with notification badge — only on entrance exam routes */}
      {showEntranceNav && <EntranceBottomNav />}
    </div>
  );
}
