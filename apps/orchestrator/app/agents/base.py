from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse


class AssistantAgent(ABC):
    id: str
    name: str
    # Key inside the agent_config dict sent from the UI (None = no external credential).
    config_key: ClassVar[str | None] = None
    # LLM tool definition. None means the agent is not exposed as an LLM tool
    # (e.g. GeneralAIAgent handles the fallback path directly).
    tool_meta: ClassVar[dict | None] = None

    @abstractmethod
    async def initialize(self) -> None:
        ...

    @abstractmethod
    async def health(self) -> AgentHealth:
        ...

    @abstractmethod
    async def handle(self, request: AgentRequest) -> AgentResponse:
        ...

    @abstractmethod
    async def shutdown(self) -> None:
        ...
