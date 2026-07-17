import { useCallback, useEffect, useRef, useState } from 'react';
import type { RuntimePhase } from '../types/runtime';

export interface PendingAlert {
  id:       string;
  type:     'task' | 'reminder' | 'alarm';
  title:    string;
  body:     string;
  repeat:   string | null;
  fired_at: number;
  alertKey: string;
}

export const SNOOZE_OPTIONS = [
  { label: '5 min',  minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
] as const;

const REPEAT_SEC = 30;

/** Three ascending-pitch beeps — used when voice is OFF */
function beepAlarm(ctxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    [660, 880, 1100].forEach((freq, i) => {
      const t    = i * 0.22;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.20, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.28);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.32);
    });
  } catch { /* AudioContext not available in some environments */ }
}

/** Speak text via browser SpeechSynthesis */
function speakText(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.rate   = 0.88;
  utt.pitch  = 1.05;
  window.speechSynthesis.speak(utt);
}

// ── Types ─────────────────────────────────────────────────────────────────

interface ExternalAlert { id: string; title: string; body: string; }

interface UseRemindersOptions {
  phase:                    RuntimePhase;
  enabled:                  boolean;
  voiceEnabled:             boolean;
  /** Name used in spoken reminders, e.g. "Master" or "Ritesh" */
  callingName:              string;
  /** Alerts pushed in from the WebSocket (rt.pendingAlerts) */
  externalAlerts?:          ExternalAlert[];
  /** Called after an external alert has been merged into the visual queue */
  onExternalAlertConsumed?: (id: string) => void;
  /** LLM/orchestrator speak — preferred over browser TTS when provided */
  onSpeak?:                 (text: string) => void;
  /**
   * When provided, fetches a personalized LLM-generated message then speaks it.
   * Signature: async (name, title, body, type) => void
   * Falls back to onSpeak / browser TTS / beep when this returns/throws.
   */
  onPersonalizeAndSpeak?:   (name: string, title: string, body: string, type: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useReminders({
  phase,
  enabled,
  voiceEnabled,
  callingName,
  externalAlerts = [],
  onExternalAlertConsumed,
  onSpeak,
  onPersonalizeAndSpeak,
}: UseRemindersOptions) {
  const [visualAlerts, setVisualAlerts] = useState<PendingAlert[]>([]);
  const [countdown, setCountdown]       = useState(REPEAT_SEC);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cdRef       = useRef(REPEAT_SEC);
  const phaseRef    = useRef(phase);
  phaseRef.current  = phase;

  // The first alarm in the queue is "active" and drives the repeat timer
  const activeAlarm = visualAlerts.find((a) => a.type === 'alarm') ?? null;

  /* ── Remind: personalized LLM → plain LLM speak → browser TTS → beep ── */
  const remind = useCallback((alert: PendingAlert) => {
    const name = callingName.trim() || 'there';
    const what = alert.body ? `${alert.title}. ${alert.body}` : alert.title;
    const fallbackMsg = `Hey ${name}! ${alert.type === 'alarm' ? 'Alarm' : 'Reminder'}: ${what}`;

    if (onPersonalizeAndSpeak) {
      onPersonalizeAndSpeak(name, alert.title, alert.body ?? '', alert.type).catch(() => {
        // If personalization fails, fall through to plain speak
        if (onSpeak) { onSpeak(fallbackMsg); }
        else if (voiceEnabled) { speakText(fallbackMsg); }
        else { beepAlarm(audioCtxRef); }
      });
      return;
    }
    if (onSpeak) {
      onSpeak(fallbackMsg);
    } else if (voiceEnabled) {
      speakText(fallbackMsg);
    } else {
      beepAlarm(audioCtxRef);
    }
  }, [voiceEnabled, callingName, onSpeak, onPersonalizeAndSpeak]);

  // Ref so dismiss/snooze can read current alerts without stale closure
  const visualAlertsRef = useRef<PendingAlert[]>([]);
  visualAlertsRef.current = visualAlerts;

  /* ── Dismiss ── */
  const dismissAlert = useCallback(async (alertKey: string) => {
    window.speechSynthesis?.cancel();
    const alert = visualAlertsRef.current.find((a) => a.alertKey === alertKey);
    setVisualAlerts((prev) => prev.filter((a) => a.alertKey !== alertKey));

    if (!alert || alert.id.startsWith('ws-')) return;
    const isRecurring = alert.type === 'alarm' && alert.repeat && alert.repeat !== 'onetime';
    if (!isRecurring) {
      // Non-recurring: delete from backend so it never reappears
      try {
        const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
        await fetch(`${base}/api/notes/${alert.id}`, { method: 'DELETE' });
      } catch { /* best-effort */ }
    }
  }, []);

  /* ── Snooze ── */
  const snoozeAlert = useCallback(async (alert: PendingAlert, minutes = 5) => {
    window.speechSynthesis?.cancel();
    setVisualAlerts((prev) => prev.filter((a) => a.alertKey !== alert.alertKey));

    if (alert.id.startsWith('ws-')) {
      // WebSocket alerts: re-add client-side only (no backend record)
      setTimeout(() => {
        const snoozed: PendingAlert = { ...alert, fired_at: Date.now(), alertKey: `${alert.id}-${Date.now()}` };
        setVisualAlerts((prev) => prev.some((a) => a.alertKey === snoozed.alertKey) ? prev : [...prev, snoozed]);
      }, minutes * 60_000);
      return;
    }

    try {
      const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
      await fetch(`${base}/api/notes/${alert.id}/snooze`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ minutes }),
      });
      // Backend now owns the new due_at; the scheduler+poll will re-trigger at the right time.
      // For recurring alarms (snoozed_until approach) also add client-side fallback.
      const isRecurring = alert.type === 'alarm' && alert.repeat && alert.repeat !== 'onetime';
      if (isRecurring) {
        setTimeout(() => {
          const snoozed: PendingAlert = { ...alert, fired_at: Date.now(), alertKey: `${alert.id}-${Date.now()}` };
          setVisualAlerts((prev) => prev.some((a) => a.alertKey === snoozed.alertKey) ? prev : [...prev, snoozed]);
        }, minutes * 60_000);
      }
    } catch { /* best-effort */ }
  }, []);

  /* ── Voice command interception — returns true if the text was handled ── */
  const handleVoiceCommand = useCallback((text: string): boolean => {
    if (!visualAlerts.length) return false;
    const lower     = text.toLowerCase().trim();
    const snoozeKw  = ['snooze', 'remind me later', 'snooze it', 'later', 'not now'];
    const dismissKw = ['cancel', 'dismiss', 'discard', 'stop reminder', 'stop alarm', 'got it', 'ok done', 'done', 'clear'];
    if (snoozeKw.some((k)  => lower.includes(k))) { snoozeAlert(visualAlerts[0], 5);  return true; }
    if (dismissKw.some((k) => lower.includes(k))) { dismissAlert(visualAlerts[0].alertKey); return true; }
    return false;
  }, [visualAlerts, snoozeAlert, dismissAlert]);

  /* ── Repeat timer: fires for the active alarm every REPEAT_SEC seconds ── */
  useEffect(() => {
    if (!activeAlarm) {
      setCountdown(REPEAT_SEC);
      return;
    }

    // Fire immediately when alarm first appears
    remind(activeAlarm);
    cdRef.current = REPEAT_SEC;
    setCountdown(REPEAT_SEC);

    const tick = setInterval(() => {
      cdRef.current -= 1;
      setCountdown(cdRef.current);
      if (cdRef.current <= 0) {
        remind(activeAlarm);
        cdRef.current = REPEAT_SEC;
        setCountdown(REPEAT_SEC);
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      window.speechSynthesis?.cancel();
    };
  // Restart only when the active alarm identity or voice settings change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlarm?.alertKey, voiceEnabled, callingName]);

  /* ── Announce non-alarm reminders once via voice on first appearance ── */
  const prevNonAlarmCountRef = useRef(0);
  useEffect(() => {
    const nonAlarms = visualAlerts.filter((a) => a.type !== 'alarm');
    if (nonAlarms.length > prevNonAlarmCountRef.current) {
      const latest = nonAlarms[nonAlarms.length - 1];
      const name   = callingName.trim() || 'there';
      const what   = latest.body ? `${latest.title}. ${latest.body}` : latest.title;
      const fallbackMsg = `Hey ${name}! You have a reminder: ${what}`;
      if (onPersonalizeAndSpeak) {
        onPersonalizeAndSpeak(name, latest.title, latest.body ?? '', latest.type).catch(() => {
          if (onSpeak) { onSpeak(fallbackMsg); }
          else if (voiceEnabled) { speakText(fallbackMsg); }
        });
      } else if (onSpeak) {
        onSpeak(fallbackMsg);
      } else if (voiceEnabled) {
        speakText(fallbackMsg);
      }
    }
    prevNonAlarmCountRef.current = nonAlarms.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualAlerts.length]);

  /* ── Poll backend for alerts from the notes agent every 30 s ── */
  const poll = useCallback(async () => {
    if (!enabled) return;
    try {
      const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
      const res  = await fetch(`${base}/api/notes/pending-alerts`);
      if (!res.ok) return;
      const data: { alerts: Omit<PendingAlert, 'alertKey'>[] } = await res.json();
      if (!data.alerts.length) return;
      setVisualAlerts((prev) => {
        const fresh = data.alerts.filter(
          (a) => !prev.some((p) => p.alertKey === `${a.id}-${a.fired_at}`),
        );
        if (!fresh.length) return prev;
        return [...prev, ...fresh.map((a) => ({ ...a, alertKey: `${a.id}-${a.fired_at}` }))];
      });
    } catch { /* backend offline or not configured */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [enabled, poll]);

  /* ── Consume WebSocket-pushed external alerts (from schedule_alert / orchestrator) ── */
  const seenExternalRef = useRef(new Set<string>());
  useEffect(() => {
    for (const ext of externalAlerts) {
      if (seenExternalRef.current.has(ext.id)) continue;
      seenExternalRef.current.add(ext.id);
      const alertKey = `ws-${ext.id}-${Date.now()}`;
      const alert: PendingAlert = {
        id:       `ws-${ext.id}`,
        type:     'alarm',
        title:    ext.title,
        body:     ext.body,
        repeat:   null,
        fired_at: Date.now(),
        alertKey,
      };
      setVisualAlerts((prev) => {
        if (prev.some((a) => a.alertKey === alertKey)) return prev;
        return [...prev, alert];
      });
      onExternalAlertConsumed?.(ext.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAlerts.length]);

  return {
    visualAlerts,
    countdown,
    dismissAlert,
    snoozeAlert,
    handleVoiceCommand,
  };
}
