import { motion } from 'framer-motion';
import { useMemo } from 'react';

const BAR_COUNT = 36;

type WaveColor = 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose';

const COLOR_CLASS: Record<WaveColor, string> = {
  cyan: 'bg-cyan-400',
  violet: 'bg-violet-400',
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  rose: 'bg-rose-400',
};

const GLOW_STYLE: Record<WaveColor, string> = {
  cyan: 'rgba(34,211,238,0.6)',
  violet: 'rgba(167,139,250,0.6)',
  amber: 'rgba(251,191,36,0.6)',
  emerald: 'rgba(52,211,153,0.6)',
  rose: 'rgba(251,113,133,0.6)',
};

interface WaveVisualizerProps {
  active: boolean;
  color?: WaveColor;
  barCount?: number;
}

export function WaveVisualizer({ active, color = 'cyan', barCount = BAR_COUNT }: WaveVisualizerProps) {
  const bars = useMemo(
    () =>
      Array.from({ length: barCount }, (_, i) => {
        const x = i / barCount;
        const base = 3 + Math.sin(x * Math.PI) * 6;
        const peak = 10 + Math.sin(x * Math.PI) * 44 + Math.sin(x * Math.PI * 3) * 10;
        const duration = 0.38 + Math.abs(Math.sin(i * 0.6)) * 0.35;
        const delay = x * 0.55;
        return { base, peak, duration, delay };
      }),
    [barCount]
  );

  const barColor = COLOR_CLASS[color];
  const glowColor = GLOW_STYLE[color];

  return (
    <div
      className="flex items-end justify-center gap-[3px] w-full"
      style={{ height: 64 }}
      aria-hidden
    >
      {bars.map((bar, i) => (
        <motion.div
          key={i}
          className={`rounded-full ${barColor}`}
          style={{
            width: 3,
            boxShadow: active ? `0 0 6px ${glowColor}` : 'none',
          }}
          animate={
            active
              ? {
                  height: [`${bar.base}px`, `${bar.peak}px`, `${bar.base}px`],
                  opacity: [0.55, 1, 0.55],
                }
              : { height: '2px', opacity: 0.18 }
          }
          transition={
            active
              ? {
                  duration: bar.duration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: bar.delay,
                }
              : { duration: 0.5, ease: 'easeOut' }
          }
        />
      ))}
    </div>
  );
}
