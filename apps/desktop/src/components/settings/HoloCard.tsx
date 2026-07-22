import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AGENT_PALETTE, AGENT_PALETTE_FALLBACK } from '../../lib/agentPalette';

interface HoloCardProps {
  agentId: string;
  className?: string;
  children: React.ReactNode;
}

export function HoloCard({ agentId, className = '', children }: HoloCardProps) {
  const p = AGENT_PALETTE[agentId] ?? AGENT_PALETTE_FALLBACK;
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt]       = useState({ rotateX: 0, rotateY: 0 });
  const [shimmer, setShimmer] = useState({ x: 50, y: 50 });

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top)  / rect.height;
    setTilt({ rotateX: (0.5 - y) * 8, rotateY: (x - 0.5) * 8 });
    setShimmer({ x: x * 100, y: y * 100 });
  };

  const onMouseLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0 });
    setShimmer({ x: 50, y: 50 });
  };

  return (
    <div style={{ perspective: '900px' }} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <motion.div
        ref={cardRef}
        animate={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{ transformStyle: 'preserve-3d', boxShadow: `0 0 14px ${p.glowRgba}` }}
        className={`relative rounded-2xl border ${p.border} ${p.bg} backdrop-blur-sm ${className}`}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle at ${shimmer.x}% ${shimmer.y}%, rgba(255,255,255,0.07) 0%, transparent 65%)`,
            opacity: tilt.rotateX !== 0 || tilt.rotateY !== 0 ? 1 : 0,
          }}
        />
        <div
          className="pointer-events-none absolute top-0 inset-x-0 h-px rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${p.glowRgba}, transparent)` }}
        />
        {children}
      </motion.div>
    </div>
  );
}
