// src/components/shared/StreakMilestoneModal.jsx
// Shown when a student hits a streak milestone (3, 7, 14, 30, 60, 100 days).
// Includes a CSS confetti animation, milestone badge, and a dismiss button.

import { useEffect, useState } from 'react';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

const MILESTONES = {
  3:   { emoji: '🔥', title: '3-Day Streak!',    msg: "You're on fire! 3 days of consistent practice.",   color: '#F97316', badge: 'Consistent Starter' },
  7:   { emoji: '⚡', title: 'One Full Week!',    msg: "7 days straight — you're building real habits.",   color: '#F59E0B', badge: 'Week Warrior' },
  14:  { emoji: '💪', title: 'Two-Week Streak!',  msg: "14 days of dedication. NMCN success is near.",    color: '#0D9488', badge: 'Fortnight Fighter' },
  30:  { emoji: '🏆', title: '30-Day Legend!',    msg: "A full month! You're in the top tier of students.", color: '#7C3AED', badge: 'Monthly Legend' },
  60:  { emoji: '🌟', title: '60-Day Champion!',  msg: "Two months! You are unstoppable.",                 color: '#2563EB', badge: '60-Day Champion' },
  100: { emoji: '👑', title: '100 Days!',         msg: "100 consecutive days. You are NMCN certified in commitment.", color: '#DC2626', badge: 'Century Achiever' },
};

// Tiny confetti particle
function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    color: ['#F59E0B','#0D9488','#7C3AED','#EF4444','#22C55E','#2563EB','#F97316'][i % 7],
    left: `${Math.random() * 100}%`,
    animDelay: `${Math.random() * 2}s`,
    animDur: `${2 + Math.random() * 2}s`,
    size: 6 + Math.random() * 8,
    rotate: Math.random() * 360,
  }));

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998, overflow: 'hidden' }}>
        {pieces.map(p => (
          <div key={p.id} style={{
            position: 'absolute',
            top: '-10px',
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.id % 3 === 0 ? '50%' : '2px',
            animation: `confettiFall ${p.animDur} ${p.animDelay} ease-in forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }} />
        ))}
      </div>
    </>
  );
}

export default function StreakMilestoneModal({ streak, onClose }) {
  const [show, setShow] = useState(false);
  const milestone = MILESTONES[streak];

  useEffect(() => {
    if (milestone) {
      const t = setTimeout(() => setShow(true), 300);
      return () => clearTimeout(t);
    }
  }, [milestone]);

  if (!milestone || !show) return null;

  const { emoji, title, msg, color, badge } = milestone;

  return (
    <>
      <Confetti />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div style={{
          background: 'var(--bg-card)', border: `2px solid ${color}60`,
          borderRadius: 24, padding: '40px 32px', maxWidth: 400, width: '100%',
          textAlign: 'center', boxShadow: `0 32px 80px ${color}30`,
          animation: 'streakPop 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <style>{`
            @keyframes streakPop {
              0% { transform: scale(0.7); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes streakBounce {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.2); }
            }
          `}</style>

          {/* Big animated emoji */}
          <div style={{
            fontSize: 72, marginBottom: 16,
            animation: 'streakBounce 1s ease 0.5s 3',
            display: 'inline-block',
          }}>
            {emoji}
          </div>

          {/* Streak count */}
          <div style={{
            fontSize: 56, fontWeight: 900, color, fontFamily: H,
            lineHeight: 1, marginBottom: 4,
          }}>
            {streak}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16, fontFamily: F, fontWeight: 700 }}>
            day streak
          </div>

          {/* Title */}
          <h2 style={{ margin: '0 0 10px', fontFamily: H, fontSize: 22, color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, fontFamily: F, fontWeight: 700 }}>
            {msg}
          </p>

          {/* Badge earned */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: `${color}20`, border: `1px solid ${color}50`,
            borderRadius: 30, padding: '8px 20px', marginBottom: 28,
          }}>
            <span style={{ fontSize: 14 }}>🎖</span>
            <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: H }}>
              Badge Unlocked: {badge}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: color, color: '#fff', fontWeight: 900, fontSize: 16,
              cursor: 'pointer', fontFamily: H,
              boxShadow: `0 8px 24px ${color}40`,
            }}
          >
            Keep the streak going! 🔥
          </button>
        </div>
      </div>
    </>
  );
}

export { MILESTONES };
