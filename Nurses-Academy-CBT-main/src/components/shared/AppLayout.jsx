// src/components/shared/AppLayout.jsx
import { useState, useEffect } from 'react';
import { Outlet, useLocation }  from 'react-router-dom';
import Navbar                   from './Navbar';
import Sidebar                  from './Sidebar';
import InstallBanner            from './InstallBanner';
import MessageNotifier          from './MessageNotifier';
import { useToast }             from './Toast';
import { useAuth }              from '../../context/AuthContext';
import {
  shouldShowStreakReminder,
  dismissStreakReminderForToday,
  fireStreakReminderNotification,
} from '../../utils/streakReminder';
import { fetchStreak } from '../../utils/streakUtils';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [streakData,  setStreakData]     = useState(null);
  const [streakToastFired, setStreakToastFired] = useState(false);
  const { user }  = useAuth();
  const { toast } = useToast();
  const location  = useLocation();

  // Detect entrance vs NMCN context for MessageNotifier
  const isEntrance = location.pathname.startsWith('/entrance-exam');

  // ── Fetch streak once on mount, re-check when route changes ──────────────
  useEffect(() => {
    if (!user?.uid) return;
    fetchStreak(user.uid)
      .then(data => setStreakData(data))
      .catch(() => {});
  }, [user?.uid]);

  // ── Evening streak-ending reminder (fires a toast + native notification) ─
  useEffect(() => {
    if (streakToastFired) return;
    if (!shouldShowStreakReminder(streakData)) return;

    // Fire the browser push notification
    fireStreakReminderNotification(streakData.currentStreak);

    // Also show an in-app toast so it's visible without leaving the page
    toast(
      `🔥 Your ${streakData.currentStreak}-day streak ends tonight! Tap Daily Practice to save it.`,
      'warning',
      8000
    );

    dismissStreakReminderForToday();
    setStreakToastFired(true);
  }, [streakData, streakToastFired, toast]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar onMenuToggle={() => setSidebarOpen(o => !o)} />
      <div className="dashboard-layout" style={{ minHeight: 'calc(100vh - 60px)' }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main-content" style={{ minHeight: 'calc(100vh - 60px)', overflowX: 'hidden' }}>
          <Outlet />
        </main>
      </div>
      <InstallBanner />
      {/* Message notifier — watches for new DMs and fires toast + push */}
      <MessageNotifier mode={isEntrance ? 'entrance' : 'nmcn'} />
    </div>
  );
}
