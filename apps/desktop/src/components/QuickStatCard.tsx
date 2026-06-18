import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

type CardColor = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose';

interface QuickStatCardProps {
  icon: LucideIcon;
  title: string;
  value: string | number;
  subtitle: string;
  color: CardColor;
  live?: boolean;
  trend?: 'up' | 'down' | 'neutral';
}

const COLOR = {
  cyan: {
    icon: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-400/20',
    badge: 'bg-cyan-400/15 text-cyan-300',
    glow: 'rgba(34,211,238,0.15)',
    dot: 'bg-cyan-400',
  },
  violet: {
    icon: 'text-violet-400',
    bg: 'bg-violet-400/10',
    border: 'border-violet-400/20',
    badge: 'bg-violet-400/15 text-violet-300',
    glow: 'rgba(167,139,250,0.15)',
    dot: 'bg-violet-400',
  },
  emerald: {
    icon: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    badge: 'bg-emerald-400/15 text-emerald-300',
    glow: 'rgba(52,211,153,0.15)',
    dot: 'bg-emerald-400',
  },
  amber: {
    icon: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    badge: 'bg-amber-400/15 text-amber-300',
    glow: 'rgba(251,191,36,0.15)',
    dot: 'bg-amber-400',
  },
  rose: {
    icon: 'text-rose-400',
    bg: 'bg-rose-400/10',
    border: 'border-rose-400/20',
    badge: 'bg-rose-400/15 text-rose-300',
    glow: 'rgba(251,113,133,0.15)',
    dot: 'bg-rose-400',
  },
} satisfies Record<CardColor, object>;

export function QuickStatCard({ icon: Icon, title, value, subtitle, color, live }: QuickStatCardProps) {
  const c = COLOR[color];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${c.border} ${c.bg} backdrop-blur-sm p-4`}
      style={{ boxShadow: live ? `0 4px 24px ${c.glow}` : undefined }}
    >
      {/* Subtle top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-black/25 ${c.icon}`}>
          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        </div>
        {live && (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className={`mt-1 h-2 w-2 rounded-full ${c.dot}`}
            style={{ boxShadow: `0 0 6px ${c.glow}` }}
          />
        )}
      </div>

      <div className="mt-3 space-y-1">
        <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{title}</div>
        <div className={`text-2xl font-bold tabular-nums ${c.icon}`}>{value}</div>
        <div className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${c.badge}`}>{subtitle}</div>
      </div>
    </div>
  );
}
