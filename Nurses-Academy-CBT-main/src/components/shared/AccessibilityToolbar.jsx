// src/components/shared/AccessibilityToolbar.jsx
import { useState, useEffect, useRef } from 'react';
import { useAccessibility } from '../../context/AccessibilityContext';

export default function AccessibilityToolbar() {
  const { fontSize, setFontSize, fontSizes, highContrast, setHighContrast } = useAccessibility();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div style={s.wrap} ref={wrapRef}>
      {/* Trigger button — lives in the navbar */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Accessibility settings"
        aria-label="Accessibility settings"
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          ...s.fab,
          background: open ? 'var(--teal)' : 'rgba(255,255,255,0.08)',
          borderColor: open ? 'var(--teal)' : 'rgba(255,255,255,0.12)',
        }}
      >
        ♿
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={s.panel}>
          <div style={s.panelTitle}>Accessibility</div>

          {/* Font size */}
          <div style={s.section}>
            <div style={s.sectionLabel}>Text Size</div>
            <div style={s.fontRow}>
              {fontSizes.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFontSize(f.id)}
                  title={f.id.charAt(0).toUpperCase() + f.id.slice(1)}
                  style={{
                    ...s.fontBtn,
                    fontSize: f.scale * 13,
                    background:   fontSize === f.id ? 'var(--teal)' : 'var(--bg-tertiary)',
                    color:        fontSize === f.id ? '#fff'        : 'var(--text-secondary)',
                    borderColor:  fontSize === f.id ? 'var(--teal)' : 'var(--border)',
                    fontWeight:   fontSize === f.id ? 800           : 600,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* High contrast */}
          <div style={s.section}>
            <div style={s.sectionLabel}>High Contrast</div>
            <button
              onClick={() => setHighContrast(v => !v)}
              style={{
                ...s.contrastBtn,
                background:  highContrast ? 'var(--teal)' : 'var(--bg-tertiary)',
                color:       highContrast ? '#fff'        : 'var(--text-secondary)',
                borderColor: highContrast ? 'var(--teal)' : 'var(--border)',
              }}
            >
              {highContrast ? '🌕 On' : '🌑 Off'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: {
    position: 'relative',
  },
  fab: {
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    width:        38,
    height:       38,
    borderRadius: '50%',
    border:       '1px solid rgba(255,255,255,0.12)',
    fontSize:     18,
    lineHeight:   1,
    padding:      0,
    cursor:       'pointer',
    color:        '#fff',
    transition:   'background 0.15s, transform 0.15s',
  },
  panel: {
    position:     'absolute',
    top:          'calc(100% + 6px)',
    right:        0,
    background:   'var(--bg-card)',
    border:       '1px solid var(--border)',
    borderRadius: 12,
    padding:      '14px 16px',
    boxShadow:    '0 8px 32px rgba(0,0,0,0.3)',
    minWidth:     200,
    zIndex:       200,
    animation:    'fadeIn 0.15s ease',
  },
  panelTitle: {
    fontWeight:    800,
    fontSize:      12,
    color:         'var(--teal)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom:  12,
  },
  section: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize:     11,
    fontWeight:   700,
    color:        'var(--text-muted)',
    textTransform:'uppercase',
    letterSpacing: 0.8,
    marginBottom:  8,
  },
  fontRow: {
    display: 'flex',
    gap:     8,
  },
  fontBtn: {
    width:        44,
    height:       36,
    borderRadius: 8,
    border:       '1.5px solid',
    cursor:       'pointer',
    transition:   'all 0.15s',
    fontFamily:   'var(--font-body)',
  },
  contrastBtn: {
    width:        '100%',
    padding:      '8px 12px',
    borderRadius: 8,
    border:       '1.5px solid',
    cursor:       'pointer',
    fontWeight:   700,
    fontSize:     13,
    transition:   'all 0.15s',
    fontFamily:   'var(--font-body)',
  },
};
