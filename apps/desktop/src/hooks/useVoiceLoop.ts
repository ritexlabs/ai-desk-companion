import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RuntimePhase } from '../types/runtime';

interface Props {
  phase: RuntimePhase;
  sttSupported: boolean;
  wakeWord: string;
  listenOnce: (timeout?: number, opts?: { continuous?: boolean }) => Promise<string>;
  stopListening: () => void;
  stopSpeaking: () => void;
  stopAudio: () => void;
  serverWakeWordEnabled: boolean;
  onWakeDetected: (inlineCmd?: string) => void;
  pendingTranscriptRef: React.MutableRefObject<((text: string) => void) | null>;
  ttsQueueRef: React.MutableRefObject<unknown[]>;
  autoListenRef: React.MutableRefObject<boolean>;
  setIsAutoListening: (v: boolean) => void;
}

export interface VoiceLoopResult {
  voiceEnabled: boolean;
  voiceEnabledRef: React.MutableRefObject<boolean>;
  toggleVoice: () => void;
  enableVoice: () => void;
  wakeWordPattern: RegExp;
  sleepPattern: RegExp;
  micRestartKey: number;
}

export function useVoiceLoop({
  phase,
  sttSupported,
  wakeWord,
  listenOnce,
  stopListening,
  stopSpeaking,
  stopAudio,
  serverWakeWordEnabled,
  onWakeDetected,
  pendingTranscriptRef,
  ttsQueueRef,
  autoListenRef,
  setIsAutoListening,
}: Props): VoiceLoopResult {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const voiceEnabledRef = useRef(true);
  voiceEnabledRef.current = voiceEnabled;

  const [micRestartKey, setMicRestartKey] = useState(0);

  // Wake-word pattern (standby): "Hey Robo", "Hello Robo", "Robo Wake-Up"
  const wakeWordPattern = useMemo(() => {
    const name = wakeWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n = `${name}t?`; // 't?' catches STT misrecognition "robo" → "robot"
    return new RegExp(
      `wake[\\s\\-]?up[,\\s]*${n}|${n}[,\\s]+wake[\\s\\-]?up` +
      `|hey[,\\s]+${n}|hello[,\\s]+${n}`,
      'i',
    );
  }, [wakeWord]);

  // Sleep pattern (active session): "Good Night", "Bye", "Go to sleep", etc.
  const sleepPattern = useMemo(() => {
    const name = wakeWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n = `${name}t?`;
    const sleepKw = `bye+|good[\\s\\-]?bye|good\\s?night|go\\s+(?:to\\s+)?sleep|go\\s+for\\s+sleep|see\\s+you(?:\\s+(?:again|later|soon|tomorrow))?|shut\\s?down`;
    return new RegExp(
      `(?:${sleepKw}).*\\b${n}\\b|\\b${n}\\b.*(?:${sleepKw})` +
      `|^(?:(?:bye+\\s*)+|good[\\s\\-]?bye|good\\s?night|go\\s+(?:to\\s+)?sleep|go\\s+for\\s+sleep|see\\s+you(?:\\s+(?:again|later|soon|tomorrow))?)\\s*[.!]*$`,
      'i',
    );
  }, [wakeWord]);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => !prev);
  }, []);

  // Stop all audio/listening immediately when voice is muted
  useEffect(() => {
    if (!voiceEnabled) {
      autoListenRef.current = false;
      setIsAutoListening(false);
      stopListening();
      stopSpeaking();
      stopAudio();
      ttsQueueRef.current = [];
      if (pendingTranscriptRef.current) {
        pendingTranscriptRef.current('');
        pendingTranscriptRef.current = null;
      }
    }
  }, [voiceEnabled, autoListenRef, setIsAutoListening, stopListening, stopSpeaking, stopAudio, ttsQueueRef, pendingTranscriptRef]);

  // 4-second discrete wake-word listen loop (browser STT only; server wake word takes precedence)
  useEffect(() => {
    if (!sttSupported || !voiceEnabled) return;
    if (phase !== 'standby' && phase !== 'sleep') return;
    if (serverWakeWordEnabled) return;

    let alive = true;

    (async () => {
      while (alive) {
        const text = await listenOnce(6000);
        if (!alive) break;
        if (text && wakeWordPattern.test(text)) {
          const inline = text.replace(wakeWordPattern, '').replace(/^[,\s]+/, '').trim();
          const isBootPhrase = /^wake[\s\-]?up$/i.test(inline);
          onWakeDetected(inline && !isBootPhrase ? inline : undefined);
          break;
        }
        await new Promise<void>((r) => setTimeout(r, 30));
      }
    })();

    return () => {
      alive = false;
      stopListening();
    };
    // micRestartKey forces listener restart on manual tap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sttSupported, voiceEnabled, listenOnce, stopListening, wakeWordPattern, serverWakeWordEnabled, micRestartKey]);

  const enableVoice = useCallback(() => {
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((s) => s.getTracks().forEach((t) => t.stop()))
        .catch(() => {})
        .finally(() => setMicRestartKey((k) => k + 1));
    } else {
      setMicRestartKey((k) => k + 1);
    }
  }, []);

  return {
    voiceEnabled,
    voiceEnabledRef,
    toggleVoice,
    enableVoice,
    wakeWordPattern,
    sleepPattern,
    micRestartKey,
  };
}
