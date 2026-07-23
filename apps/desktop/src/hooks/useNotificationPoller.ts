import { useCallback, useEffect, useRef } from 'react';
import type { AgentConfig } from './useAgentConfig';

type ProactiveAskFn = (question: string, agentId: string, followUp: string) => void;
type PushFn        = (text: string, agentId: string) => void;

// Polling interval per agent (ms)
const INTERVALS: Record<string, number> = {
  email:     3  * 60_000,
  calendar:  15 * 60_000,
  github:    5  * 60_000,
  weather:   30 * 60_000,
  news:      30 * 60_000,
  portfolio: 15 * 60_000,
  system:    5  * 60_000,
  smarthome: 2  * 60_000,
};

// What to say and what to ask the LLM when user says "yes"
const TEMPLATES: Record<string, { question: string; followUp: string }> = {
  email:     { question: 'Master, you have new emails. Would you like me to read them?',             followUp: 'Read my latest unread emails' },
  calendar:  { question: 'Master, there is a calendar update. Want to hear it?',                     followUp: 'What is on my calendar today?' },
  github:    { question: 'Master, there are new GitHub notifications. Want me to go through them?',  followUp: 'Show my latest GitHub notifications' },
  news:      { question: 'Master, there are fresh headlines. Want a quick summary?',                 followUp: 'Give me the top news headlines' },
  weather:   { question: 'Master, the weather has changed. Would you like an update?',               followUp: 'What is the current weather?' },
  portfolio: { question: 'Master, your portfolio has a new update. Want me to read it?',             followUp: 'Give me my portfolio summary' },
  system:    { question: 'Master, your system resources are elevated. Want a full report?',          followUp: 'What is the current system status?' },
  smarthome: { question: 'Master, there is a smart home update. Want the details?',                  followUp: 'What is the smart home status?' },
};

function activeAgents(cfg: AgentConfig): string[] {
  const ids: string[] = [];
  if (cfg.google.emailEnabled    && cfg.google.emailNotificationsEnabled    && cfg.google.accessToken)  ids.push('email');
  if (cfg.google.calendarEnabled && cfg.google.calendarNotificationsEnabled && cfg.google.accessToken)  ids.push('calendar');
  if (cfg.github.enabled    && cfg.github.notificationsEnabled    && cfg.github.personalAccessToken)    ids.push('github');
  if (cfg.weather.enabled   && cfg.weather.notificationsEnabled)                                         ids.push('weather');
  if (cfg.news.enabled      && cfg.news.notificationsEnabled)                                            ids.push('news');
  if (cfg.portfolio.enabled && cfg.portfolio.notificationsEnabled && cfg.portfolio.accessToken)         ids.push('portfolio');
  if (cfg.system.notificationsEnabled)                                                                   ids.push('system');
  if (cfg.smarthome.enabled && cfg.smarthome.notificationsEnabled && cfg.smarthome.endpoint)            ids.push('smarthome');
  return ids;
}

// Returns true if the summary content is notification-worthy vs the previous summary
function isNotifiable(agentId: string, current: string, prev: string): boolean {
  const cur = current.trim();
  if (!cur || cur === prev.trim()) return false;

  if (agentId === 'system') {
    const cpuM = /CPU usage:\s*([\d.]+)%/.exec(cur);
    const ramM = /RAM:.*\((\d+)% used/.exec(cur);
    const cpu  = cpuM ? parseFloat(cpuM[1]) : 0;
    const ram  = ramM ? parseInt(ramM[1])   : 0;
    return cpu >= 80 || ram >= 85;
  }

  if (agentId === 'email') return !/no unread/i.test(cur);

  if (agentId === 'github') return !/no new notification|0 notification/i.test(cur);

  // All other agents: any text change counts
  return true;
}

const BASE = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:8787';

export function useNotificationPoller(
  agentConfig:   AgentConfig,
  proactiveAsk:  ProactiveAskFn,
  pushFallback:  PushFn,
  wsConnected:   boolean,
) {
  // Keep stable refs so callbacks don't need to be re-created
  const askRef  = useRef(proactiveAsk);
  askRef.current = proactiveAsk;
  const pushRef  = useRef(pushFallback);
  pushRef.current = pushFallback;

  const prevMap   = useRef<Map<string, string>>(new Map());
  const readySet  = useRef<Set<string>>(new Set());
  const timersMap = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const pollOne = useCallback(async (agentId: string, notify: boolean) => {
    try {
      const r = await fetch(`${BASE}/api/notifications/poll?agents=${agentId}`);
      if (!r.ok) return;
      const data: Record<string, { ok: boolean; summary: string }> = await r.json();
      const entry = data[agentId];
      if (!entry?.ok || !entry.summary) return;

      if (notify) {
        const prev = prevMap.current.get(agentId) ?? '';
        if (isNotifiable(agentId, entry.summary, prev)) {
          const tpl = TEMPLATES[agentId];
          if (tpl) {
            askRef.current(tpl.question, agentId, tpl.followUp);
          } else {
            pushRef.current(entry.summary, agentId);
          }
        }
      }
      prevMap.current.set(agentId, entry.summary);
    } catch {
      // silenced — background polls should not surface network errors
    }
  }, []);

  const ids    = activeAgents(agentConfig);
  const idsKey = ids.join(',');

  useEffect(() => {
    if (!wsConnected) return;
    const active = new Set(idsKey ? idsKey.split(',') : []);

    // Stop polling for agents no longer active
    for (const [id, timer] of timersMap.current) {
      if (!active.has(id)) {
        clearInterval(timer);
        timersMap.current.delete(id);
        readySet.current.delete(id);
        prevMap.current.delete(id);
      }
    }

    // Start polling for newly active agents
    for (const id of active) {
      if (timersMap.current.has(id)) continue;
      const interval = INTERVALS[id] ?? 5 * 60_000;
      // First run: capture baseline with no notification
      pollOne(id, false).then(() => readySet.current.add(id));
      const timer = setInterval(() => {
        if (readySet.current.has(id)) pollOne(id, true);
      }, interval);
      timersMap.current.set(id, timer);
    }

    return () => {
      for (const timer of timersMap.current.values()) clearInterval(timer);
      timersMap.current.clear();
      readySet.current.clear();
    };
  }, [idsKey, wsConnected, pollOne]);
}
