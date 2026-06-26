import { useCallback, useState } from 'react';
import type { VoiceGender, VoiceSpeed } from './useVoiceConfig';

export interface AgentVoiceSetting {
  gender: VoiceGender;
  speed: VoiceSpeed;
  voiceName: string;     // specific browser voice name (empty = auto)
  openaiVoice: string;   // alloy | echo | fable | nova | onyx | shimmer
}

export type AgentVoiceMap = Record<string, AgentVoiceSetting>;

export const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'] as const;

const DEFAULT_AGENT_VOICES: AgentVoiceMap = {
  system:    { gender: 'male',   speed: 'slow',   voiceName: '', openaiVoice: 'echo'    },
  weather:   { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova'    },
  calendar:  { gender: 'female', speed: 'fast',   voiceName: '', openaiVoice: 'shimmer' },
  email:     { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'alloy'   },
  github:    { gender: 'male',   speed: 'fast',   voiceName: '', openaiVoice: 'onyx'    },
  stock:     { gender: 'male',   speed: 'slow',   voiceName: '', openaiVoice: 'fable'   },
  news:      { gender: 'female', speed: 'fast',   voiceName: '', openaiVoice: 'echo'    },
  smarthome: { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'alloy'   },
  whatsapp:  { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova'    },
  general:   { gender: 'female', speed: 'normal', voiceName: '', openaiVoice: 'nova'    },
};

const STORAGE_KEY = 'robo-agent-voice-config';

export function useAgentVoiceConfig() {
  const [agentVoices, setAgentVoices] = useState<AgentVoiceMap>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_AGENT_VOICES;
      const saved = JSON.parse(raw) as Partial<AgentVoiceMap>;
      // Merge saved over defaults so new agents get their defaults automatically
      const merged: AgentVoiceMap = { ...DEFAULT_AGENT_VOICES };
      for (const [id, setting] of Object.entries(saved)) {
        if (id in merged) merged[id] = { ...merged[id], ...setting };
      }
      return merged;
    } catch {
      return DEFAULT_AGENT_VOICES;
    }
  });

  const updateAgentVoice = useCallback((agentId: string, partial: Partial<AgentVoiceSetting>) => {
    setAgentVoices((prev) => {
      const next = {
        ...prev,
        [agentId]: { ...(prev[agentId] ?? DEFAULT_AGENT_VOICES[agentId] ?? DEFAULT_AGENT_VOICES.general), ...partial },
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const resetAgentVoice = useCallback((agentId: string) => {
    setAgentVoices((prev) => {
      const next = { ...prev, [agentId]: DEFAULT_AGENT_VOICES[agentId] ?? DEFAULT_AGENT_VOICES.general };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { agentVoices, updateAgentVoice, resetAgentVoice, defaults: DEFAULT_AGENT_VOICES };
}
