import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot, Brain, Calculator,
  Cloud, GitBranch, Globe, Globe2, Home, Layers,
  Loader2, MessageCircle, Monitor, Newspaper,
  PieChart, RefreshCw, Sparkles, TrendingUp, Tv, Zap,
  type LucideIcon,
} from 'lucide-react';
import type { AgentConfig, ConnectionStatus } from '../../hooks/useAgentConfig';
import type { AgentVoiceMap, AgentVoiceSetting } from '../../hooks/useAgentVoiceConfig';
import { AgentVoiceRow } from './AgentVoiceRow';
import { SecurityNotice, StatusBadge } from './shared';
import { AgentSettingsCard } from './AgentSettingsCard';
import { WeatherSettings }     from './WeatherSettings';
import { GoogleSettings }      from './GoogleSettings';
import { GithubSettings }      from './GithubSettings';
import { StockSettings }       from './StockSettings';
import { NewsSettings }        from './NewsSettings';
import { SmartHomeSettings }   from './SmartHomeSettings';
import { PortfolioSettings }   from './PortfolioSettings';
import { WhatsappSettings }    from './WhatsappSettings';
import { SystemSettings }      from './SystemSettings';
import { SocialMediaSettings } from './SocialMediaSettings';
import type { YouTubeDiscovery } from '../../hooks/agentVerify';

// ── Agent metadata ────────────────────────────────────────────────────────────

interface AgentMeta {
  Icon:    LucideIcon;
  label:   string;
  tagline: string;
}

const AGENT_META: Record<string, AgentMeta> = {
  system:      { Icon: Monitor,        label: 'System',       tagline: 'CPU · memory · battery · network' },
  weather:     { Icon: Cloud,          label: 'Weather',      tagline: 'Forecasts & current conditions' },
  google:      { Icon: Globe2,         label: 'Google',       tagline: 'Calendar · Gmail' },
  github:      { Icon: GitBranch,      label: 'GitHub',       tagline: 'PRs · issues · CI workflows' },
  stock:       { Icon: TrendingUp,     label: 'Stock Market', tagline: 'NSE · BSE · US markets' },
  news:        { Icon: Newspaper,      label: 'News',         tagline: 'Headlines from 50+ countries' },
  smarthome:   { Icon: Home,           label: 'Smart Home',   tagline: 'Lights · climate · scenes' },
  portfolio:   { Icon: PieChart,       label: 'Portfolio',    tagline: 'Holdings · P&L · mutual funds' },
  whatsapp:    { Icon: MessageCircle,  label: 'WhatsApp',     tagline: 'Send & receive by voice' },
  socialmedia: { Icon: Tv,             label: 'Social Media', tagline: 'YouTube channels · Instagram accounts' },
  websearch:   { Icon: Globe,          label: 'Web Search',   tagline: 'Live web · no API key' },
  calculator:  { Icon: Calculator,     label: 'Calculator',   tagline: 'Precise math & percentages' },
  memory:      { Icon: Brain,          label: 'Memory',       tagline: 'Save & recall personal notes' },
  briefing:    { Icon: Layers,         label: 'Briefing',     tagline: 'Morning summary across agents' },
  general:     { Icon: Bot,            label: 'General AI',   tagline: 'Open-ended knowledge & writing' },
};

const ALWAYS_ON_IDS = ['websearch', 'calculator', 'memory', 'briefing'] as const;
const GATEWAY_IDS   = ['system', 'weather', 'google', 'github', 'stock', 'news', 'portfolio', 'whatsapp', 'socialmedia'] as const;
const DEVICE_IDS    = ['smarthome'] as const;

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
    case 'whatsapp':    return { status: config.whatsapp.status,    enabled: config.whatsapp.enabled,    info: config.whatsapp.info };
    case 'socialmedia': return { status: config.socialmedia.status, enabled: config.socialmedia.enabled, info: config.socialmedia.info };
    default:            return { status: 'connected', enabled: true, info: '' };
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
    case 'whatsapp':    return () => onPatch('whatsapp',    { enabled: !config.whatsapp.enabled });
    case 'socialmedia': return () => onPatch('socialmedia', { enabled: !config.socialmedia.enabled });
    default:            return undefined;
  }
}

