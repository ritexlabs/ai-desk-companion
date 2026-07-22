import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, LogOut, Shield } from 'lucide-react';
import type { AgentConfig, DhanCreds, ZerodhaCreds } from '../../hooks/useAgentConfig';
import { SectionLabel } from './shared';

type StockConfig = AgentConfig['stock'];
type StockMarket = 'IN' | 'US';

interface Props {
  config:              StockConfig;
  onPatch:             (p: Partial<StockConfig>) => void;
  googleToken?:        string;
  dhanConfig:          DhanCreds;
  onDhanPatch:         (p: Partial<DhanCreds>) => void;
  onDhanConnect:       () => void;
  onDhanDisconnect:    () => void;
  zerodhaConfig:       ZerodhaCreds;
  onZerodhaPatch:      (p: Partial<ZerodhaCreds>) => void;
  onZerodhaConnect:    () => void;
  onZerodhaDisconnect: () => void;
}

interface SheetItem {
  id: string;
  name: string;
  modifiedTime: string;
  selected: boolean;
}

const MARKETS: [StockMarket, string, string][] = [
  ['IN', '🇮🇳 India (NSE)', 'Nifty, Sensex, NSE stocks'],
  ['US', '🇺🇸 United States', 'NYSE, NASDAQ stocks'],
];

