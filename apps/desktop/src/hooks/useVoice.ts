import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceConfig } from './useVoiceConfig';
import type { AgentVoiceMap } from './useAgentVoiceConfig';

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
  return speed === 'slow' ? 0.92 : speed === 'fast' ? 1.18 : 1.02;
}

/** Map gender → pitch (keeps voices sounding natural) */
function pitchFor(gender: VoiceConfig['gender']): number {
  return gender === 'female' ? 1.05 : 0.92;
}

export function useVoice(config?: VoiceConfig, agentVoices?: AgentVoiceMap) {
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

      // Per-agent voice settings override global config when available.
      const agentSetting = agentId ? agentVoices?.[agentId] : undefined;
      const effectiveConfig: VoiceConfig = agentSetting
        ? { gender: agentSetting.gender, speed: agentSetting.speed, voiceName: agentSetting.voiceName }
        : (config ?? { gender: 'female', speed: 'normal', voiceName: '' });

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate   = Math.max(0.5, Math.min(2, rateFor(effectiveConfig.speed)));
      utter.pitch  = Math.max(0.5, Math.min(2, pitchFor(effectiveConfig.gender)));
      utter.volume = 1;

      const v = pickVoice(effectiveConfig);
      if (v) utter.voice = v;

      utter.onstart = () => set('speaking');
      utter.onend   = () => { set('idle'); resolve(); };
      utter.onerror = () => { set('idle'); resolve(); };

      set('speaking');
      setTimeout(() => window.speechSynthesis.speak(utter), delay);
    });
  }, [config, agentVoices, set]);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();  // intentional hard stop — always cancel here
    }
    set('idle');
  }, [set]);

  const listenOnce = useCallback((timeoutMs = 20000, opts?: { continuous?: boolean }): Promise<string> => {
    return new Promise((resolve) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) { resolve(''); return; }

      const rec = new Ctor();
      // continuous=false is more reliable for short phrases (wake-word loop).
      // Pass { continuous: true } when capturing long commands so the browser
      // doesn't cut the utterance at the first natural pause.
      rec.continuous     = opts?.continuous ?? false;
      rec.interimResults = true;   // needed to reset the silence timer on every word
      rec.lang           = 'en-US';
      rec.maxAlternatives = 1;

      let settled         = false;
      let transcript      = '';
      let hasSpeech       = false;
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;
      let resolveAfterEnd: (() => void) | null = null;

      const done = (text: string) => {
        if (settled) return;
        settled = true;
        if (silenceTimer) clearTimeout(silenceTimer);
        clearTimeout(hardTimer);
        clearTimeout(noSpeechTimer);
        const finalText = text.trim();
        // Defer resolve until onend fires — ensures the browser fully releases
        // the audio pipeline before the next rec.start() in the auto-listen loop.
        resolveAfterEnd = () => { set('idle'); resolve(finalText); };
        try { rec.stop(); } catch {
          // stop() threw — onend won't fire; resolve immediately.
          const fn = resolveAfterEnd;
          resolveAfterEnd = null;
          fn?.();
          return;
        }
        // Safety net: with continuous=false, onend fires naturally (stop() is a no-op
        // and won't trigger a second onend). If onend already ran and called done()
        // from within itself, resolveAfterEnd won't be cleared by a future onend —
        // so we flush it on the next tick.
        setTimeout(() => {
          if (resolveAfterEnd) {
            const fn = resolveAfterEnd;
            resolveAfterEnd = null;
            fn();
          }
        }, 0);
      };

      // Absolute ceiling — never hold the mic longer than timeoutMs
      const hardTimer = setTimeout(() => done(transcript), timeoutMs);

      // If the user never speaks at all, give up after 3.5 s so the caller's
      // loop can cycle without hanging (standby wake-word loop, auto-listen loop).
      const noSpeechTimer = setTimeout(() => { if (!hasSpeech) done(''); }, 3500);

      rec.onstart = () => {
        set('listening');
        if (mountedRef.current) setMicEverStarted(true);
      };

      rec.onresult = (e: any) => {
        hasSpeech = true;

        // Accumulate only final segments so we don't double-count interim words.
        let newFinal = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) newFinal += e.results[i][0].transcript;
        }
        if (newFinal) {
          transcript = (transcript + ' ' + newFinal).trim();
          if (mountedRef.current) setLastHeardText(transcript);
        }

        // Any speech activity (interim OR final) resets the silence clock.
        // 1.5 s of silence after the last word = natural end of utterance.
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => { if (transcript) done(transcript); }, 1500);
      };

      rec.onend = () => {
        if (resolveAfterEnd) {
          const fn = resolveAfterEnd;
          resolveAfterEnd = null;
          fn();
        } else if (!settled) {
          done(transcript);
        }
      };
      rec.onerror = (e: any) => {
        if (!['no-speech', 'aborted'].includes(e?.error ?? ''))
          console.warn('[voice/listenOnce]', e?.error);
        done(transcript);
      };

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
