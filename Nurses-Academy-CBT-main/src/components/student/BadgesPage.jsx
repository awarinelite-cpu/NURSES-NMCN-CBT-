// src/components/student/BadgesPage.jsx
// Route: /badges
// Full badge collection page — earned badges glow, locked ones are greyed.
// Includes confetti burst on first load if new badges were just earned.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { BADGES, evaluateBadges, syncBadges, fetchBadges } from '../../utils/badgeUtils';
import { fetchStreak } from '../../utils/streakUtils';

const H = "'Arial Black', Arial, sans-serif";
const F = "'Times New Roman', Times, serif";

// ── Confetti burst ───────────────────────────────────────────────────────────
function Confetti({ active }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20,
      r: Math.random() * 8 + 4,
      d: Math.random() * 120 + 60,
      color: ['#0D9488','#F59E0B','#EF4444','#22C55E','#A855F7','#3B82F6'][Math.floor(Math.random() * 6)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: 0,
      tiltSpeed: Math.random() * 0.1 + 0.05,
    }));
    let frame;
    let alpha = 1;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = alpha;
      pieces.forEach(p => {
        p.tiltAngle += p.tiltSpeed;
        p.y += Math.cos(p.d) + 2;
        p.tilt = Math.sin(p.tiltAngle) * 15;
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      });
      alpha -= 0.005;
      if (alpha > 0) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
    }} />
  );
}

// ── Badge Card ───────────────────────────────────────────────────────────────
function BadgeCard({ badge, earned, isNew }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: earned
          ? `linear-gradient(135deg, ${badge.color}18 0%, ${badge.color}08 100%)`
          : 'rgba(255,255,255,0.02)',
        border: `2px solid ${earned ? badge.color + (hov ? 'CC' : '55') : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 20,
        padding: '24px 16px',
        textAlign: 'center',
        cursor: 'default',
        transition: 'all 0.3s ease',
        transform: hov && earned ? 'translateY(-4px) scale(1.03)' : 'none',
        boxShadow: earned && hov ? `0 12px 36px ${badge.color}44` : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* NEW ribbon */}
      {isNew && (
        <div style={{
          position: 'absolute', top: 10, right: -18,
          background: '#EF4444', color: '#fff',
          fontFamily: H, fontWeight: 900, fontSize: 9,
          padding: '3px 28px', transform: 'rotate(45deg)',
          letterSpacing: 1,
        }}>NEW</div>
      )}

      {/* Glow backdrop */}
      {earned && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at 50% 30%, ${badge.color}22 0%, transparent 70%)`,
          opacity: hov ? 1 : 0.5, transition: 'opacity 0.3s',
        }} />
      )}

      <div style={{
        fontSize: earned ? 48 : 40,
        marginBottom: 12,
        filter: earned ? 'none' : 'grayscale(1) opacity(0.25)',
        transition: 'all 0.3s',
        display: 'block',
        lineHeight: 1,
      }}>{badge.icon}</div>

      <div style={{
        fontFamily: H, fontWeight: 900, fontSize: 13,
        color: earned ? badge.color : 'rgba(255,255,255,0.2)',
        marginBottom: 6, lineHeight: 1.3,
      }}>{badge.label}</div>

      <div style={{
        fontFamily: F, fontSize: 11,
        color: earned ? 'var(--text-muted, #64748B)' : 'rgba(255,255,255,0.12)',
        lineHeight: 1.5,
      }}>{badge.desc}</div>

      {earned && (
        <div style={{
          marginTop: 10,
          display: 'inline-block',
          background: badge.color + '22',
          border: `1px solid ${badge.color}55`,
          borderRadius: 20,
          padding: '3px 12px',
          fontFamily: H, fontWeight: 900, fontSize: 10,
          color: badge.color, letterSpacing: 0.5,
        }}>EARNED ✓</div>
      )}
    </div>
  );
}

// ── Category filter pill ─────────────────────────────────────────────────────
function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 18px', borderRadius: 20, border: 'none',
      cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: F,
      background: active ? '#0D9488' : 'rgba(255,255,255,0.05)',
      color: active ? '#fff' : 'var(--text-muted, #64748B)',
      transition: 'all 0.2s', flexShrink: 0,
    }}>{label}</button>
  );
}

