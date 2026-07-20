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
}

export interface GitHubCreds {
  enabled: boolean;
  personalAccessToken: string;
  username: string;
  status: ConnectionStatus;
  info: string;
}

export interface StockCreds {
  enabled: boolean;
  defaultMarket: 'IN' | 'US';
  spreadsheetId: string;
  spreadsheetName: string;
  status: ConnectionStatus;
  info: string;
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
  enabled:          boolean;
  endpoint:         string;
  clientId:         string;
  clientSecret:     string;
  /** Manual override — skip auto-discovery when set */
  authEndpoint:     string;
  tokenEndpoint:    string;
  accessToken:      string;
  refreshToken:     string;
  tokenExpiresAt:   number;
  connectedAccount: string;
  status:           ConnectionStatus;
  info:             string;
}

export interface WhatsAppCreds {
  enabled:            boolean;
  phoneNumberId:      string;
  accessToken:        string;
  webhookVerifyToken: string;
  contacts:           string;
  status:             ConnectionStatus;
  info:               string;
  tunnelProvider: TunnelProvider;
  customDomain:   string;
  /** Runtime-only — not persisted */
  tunnelStatus:   TunnelStatus;
  tunnelInfo:     string;
  callbackUrl:    string;
  /** Domain pre-configured in server .env (CLOUDFLARE_DOMAIN) — read-only */
  envDomain:      string;
}

export interface AgentConfig {
  system:     SystemConfig;
  weather:    WeatherCreds;
  google:     GoogleCreds;
  github:     GitHubCreds;
  stock:      StockCreds;
  news:       NewsCreds;
  smarthome:  SmartHomeCreds;
  portfolio:  PortfolioCreds;
  whatsapp:   WhatsAppCreds;
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
  },
  github: {
    enabled: false,
    personalAccessToken: '',
    username: '',
    status: 'idle',
    info: '',
  },
  stock: {
    enabled: false,
    defaultMarket: 'IN',
    spreadsheetId: '',
    spreadsheetName: '',
    status: 'connected',
    info: 'Yahoo Finance (free, no key required)',
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
    enabled:          false,
    endpoint:         'https://mcp.indmoney.com/mcp',
    clientId:         '',
    clientSecret:     '',
    authEndpoint:     '',
    tokenEndpoint:    '',
    accessToken:      '',
    refreshToken:     '',
    tokenExpiresAt:   0,
    connectedAccount: '',
    status:           'idle',
    info:             '',
  },
  whatsapp: {
    enabled:            false,
    phoneNumberId:      '',
    accessToken:        '',
    webhookVerifyToken: 'robo-whatsapp-verify',
    contacts:           '',
    status:             'idle',
    info:               '',
    tunnelProvider: 'none',
    customDomain:   '',
    tunnelStatus:   'idle',
    tunnelInfo:     '',
    callbackUrl:    '',
    envDomain:      '',
  },
};

const STORAGE_KEY = 'robo-agent-config';

function toPersist(cfg: AgentConfig): AgentConfig {
  return {
    system:    { ...cfg.system },
    weather:   { ...cfg.weather,   status: 'idle', info: '' },
    google:    { ...cfg.google,    status: 'idle', info: '' },
    github:    { ...cfg.github,    status: 'idle', info: '' },
    stock:     { ...cfg.stock,     status: 'idle', info: '' },
    news:      { ...cfg.news,      status: 'idle', info: '' },
    smarthome: { ...cfg.smarthome, status: 'idle', info: '' },
    portfolio: { ...cfg.portfolio, status: 'idle', info: '', tokenExpiresAt: cfg.portfolio.tokenExpiresAt },
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
      system:    { ...DEFAULT_AGENT_CONFIG.system,    ...parsed.system    },
      weather:   { ...DEFAULT_AGENT_CONFIG.weather,   ...parsed.weather   },
      google:    { ...DEFAULT_AGENT_CONFIG.google,    ...parsed.google    },
      github:    { ...DEFAULT_AGENT_CONFIG.github,    ...parsed.github    },
      stock:     { ...DEFAULT_AGENT_CONFIG.stock,     ...parsed.stock     },
      news:      { ...DEFAULT_AGENT_CONFIG.news,      ...parsed.news      },
      smarthome: { ...DEFAULT_AGENT_CONFIG.smarthome, ...parsed.smarthome },
      portfolio: { ...DEFAULT_AGENT_CONFIG.portfolio, ...parsed.portfolio },
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
    cfg.stock.status = 'connected';
    cfg.stock.info   = 'Yahoo Finance (free, no key required)';
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

  const registeredAgentIds = useMemo<string[]>(() => {
    const ids: string[] = ['notes']; // always-on built-in skill, no credentials required
    if (config.system.enabled)  ids.push('system');
    if (config.weather.enabled) ids.push('weather');
    if (config.google.connectedEmail && config.google.accessToken) {
      if (config.google.calendarEnabled && config.google.scopes.includes('calendar')) ids.push('calendar');
      if (config.google.emailEnabled    && config.google.scopes.includes('gmail'))    ids.push('email');
    }
    if (config.github.enabled && config.github.username) ids.push('github');
    if (config.stock.enabled) ids.push('stock');
    if (config.news.enabled)  ids.push('news');
    if (config.smarthome.enabled && config.smarthome.token)            ids.push('smarthome');
    if (config.portfolio.enabled && config.portfolio.connectedAccount) ids.push('portfolio');
    if (config.whatsapp.enabled && config.whatsapp.phoneNumberId) ids.push('whatsapp');
    return ids;
  }, [
    config.system.enabled,
    config.weather.enabled,
    config.google.connectedEmail, config.google.accessToken,
    config.google.calendarEnabled, config.google.emailEnabled, config.google.scopes,
    config.github.enabled,        config.github.username,
    config.stock.enabled,
    config.news.enabled,
    config.smarthome.enabled, config.smarthome.token,
    config.portfolio.enabled, config.portfolio.connectedAccount,
    config.whatsapp.enabled,  config.whatsapp.phoneNumberId,
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
    verifyWhatsApp,
    checkTunnelStatus,
    startTunnel,
    stopTunnel,
  };
}
