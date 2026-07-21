from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class AgentMessage:
    """Inter-agent call routed through the orchestrator.

    Agents must NOT import each other directly. Use this protocol
    and route through agent_manager.call_agent_from_agent().
    """
    source_agent: str
    tool_name: str          # gateway tool (e.g. 'weather__get_current_weather')
                            # OR local agent ID (e.g. 'calculator')
    arguments: dict = field(default_factory=dict)
    timeout: float = 5.0
