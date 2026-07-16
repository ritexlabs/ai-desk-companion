import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, Briefcase, ExternalLink, Eye, EyeOff,
  Loader2, RefreshCw, TrendingDown, TrendingUp, X,
} from 'lucide-react';

const GATEWAY = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? 'http://localhost:8788';

/* ─── Types ──────────────────────────────────────────────────────── */

interface Investment {
  asset_type:               string;
  invested_value:           number;
  current_value:            number;
  return:                   number;
  return_percentage:        number;
  progress_value_percentage:number;
}

interface PortfolioData {
  total_invested?:      number;
  total_current_value?: number;
  total_networth?:      number;
  investments?:         Investment[];
}

export interface PortfolioDashboardProps {
  token?:       string;   // kept for API compat but ignored — token lives in gateway .env
  backendBase?: string;
  onClose:      () => void;
  onVoice?:     (text: string) => void;
}

/* ─── Asset colour map (matches mcp-playground NW_COLORS) ──────── */

const ASSET_COLORS: Record<string, string> = {
  STOCK:          '#f59e0b', stock:          '#f59e0b', equity: '#f59e0b',
  US_STOCK:       '#818cf8', us_stock:       '#818cf8',
  US_STOCK_WALLET:'#6366f1',
  MF:             '#06b6d4', mutual:         '#06b6d4', fund: '#06b6d4',
  EPF:            '#10b981', epf:            '#10b981', pf:   '#10b981',
  NPS:            '#22d3ee', nps:            '#22d3ee',
  PPF:            '#4ade80', ppf:            '#4ade80',
  FD:             '#f97316', fd:             '#f97316', fixed: '#f97316',
  CRYPTO:         '#fb923c', crypto:         '#fb923c',
  REAL_ESTATE:    '#94a3b8', real:           '#94a3b8', property: '#94a3b8',
  VEHICLE:        '#64748b', vehicle:        '#64748b',
  ESOPS_RSUS:     '#c084fc', esop:           '#c084fc', rsu: '#c084fc',
  SA:             '#f472b6', savings:        '#f472b6',
  PHYSICAL_GOLD:  '#fcd34d', gold:           '#fcd34d',
  bond:           '#3b82f6',
};

function assetColor(type: string): string {
  if (!type) return '#64748b';
  const upper = type.toUpperCase().replace(/\s+/g, '_');
  if (ASSET_COLORS[upper]) return ASSET_COLORS[upper];
  const lower = type.toLowerCase();
  for (const [k, v] of Object.entries(ASSET_COLORS)) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  return '#64748b';
}

/* ─── INR formatter ──────────────────────────────────────────────── */

function fmtINR(n: number, compact = false): string {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (compact) {
    if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
    if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)}L`;
    if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
    return `${sign}₹${abs.toFixed(0)}`;
  }
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/* ─── Donut chart (path-based, same approach as mcp-playground) ─── */

function DonutChart({
  investments, totalNW, hidden, hoveredIdx, onHover,
}: {
  investments: Investment[];
  totalNW:     number;
  hidden:      boolean;
  hoveredIdx:  number | null;
  onHover:     (i: number | null) => void;
}) {
  const S = 164, cx = 82, cy = 82, OR = 70, IR = 44;
  const total = investments.reduce((s, inv) => s + inv.current_value, 0);
  if (!total) return null;

  let angle = -Math.PI / 2;
  const segments = investments.map((inv) => {
    const frac  = inv.current_value / total;
    const sweep = frac * 2 * Math.PI;
    const end   = angle + sweep;
    const x1 = cx + OR * Math.cos(angle), y1 = cy + OR * Math.sin(angle);
    const x2 = cx + OR * Math.cos(end),   y2 = cy + OR * Math.sin(end);
    const x3 = cx + IR * Math.cos(end),   y3 = cy + IR * Math.sin(end);
    const x4 = cx + IR * Math.cos(angle), y4 = cy + IR * Math.sin(angle);
    const la = sweep > Math.PI ? 1 : 0;
    const d = [
      `M${x1.toFixed(2)},${y1.toFixed(2)}`,
      `A${OR},${OR} 0 ${la},1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
      `L${x3.toFixed(2)},${y3.toFixed(2)}`,
      `A${IR},${IR} 0 ${la},0 ${x4.toFixed(2)},${y4.toFixed(2)}Z`,
    ].join(' ');
    angle = end;
    return { d, frac, inv };
  });

  const hov      = hoveredIdx !== null ? investments[hoveredIdx] : null;
  const ctrLabel = hov ? hov.asset_type : 'Net Worth';
  const ctrVal   = hov ? hov.current_value : totalNW;

  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={(OR + IR) / 2} fill="none"
        stroke="rgba(255,255,255,0.05)" strokeWidth={OR - IR} />
      {segments.map((seg, i) => (
        <path
          key={i} d={seg.d}
          fill={assetColor(seg.inv.asset_type)}
          style={{
            opacity:    hoveredIdx === null ? 1 : hoveredIdx === i ? 1 : 0.22,
            cursor:     'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={() => onHover(i)}
          onMouseLeave={() => onHover(null)}
        />
      ))}
      {/* Center text */}
      <text x={cx} y={cy - 8} textAnchor="middle"
        style={{ fill:'#64748b', fontSize:'8px', fontFamily:'Inter,sans-serif' }}>
        {ctrLabel.length > 14 ? ctrLabel.slice(0, 14) + '…' : ctrLabel}
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle"
        style={{ fill:'#e2e8f0', fontSize:'11px', fontWeight:600, fontFamily:'monospace' }}>
        {hidden ? '••••••' : fmtINR(ctrVal, true)}
      </text>
    </svg>
  );
}

