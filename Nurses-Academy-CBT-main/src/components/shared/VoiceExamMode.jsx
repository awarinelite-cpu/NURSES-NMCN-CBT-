// src/components/shared/VoiceExamMode.jsx
//
// Flow:
// • Student clicks "Read Question" once → session starts for the whole exam
// • TTS reads question + options → mic stays ALWAYS OPEN (continuous)
// • Student says A/B/C/D → answer saved → TTS reads next question immediately
// • Student can say "next" to skip without answering
// • Tap the mic button to pause/resume listening
// • Session persists across questions until student taps Stop

import { useState, useEffect, useRef, useCallback } from 'react';

const LETTER_MAP = {
  a: 0, ay: 0,
  b: 1, be: 1, bee: 1,
  c: 2, see: 2, sea: 2,
  d: 3, de: 3, dee: 3,
};

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export default function VoiceExamMode({
  question,
  options = [],
  questionId,
  onAnswer,
  onNext,
  hasNext = true,
}) {
  const [active,    setActive]    = useState(false);
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState('');

  const recRef      = useRef(null);
  const activeRef   = useRef(false);
  const answeredRef = useRef(false);

  useEffect(() => { activeRef.current = active; }, [active]);

  // Reset per question
  useEffect(() => {
    answeredRef.current = false;
    if (activeRef.current) readQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  useEffect(() => () => { stopAll(); }, []);

  /* ── TTS ─────────────────────────────────────────────────── */
  const speak = (text, cb) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9; u.lang = 'en-US';
    if (cb) u.onend = cb;
    window.speechSynthesis.speak(u);
  };

  const readQuestion = useCallback(() => {
    const optStr = options.map((o, i) => `${['A','B','C','D'][i]}. ${o}`).join('. ');
    speak(`${question}. ${optStr}`, openMic);
    setListening(false);
    stopRec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, options]);

  /* ── Mic ─────────────────────────────────────────────────── */
  const stopRec = () => {
    try { recRef.current?.abort(); } catch (_) {}
    recRef.current = null;
  };

  const openMic = useCallback(() => {
    if (!activeRef.current) return;
    stopRec();
    if (!SpeechRecognition) return;

    const rec = new SpeechRecognition();
    rec.lang           = 'en-US';
    rec.continuous     = false;
    rec.interimResults = false;

    rec.onstart  = () => setListening(true);
    rec.onend    = () => {
      setListening(false);
      // reopen mic if still active and not yet answered
      if (activeRef.current && !answeredRef.current) {
        setTimeout(openMic, 250);
      }
    };
    rec.onerror  = (e) => {
      if (e.error === 'no-speech' && activeRef.current) setTimeout(openMic, 250);
    };
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript.trim().toLowerCase();
      setLastHeard(t);
      const idx = LETTER_MAP[t] ?? LETTER_MAP[t.split(' ').pop()];
      if (idx !== undefined && !answeredRef.current) {
        answeredRef.current = true;
        speak(`${['A','B','C','D'][idx]}.`, () => {
          onAnswer(idx);
          if (hasNext) setTimeout(() => { if (activeRef.current) onNext?.(); }, 500);
        });
      } else if (t.includes('next') && !answeredRef.current) {
        onNext?.();
      }
    };

    recRef.current = rec;
    try { rec.start(); } catch (_) {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAnswer, onNext, hasNext]);

  /* ── Session control ─────────────────────────────────────── */
  const stopAll = () => {
    stopRec();
    window.speechSynthesis.cancel();
    setActive(false); setListening(false); setLastHeard('');
    activeRef.current = false;
  };

  const handleStart = () => {
    setActive(true);
    activeRef.current   = true;
    answeredRef.current = false;
    readQuestion();
  };

  /* ── UI ──────────────────────────────────────────────────── */
  if (!SpeechRecognition) return null;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
      {!active ? (
        <button
          onClick={handleStart}
          style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'7px 14px', borderRadius:20,
            background:'rgba(13,148,136,0.1)', border:'1.5px solid rgba(13,148,136,0.4)',
            color:'var(--teal)', fontFamily:'inherit', fontWeight:700, fontSize:13,
            cursor:'pointer',
          }}
        >
          🔊 Read Question
        </button>
      ) : (
        <>
          <button
            onClick={stopAll}
            style={{
              width:40, height:40, borderRadius:'50%',
              display:'flex', alignItems:'center', justifyContent:'center',
              border:'none', cursor:'pointer', fontSize:18,
              background: listening ? 'rgba(239,68,68,0.15)' : 'rgba(13,148,136,0.12)',
              color: listening ? '#EF4444' : 'var(--teal)',
            }}
          >
            {listening ? '🎤' : '⏸'}
          </button>
          {lastHeard && (
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>
              heard: "{lastHeard}"
            </span>
          )}
          <button
            onClick={() => { answeredRef.current = false; readQuestion(); }}
            style={{
              padding:'4px 10px', borderRadius:16, background:'none',
              border:'1px solid var(--border)', color:'var(--text-muted)',
              fontFamily:'inherit', fontSize:11, cursor:'pointer',
            }}
          >
            🔁 re-read
          </button>
        </>
      )}
    </div>
  );
}
