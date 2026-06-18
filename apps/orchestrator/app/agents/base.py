from __future__ import annotations

from abc import ABC, abstractmethod
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse


class AssistantAgent(ABC):
    id: str
    name: str

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
