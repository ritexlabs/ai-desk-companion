import { useState } from 'react';
import { ChevronDown, ChevronUp, LogIn, LogOut, RefreshCw } from 'lucide-react';
import type { PortfolioCreds } from '../../hooks/useAgentConfig';
import { SectionLabel, StatusBadge } from './shared';

interface Props {
  config:      PortfolioCreds;
  onPatch:     (p: Partial<PortfolioCreds>) => void;
  onConnect:   () => void;
  onDisconnect: () => void;
  onRefresh:   () => void;
}

export function PortfolioSettings({ config, onPatch, onConnect, onDisconnect, onRefresh }: Props) {
  const connected     = config.status === 'connected' && !!config.connectedAccount;
  const discoveryFail = config.status === 'error';
  const hasManual     = !!(config.authEndpoint || config.tokenEndpoint);

  // advancedOpen tracks user intent; the section also force-opens on error or when fields are set
  const [advancedOpen, setAdvancedOpen] = useState(hasManual);
  const showAdvanced = advancedOpen || discoveryFail || hasManual;

  return (
    <div className="space-y-5">
      {/* MCP endpoint + Client ID */}
      <section className="space-y-3">
        <SectionLabel>INDmoney MCP Server</SectionLabel>

        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-wide">MCP Endpoint</label>
          <input
            type="text"
            value={config.endpoint}
            onChange={(e) => onPatch({ endpoint: e.target.value })}
            placeholder="https://mcp.indmoney.com/mcp"
            className="w-full h-9 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/35 transition"
          />
          <p className="text-[10px] text-slate-600">Leave as default unless INDmoney provides a different URL.</p>
        </div>
      </section>

      {/* OAuth connect / status */}
      <section className="space-y-3">
        <SectionLabel>INDmoney Account</SectionLabel>

        {connected ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/6 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <StatusBadge status="connected" info={config.connectedAccount} />
              {config.tokenExpiresAt > 0 && config.tokenExpiresAt < Date.now() + 5 * 60 * 1000 && (
                <span className="text-[10px] text-amber-400">Token expiring soon</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onRefresh}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-cyan-500/15 border border-cyan-400/25 text-cyan-300 text-xs font-medium hover:bg-cyan-500/25 transition"
              >
                <RefreshCw className="h-3 w-3" /> Refresh token
              </button>
              <button
                onClick={onDisconnect}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/12 border border-red-400/25 text-red-400 text-xs font-medium hover:bg-red-500/20 transition"
              >
                <LogOut className="h-3 w-3" /> Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              onClick={onConnect}
              disabled={config.status === 'verifying'}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-rose-500/15 border border-rose-400/25 text-rose-300 text-sm font-medium hover:bg-rose-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LogIn className="h-4 w-4" />
              {config.status === 'verifying' ? 'Connecting…' : 'Connect with INDmoney'}
            </button>
            {config.status === 'error' && (
              <p className="text-[11px] text-amber-400 text-center leading-relaxed">
                Could not connect automatically — enter the OAuth endpoints below.
              </p>
            )}
            <p className="text-[10px] text-slate-600 text-center leading-relaxed">
              Opens a sign-in popup. INDmoney uses OAuth 2.0 — no password is stored here.
            </p>
          </div>
        )}
      </section>

      {/* Advanced: manual OAuth endpoints */}
      {!connected && (
        <section className="space-y-3">
          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 uppercase tracking-wide transition"
          >
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Advanced — Manual OAuth endpoints
          </button>

          {showAdvanced && (
            <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-3">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                If auto-discovery fails, enter the OAuth endpoints from{' '}
                <span className="text-slate-400">INDmoney Developer Portal</span>.
                Leave blank to use auto-discovery.
              </p>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase tracking-wide">Authorization Endpoint</label>
                <input
                  type="url"
                  value={config.authEndpoint}
                  onChange={(e) => onPatch({ authEndpoint: e.target.value })}
                  placeholder="https://www.indmoney.com/oauth/authorize"
                  className="w-full h-9 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/35 transition"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 uppercase tracking-wide">Token Endpoint</label>
                <input
                  type="url"
                  value={config.tokenEndpoint}
                  onChange={(e) => onPatch({ tokenEndpoint: e.target.value })}
                  placeholder="https://www.indmoney.com/oauth/token"
                  className="w-full h-9 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/35 transition"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Capability summary */}
      <section className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-1.5">
        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">What this agent can do</div>
        <ul className="text-[11px] text-slate-500 space-y-1">
          <li>• View equity holdings and current values</li>
          <li>• Check portfolio P&amp;L and returns</li>
          <li>• List mutual fund investments and SIPs</li>
          <li>• See watchlist and tracked instruments</li>
          <li>• Review recent buy/sell transactions</li>
        </ul>
      </section>
    </div>
  );
}
