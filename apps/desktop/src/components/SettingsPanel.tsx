import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Radio, Settings, User, Volume2, X } from 'lucide-react';
import type { AppConfig } from '../hooks/useAppConfig';
import type { VoiceConfig } from '../hooks/useVoiceConfig';
import type { AgentConfig } from '../hooks/useAgentConfig';
import type { LLMConfig } from '../hooks/useLLMConfig';
import type { VoiceProviderConfig } from '../hooks/useVoiceProviderConfig';
import type { AgentVoiceMap, AgentVoiceSetting } from '../hooks/useAgentVoiceConfig';
import { ProfileSettings } from './settings/ProfileSettings';
import { VoiceSettings } from './settings/VoiceSettings';
import { AISettings } from './settings/AISettings';
import { ProvidersSettings } from './settings/ProvidersSettings';
import { AgentsSettings } from './settings/AgentsSettings';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenAgents: () => void;
  appConfig: AppConfig;
  onAppUpdate: (p: Partial<AppConfig>) => void;
  voiceConfig: VoiceConfig;
  onVoiceUpdate: (p: Partial<VoiceConfig>) => void;
  voices: SpeechSynthesisVoice[];
  onTestVoice: (text: string, agentId?: string) => void;
  agentVoices: AgentVoiceMap;
  onAgentVoiceUpdate: (agentId: string, p: Partial<AgentVoiceSetting>) => void;
  onAgentVoiceReset: (agentId: string) => void;
  agentConfig: AgentConfig;
  onAgentPatch: <K extends keyof AgentConfig>(agent: K, p: Partial<AgentConfig[K]>) => void;
  onVerifyWeather: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onVerifyGitHub: () => void;
  onDisconnectGitHub: () => void;
  onVerifyNews: () => void;
  onVerifySmartHome:     () => void;
  onConnectPortfolio:    () => void;
  onDisconnectPortfolio: () => void;
  onRefreshPortfolio:    () => void;
  onVerifyWhatsApp: () => void;
  onCheckTunnel: () => Promise<boolean>;
  onStartTunnel: () => void;
  onStopTunnel: () => void;
  llmConfig: LLMConfig;
  onLLMUpdate: (p: Partial<Omit<LLMConfig, 'status' | 'info'>>) => void;
  onVerifyLLM: () => void;
  onDisconnectLLM: () => void;
  voiceProviderConfig: VoiceProviderConfig;
  onVoiceProviderUpdate: (p: Partial<Omit<VoiceProviderConfig, 'status' | 'info'>>) => void;
  onTestTTS: () => void;
  onDisconnectProviders: () => void;
}

type Tab = 'profile' | 'voice' | 'llm' | 'providers' | 'agents';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',   label: 'Profile',   icon: <User className="h-3.5 w-3.5" /> },
  { id: 'voice',     label: 'Voice',     icon: <Volume2 className="h-3.5 w-3.5" /> },
  { id: 'llm',       label: 'AI',        icon: <Bot className="h-3.5 w-3.5" /> },
  { id: 'providers', label: 'Providers', icon: <Radio className="h-3.5 w-3.5" /> },
  { id: 'agents',    label: 'Agents',    icon: <Settings className="h-3.5 w-3.5" /> },
];

export function SettingsPanel(props: Props) {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <AnimatePresence>
      {props.open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={props.onClose}
          />

          <motion.aside
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-[#07101e]/96 border-l border-white/10 backdrop-blur-2xl shadow-2xl"
            style={{ width: 340 }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/15 border border-cyan-400/25">
                  <Settings className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Settings</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">{props.appConfig.assistantName} Configuration</div>
                </div>
              </div>
              <button onClick={props.onClose} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-1 px-4 pt-3 pb-2 flex-shrink-0">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    if (t.id === 'agents') {
                      props.onOpenAgents();
                    } else {
                      setTab(t.id);
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-medium transition-all ${
                    tab === t.id
                      ? 'bg-white/10 text-white'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 scrollbar-thin">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  {tab === 'profile' && (
                    <ProfileSettings config={props.appConfig} onUpdate={props.onAppUpdate} />
                  )}
                  {tab === 'voice' && (
                    <VoiceSettings
                      config={props.voiceConfig}
                      onUpdate={props.onVoiceUpdate}
                      voices={props.voices}
                      onTest={(text) => props.onTestVoice(text)}
                      assistantName={props.appConfig.assistantName}
                    />
                  )}
                  {tab === 'llm' && (
                    <AISettings
                      config={props.llmConfig}
                      onUpdate={props.onLLMUpdate}
                      onVerify={props.onVerifyLLM}
                      onDisconnect={props.onDisconnectLLM}
                    />
                  )}
                  {tab === 'providers' && (
                    <ProvidersSettings
                      config={props.voiceProviderConfig}
                      onUpdate={props.onVoiceProviderUpdate}
                      onTest={props.onTestTTS}
                      onDisconnect={props.onDisconnectProviders}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
