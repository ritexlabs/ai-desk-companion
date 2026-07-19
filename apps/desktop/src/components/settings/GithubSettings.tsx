import { GitBranch } from 'lucide-react';
import type { AgentConfig } from '../../hooks/useAgentConfig';
import { TokenField } from './shared';

type GithubConfig = AgentConfig['github'];

interface Props {
  config: GithubConfig;
  onPatch: (p: Partial<GithubConfig>) => void;
  onVerify: () => void;
  onDisconnect: () => void;
}

export function GithubSettings({ config, onPatch, onVerify, onDisconnect }: Props) {
  if (config.status === 'connected') {
    return (
      <div className="space-y-3 pt-1">
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-emerald-400" />
          <span className="text-sm text-emerald-300">{config.info}</span>
        </div>
        <button
          onClick={onDisconnect}
          className="w-full h-9 rounded-xl border border-red-400/30 bg-red-400/8 text-red-400 text-sm hover:bg-red-400/15 transition"
        >
          Disconnect GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      <TokenField
        label="Personal Access Token"
        value={config.personalAccessToken}
        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
        onChange={(v) => onPatch({ personalAccessToken: v })}
      />
      <button
        onClick={onVerify}
        disabled={!config.personalAccessToken || config.status === 'verifying'}
        className="w-full h-9 rounded-xl bg-slate-700/40 border border-white/15 text-white text-sm font-medium hover:bg-slate-700/60 disabled:opacity-40 transition flex items-center justify-center gap-2"
      >
        <GitBranch className="h-4 w-4" />
        {config.status === 'verifying' ? 'Verifying…' : 'Verify Token'}
      </button>
      <p className="text-[10px] text-slate-600 leading-relaxed">
        Generate at <span className="text-slate-500">github.com/settings/tokens</span>.
        Scopes needed: <span className="text-slate-500">repo, read:user, notifications</span>.
      </p>
    </div>
  );
}
