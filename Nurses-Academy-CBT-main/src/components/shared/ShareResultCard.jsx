// src/components/shared/ShareResultCard.jsx
// A visual, downloadable/shareable result card — "I scored 87% on
// Pharmacology — Nurse Academy CBT" — drawn with the native Canvas API
// (no new dependencies like html2canvas needed).
//
// Renders a hidden <canvas>, fills it on demand, then either:
//   - triggers a PNG download, or
//   - uses the Web Share API (navigator.share with files) on supported
//     mobile browsers, falling back to download if unsupported.

import { useRef, useState } from 'react';

const CARD_W = 1080;
const CARD_H = 1350; // 4:5 — good for WhatsApp/Instagram

function scoreColorFor(pct) {
  if (pct >= 70) return '#16A34A';
  if (pct >= 50) return '#F59E0B';
  return '#EF4444';
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function renderCard(canvas, { scorePct, examLabel, correct, total }) {
  const ctx = canvas.getContext('2d');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const color = scoreColorFor(scorePct);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1e293b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Soft glow behind the ring
  const glow = ctx.createRadialGradient(CARD_W / 2, 480, 40, CARD_W / 2, 480, 420);
  glow.addColorStop(0, `${color}33`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Brand header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5EEAD4';
  ctx.font = '900 40px Arial';
  ctx.fillText('🎓 THE ELITE NURSES', CARD_W / 2, 130);
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 28px Arial';
  ctx.fillText('NMCN CBT EXAM PREP', CARD_W / 2, 175);

  // Score ring
  const cx = CARD_W / 2, cy = 480, r = 220;
  ctx.lineWidth = 28;
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * scorePct) / 100);
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = '900 130px Arial';
  ctx.fillText(`${scorePct}%`, cx, cy + 45);

  // Celebration message
  const msg = scorePct >= 70 ? "Outstanding! NMCN Ready 🎓"
    : scorePct >= 50 ? "Good effort — keep going! 👍"
    : "Every attempt makes me stronger 💪";
  ctx.fillStyle = color;
  ctx.font = '900 46px Arial';
  ctx.fillText(msg, cx, 780, CARD_W - 100);

  // Exam label
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '700 36px Arial';
  ctx.fillText(examLabel, cx, 840, CARD_W - 120);

  // Stats row
  const stats = [
    { label: 'Correct', value: correct, color: '#16A34A' },
    { label: 'Wrong', value: total - correct, color: '#EF4444' },
    { label: 'Total', value: total, color: '#94A3B8' },
  ];
  const boxW = 280, boxH = 130, gap = 30;
  const startX = cx - (boxW * 3 + gap * 2) / 2;
  stats.forEach((s, i) => {
    const x = startX + i * (boxW + gap);
    const y = 920;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    drawRoundedRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();
    ctx.fillStyle = s.color;
    ctx.font = '900 56px Arial';
    ctx.fillText(String(s.value), x + boxW / 2, y + 60);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 26px Arial';
    ctx.fillText(s.label, x + boxW / 2, y + 100);
  });

  // Footer
  ctx.fillStyle = '#5EEAD4';
  ctx.font = '700 32px Arial';
  ctx.fillText('Practice free → nursesacademy.com.ng', cx, CARD_H - 70);
}

export default function ShareResultCard({ scorePct, examLabel, correct, total }) {
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const ensureRendered = async () => {
    if (canvasRef.current) {
      await renderCard(canvasRef.current, { scorePct, examLabel, correct, total });
    }
  };

  const getBlob = () => new Promise(resolve => {
    canvasRef.current.toBlob(resolve, 'image/png');
  });

  const handleOpenPreview = async () => {
    setOpen(true);
    setBusy(true);
    await ensureRendered();
    setBusy(false);
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      await ensureRendered();
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nmcn-cbt-result-${scorePct}pct.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    setBusy(true);
    try {
      await ensureRendered();
      const blob = await getBlob();
      const file = new File([blob], `nmcn-result-${scorePct}pct.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My NMCN CBT Result',
          text: `I scored ${scorePct}% on ${examLabel} — The Elite Nurses CBT!`,
        });
      } else {
        await handleDownload();
      }
    } catch {
      // user cancelled share sheet — non-fatal
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpenPreview}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
          borderRadius: 10, background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
          color: '#fff', fontWeight: 800, fontSize: 13, border: 'none', cursor: 'pointer',
          fontFamily: "'Arial Black', Arial, sans-serif",
        }}
      >
        🖼️ Share as Image
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 360, width: '100%' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', borderRadius: 16, display: busy ? 'none' : 'block', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
            />
            {busy && (
              <div style={{ aspectRatio: `${CARD_W}/${CARD_H}`, background: '#1e293b', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                Rendering…
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={handleShare}
                disabled={busy}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: '#0D9488', color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
              >
                📤 Share
              </button>
              <button
                onClick={handleDownload}
                disabled={busy}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
              >
                ⬇️ Download
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: '10px 16px', borderRadius: 10, background: 'none', color: '#94A3B8', border: '1px solid #334155', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
