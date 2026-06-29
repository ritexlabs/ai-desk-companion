import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Briefcase,
  ExternalLink,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useEffect } from 'react';

/* ─── Types ─────────────────────────────────────────────────────── */

interface Investment {
  asset_type: string;
  invested_value: number;
  current_value: number;
  return: number;
  return_percentage: number;
  progress_value_percentage: number;
}

interface PortfolioData {
  total_invested?: number;
  total_current_value?: number;
  total_networth?: number;
  investments?: Investment[];
}

interface SummaryResponse {
  ok: boolean;
  tool?: string;
  data?: unknown;
  available_tools?: string[];
  detail?: string;
}

export interface PortfolioDashboardProps {
  token: string;
  backendBase?: string;
  onClose: () => void;
  onVoice?: (text: string) => void;
}

/* ─── Asset palette ─────────────────────────────────────────────── */

const ASSET_PALETTE: [string, string, string][] = [
  ['epf',            '#10b981', 'text-emerald-400'],
  ['pf',             '#10b981', 'text-emerald-400'],
  ['esop',           '#8b5cf6', 'text-violet-400'],
  ['rsu',            '#8b5cf6', 'text-violet-400'],
  ['stock',          '#f59e0b', 'text-amber-400'],
  ['equity',         '#f59e0b', 'text-amber-400'],
  ['real estate',    '#6b7280', 'text-slate-400'],
  ['property',       '#6b7280', 'text-slate-400'],
  ['mutual',         '#06b6d4', 'text-cyan-400'],
  ['fund',           '#06b6d4', 'text-cyan-400'],
  ['bond',           '#3b82f6', 'text-blue-400'],
  ['fixed deposit',  '#f97316', 'text-orange-400'],
  ['fd',             '#f97316', 'text-orange-400'],
  ['nps',            '#ec4899', 'text-pink-400'],
  ['gold',           '#eab308', 'text-yellow-400'],
];

function assetMeta(type: string): { hex: string; textClass: string } {
  const lower = type.toLowerCase();
  const found = ASSET_PALETTE.find(([kw]) => lower.includes(kw));
  return found ? { hex: found[1], textClass: found[2] } : { hex: '#94a3b8', textClass: 'text-slate-400' };
}

/* ─── INR formatter ─────────────────────────────────────────────── */

function fmtINR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

/* ─── Donut chart ───────────────────────────────────────────────── */

const D_SIZE = 152;
const D_STROKE = 20;
const D_CX = D_SIZE / 2;
const D_CY = D_SIZE / 2;
const D_R  = (D_SIZE - D_STROKE) / 2;
const D_CIRC = 2 * Math.PI * D_R;

