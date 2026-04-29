// src/components/shared/VoiceExamMode.jsx
//
// FIXES (v2):
//  • continuousListen={true}  — when passed from EntranceExamSession, the mic
//    stays open for the entire exam session rather than closing after one result.
//  • recognition.continuous = true  always; recognition.interimResults = false
//  • onresult restarts the session automatically after a result if still active
//  • Handles both "A" / "B" / "C" / "D" spoken as single letters AND
//    ordinal words ("first", "second", "third", "fourth") and spelled-out
//    words ("ay", "bee", "see", "dee").
//  • onAnswer always receives numeric index 0-3 (caller also accepts letter now).
//  • "Read Question" starts TTS and activates mic in one tap.
//  • Mic icon pulses while listening.
//
// Props:
//   question          string   — question text to read aloud
//   options           string[] — option texts (up to 4)
//   questionId        string   — used to reset state when question changes
//   onAnswer(idx)     fn       — called with 0-3 when answer detected
//   onNext()          fn       — called after answer delay (auto-advance)
//   hasNext           bool     — if false, "Next" is not auto-called
//   continuousListen  bool     — keep mic open across questions (default true)

import { useState, useEffect, useRef, useCallback } from 'react';

const LETTER_MAP = {
  a: 0, ay: 0, 'option a': 0, 'answer a': 0, first: 0, one: 0, '1': 0,
  b: 1, be: 1, bee: 1, 'option b': 1, 'answer b': 1, second: 1, two: 1, '2': 1,
  c: 2, see: 2, sea: 2, 'option c': 2, 'answer c': 2, third: 2, three: 2, '3': 2,
  d: 3, de: 3, dee: 3, 'option d': 3, 'answer d': 3, fourth: 3, four: 3, '4': 3,
};

