import { motion } from 'framer-motion';
import type { RuntimePhase } from '../types/runtime';

type PhasePalette = {
  core: [string, string, string];   // [inner, mid, outer] colours for sphere gradient
  glow: string;
  ring1: string;
  ring2: string;
  ring3: string;
  rgb: string;
  spin: boolean;
  pulse: boolean;
};

const PALETTE: Record<RuntimePhase, PhasePalette> = {
  standby: {
    core: ['rgba(100,116,139,0.5)', 'rgba(51,65,85,0.6)', 'rgba(15,23,42,0.9)'],
    glow: 'rgba(100,116,139,0.18)',
    ring1: 'rgba(100,116,139,0.25)',
    ring2: 'rgba(71,85,105,0.18)',
    ring3: 'rgba(51,65,85,0.15)',
    rgb: '100,116,139',
    spin: false,
    pulse: false,
  },
  sleep: {
    core: ['rgba(51,65,85,0.35)', 'rgba(30,41,59,0.5)', 'rgba(15,23,42,0.95)'],
    glow: 'rgba(51,65,85,0.10)',
    ring1: 'rgba(51,65,85,0.18)',
    ring2: 'rgba(30,41,59,0.12)',
    ring3: 'rgba(15,23,42,0.10)',
    rgb: '51,65,85',
    spin: false,
    pulse: false,
  },
  wake_detected: {
    core: ['rgba(103,232,249,0.85)', 'rgba(34,211,238,0.55)', 'rgba(8,47,73,0.9)'],
    glow: 'rgba(34,211,238,0.45)',
    ring1: 'rgba(34,211,238,0.65)',
    ring2: 'rgba(167,139,250,0.45)',
    ring3: 'rgba(34,211,238,0.30)',
    rgb: '34,211,238',
    spin: true,
    pulse: true,
  },
  booting: {
    core: ['rgba(103,232,249,0.8)', 'rgba(34,211,238,0.5)', 'rgba(8,47,73,0.9)'],
    glow: 'rgba(34,211,238,0.40)',
    ring1: 'rgba(34,211,238,0.55)',
    ring2: 'rgba(167,139,250,0.40)',
    ring3: 'rgba(56,189,248,0.30)',
    rgb: '34,211,238',
    spin: true,
    pulse: true,
  },
  ready: {
    core: ['rgba(110,231,183,0.85)', 'rgba(52,211,153,0.55)', 'rgba(6,47,32,0.9)'],
    glow: 'rgba(52,211,153,0.38)',
    ring1: 'rgba(52,211,153,0.55)',
    ring2: 'rgba(34,211,238,0.35)',
    ring3: 'rgba(52,211,153,0.25)',
    rgb: '52,211,153',
    spin: true,
    pulse: true,
  },
  listening: {
    core: ['rgba(196,181,253,0.85)', 'rgba(167,139,250,0.58)', 'rgba(46,16,101,0.9)'],
    glow: 'rgba(167,139,250,0.45)',
    ring1: 'rgba(167,139,250,0.65)',
    ring2: 'rgba(232,121,249,0.45)',
    ring3: 'rgba(167,139,250,0.35)',
    rgb: '167,139,250',
    spin: true,
    pulse: true,
  },
  thinking: {
    core: ['rgba(253,230,138,0.85)', 'rgba(251,191,36,0.58)', 'rgba(69,26,3,0.9)'],
    glow: 'rgba(251,191,36,0.40)',
    ring1: 'rgba(251,191,36,0.60)',
    ring2: 'rgba(249,115,22,0.40)',
    ring3: 'rgba(251,191,36,0.30)',
    rgb: '251,191,36',
    spin: true,
    pulse: true,
  },
  responding: {
    core: ['rgba(103,232,249,0.90)', 'rgba(34,211,238,0.62)', 'rgba(8,47,73,0.88)'],
    glow: 'rgba(34,211,238,0.50)',
    ring1: 'rgba(34,211,238,0.70)',
    ring2: 'rgba(52,211,153,0.50)',
    ring3: 'rgba(103,232,249,0.38)',
    rgb: '34,211,238',
    spin: true,
    pulse: true,
  },
  error: {
    core: ['rgba(252,165,165,0.85)', 'rgba(239,68,68,0.58)', 'rgba(69,10,10,0.9)'],
    glow: 'rgba(239,68,68,0.40)',
    ring1: 'rgba(239,68,68,0.60)',
    ring2: 'rgba(249,115,22,0.40)',
    ring3: 'rgba(239,68,68,0.30)',
    rgb: '239,68,68',
    spin: true,
    pulse: true,
  },
};

/** Small dot that orbits at a given radius */
function OrbitDot({
  radius,
  duration,
  delay,
  size,
  color,
  active,
}: {
  radius: number;
  duration: number;
  delay: number;
  size: number;
  color: string;
  active: boolean;
}) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ width: 0, height: 0 }}
      animate={active ? { rotate: [0, 360] } : { rotate: 0 }}
      transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
    >
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          background: color,
          boxShadow: `0 0 ${size * 3}px ${color}`,
          top: -radius - size / 2,
          left: -size / 2,
        }}
        animate={active ? { opacity: [0.5, 1, 0.5], scale: [0.8, 1.2, 0.8] } : { opacity: 0.2 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: delay * 0.5 }}
      />
    </motion.div>
  );
}

