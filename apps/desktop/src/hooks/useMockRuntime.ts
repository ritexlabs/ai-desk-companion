import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentDefinition, RuntimePhase, TranscriptTurn } from '../types/runtime';
import { nowIso, partOfDayFromHour } from '../lib/utils';
import { useVoice } from './useVoice';
import type { VoiceConfig } from './useVoiceConfig';
import type { AppConfig } from './useAppConfig';
import type { LLMConfig } from './useLLMConfig';
import { callLLMSafe } from '../services/llm';
import { useSystemStats, systemHealthSummary } from './useSystemStats';
import type { SystemStats } from './useSystemStats';

/**
 * Dynamic greeting suffixes — picked randomly each wake-up.
 * Comma (not period) after the calling name so TTS flows as one
 * continuous sentence without a hard pause mid-greeting.
 */
const GREETING_SUFFIXES = [
  'wonderful to have you back',
  'your systems are all online and ready',
  'all agents are standing by for your command',
  "I've been waiting for you",
  'ready to assist you at full capacity',
  'your digital companion is at your service',
  "it's great to have you back online",
  'everything is looking good on my end',
  'fully operational and at your command',
  "let's make this a productive session",
  'your personal AI is fired up and ready',
  'running at peak performance, ready when you are',
  'all systems nominal, awaiting your instructions',
  'I have everything ready and waiting for you',
];

function randomGreeting(timeOfDay: string, name: string): string {
  const suffix = GREETING_SUFFIXES[Math.floor(Math.random() * GREETING_SUFFIXES.length)];
  // Comma after name (not period) — prevents TTS from inserting a sentence-boundary pause
  return `${timeOfDay}, ${name}, ${suffix}.`;
}

/** Full catalogue — only registered IDs are shown in the UI / booted */
const AGENT_CATALOGUE: AgentDefinition[] = [
  {
    id: 'weather',
    label: 'Weather',
    description: 'Forecasts, current conditions, humidity, and travel weather.',
    example: 'How is the weather today?',
    status: 'offline',
    color: 'from-cyan-400 to-sky-500',
  },
  {
    id: 'system',
    label: 'System',
    description: 'OS detection, CPU cores, battery, network health, and JS heap vitals.',
    example: 'What is my system health?',
    status: 'offline',
    color: 'from-teal-400 to-cyan-500',
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    description: 'Meetings, reminders, next event, and free/busy view.',
    example: 'What is my next meeting?',
    status: 'offline',
    color: 'from-violet-400 to-fuchsia-500',
  },
  {
    id: 'email',
    label: 'Google Email',
    description: 'Unread emails, urgent sender summaries, and inbox status.',
    example: 'Do I have any urgent emails?',
    status: 'offline',
    color: 'from-emerald-400 to-teal-500',
  },
  {
    id: 'github',
    label: 'GitHub',
    description: 'Pull requests, issues, repo activity, and workflow status.',
    example: 'Any failed GitHub workflows?',
    status: 'offline',
    color: 'from-amber-400 to-orange-500',
  },
];

function agentsFromIds(ids: string[]): AgentDefinition[] {
  return AGENT_CATALOGUE.filter((a) => ids.includes(a.id));
}

function classify(text: string): string {
  const t = text.toLowerCase();
  if (/(weather|temperature|rain|forecast|humidity|wind|sunny|cloudy|storm)/.test(t))
    return 'weather';
  if (/(system|cpu|processor|cores|memory|ram|battery|network|health|os|operating system|performance|hardware|heap|connection|online|offline|disk|storage|uptime)/.test(t))
    return 'system';
  if (/(calendar|meeting|schedule|appointment|event|free slot|agenda|reminder)/.test(t))
    return 'calendar';
  if (/(email|mail|inbox|unread|sender|message|gmail|newsletter)/.test(t))
    return 'email';
  if (/(github|repo|repository|pull request|\bpr\b|issue|commit|branch|workflow|ci|pipeline)/.test(t))
    return 'github';
  return 'general';
}

