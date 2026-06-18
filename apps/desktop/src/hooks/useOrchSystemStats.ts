import { useEffect, useState } from 'react';

export interface OrchSystemStats {
  cpu_pct:     number;
  mem_pct:     number;
  disk_pct:    number;
  cpu_temp_c:  number | null;
  temp_source: 'cpu' | 'battery' | 'none';
}

// Derive HTTP base from the same env var used for the WebSocket URL.
const HTTP_BASE = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787')
  .replace(/^ws(s?)/, 'http$1')
  .replace(/\/ws$/, '');

export function useOrchSystemStats(pollMs = 5000): OrchSystemStats | null {
  const [stats, setStats] = useState<OrchSystemStats | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`${HTTP_BASE}/api/system`);
        if (res.ok && active) setStats(await res.json() as OrchSystemStats);
      } catch {
        // orchestrator offline — silently ignore
      }
    }

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return stats;
}
