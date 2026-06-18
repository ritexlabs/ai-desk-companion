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

import { useCallback, useMemo, useState } from 'react';

export type ConnectionStatus = 'idle' | 'verifying' | 'connected' | 'error';

/* ── Per-agent credential shapes ─────────────────────────────────── */

export interface SystemConfig {
  enabled: boolean;
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
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  connectedEmail: string;
  scopes: string[];
  status: ConnectionStatus;
  info: string;
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
  status: ConnectionStatus;
  info: string;
}

export interface NewsCreds {
  enabled: boolean;
  apiKey: string;
  country: string;   // ISO 2-letter code: 'in', 'us', 'gb', etc.
  state: string;     // optional — e.g. 'Maharashtra'
  city: string;      // optional — e.g. 'Mumbai'
  status: ConnectionStatus;
  info: string;
}

export interface AgentConfig {
  system:  SystemConfig;
  weather: WeatherCreds;
  google:  GoogleCreds;
  github:  GitHubCreds;
  stock:   StockCreds;
  news:    NewsCreds;
}

/* ── Defaults — NO real tokens here ─────────────────────────────── */

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  system: {
    enabled: true,
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
    clientId: '',
    clientSecret: '',
    accessToken: '',
    refreshToken: '',
    tokenExpiresAt: 0,
    connectedEmail: '',
    scopes: ['calendar', 'gmail', 'drive'],
    status: 'idle',
    info: '',
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
  },
};

const STORAGE_KEY = 'robo-agent-config';

/** Strip runtime-only fields before persisting (enabled flags are persisted). */
function toPersist(cfg: AgentConfig): AgentConfig {
  return {
    system:  { ...cfg.system },
    weather: { ...cfg.weather, status: 'idle', info: '' },
    google:  { ...cfg.google,  status: 'idle', info: '' },
    github:  { ...cfg.github,  status: 'idle', info: '' },
    stock:   { ...cfg.stock,   status: 'idle', info: '' },
    news:    { ...cfg.news,    status: 'idle', info: '' },
  };
}

