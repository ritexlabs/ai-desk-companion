import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '../../hooks/useAgentConfig';
import {
  verifyGitHub,
  verifyNews,
  verifySmartHome,
  verifyWeather,
} from '../../hooks/agentVerify';

// ── Shared patcher helper ─────────────────────────────────────────────────────

function makePatcher() {
  const calls: Array<{ agent: string; partial: Record<string, unknown> }> = [];
  const patcher = <K extends keyof AgentConfig>(
    agent: K,
    partial: Partial<AgentConfig[K]>,
  ) => {
    calls.push({ agent: String(agent), partial: partial as Record<string, unknown> });
  };
  return { patcher, calls };
}

function lastCall(calls: ReturnType<typeof makePatcher>['calls']) {
  return calls[calls.length - 1]?.partial ?? {};
}

// ── verifyWeather ─────────────────────────────────────────────────────────────

describe('verifyWeather', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const base: AgentConfig['weather'] = {
    enabled: true, provider: 'openweathermap',
    apiKey: '', defaultCity: '', status: 'idle', info: '', notificationsEnabled: false,
  };

  it('does nothing when apiKey is empty', async () => {
    const { patcher, calls } = makePatcher();
    await verifyWeather(base, patcher);
    expect(calls).toHaveLength(0);
  });

  it('sets status=verifying before fetch', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'London', sys: { country: 'GB' }, main: { temp: 15 } }),
    } as Response);
    await verifyWeather({ ...base, apiKey: 'key' }, patcher);
    expect(calls[0].partial.status).toBe('verifying');
  });

  it('sets status=connected on successful OWM response', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Mumbai', sys: { country: 'IN' }, main: { temp: 30 } }),
    } as Response);
    await verifyWeather({ ...base, apiKey: 'key', defaultCity: 'Mumbai' }, patcher);
    expect(lastCall(calls).status).toBe('connected');
  });

  it('sets status=error on HTTP 401', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    await verifyWeather({ ...base, apiKey: 'bad-key' }, patcher);
    expect(lastCall(calls).status).toBe('error');
  });

  it('sets status=connected with WeatherAPI provider on success', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        location: { name: 'Delhi', country: 'India' },
        current: { temp_c: 38 },
      }),
    } as Response);
    await verifyWeather({ ...base, apiKey: 'key', provider: 'weatherapi' }, patcher);
    expect(lastCall(calls).status).toBe('connected');
  });

  it('includes city/country in the info string on success', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Paris', sys: { country: 'FR' }, main: { temp: 20 } }),
    } as Response);
    await verifyWeather({ ...base, apiKey: 'key', defaultCity: 'Paris' }, patcher);
    const info = String(lastCall(calls).info ?? '');
    expect(info).toContain('Paris');
  });
});

// ── verifyGitHub ──────────────────────────────────────────────────────────────

describe('verifyGitHub', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const base: AgentConfig['github'] = {
    enabled: true, personalAccessToken: '',
    username: '', status: 'idle', info: '', notificationsEnabled: false,
  };

  it('does nothing when PAT is empty', async () => {
    const { patcher, calls } = makePatcher();
    await verifyGitHub(base, patcher);
    expect(calls).toHaveLength(0);
  });

  it('sets status=connected with username on success', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'ritesh' }),
      headers: { get: (h: string) => (h === 'x-ratelimit-remaining' ? '59' : null) },
    } as unknown as Response);
    await verifyGitHub({ ...base, personalAccessToken: 'ghp_test' }, patcher);
    expect(lastCall(calls).status).toBe('connected');
    expect(lastCall(calls).username).toBe('ritesh');
  });

  it('sets status=error on HTTP 401', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    await verifyGitHub({ ...base, personalAccessToken: 'bad-pat' }, patcher);
    expect(lastCall(calls).status).toBe('error');
  });

  it('info contains rate-limit remaining on success', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'user' }),
      headers: { get: (h: string) => (h === 'x-ratelimit-remaining' ? '42' : null) },
    } as unknown as Response);
    await verifyGitHub({ ...base, personalAccessToken: 'ghp_ok' }, patcher);
    expect(String(lastCall(calls).info)).toContain('42');
  });
});

// ── verifyNews ────────────────────────────────────────────────────────────────

describe('verifyNews', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const base: AgentConfig['news'] = {
    enabled: true, apiKey: '', country: 'in',
    state: '', city: '', status: 'idle', info: '', notificationsEnabled: false,
  };

  it('does nothing when apiKey is empty', async () => {
    const { patcher, calls } = makePatcher();
    await verifyNews(base, patcher);
    expect(calls).toHaveLength(0);
  });

  it('sets status=connected with article count on success', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ totalArticles: 42 }),
    } as Response);
    await verifyNews({ ...base, apiKey: 'test-key' }, patcher);
    expect(lastCall(calls).status).toBe('connected');
    expect(String(lastCall(calls).info)).toContain('42');
  });

  it('sets status=error on HTTP failure', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ errors: ['Invalid API key'] }),
    } as Response);
    await verifyNews({ ...base, apiKey: 'bad-key' }, patcher);
    expect(lastCall(calls).status).toBe('error');
  });
});

// ── verifySmartHome ───────────────────────────────────────────────────────────

describe('verifySmartHome', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const base: AgentConfig['smarthome'] = {
    enabled: true, mode: 'remote', endpoint: 'http://homeassistant.local:8123',
    token: '', status: 'idle', info: '', notificationsEnabled: false,
  };

  it('does nothing when token is empty', async () => {
    const { patcher, calls } = makePatcher();
    await verifySmartHome(base, patcher);
    expect(calls).toHaveLength(0);
  });

  it('sets status=connected with location name on success', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ location_name: 'My Home' }),
    } as Response);
    await verifySmartHome({ ...base, token: 'ha-token' }, patcher);
    expect(lastCall(calls).status).toBe('connected');
    expect(String(lastCall(calls).info)).toContain('My Home');
  });

  it('sets status=error on backend failure', async () => {
    const { patcher, calls } = makePatcher();
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Connection refused' }),
    } as Response);
    await verifySmartHome({ ...base, token: 'ha-token' }, patcher);
    expect(lastCall(calls).status).toBe('error');
  });
});
