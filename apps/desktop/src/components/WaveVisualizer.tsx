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
  /** 0–1: controls peak height and animation speed. 1 = speaking, 0.6 = listening, 0.3 = thinking */
  intensity?: number;
}

export function WaveVisualizer({ active, color = 'cyan', barCount = BAR_COUNT, intensity = 1.0 }: WaveVisualizerProps) {
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
    [barCount],
  );

  const clampedIntensity = Math.max(0.05, Math.min(1.0, intensity));
  const barColor = COLOR_CLASS[color];
  const glowColor = GLOW_STYLE[color];

  return (
    <div
      className="flex items-end justify-center gap-[3px] w-full"
      style={{ height: 64 }}
      aria-hidden
    >
      {bars.map((bar, i) => {
        const scaledPeak = Math.max(bar.base + 2, bar.peak * clampedIntensity);
        const scaledDuration = bar.duration / Math.max(0.4, clampedIntensity);
        const scaledDelay = bar.delay * (1 / Math.max(0.5, clampedIntensity));
        return (
          <motion.div
            key={i}
            className={`rounded-full ${barColor}`}
            style={{
              width: 3,
              boxShadow: active ? `0 0 ${4 + clampedIntensity * 4}px ${glowColor}` : 'none',
            }}
            animate={
              active
                ? {
                    height: [`${bar.base}px`, `${scaledPeak}px`, `${bar.base}px`],
                    opacity: [0.45, Math.min(1, 0.5 + 0.5 * clampedIntensity), 0.45],
                  }
                : { height: '2px', opacity: 0.18 }
            }
            transition={
              active
                ? {
                    duration: scaledDuration,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: scaledDelay,
                  }
                : { duration: 0.5, ease: 'easeOut' }
            }
          />
        );
      })}
    </div>
  );
}