const CATEGORIES = [
  { id: 'all',     label: '🏅 All'      },
  { id: 'streak',  label: '🔥 Streak'   },
  { id: 'score',   label: '🌟 Score'    },
  { id: 'volume',  label: '📚 Volume'   },
  { id: 'special', label: '⚡ Special'  },
  { id: 'other',   label: '🔖 Other'    },
];

// ── Main Page ────────────────────────────────────────────────────────────────
export default function BadgesPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [earnedIds, setEarnedIds]   = useState([]);
  const [newIds,    setNewIds]      = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [confetti,  setConfetti]    = useState(false);
  const [cat,       setCat]         = useState('all');

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch all sessions
        const snap = await getDocs(
          query(collection(db, 'examSessions'), where('userId', '==', user.uid))
        );
        const sessions = snap.docs.map(d => d.data());

        // Fetch streak
        const streakData = await fetchStreak(user.uid);

        // Evaluate
        const earned = evaluateBadges({
          sessions,
          streakData,
          bookmarkCount: profile?.bookmarkCount || 0,
        });

        // Sync & find new
        const brandNew = await syncBadges(user.uid, earned);
        setEarnedIds(earned);
        setNewIds(brandNew);
        if (brandNew.length > 0) {
          setTimeout(() => setConfetti(true), 300);
          setTimeout(() => setConfetti(false), 4000);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid, profile?.bookmarkCount]);

  const filtered = BADGES.filter(b => cat === 'all' || b.category === cat);
  const earnedSet = new Set(earnedIds);
  const earnedCount = BADGES.filter(b => earnedSet.has(b.id)).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
      <Confetti active={confetti} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
          color: 'var(--text-primary)', fontFamily: H, fontWeight: 900, fontSize: 13,
        }}>← Back</button>
        <h1 style={{
          fontFamily: H, fontWeight: 900, fontSize: 'clamp(1.3rem, 4vw, 2rem)',
          color: 'var(--text-primary)', margin: 0,
        }}>🏅 My Badges</h1>
      </div>

      {/* Summary bar */}
      <div style={{
        background: 'linear-gradient(135deg, #0D9488 0%, #1E3A8A 100%)',
        borderRadius: 16, padding: '18px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 24,
      }}>
        <div>
          <div style={{ fontFamily: H, fontWeight: 900, fontSize: 28, color: '#fff', lineHeight: 1 }}>
            {loading ? '…' : earnedCount} <span style={{ fontSize: 16, opacity: 0.8 }}>/ {BADGES.length}</span>
          </div>
          <div style={{ fontFamily: F, color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>
            Badges earned
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BADGES.filter(b => earnedSet.has(b.id)).slice(0, 6).map(b => (
            <span key={b.id} style={{ fontSize: 24 }} title={b.label}>{b.icon}</span>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {CATEGORIES.map(c => (
          <Pill key={c.id} label={c.label} active={cat === c.id} onClick={() => setCat(c.id)} />
        ))}
      </div>

      {/* New badge banner */}
      {newIds.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #F59E0B22, #F59E0B08)',
          border: '1.5px solid #F59E0B55', borderRadius: 14,
          padding: '14px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 28 }}>🎉</span>
          <div>
            <div style={{ fontFamily: H, fontWeight: 900, color: '#F59E0B', fontSize: 14 }}>
              You just unlocked {newIds.length} new badge{newIds.length > 1 ? 's' : ''}!
            </div>
            <div style={{ fontFamily: F, color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
              {newIds.map(id => BADGES.find(b => b.id === id)?.label).filter(Boolean).join(' • ')}
            </div>
          </div>
        </div>
      )}

      {/* Badge grid */}
      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
          gap: 16,
        }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{
              height: 160, borderRadius: 20,
              background: 'linear-gradient(90deg,#1e293b 25%,#273548 50%,#1e293b 75%)',
              backgroundSize: '200% 100%',
              animation: 'bdgShimmer 1.4s infinite',
            }} />
          ))}
          <style>{`@keyframes bdgShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
          gap: 16,
        }}>
          {/* Earned first */}
          {filtered
            .filter(b => earnedSet.has(b.id))
            .map(b => (
              <BadgeCard key={b.id} badge={b} earned isNew={newIds.includes(b.id)} />
            ))}
          {/* Locked after */}
          {filtered
            .filter(b => !earnedSet.has(b.id))
            .map(b => (
              <BadgeCard key={b.id} badge={b} earned={false} isNew={false} />
            ))}
        </div>
      )}
    </div>
  );
}
