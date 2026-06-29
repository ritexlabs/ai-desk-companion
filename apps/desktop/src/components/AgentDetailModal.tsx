import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, RotateCw, LayoutDashboard, Bell, BellOff, Loader2, AlertCircle } from 'lucide-react';
import type { AgentDefinition } from '../types/runtime';
import type { AgentConfig } from '../hooks/useAgentConfig';

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

const COLORS: Record<string, { text: string; border: string; bg: string; dot: string; glow: string }> = {
  system:   { text: 'text-teal-300',    border: 'border-teal-400/30',    bg: 'bg-teal-400/8',    dot: 'bg-teal-400',    glow: 'rgba(45,212,191,0.12)' },
  weather:  { text: 'text-cyan-300',    border: 'border-cyan-400/30',    bg: 'bg-cyan-400/8',    dot: 'bg-cyan-400',    glow: 'rgba(34,211,238,0.12)' },
  calendar: { text: 'text-violet-300',  border: 'border-violet-400/30',  bg: 'bg-violet-400/8',  dot: 'bg-violet-400',  glow: 'rgba(167,139,250,0.12)' },
  email:    { text: 'text-emerald-300', border: 'border-emerald-400/30', bg: 'bg-emerald-400/8', dot: 'bg-emerald-400', glow: 'rgba(52,211,153,0.12)' },
  github:   { text: 'text-amber-300',   border: 'border-amber-400/30',   bg: 'bg-amber-400/8',   dot: 'bg-amber-400',   glow: 'rgba(251,191,36,0.12)' },
  stock:    { text: 'text-green-300',   border: 'border-green-400/30',   bg: 'bg-green-400/8',   dot: 'bg-green-400',   glow: 'rgba(74,222,128,0.12)' },
  news:     { text: 'text-sky-300',     border: 'border-sky-400/30',     bg: 'bg-sky-400/8',     dot: 'bg-sky-400',     glow: 'rgba(56,189,248,0.12)' },
  smarthome:{ text: 'text-orange-300',  border: 'border-orange-400/30',  bg: 'bg-orange-400/8',  dot: 'bg-orange-400',  glow: 'rgba(251,146,60,0.12)'  },
  portfolio:{ text: 'text-teal-300',    border: 'border-teal-400/30',    bg: 'bg-teal-400/8',    dot: 'bg-teal-400',    glow: 'rgba(20,184,166,0.12)'  },
  general:  { text: 'text-violet-300',  border: 'border-violet-400/30',  bg: 'bg-violet-400/8',  dot: 'bg-violet-400',  glow: 'rgba(167,139,250,0.12)' },
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  online:   { label: 'Online',   color: 'text-emerald-400' },
  starting: { label: 'Starting', color: 'text-cyan-400' },
  degraded: { label: 'Degraded', color: 'text-amber-400' },
  failed:   { label: 'Failed',   color: 'text-red-400' },
  offline:  { label: 'Offline',  color: 'text-slate-500' },
};

function Row({ label, value, valueClass = 'text-slate-300' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 flex-shrink-0 mt-0.5">{label}</span>
      <span className={`text-[11px] text-right leading-relaxed ${valueClass}`}>{value}</span>
    </div>
  );
}

/* ─── Panel skeleton / error shared components ─── */
function PanelLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-slate-600">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="text-[10px]">Loading…</span>
    </div>
  );
}
function PanelError({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 py-3 text-slate-600">
      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-red-500/60" />
      <span className="text-[10px] leading-relaxed">{msg}</span>
    </div>
  );
}

