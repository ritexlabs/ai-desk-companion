import { useEffect, useRef } from 'react';
import type { AgentConfig } from './useAgentConfig';

interface ProactiveNotification {
  text: string;
  agentId: string;
}

/**
 * Polls background data sources and fires `onNotification` when a critical
 * event is detected. Each notification fires at most once per crossing
 * (e.g. battery alert won't repeat until level climbs above the threshold
 * and drops below it again).
 *
 * Notifications are always appended to transcript; they are spoken only when
 * the session is active and voice is enabled (that logic lives in pushNotification
 * inside useOrchestratorRuntime).
 */
export function useProactiveNotifications(
  agentConfig: AgentConfig,
  onNotification: (n: ProactiveNotification) => void,
) {
  const batteryAlertedRef      = useRef(false);
  const prevUnreadCountRef     = useRef<number | null>(null);
  const prevNewsTopRef         = useRef<string | null>(null);
  const prevSmartHomeRef       = useRef<Record<string, string>>({});

  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  /* ── Battery (system agent) ─────────────────────────────── */
  useEffect(() => {
    if (!agentConfig.system.notificationsEnabled) return;
    if (!('getBattery' in navigator)) return;

    const check = async () => {
      try {
        const bat = await (navigator as any).getBattery();
        const level = Math.round(bat.level * 100);
        if (level < 20 && !bat.charging) {
          if (!batteryAlertedRef.current) {
            batteryAlertedRef.current = true;
            onNotificationRef.current({
              text: `Warning: battery is at ${level}%. Please connect your charger.`,
              agentId: 'system',
            });
          }
        } else {
          batteryAlertedRef.current = false;
        }
      } catch { /* getBattery not supported */ }
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [agentConfig.system.notificationsEnabled]);

  /* ── New email (Google / email agent) ───────────────────── */
  useEffect(() => {
    const { accessToken, emailEnabled, emailNotificationsEnabled } = agentConfig.google;
    if (!accessToken || !emailEnabled || !emailNotificationsEnabled) return;

    const check = async () => {
      try {
        const res = await fetch(
          'https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:inbox&maxResults=1',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) return;
        const data = await res.json();
        const total: number = data.resultSizeEstimate ?? 0;

        if (prevUnreadCountRef.current !== null && total > prevUnreadCountRef.current) {
          const diff = total - prevUnreadCountRef.current;
          onNotificationRef.current({
            text: `You have ${diff} new unread email${diff > 1 ? 's' : ''} in your inbox.`,
            agentId: 'email',
          });
        }
        prevUnreadCountRef.current = total;
      } catch { /* network error, token expired */ }
    };

    check();
    const id = setInterval(check, 2 * 60_000);
    return () => clearInterval(id);
  }, [agentConfig.google.accessToken, agentConfig.google.emailEnabled, agentConfig.google.emailNotificationsEnabled]);

  /* ── Breaking news ──────────────────────────────────────── */
  useEffect(() => {
    const { apiKey, country, notificationsEnabled } = agentConfig.news;
    if (!apiKey || !notificationsEnabled) return;

    const check = async () => {
      try {
        const params = new URLSearchParams({ token: apiKey, country: country || 'in', lang: 'en', max: '1' });
        const res = await fetch(`https://gnews.io/api/v4/top-headlines?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        const topTitle: string | undefined = data.articles?.[0]?.title;

        if (topTitle && prevNewsTopRef.current !== null && topTitle !== prevNewsTopRef.current) {
          onNotificationRef.current({ text: `Breaking news: ${topTitle}`, agentId: 'news' });
        }
        if (topTitle) prevNewsTopRef.current = topTitle;
      } catch { /* network error */ }
    };

    check();
    const id = setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, [agentConfig.news.apiKey, agentConfig.news.country, agentConfig.news.notificationsEnabled]);

  /* ── Smart home state changes ───────────────────────────── */
  useEffect(() => {
    const { endpoint, token, notificationsEnabled } = agentConfig.smarthome;
    if (!token || !notificationsEnabled) return;

    const backendBase = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');
    const params = new URLSearchParams({ endpoint, token });

    const check = async () => {
      try {
        const res = await fetch(`${backendBase}/api/smarthome/states?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        const domains: Record<string, { entity_id: string; state: string; attributes: Record<string, unknown> }[]> = data.domains ?? {};

        const currentStates: Record<string, string> = {};
        for (const entities of Object.values(domains)) {
          for (const e of entities) {
            const name = (e.attributes?.friendly_name as string) || e.entity_id;
            currentStates[e.entity_id] = e.state;

            const prev = prevSmartHomeRef.current[e.entity_id];
            if (prev !== undefined && prev !== e.state) {
              const domain = e.entity_id.split('.')[0] ?? '';
              const action = e.state === 'on' ? 'turned on' : e.state === 'off' ? 'turned off' : `changed to ${e.state}`;
              onNotificationRef.current({
                text: `Smart home: ${name} has ${action}.`,
                agentId: 'smarthome',
              });
            }
          }
        }
        prevSmartHomeRef.current = currentStates;
      } catch { /* network error */ }
    };

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [agentConfig.smarthome.endpoint, agentConfig.smarthome.token, agentConfig.smarthome.notificationsEnabled]);
}
