import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCircle2, Clock, StickyNote, X } from 'lucide-react';
import type { PendingAlert } from '../hooks/useReminders';
import { SNOOZE_OPTIONS } from '../hooks/useReminders';

interface Props {
  alerts:       PendingAlert[];
  /** Countdown seconds for the active (first) alarm */
  countdown:    number;
  voiceEnabled: boolean;
  onDismiss:    (key: string) => void;
  onSnooze:     (alert: PendingAlert, minutes: number) => void;
}

const TYPE_META = {
  alarm:    { Icon: Bell,         color: 'text-amber-400',   ringClass: 'ring-amber-400/35',   bg: 'bg-amber-400/10',   border: 'border-amber-400/28',   topBar: 'via-amber-400/55',   label: 'Alarm'    },
  reminder: { Icon: Clock,        color: 'text-violet-400',  ringClass: 'ring-violet-400/35',  bg: 'bg-violet-400/10',  border: 'border-violet-400/28',  topBar: 'via-violet-400/55',  label: 'Reminder' },
  task:     { Icon: CheckCircle2, color: 'text-emerald-400', ringClass: 'ring-emerald-400/35', bg: 'bg-emerald-400/10', border: 'border-emerald-400/28', topBar: 'via-emerald-400/55', label: 'Task'     },
  note:     { Icon: StickyNote,   color: 'text-sky-400',     ringClass: 'ring-sky-400/35',     bg: 'bg-sky-400/10',     border: 'border-sky-400/28',     topBar: 'via-sky-400/55',     label: 'Note'     },
} as const;

function AlertCard({
  alert, isFirst, countdown, voiceEnabled, onDismiss, onSnooze,
}: {
  alert: PendingAlert; isFirst: boolean; countdown: number;
  voiceEnabled: boolean; onDismiss: () => void; onSnooze: (m: number) => void;
}) {
  const meta    = TYPE_META[alert.type as keyof typeof TYPE_META] ?? TYPE_META.reminder;
  const { Icon } = meta;
  const isAlarm = alert.type === 'alarm';
  const showCountdown = isAlarm && isFirst;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 72, scale: 0.93 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 72, scale: 0.90, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      className={`relative w-[336px] rounded-2xl border ${meta.border} bg-[#0a0d18]/97 backdrop-blur-xl overflow-hidden`}
      style={{
        boxShadow: isAlarm
          ? '0 0 44px rgba(251,191,36,0.09), 0 8px 32px rgba(0,0,0,0.55)'
          : '0 8px 32px rgba(0,0,0,0.48)',
      }}
    >
      {/* Pulsing ring for active alarm */}
      {showCountdown && (
        <motion.span
          className={`absolute inset-0 rounded-2xl ring-2 ${meta.ringClass} pointer-events-none`}
          animate={{ opacity: [0.55, 0.12, 0.55] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Coloured top stripe */}
      <div className={`h-[1.5px] w-full bg-gradient-to-r from-transparent ${meta.topBar} to-transparent`} />

      <div className="px-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">

          {/* Icon */}
          <div className="relative flex-shrink-0 mt-0.5">
            <motion.div
              animate={showCountdown
                ? { rotate: [-14, 14, -10, 10, -4, 4, 0] }
                : { rotate: 0 }}
              transition={showCountdown
                ? { duration: 0.75, repeat: Infinity, repeatDelay: 2.4 }
                : undefined}
              className={`flex h-8 w-8 items-center justify-center rounded-full ${meta.bg} ring-1 ${meta.ringClass}`}
            >
              <Icon className={`h-4 w-4 ${meta.color}`} />
            </motion.div>
            {showCountdown && (
              <motion.div
                className={`absolute inset-0 rounded-full ring-1 ${meta.ringClass}`}
                animate={{ scale: [1, 1.85], opacity: [0.55, 0] }}
                transition={{ duration: 1.25, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <span className={`text-[8.5px] font-mono uppercase tracking-[0.28em] ${meta.color} opacity-80 block mb-0.5`}>
              {meta.label}
              {alert.repeat && <span className="ml-1.5 opacity-50">· {alert.repeat}</span>}
            </span>
            <h3 className="text-[13.5px] font-semibold text-white leading-snug">{alert.title}</h3>
          </div>

          {/* Countdown badge for active alarm */}
          {showCountdown ? (
            <div className="flex-shrink-0 flex flex-col items-end gap-0">
              <span className="text-[8px] font-mono text-amber-400/40 leading-none">again in</span>
              <span className={`text-[16px] font-mono font-bold tabular-nums leading-tight ${meta.color}`}>
                {countdown}s
              </span>
            </div>
          ) : (
            <button
              onClick={onDismiss}
              className="flex-shrink-0 rounded-full p-1 text-white/22 hover:text-white/65 hover:bg-white/8 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Body text */}
        {alert.body && (
          <p className="text-[12.5px] leading-relaxed text-slate-400 mb-3 pl-[44px] line-clamp-3">
            {alert.body}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onDismiss}
            className="flex items-center gap-1 h-8 px-3.5 rounded-xl border border-white/10 bg-white/5 text-[11.5px] text-white/65 font-medium hover:bg-white/10 hover:text-white/85 transition-colors flex-shrink-0"
          >
            <X className="h-3 w-3 opacity-55" />
            Dismiss
          </button>

          {/* Snooze dropdown */}
          <div className="relative flex-1">
            <select
              defaultValue=""
              onChange={(e) => {
                const min = parseInt(e.target.value, 10);
                if (!isNaN(min)) onSnooze(min);
                (e.target as HTMLSelectElement).value = '';
              }}
              className={`w-full h-8 appearance-none rounded-xl border ${meta.border} ${meta.bg} pl-3 pr-7 text-[11.5px] ${meta.color} cursor-pointer focus:outline-none transition-colors`}
            >
              <option value="" disabled>Snooze…</option>
              {SNOOZE_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={opt.minutes}>{opt.label}</option>
              ))}
            </select>
            <div className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] ${meta.color} opacity-50`}>▾</div>
          </div>
        </div>

        {/* Voice command hint — active alarm + voice mode only */}
        {showCountdown && voiceEnabled && (
          <p className="mt-2.5 text-[9px] text-slate-600 text-center font-mono">
            Say{' '}
            <span className={`${meta.color} opacity-70 font-semibold`}>"snooze"</span>
            {' '}or{' '}
            <span className={`${meta.color} opacity-70 font-semibold`}>"dismiss"</span>
            {' '}to control by voice
          </p>
        )}
      </div>

      {/* Bottom glow */}
      <div className={`h-[1px] w-full bg-gradient-to-r from-transparent ${meta.topBar} to-transparent opacity-25`} />
    </motion.div>
  );
}

export function ReminderAlert({ alerts, countdown, voiceEnabled, onDismiss, onSnooze }: Props) {
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col-reverse gap-3 items-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert, idx) => (
          <div key={alert.alertKey} className="pointer-events-auto">
            <AlertCard
              alert={alert}
              isFirst={idx === 0}
              countdown={countdown}
              voiceEnabled={voiceEnabled}
              onDismiss={() => onDismiss(alert.alertKey)}
              onSnooze={(m) => onSnooze(alert, m)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
