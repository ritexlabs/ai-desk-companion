import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud, Calendar, Mail, GitBranch, Monitor, TrendingUp, Newspaper, Home,
  MessageCircle, Globe, Globe2, Calculator, Brain, Layers, PieChart,
  Bell, Wrench, Loader2, RotateCw, Play,
} from 'lucide-react';
import type { AgentDefinition, AgentStatus } from '../types/runtime';

const AGENT_META: Record<
  string,
  { icon: React.ReactNode; text: string; border: string; bg: string; dot: string; rgb: string }
> = {
  system:   { icon: <Monitor    className="h-4 w-4" />, text: 'text-teal-400',   border: 'border-teal-400/40',   bg: 'bg-teal-400/10',   dot: 'bg-teal-400',   rgb: '45,212,191'  },
  weather:  { icon: <Cloud      className="h-4 w-4" />, text: 'text-cyan-400',   border: 'border-cyan-400/40',   bg: 'bg-cyan-400/10',   dot: 'bg-cyan-400',   rgb: '34,211,238'  },
  google:   { icon: <Globe2     className="h-4 w-4" />, text: 'text-blue-400',   border: 'border-blue-400/40',   bg: 'bg-blue-400/10',   dot: 'bg-blue-400',   rgb: '96,165,250'  },
  github:   { icon: <GitBranch     className="h-4 w-4" />, text: 'text-amber-400',  border: 'border-amber-400/40',  bg: 'bg-amber-400/10',  dot: 'bg-amber-400',  rgb: '251,191,36'  },
  stock:    { icon: <TrendingUp className="h-4 w-4" />, text: 'text-green-400',  border: 'border-green-400/40',  bg: 'bg-green-400/10',  dot: 'bg-green-400',  rgb: '74,222,128'  },
  news:     { icon: <Newspaper  className="h-4 w-4" />, text: 'text-sky-400',    border: 'border-sky-400/40',    bg: 'bg-sky-400/10',    dot: 'bg-sky-400',    rgb: '56,189,248'  },
  smarthome:{ icon: <Home       className="h-4 w-4" />, text: 'text-orange-400', border: 'border-orange-400/40', bg: 'bg-orange-400/10', dot: 'bg-orange-400', rgb: '251,146,60'  },
  whatsapp: { icon: <MessageCircle className="h-4 w-4" />, text: 'text-green-400', border: 'border-green-400/40', bg: 'bg-green-400/10', dot: 'bg-green-400', rgb: '74,222,128'   },
  portfolio:{ icon: <PieChart   className="h-4 w-4" />, text: 'text-rose-400',   border: 'border-rose-400/40',   bg: 'bg-rose-400/10',   dot: 'bg-rose-400',   rgb: '251,113,133' },
  utility:     { icon: <Wrench className="h-4 w-4" />, text: 'text-indigo-400', border: 'border-indigo-400/40', bg: 'bg-indigo-400/10', dot: 'bg-indigo-400', rgb: '129,140,248' },
  socialmedia: { icon: <Play   className="h-4 w-4" />, text: 'text-red-400',    border: 'border-red-400/40',    bg: 'bg-red-400/10',    dot: 'bg-red-400',    rgb: '248,113,113' },
  general:     { icon: <Monitor className="h-4 w-4" />, text: 'text-slate-400', border: 'border-slate-400/40',  bg: 'bg-slate-400/10',  dot: 'bg-slate-400',  rgb: '148,163,184' },
};

// Sub-service chips for Google card
const GOOGLE_SUB_META: Record<string, { icon: React.ReactNode; label: string; dot: string }> = {
  calendar: { icon: <Calendar className="h-2.5 w-2.5" />, label: 'Cal',   dot: 'bg-violet-400'  },
  email:    { icon: <Mail     className="h-2.5 w-2.5" />, label: 'Gmail', dot: 'bg-emerald-400' },
};

