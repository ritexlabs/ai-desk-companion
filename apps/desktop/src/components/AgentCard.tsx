import type { AgentDefinition } from '../types/runtime';

export function AgentCard({
  agent,
  active,
  onRoute
}: {
  agent: AgentDefinition;
  active: boolean;
  onRoute: (text: string) => void;
}) {
  const statusClass = {
    offline: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
    starting: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
    online: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    degraded: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    failed: 'bg-red-500/15 text-red-300 border-red-500/20'
  }[agent.status];

  return (
    <div className={`rounded-3xl border ${active ? 'border-cyan-300/40' : 'border-white/10'} bg-white/5 p-5 backdrop-blur-xl`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm uppercase tracking-[0.25em] text-slate-400">Agent</div>
          <div className="mt-1 text-lg font-semibold">{agent.label}</div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${statusClass}`}>{agent.status}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{agent.description}</p>
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
        <span className="text-slate-500">Example:</span>
        <br />
        {agent.example}
      </div>
      <button
        className="mt-4 h-10 w-full rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-100 transition hover:bg-white/10"
        onClick={() => onRoute(agent.example)}
      >
        Route to this agent
      </button>
    </div>
  );
}
