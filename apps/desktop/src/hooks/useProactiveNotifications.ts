import { useEffect, useRef } from 'react';
import type { AgentConfig } from './useAgentConfig';
import type { NotificationSeverity } from '../types/runtime';

export interface ProactiveNotification {
  text:         string;
  agentId:      string;
  conditionKey: string;
  severity:     NotificationSeverity;
}

/**
 * Polls background data sources and fires `onNotification` when a critical
 * event is detected. Each condition re-fires every 60 s as long as it is still
 * true AND the notification has not been dismissed by the user.
 *
 * `isDismissed(conditionKey)` — supplied by the caller — lets this hook know
 * whether the user already dismissed a given notification so it can respect
 * the snooze and avoid spamming.
 */
export function useProactiveNotifications(
  agentConfig: AgentConfig,
  onNotification: (n: ProactiveNotification) => void,
  isDismissed: (conditionKey: string) => boolean,
) {
  const REPEAT_MS = 60_000;

  const onNotifRef   = useRef(onNotification);
  const isDismissRef = useRef(isDismissed);
  onNotifRef.current   = onNotification;
  isDismissRef.current = isDismissed;

  // Tracks when each condition was last fired so we can enforce the 60-s repeat window
  const lastFiredRef = useRef<Record<string, number>>({});

  function maybeNotify(key: string, n: Omit<ProactiveNotification, 'conditionKey'>) {
    if (isDismissRef.current(key)) return;
    const now  = Date.now();
    const last = lastFiredRef.current[key] ?? 0;
    if (now - last < REPEAT_MS) return;
    lastFiredRef.current[key] = now;
    onNotifRef.current({ ...n, conditionKey: key });
  }

  /* ── Battery (system agent) ─────────────────────────────────────── */
  useEffect(() => {
    if (!agentConfig.system.notificationsEnabled) return;
    if (!('getBattery' in navigator)) return;

    const check = async () => {
      try {
        const bat   = await (navigator as any).getBattery();
        const level = Math.round(bat.level * 100);
        if (level < 20 && !bat.charging) {
          maybeNotify('battery_low', {
            text:     `Battery is at ${level}%. Please connect your charger.`,
            agentId:  'system',
            severity: 'critical',
          });
        }
      } catch { /* getBattery not supported */ }
    };

    check();
    const id = setInterval(check, REPEAT_MS);
    return () => clearInterval(id);
  }, [agentConfig.system.notificationsEnabled]);

  /* ── CPU / RAM / Storage (system agent via MCP gateway) ─────────── */
  useEffect(() => {
    if (!agentConfig.system.notificationsEnabled) return;

    const backendBase = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';

    const check = async () => {
      try {
        const res  = await fetch(`${backendBase}/api/tools/call`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ namespace: 'system', tool: 'get_stats', params: {} }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const cpu: number     = data.result?.cpu_percent    ?? 0;
        const ram: number     = data.result?.ram_percent    ?? 0;
        const disk: number    = data.result?.disk_percent   ?? 0;

        if (cpu > 90)  maybeNotify('cpu_high',  { text: `CPU usage is critically high at ${cpu.toFixed(0)}%.`,  agentId: 'system', severity: 'critical' });
        if (ram > 90)  maybeNotify('ram_high',  { text: `RAM usage is critically high at ${ram.toFixed(0)}%.`,  agentId: 'system', severity: 'critical' });
        if (disk > 90) maybeNotify('disk_high', { text: `Disk usage is critically high at ${disk.toFixed(0)}%. Consider freeing up space.`, agentId: 'system', severity: 'warning' });
      } catch { /* gateway unavailable */ }
    };

    check();
    const id = setInterval(check, REPEAT_MS);
    return () => clearInterval(id);
  }, [agentConfig.system.notificationsEnabled]);

  /* ── New email (Google / email agent) ───────────────────────────── */
  useEffect(() => {
    const { accessToken, emailEnabled, emailNotificationsEnabled } = agentConfig.google;
    if (!accessToken || !emailEnabled || !emailNotificationsEnabled) return;

    let prevCount: number | null = null;

    const check = async () => {
      try {
        const res = await fetch(
          'https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:inbox&maxResults=1',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) return;
        const data  = await res.json();
        const total: number = data.resultSizeEstimate ?? 0;
        if (prevCount !== null && total > prevCount) {
          const diff = total - prevCount;
          maybeNotify('new_email', {
            text:     `You have ${diff} new unread email${diff > 1 ? 's' : ''} in your inbox.`,
            agentId:  'email',
            severity: 'info',
          });
        }
        prevCount = total;
      } catch { /* network error / token expired */ }
    };

    check();
    const id = setInterval(check, 2 * 60_000);
    return () => clearInterval(id);
  }, [agentConfig.google.accessToken, agentConfig.google.emailEnabled, agentConfig.google.emailNotificationsEnabled]);

  /* ── Upcoming calendar events ───────────────────────────────────── */
  useEffect(() => {
    const { accessToken, calendarEnabled, calendarNotificationsEnabled } = agentConfig.google;
    if (!accessToken || !calendarEnabled || !calendarNotificationsEnabled) return;

    const alerted = new Set<string>();

    const check = async () => {
      try {
        const now      = new Date();
        const in15min  = new Date(now.getTime() + 15 * 60_000);
        const params   = new URLSearchParams({
          timeMin:      now.toISOString(),
          timeMax:      in15min.toISOString(),
          singleEvents: 'true',
          maxResults:   '5',
        });
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const event of (data.items ?? [])) {
          const eventId: string = event.id;
          if (alerted.has(eventId)) continue;
          const title: string = event.summary ?? 'Untitled event';
          const start = new Date(event.start?.dateTime ?? event.start?.date ?? '');
          const minsLeft = Math.round((start.getTime() - Date.now()) / 60_000);
          alerted.add(eventId);
          maybeNotify(`calendar_${eventId}`, {
            text:     `Upcoming: "${title}" starts in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}.`,
            agentId:  'calendar',
            severity: 'info',
          });
        }
      } catch { /* network error */ }
    };

    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [agentConfig.google.accessToken, agentConfig.google.calendarEnabled, agentConfig.google.calendarNotificationsEnabled]);

  /* ── GitHub new notifications ────────────────────────────────────── */
  useEffect(() => {
    const { personalAccessToken, notificationsEnabled } = agentConfig.github;
    if (!personalAccessToken || !notificationsEnabled) return;

    let prevCount: number | null = null;

    const check = async () => {
      try {
        const res = await fetch('https://api.github.com/notifications?all=false&per_page=50', {
          headers: {
            Authorization: `Bearer ${personalAccessToken}`,
            Accept:        'application/vnd.github+json',
          },
        });
        if (!res.ok) return;
        const items: any[] = await res.json();
        const count = items.length;
        if (prevCount !== null && count > prevCount) {
          const diff = count - prevCount;
          const first: string = items[0]?.subject?.title ?? 'new activity';
          maybeNotify('github_new', {
            text:     `GitHub: ${diff} new notification${diff > 1 ? 's' : ''} — "${first}"`,
            agentId:  'github',
            severity: 'info',
          });
        }
        prevCount = count;
      } catch { /* network error / bad token */ }
    };

    check();
    const id = setInterval(check, 2 * 60_000);
    return () => clearInterval(id);
  }, [agentConfig.github.personalAccessToken, agentConfig.github.notificationsEnabled]);

  /* ── Stock market — Nifty 50 moves > 5% in a session ────────────── */
  useEffect(() => {
    if (!agentConfig.stock.notificationsEnabled) return;

    const symbol = agentConfig.stock.defaultMarket === 'IN' ? '%5ENSEI' : '%5EGSPC';
    const label  = agentConfig.stock.defaultMarket === 'IN' ? 'Nifty 50' : 'S&P 500';

    const check = async () => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`,
        );
        if (!res.ok) return;
        const data      = await res.json();
        const meta      = data.chart?.result?.[0]?.meta ?? {};
        const prev      = meta.chartPreviousClose as number | undefined;
        const current   = meta.regularMarketPrice as number | undefined;
        if (!prev || !current) return;
        const changePct = ((current - prev) / prev) * 100;
        if (Math.abs(changePct) > 5) {
          const dir = changePct > 0 ? 'up' : 'down';
          maybeNotify(`stock_move_${dir}`, {
            text:     `${label} is ${dir} ${Math.abs(changePct).toFixed(1)}% today (${current.toLocaleString()}).`,
            agentId:  'stock',
            severity: 'warning',
          });
        }
      } catch { /* network error / CORS */ }
    };

    check();
    const id = setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, [agentConfig.stock.notificationsEnabled, agentConfig.stock.defaultMarket]);

  /* ── Breaking news ───────────────────────────────────────────────── */
  useEffect(() => {
    const { apiKey, country, notificationsEnabled } = agentConfig.news;
    if (!apiKey || !notificationsEnabled) return;

    let prevTop: string | null = null;

    const check = async () => {
      try {
        const params   = new URLSearchParams({ token: apiKey, country: country || 'in', lang: 'en', max: '1' });
        const res      = await fetch(`https://gnews.io/api/v4/top-headlines?${params}`);
        if (!res.ok) return;
        const data     = await res.json();
        const topTitle: string | undefined = data.articles?.[0]?.title;
        if (topTitle && prevTop !== null && topTitle !== prevTop) {
          maybeNotify('news_breaking', {
            text:     `Breaking news: ${topTitle}`,
            agentId:  'news',
            severity: 'info',
          });
        }
        if (topTitle) prevTop = topTitle;
      } catch { /* network error */ }
    };

    check();
    const id = setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, [agentConfig.news.apiKey, agentConfig.news.country, agentConfig.news.notificationsEnabled]);

  /* ── Smart home state changes ────────────────────────────────────── */
  useEffect(() => {
    const { endpoint, token, notificationsEnabled } = agentConfig.smarthome;
    if (!token || !notificationsEnabled) return;

    const backendBase  = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
    const prevStates   = new Map<string, string>();

    const check = async () => {
      try {
        const params = new URLSearchParams({ endpoint, token });
        const res    = await fetch(`${backendBase}/api/smarthome/states?${params}`);
        if (!res.ok) return;
        const data   = await res.json();
        const domains: Record<string, { entity_id: string; state: string; attributes: Record<string, unknown> }[]> = data.domains ?? {};

        for (const entities of Object.values(domains)) {
          for (const e of entities) {
            const name   = (e.attributes?.friendly_name as string) || e.entity_id;
            const prev   = prevStates.get(e.entity_id);
            prevStates.set(e.entity_id, e.state);
            if (prev !== undefined && prev !== e.state) {
              const action = e.state === 'on' ? 'turned on' : e.state === 'off' ? 'turned off' : `changed to ${e.state}`;
              maybeNotify(`smarthome_${e.entity_id}`, {
                text:     `Smart home: ${name} has ${action}.`,
                agentId:  'smarthome',
                severity: 'info',
              });
            }
          }
        }
      } catch { /* network error */ }
    };

    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [agentConfig.smarthome.endpoint, agentConfig.smarthome.token, agentConfig.smarthome.notificationsEnabled]);

  /* ── Weather — severe conditions ────────────────────────────────── */
  useEffect(() => {
    const { apiKey, defaultCity, notificationsEnabled } = agentConfig.weather;
    if (!apiKey || !defaultCity || !notificationsEnabled) return;

    const SEVERE_CODES = new Set([200, 201, 202, 210, 211, 212, 221, 230, 231, 232, 300, 301, 302, 310, 311, 312, 313, 314, 321, 502, 503, 504, 522, 531, 602, 611, 612, 613, 615, 616, 622, 771, 781]);

    const check = async () => {
      try {
        const params = new URLSearchParams({ q: defaultCity, appid: apiKey, units: 'metric' });
        const res    = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params}`);
        if (!res.ok) return;
        const data   = await res.json();
        const code: number   = data.weather?.[0]?.id ?? 0;
        const desc: string   = data.weather?.[0]?.description ?? '';
        if (SEVERE_CODES.has(code)) {
          maybeNotify(`weather_severe_${code}`, {
            text:     `Severe weather alert in ${defaultCity}: ${desc}.`,
            agentId:  'weather',
            severity: 'warning',
          });
        }
      } catch { /* network error */ }
    };

    check();
    const id = setInterval(check, 10 * 60_000);
    return () => clearInterval(id);
  }, [agentConfig.weather.apiKey, agentConfig.weather.defaultCity, agentConfig.weather.notificationsEnabled]);
}
