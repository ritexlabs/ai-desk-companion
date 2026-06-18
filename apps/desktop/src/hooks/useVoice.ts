import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceConfig } from './useVoiceConfig';

export type SpeechState = 'idle' | 'speaking' | 'listening';

function getSpeechRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/** Pick the most natural/soothing English voice for the given config */
function pickVoice(config: VoiceConfig): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const all = window.speechSynthesis.getVoices();
  const en = all.filter((v) => v.lang.startsWith('en'));
  if (!en.length) return null;

  // Exact name match when user has chosen one
  if (config.voiceName) {
    const exact = en.find((v) => v.name === config.voiceName);
    if (exact) return exact;
  }

  // Preference lists — ordered best → fallback, soothing/neural voices first
  const femalePref = [
    /samantha.*enhanced/i,
    /karen.*enhanced/i,
    /moira.*enhanced/i,
    /google uk english female/i,
    /microsoft aria/i,
    /microsoft jenny/i,
    /ava.*enhanced/i,
    /allison.*enhanced/i,
    /samantha/i,
    /karen/i,
    /moira/i,
    /victoria/i,
    /fiona/i,
    /google us english/i,
  ];
  const malePref = [
    /daniel.*enhanced/i,
    /tom.*enhanced/i,
    /google uk english male/i,
    /microsoft guy/i,
    /microsoft eric/i,
    /aaron.*enhanced/i,
    /alex.*enhanced/i,
    /daniel/i,
    /tom/i,
    /alex/i,
  ];

  const prefs = config.gender === 'female' ? femalePref : malePref;
  for (const pattern of prefs) {
    const match = en.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  // Last resort: first English voice
  return en[0];
}

/** Map speed setting → speech rate */
function rateFor(speed: VoiceConfig['speed']): number {
  return speed === 'slow' ? 0.78 : speed === 'fast' ? 1.02 : 0.87;
}

/** Map gender → pitch (keeps voices sounding natural) */
function pitchFor(gender: VoiceConfig['gender']): number {
  return gender === 'female' ? 1.05 : 0.92;
}

/** Per-agent pitch and rate offsets applied on top of the base voice config.
 *  Gives each agent a subtly distinct sound when using browser TTS. */
const AGENT_VOICE_OFFSETS: Record<string, { pitch: number; rate: number }> = {
  system:   { pitch: -0.15, rate: -0.04 }, // lower, deliberate — technical readouts
  weather:  { pitch: +0.10, rate:  0.00 }, // brighter, conversational
  calendar: { pitch: +0.05, rate: +0.04 }, // organised, efficient
  email:    { pitch:  0.00, rate:  0.00 }, // neutral professional
  github:   { pitch: -0.10, rate: +0.04 }, // lower, tech-focused
  stock:    { pitch: -0.12, rate: -0.02 }, // authoritative, measured
  news:     { pitch: +0.05, rate: +0.07 }, // clear newsreader cadence
  general:  { pitch:  0.00, rate:  0.00 }, // default
};

