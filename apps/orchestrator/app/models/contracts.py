from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field
from typing import Any, Literal


class AgentStatus(str, Enum):
    OFFLINE = 'offline'
    STARTING = 'starting'
    ONLINE = 'online'
    DEGRADED = 'degraded'
    FAILED = 'failed'


class RuntimePhase(str, Enum):
    STANDBY = 'standby'
    WAKE_DETECTED = 'wake_detected'
    BOOTING = 'booting'
    READY = 'ready'
    LISTENING = 'listening'
    THINKING = 'thinking'
    RESPONDING = 'responding'
    ERROR = 'error'
    SLEEP = 'sleep'


class AgentHealth(BaseModel):
    name: str
    status: AgentStatus
    detail: str | None = None


class AgentRequest(BaseModel):
    text: str
    session_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    agent: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SessionCommand(str, Enum):
    START_SESSION = 'start_session'
    STOP_SESSION = 'stop_session'
    SEND_TEXT_COMMAND = 'send_text_command'
    RETRY_AGENT = 'retry_agent'


class UICommand(BaseModel):
    command: SessionCommand
    payload: dict[str, Any] = Field(default_factory=dict)


class RouteResult(BaseModel):
    agent: str
    confidence: float
    reason: str


class EventEnvelope(BaseModel):
    event: str
    payload: dict[str, Any] = Field(default_factory=dict)


class TranscriptTurn(BaseModel):
    speaker: Literal['user', 'assistant', 'system']
    text: str
    timestamp: str
