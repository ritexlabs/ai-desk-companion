import { Play } from 'lucide-react';
import type { VoiceConfig, VoiceGender, VoiceSpeed } from '../../hooks/useVoiceConfig';
import { SectionLabel } from './shared';

interface Props {
  config: VoiceConfig;
  onUpdate: (p: Partial<VoiceConfig>) => void;
  voices: SpeechSynthesisVoice[];
  onTest: (text: string) => void;
  assistantName: string;
}

const GENDER_OPTS: { value: VoiceGender; label: string; icon: string }[] = [
  { value: 'female', label: 'Female', icon: '♀' },
  { value: 'male',   label: 'Male',   icon: '♂' },
];

const SPEED_OPTS: { value: VoiceSpeed; label: string; icon: string; desc: string }[] = [
  { value: 'slow',   label: 'Slow',   icon: '🐢', desc: 'Calm & deliberate' },
  { value: 'normal', label: 'Normal', icon: '🎙️', desc: 'Natural pace'      },
  { value: 'fast',   label: 'Fast',   icon: '⚡', desc: 'Quick & snappy'    },
];

export function VoiceSettings({ config, onUpdate, voices, onTest, assistantName }: Props) {
  return (
    <div className="space-y-6">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Global defaults — used as fallback when an agent has no voice override.
        Configure per-agent voices in the <span className="text-slate-400">Agents</span> tab.
      </p>

      <section>
        <SectionLabel>Default Voice Gender</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {GENDER_OPTS.map((o) => (
            <button
              key={o.value}
              onClick={() => onUpdate({ gender: o.value, voiceName: '' })}
              className={`h-12 rounded-xl border text-sm font-medium transition-all ${
                config.gender === o.value
                  ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300 shadow-lg shadow-cyan-400/10'
                  : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
              }`}
            >
              <div className="text-xl mb-0.5">{o.icon}</div>
              <div className="text-xs">{o.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Default Speaking Speed</SectionLabel>
        <div className="space-y-2">
          {SPEED_OPTS.map((o) => (
            <button
              key={o.value}
              onClick={() => onUpdate({ speed: o.value })}
              className={`w-full flex items-center gap-3 h-11 rounded-xl border px-4 text-sm transition-all ${
                config.speed === o.value
                  ? 'border-violet-400/50 bg-violet-400/12 text-violet-200'
                  : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
              }`}
            >
              <span className="text-base">{o.icon}</span>
              <span className="font-medium">{o.label}</span>
              <span className="ml-auto text-xs opacity-60">{o.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {voices.length > 0 && (
        <section>
          <SectionLabel>Default Voice <span className="text-slate-600 normal-case">(optional)</span></SectionLabel>
          <div className="relative">
            <select
              value={config.voiceName}
              onChange={(e) => onUpdate({ voiceName: e.target.value })}
              className="w-full h-10 rounded-xl border border-white/10 bg-black/35 pl-4 pr-8 text-sm text-white appearance-none cursor-pointer outline-none focus:border-cyan-400/35 transition"
            >
              <option value="">Auto — best match for gender</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name} className="bg-slate-900">
                  {v.name} {v.localService ? '' : '(remote)'}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">▼</div>
          </div>
        </section>
      )}

      <button
        onClick={() => onTest(`Good evening. I am ${assistantName}, your AI assistant. All systems are online.`)}
        className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-semibold hover:opacity-90 transition"
      >
        <Play className="h-4 w-4" /> Test Default Voice
      </button>

      <p className="text-[10px] text-slate-600 leading-relaxed text-center">
        Best voices: Chrome → Google UK English · macOS → Samantha Enhanced or Karen Enhanced.
      </p>
    </div>
  );
}
