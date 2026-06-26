import { useState } from 'react';
import { Lock } from 'lucide-react';
import type { AgentConfig } from '../../hooks/useAgentConfig';
import type { AgentVoiceMap, AgentVoiceSetting } from '../../hooks/useAgentVoiceConfig';
import { SecurityNotice } from './shared';
import { AgentAccordion } from './AgentAccordion';
import { AgentVoiceRow } from './AgentVoiceRow';
import { WeatherSettings } from './WeatherSettings';
import { GoogleSettings } from './GoogleSettings';
import { GithubSettings } from './GithubSettings';
import { StockSettings } from './StockSettings';
import { NewsSettings } from './NewsSettings';
import { SmartHomeSettings } from './SmartHomeSettings';
import { WhatsappSettings } from './WhatsappSettings';

interface Props {
  config: AgentConfig;
  onPatch: <K extends keyof AgentConfig>(agent: K, p: Partial<AgentConfig[K]>) => void;
  onVerifyWeather: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onVerifyGitHub: () => void;
  onDisconnectGitHub: () => void;
  onVerifyNews: () => void;
  onVerifySmartHome: () => void;
  onVerifyWhatsApp: () => void;
  onCheckTunnel: () => Promise<boolean>;
  onStartTunnel: () => void;
  onStopTunnel: () => void;
  agentVoices: AgentVoiceMap;
  onAgentVoiceUpdate: (agentId: string, p: Partial<AgentVoiceSetting>) => void;
  onAgentVoiceReset: (agentId: string) => void;
  voices: SpeechSynthesisVoice[];
  onTestAgentVoice: (text: string, agentId: string) => void;
}

