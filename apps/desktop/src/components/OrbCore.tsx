import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import type { RuntimePhase } from '../types/runtime';

export function OrbCore({ phase }: { phase: RuntimePhase }) {
  const haloClass =
    phase === 'standby' || phase === 'sleep'
      ? 'from-slate-500/20 via-slate-700/10 to-transparent'
      : phase === 'booting' || phase === 'wake_detected'
        ? 'from-cyan-400/40 via-violet-500/20 to-transparent'
        : phase === 'thinking'
          ? 'from-amber-400/40 via-orange-500/20 to-transparent'
          : 'from-emerald-400/35 via-cyan-500/20 to-transparent';

  return (
    <div className="relative mx-auto flex h-[320px] items-center justify-center">
      <motion.div
        animate={{ scale: phase === 'standby' ? 1 : [1, 1.05, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className={`absolute h-72 w-72 rounded-full bg-gradient-to-br ${haloClass} blur-3xl`}
      />
      <motion.div
        animate={{ rotate: phase === 'standby' ? 0 : 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        className="absolute h-64 w-64 rounded-full border border-cyan-400/20"
      />
      <motion.div
        animate={{ rotate: phase === 'standby' ? 0 : -360 }}
        transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        className="absolute h-52 w-52 rounded-full border border-violet-400/20"
      />
      <motion.div
        animate={{ scale: phase === 'responding' ? [1, 1.08, 1] : phase === 'ready' ? [1, 1.04, 1] : 1 }}
        transition={{ duration: 1.2, repeat: Infinity }}
        className="relative flex h-36 w-36 items-center justify-center rounded-full border border-white/10 bg-black/30 shadow-glow backdrop-blur-xl"
      >
        <Bot className="h-14 w-14 text-cyan-300" />
        <motion.div
          animate={{ opacity: phase === 'standby' ? 0.2 : [0.3, 1, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="absolute inset-0 rounded-full border border-cyan-300/30"
        />
      </motion.div>
    </div>
  );
}
