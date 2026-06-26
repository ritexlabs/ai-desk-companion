import { useState } from 'react';
import type { AppConfig } from '../../hooks/useAppConfig';
import { SectionLabel } from './shared';

interface Props {
  config: AppConfig;
  onUpdate: (p: Partial<AppConfig>) => void;
}

export function ProfileSettings({ config, onUpdate }: Props) {
  const [assistantName, setAssistantName] = useState(config.assistantName);
  const [wakeWord, setWakeWord]           = useState(config.wakeWord);
  const [name, setName]                   = useState(config.callingName);

  const save = () => onUpdate({
    assistantName: assistantName.trim() || 'Robo',
    wakeWord:      wakeWord.trim()      || assistantName.trim() || 'Robo',
    callingName:   name.trim()          || 'Master',
  });

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Assistant Name</SectionLabel>
        <input
          value={assistantName}
          onChange={(e) => setAssistantName(e.target.value)}
          placeholder="e.g. Robo, Aria, Jarvis…"
          className="w-full h-10 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition-colors"
        />
        <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">
          The name your AI assistant goes by. Used in greetings and responses.
          Current: <span className="text-slate-400 font-medium">"{config.assistantName}"</span>
        </p>
      </section>

      <section>
        <SectionLabel>Wake-Up Word</SectionLabel>
        <input
          value={wakeWord}
          onChange={(e) => setWakeWord(e.target.value)}
          placeholder="e.g. Robo, Aria…"
          className="w-full h-10 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/35 transition-colors"
        />
        <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">
          Say this word to activate from standby — "Hey {wakeWord || config.wakeWord}", "Wake-up {wakeWord || config.wakeWord}".
          Current: <span className="text-slate-400 font-medium">"{config.wakeWord}"</span>
        </p>
      </section>

      <section>
        <SectionLabel>Your Calling Name</SectionLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Master, Boss, Your Name…"
          className="w-full h-10 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400/35 transition-colors"
        />
        <p className="mt-1.5 text-[11px] text-slate-600">
          How {config.assistantName} addresses you. Current: <span className="text-slate-400 font-medium">"{config.callingName}"</span>
        </p>
      </section>

      <button
        onClick={save}
        className="w-full h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-semibold hover:opacity-90 transition"
      >
        Save Profile
      </button>
    </div>
  );
}
