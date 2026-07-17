import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bell,
  Briefcase,
  Calendar,
  Cloud,
  Cpu,
  Github,
  Home,
  Mail,
  Mic,
  MicOff,
  Moon,
  Newspaper,
  Power,
  RotateCw,
  Send,
  Settings,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { AgentOrbit3D } from './components/AgentOrbit3D';
import { WaveVisualizer } from './components/WaveVisualizer';
import { HoloChat } from './components/HoloChat';
import { AgentDetailModal } from './components/AgentDetailModal';
import { SmartHomeDashboard }   from './components/SmartHomeDashboard';
import { PortfolioDashboard }   from './components/PortfolioDashboard';
import { StocksPortfolio }      from './components/StocksPortfolio';
import { WhatsAppDashboard }    from './components/WhatsAppDashboard';
import { NotesDashboard }       from './components/NotesDashboard';
import { ReminderAlert }        from './components/ReminderAlert';
import { ForecastStrip, WeatherLine } from './components/WeatherWidget';
import { AgentConfigModal }     from './components/AgentConfigModal';
import { useReminders }         from './hooks/useReminders';
import { ParticleField } from './components/ParticleField';
import { TypingText } from './components/TypingText';
import { SettingsPanel } from './components/SettingsPanel';
import { useOrchestratorRuntime } from './hooks/useOrchestratorRuntime';
import { useVoiceConfig } from './hooks/useVoiceConfig';
import { useAppConfig } from './hooks/useAppConfig';
import { useAgentConfig } from './hooks/useAgentConfig';
import { useLLMConfig } from './hooks/useLLMConfig';
import { useVoiceProviderConfig } from './hooks/useVoiceProviderConfig';
import type { RuntimePhase } from './types/runtime';
import { useOrchSystemStats } from './hooks/useOrchSystemStats';
import { useProactiveNotifications } from './hooks/useProactiveNotifications';
import { useAgentVoiceConfig } from './hooks/useAgentVoiceConfig';

/* ─── helpers ──────────────────────────────────────────────── */

interface UpcomingReminder { id: string; title: string; due_at: number; }

function minsLeft(due_at: number): string {
  const secs = due_at - Date.now() / 1000;
  if (secs <= 60) return 'in < 1 min';
  return `in ${Math.ceil(secs / 60)} min`;
}

const PHASE_LABEL: Record<RuntimePhase, string> = {
  standby: 'Standby', sleep: 'Sleep', wake_detected: 'Activating',
  booting: 'Booting Agents', ready: 'Ready', listening: 'Listening',
  thinking: 'Thinking', responding: 'Responding', error: 'Error',
};

const PHASE_BADGE: Record<RuntimePhase, string> = {
  standby: 'border-slate-600/40 bg-slate-600/10 text-slate-400',
  sleep: 'border-slate-700/40 bg-slate-700/10 text-slate-500',
  wake_detected: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300',
  booting: 'border-violet-400/40 bg-violet-400/10 text-violet-300',
  ready: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  listening: 'border-violet-400/40 bg-violet-400/10 text-violet-300',
  thinking: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  responding: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
};

const PHASE_DOT: Record<RuntimePhase, string> = {
  standby: 'bg-slate-600', sleep: 'bg-slate-700', wake_detected: 'bg-cyan-400',
  booting: 'bg-violet-400', ready: 'bg-emerald-400', listening: 'bg-violet-400',
  thinking: 'bg-amber-400', responding: 'bg-cyan-300', error: 'bg-red-500',
};

/** Ambient glow color that shifts with phase — applied to the entire background */
const PHASE_AMBIENT: Record<RuntimePhase, string> = {
  standby: 'rgba(34,211,238,0.10)',
  sleep: 'rgba(51,65,85,0.06)',
  wake_detected: 'rgba(34,211,238,0.20)',
  booting: 'rgba(34,211,238,0.16)',
  ready: 'rgba(52,211,153,0.14)',
  listening: 'rgba(167,139,250,0.18)',
  thinking: 'rgba(251,191,36,0.14)',
  responding: 'rgba(34,211,238,0.20)',
  error: 'rgba(239,68,68,0.14)',
};

function waveColor(p: RuntimePhase): 'cyan' | 'violet' | 'amber' | 'emerald' {
  if (p === 'listening') return 'violet';
  if (p === 'thinking') return 'amber';
  if (p === 'ready') return 'emerald';
  return 'cyan';
}

