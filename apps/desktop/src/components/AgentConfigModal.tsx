import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Brain, Calculator, ChevronRight,
  Cloud, Github, Globe, Globe2, Home, Layers,
  Loader2, Lock, MessageCircle, Monitor, Newspaper,
  PieChart, RefreshCw, Sparkles, TrendingUp, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AgentConfig, ConnectionStatus } from '../hooks/useAgentConfig';
import type { AgentVoiceMap, AgentVoiceSetting } from '../hooks/useAgentVoiceConfig';
import { AgentToggle } from './settings/AgentAccordion';
import { AgentVoiceRow } from './settings/AgentVoiceRow';
import { SecurityNotice, StatusBadge } from './settings/shared';
import { WeatherSettings }   from './settings/WeatherSettings';
import { GoogleSettings }    from './settings/GoogleSettings';
import { GithubSettings }    from './settings/GithubSettings';
import { StockSettings }     from './settings/StockSettings';
import { NewsSettings }      from './settings/NewsSettings';
import { SmartHomeSettings } from './settings/SmartHomeSettings';
import { PortfolioSettings } from './settings/PortfolioSettings';
import { WhatsappSettings }  from './settings/WhatsappSettings';
import { SystemSettings }    from './settings/SystemSettings';

// ── Types ─────────────────────────────────────────────────────────────────────


interface AgentMeta {
  Icon: LucideIcon;
  color: string;
  iconBg: string;
  iconRing: string;
  label: string;
  tagline: string;
  category: 'service' | 'skill' | 'ai';
}

const META: Record<string, AgentMeta> = {
  system:     { Icon: Monitor,       color: '#2dd4bf', iconBg: 'rgba(45,212,191,0.1)',   iconRing: 'rgba(45,212,191,0.25)',  label: 'System',       tagline: 'CPU · memory · battery · network',      category: 'service' },
  weather:    { Icon: Cloud,         color: '#22d3ee', iconBg: 'rgba(34,211,238,0.1)',   iconRing: 'rgba(34,211,238,0.25)',  label: 'Weather',      tagline: 'Forecasts & current conditions',         category: 'service' },
  google:     { Icon: Globe2,        color: '#60a5fa', iconBg: 'rgba(96,165,250,0.1)',   iconRing: 'rgba(96,165,250,0.25)',  label: 'Google',       tagline: 'Calendar · Gmail · Drive',               category: 'service' },
  github:     { Icon: Github,        color: '#fbbf24', iconBg: 'rgba(251,191,36,0.1)',   iconRing: 'rgba(251,191,36,0.25)',  label: 'GitHub',       tagline: 'PRs · issues · CI workflows',            category: 'service' },
  stock:      { Icon: TrendingUp,    color: '#4ade80', iconBg: 'rgba(74,222,128,0.1)',   iconRing: 'rgba(74,222,128,0.25)',  label: 'Stock Market', tagline: 'NSE · BSE · US markets · portfolio',     category: 'service' },
  news:       { Icon: Newspaper,     color: '#38bdf8', iconBg: 'rgba(56,189,248,0.1)',   iconRing: 'rgba(56,189,248,0.25)',  label: 'News',         tagline: 'Headlines from 50+ countries',           category: 'service' },
  smarthome:  { Icon: Home,          color: '#fb923c', iconBg: 'rgba(251,146,60,0.1)',   iconRing: 'rgba(251,146,60,0.25)',  label: 'Smart Home',   tagline: 'Lights · climate · scenes',              category: 'service' },
  portfolio:  { Icon: PieChart,      color: '#fb7185', iconBg: 'rgba(251,113,133,0.1)',  iconRing: 'rgba(251,113,133,0.25)', label: 'Portfolio',    tagline: 'Holdings · P&L · mutual funds',          category: 'service' },
  whatsapp:   { Icon: MessageCircle, color: '#34d399', iconBg: 'rgba(52,211,153,0.1)',   iconRing: 'rgba(52,211,153,0.25)',  label: 'WhatsApp',     tagline: 'Send & receive messages by voice',       category: 'service' },
  websearch:  { Icon: Globe,         color: '#818cf8', iconBg: 'rgba(129,140,248,0.1)',  iconRing: 'rgba(129,140,248,0.25)', label: 'Web Search',   tagline: 'Live web · DuckDuckGo · no API key',     category: 'skill'   },
  calculator: { Icon: Calculator,    color: '#fde68a', iconBg: 'rgba(253,230,138,0.08)', iconRing: 'rgba(253,230,138,0.2)',  label: 'Calculator',   tagline: 'Precise math · percentages · conversions',category: 'skill'  },
  memory:     { Icon: Brain,         color: '#c084fc', iconBg: 'rgba(192,132,252,0.1)',  iconRing: 'rgba(192,132,252,0.25)', label: 'Memory',       tagline: 'Save & recall personal notes',           category: 'skill'   },
  briefing:   { Icon: Layers,        color: '#67e8f9', iconBg: 'rgba(103,232,249,0.08)', iconRing: 'rgba(103,232,249,0.2)',  label: 'Briefing',     tagline: 'Morning summary across all agents',      category: 'skill'   },
  general:    { Icon: Bot,           color: '#a78bfa', iconBg: 'rgba(167,139,250,0.1)',  iconRing: 'rgba(167,139,250,0.25)', label: 'General AI',   tagline: 'Open-ended knowledge & writing',         category: 'ai'      },
};

