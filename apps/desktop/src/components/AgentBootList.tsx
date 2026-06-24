import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, Calendar, Mail, Github, Monitor, TrendingUp, Newspaper, Home, Loader2, RotateCw } from 'lucide-react';
import type { AgentDefinition } from '../types/runtime';

const AGENT_META: Record<
  string,
  { icon: React.ReactNode; text: string; border: string; bg: string; glow: string; dot: string }
> = {
  system: {
    icon: <Monitor className="h-3.5 w-3.5" />,
    text: 'text-teal-400',
    border: 'border-teal-400/35',
    bg: 'bg-teal-400/10',
    glow: 'shadow-teal-400/25',
    dot: 'bg-teal-400',
  },
  weather: {
    icon: <Cloud className="h-3.5 w-3.5" />,
    text: 'text-cyan-400',
    border: 'border-cyan-400/35',
    bg: 'bg-cyan-400/10',
    glow: 'shadow-cyan-400/25',
    dot: 'bg-cyan-400',
  },
  calendar: {
    icon: <Calendar className="h-3.5 w-3.5" />,
    text: 'text-violet-400',
    border: 'border-violet-400/35',
    bg: 'bg-violet-400/10',
    glow: 'shadow-violet-400/25',
    dot: 'bg-violet-400',
  },
  email: {
    icon: <Mail className="h-3.5 w-3.5" />,
    text: 'text-emerald-400',
    border: 'border-emerald-400/35',
    bg: 'bg-emerald-400/10',
    glow: 'shadow-emerald-400/25',
    dot: 'bg-emerald-400',
  },
  github: {
    icon: <Github className="h-3.5 w-3.5" />,
    text: 'text-amber-400',
    border: 'border-amber-400/35',
    bg: 'bg-amber-400/10',
    glow: 'shadow-amber-400/25',
    dot: 'bg-amber-400',
  },
  stock: {
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    text: 'text-green-400',
    border: 'border-green-400/35',
    bg: 'bg-green-400/10',
    glow: 'shadow-green-400/25',
    dot: 'bg-green-400',
  },
  news: {
    icon: <Newspaper className="h-3.5 w-3.5" />,
    text: 'text-sky-400',
    border: 'border-sky-400/35',
    bg: 'bg-sky-400/10',
    glow: 'shadow-sky-400/25',
    dot: 'bg-sky-400',
  },
  smarthome: {
    icon: <Home className="h-3.5 w-3.5" />,
    text: 'text-orange-400',
    border: 'border-orange-400/35',
    bg: 'bg-orange-400/10',
    glow: 'shadow-orange-400/25',
    dot: 'bg-orange-400',
  },
};

