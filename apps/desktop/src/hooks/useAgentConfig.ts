/**
 * Agent credential storage.
 *
 * SECURITY CONTRACT
 * -----------------
 * All credentials are stored exclusively in the browser's localStorage under
 * the key `robo-agent-config`. They are NEVER written to any source file,
 * .env file, or sent anywhere other than the specific external API endpoints
 * the user explicitly connects to. localStorage is sandboxed to this origin
 * and cannot be read by other sites or committed to version control.
 *
 * Do NOT add any credential field as a JSX defaultValue, initialise it with
 * a real token, or log it to the console.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  verifyWeather,
  connectGoogle,
  refreshGoogleToken,
  verifyGitHub,
  verifySmartHome,
  verifyNews,
  connectPortfolio,
  refreshPortfolioToken,
  verifySocialMedia,
  connectYouTubeAccount,
  refreshYouTubeAccounts,
} from './agentVerify';

export type ConnectionStatus = 'idle' | 'verifying' | 'connected' | 'error';
export type TunnelProvider   = 'none' | 'cloudflare';
export type TunnelStatus     = 'idle' | 'starting' | 'active' | 'error';

/* ── Per-agent credential shapes ─────────────────────────────────── */

export interface SystemConfig {
  enabled: boolean;
  notificationsEnabled: boolean;
}

export interface WeatherCreds {
  enabled: boolean;
  provider: 'openweathermap' | 'weatherapi';
  apiKey: string;
  defaultCity: string;
  status: ConnectionStatus;
  info: string;
  notificationsEnabled: boolean;
}

export interface GoogleCreds {
  calendarEnabled: boolean;
  emailEnabled: boolean;
  driveEnabled: boolean;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  connectedEmail: string;
  scopes: string[];
  status: ConnectionStatus;
  info: string;
  emailNotificationsEnabled: boolean;
  calendarNotificationsEnabled: boolean;
}

export interface GitHubCreds {
  enabled: boolean;
  personalAccessToken: string;
  username: string;
  status: ConnectionStatus;
  info: string;
  notificationsEnabled: boolean;
}

export interface StockCreds {
  enabled: boolean;
  defaultMarket: 'IN' | 'US';
  spreadsheetId: string;
  spreadsheetName: string;
  status: ConnectionStatus;
  info: string;
  notificationsEnabled: boolean;
}

export interface DhanCreds {
  enabled:      boolean;
  tradeEnabled: boolean;
  status:       ConnectionStatus;
  info:         string;
}

export interface ZerodhaCreds {
  enabled:      boolean;
  tradeEnabled: boolean;
  status:       ConnectionStatus;
  info:         string;
}

export interface NewsCreds {
  enabled: boolean;
  apiKey: string;
  country: string;
  state: string;
  city: string;
  status: ConnectionStatus;
  info: string;
  notificationsEnabled: boolean;
}

export interface SmartHomeCreds {
  enabled:  boolean;
  mode:     'local' | 'remote';
  endpoint: string;
  token:    string;
  status:   ConnectionStatus;
  info:     string;
  notificationsEnabled: boolean;
}

export interface PortfolioCreds {
  enabled:              boolean;
  endpoint:             string;
  clientId:             string;
  clientSecret:         string;
  /** Manual override — skip auto-discovery when set */
  authEndpoint:         string;
  tokenEndpoint:        string;
  accessToken:          string;
  refreshToken:         string;
  tokenExpiresAt:       number;
  connectedAccount:     string;
  status:               ConnectionStatus;
  info:                 string;
  notificationsEnabled: boolean;
}

export interface WhatsAppCreds {
  enabled:              boolean;
  phoneNumberId:        string;
  accessToken:          string;
  webhookVerifyToken:   string;
  contacts:             string;
  status:               ConnectionStatus;
  info:                 string;
  tunnelProvider:       TunnelProvider;
  customDomain:         string;
  /** Runtime-only — not persisted */
  tunnelStatus:         TunnelStatus;
  tunnelInfo:           string;
  callbackUrl:          string;
  /** Domain pre-configured in server .env (CLOUDFLARE_DOMAIN) — read-only */
  envDomain:            string;
  notificationsEnabled: boolean;
}