export function useVoice(config?: VoiceConfig) {
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
  const [voiceListenerActive, setVoiceListenerActive] = useState(false);
  const [micEverStarted, setMicEverStarted] = useState(false);
  const [lastHeardText, setLastHeardText] = useState('');
  const recRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    // Pre-warm the browser TTS engine so the first real utterance doesn't pay the cold-start penalty.
    // Chrome's TTS engine is lazy-initialised; a cancel() on an idle engine primes the pipeline.
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return () => { mountedRef.current = false; };
  }, []);

  const set = useCallback((s: SpeechState) => {
    if (mountedRef.current) setSpeechState(s);
  }, []);

  const speak = useCallback((text: string, agentId?: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }

      // Always cancel to reset Chrome's TTS pipeline before every utterance.
      //
      // Chrome bug: without cancel(), the first utterance from an idle engine
      // (nothing previously spoken) fails silently after the very first word.
      // Subsequent utterances work because they always had a previous active
      // utterance to cancel — the cancel acted as an implicit engine reset.
      //
      // Delay is adaptive:
      //   • 50 ms when interrupting active speech — engine stays warm, needs
      //     just a brief gap to flush the cancelled utterance.
      //   • 250 ms from idle — engine is cold and needs longer to initialise
      //     after the reset before it can reliably play a new utterance.
      const wasActive = window.speechSynthesis.speaking || window.speechSynthesis.pending;
      window.speechSynthesis.cancel();
      // Cold-start is 150 ms after pre-warming on mount (was 250 ms without it).
      const delay = wasActive ? 30 : 150;

      const offsets = (agentId ? AGENT_VOICE_OFFSETS[agentId] : undefined) ?? { pitch: 0, rate: 0 };
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate   = Math.max(0.5, Math.min(2, rateFor(config?.speed ?? 'normal')  + offsets.rate));
      utter.pitch  = Math.max(0.5, Math.min(2, pitchFor(config?.gender ?? 'female') + offsets.pitch));
      utter.volume = 1;

      // Apply the best available voice at call time.
      // Do NOT set onvoiceschanged here — changing utter.voice after speak()
      // has been queued can interrupt the utterance in Chrome.
      const v = pickVoice(config ?? { gender: 'female', speed: 'normal', voiceName: '' });
      if (v) utter.voice = v;

      utter.onstart = () => set('speaking');
      utter.onend   = () => { set('idle'); resolve(); };
      utter.onerror = () => { set('idle'); resolve(); };

      set('speaking');
      setTimeout(() => window.speechSynthesis.speak(utter), delay);
    });
  }, [config, set]);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();  // intentional hard stop — always cancel here
    }
    set('idle');
  }, [set]);

  const listenOnce = useCallback((timeoutMs = 8000): Promise<string> => {
    return new Promise((resolve) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) { resolve(''); return; }

      const rec = new Ctor();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.maxAlternatives = 1;

      let settled = false;
      const done = (t: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        set('idle');
        resolve(t);
      };

      const timer = setTimeout(() => { try { rec.stop(); } catch {} done(''); }, timeoutMs);

      rec.onstart = () => { set('listening'); if (mountedRef.current) setMicEverStarted(true); };
      rec.onresult = (e: any) => {
        const text = e.results[0][0].transcript.trim();
        if (mountedRef.current) setLastHeardText(text);
        done(text);
      };
      rec.onend = () => done('');
      rec.onerror = () => done('');

      recRef.current = rec;
      set('listening');
      try { rec.start(); } catch { done(''); }
    });
  }, [set]);

  const startContinuousListening = useCallback(
    (onResult: (text: string, isFinal: boolean) => void): (() => void) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return () => {};

      let alive = true;
      let rec: any = null;
      let permissionDenied = false;

      const launch = () => {
        if (!alive || !mountedRef.current || permissionDenied) return;
        rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        rec.onstart = () => {
          if (mountedRef.current) {
            setSpeechState('listening');
            setVoiceListenerActive(true);
            setMicEverStarted(true);
          }
        };
        rec.onresult = (e: any) => {
          const r = e.results[e.results.length - 1];
          const text = r[0].transcript.trim();
          if (mountedRef.current) setLastHeardText(text);
          onResult(text, r.isFinal);
        };
        rec.onend = () => {
          if (mountedRef.current) setVoiceListenerActive(false);
          if (alive && !permissionDenied && mountedRef.current) setTimeout(launch, 400);
          else if (mountedRef.current) setSpeechState('idle');
        };
        rec.onerror = (e: any) => {
          if (e.error === 'not-allowed') {
            permissionDenied = true; // stop restart loop if mic is blocked
          } else if (!['no-speech', 'aborted'].includes(e.error)) {
            console.warn('[voice/continuous]', e.error);
          }
        };
        recRef.current = rec;
        try { rec.start(); } catch {}
      };

      launch();

      return () => {
        alive = false;
        try { rec?.stop(); } catch {}
        if (mountedRef.current) {
          setSpeechState('idle');
          setVoiceListenerActive(false);
        }
      };
    },
    []
  );

  const stopListening = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    set('idle');
  }, [set]);

  return {
    speechState,
    speak,
    stopSpeaking,
    listenOnce,
    startContinuousListening,
    stopListening,
    sttSupported: !!getSpeechRecognitionCtor(),
    ttsSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
    voiceListenerActive,
    micEverStarted,
    lastHeardText,
  };
}
