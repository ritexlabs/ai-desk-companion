import type { AgentConfig } from '../../hooks/useAgentConfig';
import { SectionLabel, TokenField } from './shared';
import { AgentToggle } from './AgentAccordion';

type GoogleConfig = AgentConfig['google'];

interface Props {
  config: GoogleConfig;
  onPatch: (p: Partial<GoogleConfig>) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function GoogleSettings({ config, onPatch, onConnect, onDisconnect }: Props) {
  if (config.status === 'connected') {
    return (
      <div className="space-y-3 pt-1">
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-300 text-center">
          Signed in as <strong>{config.connectedEmail}</strong>
        </div>

        <div>
          <SectionLabel>Active Agents</SectionLabel>
          <div className="space-y-2">
            {config.scopes.includes('calendar') && (
              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                <div>
                  <div className="text-xs text-slate-300 font-medium">📅 Calendar Agent</div>
                  <div className="text-[10px] text-slate-500">Meetings, events, schedule</div>
                </div>
                <AgentToggle
                  enabled={config.calendarEnabled}
                  onToggle={() => onPatch({ calendarEnabled: !config.calendarEnabled })}
                />
              </div>
            )}
            {config.scopes.includes('gmail') && (
              <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                <div>
                  <div className="text-xs text-slate-300 font-medium">📧 Email Agent</div>
                  <div className="text-[10px] text-slate-500">Inbox, unread, messages</div>
                </div>
                <AgentToggle
                  enabled={config.emailEnabled}
                  onToggle={() => onPatch({ emailEnabled: !config.emailEnabled })}
                />
              </div>
            )}
          </div>
        </div>

        {config.tokenExpiresAt > 0 && (() => {
          const minsLeft = Math.round((config.tokenExpiresAt - Date.now()) / 60000);
          if (minsLeft < 10) return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/8 px-3 py-2 text-[11px] text-amber-300 text-center">
              {minsLeft <= 0
                ? 'Session expired — please sign in again'
                : `Session expires in ${minsLeft} min — sign in again to refresh`}
            </div>
          );
          return null;
        })()}

        <div>
          <SectionLabel>Active Permissions</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {config.scopes.map((s) => (
              <span key={s} className="rounded-full bg-emerald-400/12 border border-emerald-400/20 px-2.5 py-1 text-[11px] text-emerald-300 capitalize">{s}</span>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onConnect}
            className="flex-1 h-9 rounded-xl border border-[#4285F4]/40 bg-[#4285F4]/12 text-[#7EB3FF] text-sm hover:bg-[#4285F4]/22 transition"
          >
            Re-sign in
          </button>
          <button
            onClick={onDisconnect}
            className="flex-1 h-9 rounded-xl border border-red-400/30 bg-red-400/8 text-red-400 text-sm hover:bg-red-400/15 transition"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      <TokenField
        label="OAuth Client ID"
        value={config.clientId}
        placeholder="xxxxxxxxxx.apps.googleusercontent.com"
        onChange={(v) => onPatch({ clientId: v })}
      />
      <TokenField
        label="OAuth Client Secret"
        value={config.clientSecret}
        placeholder="GOCSPX-…"
        onChange={(v) => onPatch({ clientSecret: v })}
      />

      <div>
        <SectionLabel>Permissions to request</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {(['calendar', 'gmail', 'drive'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                const scopes = config.scopes.includes(s)
                  ? config.scopes.filter((x) => x !== s)
                  : [...config.scopes, s];
                onPatch({ scopes });
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize border transition ${
                config.scopes.includes(s)
                  ? 'border-violet-400/50 bg-violet-400/15 text-violet-300'
                  : 'border-white/10 bg-white/4 text-slate-500 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onConnect}
        disabled={!config.clientId || !config.clientSecret || config.status === 'verifying'}
        className="w-full h-10 rounded-xl bg-[#4285F4]/20 border border-[#4285F4]/40 text-[#7EB3FF] text-sm font-medium hover:bg-[#4285F4]/30 disabled:opacity-40 transition flex items-center justify-center gap-2"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {config.status === 'verifying' ? 'Connecting…' : 'Sign in with Google'}
      </button>

      <div className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 space-y-1.5">
        <p className="text-[10px] text-slate-400 font-medium">One-time setup (free, ~3 min):</p>
        <ol className="text-[10px] text-slate-500 space-y-1 list-decimal list-inside leading-relaxed">
          <li>Go to <span className="text-slate-400">console.cloud.google.com</span></li>
          <li>Create a project → APIs &amp; Services → Credentials</li>
          <li>Create OAuth 2.0 Client ID → type: <strong className="text-slate-400">Web application</strong></li>
          <li>Add authorised redirect URI: <span className="text-slate-400 font-mono">{window.location.origin}/</span></li>
          <li>Copy the Client ID above — <strong className="text-slate-400">no secret needed</strong></li>
        </ol>
      </div>
    </div>
  );
}
