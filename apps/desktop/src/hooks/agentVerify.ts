import type { AgentConfig, ConnectionStatus } from './useAgentConfig';

type Patcher = <K extends keyof AgentConfig>(agent: K, partial: Partial<AgentConfig[K]>) => void;

/* ── Weather ─────────────────────────────────────────────────────── */

export async function verifyWeather(
  weather: AgentConfig['weather'],
  patch: Patcher,
) {
  const { provider, apiKey, defaultCity } = weather;
  if (!apiKey) return;
  patch('weather', { status: 'verifying', info: '' });
  try {
    const city = defaultCity || 'London';
    const url =
      provider === 'openweathermap'
        ? `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`
        : `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}`;
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
}

/* ── Google OAuth PKCE helpers ───────────────────────────────────── */

function randomBase64url(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sha256Base64url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/* ── Google Sign-In (Authorization Code + PKCE) ─────────────────── */

export async function connectGoogle(
  google: AgentConfig['google'],
  patch: Patcher,
) {
  const { clientId, clientSecret, scopes } = google;
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

  const codeVerifier  = randomBase64url(32);
  const codeChallenge = await sha256Base64url(codeVerifier);
  const redirectUri   = window.location.origin + '/';

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',             clientId);
  url.searchParams.set('redirect_uri',          redirectUri);
  url.searchParams.set('response_type',         'code');
  url.searchParams.set('scope',                 scopeStr);
  url.searchParams.set('code_challenge',        codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type',           'offline');
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

      const agentToggles = {
        calendarEnabled: selectedScopes.includes('calendar'),
        emailEnabled:    selectedScopes.includes('gmail'),
      };
      fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
        .then((r) => r.json())
        .then((u) => patch('google', { connectedEmail: u.email ?? '', status: 'connected', info: u.email ?? '', ...agentToggles }))
        .catch(() => patch('google', { status: 'connected', info: 'Connected (email unavailable)', ...agentToggles }));
    } catch {
      // cross-origin while popup is still on google.com — keep polling
    }
  }, 400);
}

/* ── Refresh Google access token silently ────────────────────────── */

export async function refreshGoogleToken(
  google: AgentConfig['google'],
  patch: Patcher,
) {
  const { clientId, clientSecret, refreshToken } = google;
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
    // silent — caller checks tokenExpiresAt to decide next step
  }
}

/* ── GitHub PAT verify ───────────────────────────────────────────── */

export async function verifyGitHub(
  github: AgentConfig['github'],
  patch: Patcher,
) {
  const { personalAccessToken } = github;
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
}

/* ── Smart Home verify ───────────────────────────────────────────── */