// Sub-tool chips for Utility card
const UTILITY_SUB_META: Record<string, { icon: React.ReactNode; label: string; dot: string }> = {
  websearch:  { icon: <Globe       className="h-2.5 w-2.5" />, label: 'Search',   dot: 'bg-blue-400'   },
  calculator: { icon: <Calculator  className="h-2.5 w-2.5" />, label: 'Calc',     dot: 'bg-amber-400'  },
  memory:     { icon: <Brain       className="h-2.5 w-2.5" />, label: 'Memory',   dot: 'bg-purple-400' },
  briefing:   { icon: <Layers      className="h-2.5 w-2.5" />, label: 'Briefing', dot: 'bg-cyan-400'   },
  notes:      { icon: <Bell        className="h-2.5 w-2.5" />, label: 'Notes',    dot: 'bg-violet-400' },
};

const GOOGLE_IDS  = new Set(['calendar', 'email', 'drive']);
const UTILITY_IDS = new Set(['websearch', 'calculator', 'memory', 'briefing', 'notes']);

const STATUS_RANK: Record<AgentStatus, number> = { online: 0, starting: 1, degraded: 2, failed: 3, offline: 4 };

function bestOf(subs: AgentDefinition[]): AgentStatus {
  return subs.reduce<AgentStatus>(
    (best, a) => STATUS_RANK[a.status] < STATUS_RANK[best] ? a.status : best,
    'offline',
  );
}

function mergeGoogleAgents(agents: AgentDefinition[]): {
  list: AgentDefinition[];
  googleSubs: AgentDefinition[];
} {
  const googleSubs = agents.filter(a => GOOGLE_IDS.has(a.id));
  if (googleSubs.length === 0) return { list: agents, googleSubs: [] };

  const googleEntry: AgentDefinition = {
    id: 'google', label: 'Google',
    description: '', example: '', color: '',
    status: bestOf(googleSubs),
  };

  const firstIdx = agents.findIndex(a => GOOGLE_IDS.has(a.id));
  const list = agents.filter(a => !GOOGLE_IDS.has(a.id));
  list.splice(firstIdx, 0, googleEntry);
  return { list, googleSubs };
}

function mergeUtilityAgents(agents: AgentDefinition[]): {
  list: AgentDefinition[];
  utilitySubs: AgentDefinition[];
} {
  const utilitySubs = agents.filter(a => UTILITY_IDS.has(a.id));
  if (utilitySubs.length === 0) return { list: agents, utilitySubs: [] };

  const utilityEntry: AgentDefinition = {
    id: 'utility', label: 'Skill Hub',
    description: '', example: '', color: '',
    status: bestOf(utilitySubs),
  };

  // Insert at the position of the first utility agent
  const firstIdx = agents.findIndex(a => UTILITY_IDS.has(a.id));
  const list = agents.filter(a => !UTILITY_IDS.has(a.id));
  list.splice(firstIdx >= 0 ? firstIdx : list.length, 0, utilityEntry);
  return { list, utilitySubs };
}

