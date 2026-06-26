import type { AgentConfig } from '../../hooks/useAgentConfig';
import { SectionLabel } from './shared';

type NewsConfig = AgentConfig['news'];

interface Props {
  config: NewsConfig;
  onPatch: (p: Partial<NewsConfig>) => void;
  onVerify: () => void;
}

export function NewsSettings({ config, onPatch, onVerify }: Props) {
  return (
    <div className="space-y-3 pt-1">
      <div className="rounded-xl border border-sky-400/25 bg-sky-400/8 px-4 py-3 text-sm text-sky-300">
        Powered by <span className="font-semibold">GNews.io</span> — free developer key (100 req/day), great Indian &amp; international coverage.
      </div>

      <div>
        <SectionLabel>API Key</SectionLabel>
        <div className="flex gap-2">
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => onPatch({ apiKey: e.target.value, status: 'idle', info: '' })}
            placeholder="Paste your GNews API key…"
            className="flex-1 h-9 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/40 transition-colors"
          />
          <button
            onClick={onVerify}
            disabled={!config.apiKey || config.status === 'verifying'}
            className="h-9 px-4 rounded-xl border border-sky-400/35 bg-sky-400/15 text-xs font-medium text-sky-300 hover:bg-sky-400/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {config.status === 'verifying' ? 'Testing…' : 'Test'}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-600 leading-relaxed">
          Get a free key at <span className="text-slate-400">gnews.io</span> — sign up for the free plan (100 req/day).
        </p>
      </div>

      <div>
        <SectionLabel>Country</SectionLabel>
        <select
          value={config.country}
          onChange={(e) => onPatch({ country: e.target.value })}
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

      <div className="grid grid-cols-2 gap-2">
        <div>
          <SectionLabel>State / Region <span className="text-slate-600">(optional)</span></SectionLabel>
          <input
            type="text"
            value={config.state}
            onChange={(e) => onPatch({ state: e.target.value })}
            placeholder="e.g. Maharashtra"
            className="w-full h-9 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/40 transition-colors"
          />
        </div>
        <div>
          <SectionLabel>City <span className="text-slate-600">(optional)</span></SectionLabel>
          <input
            type="text"
            value={config.city}
            onChange={(e) => onPatch({ city: e.target.value })}
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
  );
}
