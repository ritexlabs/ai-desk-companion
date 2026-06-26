import { Bot, Loader2, Shield, Zap } from 'lucide-react';
import type { LLMConfig, LLMProvider } from '../../hooks/useLLMConfig';
import { PROVIDER_LABELS, PROVIDER_MODELS } from '../../hooks/useLLMConfig';
import { SecurityNotice, SectionLabel, StatusBadge, TokenField } from './shared';

interface Props {
  config: LLMConfig;
  onUpdate: (p: Partial<Omit<LLMConfig, 'status' | 'info'>>) => void;
  onVerify: () => void;
  onDisconnect: () => void;
}

export function AISettings({ config, onUpdate, onVerify, onDisconnect }: Props) {
  const providers = Object.keys(PROVIDER_LABELS) as LLMProvider[];
  const models     = PROVIDER_MODELS[config.provider] ?? [];
  const isOllama   = config.provider === 'ollama';
  const isConnected = config.status === 'connected';

  return (
    <div className="space-y-5">
      <SecurityNotice />

      <section>
        <SectionLabel>AI Provider</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => onUpdate({ provider: p })}
              className={`h-12 rounded-xl border text-xs font-medium transition-all text-left px-3 ${
                config.provider === p
                  ? 'border-violet-400/50 bg-violet-400/15 text-violet-200'
                  : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
              }`}
            >
              <div className="text-[10px] text-slate-500 mb-0.5">
                {p === 'anthropic' ? 'Cloud' : p === 'openai' ? 'Cloud' : p === 'gemini' ? 'Cloud' : '🏠 Local'}
              </div>
              {PROVIDER_LABELS[p].replace(' — ', '\n').split('\n')[0]}
              <span className="text-slate-500"> — </span>
              {PROVIDER_LABELS[p].replace(' — ', '\n').split('\n')[1]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Model</SectionLabel>
        <div className="relative">
          <select
            value={config.model}
            onChange={(e) => onUpdate({ model: e.target.value })}
            className="w-full h-10 rounded-xl border border-white/10 bg-black/35 pl-4 pr-8 text-sm text-white appearance-none cursor-pointer outline-none focus:border-violet-400/35 transition"
          >
            {models.map((m) => (
              <option key={m} value={m} className="bg-slate-900">
                {m}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">▼</div>
        </div>
        {config.provider === 'anthropic' && config.model === 'claude-sonnet-4-6' && (
          <p className="mt-1 text-[10px] text-violet-400/70">★ Recommended — same model powering this app</p>
        )}
      </section>

      {!isOllama && (
        <section>
          <TokenField
            label={
              config.provider === 'gemini'
                ? 'Gemini API Key (Google AI Studio)'
                : config.provider === 'openai'
                ? 'OpenAI API Key'
                : 'Anthropic API Key'
            }
            value={config.apiKey}
            placeholder={
              config.provider === 'anthropic' ? 'sk-ant-…' :
              config.provider === 'openai'    ? 'sk-…' :
              'AIza…'
            }
            onChange={(v) => onUpdate({ apiKey: v })}
          />
        </section>
      )}

      {(isOllama || config.provider === 'openai') && (
        <section>
          <SectionLabel>
            {isOllama ? 'Ollama Base URL' : 'Custom Base URL'}{' '}
            <span className="text-slate-600 normal-case">(optional)</span>
          </SectionLabel>
          <input
            value={config.baseUrl}
            onChange={(e) => onUpdate({ baseUrl: e.target.value })}
            placeholder={isOllama ? 'http://localhost:11434' : 'https://api.openai.com'}
            className="w-full h-9 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition font-mono text-xs"
          />
        </section>
      )}

      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={config.status} info={config.info} />
        {isConnected && (
          <button
            onClick={onDisconnect}
            className="text-[11px] text-red-400/70 hover:text-red-400 transition"
          >
            Disconnect
          </button>
        )}
      </div>

      {isConnected ? (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 flex items-center gap-2.5">
          <Zap className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <div className="text-sm text-emerald-300">
            Connected — Robo will use <strong>{config.model}</strong> for greetings and answers.
          </div>
        </div>
      ) : (
        <button
          onClick={onVerify}
          disabled={(!config.apiKey && !isOllama) || config.status === 'verifying'}
          className="w-full h-10 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition flex items-center justify-center gap-2"
        >
          {config.status === 'verifying'
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing connection…</>
            : <><Bot className="h-4 w-4" /> Connect & Verify</>}
        </button>
      )}

      <div className="rounded-xl border border-white/6 bg-white/3 p-3 space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
        <div>
          {config.provider === 'anthropic' && (
            <>Get an API key at <span className="text-slate-400">console.anthropic.com</span>. Keys start with <span className="font-mono text-slate-400">sk-ant-</span>.</>
          )}
          {config.provider === 'openai' && (
            <>Get an API key at <span className="text-slate-400">platform.openai.com/api-keys</span>.</>
          )}
          {config.provider === 'gemini' && (
            <>Get a free key at <span className="text-slate-400">aistudio.google.com</span>.</>
          )}
          {config.provider === 'ollama' && (
            <>Install Ollama from <span className="text-slate-400">ollama.com</span>, then run <span className="font-mono text-slate-400">ollama pull {config.model}</span>.</>
          )}
        </div>
        <div className="flex items-start gap-1.5">
          <Shield className="h-3 w-3 mt-0.5 text-emerald-500/60 flex-shrink-0" />
          <span>Key saved in localStorage only — never in source files or git.</span>
        </div>
      </div>
    </div>
  );
}
