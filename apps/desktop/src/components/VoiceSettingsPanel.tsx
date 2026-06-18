import { motion, AnimatePresence } from 'framer-motion';
import { Play, Volume2, X } from 'lucide-react';
import type { VoiceConfig, VoiceGender, VoiceSpeed } from '../hooks/useVoiceConfig';

interface Props {
  open: boolean;
  onClose: () => void;
  config: VoiceConfig;
  voices: SpeechSynthesisVoice[];
  onUpdate: (partial: Partial<VoiceConfig>) => void;
  onTest: (text: string) => void;
}

const GENDER_OPTIONS: { value: VoiceGender; label: string; icon: string }[] = [
  { value: 'female', label: 'Female', icon: '♀' },
  { value: 'male', label: 'Male', icon: '♂' },
];

const SPEED_OPTIONS: { value: VoiceSpeed; label: string; icon: string; desc: string }[] = [
  { value: 'slow', label: 'Slow', icon: '🐢', desc: 'Calm & deliberate' },
  { value: 'normal', label: 'Normal', icon: '🎙️', desc: 'Natural pace' },
  { value: 'fast', label: 'Fast', icon: '⚡', desc: 'Quick & snappy' },
];

export function VoiceSettingsPanel({ open, onClose, config, voices, onUpdate, onTest }: Props) {
  const filteredVoices = voices.filter((v) => {
    if (!config.voiceName) return true;
    return true; // Show all, user picks
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            className="fixed right-0 top-0 bottom-0 z-50 flex w-80 flex-col bg-[#080f1f]/95 border-l border-white/10 backdrop-blur-2xl shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
          >
            {/* Top edge glow */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/15 border border-cyan-400/25">
                  <Volume2 className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Voice Settings</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">Configure Robo's voice</div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {/* Gender */}
              <section>
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-3">Voice Gender</div>
                <div className="grid grid-cols-2 gap-2">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onUpdate({ gender: opt.value, voiceName: '' })}
                      className={`h-12 rounded-xl border text-sm font-medium transition-all ${
                        config.gender === opt.value
                          ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300 shadow-lg shadow-cyan-400/10'
                          : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      <div className="text-xl mb-0.5">{opt.icon}</div>
                      <div className="text-xs">{opt.label}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Speed */}
              <section>
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-3">Speaking Speed</div>
                <div className="space-y-2">
                  {SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onUpdate({ speed: opt.value })}
                      className={`w-full flex items-center gap-3 h-11 rounded-xl border px-4 text-sm transition-all ${
                        config.speed === opt.value
                          ? 'border-violet-400/50 bg-violet-400/12 text-violet-200 shadow-lg shadow-violet-400/10'
                          : 'border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      <span className="text-base">{opt.icon}</span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="ml-auto text-xs opacity-60">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Voice picker */}
              {filteredVoices.length > 0 && (
                <section>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-3">
                    Specific Voice <span className="text-slate-600">(optional)</span>
                  </div>
                  <div className="relative">
                    <select
                      value={config.voiceName}
                      onChange={(e) => onUpdate({ voiceName: e.target.value })}
                      className="w-full h-11 rounded-xl border border-white/10 bg-black/35 pl-4 pr-8 text-sm text-white appearance-none cursor-pointer outline-none focus:border-cyan-400/40 transition"
                    >
                      <option value="">Auto — best match for gender</option>
                      <optgroup label="English Voices">
                        {filteredVoices.map((v) => (
                          <option key={v.name} value={v.name} className="bg-slate-900">
                            {v.name} {v.localService ? '(local)' : '(remote)'}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">▼</div>
                  </div>
                  {filteredVoices.length === 0 && (
                    <p className="mt-2 text-xs text-slate-600">No voices loaded yet — try refreshing.</p>
                  )}
                </section>
              )}

              {/* Current config summary */}
              <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Active Config</div>
                {[
                  { label: 'Gender', value: config.gender === 'female' ? '♀ Female' : '♂ Male' },
                  { label: 'Speed', value: config.speed },
                  { label: 'Voice', value: config.voiceName || 'Auto' },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-xs">
                    <span className="text-slate-500">{row.label}</span>
                    <span className="text-slate-300 capitalize">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Test button */}
            <div className="px-5 py-4 border-t border-white/8 space-y-3">
              <button
                onClick={() =>
                  onTest(
                    "Good Evening, Ritesh. I am Robo, your AI assistant. All systems are online and ready for your command."
                  )
                }
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition"
              >
                <Play className="h-4 w-4" />
                Test Voice
              </button>
              <p className="text-[10px] text-slate-600 text-center leading-relaxed">
                Best voices: Chrome → Google UK English. macOS → Samantha Enhanced or Karen Enhanced.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