/* ─── Legend row ─────────────────────────────────────────────────── */

function LegendRow({
  inv, frac, isHovered, onHover, hidden,
}: {
  inv:       Investment;
  frac:      number;
  isHovered: boolean;
  onHover:   (v: boolean) => void;
  hidden:    boolean;
}) {
  const color = assetColor(inv.asset_type);
  const up    = (inv.return_percentage ?? 0) >= 0;

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-default transition-colors"
      style={{ background: isHovered ? 'rgba(255,255,255,0.05)' : 'transparent' }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">{inv.asset_type}</span>
      <span className="text-xs font-mono font-semibold text-slate-200 flex-shrink-0">
        {hidden ? '••••' : fmtINR(inv.current_value, true)}
      </span>
      <span className={`text-[10px] font-semibold w-11 text-right flex-shrink-0 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? '+' : ''}{hidden ? '••' : inv.return_percentage?.toFixed(1)}%
      </span>
      <span className="text-[10px] text-slate-600 w-8 text-right flex-shrink-0">
        {(frac * 100).toFixed(1)}%
      </span>
    </div>
  );
}

/* ─── Performance bars ───────────────────────────────────────────── */

function PerformanceView({ investments, hidden }: { investments: Investment[]; hidden: boolean }) {
  const maxVal = Math.max(...investments.map((i) => i.current_value), 1);
  const sorted = [...investments].sort((a, b) => b.return_percentage - a.return_percentage);

  return (
    <div className="space-y-3">
      {sorted.map((inv, i) => {
        const color = assetColor(inv.asset_type);
        const up    = (inv.return_percentage ?? 0) >= 0;
        const barW  = (inv.current_value / maxVal) * 100;
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-[11px] text-slate-400">{inv.asset_type}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-200 tabular-nums">
                  {hidden ? '••••' : fmtINR(inv.current_value, true)}
                </span>
                <span className={`text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {up ? '+' : ''}{hidden ? '••' : inv.return_percentage?.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                animate={{ width: `${barW.toFixed(1)}%` }}
                transition={{ duration: 0.8, delay: i * 0.06, ease: 'easeOut' }}
              />
            </div>
            {inv.invested_value > 0 && (
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px] text-slate-600 tabular-nums">
                  Invested: {hidden ? '••••' : fmtINR(inv.invested_value, true)}
                </span>
                <span className="text-[9px] text-slate-600 tabular-nums">
                  Gain: {hidden ? '••••' : (inv.return >= 0 ? '+' : '') + fmtINR(inv.return, true)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Quick voice asks ───────────────────────────────────────────── */

const QUICK_ASKS = [
  { label: 'Net Worth',    query: 'what is my total net worth?' },
  { label: 'Holdings',     query: 'show my stock holdings' },
  { label: 'Mutual Funds', query: 'list my mutual funds' },
  { label: 'P&L',          query: 'what is my total P&L?' },
  { label: 'Transactions', query: 'show recent transactions' },
  { label: 'Watchlist',    query: 'show my watchlist' },
];

/* ─── Main dashboard ─────────────────────────────────────────────── */

const TABS = ['Overview', 'Performance'] as const;
type Tab = typeof TABS[number];

export function PortfolioDashboard({ onClose, onVoice }: PortfolioDashboardProps) {
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [authReq,    setAuthReq]    = useState(false);
  const [portfolio,  setPortfolio]  = useState<PortfolioData | null>(null);
  const [rawText,    setRawText]    = useState('');
  const [hidden,     setHidden]     = useState(false);
  const [tab,        setTab]        = useState<Tab>('Overview');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    setAuthReq(false);
    setPortfolio(null);
    setRawText('');
    try {
      const res  = await fetch(`${GATEWAY}/api/portfolio/data`);
      const resp = await res.json() as { ok: boolean; authRequired?: boolean; error?: string; data?: unknown };

      if (!resp.ok) {
        if (resp.authRequired) { setAuthReq(true); return; }
        setError(resp.error ?? `Error ${res.status}`);
        return;
      }

      const d = resp.data;
      if (typeof d === 'string') {
        setRawText(d);
      } else if (d && typeof d === 'object') {
        const pd = d as PortfolioData;
        if (pd.investments?.length) {
          setPortfolio(pd);
        } else {
          setRawText(JSON.stringify(d, null, 2));
        }
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to connect to gateway.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const investments = portfolio?.investments ?? [];
  const totalNW  = portfolio?.total_networth      ?? 0;
  const invested = portfolio?.total_invested      ?? 0;
  const curVal   = portfolio?.total_current_value ?? 0;
  const gain     = curVal - invested;
  const gainPct  = invested > 0 ? (gain / invested) * 100 : 0;
  const isUp     = gain >= 0;

  const total = investments.reduce((s, inv) => s + inv.current_value, 0);
  const fracs  = investments.map((inv) => inv.current_value / (total || 1));

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Centering shell */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{   opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          style={{ boxShadow: '0 32px 80px rgba(20,184,166,0.22), 0 0 0 1px rgba(255,255,255,0.05)' }}
          className="pointer-events-auto w-[560px] max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border border-teal-400/25 bg-[#07091a]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top accent line */}
          <div className="h-px w-full flex-shrink-0 bg-gradient-to-r from-transparent via-teal-400/70 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-teal-400/12 flex-shrink-0 bg-gradient-to-r from-teal-400/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-teal-500/18 border border-teal-500/30 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-teal-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-white tracking-tight">My Net Worth</div>
                <div className="text-[10px] text-slate-500">Synced via INDmoney MCP</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!loading && !error && !authReq && portfolio && (
                <button
                  onClick={() => setHidden((h) => !h)}
                  title={hidden ? 'Show values' : 'Hide values'}
                  className="h-7 w-7 rounded-xl border border-white/10 bg-white/4 flex items-center justify-center text-slate-400 hover:text-slate-200 transition"
                >
                  {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                onClick={fetchData}
                disabled={loading}
                title="Refresh"
                className="h-7 w-7 rounded-xl border border-white/10 bg-white/4 flex items-center justify-center text-slate-400 hover:text-slate-200 transition disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="h-7 w-7 rounded-xl border border-white/10 bg-white/4 flex items-center justify-center text-slate-500 hover:text-slate-200 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Tabs (only when data loaded) */}
          {!loading && !error && !authReq && portfolio && (
            <div className="flex gap-0 border-b border-white/6 flex-shrink-0">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-5 py-2.5 text-xs font-semibold transition-colors"
                  style={{
                    color:         tab === t ? '#14b8a6' : '#64748b',
                    borderBottom:  tab === t ? '2px solid #14b8a6' : '2px solid transparent',
                    marginBottom:  -1,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <AnimatePresence mode="wait">

              {/* Loading */}
              {loading && (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-3 py-24 text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[11px]">Fetching portfolio data…</span>
                </motion.div>
              )}

              {/* Not connected */}
              {!loading && authReq && (
                <motion.div key="auth" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-teal-500/12 border border-teal-500/25">
                    <Briefcase className="h-6 w-6 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">INDmoney not connected</p>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-[260px] leading-relaxed">
                      Open <strong className="text-slate-300">Settings → Agents → Portfolio</strong> and click Connect to link your account.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Error */}
              {!loading && !authReq && error && (
                <motion.div key="error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="px-5 py-6 space-y-4">
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/8 px-3.5 py-3">
                    <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
                  </div>
                  <button onClick={fetchData}
                    className="w-full h-9 rounded-xl border border-teal-400/25 bg-teal-500/10 text-teal-300 text-xs font-medium hover:bg-teal-500/20 transition">
                    Retry
                  </button>
                </motion.div>
              )}

              {/* Raw text fallback */}
              {!loading && !error && rawText && (
                <motion.div key="raw" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="px-5 py-4">
                  <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
                    <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-2">Portfolio Data</div>
                    <pre className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-72 overflow-y-auto scrollbar-thin">
                      {rawText}
                    </pre>
                  </div>
                </motion.div>
              )}

              {/* Structured — Overview tab */}
              {!loading && !error && portfolio && tab === 'Overview' && (
                <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="px-5 py-4 space-y-4">

                  {/* Net-worth headline */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Net Worth</p>
                      <p className="text-3xl font-bold tabular-nums" style={{ color: '#14b8a6' }}>
                        {hidden ? '₹ ••••••' : fmtINR(totalNW)}
                      </p>
                      {invested > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold mt-2 px-3 py-1 rounded-full"
                          style={{
                            color:      isUp ? '#34d399' : '#fb7185',
                            background: isUp ? 'rgba(52,211,153,0.12)' : 'rgba(251,113,133,0.12)',
                          }}
                        >
                          {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {hidden ? '••••' : (isUp ? '+' : '') + fmtINR(gain, true)}
                          &nbsp;({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%)
                        </span>
                      )}
                    </div>

                    {/* Summary chips */}
                    <div className="flex flex-col gap-1.5 text-right">
                      <div className="text-[9px] text-slate-600 uppercase tracking-wider">Invested</div>
                      <div className="text-sm font-bold text-slate-200 tabular-nums">
                        {hidden ? '••••' : fmtINR(invested, true)}
                      </div>
                      <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-1">Current</div>
                      <div className="text-sm font-bold text-slate-200 tabular-nums">
                        {hidden ? '••••' : fmtINR(curVal, true)}
                      </div>
                    </div>
                  </div>

                  {/* Donut + legend */}
                  {investments.length > 0 && (
                    <div className="flex gap-4 items-start">
                      <DonutChart
                        investments={investments}
                        totalNW={totalNW}
                        hidden={hidden}
                        hoveredIdx={hoveredRow !== null ? hoveredRow : hoveredIdx}
                        onHover={setHoveredIdx}
                      />
                      <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: 200 }}>
                        {investments.map((inv, i) => (
                          <LegendRow
                            key={inv.asset_type}
                            inv={inv}
                            frac={fracs[i]}
                            isHovered={hoveredRow === i}
                            onHover={(v) => setHoveredRow(v ? i : null)}
                            hidden={hidden}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick voice asks */}
                  {onVoice && (
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-2">Ask about</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {QUICK_ASKS.map(({ label, query }) => (
                          <button
                            key={label}
                            onClick={() => { onVoice(query); onClose(); }}
                            className="rounded-xl border border-teal-400/15 bg-teal-500/6 px-2 py-1.5 text-[10px] text-teal-300 hover:bg-teal-500/18 transition text-center cursor-pointer"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Structured — Performance tab */}
              {!loading && !error && portfolio && tab === 'Performance' && (
                <motion.div key="perf" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="px-5 py-4">
                  <PerformanceView investments={investments} hidden={hidden} />
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-teal-400/10 flex-shrink-0 bg-black/15">
            <button onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-white/6 transition cursor-pointer">
              Close
            </button>
            <button
              onClick={() => window.open('https://indmoney.com', '_blank')}
              className="flex items-center gap-1.5 h-8 px-4 rounded-xl bg-teal-500/12 border border-teal-500/25 text-teal-300 text-[11px] font-medium hover:bg-teal-500/20 transition cursor-pointer"
            >
              <ExternalLink className="h-3 w-3" />
              Open INDmoney
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
