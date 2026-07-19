import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud, Calendar, Mail, GitBranch, Monitor, TrendingUp, Newspaper, Home,
  MessageCircle, Globe, Globe2, PieChart, Calculator, Brain, Layers, Bell,
  type LucideIcon,
} from 'lucide-react';
import type { AgentDefinition, RuntimePhase } from '../types/runtime';

/* ── Icon registry — one entry per individual agent ─────────────────────── */
const ICON: Record<string, LucideIcon> = {
  system:     Monitor,
  weather:    Cloud,
  google:     Globe2,
  calendar:   Calendar,
  email:      Mail,
  github:     GitBranch,
  stock:      TrendingUp,
  news:       Newspaper,
  smarthome:  Home,
  whatsapp:   MessageCircle,
  portfolio:  PieChart,
  websearch:  Globe,
  calculator: Calculator,
  memory:     Brain,
  briefing:   Layers,
  notes:      Bell,
  general:    Monitor,
};

/* ── Per-agent RGB ──────────────────────────────────────────────────────── */
const AGENT_RGB: Record<string, readonly [number, number, number]> = {
  system:     [45,212,191],
  weather:    [34,211,238],
  google:     [96,165,250],
  calendar:   [167,139,250],
  email:      [52,211,153],
  github:     [251,191,36],
  stock:      [74,222,128],
  news:       [56,189,248],
  smarthome:  [251,146,60],
  whatsapp:   [74,222,128],
  portfolio:  [251,113,133],
  websearch:  [96,165,250],
  calculator: [251,191,36],
  memory:     [192,132,252],
  briefing:   [34,211,238],
  notes:      [167,139,250],
  general:    [148,163,184],
};

/* ── Phase RGB ──────────────────────────────────────────────────────────── */
const PHASE_RGB: Record<RuntimePhase, readonly [number, number, number]> = {
  standby:       [100,116,139],
  sleep:         [51,65,85],
  wake_detected: [34,211,238],
  booting:       [34,211,238],
  ready:         [52,211,153],
  listening:     [167,139,250],
  thinking:      [251,191,36],
  responding:    [34,211,238],
  error:         [239,68,68],
};

/* ── Status metadata ────────────────────────────────────────────────────── */
type AgentStatus = AgentDefinition['status'];

const STATUS_RGB: Record<AgentStatus, readonly [number, number, number]> = {
  online:   [52,211,153],
  offline:  [71,85,105],
  starting: [34,211,238],
  degraded: [251,191,36],
  failed:   [239,68,68],
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  online:   'ONLINE',
  offline:  'OFFLINE',
  starting: 'BOOTING',
  degraded: 'DEGRADED',
  failed:   'FAILED',
};

/* When this agent is the active one, override status label with phase context */
const ACTIVE_PHASE: Partial<Record<RuntimePhase, { label: string; rgb: readonly [number,number,number] }>> = {
  thinking:   { label: 'THINKING',   rgb: [251,191,36]  },
  responding: { label: 'RESPONDING', rgb: [34,211,238]  },
  listening:  { label: 'LISTENING',  rgb: [167,139,250] },
  booting:    { label: 'CONNECTING', rgb: [34,211,238]  },
};

/* ── 3-D math ───────────────────────────────────────────────────────────── */
type V3 = [number, number, number];

/**
 * Fibonacci ellipsoid — same even distribution as a sphere but stretched
 * to an ellipsoid shape so agents fill the landscape canvas rather than
 * clustering near the centre.
 *  rx: horizontal radius (wide)
 *  ry: vertical radius (shorter — fits canvas height)
 *  rz: depth radius
 */
function fibEllipsoid(n: number, rx: number, ry: number, rz: number): V3[] {
  if (n === 0) return [];
  const φ = (1 + Math.sqrt(5)) / 2;
  return Array.from({ length: n }, (_, i) => {
    const θ = Math.acos(1 - (2*(i+0.5))/n);
    const ψ = 2 * Math.PI * i / φ;
    return [
      rx * Math.sin(θ) * Math.cos(ψ),
      ry * Math.sin(θ) * Math.sin(ψ),
      rz * Math.cos(θ),
    ] as V3;
  });
}

function rotY(p: V3, a: number): V3 {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [c*p[0]+s*p[2], p[1], -s*p[0]+c*p[2]];
}

function rotX(p: V3, a: number): V3 {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [p[0], c*p[1]-s*p[2], s*p[1]+c*p[2]];
}

function project(p: V3, cx: number, cy: number, fov: number): [number, number, number] {
  const z = p[2] + fov;
  if (z <= 1) return [cx, cy, 0.01];
  const s = fov / z;
  return [cx + p[0]*s, cy + p[1]*s, s];
}

/* ── Layout constants ───────────────────────────────────────────────────── */
const W   = 700;
const H   = 420;    // matches the App.tsx container height exactly — no bottom clip
const CX  = W / 2; // 350
const CY  = H / 2; // 210

// Large FOV → near-orthographic projection: back-hemisphere agents stay
// visible and spread instead of collapsing to the centre.
const FOV = 1100;