function responseFor(route: string, text: string, systemStats?: SystemStats): string {
  switch (route) {
    case 'weather':
      return 'Weather agent responding: It is currently 24 degrees Celsius with partly cloudy skies and a pleasant breeze. Looks like a great evening ahead!';
    case 'system':
      return systemStats
        ? `System agent responding: ${systemHealthSummary(systemStats)}`
        : 'System agent responding: Collecting system vitals, please try again in a moment.';
    case 'calendar':
      return 'Calendar agent responding: Your next meeting is a team stand-up in 35 minutes. You have 3 more events scheduled for today.';
    case 'email':
      return 'Email agent responding: You have 6 unread messages, including 2 marked urgent from your manager. Shall I read them out?';
    case 'github':
      return 'GitHub agent responding: 3 pull requests are awaiting your review, and 1 workflow run failed on the main branch.';
    default:
      return `I can help with that. ${text ? `You asked about "${text}". ` : ''}Try asking about weather, system health, calendar, email, or GitHub for specialized answers.`;
  }
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ROBO_SYSTEM = (name: string, agents: string[]) =>
  `You are Robo, a futuristic AI voice desktop assistant. Address the user as ${name}. ` +
  `Respond in 1-2 natural sentences (max 35 words). ` +
  `Your response will be read aloud so avoid markdown, bullets, or special characters. ` +
  `Be helpful, warm, and efficient. Active agents: ${agents.join(', ')}.`;

const GREETING_SYSTEM = (name: string, timeOfDay: string) =>
  `You are Robo, an AI assistant waking up. Generate exactly one natural greeting sentence. ` +
  `Time: ${timeOfDay}. Start with "${timeOfDay}, ${name}," — use a comma after the name, ` +
  `NOT a period (a period causes a TTS pause). Add a creative 5-8 word suffix. ` +
  `No quotes, no markdown, no extra sentences.`;

export function useMockRuntime(
  voiceConfig?: VoiceConfig,
  appConfig?: AppConfig,
  registeredAgentIds: string[] = ['weather', 'system'],
  llmConfig?: LLMConfig,
) {
  const wakeWord    = appConfig?.wakeWord    ?? 'Wakeup Robo';
  const callingName = appConfig?.callingName ?? 'Master';

  const wakeWordPattern = useMemo(() => {
    const escaped = wakeWord
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .join('[\\s\\-]*');
    return new RegExp(escaped, 'i');
  }, [wakeWord]);

  const [phase, setPhase]                   = useState<RuntimePhase>('standby');
  const [heard, setHeard]                   = useState(`Waiting for "${wakeWord}"…`);
  const [assistantSpeech, setAssistantSpeech] = useState(
    `System idle. Say "${wakeWord}" or press Wake Up.`,
  );
  const [command, setCommand]       = useState('');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agents, setAgents]         = useState<AgentDefinition[]>(() =>
    agentsFromIds(registeredAgentIds),
  );
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([
    { speaker: 'system', text: 'Voice shell initialized. Standby mode active.', timestamp: nowIso() },
  ]);

  const { speechState, speak, stopSpeaking, listenOnce, startContinuousListening, sttSupported, ttsSupported } =
    useVoice(voiceConfig);

  const systemStats = useSystemStats();

  // Always-current references — avoids stale closures in async callbacks
  const registeredIdsRef = useRef<string[]>(registeredAgentIds);
  registeredIdsRef.current = registeredAgentIds;

  const llmConfigRef = useRef<LLMConfig | undefined>(llmConfig);
  llmConfigRef.current = llmConfig;

  const systemStatsRef = useRef<SystemStats>(systemStats);
  systemStatsRef.current = systemStats;

  // Sync agent list when the registry changes (user connects/disconnects in settings)
  useEffect(() => {
    setAgents((prev) =>
      agentsFromIds(registeredAgentIds).map((a) => ({
        ...a,
        status: prev.find((p) => p.id === a.id)?.status ?? 'offline',
      })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredAgentIds.join(',')]);

  const appendTurn = useCallback((speaker: TranscriptTurn['speaker'], text: string) => {
    setTranscript((prev) => [...prev, { speaker, text, timestamp: nowIso() }]);
  }, []);

  const updateAgent = useCallback((id: string, status: AgentDefinition['status']) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  // Keep a ref so the wake-listener effect doesn't cycle on triggerWakeWord identity
  const wakeRef = useRef<() => void>(() => {});

  // Always-on wake-word listener when in standby or sleep
  useEffect(() => {
    if (!sttSupported) return;
    if (phase !== 'standby' && phase !== 'sleep') return;

    const stop = startContinuousListening((text) => {
      if (wakeWordPattern.test(text)) {
        stop();
        wakeRef.current();
      }
    });

    return stop;
  }, [phase, sttSupported, startContinuousListening, wakeWordPattern]);

  const triggerWakeWord = useCallback(async () => {
    setPhase('wake_detected');
    setHeard(wakeWord);
    setAssistantSpeech('Wake word detected. Initializing voice shell.');
    appendTurn('system', 'Wake phrase detected. Starting session.');

    // Short visual pause so wake-detected state renders before booting
    await pause(350);
    setPhase('booting');

    // Build boot list from whatever is registered right now
    const activeCatalogue = agentsFromIds(registeredIdsRef.current);
    // Reset all agents to offline before announcing them
    setAgents(activeCatalogue.map((a) => ({ ...a, status: 'offline' as const })));

    // Generate greeting — LLM if configured, otherwise random local fallback
    const tod = partOfDayFromHour();
    const llm = llmConfigRef.current;
    const llmGreeting =
      llm?.status === 'connected'
        ? await callLLMSafe(llm, `Generate the greeting now.`, GREETING_SYSTEM(callingName, tod), 60, 5000)
        : null;
    const greeting = llmGreeting ?? randomGreeting(tod, callingName);

    const n = activeCatalogue.length;
    const bootLines: Array<{ text: string; agentId?: string }> = [
      { text: greeting },
      { text: `Starting ${n} agent${n !== 1 ? 's' : ''}.` },
      ...activeCatalogue.map((a) => ({
        text: `${a.label} agent, online.`,
        agentId: a.id,
      })),
      { text: `All ${n} agent${n !== 1 ? 's' : ''} are online and ready for your command.` },
    ];

    for (let i = 0; i < bootLines.length; i++) {
      const { text: msg, agentId } = bootLines[i];
      setAssistantSpeech(msg);
      appendTurn('assistant', msg);
      if (agentId) updateAgent(agentId, 'online');

      // Pause before every utterance (including the first) so that pending
      // React state updates flush and the TTS engine initialises before we
      // queue audio.  First line gets a slightly longer gap so the booting
      // UI renders visibly before Robo starts speaking.
      await pause(i === 0 ? 300 : 200);
      await speak(msg);
    }

    setPhase('ready');
  }, [callingName, wakeWord, speak, appendTurn, updateAgent]);

  // Keep wakeRef pointing to latest version
  useEffect(() => {
    wakeRef.current = triggerWakeWord;
  }, [triggerWakeWord]);

  const ask = useCallback(
    async (input?: string) => {
      let text = (input ?? command).trim();

      if (!text) {
        if (!sttSupported) return;
        setPhase('listening');
        setAssistantSpeech('Listening… speak your command now.');
        appendTurn('system', 'Microphone active. Listening for command.');
        text = await listenOnce(8000);
        if (!text) {
          setAssistantSpeech('No input detected. Ready for your command.');
          setPhase('ready');
          return;
        }
      }

      setHeard(text);
      appendTurn('user', text);
      setPhase('thinking');
      setAssistantSpeech('Processing your request…');

      const route = classify(text);
      setActiveAgentId(route === 'general' ? null : route);
      await pause(400);

      setPhase('responding');
      const llm = llmConfigRef.current;
      const activeAgentLabels = agentsFromIds(registeredIdsRef.current).map((a) => a.label);
      const llmResponse =
        llm?.status === 'connected'
          ? await callLLMSafe(llm, text, ROBO_SYSTEM(callingName, activeAgentLabels), 120, 10000)
          : null;
      const response = llmResponse ?? responseFor(route, text, systemStatsRef.current);
      setAssistantSpeech(response);
      appendTurn('assistant', response);
      await speak(response);

      setPhase('ready');
      setCommand('');
      setActiveAgentId(null);
    },
    [command, speak, listenOnce, appendTurn, sttSupported],
  );

  const sleep = useCallback(() => {
    stopSpeaking();
    setPhase('sleep');
    // Reset to current registered agents (offline) — not the full catalogue
    setAgents(agentsFromIds(registeredIdsRef.current).map((a) => ({ ...a, status: 'offline' as const })));
    setActiveAgentId(null);
    setAssistantSpeech(`Sleep mode active. Say "${wakeWord}" or press Wake Up to reactivate.`);
    appendTurn('system', 'Session ended. Returning to sleep mode.');
  }, [stopSpeaking, appendTurn, wakeWord]);

  return {
    phase,
    heard,
    assistantSpeech,
    speechState,
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
  };
}