export async function verifySmartHome(
  smarthome: AgentConfig['smarthome'],
  patch: Patcher,
) {
  const { endpoint, token } = smarthome;
  if (!token) return;
  patch('smarthome', { status: 'verifying', info: '' });
  try {
    const backendBase = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787');
    const params = new URLSearchParams({
      endpoint: endpoint || 'http://homeassistant.local:8123',
      token,
    });
    const res = await fetch(`${backendBase}/api/smarthome/ping?${params}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `HTTP ${res.status}`);
    }
    const data = await res.json();
    patch('smarthome', { status: 'connected', info: `Connected to ${data.location_name || 'Home'}` });
  } catch (e: any) {
    patch('smarthome', { status: 'error', info: e.message ?? 'Connection failed' });
  }
}

/* ── Portfolio (INDmoney MCP OAuth 2.0 + PKCE) ───────────────────── */

export async function connectPortfolio(
  portfolio: AgentConfig['portfolio'],
  patch: Patcher,
) {
  const backendBase = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
  let { clientId, clientSecret } = portfolio;
  const { authEndpoint: manualAuth, tokenEndpoint: manualToken } = portfolio;

  patch('portfolio', { status: 'verifying', info: '' });

  // ── Step 1: auto-register if we don't have a client_id yet ──────────
  if (!clientId) {
    try {
      const redirectUri = window.location.origin + '/';
      const res = await fetch(`${backendBase}/api/portfolio/oauth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ redirect_uri: redirectUri }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? 'Registration failed');
      }
      const reg = await res.json();
      clientId     = reg.client_id     ?? '';
      clientSecret = reg.client_secret ?? '';
      // Persist immediately so the user doesn't need to re-register next time
      patch('portfolio', { clientId, clientSecret });
    } catch (e: unknown) {
      patch('portfolio', {
        status: 'error',
        info: (e instanceof Error ? e.message : 'Could not register with INDmoney'),
      });
      return;
    }
  }

  // ── Step 2: use known endpoints (discovered earlier via curl) ────────
  const meta = await fetch(`${backendBase}/api/portfolio/oauth/meta`).then(r => r.json()).catch(() => ({}));
  const authEndpoint  = manualAuth.trim()  || meta.authorization_endpoint  || 'https://mcp.indmoney.com/authorize';
  const tokenEndpoint = manualToken.trim() || meta.token_endpoint           || 'https://mcp.indmoney.com/token';

  // ── Step 3: PKCE ─────────────────────────────────────────────────────
  const codeVerifier  = randomBase64url(32);
  const codeChallenge = await sha256Base64url(codeVerifier);
  const redirectUri   = window.location.origin + '/';
  const state         = randomBase64url(16);

  const url = new URL(authEndpoint);
  url.searchParams.set('client_id',             clientId);
  url.searchParams.set('redirect_uri',          redirectUri);
  url.searchParams.set('response_type',         'code');
  url.searchParams.set('code_challenge',        codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope',                 'portfolio:read market:read');
  url.searchParams.set('state',                 state);

  // ── Step 4: open OAuth popup ─────────────────────────────────────────
  const popup = window.open(url.toString(), 'indmoney-oauth', 'width=520,height=640,left=200,top=100');

  const poll = setInterval(async () => {
    try {
      if (!popup || popup.closed) { clearInterval(poll); patch('portfolio', { status: 'idle' }); return; }
      const qs         = new URLSearchParams(popup.location.search);
      const oauthError = qs.get('error');
      const code       = qs.get('code');

      if (oauthError) {
        clearInterval(poll);
        popup.close();
        patch('portfolio', { status: 'error', info: qs.get('error_description') ?? oauthError });
        return;
      }

      if (!code) return;
      clearInterval(poll);
      popup.close();

      // ── Step 5: exchange code for tokens ──────────────────────────────
      const tokenParams: Record<string, string> = {
        client_id:     clientId,
        code,
        code_verifier: codeVerifier,
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
      };
      if (clientSecret) tokenParams['client_secret'] = clientSecret;

      const tokenRes = await fetch(tokenEndpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams(tokenParams),
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok) {
        patch('portfolio', { status: 'error', info: tokens.error_description ?? 'Token exchange failed' });
        return;
      }

      const tokenExpiresAt = Date.now() + (tokens.expires_in ?? 3599) * 1000;
      patch('portfolio', {
        enabled:          true,
        accessToken:      tokens.access_token  ?? '',
        refreshToken:     tokens.refresh_token ?? '',
        tokenExpiresAt,
        connectedAccount: 'INDmoney',
        status:           'connected',
        info:             '',
      });
    } catch {
      // Cross-origin frame while popup is still on INDmoney — keep polling
    }
  }, 400);
}

export async function refreshPortfolioToken(
  portfolio: AgentConfig['portfolio'],
  patch: Patcher,
) {
  const { clientId, clientSecret, refreshToken, tokenEndpoint: manualToken } = portfolio;
  if (!refreshToken) return;

  const token_endpoint = manualToken.trim() || 'https://mcp.indmoney.com/token';

  try {
    const refreshParams: Record<string, string> = {
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    };
    if (clientId)     refreshParams['client_id']     = clientId;
    if (clientSecret) refreshParams['client_secret'] = clientSecret;

    const res = await fetch(token_endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(refreshParams),
    });
    const tokens = await res.json();
    if (!res.ok) return;
    const tokenExpiresAt = Date.now() + (tokens.expires_in ?? 3599) * 1000;
    patch('portfolio', { accessToken: tokens.access_token, tokenExpiresAt });
  } catch {
    // silent — caller checks tokenExpiresAt to decide next step
  }
}

