import { Play, RotateCcw } from 'lucide-react';
import type { AgentVoiceSetting } from '../../hooks/useAgentVoiceConfig';
import { OPENAI_VOICES } from '../../hooks/useAgentVoiceConfig';
import type { VoiceGender, VoiceSpeed } from '../../hooks/useVoiceConfig';

interface Props {
  agentId: string;
  label: string;
  voice: AgentVoiceSetting;
  voices: SpeechSynthesisVoice[];
  onUpdate: (p: Partial<AgentVoiceSetting>) => void;
  onReset: () => void;
  onTest: (text: string, agentId: string) => void;
}

const GENDERS: { value: VoiceGender; label: string }[] = [
  { value: 'female', label: '♀ F' },
  { value: 'male',   label: '♂ M' },
];

const SPEEDS: { value: VoiceSpeed; icon: string }[] = [
  { value: 'slow',   icon: '🐢' },
  { value: 'normal', icon: '🎙️' },
  { value: 'fast',   icon: '⚡' },
];

export function AgentVoiceRow({ agentId, label, voice, voices, onUpdate, onReset, onTest }: Props) {
  return (
    <div className="mt-3 pt-3 border-t border-white/6 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Voice</span>
        <button onClick={onReset} title="Reset to default" className="text-slate-600 hover:text-slate-400 transition">
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      <div className="flex gap-2">
        {/* Gender */}
        <div className="flex gap-1">
          {GENDERS.map((g) => (
            <button
              key={g.value}
              onClick={() => onUpdate({ gender: g.value, voiceName: '' })}
              className={`h-8 px-3 rounded-lg border text-[11px] font-medium transition-all ${
                voice.gender === g.value
                  ? 'border-cyan-400/45 bg-cyan-400/12 text-cyan-300'
                  : 'border-white/8 bg-white/3 text-slate-500 hover:text-white hover:bg-white/6'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Speed */}
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              onClick={() => onUpdate({ speed: s.value })}
              className={`h-8 w-8 rounded-lg border text-sm transition-all ${
                voice.speed === s.value
                  ? 'border-violet-400/45 bg-violet-400/10 text-violet-300'
                  : 'border-white/8 bg-white/3 text-slate-500 hover:text-white hover:bg-white/6'
              }`}
            >
              {s.icon}
            </button>
          ))}
        </div>

        {/* Test */}
        <button
          onClick={() => onTest(`${label} agent online and ready.`, agentId)}
          title="Test voice"
          className="ml-auto h-8 w-8 flex items-center justify-center rounded-lg border border-white/8 text-slate-500 hover:text-cyan-400 hover:border-cyan-400/30 transition"
        >
          <Play className="h-3 w-3" />
        </button>
      </div>

      {/* OpenAI voice */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-600 flex-shrink-0 w-14">OpenAI</span>
        <div className="relative flex-1">
          <select
            value={voice.openaiVoice}
            onChange={(e) => onUpdate({ openaiVoice: e.target.value })}
            className="w-full h-7 rounded-lg border border-white/8 bg-black/30 pl-2 pr-6 text-[11px] text-slate-300 appearance-none cursor-pointer outline-none focus:border-cyan-400/30 transition"
          >
            {OPENAI_VOICES.map((v) => (
              <option key={v} value={v} className="bg-slate-900">{v}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-600 text-[9px]">▼</div>
        </div>
      </div>

      {/* Browser voice (optional) */}
      {voices.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600 flex-shrink-0 w-14">Browser</span>
          <div className="relative flex-1">
            <select
              value={voice.voiceName}
              onChange={(e) => onUpdate({ voiceName: e.target.value })}
              className="w-full h-7 rounded-lg border border-white/8 bg-black/30 pl-2 pr-6 text-[11px] text-slate-300 appearance-none cursor-pointer outline-none focus:border-cyan-400/30 transition"
            >
              <option value="">Auto (gender match)</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name} className="bg-slate-900">{v.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-600 text-[9px]">▼</div>
          </div>
        </div>
      )}
    </div>
  );
}
