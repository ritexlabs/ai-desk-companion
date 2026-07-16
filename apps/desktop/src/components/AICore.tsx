import { motion } from 'framer-motion';
import type { RuntimePhase } from '../types/runtime';

type PhasePalette = {
  core: [string, string, string];
  rgb: string;
  pulse: boolean;
};

const PALETTE: Record<RuntimePhase, PhasePalette> = {
  standby:       { core: ['rgba(100,116,139,0.5)', 'rgba(51,65,85,0.6)',    'rgba(15,23,42,0.9)'],   rgb: '100,116,139', pulse: false },
  sleep:         { core: ['rgba(51,65,85,0.35)',   'rgba(30,41,59,0.5)',    'rgba(15,23,42,0.95)'],  rgb: '51,65,85',    pulse: false },
  wake_detected: { core: ['rgba(103,232,249,0.85)','rgba(34,211,238,0.55)', 'rgba(8,47,73,0.9)'],   rgb: '34,211,238',  pulse: true  },
  booting:       { core: ['rgba(103,232,249,0.8)', 'rgba(34,211,238,0.5)',  'rgba(8,47,73,0.9)'],   rgb: '34,211,238',  pulse: true  },
  ready:         { core: ['rgba(110,231,183,0.85)','rgba(52,211,153,0.55)', 'rgba(6,47,32,0.9)'],   rgb: '52,211,153',  pulse: true  },
  listening:     { core: ['rgba(196,181,253,0.85)','rgba(167,139,250,0.58)','rgba(46,16,101,0.9)'],  rgb: '167,139,250', pulse: true  },
  thinking:      { core: ['rgba(253,230,138,0.85)','rgba(251,191,36,0.58)', 'rgba(69,26,3,0.9)'],   rgb: '251,191,36',  pulse: true  },
  responding:    { core: ['rgba(103,232,249,0.90)','rgba(34,211,238,0.62)', 'rgba(8,47,73,0.88)'],  rgb: '34,211,238',  pulse: true  },
  error:         { core: ['rgba(252,165,165,0.85)','rgba(239,68,68,0.58)',  'rgba(69,10,10,0.9)'],  rgb: '239,68,68',   pulse: true  },
};

/* Pre-calculate 8 neural arc SVG path strings radiating from sphere edge to outer ring */
const CX = 140, CY = 140;
const NEURAL_ARCS = Array.from({ length: 8 }, (_, i) => {
  const a   = (i * 45 * Math.PI) / 180;
  const ap  = a + Math.PI / 2;
  const sx  = CX + 55 * Math.cos(a);
  const sy  = CY + 55 * Math.sin(a);
  const ex  = CX + 118 * Math.cos(a);
  const ey  = CY + 118 * Math.sin(a);
  const cpx = CX + 86 * Math.cos(a) + 18 * Math.cos(ap);
  const cpy = CY + 86 * Math.sin(a) + 18 * Math.sin(ap);
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
});

