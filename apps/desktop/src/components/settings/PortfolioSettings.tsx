import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, RefreshCw } from 'lucide-react';
import type { PortfolioCreds } from '../../hooks/useAgentConfig';

const GATEWAY = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? 'http://localhost:8788';

interface Props {
  config:       PortfolioCreds;
  onPatch:      (p: Partial<PortfolioCreds>) => void;
  onConnect:    () => void;
  onDisconnect: () => void;
  onRefresh:    () => void;
}

export function PortfolioSettings({ config, onPatch, onDisconnect }: Props) {
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connected = config.status === 'connected';

  // Poll gateway status after launching the auth tab
  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${GATEWAY}/api/portfolio/status`);
        const data = await res.json() as { connected: boolean; info?: string; expires_at?: number };
        if (data.connected) {
          stopPolling();
          onPatch({
            status:           'connected',
            connectedAccount: 'INDmoney',
            info:             'Portfolio connected',
            enabled:          true,
          });
        }
      } catch {
        // gateway not reachable yet — keep polling
      }
    }, 1500);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setChecking(false);
  }

  useEffect(() => () => stopPolling(), []);

  async function handleConnect() {
    setChecking(true);
    onPatch({ status: 'verifying', info: '' });
    // Open gateway auth flow in a new tab — INDmoney shows mobile/OTP login
    window.open(`${GATEWAY}/auth/indmoney`, '_blank', 'width=520,height=680,left=200,top=80');
    startPolling();
    // Stop polling after 5 minutes regardless
    setTimeout(() => {
      if (pollRef.current) {
        stopPolling();
        onPatch({ status: 'idle' });
      }
    }, 5 * 60 * 1000);
  }

  async function handleDisconnect() {
    try {
      await fetch(`${GATEWAY}/auth/indmoney/token`, { method: 'DELETE' });
    } catch { /* ignore if gateway unreachable */ }
    onDisconnect();
  }

  async function handleCheckStatus() {
    setChecking(true);
    try {
      const res  = await fetch(`${GATEWAY}/api/portfolio/status`);
      const data = await res.json() as { connected: boolean; info?: string };
      if (data.connected) {
        onPatch({ status: 'connected', connectedAccount: 'INDmoney', info: 'Portfolio connected', enabled: true });
      } else {
        onPatch({ status: 'idle', info: data.info ?? '' });
      }
    } catch {
      onPatch({ status: 'error', info: 'Gateway unreachable' });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="rounded-xl border border-rose-400/25 bg-rose-400/6 px-4 py-3 text-sm text-rose-300">
        Connects to your <span className="font-semibold">INDmoney</span> portfolio via OAuth 2.0.
        Clicking <em>Connect</em> opens INDmoney's login page — enter your mobile number and OTP there.
      </div>

      {connected ? (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/6 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-sm text-emerald-300 font-medium">
              {config.connectedAccount ?? 'INDmoney'} connected
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-cyan-500/15 border border-cyan-400/25 text-cyan-300 text-xs font-medium hover:bg-cyan-500/25 disabled:opacity-40 transition"
            >
              <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
              Verify
            </button>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/12 border border-red-400/25 text-red-400 text-xs font-medium hover:bg-red-500/20 transition"
            >
              <LogOut className="h-3 w-3" /> Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleConnect}
            disabled={config.status === 'verifying' || checking}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-rose-500/15 border border-rose-400/25 text-rose-300 text-sm font-medium hover:bg-rose-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LogIn className="h-4 w-4" />
            {config.status === 'verifying' ? 'Waiting for login…' : 'Connect with INDmoney'}
          </button>

          {config.status === 'verifying' && (
            <div className="rounded-xl border border-rose-400/15 bg-rose-400/5 px-4 py-3 space-y-2">
              <p className="text-[11px] text-rose-300/80 leading-relaxed text-center">
                INDmoney login page opened. Enter your mobile number and OTP there.
              </p>
              <button
                onClick={handleCheckStatus}
                className="w-full h-8 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs hover:bg-white/8 transition"
              >
                Already logged in? Check status
              </button>
              <button
                onClick={() => { stopPolling(); onPatch({ status: 'idle' }); }}
                className="w-full h-8 rounded-lg text-slate-600 text-xs hover:text-slate-400 transition"
              >
                Cancel
              </button>
            </div>
          )}

          {config.status === 'error' && config.info && (
            <p className="text-[11px] text-red-400 text-center">{config.info}</p>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
        <p className="font-medium text-slate-400">How it works:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Click <em>Connect with INDmoney</em> — a login page opens</li>
          <li>Enter your registered mobile number</li>
          <li>Verify the OTP sent to your phone</li>
          <li>Tab closes automatically — portfolio is linked</li>
        </ol>
        <p className="mt-2 text-slate-600">
          Tokens are stored in the gateway's <code className="text-slate-500">.env</code> file and
          are auto-refreshed before expiry. No credentials are stored in the browser.
        </p>
      </div>

      {/* What it can do */}
      <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5">
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">What this agent can do</p>
        <ul className="text-[11px] text-slate-500 space-y-1">
          <li>• View equity holdings and current values</li>
          <li>• Check portfolio P&amp;L and returns</li>
          <li>• List mutual fund investments and SIPs</li>
          <li>• See watchlist and tracked instruments</li>
          <li>• Review recent buy/sell transactions</li>
        </ul>
      </div>
    </div>
  );
}