export interface SocialAccount {
  id:                   string;
  platform:             'youtube' | 'instagram';
  label:                string;
  token:                string;     // YouTube: OAuth access token; Instagram: long-lived token
  channelId:            string;
  enabled:              boolean;
  notificationsEnabled: boolean;
  // YouTube OAuth only — empty/zero for Instagram
  refreshToken:         string;
  tokenExpiresAt:       number;
  googleEmail:          string;     // which Google account owns this channel
}

export interface SocialMediaCreds {
  accounts:             SocialAccount[];
  enabled:              boolean;
  status:               ConnectionStatus;
  info:                 string;
  notificationsEnabled: boolean;
  // Shared Google OAuth app credentials for YouTube connections
  youtubeClientId:      string;
  youtubeClientSecret:  string;
}

export interface NotesCreds {
  notificationsEnabled: boolean;
}

export interface AgentConfig {
  system:       SystemConfig;
  weather:      WeatherCreds;
  google:       GoogleCreds;
  github:       GitHubCreds;
  stock:        StockCreds;
  dhan:         DhanCreds;
  zerodha:      ZerodhaCreds;
  news:         NewsCreds;
  smarthome:    SmartHomeCreds;
  portfolio:    PortfolioCreds;
  whatsapp:     WhatsAppCreds;
  socialmedia:  SocialMediaCreds;
  notes:        NotesCreds;
}

/* ── Defaults — NO real tokens here ─────────────────────────────── */

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  system: {
    enabled: true,
    notificationsEnabled: false,
  },
  smarthome: {
    enabled:  false,
    mode:     'remote',
    endpoint: 'http://homeassistant.local:8123',
    token:    '',
    status:   'idle',
    info:     '',
    notificationsEnabled: false,
  },
  weather: {
    enabled: false,
    provider: 'openweathermap',
    apiKey: '',
    defaultCity: '',
    status: 'idle',
    info: '',
    notificationsEnabled: false,
  },
  google: {
    calendarEnabled: false,
    emailEnabled: false,
    driveEnabled: false,
    clientId: '',
    clientSecret: '',
    accessToken: '',
    refreshToken: '',
    tokenExpiresAt: 0,
    connectedEmail: '',
    scopes: ['calendar', 'gmail', 'drive'],
    status: 'idle',
    info: '',
    emailNotificationsEnabled: false,
    calendarNotificationsEnabled: false,
  },
  github: {
    enabled: false,
    personalAccessToken: '',
    username: '',
    status: 'idle',
    info: '',
    notificationsEnabled: false,
  },
  stock: {
    enabled: false,
    defaultMarket: 'IN',
    spreadsheetId: '',
    spreadsheetName: '',
    status: 'connected',
    info: 'Yahoo Finance (free, no key required)',
    notificationsEnabled: false,
  },
  dhan: {
    enabled:      false,
    tradeEnabled: false,
    status:       'idle',
    info:         '',
  },
  zerodha: {
    enabled:      false,
    tradeEnabled: false,
    status:       'idle',
    info:         '',
  },
  news: {
    enabled: false,
    apiKey: '',
    country: 'in',
    state: '',
    city: '',
    status: 'idle',
    info: '',
    notificationsEnabled: false,
  },
  portfolio: {
    enabled:              false,
    endpoint:             'https://mcp.indmoney.com/mcp',
    clientId:             '',
    clientSecret:         '',
    authEndpoint:         '',
    tokenEndpoint:        '',
    accessToken:          '',
    refreshToken:         '',
    tokenExpiresAt:       0,
    connectedAccount:     '',
    status:               'idle',
    info:                 '',
    notificationsEnabled: false,
  },
  whatsapp: {
    enabled:              false,
    phoneNumberId:        '',
    accessToken:          '',
    webhookVerifyToken:   'robo-whatsapp-verify',
    contacts:             '',
    status:               'idle',
    info:                 '',
    tunnelProvider:       'none',
    customDomain:         '',
    tunnelStatus:         'idle',
    tunnelInfo:           '',
    callbackUrl:          '',
    envDomain:            '',
    notificationsEnabled: false,
  },
  socialmedia: {
    accounts:             [],
    enabled:              false,
    status:               'idle',
    info:                 '',
    notificationsEnabled: true,
    youtubeClientId:      '',
    youtubeClientSecret:  '',
  },
  notes: {
    notificationsEnabled: true,
  },
};

