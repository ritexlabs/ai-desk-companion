import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TranscriptTurn {
  speaker: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  agentId?: string;
}

/* Per-agent accent colours (left border on AI messages) */
const AGENT_ACCENT: Record<string, string> = {
  weather:    'rgba(34,211,238,0.65)',
  calendar:   'rgba(167,139,250,0.65)',
  email:      'rgba(52,211,153,0.65)',
  github:     'rgba(251,191,36,0.65)',
  stock:      'rgba(74,222,128,0.65)',
  news:       'rgba(56,189,248,0.65)',
  smarthome:  'rgba(251,146,60,0.65)',
  portfolio:  'rgba(251,113,133,0.65)',
  whatsapp:   'rgba(74,222,128,0.65)',
  websearch:  'rgba(96,165,250,0.65)',
  calculator: 'rgba(251,191,36,0.65)',
  memory:     'rgba(192,132,252,0.65)',
  briefing:   'rgba(34,211,238,0.65)',
  system:     'rgba(45,212,191,0.65)',
  general:    'rgba(167,139,250,0.65)',
};

const AGENT_LABEL_COLOR: Record<string, string> = {
  weather:    'text-cyan-400',
  calendar:   'text-violet-400',
  email:      'text-emerald-400',
  github:     'text-amber-400',
  stock:      'text-green-400',
  news:       'text-sky-400',
  smarthome:  'text-orange-400',
  portfolio:  'text-rose-400',
  whatsapp:   'text-green-400',
  websearch:  'text-blue-400',
  calculator: 'text-amber-400',
  memory:     'text-purple-400',
  briefing:   'text-cyan-400',
  system:     'text-teal-400',
  general:    'text-violet-400',
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
}

export function HoloChat({ transcript, aiName }: HoloChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript.length]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto border-t border-white/6 bg-black/15 backdrop-blur-sm px-4 py-3 space-y-2.5 scrollbar-thin holo-terminal">
      <AnimatePresence initial={false}>
        {transcript.map((turn, i) => {
          const key = `${turn.timestamp}-${i}`;
          const time = formatTime(turn.timestamp);
          const isSys  = turn.speaker === 'system';
          const isUser = turn.speaker === 'user';
          const accent = AGENT_ACCENT[turn.agentId ?? 'general'] ?? AGENT_ACCENT.general;
          const agentLabelColor = AGENT_LABEL_COLOR[turn.agentId ?? 'general'] ?? 'text-violet-400';

          /* ── System message — centered pill ── */
          if (isSys) {
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex justify-center"
              >
                <div className="flex items-center gap-2 text-[8.5px] font-mono text-slate-600 italic px-3 py-1 rounded-full border border-white/5 bg-white/[0.015]">
                  <span className="text-slate-700">{time}</span>
                  <span className="text-slate-700">·</span>
                  {turn.text}
                </div>
              </motion.div>
            );
          }

          /* ── User message — right-aligned violet chip ── */
          if (isUser) {
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="flex justify-end"
              >
                <div className="max-w-[80%] flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono text-slate-600 tabular-nums">{time}</span>
                    <span className="text-[8px] font-mono font-bold text-violet-400 uppercase tracking-[0.2em]">You</span>
                  </div>
                  <div
                    className="rounded-2xl rounded-tr-md px-4 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words"
                    style={{
                      background: 'linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(79,70,229,0.18) 100%)',
                      border: '1px solid rgba(139,92,246,0.28)',
                      color: 'rgba(233,213,255,0.95)',
                      boxShadow: '0 2px 12px rgba(139,92,246,0.12)',
                    }}
                  >
                    {turn.text}
                  </div>
                </div>
              </motion.div>
            );
          }

          /* ── Assistant message — left-aligned with agent color accent ── */
          const agentLabel = turn.agentId && turn.agentId !== 'general'
            ? turn.agentId.toUpperCase()
            : aiName.toUpperCase();

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex justify-start"
            >
              <div className="max-w-[82%] flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[8px] font-mono font-bold uppercase tracking-[0.2em] ${agentLabelColor}`}>
                    {agentLabel}
                  </span>
                  <span className="text-[8px] font-mono text-slate-600 tabular-nums">{time}</span>
                </div>
                <div
                  className="rounded-2xl rounded-tl-md px-4 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words"
                  style={{
                    background: 'rgba(0,0,0,0.28)',
                    border: `1px solid rgba(255,255,255,0.07)`,
                    borderLeftColor: accent,
                    borderLeftWidth: '2px',
                    color: 'rgba(224,242,255,0.88)',
                  }}
                >
                  {turn.text}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Scroll anchor */}
      <div ref={bottomRef} className="h-1" />
    </div>
  );
}
