// src/components/shared/VoiceExamMode.jsx
// Fast-answer rewrite:
// • interimResults = true  → fires on EVERY word chunk, not just finals
// • Interim scan: if ANY interim chunk matches a letter → accept immediately
// • matchLetter greatly expanded: handles "the answer is a", "i'll go with b",
//   "i think it's c", "number one", phonetic edge cases, etc.
// • Silent miss: no TTS "didn't catch that" — just resets mic silently (saves ~2s)
// • maxAlternatives = 6, all alternatives scanned on each interim + final event
// • Android-safe: TTS triggered from button tap, no useEffect chains

import { useState, useEffect, useRef } from 'react';

const LETTERS     = ['A','B','C','D','E','F'];
const TIMEOUT_SEC = 60;

/* ── pre-load voices as early as possible ── */
function getVoices() {
  return new Promise(resolve => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) { resolve(v); return; }
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    };
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });
}

/* ── pick best English voice ── */
function pickVoice(voices) {
  return (
    voices.find(v => v.lang === 'en-US' && v.localService) ||
    voices.find(v => v.lang === 'en-US') ||
    voices.find(v => v.lang.startsWith('en')) ||
    voices[0] ||
    null
  );
}

/* ── normalize transcript ── */
const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

/* ── EXPANDED fast letter matcher ── */
function matchLetter(transcript) {
  const t = norm(transcript);

  // ── exact / short-form map (checked first for speed) ──
  const exactMap = {
    // A
    a:0, ay:0, eh:0, alpha:0,
    'option a':0, 'answer a':0, 'choice a':0, 'number a':0,
    'letter a':0, 'select a':0, 'pick a':0, 'choose a':0,
    'go with a':0, 'i pick a':0, 'i choose a':0,
    'its a':0, "it's a":0, 'i think a':0, 'i think its a':0,
    first:0, 'number one':0, 'number 1':0, one:0,
    // B
    b:1, be:1, bee:1, beta:1,
    'option b':1, 'answer b':1, 'choice b':1, 'number b':1,
    'letter b':1, 'select b':1, 'pick b':1, 'choose b':1,
    'go with b':1, 'i pick b':1, 'i choose b':1,
    'its b':1, "it's b":1, 'i think b':1, 'i think its b':1,
    second:1, 'number two':1, 'number 2':1, two:1,
    // C
    c:2, see:2, sea:2, si:2, charlie:2,
    'option c':2, 'answer c':2, 'choice c':2, 'number c':2,
    'letter c':2, 'select c':2, 'pick c':2, 'choose c':2,
    'go with c':2, 'i pick c':2, 'i choose c':2,
    'its c':2, "it's c":2, 'i think c':2, 'i think its c':2,
    third:2, 'number three':2, 'number 3':2, three:2,
    // D
    d:3, de:3, dee:3, delta:3,
    'option d':3, 'answer d':3, 'choice d':3, 'number d':3,
    'letter d':3, 'select d':3, 'pick d':3, 'choose d':3,
    'go with d':3, 'i pick d':3, 'i choose d':3,
    'its d':3, "it's d":3, 'i think d':3, 'i think its d':3,
    fourth:3, 'number four':3, 'number 4':3, four:3,
  };

  if (t in exactMap) return exactMap[t];

  // ── regex scan: finds "a", "b", "c", "d" anywhere in richer phrases ──
  // e.g. "the answer is a", "i'll go with b", "definitely c", "i think d"
  const patterns = [
    // "answer/option/choice is/= X"
    /\b(?:answer|option|choice|pick|select)\s+(?:is\s+)?([abcd])\b/,
    // "go with / choose / pick X"
    /\b(?:go\s+with|choose|pick|select|i(?:'ll)?\s+(?:go\s+with|choose|pick|select))\s+([abcd])\b/,
    // "it(?:'s| is) X" at end
    /\bit(?:'s|\s+is)\s+([abcd])(?:\s|$)/,
    // "i think (?:it's )?X"
    /\bi\s+think\s+(?:it(?:'s|\s+is)\s+)?([abcd])(?:\s|$)/,
    // standalone letter at end of phrase
    /\b([abcd])\s*$/,
    // standalone letter at start of phrase
    /^\s*([abcd])\b/,
    // any isolated letter in the string (most lenient, last resort)
    /\b([abcd])\b/,
  ];

  const letterIndex = { a: 0, b: 1, c: 2, d: 3 };

  for (const rx of patterns) {
    const m = t.match(rx);
    if (m) {
      const letter = m[1];
      if (letter in letterIndex) return letterIndex[letter];
    }
  }

  return -1;
}

/* ── is this a "repeat" command? ── */
function isRepeatCommand(t) {
  return /\b(read\s+again|repeat|again|re-?read|start\s+over|once\s+more)\b/.test(norm(t));
}

/* ── inject CSS ── */
const injectStyles = () => {
  if (document.getElementById('vem-styles')) return;
  const s = document.createElement('style');
  s.id = 'vem-styles';
  s.textContent = `
    @keyframes vem-bar {
      0%,100% { transform:scaleY(.3); }
      50%     { transform:scaleY(1);  }
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
  `;
  document.head.appendChild(s);
};

/* ── CountdownRing ── */
function CountdownRing({ seconds }) {
  const r = 18, circ = +(2 * Math.PI * r).toFixed(2);
  const off = +(circ * (1 - Math.max(0, Math.min(1, seconds / TIMEOUT_SEC)))).toFixed(2);
  const color = seconds <= 10 ? '#EF4444' : seconds <= 20 ? '#F59E0B' : '#0D9488';
  return (
    <svg width={44} height={44} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
      <circle cx={22} cy={22} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={3}/>
      <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={3}
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

/* ══════════════════════════════════════════════════════════════ */
export default function VoiceExamMode({
  question   = '',
  options    = [],
  questionId = '',
  onAnswer,
  onNext,
  hasNext = true,
}) {
  const [phase,     setPhase]     = useState('idle');   // idle|reading|listening|stopped
  const [countdown, setCountdown] = useState(TIMEOUT_SEC);
  const [statusMsg, setStatusMsg] = useState('');

  const activeRef   = useRef(false);
  const srRef       = useRef(null);
  const timerRef    = useRef(null);
  const cdRef       = useRef(TIMEOUT_SEC);
  const voiceRef    = useRef(null);
  const answeredRef = useRef(false); // guard against double-fire on interim+final

  // always-fresh prop mirrors
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

  useEffect(() => {
    injectStyles();
    getVoices().then(voices => { voiceRef.current = pickVoice(voices); });
    return () => hardStop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when question changes and session is active → re-read
  useEffect(() => {
    if (activeRef.current) {
      setTimeout(() => { if (activeRef.current) startReading(); }, 150);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  /* ── hard stop ── */
  const hardStop = () => {
    activeRef.current = false;
    answeredRef.current = false;
    window.speechSynthesis?.cancel();
    stopMic();
    stopTimer();
    setPhase('stopped');
    setStatusMsg('');
    setCountdown(TIMEOUT_SEC);
  };

  /* ── mic helpers ── */
  const stopMic = () => {
    try { srRef.current?.stop();  } catch(_) {}
    try { srRef.current?.abort(); } catch(_) {}
    srRef.current = null;
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  /* ── speak ── */
  const speakText = (text, onDone) => {
    if (!activeRef.current) return;
    window.speechSynthesis.cancel();

    const voices = window.speechSynthesis.getVoices();
    if (!voiceRef.current && voices.length) voiceRef.current = pickVoice(voices);

    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.lang  = 'en-US';
    u.rate  = 0.85;
    u.pitch = 1;

    const ka = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 5000);

    u.onstart = () => console.log('[VEM] TTS started');
    u.onend   = () => { clearInterval(ka); if (activeRef.current) onDone?.(); };
    u.onerror = (e) => {
      clearInterval(ka);
      console.warn('[VEM] TTS error:', e.error);
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (activeRef.current) onDone?.();
    };

    window.speechSynthesis.speak(u);
  };

  /* ── commit answer (called from interim OR final) ── */
  const commitAnswer = (idx) => {
    if (!activeRef.current || answeredRef.current) return;
    answeredRef.current = true;          // lock — prevent double-fire
    stopTimer();
    stopMic();
    const letter = LETTERS[idx];
    setStatusMsg(`✓ Option ${letter}`);
    setPhase('idle');
    onAnswerRef.current?.(idx);
    speakText(`Option ${letter}.`, () => {
      if (activeRef.current && hasNextRef.current) {
        setTimeout(() => {
          if (activeRef.current) onNextRef.current?.();
        }, 400);
      }
    });
  };

  /* ── open mic ── */
  const openMic = () => {
    if (!activeRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatusMsg('Speech recognition not supported.'); return; }

    stopMic();
    answeredRef.current = false;

    const sr = new SR();
    srRef.current = sr;
    sr.lang            = 'en-US';
    sr.continuous      = true;
    sr.interimResults  = true;   // ← KEY CHANGE: fire on every partial word
    sr.maxAlternatives = 6;      // more alternatives = more chances to match

    // countdown
    stopTimer();
    cdRef.current = TIMEOUT_SEC;
    setCountdown(TIMEOUT_SEC);
    timerRef.current = setInterval(() => {
      cdRef.current -= 1;
      setCountdown(cdRef.current);
      if (cdRef.current <= 0) {
        stopTimer();
        if (!activeRef.current) return;
        setStatusMsg('No answer — moving on…');
        stopMic();
        speakText("Time's up. Moving on.", () => {
          if (activeRef.current && hasNextRef.current) onNextRef.current?.();
        });
      }
    }, 1000);

    setPhase('listening');
    setStatusMsg('');

    sr.onresult = (e) => {
      if (!activeRef.current || answeredRef.current) return;

      // collect ALL result chunks (interim + final) from this event
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const isFinal = result.isFinal;

        // build list of all alternatives for this chunk
        const alts = Array.from(result).map(r => r.transcript);
        console.log('[VEM]', isFinal ? 'FINAL' : 'interim', alts);

        // ── check for repeat command first ──
        if (alts.some(isRepeatCommand)) {
          stopTimer(); stopMic();
          setStatusMsg('Re-reading…');
          setTimeout(() => { if (activeRef.current) startReading(); }, 50);
          return;
        }

        // ── scan all alternatives for a letter match ──
        let idx = -1;
        for (const t of alts) {
          idx = matchLetter(t);
          if (idx >= 0) break;
        }

        if (idx >= 0) {
          commitAnswer(idx);
          return;
        }

        // ── if final with no match: silent — don't speak, just keep listening ──
        // (removes the ~2s TTS "didn't catch that" penalty)
        if (isFinal) {
          const heard = alts[0] || '';
          if (heard.trim().length > 0) {
            setStatusMsg(`Didn't catch "${heard.slice(0, 30)}" — say A, B, C or D`);
            // clear status after 1.5s so it doesn't linger
            setTimeout(() => {
              if (activeRef.current && !answeredRef.current) setStatusMsg('');
            }, 1500);
          }
        }
      }
    };

    sr.onend = () => {
      if (!activeRef.current || answeredRef.current) return;
      if (cdRef.current > 0) {
        console.log('[VEM] mic force-closed, reopening…');
        setTimeout(() => { if (activeRef.current && !answeredRef.current) openMic(); }, 100);
      }
    };

    sr.onerror = (e) => {
      console.warn('[VEM] SR error:', e.error);
      if (!activeRef.current) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopTimer();
        setStatusMsg('Microphone permission denied.');
        hardStop();
        return;
      }
      if (e.error === 'aborted') return;
      setTimeout(() => { if (activeRef.current && !answeredRef.current) openMic(); }, 400);
    };

    try { sr.start(); console.log('[VEM] mic started'); }
    catch(e) {
      console.error('[VEM] sr.start threw:', e);
      setTimeout(() => { if (activeRef.current) openMic(); }, 500);
    }
  };

  /* ── read question then open mic ── */
  const startReading = () => {
    if (!activeRef.current) return;
    stopMic(); stopTimer();
    answeredRef.current = false;
    setPhase('reading');
    setStatusMsg('');
    cdRef.current = TIMEOUT_SEC;
    setCountdown(TIMEOUT_SEC);

    const q = questionRef.current;
    const opts = optionsRef.current;
    let text = q + '.  ';
    opts.forEach((o, i) => {
      text += `Option ${LETTERS[i]}: ${typeof o === 'string' ? o : (o.text ?? '')}.  `;
    });

    speakText(text, () => { if (activeRef.current) openMic(); });
  };

  /* ── handle Read button tap ── */
  const handleStart = () => {
    activeRef.current = true;
    getVoices().then(voices => {
      voiceRef.current = pickVoice(voices);
      startReading();
    });
  };

  /* ── render ── */
  const isReading   = phase === 'reading';
  const isListening = phase === 'listening';
  const isActive    = isReading || isListening;
  const isStopped   = phase === 'stopped';

  return (
    <div style={{ display:'inline-flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

        {/* main button */}
        <button
          onClick={isActive ? undefined : handleStart}
          disabled={isActive}
          style={{
            display:'inline-flex', alignItems:'center', gap:8,
            padding:'8px 16px', borderRadius:999,
            border: isActive ? '1.5px solid rgba(13,148,136,.6)' : '1.5px solid rgba(13,148,136,.3)',
            background: isActive ? 'rgba(13,148,136,.13)' : 'rgba(255,255,255,.04)',
            color: isActive ? '#14B8A6' : '#0D9488',
            fontSize:13, fontWeight:600,
            cursor: isActive ? 'default' : 'pointer',
            transition:'all .2s',
          }}
        >
          {isReading ? (
            <span style={{ display:'flex', alignItems:'flex-end', gap:2, height:16 }}>
              {[10,16,12,18,10].map((h,i) => <span key={i} className="vem-bar" style={{ height:h }}/>)}
            </span>
          ) : isListening ? (
            <span style={{ display:'flex', alignItems:'flex-end', gap:2, height:16 }}>
              {[14,10,18,10,14].map((h,i) => <span key={i} className="vem-bar" style={{ height:h }}/>)}
            </span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
          <span>
            {isReading ? 'Reading…' : isListening ? 'Listening…' : isStopped ? '🔊 Read Again' : '🔊 Read Question'}
          </span>
        </button>

        {/* countdown */}
        {isListening && <CountdownRing seconds={countdown} />}

        {/* stop */}
        {isActive && (
          <button
            onClick={hardStop}
            title="Stop"
            style={{
              width:32, height:32, borderRadius:'50%', border:'1.5px solid rgba(239,68,68,.35)',
              background:'rgba(239,68,68,.08)', color:'rgba(239,68,68,.7)',
              cursor:'pointer', fontSize:10, fontWeight:800,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
            }}
          >■</button>
        )}
      </div>

      {/* status */}
      {statusMsg ? (
        <span style={{ fontSize:11, color:'rgba(20,184,166,.85)', paddingLeft:2 }}>{statusMsg}</span>
      ) : isListening ? (
        <span style={{ fontSize:11, color:'rgba(20,184,166,.85)', paddingLeft:2 }}>
          Say <strong>A</strong>, <strong>B</strong>, <strong>C</strong> or <strong>D</strong>
          &nbsp;·&nbsp;<em>"read again"</em> to repeat
        </span>
      ) : isReading ? (
        <span style={{ fontSize:11, color:'rgba(20,184,166,.6)', paddingLeft:2 }}>Reading question aloud…</span>
      ) : isStopped ? (
        <span style={{ fontSize:11, color:'rgba(255,255,255,.35)', paddingLeft:2 }}>Voice paused — tap to resume</span>
      ) : null}
    </div>
  );
}