// Ellipsoid sized so ALL surface points project within the canvas with margin:
//   X range: CX ± RX = 350 ± 285  → [65, 635]  (W=700, margin 65px each side)
//   Y range: CY ± RY = 210 ± 148  → [62, 358]  (H=420, margin 62px top/bottom)
const RX  = 285;
const RY  = 148;
const RZ  = 70;     // depth — shallow keeps scale variance < 15 %

const NODE_SIZE   = 26;  // px at depth-scale 1.0  (smaller circle, text unchanged)
const SAFE_MARGIN = 44;  // minimum gap between node centre and canvas edge

/* ── Orchestrator gyroscope constants (separate inner FOV) ───────────────── */
const ORC_FOV  = 265;   // inner perspective for the gyroscope rings
const ORC_RING = 118;   // orbital ring radius
const ORC_OCT  = 72;    // wireframe octahedron half-edge

function orcRotY(p: V3, a: number): V3 {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [c*p[0]+s*p[2], p[1], -s*p[0]+c*p[2]];
}
function orcRotX(p: V3, a: number): V3 {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [p[0], c*p[1]-s*p[2], s*p[1]+c*p[2]];
}
function orcProj(p: V3): [number, number, number] {
  const z = p[2] + ORC_FOV;
  const s = z > 0.01 ? ORC_FOV / z : 0.001;
  return [CX + p[0]*s, CY + p[1]*s, s];
}

/* ── Agent floating physics ─────────────────────────────────────────────── */
// Agents must keep their SCREEN projection outside this radius from (CX,CY).
// With FOV=1100 and RZ=70 the near-orthographic projection means
// screen_xy ≈ 3d_xy × 1.0 ± 7%, so the XY-plane 3D distance ≈ screen distance.
// The gyroscope rings reach ~118 screen-px; add 50px node-radius + 10px margin.
const MIN_SCREEN_DIST = 162;   // px: exclusion radius from AI core in screen/XY space
const MIN_AGENT_DIST  = 125;   // minimum XY-plane (≈ screen) separation between agents
const FLOAT_SPRING    = 0.004; // spring pull toward wandering target (gentler = smoother)
const FLOAT_DAMP      = 0.975; // per-frame velocity damping (higher = less oscillation)
const CORE_REPEL      = 0.060; // XY-plane push from centre
const AGENT_REPEL     = 0.042; // push between agents when they crowd each other
const BOUND_REPEL     = 0.10;  // canvas edge pushback — strong enough to never need hard clamp
const MAX_SPEED       = 0.55;  // lower cap → less overshoot, smoother arcs
const MIN_SPEED       = 0.16;  // floor so agents always visibly drift
const TARGET_FRAMES   = 240;   // avg frames between target changes (~4 s at 60 fps)

interface FloatState { pos: V3; vel: V3; target: V3; timer: number; }

function randOnEllipsoid(): V3 {
  const θ = Math.acos(2 * Math.random() - 1);
  const φ = 2 * Math.PI * Math.random();
  return [
    RX * Math.sin(θ) * Math.cos(φ),
    RY * Math.sin(θ) * Math.sin(φ),
    RZ * Math.cos(θ),
  ];
}

/** Returns a random ellipsoid position that is:
 *  - outside the AI core exclusion zone (XY distance ≥ MIN_SCREEN_DIST)
 *  - inside the safe canvas viewport (screen position within SAFE_MARGIN of all edges)
 */
function randOnEllipsoidExcluding(): V3 {
  for (let attempt = 0; attempt < 60; attempt++) {
    const p  = randOnEllipsoid();
    const dxy = Math.sqrt(p[0]*p[0] + p[1]*p[1]);
    if (dxy < MIN_SCREEN_DIST) continue;
    const s  = FOV / (p[2] + FOV);
    const sx = CX + p[0] * s;
    const sy = CY + p[1] * s;
    if (sx < SAFE_MARGIN || sx > W - SAFE_MARGIN) continue;
    if (sy < SAFE_MARGIN || sy > H - SAFE_MARGIN) continue;
    return p;
  }
  // Guaranteed safe fallback: right-centre of ellipsoid
  return [RX * 0.85, 0, 0] as V3;
}

/* ── AgentNode — DOM element positioned imperatively by RAF ─────────────── */
interface NodeProps {
  agent:         AgentDefinition;
  isActive:      boolean;
  isNewlyOnline: boolean;
  phase:         RuntimePhase;
  nodeRef:       React.RefCallback<HTMLDivElement>;
}

