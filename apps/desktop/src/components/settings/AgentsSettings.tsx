import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Brain, Calculator, ChevronLeft, ChevronRight,
  Cloud, Github, Globe, Globe2, Home, Layers,
  Loader2, Lock, MessageCircle, Monitor, Newspaper,
  PieChart, Search, Sparkles, TrendingUp, Zap,
} from 'lucide-react';
import type { AgentConfig, ConnectionStatus } from '../../hooks/useAgentConfig';
import type { AgentVoiceMap, AgentVoiceSetting } from '../../hooks/useAgentVoiceConfig';
import { AgentToggle } from './AgentAccordion';
import { AgentVoiceRow } from './AgentVoiceRow';
import { SecurityNotice, StatusBadge } from './shared';
import { WeatherSettings }   from './WeatherSettings';
import { GoogleSettings }    from './GoogleSettings';
import { GithubSettings }    from './GithubSettings';
import { StockSettings }     from './StockSettings';
import { NewsSettings }      from './NewsSettings';
import { SmartHomeSettings } from './SmartHomeSettings';
import { PortfolioSettings } from './PortfolioSettings';
import { WhatsappSettings }  from './WhatsappSettings';
import { SystemSettings }    from './SystemSettings';

// ── Agent metadata ────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{ className?: string }>;

interface AgentMeta {
  Icon:    LucideIcon;
  color:   string;
  ring:    string;
  bg:      string;
  label:   string;
  tagline: string;
}

const AGENT_META: Record<string, AgentMeta> = {
  system:     { Icon: Monitor,        color: 'text-teal-400',    ring: 'ring-teal-400/30',    bg: 'bg-teal-400/10',    label: 'System',      tagline: 'CPU · memory · battery · network' },
  weather:    { Icon: Cloud,          color: 'text-cyan-400',    ring: 'ring-cyan-400/30',    bg: 'bg-cyan-400/10',    label: 'Weather',     tagline: 'Forecasts & current conditions' },
  google:     { Icon: Globe2,         color: 'text-blue-400',    ring: 'ring-blue-400/30',    bg: 'bg-blue-400/10',    label: 'Google',      tagline: 'Calendar · Gmail' },
  github:     { Icon: Github,         color: 'text-amber-400',   ring: 'ring-amber-400/30',   bg: 'bg-amber-400/10',   label: 'GitHub',      tagline: 'PRs · issues · CI workflows' },
  stock:      { Icon: TrendingUp,     color: 'text-green-400',   ring: 'ring-green-400/30',   bg: 'bg-green-400/10',   label: 'Stock Market',tagline: 'NSE · BSE · US markets' },
  news:       { Icon: Newspaper,      color: 'text-sky-400',     ring: 'ring-sky-400/30',     bg: 'bg-sky-400/10',     label: 'News',        tagline: 'Headlines from 50+ countries' },
  smarthome:  { Icon: Home,           color: 'text-orange-400',  ring: 'ring-orange-400/30',  bg: 'bg-orange-400/10',  label: 'Smart Home',  tagline: 'Lights · climate · scenes' },
  portfolio:  { Icon: PieChart,       color: 'text-rose-400',    ring: 'ring-rose-400/30',    bg: 'bg-rose-400/10',    label: 'Portfolio',   tagline: 'Holdings · P&L · mutual funds' },
  whatsapp:   { Icon: MessageCircle,  color: 'text-emerald-400', ring: 'ring-emerald-400/30', bg: 'bg-emerald-400/10', label: 'WhatsApp',    tagline: 'Send & receive by voice' },
  // Built-in skills
  websearch:  { Icon: Globe,          color: 'text-indigo-400',  ring: 'ring-indigo-400/30',  bg: 'bg-indigo-400/10',  label: 'Web Search',  tagline: 'Live web · no API key' },
  calculator: { Icon: Calculator,     color: 'text-amber-300',   ring: 'ring-amber-300/30',   bg: 'bg-amber-300/10',   label: 'Calculator',  tagline: 'Precise math & percentages' },
  memory:     { Icon: Brain,          color: 'text-purple-400',  ring: 'ring-purple-400/30',  bg: 'bg-purple-400/10',  label: 'Memory',      tagline: 'Save & recall personal notes' },
  briefing:   { Icon: Layers,         color: 'text-cyan-300',    ring: 'ring-cyan-300/30',    bg: 'bg-cyan-300/10',    label: 'Briefing',    tagline: 'Morning summary across agents' },
  // General AI
  general:    { Icon: Bot,            color: 'text-violet-400',  ring: 'ring-violet-400/30',  bg: 'bg-violet-400/10',  label: 'General AI',  tagline: 'Open-ended knowledge & writing' },
};

