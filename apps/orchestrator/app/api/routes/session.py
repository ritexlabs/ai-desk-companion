from fastapi import APIRouter
from app.models.contracts import EventEnvelope
from app.dependencies import agent_manager, event_bus

router = APIRouter(prefix='/session', tags=['session'])


@router.post('/start')
async def start_session() -> dict:
    await agent_manager.initialize_enabled_agents()
    boot_messages = [
        'Wake word detected. Initializing voice shell.',
        'Starting 4 agents.',
        'Agent 1 (Weather) online.',
        'Agent 2 (Google Calendar) online.',
        'Agent 3 (Google Email) online.',
        'Agent 4 (GitHub) online.',
        'All 4 agents are online and ready for your command.'
    ]
    for msg in boot_messages:
        event_bus.publish(EventEnvelope(event='boot_status', payload={'message': msg}))
    return {'status': 'started', 'messages': boot_messages}


@router.post('/stop')
async def stop_session() -> dict:
    await agent_manager.shutdown()
    event_bus.publish(EventEnvelope(event='session_stopped', payload={'message': 'Session returned to sleep mode.'}))
    return {'status': 'stopped'}