const AgentNode = memo(function AgentNode({ agent, isActive, isNewlyOnline, phase, nodeRef }: NodeProps) {
  const [r, g, b] = AGENT_RGB[agent.id] ?? [148,163,184];
  const rgb        = `${r},${g},${b}`;
  const online     = agent.status === 'online';
  const IconFC     = ICON[agent.id] ?? Monitor;

  // Status display: active agent shows phase context
  const phaseCtx    = isActive ? ACTIVE_PHASE[phase] : null;
  const [sr,sg,sb]  = phaseCtx ? phaseCtx.rgb : STATUS_RGB[agent.status];
  const statusRgb   = `${sr},${sg},${sb}`;
  const statusLabel = phaseCtx ? phaseCtx.label : STATUS_LABEL[agent.status];

  // Phase-reactive glow color when this agent is the active one
  const [pr_, pg_, pb_] = isActive ? (PHASE_RGB[phase] ?? [r,g,b]) : [r,g,b];
  const phaseRgb = `${pr_},${pg_},${pb_}`;
  const ringDur  = phase === 'responding' ? 0.60 : phase === 'thinking' ? 0.95 : 1.15;

  return (
    <div
      ref={nodeRef}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        willChange: 'transform, opacity',
        transform: 'translate(-9999px,-9999px)',  // RAF sets real position
        pointerEvents: 'none',
      }}
    >
      {/* The inner div centres the node on the projected point */}
      <div style={{ transform: 'translate(-50%,-50%)' }}>

        {/* ── Boot flash — one-shot burst when agent first comes online ── */}
        <AnimatePresence>
          {isNewlyOnline && (
            <motion.div
              key="flash"
              initial={{ scale: 0.8, opacity: 1 }}
              animate={{ scale: 3.2, opacity: 0 }}
              exit={{}}
              transition={{ duration: 1.0, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(${rgb},0.7) 0%, rgba(${rgb},0) 70%)`,
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>
        {/* Second outer ring burst */}
        <AnimatePresence>
          {isNewlyOnline && (
            <motion.div
              key="flash-ring"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 4, opacity: 0 }}
              exit={{}}
              transition={{ duration: 1.4, ease: 'easeOut', delay: 0.1 }}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `2px solid rgba(${rgb},0.9)`,
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>

        {/* ── Active agent: phase-coloured outer bloom ── */}
        {isActive && (
          <motion.div
            style={{
              position:'absolute',
              width: 64, height: 64,
              top:'50%', left:'50%',
              marginTop:-32, marginLeft:-32,
              borderRadius:'50%',
              background:`radial-gradient(circle, rgba(${phaseRgb},0.45) 0%, rgba(${phaseRgb},0) 68%)`,
              filter:'blur(8px)',
              pointerEvents:'none',
            }}
            animate={{ opacity:[0.45,1,0.45], scale:[0.82,1.18,0.82] }}
            transition={{ duration:ringDur, repeat:Infinity, ease:'easeInOut' }}
          />
        )}

        {/* ── Active agent: three phase-coloured pulse rings ── */}
        {isActive && (
          <>
            <motion.div
              style={{ position:'absolute', inset:-6, borderRadius:'50%', border:`1.5px solid rgba(${phaseRgb},0.90)` }}
              animate={{ scale:[1,1.45,1], opacity:[1,0.05,1] }}
              transition={{ duration:ringDur, repeat:Infinity, ease:'easeInOut' }}
            />
            <motion.div
              style={{ position:'absolute', inset:-12, borderRadius:'50%', border:`1px solid rgba(${phaseRgb},0.55)` }}
              animate={{ scale:[1,1.3,1], opacity:[0.6,0,0.6] }}
              transition={{ duration:ringDur * 1.25, repeat:Infinity, ease:'easeInOut', delay:ringDur * 0.28 }}
            />
            <motion.div
              style={{ position:'absolute', inset:-20, borderRadius:'50%', border:`1px solid rgba(${phaseRgb},0.28)` }}
              animate={{ scale:[1,1.18,1], opacity:[0.35,0,0.35] }}
              transition={{ duration:ringDur * 1.55, repeat:Infinity, ease:'easeInOut', delay:ringDur * 0.55 }}
            />
          </>
        )}

        {/* ── Node circle ── */}
        <div
          style={{
            width:  NODE_SIZE,
            height: NODE_SIZE,
            borderRadius: '50%',
            background: `radial-gradient(circle at 38% 32%,
              rgba(${isActive ? phaseRgb : rgb},${online ? (isActive ? 0.38 : 0.13) : 0.04}) 0%,
              rgba(10,16,30,${online ? 0.72 : 0.92}) 100%)`,
            border: `${isActive ? '2px' : '1px'} solid rgba(${isActive ? phaseRgb : rgb},${online ? (isActive ? 1 : 0.42) : 0.14})`,
            boxShadow: isActive
              ? [
                  `0 0 40px rgba(${phaseRgb},0.75)`,
                  `0 0 18px rgba(${phaseRgb},0.50)`,
                  `0 0 8px rgba(${phaseRgb},0.30)`,
                  `0 0 22px rgba(${rgb},0.28)`,
                  `inset 0 0 12px rgba(${phaseRgb},0.15)`,
                ].join(', ')
              : isNewlyOnline
                ? `0 0 16px rgba(${rgb},0.55)`
                : online
                  ? `0 0 8px rgba(${rgb},0.22)`
                  : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            transition: 'box-shadow 0.6s',
          }}
        >
          {/* Lucide icon */}
          <IconFC
            size={isActive ? 11 : 9}
            strokeWidth={isActive ? 2.0 : 1.5}
            color={`rgba(${isActive ? phaseRgb : rgb},${online ? (isActive ? 1 : 0.72) : 0.2})`}
          />

          {/* Status dot — bottom-right corner */}
          <motion.div
            style={{
              position: 'absolute',
              bottom: 0, right: 0,
              width: 6, height: 6,
              borderRadius: '50%',
              background: `rgb(${statusRgb})`,
              border: '1px solid rgba(8,12,24,0.85)',
              boxShadow: `0 0 4px rgba(${statusRgb},0.85)`,
              zIndex: 2,
            }}
            animate={online
              ? { scale:[1,1.45,1], opacity:[0.7,1,0.7] }
              : {}}
            transition={{ duration:1.9, repeat:Infinity, ease:'easeOut' }}
          />
        </div>

        {/* Status label */}
        <div style={{
          marginTop: 5,
          textAlign: 'center',
          fontFamily: "'SF Mono', monospace",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: '0.16em',
          color: `rgba(${isActive ? phaseRgb : statusRgb},${online ? (isActive ? 1 : 0.88) : 0.32})`,
          whiteSpace: 'nowrap',
        }}>
          {statusLabel}
        </div>

        {/* Agent name */}
        <div style={{
          marginTop: 2,
          textAlign: 'center',
          fontFamily: "'SF Mono', monospace",
          fontSize: 8.5,
          fontWeight: 600,
          color: `rgba(${rgb},${online ? 0.68 : 0.24})`,
          whiteSpace: 'nowrap',
        }}>
          {agent.label}
        </div>
      </div>
    </div>
  );
});

/* ── Main component ─────────────────────────────────────────────────────── */
export interface AgentOrbit3DProps {
  phase:          RuntimePhase;
  agents:         AgentDefinition[];
  activeAgentId:  string | null;
  voiceActive?:   boolean;
  voiceIntensity?: number;
}

export function AgentOrbit3D({ phase, agents, activeAgentId, voiceActive = false, voiceIntensity = 0 }: AgentOrbit3DProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const pktTRef    = useRef(0);
  const rafRef     = useRef(0);
  const floatRef   = useRef<Map<string, FloatState>>(new Map());
  const nodeRefs   = useRef<Map<string, HTMLDivElement>>(new Map());

  // Live refs so the RAF always sees current props without re-subscribing
  const phaseRef    = useRef(phase);
  const activeRef   = useRef(activeAgentId);
  const vActiveRef  = useRef(voiceActive);
  const vIntensRef  = useRef(voiceIntensity);
  const orbitAgsRef = useRef<AgentDefinition[]>([]);
  phaseRef.current   = phase;
  activeRef.current  = activeAgentId;
  vActiveRef.current = voiceActive;
  vIntensRef.current = voiceIntensity;

  // Individual agents (system excluded — it's the host process, not a tool)
  const orbitAgents = agents.filter(a => a.id !== 'system');
  orbitAgsRef.current = orbitAgents;

  // ── Track newly-online agents for boot-sequence flash ────────────────────
  const [newlyOnline, setNewlyOnline] = useState<Set<string>>(new Set());
  const prevStatusRef = useRef<Record<string, AgentStatus>>({});

  useEffect(() => {
    const justOnline: string[] = [];
    for (const agent of agents) {
      const prev = prevStatusRef.current[agent.id];
      if (agent.status === 'online' && prev !== 'online' && prev !== undefined) {
        justOnline.push(agent.id);
      }
      prevStatusRef.current[agent.id] = agent.status;
    }
    if (justOnline.length === 0) return;

    setNewlyOnline(prev => new Set([...prev, ...justOnline]));
    const timer = setTimeout(() => {
      setNewlyOnline(prev => {
        const next = new Set(prev);
        justOnline.forEach(id => next.delete(id));
        return next;
      });
    }, 1800);
    return () => clearTimeout(timer);
  }, [agents]);

  // Stable ref-callback factory
  const getNodeRef = useCallback((id: string): React.RefCallback<HTMLDivElement> =>
    (el) => {
      if (el) nodeRefs.current.set(id, el);
      else     nodeRefs.current.delete(id);
    }, []);

  const isActive = phase !== 'standby' && phase !== 'sleep';
  const [pr, pg, pb] = PHASE_RGB[phase] ?? PHASE_RGB.standby;
  const rgb = `${pr},${pg},${pb}`;

  /* ── Canvas + RAF loop ───────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const ph    = phaseRef.current;
      const actId = activeRef.current;
      const ags   = orbitAgsRef.current;
      const isAct = ph !== 'standby' && ph !== 'sleep';
      const [pr_, pg_, pb_] = PHASE_RGB[ph] ?? PHASE_RGB.standby;

      pktTRef.current = (pktTRef.current + 0.022) % 1;
      const pkt = pktTRef.current;
      const fm  = floatRef.current;

      // Initialise state for newly-seen agents.
      // For each new agent, try 25 candidate positions and pick the one
      // whose XY distance to the nearest already-placed agent is greatest,
      // which spreads agents out evenly from the start.
      for (const ag of ags) {
        if (!fm.has(ag.id)) {
          let bestPos = randOnEllipsoidExcluding();
          let bestMinDist = -1;
          for (let attempt = 0; attempt < 25; attempt++) {
            const cand = randOnEllipsoidExcluding();
            let minDist = Infinity;
            for (const [, other] of fm) {
              const dx = cand[0] - other.pos[0];
              const dy = cand[1] - other.pos[1];
              minDist = Math.min(minDist, Math.sqrt(dx*dx + dy*dy));
            }
            if (fm.size === 0) { bestPos = cand; break; } // first agent, any position ok
            if (minDist > bestMinDist) { bestMinDist = minDist; bestPos = cand; }
          }
          fm.set(ag.id, {
            pos:    bestPos,
            vel:    [0, 0, 0] as V3,
            target: randOnEllipsoidExcluding(),
            timer:  Math.random() * TARGET_FRAMES,
          });
        }
      }

      // Phase 1 — accumulate forces; positions are NOT moved yet so
      // agent-agent repulsion reads consistent pre-frame positions.
      for (const ag of ags) {
        const fs = fm.get(ag.id)!;

        // Pick a new target when the timer expires — choose the candidate
        // that is furthest in XY from all other agents' current positions,
        // which discourages agents from drifting into the same region.
        fs.timer--;
        if (fs.timer <= 0) {
          let bestTarget = randOnEllipsoidExcluding();
          let bestMinDist = -1;
          for (let attempt = 0; attempt < 12; attempt++) {
            const cand = randOnEllipsoidExcluding();
            let minDist = Infinity;
            for (const other of ags) {
              if (other.id === ag.id) continue;
              const ofs2 = fm.get(other.id);
              if (!ofs2) continue;
              const ddx = cand[0] - ofs2.pos[0];
              const ddy = cand[1] - ofs2.pos[1];
              minDist = Math.min(minDist, Math.sqrt(ddx*ddx + ddy*ddy));
            }
            if (minDist > bestMinDist) { bestMinDist = minDist; bestTarget = cand; }
          }
          fs.target = bestTarget;
          fs.timer  = TARGET_FRAMES * (0.5 + Math.random());
        }

        // Spring pull toward the current target
        const [tx,ty,tz] = fs.target;
        const [px,py,pz] = fs.pos;
        fs.vel[0] += (tx - px) * FLOAT_SPRING;
        fs.vel[1] += (ty - py) * FLOAT_SPRING;
        fs.vel[2] += (tz - pz) * FLOAT_SPRING;

        // XY-plane repulsion from AI core — only push in X and Y because
        // pushing in Z does NOT move the screen projection away from centre.
        // (screen_x ≈ CX + 3d_x × scale, screen_y ≈ CY + 3d_y × scale)
        const dxy = Math.sqrt(px*px + py*py);
        if (dxy < MIN_SCREEN_DIST && dxy > 0.1) {
          const rep = CORE_REPEL * (MIN_SCREEN_DIST - dxy) / dxy;
          fs.vel[0] += px * rep;
          fs.vel[1] += py * rep;
          // Z is intentionally NOT repelled — depth doesn't affect screen XY position
        }

        // Canvas boundary soft pushback — grows quadratically as agent nears each edge
        const scale_  = FOV / (pz + FOV);
        const invSc_  = 1 / Math.max(scale_, 0.01);
        const sx_ = CX + px * scale_;
        const sy_ = CY + py * scale_;
        if (sx_ < SAFE_MARGIN) {
          const pen = (SAFE_MARGIN - sx_) / SAFE_MARGIN;
          fs.vel[0] += pen * pen * invSc_ * BOUND_REPEL * SAFE_MARGIN;
        }
        if (sx_ > W - SAFE_MARGIN) {
          const pen = (sx_ - (W - SAFE_MARGIN)) / SAFE_MARGIN;
          fs.vel[0] -= pen * pen * invSc_ * BOUND_REPEL * SAFE_MARGIN;
        }
        if (sy_ < SAFE_MARGIN) {
          const pen = (SAFE_MARGIN - sy_) / SAFE_MARGIN;
          fs.vel[1] += pen * pen * invSc_ * BOUND_REPEL * SAFE_MARGIN;
        }
        if (sy_ > H - SAFE_MARGIN) {
          const pen = (sy_ - (H - SAFE_MARGIN)) / SAFE_MARGIN;
          fs.vel[1] -= pen * pen * invSc_ * BOUND_REPEL * SAFE_MARGIN;
        }

        // Agent-to-agent separation — push apart when crowding.
        // Use XY-plane distance only (≈ screen distance) because two agents
        // at the same XY but different Z appear at the same screen position;
        // full 3D distance would miss that overlap entirely.
        for (const other of ags) {
          if (other.id === ag.id) continue;
          const ofs = fm.get(other.id)!;
          const dx = px - ofs.pos[0];
          const dy = py - ofs.pos[1];
          const dd = Math.sqrt(dx*dx + dy*dy); // XY only ≈ screen separation
          if (dd < MIN_AGENT_DIST && dd > 0.1) {
            const rep = AGENT_REPEL * (MIN_AGENT_DIST - dd) / dd;
            fs.vel[0] += dx * rep;
            fs.vel[1] += dy * rep;
            // Z deliberately excluded — depth change has no screen separation effect
          }
        }

        // Damp, then clamp to a consistent speed band
        fs.vel[0] *= FLOAT_DAMP;
        fs.vel[1] *= FLOAT_DAMP;
        fs.vel[2] *= FLOAT_DAMP;
        const spd = Math.sqrt(fs.vel[0]**2 + fs.vel[1]**2 + fs.vel[2]**2);
        if (spd > MAX_SPEED) {
          const f = MAX_SPEED / spd;
          fs.vel[0] *= f; fs.vel[1] *= f; fs.vel[2] *= f;
        } else if (spd > 0.001 && spd < MIN_SPEED) {
          const f = MIN_SPEED / spd;
          fs.vel[0] *= f; fs.vel[1] *= f; fs.vel[2] *= f;
        }
      }

      // Phase 2 — integrate positions after all forces are settled
      for (const ag of ags) {
        const fs = fm.get(ag.id)!;
        fs.pos[0] += fs.vel[0];
        fs.pos[1] += fs.vel[1];
        fs.pos[2] += fs.vel[2];

        // Smooth core nudge — if overshoot carries agent inside the core despite
        // soft repulsion, gently push outward without snapping (no visible flicker).
        const dxyH = Math.sqrt(fs.pos[0]**2 + fs.pos[1]**2);
        if (dxyH > 0.1 && dxyH < MIN_SCREEN_DIST) {
          const nx = fs.pos[0] / dxyH;
          const ny = fs.pos[1] / dxyH;
          // Lerp outward at 35% per frame — smooth, not an instant snap
          const push = (MIN_SCREEN_DIST - dxyH) * 0.35;
          fs.pos[0] += nx * push;
          fs.pos[1] += ny * push;
          // Dampen (not zero) the inward velocity component
          const vDotN = fs.vel[0]*nx + fs.vel[1]*ny;
          if (vDotN < 0) { fs.vel[0] -= vDotN * nx * 0.6; fs.vel[1] -= vDotN * ny * 0.6; }
        }
      }

      // Project each agent's float position to screen space
      const pts = ags.map(agent => {
        const fs = fm.get(agent.id)!;
        const [x, y, s] = project(fs.pos, CX, CY, FOV);
        return { x, y, s, id: agent.id, agent };
      });

      /* ── Imperatively update DOM node transforms ── */
      for (const { x, y, s, id, agent } of pts) {
        const el = nodeRefs.current.get(id);
        if (!el) continue;
        const isActNode = id === actId;
        // Active agent is pushed forward and scaled up significantly so it stands out
        const displayS  = isActNode ? Math.max(s * 1.35, 1.28) : Math.max(s, 0.50);
        el.style.transform = `translate(${x}px,${y}px) scale(${displayS})`;
        el.style.zIndex    = String(isActNode ? 200 : Math.round(s * 80 + 5));
        el.style.opacity   = agent.status === 'offline'
          ? String(Math.max(0.22, s * 0.45))
          : actId && !isActNode
            ? '0.30'
            : '1';
      }

      /* ── Canvas: clear ── */
      ctx.clearRect(0, 0, W, H);

      /* ── Canvas: orbit guide rings (match ellipsoid shape) ── */
      for (const [rx_, ry_, dashArr, alpha] of [
        [RX + 24, RY + 14, [4,9], 0.06],
        [RX,      RY,      [3,7], 0.04],
      ] as const) {
        ctx.save();
        ctx.strokeStyle = `rgba(${pr_},${pg_},${pb_},${alpha})`;
        ctx.lineWidth   = 0.8;
        ctx.setLineDash(dashArr as unknown as number[]);
        ctx.beginPath();
        // Project ry onto screen: Y axis is compressed by depth tilt (~sin(0.28)≈0.277 + perspective)
        ctx.ellipse(CX, CY, rx_, ry_ * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      /* ── Canvas: dotted communication link ── */
      const actPt    = pts.find(p => p.id === actId);
      const showLink = actPt && (ph === 'thinking' || ph === 'responding' || ph === 'listening');

      if (showLink && actPt) {
        const responding = ph === 'responding';
        // Dash offset flows: orchestrator→agent when thinking/listening, agent→orchestrator when responding
        const dashOff = (pkt * 30) % 14;

        ctx.save();
        ctx.shadowBlur     = 12;
        ctx.shadowColor    = `rgba(${pr_},${pg_},${pb_},0.8)`;
        ctx.strokeStyle    = `rgba(${pr_},${pg_},${pb_},0.65)`;
        ctx.lineWidth      = 1.6;
        ctx.setLineDash([5, 6]);
        ctx.lineDashOffset = responding ? dashOff : -dashOff;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(actPt.x, actPt.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Single pulse dot sliding along the link in the data-flow direction
        const frac = responding ? 1 - pkt : pkt;
        const lx   = CX + (actPt.x - CX) * frac;
        const ly   = CY + (actPt.y - CY) * frac;
        const fade = Math.max(0, 1 - Math.abs(frac - 0.5) * 2.4);
        ctx.save();
        ctx.shadowBlur  = 22;
        ctx.shadowColor = `rgba(${pr_},${pg_},${pb_},1)`;
        ctx.fillStyle   = `rgba(${pr_},${pg_},${pb_},${fade * 0.9})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* ── Canvas: active-agent radiation glow + expanding rings ── */
      if (actPt) {
        const t      = performance.now() / 1000;
        const active = ph === 'responding' || ph === 'thinking' || ph === 'listening';
        if (active) {
          // Ambient glow centered on active agent
          const glowR  = (55 + 20 * actPt.s) * Math.max(actPt.s, 0.7);
          const intens = ph === 'responding' ? 0.55 : ph === 'listening' ? 0.38 : 0.24;
          const ag2 = ctx.createRadialGradient(actPt.x, actPt.y, 0, actPt.x, actPt.y, glowR);
          ag2.addColorStop(0,   `rgba(${pr_},${pg_},${pb_},${intens})`);
          ag2.addColorStop(0.5, `rgba(${pr_},${pg_},${pb_},${intens * 0.35})`);
          ag2.addColorStop(1,   `rgba(${pr_},${pg_},${pb_},0)`);
          ctx.save();
          ctx.fillStyle = ag2;
          ctx.beginPath();
          ctx.arc(actPt.x, actPt.y, glowR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Expanding rings radiating outward from active agent
          const speed = ph === 'responding' ? 1.3 : ph === 'listening' ? 1.0 : 0.7;
          const maxR  = 60 * Math.max(actPt.s, 0.7);
          for (let i = 0; i < 4; i++) {
            const p      = ((t * speed + i / 4) % 1);
            const radius = 12 + p * maxR;
            const alpha  = (1 - p) * 0.70;
            const lw     = 1.5 + (1 - p) * 2.0;
            ctx.save();
            ctx.strokeStyle = `rgba(${pr_},${pg_},${pb_},${alpha})`;
            ctx.lineWidth   = lw;
            ctx.shadowBlur  = 14 * (1 - p);
            ctx.shadowColor = `rgba(${pr_},${pg_},${pb_},${Math.min(1, alpha * 1.8)})`;
            ctx.beginPath();
            ctx.arc(actPt.x, actPt.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      /* ── Canvas: orchestrator — 3-ring gyroscope + wireframe octahedron ── */
      {
        const t     = performance.now() / 1000;
        const sMin  = ORC_FOV / (ORC_FOV + ORC_RING);
        const sMax  = ORC_FOV / Math.max(1, ORC_FOV - ORC_RING);
        const sSpan = Math.max(0.001, sMax - sMin);

        // Ambient glow backdrop — only when voice is active
        const vIntens = vIntensRef.current;
        if (vActiveRef.current && vIntens > 0.05) {
          const glowR = 120 + 40 * vIntens;
          const ag = ctx.createRadialGradient(CX, CY, 0, CX, CY, glowR);
          ag.addColorStop(0,    `rgba(${pr_},${pg_},${pb_},${0.30 + 0.25 * vIntens})`);
          ag.addColorStop(0.42, `rgba(${pr_},${pg_},${pb_},${0.10 + 0.10 * vIntens})`);
          ag.addColorStop(1,    `rgba(${pr_},${pg_},${pb_},0)`);
          ctx.save();
          ctx.fillStyle = ag;
          ctx.beginPath();
          ctx.arc(CX, CY, glowR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Voice-reactive expanding ring radiation
        if (vActiveRef.current && vIntens > 0.05) {
          const speed  = ph === 'responding' ? 1.4 : ph === 'listening' ? 1.1 : 0.75;
          const maxR   = 32 + 160 * vIntens;
          for (let i = 0; i < 5; i++) {
            const p      = ((t * speed + i / 5) % 1);
            const radius = 28 + p * maxR;
            const alpha  = (1 - p) * 0.55 * vIntens;
            const lw     = 1.5 + (1 - p) * 2.5;
            ctx.save();
            ctx.strokeStyle = `rgba(${pr_},${pg_},${pb_},${alpha})`;
            ctx.lineWidth   = lw;
            ctx.shadowBlur  = 18 * (1 - p);
            ctx.shadowColor = `rgba(${pr_},${pg_},${pb_},${Math.min(1, alpha * 2)})`;
            ctx.beginPath();
            ctx.arc(CX, CY, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }

        // Two tilted orbital rings (equatorial ring removed — it projects as a flat horizontal line)
        const ORB_RINGS = [
          { tilt: Math.PI/2.5,  speed: -0.34, lw: 1.6 },   // tilted 72°
          { tilt: Math.PI/1.35, speed:  0.70, lw: 1.4 },   // tilted 133°
        ];

        for (const { tilt, speed, lw } of ORB_RINGS) {
          const rotA = t * speed;
          const N = 96;
          const rp: [number,number,number][] = [];
          for (let i = 0; i <= N; i++) {
            const a = (i / N) * Math.PI * 2;
            let p: V3 = [ORC_RING * Math.cos(a), 0, ORC_RING * Math.sin(a)];
            p = orcRotX(p, tilt);
            p = orcRotY(p, rotA);
            rp.push(orcProj(p));
          }
          ctx.save();
          ctx.lineWidth = lw;
          for (let i = 0; i < N; i++) {
            const [x1,y1,s1] = rp[i];
            const [x2,y2,s2] = rp[i+1];
            const alpha = Math.min(0.90, Math.max(0.08, 0.10 + ((((s1+s2)*0.5) - sMin) / sSpan) * 0.82));
            ctx.strokeStyle = `rgba(${pr_},${pg_},${pb_},${alpha})`;
            ctx.shadowBlur  = 9;
            ctx.shadowColor = `rgba(${pr_},${pg_},${pb_},0.9)`;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Rotating wireframe octahedron — outer cage
        const oRot  = t * 0.42;
        const oRaw: V3[] = [
          [ORC_OCT,0,0],[-ORC_OCT,0,0],
          [0,ORC_OCT,0],[0,-ORC_OCT,0],
          [0,0,ORC_OCT],[0,0,-ORC_OCT],
        ];
        const oV = oRaw.map(v => {
          let p: V3 = [v[0],v[1],v[2]];
          p = orcRotY(p, oRot);
          p = orcRotX(p, oRot * 0.618);
          return orcProj(p);
        });
        const oE: [number,number][] = [
          [0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[2,5],[3,4],[3,5],
        ];
        const oSMin  = ORC_FOV / (ORC_FOV + ORC_OCT);
        const oSSpan = Math.max(0.001, ORC_FOV / Math.max(1, ORC_FOV - ORC_OCT) - oSMin);

        ctx.save();
        ctx.shadowBlur  = 7;
        ctx.shadowColor = `rgba(${pr_},${pg_},${pb_},0.85)`;
        for (const [a, b] of oE) {
          const sAvg  = (oV[a][2] + oV[b][2]) * 0.5;
          const alpha = Math.min(0.65, Math.max(0.12, 0.10 + ((sAvg - oSMin) / oSSpan) * 0.58));
          ctx.strokeStyle = `rgba(${pr_},${pg_},${pb_},${alpha})`;
          ctx.lineWidth   = 1.0;
          ctx.beginPath();
          ctx.moveTo(oV[a][0], oV[a][1]);
          ctx.lineTo(oV[b][0], oV[b][1]);
          ctx.stroke();
        }
        // Vertex dots — brighter when closer to viewer
        ctx.shadowBlur  = 16;
        ctx.shadowColor = `rgba(${pr_},${pg_},${pb_},1)`;
        ctx.fillStyle   = `rgba(${pr_},${pg_},${pb_},0.92)`;
        for (const [px, py, ps] of oV) {
          ctx.globalAlpha = Math.min(1, Math.max(0.1, 0.1 + ((ps - oSMin) / oSSpan) * 0.88));
          ctx.beginPath();
          ctx.arc(px, py, 2.5 + ps * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // White-hot pulsing energy core — drawn last to appear on top
        const cR = 28 + 3.5 * Math.sin(t * 3.2);
        const cg = ctx.createRadialGradient(CX, CY, 0, CX, CY, cR);
        cg.addColorStop(0,    'rgba(255,255,255,1)');
        cg.addColorStop(0.12, `rgba(${pr_},${pg_},${pb_},1)`);
        cg.addColorStop(0.50, `rgba(${pr_},${pg_},${pb_},0.62)`);
        cg.addColorStop(1,    `rgba(${pr_},${pg_},${pb_},0)`);
        ctx.save();
        ctx.shadowBlur  = 46;
        ctx.shadowColor = `rgba(${pr_},${pg_},${pb_},1)`;
        ctx.fillStyle   = cg;
        ctx.beginPath();
        ctx.arc(CX, CY, cR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div style={{ width:W, height:H }} className="relative select-none">

      {/* Background canvas — orbit rings + beams */}
      <canvas ref={canvasRef} className="absolute inset-0" style={{ zIndex:0 }} />

      {/* Agent nodes (DOM layer — Lucide icons + status) */}
      {orbitAgents.map(agent => (
        <AgentNode
          key={agent.id}
          agent={agent}
          isActive={agent.id === activeAgentId}
          isNewlyOnline={newlyOnline.has(agent.id)}
          phase={phase}
          nodeRef={getNodeRef(agent.id)}
        />
      ))}

      {/* Orchestrator label — floats below the canvas gyroscope visual */}
      <div
        className="absolute pointer-events-none font-mono font-bold text-center"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, calc(-50% + 54px))',
          zIndex: 70,
          fontSize: 8,
          letterSpacing: '0.32em',
          color: `rgba(${rgb},0.38)`,
          whiteSpace: 'nowrap',
        }}
      >
        ORCHESTRATOR
      </div>

      {/* HUD corner brackets */}
      {([
        { top:8,    left:8,   deg:0   },
        { top:8,    right:8,  deg:90  },
        { bottom:8, right:8,  deg:180 },
        { bottom:8, left:8,   deg:270 },
      ] as const).map(({ deg, ...pos }, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            ...pos, width:20, height:20,
            borderTop:`2px solid rgba(${rgb},0.38)`,
            borderLeft:`2px solid rgba(${rgb},0.38)`,
            transform:`rotate(${deg}deg)`,
            zIndex:10,
          }}
          animate={{ opacity:isActive?[0.12,0.75,0.12]:0.08 }}
          transition={{ duration:2.4, repeat:Infinity, delay:i*0.38 }}
        />
      ))}
    </div>
  );
}
