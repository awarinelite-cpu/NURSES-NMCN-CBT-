// src/components/shared/VoiceExamMode.jsx
//
// Flow:
//   • Student clicks "Read Question" once → session starts for the whole exam
//   • TTS reads question + options → mic stays ALWAYS OPEN (continuous)
//   • Student says A/B/C/D → answer saved → TTS reads next question immediately
//   • Student says "read again" → re-reads current question, mic stays open
//   • No answer in 60 s → timeout → auto-advance → reads next question
//   • Click ■ Stop → everything pauses until student clicks "Read Question" again
//   • Session NEVER auto-stops between questions

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
      0%   { box-shadow: 0 0 0 0    rgba(22,163,74,.65); }
      60%  { box-shadow: 0 0 0 16px rgba(22,163,74,0);   }
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

/* ─── helpers ─────────────────────────────────────────────────── */
const LETTERS     = ['A','B','C','D','E','F'];
const TIMEOUT_SEC = 60;

const hasSR  = () => !!(typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition));
const hasTTS = () =>   typeof window !== 'undefined' && 'speechSynthesis' in window;
const norm   = s  => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

function matchSpeech(transcript, options) {
  const t = norm(transcript);

  // ── REPEAT commands (check first — highest priority) ──────────
  if (/\b(read again|repeat|read it again|say again|again|replay|re-read|reread)\b/.test(t))
    return 'REPEAT';

  // ── REPEAT + answer combo: "option a and read the answers"
  //    "a and read the answers" — extract the letter, then treat as REPEAT after answering
  //    We handle these below by stripping the "and read" tail and matching the letter.
  //    Flag so caller can chain answer → repeat.
  const hasReadTail = /\band\s+(read|repeat|replay)\b/.test(t);
  // strip the tail so letter matching below works cleanly
  const tClean = hasReadTail ? t.replace(/\band\s+(read|repeat|replay).*$/, '').trim() : t;

  for (let i = 0; i < LETTERS.length; i++) {
    const l   = LETTERS[i].toLowerCase();  // "a", "b", …
    const lRx = new RegExp(`\\b${l}\\b`);  // whole-word match

    // 1. bare letter only:  "a"
    if (tClean === l) return hasReadTail ? `${i}+REPEAT` : i;

    // 2. "the answer is a" / "my answer is a" / "answer is a"
    if (/\b(the\s+)?answer\s+is\b/.test(tClean) && lRx.test(tClean))
      return hasReadTail ? `${i}+REPEAT` : i;

    // 3. "i think the answer is a" / "i believe it's a"
    if (/\b(i\s+)?(think|believe|say|choose|go\s+with|pick|select)\b/.test(tClean) && lRx.test(tClean))
      return hasReadTail ? `${i}+REPEAT` : i;

    // 4. "option a" / "option a please"
    if (/\boption\b/.test(tClean) && lRx.test(tClean))
      return hasReadTail ? `${i}+REPEAT` : i;

    // 5. "answer a" / "answer b"
    if (/\banswer\b/.test(tClean) && lRx.test(tClean))
      return hasReadTail ? `${i}+REPEAT` : i;

    // 6. "choose a" / "select b" / "pick c" / "go with d"
    if (/\b(choose|select|pick|go\s+with)\b/.test(tClean) && lRx.test(tClean))
      return hasReadTail ? `${i}+REPEAT` : i;

    // 7. "it's a" / "its a" / "it is a"
    if (/\bit'?s?\s+is?\b/.test(tClean) && lRx.test(tClean))
      return hasReadTail ? `${i}+REPEAT` : i;

    // 8. "letter a" / "choice a"
    if (/\b(letter|choice|number)\b/.test(tClean) && lRx.test(tClean))
      return hasReadTail ? `${i}+REPEAT` : i;
  }

  // fuzzy option-text match (≥50% of meaningful words)
  const texts = options.map(o => norm(typeof o === 'string' ? o : (o.text ?? '')));
  let best = -1, bestScore = 0;
  texts.forEach((ot, i) => {
    const words = ot.split(/\s+/).filter(w => w.length > 3);
    if (!words.length) return;
    const score = words.filter(w => tClean.includes(w)).length / words.length;
    if (score > 0.5 && score > bestScore) { bestScore = score; best = i; }
  });
  if (best !== -1) return hasReadTail ? `${best}+REPEAT` : best;

  return -1;
}

function buildSpeechText(question, options) {
  let text = question + '.  ';
  options.forEach((o, i) => {
    text += `Option ${LETTERS[i]}: ${typeof o === 'string' ? o : (o.text ?? '')}.  `;
  });
  return text;
}

/* ─── CountdownRing ───────────────────────────────────────────── */
function CountdownRing({ seconds }) {
  const r    = 18;
  const circ = +(2 * Math.PI * r).toFixed(2);
  const off  = +(circ * (1 - Math.max(0, Math.min(1, seconds / TIMEOUT_SEC)))).toFixed(2);
  const color = seconds <= 10 ? '#EF4444' : seconds <= 20 ? '#F59E0B' : '#0D9488';
  return (
    <svg width={44} height={44} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={22} cy={22} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={3}/>
      <circle cx={22} cy={22} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        style={{ transition:'stroke-dashoffset 1s linear, stroke .4s' }}/>
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
  hasNext = true,
}) {
  // phase: idle | reading | listening | processing | stopped
  const [phase,     setPhase]     = useState('idle');
  const [countdown, setCountdown] = useState(TIMEOUT_SEC);
  const [statusMsg, setStatusMsg] = useState('');
  const [matchIdx,  setMatchIdx]  = useState(null);

  // ── core session flags ────────────────────────────────────────
  const activeRef   = useRef(false);  // true = session running
  const speakingRef = useRef(false);  // true = TTS currently playing
  const srRef       = useRef(null);
  const timerRef    = useRef(null);
  const cdRef       = useRef(TIMEOUT_SEC);

  // ── always-fresh prop mirrors ─────────────────────────────────
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

  // ── function refs (no circular deps) ─────────────────────────
  const stopRef          = useRef(null);
  const startSRRef       = useRef(null);
  const readAndListenRef = useRef(null);

  useEffect(() => { injectStyles(); }, []);

  // When question changes AND session is active → read the new question immediately
  // Do NOT stop the session — just re-read
  useEffect(() => {
    if (activeRef.current) {
      // small delay to let React re-render with new question/options props
      setTimeout(() => {
        if (activeRef.current) readAndListenRef.current?.();
      }, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  useEffect(() => () => stopRef.current?.(false), []);

  /* ══════════════════════════════════════════════════════════════
     HARD STOP — only called by user clicking ■ or on unmount
  ══════════════════════════════════════════════════════════════ */
  stopRef.current = (userStopped = true) => {
    activeRef.current  = false;
    speakingRef.current = false;
    window.speechSynthesis?.cancel();
    try { srRef.current?.stop(); } catch(_) {}
    try { srRef.current?.abort(); } catch(_) {}
    srRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cdRef.current = TIMEOUT_SEC;
    setPhase(userStopped ? 'stopped' : 'idle');
    setCountdown(TIMEOUT_SEC);
    setMatchIdx(null);
    setStatusMsg('');
  };

  /* ══════════════════════════════════════════════════════════════
     SPEAK — TTS, then calls onDone
     While speaking, SR is paused so we don't pick up TTS audio
  ══════════════════════════════════════════════════════════════ */
  const speak = (text, onDone) => {
    if (!activeRef.current) return;

    // pause SR while TTS speaks (prevent hearing its own voice)
    speakingRef.current = true;
    try { srRef.current?.abort(); } catch(_) {}

    window.speechSynthesis.cancel();
    const u  = new SpeechSynthesisUtterance(text);
    u.lang   = 'en-US';
    u.rate   = 0.9;
    u.pitch  = 1;

    // Chrome silent-pause bug workaround
    const ka = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 10_000);

    u.onend = () => {
      clearInterval(ka);
      speakingRef.current = false;
      if (activeRef.current) onDone?.();
    };
    u.onerror = (e) => {
      clearInterval(ka);
      speakingRef.current = false;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (activeRef.current) onDone?.();
    };

    window.speechSynthesis.speak(u);
  };

  /* ══════════════════════════════════════════════════════════════
     START SR — opens mic with continuous:true so it NEVER sleeps.
     Handles results, restarts on end, manages countdown.
  ══════════════════════════════════════════════════════════════ */
  startSRRef.current = () => {
    if (!activeRef.current || speakingRef.current) return;
    if (!hasSR()) { setPhase('unsupported'); return; }

    // tear down any existing SR instance cleanly
    try { srRef.current?.abort(); } catch(_) {}
    srRef.current = null;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const sr = new SR();
    srRef.current = sr;

    sr.lang            = 'en-US';
    sr.interimResults  = false;
    sr.maxAlternatives = 4;
    sr.continuous      = true;   // ← KEY: mic stays open permanently

    // ── start / reset countdown ───────────────────────────────
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cdRef.current = TIMEOUT_SEC;
    setCountdown(TIMEOUT_SEC);

    timerRef.current = setInterval(() => {
      if (!activeRef.current || speakingRef.current) return; // pause countdown while TTS speaks
      cdRef.current -= 1;
      setCountdown(cdRef.current);
      if (cdRef.current <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        if (!activeRef.current) return;
        setStatusMsg('No answer heard — moving on…');
        speak("Time's up. Moving to the next question.", () => {
          if (!activeRef.current) return;
          if (hasNextRef.current) onNextRef.current?.();
          // onNext triggers questionId change → useEffect reads next question automatically
        });
      }
    }, 1000);

    setPhase('listening');
    setStatusMsg('');

    // ── handle speech result ──────────────────────────────────
    sr.onresult = (e) => {
      if (!activeRef.current || speakingRef.current) return;

      // with continuous=true, results keep accumulating; read only the latest
      const resultIdx  = e.results.length - 1;
      const result     = e.results[resultIdx];
      if (!result.isFinal) return;  // ignore interim

      const transcripts = Array.from(result).map(a => a.transcript);
      const heard       = transcripts[0] || '';
      console.log('[VoiceExamMode] heard:', transcripts);

      let match = -1;
      for (const t of transcripts) {
        match = matchSpeech(t, optionsRef.current);
        if (match !== -1) break;
      }

      // parse combo "index+REPEAT" (e.g. "option a and read the answers")
      let afterAnswerRepeat = false;
      if (typeof match === 'string' && match.includes('+REPEAT')) {
        afterAnswerRepeat = true;
        match = parseInt(match.split('+')[0], 10);
      }

      if (match === 'REPEAT') {
        // stop countdown, re-read, restart countdown after read
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setStatusMsg('Re-reading question…');
        readAndListenRef.current?.();
        return;
      }

      if (match >= 0) {
        // ✅ valid answer
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

        setMatchIdx(match);
        setPhase('processing');
        onAnswerRef.current?.(match);
        const letter = LETTERS[match];
        setStatusMsg(`Selected option ${letter}`);

        // flash the answer card
        setTimeout(() => {
          const el = document.getElementById(`vem-opt-${match}`);
          if (el) { el.classList.remove('vem-flash-green'); void el.offsetWidth; el.classList.add('vem-flash-green'); }
        }, 40);

        if (afterAnswerRepeat) {
          // student said e.g. "option A and read the answers" — confirm then re-read same question
          speak(`Option ${letter} selected. Re-reading the question.`, () => {
            if (activeRef.current) readAndListenRef.current?.();
          });
        } else {
          speak(
            `Option ${letter} selected. ${hasNextRef.current ? 'Moving to next question.' : 'That was the last question.'}`,
            () => {
              if (!activeRef.current) return;
              if (hasNextRef.current) {
                onNextRef.current?.();
                // questionId change → useEffect auto-reads next question
              } else {
                stopRef.current(false);
              }
            }
          );
        }
      } else {
        // no match — tell student and keep listening (SR is still continuous, no restart needed)
        setStatusMsg(`Didn't catch that${heard ? ` — heard "${heard}"` : ''}. Say A, B, C or D.`);
        speak("Sorry, I didn't catch that. Please say A, B, C, or D.", () => {
          // SR resumes automatically after speak() re-opens it
          if (activeRef.current) startSRRef.current?.();
        });
      }
    };

    // continuous SR fires onend only when aborted/stopped — restart if that
    // happens unexpectedly (e.g. browser timeout on continuous mode ~60s on iOS)
    sr.onend = () => {
      if (!activeRef.current || speakingRef.current) return;
      // restart SR to keep mic alive
      setTimeout(() => {
        if (activeRef.current && !speakingRef.current) startSRRef.current?.();
      }, 100);
    };

    sr.onerror = (e) => {
      if (!activeRef.current) return;
      if (e.error === 'aborted') return; // we aborted intentionally before TTS
      console.warn('[VoiceExamMode] SR error:', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setStatusMsg('Microphone permission denied.');
        stopRef.current(true);
        return;
      }
      // transient error — restart after short pause
      setTimeout(() => {
        if (activeRef.current && !speakingRef.current) startSRRef.current?.();
      }, 400);
    };

    try {
      sr.start();
    } catch(e) {
      console.error('[VoiceExamMode] sr.start() threw:', e);
      setTimeout(() => { if (activeRef.current) startSRRef.current?.(); }, 500);
    }
  };

  /* ══════════════════════════════════════════════════════════════
     READ + LISTEN — read current question then open mic
  ══════════════════════════════════════════════════════════════ */
  readAndListenRef.current = () => {
    if (!activeRef.current) return;

    // kill any running countdown & SR before re-reading
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { srRef.current?.abort(); } catch(_) {}

    setPhase('reading');
    setStatusMsg('');
    setMatchIdx(null);
    cdRef.current = TIMEOUT_SEC;
    setCountdown(TIMEOUT_SEC);

    const text = buildSpeechText(questionRef.current, optionsRef.current);
    speak(text, () => {
      if (activeRef.current) startSRRef.current?.();
    });
  };

  /* ══════════════════════════════════════════════════════════════
     HANDLE START — user clicks Read button
  ══════════════════════════════════════════════════════════════ */
  const handleStart = () => {
    if (!hasTTS()) { setPhase('unsupported'); return; }
    activeRef.current = true;
    readAndListenRef.current?.();
  };

  /* ─── render ──────────────────────────────────────────────── */
  const isReading    = phase === 'reading';
  const isListening  = phase === 'listening';
  const isProcessing = phase === 'processing';
  const isStopped    = phase === 'stopped';
  const isActive     = isReading || isListening || isProcessing;

  if (phase === 'unsupported') return (
    <span style={{ fontSize:11, color:'rgba(239,68,68,.7)' }}>
      🎤 Voice not supported in this browser
    </span>
  );

  const btnBorder = isActive ? 'rgba(13,148,136,.6)'  : 'rgba(13,148,136,.3)';
  const btnBg     = isActive ? 'rgba(13,148,136,.13)' : 'rgba(255,255,255,.04)';
  const btnColor  = isActive ? '#14B8A6' : '#0D9488';

  return (
    <div style={{ display:'inline-flex', flexDirection:'column', gap:7 }}>

      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

        {/* ── main button ───────────────────────────────────── */}
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
          {/* pulse ring while reading */}
          {isReading && (
            <span style={{
              position:'absolute', inset:0, borderRadius:999,
              border:'1.5px solid rgba(13,148,136,.55)',
              animation:'vem-ripple 1.3s ease-out infinite',
              pointerEvents:'none',
            }}/>
          )}

          {/* icon */}
          {isReading ? (
            <span style={{ display:'flex', alignItems:'flex-end', gap:2, height:16, color:'#14B8A6' }}>
              {[10,16,12,18,10].map((h,i) => (
                <span key={i} className="vem-bar" style={{ height:h, animationDelay:`${i*.13}s` }}/>
              ))}
            </span>
          ) : isListening ? (
            /* animated mic while listening */
            <span style={{ display:'flex', alignItems:'flex-end', gap:2, height:16, color:'#14B8A6' }}>
              {[14,10,18,10,14].map((h,i) => (
                <span key={i} className="vem-bar" style={{ height:h, animationDelay:`${i*.17}s` }}/>
              ))}
            </span>
          ) : isProcessing ? (
            <span style={{fontSize:14}}>⏳</span>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}

          <span>
            {isReading    ? 'Reading question…'
           : isListening  ? 'Listening…'
           : isProcessing ? 'Processing…'
           : isStopped    ? '🔊 Read Again'
           :                '🔊 Read Question'}
          </span>
        </button>

        {/* countdown ring — only while listening */}
        {isListening && <CountdownRing seconds={countdown} />}

        {/* ■ stop button — only while active */}
        {isActive && (
          <button
            onClick={() => stopRef.current(true)}
            title="Stop voice session"
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

      {/* ── hint / status ──────────────────────────────────── */}
      {isListening && !statusMsg && (
        <span style={{ fontSize:11, color:'rgba(20,184,166,.85)', paddingLeft:2 }}>
          Say <strong>A</strong>, <strong>B</strong>, <strong>C</strong> or <strong>D</strong>
          &nbsp;·&nbsp; or say <em>"read again"</em> to repeat
        </span>
      )}
      {isReading && (
        <span style={{ fontSize:11, color:'rgba(20,184,166,.6)', paddingLeft:2 }}>
          Reading question and options aloud…
        </span>
      )}
      {statusMsg && (
        <span style={{ fontSize:11, paddingLeft:2, color:'rgba(20,184,166,.85)' }}>
          {statusMsg}
        </span>
      )}
      {isStopped && !statusMsg && (
        <span style={{ fontSize:11, color:'rgba(255,255,255,.35)', paddingLeft:2 }}>
          Voice paused — click to resume
        </span>
      )}
    </div>
  );
}
