import { AlertTriangle, CheckCircle2, Loader2, Play, Shield } from 'lucide-react';
import type { VoiceProviderConfig, TTSProvider, STTProvider } from '../../hooks/useVoiceProviderConfig';
import { TTS_VOICES, TTS_MODELS } from '../../hooks/useVoiceProviderConfig';
import { SecurityNotice, SectionLabel, TokenField } from './shared';

interface Props {
  config: VoiceProviderConfig;
  onUpdate: (p: Partial<Omit<VoiceProviderConfig, 'status' | 'info'>>) => void;
  onTest: () => void;
  onDisconnect: () => void;
}

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

export function ProvidersSettings({ config, onUpdate, onTest, onDisconnect }: Props) {
  const needsOpenAI     = config.ttsProvider === 'openai' || config.sttProvider === 'openai';
  const needsElevenLabs = config.ttsProvider === 'elevenlabs';
  const isConnected     = config.status === 'connected';
  const isBrowserOnly   = config.ttsProvider === 'browser' && config.sttProvider === 'browser';

  return (
    <div className="space-y-5">
      <SecurityNotice />

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