/** Compact colored dot with ping ring for online, spin for starting */
function StatusDot({ status, dot }: { status: AgentDefinition['status']; dot: string }) {
  if (status === 'online')
    return (
      <span className="relative flex-shrink-0 h-2 w-2">
        <motion.span
          className={`absolute inset-0 rounded-full ${dot}`}
          animate={{ scale: [1, 2.6], opacity: [0.55, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
        <span className={`absolute inset-0 rounded-full ${dot}`} />
      </span>
    );
  if (status === 'starting')
    return <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-cyan-400" />;
  if (status === 'degraded')
    return (
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-400"
      />
    );
  if (status === 'failed')
    return <div className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />;
  return <div className="h-2 w-2 flex-shrink-0 rounded-full bg-slate-600" />;
}

interface AgentBootListProps {
  agents: AgentDefinition[];
  activeAgentId: string | null;
  onReload?: (agentId: string) => void;
}

export function AgentBootList({ agents, activeAgentId, onReload }: AgentBootListProps) {
  // System agent always first, others maintain registration order
  const sorted = [...agents].sort((a, b) => {
    if (a.id === 'system') return -1;
    if (b.id === 'system') return 1;
    return 0;
  });

  const allOnline = sorted.every((a) => a.status === 'online');

  return (
    <div className="flex flex-col gap-1.5">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Agent Roster</span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
      </div>

      {/* All-online banner */}
      <AnimatePresence>
        {allOnline && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.97 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.97 }}
            className="relative overflow-hidden rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-3 py-1.5 text-[10px] text-emerald-300 text-center"
          >
            {/* shimmer sweep */}
            <motion.div
              className="pointer-events-none absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-emerald-400/15 to-transparent skew-x-12"
              animate={{ left: ['-5rem', '110%'] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }}
            />
            ✦ All {sorted.length} agent{sorted.length !== 1 ? 's' : ''} online
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent cards */}
      {sorted.map((agent, i) => {
        const meta = AGENT_META[agent.id];
        if (!meta) return null;
        const isActive = agent.id === activeAgentId;

        return (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35, ease: 'easeOut' }}
            whileHover={agent.status === 'online' ? { y: -2, transition: { duration: 0.15 } } : {}}
            whileTap={agent.status === 'online' ? { scale: 0.98 } : {}}
            className={`relative overflow-hidden rounded-xl border transition-colors duration-300 cursor-default ${
              isActive
                ? `${meta.border} ${meta.bg} shadow-lg ${meta.glow}`
                : agent.status === 'online'
                  ? 'border-white/10 bg-white/3 hover:bg-white/5 hover:border-white/18'
                  : agent.status === 'degraded'
                    ? 'border-amber-400/15 bg-amber-400/5 opacity-70'
                    : agent.status === 'failed'
                      ? 'border-red-500/15 bg-red-500/5 opacity-70'
                      : 'border-white/6 bg-white/2 opacity-50'
            }`}
          >
            {/* Animated border pulse when responding */}
            {isActive && (
              <motion.div
                className={`absolute inset-0 rounded-xl border ${meta.border}`}
                animate={{ opacity: [0, 0.9, 0] }}
                transition={{ duration: 1.1, repeat: Infinity }}
              />
            )}

            {/* Shimmer sweep — only when this agent is actively responding */}
            {isActive && (
              <motion.div
                className="pointer-events-none absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent skew-x-12"
                animate={{ left: ['-3rem', '110%'] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.5, ease: 'easeInOut' }}
              />
            )}

            {/* Left accent bar — solid when responding, thin when just online */}
            <div
              className={`absolute left-0 top-0 bottom-0 rounded-r-full transition-all duration-300 ${meta.dot} ${
                isActive ? 'w-1 opacity-100' : agent.status === 'online' ? 'w-px opacity-30' : 'w-px opacity-0'
              }`}
            />

            <div className="flex items-center gap-2 px-3 py-2.5 pl-4">
              {/* Agent icon */}
              <div className={`flex-shrink-0 transition-all duration-300 ${meta.text} ${isActive ? 'opacity-100 scale-110' : 'opacity-60'}`}>
                {meta.icon}
              </div>

              {/* Name + responding label */}
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold leading-tight transition-colors duration-300 ${
                  isActive ? meta.text : agent.status === 'online' ? 'text-white' : 'text-white/50'
                }`}>
                  {agent.label}
                </div>
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      key="responding"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex items-center gap-1 mt-0.5 ${meta.text}`}
                    >
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.7, repeat: Infinity }}
                        className="text-[8px]"
                      >
                        ▶
                      </motion.span>
                      <span className="text-[9px] uppercase tracking-widest opacity-80">Responding</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Status dot */}
              <StatusDot status={agent.status} dot={meta.dot} />

              {/* Reload button */}
              {onReload && agent.status !== 'starting' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReload(agent.id); }}
                  title={`Reload ${agent.label}`}
                  className={`flex-shrink-0 rounded-md p-1 transition hover:bg-white/10 ${
                    isActive ? `${meta.text} opacity-70` : 'text-slate-600 hover:text-slate-300'
                  }`}
                >
                  <RotateCw className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Legend */}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-600 uppercase tracking-wider px-1">
        <div className="flex items-center gap-1.5">
          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
            className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Online
        </div>
        <div className="flex items-center gap-1.5">
          <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.8, repeat: Infinity }}
            className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
          Starting
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Degraded
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-slate-600" /> Offline
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-red-500" /> Failed
        </div>
      </div>
    </div>
  );
}
