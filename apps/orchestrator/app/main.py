import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.session import router as session_router
from app.api.routes.command import router as command_router
from app.api.routes.system import router as system_router
from app.api.routes.smarthome import router as smarthome_router
from app.api.routes.portfolio import router as portfolio_router
from app.api.routes.stocks import router as stocks_router
from app.api.routes.agent_data import router as agent_data_router
from app.api.routes.whatsapp import router as whatsapp_router
from app.api.routes.notes import router as notes_router
from app.api.ws import router as ws_router, broadcast
from app.core.config import settings
from app.core.logging import configure_logging
from app.dependencies import agent_manager, wake_word_service, metrics_service

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()

    # ── Start server-side wake word detection (optional dependency) ──
    if settings.wake_word_enabled:
        if wake_word_service.available:
            def _on_wake(model_name: str) -> None:
                asyncio.ensure_future(
                    broadcast('wake_word_detected', {'model': model_name})
                )
            wake_word_service.start(
                models=[settings.wake_word_model],
                sensitivity=settings.wake_word_sensitivity,
                callback=_on_wake,
                loop=loop,
            )
        else:
            logger.warning(
                'WAKE_WORD_ENABLED=true but required packages are not installed. '
                'Run: pip install sounddevice openwakeword numpy'
            )

    # ── Periodic metrics broadcast (every 5 s) ───────────────────────
    async def _metrics_loop() -> None:
        while True:
            await asyncio.sleep(5)
            await broadcast('metrics_update', metrics_service.snapshot())

    metrics_task = asyncio.create_task(_metrics_loop())

    # ── Notes/reminders/alarms scheduler (every 30 s) ────────────────
    from app.services.notes_service import scheduler_loop as _notes_scheduler
    notes_task = asyncio.create_task(_notes_scheduler())

    yield

    # ── Shutdown ─────────────────────────────────────────────────────
    wake_word_service.stop()
    metrics_task.cancel()
    notes_task.cancel()
    try:
        await metrics_task
    except asyncio.CancelledError:
        pass
    try:
        await notes_task
    except asyncio.CancelledError:
        pass
    await agent_manager.shutdown()


app = FastAPI(title=settings.app_name, version='0.1.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health_router)
app.include_router(session_router)
app.include_router(command_router)
app.include_router(system_router)
app.include_router(smarthome_router)
app.include_router(portfolio_router)
app.include_router(stocks_router)
app.include_router(agent_data_router)
app.include_router(whatsapp_router)
app.include_router(notes_router)
app.include_router(ws_router)


@app.get('/')
async def root() -> dict:
    return {
        'name':            settings.app_name,
        'env':             settings.env,
        'wake_phrase':     settings.wake_phrase,
        'wake_word':       settings.wake_word_enabled and wake_word_service.available,
        'wake_word_model': settings.wake_word_model,
        'ws':              'ws://localhost:8787/ws',
        'metrics':         metrics_service.snapshot(),
    }
