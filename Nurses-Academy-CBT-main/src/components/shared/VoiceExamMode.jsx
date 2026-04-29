// src/components/shared/VoiceExamMode.jsx
// Android-safe rewrite:
// • TTS triggered directly from button tap (user gesture)
// • Mic opened directly after TTS ends via utterance.onend
// • No useEffect chains — everything flows from the tap
// • Voices pre-loaded on mount so first speak is instant

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
    // hard fallback
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

function matchLetter(transcript) {
  const t = norm(transcript);
  const map = {
    a:0, ay:0, 'option a':0, 'answer a':0, 'choice a':0, first:0,
    b:1, be:1, bee:1, 'option b':1, 'answer b':1, 'choice b':1, second:1,
    c:2, see:2, sea:2, 'option c':2, 'answer c':2, 'choice c':2, third:2,
    d:3, de:3, dee:3, 'option d':3, 'answer d':3, 'choice d':3, fourth:3,
  };
  if (t in map) return map[t];
  // last word
  const last = t.split(/\s+/).pop();
  if (last in map) return map[last];
  // first word
  const first = t.split(/\s+/)[0];
  if (first in map) return map[first];
  return -1;
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

  const activeRef  = useRef(false);
  const srRef      = useRef(null);
  const timerRef   = useRef(null);
  const cdRef      = useRef(TIMEOUT_SEC);
  const voiceRef   = useRef(null);   // cached SpeechSynthesisVoice

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
    // pre-load voices on mount
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

  /* ── speak (safe for Android) ── */
  const speakText = (text, onDone) => {
    if (!activeRef.current) return;
    window.speechSynthesis.cancel();

    // ensure voices loaded
    const voices = window.speechSynthesis.getVoices();
    if (!voiceRef.current && voices.length) voiceRef.current = pickVoice(voices);

    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.lang  = 'en-US';
    u.rate  = 0.85;
    u.pitch = 1;

    // Chrome keep-alive (paused bug)
    const ka = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 5000);

    u.onstart = () => console.log('[VEM] TTS started');
    u.onend   = () => { clearInterval(ka); console.log('[VEM] TTS ended'); if (activeRef.current) onDone?.(); };
    u.onerror = (e) => {
      clearInterval(ka);
      console.warn('[VEM] TTS error:', e.error);
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (activeRef.current) onDone?.();
    };

    window.speechSynthesis.speak(u);
    console.log('[VEM] speak() called, pending:', window.speechSynthesis.pending, 'speaking:', window.speechSynthesis.speaking);
  };

  /* ── open mic ── */
  const openMic = () => {
    if (!activeRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatusMsg('Speech recognition not supported.'); return; }

    stopMic();

    const sr = new SR();
    srRef.current      = sr;
    sr.lang            = 'en-US';
    sr.continuous      = false;
    sr.interimResults  = false;
    sr.maxAlternatives = 4;

    // start countdown
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
    setStatusMsg('Say A, B, C or D');

    sr.onresult = (e) => {
      const transcripts = Array.from(e.results[0]).map(r => r.transcript);
      console.log('[VEM] heard:', transcripts);
      const heard = transcripts[0] || '';

      let idx = -1;
      for (const t of transcripts) { idx = matchLetter(t); if (idx >= 0) break; }

      // repeat command
      const isRepeat = transcripts.some(t => /\b(read again|repeat|again|re-read)\b/.test(norm(t)));
      if (isRepeat) {
        stopTimer(); stopMic();
        setStatusMsg('Re-reading…');
        startReading();
        return;
      }

      if (idx >= 0) {
        stopTimer(); stopMic();
        const letter = LETTERS[idx];
        setStatusMsg(`✓ Option ${letter}`);
        setPhase('idle');
        onAnswerRef.current?.(idx);
        speakText(`Option ${letter}.`, () => {
          if (activeRef.current && hasNextRef.current) {
            setTimeout(() => { if (activeRef.current) onNextRef.current?.(); }, 400);
          }
        });
      } else {
        setStatusMsg(`Didn't catch "${heard}" — say A, B, C or D`);
        speakText("Didn't catch that. Say A, B, C, or D.", () => {
          if (activeRef.current) openMic();
        });
      }
    };

    sr.onend = () => {
      if (!activeRef.current) return;
      // reopen if no result yet
      if (cdRef.current > 0) {
        setTimeout(() => { if (activeRef.current) openMic(); }, 200);
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
      if (e.error === 'no-speech') {
        // normal — reopen
        setTimeout(() => { if (activeRef.current) openMic(); }, 200);
        return;
      }
      setTimeout(() => { if (activeRef.current) openMic(); }, 400);
    };

    try { sr.start(); console.log('[VEM] mic started'); }
    catch(e) { console.error('[VEM] sr.start threw:', e); setTimeout(() => { if (activeRef.current) openMic(); }, 500); }
  };

  /* ── read question then open mic ── */
  const startReading = () => {
    if (!activeRef.current) return;
    stopMic(); stopTimer();
    setPhase('reading');
    setStatusMsg('');
    cdRef.current = TIMEOUT_SEC;
    setCountdown(TIMEOUT_SEC);

    const q = questionRef.current;
    const opts = optionsRef.current;
    let text = q + '.  ';
    opts.forEach((o, i) => { text += `Option ${LETTERS[i]}: ${typeof o === 'string' ? o : (o.text ?? '')}.  `; });

    speakText(text, () => { if (activeRef.current) openMic(); });
  };

  /* ── handle Read button tap ── */
  const handleStart = () => {
    activeRef.current = true;
    // ensure voices are loaded (may not be on first tap on Android)
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
