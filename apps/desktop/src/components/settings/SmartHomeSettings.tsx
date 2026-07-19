import { useEffect, useState } from 'react';
import { Container, ExternalLink, Globe, Loader2, Server } from 'lucide-react';
import type { AgentConfig } from '../../hooks/useAgentConfig';
import { TokenField } from './shared';

type SmartHomeConfig = AgentConfig['smarthome'];

interface Props {
  config:   SmartHomeConfig;
  onPatch:  (p: Partial<SmartHomeConfig>) => void;
  onVerify: () => void;
}

const LOCAL_ENDPOINT = 'http://localhost:8123';
const BACKEND        = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');

function HALink({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-white/5 transition-colors group"
    >
      <span className="text-[11px] text-slate-400 group-hover:text-slate-200 transition-colors">{label}</span>
      <span className="flex items-center gap-1 text-[10px] font-mono text-orange-400/70 group-hover:text-orange-300 transition-colors truncate max-w-[180px]">
        {url}
        <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
      </span>
    </a>
  );
}

function observerUrl(haEndpoint: string): string {
  try {
    const u = new URL(haEndpoint);
    u.port     = '4357';
    u.pathname = '/';
    return u.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

type DockerOp = 'idle' | 'starting' | 'stopping';

export function SmartHomeSettings({ config, onPatch, onVerify }: Props) {
  const mode     = config.mode ?? 'remote';
  const endpoint = mode === 'local' ? LOCAL_ENDPOINT : (config.endpoint || '').trim();

  const [dockerOp, setDockerOp] = useState<DockerOp>('idle');

  // Sync the persisted mode file → UI on first open
  useEffect(() => {
    fetch(`${BACKEND}/api/smarthome/docker/mode`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.mode && data.mode !== mode) {
          if (data.mode === 'local') {
            onPatch({ mode: 'local', endpoint: LOCAL_ENDPOINT });
          } else {
            onPatch({ mode: 'remote' });
          }
        }
      })
      .catch(() => { /* orchestrator not running — ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchMode(next: 'local' | 'remote') {
    if (next === mode) return;

    if (next === 'local') {
      // Update UI immediately, then wait for container start before auto-verifying
      onPatch({ mode: 'local', endpoint: LOCAL_ENDPOINT, status: 'idle', info: '' });
      setDockerOp('starting');
      try {
        await fetch(`${BACKEND}/api/smarthome/docker/start`, { method: 'POST' });
        // Auto-trigger connection test once container is up (token already in localStorage)
        if (config.token) onVerify();
      } catch { /* Docker unavailable — user can test manually */ }
      setDockerOp('idle');
    } else {
      // Switch UI immediately — stop container silently in background (no spinner)
      const prev = config.endpoint === LOCAL_ENDPOINT ? '' : config.endpoint;
      onPatch({ mode: 'remote', endpoint: prev, status: 'idle', info: '' });
      fetch(`${BACKEND}/api/smarthome/docker/stop`, { method: 'POST' }).catch(() => {});
    }
  }

  // Only show busy state when starting (stop is fire-and-forget)
  const dockerBusy = dockerOp === 'starting';

  return (
    <div className="space-y-3 pt-1">

      {/* ── Description ── */}
      <div className="rounded-xl border border-orange-400/25 bg-orange-400/6 px-4 py-3 text-sm text-orange-300">
        Connects to your <span className="font-semibold">Home Assistant</span> unified smart home hub to control lights, climate, switches, scenes, and more.
      </div>

      {/* ── Mode toggle ── */}
      <div>
        <div className="text-xs text-slate-400 mb-2">Home Assistant Setup</div>
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/30 border border-white/8">
          <button
            onClick={() => switchMode('local')}
            disabled={dockerBusy}
            className={`flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
              mode === 'local'
                ? 'bg-orange-500/20 border border-orange-400/35 text-orange-200'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            <Container className="h-3 w-3 flex-shrink-0" />
            Local Docker
          </button>
          <button
            onClick={() => switchMode('remote')}
            disabled={dockerBusy}
            className={`flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
              mode === 'remote'
                ? 'bg-orange-500/20 border border-orange-400/35 text-orange-200'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            <Globe className="h-3 w-3 flex-shrink-0" />
            Self-Hosted
          </button>
        </div>

        {/* Shown only while container is starting (stop is instant/background) */}
        {dockerBusy && (
          <div className="mt-2 flex items-center gap-1.5 px-1">
            <Loader2 className="h-3 w-3 text-orange-400 animate-spin flex-shrink-0" />
            <span className="text-[10px] text-orange-400">
              Starting Home Assistant container — please wait…
            </span>
          </div>
        )}
      </div>

      {/* ── Local Docker panel ── */}
      {mode === 'local' && (
        <div className="rounded-xl border border-orange-400/15 bg-orange-400/4 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <Server className="h-3 w-3 text-orange-400 flex-shrink-0" />
            <span className="text-[11px] text-slate-400">Running via <span className="font-semibold text-orange-300">apps/smarthome/docker-compose.yml</span></span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-black/30 border border-white/8 px-3 py-2">
            <span className="text-[10px] text-slate-500">Endpoint</span>
            <span className="text-[11px] font-mono text-orange-300">{LOCAL_ENDPOINT}</span>
          </div>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Container starts and stops with the mode toggle.
            Your configuration persists in <span className="text-slate-400">apps/smarthome/ha-config/</span> across restarts.
          </p>
        </div>
      )}

      {/* ── Remote / Self-hosted endpoint input ── */}
      {mode === 'remote' && (
        <div>
          <div className="text-xs text-slate-400 mb-1">Home Assistant URL</div>
          <input
            type="url"
            value={config.endpoint}
            onChange={(e) => onPatch({ endpoint: e.target.value, status: 'idle', info: '' })}
            placeholder="http://homeassistant.local:8123"
            className="w-full h-9 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-orange-400/35 transition-colors font-mono text-xs"
          />
          <p className="mt-1 text-[10px] text-slate-600">
            Your HA URL or IP — e.g. <span className="text-slate-400">http://192.168.0.128:8123</span> or <span className="text-slate-400">http://homeassistant.local:8123</span>
          </p>
        </div>
      )}

      {/* ── Token (shared by both modes) ── */}
      <TokenField
        label="Long-Lived Access Token"
        value={config.token}
        placeholder="eyJ…"
        onChange={(v) => onPatch({ token: v, status: 'idle', info: '' })}
      />

      {/* ── Actions ── */}
      <button
        onClick={onVerify}
        disabled={!config.token || config.status === 'verifying'}
        className="w-full h-9 rounded-xl bg-orange-500/15 border border-orange-400/30 text-orange-300 text-sm font-medium hover:bg-orange-500/25 disabled:opacity-40 transition"
      >
        {config.status === 'verifying' ? 'Connecting…' : 'Test Connection'}
      </button>

      {config.status === 'connected' && (
        <button
          onClick={() => onPatch({ token: '', status: 'idle', info: '' })}
          className="w-full h-9 rounded-xl border border-red-400/30 bg-red-400/8 text-red-400 text-sm hover:bg-red-400/15 transition"
        >
          Disconnect
        </button>
      )}

      {/* ── Quick Access URLs ── */}
      {endpoint && (
        <div className="rounded-xl border border-white/6 bg-white/2 px-1 py-1.5 space-y-0.5">
          <p className="text-[10px] text-slate-500 font-medium px-2 pb-0.5">Quick Access</p>
          <HALink label="Home Assistant" url={endpoint.replace(/\/$/, '') + '/'} />
          <HALink label="System Info"    url={endpoint.replace(/\/$/, '') + '/config/info'} />
          {/* Observer (port 4357) only exists on HAOS / Supervised — not on HA Container */}
          {mode === 'remote' && observerUrl(endpoint) && (
            <HALink label="HA Observer" url={observerUrl(endpoint)} />
          )}
        </div>
      )}

      {/* ── How to get a token ── */}
      <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5">
        <p className="text-[10px] text-slate-400 font-medium">How to get a token (2 min):</p>
        <ol className="text-[10px] text-slate-500 space-y-1 list-decimal list-inside leading-relaxed">
          <li>Open Home Assistant → click your profile (bottom-left avatar)</li>
          <li>Scroll to "Long-lived access tokens" → Create Token</li>
          <li>Give it a name (e.g. "Robo") → OK → copy the token above</li>
        </ol>
      </div>

      {/* ── Voice examples ── */}
      <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
        <p className="font-medium text-slate-400">Voice command examples:</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Turn on the living room lights</li>
          <li>Set bedroom brightness to 40%</li>
          <li>Make the lights blue</li>
          <li>Set thermostat to 22 degrees</li>
          <li>Activate movie scene</li>
          <li>Turn off all switches</li>
        </ul>
      </div>
    </div>
  );
}
