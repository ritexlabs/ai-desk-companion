import type { AgentConfig } from '../../hooks/useAgentConfig';
import { SectionLabel, TokenField } from './shared';

type WeatherConfig = AgentConfig['weather'];

interface Props {
  config: WeatherConfig;
  onPatch: (p: Partial<WeatherConfig>) => void;
  onVerify: () => void;
}

export function WeatherSettings({ config, onPatch, onVerify }: Props) {
  return (
    <div className="space-y-3 pt-1">
      <div>
        <SectionLabel>Provider</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {(['openweathermap', 'weatherapi'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPatch({ provider: p })}
              className={`h-9 rounded-xl border text-xs font-medium transition ${
                config.provider === p
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
        value={config.apiKey}
        placeholder="Enter API key…"
        onChange={(v) => onPatch({ apiKey: v })}
      />

      <div>
        <div className="text-xs text-slate-400 mb-1">Default City (optional)</div>
        <input
          value={config.defaultCity}
          onChange={(e) => onPatch({ defaultCity: e.target.value })}
          placeholder="e.g. Mumbai, London…"
          className="w-full h-9 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition"
        />
      </div>

      <button
        onClick={onVerify}
        disabled={!config.apiKey || config.status === 'verifying'}
        className="w-full h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 disabled:opacity-40 transition"
      >
        {config.status === 'verifying' ? 'Testing…' : 'Test Connection'}
      </button>

      <p className="text-[10px] text-slate-600">
        Free tier: <a href="https://openweathermap.org/api" target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-400 underline">openweathermap.org/api</a>
      </p>
    </div>
  );
}