function DonutChart({
  investments, totalLabel, hoveredIdx, onHover,
}: {
  investments: Investment[];
  totalLabel: string;
  hoveredIdx: number | null;
  onHover: (i: number | null) => void;
}) {
  let cumulative = 0;

  return (
    <div className="relative flex-shrink-0" style={{ width: D_SIZE, height: D_SIZE }}>
      <svg width={D_SIZE} height={D_SIZE} viewBox={`0 0 ${D_SIZE} ${D_SIZE}`}>
        <circle
          cx={D_CX} cy={D_CY} r={D_R}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={D_STROKE}
        />
        {investments.map((inv, i) => {
          const startAngle = cumulative * 3.6 - 90;
          cumulative += inv.progress_value_percentage;
          const segLen = (inv.progress_value_percentage / 100) * D_CIRC;
          const { hex } = assetMeta(inv.asset_type);
          const isHovered = hoveredIdx === i;
          const isDimmed  = hoveredIdx !== null && !isHovered;

          return (
            <motion.circle
              key={i}
              cx={D_CX} cy={D_CY} r={D_R}
              fill="none"
              stroke={hex}
              strokeDasharray={`${segLen} ${D_CIRC - segLen}`}
              style={{
                transform: `rotate(${startAngle}deg)`,
                transformOrigin: `${D_CX}px ${D_CY}px`,
                cursor: 'pointer',
              }}
              initial={{ strokeDashoffset: segLen, opacity: 0, strokeWidth: D_STROKE }}
              animate={{
                strokeDashoffset: 0,
                opacity: isDimmed ? 0.2 : 1,
                strokeWidth: isHovered ? D_STROKE + 6 : D_STROKE,
              }}
              transition={{
                strokeDashoffset: { duration: 0.9, delay: i * 0.12, ease: 'easeOut' },
                opacity:    { duration: 0.2 },
                strokeWidth:{ duration: 0.15 },
              }}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
            />
          );
        })}
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={hoveredIdx ?? 'total'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-center px-3"
          >
            {hoveredIdx !== null ? (
              <>
                <div className="text-sm font-bold text-white leading-tight">
                  {investments[hoveredIdx].progress_value_percentage.toFixed(1)}%
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5 leading-tight max-w-[80px] text-center">
                  {investments[hoveredIdx].asset_type}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-bold text-white leading-tight">{totalLabel}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">Net Worth</div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Metric card ───────────────────────────────────────────────── */

function MetricCard({
  label, value, sub, positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2 flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-0.5">{label}</div>
      <div className={`text-sm font-bold leading-tight truncate ${
        positive === undefined ? 'text-white'
        : positive             ? 'text-emerald-400'
        :                        'text-red-400'
      }`}>{value}</div>
      {sub && <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ─── Investment row ────────────────────────────────────────────── */

function InvestmentRow({
  inv, isHovered, onHover, delay,
}: {
  inv: Investment;
  isHovered: boolean;
  onHover: (v: boolean) => void;
  delay: number;
}) {
  const { hex, textClass } = assetMeta(inv.asset_type);
  const up = inv.return >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.25, ease: 'easeOut' }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`rounded-xl border px-3 py-2.5 transition-colors cursor-default ${
        isHovered ? 'border-white/10 bg-white/5' : 'border-white/5 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ background: hex, boxShadow: isHovered ? `0 0 6px ${hex}80` : 'none' }}
        />
        <span className={`text-[11px] font-medium flex-1 min-w-0 truncate ${textClass}`}>
          {inv.asset_type}
        </span>
        <span className="text-[11px] text-slate-300 font-medium tabular-nums">
          {fmtINR(inv.current_value)}
        </span>
        <span className={`text-[10px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '+' : ''}{inv.return_percentage.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: hex, boxShadow: `0 0 4px ${hex}60` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(inv.progress_value_percentage, 100)}%` }}
          transition={{ duration: 0.85, delay: delay + 0.1, ease: 'easeOut' }}
        />
      </div>

      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-slate-600 tabular-nums">
          Invested: {fmtINR(inv.invested_value)}
        </span>
        <span className="text-[9px] text-slate-600 tabular-nums">
          {inv.progress_value_percentage.toFixed(1)}% of portfolio
        </span>
      </div>
    </motion.div>
  );
}

/* ─── Quick asks ─────────────────────────────────────────────────── */

const QUICK_ASKS = [
  { label: 'Net Worth',    query: 'what is my total net worth?' },
  { label: 'Holdings',     query: 'show my stock holdings' },
  { label: 'Mutual Funds', query: 'list my mutual funds' },
  { label: 'P&L',          query: 'what is my total P&L?' },
  { label: 'Transactions', query: 'show recent transactions' },
  { label: 'Watchlist',    query: 'show my watchlist' },
];

/* ─── Main component ────────────────────────────────────────────── */

export function PortfolioDashboard({
  token,
  backendBase = 'http://localhost:8787',
  onClose, onVoice,
}: PortfolioDashboardProps) {
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [portfolio,  setPortfolio]  = useState<PortfolioData | null>(null);
  const [rawText,    setRawText]    = useState('');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    setRawText('');
    setPortfolio(null);
    try {
      const params = new URLSearchParams({ token });
      const res = await fetch(`${backendBase}/api/portfolio/summary?${params}`);
      if (res.status === 401) {
        setError('Access token expired. Please reconnect in Settings → Agents → Portfolio.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { detail?: string }).detail ?? `Server error ${res.status}`);
        return;
      }
      const resp: SummaryResponse = await res.json();
      if (!resp.ok || !resp.data) {
        setError(resp.detail ?? 'No portfolio data returned.');
        return;
      }
      const d = resp.data;
      if (typeof d === 'string') {
        setRawText(d);
      } else {
        const pd = d as PortfolioData;
        if (pd.investments?.length) {
          setPortfolio(pd);
        } else {
          setRawText(JSON.stringify(d, null, 2));
        }
      }
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to connect to portfolio service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSummary(); }, []);

  const investments = portfolio?.investments ?? [];
  const totalNW  = portfolio?.total_networth      ?? 0;
  const invested = portfolio?.total_invested      ?? 0;
  const curVal   = portfolio?.total_current_value ?? 0;
  const gain     = curVal - invested;
  const gainPct  = invested > 0 ? (gain / invested) * 100 : 0;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.93, y: 20 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        style={{ boxShadow: '0 24px 72px rgba(20,184,166,0.2), 0 0 0 1px rgba(255,255,255,0.04)' }}
        className="fixed top-1/2 left-1/2 z-50 w-[500px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-2xl border border-teal-400/25 bg-[#07091a] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent */}
        <div className="h-px w-full flex-shrink-0 bg-gradient-to-r from-transparent via-teal-400/60 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-teal-400/12 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-teal-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white tracking-tight">My Networth</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Synced via INDmoney</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchSummary}
              disabled={loading}
              title="Refresh"
              className="h-7 w-7 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center hover:bg-white/10 transition disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white/8 hover:text-slate-300 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <AnimatePresence mode="wait">

            {/* Loading */}
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-3 py-20 text-slate-600"
              >
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[11px]">Fetching portfolio data…</span>
              </motion.div>
            )}

            {/* Error */}
            {!loading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-4 py-6 space-y-4"
              >
                <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-3">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
                </div>
                <button
                  onClick={fetchSummary}
                  className="w-full h-8 rounded-xl border border-teal-400/25 bg-teal-500/10 text-teal-300 text-[11px] hover:bg-teal-500/20 transition"
                >
                  Retry
                </button>
              </motion.div>
            )}

            {/* Raw text fallback */}
            {!loading && !error && rawText && (
              <motion.div
                key="raw"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-4 py-4"
              >
                <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-3">
                  <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-2">Portfolio Data</div>
                  <pre className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-52 overflow-y-auto scrollbar-thin">
                    {rawText}
                  </pre>
                </div>
              </motion.div>
            )}

            {/* Structured data */}
            {!loading && !error && portfolio && (
              <motion.div
                key="data"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-4 space-y-4"
              >

                {/* ── Chart + Metrics row ── */}
                <div className="flex gap-4 items-center">
                  <DonutChart
                    investments={investments}
                    totalLabel={fmtINR(totalNW)}
                    hoveredIdx={hoveredRow !== null ? hoveredRow : hoveredIdx}
                    onHover={setHoveredIdx}
                  />

                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <MetricCard label="Net Worth"  value={fmtINR(totalNW)} />
                    <MetricCard label="Invested"   value={fmtINR(invested)} />
                    <MetricCard
                      label="Total Gain"
                      value={`${gain >= 0 ? '+' : ''}${fmtINR(gain)}`}
                      sub={`${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}% overall`}
                      positive={gain >= 0}
                    />
                  </div>
                </div>

                {/* ── Gain pill ── */}
                <div className="flex items-center justify-center gap-1.5">
                  <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-[11px] font-medium ${
                    gain >= 0
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    {gain >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span>{gain >= 0 ? '+' : ''}{fmtINR(gain)}</span>
                    <span className="opacity-60">·</span>
                    <span>{gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%</span>
                  </div>
                </div>

                {/* ── Investment rows ── */}
                <div className="space-y-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-1">Asset Allocation</div>
                  {investments.map((inv, i) => (
                    <InvestmentRow
                      key={inv.asset_type}
                      inv={inv}
                      isHovered={hoveredRow === i}
                      onHover={(v) => setHoveredRow(v ? i : null)}
                      delay={i * 0.06}
                    />
                  ))}
                </div>

                {/* ── Quick ask ── */}
                {onVoice && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-2">Ask about</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {QUICK_ASKS.map(({ label, query }) => (
                        <button
                          key={label}
                          onClick={() => { onVoice(query); onClose(); }}
                          className="rounded-lg border border-teal-400/15 bg-teal-500/6 px-2 py-1.5 text-[10px] text-teal-300 hover:bg-teal-500/15 transition text-center"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-teal-400/10 flex-shrink-0 bg-black/15">
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-white/6 transition"
          >
            Close
          </button>
          <button
            onClick={() => window.open('https://indmoney.com', '_blank')}
            className="flex items-center gap-1.5 h-8 px-4 rounded-xl bg-teal-500/12 border border-teal-500/25 text-teal-300 text-[11px] font-medium hover:bg-teal-500/20 transition"
          >
            <ExternalLink className="h-3 w-3" />
            Open INDmoney
          </button>
        </div>
      </motion.div>
    </>
  );
}