const STORAGE_KEY = 'robo-agent-config';

function toPersist(cfg: AgentConfig): AgentConfig {
  return {
    system:      { ...cfg.system },
    weather:     { ...cfg.weather,      status: 'idle', info: '' },
    google:      { ...cfg.google,       status: 'idle', info: '' },
    github:      { ...cfg.github,       status: 'idle', info: '' },
    stock:       { ...cfg.stock,        status: 'idle', info: '' },
    dhan:        { ...cfg.dhan,         status: 'idle', info: '' },
    zerodha:     { ...cfg.zerodha,      status: 'idle', info: '' },
    news:        { ...cfg.news,         status: 'idle', info: '' },
    smarthome:   { ...cfg.smarthome,    status: 'idle', info: '' },
    portfolio:   { ...cfg.portfolio,    status: 'idle', info: '', tokenExpiresAt: cfg.portfolio.tokenExpiresAt },
    socialmedia: { ...cfg.socialmedia,  status: 'idle', info: '' },
    notes:       { ...cfg.notes },
    whatsapp:  {
      ...cfg.whatsapp,
      status:       'idle',
      info:         '',
      tunnelStatus: 'idle',
      tunnelInfo:   '',
      callbackUrl:  '',
      envDomain:    '',
    },
  };
}

function load(): AgentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AgentConfig>;
    const cfg: AgentConfig = {
      system:      { ...DEFAULT_AGENT_CONFIG.system,      ...parsed.system      },
      weather:     { ...DEFAULT_AGENT_CONFIG.weather,     ...parsed.weather     },
      google:      { ...DEFAULT_AGENT_CONFIG.google,      ...parsed.google      },
      github:      { ...DEFAULT_AGENT_CONFIG.github,      ...parsed.github      },
      stock:       { ...DEFAULT_AGENT_CONFIG.stock,       ...parsed.stock       },
      dhan:        { ...DEFAULT_AGENT_CONFIG.dhan,        ...parsed.dhan        },
      zerodha:     { ...DEFAULT_AGENT_CONFIG.zerodha,     ...parsed.zerodha     },
      news:        { ...DEFAULT_AGENT_CONFIG.news,        ...parsed.news        },
      smarthome:   { ...DEFAULT_AGENT_CONFIG.smarthome,   ...parsed.smarthome   },
      portfolio:   { ...DEFAULT_AGENT_CONFIG.portfolio,   ...parsed.portfolio   },
      socialmedia: { ...DEFAULT_AGENT_CONFIG.socialmedia, ...parsed.socialmedia },
      notes:       { ...DEFAULT_AGENT_CONFIG.notes,       ...parsed.notes       },
      whatsapp: {
        ...DEFAULT_AGENT_CONFIG.whatsapp,
        ...(parsed as any).whatsapp,
        tunnelStatus: 'idle' as TunnelStatus,
        tunnelInfo:   '',
        callbackUrl:  '',
        envDomain:    '',
      },
    };
    if (cfg.weather.apiKey)          cfg.weather.status   = 'connected';
    if (cfg.google.connectedEmail) {
      cfg.google.status = 'connected';
      // Ensure drive scope is always included so sheet browsing works after re-sign
      if (!cfg.google.scopes.includes('drive')) {
        cfg.google.scopes = [...cfg.google.scopes, 'drive'];
      }
    }
    if (cfg.github.username)         cfg.github.status    = 'connected';
    if (cfg.news.apiKey)             cfg.news.status      = 'connected';
    if (cfg.smarthome.token)              cfg.smarthome.status = 'connected';
    if (cfg.portfolio.connectedAccount)   cfg.portfolio.status = 'connected';
    if (cfg.whatsapp.phoneNumberId)  cfg.whatsapp.status  = 'connected';
    if (cfg.socialmedia.accounts.some((a) => a.enabled)) cfg.socialmedia.status = 'connected';
    cfg.stock.status = 'connected';
    cfg.stock.info   = 'Yahoo Finance (free, no key required)';
    if (cfg.dhan.status === 'connected') {
      cfg.dhan.info = cfg.dhan.info || 'Dhan broker connected';
    }
    if (cfg.zerodha.status === 'connected') {
      cfg.zerodha.info = cfg.zerodha.info || 'Zerodha broker connected';
    }
    return cfg;
  } catch {
    return DEFAULT_AGENT_CONFIG;
  }
}