function matchAnswer(transcript) {
  const t = transcript.trim().toLowerCase();
  if (t in LETTER_MAP) return LETTER_MAP[t];
  // try extracting last word / first word
  const words = t.split(/\s+/);
  for (const w of [words[0], words[words.length - 1]]) {
    if (w && w in LETTER_MAP) return LETTER_MAP[w];
  }
  return null;
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export default function VoiceExamMode({
  question,
  options = [],
  questionId,
  onAnswer,
  onNext,
  hasNext = true,
  continuousListen = true,
}) {
  const [active,    setActive]    = useState(false);   // TTS+mic session running
  const [listening, setListening] = useState(false);   // mic currently open
  const [lastHeard, setLastHeard] = useState('');
  const [status,    setStatus]    = useState('');      // status label under mic

  const recognitionRef = useRef(null);
  const activeRef      = useRef(false);  // mirror of `active` for callbacks
  const answeredRef    = useRef(false);  // prevent double-fire per question
  const questionIdRef  = useRef(questionId);

  // Keep activeRef in sync
  useEffect(() => { activeRef.current = active; }, [active]);

  // Reset answered flag when question changes
  useEffect(() => {
    answeredRef.current = false;
    questionIdRef.current = questionId;
    setLastHeard('');
    setStatus('');
    // If continuous mode: don't stop the mic, just reset the answer guard
    // Re-read question automatically
    if (activeRef.current) {
      speakQuestion();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMic();
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TTS helpers ─────────────────────────────────────────────────────────────
  const speak = useCallback((text, onEnd) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = 0.92;
    utt.pitch = 1;
    utt.lang  = 'en-US';
    if (onEnd) utt.onend = onEnd;
    window.speechSynthesis.speak(utt);
  }, []);

  const speakQuestion = useCallback(() => {
    if (!question) return;
    const optionText = options
      .map((o, i) => `${['A', 'B', 'C', 'D'][i]}. ${o}`)
      .join('. ');
    const full = `${question}. ${optionText}`;
    setStatus('Reading…');
    speak(full, () => {
      if (activeRef.current) {
        setStatus('Listening — say A, B, C or D');
        startMic();
      }
    });
  }, [question, options, speak]);

  // ── Mic helpers ─────────────────────────────────────────────────────────────
  const startMic = useCallback(() => {
    if (!SpeechRecognition) {
      setStatus('Speech recognition not supported in this browser.');
      return;
    }
    stopMic(); // clear any old instance first

    const rec = new SpeechRecognition();
    rec.lang              = 'en-US';
    rec.continuous        = true;   // keep session open
    rec.interimResults    = false;
    rec.maxAlternatives   = 3;

    rec.onstart = () => setListening(true);
    rec.onend   = () => {
      setListening(false);
      // Auto-restart if still active and continuous mode
      if (activeRef.current && continuousListen && !answeredRef.current) {
        setTimeout(() => {
          if (activeRef.current && !answeredRef.current) startMic();
        }, 300);
      }
    };
    rec.onerror = (e) => {
      console.warn('VoiceExamMode SpeechRecognition error:', e.error);
      // 'no-speech' is common — just restart
      if (e.error === 'no-speech' && activeRef.current && continuousListen) {
        setTimeout(() => { if (activeRef.current) startMic(); }, 500);
      } else {
        setStatus(`Mic error: ${e.error}. Tap 🎤 to retry.`);
        setListening(false);
      }
    };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        setLastHeard(transcript);
        const idx = matchAnswer(transcript);
        if (idx !== null && !answeredRef.current) {
          answeredRef.current = true;
          setStatus(`Got: ${['A','B','C','D'][idx]} ✓`);
          speak(`${['A','B','C','D'][idx]}.`, () => {
            onAnswer(idx);
            if (hasNext) {
              setTimeout(() => {
                if (activeRef.current) onNext?.();
              }, 600);
            }
          });
          return;
        }
      }
    };

    recognitionRef.current = rec;
    try { rec.start(); } catch (e) { console.warn('rec.start error:', e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuousListen, onAnswer, onNext, hasNext, speak]);

  const stopMic = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch (_) {}
    recognitionRef.current = null;
    setListening(false);
  }, []);

  // ── Start / Stop session ─────────────────────────────────────────────────────
  const handleStart = () => {
    setActive(true);
    activeRef.current = true;
    answeredRef.current = false;
    speakQuestion();
  };

  const handleStop = () => {
    setActive(false);
    activeRef.current = false;
    stopMic();
    window.speechSynthesis.cancel();
    setStatus('');
    setLastHeard('');
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!SpeechRecognition) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Voice mode not supported in this browser.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {!active ? (
        <button
          onClick={handleStart}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 20,
            background: 'rgba(13,148,136,0.1)', border: '1.5px solid rgba(13,148,136,0.4)',
            color: 'var(--teal)', fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
            cursor: 'pointer',
          }}
        >
          🔊 Read Question
        </button>
      ) : (
        <>
          {/* Mic indicator */}
          <button
            onClick={handleStop}
            title="Stop voice mode"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer', fontSize: 18,
              background: listening
                ? 'rgba(239,68,68,0.15)'
                : 'rgba(13,148,136,0.12)',
              color: listening ? '#EF4444' : 'var(--teal)',
              // pulse animation while listening
              animation: listening ? 'vem-pulse 1s ease-in-out infinite' : 'none',
              transition: 'background 0.2s',
            }}
          >
            {listening ? '🎤' : '⏸'}
          </button>

          {/* Status / last heard */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {status && (
              <div style={{ fontSize: 12, color: listening ? '#EF4444' : 'var(--teal)', fontWeight: 600, lineHeight: 1.4 }}>
                {status}
              </div>
            )}
            {lastHeard && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Heard: "{lastHeard}"
              </div>
            )}
          </div>

          {/* Re-read button */}
          <button
            onClick={() => { answeredRef.current = false; speakQuestion(); }}
            style={{
              padding: '5px 10px', borderRadius: 16,
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            🔁 Re-read
          </button>
        </>
      )}

      {/* Pulse keyframes */}
      <style>{`
        @keyframes vem-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50%       { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
