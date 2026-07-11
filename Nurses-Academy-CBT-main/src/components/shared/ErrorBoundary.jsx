// src/components/shared/ErrorBoundary.jsx
//
// Catches any uncaught render error anywhere in the tree. Without this,
// React silently unmounts the whole app on a crash, leaving a blank white
// screen with no way back in — which is exactly what happens when the app
// is resumed after sitting backgrounded for a while (stale auth/session
// state, expired listeners, etc. throwing during the resume re-render).
// Instead we show a friendly "something went wrong" screen with a reload
// button, and auto-reload once after a fresh crash in case it's transient.

import React from 'react';

const AUTO_RELOAD_KEY = 'elite-nurses-crash-auto-reload';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught a crash:', error, info);

    // One silent auto-retry per session — covers the common case where the
    // crash was caused by stale state right after the app resumed from the
    // background, and a fresh reload just fixes it. Guarded by
    // sessionStorage so a genuinely broken build doesn't reload-loop.
    try {
      if (!sessionStorage.getItem(AUTO_RELOAD_KEY)) {
        sessionStorage.setItem(AUTO_RELOAD_KEY, '1');
        window.location.reload();
      }
    } catch (_) { /* sessionStorage unavailable — fall through to manual UI */ }
  }

  handleReload = () => {
    try { sessionStorage.removeItem(AUTO_RELOAD_KEY); } catch (_) {}
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: 32, background: '#0B1220', color: '#E5E7EB',
        fontFamily: "'Georgia', serif",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: '#9CA3AF', maxWidth: 320, marginBottom: 24, lineHeight: 1.5 }}>
          The app hit an unexpected error, likely after being in the background for a while. Reloading usually fixes it.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            padding: '12px 28px', borderRadius: 12, border: 'none',
            background: '#0D9488', color: '#fff', fontWeight: 700,
            fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          🔄 Reload App
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