/* ─── Calendar events panel ─── */
function CalendarPanel({ accessToken, c }: { accessToken: string; c: typeof COLORS.calendar }) {
  const [events, setEvents] = useState<{ id: string; summary: string; start: string; end: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) { setError('No Google access token configured.'); setLoading(false); return; }
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: weekAhead.toISOString(),
      maxResults: '10',
      singleEvents: 'true',
      orderBy: 'startTime',
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
          end: e.end?.dateTime ?? e.end?.date ?? '',
        })));
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed to load events'); setLoading(false); });
  }, [accessToken]);

  const fmtTime = (iso: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (iso.length === 10) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { return iso; }
  };

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;
  if (events.length === 0) return <p className="text-[10px] text-slate-600 py-3 text-center">No upcoming events this week.</p>;

  return (
    <div className="space-y-1">
      {events.map((ev) => (
        <div key={ev.id} className={`rounded-lg border ${c.border} ${c.bg} px-2.5 py-1.5`}>
          <p className={`text-[11px] font-medium leading-snug ${c.text}`}>{ev.summary}</p>
          <p className="text-[9px] text-slate-500 mt-0.5">{fmtTime(ev.start)}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Email panel ─── */
function EmailPanel({ accessToken, c }: { accessToken: string; c: typeof COLORS.email }) {
  const [messages, setMessages] = useState<{ id: string; subject: string; from: string; date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) { setError('No Google access token configured.'); setLoading(false); return; }
    fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=in:inbox`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.error) throw new Error(data.error.message ?? 'API error');
        const ids: string[] = (data.messages ?? []).map((m: any) => m.id);
        const details = await Promise.all(
          ids.map((id) =>
            fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }).then((r) => r.json()),
          ),
        );
        setMessages(
          details.map((d: any) => {
            const headers: { name: string; value: string }[] = d.payload?.headers ?? [];
            const get = (n: string) => headers.find((h) => h.name === n)?.value ?? '';
            return { id: d.id, subject: get('Subject') || '(No subject)', from: get('From'), date: get('Date') };
          }),
        );
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed to load emails'); setLoading(false); });
  }, [accessToken]);

  const fmtFrom = (from: string) => {
    const m = from.match(/^([^<]+)</);
    return m ? m[1].trim() : from.split('@')[0] ?? from;
  };
  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }
    catch { return d; }
  };

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;
  if (messages.length === 0) return <p className="text-[10px] text-slate-600 py-3 text-center">No messages found.</p>;

  return (
    <div className="space-y-1">
      {messages.map((m) => (
        <div key={m.id} className={`rounded-lg border ${c.border} ${c.bg} px-2.5 py-1.5`}>
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

/* ─── GitHub notifications panel ─── */
function GitHubPanel({ token, c }: { token: string; c: typeof COLORS.github }) {
  const [notifs, setNotifs] = useState<{ id: string; title: string; repo: string; type: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('No GitHub token configured.'); setLoading(false); return; }
    fetch('https://api.github.com/notifications?per_page=10', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) throw new Error((data as any).message ?? 'API error');
        setNotifs(data.map((n: any) => ({
          id: n.id,
          title: n.subject?.title ?? 'Untitled',
          repo: n.repository?.full_name ?? '',
          type: n.subject?.type ?? '',
          reason: n.reason ?? '',
        })));
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed to load notifications'); setLoading(false); });
  }, [token]);

  const reasonLabel: Record<string, string> = {
    review_requested: 'Review', assign: 'Assigned', mention: 'Mention',
    subscribed: 'Subscribed', author: 'Author', comment: 'Comment',
    ci_activity: 'CI', push: 'Push',
  };

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;
  if (notifs.length === 0) return <p className="text-[10px] text-slate-600 py-3 text-center">All caught up — no notifications.</p>;

  return (
    <div className="space-y-1">
      {notifs.map((n) => (
        <div key={n.id} className={`rounded-lg border ${c.border} ${c.bg} px-2.5 py-1.5`}>
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

/* ─── Stock market summary panel ─── */
interface IndexRow { symbol: string; name: string; price: number | null; change: number | null; change_pct: number | null; error: string | null }

function StockPanel({ market, c }: { market: string; c: typeof COLORS.stock }) {
  const [indexes, setIndexes] = useState<IndexRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const backendBase = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');

  useEffect(() => {
    fetch(`${backendBase}/api/agent/stock/summary?market=${encodeURIComponent(market)}`)
      .then((r) => r.json())
      .then((data) => { setIndexes(data.indexes ?? []); setLoading(false); })
      .catch((e) => { setError(e.message ?? 'Failed to load indexes'); setLoading(false); });
  }, [market, backendBase]);

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;

  const fmt = (n: number | null, dp = 2) => n == null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: dp });

  return (
    <div className={`rounded-lg border ${c.border} overflow-hidden`}>
      <table className="w-full text-[10px]">
        <thead>
          <tr className={`${c.bg} border-b ${c.border}`}>
            <th className="text-left px-2.5 py-1.5 text-slate-500 font-medium uppercase tracking-wider">Index</th>
            <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium uppercase tracking-wider">Price</th>
            <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium uppercase tracking-wider">Chg %</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx, i) => (
            <tr key={idx.symbol} className={`border-b ${c.border} last:border-0 ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'}`}>
              <td className={`px-2.5 py-1.5 font-medium ${c.text}`}>{idx.name}</td>
              <td className="px-2.5 py-1.5 text-right text-slate-300 tabular-nums">{fmt(idx.price, 0)}</td>
              <td className={`px-2.5 py-1.5 text-right tabular-nums font-medium ${
                idx.change_pct == null ? 'text-slate-600'
                : idx.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {idx.change_pct == null ? '—' : `${idx.change_pct >= 0 ? '+' : ''}${fmt(idx.change_pct)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── News headlines panel ─── */
function NewsPanel({ apiKey, country, c }: { apiKey: string; country: string; c: typeof COLORS.news }) {
  const [articles, setArticles] = useState<{ title: string; source: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!apiKey) { setError('No GNews API key configured.'); setLoading(false); return; }
    const params = new URLSearchParams({ token: apiKey, country: country || 'in', lang: 'en', max: '5' });
    fetch(`https://gnews.io/api/v4/top-headlines?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.errors) throw new Error(data.errors[0] ?? 'API error');
        setArticles((data.articles ?? []).map((a: any) => ({
          title: a.title ?? '',
          source: a.source?.name ?? '',
          url: a.url ?? '',
        })));
        setLoading(false);
      })
      .catch((e) => { setError(e.message ?? 'Failed to load headlines'); setLoading(false); });
  }, [apiKey, country]);

  if (loading) return <PanelLoading />;
  if (error) return <PanelError msg={error} />;
  if (articles.length === 0) return <p className="text-[10px] text-slate-600 py-3 text-center">No headlines found.</p>;

  return (
    <div className="space-y-1">
      {articles.map((a, i) => (
        <div key={i} className={`rounded-lg border ${c.border} ${c.bg} px-2.5 py-1.5`}>
          <p className={`text-[11px] font-medium leading-snug ${c.text}`}>{a.title}</p>
          {a.source && <p className="text-[9px] text-slate-500 mt-0.5">{a.source}</p>}
        </div>
      ))}
    </div>
  );
}

/* ─── Main modal ─── */
export function AgentDetailModal({
  agent, bootMessage, metrics, onClose, onReload, onOpenDashboard,
  agentConfig, notificationsEnabled, onToggleNotifications,
}: AgentDetailModalProps) {
  const c = COLORS[agent.id] ?? COLORS.general;
  const st = STATUS_LABEL[agent.status] ?? STATUS_LABEL.offline;

  const sectionLabel = (label: string) => (
    <div className={`text-[9px] uppercase tracking-wider text-slate-500 mb-1.5 pt-1 border-t ${c.border} mt-1`}>{label}</div>
  );

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        style={{ boxShadow: `0 24px 64px ${c.glow}, 0 0 0 1px rgba(255,255,255,0.04)` }}
        className={`fixed top-1/2 left-1/2 z-50 w-[480px] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-2xl border ${c.border} bg-[#07091a] backdrop-blur-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient top band */}
        <div className={`h-px w-full flex-shrink-0 ${c.dot.replace('bg-', 'bg-gradient-to-r from-transparent via-')} opacity-60`} />

        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${c.border} flex-shrink-0`}>
          <div className="flex items-center gap-2.5">
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`h-2 w-2 rounded-full flex-shrink-0 ${c.dot}`}
            />
            <span className={`text-sm font-semibold tracking-wide ${c.text}`}>{agent.label}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-600 transition hover:bg-white/8 hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
          {/* Status + description */}
          <div className="space-y-2">
            <Row label="Status" value={st.label} valueClass={st.color} />
            <Row label="Capability" value={agent.description} />
            <Row label="Example" value={`"${agent.example}"`} valueClass="text-slate-400 italic" />
          </div>

          {/* Last boot status */}
          {bootMessage && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Last Status</div>
              <p className={`text-[11px] leading-relaxed ${c.text}`}>{bootMessage}</p>
            </div>
          )}

          {/* Session performance */}
          {metrics && metrics.calls > 0 && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2.5`}>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-2">Session Performance</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className={`text-lg font-bold tabular-nums leading-none ${c.text}`}>{metrics.calls}</div>
                  <div className="text-[9px] text-slate-500 uppercase mt-0.5">Calls</div>
                </div>
                <div>
                  <div className={`text-lg font-bold tabular-nums leading-none ${c.text}`}>{metrics.avg_ms}</div>
                  <div className="text-[9px] text-slate-500 uppercase mt-0.5">Avg ms</div>
                </div>
                <div>
                  <div className={`text-lg font-bold tabular-nums leading-none ${metrics.error_count > 0 ? 'text-red-400' : c.text}`}>
                    {metrics.error_count}
                  </div>
                  <div className="text-[9px] text-slate-500 uppercase mt-0.5">Errors</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Live data panels ── */}
          {agent.id === 'calendar' && agentConfig.google.accessToken && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
              {sectionLabel('Upcoming Events')}
              <CalendarPanel accessToken={agentConfig.google.accessToken} c={c} />
            </div>
          )}

          {agent.id === 'email' && agentConfig.google.accessToken && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
              {sectionLabel('Recent Inbox')}
              <EmailPanel accessToken={agentConfig.google.accessToken} c={c} />
            </div>
          )}

          {agent.id === 'github' && agentConfig.github.personalAccessToken && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
              {sectionLabel('Notifications')}
              <GitHubPanel token={agentConfig.github.personalAccessToken} c={c} />
            </div>
          )}

          {agent.id === 'stock' && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
              {sectionLabel(`${agentConfig.stock.defaultMarket === 'US' ? 'US' : 'NSE/BSE'} Indexes`)}
              <StockPanel market={agentConfig.stock.defaultMarket} c={c} />
            </div>
          )}

          {agent.id === 'news' && agentConfig.news.apiKey && (
            <div className={`rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
              {sectionLabel('Top Headlines')}
              <NewsPanel apiKey={agentConfig.news.apiKey} country={agentConfig.news.country} c={c} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between gap-2 px-4 py-3 border-t ${c.border} flex-shrink-0`}>
          {/* Notification toggle (left side) */}
          {onToggleNotifications != null && (
            <button
              onClick={() => onToggleNotifications(!notificationsEnabled)}
              title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] transition-colors ${
                notificationsEnabled
                  ? `${c.border} ${c.bg} ${c.text}`
                  : 'border-slate-700/40 bg-white/3 text-slate-500 hover:text-slate-300'
              }`}
            >
              {notificationsEnabled
                ? <Bell className="h-3 w-3" />
                : <BellOff className="h-3 w-3" />
              }
              Alerts {notificationsEnabled ? 'On' : 'Off'}
            </button>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-[11px] text-slate-500 transition hover:text-slate-300 hover:bg-white/6"
            >
              Close
            </button>
            {onReload && (
              <button
                onClick={() => { onReload(); onClose(); }}
                className={`flex items-center gap-1.5 rounded-xl border ${c.border} ${c.bg} px-3 py-1.5 text-[11px] font-medium ${c.text} transition hover:brightness-125`}
              >
                <RotateCw className="h-3 w-3" />
                Reload
              </button>
            )}
            {onOpenDashboard && (
              <button
                onClick={() => { onOpenDashboard(); onClose(); }}
                className={`flex items-center gap-1.5 rounded-xl border ${c.border} ${c.bg} px-3 py-1.5 text-[11px] font-medium ${c.text} transition hover:brightness-125`}
              >
                <LayoutDashboard className="h-3 w-3" />
                Dashboard
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
