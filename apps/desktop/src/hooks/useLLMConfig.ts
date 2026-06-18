/**
 * LLM provider configuration.
 *
 * SECURITY CONTRACT
 * -----------------
 * API keys are stored exclusively in the browser's localStorage under the key
 * `robo-llm-config`. They are NEVER written to any source file, .env file, or
 * sent anywhere except the specific LLM API endpoint the user configures.
 * localStorage is sandboxed to this origin and cannot be committed to version
 * control.
 */

import { useCallback, useState } from 'react';

export type LLMProvider = 'anthropic' | 'openai' | 'gemini' | 'ollama';
export type LLMStatus = 'idle' | 'verifying' | 'connected' | 'error';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;  // custom endpoint for Ollama or OpenAI-compatible APIs
  status: LLMStatus;
  info: string;
}

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: 'Anthropic — Claude',
  openai: 'OpenAI — GPT',
  gemini: 'Google — Gemini',
  ollama: 'Ollama — Local',
};

export const PROVIDER_MODELS: Record<LLMProvider, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-8'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  gemini:    ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  ollama:    ['llama3', 'llama3.1', 'mistral', 'codellama', 'gemma2', 'phi3', 'qwen2.5'],
};

const DEFAULT: LLMConfig = {
  provider: 'openai',
  apiKey:   '',
  model:    'gpt-4o-mini',
  baseUrl:  '',
  status:   'idle',
  info:     '',
};

const STORAGE_KEY = 'robo-llm-config';

function toPersist(cfg: LLMConfig): LLMConfig {
  return { ...cfg, status: 'idle', info: '' };
}

function load(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: Partial<LLMConfig> = raw ? JSON.parse(raw) : {};
    const cfg: LLMConfig = { ...DEFAULT, ...parsed };

    // If AI tab has no key but the Providers tab has an OpenAI key,
    // and provider is openai (default), reuse that key automatically.
    if (!cfg.apiKey && cfg.provider === 'openai') {
      try {
        const providers = JSON.parse(localStorage.getItem('robo-voice-providers') ?? '{}') as Record<string, string>;
        if (providers.openaiApiKey) {
          cfg.apiKey = providers.openaiApiKey;
        }
      } catch {}
    }

    const hasCredentials = cfg.provider === 'ollama' ? !!cfg.model : !!cfg.apiKey;
    if (hasCredentials) cfg.status = 'connected';
    return cfg;
  } catch {
    return DEFAULT;
  }
}

function persist(cfg: LLMConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist(cfg))); } catch {}
}

export function useLLMConfig() {
  const [config, setConfig] = useState<LLMConfig>(load);

  const update = useCallback((partial: Partial<Omit<LLMConfig, 'status' | 'info'>>) => {
    setConfig((prev) => {
      const next: LLMConfig = { ...prev, ...partial };
      // Changing provider: reset to first model and clear credentials
      if (partial.provider && partial.provider !== prev.provider) {
        next.model  = PROVIDER_MODELS[partial.provider][0];
        next.apiKey = '';
        next.status = 'idle';
        next.info   = '';
      }
      persist(next);
      return next;
    });
  }, []);

  const verify = useCallback(async () => {
    if (config.provider !== 'ollama' && !config.apiKey) return;
    setConfig((prev) => ({ ...prev, status: 'verifying', info: '' }));
    try {
      const { callLLM } = await import('../services/llm');
      const reply = await callLLM(config, 'Reply with just the word: ready', '', 10, 0);
      if (reply.length > 0) {
        const info = `${config.model} · ${PROVIDER_LABELS[config.provider]}`;
        setConfig((prev) => ({ ...prev, status: 'connected', info }));
        persist({ ...config, status: 'idle', info: '' });
      } else {
        throw new Error('Empty response from model');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      setConfig((prev) => ({ ...prev, status: 'error', info: msg }));
    }
  }, [config]);

  const disconnect = useCallback(() => {
    setConfig((prev) => {
      const next: LLMConfig = { ...prev, apiKey: '', status: 'idle', info: '' };
      persist(next);
      return next;
    });
  }, []);

  return { config, update, verify, disconnect };
}
