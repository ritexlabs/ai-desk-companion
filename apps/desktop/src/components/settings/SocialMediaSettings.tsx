import { useState } from 'react';
import { Play, Camera, Plus, Trash2, Bell, BellOff, ChevronDown, ChevronUp, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { SocialAccount, SocialMediaCreds } from '../../hooks/useAgentConfig';
import type { YouTubeDiscovery } from '../../hooks/agentVerify';
import { SectionLabel, TokenField } from './shared';
import { AgentToggle } from './AgentAccordion';

interface Props {
  config:           SocialMediaCreds;
  onPatch:          (p: Partial<SocialMediaCreds>) => void;
  onVerify:         () => void;
  onConnectYoutube: (loginHint?: string) => Promise<YouTubeDiscovery | null>;
}

// ── YouTube OAuth account card (read-only) ─────────────────────────

function YouTubeAccountCard({
  account,
  onUpdate,
  onRemove,
  onReconnect,
}: {
  account:     SocialAccount;
  onUpdate:    (p: Partial<SocialAccount>) => void;
  onRemove:    () => void;
  onReconnect: () => void;
}) {
  const isExpired = account.tokenExpiresAt > 0 && Date.now() >= account.tokenExpiresAt;

  return (
    <div className={`rounded-xl border overflow-hidden ${isExpired ? 'border-yellow-400/25 bg-yellow-400/4' : 'border-red-400/20 bg-red-400/5'}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-red-400/12 border border-red-400/25">
          <Play className="h-3.5 w-3.5 text-red-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white truncate">{account.label}</p>
          {account.googleEmail && (
            <p className="text-[10px] text-slate-500 truncate">{account.googleEmail}</p>
          )}
        </div>

        {isExpired && (
          <button
            onClick={onReconnect}
            title="Token expired — reconnect"
            className="flex items-center gap-1 text-[10px] text-yellow-400 hover:text-yellow-300 transition px-1.5 py-0.5 rounded-lg border border-yellow-400/30 bg-yellow-400/8"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Reconnect
          </button>
        )}

        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-red-400/12 border border-red-400/25 text-red-400 shrink-0">YouTube</span>

        <AgentToggle enabled={account.enabled} onToggle={() => onUpdate({ enabled: !account.enabled })} />

        <button
          onClick={onRemove}
          className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-red-400 transition"
          title="Remove channel"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between px-3 pb-2.5 pt-0 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          {account.notificationsEnabled
            ? <Bell className="h-3 w-3 text-red-400" />
            : <BellOff className="h-3 w-3" />}
          Notifications
        </div>
        <AgentToggle
          enabled={account.notificationsEnabled}
          onToggle={() => onUpdate({ notificationsEnabled: !account.notificationsEnabled })}
        />
      </div>
    </div>
  );
}

// ── Instagram manual account card ──────────────────────────────────

function InstagramAccountCard({
  account,
  onUpdate,
  onRemove,
}: {
  account:  SocialAccount;
  onUpdate: (p: Partial<SocialAccount>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(!account.token);

  return (
    <div className="rounded-xl border border-pink-400/20 bg-pink-400/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-pink-400/12 border border-pink-400/25">
          <Camera className="h-3.5 w-3.5 text-pink-400" />
        </div>

        <input
          value={account.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Instagram account name"
          className="flex-1 bg-transparent text-[12px] font-medium text-white placeholder-slate-600 outline-none min-w-0"
        />

        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-pink-400/12 border border-pink-400/25 text-pink-400 shrink-0">Instagram</span>

        <AgentToggle enabled={account.enabled} onToggle={() => onUpdate({ enabled: !account.enabled })} />

        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-300 transition"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onRemove}
          className="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-red-400 transition"
          title="Remove account"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5">
          <TokenField
            label="Long-lived Access Token"
            value={account.token}
            placeholder="EAAxxxx…"
            onChange={(v) => onUpdate({ token: v })}
          />
          <p className="text-[9px] text-slate-600 -mt-1">From Meta Developer → Graph API Explorer with <code className="text-slate-400">instagram_basic</code> + <code className="text-slate-400">pages_read_engagement</code></p>

          <TokenField
            label="Page / User ID"
            value={account.channelId}
            placeholder="17841xxxxxxxxxx"
            onChange={(v) => onUpdate({ channelId: v })}
          />
          <p className="text-[9px] text-slate-600 -mt-1">Instagram Business account ID from Meta Developer → Instagram section</p>

          <div className="flex items-center justify-between pt-0.5">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              {account.notificationsEnabled ? <Bell className="h-3 w-3 text-pink-400" /> : <BellOff className="h-3 w-3" />}
              Notifications
            </div>
            <AgentToggle
              enabled={account.notificationsEnabled}
              onToggle={() => onUpdate({ notificationsEnabled: !account.notificationsEnabled })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Channel picker (shown after OAuth discovery) ───────────────────

function ChannelPicker({
  discovery,
  existingChannelIds,
  onAdd,
  onAddManual,
  onCancel,
}: {
  discovery:          YouTubeDiscovery;
  existingChannelIds: Set<string>;
  onAdd:              (selected: Set<string>) => void;
  onAddManual:        (channelId: string, label: string) => void;
  onCancel:           () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(discovery.channels.filter((c) => !existingChannelIds.has(c.channelId)).map((c) => c.channelId)),
  );
  const [manualId,    setManualId]    = useState('');
  const [manualLabel, setManualLabel] = useState('');

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Empty state: no channels returned by the API ──
  if (discovery.channels.length === 0) {
    return (
      <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 px-3 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-white">Signed in as {discovery.googleEmail}</span>
        </div>

        <p className="text-[11px] font-medium text-amber-300">No YouTube channels found on this account.</p>

        <div className="rounded-lg border border-white/6 bg-white/2 px-2.5 py-2 text-[10px] text-slate-400 space-y-1">
          <p className="font-medium text-slate-300">Possible reasons:</p>
          <ul className="list-disc pl-3.5 space-y-0.5">
            <li>This Google account has no YouTube channel yet — sign in at <span className="text-amber-300 font-medium">youtube.com</span> with this email and create one first</li>
            <li><span className="text-amber-300 font-medium">YouTube Data API v3</span> is not enabled in your Google Cloud project — go to APIs &amp; Services → Library and enable it</li>
            <li>The channel is under a <span className="text-amber-300 font-medium">Brand Account</span> — these aren't returned by the standard API call</li>
          </ul>
        </div>

        <div className="pt-0.5 space-y-2">
          <p className="text-[10px] text-slate-500">Or paste your Channel ID manually (the OAuth token will still be used):</p>
          <input
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            placeholder="Channel name (e.g. Ritex Labs)"
            className="w-full h-8 rounded-lg border border-white/8 bg-white/4 px-2.5 text-[11px] text-white placeholder-slate-600 outline-none focus:border-amber-400/40 transition"
          />
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="Channel ID — starts with UC…"
            className="w-full h-8 rounded-lg border border-white/8 bg-white/4 px-2.5 text-[11px] text-white placeholder-slate-600 outline-none focus:border-amber-400/40 transition font-mono"
          />
          <p className="text-[9px] text-slate-600">
            Find it at youtube.com → Your channel → Share → Copy channel ID
          </p>

          <div className="flex gap-2 pt-0.5">
            <button
              onClick={() => onAddManual(manualId.trim(), manualLabel.trim() || manualId.trim())}
              disabled={!manualId.trim().startsWith('UC')}
              className="flex-1 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[12px] font-medium hover:bg-amber-500/25 disabled:opacity-40 transition"
            >
              Add Channel Manually
            </button>
            <button
              onClick={onCancel}
              className="h-9 px-3 rounded-xl border border-white/10 bg-white/4 text-slate-400 text-[12px] hover:bg-white/8 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal state: channels discovered ──
  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-3 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="text-[11px] font-semibold text-white">Signed in as {discovery.googleEmail}</span>
      </div>

      <p className="text-[10px] text-slate-400">
        {discovery.channels.length} channel{discovery.channels.length !== 1 ? 's' : ''} found.
        Choose which ones to add:
      </p>

      {/* Channel list */}
      <div className="space-y-1.5">
        {discovery.channels.map((ch) => {
          const already   = existingChannelIds.has(ch.channelId);
          const checked   = already || selected.has(ch.channelId);

          return (
            <label
              key={ch.channelId}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition cursor-pointer ${
                already
                  ? 'border-white/6 bg-white/2 opacity-50 cursor-not-allowed'
                  : checked
                    ? 'border-red-400/35 bg-red-400/10'
                    : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
              }`}
            >
              <input
                type="checkbox"
                disabled={already}
                checked={checked}
                onChange={() => !already && toggle(ch.channelId)}
                className="accent-red-400 w-3.5 h-3.5 shrink-0"
              />
              <div className="w-5 h-5 rounded-md bg-red-400/12 border border-red-400/25 flex items-center justify-center shrink-0">
                <Play className="h-2.5 w-2.5 text-red-400" />
              </div>
              <span className="flex-1 text-[12px] font-medium text-white truncate">{ch.label}</span>
              {already && (
                <span className="text-[9px] text-slate-500 shrink-0">Already added</span>
              )}
            </label>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onAdd(selected)}
          disabled={selected.size === 0}
          className="flex-1 h-9 rounded-xl bg-red-500/15 border border-red-400/30 text-red-300 text-[12px] font-medium hover:bg-red-500/25 disabled:opacity-40 transition"
        >
          Add {selected.size} Channel{selected.size !== 1 ? 's' : ''}
        </button>
        <button
          onClick={onCancel}
          className="h-9 px-3 rounded-xl border border-white/10 bg-white/4 text-slate-400 text-[12px] hover:bg-white/8 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────

export function SocialMediaSettings({ config, onPatch, onVerify, onConnectYoutube }: Props) {
  const [discovery,   setDiscovery]   = useState<YouTubeDiscovery | null>(null);
  const [connecting,  setConnecting]  = useState(false);
  const [loginHint,   setLoginHint]   = useState('');

  const patchAccount = (id: string, p: Partial<SocialAccount>) =>
    onPatch({ accounts: config.accounts.map((a) => (a.id === id ? { ...a, ...p } : a)) });

  const removeAccount = (id: string) =>
    onPatch({ accounts: config.accounts.filter((a) => a.id !== id) });

  const addInstagram = () => {
    const n = config.accounts.filter((a) => a.platform === 'instagram').length + 1;
    onPatch({
      accounts: [
        ...config.accounts,
        {
          id: Math.random().toString(36).slice(2, 10),
          platform: 'instagram',
          label: `Instagram ${n}`,
          token: '',
          channelId: '',
          enabled: true,
          notificationsEnabled: true,
          refreshToken: '',
          tokenExpiresAt: 0,
          googleEmail: '',
        },
      ],
    });
  };

  const handleConnectYoutube = async () => {
    setConnecting(true);
    const result = await onConnectYoutube(loginHint.trim() || undefined);
    setConnecting(false);
    if (result) setDiscovery(result);
  };

  const handleAddChannels = (selected: Set<string>) => {
    if (!discovery) return;
    const existingIds = new Set(config.accounts.map((a) => a.channelId));
    const toAdd = discovery.channels
      .filter((ch) => selected.has(ch.channelId) && !existingIds.has(ch.channelId))
      .map((ch) => ({
        id:                   Math.random().toString(36).slice(2, 10),
        platform:             'youtube' as const,
        label:                ch.label,
        token:                discovery.accessToken,
        channelId:            ch.channelId,
        enabled:              true,
        notificationsEnabled: true,
        refreshToken:         discovery.refreshToken,
        tokenExpiresAt:       discovery.tokenExpiresAt,
        googleEmail:          discovery.googleEmail,
      }));
    onPatch({
      accounts: [...config.accounts, ...toAdd],
      status:   'connected',
      info:     `${toAdd.length} YouTube channel${toAdd.length !== 1 ? 's' : ''} connected via OAuth`,
    });
    setDiscovery(null);
  };

  const handleAddManual = (channelId: string, label: string) => {
    if (!discovery) return;
    const existingIds = new Set(config.accounts.map((a) => a.channelId));
    if (existingIds.has(channelId)) return;
    onPatch({
      accounts: [
        ...config.accounts,
        {
          id:                   Math.random().toString(36).slice(2, 10),
          platform:             'youtube' as const,
          label,
          token:                discovery.accessToken,
          channelId,
          enabled:              true,
          notificationsEnabled: true,
          refreshToken:         discovery.refreshToken,
          tokenExpiresAt:       discovery.tokenExpiresAt,
          googleEmail:          discovery.googleEmail,
        },
      ],
      status: 'connected',
      info:   `${label} added — OAuth token active`,
    });
    setDiscovery(null);
  };

  const ytAccounts = config.accounts.filter((a) => a.platform === 'youtube');
  const igAccounts = config.accounts.filter((a) => a.platform === 'instagram');
  const hasAny     = config.accounts.length > 0;
  const canVerify  = config.accounts.some((a) => a.enabled && a.token && a.channelId);

  const existingChannelIds = new Set(config.accounts.filter((a) => a.platform === 'youtube').map((a) => a.channelId));

  return (
    <div className="space-y-4 pt-1">

      {/* ── YouTube OAuth credentials ── */}
      <div className="rounded-xl border border-red-400/20 bg-red-400/4 px-3 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Play className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <span className="text-[12px] font-semibold text-white">YouTube</span>
          <span className="text-[9px] text-slate-500 ml-auto">OAuth 2.0 — no API key needed</span>
        </div>

        <TokenField
          label="Google OAuth Client ID"
          value={config.youtubeClientId}
          placeholder="123456789-abc…apps.googleusercontent.com"
          onChange={(v) => onPatch({ youtubeClientId: v })}
        />
        <TokenField
          label="Google OAuth Client Secret"
          value={config.youtubeClientSecret}
          placeholder="GOCSPX-…"
          onChange={(v) => onPatch({ youtubeClientSecret: v })}
        />

        <p className="text-[9px] text-slate-600 leading-relaxed">
          Create an OAuth 2.0 client in Google Cloud Console → APIs & Services → Credentials. Enable YouTube Data API v3.
          Add <code className="text-slate-400">{window.location.origin}/</code> as an Authorised redirect URI.
          You can share this client with the Google Calendar agent or use a separate one.
        </p>

        {/* Email hint — lets users from any Chrome profile sign in */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500">Google Account Email <span className="text-slate-600">(optional)</span></label>
          <input
            type="email"
            value={loginHint}
            onChange={(e) => setLoginHint(e.target.value)}
            placeholder="you@gmail.com"
            className="w-full h-8 rounded-lg border border-white/8 bg-white/4 px-2.5 text-[11px] text-white placeholder-slate-600 outline-none focus:border-red-400/40 transition"
          />
          <p className="text-[9px] text-slate-600 leading-relaxed">
            If your YouTube account lives in a different Chrome profile, type the email here — Google will open
            a fresh login form for that exact account instead of showing the current browser's account picker.
          </p>
        </div>

        <button
          onClick={handleConnectYoutube}
          disabled={!config.youtubeClientId || connecting || config.status === 'verifying'}
          className="w-full h-9 rounded-xl bg-red-500/15 border border-red-400/30 text-red-300 text-[12px] font-medium hover:bg-red-500/25 disabled:opacity-40 transition flex items-center justify-center gap-2"
        >
          <Plus className="h-3.5 w-3.5" />
          {connecting ? 'Connecting…' : 'Connect Google Account'}
        </button>

        <div className="rounded-lg border border-white/6 bg-white/2 px-2.5 py-2 text-[9px] text-slate-500 space-y-1">
          <p>A Google sign-in popup will open. All channels on the signed-in account are discovered for you to select. Repeat with different emails to add channels from multiple Google accounts.</p>
          <p className="text-amber-400/80">
            Chrome may show a <strong>"Sign in to Chrome?"</strong> banner after you log in — click <strong>No thanks</strong> to skip it. This prevents the account from being added to your current Chrome profile.
          </p>
        </div>
      </div>

      {/* ── Channel picker (post-OAuth) ── */}
      {discovery && (
        <ChannelPicker
          discovery={discovery}
          existingChannelIds={existingChannelIds}
          onAdd={handleAddChannels}
          onAddManual={handleAddManual}
          onCancel={() => setDiscovery(null)}
        />
      )}

      {/* ── Connected YouTube channels ── */}
      {ytAccounts.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>YouTube Channels</SectionLabel>
          {ytAccounts.map((acc) => (
            <YouTubeAccountCard
              key={acc.id}
              account={acc}
              onUpdate={(p) => patchAccount(acc.id, p)}
              onRemove={() => removeAccount(acc.id)}
              onReconnect={handleConnectYoutube}
            />
          ))}
        </div>
      )}

      {/* ── Instagram (manual token) ── */}
      <div className="rounded-xl border border-pink-400/20 bg-pink-400/4 px-3 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="h-3.5 w-3.5 text-pink-400 shrink-0" />
          <span className="text-[12px] font-semibold text-white">Instagram</span>
          <span className="text-[9px] text-slate-500 ml-auto">Long-lived token (90 days)</span>
        </div>

        {igAccounts.length > 0 && (
          <div className="space-y-2">
            {igAccounts.map((acc) => (
              <InstagramAccountCard
                key={acc.id}
                account={acc}
                onUpdate={(p) => patchAccount(acc.id, p)}
                onRemove={() => removeAccount(acc.id)}
              />
            ))}
          </div>
        )}

        <button
          onClick={addInstagram}
          className="w-full h-9 rounded-xl bg-pink-500/15 border border-pink-400/30 text-pink-300 text-[12px] font-medium hover:bg-pink-500/25 transition flex items-center justify-center gap-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Instagram Account
        </button>

        <p className="text-[9px] text-slate-600 leading-relaxed">
          Use a Business or Creator account. Generate a long-lived token via Meta Developer → Graph API Explorer
          with <code className="text-slate-400">instagram_basic</code> and <code className="text-slate-400">pages_read_engagement</code> permissions.
        </p>
      </div>

      {/* ── Global notifications ── */}
      <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3 py-2">
        <div className="flex items-center gap-2">
          {config.notificationsEnabled
            ? <Bell className="h-3.5 w-3.5 text-purple-400" />
            : <BellOff className="h-3.5 w-3.5 text-slate-500" />}
          <div>
            <div className="text-[11px] font-medium text-slate-300">Notifications</div>
            <div className="text-[9px] text-slate-600">New views, subs &amp; likes alerts</div>
          </div>
        </div>
        <AgentToggle
          enabled={config.notificationsEnabled}
          onToggle={() => onPatch({ notificationsEnabled: !config.notificationsEnabled })}
        />
      </div>

      {/* ── Test Connection / Disconnect ── */}
      {hasAny && (
        <div className="space-y-2">
          <button
            onClick={onVerify}
            disabled={config.status === 'verifying' || !canVerify}
            className="w-full h-9 rounded-xl bg-purple-500/15 border border-purple-400/30 text-purple-300 text-sm font-medium hover:bg-purple-500/25 disabled:opacity-40 transition"
          >
            {config.status === 'verifying' ? 'Testing…' : 'Test Connection'}
          </button>

          {config.status === 'connected' && config.info && (
            <p className="text-[10px] text-emerald-400 leading-relaxed px-1">{config.info}</p>
          )}
          {config.status === 'error' && config.info && (
            <p className="text-[10px] text-red-400 leading-relaxed px-1">{config.info}</p>
          )}

          {config.status === 'connected' && (
            <button
              onClick={() => onPatch({ status: 'idle', info: '' })}
              className="w-full h-9 rounded-xl border border-red-400/30 bg-red-400/8 text-red-400 text-sm hover:bg-red-400/15 transition"
            >
              Disconnect All
            </button>
          )}
        </div>
      )}
    </div>
  );
}
