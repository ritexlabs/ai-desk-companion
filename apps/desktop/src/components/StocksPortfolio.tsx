import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, X, RefreshCw, Eye, EyeOff, AlertTriangle,
  ChevronUp, ChevronDown, Activity, Layers3, FileText, Shield,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface StockRow {
  sym:     string;
  name:    string;
  broker:  string;
  qty:     number;
  buy:     number;
  curr:    number;
  pnl:     number;
  pnlPct:  number;
  source?: 'zerodha' | 'dhan' | 'sheet' | 'both' | 'zerodha+dhan' | 'zerodha+sheet';
}

interface PositionRow {
  sym:       string;
  product:   string;
  side:      string;
  qty:       number;
  buyPrice:  number;
  ltp:       number;
  pnl:       number;
}

interface OptionRow {
  strikePrice:  number;
  callLTP:      number;
  callOI:       number;
  callVolume:   number;
  putLTP:       number;
  putOI:        number;
  putVolume:    number;
}

interface OrderRow {
  orderId:    string;
  symbol:     string;
  side:       string;
  qty:        number;
  price:      number;
  status:     string;
  orderType:  string;
}

interface Props {
  spreadsheetId:    string;
  googleToken?:     string;
  dhanEnabled?:     boolean;
  tradeEnabled?:    boolean;
  zerodhaEnabled?:  boolean;
  onClose:          () => void;
}

type Tab = 'overview' | 'holdings' | 'dhan' | 'zerodha' | 'positions' | 'options' | 'orders';

// ── Colours & palette ─────────────────────────────────────────────────────────

