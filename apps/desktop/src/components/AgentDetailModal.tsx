import { motion } from 'framer-motion';
import { X, RotateCw } from 'lucide-react';
import type { AgentDefinition } from '../types/runtime';

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
}

const COLORS: Record<string, { text: string; border: string; bg: string; dot: string; glow: string }> = {
  system:   { text: 'text-teal-300',    border: 'border-teal-400/30',    bg: 'bg-teal-400/8',    dot: 'bg-teal-400',    glow: 'rgba(45,212,191,0.12)' },
  weather:  { text: 'text-cyan-300',    border: 'border-cyan-400/30',    bg: 'bg-cyan-400/8',    dot: 'bg-cyan-400',    glow: 'rgba(34,211,238,0.12)' },
  calendar: { text: 'text-violet-300',  border: 'border-violet-400/30',  bg: 'bg-violet-400/8',  dot: 'bg-violet-400',  glow: 'rgba(167,139,250,0.12)' },
  email:    { text: 'text-emerald-300', border: 'border-emerald-400/30', bg: 'bg-emerald-400/8', dot: 'bg-emerald-400', glow: 'rgba(52,211,153,0.12)' },
  github:   { text: 'text-amber-300',   border: 'border-amber-400/30',   bg: 'bg-amber-400/8',   dot: 'bg-amber-400',   glow: 'rgba(251,191,36,0.12)' },
  stock:    { text: 'text-green-300',   border: 'border-green-400/30',   bg: 'bg-green-400/8',   dot: 'bg-green-400',   glow: 'rgba(74,222,128,0.12)' },
  news:     { text: 'text-sky-300',     border: 'border-sky-400/30',     bg: 'bg-sky-400/8',     dot: 'bg-sky-400',     glow: 'rgba(56,189,248,0.12)' },
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

export function AgentDetailModal({ agent, bootMessage, metrics, onClose, onReload }: AgentDetailModalProps) {
  const c = COLORS[agent.id] ?? COLORS.general;
  const st = STATUS_LABEL[agent.status] ?? STATUS_LABEL.offline;

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
        className={`fixed top-1/2 left-1/2 z-50 w-[340px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border ${c.border} bg-[#07091a] backdrop-blur-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient top band */}
        <div className={`h-px w-full ${c.dot.replace('bg-', 'bg-gradient-to-r from-transparent via-')} opacity-60`} />

        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${c.border}`}>
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

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
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
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-2 px-4 py-3 border-t ${c.border}`}>
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
        </div>
      </motion.div>
    </>
  );
}