function save(cfg: AgentConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist(cfg))); } catch {}
}

/* ── Hook ────────────────────────────────────────────────────────── */

export function useAgentConfig() {
  const [config, setConfig] = useState<AgentConfig>(load);

  // Keep a ref so the interval always reads the latest config without re-registering.
  const configRef = useRef(config);
  configRef.current = config;

  const patch = useCallback(<K extends keyof AgentConfig>(
    agent: K,
    partial: Partial<AgentConfig[K]>,
  ) => {
    setConfig((prev) => {
      const next = { ...prev, [agent]: { ...prev[agent], ...partial } } as AgentConfig;
      save(next);
      return next;
    });
  }, []);

  // Auto-refresh Google token on mount (catches every restart) and every 50 min.
  useEffect(() => {
    const tryRefreshGoogle = () => {
      const g = configRef.current.google;
      if (!g.clientId || !g.refreshToken) return;
      const expiredOrExpiringSoon =
        !g.accessToken ||
        (g.tokenExpiresAt > 0 && Date.now() >= g.tokenExpiresAt - 5 * 60 * 1000);
      if (expiredOrExpiringSoon) {
        refreshGoogleToken(g, patch);
      }
    };
    tryRefreshGoogle();
    const id = setInterval(tryRefreshGoogle, 50 * 60 * 1000);
    return () => clearInterval(id);
  }, [patch]); // patch is stable

  // Refresh YouTube OAuth tokens before they expire (1-hour lifetime)
  useEffect(() => {
    const tryRefreshYouTube = () => {
      const sm = configRef.current.socialmedia;
      const needsRefresh = sm.accounts.some(
        (a) => a.platform === 'youtube' && a.refreshToken &&
               (!a.token || (a.tokenExpiresAt > 0 && Date.now() >= a.tokenExpiresAt - 5 * 60 * 1000)),
      );
      if (needsRefresh) refreshYouTubeAccounts(sm, patch);
    };
    tryRefreshYouTube();
    const id = setInterval(tryRefreshYouTube, 50 * 60 * 1000);
    return () => clearInterval(id);
  }, [patch]);

  const registeredAgentIds = useMemo<string[]>(() => {
    const ids: string[] = ['notes']; // always-on built-in skill, no credentials required
    if (config.system.enabled)  ids.push('system');
    if (config.weather.enabled) ids.push('weather');
    if (config.google.connectedEmail) {
      if (config.google.calendarEnabled && config.google.scopes.includes('calendar')) ids.push('calendar');
      if (config.google.emailEnabled    && config.google.scopes.includes('gmail'))    ids.push('email');
    }
    if (config.github.enabled && config.github.username) ids.push('github');
    if (config.stock.enabled) ids.push('stock');
    if (config.news.enabled)  ids.push('news');
    if (config.smarthome.enabled && config.smarthome.token)            ids.push('smarthome');
    if (config.portfolio.enabled && config.portfolio.connectedAccount) ids.push('portfolio');
    if (config.whatsapp.enabled && config.whatsapp.phoneNumberId) ids.push('whatsapp');
    if (config.socialmedia.enabled && config.socialmedia.accounts.some((a) => a.enabled)) ids.push('socialmedia');
    return ids;
  }, [
    config.system.enabled,
    config.weather.enabled,
    config.google.connectedEmail,
    config.google.calendarEnabled, config.google.emailEnabled, config.google.scopes,
    config.github.enabled,        config.github.username,
    config.stock.enabled,
    config.news.enabled,
    config.smarthome.enabled, config.smarthome.token,
    config.portfolio.enabled, config.portfolio.connectedAccount,
    config.whatsapp.enabled,  config.whatsapp.phoneNumberId,
    config.socialmedia.enabled, config.socialmedia.accounts,
  ]);

  const disconnectGoogle = useCallback(() => {
    patch('google', {
      accessToken: '', refreshToken: '', tokenExpiresAt: 0,
      connectedEmail: '', status: 'idle', info: '',
    });
  }, [patch]);

  const disconnectGitHub = useCallback(() => {
    patch('github', { personalAccessToken: '', username: '', status: 'idle', info: '' });
  }, [patch]);

  const verifyWhatsApp = useCallback(async () => {
    const { phoneNumberId, accessToken } = config.whatsapp;
    if (!phoneNumberId || !accessToken) return;
    patch('whatsapp', { status: 'verifying', info: '' });
    try {
      const backendBase = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');
      const params = new URLSearchParams({ phone_number_id: phoneNumberId, access_token: accessToken });
      const res = await fetch(`${backendBase}/api/whatsapp/verify?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const label = data.verified_name
        ? `${data.verified_name} (${data.display_phone_number})`
        : data.display_phone_number || 'Connected';
      patch('whatsapp', { status: 'connected', info: label });
    } catch (e: any) {
      patch('whatsapp', { status: 'error', info: e.message ?? 'Connection failed' });
    }
  }, [config.whatsapp, patch]);

  const checkTunnelStatus = useCallback(async (): Promise<boolean> => {
    try {
      const backendBase = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');
      const res = await fetch(`${backendBase}/api/tunnel/status`);
      if (!res.ok) return false;
      const data = await res.json();
      if (data.active) {
        patch('whatsapp', {
          tunnelStatus:  'active',
          tunnelInfo:    data.url ?? '',
          callbackUrl:   data.callback_url ?? '',
          ...(data.provider && data.provider !== 'none'
            ? { tunnelProvider: data.provider as TunnelProvider }
            : {}),
          envDomain: data.env_domain ?? '',
        });
        return true;
      }
      if (data.starting) {
        patch('whatsapp', { tunnelStatus: 'starting', envDomain: data.env_domain ?? '' });
        return true;
      }
      patch('whatsapp', { envDomain: data.env_domain ?? '' });
      return false;
    } catch {
      return false;
    }
  }, [patch]);

  const startTunnel = useCallback(async () => {
    const { customDomain } = config.whatsapp;
    patch('whatsapp', { tunnelStatus: 'starting', tunnelInfo: '', callbackUrl: '' });
    try {
      const backendBase = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');
      const res = await fetch(`${backendBase}/api/tunnel/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'cloudflare', custom_domain: customDomain }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      patch('whatsapp', {
        tunnelStatus: 'active',
        tunnelInfo:   data.url ?? '',
        callbackUrl:  data.callback_url ?? '',
        envDomain:    data.env_domain ?? '',
      });
    } catch (e: any) {
      patch('whatsapp', { tunnelStatus: 'error', tunnelInfo: e.message ?? 'Failed to start tunnel', callbackUrl: '' });
    }
  }, [config.whatsapp, patch]);

  const stopTunnel = useCallback(async () => {
    try {
      const backendBase = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');
      await fetch(`${backendBase}/api/tunnel/stop`, { method: 'POST' });
    } catch {}
    patch('whatsapp', { tunnelStatus: 'idle', tunnelInfo: '', callbackUrl: '' });
  }, [patch]);

  const disconnectPortfolio = useCallback(() => {
    patch('portfolio', {
      enabled: false, accessToken: '', refreshToken: '', tokenExpiresAt: 0,
      connectedAccount: '', status: 'idle', info: '',
      clientId: '', clientSecret: '',
    });
  }, [patch]);

  const connectDhan = useCallback(() => {
    const gwBase = 'http://localhost:8788';
    const popup = window.open(`${gwBase}/auth/dhan`, 'dhan-oauth', 'width=520,height=680');
    patch('dhan', { status: 'verifying', info: 'Waiting for Dhan login…' });
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${gwBase}/api/dhan/status`);
        const d = await r.json();
        if (d.connected) {
          clearInterval(poll);
          patch('dhan', { status: 'connected', info: 'Dhan broker connected' });
          popup?.close();
        }
      } catch { /* gateway not yet ready */ }
    }, 1500);
    // Stop polling when popup closes
    const watchClose = setInterval(() => {
      if (popup?.closed) {
        clearInterval(poll);
        clearInterval(watchClose);
        // Do one final check
        fetch(`${gwBase}/api/dhan/status`)
          .then(r => r.json())
          .then(d => {
            if (d.connected) patch('dhan', { status: 'connected', info: 'Dhan broker connected' });
            else if (config.dhan.status === 'verifying') patch('dhan', { status: 'idle', info: '' });
          })
          .catch(() => {});
      }
    }, 500);
  }, [patch, config.dhan.status]);

  const disconnectDhan = useCallback(async () => {
    try {
      await fetch('http://localhost:8788/auth/dhan/token', { method: 'DELETE' });
    } catch {}
    patch('dhan', { status: 'idle', info: '' });
  }, [patch]);

  const connectZerodha = useCallback(() => {
    const gwBase = 'http://localhost:8788';
    const popup = window.open(`${gwBase}/auth/zerodha`, 'zerodha-oauth', 'width=520,height=680');
    patch('zerodha', { status: 'verifying', info: 'Waiting for Zerodha login…' });
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`${gwBase}/api/zerodha/status`);
        const d = await r.json();
        if (d.connected) {
          clearInterval(poll);
          patch('zerodha', { status: 'connected', info: 'Zerodha broker connected' });
          popup?.close();
        }
      } catch { /* gateway not yet ready */ }
    }, 1500);
    const watchClose = setInterval(() => {
      if (popup?.closed) {
        clearInterval(poll);
        clearInterval(watchClose);
        fetch(`${gwBase}/api/zerodha/status`)
          .then(r => r.json())
          .then(d => {
            if (d.connected) patch('zerodha', { status: 'connected', info: 'Zerodha broker connected' });
            else if (config.zerodha.status === 'verifying') patch('zerodha', { status: 'idle', info: '' });
          })
          .catch(() => {});
      }
    }, 500);
  }, [patch, config.zerodha.status]);

  const disconnectZerodha = useCallback(async () => {
    try {
      await fetch('http://localhost:8788/auth/zerodha/token', { method: 'DELETE' });
    } catch {}
    patch('zerodha', { status: 'idle', info: '' });
  }, [patch]);

  return {
    config,
    patch,
    registeredAgentIds,
    verifyWeather:          () => verifyWeather(config.weather, patch),
    connectGoogle:          () => connectGoogle(config.google, patch),
    disconnectGoogle,
    refreshGoogleToken:     () => refreshGoogleToken(config.google, patch),
    verifyGitHub:           () => verifyGitHub(config.github, patch),
    disconnectGitHub,
    verifyNews:             () => verifyNews(config.news, patch),
    verifySmartHome:        () => verifySmartHome(config.smarthome, patch),
    connectPortfolio:       () => connectPortfolio(config.portfolio, patch),
    disconnectPortfolio,
    refreshPortfolioToken:  () => refreshPortfolioToken(config.portfolio, patch),
    connectDhan,
    disconnectDhan,
    connectZerodha,
    disconnectZerodha,
    verifyWhatsApp,
    verifySocialMedia:      () => verifySocialMedia(config.socialmedia, patch),
    connectYouTube:         (loginHint?: string) => connectYouTubeAccount(config.socialmedia, patch, loginHint),
    checkTunnelStatus,
    startTunnel,
    stopTunnel,
  };
}
