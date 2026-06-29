import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart2,
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
  Send,
  Settings,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { RobotAvatar } from './components/RobotAvatar';
import { WaveVisualizer } from './components/WaveVisualizer';
import { AgentBootList } from './components/AgentBootList';
import { AgentDetailModal } from './components/AgentDetailModal';
import { SmartHomeDashboard } from './components/SmartHomeDashboard';
import { PortfolioDashboard } from './components/PortfolioDashboard';
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

/* ─── mission-control log row ───────────────────────────────── */

const AGENT_SHORT: Record<string, string> = {
  system: 'Sys', weather: 'Wthr', calendar: 'Cal', email: 'Mail',
  github: 'GitHub', stock: 'Stock', news: 'News', smarthome: 'Home', general: '',
};

function LogRow({ turn, aiName }: { turn: { speaker: 'user' | 'assistant' | 'system'; text: string; timestamp: string; agentId?: string }; aiName: string }) {
  const time = (() => {
    try {
      return new Date(turn.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
    } catch { return '--:--:--'; }
  })();

  const isUser = turn.speaker === 'user';
  const isSys  = turn.speaker === 'system';

  const label = (() => {
    if (isUser) return 'You';
    if (isSys)  return 'Sys';
    const short = turn.agentId ? AGENT_SHORT[turn.agentId] : '';
    return short || aiName.charAt(0).toUpperCase() + aiName.slice(1).toLowerCase();
  })();

  return (
    <div className={`flex items-start gap-0 py-[3px] px-2 rounded hover:bg-white/[0.03] transition-colors ${isSys ? 'opacity-55' : ''}`}>
      {/* Label badge */}
      <span className={`flex-shrink-0 w-12 text-right text-[9px] font-bold tracking-[0.08em] mr-2 mt-[2px] ${
        isUser ? 'text-violet-400' : isSys ? 'text-slate-500' : 'text-cyan-400'
      }`}>
        {label}
      </span>
      {/* Pipe separator */}
      <span className="flex-shrink-0 text-[10px] text-slate-700 mr-2 mt-[1px]">│</span>
      {/* Timestamp */}
      <span className="flex-shrink-0 text-[9px] font-mono text-slate-600 tabular-nums mr-3 mt-[2px]">{time}</span>
      {/* Message text */}
      <span className={`flex-1 min-w-0 text-[11px] leading-[1.5] whitespace-pre-wrap break-words ${
        isUser  ? 'text-amber-200'
        : isSys ? 'text-slate-500 italic'
        :         'text-emerald-300'
      }`}>
        {turn.text}
      </span>
    </div>
  );
}

/* ─── Quick Stats helpers ───────────────────────────────────── */

function StatRow({ label, value, hi }: { label: string; value: string; hi?: 'ok' | 'warn' | 'err' }) {
  const vc = hi === 'ok' ? 'text-emerald-400' : hi === 'warn' ? 'text-amber-400' : hi === 'err' ? 'text-red-400' : 'text-teal-300';
  return (
    <div className="flex items-center justify-between gap-1 min-w-0">
      <span className="text-[10px] text-slate-500 flex-shrink-0">{label}</span>
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
      <span className="text-[10px] text-slate-500">{label}</span>
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
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [rt.transcript]);

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
  const [smartHomeDashboardOpen,  setSmartHomeDashboardOpen]  = useState(false);
  const [portfolioDashboardOpen, setPortfolioDashboardOpen] = useState(false);

  const handleAgentClick = (agentId: string) => {
    if (agentId === 'portfolio') {
      setPortfolioDashboardOpen(true);
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
              <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-400/70">Personal AI Agent</div>
              <div className="text-sm font-semibold text-white/90 leading-none mt-0.5">AI Desk Companion</div>
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
            {/* Mic / speaking indicator */}
            <AnimatePresence>
              {isListening && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1.5 text-violet-300 text-xs"
                >
                  <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 0.7, repeat: Infinity }}>
                    <Mic className="h-3.5 w-3.5" />
                  </motion.div>
                  <span>Listening</span>
                </motion.div>
              )}
              {isSpeaking && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1.5 text-cyan-300 text-xs"
                >
                  <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.5, repeat: Infinity }}>
                    <Activity className="h-3.5 w-3.5" />
                  </motion.div>
                  <span>Speaking</span>
                </motion.div>
              )}
            </AnimatePresence>

            <span className="text-xs text-slate-500 tabular-nums">{clock}</span>

            {/* Phase badge */}
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${PHASE_BADGE[displayPhase]}`}>
              <motion.div
                animate={{ opacity: isActive ? [0.4, 1, 0.4] : 0.4 }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className={`h-1.5 w-1.5 rounded-full ${PHASE_DOT[displayPhase]}`}
              />
              {PHASE_LABEL[displayPhase]}
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

          {/* LEFT — Agent Roster */}
          <aside className="border-r border-white/8 overflow-y-auto p-4 bg-black/10 scrollbar-thin">
            <AgentBootList agents={rt.agents} activeAgentId={rt.activeAgentId} onReload={rt.reloadAgent} />
          </aside>

          {/* CENTER — Orb + Controls + Transcript + Input */}
          <main className="flex flex-col min-h-0 overflow-hidden">

            {/* Top: orb + controls (fixed height) */}
            <div className="flex flex-col items-center justify-center gap-4 px-8 py-4 flex-shrink-0">

              {/* Animated orb */}
              <RobotAvatar phase={displayPhase} />

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
                <WaveVisualizer active={waveActive} color={waveColor(displayPhase)} intensity={waveIntensity} />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 mt-1">
                <motion.button
                  onClick={rt.triggerWakeWord}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  disabled={rt.phase === 'booting' || rt.phase === 'wake_detected'}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl bg-cyan-500 text-slate-950 text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50 transition-colors"
                >
                  <Power className="h-4 w-4" />
                  {rt.phase === 'standby' || rt.phase === 'sleep' ? 'Wake Up' : 'Restart'}
                </motion.button>

                <motion.button
                  onClick={() => rt.ask()}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  disabled={!isActive || rt.phase === 'booting' || rt.phase === 'thinking' || rt.phase === 'responding'}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl border border-violet-400/40 bg-violet-400/10 text-violet-300 text-sm hover:bg-violet-400/20 disabled:opacity-40 transition-colors"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {isListening ? 'Listening…' : rt.sttSupported ? 'Voice Ask' : 'No Mic'}
                </motion.button>

                <motion.button
                  onClick={rt.sleep}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-2 h-10 px-4 rounded-xl border border-white/10 bg-white/4 text-slate-300 text-sm hover:bg-white/8 transition-colors"
                >
                  <Moon className="h-4 w-4" />
                  Sleep
                </motion.button>
              </div>

              {/* Hint text + mic listening indicator */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[10px] text-slate-600 text-center max-w-xs leading-relaxed">
                  {(displayPhase === 'standby' || displayPhase === 'sleep')
                    ? rt.sttSupported
                      ? `Say "${appConfig.wakeWord}" or press Wake Up to start`
                      : 'Press Wake Up • Enable mic for wake-word detection'
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
            </div>

            {/* Transcript — mission-control log style */}
            <div
              ref={transcriptRef}
              className="flex-1 min-h-0 overflow-y-auto border-t border-white/8 bg-black/15 backdrop-blur-sm px-3 py-2 scrollbar-thin"
            >
              {/* Column header */}
              <div className="flex items-center gap-0 px-2 pb-1.5 mb-1 border-b border-white/5">
                <span className="w-8 mr-2 text-right text-[8px] uppercase tracking-[0.15em] text-slate-700">src</span>
                <span className="text-[8px] text-slate-700 mr-2">│</span>
                <span className="text-[8px] uppercase tracking-[0.15em] text-slate-700 mr-3 w-[52px]">time</span>
                <span className="text-[8px] uppercase tracking-[0.15em] text-slate-700">message</span>
              </div>
              <AnimatePresence initial={false}>
                {rt.transcript.map((turn, i) => (
                  <motion.div
                    key={`${turn.timestamp}-${i}`}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <LogRow turn={turn} aiName={appConfig.wakeWord} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Input bar — pinned to center-column bottom */}
            <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 border-t border-white/6 bg-black/15 backdrop-blur-sm">
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
                    ? 'Ask about weather, calendar, email, GitHub, stocks, or anything…'
                    : 'Type your message — system will wake automatically…'
                }
                className="flex-1 h-9 rounded-xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition-colors"
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
                animate={rt.command.trim() ? { boxShadow: ['0 0 0px rgba(139,92,246,0)', '0 0 10px rgba(139,92,246,0.45)', '0 0 0px rgba(139,92,246,0)'] } : {}}
                transition={{ duration: 1.8, repeat: Infinity }}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-violet-500 text-sm font-medium hover:bg-violet-400 disabled:opacity-35 transition-colors"
              >
                <motion.div
                  animate={rt.command.trim() ? { x: [0, 2, 0] } : {}}
                  transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1 }}
                >
                  <Send className="h-3.5 w-3.5" />
                </motion.div>
                Send
              </motion.button>
            </div>
          </main>

          {/* RIGHT — Quick Stats */}
          <aside className="border-l border-white/8 overflow-y-auto p-3 space-y-2 bg-black/10 scrollbar-thin">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="text-[10px] uppercase tracking-[0.3em] text-slate-600 text-center mb-1"
            >
              Quick Stats
            </motion.div>

            {/* ── System Health ─────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05, duration: 0.4, ease: 'easeOut' }}
              className="relative overflow-hidden rounded-2xl border border-teal-400/20 bg-teal-400/5 p-3"
            >
              {/* slow background shimmer — always running on this card */}
              <motion.div
                className="pointer-events-none absolute inset-y-0 w-28 bg-gradient-to-r from-transparent via-teal-400/5 to-transparent skew-x-12"
                animate={{ left: ['-7rem', '120%'] }}
                transition={{ duration: 4, repeat: Infinity, repeatDelay: 3, ease: 'linear' }}
              />
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <motion.div
                    animate={{ rotate: systemOnline ? [0, 15, -15, 0] : 0 }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 4 }}
                  >
                    <Cpu className="h-3 w-3 text-teal-400" />
                  </motion.div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-teal-500">System Health</span>
                </div>
                <div className="flex items-center gap-1">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={rt.systemStats.healthScore}
                      initial={{ opacity: 0, scale: 1.3 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`text-base font-bold tabular-nums leading-none ${
                        rt.systemStats.healthScore >= 80 ? 'text-emerald-400' :
                        rt.systemStats.healthScore >= 60 ? 'text-amber-400' : 'text-red-400'
                      }`}
                    >
                      {rt.systemStats.healthScore}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-[9px] text-slate-500">/100</span>
                  {/* ping dot */}
                  <span className="relative ml-1 h-1.5 w-1.5 flex-shrink-0">
                    <motion.span
                      className={`absolute inset-0 rounded-full ${systemOnline ? 'bg-teal-400' : 'bg-slate-600'}`}
                      animate={systemOnline ? { scale: [1, 2.4], opacity: [0.6, 0] } : {}}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                    />
                    <span className={`absolute inset-0 rounded-full ${systemOnline ? 'bg-teal-400' : 'bg-slate-600'}`} />
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <StatRow label="OS" value={rt.systemStats.os} />
                <StatRow label="Cores" value={`${rt.systemStats.cores}`} />

                {/* Live metrics from orchestrator backend */}
                {orchSys && (
                  <>
                    <StatRow
                      label="CPU"
                      value={`${orchSys.cpu_pct}%`}
                      hi={orchSys.cpu_pct > 85 ? 'err' : orchSys.cpu_pct > 60 ? 'warn' : 'ok'}
                    />
                    <StatRow
                      label={orchSys.temp_source === 'battery' ? 'Bat°C' : 'Temp'}
                      value={orchSys.cpu_temp_c != null ? `${orchSys.cpu_temp_c}°C` : 'N/A'}
                      hi={
                        orchSys.cpu_temp_c == null ? undefined :
                        orchSys.temp_source === 'battery'
                          ? (orchSys.cpu_temp_c > 45 ? 'warn' : 'ok')
                          : (orchSys.cpu_temp_c > 90 ? 'err' : orchSys.cpu_temp_c > 75 ? 'warn' : 'ok')
                      }
                    />
                    <StatRow
                      label="RAM"
                      value={`${orchSys.mem_pct}%`}
                      hi={orchSys.mem_pct > 85 ? 'err' : orchSys.mem_pct > 70 ? 'warn' : 'ok'}
                    />
                    <StatRow
                      label="Disk"
                      value={`${orchSys.disk_pct}%`}
                      hi={orchSys.disk_pct > 90 ? 'err' : orchSys.disk_pct > 75 ? 'warn' : 'ok'}
                    />
                  </>
                )}

                {rt.systemStats.battery && (
                  <StatRow
                    label="Battery"
                    value={`${rt.systemStats.battery.level}%${rt.systemStats.battery.charging ? '⚡' : ''}`}
                    hi={rt.systemStats.battery.level < 20 ? 'err' : rt.systemStats.battery.level < 40 ? 'warn' : 'ok'}
                  />
                )}
                <StatRow
                  label="Network"
                  value={rt.systemStats.online ? (rt.systemStats.connectionType ?? 'Online') : 'Offline'}
                  hi={rt.systemStats.online ? 'ok' : 'err'}
                />
                {rt.systemStats.appUptimeSec > 0 && (
                  <StatRow
                    label="Uptime"
                    value={rt.systemStats.appUptimeSec < 60
                      ? `${rt.systemStats.appUptimeSec}s`
                      : `${Math.floor(rt.systemStats.appUptimeSec / 60)}m ${rt.systemStats.appUptimeSec % 60}s`}
                  />
                )}
              </div>
            </motion.div>

            {/* ── App Status ───────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.4, ease: 'easeOut' }}
              className="rounded-2xl border border-white/8 bg-white/3 p-3"
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1.5">App Status</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-1.5">
                <StatusRow label="STT" ok={rt.sttSupported} />
                <StatusRow label="TTS" ok={rt.ttsSupported} />
                <StatusRow label="Session" ok={isActive} />
                <StatusRow label="WebSocket" ok={rt.wsConnected} />
              </div>
              {rt.wsConnected && (
                <div className="flex flex-wrap gap-1 pt-1.5 border-t border-white/6">
                  {[
                    { k: 'TTS',  active: rt.orchestratorCaps.tts,      val: rt.orchestratorCaps.tts      ? 'Server' : 'Browser' },
                    { k: 'STT',  active: rt.orchestratorCaps.stt,      val: rt.orchestratorCaps.stt      ? 'Server' : 'Browser' },
                    { k: 'Wake', active: rt.orchestratorCaps.wakeWord, val: rt.orchestratorCaps.wakeWord ? 'Server' : 'Browser' },
                  ].map((p) => (
                    <span key={p.k} className={`text-[9px] rounded-full px-1.5 py-0.5 ${p.active ? 'bg-teal-400/15 text-teal-300' : 'bg-slate-700/30 text-slate-500'}`}>
                      {p.k}: {p.val}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ── Performance ──────────────────────────────── */}
            {rt.orchestratorMetrics && (
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.19, duration: 0.4, ease: 'easeOut' }}
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

            {/* ── Online Agents — appear dynamically as each comes online ── */}
            {onlineAgents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.26, duration: 0.4, ease: 'easeOut' }}
                className="rounded-2xl border border-white/8 bg-white/3 p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    Online Agents <span className="text-slate-600">({onlineAgents.length})</span>
                  </span>
                  <span className="text-[9px] text-slate-600">tap for details</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
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
                          transition={{ delay: idx * 0.05, duration: 0.22 }}
                          whileHover={{ scale: 1.06, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAgentClick(agent.id)}
                          className={`flex items-center gap-1.5 rounded-xl border ${m.border} ${m.bg} px-2 py-1.5 cursor-pointer w-full text-left`}
                        >
                          <motion.div
                            animate={{ rotate: [0, 8, -8, 0] }}
                            transition={{ duration: 3, repeat: Infinity, repeatDelay: idx * 1.5 + 2 }}
                          >
                            <Icon className={`h-3 w-3 flex-shrink-0 ${m.text}`} style={{ width: 12, height: 12 }} />
                          </motion.div>
                          <span className={`text-[10px] font-medium truncate ${m.text}`}>{agent.label}</span>
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* ── Config ───────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.33, duration: 0.4, ease: 'easeOut' }}
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
            onOpenDashboard={selectedAgent.id === 'smarthome' ? () => setSmartHomeDashboardOpen(true) : undefined}
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
    </div>
  );
}
