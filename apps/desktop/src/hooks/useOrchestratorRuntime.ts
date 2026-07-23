import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentDefinition, RuntimePhase, TranscriptTurn } from '../types/runtime';
import { nowIso, partOfDayFromHour } from '../lib/utils';

/** Minimal shape for WebSocket-pushed alert events */
interface WsAlert { id: string; title: string; body: string; }
import { useVoice } from './useVoice';
import { useAudioPlayer } from './useAudioPlayer';
import type { VoiceConfig } from './useVoiceConfig';
import type { AppConfig } from './useAppConfig';
import type { LLMConfig } from './useLLMConfig';
import type { VoiceProviderConfig } from './useVoiceProviderConfig';
import type { AgentConfig } from './useAgentConfig';
import { useSystemStats, systemHealthSummary } from './useSystemStats';
import type { SystemStats } from './useSystemStats';
import { useVoiceLoop } from './useVoiceLoop';
import type { AgentVoiceMap } from './useAgentVoiceConfig';

const WS_URL = (import.meta.env.VITE_BACKEND_URL ?? 'ws://localhost:8787').replace(/^http/, 'ws') + '/ws';

/* ── Agent catalogue ────────────────────────────────────────────── */

const AGENT_CATALOGUE: AgentDefinition[] = [
  { id: 'weather',   label: 'Weather',        description: 'Forecasts and current conditions.', example: 'How is the weather today?',        status: 'offline', color: 'from-cyan-400 to-sky-500'       },
  { id: 'system',   label: 'System',          description: 'OS, CPU, battery, and health.',    example: 'What is my system health?',        status: 'offline', color: 'from-teal-400 to-cyan-500'      },
  { id: 'calendar', label: 'Google Calendar', description: 'Meetings and schedule.',           example: 'What is my next meeting?',         status: 'offline', color: 'from-violet-400 to-fuchsia-500'  },
  { id: 'email',    label: 'Google Email',    description: 'Inbox and message summaries.',     example: 'Do I have any urgent emails?',     status: 'offline', color: 'from-emerald-400 to-teal-500'   },
  { id: 'github',   label: 'GitHub',          description: 'PRs, issues, and workflows.',      example: 'Any failed GitHub workflows?',     status: 'offline', color: 'from-amber-400 to-orange-500'   },
  { id: 'stock',    label: 'Stock Market',    description: 'Prices, RSI, support/resistance.', example: 'What is the Nifty 50 price?',      status: 'offline', color: 'from-green-400 to-emerald-500'  },
  { id: 'news',     label: 'News',            description: 'Latest headlines by location.',    example: 'What are the top headlines?',      status: 'offline', color: 'from-sky-400 to-blue-500'       },
  { id: 'smarthome', label: 'Smart Home',     description: 'Control lights, switches, climate, scenes.', example: 'Turn on the living room lights.', status: 'offline', color: 'from-orange-400 to-amber-500' },
  { id: 'whatsapp',    label: 'WhatsApp',    description: 'Send and receive WhatsApp messages by voice.', example: 'Send WhatsApp to Mom saying hello.', status: 'offline', color: 'from-green-400 to-emerald-600' },
  { id: 'portfolio',   label: 'Portfolio',   description: 'View holdings, P&L, mutual funds via INDmoney.', example: 'Show my portfolio holdings.', status: 'offline', color: 'from-rose-400 to-pink-600' },
  // ── Built-in skills (always enabled) ──────────────────────────────────────
  { id: 'websearch',  label: 'Web Search',  description: 'Live web search via DuckDuckGo — no API key.',  example: 'Search the web for latest iPhone specs.', status: 'offline', color: 'from-blue-400 to-indigo-600'  },
  { id: 'calculator', label: 'Calculator',  description: 'Precise math, percentages, tip and unit calc.', example: 'What is 18% tip on 850?',               status: 'offline', color: 'from-amber-400 to-orange-600' },
  { id: 'memory',     label: 'Memory',      description: 'Save and recall personal notes any time.',       example: 'Remember wife birthday is March 5.',    status: 'offline', color: 'from-purple-400 to-violet-600' },
  { id: 'briefing',   label: 'Briefing',    description: 'Morning summary across all connected agents.',   example: 'Give me my morning briefing.',           status: 'offline', color: 'from-cyan-400 to-teal-600'    },
  { id: 'notes',       label: 'Notes & Reminders', description: 'Personal notes, tasks, reminders, and alarms.', example: 'Remind me to take medicines at 8pm.',  status: 'offline', color: 'from-violet-400 to-purple-600' },
  { id: 'socialmedia', label: 'Social Media',      description: 'YouTube channels and Instagram accounts — views, subs, likes.', example: 'How did my channels perform today?', status: 'offline', color: 'from-purple-400 to-pink-500' },
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
  refreshGoogleToken?: () => Promise<void>,
  agentVoiceConfig?: AgentVoiceMap,
  refreshPortfolioToken?: () => Promise<void>,
) {
  const wakeWord      = appConfig?.wakeWord      ?? 'Robo';
  const callingName   = appConfig?.callingName   ?? 'Master';
  const assistantName = appConfig?.assistantName ?? 'Robo';

  /* ── Voice + audio ──────────────────────────────────────────────── */
  const { speechState, speak, stopSpeaking, listenOnce, stopListening, sttSupported, ttsSupported,
          voiceListenerActive, micEverStarted, lastHeardText } =
    useVoice(voiceConfig, agentVoiceConfig);
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
  const [isAutoListening, setIsAutoListening]     = useState(false);
  const [pendingAlerts, setPendingAlerts]         = useState<WsAlert[]>([]);

  /* ── Always-current refs ────────────────────────────────────────── */
  const wsRef              = useRef<WebSocket | null>(null);
  const wsConnectedRef     = useRef(false);
  const registeredIdsRef    = useRef(registeredAgentIds);
  registeredIdsRef.current  = registeredAgentIds;
  const prevAgentIdsRef     = useRef<Set<string>>(new Set(registeredAgentIds));
  const systemStatsRef     = useRef<SystemStats>(systemStats);
  systemStatsRef.current   = systemStats;
  const callingNameRef     = useRef(callingName);
  callingNameRef.current   = callingName;
  const assistantNameRef   = useRef(assistantName);
  assistantNameRef.current = assistantName;
  const wakeWordRef        = useRef(wakeWord);
  wakeWordRef.current      = wakeWord;
  const agentVoiceConfigRef   = useRef(agentVoiceConfig);
  agentVoiceConfigRef.current = agentVoiceConfig;
  const voiceProviderRef   = useRef(voiceProviderConfig);
  voiceProviderRef.current = voiceProviderConfig;
  const llmConfigRef       = useRef(llmConfig);
  llmConfigRef.current     = llmConfig;
  const agentConfigRef     = useRef(agentConfig);
  agentConfigRef.current   = agentConfig;
  const refreshGoogleTokenRef = useRef(refreshGoogleToken);
  refreshGoogleTokenRef.current = refreshGoogleToken;
  const refreshPortfolioTokenRef = useRef(refreshPortfolioToken);
  refreshPortfolioTokenRef.current = refreshPortfolioToken;
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
  const appendTurn = useCallback((speaker: TranscriptTurn['speaker'], text: string, agentId?: string) => {
    setTranscript((prev) => [...prev, { speaker, text, timestamp: nowIso(), agentId }]);
  }, []);

  const updateAgent = useCallback((id: string, status: AgentDefinition['status']) => {
    setAgents((prev) => {
      if (prev.some((a) => a.id === id)) {
        return prev.map((a) => (a.id === id ? { ...a, status } : a));
      }
      // Agent came from the server (e.g. always-on skill) but wasn't in the initial list — add from catalogue
      const entry = AGENT_CATALOGUE.find((a) => a.id === id);
      return entry ? [...prev, { ...entry, status }] : prev;
    });
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
        appendTurn('assistant', msg, agentId);
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
        appendTurn('assistant', text, agentId);
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

      case 'alert': {
        const wsAlert: WsAlert = {
          id:    String(payload.id ?? `alert-${Date.now()}`),
          title: String(payload.title ?? 'Reminder'),
          body:  String(payload.body ?? ''),
        };
        setPendingAlerts((prev) =>
          prev.some((a) => a.id === wsAlert.id) ? prev : [...prev, wsAlert],
        );
        break;
      }

      case 'agent_notification': {
        const text     = payload.text      as string;
        const agentId  = payload.agent_id  as string;
        const severity = (payload.severity  as string) ?? 'info';
        const condKey  = (payload.condition_key as string) ?? agentId;
        // Speak the notification and append to transcript
        pushNotification(text, agentId);
        // Dispatch custom DOM event so App.tsx can surface it visually
        window.dispatchEvent(new CustomEvent('agent-notification', {
          detail: { text, agentId, severity, conditionKey: condKey },
        }));
        break;
      }

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

  const {
    voiceEnabled,
    voiceEnabledRef,
    toggleVoice,
    enableVoice,
    wakeWordPattern,
    sleepPattern,
  } = useVoiceLoop({
    phase,
    sttSupported,
    wakeWord,
    listenOnce,
    stopListening,
    stopSpeaking,
    stopAudio,
    serverWakeWordEnabled: orchestratorCaps.wakeWord,
    onWakeDetected: (inlineCmd) => {
      if (inlineCmd) pendingCmdRef.current = inlineCmd;
      wakeRef.current();
    },
    pendingTranscriptRef,
    ttsQueueRef,
    autoListenRef,
    setIsAutoListening,
  });

  // Stop server audio when voice is muted (browser TTS/listening handled by useVoiceLoop)
  useEffect(() => {
    if (!voiceEnabled) {
      setIsPlayingServerAudio(false);
    }
  }, [voiceEnabled]);

  useEffect(() => {
    const newlyAdded = registeredAgentIds.filter((id) => !prevAgentIdsRef.current.has(id));
    prevAgentIdsRef.current = new Set(registeredAgentIds);

    setAgents((prev) =>
      agentsFromIds(registeredAgentIds).map((a) => ({
        ...a,
        status: prev.find((p) => p.id === a.id)?.status ?? 'offline',
      })),
    );

    // Hot-boot any newly enabled agents into an already-running session
    const inactive = new Set<string>(['standby', 'sleep']);
    if (newlyAdded.length > 0 && wsConnectedRef.current && !inactive.has(phaseRef.current)) {
      for (const id of newlyAdded) {
        wsSend('retry_agent', { agent: id });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredAgentIds.join(',')]);

  /* ── Server STT: record audio and send to orchestrator ─────────── */
  const recordAndTranscribeViaServer = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      pendingTranscriptRef.current = resolve;

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const fmt      = mimeType.includes('webm') ? 'webm' : 'mp4';
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];

        let hasSpeech  = false;
        let stopped    = false;
        let silenceId: ReturnType<typeof setTimeout> | null = null;
        let noSpeechId: ReturnType<typeof setTimeout> | null = null;
        let hardId: ReturnType<typeof setTimeout>     | null = null;
        let vadRec: any = null;

        const stopAll = () => {
          if (stopped) return;
          stopped = true;
          if (silenceId)  clearTimeout(silenceId);
          if (noSpeechId) clearTimeout(noSpeechId);
          if (hardId)     clearTimeout(hardId);
          try { vadRec?.abort(); } catch {}
          if (recorder.state === 'recording') recorder.stop();
        };

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          if (!hasSpeech) {
            // Nothing spoken — skip the server round-trip
            pendingTranscriptRef.current = null;
            resolve('');
            return;
          }
          const blob = new Blob(chunks, { type: mimeType });
          const b64  = await blobToBase64(blob);
          wsSend('audio_chunk', { data_b64: b64, format: fmt, is_final: true });
          // resolve() is called when 'transcript_final' arrives in handleWsEvent
        };

        // Use browser SpeechRecognition as a pure VAD (voice-activity detector).
        // AudioContext.getByteTimeDomainData() returns flat 128s when Chrome suspends
        // the AudioContext before a user gesture, making level-based VAD unreliable.
        // SpeechRecognition has no autoplay restrictions — it reliably fires onresult
        // when speech starts and onend when it stops, regardless of AudioContext state.
        const SttCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SttCtor) {
          vadRec                = new SttCtor();
          vadRec.continuous     = true;   // stays open across mid-sentence pauses
          vadRec.interimResults = true;   // every word resets the silence timer
          vadRec.lang           = 'en-US';

          // No speech detected within 4 s → give up, don't bother Whisper
          noSpeechId = setTimeout(() => { if (!hasSpeech) stopAll(); }, 4000);
          // Hard cap — never record more than 12 s
          hardId     = setTimeout(stopAll, 12000);

          vadRec.onresult = () => {
            hasSpeech = true;
            if (noSpeechId) { clearTimeout(noSpeechId); noSpeechId = null; }
            // 1.5 s of silence after the last detected word → done
            if (silenceId) clearTimeout(silenceId);
            silenceId = setTimeout(stopAll, 1500);
          };

          vadRec.onend = () => {
            if (stopped) return;
            // Chrome may end continuous STT unexpectedly; give it 250 ms before
            // restarting so the audio pipeline is fully released between sessions.
            if (!hasSpeech) setTimeout(() => {
              if (!stopped && !hasSpeech) try { vadRec.start(); } catch {}
            }, 250);
            // if hasSpeech: silenceId timer handles the stop
          };

          vadRec.onerror = (e: any) => {
            if (stopped || ['aborted', 'no-speech'].includes(e?.error ?? '')) return;
            if (!hasSpeech) setTimeout(() => {
              if (!stopped && !hasSpeech) try { vadRec.start(); } catch {}
            }, 250);
          };

          try { vadRec.start(); } catch {
            // SpeechRecognition start failed — fall back to 7 s fixed window
            if (hardId) clearTimeout(hardId);
            hardId = setTimeout(stopAll, 7000);
          }
        } else {
          // No browser STT available — fixed 7 s window
          hardId = setTimeout(stopAll, 7000);
        }

        recorder.start(100);
      }).catch(() => {
        pendingTranscriptRef.current = null;
        resolve('');
      });
    });
  }, [wsSend]);

  /* ── triggerWakeWord ────────────────────────────────────────────── */
  const triggerWakeWord = useCallback(async () => {
    autoListenRef.current = true;   // enable Alexa-style auto-listen for this session
    setIsAutoListening(true);
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
      let ac  = agentConfigRef.current;

      // Refresh Google and Portfolio tokens silently before boot if expired or expiring within 90 s.
      // Uses refs so the callback always calls the latest version, not a stale closure.
      const refreshes: Promise<void>[] = [];
      if (
        refreshGoogleTokenRef.current &&
        ac?.google.accessToken &&
        ac.google.tokenExpiresAt > 0 &&
        ac.google.tokenExpiresAt < Date.now() + 90_000
      ) {
        refreshes.push(refreshGoogleTokenRef.current());
      }
      if (
        refreshPortfolioTokenRef.current &&
        ac?.portfolio.refreshToken &&
        ac.portfolio.tokenExpiresAt > 0 &&
        ac.portfolio.tokenExpiresAt < Date.now() + 90_000
      ) {
        refreshes.push(refreshPortfolioTokenRef.current());
      }
      if (refreshes.length > 0) {
        await Promise.allSettled(refreshes);
        // Yield to event loop so React can flush the patch() state updates before we read the ref
        await pause(50);
        ac = agentConfigRef.current;
      }

      wsSend('start_session', {
        assistant_name:    assistantNameRef.current,
        calling_name:      callingNameRef.current,
        registered_agents: registeredIdsRef.current,
        agent_voices: agentVoiceConfigRef.current
          ? Object.fromEntries(
              Object.entries(agentVoiceConfigRef.current).map(([id, v]) => [
                id,
                { openai_voice: v.openaiVoice, speed: v.speed },
              ])
            )
          : {},
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
          smarthome: {
            mode:     ac.smarthome.mode,
            endpoint: ac.smarthome.endpoint,
            token:    ac.smarthome.token,
          },
          portfolio: {
            client_id:     ac.portfolio.clientId,
            client_secret: ac.portfolio.clientSecret,
            access_token:  ac.portfolio.accessToken,
            refresh_token: ac.portfolio.refreshToken,
            expires_at:    ac.portfolio.tokenExpiresAt,
          },
          whatsapp: {
            phone_number_id:      ac.whatsapp.phoneNumberId,
            access_token:         ac.whatsapp.accessToken,
            webhook_verify_token: ac.whatsapp.webhookVerifyToken,
            contacts:             ac.whatsapp.contacts,
          },
          socialmedia: {
            accounts: ac.socialmedia.accounts.map(({ refreshToken: _r, tokenExpiresAt: _e, googleEmail: _g, ...safe }) => safe),
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
    // Block only when no explicit text AND already listening (prevents double-listen)
    if (!input && phaseRef.current === 'listening') return;

    let text = (input ?? command).trim();

    // Typed command arrived while mic was open — stop it and unblock server-STT
    if (input && phaseRef.current === 'listening') {
      stopListening();
      if (pendingTranscriptRef.current) {
        pendingTranscriptRef.current('');
        pendingTranscriptRef.current = null;
      }
    }

    if (!text) {
      setPhase('listening');
      setAssistantSpeech('Listening…');
      if (!autoListenRef.current) {
        appendTurn('system', 'Microphone active. Listening for command.');
      }

      if (wsConnectedRef.current && orchestratorCapsRef.current.stt) {
        text = await recordAndTranscribeViaServer();
      } else if (sttSupported) {
        text = await listenOnce(20000, { continuous: true });
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
        // Auto-listen mode: silently cycle back — keep waiting for the next command.
        // Manual listen mode: pause and show a hint so the user knows to try again.
        if (!autoListenRef.current) {
          setAssistantSpeech(`Listening paused. Say "${wakeWordRef.current}, Wake Up" or press Wake Up.`);
        }
        setPhase('ready');
        return;
      }

      // Strip optional wake-word prefix so "Robo, what's the time?" → "what's the time?".
      // If no prefix is present the text passes through unchanged — once the session
      // is live the user can speak commands directly without repeating the wake word.
      // Reduce to alphanumeric only before embedding in RegExp (mirrors wakeWordPattern/sleepPattern).
      const safeWake = wakeWordRef.current.replace(/[^a-z0-9]/gi, '');
      const wakePfx = new RegExp(
        `^(?:hey[,\\s]+|hello[,\\s]+)?\\b${safeWake}t?\\b[,\\s]*`,
        'i',
      );
      const stripped = text.replace(wakePfx, '').trim();

      if (!stripped) {
        // User spoke only the wake word with nothing after it — prompt for the command.
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
      if (wsConnectedRef.current) wsSend('stop_session');
      // Route through drainTTSQueue so ttsActiveRef stays true while speech plays.
      // This defers doSleep until the farewell finishes — direct speak() bypasses the
      // ttsActiveRef guard, causing phase_changed:sleep to fire mid-sentence.
      pendingPhaseRef.current = 'sleep';
      enqueueTTS({ text: farewell });
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
  }, [command, speak, listenOnce, stopListening, appendTurn, sttSupported, wsSend, recordAndTranscribeViaServer, sleepPattern]);

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
      // Pass '' (not undefined) when no pending command so ask() opens the mic
      // instead of submitting whatever the user has typed in the input field.
      askRef.current(cmd ?? '');
    }, 300); // 300 ms gap lets TTS settle before mic opens
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceEnabled]);

  /* ── doSleep — full sleep cleanup, usable from TTS drain or directly ── */
  const doSleep = useCallback(() => {
    autoListenRef.current   = false;    // stop auto-listen when session ends
    setIsAutoListening(false);
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

  // Proactive notification: add to transcript and speak if voice is active in a live session
  const pushNotification = useCallback((text: string, agentId: string) => {
    appendTurn('assistant', text, agentId);
    const canSpeak = voiceEnabledRef.current
      && phaseRef.current !== 'standby'
      && phaseRef.current !== 'sleep';
    if (canSpeak) enqueueTTS({ text, agentId });
  }, [appendTurn, enqueueTTS]);

  /* ── scheduleAlert — frontend-initiated, backend fires after delay ── */
  const scheduleAlert = useCallback((
    title: string,
    body: string,
    delaySeconds: number,
    id?: string,
  ) => {
    const alertId = id ?? `alert-${Date.now()}`;
    wsSend('schedule_alert', {
      id:             alertId,
      title,
      body,
      delay_seconds:  Math.max(1, Math.min(delaySeconds, 86400)),
    });
  }, [wsSend]);

  /* ── clearPendingAlert — removes from local queue after handled ── */
  const clearPendingAlert = useCallback((id: string) => {
    setPendingAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

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
    isAutoListening,
    pushNotification,
    speak,
    pendingAlerts,
    clearPendingAlert,
    scheduleAlert,
  };
}
