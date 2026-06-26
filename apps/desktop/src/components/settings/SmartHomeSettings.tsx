import type { AgentConfig } from '../../hooks/useAgentConfig';
import { TokenField } from './shared';

type SmartHomeConfig = AgentConfig['smarthome'];

interface Props {
  config: SmartHomeConfig;
  onPatch: (p: Partial<SmartHomeConfig>) => void;
  onVerify: () => void;
}

export function SmartHomeSettings({ config, onPatch, onVerify }: Props) {
  return (
    <div className="space-y-3 pt-1">
      <div className="rounded-xl border border-orange-400/25 bg-orange-400/6 px-4 py-3 text-sm text-orange-300">
        Connects to your <span className="font-semibold">Home Assistant</span> unified smart home hub to control lights, climate, switches, scenes, and more.
      </div>

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
          Default: <span className="text-slate-400">http://homeassistant.local:8123</span>. Use your Home Assistant URL or IP address.
        </p>
      </div>

      <TokenField
        label="Long-Lived Access Token"
        value={config.token}
        placeholder="eyJ…"
        onChange={(v) => onPatch({ token: v, status: 'idle', info: '' })}
      />

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

      <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5">
        <p className="text-[10px] text-slate-400 font-medium">How to get a token (2 min):</p>
        <ol className="text-[10px] text-slate-500 space-y-1 list-decimal list-inside leading-relaxed">
          <li>Open Home Assistant → click your profile (bottom-left avatar)</li>
          <li>Scroll to "Long-lived access tokens" → Create Token</li>
          <li>Give it a name (e.g. "Robo") → OK → copy the token above</li>
        </ol>
      </div>

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
