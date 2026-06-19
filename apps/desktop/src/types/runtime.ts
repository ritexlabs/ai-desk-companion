export type RuntimePhase =
  | 'standby'
  | 'wake_detected'
  | 'booting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'responding'
  | 'error'
  | 'sleep';

export type AgentStatus = 'offline' | 'starting' | 'online' | 'degraded' | 'failed';

export type AgentDefinition = {
  id: string;
  label: string;
  description: string;
  example: string;
  status: AgentStatus;
  color: string;
};

export type TranscriptTurn = {
  speaker: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  agentId?: string;
};