const CONFIGURABLE = ['system', 'weather', 'google', 'github', 'stock', 'news', 'smarthome', 'portfolio', 'whatsapp'] as const;
const SKILLS       = ['websearch', 'calculator', 'memory', 'briefing'] as const;

// ── Status helpers ────────────────────────────────────────────────────────────

interface AgentState { status: ConnectionStatus; enabled: boolean; info: string }

function getState(id: string, config: AgentConfig): AgentState {
  switch (id) {
    case 'system':    return { status: 'connected', enabled: config.system.enabled, info: 'CPU · memory · battery' };
    case 'weather':   return { status: config.weather.status,   enabled: config.weather.enabled,   info: config.weather.info };
    case 'google':    return { status: config.google.status,    enabled: config.google.calendarEnabled || config.google.emailEnabled, info: config.google.info };
    case 'github':    return { status: config.github.status,    enabled: config.github.enabled,    info: config.github.info };
    case 'stock':     return { status: config.stock.status,     enabled: config.stock.enabled,     info: config.stock.info };
    case 'news':      return { status: config.news.status,      enabled: config.news.enabled,      info: config.news.info };
    case 'smarthome': return { status: config.smarthome.status, enabled: config.smarthome.enabled, info: config.smarthome.info };
    case 'portfolio': return { status: config.portfolio.status, enabled: config.portfolio.enabled, info: config.portfolio.info };
    case 'whatsapp':  return { status: config.whatsapp.status,  enabled: config.whatsapp.enabled,  info: config.whatsapp.info };
    default:          return { status: 'connected', enabled: true, info: '' };
  }
}

function getToggle(id: string, config: AgentConfig, onPatch: Props['onPatch']): (() => void) | undefined {
  switch (id) {
    case 'system':    return () => onPatch('system',    { enabled: !config.system.enabled });
    case 'weather':   return () => onPatch('weather',   { enabled: !config.weather.enabled });
    case 'github':    return () => onPatch('github',    { enabled: !config.github.enabled });
    case 'stock':     return () => onPatch('stock',     { enabled: !config.stock.enabled });
    case 'news':      return () => onPatch('news',      { enabled: !config.news.enabled });
    case 'smarthome': return () => onPatch('smarthome', { enabled: !config.smarthome.enabled });
    case 'portfolio': return () => onPatch('portfolio', { enabled: !config.portfolio.enabled });
    case 'whatsapp':  return () => onPatch('whatsapp',  { enabled: !config.whatsapp.enabled });
    default:          return undefined;
  }
}

