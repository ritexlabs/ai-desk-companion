import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, X, RefreshCw, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface StockRow {
  sym:    string;
  name:   string;
  broker: string;
  qty:    number;
  buy:    number;
  curr:   number;
  pnl:    number;
  pnlPct: number;
}

interface Props {
  spreadsheetId: string;
  googleToken?: string;
  onClose: () => void;
}

const ACCENT = '#34d399';

const PALETTE = [
  '#34d399', '#38bdf8', '#a78bfa', '#fbbf24',
  '#fb923c', '#f472b6', '#22d3ee', '#4ade80',
];

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtCurrency(n: number, compact = false): string {
  const abs = Math.abs(n);
  if (compact) {
    if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)} K`;
  }
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

// ── Donut chart ────────────────────────────────────────────────────────────────

interface BrokerTotal {
  broker: string;
  invested: number;
  current: number;
  pnl: number;
  pnlPct: number;
}

function CompactDonut({ brokerTotals, pnlPct }: { brokerTotals: BrokerTotal[]; pnlPct: number }) {
  const [hovIdx, setHovIdx] = useState(-1);
  const CX = 60, CY = 60, OR = 50, IR = 30;

  const total = brokerTotals.reduce((s, b) => s + b.current, 0);
  if (!total) return null;

  let angle = -Math.PI / 2;
  const arcs = brokerTotals.map((b, i) => {
    const sweep = (b.current / total) * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = CX + OR * Math.cos(angle), y1 = CY + OR * Math.sin(angle);
    const x2 = CX + OR * Math.cos(end),   y2 = CY + OR * Math.sin(end);
    const x3 = CX + IR * Math.cos(end),   y3 = CY + IR * Math.sin(end);
    const x4 = CX + IR * Math.cos(angle), y4 = CY + IR * Math.sin(angle);
    const la = sweep > Math.PI ? 1 : 0;
    const d = [
      `M${x1.toFixed(2)},${y1.toFixed(2)}`,
      `A${OR},${OR} 0 ${la},1 ${x2.toFixed(2)},${y2.toFixed(2)}`,
      `L${x3.toFixed(2)},${y3.toFixed(2)}`,
      `A${IR},${IR} 0 ${la},0 ${x4.toFixed(2)},${y4.toFixed(2)}Z`,
    ].join(' ');
    angle = end;
    return { d, color: PALETTE[i % PALETTE.length], broker: b, idx: i };
  });

  const hov = hovIdx >= 0 ? brokerTotals[hovIdx] : null;
  const displayPct = hov ? hov.pnlPct : pnlPct;
  const displayLabel = hov ? hov.broker : 'P&L';
  const displayColor = (hov ? hov.pnl : (pnlPct >= 0 ? 1 : -1)) >= 0 ? '#34d399' : '#fb7185';

  return (
    <svg width={120} height={120} viewBox="0 0 120 120" className="flex-shrink-0">
      <circle cx={CX} cy={CY} r={(OR + IR) / 2} fill="none"
        stroke="rgba(255,255,255,0.05)" strokeWidth={OR - IR} />
      {arcs.map(arc => (
        <path
          key={arc.idx} d={arc.d} fill={arc.color}
          style={{ opacity: hovIdx === -1 ? 1 : hovIdx === arc.idx ? 1 : 0.2, cursor: 'pointer', transition: 'opacity 0.15s' }}
          onMouseEnter={() => setHovIdx(arc.idx)}
          onMouseLeave={() => setHovIdx(-1)}
        />
      ))}
      <text x={CX} y={CY - 7} textAnchor="middle"
        style={{ fill: '#64748b', fontSize: '8px', fontFamily: 'JetBrains Mono, monospace' }}>
        {displayLabel.length > 7 ? displayLabel.slice(0, 7) + '…' : displayLabel}
      </text>
      <text x={CX} y={CY + 8} textAnchor="middle"
        style={{ fill: displayColor, fontSize: '11px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
        {displayPct >= 0 ? '+' : ''}{displayPct.toFixed(1)}%
      </text>
    </svg>
  );
}

// ── Full portfolio popup ───────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className="inline-flex flex-col ml-1" style={{ opacity: active ? 1 : 0.3 }}>
      <span style={{ fontSize: 7, color: active && dir === 'asc' ? ACCENT : undefined }}>▲</span>
      <span style={{ fontSize: 7, color: active && dir === 'desc' ? ACCENT : undefined }}>▼</span>
    </span>
  );
}

type SortKey = 'qty' | 'buy' | 'curr' | 'pnl' | 'pnlPct';

function PortfolioPopup({ rows, onClose }: { rows: StockRow[]; onClose: () => void }) {
  const [activeBroker, setActiveBroker] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });
  const [hidden, setHidden] = useState(false);

  const brokers = useMemo(() => ['all', ...new Set(rows.map(r => r.broker).filter(Boolean))], [rows]);

  const filtered = useMemo(() => {
    let list = activeBroker === 'all' ? rows : rows.filter(r => r.broker === activeBroker);
    if (sort.key) {
      const k = sort.key;
      list = [...list].sort((a, b) => sort.dir === 'asc' ? a[k] - b[k] : b[k] - a[k]);
    }
    return list;
  }, [rows, activeBroker, sort]);

  const totals = useMemo(() => {
    const invested = filtered.reduce((s, r) => s + r.buy * r.qty, 0);
    const current  = filtered.reduce((s, r) => s + r.curr * r.qty, 0);
    const pnl = current - invested;
    return { invested, current, pnl, pnlPct: invested ? (pnl / invested) * 100 : 0 };
  }, [filtered]);

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  const Th = ({ label, sortKey }: { label: string; sortKey?: SortKey }) => (
    <th
      className="py-2 px-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-slate-300 transition-colors font-mono"
      onClick={() => sortKey && toggleSort(sortKey)}
    >
      {label}{sortKey && <SortIcon active={sort.key === sortKey} dir={sort.dir} />}
    </th>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-[720px] flex flex-col overflow-hidden"
        style={{
          maxHeight: 'min(680px, 90vh)',
          background: 'rgba(6,10,20,0.97)',
          border: '1px solid rgba(52,211,153,0.15)',
          borderRadius: 20,
          boxShadow: '0 0 60px rgba(52,211,153,0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] flex-shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} color={ACCENT} />
            <span className="font-semibold text-slate-200 font-mono text-sm">Stock Portfolio</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold font-mono"
              style={{ background: `${ACCENT}18`, color: ACCENT }}>
              {rows.length} holdings
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setHidden(h => !h)}
              className="p-1.5 rounded-lg border border-white/10 bg-white/4 text-slate-400 hover:text-white hover:bg-white/8 transition">
              {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg border border-white/10 bg-white/4 text-slate-400 hover:text-white hover:bg-white/8 transition">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Broker tabs */}
        {brokers.length > 2 && (
          <div className="flex gap-1.5 px-6 py-3 overflow-x-auto border-b border-white/[0.06] flex-shrink-0">
            {brokers.map(b => (
              <button
                key={b}
                onClick={() => setActiveBroker(b)}
                className="px-3 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase tracking-wider whitespace-nowrap transition-all"
                style={activeBroker === b
                  ? { background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}40` }
                  : { background: 'rgba(255,255,255,0.03)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }
                }
              >
                {b === 'all' ? 'All Brokers' : b}
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0" style={{ background: 'rgba(6,10,20,0.97)' }}>
                <tr className="border-b border-white/[0.06]">
                  <Th label="Symbol" />
                  <Th label="Qty"     sortKey="qty" />
                  <Th label="Avg ₹"   sortKey="buy" />
                  <Th label="CMP ₹"   sortKey="curr" />
                  <Th label="P&L"     sortKey="pnl" />
                  <Th label="%"       sortKey="pnlPct" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const up = r.pnl >= 0;
                  const clr = up ? '#34d399' : '#fb7185';
                  return (
                    <tr key={r.sym + i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-200 font-mono text-xs">{r.sym}</span>
                        <p className="text-[9px] text-slate-600 uppercase tracking-wider">{r.broker}</p>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300 text-xs">{r.qty}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-400 text-xs">
                        {hidden ? '••••' : fmtCurrency(r.buy)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-200 font-medium text-xs">
                        {hidden ? '••••' : fmtCurrency(r.curr)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-xs" style={{ color: clr }}>
                        {up ? '+' : ''}{hidden ? '••••' : fmtCurrency(r.pnl)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono"
                          style={{ color: clr, background: up ? 'rgba(52,211,153,0.12)' : 'rgba(251,113,133,0.12)' }}>
                          {fmtPct(r.pnlPct)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer totals */}
        <div className="grid grid-cols-3 gap-3 px-6 py-4 border-t border-white/[0.06] flex-shrink-0">
          {[
            { label: 'Invested',      value: fmtCurrency(totals.invested, true), color: '#94a3b8' },
            { label: 'Current Value', value: fmtCurrency(totals.current,  true), color: '#e2e8f0' },
            { label: 'Overall P&L',   value: fmtCurrency(totals.pnl, true),      color: totals.pnl >= 0 ? '#34d399' : '#fb7185' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider mb-0.5 font-mono">{label}</p>
              <p className="text-sm font-bold tabular-nums font-mono" style={{ color }}>
                {hidden ? '••••••' : value}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// ── Main card ──────────────────────────────────────────────────────────────────

export function StocksPortfolio({ spreadsheetId, googleToken, onClose }: Props) {
  const [rows, setRows]       = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const [hidden, setHidden]   = useState(false);
  const [syncedAt, setSyncedAt] = useState('');

  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = spreadsheetId ? `?spreadsheet_id=${encodeURIComponent(spreadsheetId)}` : '';
      const headers: Record<string, string> = {};
      if (googleToken) headers['X-Google-Token'] = googleToken;
      const res = await fetch(`http://localhost:8787/api/stocks/portfolio${params}`, { headers });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* ignore */ }
        throw new Error(detail);
      }
      const data = await res.json();
      setRows(data.rows ?? []);
      setSyncedAt(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [spreadsheetId]);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + r.buy * r.qty, 0);
    const current  = rows.reduce((s, r) => s + r.curr * r.qty, 0);
    const pnl      = current - invested;
    return { invested, current, pnl, pnlPct: invested ? (pnl / invested) * 100 : 0 };
  }, [rows]);

  const brokerTotals = useMemo((): BrokerTotal[] => {
    const map: Record<string, BrokerTotal> = {};
    for (const r of rows) {
      const b = r.broker || 'Unknown';
      if (!map[b]) map[b] = { broker: b, invested: 0, current: 0, pnl: 0, pnlPct: 0 };
      map[b].invested += r.buy * r.qty;
      map[b].current  += r.curr * r.qty;
    }
    return Object.values(map).map(b => ({
      ...b,
      pnl:    b.current - b.invested,
      pnlPct: b.invested > 0 ? ((b.current - b.invested) / b.invested) * 100 : 0,
    })).sort((a, b) => b.current - a.current);
  }, [rows]);

  const { inProfit, inLoss } = useMemo(() => {
    let inProfit = 0, inLoss = 0;
    for (const r of rows) { r.pnl > 0 ? inProfit++ : r.pnl < 0 ? inLoss++ : null; }
    return { inProfit, inLoss };
  }, [rows]);

  const { topGainer, topLoser } = useMemo(() => {
    if (!rows.length) return { topGainer: null, topLoser: null };
    const withPnl = rows.filter(r => r.buy > 0).map(r => ({ sym: r.sym, pnl: r.pnl, pnlPct: r.pnlPct }));
    if (!withPnl.length) return { topGainer: null, topLoser: null };
    const sorted = [...withPnl].sort((a, b) => b.pnlPct - a.pnlPct);
    return { topGainer: sorted[0], topLoser: sorted[sorted.length - 1] };
  }, [rows]);

  const overallUp = totals.pnl >= 0;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Center modal */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(6,10,20,0.98)',
            border: '1px solid rgba(52,211,153,0.15)',
            boxShadow: '0 32px 80px rgba(52,211,153,0.08), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] flex-shrink-0"
            style={{ background: 'linear-gradient(to right, rgba(52,211,153,0.05), transparent)' }}>
            <div className="flex items-center gap-2.5">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="w-9 h-9 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>
                <TrendingUp size={16} color={ACCENT} />
              </motion.div>
              <div>
                <p className="text-sm font-semibold text-slate-200 font-mono">Stock Portfolio</p>
                <p className="text-[10px] text-slate-600 font-mono">
                  {loading ? 'Loading…' : error ? 'Connection error' : `${rows.length} holdings · ${syncedAt}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!loading && !error && rows.length > 0 && (
                <button onClick={() => setHidden(h => !h)}
                  className="p-1.5 rounded-lg border border-white/8 bg-white/3 text-slate-500 hover:text-slate-300 transition">
                  {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              )}
              <button onClick={fetchPortfolio}
                className="p-1.5 rounded-lg border border-white/8 bg-white/3 text-slate-500 hover:text-slate-300 transition">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose}
                className="p-1.5 rounded-lg border border-white/8 bg-white/3 text-slate-400 hover:text-white transition">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Loading */}
            {loading && (
              <div className="space-y-2 py-4">
                {[80, 65, 75, 55].map((w, i) => (
                  <div key={i} className="h-3 rounded-full animate-pulse"
                    style={{ width: `${w}%`, background: 'rgba(255,255,255,0.06)' }} />
                ))}
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertTriangle size={22} color="#f87171" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-red-300 font-semibold">Portfolio unavailable</p>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono leading-relaxed break-words max-w-[320px]">{error}</p>
                </div>
                {!spreadsheetId && (
                  <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-[10px] text-slate-500 space-y-1 w-full">
                    <p className="font-semibold text-slate-400">Setup required:</p>
                    <p>• Open Settings → Agents → Stock Market</p>
                    <p>• Paste your Google Sheet ID or use Browse</p>
                    <p>• Ensure Google is connected (Settings → Google)</p>
                  </div>
                )}
                <button onClick={fetchPortfolio}
                  className="px-4 py-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-xs text-emerald-300 hover:bg-emerald-400/20 transition font-mono">
                  Retry
                </button>
              </div>
            )}

            {/* Empty */}
            {!loading && !error && rows.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <TrendingUp size={28} color="rgba(100,116,139,0.4)" />
                <p className="text-sm text-slate-500">No holdings found</p>
                <p className="text-[11px] text-slate-600 leading-relaxed max-w-[280px]">
                  Make sure your Google Sheet has a header row with <span className="text-slate-400">Broker</span> and <span className="text-slate-400">Symbol</span> columns.
                </p>
              </div>
            )}

            {/* Data */}
            {!loading && !error && rows.length > 0 && (
              <>
                {/* Overall P&L banner */}
                <div className="rounded-xl px-4 py-3"
                  style={{
                    background: overallUp ? 'rgba(52,211,153,0.06)' : 'rgba(251,113,133,0.06)',
                    border: `1px solid ${overallUp ? 'rgba(52,211,153,0.15)' : 'rgba(251,113,133,0.15)'}`,
                  }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-mono uppercase tracking-wider text-slate-600">Total P&L</p>
                      <p className="text-xl font-bold font-mono tabular-nums mt-0.5"
                        style={{ color: overallUp ? '#34d399' : '#fb7185' }}>
                        {overallUp ? '+' : ''}{hidden ? '••••••' : fmtCurrency(totals.pnl, true)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-mono uppercase tracking-wider text-slate-600">Current</p>
                      <p className="text-sm font-semibold font-mono tabular-nums mt-0.5 text-slate-300">
                        {hidden ? '••••••' : fmtCurrency(totals.current, true)}
                      </p>
                      <p className="text-[10px] font-mono tabular-nums text-slate-600">
                        of {hidden ? '••••••' : fmtCurrency(totals.invested, true)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-xs font-semibold font-mono" style={{ color: overallUp ? '#34d399' : '#fb7185' }}>
                      {overallUp ? '▲' : '▼'} {Math.abs(totals.pnlPct).toFixed(2)}%
                    </span>
                    <span className="text-[10px] text-slate-600 font-mono">overall return</span>
                  </div>
                </div>

                {/* Donut + broker breakdown */}
                <div className="flex items-start gap-4">
                  <CompactDonut brokerTotals={brokerTotals} pnlPct={totals.pnlPct} />
                  <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                    {brokerTotals.map((b, i) => {
                      const up = b.pnl >= 0;
                      return (
                        <div key={b.broker} className="flex flex-col gap-0.5 px-2.5 py-2 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono truncate">{b.broker}</span>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] text-slate-600 font-mono">P&L</span>
                            <span className="text-[10px] font-mono font-semibold"
                              style={{ color: up ? '#34d399' : '#fb7185' }}>
                              {up ? '+' : ''}{hidden ? '••••' : fmtCurrency(b.pnl, true)}
                              {' '}({up ? '+' : ''}{b.pnlPct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Profit / loss count */}
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full font-mono"
                    style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
                    ▲ {inProfit} profit
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full font-mono"
                    style={{ background: 'rgba(251,113,133,0.1)', color: '#fb7185' }}>
                    ▼ {inLoss} loss
                  </span>
                </div>

                {/* Top gainer / loser */}
                {(topGainer || topLoser) && (
                  <div className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5 space-y-2">
                    <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider font-mono">Highlights</p>
                    {topGainer && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px]" style={{ color: '#34d399' }}>▲ BEST</span>
                        <span className="text-[11px] font-mono text-slate-300 flex-1 truncate">{topGainer.sym}</span>
                        <span className="text-[10px] font-semibold font-mono flex-shrink-0" style={{ color: '#34d399' }}>
                          +{topGainer.pnlPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {topLoser && topLoser.sym !== topGainer?.sym && (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px]" style={{ color: '#fb7185' }}>▼ WORST</span>
                        <span className="text-[11px] font-mono text-slate-300 flex-1 truncate">{topLoser.sym}</span>
                        <span className="text-[10px] font-semibold font-mono flex-shrink-0" style={{ color: '#fb7185' }}>
                          {topLoser.pnlPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* View all button */}
                <button
                  onClick={() => setPopupOpen(true)}
                  className="w-full py-2.5 rounded-xl border text-xs font-semibold font-mono uppercase tracking-wider transition-all hover:opacity-80"
                  style={{
                    color: ACCENT,
                    borderColor: 'rgba(52,211,153,0.2)',
                    background: 'rgba(52,211,153,0.05)',
                  }}>
                  View all {rows.length} holdings →
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Full table popup */}
      <AnimatePresence>
        {popupOpen && rows.length > 0 && (
          <PortfolioPopup rows={rows} onClose={() => setPopupOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
