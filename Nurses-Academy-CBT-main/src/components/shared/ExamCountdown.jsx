// src/components/shared/ExamCountdown.jsx
// Exam Countdown Widget — shown on dashboard if user has set an exam date.
// Reads profile.examDate (YYYY-MM-DD). Student sets it from ProfilePage.
// Color shifts: green (>30d) → amber (8–30d) → red (≤7d) → 🎉 (exam day/past)

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / 86400000);
}

export default function ExamCountdown() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const examDate = profile?.examDate;
  const examLabel = profile?.examLabel || 'NMCN Exam';
  if (!examDate) return null;

  const days = daysUntil(examDate);
  if (days === null) return null;

  const passed = days < 0;

  const { bg, border, accent, icon, message } =
    passed             ? { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)', accent: '#64748B', icon: '🎓', message: 'Exam day has passed. Keep practising!' }
  : days === 0         ? { bg: 'rgba(239,68,68,0.12)',  border: '#EF444455',             accent: '#EF4444', icon: '🚨', message: "Today's the day! You've got this!" }
  : days <= 7          ? { bg: 'rgba(239,68,68,0.1)',   border: '#EF444444',             accent: '#EF4444', icon: '🔥', message: 'Final stretch — push hard!' }
  : days <= 30         ? { bg: 'rgba(245,158,11,0.1)',  border: '#F59E0B44',             accent: '#F59E0B', icon: '⚡', message: 'Keep the momentum going!' }
  :                      { bg: 'rgba(13,148,136,0.1)',  border: '#0D948844',             accent: '#0D9488', icon: '📅', message: 'Stay consistent — you have time.' };

  // Progress bar: percentage of 90-day window
  const totalDays = 90;
  const elapsed   = Math.max(0, totalDays - Math.max(0, days));
  const pct       = Math.min(100, Math.round((elapsed / totalDays) * 100));

  return (
    <div style={{
      background: bg, border: `1.5px solid ${border}`,
      borderRadius: 16, padding: '16px 18px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: H, fontWeight: 900, fontSize: 13, color: accent, marginBottom: 2 }}>
              {examLabel}
            </div>
            {passed ? (
              <div style={{ fontFamily: F, fontSize: 12, color: 'var(--text-muted)' }}>{message}</div>
            ) : days === 0 ? (
              <div style={{ fontFamily: F, fontSize: 13, color: accent, fontWeight: 700 }}>{message}</div>
            ) : (
              <div>
                <span style={{ fontFamily: H, fontWeight: 900, fontSize: 26, color: accent, lineHeight: 1 }}>
                  {days}
                </span>
                <span style={{ fontFamily: F, fontSize: 13, color: 'var(--text-muted)', marginLeft: 6 }}>
                  day{days !== 1 ? 's' : ''} to go
                </span>
                <div style={{ fontFamily: F, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{message}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => navigate('/study-plan')}
            style={{
              background: accent + '22', border: `1px solid ${accent}55`,
              borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
              fontFamily: H, fontWeight: 900, fontSize: 11, color: accent,
              whiteSpace: 'nowrap',
            }}
          >Study Plan</button>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 16, padding: '4px 6px',
            }}
          >×</button>
        </div>
      </div>

      {/* Progress bar */}
      {!passed && days >= 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: F, fontSize: 10, color: 'var(--text-muted)' }}>Preparation progress</span>
            <span style={{ fontFamily: H, fontWeight: 900, fontSize: 10, color: accent }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: `linear-gradient(90deg, ${accent}88, ${accent})`,
              borderRadius: 3, transition: 'width 1s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
