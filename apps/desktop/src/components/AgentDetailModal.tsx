import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCw, LayoutDashboard, Bell, BellOff, Loader2, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { WeatherPanel } from './WeatherWidget';
import type { AgentDefinition } from '../types/runtime';
import type { AgentConfig } from '../hooks/useAgentConfig';
import { AgentBackground } from './AgentBackground';

interface AgentMetrics {
  calls: number;
  avg_ms: number;
  error_count: number;
}

interface AgentDetailModalProps {
  agent: AgentDefinition;
  bootMessage?: string;
  metrics?: AgentMetrics;
  onClose: () => void;
  onReload?: () => void;
  onOpenDashboard?: () => void;
  agentConfig: AgentConfig;
  notificationsEnabled?: boolean;
  onToggleNotifications?: (enabled: boolean) => void;
}

/* ─── Per-agent theme tokens ─────────────────────────────── */
const COLORS: Record<string, {
  text: string; border: string; bg: string; dot: string;
  glow: string; hex: string; rgb: string;
}> = {
  system:    { text:'text-teal-300',    border:'border-teal-400/30',    bg:'bg-teal-400/8',    dot:'bg-teal-400',    glow:'rgba(45,212,191,.20)',  hex:'#2dd4bf', rgb:'45,212,191'   },
  weather:   { text:'text-cyan-300',    border:'border-cyan-400/30',    bg:'bg-cyan-400/8',    dot:'bg-cyan-400',    glow:'rgba(34,211,238,.20)',  hex:'#22d3ee', rgb:'34,211,238'   },
  calendar:  { text:'text-violet-300',  border:'border-violet-400/30',  bg:'bg-violet-400/8',  dot:'bg-violet-400',  glow:'rgba(167,139,250,.20)', hex:'#a78bfa', rgb:'167,139,250'  },
  email:     { text:'text-emerald-300', border:'border-emerald-400/30', bg:'bg-emerald-400/8', dot:'bg-emerald-400', glow:'rgba(52,211,153,.20)',  hex:'#34d399', rgb:'52,211,153'   },
  github:    { text:'text-amber-300',   border:'border-amber-400/30',   bg:'bg-amber-400/8',   dot:'bg-amber-400',   glow:'rgba(251,191,36,.20)',  hex:'#fbbf24', rgb:'251,191,36'   },
  stock:     { text:'text-green-300',   border:'border-green-400/30',   bg:'bg-green-400/8',   dot:'bg-green-400',   glow:'rgba(74,222,128,.20)',  hex:'#4ade80', rgb:'74,222,128'   },
  news:      { text:'text-sky-300',     border:'border-sky-400/30',     bg:'bg-sky-400/8',     dot:'bg-sky-400',     glow:'rgba(56,189,248,.20)',  hex:'#38bdf8', rgb:'56,189,248'   },
  smarthome: { text:'text-orange-300',  border:'border-orange-400/30',  bg:'bg-orange-400/8',  dot:'bg-orange-400',  glow:'rgba(251,146,60,.20)',  hex:'#fb923c', rgb:'251,146,60'   },
  portfolio: { text:'text-teal-300',    border:'border-teal-400/30',    bg:'bg-teal-400/8',    dot:'bg-teal-400',    glow:'rgba(20,184,166,.20)',  hex:'#14b8a6', rgb:'20,184,166'   },
  whatsapp:  { text:'text-emerald-300', border:'border-emerald-400/30', bg:'bg-emerald-400/8', dot:'bg-emerald-400', glow:'rgba(37,211,102,.20)',  hex:'#25d366', rgb:'37,211,102'   },
  general:   { text:'text-violet-300',  border:'border-violet-400/30',  bg:'bg-violet-400/8',  dot:'bg-violet-400',  glow:'rgba(167,139,250,.20)', hex:'#a78bfa', rgb:'167,139,250'  },
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  online:   { label:'Online',   color:'text-emerald-400' },
  starting: { label:'Starting', color:'text-cyan-400'    },
  degraded: { label:'Degraded', color:'text-amber-400'   },
  failed:   { label:'Failed',   color:'text-red-400'     },
  offline:  { label:'Offline',  color:'text-slate-500'   },
};

