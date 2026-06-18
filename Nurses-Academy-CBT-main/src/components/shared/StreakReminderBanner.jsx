// src/components/shared/StreakReminderBanner.jsx
// "Your streak ends tonight!" banner — shown on the dashboard in the evening
// to students who have an active streak but haven't practiced yet today.
//
// This is an in-app banner, not a true push notification (this codebase has
// no backend push server). If the browser already has Notification permission
// granted, a local notification is also fired once via streakReminder.js.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  shouldShowStreakReminder,
  dismissStreakReminderForToday,
  fireStreakReminderNotification,
} from '../../utils/streakReminder';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

export default function StreakReminderBanner({ streakData }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [firedNotification, setFiredNotification] = useState(false);

  useEffect(() => {
    setVisible(shouldShowStreakReminder(streakData));
  }, [streakData]);

  useEffect(() => {
    if (!visible || firedNotification) return;
    fireStreakReminderNotification(streakData?.currentStreak);
    setFiredNotification(true);
  }, [visible, firedNotification, streakData]);

  if (!visible) return null;

  const handleDismiss = () => {
    dismissStreakReminderForToday();
    setVisible(false);
  };

  const handlePractice = () => {
    dismissStreakReminderForToday();
    setVisible(false);
    navigate('/daily-practice');
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(220,38,38,0.08) 0%, rgba(249,115,22,0.08) 100%)',
      border: '1.5px solid rgba(220,38,38,0.25)',
      borderRadius: 14, marginBottom: 20, overflow: 'hidden',
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px',
    }}>
      <span style={{ fontSize: 22 }}>🔥</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: '#dc2626' }}>
          Your {streakData.currentStreak}-day streak ends tonight!
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, marginTop: 2 }}>
          Practice now to keep it alive — it only takes a few minutes.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={handlePractice}
          style={{
            background: '#dc2626', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontFamily: H,
            fontWeight: 800, fontSize: 12, cursor: 'pointer',
          }}
        >
          Practice Now
        </button>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 16, padding: '2px 4px',
            lineHeight: 1, borderRadius: 4,
          }}
          title="Dismiss for today"
        >✕</button>
      </div>
    </div>
  );
}
