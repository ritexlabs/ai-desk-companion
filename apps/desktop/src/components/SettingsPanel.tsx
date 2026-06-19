import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Github,
  Loader2,
  Lock,
  Play,
  Radio,
  Settings,
  Shield,
  User,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import type { AppConfig } from '../hooks/useAppConfig';
import type { VoiceConfig, VoiceGender, VoiceSpeed } from '../hooks/useVoiceConfig';
import type { AgentConfig, ConnectionStatus } from '../hooks/useAgentConfig';
import type { LLMConfig, LLMProvider } from '../hooks/useLLMConfig';
import { PROVIDER_LABELS, PROVIDER_MODELS } from '../hooks/useLLMConfig';
import type { VoiceProviderConfig, TTSProvider, STTProvider } from '../hooks/useVoiceProviderConfig';
import { TTS_VOICES, TTS_MODELS } from '../hooks/useVoiceProviderConfig';

/* ─── types ────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
  appConfig: AppConfig;
  onAppUpdate: (p: Partial<AppConfig>) => void;
  voiceConfig: VoiceConfig;
  onVoiceUpdate: (p: Partial<VoiceConfig>) => void;
  voices: SpeechSynthesisVoice[];
  onTestVoice: (text: string) => void;
  agentConfig: AgentConfig;
  onAgentPatch: <K extends keyof AgentConfig>(agent: K, p: Partial<AgentConfig[K]>) => void;
  onVerifyWeather: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onVerifyGitHub: () => void;
  onDisconnectGitHub: () => void;
  onVerifyNews: () => void;
  onVerifySmartHome: () => void;
  llmConfig: LLMConfig;
  onLLMUpdate: (p: Partial<Omit<LLMConfig, 'status' | 'info'>>) => void;
  onVerifyLLM: () => void;
  onDisconnectLLM: () => void;
  voiceProviderConfig: VoiceProviderConfig;
  onVoiceProviderUpdate: (p: Partial<Omit<VoiceProviderConfig, 'status' | 'info'>>) => void;
  onTestTTS: () => void;
  onDisconnectProviders: () => void;
}

type Tab = 'profile' | 'voice' | 'llm' | 'providers' | 'agents';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',   label: 'Profile',    icon: <User className="h-3.5 w-3.5" /> },
  { id: 'voice',     label: 'Voice',      icon: <Volume2 className="h-3.5 w-3.5" /> },
  { id: 'llm',       label: 'AI',         icon: <Bot className="h-3.5 w-3.5" /> },
  { id: 'providers', label: 'Providers',  icon: <Radio className="h-3.5 w-3.5" /> },
  { id: 'agents',    label: 'Agents',     icon: <Settings className="h-3.5 w-3.5" /> },
];

/* ─── small atoms ──────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-2.5">{children}</div>
  );
}

function StatusBadge({ status, info }: { status: ConnectionStatus; info?: string }) {
  if (status === 'verifying')
    return (
      <span className="flex items-center gap-1 text-cyan-400 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
      </span>
    );
  if (status === 'connected')
    return (
      <span className="flex items-center gap-1 text-emerald-400 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5" /> {info || 'Connected'}
      </span>
    );
  if (status === 'error')
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs">
        <AlertTriangle className="h-3.5 w-3.5" /> {info || 'Error'}
      </span>
    );
  return <span className="text-slate-600 text-xs">Not connected</span>;
}

function TokenField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••••••••••'}
          autoComplete="off"
          spellCheck={false}
          className="w-full h-9 rounded-xl border border-white/10 bg-black/30 pl-4 pr-10 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition-colors font-mono"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/* ─── security notice ──────────────────────────────────────────── */

function SecurityNotice() {
  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/6 p-3 flex gap-2.5">
      <Shield className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
      <div className="text-[11px] text-emerald-300/80 leading-relaxed">
        <span className="font-semibold text-emerald-300">Stored locally only.</span> Credentials
        are saved in your browser's localStorage — never in any source file, .env, or sent anywhere
        except the specific API endpoint you connect to. They cannot be committed to Git.
      </div>
    </div>
  );
}

/* ─── tabs ──────────────────────────────────────────────────────── */

function ProfileTab({ config, onUpdate }: { config: AppConfig; onUpdate: (p: Partial<AppConfig>) => void }) {
  const [wakeWord, setWakeWord] = useState(config.wakeWord);
  const [name, setName] = useState(config.callingName);

  const save = () => onUpdate({ wakeWord: wakeWord.trim() || 'Wakeup Robo', callingName: name.trim() || 'Master' });

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Wake-Up Word</SectionLabel>
        <input
          value={wakeWord}
          onChange={(e) => setWakeWord(e.target.value)}
          placeholder="e.g. Wakeup Robo"
          className="w-full h-10 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition-colors"
        />
        <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">
          Say this phrase to activate Robo from standby. Keep it unique and 2+ words.
          Current: <span className="text-slate-400 font-medium">"{config.wakeWord}"</span>
        </p>
      </section>

      <section>
        <SectionLabel>Your Calling Name</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Master, Boss, Your Name…"
          className="w-full h-10 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400/35 transition-colors"
        />
        <p className="mt-1.5 text-[11px] text-slate-600">
          How Robo addresses you. Current: <span className="text-slate-400 font-medium">"{config.callingName}"</span>
        </p>
      </section>

      <button
        onClick={save}
        className="w-full h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-semibold hover:opacity-90 transition"
      >
        Save Profile
      </button>
    </div>
  );
}

