import { type LucideIcon, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AGENT_PALETTE, AGENT_PALETTE_FALLBACK } from '../../lib/agentPalette';
import { HoloCard } from './HoloCard';
import { StatusBadge } from './shared';
import type { ConnectionStatus } from '../../hooks/useAgentConfig';

interface AgentSettingsCardProps {
  id: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  status: ConnectionStatus;
  info?: string;
  enabled: boolean;
  onToggleEnabled?: () => void;
  open: boolean;
  onToggleOpen: () => void;
  children?: React.ReactNode;
}

export function AgentSettingsCard({
  id, name, tagline, icon: Icon, status, info,
  enabled, onToggleEnabled, open, onToggleOpen, children,
}: AgentSettingsCardProps) {
  const p = AGENT_PALETTE[id] ?? AGENT_PALETTE_FALLBACK;
  const effectiveStatus = enabled ? status : 'idle';
  const effectiveInfo   = enabled ? info   : 'Disabled — toggle to enable';

  return (
    <HoloCard agentId={id}>
      <button
        onClick={onToggleOpen}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${p.bg} border ${p.border}`}
          style={{ boxShadow: `0 0 8px ${p.glowRgba}` }}
        >
          <Icon
            className={`h-4 w-4 ${p.text}`}
            style={{ filter: `drop-shadow(0 0 4px ${p.neonRgba})` }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div
            className={`text-sm font-semibold truncate ${p.text}`}
            style={{ filter: `drop-shadow(0 0 5px ${p.neonRgba})` }}
          >
            {name}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5">{tagline}</div>
          <StatusBadge status={effectiveStatus} info={effectiveInfo} />
        </div>

        {onToggleEnabled !== undefined && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleEnabled(); }}
            aria-label={enabled ? `Disable ${name}` : `Enable ${name}`}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              enabled ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        )}

        {children && (
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-slate-600" />
          </motion.div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && children && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-1 space-y-3 border-t"
              style={{ borderColor: p.glowRgba.replace('0.35', '0.12') }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </HoloCard>
  );
}