function SheetPicker({
  onSelect,
  onClose,
  googleToken,
}: {
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
  googleToken?: string;
}) {
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (googleToken) headers['X-Google-Token'] = googleToken;
    fetch('http://localhost:8787/api/stocks/sheets', { headers })
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.detail ?? `HTTP ${r.status}`);
        return body;
      })
      .then(d => {
        setSheets(d.sheets ?? []);
        setLoading(false);
      })
      .catch(e => {
        const msg: string = e.message || 'Failed to load sheets';
        const isDriveScope = msg.includes('403') || msg.includes('insufficient') || msg.includes('Request had insufficient');
        setError(isDriveScope
          ? 'drive-scope'
          : msg.includes('401') || msg.includes('expired') || msg.includes('access token')
          ? 'auth-error'
          : msg
        );
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={ref}
        className="w-96 max-h-[70vh] flex flex-col rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <span className="text-sm font-semibold text-white">Select Portfolio Sheet</span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {loading && (
            <div className="py-8 text-center text-slate-500 text-sm">Loading sheets…</div>
          )}
          {error && (
            <div className="py-6 px-4 text-center space-y-2">
              {error === 'drive-scope' ? (
                <>
                  <p className="text-amber-400 text-xs font-semibold">Drive permission not granted</p>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Your Google token doesn't include Drive access. To fix this:
                  </p>
                  <ol className="text-left text-[11px] text-slate-400 space-y-1 list-decimal list-inside">
                    <li>Go to <span className="text-slate-200">Settings → Google</span></li>
                    <li>Make sure <span className="text-violet-300 font-medium">drive</span> scope is selected</li>
                    <li>Click <span className="text-[#7EB3FF]">Re-sign in</span></li>
                  </ol>
                </>
              ) : error === 'auth-error' ? (
                <>
                  <p className="text-red-400 text-xs font-semibold">Google token expired</p>
                  <p className="text-slate-400 text-[11px]">Go to <span className="text-slate-200">Settings → Google</span> and click Re-sign in.</p>
                </>
              ) : (
                <>
                  <p className="text-red-400 text-xs">{error}</p>
                  <p className="text-slate-600 text-[11px]">Make sure Google is connected in Settings → Google</p>
                </>
              )}
            </div>
          )}
          {!loading && !error && sheets.length === 0 && (
            <div className="py-8 text-center text-slate-500 text-sm">No Google Sheets found in your Drive</div>
          )}
          {sheets.map(sheet => (
            <button
              key={sheet.id}
              onClick={() => onSelect(sheet.id, sheet.name)}
              className={`w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-all group ${
                sheet.selected
                  ? 'bg-emerald-400/15 border border-emerald-400/30'
                  : 'border border-transparent hover:bg-white/6'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base leading-none">📊</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${sheet.selected ? 'text-emerald-300' : 'text-slate-200 group-hover:text-white'}`}>
                    {sheet.name}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-0.5 font-mono truncate">{sheet.id}</p>
                </div>
                {sheet.selected && (
                  <span className="text-emerald-400 text-xs shrink-0">✓</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-white/8">
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Shows spreadsheets from your connected Google account. The sheet must have a header row with a <span className="text-slate-400">Broker</span> column.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Dhan broker settings ───────────────────────────────────────────────────────

function DhanSettings({
  config, onPatch, onConnect, onDisconnect,
}: {
  config:      DhanCreds;
  onPatch:     (p: Partial<DhanCreds>) => void;
  onConnect:   () => void;
  onDisconnect: () => void;
}) {
  const [tradeWarningShown, setTradeWarningShown] = useState(false);

  function handleTradeToggle() {
    if (!config.tradeEnabled && !tradeWarningShown) {
      setTradeWarningShown(true);
      return;
    }
    const next = !config.tradeEnabled;
    onPatch({ tradeEnabled: next });
    setTradeWarningShown(false);
    // Sync trade flag to gateway
    fetch('http://localhost:8788/session/dhan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade_enabled: next }),
    }).catch(() => {});
  }

  const isConnected  = config.status === 'connected';
  const isVerifying  = config.status === 'verifying';
  const hasError     = config.status === 'error';

  return (
    <div className="space-y-3 border-t border-white/6 pt-3 mt-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-200">Dhan Broker</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Official MCP · OAuth login · no token needed</p>
        </div>
        <button
          onClick={() => onPatch({ enabled: !config.enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            config.enabled ? 'bg-emerald-500' : 'bg-white/10'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            config.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {config.enabled && (
        <>
          {/* Status */}
          {(isConnected || hasError || isVerifying || config.info) && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] ${
              isConnected ? 'bg-emerald-400/8 border border-emerald-400/20 text-emerald-300' :
              hasError    ? 'bg-red-400/8 border border-red-400/20 text-red-300' :
                            'bg-white/4 border border-white/8 text-slate-400'
            }`}>
              {isConnected  && <CheckCircle2 size={12} />}
              {hasError     && <AlertTriangle size={12} />}
              {isVerifying  && (
                <svg className="animate-spin" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              )}
              <span>{config.info || (isConnected ? 'Dhan broker connected' : isVerifying ? 'Connecting…' : '')}</span>
            </div>
          )}

          {/* Connect / Disconnect */}
          {!isConnected ? (
            <button
              onClick={onConnect}
              disabled={isVerifying}
              className="w-full py-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/8 hover:bg-emerald-400/15 text-xs text-emerald-300 hover:text-emerald-200 font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <ExternalLink size={12} />
              {isVerifying ? 'Waiting for login…' : 'Connect with Dhan'}
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              className="w-full py-2 rounded-xl border border-white/10 bg-white/4 hover:bg-red-400/10 hover:border-red-400/25 text-xs text-slate-400 hover:text-red-300 transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={11} />
              Disconnect Dhan
            </button>
          )}

          <p className="text-[9px] text-slate-600 leading-relaxed">
            Clicking "Connect with Dhan" opens a browser login — sign in with your Dhan Mobile Number, PIN, and OTP/TOTP. No tokens to copy or paste.
          </p>

          {/* Trade Mode — only when connected */}
          {isConnected && (
            <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Shield size={11} className={config.tradeEnabled ? 'text-amber-400' : 'text-slate-600'} />
                  <span className="text-[11px] font-semibold text-slate-300">Trade Mode</span>
                  {config.tradeEnabled && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-400 font-semibold uppercase tracking-wide">LIVE</span>
                  )}
                </div>
                <button
                  onClick={handleTradeToggle}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    config.tradeEnabled ? 'bg-amber-500' : 'bg-white/10'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    config.tradeEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {tradeWarningShown && !config.tradeEnabled && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/8 px-3 py-2 space-y-2">
                  <p className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                    <AlertTriangle size={10} /> Real orders will be placed immediately
                  </p>
                  <p className="text-[9px] text-amber-400/70 leading-relaxed">
                    Enabling Trade Mode lets the AI place buy/sell orders on your Dhan account. Orders execute instantly and cannot be automatically undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onPatch({ tradeEnabled: true }); setTradeWarningShown(false);
                        fetch('http://localhost:8788/session/dhan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trade_enabled: true }) }).catch(() => {});
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-[10px] text-amber-300 font-semibold hover:bg-amber-500/30 transition"
                    >
                      I understand — Enable
                    </button>
                    <button
                      onClick={() => setTradeWarningShown(false)}
                      className="flex-1 py-1.5 rounded-lg bg-white/6 border border-white/10 text-[10px] text-slate-400 hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!tradeWarningShown && (
                <p className="text-[9px] text-slate-600 leading-relaxed">
                  {config.tradeEnabled
                    ? 'Trade Mode is ON. The AI can place real buy/sell orders via voice command.'
                    : 'Disabled by default. Enable only when you want to place live orders by voice.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Zerodha broker settings ────────────────────────────────────────────────────

function ZerodhaSettings({
  config, onPatch, onConnect, onDisconnect,
}: {
  config:       ZerodhaCreds;
  onPatch:      (p: Partial<ZerodhaCreds>) => void;
  onConnect:    () => void;
  onDisconnect: () => void;
}) {
  const [tradeWarningShown, setTradeWarningShown] = useState(false);

  function handleTradeToggle() {
    if (!config.tradeEnabled && !tradeWarningShown) {
      setTradeWarningShown(true);
      return;
    }
    const next = !config.tradeEnabled;
    onPatch({ tradeEnabled: next });
    setTradeWarningShown(false);
    fetch('http://localhost:8788/session/zerodha', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade_enabled: next }),
    }).catch(() => {});
  }

  const isConnected = config.status === 'connected';
  const isVerifying = config.status === 'verifying';
  const hasError    = config.status === 'error';

  return (
    <div className="space-y-3 border-t border-white/6 pt-3 mt-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-200">Zerodha Broker</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Kite MCP · browser login · session-based</p>
        </div>
        <button
          onClick={() => onPatch({ enabled: !config.enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            config.enabled ? 'bg-emerald-500' : 'bg-white/10'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            config.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {config.enabled && (
        <>
          {(isConnected || hasError || isVerifying || config.info) && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] ${
              isConnected ? 'bg-emerald-400/8 border border-emerald-400/20 text-emerald-300' :
              hasError    ? 'bg-red-400/8 border border-red-400/20 text-red-300' :
                            'bg-white/4 border border-white/8 text-slate-400'
            }`}>
              {isConnected && <CheckCircle2 size={12} />}
              {hasError    && <AlertTriangle size={12} />}
              {isVerifying && (
                <svg className="animate-spin" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              )}
              <span>{config.info || (isConnected ? 'Zerodha broker connected' : isVerifying ? 'Connecting…' : '')}</span>
            </div>
          )}

          {!isConnected ? (
            <button
              onClick={onConnect}
              disabled={isVerifying}
              className="w-full py-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/8 hover:bg-emerald-400/15 text-xs text-emerald-300 hover:text-emerald-200 font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <ExternalLink size={12} />
              {isVerifying ? 'Waiting for login…' : 'Connect with Zerodha'}
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              className="w-full py-2 rounded-xl border border-white/10 bg-white/4 hover:bg-red-400/10 hover:border-red-400/25 text-xs text-slate-400 hover:text-red-300 transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={11} />
              Disconnect Zerodha
            </button>
          )}

          <p className="text-[9px] text-slate-600 leading-relaxed">
            Clicking "Connect with Zerodha" opens a browser login — sign in with your Zerodha Kite credentials. No tokens to copy or paste.
          </p>

          {isConnected && (
            <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Shield size={11} className={config.tradeEnabled ? 'text-amber-400' : 'text-slate-600'} />
                  <span className="text-[11px] font-semibold text-slate-300">Trade Mode</span>
                  {config.tradeEnabled && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-400 font-semibold uppercase tracking-wide">LIVE</span>
                  )}
                </div>
                <button
                  onClick={handleTradeToggle}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    config.tradeEnabled ? 'bg-amber-500' : 'bg-white/10'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    config.tradeEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {tradeWarningShown && !config.tradeEnabled && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/8 px-3 py-2 space-y-2">
                  <p className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                    <AlertTriangle size={10} /> Real orders will be placed immediately
                  </p>
                  <p className="text-[9px] text-amber-400/70 leading-relaxed">
                    Enabling Trade Mode lets the AI place buy/sell orders on your Zerodha account. Orders execute instantly and cannot be automatically undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onPatch({ tradeEnabled: true });
                        setTradeWarningShown(false);
                        fetch('http://localhost:8788/session/zerodha', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trade_enabled: true }) }).catch(() => {});
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-[10px] text-amber-300 font-semibold hover:bg-amber-500/30 transition"
                    >
                      I understand — Enable
                    </button>
                    <button
                      onClick={() => setTradeWarningShown(false)}
                      className="flex-1 py-1.5 rounded-lg bg-white/6 border border-white/10 text-[10px] text-slate-400 hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!tradeWarningShown && (
                <p className="text-[9px] text-slate-600 leading-relaxed">
                  {config.tradeEnabled
                    ? 'Trade Mode is ON. The AI can place real buy/sell orders via voice command.'
                    : 'Disabled by default. Enable only when you want to place live orders by voice.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main settings component ────────────────────────────────────────────────────

export function StockSettings({ config, onPatch, googleToken, dhanConfig, onDhanPatch, onDhanConnect, onDhanDisconnect, zerodhaConfig, onZerodhaPatch, onZerodhaConnect, onZerodhaDisconnect }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSelectSheet(id: string, name: string) {
    setPickerOpen(false);
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (googleToken) headers['X-Google-Token'] = googleToken;
      await fetch('http://localhost:8787/api/stocks/sheet', {
        method: 'POST',
        headers,
        body: JSON.stringify({ spreadsheet_id: id }),
      });
      onPatch({ spreadsheetId: id, spreadsheetName: name });
    } catch {
      // silent — ID still stored locally
      onPatch({ spreadsheetId: id, spreadsheetName: name });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pt-1">
      {pickerOpen && (
        <SheetPicker
          onSelect={handleSelectSheet}
          onClose={() => setPickerOpen(false)}
          googleToken={googleToken}
        />
      )}

      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-300">
        Powered by Yahoo Finance — free, no API key required.
      </div>

      {/* Portfolio Sheet */}
      <div>
        <SectionLabel>Portfolio Google Sheet (optional)</SectionLabel>
        <div className="flex gap-2">
          <input
            type="text"
            value={config.spreadsheetId}
            onChange={e => onPatch({ spreadsheetId: e.target.value.trim(), spreadsheetName: '' })}
            placeholder="Paste your Google Sheet ID here"
            className="flex-1 min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-400/40 focus:outline-none font-mono"
          />
          <button
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            className="shrink-0 rounded-xl border border-white/12 bg-white/6 hover:bg-white/10 text-slate-300 hover:text-white text-xs px-3 py-2.5 transition-all disabled:opacity-50"
          >
            Browse
          </button>
        </div>
        {config.spreadsheetName && (
          <p className="mt-1.5 text-[11px] text-emerald-400/80 font-medium truncate">
            📊 {config.spreadsheetName}
          </p>
        )}
        <p className="mt-1.5 text-[10px] text-slate-600 leading-relaxed">
          From your sheet URL: docs.google.com/spreadsheets/d/<span className="text-slate-400">{'<ID>'}</span>/edit.
          The sheet must have a header row with a <span className="text-slate-400">Broker</span> column.
          Requires Google to be connected (Settings → Google).
        </p>
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

      <DhanSettings config={dhanConfig} onPatch={onDhanPatch} onConnect={onDhanConnect} onDisconnect={onDhanDisconnect} />
      <ZerodhaSettings config={zerodhaConfig} onPatch={onZerodhaPatch} onConnect={onZerodhaConnect} onDisconnect={onZerodhaDisconnect} />
    </div>
  );
}
