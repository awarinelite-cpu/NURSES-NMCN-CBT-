// src/components/shared/VoiceExamMode.jsx
//
// Flow: click "Read Question" → TTS reads question + options →
//       mic opens → student says A/B/C/D (or "read again") →
//       answer selected → auto-advance to next question.
//       60 s silence → timeout → auto-advance.
//       Click ■ Stop → everything freezes until clicked again.

import { useState, useEffect, useRef } from 'react';

/* ─── styles ──────────────────────────────────────────────────── */
const injectStyles = () => {
  if (document.getElementById('vem-styles')) return;
  const s = document.createElement('style');
  s.id = 'vem-styles';
  s.textContent = `
    @keyframes vem-ripple {
      0%   { transform:scale(1);   opacity:.6; }
      100% { transform:scale(1.7); opacity:0;  }
    }
    @keyframes vem-bar {
      0%,100% { transform:scaleY(.3); }
      50%     { transform:scaleY(1);  }
    }
    @keyframes vem-flash-green {
      0%   { box-shadow: 0 0 0 0   rgba(22,163,74,.6); }
      60%  { box-shadow: 0 0 0 14px rgba(22,163,74,0); }
      100% { box-shadow: none; }
    }
    .vem-bar {
      display:inline-block; width:3px; border-radius:2px;
      background:currentColor;
      animation: vem-bar .8s ease-in-out infinite;
    }
    .vem-bar:nth-child(2){ animation-delay:.13s }
    .vem-bar:nth-child(3){ animation-delay:.26s }
    .vem-bar:nth-child(4){ animation-delay:.39s }
    .vem-bar:nth-child(5){ animation-delay:.52s }
    .vem-flash-green { animation: vem-flash-green .8s ease forwards; }
  `;
  document.head.appendChild(s);
};

/* ─── constants & helpers ─────────────────────────────────────── */
const LETTERS     = ['A','B','C','D','E','F'];
const TIMEOUT_SEC = 60;

const hasSR = () => !!(
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)
);

const hasTTS = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

function matchSpeech(transcript, options) {
  const t = norm(transcript);

  // repeat commands
  if (/\b(read again|repeat|read it again|say again|again)\b/.test(t))
    return 'REPEAT';

  // bare letter "a" "b" "c" "d"
  for (let i = 0; i < options.length; i++)
    if (t === LETTERS[i].toLowerCase()) return i;

  // "option a", "answer b", "choose c", "select d", "pick e"
  for (let i = 0; i < options.length; i++) {
    const l = LETTERS[i].toLowerCase();
    if (/\b(option|answer|choose|select|pick)\b/.test(t) && t.includes(l)) return i;
  }

  // fuzzy: >=50% of meaningful words in an option appear in transcript
  const texts = options.map(o => norm(typeof o === 'string' ? o : (o.text ?? '')));
  let best = -1, bestScore = 0;
  texts.forEach((ot, i) => {
    const words = ot.split(/\s+/).filter(w => w.length > 3);
    if (!words.length) return;
    const score = words.filter(w => t.includes(w)).length / words.length;
    if (score > 0.5 && score > bestScore) { bestScore = score; best = i; }
  });
  return best; // -1 = no match
}

function buildSpeechText(question, options) {
  let text = question + '.  ';
  options.forEach((o, i) => {
    const txt = typeof o === 'string' ? o : (o.text ?? '');
    text += `Option ${LETTERS[i]}: ${txt}.  `;
  });
  return text;
}

/* ─── CountdownRing ───────────────────────────────────────────── */
function CountdownRing({ seconds }) {
  const r    = 18;
  const circ = +(2 * Math.PI * r).toFixed(2);
  const pct  = Math.max(0, Math.min(1, seconds / TIMEOUT_SEC));
  const off  = +(circ * (1 - pct)).toFixed(2);
  const color = seconds <= 10 ? '#EF4444' : seconds <= 20 ? '#F59E0B' : '#0D9488';
  return (
    <svg width={44} height={44} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={22} cy={22} r={r} fill="none"
        stroke="rgba(255,255,255,.1)" strokeWidth={3} />
      <circle cx={22} cy={22} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={off}
        strokeLinecap="round"
        style={{ transition:'stroke-dashoffset 1s linear, stroke .4s' }} />
      <text x={22} y={22} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={11} fontWeight={700}
        style={{ transform:'rotate(90deg)', transformOrigin:'22px 22px' }}>
        {seconds}
      </text>
    </svg>
  );
}