// ── Status pill ───────────────────────────────────────────────────────────────

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider ${className}`}>
      {label}
    </span>
  );
}

function StatusPill({ status, enabled, isSkill }: { status: ConnectionStatus; enabled: boolean; isSkill?: boolean }) {
  if (isSkill)              return <Pill label="Always"    className="bg-violet-500/15 text-violet-400" />;
  if (!enabled)             return <Pill label="Off"       className="bg-white/6 text-slate-600" />;
  if (status === 'connected') return <Pill label="On"      className="bg-emerald-500/15 text-emerald-400" />;
  if (status === 'error')     return <Pill label="Error"   className="bg-red-500/15 text-red-400" />;
  if (status === 'verifying') return <Loader2 className="h-3 w-3 text-cyan-400 animate-spin flex-shrink-0" />;
  return null;
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ status, enabled, isSkill }: { status: ConnectionStatus; enabled: boolean; isSkill?: boolean }) {
  if (isSkill)                return <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />;
  if (!enabled)               return <span className="w-1.5 h-1.5 rounded-full bg-slate-700 flex-shrink-0" />;
  if (status === 'connected') return <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />;
  if (status === 'error')     return <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />;
  if (status === 'verifying') return <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" />;
}

// ── Single agent row ──────────────────────────────────────────────────────────

function AgentRow({
  id, config, onPatch, onSelect, isSkill = false,
}: {
  id: string; config: AgentConfig; onPatch: Props['onPatch'];
  onSelect: () => void; isSkill?: boolean;
}) {
  const meta   = AGENT_META[id];
  const state  = getState(id, config);
  const toggle = getToggle(id, config, onPatch);
  const dimmed = !isSkill && !state.enabled;

  return (
    <div className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer ${dimmed ? 'opacity-50' : ''}`}>
      {/* Status dot */}
      <StatusDot status={state.status} enabled={state.enabled} isSkill={isSkill} />

      {/* Agent icon */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ${meta.bg} ${meta.ring}`}
        onClick={onSelect}
      >
        <meta.Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      </div>

      {/* Name + tagline — clicking opens detail */}
      <div className="flex-1 min-w-0 text-left" onClick={onSelect}>
        <div className="text-sm font-medium text-white leading-snug">{meta.label}</div>
        <div className="text-[11px] text-slate-500 truncate leading-snug mt-0.5">
          {isSkill ? 'Always active — no setup required' : ((state.status === 'connected' && state.info) ? state.info : meta.tagline)}
        </div>
      </div>

      {/* Status pill */}
      <div onClick={onSelect}>
        <StatusPill status={state.status} enabled={state.enabled} isSkill={isSkill} />
      </div>

      {/* Enable toggle (configurable agents only, no toggle for google/system/skills) */}
      {toggle && !isSkill && (
        <AgentToggle enabled={state.enabled} onToggle={toggle} />
      )}

      {/* Chevron */}
      <ChevronRight
        className="h-3.5 w-3.5 text-slate-700 group-hover:text-slate-400 flex-shrink-0 transition-colors"
        onClick={onSelect}
      />
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label, badge }: { label: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 mb-1 mt-4 first:mt-0">
      <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-medium">{label}</span>
      {badge}
      <div className="flex-1 h-px bg-white/6" />
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ config }: { config: AgentConfig }) {
  const connected = CONFIGURABLE.filter((id) => {
    const s = getState(id, config);
    return s.enabled && s.status === 'connected';
  }).length;
  const total = CONFIGURABLE.length;

  return (
    <div className="flex items-center gap-3 px-1 mb-4">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-emerald-400 font-medium">{connected} connected</span>
      </div>
      <div className="h-3 w-px bg-white/10" />
      <div className="text-[11px] text-slate-600">{total - connected} inactive</div>
      <div className="h-3 w-px bg-white/10" />
      <div className="flex items-center gap-1 text-[11px] text-slate-600">
        <Zap className="h-2.5 w-2.5 text-violet-400" />
        <span className="text-violet-400">{SKILLS.length} skills</span>
      </div>
    </div>
  );
}

// ── Skill info cards (no credentials needed) ──────────────────────────────────

function SkillInfoCard({ icon: Icon, color, title, children }: {
  icon: LucideIcon; color: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm font-semibold text-white">{title}</span>
        <Pill label="Always Active" className="ml-auto bg-violet-500/15 text-violet-400" />
      </div>
      <div className="text-[11px] text-slate-400 leading-relaxed">{children}</div>
    </div>
  );
}

function WebSearchInfo() {
  return (
    <SkillInfoCard icon={Globe} color="text-indigo-400" title="Web Search">
      Searches DuckDuckGo for current facts, recent events, and live information. No API key or
      account required. The LLM calls this automatically when your query needs up-to-date data.
      <div className="mt-2 space-y-1 text-slate-500">
        <div>Try: <span className="text-slate-400">"What is the gold price today?"</span></div>
        <div>Try: <span className="text-slate-400">"Search for Python 3.13 release date"</span></div>
      </div>
    </SkillInfoCard>
  );
}

function CalculatorInfo() {
  return (
    <SkillInfoCard icon={Calculator} color="text-amber-300" title="Calculator">
      Evaluates math expressions precisely using Python's AST evaluator — no external API.
      Supports arithmetic, percentages, tips, trig (sin/cos/tan), sqrt, log, factorial, pi and e.
      <div className="mt-2 space-y-1 text-slate-500">
        <div>Try: <span className="text-slate-400">"What is 18% tip on ₹850?"</span></div>
        <div>Try: <span className="text-slate-400">"Square root of 1764"</span></div>
        <div>Try: <span className="text-slate-400">"42 miles in km"</span></div>
      </div>
    </SkillInfoCard>
  );
}

function MemoryInfo() {
  return (
    <SkillInfoCard icon={Brain} color="text-purple-400" title="Memory">
      Stores personal notes as key-value pairs in <code className="text-purple-300 text-[10px]">orchestrator/data/user_memory.json</code>.
      Memories persist across restarts. Data stays entirely on your machine.
      <div className="mt-2 space-y-1 text-slate-500">
        <div>Store: <span className="text-slate-400">"Remember wife anniversary is June 15"</span></div>
        <div>Recall: <span className="text-slate-400">"What is my anniversary?"</span></div>
        <div>Delete: <span className="text-slate-400">"Forget parking spot"</span></div>
      </div>
    </SkillInfoCard>
  );
}

function BriefingInfo() {
  return (
    <SkillInfoCard icon={Layers} color="text-cyan-300" title="Briefing">
      Queries Weather, Calendar, News and Smart Home simultaneously (via asyncio.gather) and
      merges results into a single spoken summary. Skips any agent that is not configured.
      <div className="mt-2 space-y-1 text-slate-500">
        <div>Try: <span className="text-slate-400">"Give me my morning briefing"</span></div>
        <div>Try: <span className="text-slate-400">"Dashboard status"</span></div>
      </div>
    </SkillInfoCard>
  );
}

function GeneralAIInfo() {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-violet-400" />
        <span className="text-sm font-semibold text-white">General AI</span>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Handles any query that does not match a specific agent — general knowledge, creative writing,
        explanations, history, coding help. Requires an LLM provider configured in
        <span className="text-slate-300"> Settings → AI</span>.
      </p>
    </div>
  );
}

// ── Slide animation variants ──────────────────────────────────────────────────

const slide = {
  enter:  (d: number) => ({ opacity: 0, x: d * 20 }),
  center: { opacity: 1, x: 0 },
  exit:   (d: number) => ({ opacity: 0, x: d * -20 }),
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  config:              AgentConfig;
  onPatch:             <K extends keyof AgentConfig>(agent: K, p: Partial<AgentConfig[K]>) => void;
  onVerifyWeather:     () => void;
  onConnectGoogle:     () => void;
  onDisconnectGoogle:  () => void;
  onVerifyGitHub:      () => void;
  onDisconnectGitHub:  () => void;
  onVerifyNews:        () => void;
  onVerifySmartHome:     () => void;
  onConnectPortfolio:    () => void;
  onDisconnectPortfolio: () => void;
  onRefreshPortfolio:    () => void;
  onVerifyWhatsApp:      () => void;
  onCheckTunnel:       () => Promise<boolean>;
  onStartTunnel:       () => void;
  onStopTunnel:        () => void;
  agentVoices:         AgentVoiceMap;
  onAgentVoiceUpdate:  (agentId: string, p: Partial<AgentVoiceSetting>) => void;
  onAgentVoiceReset:   (agentId: string) => void;
  voices:              SpeechSynthesisVoice[];
  onTestAgentVoice:    (text: string, agentId: string) => void;
}

// ── Detail view ───────────────────────────────────────────────────────────────

function DetailView({
  agentId, dir, onBack, config, onPatch,
  onVerifyWeather, onConnectGoogle, onDisconnectGoogle,
  onVerifyGitHub, onDisconnectGitHub, onVerifyNews,
  onVerifySmartHome,
  onConnectPortfolio, onDisconnectPortfolio, onRefreshPortfolio,
  onVerifyWhatsApp,
  onCheckTunnel, onStartTunnel, onStopTunnel,
  agentVoices, onAgentVoiceUpdate, onAgentVoiceReset, voices, onTestAgentVoice,
}: Props & { agentId: string; dir: number; onBack: () => void }) {
  const meta  = AGENT_META[agentId] ?? AGENT_META.general;
  const state = getState(agentId, config);
  const isSkill = (SKILLS as readonly string[]).includes(agentId);

  function renderForm() {
    switch (agentId) {
      case 'system':
        return <SystemSettings />;
      case 'weather':
        return <WeatherSettings config={config.weather} onPatch={(p) => onPatch('weather', p)} onVerify={onVerifyWeather} />;
      case 'google':
        return <GoogleSettings config={config.google} onPatch={(p) => onPatch('google', p)} onConnect={onConnectGoogle} onDisconnect={onDisconnectGoogle} />;
      case 'github':
        return <GithubSettings config={config.github} onPatch={(p) => onPatch('github', p)} onVerify={onVerifyGitHub} onDisconnect={onDisconnectGitHub} />;
      case 'stock':
        return <StockSettings config={config.stock} onPatch={(p) => onPatch('stock', p)} />;
      case 'news':
        return <NewsSettings config={config.news} onPatch={(p) => onPatch('news', p)} onVerify={onVerifyNews} />;
      case 'smarthome':
        return <SmartHomeSettings config={config.smarthome} onPatch={(p) => onPatch('smarthome', p)} onVerify={onVerifySmartHome} />;
      case 'portfolio':
        return <PortfolioSettings config={config.portfolio} onPatch={(p) => onPatch('portfolio', p)} onConnect={onConnectPortfolio} onDisconnect={onDisconnectPortfolio} onRefresh={onRefreshPortfolio} />;
      case 'whatsapp':
        return <WhatsappSettings config={config.whatsapp} onPatch={(p) => onPatch('whatsapp', p)} onVerify={onVerifyWhatsApp} onCheckTunnel={onCheckTunnel} onStartTunnel={onStartTunnel} onStopTunnel={onStopTunnel} />;
      case 'websearch':  return <WebSearchInfo />;
      case 'calculator': return <CalculatorInfo />;
      case 'memory':     return <MemoryInfo />;
      case 'briefing':   return <BriefingInfo />;
      case 'general':    return <GeneralAIInfo />;
      default:           return null;
    }
  }

  return (
    <motion.div
      key={agentId}
      custom={dir}
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-slate-500 hover:text-white text-xs transition-colors rounded-lg px-2 py-1 hover:bg-white/8"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> All agents
        </button>

        <div className="flex-1" />

        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ring-1 ${meta.bg} ${meta.ring}`}>
          <meta.Icon className={`h-3.5 w-3.5 ${meta.color}`} />
        </div>
        <span className="text-sm font-semibold text-white">{meta.label}</span>
        {isSkill
          ? <Pill label="Always On" className="bg-violet-500/15 text-violet-400" />
          : <StatusBadge status={state.enabled ? state.status : 'idle'} info={state.enabled ? state.info : 'Disabled'} />
        }
      </div>

      {/* Security notice for credential-bearing agents */}
      {!isSkill && agentId !== 'system' && agentId !== 'general' && <SecurityNotice />}

      {/* Form */}
      {renderForm()}

      {/* Voice row */}
      <div className="pt-1 border-t border-white/6">
        <AgentVoiceRow
          agentId={agentId}
          label={meta.label}
          voice={agentVoices[agentId] ?? { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova' }}
          voices={voices}
          onUpdate={(p) => onAgentVoiceUpdate(agentId, p)}
          onReset={() => onAgentVoiceReset(agentId)}
          onTest={onTestAgentVoice}
        />
      </div>
    </motion.div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({
  config, onPatch, onSelect, dir,
}: Pick<Props, 'config' | 'onPatch'> & { onSelect: (id: string) => void; dir: number }) {
  return (
    <motion.div
      key="list"
      custom={dir}
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="space-y-0.5"
    >
      <StatsBar config={config} />

      {/* ── Services ── */}
      <SectionDivider label="Services" />
      {CONFIGURABLE.map((id) => (
        <AgentRow key={id} id={id} config={config} onPatch={onPatch} onSelect={() => onSelect(id)} />
      ))}

      {/* ── General AI ── */}
      <AgentRow id="general" config={config} onPatch={onPatch} onSelect={() => onSelect('general')} />

      {/* ── Built-in Skills ── */}
      <SectionDivider
        label="Built-in Skills"
        badge={
          <span className="flex items-center gap-1 text-[9px] text-violet-400">
            <Sparkles className="h-2.5 w-2.5" /> No setup
          </span>
        }
      />
      {SKILLS.map((id) => (
        <AgentRow key={id} id={id} config={config} onPatch={onPatch} onSelect={() => onSelect(id)} isSkill />
      ))}

      {/* ── Footer ── */}
      <div className="pt-4">
        <div className="rounded-xl border border-white/6 bg-white/2 px-3 py-2.5 flex items-center gap-2 text-[10px] text-slate-600">
          <Lock className="h-3 w-3 flex-shrink-0" />
          More agents (Slack, Jira, Notion…) can be added via the agent framework.
        </div>
      </div>
    </motion.div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function AgentsSettings(props: Props) {
  const [view, setView] = useState<string>('list');
  const [dir,  setDir]  = useState<1 | -1>(1);

  function openAgent(id: string) { setDir(1); setView(id); }
  function goBack()               { setDir(-1); setView('list'); }

  return (
    <div className="relative">
      <AnimatePresence mode="wait" custom={dir}>
        {view === 'list' ? (
          <ListView key="list" config={props.config} onPatch={props.onPatch} onSelect={openAgent} dir={dir} />
        ) : (
          <DetailView key={view} agentId={view} dir={dir} onBack={goBack} {...props} />
        )}
      </AnimatePresence>
    </div>
  );
}
