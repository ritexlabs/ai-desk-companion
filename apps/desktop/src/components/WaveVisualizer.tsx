import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { connectMic, getActiveFrequency } from '../lib/audioAnalyser';

const BAR_COUNT = 36;

type WaveColor = 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose';

/** CSS hex colours for each named colour (used for canvas bars) */
const COLOR_HEX: Record<WaveColor, string> = {
  cyan:    '#22d3ee',
  violet:  '#a78bfa',
  amber:   '#fbbf24',
  emerald: '#34d399',
  rose:    '#fb7185',
};

const GLOW_RGBA: Record<WaveColor, string> = {
  cyan:    'rgba(34,211,238,0.7)',
  violet:  'rgba(167,139,250,0.7)',
  amber:   'rgba(251,191,36,0.7)',
  emerald: 'rgba(52,211,153,0.7)',
  rose:    'rgba(251,113,133,0.7)',
};

/**
 * Pre-baked shape envelope: bell-curve centre with harmonic ripple.
 * Used both for the CSS-animation fallback and to sculpt the live FFT bins.
 */
function buildEnvelope(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const x = i / n;
    return (0.15 + Math.sin(x * Math.PI) * 0.85) * (0.85 + Math.sin(x * Math.PI * 3) * 0.15);
  });
}

const ENVELOPE = buildEnvelope(BAR_COUNT);

/** Map FFT bins (0-255 each) to BAR_COUNT normalised heights (0-1). */
function fftToBars(fft: Uint8Array, count: number): number[] {
  if (fft.length === 0) return new Array(count).fill(0);

  // We use only the lower half of the spectrum (most speech energy is there)
  const usable = Math.min(fft.length, Math.floor(fft.length * 0.55));
  const binPerBar = usable / count;

  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * binPerBar);
    const end   = Math.floor((i + 1) * binPerBar);
    let sum = 0;
    for (let b = start; b < end; b++) sum += fft[b];
    const raw = sum / ((end - start) * 255);
    // Sculpt with the envelope so edges stay shorter — matches the music-EQ look
    return raw * ENVELOPE[i];
  });
}

// ── Static animation bar descriptors (used for the CSS-animation fallback) ──
const ANIM_BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const x = i / BAR_COUNT;
  const base = 3 + Math.sin(x * Math.PI) * 6;
  const peak = 10 + Math.sin(x * Math.PI) * 44 + Math.sin(x * Math.PI * 3) * 10;
  const dur  = 0.38 + Math.abs(Math.sin(i * 0.6)) * 0.35;
  const del  = x * 0.55;
  return { base, peak, dur, del };
});

// ── Props ─────────────────────────────────────────────────────────────────
export interface WaveVisualizerProps {
  active:     boolean;
  color?:     WaveColor;
  barCount?:  number;
  /** 0–1: used for the CSS-animation fallback (thinking / browser-TTS states) */
  intensity?: number;
  /** When true, the component opens a mic stream and visualises it in real-time */
  useMic?:    boolean;
}

const H       = 64;
const BAR_W   = 3;
const BAR_GAP = 3;