/* ─── VoiceExamMode ───────────────────────────────────────────── */
export default function VoiceExamMode({
  question   = '',
  options    = [],
  questionId = '',
  onAnswer,
  onNext,
  hasNext    = true,
}) {
  const [phase,     setPhase]     = useState('idle');
  const [countdown, setCountdown] = useState(TIMEOUT_SEC);
  const [statusMsg, setStatusMsg] = useState('');
  const [matchIdx,  setMatchIdx]  = useState(null);

  // session control
  const activeRef = useRef(false);
  const cdRef     = useRef(TIMEOUT_SEC);
  const timerRef  = useRef(null);
  const srRef     = useRef(null);

  // always-current prop mirrors (safe inside async callbacks)
  const questionRef = useRef(question);
  const optionsRef  = useRef(options);
  const onAnswerRef = useRef(onAnswer);
  const onNextRef   = useRef(onNext);
  const hasNextRef  = useRef(hasNext);
  questionRef.current = question;
  optionsRef.current  = options;
  onAnswerRef.current = onAnswer;
  onNextRef.current   = onNext;
  hasNextRef.current  = hasNext;

  // function refs — avoids all circular useCallback deps
  const stopRef          = useRef(null);
  const startListenRef   = useRef(null);
  const readAndListenRef = useRef(null);

  useEffect(() => { injectStyles(); }, []);

  // stop when question changes
  useEffect(() => {
    stopRef.current?.(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // stop on unmount
  useEffect(() => () => stopRef.current?.(false), []);

  /* ══════ STOP ══════════════════════════════════════════════════ */
  stopRef.current = (userStopped = true) => {
    activeRef.current = false;
    window.speechSynthesis?.cancel();
    try { srRef.current?.abort(); } catch(_) {}
    srRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cdRef.current = TIMEOUT_SEC;
    setPhase(userStopped ? 'stopped' : 'idle');
    setCountdown(TIMEOUT_SEC);
    setMatchIdx(null);
    setStatusMsg('');
  };

  /* ══════ SPEAK ═════════════════════════════════════════════════ */
  const speak = (text, onDone) => {
    window.speechSynthesis.cancel();
    const u   = new SpeechSynthesisUtterance(text);
    u.lang    = 'en-US';
    u.rate    = 0.9;
    u.pitch   = 1;
    // Chrome: resume() keepalive every 10 s to prevent silent pause bug
    const ka = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 10_000);
    u.onend   = () => { clearInterval(ka); if (activeRef.current) onDone?.(); };
    u.onerror = (e) => {
      clearInterval(ka);
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (activeRef.current) onDone?.();
    };
    window.speechSynthesis.speak(u);
  };

  /* ══════ START LISTENING ═══════════════════════════════════════ */
  startListenRef.current = () => {
    if (!activeRef.current) return;
    if (!hasSR()) { setPhase('unsupported'); return; }

    try { srRef.current?.abort(); } catch(_) {}

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const sr = new SR();
    srRef.current = sr;

    sr.lang            = 'en-US';
    sr.interimResults  = false;
    sr.maxAlternatives = 4;
    sr.continuous      = false;

    // start countdown only if not already running
    if (!timerRef.current) {
      cdRef.current = TIMEOUT_SEC;
      setCountdown(TIMEOUT_SEC);
      timerRef.current = setInterval(() => {
        if (!activeRef.current) { clearInterval(timerRef.current); timerRef.current = null; return; }
        cdRef.current -= 1;
        setCountdown(cdRef.current);
        if (cdRef.current <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          try { srRef.current?.abort(); } catch(_) {}
          if (!activeRef.current) return;
          setPhase('timeout');
          setStatusMsg('No answer heard — moving on…');
          speak("Time's up. Moving to the next question.", () => {
            if (!activeRef.current) return;
            if (hasNextRef.current) onNextRef.current?.();
            else stopRef.current(false);
          });
        }
      }, 1000);
    }

    setPhase('listening');

    sr.onresult = (e) => {
      if (!activeRef.current) return;
      clearInterval(timerRef.current);
      timerRef.current = null;
      setPhase('processing');

      const transcripts = Array.from(e.results[0]).map(a => a.transcript);
      const heard       = transcripts[0] || '';
      console.log('[VoiceExamMode] heard:', transcripts);

      let result = -1;
      for (const t of transcripts) {
        result = matchSpeech(t, optionsRef.current);
        if (result !== -1) break;
      }

      if (result === 'REPEAT') {
        setStatusMsg('Re-reading question…');
        setTimeout(() => { if (activeRef.current) readAndListenRef.current?.(); }, 300);
        return;
      }

      if (result >= 0) {
        setMatchIdx(result);
        setPhase('matched');
        onAnswerRef.current?.(result);
        const letter = LETTERS[result];
        setStatusMsg(`Selected option ${letter}`);
        setTimeout(() => {
          const el = document.getElementById(`vem-opt-${result}`);
          if (el) { el.classList.remove('vem-flash-green'); void el.offsetWidth; el.classList.add('vem-flash-green'); }
        }, 40);
        speak(
          `Option ${letter} selected. ${hasNextRef.current ? 'Moving to next question.' : 'That was the last question.'}`,
          () => {
            if (!activeRef.current) return;
            setTimeout(() => {
              if (hasNextRef.current) onNextRef.current?.();
              else stopRef.current(false);
            }, 300);
          }
        );
      } else {
        setStatusMsg(`Didn't catch that${heard ? ` — heard "${heard}"` : ''}. Say A, B, C or D.`);
        speak("Sorry, I didn't catch that. Please say A, B, C, or D.", () => {
          if (activeRef.current) startListenRef.current?.();
        });
      }
    };

    // SR ended without a result → restart while countdown is alive
    sr.onend = () => {
      if (!activeRef.current || cdRef.current <= 0) return;
      setTimeout(() => {
        if (activeRef.current && cdRef.current > 0) startListenRef.current?.();
      }, 150);
    };

    sr.onerror = (e) => {
      if (!activeRef.current) return;
      if (e.error === 'aborted') return;
      console.warn('[VoiceExamMode] SR error:', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        clearInterval(timerRef.current); timerRef.current = null;
        setStatusMsg('Microphone permission denied.');
        setPhase('stopped');
        return;
      }
      // for other errors restart after a short pause
      setTimeout(() => {
        if (activeRef.current && cdRef.current > 0) startListenRef.current?.();
      }, 400);
    };

    try {
      sr.start();
    } catch(e) {
      console.error('[VoiceExamMode] sr.start() threw:', e);
      setTimeout(() => { if (activeRef.current) startListenRef.current?.(); }, 500);
    }
  };

  /* ══════ READ + LISTEN ═════════════════════════════════════════ */
  readAndListenRef.current = () => {
    if (!activeRef.current) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cdRef.current = TIMEOUT_SEC;
    setCountdown(TIMEOUT_SEC);
    setPhase('reading');
    setStatusMsg('');
    setMatchIdx(null);
    const text = buildSpeechText(questionRef.current, optionsRef.current);
    speak(text, () => { if (activeRef.current) startListenRef.current?.(); });
  };

  /* ══════ HANDLE START ══════════════════════════════════════════ */
  const handleStart = () => {
    if (!hasTTS()) { setPhase('unsupported'); return; }
    activeRef.current = true;
    readAndListenRef.current?.();
  };

  /* ─── render ──────────────────────────────────────────────── */
  const isReading    = phase === 'reading';
  const isListening  = phase === 'listening';
  const isProcessing = phase === 'processing';
  const isMatched    = phase === 'matched';
  const isTimeout    = phase === 'timeout';
  const isStopped    = phase === 'stopped';
  const isActive     = isReading || isListening || isProcessing || isMatched || isTimeout;

  if (phase === 'unsupported') return (
    <span style={{ fontSize:11, color:'rgba(239,68,68,.7)' }}>
      🎤 Voice not supported in this browser
    </span>
  );

  const btnBorder = isActive ? 'rgba(13,148,136,.6)'  : 'rgba(13,148,136,.3)';
  const btnBg     = isActive ? 'rgba(13,148,136,.13)' : 'rgba(255,255,255,.04)';
  const btnColor  = isMatched ? '#16A34A'
                  : isTimeout ? '#EF4444'
                  : isActive  ? '#14B8A6'
                  : '#0D9488';

  return (
    <div style={{ display:'inline-flex', flexDirection:'column', gap:7 }}>

      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

        {/* main button */}
        <button
          onClick={isActive ? undefined : handleStart}
          disabled={isActive}
          style={{
            display:'inline-flex', alignItems:'center', gap:9,
            padding:'8px 16px', borderRadius:999,
            border:`1.5px solid ${btnBorder}`,
            background:btnBg, color:btnColor,
            fontSize:13, fontWeight:600,
            cursor: isActive ? 'default' : 'pointer',
            transition:'all .2s', backdropFilter:'blur(8px)',
            position:'relative', overflow:'hidden', letterSpacing:.2,
            boxShadow: isActive
              ? '0 0 0 1px rgba(13,148,136,.25), 0 2px 18px rgba(13,148,136,.15)'
              : 'none',
          }}
        >
          {isReading && (
            <span style={{
              position:'absolute', inset:0, borderRadius:999,
              border:'1.5px solid rgba(13,148,136,.55)',
              animation:'vem-ripple 1.3s ease-out infinite',
              pointerEvents:'none',
            }}/>
          )}

          {isReading ? (
            <span style={{ display:'flex', alignItems:'flex-end', gap:2, height:16, color:'#14B8A6' }}>
              {[10,16,12,18,10].map((h,i) => (
                <span key={i} className="vem-bar" style={{ height:h, animationDelay:`${i*.13}s` }}/>
              ))}
            </span>
          ) : isListening ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8"  y1="22" x2="16" y2="22"/>
            </svg>
          ) : isMatched    ? <span style={{fontSize:14}}>✅</span>
            : isTimeout    ? <span style={{fontSize:14}}>⏰</span>
            : isProcessing ? <span style={{fontSize:14}}>⏳</span>
            : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}

          <span>
            {isReading    ? 'Reading question…'
           : isListening  ? 'Listening for answer…'
           : isProcessing ? 'Processing…'
           : isMatched    ? `Answer ${matchIdx !== null ? LETTERS[matchIdx] : ''} selected!`
           : isTimeout    ? 'Time out — moving on…'
           : isStopped    ? '🔊 Read Again'
           :                '🔊 Read Question'}
          </span>
        </button>

        {isListening && <CountdownRing seconds={countdown} />}

        {isActive && !isMatched && !isTimeout && (
          <button
            onClick={() => stopRef.current(true)}
            title="Stop reading & listening"
            style={{
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              width:32, height:32, borderRadius:'50%',
              border:'1.5px solid rgba(239,68,68,.35)',
              background:'rgba(239,68,68,.08)',
              color:'rgba(239,68,68,.7)',
              cursor:'pointer', fontSize:10, fontWeight:800, transition:'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,.2)'; e.currentTarget.style.color='#EF4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,.08)'; e.currentTarget.style.color='rgba(239,68,68,.7)'; }}
          >■</button>
        )}
      </div>

      {isListening && !statusMsg && (
        <span style={{ fontSize:11, color:'rgba(20,184,166,.85)', paddingLeft:2 }}>
          Say <strong>A</strong>, <strong>B</strong>, <strong>C</strong> or <strong>D</strong>
          &nbsp;·&nbsp; or say <em>"read again"</em> to repeat
        </span>
      )}
      {statusMsg && (
        <span style={{
          fontSize:11, paddingLeft:2,
          color: isMatched ? '#16A34A' : isTimeout ? '#EF4444' : 'rgba(20,184,166,.85)',
        }}>
          {statusMsg}
        </span>
      )}
      {isStopped && !statusMsg && (
        <span style={{ fontSize:11, color:'rgba(255,255,255,.35)', paddingLeft:2 }}>
          Voice stopped — click to start again
        </span>
      )}
    </div>
  );
}
