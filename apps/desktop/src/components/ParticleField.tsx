import { motion } from 'framer-motion';
import { useMemo } from 'react';

const COLORS = [
  '34,211,238',   // cyan
  '167,139,250',  // violet
  '52,211,153',   // emerald
  '251,191,36',   // amber
  '248,113,113',  // rose
  '56,189,248',   // sky
];

interface Particle {
  x: number;
  y: number;
  size: number;
  colorRgb: string;
  duration: number;
  delay: number;
  dx: number;
  dy: number;
}

export function ParticleField({ count = 45, active = true }: { count?: number; active?: boolean }) {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1.2 + Math.random() * 2.2,
        colorRgb: COLORS[i % COLORS.length],
        duration: 9 + Math.random() * 13,
        delay: Math.random() * 9,
        dx: (Math.random() - 0.5) * 90,
        dy: (Math.random() - 0.5) * 70,
      })),
    [count]
  );

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `rgba(${p.colorRgb},0.75)`,
            boxShadow: `0 0 ${p.size * 4}px rgba(${p.colorRgb},0.55)`,
          }}
          animate={
            active
              ? {
                  x: [0, p.dx, -p.dx * 0.4, p.dx * 0.6, 0],
                  y: [0, p.dy * 0.5, p.dy, -p.dy * 0.3, 0],
                  opacity: [0, 0.85, 0.4, 0.9, 0],
                  scale: [0, 1, 0.7, 1.15, 0],
                }
              : { opacity: 0.08, scale: 0.5 }
          }
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