export function WaveVisualizer({
  active,
  color     = 'cyan',
  barCount  = BAR_COUNT,
  intensity = 1.0,
  useMic    = false,
}: WaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  // Refs so the draw loop always sees the latest props without re-subscribing
  const activeRef    = useRef(active);
  const colorRef     = useRef(color);
  const intensityRef = useRef(intensity);
  activeRef.current    = active;
  colorRef.current     = color;
  intensityRef.current = intensity;

  const totalW = barCount * (BAR_W + BAR_GAP) - BAR_GAP;

  // ── Canvas draw loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    canvas.width  = totalW * dpr;
    canvas.height = H     * dpr;
    canvas.style.width  = `${totalW}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // Smoothed bar heights: we lerp toward the target each frame
    const smooth = new Float32Array(barCount).fill(2);

    let stopMic: (() => void) | null = null;

    const draw = () => {
      const isActive = activeRef.current;
      const col      = colorRef.current;
      const inten    = intensityRef.current;
      const hex      = COLOR_HEX[col];
      const glow     = GLOW_RGBA[col];

      ctx.clearRect(0, 0, totalW, H);

      /**
       * Rainbow colour per bar: hue sweeps from 200° (cyan-blue) through
       * green and yellow to 0° (red) across the width of the visualiser.
       * Lightness drops toward the base to dim tiny bars.
       */
      const barHue = (i: number) => 200 - (i / barCount) * 200;  // 200→0

      if (!isActive) {
        // Idle: tiny flat rainbow stubs
        for (let i = 0; i < barCount; i++) {
          smooth[i] += (2 - smooth[i]) * 0.18;
          const x = i * (BAR_W + BAR_GAP);
          ctx.fillStyle   = `hsl(${barHue(i)},80%,55%)`;
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.roundRect(x, H - smooth[i], BAR_W, smooth[i], 1);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Try to get real FFT data from the shared analyser
      const fft     = getActiveFrequency();
      const hasReal = fft.length > 0 && fft.some(v => v > 0);

      let targets: number[];

      if (hasReal) {
        const normalised = fftToBars(fft, barCount);
        const maxH = H * 0.94;
        const minH = 2;
        targets = normalised.map((n) => minH + n * (maxH - minH));
      } else {
        // Fallback: time-based sine animation (browser TTS / thinking)
        const t     = performance.now() / 1000;
        const clamp = Math.max(0.05, Math.min(1, inten));
        targets = ANIM_BARS.map((b) => {
          const phase  = (t / b.dur + b.del) % 1;
          const factor = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
          return b.base + (b.peak * clamp - b.base) * factor;
        });
      }

      // Lerp smooth → target
      const lerpRate = hasReal ? 0.38 : 0.14;
      for (let i = 0; i < barCount; i++) {
        smooth[i] += (targets[i] - smooth[i]) * lerpRate;
      }

      // Draw rainbow bars
      for (let i = 0; i < barCount; i++) {
        const h   = Math.max(2, smooth[i]);
        const x   = i * (BAR_W + BAR_GAP);
        const y   = H - h;
        const hue = barHue(i);

        // Per-bar shadow glow in the bar's own colour
        ctx.shadowBlur  = hasReal ? 10 : 6;
        ctx.shadowColor = `hsla(${hue},90%,60%,0.75)`;

        // Vertical gradient: bright saturated top → dimmer bottom
        const grad = ctx.createLinearGradient(x, y, x, H);
        grad.addColorStop(0,   `hsl(${hue},92%,68%)`);
        grad.addColorStop(0.5, `hsl(${hue},85%,58%)`);
        grad.addColorStop(1,   `hsl(${hue},70%,38%)`);

        ctx.fillStyle   = grad;
        ctx.globalAlpha = hasReal ? 0.95 : (0.50 + 0.45 * intensityRef.current);
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_W, h, [1, 1, 0, 0]);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;

      rafRef.current = requestAnimationFrame(draw);
    };

    // Mic visualisation: open stream just for this component
    if (useMic) {
      connectMic().then((cleanup) => {
        stopMic = cleanup;
      });
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      stopMic?.();
    };
  // Only re-run when layout-affecting props change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barCount, totalW, useMic]);

  return (
    <div
      aria-hidden
      className="flex items-end justify-center"
      style={{ width: totalW, height: H }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

// ── CSS-animation-only fallback (used when canvas is not needed) ─────────
// Kept for any callers that still import { WaveVisualizerLegacy }
export function WaveVisualizerLegacy({
  active,
  color     = 'cyan',
  barCount  = BAR_COUNT,
  intensity = 1.0,
}: WaveVisualizerProps) {
  const clampedI = Math.max(0.05, Math.min(1.0, intensity));
  const barColorClass: Record<WaveColor, string> = {
    cyan: 'bg-cyan-400', violet: 'bg-violet-400', amber: 'bg-amber-400',
    emerald: 'bg-emerald-400', rose: 'bg-rose-400',
  };
  const glowStyle: Record<WaveColor, string> = {
    cyan:    'rgba(34,211,238,0.6)',  violet: 'rgba(167,139,250,0.6)',
    amber:   'rgba(251,191,36,0.6)', emerald: 'rgba(52,211,153,0.6)',
    rose:    'rgba(251,113,133,0.6)',
  };

  return (
    <div className="flex items-end justify-center gap-[3px] w-full" style={{ height: 64 }} aria-hidden>
      {ANIM_BARS.slice(0, barCount).map((b, i) => {
        const scaledPeak = Math.max(b.base + 2, b.peak * clampedI);
        return (
          <motion.div
            key={i}
            className={`rounded-full ${barColorClass[color]}`}
            style={{ width: 3, boxShadow: active ? `0 0 ${4 + clampedI * 4}px ${glowStyle[color]}` : 'none' }}
            animate={active
              ? { height: [`${b.base}px`, `${scaledPeak}px`, `${b.base}px`], opacity: [0.45, Math.min(1, 0.5 + 0.5 * clampedI), 0.45] }
              : { height: '2px', opacity: 0.18 }}
            transition={active
              ? { duration: b.dur / Math.max(0.4, clampedI), repeat: Infinity, ease: 'easeInOut', delay: b.del / Math.max(0.5, clampedI) }
              : { duration: 0.5, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}
