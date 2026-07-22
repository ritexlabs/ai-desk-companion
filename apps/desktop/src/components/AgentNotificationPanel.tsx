import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, X, Cloud, Calendar, Mail, GitBranch, TrendingUp, Newspaper,
  Home, Briefcase, Play, Monitor, AlertTriangle, Info,
} from 'lucide-react';
import type { AgentNotification } from '../types/runtime';

const AGENT_ICON: Record<string, React.ReactNode> = {
  system:      <Monitor    className="h-3.5 w-3.5" />,
  weather:     <Cloud      className="h-3.5 w-3.5" />,
  calendar:    <Calendar   className="h-3.5 w-3.5" />,
  email:       <Mail       className="h-3.5 w-3.5" />,
  github:      <GitBranch  className="h-3.5 w-3.5" />,
  stock:       <TrendingUp className="h-3.5 w-3.5" />,
  news:        <Newspaper  className="h-3.5 w-3.5" />,
  smarthome:   <Home       className="h-3.5 w-3.5" />,
  portfolio:   <Briefcase  className="h-3.5 w-3.5" />,
  socialmedia: <Play       className="h-3.5 w-3.5" />,
};

const SEVERITY_STYLE: Record<string, { border: string; bg: string; icon: React.ReactNode; label: string; dot: string }> = {
  critical: { border: 'border-red-400/30',    bg: 'bg-red-400/8',    icon: <AlertTriangle className="h-3 w-3 text-red-400"    />, label: 'text-red-300',    dot: 'bg-red-400'    },
  warning:  { border: 'border-amber-400/30',  bg: 'bg-amber-400/8',  icon: <AlertTriangle className="h-3 w-3 text-amber-400"  />, label: 'text-amber-300',  dot: 'bg-amber-400'  },
  info:     { border: 'border-blue-400/25',   bg: 'bg-blue-400/6',   icon: <Info          className="h-3 w-3 text-blue-400"   />, label: 'text-blue-300',   dot: 'bg-blue-400'   },
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

interface Props {
  notifications: AgentNotification[];
  onDismiss:     (id: string) => void;
}

export function AgentNotificationPanel({ notifications, onDismiss }: Props) {
  if (notifications.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="shrink-0 px-3 pb-2 pt-1 border-t border-white/6 space-y-1.5"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-0.5 pt-0.5">
        <motion.div
          animate={{ rotate: [-12, 12, -8, 8, -3, 3, 0, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 2.5 }}
        >
          <Bell className="h-3 w-3 text-slate-500" />
        </motion.div>
        <span className="text-[8px] uppercase tracking-[0.3em] text-slate-600 font-mono">
          Notifications
        </span>
        <span className="ml-auto text-[8px] rounded-full bg-white/6 border border-white/10 px-1.5 py-px text-slate-500 font-mono">
          {notifications.length}
        </span>
      </div>

      {/* Notification list */}
      <AnimatePresence initial={false}>
        {notifications.map((n) => {
          const s    = SEVERITY_STYLE[n.severity] ?? SEVERITY_STYLE.info;
          const icon = AGENT_ICON[n.agentId] ?? <Bell className="h-3.5 w-3.5" />;

          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: -12, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, x: 12, height: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`relative overflow-hidden rounded-xl border ${s.border} ${s.bg}`}
            >
              {/* Severity accent bar */}
              <div className={`absolute left-0 inset-y-0 w-[3px] rounded-r-full ${s.dot}`} />

              <div className="flex items-start gap-2 pl-3 pr-2 py-2">
                {/* Agent icon */}
                <div className="shrink-0 mt-0.5 text-slate-400">
                  {icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[9px] font-semibold uppercase tracking-wide ${s.label}`}>
                      {n.agentLabel}
                    </span>
                    <span className="text-[8px] text-slate-700 font-mono">{timeAgo(n.timestamp)}</span>
                  </div>
                  <p className="text-[10px] text-slate-300 leading-snug">{n.message}</p>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => onDismiss(n.id)}
                  className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center text-slate-700 hover:text-slate-400 transition rounded"
                  title="Dismiss"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
