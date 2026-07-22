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

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type AgentNotification = {
  id:           string;
  conditionKey: string;   // dedup key, e.g. "battery_low", "new_email"
  agentId:      string;
  agentLabel:   string;
  message:      string;
  severity:     NotificationSeverity;
  timestamp:    number;
};