export function AgentsSettings({
  config,
  onPatch,
  onVerifyWeather,
  onConnectGoogle,
  onDisconnectGoogle,
  onVerifyGitHub,
  onDisconnectGitHub,
  onVerifyNews,
  onVerifySmartHome,
  onVerifyWhatsApp,
  onCheckTunnel,
  onStartTunnel,
  onStopTunnel,
  agentVoices,
  onAgentVoiceUpdate,
  onAgentVoiceReset,
  voices,
  onTestAgentVoice,
}: Props) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggle = (id: string) => setOpenSection((s) => (s === id ? null : id));

  const voiceRow = (id: string, label: string) => (
    <AgentVoiceRow
      agentId={id}
      label={label}
      voice={agentVoices[id] ?? { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova' }}
      voices={voices}
      onUpdate={(p) => onAgentVoiceUpdate(id, p)}
      onReset={() => onAgentVoiceReset(id)}
      onTest={onTestAgentVoice}
    />
  );

  return (
    <div className="space-y-3">
      <SecurityNotice />

      {/* System — always enabled; voice-only accordion */}
      <AgentAccordion
        id="system"
        label="System Agent"
        emoji="🖥️"
        status={config.system.enabled ? 'connected' : 'idle'}
        info={config.system.enabled ? 'CPU · memory · battery · network' : undefined}
        open={openSection === 'system'}
        onToggle={() => toggle('system')}
        enabled={config.system.enabled}
        onToggleEnabled={() => onPatch('system', { enabled: !config.system.enabled })}
      >
        {voiceRow('system', 'System')}
      </AgentAccordion>

      <AgentAccordion
        id="weather"
        label="Weather Agent"
        emoji="☁️"
        status={config.weather.status}
        info={config.weather.info}
        open={openSection === 'weather'}
        onToggle={() => toggle('weather')}
        enabled={config.weather.enabled}
        onToggleEnabled={() => onPatch('weather', { enabled: !config.weather.enabled })}
      >
        <WeatherSettings
          config={config.weather}
          onPatch={(p) => onPatch('weather', p)}
          onVerify={onVerifyWeather}
        />
        {voiceRow('weather', 'Weather')}
      </AgentAccordion>

      <AgentAccordion
        id="google"
        label="Google (Calendar · Gmail · Drive)"
        emoji="🔵"
        status={config.google.status}
        info={config.google.info}
        open={openSection === 'google'}
        onToggle={() => toggle('google')}
      >
        <GoogleSettings
          config={config.google}
          onPatch={(p) => onPatch('google', p)}
          onConnect={onConnectGoogle}
          onDisconnect={onDisconnectGoogle}
        />
        {voiceRow('calendar', 'Calendar')}
      </AgentAccordion>

      <AgentAccordion
        id="github"
        label="GitHub Agent"
        emoji="🐙"
        status={config.github.status}
        info={config.github.info}
        open={openSection === 'github'}
        onToggle={() => toggle('github')}
        enabled={config.github.enabled}
        onToggleEnabled={() => onPatch('github', { enabled: !config.github.enabled })}
      >
        <GithubSettings
          config={config.github}
          onPatch={(p) => onPatch('github', p)}
          onVerify={onVerifyGitHub}
          onDisconnect={onDisconnectGitHub}
        />
        {voiceRow('github', 'GitHub')}
      </AgentAccordion>

      <AgentAccordion
        id="stock"
        label="Stock Market Agent"
        emoji="📈"
        status={config.stock.status}
        info={config.stock.info}
        open={openSection === 'stock'}
        onToggle={() => toggle('stock')}
        enabled={config.stock.enabled}
        onToggleEnabled={() => onPatch('stock', { enabled: !config.stock.enabled })}
      >
        <StockSettings
          config={config.stock}
          onPatch={(p) => onPatch('stock', p)}
        />
        {voiceRow('stock', 'Stock Market')}
      </AgentAccordion>

      <AgentAccordion
        id="news"
        label="News Agent"
        emoji="📰"
        status={config.news.status}
        info={config.news.info}
        open={openSection === 'news'}
        onToggle={() => toggle('news')}
        enabled={config.news.enabled}
        onToggleEnabled={() => onPatch('news', { enabled: !config.news.enabled })}
      >
        <NewsSettings
          config={config.news}
          onPatch={(p) => onPatch('news', p)}
          onVerify={onVerifyNews}
        />
        {voiceRow('news', 'News')}
      </AgentAccordion>

      <AgentAccordion
        id="smarthome"
        label="Smart Home Agent"
        emoji="🏠"
        status={config.smarthome.status}
        info={config.smarthome.info}
        open={openSection === 'smarthome'}
        onToggle={() => toggle('smarthome')}
        enabled={config.smarthome.enabled}
        onToggleEnabled={() => onPatch('smarthome', { enabled: !config.smarthome.enabled })}
      >
        <SmartHomeSettings
          config={config.smarthome}
          onPatch={(p) => onPatch('smarthome', p)}
          onVerify={onVerifySmartHome}
        />
        {voiceRow('smarthome', 'Smart Home')}
      </AgentAccordion>

      <AgentAccordion
        id="whatsapp"
        label="WhatsApp Agent"
        emoji="💬"
        status={config.whatsapp.status}
        info={config.whatsapp.info}
        open={openSection === 'whatsapp'}
        onToggle={() => toggle('whatsapp')}
        enabled={config.whatsapp.enabled}
        onToggleEnabled={() => onPatch('whatsapp', { enabled: !config.whatsapp.enabled })}
      >
        <WhatsappSettings
          config={config.whatsapp}
          onPatch={(p) => onPatch('whatsapp', p)}
          onVerify={onVerifyWhatsApp}
          onCheckTunnel={onCheckTunnel}
          onStartTunnel={onStartTunnel}
          onStopTunnel={onStopTunnel}
        />
        {voiceRow('whatsapp', 'WhatsApp')}
      </AgentAccordion>

      <AgentAccordion
        id="general"
        label="General AI"
        emoji="🤖"
        status="connected"
        info="Always active — answers general knowledge questions"
        open={openSection === 'general'}
        onToggle={() => toggle('general')}
      >
        {voiceRow('general', 'General AI')}
      </AgentAccordion>

      <div className="rounded-xl border border-white/6 bg-white/3 p-3">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Lock className="h-3.5 w-3.5 flex-shrink-0" />
          More agents (Slack, Jira, Notion, etc.) can be added via the agent framework.
        </div>
      </div>
    </div>
  );
}
