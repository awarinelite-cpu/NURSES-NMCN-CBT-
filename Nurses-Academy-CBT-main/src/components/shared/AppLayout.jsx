// src/components/shared/AppLayout.jsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar  from './Navbar';
import Sidebar from './Sidebar';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar onMenuToggle={() => setSidebarOpen(o => !o)} />
      <div className="dashboard-layout" style={{ minHeight: 'calc(100vh - 60px)' }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main-content" style={{ minHeight: 'calc(100vh - 60px)', overflowX: 'hidden' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