/* ── News API verify (GNews) ─────────────────────────────────────── */

export async function verifyNews(
  news: AgentConfig['news'],
  patch: Patcher,
) {
  const { apiKey, country } = news;
  if (!apiKey) return;
  patch('news', { status: 'verifying', info: '' });
  try {
    const params = new URLSearchParams({ token: apiKey, country: country || 'in', lang: 'en', max: '1' });
    const res  = await fetch(`https://gnews.io/api/v4/top-headlines?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.errors?.[0] ?? `HTTP ${res.status}`);
    const total = data.totalArticles ?? 0;
    patch('news', { status: 'connected', info: `~${total} articles available` });
  } catch (e: any) {
    patch('news', { status: 'error', info: e.message ?? 'Connection failed' });
  }
}

/* ── YouTube OAuth (PKCE) ────────────────────────────────────────── */

export interface YouTubeDiscovery {
  googleEmail:    string;
  accessToken:    string;
  refreshToken:   string;
  tokenExpiresAt: number;
  channels:       Array<{ channelId: string; label: string }>;
}

/**
 * Opens a Google OAuth popup, completes PKCE flow, discovers all YouTube
 * channels on the signed-in account, and resolves with the raw discovery
 * data. The caller decides which channels to add — nothing is patched into
 * the accounts list here.
 */
export function connectYouTubeAccount(
  socialmedia: AgentConfig['socialmedia'],
  patch: Patcher,
  loginHint?: string,
): Promise<YouTubeDiscovery | null> {
  return new Promise(async (resolve) => {
    const { youtubeClientId, youtubeClientSecret } = socialmedia;
    if (!youtubeClientId) { resolve(null); return; }

    const codeVerifier  = randomBase64url(32);
    const codeChallenge = await sha256Base64url(codeVerifier);
    const redirectUri   = window.location.origin + '/';

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id',             youtubeClientId);
    url.searchParams.set('redirect_uri',          redirectUri);
    url.searchParams.set('response_type',         'code');
    url.searchParams.set('scope',                 'https://www.googleapis.com/auth/youtube.readonly email profile');
    url.searchParams.set('code_challenge',        codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type',           'offline');
    // prompt=login forces Google to show a fresh sign-in form so the user can type
    // any email address — this bypasses the current Chrome profile's account picker
    // and allows connecting accounts from other profiles or brand-new accounts.
    url.searchParams.set('prompt',                'login consent');
    if (loginHint) url.searchParams.set('login_hint', loginHint);

    const popup = window.open(url.toString(), 'youtube-oauth', 'width=520,height=640,left=200,top=100');
    patch('socialmedia', { status: 'verifying', info: 'Waiting for Google sign-in…' });

    const poll = setInterval(async () => {
      try {
        if (!popup || popup.closed) {
          clearInterval(poll);
          patch('socialmedia', { status: 'idle', info: '' });
          resolve(null);
          return;
        }
        const code = new URLSearchParams(popup.location.search).get('code');
        if (!code) return;
        clearInterval(poll);
        popup.close();

        // Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id:     youtubeClientId,
            ...(youtubeClientSecret ? { client_secret: youtubeClientSecret } : {}),
            code,
            code_verifier: codeVerifier,
            grant_type:    'authorization_code',
            redirect_uri:  redirectUri,
          }),
        });
        const tokens = await tokenRes.json();
        if (!tokenRes.ok) {
          patch('socialmedia', { status: 'error', info: tokens.error_description ?? 'Token exchange failed' });
          resolve(null);
          return;
        }

        const tokenExpiresAt = Date.now() + (tokens.expires_in ?? 3599) * 1000;

        // Resolve Google account email
        const userRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const user        = userRes.ok ? await userRes.json() : {};
        const googleEmail = user.email ?? '';

        // Discover all channels on this account
        const chRes = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true&maxResults=50',
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        const chData   = chRes.ok ? await chRes.json() : { items: [] };
        const items    = chData.items ?? [];

        patch('socialmedia', { status: 'idle', info: '' });

        // Resolve with whatever channels were found (may be empty — UI handles empty state)
        resolve({
          googleEmail,
          accessToken:    tokens.access_token  ?? '',
          refreshToken:   tokens.refresh_token ?? '',
          tokenExpiresAt,
          channels: items.map((ch: any) => ({
            channelId: ch.id ?? '',
            label:     ch.snippet?.title ?? 'My Channel',
          })),
        });
      } catch {
        // cross-origin while popup is still on accounts.google.com — keep polling
      }
    }, 400);
  });
}

/* ── YouTube OAuth token refresh ─────────────────────────────────── */

export async function refreshYouTubeAccounts(
  socialmedia: AgentConfig['socialmedia'],
  patch: Patcher,
) {
  const { youtubeClientId, youtubeClientSecret } = socialmedia;
  if (!youtubeClientId) return;

  const now       = Date.now();
  let   changed   = false;
  const updated   = socialmedia.accounts.map((acc) => ({ ...acc }));

  for (let i = 0; i < updated.length; i++) {
    const acc = updated[i];
    if (acc.platform !== 'youtube' || !acc.refreshToken) continue;
    if (acc.tokenExpiresAt > now + 5 * 60 * 1000) continue;   // not expiring yet

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     youtubeClientId,
          ...(youtubeClientSecret ? { client_secret: youtubeClientSecret } : {}),
          refresh_token: acc.refreshToken,
          grant_type:    'refresh_token',
        }),
      });
      const tokens = await res.json();
      if (!res.ok) continue;
      updated[i] = {
        ...acc,
        token:          tokens.access_token ?? acc.token,
        tokenExpiresAt: Date.now() + (tokens.expires_in ?? 3599) * 1000,
      };
      changed = true;
    } catch {
      // silent — token refresh failure handled at next poll
    }
  }

  if (changed) patch('socialmedia', { accounts: updated });
}

/* ── Social Media ────────────────────────────────────────────────── */

export async function verifySocialMedia(
  socialmedia: AgentConfig['socialmedia'],
  patch: Patcher,
) {
  const accounts = socialmedia.accounts.filter((a) => a.enabled && a.token && a.channelId);
  if (!accounts.length) return;

  patch('socialmedia', { status: 'verifying', info: '' });

  const ok:   string[] = [];
  const fail: string[] = [];

  await Promise.all(
    accounts.map(async (acc) => {
      try {
        if (acc.platform === 'youtube') {
          const r = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(acc.channelId)}`,
            { headers: { Authorization: `Bearer ${acc.token}` } },
          );
          const data = await r.json();
          if (data.error) throw new Error(data.error.message ?? 'YouTube API error');
          if (!data.items?.length) throw new Error('Channel not found — reconnect via OAuth');
          const subs = parseInt(data.items[0].statistics?.subscriberCount ?? '0', 10);
          ok.push(`${acc.label} (${subs.toLocaleString()} subs)`);
        } else {
          const r = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(acc.channelId)}?fields=name,followers_count&access_token=${encodeURIComponent(acc.token)}`,
          );
          const data = await r.json();
          if (data.error) throw new Error(data.error.message ?? 'Instagram API error');
          const followers = parseInt(data.followers_count ?? '0', 10);
          ok.push(`${acc.label} (${followers.toLocaleString()} followers)`);
        }
      } catch (e: any) {
        fail.push(`${acc.label}: ${e.message ?? 'failed'}`);
      }
    }),
  );

  if (ok.length > 0) {
    const info = ok.join(' · ') + (fail.length ? ` | ⚠ ${fail.join(', ')}` : '');
    patch('socialmedia', { status: 'connected', info });
  } else {
    patch('socialmedia', { status: 'error', info: fail.join(' · ') || 'All accounts failed' });
  }
}