/** One tilted orbital ring */
function OrbitalRing({
  size,
  tiltX,
  tiltY,
  color,
  duration,
  active,
  dashed,
}: {
  size: number;
  tiltX: number;
  tiltY: number;
  color: string;
  duration: number;
  active: boolean;
  dashed?: boolean;
}) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        border: `1.5px ${dashed ? 'dashed' : 'solid'} ${color}`,
        rotateX: tiltX,
        rotateY: tiltY,
      }}
      animate={active ? { rotateZ: [0, 360] } : { rotateZ: 0 }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
    />
  );
}

export function RobotAvatar({ phase }: { phase: RuntimePhase }) {
  const p = PALETTE[phase] ?? PALETTE.standby;
  const glowRgb = p.rgb;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 280, height: 280, perspective: 600 }}
    >
      {/* Ambient background bloom */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ opacity: p.pulse ? [0.25, 0.7, 0.25] : 0.15, scale: p.pulse ? [0.9, 1.1, 0.9] : 1 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: `radial-gradient(circle, rgba(${glowRgb},0.35) 0%, transparent 70%)` }}
      />

      {/* Orbital rings at different tilts */}
      <OrbitalRing size={248} tiltX={72} tiltY={0}  color={p.ring1} duration={13} active={p.spin} />
      <OrbitalRing size={210} tiltX={20} tiltY={65}  color={p.ring2} duration={18} active={p.spin} />
      <OrbitalRing size={172} tiltX={55} tiltY={-40} color={p.ring3} duration={10} active={p.spin} dashed />

      {/* Orbiting energy dots */}
      {p.spin && (
        <>
          <OrbitDot radius={110} duration={7}  delay={0}   size={5} color={`rgba(${glowRgb},0.9)`} active={p.pulse} />
          <OrbitDot radius={90}  duration={11} delay={1.2} size={4} color={`rgba(${glowRgb},0.7)`} active={p.pulse} />
          <OrbitDot radius={125} duration={15} delay={2.5} size={3} color={`rgba(${glowRgb},0.6)`} active={p.pulse} />
          <OrbitDot radius={78}  duration={9}  delay={0.8} size={4} color={`rgba(${glowRgb},0.8)`} active={p.pulse} />
        </>
      )}

      {/* ── Central sphere ── */}
      <motion.div
        className="relative z-10"
        animate={
          phase === 'responding'
            ? { scale: [1, 1.06, 1] }
            : phase === 'listening'
              ? { scale: [1, 1.03, 0.98, 1] }
              : phase === 'thinking'
                ? { scale: [1, 1.02, 1] }
                : { scale: 1 }
        }
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Sphere body */}
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: '50%',
            background: `radial-gradient(circle at 36% 32%,
              ${p.core[0]} 0%,
              ${p.core[1]} 42%,
              ${p.core[2]} 100%
            )`,
            boxShadow: `0 0 50px rgba(${glowRgb},0.45), 0 0 18px rgba(${glowRgb},0.25), inset -10px -14px 28px rgba(0,0,0,0.55)`,
            position: 'relative',
          }}
        >
          {/* Specular highlight — simulates sphere curvature */}
          <div
            style={{
              position: 'absolute',
              top: '16%',
              left: '24%',
              width: '40%',
              height: '30%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.08) 65%, transparent 100%)',
              filter: 'blur(3px)',
            }}
          />
          {/* Inner glow core */}
          <motion.div
            style={{
              position: 'absolute',
              inset: '32%',
              borderRadius: '50%',
              background: `rgba(${glowRgb},0.6)`,
              filter: 'blur(10px)',
            }}
            animate={{ opacity: p.pulse ? [0.5, 1, 0.5] : 0.3, scale: p.pulse ? [0.8, 1.15, 0.8] : 1 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Centre pupil */}
          <motion.div
            style={{
              position: 'absolute',
              inset: '44%',
              borderRadius: '50%',
              background: `rgba(${glowRgb},0.95)`,
              boxShadow: `0 0 12px rgba(${glowRgb},1)`,
            }}
            animate={{ opacity: p.pulse ? [0.7, 1, 0.7] : 0.4 }}
            transition={{ duration: 0.9, repeat: Infinity }}
          />
        </div>
      </motion.div>

      {/* HUD corner brackets */}
      {[
        { top: 12, left: 12 },
        { top: 12, right: 12, rotate: 90 },
        { bottom: 12, right: 12, rotate: 180 },
        { bottom: 12, left: 12, rotate: 270 },
      ].map((pos, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            ...pos,
            width: 18,
            height: 18,
            borderTop: `2px solid rgba(${glowRgb},0.6)`,
            borderLeft: `2px solid rgba(${glowRgb},0.6)`,
            transform: `rotate(${pos.rotate ?? 0}deg)`,
          }}
          animate={{ opacity: p.pulse ? [0.3, 1, 0.3] : 0.18 }}
          transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}

      {/* Phase indicator pip at bottom */}
      <motion.div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full"
        style={{ width: 8, height: 8, background: `rgb(${glowRgb})`, boxShadow: `0 0 10px rgba(${glowRgb},0.9)` }}
        animate={{ opacity: p.pulse ? [0.4, 1, 0.4] : 0.25 }}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
    </div>
  );
}