/* ─── Shared panel components ────────────────────────────── */
function PanelLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-5 text-slate-600">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="text-[10px]">Loading…</span>
    </div>
  );
}
function PanelError({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 py-3">
      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-red-500/60" />
      <span className="text-[10px] text-slate-600 leading-relaxed">{msg}</span>
    </div>
  );
}

/* ─── Calendar panel ─────────────────────────────────────── */
function CalendarPanel({ accessToken, c }: { accessToken: string; c: typeof COLORS.calendar }) {
  const [events, setEvents] = useState<{ id: string; summary: string; start: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) { setError('No Google access token configured.'); setLoading(false); return; }
    const now = new Date();
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + 7 * 86400000).toISOString(),
      maxResults: '8', singleEvents: 'true', orderBy: 'startTime',
    });
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error.message ?? 'API error');
        setEvents((data.items ?? []).map((e: any) => ({
          id: e.id,
          summary: e.summary ?? '(No title)',
          start: e.start?.dateTime ?? e.start?.date ?? '',
        })));
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed'); setLoading(false); });
  }, [accessToken]);

  const fmt = (iso: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return iso.length === 10
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { return iso; }
  };

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;
  if (!events.length) return <p className="text-[10px] text-slate-600 py-4 text-center">No upcoming events this week.</p>;

  return (
    <div className="space-y-1.5">
      {events.map((ev) => (
        <div key={ev.id} className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
          <p className={`text-[11px] font-medium leading-snug ${c.text}`}>{ev.summary}</p>
          <p className="text-[9px] text-slate-500 mt-0.5">{fmt(ev.start)}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Email panel ────────────────────────────────────────── */
function EmailPanel({ accessToken, c }: { accessToken: string; c: typeof COLORS.email }) {
  const [messages, setMessages] = useState<{ id: string; subject: string; from: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) { setError('No Google access token configured.'); setLoading(false); return; }
    fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=in:inbox`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (r) => {
        const data = await r.json();
        if (data.error) {
          const msg: string = data.error.message ?? '';
          const status: number = data.error.code ?? r.status;
          if (status === 401) throw new Error('Token expired — re-sign in with Google.');
          if (msg.includes('insufficient') || msg.includes('scope') || msg.includes('permission'))
            throw new Error('Gmail not authorized — re-sign in to enable Gmail scope.');
          if (msg.includes('API has not been used') || msg.includes('disabled'))
            throw new Error('Gmail API is disabled — enable it at console.cloud.google.com → APIs & Services.');
          throw new Error(msg || 'Gmail API error');
        }
        return data;
      })
      .then(async (data) => {
        const ids: string[] = (data.messages ?? []).map((m: any) => m.id);
        const details = await Promise.all(ids.map((id) =>
          fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }).then((r) => r.json()),
        ));
        setMessages(details.map((d: any) => {
          const h: { name: string; value: string }[] = d.payload?.headers ?? [];
          const g = (n: string) => h.find((x) => x.name === n)?.value ?? '';
          return { id: d.id, subject: g('Subject') || '(No subject)', from: g('From'), date: g('Date') };
        }));
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed'); setLoading(false); });
  }, [accessToken]);

  const fmtFrom = (f: string) => { const m = f.match(/^([^<]+)</); return m ? m[1].trim() : f.split('@')[0] ?? f; };
  const fmtDate = (d: string) => { try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); } catch { return d; } };

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;
  if (!messages.length) return <p className="text-[10px] text-slate-600 py-4 text-center">No messages found.</p>;

  return (
    <div className="space-y-1.5">
      {messages.map((m) => (
        <div key={m.id} className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
          <p className={`text-[11px] font-medium leading-snug truncate ${c.text}`}>{m.subject}</p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[9px] text-slate-500 truncate max-w-[60%]">{fmtFrom(m.from)}</p>
            <p className="text-[9px] text-slate-600">{fmtDate(m.date)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── GitHub panel ───────────────────────────────────────── */
function GitHubPanel({ token, c }: { token: string; c: typeof COLORS.github }) {
  const [notifs, setNotifs] = useState<{ id: string; title: string; repo: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('No GitHub token configured.'); setLoading(false); return; }
    fetch('https://api.github.com/notifications?per_page=8', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) throw new Error((data as any).message ?? 'API error');
        setNotifs(data.map((n: any) => ({
          id: n.id,
          title: n.subject?.title ?? 'Untitled',
          repo: n.repository?.full_name ?? '',
          reason: n.reason ?? '',
        })));
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed'); setLoading(false); });
  }, [token]);

  const reasonLabel: Record<string, string> = {
    review_requested:'Review', assign:'Assigned', mention:'Mention',
    subscribed:'Subscribed', author:'Author', comment:'Comment', ci_activity:'CI',
  };

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;
  if (!notifs.length) return <p className="text-[10px] text-slate-600 py-4 text-center">All caught up — no notifications.</p>;

  return (
    <div className="space-y-1.5">
      {notifs.map((n) => (
        <div key={n.id} className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
          <p className={`text-[11px] font-medium leading-snug truncate ${c.text}`}>{n.title}</p>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[9px] text-slate-500 truncate max-w-[70%]">{n.repo}</p>
            <span className="text-[8px] text-slate-600 border border-slate-700/40 rounded px-1">
              {reasonLabel[n.reason] ?? n.reason}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Stock panel ────────────────────────────────────────── */
interface IndexRow { symbol: string; name: string; price: number | null; change_pct: number | null; error: string | null }

function StockPanel({ market, c, onRisingChange }: {
  market: string; c: typeof COLORS.stock; onRisingChange?: (r: boolean) => void;
}) {
  const [indexes, setIndexes] = useState<IndexRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';

  useEffect(() => {
    fetch(`${base}/api/agent/stock/summary?market=${encodeURIComponent(market)}`)
      .then((r) => r.json())
      .then((data) => {
        const rows: IndexRow[] = data.indexes ?? [];
        setIndexes(rows);
        const avg = rows.reduce((s, r) => s + (r.change_pct ?? 0), 0) / (rows.length || 1);
        onRisingChange?.(avg >= 0);
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed'); setLoading(false); });
  }, [market, base, onRisingChange]);

  const fmt = (n: number | null, dp = 2) =>
    n == null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: dp });

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;

  return (
    <div className={`rounded-xl border ${c.border} overflow-hidden`}>
      <table className="w-full text-[10px]">
        <thead>
          <tr className={`${c.bg} border-b ${c.border}`}>
            <th className="text-left px-3 py-2 text-slate-500 font-medium uppercase tracking-wider">Index</th>
            <th className="text-right px-3 py-2 text-slate-500 font-medium uppercase tracking-wider">Price</th>
            <th className="text-right px-3 py-2 text-slate-500 font-medium uppercase tracking-wider">Chg %</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx, i) => (
            <tr key={idx.symbol} className={`border-b ${c.border} last:border-0 ${i % 2 === 0 ? '' : 'bg-white/[.012]'}`}>
              <td className={`px-3 py-2 font-medium ${c.text}`}>{idx.name}</td>
              <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{fmt(idx.price, 0)}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-medium flex items-center justify-end gap-1 ${
                idx.change_pct == null ? 'text-slate-600'
                : idx.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {idx.change_pct != null && (
                  idx.change_pct >= 0
                    ? <TrendingUp className="h-2.5 w-2.5" />
                    : <TrendingDown className="h-2.5 w-2.5" />
                )}
                {idx.change_pct == null ? '—' : `${idx.change_pct >= 0 ? '+' : ''}${fmt(idx.change_pct)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── News panel ─────────────────────────────────────────── */
function NewsPanel({ apiKey, country, c }: { apiKey: string; country: string; c: typeof COLORS.news }) {
  const [articles, setArticles] = useState<{ title: string; source: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!apiKey) { setError('No GNews API key configured.'); setLoading(false); return; }
    fetch(`https://gnews.io/api/v4/top-headlines?${new URLSearchParams({ token: apiKey, country: country || 'in', lang: 'en', max: '5' })}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.errors) throw new Error(data.errors[0] ?? 'API error');
        setArticles((data.articles ?? []).map((a: any) => ({ title: a.title ?? '', source: a.source?.name ?? '' })));
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed'); setLoading(false); });
  }, [apiKey, country]);

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;
  if (!articles.length) return <p className="text-[10px] text-slate-600 py-4 text-center">No headlines found.</p>;

  return (
    <div className="space-y-1.5">
      {articles.map((a, i) => (
        <div key={i} className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
          <p className={`text-[11px] font-medium leading-snug ${c.text}`}>{a.title}</p>
          {a.source && <p className="text-[9px] text-slate-500 mt-0.5">{a.source}</p>}
        </div>
      ))}
    </div>
  );
}

/* ─── Section label ──────────────────────────────────────── */
function SectionLabel({ label, borderClass }: { label: string; borderClass: string }) {
  return (
    <div className={`text-[9px] uppercase tracking-wider text-slate-500 pb-1.5 mb-2 border-b ${borderClass}`}>
      {label}
    </div>
  );
}

/* ─── Main modal ─────────────────────────────────────────── */
export function AgentDetailModal({
  agent, bootMessage, metrics, onClose, onReload, onOpenDashboard,
  agentConfig, notificationsEnabled, onToggleNotifications,
}: AgentDetailModalProps) {
  const c  = COLORS[agent.id] ?? COLORS.general;
  const st = STATUS_LABEL[agent.status] ?? STATUS_LABEL.offline;
  const [stockRising, setStockRising] = useState(true);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Centering shell — flexbox owns the centering so framer-motion y-animation never fights translate */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        {/* Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.90, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.90, y: 24 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          style={{
            boxShadow: `0 32px 80px ${c.glow}, 0 0 0 1px rgba(255,255,255,.05), 0 0 120px ${c.glow}`,
          }}
          className={`pointer-events-auto w-[520px] max-h-[88vh] flex flex-col overflow-hidden rounded-2xl border ${c.border} bg-[#07091a]`}
          onClick={(e) => e.stopPropagation()}
        >
        {/* ── Hero section ── */}
        <div className="relative h-[178px] flex-shrink-0 overflow-hidden">
          {/* Animated scene */}
          <AnimatePresence>
            <motion.div
              key={agent.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0"
            >
              <AgentBackground agentId={agent.id} isRising={stockRising} />
            </motion.div>
          </AnimatePresence>

          {/* Top accent line */}
          <div className="absolute top-0 inset-x-0 h-[2px]" style={{
            background: `linear-gradient(90deg, transparent, ${c.hex}90, transparent)`,
          }} />

          {/* Shimmer sweep */}
          <div className="absolute top-0 inset-x-0 h-[2px] overflow-hidden">
            <div className="absolute inset-y-0 w-1/3" style={{
              background: `linear-gradient(90deg, transparent, ${c.hex}, transparent)`,
              animation: 'agent-shimmer 3s ease-in-out 1s infinite',
            }} />
          </div>

          {/* Bottom overlay gradient */}
          <div className="absolute inset-x-0 bottom-0 h-20"
            style={{ background: 'linear-gradient(to top, #07091a 30%, transparent)' }} />

          {/* Top-right button cluster */}
          <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-1.5">
            {onReload && (
              <motion.button
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.4 }}
                onClick={onReload}
                title="Reload agent"
                className="w-7 h-7 rounded-xl border border-white/10 bg-black/50 backdrop-blur-sm flex items-center justify-center text-slate-400 hover:text-slate-200 transition"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </motion.button>
            )}
            {onOpenDashboard && (
              <button
                onClick={() => { onOpenDashboard(); onClose(); }}
                title="Open dashboard"
                className="w-7 h-7 rounded-xl border border-white/10 bg-black/50 backdrop-blur-sm flex items-center justify-center text-slate-400 hover:text-slate-200 transition"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onClose}
              title="Close"
              className="w-7 h-7 rounded-xl border border-white/10 bg-black/50 backdrop-blur-sm flex items-center justify-center text-slate-400 hover:text-slate-200 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Hero content — agent name + status overlay */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-3">
            <div className="flex items-center gap-2 mb-0.5">
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className={`h-2 w-2 rounded-full flex-shrink-0 ${c.dot}`}
              />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${st.color}`}>{st.label}</span>
            </div>
            <h2 className={`text-lg font-bold tracking-tight leading-none ${c.text}`}>{agent.label}</h2>
            <p className="text-[10px] text-slate-500 mt-0.5 max-w-[340px] leading-relaxed">{agent.description}</p>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3 scrollbar-thin">

          {/* Example query */}
          <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2.5`}>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Try asking</div>
            <p className={`text-[11px] italic leading-relaxed ${c.text}`}>"{agent.example}"</p>
          </div>

          {/* Session performance */}
          {metrics && metrics.calls > 0 && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2.5`}>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-2">Session Performance</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className={`text-2xl font-bold tabular-nums leading-none ${c.text}`}>{metrics.calls}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-1">Calls</div>
                </div>
                <div>
                  <div className={`text-2xl font-bold tabular-nums leading-none ${c.text}`}>{metrics.avg_ms}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-1">Avg ms</div>
                </div>
                <div>
                  <div className={`text-2xl font-bold tabular-nums leading-none ${metrics.error_count > 0 ? 'text-red-400' : c.text}`}>
                    {metrics.error_count}
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wide mt-1">Errors</div>
                </div>
              </div>
            </div>
          )}

          {/* Last boot status */}
          {bootMessage && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Last Status</div>
              <p className={`text-[11px] leading-relaxed ${c.text}`}>{bootMessage}</p>
            </div>
          )}

          {/* ── Live data panels ── */}
          {agent.id === 'calendar' && agentConfig.google.accessToken && (
            <div>
              <SectionLabel label="Upcoming Events" borderClass={c.border} />
              <CalendarPanel accessToken={agentConfig.google.accessToken} c={c} />
            </div>
          )}

          {agent.id === 'email' && agentConfig.google.accessToken && (
            <div>
              <SectionLabel label="Recent Inbox" borderClass={c.border} />
              <EmailPanel accessToken={agentConfig.google.accessToken} c={c} />
            </div>
          )}

          {agent.id === 'github' && agentConfig.github.personalAccessToken && (
            <div>
              <SectionLabel label="Notifications" borderClass={c.border} />
              <GitHubPanel token={agentConfig.github.personalAccessToken} c={c} />
            </div>
          )}

          {agent.id === 'stock' && (
            <div>
              <SectionLabel
                label={`${agentConfig.stock.defaultMarket === 'US' ? 'US' : 'NSE/BSE'} Market Indexes`}
                borderClass={c.border}
              />
              <StockPanel
                market={agentConfig.stock.defaultMarket}
                c={c}
                onRisingChange={setStockRising}
              />
            </div>
          )}

          {agent.id === 'news' && agentConfig.news.apiKey && (
            <div>
              <SectionLabel label="Top Headlines" borderClass={c.border} />
              <NewsPanel apiKey={agentConfig.news.apiKey} country={agentConfig.news.country} c={c} />
            </div>
          )}

          {agent.id === 'weather' && (
            <div>
              <SectionLabel label="Current Conditions & Forecast" borderClass={c.border} />
              <WeatherPanel
                city={agentConfig.weather.defaultCity || 'Bengaluru'}
                textClass={c.text}
                borderClass={c.border}
                bgClass={c.bg}
              />
            </div>
          )}
        </div>

        {/* ── Footer — only shown when Alerts toggle is available ── */}
        {onToggleNotifications != null && (
          <div className={`flex items-center px-5 py-3 border-t ${c.border} flex-shrink-0 bg-black/20 backdrop-blur-sm`}>
            <button
              onClick={() => onToggleNotifications(!notificationsEnabled)}
              title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-medium transition-all cursor-pointer ${
                notificationsEnabled
                  ? `${c.border} ${c.bg} ${c.text}`
                  : 'border-slate-700/40 bg-white/3 text-slate-500 hover:text-slate-300 hover:border-slate-600/50'
              }`}
            >
              {notificationsEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
              Alerts {notificationsEnabled ? 'On' : 'Off'}
            </button>
          </div>
        )}
        </motion.div>
      </div>
    </>
  );
}