// ── Pill (used inside SkillInfoCard) ─────────────────────────────────────────

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider ${className}`}>
      {label}
    </span>
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

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-1 px-1">
      <div className="h-px flex-1 bg-white/6" />
      <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-slate-600">
        {label}{count !== undefined ? ` (${count})` : ''}
      </span>
      <div className="h-px flex-1 bg-white/6" />
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ config }: { config: AgentConfig }) {
  const configurableIds = [...GATEWAY_IDS, ...DEVICE_IDS];
  const connected = configurableIds.filter((id) => {
    const s = getState(id, config);
    return s.enabled && s.status === 'connected';
  }).length;
  const total = configurableIds.length;

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
        <span className="text-violet-400">{ALWAYS_ON_IDS.length} skills</span>
      </div>
    </div>
  );
}

// ── Reload button (manages its own loading state) ─────────────────────────────

function CardReloadButton({ agentId, onReload, label }: {
  agentId: string;
  onReload: Props['onReload'];
  label: string;
}) {
  const [reloading, setReloading] = useState(false);

  function handleReload() {
    if (reloading) return;
    setReloading(true);
    const ids = agentId === 'google' ? ['calendar', 'email'] : [agentId];
    ids.forEach((id) => onReload(id));
    setTimeout(() => setReloading(false), 3000);
  }

  return (
    <button
      type="button"
      onClick={handleReload}
      disabled={reloading}
      className="flex items-center gap-2 w-full justify-center rounded-xl border border-white/10 bg-white/4 hover:bg-white/8 hover:border-white/20 px-3 py-2 text-xs text-slate-400 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${reloading ? 'animate-spin' : ''}`} />
      {reloading ? 'Reloading…' : `Reload ${label} agent`}
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  config:              AgentConfig;
  onPatch:             <K extends keyof AgentConfig>(agent: K, p: Partial<AgentConfig[K]>) => void;
  onReload:            (agentId: string) => void;
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
  onVerifySocialMedia:   () => void;
  onConnectYoutube:      (loginHint?: string) => Promise<YouTubeDiscovery | null>;
  onCheckTunnel:       () => Promise<boolean>;
  onStartTunnel:       () => void;
  onStopTunnel:        () => void;
  agentVoices:         AgentVoiceMap;
  onAgentVoiceUpdate:  (agentId: string, p: Partial<AgentVoiceSetting>) => void;
  onAgentVoiceReset:   (agentId: string) => void;
  voices:              SpeechSynthesisVoice[];
  onTestAgentVoice:    (text: string, agentId: string) => void;
}

// ── Credential form renderer ───────────────────────────────────────────────────

