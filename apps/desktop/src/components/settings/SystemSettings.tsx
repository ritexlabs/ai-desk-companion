import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? 'http://localhost:8788';

interface MetricDef {
  id:          string;
  label:       string;
  description: string;
  elevated?:   boolean;
}

const METRICS: MetricDef[] = [
  {
    id:          'net_io',
    label:       'Network I/O',
    description: 'Live upload / download rate calculated between successive calls.',
  },
  {
    id:          'load_avg',
    label:       'Load Average',
    description: '1-min / 5-min / 15-min system load averages.',
  },
  {
    id:          'cpu_freq',
    label:       'CPU Frequency',
    description: 'Current CPU clock speed in MHz.',
  },
  {
    id:          'top_processes',
    label:       'Top Processes',
    description: 'Top 5 processes by CPU usage — name, PID, CPU %, and memory.',
    elevated:    true,
  },
  {
    id:          'disk_io',
    label:       'Disk I/O',
    description: 'Read / write rate. May require elevated permissions on macOS.',
    elevated:    true,
  },
  {
    id:          'temperature',
    label:       'CPU Temperature',
    description: 'Requires osx-cpu-temp CLI on macOS (brew install osx-cpu-temp) or psutil sensors on Linux.',
    elevated:    true,
  },
];

const DEFAULT_DISABLED = new Set(['temperature', 'disk_io', 'top_processes']);

export function SystemSettings() {
  const [disabled, setDisabled] = useState<Set<string>>(DEFAULT_DISABLED);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    fetch(`${GATEWAY_URL}/api/system/config`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { disabled_metrics: string[] }) => setDisabled(new Set(data.disabled_metrics)))
      .catch(() => { /* keep defaults */ })
      .finally(() => setLoading(false));
  }, []);

  async function toggleMetric(id: string) {
    const prev = new Set(disabled);
    const next  = new Set(disabled);
    next.has(id) ? next.delete(id) : next.add(id);
    setDisabled(next);
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${GATEWAY_URL}/api/system/config`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ disabled_metrics: Array.from(next) }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setError('Failed to save — is the gateway running?');
      setDisabled(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pt-1">
      <div className="rounded-xl border border-teal-400/25 bg-teal-400/6 px-4 py-3 text-sm text-teal-300">
        Control which system metrics are collected. Metrics marked{' '}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider bg-white/8 text-slate-400">elevated</span>
        {' '}may need elevated permissions or optional CLI tools — disabled by default.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading config…
        </div>
      ) : (
        <div className="space-y-1">
          {METRICS.map((m) => {
            const enabled = !disabled.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggleMetric(m.id)}
                disabled={saving}
                className="w-full flex items-start gap-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/5 px-4 py-3 text-left transition-colors disabled:opacity-50"
              >
                {/* Mini toggle */}
                <div className={`mt-0.5 flex-shrink-0 w-8 h-4 rounded-full transition-colors relative ${enabled ? 'bg-teal-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${enabled ? 'left-4' : 'left-0.5'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{m.label}</span>
                    {m.elevated && (
                      <span className="text-[9px] uppercase tracking-wider bg-white/8 text-slate-500 px-1.5 py-0.5 rounded">
                        elevated
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">{m.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
        <p className="font-medium text-slate-400">Always-on metrics:</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Date &amp; time with timezone</li>
          <li>System uptime</li>
          <li>CPU usage (overall &amp; per-core)</li>
          <li>RAM &amp; swap</li>
          <li>Disk space</li>
          <li>Battery (when available)</li>
        </ul>
      </div>
    </div>
  );
}
