/**
 * LLM provider adapters.
 *
 * SECURITY: API keys come exclusively from the caller (via useLLMConfig).
 * Nothing is hardcoded. Keys never leave the browser except to the specific
 * provider endpoint the user explicitly configured.
 */

import type { LLMConfig, LLMProvider } from '../hooks/useLLMConfig';

export interface LLMCallOptions {
  maxTokens?: number;
  temperature?: number;
}

/* ── per-provider call implementations ──────────────────────────── */

async function callAnthropic(
  cfg: LLMConfig,
  prompt: string,
  system: string,
  opts: LLMCallOptions,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      // Required header to allow direct browser access to the Anthropic API
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model || 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens ?? 150,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (err as Record<string, Record<string, string>>)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0].text.trim();
}

async function callOpenAI(
  cfg: LLMConfig,
  prompt: string,
  system: string,
  opts: LLMCallOptions,
): Promise<string> {
  const base = cfg.baseUrl.replace(/\/$/, '') || 'https://api.openai.com';
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model || 'gpt-4o-mini',
      max_tokens: opts.maxTokens ?? 150,
      temperature: opts.temperature ?? 0.8,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (err as Record<string, Record<string, string>>)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content.trim();
}

async function callGemini(
  cfg: LLMConfig,
  prompt: string,
  system: string,
  opts: LLMCallOptions,
): Promise<string> {
  const model = cfg.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;
  const combined = system ? `${system}\n\n${prompt}` : prompt;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: combined }] }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 150,
        temperature: opts.temperature ?? 0.8,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = String((err as Record<string, Record<string, string>>)?.error?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0].content.parts[0].text.trim();
}

async function callOllama(
  cfg: LLMConfig,
  prompt: string,
  system: string,
  opts: LLMCallOptions,
): Promise<string> {
  const base = cfg.baseUrl.replace(/\/$/, '') || 'http://localhost:11434';
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model || 'llama3',
      stream: false,
      options: { num_predict: opts.maxTokens ?? 150, temperature: opts.temperature ?? 0.8 },
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status} — is it running?`);
  const data = await res.json() as { message: { content: string } };
  return data.message.content.trim();
}

/* ── dispatcher ─────────────────────────────────────────────────── */

const ADAPTERS: Record<LLMProvider, typeof callAnthropic> = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  gemini: callGemini,
  ollama: callOllama,
};

export async function callLLM(
  config: LLMConfig,
  prompt: string,
  system = '',
  maxTokens?: number,
  temperature?: number,
): Promise<string> {
  const fn = ADAPTERS[config.provider];
  if (!fn) throw new Error(`Unknown provider: ${config.provider}`);
  return fn(config, prompt, system, { maxTokens, temperature });
}

/** Wraps callLLM with a timeout so boot sequences never stall. */
export async function callLLMSafe(
  config: LLMConfig,
  prompt: string,
  system = '',
  maxTokens = 80,
  timeoutMs = 6000,
): Promise<string | null> {
  try {
    const race = await Promise.race([
      callLLM(config, prompt, system, maxTokens, 0.85),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return race;
  } catch {
    return null;
  }
}