function renderForm(agentId: string, props: Props): React.ReactNode {
  const { config, onPatch } = props;
  switch (agentId) {
    case 'system':
      return <SystemSettings />;
    case 'weather':
      return <WeatherSettings config={config.weather} onPatch={(p) => onPatch('weather', p)} onVerify={props.onVerifyWeather} />;
    case 'google':
      return <GoogleSettings config={config.google} onPatch={(p) => onPatch('google', p)} onConnect={props.onConnectGoogle} onDisconnect={props.onDisconnectGoogle} />;
    case 'github':
      return <GithubSettings config={config.github} onPatch={(p) => onPatch('github', p)} onVerify={props.onVerifyGitHub} onDisconnect={props.onDisconnectGitHub} />;
    case 'stock':
      return <StockSettings config={config.stock} onPatch={(p) => onPatch('stock', p)} googleToken={config.google.accessToken} />;
    case 'news':
      return <NewsSettings config={config.news} onPatch={(p) => onPatch('news', p)} onVerify={props.onVerifyNews} />;
    case 'smarthome':
      return <SmartHomeSettings config={config.smarthome} onPatch={(p) => onPatch('smarthome', p)} onVerify={props.onVerifySmartHome} />;
    case 'portfolio':
      return <PortfolioSettings config={config.portfolio} onPatch={(p) => onPatch('portfolio', p)} onConnect={props.onConnectPortfolio} onDisconnect={props.onDisconnectPortfolio} onRefresh={props.onRefreshPortfolio} />;
    case 'whatsapp':
      return <WhatsappSettings config={config.whatsapp} onPatch={(p) => onPatch('whatsapp', p)} onVerify={props.onVerifyWhatsApp} onCheckTunnel={props.onCheckTunnel} onStartTunnel={props.onStartTunnel} onStopTunnel={props.onStopTunnel} />;
    case 'socialmedia':
      return <SocialMediaSettings config={config.socialmedia} onPatch={(p) => onPatch('socialmedia', p)} onVerify={props.onVerifySocialMedia} onConnectYoutube={props.onConnectYoutube} />;
    default:
      return null;
  }
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function AgentsSettings(props: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  function voiceRow(agentId: string) {
    const meta = AGENT_META[agentId] ?? AGENT_META.general;
    return (
      <AgentVoiceRow
        agentId={agentId}
        label={meta.label}
        voice={props.agentVoices[agentId] ?? { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova' }}
        voices={props.voices}
        onUpdate={(p) => props.onAgentVoiceUpdate(agentId, p)}
        onReset={() => props.onAgentVoiceReset(agentId)}
        onTest={props.onTestAgentVoice}
      />
    );
  }

  return (
    <div className="space-y-2">
      <StatsBar config={props.config} />

      {/* ── Always-on skills ── */}
      <SectionHeader
        label="Built-in Skills"
        count={ALWAYS_ON_IDS.length}
      />
      {([...ALWAYS_ON_IDS, 'general'] as string[]).map((id, i) => {
        const meta  = AGENT_META[id] ?? AGENT_META.general;
        return (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2, ease: 'easeOut' }}
          >
            <AgentSettingsCard
              id={id}
              name={meta.label}
              tagline={meta.tagline}
              icon={meta.Icon}
              status="connected"
              enabled
              open={openId === id}
              onToggleOpen={() => toggle(id)}
            >
              {id === 'websearch'  && <WebSearchInfo />}
              {id === 'calculator' && <CalculatorInfo />}
              {id === 'memory'     && <MemoryInfo />}
              {id === 'briefing'   && <BriefingInfo />}
              {id === 'general'    && <GeneralAIInfo />}
              {voiceRow(id)}
            </AgentSettingsCard>
          </motion.div>
        );
      })}

      {/* ── Gateway services ── */}
      <SectionHeader label="Services" count={GATEWAY_IDS.length} />
      {GATEWAY_IDS.map((id, i) => {
        const meta   = AGENT_META[id] ?? AGENT_META.general;
        const state  = getState(id, props.config);
        const toggle_ = getToggle(id, props.config, props.onPatch);
        return (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2, ease: 'easeOut' }}
          >
            <AgentSettingsCard
              id={id}
              name={meta.label}
              tagline={meta.tagline}
              icon={meta.Icon}
              status={state.status}
              info={state.info}
              enabled={state.enabled}
              onToggleEnabled={toggle_}
              open={openId === id}
              onToggleOpen={() => toggle(id)}
            >
              <SecurityNotice />
              {renderForm(id, props)}
              <CardReloadButton agentId={id} onReload={props.onReload} label={meta.label} />
              {voiceRow(id)}
            </AgentSettingsCard>
          </motion.div>
        );
      })}

      {/* ── Smart devices ── */}
      <SectionHeader label="Smart Devices" count={DEVICE_IDS.length} />
      {DEVICE_IDS.map((id, i) => {
        const meta   = AGENT_META[id] ?? AGENT_META.general;
        const state  = getState(id, props.config);
        const toggle_ = getToggle(id, props.config, props.onPatch);
        return (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2, ease: 'easeOut' }}
          >
            <AgentSettingsCard
              id={id}
              name={meta.label}
              tagline={meta.tagline}
              icon={meta.Icon}
              status={state.status}
              info={state.info}
              enabled={state.enabled}
              onToggleEnabled={toggle_}
              open={openId === id}
              onToggleOpen={() => toggle(id)}
            >
              <SecurityNotice />
              {renderForm(id, props)}
              <CardReloadButton agentId={id} onReload={props.onReload} label={meta.label} />
              {voiceRow(id)}
            </AgentSettingsCard>
          </motion.div>
        );
      })}
    </div>
  );
}
