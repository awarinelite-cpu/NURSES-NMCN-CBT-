// src/components/shared/AccessibilityToolbar.jsx
import { useState } from 'react';
import { useAccessibility } from '../../context/AccessibilityContext';

export default function AccessibilityToolbar() {
  const { fontSize, setFontSize, fontSizes, highContrast, setHighContrast } = useAccessibility();
  const [open, setOpen] = useState(false);

  return (
    <div style={s.wrap}>
      {/* Expanded panel */}
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

      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Accessibility settings"
        style={{
          ...s.fab,
          background: open ? 'var(--teal)' : 'var(--bg-card)',
          color:      open ? '#fff'        : 'var(--teal)',
          boxShadow:  open ? 'var(--shadow-teal)' : 'var(--shadow-md)',
        }}
      >
        ♿
      </button>
    </div>
  );
}

const s = {
  wrap: {
    position:  'fixed',
    bottom:    24,
    left:      24,
    zIndex:    8888,
    display:   'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap:       10,
  },
  fab: {
    width:        46,
    height:       46,
    borderRadius: '50%',
    border:       '2px solid var(--teal)',
    fontSize:     20,
    cursor:       'pointer',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    transition:   'all 0.2s',
  },
  panel: {
    background:   'var(--bg-card)',
    border:       '1px solid var(--border)',
    borderRadius: 16,
    padding:      '16px 18px',
    boxShadow:    'var(--shadow-lg)',
    minWidth:     180,
    animation:    'fadeIn 0.2s ease',
  },
  panelTitle: {
    fontWeight:    800,
    fontSize:      13,
    color:         'var(--teal)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom:  14,
  },
  section: {
    marginBottom: 14,
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
