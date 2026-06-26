import type { AgentConfig } from '../../hooks/useAgentConfig';
import { SectionLabel } from './shared';

type StockConfig = AgentConfig['stock'];
type StockMarket = 'IN' | 'US';

interface Props {
  config: StockConfig;
  onPatch: (p: Partial<StockConfig>) => void;
}

const MARKETS: [StockMarket, string, string][] = [
  ['IN', '🇮🇳 India (NSE)', 'Nifty, Sensex, NSE stocks'],
  ['US', '🇺🇸 United States', 'NYSE, NASDAQ stocks'],
];

export function StockSettings({ config, onPatch }: Props) {
  return (
    <div className="space-y-3 pt-1">
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-300">
        Powered by Yahoo Finance — free, no API key required.
      </div>

      <div>
        <SectionLabel>Default Market</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {MARKETS.map(([mkt, label, desc]) => (
            <button
              key={mkt}
              onClick={() => onPatch({ defaultMarket: mkt })}
              className={`h-14 rounded-xl border text-xs font-medium transition-all text-left px-3 ${
                config.defaultMarket === mkt
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
  );
}
