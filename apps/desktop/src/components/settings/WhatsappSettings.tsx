import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { WhatsAppCreds, TunnelProvider } from '../../hooks/useAgentConfig';
import { SectionLabel } from './shared';

interface Props {
  config:            WhatsAppCreds;
  onPatch:           (p: Partial<WhatsAppCreds>) => void;
  onVerify:          () => void;
  onCheckTunnel:     () => Promise<boolean>;
  onStartTunnel:     () => void;
  onStopTunnel:      () => void;
}

export function WhatsappSettings({ config, onPatch, onVerify, onCheckTunnel, onStartTunnel, onStopTunnel }: Props) {
  const [showToken, setShowToken] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onCheckTunnel();
  }, []);

  useEffect(() => {
    if (config.tunnelStatus === 'starting') {
      pollingRef.current = setInterval(async () => {
        const active = await onCheckTunnel();
        if (active) clearInterval(pollingRef.current!);
      }, 3000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [config.tunnelStatus]);

  const tunnelBusy = config.tunnelStatus === 'starting';
  const tunnelActive = config.tunnelStatus === 'active';

  return (
    <div className="space-y-5">
      {/* Credentials */}
      <section className="space-y-3">
        <SectionLabel>Meta Cloud API</SectionLabel>

        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-wide">Phone Number ID</label>
          <input
            type="text"
            value={config.phoneNumberId}
            onChange={(e) => onPatch({ phoneNumberId: e.target.value })}
            placeholder="123456789012345"
            className="w-full h-9 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/35 transition"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-slate-500 uppercase tracking-wide">Access Token</label>
            <button
              onClick={() => setShowToken(!showToken)}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition"
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            type={showToken ? 'text' : 'password'}
            value={config.accessToken}
            onChange={(e) => onPatch({ accessToken: e.target.value })}
            placeholder="EAAxxxxx..."
            className="w-full h-9 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/35 transition"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-wide">Webhook Verify Token</label>
          <input
            type="text"
            value={config.webhookVerifyToken}
            onChange={(e) => onPatch({ webhookVerifyToken: e.target.value })}
            placeholder="robo-whatsapp-verify"
            className="w-full h-9 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/35 transition"
          />
          <p className="text-[10px] text-slate-600">
            Set this same value in Meta → Configuration → Webhook → Verify Token.
          </p>
        </div>

        {/* Status + Test button */}
        <div className="flex items-center gap-2">
          <button
            onClick={onVerify}
            disabled={!config.phoneNumberId || !config.accessToken || config.status === 'verifying'}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-cyan-500/15 border border-cyan-400/25 text-cyan-300 text-xs font-medium hover:bg-cyan-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {config.status === 'verifying'
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Verifying…</>
              : 'Test Connection'}
          </button>
          {config.info && (
            <span className={`text-[11px] truncate ${config.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
              {config.info}
            </span>
          )}
        </div>
      </section>

      {/* Contacts */}
      <section className="space-y-2">
        <SectionLabel>Contacts</SectionLabel>
        <textarea
          value={config.contacts}
          onChange={(e) => onPatch({ contacts: e.target.value })}
          placeholder={'Mom: +919876543210\nJohn: +14155552671'}
          rows={4}
          className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/35 transition resize-none"
        />
        <p className="text-[10px] text-slate-600 leading-relaxed">
          One contact per line: <span className="text-slate-500">Name: +CountryCodeNumber</span>
        </p>
      </section>

      {/* Tunnel */}
      <section className="space-y-3">
        <SectionLabel>Webhook Tunnel (Cloudflare)</SectionLabel>

        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-wide">Custom Domain</label>
          <input
            type="text"
            value={config.customDomain}
            onChange={(e) => onPatch({ customDomain: e.target.value })}
            placeholder={config.envDomain ? `yourdomain.com  (env: ${config.envDomain})` : 'yourdomain.com  (blank = quick tunnel)'}
            className="w-full h-9 rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/35 transition"
          />
          <p className="text-[10px] text-slate-600">
            Leave blank for a temporary trycloudflare.com URL. See{' '}
            <span className="text-slate-400">.cloudflared/whatsapp-config.example.yml</span> for named tunnel setup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!tunnelActive ? (
            <button
              onClick={onStartTunnel}
              disabled={tunnelBusy}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-500/15 border border-green-400/25 text-green-300 text-xs font-medium hover:bg-green-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {tunnelBusy ? <><Loader2 className="h-3 w-3 animate-spin" /> Starting…</> : <><Wifi className="h-3 w-3" /> Start Tunnel</>}
            </button>
          ) : (
            <button
              onClick={onStopTunnel}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/15 border border-red-400/25 text-red-300 text-xs font-medium hover:bg-red-500/25 transition"
            >
              <WifiOff className="h-3 w-3" /> Stop Tunnel
            </button>
          )}
          <button
            onClick={() => onCheckTunnel()}
            className="flex items-center gap-1 h-8 px-2 rounded-lg border border-white/10 text-slate-500 hover:text-slate-300 transition"
            title="Refresh status"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          {config.tunnelStatus !== 'idle' && (
            <span className={`text-[11px] ${
              tunnelActive ? 'text-emerald-400' :
              config.tunnelStatus === 'error' ? 'text-red-400' : 'text-amber-400'
            }`}>
              {tunnelActive ? 'Active' : tunnelBusy ? 'Starting…' : config.tunnelInfo || 'Error'}
            </span>
          )}
        </div>

        {/* Callback URL panel */}
        {tunnelActive && config.callbackUrl && (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/6 p-3 space-y-2">
            <div className="text-[10px] text-emerald-400/80 uppercase tracking-wide">Webhook Callback URL</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] text-emerald-300 break-all">{config.callbackUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(config.callbackUrl)}
                className="flex-shrink-0 text-emerald-400/60 hover:text-emerald-300 transition"
                title="Copy"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              Paste this in Meta → Configuration → Webhook → Callback URL, then click Verify and Save.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
