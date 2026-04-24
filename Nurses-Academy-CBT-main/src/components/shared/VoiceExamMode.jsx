// src/components/shared/VoiceExamMode.jsx
//
// Unified voice flow for exam questions:
//   1. Student clicks "Read Question"
//   2. System reads the question + all options aloud (TTS)
//   3. Mic opens automatically — student says "A", "B", "C", "D" or option text
//   4. On match → selects answer → brief confirmation → moves to next question
//   5. Student says "read again" → re-reads and re-opens mic
//   6. No answer within 60 s → timeout → marks question unanswered → next question
//   7. Clicking "Stop" at any point kills TTS + mic and resets to idle
//
// USAGE (replaces both QuestionReader + VoiceAnswerPicker):
//
//   <VoiceExamMode
//     question={q.question}
//     options={q.options}
//     questionId={q.id}
//     onAnswer={(index) => setAnswers(prev => ({ ...prev, [q.id]: index }))}
//     onNext={() => setCurrent(c => c + 1)}
//     hasNext={current < questions.length - 1}
//   />

import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── styles ──────────────────────────────────────────────────────────── */
const injectStyles = () => {
  if (document.getElementById('vem-styles')) return;
  const s = document.createElement('style');
  s.id = 'vem-styles';
  s.textContent = `
    @keyframes vem-ripple {
      0%   { transform:scale(1);    opacity:.65; }
      100% { transform:scale(1.7);  opacity:0;   }
    }
    @keyframes vem-bar {
      0%,100% { transform:scaleY(.3); }
      50%     { transform:scaleY(1);  }
    }
    @keyframes vem-fadein {
      from { opacity:0; transform:translateY(5px); }
      to   { opacity:1; transform:translateY(0);   }
    }
    @keyframes vem-countdown {
      from { stroke-dashoffset: 0; }
      to   { stroke-dashoffset: 183; } /* 2πr ≈ 183 for r=29 */
    }
    @keyframes vem-flash-green {
      0%   { box-shadow: 0 0 0 0 rgba(22,163,74,.55); }
      60%  { box-shadow: 0 0 0 12px rgba(22,163,74,0); }
      100% { box-shadow: none; }
    }
    @keyframes vem-flash-red {
      0%   { box-shadow: 0 0 0 0 rgba(239,68,68,.5); }
      60%  { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
      100% { box-shadow: none; }
    }
    .vem-bar { display:inline-block; width:3px; border-radius:2px;
               background:currentColor;
               animation: vem-bar .8s ease-in-out infinite; }
    .vem-bar:nth-child(2){ animation-delay:.13s }
    .vem-bar:nth-child(3){ animation-delay:.26s }
    .vem-bar:nth-child(4){ animation-delay:.39s }
    .vem-bar:nth-child(5){ animation-delay:.52s }
    .vem-flash-green { animation: vem-flash-green .7s ease forwards; }
    .vem-flash-red   { animation: vem-flash-red   .7s ease forwards; }
  `;
  document.head.appendChild(s);
};

/* ─── helpers ─────────────────────────────────────────────────────────── */
const LETTER      = ['A','B','C','D','E','F'];
const TIMEOUT_SEC = 60;

const getSR = () => {
  const W  = typeof window !== 'undefined' ? window : {};
  const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  return SR ? new SR() : null;
};

const norm = str => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

function matchSpeech(transcript, options) {
  const t = norm(transcript);

  // "read again" / "repeat"
  if (t.includes('read again') || t.includes('repeat') || t.includes('read it again') || t.includes('say again'))
    return 'REPEAT';

  // exact letter
  for (let i = 0; i < options.length; i++)
    if (t === LETTER[i].toLowerCase()) return i;

  // "option a" / "answer b" / "choose c" / "select d"
  for (let i = 0; i < options.length; i++)
    if (['option','answer','choose','select','pick'].some(kw =>
      t.includes(`${kw} ${LETTER[i].toLowerCase()}`))) return i;

  // fuzzy option-text match (>50% words)
  const texts = options.map(o => norm(typeof o === 'string' ? o : o.text));
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
  let text = question + '. ';
  options.forEach((o, i) => {
    const txt = typeof o === 'string' ? o : o.text;
    text += `Option ${LETTER[i]}: ${txt}. `;
  });
  return text;
}

