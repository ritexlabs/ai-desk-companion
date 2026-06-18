from collections import deque
from app.models.contracts import EventEnvelope


class EventBus:
    def __init__(self, max_events: int = 200) -> None:
        self._events: deque[EventEnvelope] = deque(maxlen=max_events)

    def publish(self, event: EventEnvelope) -> None:
        self._events.append(event)

    def list_events(self) -> list[EventEnvelope]:
        return list(self._events)