const SERVICES = ['system','weather','google','github','stock','news','smarthome','portfolio','whatsapp'] as const;
const SKILLS   = ['websearch','calculator','memory','briefing'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getState(id: string, cfg: AgentConfig): { status: ConnectionStatus; enabled: boolean; info: string } {
  switch (id) {
    case 'system':    return { status: 'connected', enabled: cfg.system.enabled,    info: 'CPU · memory · battery' };
    case 'weather':   return { status: cfg.weather.status,   enabled: cfg.weather.enabled,   info: cfg.weather.info };
    case 'google':    return { status: cfg.google.status,    enabled: cfg.google.calendarEnabled || cfg.google.emailEnabled, info: cfg.google.connectedEmail };
    case 'github':    return { status: cfg.github.status,    enabled: cfg.github.enabled,    info: cfg.github.info };
    case 'stock':     return { status: cfg.stock.status,     enabled: cfg.stock.enabled,     info: cfg.stock.info };
    case 'news':      return { status: cfg.news.status,      enabled: cfg.news.enabled,      info: cfg.news.info };
    case 'smarthome': return { status: cfg.smarthome.status, enabled: cfg.smarthome.enabled, info: cfg.smarthome.info };
    case 'portfolio': return { status: cfg.portfolio.status, enabled: cfg.portfolio.enabled, info: cfg.portfolio.info };
    case 'whatsapp':  return { status: cfg.whatsapp.status,  enabled: cfg.whatsapp.enabled,  info: cfg.whatsapp.info };
    default:          return { status: 'connected', enabled: true, info: '' };
  }
}

function getToggle(id: string, cfg: AgentConfig, onPatch: Props['onPatch']) {
  switch (id) {
    case 'system':    return () => onPatch('system',    { enabled: !cfg.system.enabled });
    case 'weather':   return () => onPatch('weather',   { enabled: !cfg.weather.enabled });
    case 'github':    return () => onPatch('github',    { enabled: !cfg.github.enabled });
    case 'stock':     return () => onPatch('stock',     { enabled: !cfg.stock.enabled });
    case 'news':      return () => onPatch('news',      { enabled: !cfg.news.enabled });
    case 'smarthome': return () => onPatch('smarthome', { enabled: !cfg.smarthome.enabled });
    case 'portfolio': return () => onPatch('portfolio', { enabled: !cfg.portfolio.enabled });
    case 'whatsapp':  return () => onPatch('whatsapp',  { enabled: !cfg.whatsapp.enabled });
    default:          return undefined;
  }
}

// ── Status dot ────────────────────────────────────────────────────────────────

function Dot({ status, enabled, isSkill }: { status: ConnectionStatus; enabled: boolean; isSkill?: boolean }) {
  if (isSkill)                 return <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />;
  if (!enabled)                return <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />;
  if (status === 'connected')  return <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />;
  if (status === 'error')      return <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />;
  if (status === 'verifying')  return <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />;
}

// ── Sidebar agent row ─────────────────────────────────────────────────────────

function SidebarRow({
  id, cfg, onPatch, selected, onSelect, isSkill,
}: {
  id: string; cfg: AgentConfig; onPatch: Props['onPatch'];
  selected: boolean; onSelect: () => void; isSkill?: boolean;
}) {
  const meta   = META[id];
  const state  = getState(id, cfg);
  const toggle = getToggle(id, cfg, onPatch);
  const dimmed = !isSkill && !state.enabled && !selected;

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all text-left group ${
        selected
          ? 'bg-white/8 border border-white/10'
          : 'hover:bg-white/4 border border-transparent'
      } ${dimmed ? 'opacity-40' : ''}`}
    >
      <Dot status={state.status} enabled={state.enabled} isSkill={isSkill} />

      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: meta.iconBg, boxShadow: `0 0 0 1px ${meta.iconRing}` }}
      >
        <meta.Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-medium leading-none truncate ${selected ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
          {meta.label}
        </p>
      </div>

      {toggle && !isSkill ? (
        <span onClick={e => e.stopPropagation()}>
          <AgentToggle enabled={state.enabled} onToggle={toggle} />
        </span>
      ) : isSkill ? (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-500/12 text-violet-400 shrink-0">ON</span>
      ) : null}
    </button>
  );
}

// ── Right panel forms ─────────────────────────────────────────────────────────

function SkillCard({ Icon, color, iconBg, title, badge, children }: {
  Icon: LucideIcon; color: string; iconBg: string; title: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          {badge && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-300">{badge}</span>
          )}
        </div>
      </div>
      <div className="text-[12px] text-slate-400 leading-relaxed">{children}</div>
    </div>
  );
}

function AgentForm({ id, cfg, onPatch, onVerifyWeather, onConnectGoogle, onDisconnectGoogle,
  onVerifyGitHub, onDisconnectGitHub, onVerifyNews, onVerifySmartHome,
  onConnectPortfolio, onDisconnectPortfolio, onRefreshPortfolio,
  onVerifyWhatsApp, onCheckTunnel, onStartTunnel, onStopTunnel,
}: Pick<Props, 'cfg' | 'onPatch' | 'onVerifyWeather' | 'onConnectGoogle' | 'onDisconnectGoogle'
  | 'onVerifyGitHub' | 'onDisconnectGitHub' | 'onVerifyNews' | 'onVerifySmartHome'
  | 'onConnectPortfolio' | 'onDisconnectPortfolio' | 'onRefreshPortfolio'
  | 'onVerifyWhatsApp' | 'onCheckTunnel' | 'onStartTunnel' | 'onStopTunnel'> & { id: string }) {
  const m = META[id];
  switch (id) {
    case 'system':    return <SystemSettings />;
    case 'weather':   return <WeatherSettings config={cfg.weather} onPatch={p => onPatch('weather', p)} onVerify={onVerifyWeather} />;
    case 'google':    return <GoogleSettings config={cfg.google} onPatch={p => onPatch('google', p)} onConnect={onConnectGoogle} onDisconnect={onDisconnectGoogle} />;
    case 'github':    return <GithubSettings config={cfg.github} onPatch={p => onPatch('github', p)} onVerify={onVerifyGitHub} onDisconnect={onDisconnectGitHub} />;
    case 'stock':     return <StockSettings config={cfg.stock} onPatch={p => onPatch('stock', p)} googleToken={cfg.google.accessToken} />;
    case 'news':      return <NewsSettings config={cfg.news} onPatch={p => onPatch('news', p)} onVerify={onVerifyNews} />;
    case 'smarthome': return <SmartHomeSettings config={cfg.smarthome} onPatch={p => onPatch('smarthome', p)} onVerify={onVerifySmartHome} />;
    case 'portfolio': return <PortfolioSettings config={cfg.portfolio} onPatch={p => onPatch('portfolio', p)} onConnect={onConnectPortfolio} onDisconnect={onDisconnectPortfolio} onRefresh={onRefreshPortfolio} />;
    case 'whatsapp':  return <WhatsappSettings config={cfg.whatsapp} onPatch={p => onPatch('whatsapp', p)} onVerify={onVerifyWhatsApp} onCheckTunnel={onCheckTunnel} onStartTunnel={onStartTunnel} onStopTunnel={onStopTunnel} />;
    case 'websearch':
      return (
        <SkillCard Icon={Globe} color={m.color} iconBg={m.iconBg} title="Web Search" badge="Always Active">
          Searches DuckDuckGo for current facts, recent events, and live information. No API key or account required.
          The LLM calls this automatically when your query needs up-to-date data.
          <div className="mt-3 space-y-1.5 text-slate-500">
            <p><span className="text-slate-400">Try:</span> "What is the gold price today?"</p>
            <p><span className="text-slate-400">Try:</span> "Search for Python 3.13 release notes"</p>
          </div>
        </SkillCard>
      );
    case 'calculator':
      return (
        <SkillCard Icon={Calculator} color={m.color} iconBg={m.iconBg} title="Calculator" badge="Always Active">
          Evaluates math expressions precisely using Python's AST evaluator — no external API.
          Supports arithmetic, percentages, tips, trig, sqrt, log, factorial, pi and e.
          <div className="mt-3 space-y-1.5 text-slate-500">
            <p><span className="text-slate-400">Try:</span> "18% tip on ₹850?"</p>
            <p><span className="text-slate-400">Try:</span> "Square root of 1764"</p>
            <p><span className="text-slate-400">Try:</span> "42 miles in km"</p>
          </div>
        </SkillCard>
      );
    case 'memory':
      return (
        <SkillCard Icon={Brain} color={m.color} iconBg={m.iconBg} title="Memory" badge="Always Active">
          Stores personal notes as key-value pairs in <code className="text-purple-300 text-[11px]">user_memory.json</code>.
          Memories persist across restarts. Data stays entirely on your machine.
          <div className="mt-3 space-y-1.5 text-slate-500">
            <p><span className="text-slate-400">Store:</span> "Remember wife anniversary is June 15"</p>
            <p><span className="text-slate-400">Recall:</span> "What is my anniversary?"</p>
            <p><span className="text-slate-400">Delete:</span> "Forget parking spot"</p>
          </div>
        </SkillCard>
      );
    case 'briefing':
      return (
        <SkillCard Icon={Layers} color={m.color} iconBg={m.iconBg} title="Briefing" badge="Always Active">
          Queries Weather, Calendar, News and Smart Home simultaneously and merges results into a
          single spoken summary. Skips any agent that is not configured.
          <div className="mt-3 space-y-1.5 text-slate-500">
            <p><span className="text-slate-400">Try:</span> "Give me my morning briefing"</p>
            <p><span className="text-slate-400">Try:</span> "Dashboard status"</p>
          </div>
        </SkillCard>
      );
    case 'general':
      return (
        <SkillCard Icon={Bot} color={m.color} iconBg={m.iconBg} title="General AI">
          Handles any query that does not match a specific agent — general knowledge, creative writing,
          explanations, history, coding help. Requires an LLM provider configured in Settings → AI.
        </SkillCard>
      );
    default: return null;
  }
}

// ── Right panel ───────────────────────────────────────────────────────────────

function RightPanel({
  id, cfg, agentVoices, voices, onPatch, onReload,
  onAgentVoiceUpdate, onAgentVoiceReset, onTestAgentVoice,
  ...formProps
}: Props & { id: string }) {
  const meta   = META[id] ?? META.general;
  const state  = getState(id, cfg);
  const isSkill = (SKILLS as readonly string[]).includes(id);
  const [reloading, setReloading] = useState(false);

  function handleReload() {
    if (reloading) return;
    setReloading(true);
    const ids = id === 'google' ? ['calendar', 'email'] : [id];
    ids.forEach(aid => onReload(aid));
    setTimeout(() => setReloading(false), 3000);
  }

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex flex-col h-full"
    >
      {/* Agent header */}
      <div className="flex items-center gap-4 pl-6 pr-14 py-5 border-b border-white/6 shrink-0"
        style={{ background: `linear-gradient(to right, ${meta.iconBg}, transparent)` }}>
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: meta.iconBg, boxShadow: `0 0 0 1px ${meta.iconRing}, 0 8px 24px ${meta.iconBg}` }}
        >
          <meta.Icon className="h-6 w-6" style={{ color: meta.color }} />
        </motion.div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-white">{meta.label}</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">{meta.tagline}</p>
        </div>
        <div className="shrink-0">
          {isSkill ? (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-violet-500/15 text-violet-300">
              Always Active
            </span>
          ) : (
            <StatusBadge status={state.enabled ? state.status : 'idle'} info={state.enabled ? state.info : 'Disabled'} />
          )}
        </div>
      </div>

      {/* Form content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 scrollbar-thin">
        {!isSkill && id !== 'system' && id !== 'general' && <SecurityNotice />}

        <AgentForm id={id} cfg={cfg} onPatch={onPatch} {...formProps} />

        {/* Reload button */}
        {!isSkill && id !== 'general' && (
          <button
            type="button"
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-2 w-full justify-center rounded-xl border border-white/10 bg-white/4 hover:bg-white/8 hover:border-white/20 px-3 py-2 text-xs text-slate-400 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reloading ? 'animate-spin' : ''}`} />
            {reloading ? 'Reloading…' : `Reload ${meta.label} agent`}
          </button>
        )}

        {/* Voice row */}
        <div className="pt-2 border-t border-white/6">
          <AgentVoiceRow
            agentId={id}
            label={meta.label}
            voice={agentVoices[id] ?? { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova' }}
            voices={voices}
            onUpdate={p => onAgentVoiceUpdate(id, p)}
            onReset={() => onAgentVoiceReset(id)}
            onTest={onTestAgentVoice}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ cfg }: { cfg: AgentConfig }) {
  const connected = SERVICES.filter(id => {
    const s = getState(id, cfg);
    return s.enabled && s.status === 'connected';
  }).length;

  return (
    <div className="flex items-center gap-3 px-3 pb-3 border-b border-white/6 mb-2">
      <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        {connected} connected
      </span>
      <span className="h-3 w-px bg-white/10" />
      <span className="text-[10px] text-slate-600">{SERVICES.length - connected} inactive</span>
      <span className="h-3 w-px bg-white/10" />
      <span className="flex items-center gap-1 text-[10px] text-violet-400">
        <Zap className="h-2.5 w-2.5" />
        {SKILLS.length} built-in
      </span>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SideSection({ label, badge }: { label: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-slate-600">{label}</span>
      {badge}
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  cfg:                   AgentConfig;
  onPatch:               <K extends keyof AgentConfig>(agent: K, p: Partial<AgentConfig[K]>) => void;
  onClose:               () => void;
  onReload:              (agentId: string) => void;
  onVerifyWeather:       () => void;
  onConnectGoogle:       () => void;
  onDisconnectGoogle:    () => void;
  onVerifyGitHub:        () => void;
  onDisconnectGitHub:    () => void;
  onVerifyNews:          () => void;
  onVerifySmartHome:     () => void;
  onConnectPortfolio:    () => void;
  onDisconnectPortfolio: () => void;
  onRefreshPortfolio:    () => void;
  onVerifyWhatsApp:      () => void;
  onCheckTunnel:         () => Promise<boolean>;
  onStartTunnel:         () => void;
  onStopTunnel:          () => void;
  agentVoices:           AgentVoiceMap;
  onAgentVoiceUpdate:    (agentId: string, p: Partial<AgentVoiceSetting>) => void;
  onAgentVoiceReset:     (agentId: string) => void;
  voices:                SpeechSynthesisVoice[];
  onTestAgentVoice:      (text: string, agentId: string) => void;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function AgentConfigModal(props: Props) {
  const [selected, setSelected] = useState<string>('system');

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={props.onClose}
      />

      {/* Modal */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-full flex overflow-hidden"
          style={{
            maxWidth: 900,
            height: 'min(680px, 88vh)',
            background: 'rgba(6,10,20,0.98)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 24,
            boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* ── Left sidebar ── */}
          <div
            className="flex flex-col shrink-0 border-r border-white/6 overflow-y-auto scrollbar-thin"
            style={{ width: 240, background: 'rgba(0,0,0,0.2)' }}
          >
            {/* Sidebar header */}
            <div className="flex items-center gap-2.5 px-4 pt-5 pb-4 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-white/6 border border-white/8 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <span className="text-sm font-semibold text-white">Agents</span>
            </div>

            <div className="px-3 flex-1">
              <StatsStrip cfg={props.cfg} />

              {/* Services */}
              <SideSection label="Services" />
              {SERVICES.map(id => (
                <SidebarRow
                  key={id} id={id} cfg={props.cfg} onPatch={props.onPatch}
                  selected={selected === id} onSelect={() => setSelected(id)}
                />
              ))}

              {/* General AI */}
              <SideSection label="AI" />
              <SidebarRow
                id="general" cfg={props.cfg} onPatch={props.onPatch}
                selected={selected === 'general'} onSelect={() => setSelected('general')}
              />

              {/* Skills */}
              <SideSection
                label="Built-in Skills"
                badge={<span className="text-[9px] text-violet-400 font-medium">No setup</span>}
              />
              {SKILLS.map(id => (
                <SidebarRow
                  key={id} id={id} cfg={props.cfg} onPatch={props.onPatch}
                  selected={selected === id} onSelect={() => setSelected(id)} isSkill
                />
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-4 shrink-0 border-t border-white/5 mt-2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-700">
                <Lock className="h-2.5 w-2.5 shrink-0" />
                More via agent framework
              </div>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* Close */}
            <button
              onClick={props.onClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl border border-white/8 bg-white/4 hover:bg-white/10 text-slate-500 hover:text-white transition flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>

            <AnimatePresence mode="wait">
              <RightPanel
                key={selected}
                id={selected}
                cfg={props.cfg}
                onPatch={props.onPatch}
                onReload={props.onReload}
                agentVoices={props.agentVoices}
                voices={props.voices}
                onAgentVoiceUpdate={props.onAgentVoiceUpdate}
                onAgentVoiceReset={props.onAgentVoiceReset}
                onTestAgentVoice={props.onTestAgentVoice}
                onClose={props.onClose}
                onVerifyWeather={props.onVerifyWeather}
                onConnectGoogle={props.onConnectGoogle}
                onDisconnectGoogle={props.onDisconnectGoogle}
                onVerifyGitHub={props.onVerifyGitHub}
                onDisconnectGitHub={props.onDisconnectGitHub}
                onVerifyNews={props.onVerifyNews}
                onVerifySmartHome={props.onVerifySmartHome}
                onConnectPortfolio={props.onConnectPortfolio}
                onDisconnectPortfolio={props.onDisconnectPortfolio}
                onRefreshPortfolio={props.onRefreshPortfolio}
                onVerifyWhatsApp={props.onVerifyWhatsApp}
                onCheckTunnel={props.onCheckTunnel}
                onStartTunnel={props.onStartTunnel}
                onStopTunnel={props.onStopTunnel}
              />
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  );
}
