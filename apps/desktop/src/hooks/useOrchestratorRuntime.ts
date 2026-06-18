import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentDefinition, RuntimePhase, TranscriptTurn } from '../types/runtime';
import { nowIso, partOfDayFromHour } from '../lib/utils';
import { useVoice } from './useVoice';
import { useAudioPlayer } from './useAudioPlayer';
import type { VoiceConfig } from './useVoiceConfig';
import type { AppConfig } from './useAppConfig';
import type { LLMConfig } from './useLLMConfig';
import type { VoiceProviderConfig } from './useVoiceProviderConfig';
import type { AgentConfig } from './useAgentConfig';
import { useSystemStats, systemHealthSummary } from './useSystemStats';
import type { SystemStats } from './useSystemStats';

const WS_URL = (import.meta.env.VITE_BACKEND_URL ?? 'ws://localhost:8787').replace(/^http/, 'ws') + '/ws';

/* ── Agent catalogue ────────────────────────────────────────────── */

const AGENT_CATALOGUE: AgentDefinition[] = [
  { id: 'weather',  label: 'Weather',        description: 'Forecasts and current conditions.', example: 'How is the weather today?',     status: 'offline', color: 'from-cyan-400 to-sky-500'      },
  { id: 'system',   label: 'System',          description: 'OS, CPU, battery, and health.',    example: 'What is my system health?',     status: 'offline', color: 'from-teal-400 to-cyan-500'     },
  { id: 'calendar', label: 'Google Calendar', description: 'Meetings and schedule.',           example: 'What is my next meeting?',      status: 'offline', color: 'from-violet-400 to-fuchsia-500' },
  { id: 'email',    label: 'Google Email',    description: 'Inbox and message summaries.',     example: 'Do I have any urgent emails?',  status: 'offline', color: 'from-emerald-400 to-teal-500'  },
  { id: 'github',   label: 'GitHub',          description: 'PRs, issues, and workflows.',      example: 'Any failed GitHub workflows?',  status: 'offline', color: 'from-amber-400 to-orange-500'  },
  { id: 'stock',    label: 'Stock Market',    description: 'Prices, RSI, support/resistance.', example: 'What is the Nifty 50 price?',   status: 'offline', color: 'from-green-400 to-emerald-500' },
  { id: 'news',     label: 'News',            description: 'Latest headlines by location.',     example: 'What are the top headlines?',   status: 'offline', color: 'from-sky-400 to-blue-500'      },
];