function load(): AgentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AgentConfig>;
    const cfg: AgentConfig = {
      system:  { ...DEFAULT_AGENT_CONFIG.system,  ...parsed.system  },
      weather: { ...DEFAULT_AGENT_CONFIG.weather, ...parsed.weather },
      google:  { ...DEFAULT_AGENT_CONFIG.google,  ...parsed.google  },
      github:  { ...DEFAULT_AGENT_CONFIG.github,  ...parsed.github  },
      stock:   { ...DEFAULT_AGENT_CONFIG.stock,   ...parsed.stock   },
      news:    { ...DEFAULT_AGENT_CONFIG.news,    ...parsed.news    },
    };
    // Restore connected status from persisted credentials.
    if (cfg.weather.apiKey)        cfg.weather.status = 'connected';
    if (cfg.google.connectedEmail) cfg.google.status  = 'connected';
    if (cfg.github.username)       cfg.github.status  = 'connected';
    if (cfg.news.apiKey)           cfg.news.status    = 'connected';
    // Stock agent is always ready (no key needed)
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

  const patch = useCallback(<K extends keyof AgentConfig>(
    agent: K,
    partial: Partial<AgentConfig[K]>,
  ) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        [agent]: { ...prev[agent], ...partial },
      } as AgentConfig;
      save(next);
      return next;
    });
  }, []);

  /* ── Weather verify ──────────────────────────────────────────── */
  const verifyWeather = useCallback(async () => {
    const { provider, apiKey, defaultCity } = config.weather;
    if (!apiKey) return;
    patch('weather', { status: 'verifying', info: '' });
    try {
      const city = defaultCity || 'London';
      let url = '';
      if (provider === 'openweathermap') {
        url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
      } else {
        url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const info =
        provider === 'openweathermap'
          ? `${data.name}, ${data.sys.country} · ${Math.round(data.main.temp)}°C`
          : `${data.location.name}, ${data.location.country} · ${data.current.temp_c}°C`;
      patch('weather', { status: 'connected', info });
    } catch (e: any) {
      patch('weather', { status: 'error', info: e.message ?? 'Connection failed' });
    }
  }, [config.weather, patch]);

  /* ── PKCE helpers ────────────────────────────────────────────── */
  /** Generate a cryptographically-random base64url string of `len` bytes. */
  const _randomBase64url = (len: number): string => {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  /** SHA-256 of a plain string, returned as base64url. */
  const _sha256Base64url = async (plain: string): Promise<string> => {
    const data = new TextEncoder().encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  /* ── Google Sign-In (Authorization Code + PKCE) ── */
  const connectGoogle = useCallback(async () => {
    const { clientId, clientSecret, scopes } = config.google;
    if (!clientId) return;

    const scopeMap: Record<string, string> = {
      calendar: 'https://www.googleapis.com/auth/calendar.readonly',
      gmail:    'https://www.googleapis.com/auth/gmail.readonly',
      drive:    'https://www.googleapis.com/auth/drive.readonly',
    };
    const selectedScopes = scopes.length > 0 ? scopes : Object.keys(scopeMap);
    const scopeStr = [
      'openid', 'email', 'profile',
      ...selectedScopes.map((s) => scopeMap[s] ?? s),
    ].join(' ');

    // PKCE: generate verifier + challenge
    const codeVerifier  = _randomBase64url(32);
    const codeChallenge = await _sha256Base64url(codeVerifier);
    const redirectUri   = window.location.origin + '/';

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id',             clientId);
    url.searchParams.set('redirect_uri',          redirectUri);
    url.searchParams.set('response_type',         'code');           // auth-code, not token
    url.searchParams.set('scope',                 scopeStr);
    url.searchParams.set('code_challenge',        codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type',           'offline');        // get refresh token
    url.searchParams.set('prompt',                'consent');

    const popup = window.open(url.toString(), 'google-oauth', 'width=520,height=640,left=200,top=100');
    patch('google', { status: 'verifying', info: '' });

    const poll = setInterval(async () => {
      try {
        if (!popup || popup.closed) { clearInterval(poll); patch('google', { status: 'idle' }); return; }
        const code = new URLSearchParams(popup.location.search).get('code');
        if (!code) return;
        clearInterval(poll);
        popup.close();

        // Exchange auth code + verifier for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id:     clientId,
            ...(clientSecret ? { client_secret: clientSecret } : {}),
            code,
            code_verifier: codeVerifier,
            grant_type:    'authorization_code',
            redirect_uri:  redirectUri,
          }),
        });
        const tokens = await tokenRes.json();
        if (!tokenRes.ok) {
          patch('google', { status: 'error', info: tokens.error_description ?? 'Token exchange failed' });
          return;
        }

        const tokenExpiresAt = Date.now() + (tokens.expires_in ?? 3599) * 1000;
        patch('google', {
          accessToken:    tokens.access_token  ?? '',
          refreshToken:   tokens.refresh_token ?? '',
          tokenExpiresAt,
          status: 'verifying',
          info: '',
        });

        // Fetch connected account info
        fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
          .then((r) => r.json())
          .then((u) => patch('google', { connectedEmail: u.email ?? '', status: 'connected', info: u.email ?? '' }))
          .catch(() => patch('google', { status: 'connected', info: 'Connected (email unavailable)' }));
      } catch {
        // cross-origin while popup is still on google.com — keep polling
      }
    }, 400);
  }, [config.google, patch]);

  /** Silently refresh the Google access token using the stored refresh token. */
  const refreshGoogleToken = useCallback(async () => {
    const { clientId, clientSecret, refreshToken } = config.google;
    if (!clientId || !refreshToken) return;
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
          refresh_token: refreshToken,
          grant_type:    'refresh_token',
        }),
      });
      const tokens = await res.json();
      if (!res.ok) return;
      const tokenExpiresAt = Date.now() + (tokens.expires_in ?? 3599) * 1000;
      patch('google', { accessToken: tokens.access_token, tokenExpiresAt });
    } catch {
      // silent — caller can check tokenExpiresAt to decide if action needed
    }
  }, [config.google, patch]);

  const disconnectGoogle = useCallback(() => {
    patch('google', {
      accessToken: '', refreshToken: '', tokenExpiresAt: 0,
      connectedEmail: '', status: 'idle', info: '',
      // keep clientId and clientSecret so user doesn't have to re-enter them
    });
  }, [patch]);

  /* ── GitHub PAT verify ───────────────────────────────────────── */
  const verifyGitHub = useCallback(async () => {
    const { personalAccessToken } = config.github;
    if (!personalAccessToken) return;
    patch('github', { status: 'verifying', info: '' });
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${personalAccessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — check token scopes`);
      const data = await res.json();
      const remaining = res.headers.get('x-ratelimit-remaining') ?? '?';
      patch('github', {
        username: data.login,
        status: 'connected',
        info: `${data.login} · ${remaining} req/hr remaining`,
      });
    } catch (e: any) {
      patch('github', { status: 'error', info: e.message ?? 'Connection failed' });
    }
  }, [config.github, patch]);

  const disconnectGitHub = useCallback(() => {
    patch('github', { personalAccessToken: '', username: '', status: 'idle', info: '' });
  }, [patch]);

  /**
   * Derived list of agent IDs that have credentials configured.
   * Weather is always present. Calendar/Email/GitHub appear once the user
   * connects the respective service. Persists across restarts via localStorage.
   */
  const registeredAgentIds = useMemo<string[]>(() => {
    const ids: string[] = [];
    if (config.system.enabled)  ids.push('system');
    if (config.weather.enabled) ids.push('weather');
    if (config.google.connectedEmail) {
      if (config.google.calendarEnabled && config.google.scopes.includes('calendar')) ids.push('calendar');
      if (config.google.emailEnabled    && config.google.scopes.includes('gmail'))    ids.push('email');
    }
    if (config.github.enabled && config.github.username) ids.push('github');
    if (config.stock.enabled) ids.push('stock');
    if (config.news.enabled) ids.push('news');
    return ids;
  }, [
    config.system.enabled,
    config.weather.enabled,
    config.google.connectedEmail, config.google.calendarEnabled,
    config.google.emailEnabled,   config.google.scopes,
    config.github.enabled,        config.github.username,
    config.stock.enabled,
    config.news.enabled,
  ]);

  /* ── News API verify (GNews) ─────────────────────────────────── */
  const verifyNews = useCallback(async () => {
    const { apiKey, country } = config.news;
    if (!apiKey) return;
    patch('news', { status: 'verifying', info: '' });
    try {
      const params = new URLSearchParams({ token: apiKey, country: country || 'in', lang: 'en', max: '1' });
      const res = await fetch(`https://gnews.io/api/v4/top-headlines?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.errors?.[0] ?? `HTTP ${res.status}`);
      }
      const total = data.totalArticles ?? 0;
      patch('news', { status: 'connected', info: `~${total} articles available` });
    } catch (e: any) {
      patch('news', { status: 'error', info: e.message ?? 'Connection failed' });
    }
  }, [config.news, patch]);

  return {
    config,
    patch,
    registeredAgentIds,
    verifyWeather,
    connectGoogle,
    disconnectGoogle,
    refreshGoogleToken,
    verifyGitHub,
    disconnectGitHub,
    verifyNews,
  };
}