function StatusLED({ status, dot }: { status: AgentDefinition['status']; dot: string }) {
  if (status === 'online')
    return (
      <span className="relative flex-shrink-0 h-3 w-3">
        <motion.span
          className={`absolute inset-0 rounded-full ${dot}`}
          animate={{ scale: [1, 2.6], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
        <span className={`absolute inset-0 rounded-full ${dot}`} />
      </span>
    );
  if (status === 'starting')
    return <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-cyan-400" />;
  if (status === 'degraded')
    return (
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        className="h-3 w-3 flex-shrink-0 rounded-full bg-amber-400"
      />
    );
  if (status === 'failed')
    return <div className="h-3 w-3 flex-shrink-0 rounded-full bg-red-500" />;
  return <div className="h-3 w-3 flex-shrink-0 rounded-full bg-slate-700 border border-slate-600/60" />;
}

interface AgentBootListProps {
  agents: AgentDefinition[];
  activeAgentId: string | null;
  onReload?: (agentId: string) => void;
}

export function AgentBootList({ agents, activeAgentId, onReload }: AgentBootListProps) {
  const presorted = [...agents].sort((a, b) => {
    if (a.id === 'system') return -1;
    if (b.id === 'system') return 1;
    return 0;
  });

  const { list: afterGoogle, googleSubs } = mergeGoogleAgents(presorted);
  const { list: sorted, utilitySubs } = mergeUtilityAgents(afterGoogle);

  const onlineCount = sorted.filter(a => a.status === 'online').length;
  const allOnline = onlineCount === sorted.length && sorted.length > 0;

  return (
    <div className="flex flex-col gap-1.5">

      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
          <span className="text-[9px] uppercase tracking-[0.35em] text-slate-500 font-orbitron">Neural Roster</span>
          <div className="h-px w-6 bg-gradient-to-l from-transparent to-white/10" />
        </div>
        <div className={`ml-3 flex items-center gap-1 rounded-full px-2 py-0.5 border text-[9px] font-mono ${
          allOnline
            ? 'border-emerald-400/30 bg-emerald-400/8 text-emerald-400'
            : 'border-white/10 bg-white/3 text-slate-500'
        }`}>
          <motion.div
            animate={allOnline ? { scale: [1, 1.5], opacity: [0.6, 0] } : {}}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            className={`h-1.5 w-1.5 rounded-full ${allOnline ? 'bg-emerald-400' : 'bg-slate-600'}`}
          />
          <span>{onlineCount}/{sorted.length}</span>
        </div>
      </div>

      {/* All-online banner */}
      <AnimatePresence>
        {allOnline && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative overflow-hidden rounded-xl border border-emerald-400/22 bg-emerald-400/6 px-3 py-1.5 text-center"
          >
            <motion.div
              className="pointer-events-none absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-emerald-400/12 to-transparent skew-x-12"
              animate={{ left: ['-5rem', '110%'] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
            />
            <span className="text-[9px] font-mono text-emerald-300 tracking-widest uppercase">
              ✦ all agents nominal
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent cards */}
      {sorted.map((agent, i) => {
        const meta = AGENT_META[agent.id] ?? AGENT_META.general;
        const isActive = agent.id === activeAgentId;
        const isOnline = agent.status === 'online';

        return (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}
            whileHover={isOnline ? { y: -2, transition: { duration: 0.12 } } : {}}
            className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${
              isActive
                ? `${meta.border} ${meta.bg}`
                : isOnline
                  ? 'border-white/8 bg-white/[0.025] hover:bg-white/[0.04] hover:border-white/14'
                  : agent.status === 'degraded'
                    ? 'border-amber-400/12 bg-amber-400/4 opacity-65'
                    : agent.status === 'failed'
                      ? 'border-red-500/12 bg-red-500/4 opacity-60'
                      : 'border-white/5 bg-white/[0.01] opacity-45'
            }`}
            style={isActive ? { boxShadow: `0 0 22px rgba(${meta.rgb},0.18), 0 0 8px rgba(${meta.rgb},0.08)` } : {}}
          >
            {/* Animated border flash when active */}
            {isActive && (
              <motion.div
                className={`absolute inset-0 rounded-xl border ${meta.border}`}
                animate={{ opacity: [0, 0.85, 0] }}
                transition={{ duration: 1.0, repeat: Infinity }}
              />
            )}

            {/* Shimmer sweep */}
            {isActive && (
              <motion.div
                className="pointer-events-none absolute inset-y-0 w-14 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent skew-x-12"
                animate={{ left: ['-3.5rem', '110%'] }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.4, ease: 'easeInOut' }}
              />
            )}

            {/* Left accent bar */}
            <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full transition-all duration-300 ${meta.dot} ${
              isActive ? 'opacity-100' : isOnline ? 'opacity-20' : 'opacity-0'
            }`} />

            <div className="flex items-center gap-2.5 px-3 py-2.5 pl-4">

              {/* Icon in colored container */}
              <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                isActive
                  ? `${meta.bg} border ${meta.border}`
                  : isOnline
                    ? 'bg-white/5 border border-white/8'
                    : 'bg-white/3 border border-white/5'
              }`}
                style={isActive ? { boxShadow: `0 0 10px rgba(${meta.rgb},0.25)` } : {}}
              >
                <div className={`transition-all duration-300 ${isActive ? meta.text : isOnline ? 'text-slate-400' : 'text-slate-600'}`}>
                  {meta.icon}
                </div>
              </div>

              {/* Label + status text */}
              <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-semibold leading-tight tracking-wide transition-colors duration-300 ${
                  isActive ? meta.text : isOnline ? 'text-white/75' : 'text-white/25'
                }`}>
                  {agent.label}
                </div>

                {/* Google sub-service dots */}
                {agent.id === 'google' && googleSubs.length > 0 ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    {googleSubs.map(sub => {
                      const sm = GOOGLE_SUB_META[sub.id];
                      if (!sm) return null;
                      const subOn = sub.status === 'online';
                      return (
                        <span key={sub.id} className="flex items-center gap-0.5">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${subOn ? sm.dot : 'bg-slate-700'}`} />
                          <span className={`text-[8px] font-mono ${subOn ? 'text-slate-400' : 'text-slate-600'}`}>
                            {sm.label}
                          </span>
                        </span>
                      );
                    })}
                  </div>

                ) : agent.id === 'utility' && utilitySubs.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    {utilitySubs.map(sub => {
                      const sm = UTILITY_SUB_META[sub.id];
                      if (!sm) return null;
                      const subOn = sub.status === 'online';
                      return (
                        <span key={sub.id} className={`flex items-center gap-0.5 rounded px-1 py-0.5 border transition-colors ${
                          subOn
                            ? 'border-white/8 bg-white/4 text-slate-400'
                            : 'border-white/4 bg-transparent text-slate-700'
                        }`}>
                          <span className={`flex-shrink-0 ${subOn ? 'opacity-80' : 'opacity-30'}`}>{sm.icon}</span>
                          <span className="text-[7.5px] font-mono leading-none">{sm.label}</span>
                          <span className={`ml-0.5 h-1 w-1 rounded-full flex-shrink-0 ${subOn ? sm.dot : 'bg-slate-700'}`} />
                        </span>
                      );
                    })}
                  </div>

                ) : (
                  <AnimatePresence mode="wait">
                    {isActive ? (
                      <motion.div
                        key="active"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-center gap-1 mt-0.5"
                      >
                        {[0, 1, 2].map(j => (
                          <motion.div
                            key={j}
                            className={`h-1 w-1 rounded-full ${meta.dot}`}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 0.55, repeat: Infinity, delay: j * 0.14 }}
                          />
                        ))}
                        <span className={`text-[8px] font-mono uppercase tracking-[0.22em] ${meta.text} opacity-90 ml-0.5`}>
                          active
                        </span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="status"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[9px] font-mono text-slate-600 mt-0.5"
                      >
                        {agent.status === 'online'   ? 'online'
                         : agent.status === 'starting' ? 'booting…'
                         : agent.status === 'degraded' ? 'degraded'
                         : agent.status === 'failed'   ? 'failed'
                         : 'offline'}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>

              {/* Status LED */}
              <StatusLED status={agent.status} dot={meta.dot} />

              {/* Reload button */}
              {onReload && agent.status !== 'starting' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReload(agent.id); }}
                  title={`Reload ${agent.label}`}
                  className="flex-shrink-0 p-1 rounded-md text-slate-700 hover:text-slate-400 hover:bg-white/8 transition"
                >
                  <RotateCw className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Legend */}
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[8px] text-slate-700 uppercase tracking-widest px-1 font-mono">
        <div className="flex items-center gap-1.5">
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }}
            className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Online
        </div>
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-1.5 w-1.5 animate-spin text-cyan-500" />
          Starting
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Degraded
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-red-500" /> Failed
        </div>
      </div>
    </div>
  );
}
