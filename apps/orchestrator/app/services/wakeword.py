from pydantic import BaseModel


class WakeWordConfig(BaseModel):
    phrase: str = 'Robo Wake-Up'
    threshold: float = 0.6
    cooldown_seconds: int = 3
    microphone_device: str | None = None


class MockWakeWordService:
    def __init__(self, config: WakeWordConfig | None = None) -> None:
        self.config = config or WakeWordConfig()
        self.started = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.started = False

    async def simulate_detection(self) -> bool:
        return self.started
