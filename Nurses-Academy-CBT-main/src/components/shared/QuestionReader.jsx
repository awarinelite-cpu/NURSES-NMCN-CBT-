// src/components/shared/QuestionReader.jsx
//
// A floating "Read Aloud" button that reads question text using the Web Speech API.
//
// USAGE — drop it anywhere inside an exam/question component:
//
//   import QuestionReader from '../shared/QuestionReader';
//
//   <QuestionReader text={currentQuestion.text} />
//
// Props:
//   text          (string, required) — the question text to read aloud
//   options       (string[])         — answer option strings to read after the question
//   label         (string)           — button label (default: "Read Question")
//   voice         (string)           — preferred voice name substring (e.g. "Google UK")
//   rate          (number)           — speech rate 0.5–2  (default 0.95)
//   pitch         (number)           — speech pitch 0–2   (default 1)
//   showOptions   (boolean)          — whether to also read answer options (default true)

import { useState, useEffect, useRef, useCallback } from 'react';

const COLORS = {
  teal:       '#0D9488',
  tealLight:  '#14B8A6',
  tealDark:   '#0F766E',
  bg:         'rgba(2,11,24,0.92)',
  border:     'rgba(13,148,136,0.35)',
  text:       '#E2F8F6',
  muted:      'rgba(226,248,246,0.55)',
  danger:     '#EF4444',
  wave:       'rgba(13,148,136,0.18)',
};

/* ── tiny waveform animation (CSS-in-JS) ───────────────────── */
const injectStyles = () => {
  if (document.getElementById('qr-styles')) return;
  const s = document.createElement('style');
  s.id = 'qr-styles';
  s.textContent = `
    @keyframes qr-wave {
      0%,100% { transform: scaleY(0.4); }
      50%      { transform: scaleY(1.0); }
    }
    @keyframes qr-pulse-ring {
      0%   { transform: scale(1);   opacity: 0.6; }
      100% { transform: scale(1.55); opacity: 0;   }
    }
    @keyframes qr-fadein {
      from { opacity:0; transform:translateY(6px); }
      to   { opacity:1; transform:translateY(0);   }
    }
    .qr-bar {
      display: inline-block;
      width: 3px;
      border-radius: 2px;
      background: currentColor;
      animation: qr-wave 0.9s ease-in-out infinite;
    }
    .qr-bar:nth-child(2) { animation-delay: 0.15s; }
    .qr-bar:nth-child(3) { animation-delay: 0.30s; }
    .qr-bar:nth-child(4) { animation-delay: 0.45s; }
    .qr-bar:nth-child(5) { animation-delay: 0.60s; }
  `;
  document.head.appendChild(s);
};

/* ── helpers ────────────────────────────────────────────────── */
const LETTER = ['A', 'B', 'C', 'D', 'E', 'F'];

function buildUtterance(text, options, showOptions, voice, rate, pitch) {
  let fullText = text;
  if (showOptions && options?.length) {
    fullText += '. The answer options are: ';
    options.forEach((o, i) => {
      fullText += `Option ${LETTER[i] || i + 1}: ${o}. `;
    });
  }
  const utter = new SpeechSynthesisUtterance(fullText);
  utter.rate  = rate;
  utter.pitch = pitch;
  utter.lang  = 'en-US';

  if (voice) {
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v =>
      v.name.toLowerCase().includes(voice.toLowerCase())
    );
    if (match) utter.voice = match;
  }
  return utter;
}

