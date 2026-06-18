/**
 * Voice provider configuration — TTS and STT backend providers.
 *
 * SECURITY CONTRACT
 * -----------------
 * API keys are stored exclusively in the browser's localStorage under the key
 * `robo-voice-providers`. They are NEVER written to any source file, .env file,
 * or sent anywhere except:
 *   - The specific TTS/STT API endpoint chosen by the user (for browser-side tests)
 *   - The local orchestrator WebSocket at ws://localhost:8787 (trusted local process)
 * localStorage is sandboxed to this origin and cannot be committed to version control.
 */

import { useCallback, useRef, useState } from 'react';

export type TTSProvider = 'browser' | 'openai' | 'elevenlabs';
export type STTProvider = 'browser' | 'openai';
export type ProviderStatus = 'idle' | 'verifying' | 'connected' | 'error';

export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TTSVoice = (typeof TTS_VOICES)[number];

export const TTS_MODELS = ['tts-1', 'tts-1-hd'] as const;
export type TTSModel = (typeof TTS_MODELS)[number];

export interface VoiceProviderConfig {
  ttsProvider: TTSProvider;
  sttProvider: STTProvider;
  openaiApiKey: string;
  openaiTtsVoice: TTSVoice;
  openaiTtsModel: TTSModel;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  status: ProviderStatus;
  info: string;
}

const DEFAULT: VoiceProviderConfig = {
  ttsProvider:       'browser',
  sttProvider:       'browser',
  openaiApiKey:      '',
  openaiTtsVoice:    'nova',
  openaiTtsModel:    'tts-1',
  elevenLabsApiKey:  '',
  elevenLabsVoiceId: 'Rachel',
  status:            'idle',
  info:              '',
};

const STORAGE_KEY = 'robo-voice-providers';

function toPersist(cfg: VoiceProviderConfig): VoiceProviderConfig {
  return { ...cfg, status: 'idle', info: '' };
}

function load(): VoiceProviderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<VoiceProviderConfig>;
    const cfg: VoiceProviderConfig = { ...DEFAULT, ...parsed };
    const hasOpenAI     = !!cfg.openaiApiKey;
    const hasElevenLabs = !!cfg.elevenLabsApiKey;
    const providerKey   = cfg.ttsProvider === 'openai' ? hasOpenAI : cfg.ttsProvider === 'elevenlabs' ? hasElevenLabs : true;
    if (providerKey && (cfg.ttsProvider !== 'browser' || cfg.sttProvider !== 'browser')) {
      cfg.status = 'connected';
    }
    return cfg;
  } catch {
    return DEFAULT;
  }
}

function save(cfg: VoiceProviderConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist(cfg))); } catch {}
}

export function useVoiceProviderConfig() {
  const [config, setConfig] = useState<VoiceProviderConfig>(load);
  const configRef = useRef(config);
  configRef.current = config;

  const update = useCallback((partial: Partial<Omit<VoiceProviderConfig, 'status' | 'info'>>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial, status: 'idle' as ProviderStatus, info: '' };
      save(next);
      return next;
    });
  }, []);

  const testTTS = useCallback(async () => {
    const cfg = configRef.current;
    setConfig((prev) => ({ ...prev, status: 'verifying', info: '' }));

    try {
      if (cfg.ttsProvider === 'openai') {
        if (!cfg.openaiApiKey) throw new Error('OpenAI API key is required');
        const r = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: cfg.openaiTtsModel,
            voice: cfg.openaiTtsVoice,
            input: 'Voice provider verified. I am ready.',
            response_format: 'mp3',
          }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(err?.error?.message ?? `HTTP ${r.status}`);
        }
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
        setConfig((prev) => ({
          ...prev, status: 'connected',
          info: `OpenAI ${cfg.openaiTtsModel} · ${cfg.openaiTtsVoice}`,
        }));
        save({ ...cfg, status: 'idle', info: '' });

      } else if (cfg.ttsProvider === 'elevenlabs') {
        if (!cfg.elevenLabsApiKey) throw new Error('ElevenLabs API key is required');
        const r = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.elevenLabsVoiceId)}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key':   cfg.elevenLabsApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: 'Voice provider verified. I am ready.',
              model_id: 'eleven_monolingual_v1',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
          },
        );
        if (!r.ok) throw new Error(`ElevenLabs API error: HTTP ${r.status}`);
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
        setConfig((prev) => ({
          ...prev, status: 'connected',
          info: `ElevenLabs · voice ${cfg.elevenLabsVoiceId}`,
        }));
        save({ ...cfg, status: 'idle', info: '' });

      } else {
        throw new Error('Select an OpenAI or ElevenLabs TTS provider to test');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Test failed';
      setConfig((prev) => ({ ...prev, status: 'error', info: msg }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setConfig((prev) => {
      const next: VoiceProviderConfig = {
        ...prev,
        ttsProvider: 'browser',
        sttProvider: 'browser',
        openaiApiKey: '',
        elevenLabsApiKey: '',
        status: 'idle',
        info: '',
      };
      save(next);
      return next;
    });
  }, []);

  return { config, update, testTTS, disconnect };
}