export function AICore({ phase }: { phase: RuntimePhase }) {
  const p = PALETTE[phase] ?? PALETTE.standby;
  const { rgb, pulse, core } = p;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>

      {/* Ambient bloom — radial glow that breathes */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          opacity: pulse ? [0.2, 0.65, 0.2] : 0.1,
          scale:   pulse ? [0.82, 1.15, 0.82] : 1,
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: `radial-gradient(circle, rgba(${rgb},0.45) 0%, transparent 70%)` }}
      />

      {/* Radar pulse rings — expand outward from sphere */}
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{
            width: 72, height: 72,
            top: '50%', left: '50%',
            marginTop: -36, marginLeft: -36,
            borderColor: `rgba(${rgb},0.6)`,
          }}
          animate={pulse ? { scale: [1, 3.8], opacity: [0.5, 0] } : { opacity: 0 }}
          transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.85, ease: 'easeOut' }}
        />
      ))}

      {/* Neural network SVG overlay */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={280}
        height={280}
      >
        <defs>
          {/* Glow filter for data packets */}
          <filter id="ai-pkt-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer dashed boundary ring */}
        <circle
          cx={CX} cy={CY} r={128}
          fill="none"
          stroke={`rgba(${rgb},0.1)`}
          strokeWidth="1"
          strokeDasharray="5 5"
        />

        {/* Inner solid boundary ring */}
        <circle
          cx={CX} cy={CY} r={108}
          fill="none"
          stroke={`rgba(${rgb},0.06)`}
          strokeWidth="0.5"
        />

        {/* 8 neural arc paths with flowing data packets */}
        {NEURAL_ARCS.map((d, i) => (
          <g key={i}>
            <path
              id={`nac-${i}`}
              d={d}
              fill="none"
              stroke={`rgba(${rgb},0.22)`}
              strokeWidth="0.75"
            />
            {/* Data packet dot — only animates when active */}
            {pulse && (
              <circle r="2.2" fill={`rgba(${rgb},1)`} filter="url(#ai-pkt-glow)">
                <animateMotion
                  dur={`${1.5 + i * 0.2}s`}
                  repeatCount="indefinite"
                  begin={`${i * 0.22}s`}
                >
                  <mpath href={`#nac-${i}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        ))}
      </svg>

      {/* Slow-rotating outer ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 242, height: 242,
          top: '50%', left: '50%',
          marginTop: -121, marginLeft: -121,
          border: `1px dashed rgba(${rgb},0.12)`,
        }}
        animate={pulse ? { rotate: 360 } : {}}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      />

      {/* Counter-rotating inner ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 200, height: 200,
          top: '50%', left: '50%',
          marginTop: -100, marginLeft: -100,
          border: `1px solid rgba(${rgb},0.07)`,
        }}
        animate={pulse ? { rotate: -360 } : {}}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      />

      {/* Central sphere */}
      <motion.div
        className="relative z-10"
        animate={
          phase === 'responding' ? { scale: [1, 1.06, 1] }
          : phase === 'listening' ? { scale: [1, 1.03, 0.98, 1] }
          : phase === 'thinking'  ? { scale: [1, 1.02, 1] }
          : { scale: 1 }
        }
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          style={{
            width: 130, height: 130,
            borderRadius: '50%',
            background: `radial-gradient(circle at 36% 32%, ${core[0]} 0%, ${core[1]} 42%, ${core[2]} 100%)`,
            boxShadow: `0 0 50px rgba(${rgb},0.45), 0 0 18px rgba(${rgb},0.25), inset -10px -14px 28px rgba(0,0,0,0.55)`,
            position: 'relative',
          }}
        >
          {/* Specular highlight */}
          <div style={{
            position: 'absolute', top: '16%', left: '24%', width: '40%', height: '30%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.08) 65%, transparent 100%)',
            filter: 'blur(3px)',
          }} />

          {/* Inner glow core */}
          <motion.div
            style={{ position: 'absolute', inset: '32%', borderRadius: '50%', background: `rgba(${rgb},0.6)`, filter: 'blur(10px)' }}
            animate={{ opacity: pulse ? [0.5, 1, 0.5] : 0.3, scale: pulse ? [0.8, 1.15, 0.8] : 1 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Centre pupil */}
          <motion.div
            style={{ position: 'absolute', inset: '44%', borderRadius: '50%', background: `rgba(${rgb},0.95)`, boxShadow: `0 0 12px rgba(${rgb},1)` }}
            animate={{ opacity: pulse ? [0.7, 1, 0.7] : 0.4 }}
            transition={{ duration: 0.9, repeat: Infinity }}
          />
        </div>
      </motion.div>

      {/* HUD corner brackets */}
      {[
        { top: 8,    left: 8,   rotate: 0   },
        { top: 8,    right: 8,  rotate: 90  },
        { bottom: 8, right: 8,  rotate: 180 },
        { bottom: 8, left: 8,   rotate: 270 },
      ].map((pos, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            top: pos.top, right: pos.right, bottom: pos.bottom, left: pos.left,
            width: 22, height: 22,
            borderTop: `2px solid rgba(${rgb},0.55)`,
            borderLeft: `2px solid rgba(${rgb},0.55)`,
            transform: `rotate(${pos.rotate}deg)`,
          }}
          animate={{ opacity: pulse ? [0.2, 1, 0.2] : 0.12 }}
          transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.35 }}
        />
      ))}

      {/* Phase indicator pip */}
      <motion.div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full"
        style={{ width: 8, height: 8, background: `rgb(${rgb})`, boxShadow: `0 0 10px rgba(${rgb},0.9)` }}
        animate={{ opacity: pulse ? [0.4, 1, 0.4] : 0.18 }}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
    </div>
  );
}