/* ── component ──────────────────────────────────────────────── */
export default function QuestionReader({
  text        = '',
  options     = [],
  label       = 'Read Question',
  voice       = '',
  rate        = 0.95,
  pitch       = 1,
  showOptions = true,
}) {
  const [status,   setStatus]   = useState('idle');   // idle | loading | speaking | paused | error
  const [progress, setProgress] = useState(0);        // 0–1
  const utterRef  = useRef(null);
  const timerRef  = useRef(null);
  const startTime = useRef(null);
  const estDur    = useRef(0);

  useEffect(() => { injectStyles(); }, []);

  /* stop on text change */
  useEffect(() => {
    stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  /* cleanup */
  useEffect(() => () => { stop(); }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('idle');
    setProgress(0);
  }, []);

  const startProgressTimer = useCallback((durationMs) => {
    startTime.current = Date.now();
    estDur.current    = durationMs;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      setProgress(Math.min(elapsed / durationMs, 0.99));
    }, 120);
  }, []);

  const speak = useCallback(() => {
    if (!('speechSynthesis' in window)) {
      setStatus('error');
      return;
    }
    if (!text.trim()) return;

    window.speechSynthesis.cancel();
    setStatus('loading');
    setProgress(0);

    /* slight delay so voices load on first call */
    setTimeout(() => {
      const utter = buildUtterance(text, options, showOptions, voice, rate, pitch);
      utterRef.current = utter;

      /* rough word-count estimate for progress bar */
      const wordCount  = utter.text.split(/\s+/).length;
      const durationMs = (wordCount / (rate * 2.5)) * 1000;   // ~150 wpm base

      utter.onstart = () => {
        setStatus('speaking');
        startProgressTimer(durationMs);
      };
      utter.onpause  = () => setStatus('paused');
      utter.onresume = () => setStatus('speaking');
      utter.onend    = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setStatus('idle');
        setProgress(1);
        setTimeout(() => setProgress(0), 600);
      };
      utter.onerror  = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setStatus('error');
        setTimeout(() => setStatus('idle'), 2500);
      };

      window.speechSynthesis.speak(utter);
    }, 80);
  }, [text, options, showOptions, voice, rate, pitch, startProgressTimer]);

  const togglePause = useCallback(() => {
    if (status === 'speaking') {
      window.speechSynthesis.pause();
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (status === 'paused') {
      window.speechSynthesis.resume();
      startProgressTimer(estDur.current * (1 - progress));
    }
  }, [status, progress, startProgressTimer]);

  /* ── derived ──────────────────────────────────────────────── */
  const isActive  = status === 'speaking' || status === 'paused';
  const isLoading = status === 'loading';
  const isError   = status === 'error';

  const btnColor  = isError   ? COLORS.danger
                  : isActive  ? COLORS.tealLight
                  : COLORS.teal;

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, animation: 'qr-fadein 0.3s ease' }}>

      {/* ── main pill ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

        {/* speak / error button */}
        <button
          onClick={isActive ? togglePause : speak}
          disabled={isLoading || !text.trim()}
          title={isActive ? (status === 'paused' ? 'Resume' : 'Pause') : label}
          style={{
            display:        'inline-flex',
            alignItems:     'center',
            gap:            8,
            padding:        '7px 14px',
            borderRadius:   999,
            border:         `1.5px solid ${isActive ? COLORS.tealLight : COLORS.border}`,
            background:     isActive ? 'rgba(13,148,136,0.15)' : COLORS.bg,
            color:          btnColor,
            fontSize:       13,
            fontWeight:     600,
            cursor:         (isLoading || !text.trim()) ? 'not-allowed' : 'pointer',
            opacity:        (!text.trim()) ? 0.45 : 1,
            transition:     'all 0.2s ease',
            backdropFilter: 'blur(8px)',
            position:       'relative',
            overflow:       'hidden',
            letterSpacing:  0.2,
            boxShadow:      isActive ? `0 0 0 1px ${COLORS.teal}40, 0 2px 16px ${COLORS.teal}25` : 'none',
          }}
        >
          {/* pulse ring */}
          {isActive && status === 'speaking' && (
            <span style={{
              position:   'absolute',
              inset:      0,
              borderRadius: 999,
              border:     `1.5px solid ${COLORS.tealLight}`,
              animation:  'qr-pulse-ring 1.4s ease-out infinite',
              pointerEvents: 'none',
            }} />
          )}

          {/* icon / waveform */}
          {isLoading ? (
            <span style={{ fontSize: 15 }}>⏳</span>
          ) : isError ? (
            <span style={{ fontSize: 15 }}>⚠️</span>
          ) : status === 'paused' ? (
            <span style={{ fontSize: 15, color: COLORS.tealLight }}>▶</span>
          ) : status === 'speaking' ? (
            <span style={{ display:'flex', alignItems:'flex-end', gap:2, height:16, color: COLORS.tealLight }}>
              {[14,20,12,18,10].map((h, i) => (
                <span key={i} className="qr-bar" style={{ height: h, animationDelay: `${i*0.12}s` }} />
              ))}
            </span>
          ) : (
            /* speaker icon (SVG) */
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}

          <span>
            {isLoading  ? 'Loading…'
           : isError    ? 'Not supported'
           : status === 'paused'   ? 'Resume'
           : status === 'speaking' ? 'Reading…'
           : label}
          </span>
        </button>

        {/* stop button — only while active */}
        {isActive && (
          <button
            onClick={stop}
            title="Stop reading"
            style={{
              display:     'inline-flex',
              alignItems:  'center',
              justifyContent: 'center',
              width:       30,
              height:      30,
              borderRadius: '50%',
              border:      `1.5px solid ${COLORS.border}`,
              background:  COLORS.bg,
              color:       COLORS.muted,
              cursor:      'pointer',
              fontSize:    10,
              transition:  'all 0.2s',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = COLORS.danger; e.currentTarget.style.borderColor = COLORS.danger; }}
            onMouseLeave={e => { e.currentTarget.style.color = COLORS.muted; e.currentTarget.style.borderColor = COLORS.border; }}
          >
            ■
          </button>
        )}
      </div>

      {/* ── progress bar ────────────────────────────────── */}
      {(isActive || progress > 0) && (
        <div style={{
          height:       3,
          borderRadius: 999,
          background:   COLORS.wave,
          overflow:     'hidden',
          width:        '100%',
          maxWidth:     220,
        }}>
          <div style={{
            height:     '100%',
            width:      `${progress * 100}%`,
            background: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.tealLight})`,
            borderRadius: 999,
            transition: 'width 0.12s linear',
          }} />
        </div>
      )}
    </div>
  );
}
