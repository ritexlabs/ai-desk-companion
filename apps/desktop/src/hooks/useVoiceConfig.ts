import { useCallback, useEffect, useState } from 'react';

export type VoiceGender = 'male' | 'female';
export type VoiceSpeed = 'slow' | 'normal' | 'fast';

export interface VoiceConfig {
  gender: VoiceGender;
  speed: VoiceSpeed;
  voiceName: string;
}

const DEFAULT: VoiceConfig = { gender: 'female', speed: 'normal', voiceName: '' };
const STORAGE_KEY = 'robo-voice-config';

export function useVoiceConfig() {
  const [config, setConfig] = useState<VoiceConfig>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    } catch {
      return DEFAULT;
    }
  });

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const load = () => {
      if (!('speechSynthesis' in window)) return;
      const all = window.speechSynthesis.getVoices();
      setVoices(all.filter((v) => v.lang.startsWith('en')));
    };
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);

  const update = useCallback((partial: Partial<VoiceConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { config, update, voices };
}
