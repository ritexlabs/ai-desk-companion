import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TranscriptTurn {
  speaker: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  agentId?: string;
}

const AGENT_COLOR: Record<string, string> = {
  weather:    '#22d3ee',
  calendar:   '#a78bfa',
  email:      '#34d399',
  github:     '#fbbf24',
  stock:      '#4ade80',
  news:       '#38bdf8',
  smarthome:  '#fb923c',
  portfolio:  '#fb7185',
  whatsapp:   '#4ade80',
  websearch:  '#60a5fa',
  calculator: '#fbbf24',
  memory:     '#c084fc',
  briefing:   '#22d3ee',
  system:     '#2dd4bf',
  general:    '#a78bfa',
};

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch {
    return '--:--:--';
  }
}

interface HoloChatProps {
  transcript: TranscriptTurn[];
  aiName: string;
  /** Override container classes (e.g. when used as a 3D-plane overlay) */
  className?: string;
}

export function HoloChat({ transcript, aiName, className }: HoloChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript.length]);

  return (
    <div className={
      className ??
      'flex-1 min-h-0 overflow-y-auto border-t border-white/6 bg-black/15 backdrop-blur-sm px-3 py-2 space-y-0.5 scrollbar-thin holo-terminal'
    }>
      <AnimatePresence initial={false}>
        {transcript.map((turn, i) => {
          const key = `${turn.timestamp}-${i}`;
          const time = formatTime(turn.timestamp);
          const isSys  = turn.speaker === 'system';
          const isUser = turn.speaker === 'user';

          /* ── System message — dim italic line ── */
          if (isSys) {
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-baseline gap-2 py-0.5"
              >
                <span className="text-[9px] font-mono text-slate-700 tabular-nums shrink-0">{time}</span>
                <span className="text-[9px] font-mono text-slate-700 italic">{turn.text}</span>
              </motion.div>
            );
          }

          /* ── User message ── */
          if (isUser) {
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex items-baseline gap-2 py-0.5"
              >
                <span className="text-[9px] font-mono text-slate-700 tabular-nums shrink-0">{time}</span>
                <span className="text-[9px] font-mono font-bold shrink-0" style={{ color: '#a78bfa' }}>YOU</span>
                <span className="text-[12px] leading-snug text-violet-100/90 whitespace-pre-wrap break-words min-w-0">{turn.text}</span>
              </motion.div>
            );
          }

          /* ── Assistant message ── */
          const agentLabel = turn.agentId && turn.agentId !== 'general'
            ? turn.agentId.toUpperCase()
            : aiName.toUpperCase();
          const color = AGENT_COLOR[turn.agentId ?? 'general'] ?? AGENT_COLOR.general;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex items-baseline gap-2 py-0.5"
            >
              <span className="text-[9px] font-mono text-slate-700 tabular-nums shrink-0">{time}</span>
              <span className="text-[9px] font-mono font-bold shrink-0" style={{ color }}>{agentLabel}</span>
              <span className="text-[12px] leading-snug text-slate-200/90 whitespace-pre-wrap break-words min-w-0">{turn.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <div ref={bottomRef} className="h-1" />
    </div>
  );
}