function agentsFromIds(ids: string[]): AgentDefinition[] {
  return AGENT_CATALOGUE.filter((a) => ids.includes(a.id));
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ── TTS queue item (may carry server-synthesised audio) ────────── */
interface TTSItem {
  text: string;
  agentId?: string;
  agentStatus?: AgentDefinition['status'];
  audio_b64?: string;
  audio_format?: string;
}

/* ── Orchestrator capabilities (reported on connect) ────────────── */
interface OrchestratorCaps {
  tts:      boolean;  // server-side TTS active
  stt:      boolean;  // server-side STT (Whisper) active
  wakeWord: boolean;  // server-side wake-word detection active
}

/* ── Runtime metrics snapshot from orchestrator ─────────────────── */
export interface OrchestratorMetrics {
  uptime_sec:         number;
  sessions_started:   number;
  commands_processed: number;
  tts_calls:          number;
  stt_calls:          number;
  ws_messages_in:     number;
  ws_messages_out:    number;
  agents: Record<string, { calls: number; avg_ms: number; error_count: number }>;
}

/* ── Helper: base64-encode a Blob via FileReader ────────────────── */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ── Hook ───────────────────────────────────────────────────────── */

export function useOrchestratorRuntime(
  voiceConfig?: VoiceConfig,
  appConfig?: AppConfig,
  registeredAgentIds: string[] = ['weather', 'system'],
  llmConfig?: LLMConfig,
  voiceProviderConfig?: VoiceProviderConfig,
  agentConfig?: AgentConfig,
) {
  const wakeWord    = appConfig?.wakeWord    ?? 'Robo';
  const callingName = appConfig?.callingName ?? 'Master';

  /* ── Voice + audio ──────────────────────────────────────────────── */
  const { speechState, speak, stopSpeaking, listenOnce, stopListening, sttSupported, ttsSupported,
          voiceListenerActive, micEverStarted, lastHeardText } =
    useVoice(voiceConfig);
  const { play: playAudio, stop: stopAudio } = useAudioPlayer();
  const systemStats = useSystemStats();

  /* ── React state ────────────────────────────────────────────────── */
  const [phase, setPhase]                     = useState<RuntimePhase>('standby');
  const phaseRef = useRef<RuntimePhase>('standby');
  phaseRef.current = phase; // kept current every render so async callbacks see the latest value
  const [wsConnected, setWsConnected]         = useState(false);
  const [heard, setHeard]                     = useState(`Waiting for "${wakeWord}"…`);
  const [assistantSpeech, setAssistantSpeech] = useState(`System idle. Say "${wakeWord}" or press Wake Up.`);
  const [command, setCommand]                 = useState('');
  const [activeAgentId, setActiveAgentId]     = useState<string | null>(null);
  const [agents, setAgents]                   = useState<AgentDefinition[]>(() => agentsFromIds(registeredAgentIds));
  const [transcript, setTranscript]           = useState<TranscriptTurn[]>([
    { speaker: 'system', text: 'Voice shell initialized. Standby mode active.', timestamp: nowIso() },
  ]);
  const [orchestratorCaps, setOrchestratorCaps] = useState<OrchestratorCaps>({ tts: false, stt: false, wakeWord: false });
  const [isPlayingServerAudio, setIsPlayingServerAudio] = useState(false);
  const [orchestratorMetrics, setOrchestratorMetrics] = useState<OrchestratorMetrics | null>(null);
  const [agentBootMessages, setAgentBootMessages] = useState<Record<string, string>>({});

  /* ── Always-current refs ────────────────────────────────────────── */
  const wsRef              = useRef<WebSocket | null>(null);
  const wsConnectedRef     = useRef(false);
  const registeredIdsRef   = useRef(registeredAgentIds);
  registeredIdsRef.current = registeredAgentIds;
  const systemStatsRef     = useRef<SystemStats>(systemStats);
  systemStatsRef.current   = systemStats;
  const callingNameRef     = useRef(callingName);
  callingNameRef.current   = callingName;
  const wakeWordRef        = useRef(wakeWord);
  wakeWordRef.current      = wakeWord;
  const voiceProviderRef   = useRef(voiceProviderConfig);
  voiceProviderRef.current = voiceProviderConfig;
  const llmConfigRef       = useRef(llmConfig);
  llmConfigRef.current     = llmConfig;
  const agentConfigRef     = useRef(agentConfig);
  agentConfigRef.current   = agentConfig;
  const orchestratorCapsRef = useRef<OrchestratorCaps>({ tts: false, stt: false, wakeWord: false });

  /* ── TTS serial queue ───────────────────────────────────────────── */
  const ttsQueueRef     = useRef<TTSItem[]>([]);
  const ttsActiveRef    = useRef(false);
  const pendingPhaseRef = useRef<RuntimePhase | null>(null);
  const doSleepRef      = useRef<() => void>(() => {});

  /* ── Pending STT transcript resolve (server STT flow) ───────────── */
  const pendingTranscriptRef = useRef<((text: string) => void) | null>(null);

  /* ── Auto-listen / wake-word conversation mode ───────────────────── */
  // Set true when wake word fires; set false when session ends or no speech detected.
  // While true and phase=ready, ask() is triggered automatically (Alexa-style).
  const autoListenRef  = useRef(false);
  // Holds the command portion from "Robo, what's the weather?" detected during standby.
  const pendingCmdRef  = useRef<string | null>(null);

  /* ── Helpers ────────────────────────────────────────────────────── */
  const appendTurn = useCallback((speaker: TranscriptTurn['speaker'], text: string) => {
    setTranscript((prev) => [...prev, { speaker, text, timestamp: nowIso() }]);
  }, []);

  const updateAgent = useCallback((id: string, status: AgentDefinition['status']) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  /* ── drainTTSQueue ──────────────────────────────────────────────── */
  const drainTTSQueue = useCallback(async () => {
    if (ttsActiveRef.current) return;
    ttsActiveRef.current = true;

    while (ttsQueueRef.current.length > 0) {
      const item = ttsQueueRef.current.shift()!;
      setAssistantSpeech(item.text);
      if (item.agentId) updateAgent(item.agentId, item.agentStatus ?? 'online');
      // Brief yield so the React state update renders before audio starts
      await pause(50);

      if (!voiceEnabledRef.current) {
        // Voice muted — text shown in UI, no audio
      } else if (item.audio_b64) {
        setIsPlayingServerAudio(true);
        await playAudio(item.audio_b64, item.audio_format ?? 'mp3');
        setIsPlayingServerAudio(false);
      } else {
        await speak(item.text, item.agentId);
      }
    }

    ttsActiveRef.current = false;

    if (pendingPhaseRef.current === 'sleep') {
      pendingPhaseRef.current = null;
      doSleepRef.current();          // full cleanup after farewell finishes
    } else if (pendingPhaseRef.current) {
      setPhase(pendingPhaseRef.current);
      pendingPhaseRef.current = null;
    }
  }, [speak, playAudio, updateAgent]);

  const enqueueTTS = useCallback((item: TTSItem) => {
    ttsQueueRef.current.push(item);
    drainTTSQueue();
  }, [drainTTSQueue]);

  /* ── WebSocket event handler ────────────────────────────────────── */
  const handleWsEvent = useCallback((data: Record<string, unknown>) => {
    const event   = data.event as string;
    const payload = (data.payload ?? {}) as Record<string, unknown>;

    const extractAudio = (): { audio_b64?: string; audio_format?: string } => ({
      audio_b64:    payload.audio_b64    as string | undefined,
      audio_format: payload.audio_format as string | undefined,
    });

    switch (event) {
      case 'connected': {
        const ttsProv  = (payload.tts_provider  as string) ?? 'browser';
        const sttProv  = (payload.stt_provider  as string) ?? 'browser';
        const wakeWord = (payload.wake_word_enabled as boolean) ?? false;
        const caps = { tts: ttsProv !== 'browser', stt: sttProv !== 'browser', wakeWord };
        setOrchestratorCaps(caps);
        orchestratorCapsRef.current = caps;
        const wakeInfo = wakeWord ? ` Wake-word: ${payload.wake_word_model ?? 'active'}.` : '';
        appendTurn('system', `Orchestrator connected (v${payload.version ?? '?'}). TTS: ${ttsProv}, STT: ${sttProv}.${wakeInfo}`);
        break;
      }

      case 'phase_changed': {
        const p = payload.phase as RuntimePhase;
        if (p === 'ready' && (ttsQueueRef.current.length > 0 || ttsActiveRef.current)) {
          pendingPhaseRef.current = p;
        } else if (p === 'sleep') {
          if (ttsQueueRef.current.length > 0 || ttsActiveRef.current) {
            // Farewell audio is still playing — wait for it to finish, then sleep
            pendingPhaseRef.current = 'sleep';
          } else {
            doSleepRef.current();
          }
        } else {
          setPhase(p);
        }
        break;
      }

      case 'boot_status': {
        const msg         = payload.message as string;
        const agentId     = payload.agent_id     as string | undefined;
        const agentStatus = payload.agent_status as AgentDefinition['status'] | undefined;
        appendTurn('assistant', msg);
        enqueueTTS({ text: msg, agentId, agentStatus, ...extractAudio() });
        if (agentId) setAgentBootMessages((prev) => ({ ...prev, [agentId]: msg }));
        break;
      }

      case 'agent_status_changed':
        updateAgent(payload.agent as string, payload.status as AgentDefinition['status']);
        break;

      case 'transcript_final':
        if (payload.speaker === 'user') {
          const text = payload.text as string;
          // Only resolve the pending server-STT wait.
          // setHeard / appendTurn happen in ask() after the wake-word gate so that
          // ambient speech without "Robo" never appears in the transcript.
          pendingTranscriptRef.current?.(text);
          pendingTranscriptRef.current = null;
        }
        break;

      case 'route_selected':
        setActiveAgentId(payload.agent as string);
        break;

      case 'assistant_speaking': {
        const text    = payload.text     as string;
        const agentId = payload.agent_id as string | undefined;
        appendTurn('assistant', text);
        enqueueTTS({ text, agentId, ...extractAudio() });
        break;
      }

      case 'assistant_done':
        setActiveAgentId(null);
        break;

      case 'session_config': {
        const ttsProv  = (payload.tts_provider      as string)  ?? 'browser';
        const sttProv  = (payload.stt_provider      as string)  ?? 'browser';
        const wakeWord = (payload.wake_word_enabled as boolean) ?? false;
        const caps = { tts: ttsProv !== 'browser', stt: sttProv !== 'browser', wakeWord };
        setOrchestratorCaps(caps);
        orchestratorCapsRef.current = caps;
        break;
      }

      case 'wake_word_detected': {
        // Server detected the wake word via openWakeWord — trigger same flow as button press
        if (phase === 'standby' || phase === 'sleep') {
          appendTurn('system', `Wake word detected by server (${payload.model ?? 'voice'}).`);
          wakeRef.current();
        }
        break;
      }

      case 'metrics_update':
        setOrchestratorMetrics(payload as unknown as OrchestratorMetrics);
        break;

      case 'error':
        appendTurn('system', `Orchestrator error: ${payload.message}`);
        // Unblock any pending server-STT wait so ask() doesn't hang when STT fails
        if (pendingTranscriptRef.current) {
          pendingTranscriptRef.current('');
          pendingTranscriptRef.current = null;
        }
        break;

      default:
        break;
    }
  }, [appendTurn, updateAgent, enqueueTTS]);

  /* ── WebSocket connection with auto-reconnect ───────────────────── */
  useEffect(() => {
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      try {
        ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (destroyed) { ws.close(); return; }
          wsConnectedRef.current = true;
          setWsConnected(true);
        };

        ws.onmessage = (e) => {
          if (destroyed) return;
          try { handleWsEvent(JSON.parse(e.data as string)); } catch { /* ignore malformed */ }
        };

        ws.onclose = () => {
          if (destroyed) return;
          wsConnectedRef.current = false;
          setWsConnected(false);
          orchestratorCapsRef.current = { tts: false, stt: false, wakeWord: false };
          setOrchestratorCaps({ tts: false, stt: false, wakeWord: false });
          // Unblock any pending server-STT wait so ask() doesn't hang on disconnect
          if (pendingTranscriptRef.current) {
            pendingTranscriptRef.current('');
            pendingTranscriptRef.current = null;
          }
          retryTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => { /* onclose fires next */ };
      } catch {
        retryTimer = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [handleWsEvent]);

  const wsSend = useCallback((cmd: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command: cmd, payload }));
      return true;
    }
    return false;
  }, []);

  /* ── Wake-word listener (browser STT, on in standby/sleep) ─────── */
  const wakeRef = useRef<() => void>(() => {});

  // Wake-word pattern for STANDBY listener:
  // Requires explicit "Robo, Wake-Up" or "Hey/Hello Robo" — bare "Robo" alone is ignored in standby.
  // This prevents accidental wake when the name is mentioned in casual speech.
  const wakeWordPattern = useMemo(() => {
    const name = wakeWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n = `${name}t?`;  // t? catches STT misrecognition: "robo" → "robot"
    // Allow comma or space as separator so "Robo, Wake-Up" and "Robo Wake-Up" both match.
    return new RegExp(
      // "Robo Wake-Up" / "Robo, Wake-Up" / "Wake-Up Robo" — explicit start command
      `wake[\\s\\-]?up[,\\s]*${n}|${n}[,\\s]+wake[\\s\\-]?up` +
      // "Hey Robo" / "Hello Robo" — natural greeting triggers
      `|hey[,\\s]+${n}|hello[,\\s]+${n}`,
      'i',
    );
  }, [wakeWord]);

  // Sleep-phrase pattern for ask() — used during an active session.
  // Matches "Robo Good Bye", "Robo Good Night", "Robo See You", "Robo Go to Sleep",
  // and standalone equivalents (no wake word needed when already in a session).
  const sleepPattern = useMemo(() => {
    const name = wakeWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n = `${name}t?`;
    const sleepKw = `bye+|goodbye|good\\s?night|go\\s+(?:to\\s+)?sleep|go\\s+for\\s+sleep|see\\s+you(?:\\s+(?:again|later|soon|tomorrow))?|shut\\s?down`;
    return new RegExp(
      // wake-word + sleep phrase, either order: "Robo Good Night" / "Good Night Robo"
      `(?:${sleepKw}).*\\b${n}\\b|\\b${n}\\b.*(?:${sleepKw})` +
      // standalone sleep phrases (safe in ask() which only runs during an active session)
      `|^(?:(?:bye+\\s*)+|goodbye|good\\s?night|go\\s+(?:to\\s+)?sleep|go\\s+for\\s+sleep|see\\s+you(?:\\s+(?:again|later|soon|tomorrow))?)\\s*[.!]*$`,
      'i',
    );
  }, [wakeWord]);

  // Incremented by enableVoice() / toggleVoice() to force-restart the wake-word listener
  const [micRestartKey, setMicRestartKey] = useState(0);

  // Manual toggle: lets the user pause/resume voice listening at any time.
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => !prev);
  }, []);

  // When voice is toggled off: stop all active audio/STT immediately so the
  // mute is instant for both input (listening) and output (speaking/audio).
  useEffect(() => {
    if (!voiceEnabled) {
      autoListenRef.current = false;     // cancel auto-listen when voice is muted
      stopListening();
      stopSpeaking();
      stopAudio();
      setIsPlayingServerAudio(false);
      ttsQueueRef.current = [];          // discard pending speech items
      if (pendingTranscriptRef.current) {
        pendingTranscriptRef.current('');
        pendingTranscriptRef.current = null;
      }
    }
  }, [voiceEnabled, stopListening, stopSpeaking, stopAudio]);

  useEffect(() => {
    if (!sttSupported || !voiceEnabled) return;
    if (phase !== 'standby' && phase !== 'sleep') return;
    if (orchestratorCapsRef.current.wakeWord) return; // server handles wake-word

    let alive = true;

    // Loop discrete 4-second listen sessions.
    // More reliable than continuous=true which silently ends and creates blind spots.
    (async () => {
      while (alive) {
        const text = await listenOnce(3000);
        if (!alive) break;
        if (text && wakeWordPattern.test(text)) {
          // Extract any inline command after the wake-phrase, e.g. "Hey Robo, what's the time?" → "what's the time?"
          const inline = text.replace(wakeWordPattern, '').replace(/^[,\s]+/, '').trim();
          // Discard the inline part if it's just the boot phrase itself (e.g. "Robo, Wake-Up" → inline="", not "Wake-Up")
          const isBootPhrase = /^wake[\s\-]?up$/i.test(inline);
          if (inline && !isBootPhrase) pendingCmdRef.current = inline;
          wakeRef.current();
          break;
        }
        // tiny pause so Chrome isn't restarted instantly on the same tick
        await new Promise<void>((r) => setTimeout(r, 30));
      }
    })();

    return () => {
      alive = false;
      stopListening(); // abort any in-progress listenOnce session
    };
  // micRestartKey is intentionally included so a manual tap can force-restart the listener
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sttSupported, voiceEnabled, listenOnce, stopListening, wakeWordPattern, orchestratorCaps.wakeWord, micRestartKey]);

  // Called from UI: explicitly request mic permission then restart listener (user gesture)
  const enableVoice = useCallback(() => {
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(s => s.getTracks().forEach(t => t.stop()))
        .catch(() => {})
        .finally(() => setMicRestartKey(k => k + 1));
    } else {
      setMicRestartKey(k => k + 1);
    }
  }, []);

  useEffect(() => {
    setAgents((prev) =>
      agentsFromIds(registeredAgentIds).map((a) => ({
        ...a,
        status: prev.find((p) => p.id === a.id)?.status ?? 'offline',
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredAgentIds.join(',')]);

  /* ── Server STT: record audio and send to orchestrator ─────────── */
  const recordAndTranscribeViaServer = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      // Resolve will be called by handleWsEvent when transcript_final arrives
      pendingTranscriptRef.current = resolve;

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        // Prefer webm; Safari will fall back to mp4
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const fmt      = mimeType.includes('webm') ? 'webm' : 'mp4';

        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob   = new Blob(chunks, { type: mimeType });
          const b64    = await blobToBase64(blob);
          wsSend('audio_chunk', { data_b64: b64, format: fmt, is_final: true });
        };

        recorder.start();
        // Auto-stop after 8 seconds (same timeout as browser listenOnce)
        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, 8000);
      }).catch(() => {
        pendingTranscriptRef.current = null;
        resolve('');
      });
    });
  }, [wsSend]);

  /* ── triggerWakeWord ────────────────────────────────────────────── */
  const triggerWakeWord = useCallback(async () => {
    autoListenRef.current = true;   // enable Alexa-style auto-listen for this session
    ttsQueueRef.current  = [];
    ttsActiveRef.current = false;
    pendingPhaseRef.current = null;
    setAgents(agentsFromIds(registeredIdsRef.current).map((a) => ({ ...a, status: 'offline' as const })));
    appendTurn('system', 'Wake phrase detected. Starting session.');

    if (wsConnectedRef.current) {
      setPhase('wake_detected');
      setHeard(wakeWordRef.current);
      setAssistantSpeech('Wake word detected. Connecting to orchestrator…');
      const vpc = voiceProviderRef.current;
      const llm = llmConfigRef.current;
      const ac  = agentConfigRef.current;
      wsSend('start_session', {
        calling_name:      callingNameRef.current,
        registered_agents: registeredIdsRef.current,
        voice_config: vpc ? {
          tts_provider:        vpc.ttsProvider,
          stt_provider:        vpc.sttProvider,
          openai_api_key:      vpc.openaiApiKey,
          openai_tts_voice:    vpc.openaiTtsVoice,
          openai_tts_model:    vpc.openaiTtsModel,
          elevenlabs_api_key:  vpc.elevenLabsApiKey,
          elevenlabs_voice_id: vpc.elevenLabsVoiceId,
        } : {},
        llm_config: llm ? {
          provider: llm.provider,
          api_key:  llm.apiKey,
          model:    llm.model,
          base_url: llm.baseUrl,
        } : {},
        agent_config: ac ? {
          weather: {
            provider:     ac.weather.provider,
            api_key:      ac.weather.apiKey,
            default_city: ac.weather.defaultCity,
          },
          github: {
            personal_access_token: ac.github.personalAccessToken,
          },
          google: {
            access_token:  ac.google.accessToken,
            refresh_token: ac.google.refreshToken,
          },
          stock: {
            default_market: ac.stock.defaultMarket,
          },
          news: {
            api_key: ac.news.apiKey,
            country: ac.news.country,
            state:   ac.news.state,
            city:    ac.news.city,
          },
        } : {},
      });
    } else {
      setPhase('wake_detected');
      setHeard(wakeWordRef.current);
      setPhase('booting');

      const greeting = `${partOfDayFromHour()}, ${callingNameRef.current}. Running in local mode — the orchestrator is offline.`;
      const activeAgents = agentsFromIds(registeredIdsRef.current);

      const lines: TTSItem[] = [
        { text: greeting },
        ...activeAgents.map((a) => ({ text: `${a.label} agent, online.`, agentId: a.id })),
        { text: `All ${activeAgents.length} agents online. Note: responses are local fallback only.` },
      ];

      for (let i = 0; i < lines.length; i++) {
        const { text, agentId } = lines[i];
        setAssistantSpeech(text);
        appendTurn('assistant', text);
        if (agentId) updateAgent(agentId, 'online');
        await speak(text);
      }

      setPhase('ready');
    }
  }, [wsSend, speak, appendTurn, updateAgent]);

  useEffect(() => { wakeRef.current = triggerWakeWord; }, [triggerWakeWord]);

  // askRef and sleepRef are kept in sync below, after ask/sleep are defined.
  const askRef   = useRef<(input?: string) => void>(() => {});
  const sleepRef = useRef<() => void>(() => {});

  /* ── ask ────────────────────────────────────────────────────────── */
  const ask = useCallback(async (input?: string) => {
    // Prevent starting a new listen session while one is already running
    if (!input && phaseRef.current === 'listening') return;

    let text = (input ?? command).trim();

    if (!text) {
      setPhase('listening');
      setAssistantSpeech('Listening…');
      if (!autoListenRef.current) {
        appendTurn('system', 'Microphone active. Listening for command.');
      }

      if (wsConnectedRef.current && orchestratorCapsRef.current.stt) {
        text = await recordAndTranscribeViaServer();
        // Fall through — wake-word gate and command routing run below, same as browser STT.
      } else if (sttSupported) {
        text = await listenOnce(5000);
      } else {
        setAssistantSpeech('No microphone or STT available. Please type your command.');
        setPhase('ready');
        return;
      }

      // Voice was disabled while listening — discard silently
      if (!voiceEnabledRef.current) {
        autoListenRef.current = false;
        setPhase('ready');
        return;
      }

      if (!text) {
        // Nothing heard in the listen window.
        // Auto-listen mode: silently cycle back — keep waiting for the wake word.
        // Manual listen mode: pause and show a hint so the user knows to try again.
        if (!autoListenRef.current) {
          setAssistantSpeech(`Listening paused. Say "${wakeWordRef.current}, Wake Up" or press Wake Up.`);
        }
        setPhase('ready');
        return;
      }

      // ── Wake-word gate ─────────────────────────────────────────────────────
      // When auto-listening (post-boot ready state) require the wake word before
      // processing any voice command. This is the Alexa / Google Nest behaviour:
      // ambient speech is ignored; only "Robo, <command>" triggers a response.
      if (autoListenRef.current) {
        const wakeGate = new RegExp(
          `\\b${wakeWordRef.current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}t?\\b`,
          'i',
        );
        if (!wakeGate.test(text)) {
          // Background speech without wake word — discard silently, keep cycling.
          setPhase('ready');
          return;
        }
      }

      // Strip the wake-word prefix: "Robo, what's the time?" → "what's the time?"
      // Also handles "Hey Robo, ..." and "Hello Robo, ..." prefixes.
      const wakePfx = new RegExp(
        `^(?:hey[,\\s]+|hello[,\\s]+)?\\b${wakeWordRef.current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}t?\\b[,\\s]*`,
        'i',
      );
      const stripped = text.replace(wakePfx, '').trim();

      if (!stripped) {
        // Wake word heard alone (just "Robo") — acknowledge and re-listen for the command.
        const ack = `Yes? How can I help you, ${callingNameRef.current}?`;
        setAssistantSpeech(ack);
        appendTurn('assistant', ack);
        await speak(ack);
        setPhase('ready');
        return;
      }
      text = stripped;
    }

    setHeard(text);
    setCommand('');

    // Sleep-phrase detection — template farewell, no LLM call.
    if (sleepPattern.test(text)) {
      appendTurn('user', text);
      const farewells = [
        `Goodbye, ${callingNameRef.current}! Have a wonderful time.`,
        `Take care! I'll be here when you need me.`,
        `Good night! Rest well.`,
        `Farewell! It was a pleasure chatting.`,
        `See you later! Powering down now.`,
      ];
      const farewell = farewells[Math.floor(Math.random() * farewells.length)];
      setAssistantSpeech(farewell);
      appendTurn('assistant', farewell);
      autoListenRef.current = false;
      setAgents(agentsFromIds(registeredIdsRef.current).map((a) => ({ ...a, status: 'offline' as const })));
      setActiveAgentId(null);
      // Speak first so the farewell message isn't overwritten by orchestrator's phase_changed:sleep
      await speak(farewell);
      if (wsConnectedRef.current) wsSend('stop_session');
      doSleepRef.current();
      return;
    }

    if (wsConnectedRef.current) {
      // Send text to orchestrator (browser STT or typed command — same path).
      setPhase('thinking');
      setAssistantSpeech('Processing your request…');
      appendTurn('user', text);
      wsSend('send_text_command', { text });
    } else {
      appendTurn('user', text);
      setPhase('thinking');
      setAssistantSpeech('Processing your request…');

      const t = text.toLowerCase();
      const response = /system|cpu|processor|cores|memory|ram|battery|network|health|os|performance|hardware|uptime|heap/.test(t)
        ? `System agent responding: ${systemHealthSummary(systemStatsRef.current)}`
        : `Local mode: I heard "${text}". Start the orchestrator for full AI-powered responses.`;

      setPhase('responding');
      setAssistantSpeech(response);
      appendTurn('assistant', response);
      await speak(response);
      setActiveAgentId(null);
      setPhase('ready');
    }
  }, [command, speak, listenOnce, appendTurn, sttSupported, wsSend, recordAndTranscribeViaServer, sleepPattern]);

  useEffect(() => { askRef.current = ask; }, [ask]);

  // Alexa-style auto-listen: when phase returns to 'ready' while in auto-listen mode,
  // automatically start listening for the next command.
  // auto-listen is enabled by wake-word detection and disabled by no-speech / sleep / voice-off.
  useEffect(() => {
    if (phase !== 'ready' || !voiceEnabled || !autoListenRef.current) return;
    const t = setTimeout(() => {
      // Re-check everything inside the timeout using refs (closures are stale)
      if (phaseRef.current !== 'ready' || !voiceEnabledRef.current || !autoListenRef.current) return;
      const cmd = pendingCmdRef.current;
      pendingCmdRef.current = null;
      askRef.current(cmd ?? undefined);
    }, 300); // 300 ms gap lets TTS settle before mic opens
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceEnabled]);

  /* ── doSleep — full sleep cleanup, usable from TTS drain or directly ── */
  const doSleep = useCallback(() => {
    autoListenRef.current   = false;    // stop auto-listen when session ends
    ttsQueueRef.current     = [];
    ttsActiveRef.current    = false;
    pendingPhaseRef.current = null;
    setAgents(agentsFromIds(registeredIdsRef.current).map((a) => ({ ...a, status: 'offline' as const })));
    setActiveAgentId(null);
    setPhase('sleep');
    setAssistantSpeech(`Sleep mode active. Say "${wakeWordRef.current}" or press Wake Up to reactivate.`);
    appendTurn('system', 'Session ended. Returning to sleep mode.');
  }, [appendTurn]);

  useEffect(() => { doSleepRef.current = doSleep; }, [doSleep]);

  /* ── sleep ──────────────────────────────────────────────────────── */
  // Called by the Sleep button (immediate, no farewell).
  // The farewell_session path waits for TTS then calls doSleep via pendingPhaseRef.
  const sleep = useCallback(() => {
    autoListenRef.current   = false;    // stop auto-listen when sleeping
    stopSpeaking();
    stopAudio();
    ttsQueueRef.current     = [];
    ttsActiveRef.current    = false;
    pendingPhaseRef.current = null;

    if (wsConnectedRef.current) {
      wsSend('stop_session');
      // doSleep() is called when phase_changed:sleep arrives from the orchestrator
    } else {
      doSleepRef.current();
    }
  }, [stopSpeaking, stopAudio, appendTurn, wsSend]);

  useEffect(() => { sleepRef.current = sleep; }, [sleep]);

  const reloadAgent = useCallback((agentId: string) => {
    if (!wsConnectedRef.current) return;
    updateAgent(agentId, 'starting');
    wsSend('retry_agent', { agent: agentId });
  }, [wsSend, updateAgent]);

  return {
    phase,
    heard,
    assistantSpeech,
    speechState,
    isPlayingServerAudio,
    command,
    setCommand,
    activeAgentId,
    agents,
    transcript,
    triggerWakeWord,
    ask,
    sleep,
    sttSupported,
    ttsSupported,
    systemStats,
    wsConnected,
    orchestratorCaps,
    orchestratorMetrics,
    voiceListenerActive,
    micEverStarted,
    lastHeardText,
    enableVoice,
    voiceEnabled,
    toggleVoice,
    reloadAgent,
    agentBootMessages,
  };
}