/* ─── CountdownRing ───────────────────────────────────────────────────── */
function CountdownRing({ seconds, total = TIMEOUT_SEC }) {
  const pct       = Math.max(0, seconds / total);
  const r         = 18;
  const circ      = 2 * Math.PI * r;          // ≈ 113
  const dashoffset = circ * (1 - pct);
  const color     = seconds <= 10 ? '#EF4444' : seconds <= 20 ? '#F59E0B' : '#0D9488';
  return (
    <svg width={44} height={44} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      {/* track */}
      <circle cx={22} cy={22} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={3} />
      {/* progress */}
      <circle cx={22} cy={22} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={circ}
        strokeDashoffset={dashoffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .9s linear, stroke .3s' }}
      />
      {/* number */}
      <text x={22} y={22} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={11} fontWeight={700}
        style={{ transform: 'rotate(90deg)', transformOrigin: '22px 22px' }}>
        {seconds}
      </text>
    </svg>
  );
}

/* ─── main component ──────────────────────────────────────────────────── */
// phase: idle | reading | listening | processing | matched | timeout | stopped | unsupported

export default function VoiceExamMode({
  question    = '',
  options     = [],
  questionId  = '',
  onAnswer,           // (index: number) => void
  onNext,             // () => void  — advance to next question
  hasNext     = true,
}) {
  const [phase,      setPhase]      = useState('idle');
  const [countdown,  setCountdown]  = useState(TIMEOUT_SEC);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [matchIdx,   setMatchIdx]   = useState(null);
  const [lastHeard,  setLastHeard]  = useState('');

  const utterRef    = useRef(null);
  const srRef       = useRef(null);
  const timerRef    = useRef(null);   // countdown interval
  const cdRef       = useRef(TIMEOUT_SEC);
  const activeRef   = useRef(false);  // true while the whole voice session is on
  const optionsRef  = useRef(options);
  optionsRef.current = options;

  useEffect(() => { injectStyles(); }, []);

  /* ── full stop whenever questionId changes ── */
  useEffect(() => {
    stopEverything(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  useEffect(() => () => stopEverything(false), []);

  /* ════════════════════════════════════════════════
     STOP — kills TTS + mic + countdown
  ════════════════════════════════════════════════ */
  const stopEverything = useCallback((userStopped = true) => {
    activeRef.current = false;
    window.speechSynthesis?.cancel();
    srRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase(userStopped ? 'stopped' : 'idle');
    setCountdown(TIMEOUT_SEC);
    cdRef.current = TIMEOUT_SEC;
    setMatchIdx(null);
    setLastHeard('');
    setStatusMsg('');
  }, []);

  /* ════════════════════════════════════════════════
     LISTEN — open mic after TTS finishes
  ════════════════════════════════════════════════ */
  const startListening = useCallback(() => {
    if (!activeRef.current) return;

    const sr = getSR();
    if (!sr) { setPhase('unsupported'); return; }

    srRef.current?.abort();
    srRef.current = sr;

    sr.lang            = 'en-US';
    sr.interimResults  = false;
    sr.maxAlternatives = 4;
    sr.continuous      = false;

    setPhase('listening');
    setCountdown(TIMEOUT_SEC);
    cdRef.current = TIMEOUT_SEC;
    if (timerRef.current) clearInterval(timerRef.current);

    /* countdown tick */
    timerRef.current = setInterval(() => {
      cdRef.current -= 1;
      setCountdown(cdRef.current);
      if (cdRef.current <= 0) {
        clearInterval(timerRef.current);
        srRef.current?.abort();
        if (!activeRef.current) return;
        // timeout → mark unanswered, move on
        setPhase('timeout');
        setStatusMsg('No answer heard — moving on…');
        speak(`Time's up. Moving to the next question.`, () => {
          if (!activeRef.current) return;
          setTimeout(() => {
            if (hasNext) onNext?.();
            else stopEverything(false);
          }, 400);
        });
      }
    }, 1000);

    sr.onresult = (e) => {
      if (!activeRef.current) return;
      clearInterval(timerRef.current);
      setPhase('processing');

      const transcripts = Array.from(e.results[0]).map(a => a.transcript);
      setLastHeard(transcripts[0] || '');
      let result = -1;
      for (const t of transcripts) {
        result = matchSpeech(t, optionsRef.current);
        if (result !== -1) break;
      }

      if (result === 'REPEAT') {
        // student asked to hear it again
        setStatusMsg('Re-reading question…');
        setTimeout(() => { if (activeRef.current) readAndListen(); }, 300);
        return;
      }

      if (result !== -1) {
        // valid answer
        setMatchIdx(result);
        setPhase('matched');
        onAnswer?.(result);
        const letter = LETTER[result];
        setStatusMsg(`Selected option ${letter}`);
        // flash the option button
        setTimeout(() => {
          const el = document.getElementById(`vem-opt-${result}`);
          if (el) { el.classList.remove('vem-flash-green'); void el.offsetWidth; el.classList.add('vem-flash-green'); }
        }, 50);
        speak(`Option ${letter} selected. ${hasNext ? 'Moving to next question.' : 'That was the last question.'}`, () => {
          if (!activeRef.current) return;
          setTimeout(() => {
            if (hasNext) onNext?.();
            else stopEverything(false);
          }, 300);
        });
      } else {
        // no match — tell student and listen again
        const heard = transcripts[0] || '';
        setStatusMsg(`Didn't catch that${heard ? ` — heard "${heard}"` : ''}. Say A, B, C or D.`);
        setPhase('listening'); // keep in listening-ish phase
        speak(`Sorry, I didn't catch that. Please say A, B, C, or D.`, () => {
          if (activeRef.current) startListening();
        });
      }
    };

    sr.onerror = (e) => {
      if (!activeRef.current) return;
      if (e.error === 'aborted') return;
      if (e.error === 'no-speech') {
        // SR ended with no speech — just restart if still within countdown
        if (cdRef.current > 0 && activeRef.current) {
          setTimeout(() => { if (activeRef.current) startListening(); }, 200);
        }
        return;
      }
      setStatusMsg('Microphone error — try again');
      setPhase('stopped');
    };

    sr.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext, onAnswer, onNext, stopEverything]);

  /* ════════════════════════════════════════════════
     SPEAK — TTS wrapper
  ════════════════════════════════════════════════ */
  const speak = useCallback((text, onDone) => {
    window.speechSynthesis.cancel();
    const utter       = new SpeechSynthesisUtterance(text);
    utter.lang        = 'en-US';
    utter.rate        = 0.92;
    utter.pitch       = 1;
    utterRef.current  = utter;
    utter.onend       = () => { if (activeRef.current) onDone?.(); };
    utter.onerror     = () => { if (activeRef.current) onDone?.(); };
    window.speechSynthesis.speak(utter);
  }, []);

  /* ════════════════════════════════════════════════
     READ + LISTEN — combined entry point
  ════════════════════════════════════════════════ */
  const readAndListen = useCallback(() => {
    if (!activeRef.current) return;
    setPhase('reading');
    setStatusMsg('');
    setMatchIdx(null);
    const text = buildSpeechText(question, optionsRef.current);
    speak(text, () => {
      if (activeRef.current) startListening();
    });
  }, [question, speak, startListening]);

  /* ════════════════════════════════════════════════
     START — user clicks Read button
  ════════════════════════════════════════════════ */
  const handleStart = useCallback(() => {
    if (!('speechSynthesis' in window)) { setPhase('unsupported'); return; }
    activeRef.current = true;
    readAndListen();
  }, [readAndListen]);

  /* ─── derived ────────────────────────────────── */
  const isReading    = phase === 'reading';
  const isListening  = phase === 'listening';
  const isProcessing = phase === 'processing';
  const isMatched    = phase === 'matched';
  const isTimeout    = phase === 'timeout';
  const isStopped    = phase === 'stopped';
  const isActive     = isReading || isListening || isProcessing || isMatched || isTimeout;

  if (phase === 'unsupported') return (
    <span style={{ fontSize: 11, color: 'rgba(239,68,68,.7)' }}>
      🎤 Voice not supported in this browser
    </span>
  );

  /* ── colors ── */
  const btnBg     = isActive  ? 'rgba(13,148,136,.14)' : isStopped ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.04)';
  const btnBorder = isActive  ? 'rgba(13,148,136,.6)'  : 'rgba(13,148,136,.28)';
  const btnColor  = isMatched ? '#16A34A' : isTimeout ? '#EF4444' : isActive ? '#14B8A6' : '#0D9488';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 7, animation: 'vem-fadein .3s ease' }}>

      {/* ── button row ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

        {/* main read/status button */}
        <button
          onClick={isActive ? undefined : handleStart}
          disabled={isActive}
          title={isActive ? 'Voice session active' : isStopped ? 'Click to restart' : 'Read question aloud then listen for your answer'}
          style={{
            display:        'inline-flex',
            alignItems:     'center',
            gap:            9,
            padding:        '8px 16px',
            borderRadius:   999,
            border:         `1.5px solid ${btnBorder}`,
            background:     btnBg,
            color:          btnColor,
            fontSize:       13,
            fontWeight:     600,
            cursor:         isActive ? 'default' : 'pointer',
            opacity:        1,
            transition:     'all .2s',
            backdropFilter: 'blur(8px)',
            position:       'relative',
            overflow:       'hidden',
            letterSpacing:  .2,
            boxShadow:      isActive ? `0 0 0 1px rgba(13,148,136,.3), 0 2px 18px rgba(13,148,136,.18)` : 'none',
          }}
        >
          {/* pulse ring while reading */}
          {isReading && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: 999,
              border: '1.5px solid rgba(13,148,136,.6)',
              animation: 'vem-ripple 1.3s ease-out infinite',
              pointerEvents: 'none',
            }} />
          )}

          {/* icon */}
          {isReading ? (
            <span style={{ display:'flex', alignItems:'flex-end', gap:2, height:16, color:'#14B8A6' }}>
              {[10,16,12,18,10].map((h,i)=>(
                <span key={i} className="vem-bar" style={{ height:h, animationDelay:`${i*.13}s` }}/>
              ))}
            </span>
          ) : isListening ? (
            /* mic icon */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8"  y1="22" x2="16" y2="22"/>
            </svg>
          ) : isMatched ? (
            <span style={{ fontSize:14 }}>✅</span>
          ) : isTimeout ? (
            <span style={{ fontSize:14 }}>⏰</span>
          ) : isProcessing ? (
            <span style={{ fontSize:14 }}>⏳</span>
          ) : (
            /* speaker icon */
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}

          <span>
            {isReading    ? 'Reading question…'
           : isListening  ? 'Listening for answer…'
           : isProcessing ? 'Processing…'
           : isMatched    ? `Answer ${LETTER[matchIdx] ?? ''} selected!`
           : isTimeout    ? 'Time out — moving on…'
           : isStopped    ? '🔊 Read Again'
           : '🔊 Read Question'}
          </span>
        </button>

        {/* countdown ring — shown while listening */}
        {isListening && (
          <CountdownRing seconds={countdown} total={TIMEOUT_SEC} />
        )}

        {/* stop button — shown while active */}
        {isActive && !isMatched && !isTimeout && (
          <button
            onClick={() => stopEverything(true)}
            title="Stop reading & listening"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: '50%',
              border: '1.5px solid rgba(239,68,68,.35)',
              background: 'rgba(239,68,68,.08)',
              color: 'rgba(239,68,68,.7)',
              cursor: 'pointer', fontSize: 10, fontWeight: 800,
              transition: 'all .2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,.18)'; e.currentTarget.style.color='#EF4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,.08)'; e.currentTarget.style.color='rgba(239,68,68,.7)'; }}
          >
            ■
          </button>
        )}
      </div>

      {/* ── status line ─────────────────────────────────────────── */}
      {isListening && !statusMsg && (
        <span style={{ fontSize: 11, color: 'rgba(20,184,166,.8)', paddingLeft: 2 }}>
          Say <strong>A</strong>, <strong>B</strong>, <strong>C</strong> or <strong>D</strong> · or say <em>"read again"</em> to repeat
        </span>
      )}
      {statusMsg && (
        <span style={{
          fontSize: 11, paddingLeft: 2,
          color: isMatched ? '#16A34A' : isTimeout ? '#EF4444' : 'rgba(20,184,166,.8)',
        }}>
          {statusMsg}
        </span>
      )}
      {isStopped && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', paddingLeft: 2 }}>
          Voice session stopped — click to start again
        </span>
      )}
    </div>
  );
}
