import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { ConnectionStatus } from '../../hooks/useAgentConfig';
import { StatusBadge } from './shared';

export function AgentToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={enabled ? 'Disable agent' : 'Enable agent'}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-emerald-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function AgentAccordion({
  id, label, emoji, status, info, open, onToggle, children, enabled, onToggleEnabled,
}: {
  id: string;
  label: string;
  emoji: string;
  status: ConnectionStatus;
  info?: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  enabled?: boolean;
  onToggleEnabled?: () => void;
}) {
  return (
    <div className={`rounded-2xl border transition-all ${open ? 'border-white/15 bg-white/4' : 'border-white/8 bg-white/2'} ${enabled === false ? 'opacity-55' : ''}`}>
      <button
        onClick={children ? onToggle : undefined}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${children ? '' : 'cursor-default'}`}
      >
        <span className="text-lg">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${enabled === false ? 'text-slate-400' : 'text-white'}`}>{label}</div>
          <StatusBadge
            status={enabled === false ? 'idle' : status}
            info={enabled === false ? 'Disabled — toggle to enable' : info}
          />
        </div>
        {onToggleEnabled !== undefined && (
          <AgentToggle enabled={enabled ?? true} onToggle={onToggleEnabled} />
        )}
        {children && (
          <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </motion.div>
        )}
      </button>

      <AnimatePresence>
        {open && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