function VoiceTab({
  config,
  onUpdate,
  voices,
  onTest,
}: {
  config: VoiceConfig;
  onUpdate: (p: Partial<VoiceConfig>) => void;
  voices: SpeechSynthesisVoice[];
  onTest: (t: string) => void;
}) {
  const genderOpts: { value: VoiceGender; label: string; icon: string }[] = [
    { value: 'female', label: 'Female', icon: '♀' },
    { value: 'male', label: 'Male', icon: '♂' },
  ];
  const speedOpts: { value: VoiceSpeed; label: string; icon: string; desc: string }[] = [
    { value: 'slow',   label: 'Slow',   icon: '🐢', desc: 'Calm & deliberate' },
    { value: 'normal', label: 'Normal', icon: '🎙️', desc: 'Natural pace' },
    { value: 'fast',   label: 'Fast',   icon: '⚡', desc: 'Quick & snappy' },
  ];

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Voice Gender</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {genderOpts.map((o) => (
            <button
              key={o.value}
              onClick={() => onUpdate({ gender: o.value, voiceName: '' })}
              className={`h-12 rounded-xl border text-sm font-medium transition-all ${
                config.gender === o.value
                  ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300 shadow-lg shadow-cyan-400/10'
                  : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
              }`}
            >
              <div className="text-xl mb-0.5">{o.icon}</div>
              <div className="text-xs">{o.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Speaking Speed</SectionLabel>
        <div className="space-y-2">
          {speedOpts.map((o) => (
            <button
              key={o.value}
              onClick={() => onUpdate({ speed: o.value })}
              className={`w-full flex items-center gap-3 h-11 rounded-xl border px-4 text-sm transition-all ${
                config.speed === o.value
                  ? 'border-violet-400/50 bg-violet-400/12 text-violet-200'
                  : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
              }`}
            >
              <span className="text-base">{o.icon}</span>
              <span className="font-medium">{o.label}</span>
              <span className="ml-auto text-xs opacity-60">{o.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {voices.length > 0 && (
        <section>
          <SectionLabel>Specific Voice <span className="text-slate-600 normal-case">(optional)</span></SectionLabel>
          <div className="relative">
            <select
              value={config.voiceName}
              onChange={(e) => onUpdate({ voiceName: e.target.value })}
              className="w-full h-10 rounded-xl border border-white/10 bg-black/35 pl-4 pr-8 text-sm text-white appearance-none cursor-pointer outline-none focus:border-cyan-400/35 transition"
            >
              <option value="">Auto — best match for gender</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name} className="bg-slate-900">
                  {v.name} {v.localService ? '' : '(remote)'}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">▼</div>
          </div>
        </section>
      )}

      <button
        onClick={() => onTest('Good Evening, Master. I am Robo, your AI assistant. All systems are online and ready for your command.')}
        className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-semibold hover:opacity-90 transition"
      >
        <Play className="h-4 w-4" /> Test Voice
      </button>

      <p className="text-[10px] text-slate-600 leading-relaxed text-center">
        Best voices: Chrome → Google UK English · macOS → Samantha Enhanced or Karen Enhanced.
      </p>
    </div>
  );
}

/* ─── LLM tab ───────────────────────────────────────────────────── */

function LLMTab({
  config,
  onUpdate,
  onVerify,
  onDisconnect,
}: {
  config: LLMConfig;
  onUpdate: (p: Partial<Omit<LLMConfig, 'status' | 'info'>>) => void;
  onVerify: () => void;
  onDisconnect: () => void;
}) {
  const providers = Object.keys(PROVIDER_LABELS) as LLMProvider[];
  const models = PROVIDER_MODELS[config.provider] ?? [];
  const isOllama = config.provider === 'ollama';
  const isConnected = config.status === 'connected';

  return (
    <div className="space-y-5">
      <SecurityNotice />

      {/* provider */}
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

      {/* model */}
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

      {/* api key — hidden for ollama */}
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

      {/* base URL — for Ollama or OpenAI-compatible */}
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

      {/* status + actions */}
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

/* ─── Providers tab ─────────────────────────────────────────────── */

function ProviderToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; desc: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`w-full flex items-center gap-3 h-12 rounded-xl border px-4 text-left transition-all ${
            value === o.value
              ? 'border-cyan-400/50 bg-cyan-400/12 text-cyan-200'
              : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
          }`}
        >
          <div className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
            value === o.value ? 'border-cyan-400 bg-cyan-400' : 'border-slate-600'
          }`} />
          <div>
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-[10px] opacity-60">{o.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ProvidersTab({
  config,
  onUpdate,
  onTest,
  onDisconnect,
}: {
  config: VoiceProviderConfig;
  onUpdate: (p: Partial<Omit<VoiceProviderConfig, 'status' | 'info'>>) => void;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  const needsOpenAI     = config.ttsProvider === 'openai' || config.sttProvider === 'openai';
  const needsElevenLabs = config.ttsProvider === 'elevenlabs';
  const isConnected     = config.status === 'connected';
  const isBrowserOnly   = config.ttsProvider === 'browser' && config.sttProvider === 'browser';

  return (
    <div className="space-y-5">
      <SecurityNotice />

      {/* ── STT ─────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Speech-to-Text (STT)</SectionLabel>
        <ProviderToggle<STTProvider>
          value={config.sttProvider}
          onChange={(v) => onUpdate({ sttProvider: v })}
          options={[
            { value: 'browser', label: 'Browser — Web Speech API',   desc: 'Free, no key needed, requires Chrome or Safari' },
            { value: 'openai',  label: 'OpenAI Whisper',             desc: 'Accurate, multilingual, requires API key' },
          ]}
        />
      </section>

      {/* ── TTS ─────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Text-to-Speech (TTS)</SectionLabel>
        <ProviderToggle<TTSProvider>
          value={config.ttsProvider}
          onChange={(v) => onUpdate({ ttsProvider: v })}
          options={[
            { value: 'browser',    label: 'Browser — Speech Synthesis',  desc: 'Free, no key, quality varies by OS/browser' },
            { value: 'openai',     label: 'OpenAI TTS',                  desc: 'Natural voice, 6 voices, 2 quality tiers' },
            { value: 'elevenlabs', label: 'ElevenLabs',                  desc: 'Ultra-realistic voice cloning quality' },
          ]}
        />
      </section>

      {/* ── OpenAI settings (shared for TTS + STT) ──────────────── */}
      {needsOpenAI && (
        <section className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4 space-y-4">
          <div className="text-[10px] uppercase tracking-[0.3em] text-violet-400/70">OpenAI Settings</div>

          <TokenField
            label="OpenAI API Key"
            value={config.openaiApiKey}
            placeholder="sk-…"
            onChange={(v) => onUpdate({ openaiApiKey: v })}
          />

          {config.ttsProvider === 'openai' && (
            <>
              <div>
                <div className="text-xs text-slate-400 mb-2">TTS Voice</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {TTS_VOICES.map((v) => (
                    <button
                      key={v}
                      onClick={() => onUpdate({ openaiTtsVoice: v })}
                      className={`h-9 rounded-xl border text-xs font-medium capitalize transition-all ${
                        config.openaiTtsVoice === v
                          ? 'border-violet-400/50 bg-violet-400/15 text-violet-200'
                          : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">TTS Model</div>
                <div className="grid grid-cols-2 gap-2">
                  {TTS_MODELS.map((m) => (
                    <button
                      key={m}
                      onClick={() => onUpdate({ openaiTtsModel: m })}
                      className={`h-10 rounded-xl border text-xs font-medium transition-all ${
                        config.openaiTtsModel === m
                          ? 'border-cyan-400/50 bg-cyan-400/12 text-cyan-200'
                          : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      <div>{m}</div>
                      <div className="text-[10px] opacity-50 mt-0.5">{m === 'tts-1' ? 'faster' : 'higher quality'}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="text-[10px] text-slate-600 leading-relaxed">
            Get a key at <span className="text-slate-400">platform.openai.com/api-keys</span>.
            {config.sttProvider === 'openai' && ' Whisper STT uses the same key.'}
          </div>
        </section>
      )}

      {/* ── ElevenLabs settings ──────────────────────────────────── */}
      {needsElevenLabs && (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400/70">ElevenLabs Settings</div>
          <TokenField
            label="ElevenLabs API Key"
            value={config.elevenLabsApiKey}
            placeholder="Enter your ElevenLabs API key…"
            onChange={(v) => onUpdate({ elevenLabsApiKey: v })}
          />
          <div>
            <div className="text-xs text-slate-400 mb-1">Voice ID</div>
            <input
              value={config.elevenLabsVoiceId}
              onChange={(e) => onUpdate({ elevenLabsVoiceId: e.target.value })}
              placeholder="e.g. Rachel, Bella, Adam…"
              className="w-full h-9 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-400/35 transition font-mono text-xs"
            />
          </div>
          <div className="text-[10px] text-slate-600 leading-relaxed">
            Find voice IDs at <span className="text-slate-400">elevenlabs.io/voice-lab</span>.
          </div>
        </section>
      )}

      {/* ── Status + actions ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        {config.status === 'verifying' && (
          <span className="flex items-center gap-1.5 text-cyan-400 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…
          </span>
        )}
        {config.status === 'connected' && (
          <span className="flex items-center gap-1.5 text-emerald-400 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> {config.info || 'Connected'}
          </span>
        )}
        {config.status === 'error' && (
          <span className="flex items-center gap-1.5 text-red-400 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" /> {config.info}
          </span>
        )}
        {(config.status === 'idle' || config.status === 'verifying') && !config.info && (
          <span className="text-slate-600 text-xs">
            {isBrowserOnly ? 'Browser mode active' : 'Not yet tested'}
          </span>
        )}
        {isConnected && !isBrowserOnly && (
          <button
            onClick={onDisconnect}
            className="text-[11px] text-red-400/70 hover:text-red-400 transition ml-auto"
          >
            Reset to Browser
          </button>
        )}
      </div>

      {!isBrowserOnly && (
        <button
          onClick={onTest}
          disabled={
            config.status === 'verifying' ||
            (config.ttsProvider === 'openai' && !config.openaiApiKey) ||
            (config.ttsProvider === 'elevenlabs' && !config.elevenLabsApiKey)
          }
          className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition"
        >
          {config.status === 'verifying'
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing TTS…</>
            : <><Play className="h-4 w-4" /> Test TTS Provider</>}
        </button>
      )}

      <div className="rounded-xl border border-white/6 bg-white/3 p-3 space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
        <div>
          <span className="text-slate-400 font-medium">Server TTS/STT</span> replaces the browser voice stack
          when the orchestrator is running. Settings are sent to the local orchestrator at session start.
        </div>
        <div>STT via server requires the orchestrator to be running (it processes audio locally).</div>
        <div className="flex items-start gap-1.5 pt-1">
          <Shield className="h-3 w-3 mt-0.5 text-emerald-500/60 flex-shrink-0" />
          <span>Keys saved in localStorage — never in source files or git.</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Agents tab ────────────────────────────────────────────────── */

function AgentsTab({
  config,
  onPatch,
  onVerifyWeather,
  onConnectGoogle,
  onDisconnectGoogle,
  onVerifyGitHub,
  onDisconnectGitHub,
  onVerifyNews,
  onVerifySmartHome,
}: {
  config: AgentConfig;
  onPatch: <K extends keyof AgentConfig>(agent: K, p: Partial<AgentConfig[K]>) => void;
  onVerifyWeather: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onVerifyGitHub: () => void;
  onDisconnectGitHub: () => void;
  onVerifyNews: () => void;
  onVerifySmartHome: () => void;
}) {
  type StockMarket = 'IN' | 'US';
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggle = (id: string) => setOpenSection((s) => (s === id ? null : id));

  return (
    <div className="space-y-3">
      <SecurityNotice />

      {/* ── System (always on, lightweight — no creds) ──────────── */}
      <AgentAccordion
        id="system"
        label="System Agent"
        emoji="🖥️"
        status={config.system.enabled ? 'connected' : 'idle'}
        info={config.system.enabled ? 'CPU · memory · battery · network' : undefined}
        open={false}
        onToggle={() => {}}
        enabled={config.system.enabled}
        onToggleEnabled={() => onPatch('system', { enabled: !config.system.enabled })}
      />

      {/* ── Weather ─────────────────────────────────────────────── */}
      <AgentAccordion
        id="weather"
        label="Weather Agent"
        emoji="☁️"
        status={config.weather.status}
        info={config.weather.info}
        open={openSection === 'weather'}
        onToggle={() => toggle('weather')}
        enabled={config.weather.enabled}
        onToggleEnabled={() => onPatch('weather', { enabled: !config.weather.enabled })}
      >
        <div className="space-y-3 pt-1">
          <div>
            <SectionLabel>Provider</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {(['openweathermap', 'weatherapi'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => onPatch('weather', { provider: p })}
                  className={`h-9 rounded-xl border text-xs font-medium transition ${
                    config.weather.provider === p
                      ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300'
                      : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8'
                  }`}
                >
                  {p === 'openweathermap' ? 'OpenWeatherMap' : 'WeatherAPI'}
                </button>
              ))}
            </div>
          </div>
          <TokenField
            label="API Key"
            value={config.weather.apiKey}
            placeholder="Enter API key…"
            onChange={(v) => onPatch('weather', { apiKey: v })}
          />
          <div>
            <div className="text-xs text-slate-400 mb-1">Default City (optional)</div>
            <input
              value={config.weather.defaultCity}
              onChange={(e) => onPatch('weather', { defaultCity: e.target.value })}
              placeholder="e.g. Mumbai, London…"
              className="w-full h-9 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition"
            />
          </div>
          <button
            onClick={onVerifyWeather}
            disabled={!config.weather.apiKey || config.weather.status === 'verifying'}
            className="w-full h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 disabled:opacity-40 transition"
          >
            {config.weather.status === 'verifying' ? 'Testing…' : 'Test Connection'}
          </button>
          <p className="text-[10px] text-slate-600">
            Free tier: <a href="https://openweathermap.org/api" target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-400 underline">openweathermap.org/api</a>
          </p>
        </div>
      </AgentAccordion>

      {/* ── Google (Calendar + Gmail + Drive) ───────────────────── */}
      <AgentAccordion
        id="google"
        label="Google (Calendar · Gmail · Drive)"
        emoji="🔵"
        status={config.google.status}
        info={config.google.info}
        open={openSection === 'google'}
        onToggle={() => toggle('google')}
      >
        <div className="space-y-3 pt-1">
          {config.google.status === 'connected' ? (
            <>
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-300 text-center">
                Signed in as <strong>{config.google.connectedEmail}</strong>
              </div>

              {/* Per-agent enable/disable inside Google section */}
              <div>
                <SectionLabel>Active Agents</SectionLabel>
                <div className="space-y-2">
                  {config.google.scopes.includes('calendar') && (
                    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                      <div>
                        <div className="text-xs text-slate-300 font-medium">📅 Calendar Agent</div>
                        <div className="text-[10px] text-slate-500">Meetings, events, schedule</div>
                      </div>
                      <AgentToggle
                        enabled={config.google.calendarEnabled}
                        onToggle={() => onPatch('google', { calendarEnabled: !config.google.calendarEnabled })}
                      />
                    </div>
                  )}
                  {config.google.scopes.includes('gmail') && (
                    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                      <div>
                        <div className="text-xs text-slate-300 font-medium">📧 Email Agent</div>
                        <div className="text-[10px] text-slate-500">Inbox, unread, messages</div>
                      </div>
                      <AgentToggle
                        enabled={config.google.emailEnabled}
                        onToggle={() => onPatch('google', { emailEnabled: !config.google.emailEnabled })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Token expiry warning */}
              {config.google.tokenExpiresAt > 0 && (() => {
                const minsLeft = Math.round((config.google.tokenExpiresAt - Date.now()) / 60000);
                if (minsLeft < 10) return (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-400/8 px-3 py-2 text-[11px] text-amber-300 text-center">
                    {minsLeft <= 0
                      ? 'Session expired — please sign in again'
                      : `Session expires in ${minsLeft} min — sign in again to refresh`}
                  </div>
                );
                return null;
              })()}

              <div>
                <SectionLabel>Active Permissions</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {config.google.scopes.map((s) => (
                    <span key={s} className="rounded-full bg-emerald-400/12 border border-emerald-400/20 px-2.5 py-1 text-[11px] text-emerald-300 capitalize">{s}</span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onConnectGoogle}
                  className="flex-1 h-9 rounded-xl border border-[#4285F4]/40 bg-[#4285F4]/12 text-[#7EB3FF] text-sm hover:bg-[#4285F4]/22 transition"
                >
                  Re-sign in
                </button>
                <button
                  onClick={onDisconnectGoogle}
                  className="flex-1 h-9 rounded-xl border border-red-400/30 bg-red-400/8 text-red-400 text-sm hover:bg-red-400/15 transition"
                >
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <TokenField
                label="OAuth Client ID"
                value={config.google.clientId}
                placeholder="xxxxxxxxxx.apps.googleusercontent.com"
                onChange={(v) => onPatch('google', { clientId: v })}
              />
              <TokenField
                label="OAuth Client Secret"
                value={config.google.clientSecret}
                placeholder="GOCSPX-…"
                onChange={(v) => onPatch('google', { clientSecret: v })}
              />

              <div>
                <SectionLabel>Permissions to request</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {(['calendar', 'gmail', 'drive'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        const scopes = config.google.scopes.includes(s)
                          ? config.google.scopes.filter((x) => x !== s)
                          : [...config.google.scopes, s];
                        onPatch('google', { scopes });
                      }}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize border transition ${
                        config.google.scopes.includes(s)
                          ? 'border-violet-400/50 bg-violet-400/15 text-violet-300'
                          : 'border-white/10 bg-white/4 text-slate-500 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={onConnectGoogle}
                disabled={!config.google.clientId || !config.google.clientSecret || config.google.status === 'verifying'}
                className="w-full h-10 rounded-xl bg-[#4285F4]/20 border border-[#4285F4]/40 text-[#7EB3FF] text-sm font-medium hover:bg-[#4285F4]/30 disabled:opacity-40 transition flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {config.google.status === 'verifying' ? 'Connecting…' : 'Sign in with Google'}
              </button>

              <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] text-slate-400 font-medium">One-time setup (free, ~3 min):</p>
                <ol className="text-[10px] text-slate-500 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Go to <span className="text-slate-400">console.cloud.google.com</span></li>
                  <li>Create a project → APIs &amp; Services → Credentials</li>
                  <li>Create OAuth 2.0 Client ID → type: <strong className="text-slate-400">Web application</strong></li>
                  <li>Add authorised redirect URI: <span className="text-slate-400 font-mono">{window.location.origin}/</span></li>
                  <li>Copy the Client ID above — <strong className="text-slate-400">no secret needed</strong></li>
                </ol>
              </div>
            </>
          )}
        </div>
      </AgentAccordion>

      {/* ── GitHub ──────────────────────────────────────────────── */}
      <AgentAccordion
        id="github"
        label="GitHub Agent"
        emoji="🐙"
        status={config.github.status}
        info={config.github.info}
        open={openSection === 'github'}
        onToggle={() => toggle('github')}
        enabled={config.github.enabled}
        onToggleEnabled={() => onPatch('github', { enabled: !config.github.enabled })}
      >
        <div className="space-y-3 pt-1">
          {config.github.status === 'connected' ? (
            <>
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 flex items-center gap-2">
                <Github className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-300">{config.github.info}</span>
              </div>
              <button
                onClick={onDisconnectGitHub}
                className="w-full h-9 rounded-xl border border-red-400/30 bg-red-400/8 text-red-400 text-sm hover:bg-red-400/15 transition"
              >
                Disconnect GitHub
              </button>
            </>
          ) : (
            <>
              <TokenField
                label="Personal Access Token"
                value={config.github.personalAccessToken}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                onChange={(v) => onPatch('github', { personalAccessToken: v })}
              />
              <button
                onClick={onVerifyGitHub}
                disabled={!config.github.personalAccessToken || config.github.status === 'verifying'}
                className="w-full h-9 rounded-xl bg-slate-700/40 border border-white/15 text-white text-sm font-medium hover:bg-slate-700/60 disabled:opacity-40 transition flex items-center justify-center gap-2"
              >
                <Github className="h-4 w-4" />
                {config.github.status === 'verifying' ? 'Verifying…' : 'Verify Token'}
              </button>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Generate at <span className="text-slate-500">github.com/settings/tokens</span>.
                Scopes needed: <span className="text-slate-500">repo, read:user, notifications</span>.
              </p>
            </>
          )}
        </div>
      </AgentAccordion>

      {/* ── Stock Market ─────────────────────────────────────────── */}
      <AgentAccordion
        id="stock"
        label="Stock Market Agent"
        emoji="📈"
        status={config.stock.status}
        info={config.stock.info}
        open={openSection === 'stock'}
        onToggle={() => toggle('stock')}
        enabled={config.stock.enabled}
        onToggleEnabled={() => onPatch('stock', { enabled: !config.stock.enabled })}
      >
        <div className="space-y-3 pt-1">
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-300">
            Powered by Yahoo Finance — free, no API key required.
          </div>

          <div>
            <SectionLabel>Default Market</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {([['IN', '🇮🇳 India (NSE)', 'Nifty, Sensex, NSE stocks'], ['US', '🇺🇸 United States', 'NYSE, NASDAQ stocks']] as [StockMarket, string, string][]).map(([mkt, label, desc]) => (
                <button
                  key={mkt}
                  onClick={() => onPatch('stock', { defaultMarket: mkt })}
                  className={`h-14 rounded-xl border text-xs font-medium transition-all text-left px-3 ${
                    config.stock.defaultMarket === mkt
                      ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                      : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <div className="font-semibold mb-0.5">{label}</div>
                  <div className="text-[10px] opacity-60">{desc}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-600 leading-relaxed">
              Sets the default ticker suffix when no exchange is specified.
              Indian stocks use <span className="text-slate-400">.NS</span> (NSE) automatically.
              You can always say the full ticker (e.g. "RELIANCE.NS", "AAPL").
            </p>
          </div>

          <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
            <p className="font-medium text-slate-400">Example commands:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>What is the Nifty 50 price?</li>
              <li>Show me Reliance stock</li>
              <li>RSI for TCS</li>
              <li>Support and resistance for HDFC Bank</li>
              <li>How is Sensex doing today?</li>
              <li>Momentum of Infosys</li>
              <li>AAPL analysis</li>
            </ul>
          </div>
        </div>
      </AgentAccordion>

      {/* ── News Agent ───────────────────────────────────────────── */}
      <AgentAccordion
        id="news"
        label="News Agent"
        emoji="📰"
        status={config.news.status}
        info={config.news.info}
        open={openSection === 'news'}
        onToggle={() => toggle('news')}
        enabled={config.news.enabled}
        onToggleEnabled={() => onPatch('news', { enabled: !config.news.enabled })}
      >
        <div className="space-y-3 pt-1">
          <div className="rounded-xl border border-sky-400/25 bg-sky-400/8 px-4 py-3 text-sm text-sky-300">
            Powered by <span className="font-semibold">GNews.io</span> — free developer key (100 req/day), great Indian &amp; international coverage.
          </div>

          {/* API Key */}
          <div>
            <SectionLabel>API Key</SectionLabel>
            <div className="flex gap-2">
              <input
                type="password"
                value={config.news.apiKey}
                onChange={(e) => onPatch('news', { apiKey: e.target.value, status: 'idle', info: '' })}
                placeholder="Paste your GNews API key…"
                className="flex-1 h-9 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/40 transition-colors"
              />
              <button
                onClick={onVerifyNews}
                disabled={!config.news.apiKey || config.news.status === 'verifying'}
                className="h-9 px-4 rounded-xl border border-sky-400/35 bg-sky-400/15 text-xs font-medium text-sky-300 hover:bg-sky-400/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {config.news.status === 'verifying' ? 'Testing…' : 'Test'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-600 leading-relaxed">
              Get a free key at <span className="text-slate-400">gnews.io</span> — sign up for the free plan (100 req/day).
            </p>
          </div>

          {/* Country */}
          <div>
            <SectionLabel>Country</SectionLabel>
            <select
              value={config.news.country}
              onChange={(e) => onPatch('news', { country: e.target.value })}
              className="w-full h-9 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-sky-400/40 transition-colors appearance-none"
            >
              <option value="in">🇮🇳 India</option>
              <option value="us">🇺🇸 United States</option>
              <option value="gb">🇬🇧 United Kingdom</option>
              <option value="au">🇦🇺 Australia</option>
              <option value="ca">🇨🇦 Canada</option>
              <option value="sg">🇸🇬 Singapore</option>
              <option value="ae">🇦🇪 UAE</option>
              <option value="de">🇩🇪 Germany</option>
              <option value="fr">🇫🇷 France</option>
              <option value="jp">🇯🇵 Japan</option>
              <option value="br">🇧🇷 Brazil</option>
              <option value="za">🇿🇦 South Africa</option>
            </select>
          </div>

          {/* State + City */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <SectionLabel>State / Region <span className="text-slate-600">(optional)</span></SectionLabel>
              <input
                type="text"
                value={config.news.state}
                onChange={(e) => onPatch('news', { state: e.target.value })}
                placeholder="e.g. Maharashtra"
                className="w-full h-9 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/40 transition-colors"
              />
            </div>
            <div>
              <SectionLabel>City <span className="text-slate-600">(optional)</span></SectionLabel>
              <input
                type="text"
                value={config.news.city}
                onChange={(e) => onPatch('news', { city: e.target.value })}
                placeholder="e.g. Mumbai"
                className="w-full h-9 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/40 transition-colors"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            State/City narrows results when asking for local news. Country is always used for top headlines.
          </p>

          <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
            <p className="font-medium text-slate-400">Example commands:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>What are the latest headlines?</li>
              <li>Latest news about technology</li>
              <li>Breaking news in Mumbai</li>
              <li>Top stories from India today</li>
              <li>News about cricket</li>
            </ul>
          </div>
        </div>
      </AgentAccordion>

      {/* ── Smart Home (Home Assistant) ──────────────────────────── */}
      <AgentAccordion
        id="smarthome"
        label="Smart Home Agent"
        emoji="🏠"
        status={config.smarthome.status}
        info={config.smarthome.info}
        open={openSection === 'smarthome'}
        onToggle={() => toggle('smarthome')}
        enabled={config.smarthome.enabled}
        onToggleEnabled={() => onPatch('smarthome', { enabled: !config.smarthome.enabled })}
      >
        <div className="space-y-3 pt-1">
          <div className="rounded-xl border border-orange-400/25 bg-orange-400/6 px-4 py-3 text-sm text-orange-300">
            Connects to your <span className="font-semibold">Home Assistant</span> unified smart home hub to control lights, climate, switches, scenes, and more.
          </div>

          <div>
            <div className="text-xs text-slate-400 mb-1">Home Assistant URL</div>
            <input
              type="url"
              value={config.smarthome.endpoint}
              onChange={(e) => onPatch('smarthome', { endpoint: e.target.value, status: 'idle', info: '' })}
              placeholder="http://homeassistant.local:8123"
              className="w-full h-9 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-orange-400/35 transition-colors font-mono text-xs"
            />
            <p className="mt-1 text-[10px] text-slate-600">
              Default: <span className="text-slate-400">http://homeassistant.local:8123</span>. Use your Home Assistant URL or IP address.
            </p>
          </div>

          <TokenField
            label="Long-Lived Access Token"
            value={config.smarthome.token}
            placeholder="eyJ…"
            onChange={(v) => onPatch('smarthome', { token: v, status: 'idle', info: '' })}
          />

          <button
            onClick={onVerifySmartHome}
            disabled={!config.smarthome.token || config.smarthome.status === 'verifying'}
            className="w-full h-9 rounded-xl bg-orange-500/15 border border-orange-400/30 text-orange-300 text-sm font-medium hover:bg-orange-500/25 disabled:opacity-40 transition"
          >
            {config.smarthome.status === 'verifying' ? 'Connecting…' : 'Test Connection'}
          </button>

          {config.smarthome.status === 'connected' && (
            <button
              onClick={() => onPatch('smarthome', { token: '', status: 'idle', info: '' })}
              className="w-full h-9 rounded-xl border border-red-400/30 bg-red-400/8 text-red-400 text-sm hover:bg-red-400/15 transition"
            >
              Disconnect
            </button>
          )}

          <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] text-slate-400 font-medium">How to get a token (2 min):</p>
            <ol className="text-[10px] text-slate-500 space-y-1 list-decimal list-inside leading-relaxed">
              <li>Open Home Assistant → click your profile (bottom-left avatar)</li>
              <li>Scroll to "Long-lived access tokens" → Create Token</li>
              <li>Give it a name (e.g. "Robo") → OK → copy the token above</li>
            </ol>
          </div>

          <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
            <p className="font-medium text-slate-400">Voice command examples:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Turn on the living room lights</li>
              <li>Set bedroom brightness to 40%</li>
              <li>Make the lights blue</li>
              <li>Set thermostat to 22 degrees</li>
              <li>Activate movie scene</li>
              <li>Turn off all switches</li>
            </ul>
          </div>
        </div>
      </AgentAccordion>

      <div className="rounded-xl border border-white/6 bg-white/3 p-3">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Lock className="h-3.5 w-3.5 flex-shrink-0" />
          More agents (Slack, Jira, Notion, etc.) can be added via the agent framework.
        </div>
      </div>
    </div>
  );
}

/* ── Accordion wrapper ──────────────────────────────────────────── */

function AgentToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={enabled ? 'Disable agent' : 'Enable agent'}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-emerald-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function AgentAccordion({
  id, label, emoji, status, info, open, onToggle, children, enabled, onToggleEnabled,
}: {
  id: string;
  label: string;
  emoji: string;
  status: ConnectionStatus;
  info?: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  enabled?: boolean;
  onToggleEnabled?: () => void;
}) {
  return (
    <div className={`rounded-2xl border transition-all ${open ? 'border-white/15 bg-white/4' : 'border-white/8 bg-white/2'} ${enabled === false ? 'opacity-55' : ''}`}>
      <button
        onClick={children ? onToggle : undefined}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${children ? '' : 'cursor-default'}`}
      >
        <span className="text-lg">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${enabled === false ? 'text-slate-400' : 'text-white'}`}>{label}</div>
          <StatusBadge
            status={enabled === false ? 'idle' : status}
            info={enabled === false ? 'Disabled — toggle to enable' : info}
          />
        </div>
        {onToggleEnabled !== undefined && (
          <AgentToggle enabled={enabled ?? true} onToggle={onToggleEnabled} />
        )}
        {children && (
          <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </motion.div>
        )}
      </button>

      <AnimatePresence>
        {open && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main panel ────────────────────────────────────────────────── */

export function SettingsPanel(props: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  // Jump to providers tab when called externally (e.g. from provider status badges)

  return (
    <AnimatePresence>
      {props.open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={props.onClose}
          />

          <motion.aside
            className="fixed right-0 top-0 bottom-0 z-50 flex w-88 flex-col bg-[#07101e]/96 border-l border-white/10 backdrop-blur-2xl shadow-2xl"
            style={{ width: 340 }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/15 border border-cyan-400/25">
                  <Settings className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Settings</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Robo AI Configuration</div>
                </div>
              </div>
              <button onClick={props.onClose} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3 pb-2 flex-shrink-0">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-medium transition-all ${
                    tab === t.id
                      ? 'bg-white/10 text-white'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-5 py-3 scrollbar-thin">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  {tab === 'profile' && (
                    <ProfileTab config={props.appConfig} onUpdate={props.onAppUpdate} />
                  )}
                  {tab === 'voice' && (
                    <VoiceTab
                      config={props.voiceConfig}
                      onUpdate={props.onVoiceUpdate}
                      voices={props.voices}
                      onTest={props.onTestVoice}
                    />
                  )}
                  {tab === 'llm' && (
                    <LLMTab
                      config={props.llmConfig}
                      onUpdate={props.onLLMUpdate}
                      onVerify={props.onVerifyLLM}
                      onDisconnect={props.onDisconnectLLM}
                    />
                  )}
                  {tab === 'providers' && (
                    <ProvidersTab
                      config={props.voiceProviderConfig}
                      onUpdate={props.onVoiceProviderUpdate}
                      onTest={props.onTestTTS}
                      onDisconnect={props.onDisconnectProviders}
                    />
                  )}
                  {tab === 'agents' && (
                    <AgentsTab
                      config={props.agentConfig}
                      onPatch={props.onAgentPatch}
                      onVerifyWeather={props.onVerifyWeather}
                      onConnectGoogle={props.onConnectGoogle}
                      onDisconnectGoogle={props.onDisconnectGoogle}
                      onVerifyGitHub={props.onVerifyGitHub}
                      onDisconnectGitHub={props.onDisconnectGitHub}
                      onVerifyNews={props.onVerifyNews}
                      onVerifySmartHome={props.onVerifySmartHome}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