function useClock() {
  const [t, setT] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const id = setInterval(() => setT(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

/* LogRow replaced by HoloChat component */

/* ─── Quick Stats helpers ───────────────────────────────────── */

function StatRow({ label, value, hi, spread }: { label: string; value: string; hi?: 'ok' | 'warn' | 'err'; spread?: boolean }) {
  const vc = hi === 'ok' ? 'text-emerald-400' : hi === 'warn' ? 'text-amber-400' : hi === 'err' ? 'text-red-400' : 'text-teal-300';
  return (
    <div className={`flex items-center gap-1 min-w-0 ${spread ? 'justify-between' : ''}`}>
      <span className="text-[10px] text-slate-500 flex-shrink-0 min-w-[48px]">{label}</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={value}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18 }}
          className={`text-[10px] font-medium tabular-nums truncate ${vc}`}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-[10px] text-slate-500 flex-shrink-0">{label}</span>
      <span className={`text-[10px] font-medium ${ok ? 'text-emerald-400' : 'text-slate-600'}`}>{ok ? 'OK' : '—'}</span>
    </div>
  );
}

const AGENT_PILL_META: Record<string, { icon: LucideIcon; text: string; bg: string; border: string }> = {
  weather:   { icon: Cloud,      text: 'text-cyan-400',    bg: 'bg-cyan-400/10',    border: 'border-cyan-400/20' },
  calendar:  { icon: Calendar,   text: 'text-violet-400',  bg: 'bg-violet-400/10',  border: 'border-violet-400/20' },
  email:     { icon: Mail,       text: 'text-rose-400',    bg: 'bg-rose-400/10',    border: 'border-rose-400/20' },
  github:    { icon: Github,     text: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/20' },
  stock:     { icon: TrendingUp, text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  news:      { icon: Newspaper,  text: 'text-sky-400',     bg: 'bg-sky-400/10',     border: 'border-sky-400/20' },
  smarthome: { icon: Home,       text: 'text-orange-400',  bg: 'bg-orange-400/10',  border: 'border-orange-400/20' },
  portfolio: { icon: Briefcase,  text: 'text-rose-400',    bg: 'bg-rose-400/10',    border: 'border-rose-400/20' },
  whatsapp:  { icon: Send,       text: 'text-green-400',   bg: 'bg-green-400/10',   border: 'border-green-400/20' },
  notes:     { icon: Bell,       text: 'text-violet-400',  bg: 'bg-violet-400/10',  border: 'border-violet-400/20' },
  general:   { icon: Zap,        text: 'text-violet-400',  bg: 'bg-violet-400/10',  border: 'border-violet-400/20' },
};

/* ─── App ───────────────────────────────────────────────────── */

export default function App() {
  const { config: voiceConfig, update: updateVoiceConfig, voices } = useVoiceConfig();
  const { config: appConfig, update: updateAppConfig } = useAppConfig();
  const {
    config: agentConfig,
    patch: patchAgent,
    registeredAgentIds,
    verifyWeather,
    connectGoogle,
    disconnectGoogle,
    refreshGoogleToken,
    verifyGitHub,
    disconnectGitHub,
    verifyNews,
    verifySmartHome,
    connectPortfolio,
    disconnectPortfolio,
    refreshPortfolioToken,
    verifyWhatsApp,
    checkTunnelStatus,
    startTunnel,
    stopTunnel,
  } = useAgentConfig();
  const {
    config: llmConfig,
    update: updateLLM,
    verify: verifyLLM,
    disconnect: disconnectLLM,
  } = useLLMConfig();
  const {
    config: voiceProviderConfig,
    update: updateVoiceProvider,
    testTTS,
    disconnect: disconnectProviders,
  } = useVoiceProviderConfig();
  const { agentVoices, updateAgentVoice, resetAgentVoice } = useAgentVoiceConfig();
  const rt = useOrchestratorRuntime(voiceConfig, appConfig, registeredAgentIds, llmConfig, voiceProviderConfig, agentConfig, refreshGoogleToken, agentVoices, refreshPortfolioToken);
  const orchSys = useOrchSystemStats(5000);
  const clock = useClock();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentConfigOpen, setAgentConfigOpen] = useState(false);

  useProactiveNotifications(agentConfig, ({ text, agentId }) => rt.pushNotification(text, agentId));

  const notificationsEnabledFor = (agentId: string): boolean => {
    if (agentId === 'system')    return agentConfig.system.notificationsEnabled;
    if (agentId === 'email')     return agentConfig.google.emailNotificationsEnabled;
    if (agentId === 'news')      return agentConfig.news.notificationsEnabled;
    if (agentId === 'smarthome') return agentConfig.smarthome.notificationsEnabled;
    return false;
  };

  const toggleNotificationsFor = (agentId: string, enabled: boolean) => {
    if (agentId === 'system')    patchAgent('system', { notificationsEnabled: enabled });
    if (agentId === 'email')     patchAgent('google', { emailNotificationsEnabled: enabled });
    if (agentId === 'news')      patchAgent('news',   { notificationsEnabled: enabled });
    if (agentId === 'smarthome') patchAgent('smarthome', { notificationsEnabled: enabled });
  };

  // Safari (and any WebKit browser without Chrome) blocks speechSynthesis.speak()
  // until the page has received a user gesture. Show a one-time unlock overlay.
  const [audioUnlocked, setAudioUnlocked] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  });
  const unlockAudio = () => {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.rate = 10;
      window.speechSynthesis.speak(u);
    }
    setAudioUnlocked(true);
  };

  /* HoloChat handles its own scroll-to-bottom */

  const isActive = rt.phase !== 'standby' && rt.phase !== 'sleep';
  const isSpeaking = rt.speechState === 'speaking' || rt.isPlayingServerAudio;
  // During auto-listen the phase briefly returns to 'ready' between cycles; treat it as 'listening' in the UI
  const isListening = rt.speechState === 'listening' || (rt.isAutoListening && rt.phase === 'ready');
  const displayPhase: typeof rt.phase = rt.isAutoListening && rt.phase === 'ready' ? 'listening' : rt.phase;
  const waveActive = isSpeaking || isListening || rt.phase === 'responding' || rt.phase === 'thinking';
  const waveIntensity = isSpeaking ? 1.0 : rt.phase === 'responding' ? 0.9 : isListening ? 0.6 : rt.phase === 'thinking' ? 0.32 : 0.0;
  const ambient = PHASE_AMBIENT[displayPhase];
  const systemOnline = rt.agents.find((a) => a.id === 'system')?.status === 'online';
  const onlineAgents = rt.agents.filter((a) => a.id !== 'system' && a.status === 'online');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const selectedAgent = selectedAgentId ? rt.agents.find((a) => a.id === selectedAgentId) : null;
  const [smartHomeDashboardOpen,   setSmartHomeDashboardOpen]   = useState(false);
  const [portfolioDashboardOpen,   setPortfolioDashboardOpen]   = useState(false);
  const [stocksPortfolioOpen,      setStocksPortfolioOpen]      = useState(false);
  const [whatsappDashboardOpen,    setWhatsappDashboardOpen]    = useState(false);
  const [notesDashboardOpen,       setNotesDashboardOpen]       = useState(false);
  const [portfolioPnlPct,          setPortfolioPnlPct]          = useState<number | null>(null);
  const [upcomingReminders,        setUpcomingReminders]        = useState<UpcomingReminder[]>([]);

  // Poll for reminders due within 5 minutes
  useEffect(() => {
    const check = async () => {
      try {
        const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
        const res  = await fetch(`${base}/api/notes?include_completed=false`);
        if (!res.ok) return;
        const { items = [] } = await res.json();
        const now      = Date.now() / 1000;
        const cutoff   = now + 5 * 60;
        const today    = new Date().toISOString().slice(0, 10);
        const upcoming: UpcomingReminder[] = [];
        for (const item of items) {
          if (item.completed) continue;
          if (item.type === 'note') continue;

          // Snoozed items: show flash using snoozed_until as the effective due time
          if (item.snoozed_until && item.snoozed_until > now && item.snoozed_until <= cutoff) {
            upcoming.push({ id: item.id, title: item.title, due_at: item.snoozed_until });
            continue;
          }

          if (item.fired) continue;

          // One-time due_at items (reminder, task, onetime alarm)
          if (item.due_at && item.due_at > now && item.due_at <= cutoff) {
            upcoming.push({ id: item.id, title: item.title, due_at: item.due_at });
            continue;
          }
          // Recurring alarm: check if repeat_time is within 5 min from now
          if (item.type === 'alarm' && item.repeat !== 'onetime' && item.repeat_time) {
            if (item.last_fired_date === today) continue;
            const [h, m] = (item.repeat_time as string).split(':').map(Number);
            const alarm  = new Date();
            alarm.setHours(h, m, 0, 0);
            const secs = (alarm.getTime() - Date.now()) / 1000;
            if (secs > 0 && secs <= 5 * 60) {
              upcoming.push({ id: item.id, title: item.title, due_at: Math.floor(alarm.getTime() / 1000) });
            }
          }
        }
        upcoming.sort((a, b) => a.due_at - b.due_at);
        setUpcomingReminders(upcoming);
      } catch { /* backend offline */ }
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, []);

  // Fetch portfolio P&L when the agent comes online
  useEffect(() => {
    const portfolioAgent = rt.agents.find(a => a.id === 'portfolio');
    if (portfolioAgent?.status !== 'online') { setPortfolioPnlPct(null); return; }
    const token = agentConfig.portfolio.accessToken;
    if (!token) return;
    const backendBase = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
    fetch(`${backendBase}/api/portfolio/pnl?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => { if (d.ok && d.pnl_pct != null) setPortfolioPnlPct(d.pnl_pct); })
      .catch(() => {});
  }, [rt.agents, agentConfig.portfolio.accessToken]);

  // Auto-reload calendar + email agents when Google token is freshly provided
  const prevGoogleTokenRef = useRef('');
  useEffect(() => {
    const token = agentConfig.google.accessToken;
    if (token && !prevGoogleTokenRef.current && rt.wsConnected) {
      rt.reloadAgent('calendar');
      rt.reloadAgent('email');
    }
    prevGoogleTokenRef.current = token;
  }, [agentConfig.google.accessToken, rt.wsConnected]);

  const onPersonalizeAndSpeak = useCallback(async (name: string, title: string, body: string, type: string) => {
    const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787';
    const res  = await fetch(`${base}/api/notes/personalize-reminder`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, title, body, type }),
    });
    if (!res.ok) throw new Error('personalize failed');
    const { message } = await res.json() as { message: string };
    if (rt.wsConnected) {
      rt.speak(message);
    } else if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(message);
      utt.rate  = 0.88;
      utt.pitch = 1.05;
      window.speechSynthesis.speak(utt);
    }
  }, [rt.wsConnected, rt.speak]);

  const { visualAlerts, countdown: alertCountdown, dismissAlert, snoozeAlert, handleVoiceCommand } = useReminders({
    phase:                    rt.phase,
    enabled:                  true,
    voiceEnabled:             rt.voiceEnabled,
    callingName:              appConfig.callingName,
    externalAlerts:           rt.pendingAlerts,
    onExternalAlertConsumed:  rt.clearPendingAlert,
    onSpeak:                  rt.wsConnected ? (text) => rt.speak(text) : undefined,
    onPersonalizeAndSpeak,
  });

  // Intercept voice transcript for alert snooze / dismiss when an alert is active
  const prevTranscriptLenRef = useRef(0);
  useEffect(() => {
    const turns = rt.transcript;
    if (turns.length <= prevTranscriptLenRef.current) { prevTranscriptLenRef.current = turns.length; return; }
    prevTranscriptLenRef.current = turns.length;
    const last = turns[turns.length - 1];
    if (last?.speaker === 'user' && visualAlerts.length > 0) {
      handleVoiceCommand(last.text);
    }
  }, [rt.transcript, visualAlerts.length, handleVoiceCommand]);

  const handleAgentClick = (agentId: string) => {
    if (agentId === 'portfolio') {
      setPortfolioDashboardOpen(true);
    } else if (agentId === 'smarthome') {
      setSmartHomeDashboardOpen(true);
    } else if (agentId === 'stock') {
      setStocksPortfolioOpen(true);
    } else if (agentId === 'whatsapp') {
      setWhatsappDashboardOpen(true);
    } else if (agentId === 'notes') {
      setNotesDashboardOpen(true);
    } else {
      setSelectedAgentId(agentId);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#050816] text-white font-sans select-none">
      {/* ── Safari audio-unlock gate ─────────────────────────────── */}
      <AnimatePresence>
        {!audioUnlocked && (
          <motion.div
            key="audio-unlock"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            onClick={unlockAudio}
            className="fixed inset-0 z-[999] flex items-center justify-center bg-[#050816]/95 backdrop-blur-md cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.35, ease: 'easeOut' }}
              className="text-center px-8 py-10 rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl max-w-xs"
            >
              <div className="w-14 h-14 rounded-full bg-cyan-400/15 border border-cyan-400/30 flex items-center justify-center mx-auto mb-5">
                <Mic className="h-6 w-6 text-cyan-400" />
              </div>
              <p className="text-white font-semibold text-base mb-1">Tap to Enable Voice</p>
              <p className="text-slate-400 text-sm leading-relaxed">Safari requires a tap to unlock audio output before the assistant can speak.</p>
              <div className="mt-5 rounded-xl bg-cyan-400/10 border border-cyan-400/25 px-4 py-2 text-xs text-cyan-300">
                Click anywhere to continue
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Background ──────────────────────────────────────────── */}
      {/* Animated ambient colour that changes per phase */}
      <motion.div
        className="fixed inset-0"
        animate={{
          background: [
            `radial-gradient(ellipse 80% 50% at 50% -10%, ${ambient}, transparent)`,
          ],
        }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_55%_45%_at_80%_100%,rgba(168,85,247,0.09),transparent),radial-gradient(ellipse_45%_38%_at_10%_80%,rgba(52,211,153,0.06),transparent)]" />
      {/* Subtle grid */}
      <div className="fixed inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.2)_1px,transparent_1px)] [background-size:44px_44px]" />
      {/* Edge lines */}
      <div className="fixed top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
      <div className="fixed bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-400/35 to-transparent" />

      {/* Floating particles */}
      <ParticleField count={40} active={isActive} />

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenAgents={() => { setSettingsOpen(false); setAgentConfigOpen(true); }}
        appConfig={appConfig}
        onAppUpdate={updateAppConfig}
        voiceConfig={voiceConfig}
        onVoiceUpdate={updateVoiceConfig}
        voices={voices}
        onTestVoice={(text: string, agentId?: string) => rt.speak(text, agentId)}
        agentVoices={agentVoices}
        onAgentVoiceUpdate={updateAgentVoice}
        onAgentVoiceReset={resetAgentVoice}
        agentConfig={agentConfig}
        onAgentPatch={patchAgent}
        onVerifyWeather={verifyWeather}
        onConnectGoogle={connectGoogle}
        onDisconnectGoogle={disconnectGoogle}
        onVerifyGitHub={verifyGitHub}
        onDisconnectGitHub={disconnectGitHub}
        onVerifyNews={verifyNews}
        onVerifySmartHome={verifySmartHome}
        onConnectPortfolio={connectPortfolio}
        onDisconnectPortfolio={disconnectPortfolio}
        onRefreshPortfolio={refreshPortfolioToken}
        onVerifyWhatsApp={verifyWhatsApp}
        onCheckTunnel={checkTunnelStatus}
        onStartTunnel={startTunnel}
        onStopTunnel={stopTunnel}
        llmConfig={llmConfig}
        onLLMUpdate={updateLLM}
        onVerifyLLM={verifyLLM}
        onDisconnectLLM={disconnectLLM}
        voiceProviderConfig={voiceProviderConfig}
        onVoiceProviderUpdate={updateVoiceProvider}
        onTestTTS={testTTS}
        onDisconnectProviders={disconnectProviders}
      />

      {/* ── Layout shell ────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col h-screen overflow-hidden">

        {/* ── HEADER ────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4 px-5 py-2.5 border-b border-white/8 bg-black/20 backdrop-blur-sm flex-shrink-0">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ boxShadow: isActive ? ['0 0 6px rgba(34,211,238,0.3)', '0 0 18px rgba(34,211,238,0.6)', '0 0 6px rgba(34,211,238,0.3)'] : '0 0 0px transparent' }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/15 border border-cyan-400/30"
            >
              <Zap className="h-4 w-4 text-cyan-400" />
            </motion.div>
            <div>
              <div className="text-[8px] uppercase tracking-[0.4em] text-cyan-400/60 font-mono">Personal AI Agent</div>
              <div className="text-sm font-bold text-white/90 leading-none mt-0.5 font-orbitron">AI Desk Companion</div>
            </div>
          </div>

          {/* Center: heard text — shows live STT during standby, confirmed transcript after wake */}
          <div className="hidden md:flex flex-1 justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={(rt.phase === 'standby' || rt.phase === 'sleep') ? rt.lastHeardText : rt.heard}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="rounded-xl border border-white/10 bg-white/4 px-4 py-1.5 text-xs text-slate-300 max-w-sm truncate"
              >
                <span className="text-slate-500 mr-2">Heard:</span>
                {(rt.phase === 'standby' || rt.phase === 'sleep')
                  ? (rt.lastHeardText || rt.heard)
                  : rt.heard}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 tabular-nums">{clock}</span>

            {/* Phase badge — single status indicator with per-state icon */}
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${PHASE_BADGE[displayPhase]}`}>
              {displayPhase === 'booting' ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-current border-t-transparent"
                />
              ) : displayPhase === 'listening' ? (
                <motion.div
                  animate={{ scale: [1, 1.45, 1] }}
                  transition={{ duration: 0.7, repeat: Infinity }}
                  className="flex-shrink-0"
                >
                  <Mic className="h-2.5 w-2.5" />
                </motion.div>
              ) : isSpeaking || displayPhase === 'responding' ? (
                <motion.div
                  animate={{ opacity: [0.45, 1, 0.45] }}
                  transition={{ duration: 0.45, repeat: Infinity }}
                  className="flex-shrink-0"
                >
                  <Activity className="h-2.5 w-2.5" />
                </motion.div>
              ) : displayPhase === 'thinking' ? (
                <motion.div
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                  className="flex-shrink-0"
                >
                  <Zap className="h-2.5 w-2.5" />
                </motion.div>
              ) : displayPhase === 'wake_detected' ? (
                <Zap className="h-2.5 w-2.5 flex-shrink-0" />
              ) : (
                <motion.div
                  animate={{ opacity: isActive ? [0.4, 1, 0.4] : 0.4 }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${PHASE_DOT[displayPhase]}`}
                />
              )}
              {isSpeaking && displayPhase !== 'responding'
                ? `${PHASE_LABEL[displayPhase]} · Speaking`
                : PHASE_LABEL[displayPhase]}
            </div>

            {/* Orchestrator connection badge */}
            <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
              rt.wsConnected
                ? 'border-teal-400/30 bg-teal-400/8 text-teal-400'
                : 'border-slate-700/40 bg-slate-700/10 text-slate-500'
            }`}>
              <motion.div
                animate={{ opacity: rt.wsConnected ? [0.4, 1, 0.4] : 0.4 }}
                transition={{ duration: 1.8, repeat: Infinity }}
                className={`h-1.5 w-1.5 rounded-full ${rt.wsConnected ? 'bg-teal-400' : 'bg-slate-600'}`}
              />
              {rt.wsConnected ? 'Orchestrator' : 'Local Mode'}
            </div>

            {/* Voice toggle — always visible */}
            {rt.sttSupported && (
              <motion.button
                onClick={rt.toggleVoice}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                title={rt.voiceEnabled ? 'Disable voice listening' : 'Enable voice listening'}
                className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-[10px] transition-colors ${
                  rt.voiceEnabled
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-400 hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400'
                    : 'border-slate-700/40 bg-white/4 text-slate-500 hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-400'
                }`}
              >
                {rt.voiceEnabled
                  ? <Mic className="h-3 w-3" />
                  : <MicOff className="h-3 w-3" />
                }
                <span>{rt.voiceEnabled ? 'Voice On' : 'Voice Off'}</span>
              </motion.button>
            )}

            {/* Restart button */}
            <motion.button
              onClick={rt.triggerWakeWord}
              disabled={rt.phase === 'booting' || rt.phase === 'wake_detected'}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Restart session"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-amber-300 hover:border-amber-400/30 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </motion.button>

            {/* Voice settings gear */}
            <motion.button
              onClick={() => setSettingsOpen((o) => !o)}
              whileHover={{ rotate: 60 }}
              transition={{ duration: 0.3 }}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-cyan-300 hover:border-cyan-400/30 transition"
            >
              <Settings className="h-3.5 w-3.5" />
            </motion.button>

            {!rt.sttSupported && (
              <div className="flex items-center gap-1 text-amber-400 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                <span>No STT</span>
              </div>
            )}
          </div>
        </header>

        {/* ── MAIN 3-COLUMN ─────────────────────────────────────── */}
        <div className="flex-1 grid grid-cols-[320px_1fr_320px] min-h-0 overflow-hidden">

          {/* LEFT — Online Agents */}
          <aside className="border-r border-white/8 bg-black/10 flex flex-col overflow-hidden">

            {/* Scrollable agent content */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin flex flex-col gap-3 min-h-0">

              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.3em] text-slate-600">
                  Online Agents
                </span>
                <span className="text-[9px] rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-slate-500 tabular-nums">
                  {onlineAgents.length}/{rt.agents.filter(a => a.id !== 'system').length}
                </span>
              </div>

              {/* ALL AGENTS NOMINAL banner */}
              {onlineAgents.length > 0 && onlineAgents.length === rt.agents.filter(a => a.id !== 'system').length && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/8 py-2"
                >
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                  />
                  <span className="text-[9px] font-mono font-bold tracking-[0.22em] text-emerald-400">
                    ALL AGENTS NOMINAL
                  </span>
                </motion.div>
              )}

              {/* Agent cards */}
              {onlineAgents.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[11px] text-slate-700 text-center">No agents online yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <AnimatePresence>
                    {onlineAgents.map((agent, idx) => {
                      const m = AGENT_PILL_META[agent.id];
                      if (!m) return null;
                      const Icon = m.icon;
                      return (
                        <motion.button
                          key={agent.id}
                          initial={{ opacity: 0, scale: 0.88 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.88 }}
                          transition={{ delay: idx * 0.04, duration: 0.22 }}
                          whileHover={{ scale: 1.04, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAgentClick(agent.id)}
                          className={`flex items-center gap-2 rounded-xl border ${m.border} ${m.bg} px-2.5 py-2.5 cursor-pointer w-full text-left`}
                        >
                          <motion.div
                            animate={{ rotate: [0, 8, -8, 0] }}
                            transition={{ duration: 3, repeat: Infinity, repeatDelay: idx * 1.5 + 2 }}
                          >
                            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${m.text}`} />
                          </motion.div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={`text-[11px] font-medium truncate ${m.text}`}>{agent.label}</span>
                            {agent.id === 'portfolio' && portfolioPnlPct !== null && (
                              <span className={`text-[10px] font-mono font-bold leading-none ${portfolioPnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {portfolioPnlPct >= 0 ? '+' : ''}{portfolioPnlPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

              {onlineAgents.length > 0 && (
                <p className="text-[9px] text-slate-700 text-center">tap card for details</p>
              )}
            </div>

            {/* ── Upcoming reminder flash — pinned to bottom ── */}
            <AnimatePresence>
              {upcomingReminders.length > 0 && (
                <motion.div
                  key="reminder-flash"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="shrink-0 px-3 pb-3 pt-1 border-t border-white/6"
                >
                  <motion.button
                    onClick={() => setNotesDashboardOpen(true)}
                    animate={{
                      boxShadow: [
                        '0 0 0px rgba(251,191,36,0)',
                        '0 0 18px rgba(251,191,36,0.30)',
                        '0 0 0px rgba(251,191,36,0)',
                      ],
                    }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative w-full overflow-hidden rounded-xl border border-amber-400/35 bg-amber-400/8 px-3 py-2.5 text-left"
                  >
                    {/* Sweep flash */}
                    <motion.div
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/10 to-transparent"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' }}
                    />

                    <div className="relative flex items-center gap-2.5">
                      {/* Shaking bell */}
                      <motion.div
                        animate={{ rotate: [-14, 14, -10, 10, -4, 4, 0, 0, 0] }}
                        transition={{ duration: 1.0, repeat: Infinity, repeatDelay: 1.2 }}
                        className="shrink-0"
                      >
                        <Bell className="h-4 w-4 text-amber-400" />
                      </motion.div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-mono font-bold uppercase tracking-[0.22em] text-amber-400/70 mb-0.5">
                          Due Soon
                          {upcomingReminders.length > 1 && (
                            <span className="ml-1.5 rounded-full bg-amber-400/20 px-1.5 py-px text-amber-300">
                              {upcomingReminders.length}
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] font-semibold text-white/90 truncate leading-tight">
                          {upcomingReminders[0].title}
                        </p>
                        <p className="text-[10px] font-mono text-amber-300/80 mt-0.5">
                          {minsLeft(upcomingReminders[0].due_at)}
                          {upcomingReminders.length > 1 && (
                            <span className="text-white/30"> · +{upcomingReminders.length - 1} more</span>
                          )}
                        </p>
                      </div>

                      {/* Pulsing dot */}
                      <motion.div
                        animate={{ scale: [1, 1.6, 1], opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.0, repeat: Infinity }}
                        className="shrink-0 h-2 w-2 rounded-full bg-amber-400"
                      />
                    </div>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

          </aside>

          {/* CENTER — Orb + Controls + Transcript + Input */}
          <main className="flex flex-col min-h-0 overflow-hidden min-w-0">

            {/* 3D Orbit — full canvas with corner HUD overlays */}
            <div className="flex-shrink-0 flex justify-center overflow-hidden relative" style={{ height: 420 }}>
              <AgentOrbit3D phase={displayPhase} agents={rt.agents} activeAgentId={rt.activeAgentId} />

              {/* ── TOP-CENTER: Weather line ───────────────────────────── */}
              {rt.agents.find(a => a.id === 'weather')?.status === 'online' && (
                <div className="absolute top-3 inset-x-0 z-10 flex justify-center pointer-events-none select-none">
                  <WeatherLine city={agentConfig.weather.defaultCity || 'Bengaluru'} />
                </div>
              )}

              {/* ── TOP-LEFT: System Status HUD ────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5, duration: 0.28, ease: 'easeOut' }}
                className="absolute top-3 left-3 z-10 w-[154px] px-2.5 py-2 pointer-events-none select-none"
              >
                {/* Header */}
                <div className="flex items-center gap-1.5 mb-1.5 pb-1">
                  <Cpu className="h-2.5 w-2.5 text-teal-400 flex-shrink-0" />
                  <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-teal-500">System</span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={rt.systemStats.healthScore}
                      initial={{ opacity: 0, scale: 1.25 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className={`ml-auto text-[12px] font-bold tabular-nums leading-none ${
                        rt.systemStats.healthScore >= 80 ? 'text-emerald-400' :
                        rt.systemStats.healthScore >= 60 ? 'text-amber-400' : 'text-red-400'
                      }`}
                    >
                      {rt.systemStats.healthScore}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-[7px] text-slate-700">/100</span>
                </div>

                {/* Metric rows */}
                <div className="space-y-[3px]">
                  {orchSys && (
                    <>
                      <StatRow label="CPU"  value={`${orchSys.cpu_pct}%`}
                        hi={orchSys.cpu_pct  > 85 ? 'err' : orchSys.cpu_pct  > 60 ? 'warn' : 'ok'} />
                      <StatRow label="RAM"  value={`${orchSys.mem_pct}%`}
                        hi={orchSys.mem_pct  > 85 ? 'err' : orchSys.mem_pct  > 70 ? 'warn' : 'ok'} />
                      <StatRow label="Disk" value={`${orchSys.disk_pct}%`}
                        hi={orchSys.disk_pct > 90 ? 'err' : orchSys.disk_pct > 75 ? 'warn' : 'ok'} />
                      {orchSys.cpu_temp_c != null && (
                        <StatRow
                          label={orchSys.temp_source === 'battery' ? 'Bat°C' : 'Temp'}
                          value={`${orchSys.cpu_temp_c}°C`}
                          hi={
                            orchSys.temp_source === 'battery'
                              ? (orchSys.cpu_temp_c > 45 ? 'warn' : 'ok')
                              : (orchSys.cpu_temp_c > 90 ? 'err' : orchSys.cpu_temp_c > 75 ? 'warn' : 'ok')
                          }
                        />
                      )}
                    </>
                  )}
                  {rt.systemStats.battery && (
                    <StatRow
                      label="Bat"
                      value={`${rt.systemStats.battery.level}%${rt.systemStats.battery.charging ? '⚡' : ''}`}
                      hi={rt.systemStats.battery.level < 20 ? 'err' : rt.systemStats.battery.level < 40 ? 'warn' : 'ok'}
                    />
                  )}
                  <StatRow
                    label="Net"
                    value={rt.systemStats.online ? (rt.systemStats.connectionType ?? 'Online') : 'Offline'}
                    hi={rt.systemStats.online ? 'ok' : 'err'}
                  />
                  {rt.systemStats.appUptimeSec > 0 && (
                    <StatRow
                      label="Up"
                      value={rt.systemStats.appUptimeSec < 60
                        ? `${rt.systemStats.appUptimeSec}s`
                        : `${Math.floor(rt.systemStats.appUptimeSec / 60)}m ${rt.systemStats.appUptimeSec % 60}s`}
                    />
                  )}
                </div>
              </motion.div>

              {/* ── TOP-RIGHT: App Status HUD ──────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6, duration: 0.28, ease: 'easeOut' }}
                className="absolute top-3 right-3 z-10 w-[154px] px-2.5 py-2 pointer-events-none select-none"
              >
                {/* Header */}
                <div className="flex items-center gap-1.5 mb-1.5 pb-1">
                  <Activity className="h-2.5 w-2.5 text-violet-400 flex-shrink-0" />
                  <span className="text-[8px] font-mono uppercase tracking-[0.22em] text-violet-400">App</span>
                  <motion.div
                    animate={{ opacity: rt.wsConnected ? [0.45, 1, 0.45] : 0.3 }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    className={`ml-auto h-1.5 w-1.5 rounded-full flex-shrink-0 ${rt.wsConnected ? 'bg-teal-400' : 'bg-slate-600'}`}
                  />
                  <span className="text-[7.5px] text-slate-500 leading-none">
                    {rt.wsConnected ? 'Connected' : 'Local'}
                  </span>
                </div>

                {/* Status rows */}
                <div className="space-y-[3px]">
                  <StatusRow label="STT"       ok={rt.sttSupported} />
                  <StatusRow label="TTS"       ok={rt.ttsSupported} />
                  <StatusRow label="Session"   ok={isActive} />
                  <StatusRow label="WebSocket" ok={rt.wsConnected} />

                  {rt.wsConnected && (
                    <div className="flex flex-wrap gap-1 pt-1 mt-0.5">
                      {[
                        { k: 'TTS',  on: rt.orchestratorCaps.tts,      val: rt.orchestratorCaps.tts      ? 'Server' : 'Browser' },
                        { k: 'STT',  on: rt.orchestratorCaps.stt,      val: rt.orchestratorCaps.stt      ? 'Server' : 'Browser' },
                        { k: 'Wake', on: rt.orchestratorCaps.wakeWord, val: rt.orchestratorCaps.wakeWord ? 'Server' : 'Browser' },
                      ].map((p) => (
                        <span key={p.k} className={`text-[8px] leading-none ${
                          p.on ? 'text-teal-400' : 'text-slate-600'
                        }`}>
                          {p.k}: {p.val}
                        </span>
                      ))}
                    </div>
                  )}

                  {rt.orchestratorMetrics && (
                    <div className="pt-1 mt-0.5 space-y-[3px]">
                      <StatRow spread label="Cmds"  value={String(rt.orchestratorMetrics.commands_processed)} />
                      <StatRow spread label="Sess"  value={String(rt.orchestratorMetrics.sessions_started)} />
                      {rt.orchestratorMetrics.tts_calls > 0 && (
                        <StatRow spread label="TTS calls" value={String(rt.orchestratorMetrics.tts_calls)} />
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Controls below orbit: speech bubble, equalizer, actions */}
            <div className="flex-1 flex flex-col items-center justify-end gap-3 px-8 pb-6 overflow-hidden">

              {/* Assistant speech bubble with typing animation */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={rt.assistantSpeech.slice(0, 40)}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.96 }}
                  transition={{ duration: 0.25 }}
                  className="w-full max-w-lg text-center"
                >
                  {isActive ? (
                    <div className="rounded-2xl border border-cyan-400/22 bg-cyan-400/6 px-6 py-3 backdrop-blur-sm">
                      <TypingText
                        text={rt.assistantSpeech}
                        speed={18}
                        className="text-sm text-cyan-50 leading-relaxed"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic">{rt.assistantSpeech}</p>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Wave visualizer */}
              <div className="w-full max-w-sm">
                <WaveVisualizer
                  active={waveActive}
                  color={waveColor(displayPhase)}
                  intensity={waveIntensity}
                  useMic={isListening}
                />
              </div>

              {/* Routing indicator — shows which agent is processing */}
              <div className="h-5 flex items-center justify-center">
                <AnimatePresence>
                  {rt.activeAgentId && (rt.phase === 'thinking' || rt.phase === 'responding') && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-1.5"
                    >
                      {[0, 1, 2, 3].map(j => (
                        <motion.div
                          key={j}
                          className="h-1 w-1 rounded-full bg-cyan-400"
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 0.65, repeat: Infinity, delay: j * 0.14, ease: 'linear' }}
                        />
                      ))}
                      <span className="text-[8.5px] font-mono uppercase tracking-[0.28em] text-cyan-400/60 px-1.5">
                        {rt.agents.find(a => a.id === rt.activeAgentId)?.label ?? rt.activeAgentId}
                      </span>
                      {[0, 1, 2, 3].map(j => (
                        <motion.div
                          key={j}
                          className="h-1 w-1 rounded-full bg-cyan-400"
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 0.65, repeat: Infinity, delay: j * 0.14, ease: 'linear' }}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action button — single dynamic Wake Up / Sleep toggle */}
              <div className="flex items-center justify-center mt-1">
                <AnimatePresence mode="wait">
                  {rt.phase === 'booting' || rt.phase === 'wake_detected' ? (
                    <motion.button
                      key="booting"
                      disabled
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-2 h-11 px-8 rounded-xl border border-white/10 bg-white/5 text-slate-500 text-sm font-semibold cursor-not-allowed"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="h-4 w-4 rounded-full border-2 border-slate-600 border-t-slate-400"
                      />
                      {rt.phase === 'wake_detected' ? 'Activating…' : 'Booting…'}
                    </motion.button>
                  ) : rt.phase === 'standby' || rt.phase === 'sleep' ? (
                    <motion.button
                      key="wakeup"
                      onClick={rt.triggerWakeWord}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.95 }}
                      className="relative flex items-center gap-2.5 h-11 px-10 rounded-xl bg-cyan-500 text-slate-950 text-sm font-bold hover:bg-cyan-400 transition-colors overflow-hidden"
                    >
                      <motion.div
                        className="pointer-events-none absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                        animate={{ left: ['-3rem', '110%'] }}
                        transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
                      />
                      <Power className="h-4 w-4" />
                      Wake Up
                    </motion.button>
                  ) : (
                    <motion.button
                      key="sleep"
                      onClick={rt.sleep}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2.5 h-11 px-10 rounded-xl border border-slate-600/50 bg-slate-800/60 text-slate-300 text-sm font-semibold hover:bg-slate-700/60 hover:border-slate-500/50 transition-colors"
                    >
                      <Moon className="h-4 w-4" />
                      Sleep
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Hint text + mic listening indicator */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[10px] text-slate-600 text-center max-w-xs leading-relaxed">
                  {(displayPhase === 'standby' || displayPhase === 'sleep')
                    ? rt.sttSupported
                      ? `Say "${appConfig.wakeWord}" or tap Wake Up to start`
                      : 'Tap Wake Up to start • Enable mic for voice detection'
                    : displayPhase === 'ready'
                      ? 'Ask a question by voice or type below · Gear icon → voice settings'
                      : null}
                </div>

                {/* Mic status pill — standby/sleep only, reflects live listening state */}
                {(rt.phase === 'standby' || rt.phase === 'sleep') && rt.sttSupported && rt.voiceEnabled && (
                  <div className="flex items-center gap-1.5 text-[9px] text-cyan-400/70">
                    <motion.div
                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="h-1.5 w-1.5 rounded-full bg-cyan-400"
                    />
                    {rt.micEverStarted ? 'Mic listening' : 'Starting mic…'}
                    {rt.lastHeardText && (
                      <span className="text-slate-500 max-w-[140px] truncate">· "{rt.lastHeardText}"</span>
                    )}
                  </div>
                )}
              </div>

              {/* Forecast strip — bare day icons, no card */}
              {rt.agents.find(a => a.id === 'weather')?.status === 'online' && (
                <ForecastStrip city={agentConfig.weather.defaultCity || 'Bengaluru'} />
              )}
            </div>

          </main>

          {/* RIGHT — Chat History + Quick Stats */}
          <aside className="border-l border-white/8 flex flex-col min-h-0 bg-black/10">

            {/* ── Compact stats (Performance + Config) ─────────────── */}
            <div className="flex-shrink-0 overflow-y-auto p-3 space-y-2 scrollbar-thin border-b border-white/6">

            {/* ── Performance ──────────────────────────────── */}
            {rt.orchestratorMetrics && (
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05, duration: 0.4, ease: 'easeOut' }}
                className="rounded-2xl border border-violet-400/20 bg-violet-400/5 p-3"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <BarChart2 className="h-3 w-3 text-violet-400" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-violet-500">Performance</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <StatRow label="Uptime" value={rt.orchestratorMetrics.uptime_sec < 60 ? `${rt.orchestratorMetrics.uptime_sec}s` : `${Math.floor(rt.orchestratorMetrics.uptime_sec / 60)}m`} />
                  <StatRow label="Commands" value={String(rt.orchestratorMetrics.commands_processed)} />
                  <StatRow label="Sessions" value={String(rt.orchestratorMetrics.sessions_started)} />
                  {rt.orchestratorMetrics.tts_calls > 0 && <StatRow label="TTS calls" value={String(rt.orchestratorMetrics.tts_calls)} />}
                </div>
                {Object.entries(rt.orchestratorMetrics.agents).length > 0 && (
                  <div className="pt-1.5 border-t border-white/6 mt-1.5 space-y-0.5">
                    {Object.entries(rt.orchestratorMetrics.agents).map(([id, s], idx) => (
                      <motion.div
                        key={id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05, duration: 0.2 }}
                        className="flex justify-between"
                      >
                        <span className="text-[9px] text-slate-500 capitalize">{id}</span>
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={`${s.calls}-${s.avg_ms}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-[9px] text-violet-400 tabular-nums"
                          >
                            {s.calls}× · {s.avg_ms}ms
                          </motion.span>
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Config ───────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.4, ease: 'easeOut' }}
              className="rounded-2xl border border-white/8 bg-white/3 p-3"
            >
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2">
                <StatRow label="Wake" value={appConfig.wakeWord} />
                <StatRow label="Name" value={appConfig.callingName} />
                <StatRow label="Voice" value={voiceConfig.gender === 'female' ? '♀ F' : '♂ M'} />
                <StatRow label="Speed" value={voiceConfig.speed} />
              </div>
              <motion.button
                onClick={() => setSettingsOpen(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="w-full h-6 rounded-lg border border-white/8 bg-white/4 text-[10px] text-slate-400 hover:text-cyan-300 hover:border-cyan-400/25 transition"
              >
                Open settings →
              </motion.button>
            </motion.div>
            </div>{/* end compact stats */}

            {/* ── Conversation header ── */}
            <div className="flex-shrink-0 px-3 py-1.5 flex items-center gap-1.5">
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-cyan-400"
              />
              <span className="text-[9px] font-mono uppercase tracking-[0.28em] text-slate-600">
                Conversation
              </span>
              {rt.transcript.filter(t => t.speaker !== 'system').length > 0 && (
                <span className="ml-auto text-[8px] font-mono text-slate-700 tabular-nums">
                  {rt.transcript.filter(t => t.speaker !== 'system').length} turns
                </span>
              )}
            </div>

            {/* ── HoloChat — takes all remaining vertical space ── */}
            <HoloChat transcript={rt.transcript} aiName={appConfig.wakeWord} />

            {/* ── Input bar — anchored to bottom of right panel ── */}
            <div className="flex-shrink-0 border-t border-cyan-400/8 bg-black/20 backdrop-blur-sm px-3 py-2.5">
              <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/30 px-2.5 py-2 focus-within:border-cyan-400/22 transition-colors">
                <motion.span
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity }}
                  className="text-cyan-400 font-mono text-sm flex-shrink-0 select-none"
                >
                  ❯
                </motion.span>
                <input
                  value={rt.command}
                  onChange={(e) => rt.setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && rt.command.trim()) {
                      if (!isActive || rt.phase === 'booting') rt.triggerWakeWord();
                      else rt.ask();
                    }
                  }}
                  placeholder={
                    isActive && rt.phase !== 'booting'
                      ? 'Ask anything…'
                      : 'Type to wake…'
                  }
                  className="flex-1 bg-transparent text-[12px] text-white/90 outline-none placeholder:text-slate-700 font-mono min-w-0"
                />
                <motion.button
                  onClick={() => {
                    if (!rt.command.trim()) return;
                    if (!isActive || rt.phase === 'booting') rt.triggerWakeWord();
                    else rt.ask();
                  }}
                  disabled={!rt.command.trim()}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  animate={rt.command.trim() ? { boxShadow: ['0 0 0px rgba(139,92,246,0)', '0 0 8px rgba(139,92,246,0.4)', '0 0 0px rgba(139,92,246,0)'] } : {}}
                  transition={{ duration: 1.8, repeat: Infinity }}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-violet-500/20 border border-violet-400/30 text-violet-300 text-xs font-medium hover:bg-violet-500/30 disabled:opacity-30 transition-colors flex-shrink-0"
                >
                  <Send className="h-3 w-3" />
                  Send
                </motion.button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Agent detail modal */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDetailModal
            agent={selectedAgent}
            bootMessage={rt.agentBootMessages[selectedAgent.id]}
            metrics={rt.orchestratorMetrics?.agents[selectedAgent.id]}
            onClose={() => setSelectedAgentId(null)}
            onReload={rt.reloadAgent ? () => rt.reloadAgent(selectedAgent.id) : undefined}
            onOpenDashboard={
              selectedAgent.id === 'smarthome' ? () => setSmartHomeDashboardOpen(true) :
              selectedAgent.id === 'stock'     ? () => { setSelectedAgentId(null); setStocksPortfolioOpen(true); } :
              undefined
            }
            agentConfig={agentConfig}
            notificationsEnabled={notificationsEnabledFor(selectedAgent.id)}
            onToggleNotifications={
              ['system', 'email', 'news', 'smarthome'].includes(selectedAgent.id)
                ? (enabled) => toggleNotificationsFor(selectedAgent.id, enabled)
                : undefined
            }
          />
        )}
      </AnimatePresence>

      {/* Smart Home dashboard modal */}
      <AnimatePresence>
        {smartHomeDashboardOpen && (
          <SmartHomeDashboard
            endpoint={agentConfig.smarthome.endpoint}
            token={agentConfig.smarthome.token}
            onClose={() => setSmartHomeDashboardOpen(false)}
            onVoice={(text) => {
              setSmartHomeDashboardOpen(false);
              rt.ask(text);
            }}
          />
        )}
      </AnimatePresence>

      {/* Portfolio dashboard modal */}
      <AnimatePresence>
        {portfolioDashboardOpen && (
          <PortfolioDashboard
            token={agentConfig.portfolio.accessToken}
            backendBase={import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8787'}
            onClose={() => setPortfolioDashboardOpen(false)}
            onVoice={(text) => {
              setPortfolioDashboardOpen(false);
              rt.ask(text);
            }}
          />
        )}
      </AnimatePresence>

      {/* Stocks portfolio side panel */}
      <AnimatePresence>
        {stocksPortfolioOpen && (
          <StocksPortfolio
            spreadsheetId={agentConfig.stock.spreadsheetId}
            googleToken={agentConfig.google.accessToken}
            onClose={() => setStocksPortfolioOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* WhatsApp dashboard */}
      <AnimatePresence>
        {whatsappDashboardOpen && (
          <WhatsAppDashboard onClose={() => setWhatsappDashboardOpen(false)} />
        )}
      </AnimatePresence>

      {/* Notes & Reminders dashboard */}
      <AnimatePresence>
        {notesDashboardOpen && (
          <NotesDashboard
            onClose={() => setNotesDashboardOpen(false)}
            onVoiceCmd={(text) => { setNotesDashboardOpen(false); rt.ask(text); }}
          />
        )}
      </AnimatePresence>

      {/* Reminder / alarm visual alerts — always shown, with voice reminders and countdown */}
      <ReminderAlert
        alerts={visualAlerts}
        countdown={alertCountdown}
        voiceEnabled={rt.voiceEnabled}
        onDismiss={dismissAlert}
        onSnooze={snoozeAlert}
      />

      {/* Agent configuration modal */}
      <AnimatePresence>
        {agentConfigOpen && (
          <AgentConfigModal
            cfg={agentConfig}
            onPatch={patchAgent}
            onClose={() => setAgentConfigOpen(false)}
            onReload={rt.reloadAgent}
            onVerifyWeather={verifyWeather}
            onConnectGoogle={connectGoogle}
            onDisconnectGoogle={disconnectGoogle}
            onVerifyGitHub={verifyGitHub}
            onDisconnectGitHub={disconnectGitHub}
            onVerifyNews={verifyNews}
            onVerifySmartHome={verifySmartHome}
            onConnectPortfolio={connectPortfolio}
            onDisconnectPortfolio={disconnectPortfolio}
            onRefreshPortfolio={refreshPortfolioToken}
            onVerifyWhatsApp={verifyWhatsApp}
            onCheckTunnel={checkTunnelStatus}
            onStartTunnel={startTunnel}
            onStopTunnel={stopTunnel}
            agentVoices={agentVoices}
            onAgentVoiceUpdate={updateAgentVoice}
            onAgentVoiceReset={resetAgentVoice}
            voices={voices}
            onTestAgentVoice={(text, agentId) => rt.speak(text, agentId)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
