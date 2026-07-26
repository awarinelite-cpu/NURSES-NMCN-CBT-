// src/components/shared/FontSizeControl.jsx
// "Aa" button next to the notification bell — lets every user (not just admins)
// bump the whole app's text size up from 14px to 20px. Uses CSS zoom under the
// hood (see FontSizeContext) so the browser reflows the layout at each step —
// cards, buttons and containers resize along with the text, so nothing gets
// clipped or pushed off-screen as it gets bigger.
import { useState, useRef, useEffect } from 'react';
import { useFontSize } from '../../context/FontSizeContext';

export default function FontSizeControl() {
  const { fontSize, setFontSize, min, max, step } = useFontSize();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const steps = [];
  for (let s = min; s <= max; s += step) steps.push(s);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={ref}>
      <button
        style={styles.btn}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Text size"
        title="Text size"
      >
        <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>A</span>
        <span style={{ fontSize: 10, fontWeight: 800, lineHeight: 1, marginLeft: 1 }}>A</span>
      </button>

      {open && (
        <div style={styles.dropdown}>
          <div style={styles.header}>Text Size</div>
          <div style={styles.row}>
            <button
              style={{ ...styles.stepBtn, opacity: fontSize <= min ? 0.4 : 1 }}
              disabled={fontSize <= min}
              onClick={() => setFontSize(fontSize - step)}
              aria-label="Decrease text size"
            >
              A−
            </button>
            <div style={styles.dots}>
              {steps.map(s => (
                <span
                  key={s}
                  style={{
                    ...styles.dot,
                    background: s === fontSize ? 'var(--teal)' : 'rgba(255,255,255,0.18)',
                    transform: s === fontSize ? 'scale(1.3)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
            <button
              style={{ ...styles.stepBtn, opacity: fontSize >= max ? 0.4 : 1 }}
              disabled={fontSize >= max}
              onClick={() => setFontSize(fontSize + step)}
              aria-label="Increase text size"
            >
              A+
            </button>
          </div>
          <div style={styles.value}>{fontSize}px</div>
        </div>
      )}
    </div>
  );
}

const styles = {
  btn: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 0,
    width: 38, height: 38, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer', padding: 0, color: 'var(--text-primary)',
    transition: 'background 0.15s',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    background: 'rgba(11,24,38,0.92)',
    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14, padding: '12px 16px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(13,148,136,0.12)',
    zIndex: 200, width: 190,
  },
  header: {
    fontSize: 12, fontWeight: 800, color: '#F1F5F9',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stepBtn: {
    width: 40, height: 32, borderRadius: 8, cursor: 'pointer',
    background: 'rgba(13,148,136,0.18)', border: '1px solid rgba(13,148,136,0.4)',
    color: '#F1F5F9', fontWeight: 800, fontSize: 13, flexShrink: 0,
  },
  dots: { display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: '50%', transition: 'all 0.15s' },
  value: {
    textAlign: 'center', marginTop: 10, fontSize: 12, fontWeight: 700,
    color: 'var(--text-muted)',
  },
};
