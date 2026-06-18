from pydantic import BaseModel


class ProviderConnectionState(BaseModel):
    provider: str
    connected: bool = False
    detail: str | None = None


class AuthManager:
    def __init__(self) -> None:
        self._states = {
            'google': ProviderConnectionState(provider='google', connected=False, detail='Not connected'),
            'github': ProviderConnectionState(provider='github', connected=False, detail='Not connected'),
        }

    def get_states(self) -> list[ProviderConnectionState]:
        return list(self._states.values())
