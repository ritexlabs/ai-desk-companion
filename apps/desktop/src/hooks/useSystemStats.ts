/**
 * Read-only system health monitor using only browser-provided APIs.
 * This hook NEVER modifies any system configuration, permissions, or files.
 * All data is passively observed from the browser runtime.
 */

import { useCallback, useEffect, useState } from 'react';

export interface BatteryStats {
  level: number;       // 0–100
  charging: boolean;
  minutesLeft: number | null;   // null = unknown or infinite
}

export interface SystemStats {
  os: string;
  cores: number;
  deviceMemoryGB: number | null;  // navigator.deviceMemory (Chrome, rounded)
  jsHeap: { usedMB: number; totalMB: number; limitMB: number } | null;
  battery: BatteryStats | null;
  online: boolean;
  connectionType: string | null;  // '4g' | 'wifi' | etc.
  screenResolution: string;
  pixelRatio: number;
  appUptimeSec: number;
  healthScore: number;   // 0–100 composite (rough estimate)
}

/* ── Extended browser interfaces (non-standard / draft APIs) ────── */

interface NavigatorExtended extends Navigator {
  userAgentData?: { platform?: string };
  deviceMemory?: number;
  connection?: { effectiveType?: string; type?: string };
  getBattery?(): Promise<BatteryManager>;
}

interface BatteryManager {
  level: number;
  charging: boolean;
  dischargingTime: number;
  chargingTime: number;
  addEventListener(event: string, handler: () => void): void;
}

interface PerformanceExtended extends Performance {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
}

const nav = navigator as NavigatorExtended;
const perf = performance as PerformanceExtended;

/* ── OS detection ───────────────────────────────────────────────── */

function detectOS(): string {
  if (nav.userAgentData?.platform) {
    const p = nav.userAgentData.platform;
    if (/mac/i.test(p))              return 'macOS';
    if (/win/i.test(p))              return 'Windows';
    if (/linux/i.test(p))            return 'Linux';
    if (/android/i.test(p))          return 'Android';
    if (/ios|iphone|ipad/i.test(p))  return 'iOS';
    return p;
  }
  const ua = navigator.userAgent;
  if (/Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) return 'macOS';
  if (/iPhone|iPad/i.test(ua))  return 'iOS';
  if (/Android/i.test(ua))      return 'Android';
  if (/Windows NT/i.test(ua))   return 'Windows';
  if (/Linux/i.test(ua))        return 'Linux';
  return 'Unknown OS';
}

/* ── Helpers ────────────────────────────────────────────────────── */

function getJSHeap() {
  const m = perf.memory;
  if (!m) return null;
  return {
    usedMB:  Math.round(m.usedJSHeapSize  / 1_048_576),
    totalMB: Math.round(m.totalJSHeapSize / 1_048_576),
    limitMB: Math.round(m.jsHeapSizeLimit / 1_048_576),
  };
}

function getConnection(): string | null {
  const c = nav.connection;
  if (!c) return null;
  return c.effectiveType ?? c.type ?? null;
}

function computeHealthScore(stats: Omit<SystemStats, 'healthScore'>): number {
  let score = 100;
  if (!stats.online) score -= 30;
  if (stats.battery && !stats.battery.charging && stats.battery.level < 20) score -= 20;
  if (stats.battery && !stats.battery.charging && stats.battery.level < 10) score -= 20;
  if (stats.jsHeap) {
    const ratio = stats.jsHeap.usedMB / (stats.jsHeap.limitMB || 1);
    if (ratio > 0.8) score -= 20;
    else if (ratio > 0.6) score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}

const PAGE_START = performance.now();

function buildInitial(): SystemStats {
  const base: Omit<SystemStats, 'healthScore'> = {
    os: detectOS(),
    cores: navigator.hardwareConcurrency ?? 0,
    deviceMemoryGB: nav.deviceMemory ?? null,
    jsHeap: getJSHeap(),
    battery: null,
    online: navigator.onLine,
    connectionType: getConnection(),
    screenResolution: `${screen.width}×${screen.height}`,
    pixelRatio: window.devicePixelRatio ?? 1,
    appUptimeSec: 0,
  };
  return { ...base, healthScore: computeHealthScore(base) };
}

/* ── Hook ───────────────────────────────────────────────────────── */

export function useSystemStats(): SystemStats {
  const [stats, setStats] = useState<SystemStats>(buildInitial);

  const refresh = useCallback(() => {
    setStats((prev) => {
      const next: Omit<SystemStats, 'healthScore'> = {
        ...prev,
        jsHeap: getJSHeap(),
        online: navigator.onLine,
        connectionType: getConnection(),
        appUptimeSec: Math.round((performance.now() - PAGE_START) / 1000),
      };
      return { ...next, healthScore: computeHealthScore(next) };
    });
  }, []);

  // Battery API — passive listeners only, never writes
  useEffect(() => {
    if (!nav.getBattery) return;
    let mounted = true;

    nav.getBattery().then((bat) => {
      if (!mounted) return;

      const update = () => {
        if (!mounted) return;
        const minutesLeft =
          bat.charging
            ? bat.chargingTime   === Infinity ? null : Math.round(bat.chargingTime   / 60)
            : bat.dischargingTime === Infinity ? null : Math.round(bat.dischargingTime / 60);
        setStats((prev) => {
          const next = { ...prev, battery: { level: Math.round(bat.level * 100), charging: bat.charging, minutesLeft } };
          return { ...next, healthScore: computeHealthScore(next) };
        });
      };

      update();
      bat.addEventListener('levelchange',   update);
      bat.addEventListener('chargingchange', update);
    });

    return () => { mounted = false; };
  }, []);

  // Network events
  useEffect(() => {
    const goOnline  = () => setStats((p) => { const n = { ...p, online: true  }; return { ...n, healthScore: computeHealthScore(n) }; });
    const goOffline = () => setStats((p) => { const n = { ...p, online: false }; return { ...n, healthScore: computeHealthScore(n) }; });
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Periodic refresh every 30 s
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return stats;
}

/* ── TTS summary ────────────────────────────────────────────────── */

export function systemHealthSummary(stats: SystemStats): string {
  const parts: string[] = [];
  parts.push(`Running on ${stats.os} with ${stats.cores} processor core${stats.cores !== 1 ? 's' : ''}.`);
  if (stats.deviceMemoryGB != null) {
    parts.push(`Device has approximately ${stats.deviceMemoryGB} gigabytes of memory.`);
  }
  if (stats.battery) {
    const b = stats.battery;
    const timeStr = b.minutesLeft != null
      ? `, about ${b.minutesLeft} minutes ${b.charging ? 'until full' : 'remaining'}`
      : '';
    parts.push(`Battery at ${b.level} percent${b.charging ? ', currently charging' : ', not charging'}${timeStr}.`);
  }
  parts.push(`Network is ${stats.online ? 'online' : 'offline'}${stats.connectionType ? ` via ${stats.connectionType}` : ''}.`);
  parts.push(`System health score is ${stats.healthScore} out of 100.`);
  return parts.join(' ');
}