const ACCENT  = '#22C55E';
const RED     = '#F87171';
const AMBER   = '#FBBF24';
const PALETTE = ['#22C55E', '#38BDF8', '#A78BFA', '#FBBF24', '#FB923C', '#F472B6', '#22D3EE'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n: number, compact = false): string {
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

function pnlColor(n: number) { return n >= 0 ? ACCENT : RED; }

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({
  id, label, Icon, active, onClick, badge,
}: {
  id: string; label: string; Icon: React.FC<any>; active: boolean; onClick: () => void; badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all"
      style={active
        ? { background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}40` }
        : { background: 'rgba(255,255,255,0.03)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }
      }
    >
      <Icon size={10} />
      {label}
      {badge && (
        <span className="px-1 py-px rounded text-[8px]"
          style={{ background: active ? `${ACCENT}30` : 'rgba(255,255,255,0.08)', color: active ? ACCENT : '#64748b' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Mini donut ────────────────────────────────────────────────────────────────

function MiniDonut({ slices, pnlPct }: { slices: { value: number; color: string; label: string }[]; pnlPct: number }) {
  const [hov, setHov] = useState(-1);
  const CX = 48, CY = 48, OR = 40, IR = 24;
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return null;

  let angle = -Math.PI / 2;
  const arcs = slices.map((sl, i) => {
    const sweep = (sl.value / total) * 2 * Math.PI;
    const end   = angle + sweep;
    const x1 = CX + OR * Math.cos(angle); const y1 = CY + OR * Math.sin(angle);
    const x2 = CX + OR * Math.cos(end);   const y2 = CY + OR * Math.sin(end);
    const x3 = CX + IR * Math.cos(end);   const y3 = CY + IR * Math.sin(end);
    const x4 = CX + IR * Math.cos(angle); const y4 = CY + IR * Math.sin(angle);
    const la = sweep > Math.PI ? 1 : 0;
    const d = `M${x1.toFixed(1)},${y1.toFixed(1)} A${OR},${OR} 0 ${la},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${x3.toFixed(1)},${y3.toFixed(1)} A${IR},${IR} 0 ${la},0 ${x4.toFixed(1)},${y4.toFixed(1)}Z`;
    angle = end;
    return { d, ...sl, i };
  });

  const hovLabel = hov >= 0 ? slices[hov]?.label : 'P&L';
  const displayPct = pnlPct;
  const displayClr = pnlPct >= 0 ? ACCENT : RED;

  return (
    <svg width={96} height={96} viewBox="0 0 96 96" className="flex-shrink-0">
      {arcs.map(arc => (
        <path
          key={arc.i} d={arc.d} fill={arc.color}
          style={{ opacity: hov === -1 ? 1 : hov === arc.i ? 1 : 0.18, cursor: 'pointer', transition: 'opacity 0.15s' }}
          onMouseEnter={() => setHov(arc.i)} onMouseLeave={() => setHov(-1)}
        />
      ))}
      <text x={CX} y={CY - 5} textAnchor="middle" style={{ fill: '#64748b', fontSize: '7px', fontFamily: 'monospace' }}>
        {hovLabel.length > 8 ? hovLabel.slice(0, 8) + '…' : hovLabel}
      </text>
      <text x={CX} y={CY + 8} textAnchor="middle" style={{ fill: displayClr, fontSize: '10px', fontWeight: 700, fontFamily: 'monospace' }}>
        {displayPct >= 0 ? '+' : ''}{displayPct.toFixed(1)}%
      </text>
    </svg>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIco({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className="inline-flex flex-col ml-1" style={{ opacity: active ? 1 : 0.25 }}>
      <ChevronUp  size={7} style={{ color: active && dir === 'asc'  ? ACCENT : undefined }} />
      <ChevronDown size={7} style={{ color: active && dir === 'desc' ? ACCENT : undefined }} />
    </span>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2 py-2">
      {[80, 65, 75, 55, 70].map((w, i) => (
        <div key={i} className="h-2.5 rounded-full animate-pulse"
          style={{ width: `${w}%`, background: 'rgba(255,255,255,0.05)' }} />
      ))}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  rows, hidden, dhanEnabled, zerodhaEnabled,
}: {
  rows: StockRow[]; hidden: boolean; dhanEnabled: boolean; zerodhaEnabled: boolean;
}) {
  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + r.buy * r.qty, 0);
    const current  = rows.reduce((s, r) => s + r.curr * r.qty, 0);
    const pnl = current - invested;
    return { invested, current, pnl, pnlPct: invested ? (pnl / invested) * 100 : 0 };
  }, [rows]);

  const brokers = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach(r => { m[r.broker] = (m[r.broker] || 0) + r.curr * r.qty; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const sources = useMemo(() => {
    const zerodha = rows.filter(r => r.source === 'zerodha' || r.source === 'zerodha+dhan' || r.source === 'zerodha+sheet').length;
    const dhan    = rows.filter(r => r.source === 'dhan' || r.source === 'both').length;
    const sheet   = rows.filter(r => r.source === 'sheet').length;
    return { zerodha, dhan, sheet };
  }, [rows]);

  const top5 = useMemo(() =>
    [...rows].sort((a, b) => Math.abs(b.pnlPct) - Math.abs(a.pnlPct)).slice(0, 5),
  [rows]);

  const overallUp = totals.pnl >= 0;
  const mask = '••••••';

  return (
    <div className="space-y-3">
      {/* P&L banner */}
      <div className="rounded-2xl px-4 py-3"
        style={{
          background: overallUp ? 'rgba(34,197,94,0.06)' : 'rgba(248,113,113,0.06)',
          border: `1px solid ${overallUp ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)'}`,
        }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Total P&L</p>
            <p className="text-2xl font-bold font-mono tabular-nums mt-0.5" style={{ color: overallUp ? ACCENT : RED }}>
              {overallUp ? '+' : ''}{hidden ? mask : fmtINR(totals.pnl, true)}
            </p>
            <p className="text-[10px] font-mono tabular-nums mt-0.5" style={{ color: overallUp ? ACCENT : RED }}>
              {fmtPct(totals.pnlPct)} overall return
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Current Value</p>
            <p className="text-sm font-bold font-mono tabular-nums mt-0.5 text-slate-200">
              {hidden ? mask : fmtINR(totals.current, true)}
            </p>
            <p className="text-[10px] font-mono text-slate-600">
              of {hidden ? mask : fmtINR(totals.invested, true)}
            </p>
          </div>
        </div>
      </div>

      {/* Source badges */}
      {(dhanEnabled || zerodhaEnabled) && (
        <div className="flex gap-2 flex-wrap">
          {zerodhaEnabled && sources.zerodha > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-semibold px-2.5 py-1 rounded-full font-mono"
              style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
              Zerodha · {sources.zerodha} holding{sources.zerodha !== 1 ? 's' : ''}
            </span>
          )}
          {dhanEnabled && sources.dhan > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-semibold px-2.5 py-1 rounded-full font-mono"
              style={{ background: `${ACCENT}12`, color: ACCENT, border: `1px solid ${ACCENT}30` }}>
              Dhan · {sources.dhan} holding{sources.dhan !== 1 ? 's' : ''}
            </span>
          )}
          {sources.sheet > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-semibold px-2.5 py-1 rounded-full font-mono"
              style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
              Sheet · {sources.sheet} holding{sources.sheet !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Donut + broker breakdown */}
      {brokers.length > 0 && (
        <div className="flex items-start gap-3">
          <MiniDonut
            slices={brokers.map(([b, v], i) => ({ label: b, value: v, color: PALETTE[i % PALETTE.length] }))}
            pnlPct={totals.pnlPct}
          />
          <div className="flex-1 space-y-1.5 min-w-0">
            {brokers.map(([b, v], i) => (
              <div key={b} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="text-[10px] text-slate-400 font-mono flex-1 truncate">{b}</span>
                <span className="text-[10px] font-semibold text-slate-300 font-mono tabular-nums">
                  {hidden ? '••••' : fmtINR(v, true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top movers */}
      {top5.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">Top Movers</p>
          <div className="space-y-1">
            {top5.map((r) => {
              const up = r.pnl >= 0;
              return (
                <div key={r.sym} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  {up
                    ? <ChevronUp  size={10} style={{ color: ACCENT }} className="flex-shrink-0" />
                    : <ChevronDown size={10} style={{ color: RED }}   className="flex-shrink-0" />
                  }
                  <span className="text-[10px] text-slate-300 font-mono font-semibold flex-1">{r.sym}</span>
                  <span className="text-[10px] font-mono font-semibold" style={{ color: pnlColor(r.pnl) }}>
                    {fmtPct(r.pnlPct)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Holdings tab ──────────────────────────────────────────────────────────────

type HoldSortKey = 'qty' | 'buy' | 'curr' | 'pnl' | 'pnlPct';

function HoldingsTab({ rows, hidden, broker }: { rows: StockRow[]; hidden: boolean; broker?: 'dhan' | 'zerodha' }) {
  const [sort, setSort] = useState<{ key: HoldSortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });
  const [search, setSearch] = useState('');

  const baseRows = useMemo(() => {
    if (!broker) return rows;
    if (broker === 'dhan')    return rows.filter(r => r.source === 'dhan' || r.source === 'both' || r.source === 'zerodha+dhan');
    if (broker === 'zerodha') return rows.filter(r => r.source === 'zerodha' || r.source === 'zerodha+dhan' || r.source === 'zerodha+sheet');
    return rows;
  }, [rows, broker]);

  const filtered = useMemo(() => {
    let list = baseRows.filter(r => !search || r.sym.toLowerCase().includes(search.toLowerCase()));
    if (sort.key) {
      const k = sort.key;
      list = [...list].sort((a, b) => sort.dir === 'asc' ? a[k] - b[k] : b[k] - a[k]);
    }
    return list;
  }, [baseRows, sort, search]);

  function tog(key: HoldSortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  const Th = ({ label, sk }: { label: string; sk?: HoldSortKey }) => (
    <th
      className="py-2 px-2 text-left text-[9px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap font-mono transition-colors"
      style={{ color: sk && sort.key === sk ? ACCENT : '#475569' }}
      onClick={() => sk && tog(sk)}
    >
      {label}{sk && <SortIco active={sort.key === sk} dir={sort.dir} />}
    </th>
  );

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search symbol…"
        className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-400/40 focus:outline-none font-mono"
      />
      <div className="overflow-x-auto rounded-xl border border-white/6">
        <table className="w-full min-w-[480px] text-xs">
          <thead style={{ background: 'rgba(6,10,20,0.9)' }}>
            <tr className="border-b border-white/[0.06]">
              <Th label="Symbol" />
              <Th label="Qty"    sk="qty" />
              <Th label="Avg ₹" sk="buy" />
              <Th label="CMP ₹" sk="curr" />
              <Th label="P&L"   sk="pnl" />
              <Th label="%"     sk="pnlPct" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const clr = pnlColor(r.pnl);
              return (
                <tr key={r.sym + i} className="border-b border-white/[0.04] hover:bg-white/[0.015] transition-colors">
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-200 font-mono text-[11px]">{r.sym}</span>
                      {(r.source === 'zerodha' || r.source === 'zerodha+dhan' || r.source === 'zerodha+sheet') && (
                        <span className="text-[8px] px-1 py-px rounded"
                          style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>Z</span>
                      )}
                      {(r.source === 'dhan' || r.source === 'both') && (
                        <span className="text-[8px] px-1 py-px rounded"
                          style={{ background: `${ACCENT}18`, color: ACCENT }}>D</span>
                      )}
                      {r.source === 'sheet' && (
                        <span className="text-[8px] px-1 py-px rounded"
                          style={{ background: 'rgba(148,163,184,0.12)', color: '#94a3b8' }}>S</span>
                      )}
                    </div>
                    <p className="text-[8px] text-slate-600 uppercase tracking-wider font-mono">{r.broker}</p>
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums text-slate-300 text-[11px]">{r.qty}</td>
                  <td className="py-2 px-2 font-mono tabular-nums text-slate-500 text-[11px]">
                    {hidden ? '••••' : fmtINR(r.buy)}
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums text-slate-200 font-medium text-[11px]">
                    {hidden ? '••••' : fmtINR(r.curr)}
                  </td>
                  <td className="py-2 px-2 font-mono tabular-nums font-semibold text-[11px]" style={{ color: clr }}>
                    {r.pnl >= 0 ? '+' : ''}{hidden ? '••••' : fmtINR(r.pnl)}
                  </td>
                  <td className="py-2 px-2">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full font-mono"
                      style={{ color: clr, background: r.pnl >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)' }}>
                      {fmtPct(r.pnlPct)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-slate-600 text-xs py-6 font-mono">No holdings found</p>
        )}
      </div>
    </div>
  );
}

// ── Option Chain tab ──────────────────────────────────────────────────────────

function OptionChainTab({ dhanEnabled }: { dhanEnabled?: boolean }) {
  const [symbol, setSymbol] = useState('NIFTY');
  const [data, setData]     = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'MIDCPNIFTY', 'FINNIFTY', 'RELIANCE', 'TCS', 'INFY'];

  async function fetchChain() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ symbol });
      const res = await fetch(`http://localhost:8788/api/dhan/option-chain?${params}`);
      const resp = await res.json();
      if (!resp.ok) throw new Error(resp.error ?? `HTTP ${res.status}`);
      const raw = resp.data;
      if (Array.isArray(raw)) {
        setData(raw);
      } else if (raw && typeof raw === 'object') {
        const list: OptionRow[] = [];
        const strikes: number[] = raw.strikes || Object.keys(raw).map(Number).filter(Boolean);
        for (const s of strikes) {
          const c = raw[s]?.call || raw.calls?.[s] || {};
          const p = raw[s]?.put  || raw.puts?.[s]  || {};
          list.push({
            strikePrice: s,
            callLTP:    c.ltp    ?? c.lastPrice ?? 0,
            callOI:     c.oi     ?? c.openInterest ?? 0,
            callVolume: c.volume ?? c.totalTradedVolume ?? 0,
            putLTP:     p.ltp    ?? p.lastPrice ?? 0,
            putOI:      p.oi     ?? p.openInterest ?? 0,
            putVolume:  p.volume ?? p.totalTradedVolume ?? 0,
          });
        }
        setData(list.sort((a, b) => a.strikePrice - b.strikePrice));
      } else {
        setData([]);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch option chain');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (dhanEnabled) fetchChain(); }, [symbol, dhanEnabled]);

  if (!dhanEnabled) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertTriangle size={24} color="#64748b" />
        <div>
          <p className="text-sm text-slate-400">Dhan not connected</p>
          <p className="text-[11px] text-slate-600 mt-1">Connect Dhan in Settings → Stock Market → Dhan to view option chains.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {SYMBOLS.map(s => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all"
            style={symbol === s
              ? { background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}40` }
              : { background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            {s}
          </button>
        ))}
        <input
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          placeholder="Custom symbol"
          className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-black/30 border border-white/8 text-slate-300 placeholder-slate-600 w-28 focus:outline-none focus:border-emerald-400/30"
        />
        <button
          onClick={fetchChain}
          disabled={loading}
          className="ml-auto px-3 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all border"
          style={{ background: `${ACCENT}12`, color: ACCENT, borderColor: `${ACCENT}40` }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-400/8 border border-red-400/20 text-[11px] text-red-300">
          <AlertTriangle size={11} /> {error}
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/6">
          <table className="w-full min-w-[560px] text-[10px]">
            <thead style={{ background: 'rgba(6,10,20,0.9)' }}>
              <tr>
                <th colSpan={3} className="py-1.5 px-2 text-[9px] font-mono uppercase text-emerald-500 text-center border-b border-white/6">CALL</th>
                <th className="py-1.5 px-2 text-[9px] font-mono uppercase text-slate-500 text-center border-b border-white/6">STRIKE</th>
                <th colSpan={3} className="py-1.5 px-2 text-[9px] font-mono uppercase text-red-400 text-center border-b border-white/6">PUT</th>
              </tr>
              <tr className="border-b border-white/6">
                {['OI', 'Vol', 'LTP'].map(h => (
                  <th key={`c-${h}`} className="py-1.5 px-2 text-[9px] font-mono text-slate-600 text-right">{h}</th>
                ))}
                <th className="py-1.5 px-2 text-[9px] font-mono text-slate-400 text-center">Strike</th>
                {['LTP', 'Vol', 'OI'].map(h => (
                  <th key={`p-${h}`} className="py-1.5 px-2 text-[9px] font-mono text-slate-600 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.strikePrice} className="border-b border-white/[0.03] hover:bg-white/[0.015]">
                  <td className="py-1 px-2 font-mono tabular-nums text-slate-500 text-right">{(row.callOI / 1000).toFixed(0)}K</td>
                  <td className="py-1 px-2 font-mono tabular-nums text-slate-500 text-right">{(row.callVolume / 1000).toFixed(0)}K</td>
                  <td className="py-1 px-2 font-mono tabular-nums font-semibold text-right" style={{ color: ACCENT }}>{row.callLTP}</td>
                  <td className="py-1 px-2 font-mono tabular-nums font-bold text-slate-200 text-center">{row.strikePrice}</td>
                  <td className="py-1 px-2 font-mono tabular-nums font-semibold text-left" style={{ color: RED }}>{row.putLTP}</td>
                  <td className="py-1 px-2 font-mono tabular-nums text-slate-500 text-left">{(row.putVolume / 1000).toFixed(0)}K</td>
                  <td className="py-1 px-2 font-mono tabular-nums text-slate-500 text-left">{(row.putOI / 1000).toFixed(0)}K</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <p className="text-center text-slate-600 text-xs py-6 font-mono">No option chain data — click Refresh to load</p>
      )}
    </div>
  );
}

// ── Orders tab ────────────────────────────────────────────────────────────────

function OrdersTab({ dhanEnabled }: { dhanEnabled?: boolean }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const fetchOrders = useCallback(async () => {
    if (!dhanEnabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:8788/api/dhan/orders');
      const resp = await res.json();
      if (!resp.ok) throw new Error(resp.error ?? `HTTP ${res.status}`);
      const raw = resp.data;
      if (Array.isArray(raw)) {
        setOrders(raw.map((o: any) => ({
          orderId:   o.orderId    ?? o.order_id    ?? '',
          symbol:    o.symbol     ?? o.tradingSymbol ?? o.security ?? '',
          side:      o.transactionType ?? o.side ?? o.orderType ?? '',
          qty:       o.quantity   ?? o.qty ?? 0,
          price:     o.price      ?? o.averageTradedPrice ?? 0,
          status:    o.orderStatus ?? o.status ?? '',
          orderType: o.orderType  ?? o.price_type ?? '',
        })));
      } else {
        setOrders([]);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [dhanEnabled]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  if (!dhanEnabled) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertTriangle size={24} color="#64748b" />
        <p className="text-sm text-slate-400">Connect Dhan to view your orders</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Today's Orders</p>
        <button onClick={fetchOrders} disabled={loading}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition">
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-400/8 border border-red-400/20 text-[11px] text-red-300">
          <AlertTriangle size={11} /> {error}
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && orders.length > 0 && (
        <div className="rounded-xl border border-white/6 overflow-hidden">
          {orders.map((o, i) => {
            const isBuy = o.side?.toUpperCase().includes('BUY');
            const clr   = isBuy ? ACCENT : RED;
            return (
              <div key={o.orderId + i} className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015]">
                <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded"
                  style={{ color: clr, background: `${clr}18`, border: `1px solid ${clr}30` }}>
                  {o.side?.toUpperCase() || '—'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-slate-200 font-mono">{o.symbol}</p>
                  <p className="text-[9px] text-slate-600 font-mono">{o.orderType} · {o.qty} shares</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-mono tabular-nums text-slate-300">{o.price ? fmtINR(o.price) : '—'}</p>
                  <p className="text-[9px] font-mono text-slate-500">{o.status}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <p className="text-center text-slate-600 text-xs py-6 font-mono">No orders today</p>
      )}
    </div>
  );
}

// ── Zerodha Positions tab ─────────────────────────────────────────────────────

function ZerodhaPositionsTab({ zerodhaEnabled }: { zerodhaEnabled?: boolean }) {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const fetchPositions = useCallback(async () => {
    if (!zerodhaEnabled) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('http://localhost:8788/api/zerodha/positions');
      const resp = await res.json();
      if (!resp.ok) throw new Error(resp.error ?? `HTTP ${res.status}`);
      const raw = resp.data;
      const list = Array.isArray(raw) ? raw : (raw?.net ?? raw?.day ?? []);
      setPositions((list as any[]).map((p: any) => ({
        sym:      p.tradingsymbol ?? p.symbol ?? '',
        product:  p.product ?? '',
        side:     p.quantity > 0 ? 'LONG' : p.quantity < 0 ? 'SHORT' : 'FLAT',
        qty:      Math.abs(p.quantity ?? 0),
        buyPrice: p.average_price ?? p.buy_price ?? 0,
        ltp:      p.last_price ?? p.ltp ?? 0,
        pnl:      p.pnl ?? p.unrealised ?? 0,
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch positions');
    } finally {
      setLoading(false);
    }
  }, [zerodhaEnabled]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  if (!zerodhaEnabled) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertTriangle size={24} color="#64748b" />
        <div>
          <p className="text-sm text-slate-400">Zerodha not connected</p>
          <p className="text-[11px] text-slate-600 mt-1">Connect Zerodha in Settings → Stock Market → Zerodha to view positions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600">Intraday Positions</p>
        <button onClick={fetchPositions} disabled={loading}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition">
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-400/8 border border-red-400/20 text-[11px] text-red-300">
          <AlertTriangle size={11} /> {error}
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && positions.length > 0 && (
        <div className="rounded-xl border border-white/6 overflow-hidden">
          {positions.map((p, i) => {
            const up  = p.pnl >= 0;
            const clr = up ? ACCENT : RED;
            return (
              <div key={p.sym + i} className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015]">
                <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded"
                  style={{ color: p.side === 'LONG' ? ACCENT : p.side === 'SHORT' ? RED : '#64748b',
                           background: p.side === 'LONG' ? `${ACCENT}18` : p.side === 'SHORT' ? `${RED}18` : 'rgba(255,255,255,0.05)',
                           border: `1px solid ${p.side === 'LONG' ? `${ACCENT}30` : p.side === 'SHORT' ? `${RED}30` : 'rgba(255,255,255,0.1)'}` }}>
                  {p.side}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-slate-200 font-mono">{p.sym}</p>
                  <p className="text-[9px] text-slate-600 font-mono">{p.product} · {p.qty} qty</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-mono tabular-nums font-semibold" style={{ color: clr }}>
                    {up ? '+' : ''}{fmtINR(p.pnl)}
                  </p>
                  <p className="text-[9px] font-mono text-slate-500">LTP {fmtINR(p.ltp)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && positions.length === 0 && (
        <p className="text-center text-slate-600 text-xs py-6 font-mono">No open positions today</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StocksPortfolio({
  spreadsheetId, googleToken, dhanEnabled, tradeEnabled, zerodhaEnabled, onClose,
}: Props) {
  const [tab, setTab]           = useState<Tab>('overview');
  const [hidden, setHidden]     = useState(false);
  const [rows, setRows]         = useState<StockRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [syncedAt, setSyncedAt] = useState('');
  const [zerodhaError, setZerodhaError]         = useState('');
  const [zerodhaIsAuthError, setZerodhaIsAuthError] = useState(false);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    setError('');
    setZerodhaError('');
    setZerodhaIsAuthError(false);
    try {
      // Fetch sheet + Dhan + Zerodha holdings in parallel
      const sheetPromise = (async (): Promise<StockRow[]> => {
        if (!spreadsheetId) return [];
        const params  = `?spreadsheet_id=${encodeURIComponent(spreadsheetId)}`;
        const headers: Record<string, string> = {};
        if (googleToken) headers['X-Google-Token'] = googleToken;
        const res = await fetch(`http://localhost:8787/api/stocks/portfolio${params}`, { headers });
        if (!res.ok) return [];
        const d = await res.json();
        return (d.rows ?? []).map((r: any) => ({ ...r, source: 'sheet' as const }));
      })();

      const dhanPromise = (async (): Promise<StockRow[]> => {
        if (!dhanEnabled) return [];
        const res = await fetch('http://localhost:8788/api/dhan/holdings');
        const resp = await res.json();
        if (!resp.ok) return [];
        const raw = resp.data;
        const list: any[] = Array.isArray(raw) ? raw
          : Array.isArray(raw?.data)     ? raw.data
          : Array.isArray(raw?.holdings) ? raw.holdings
          : [];
        return list.map((h: any) => ({
          sym:    h.tradingSymbol ?? h.symbol ?? '',
          name:   h.tradingSymbol ?? h.symbol ?? '',
          broker: 'Dhan',
          qty:    h.totalQty     ?? h.quantity ?? 0,
          buy:    h.avgCostPrice ?? h.buyAvg   ?? 0,
          curr:   h.lastTradedPrice ?? h.ltp   ?? 0,
          pnl:    h.unrealizedPnl  ?? h.pnl    ?? 0,
          pnlPct: h.unrealizedPnlPercent ?? 0,
          source: 'dhan' as const,
        }));
      })();

      const zerodhaPromise = (async (): Promise<StockRow[]> => {
        if (!zerodhaEnabled) return [];
        const res = await fetch('http://localhost:8788/api/zerodha/holdings');
        const resp = await res.json();
        if (!resp.ok) {
          const isAuth = resp.authRequired || /login|auth|session/i.test(resp.error ?? '');
          setZerodhaIsAuthError(isAuth);
          setZerodhaError(
            isAuth
              ? 'Reconnect in Settings → Stock Market → Zerodha, then click Retry.'
              : (resp.error ?? 'Failed to load Zerodha holdings')
          );
          return [];
        }
        const raw = resp.data;
        const list: any[] = Array.isArray(raw) ? raw
          : Array.isArray(raw?.holdings) ? raw.holdings
          : Array.isArray(raw?.data)     ? raw.data
          : [];
        return list.map((h: any) => ({
          sym:    h.tradingsymbol ?? h.symbol ?? '',
          name:   h.tradingsymbol ?? h.symbol ?? '',
          broker: 'Zerodha',
          qty:    h.quantity   ?? 0,
          buy:    h.average_price ?? 0,
          curr:   h.last_price ?? h.ltp ?? 0,
          pnl:    h.pnl    ?? 0,
          pnlPct: (h.average_price && h.last_price)
            ? ((h.last_price - h.average_price) / h.average_price) * 100
            : 0,
          source: 'zerodha' as const,
        }));
      })();

      const [sheetRows, dhanRows, zerodhaRows] = await Promise.all([sheetPromise, dhanPromise, zerodhaPromise]);

      // 3-way merge: Zerodha > Dhan > Sheet (priority for duplicate symbols)
      const merged: StockRow[] = [...zerodhaRows];
      const zerodhaSyms = new Set(zerodhaRows.map(r => r.sym.toUpperCase()));

      for (const r of dhanRows) {
        const sym = r.sym.toUpperCase();
        if (zerodhaSyms.has(sym)) {
          const idx = merged.findIndex(m => m.sym.toUpperCase() === sym);
          if (idx >= 0) merged[idx] = { ...merged[idx], source: 'zerodha+dhan' };
        } else {
          merged.push(r);
        }
      }

      const mergedSyms = new Set(merged.map(r => r.sym.toUpperCase()));
      for (const r of sheetRows) {
        const sym = r.sym.toUpperCase();
        if (zerodhaSyms.has(sym)) {
          const idx = merged.findIndex(m => m.sym.toUpperCase() === sym);
          if (idx >= 0 && merged[idx].source === 'zerodha') merged[idx] = { ...merged[idx], source: 'zerodha+sheet' };
        } else if (mergedSyms.has(sym)) {
          const idx = merged.findIndex(m => m.sym.toUpperCase() === sym);
          if (idx >= 0 && merged[idx].source === 'dhan') merged[idx] = { ...merged[idx], source: 'both' };
        } else {
          merged.push(r);
          mergedSyms.add(sym);
        }
      }

      setRows(merged);
      setSyncedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [spreadsheetId, googleToken, dhanEnabled, zerodhaEnabled]);

  useEffect(() => { fetchHoldings(); }, [fetchHoldings]);

  const totalInvested = rows.reduce((s, r) => s + r.buy * r.qty, 0);
  const totalCurrent  = rows.reduce((s, r) => s + r.curr * r.qty, 0);
  const overallPnl    = totalCurrent - totalInvested;
  const overallUp     = overallPnl >= 0;

  // Footer rows: filter by active tab so footer reflects what's on screen
  const footerRows = useMemo(() => {
    if (tab === 'dhan')    return rows.filter(r => r.source === 'dhan' || r.source === 'both' || r.source === 'zerodha+dhan');
    if (tab === 'zerodha') return rows.filter(r => r.source === 'zerodha' || r.source === 'zerodha+dhan' || r.source === 'zerodha+sheet');
    if (tab === 'overview' || tab === 'holdings') return rows;
    return null; // positions, options, orders — no footer
  }, [rows, tab]);

  const footerLabel    = tab === 'dhan' ? 'Dhan' : tab === 'zerodha' ? 'Zerodha' : 'All Holdings';
  const footerInvested = (footerRows ?? []).reduce((s, r) => s + r.buy * r.qty, 0);
  const footerCurrent  = (footerRows ?? []).reduce((s, r) => s + r.curr * r.qty, 0);
  const footerPnl      = footerCurrent - footerInvested;
  const footerUp       = footerPnl >= 0;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 32, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-full max-w-2xl flex flex-col rounded-3xl overflow-hidden"
          style={{
            maxHeight: 'min(720px, 92vh)',
            background: 'rgba(4,8,18,0.99)',
            border: `1px solid ${overallUp ? 'rgba(34,197,94,0.18)' : 'rgba(248,113,113,0.18)'}`,
            boxShadow: `0 40px 100px ${overallUp ? 'rgba(34,197,94,0.07)' : 'rgba(248,113,113,0.07)'}, 0 0 0 1px rgba(255,255,255,0.04)`,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] flex-shrink-0"
            style={{ background: `linear-gradient(to right, ${overallUp ? 'rgba(34,197,94,0.05)' : 'rgba(248,113,113,0.05)'}, transparent)` }}>
            <div className="flex items-center gap-2.5">
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: `${ACCENT}14`, border: `1px solid ${ACCENT}28` }}>
                <TrendingUp size={14} color={ACCENT} />
              </motion.div>
              <div>
                <p className="text-sm font-semibold text-slate-200 font-mono">Stock Portfolio</p>
                <p className="text-[9px] text-slate-600 font-mono">
                  {loading ? 'Loading…' : error ? 'Error' : `${rows.length} holdings · ${syncedAt}`}
                </p>
              </div>
              {!loading && !error && rows.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold font-mono ml-1"
                  style={{ background: overallUp ? `${ACCENT}14` : `${RED}14`, color: overallUp ? ACCENT : RED }}>
                  {overallUp ? '+' : ''}{hidden ? '••' : overallPnl.toFixed(0) !== '0' ? fmtINR(overallPnl, true) : fmtPct(overallPnl / totalInvested * 100)}
                </span>
              )}
              {zerodhaEnabled && (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold"
                  style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
                  ZERODHA
                </span>
              )}
              {dhanEnabled && (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold"
                  style={{ background: `${ACCENT}10`, color: ACCENT }}>
                  DHAN
                </span>
              )}
              {tradeEnabled && (
                <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold"
                  style={{ background: `${AMBER}14`, color: AMBER }}>
                  <Shield size={8} /> TRADE ON
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setHidden(h => !h)}
                className="p-1.5 rounded-lg border border-white/8 bg-white/3 text-slate-500 hover:text-slate-300 transition">
                {hidden ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button onClick={fetchHoldings}
                className="p-1.5 rounded-lg border border-white/8 bg-white/3 text-slate-500 hover:text-slate-300 transition">
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose}
                className="p-1.5 rounded-lg border border-white/8 bg-white/3 text-slate-400 hover:text-white transition">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 px-5 py-2.5 border-b border-white/[0.06] flex-shrink-0 overflow-x-auto">
            <TabBtn id="overview"  label="Overview"   Icon={Activity}    active={tab === 'overview'}  onClick={() => setTab('overview')}  badge={rows.length > 0 ? String(rows.length) : undefined} />
            <TabBtn id="holdings"  label="All"        Icon={Layers3}     active={tab === 'holdings'}  onClick={() => setTab('holdings')} />
            {dhanEnabled && <TabBtn id="dhan"     label="Dhan"     Icon={TrendingUp}  active={tab === 'dhan'}     onClick={() => setTab('dhan')} />}
            {zerodhaEnabled && <TabBtn id="zerodha" label="Zerodha"  Icon={TrendingUp}  active={tab === 'zerodha'}  onClick={() => setTab('zerodha')} />}
            {zerodhaEnabled && <TabBtn id="positions" label="Positions" Icon={Activity} active={tab === 'positions'} onClick={() => setTab('positions')} />}
            <TabBtn id="options"   label="Options"    Icon={TrendingUp}  active={tab === 'options'}   onClick={() => setTab('options')} />
            <TabBtn id="orders"    label="Orders"     Icon={FileText}    active={tab === 'orders'}    onClick={() => setTab('orders')} />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* Loading state */}
            {loading && tab !== 'options' && tab !== 'orders' && (
              <Skeleton />
            )}

            {/* Error state */}
            {!loading && error && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle size={20} color="#f87171" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-red-300 font-semibold">Portfolio unavailable</p>
                  <p className="text-[11px] text-slate-500 mt-1 font-mono leading-relaxed">{error}</p>
                </div>
                <button onClick={fetchHoldings}
                  className="px-4 py-1.5 rounded-xl border text-xs font-mono transition-all hover:opacity-80"
                  style={{ color: ACCENT, borderColor: `${ACCENT}40`, background: `${ACCENT}08` }}>
                  Retry
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && rows.length === 0 && (tab === 'overview' || tab === 'holdings') && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <TrendingUp size={28} color="rgba(100,116,139,0.4)" />
                <p className="text-sm text-slate-500">No holdings found</p>
                <p className="text-[11px] text-slate-600 leading-relaxed max-w-xs">
                  Connect your Dhan account or configure a Google Sheet in Settings → Stock Market.
                </p>
              </div>
            )}

            {/* Tab content */}
            <AnimatePresence mode="wait">
              {!loading && !error && tab === 'overview' && rows.length > 0 && (
                <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  <OverviewTab rows={rows} hidden={hidden} dhanEnabled={!!dhanEnabled} zerodhaEnabled={!!zerodhaEnabled} />
                </motion.div>
              )}
              {!loading && !error && tab === 'holdings' && rows.length > 0 && (
                <motion.div key="holdings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  <HoldingsTab rows={rows} hidden={hidden} />
                </motion.div>
              )}
              {!loading && !error && tab === 'dhan' && (
                <motion.div key="dhan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  <HoldingsTab rows={rows} hidden={hidden} broker="dhan" />
                </motion.div>
              )}
              {!loading && !error && tab === 'zerodha' && (
                <motion.div key="zerodha" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  {zerodhaError ? (
                    <div className="flex flex-col items-center gap-4 py-8 text-center">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                        style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                        <AlertTriangle size={18} color="#f87171" />
                      </div>
                      <div>
                        <p className="text-sm text-red-300 font-semibold font-mono">
                          {zerodhaIsAuthError ? 'Zerodha session expired' : 'Zerodha unavailable'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 font-mono leading-relaxed max-w-xs">{zerodhaError}</p>
                      </div>
                      <button
                        onClick={fetchHoldings}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-colors"
                        style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
                      >
                        <RefreshCw size={11} />
                        Retry
                      </button>
                    </div>
                  ) : (
                    <HoldingsTab rows={rows} hidden={hidden} broker="zerodha" />
                  )}
                </motion.div>
              )}
              {tab === 'positions' && (
                <motion.div key="positions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  <ZerodhaPositionsTab zerodhaEnabled={zerodhaEnabled} />
                </motion.div>
              )}
              {tab === 'options' && (
                <motion.div key="options" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  <OptionChainTab dhanEnabled={dhanEnabled} />
                </motion.div>
              )}
              {tab === 'orders' && (
                <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  <OrdersTab dhanEnabled={dhanEnabled} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer summary — scoped to the active tab */}
          {!loading && !error && footerRows !== null && footerRows.length > 0 && (
            <div className="border-t border-white/[0.06] flex-shrink-0">
              <div className="px-5 pt-2 pb-0.5">
                <span className="text-[8px] font-mono uppercase tracking-widest text-slate-700">{footerLabel}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 px-5 pb-3.5">
                {[
                  { label: 'Invested',    value: fmtINR(footerInvested, true), color: '#94a3b8' },
                  { label: 'Current',     value: fmtINR(footerCurrent,  true), color: '#e2e8f0' },
                  { label: 'Overall P&L', value: fmtINR(footerPnl, true),      color: footerUp ? ACCENT : RED },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <p className="text-[8px] font-semibold uppercase tracking-widest text-slate-600 mb-0.5 font-mono">{label}</p>
                    <p className="text-xs font-bold tabular-nums font-mono" style={{ color }}>
                      {hidden ? '••••••' : value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
