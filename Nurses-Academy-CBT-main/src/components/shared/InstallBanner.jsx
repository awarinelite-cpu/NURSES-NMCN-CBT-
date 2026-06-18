// src/components/shared/InstallBanner.jsx
// Listens for the beforeinstallprompt event and shows a dismissible banner
// encouraging students to install the PWA after completing their first exam.
// Only shows once per device (localStorage guarded).

import { useEffect, useState } from 'react';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";
const DISMISS_KEY = 'nmcn_install_banner_dismissed';

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow]                     = useState(false);
  const [installing, setInstalling]         = useState(false);

  useEffect(() => {
    // Already dismissed or already installed
    if (localStorage.getItem(DISMISS_KEY)) return;
    // Already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone) return; // iOS

    const handler = (e) => {
      e.preventDefault(); // stop Chrome mini-infobar
      setDeferredPrompt(e);
      // Show banner with a short delay so it doesn't compete with page load
      setTimeout(() => setShow(true), 1500);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        handleDismiss();
      }
    } catch (e) {
      console.warn('Install prompt failed:', e);
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 1000,
      background: 'var(--bg-card)',
      border: '1.5px solid rgba(13,148,136,0.5)',
      borderRadius: 16, padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'installSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards',
      maxWidth: 500, margin: '0 auto',
    }}>
      <style>{`
        @keyframes installSlideUp {
          from { transform: translateY(120px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: 'rgba(13,148,136,0.15)', border: '1px solid rgba(13,148,136,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      }}>
        📲
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', fontFamily: H, marginBottom: 2 }}>
          Add to Home Screen
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F, fontWeight: 700, lineHeight: 1.4 }}>
          Faster access • Works offline • No app store needed
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleInstall}
          disabled={installing}
          style={{
            padding: '8px 14px', borderRadius: 10, border: 'none',
            background: 'var(--teal, #0D9488)', color: '#fff',
            fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: H,
            opacity: installing ? 0.7 : 1,
          }}
        >
          {installing ? '…' : 'Install'}
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: '8px 10px', borderRadius: 10,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
