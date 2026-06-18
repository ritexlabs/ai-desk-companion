from fastapi import APIRouter
from pydantic import BaseModel
from app.dependencies import agent_manager, router_service, event_bus
from app.models.contracts import AgentRequest, EventEnvelope

router = APIRouter(prefix='/command', tags=['command'])


class TextCommandRequest(BaseModel):
    text: str


@router.post('/text')
async def send_text_command(request: TextCommandRequest) -> dict:
    route = router_service.route(request.text)
    event_bus.publish(EventEnvelope(event='route_selected', payload=route.model_dump()))

    agent_response = await agent_manager.handle(
        route.agent,
        AgentRequest(text=request.text)
    )

    event_bus.publish(EventEnvelope(event='assistant_speaking', payload=agent_response.model_dump()))

    return {
        'route': route.model_dump(),
        'response': agent_response.model_dump()
    }


@router.get('/events')
async def list_events() -> dict:
    return {'events': [event.model_dump() for event in event_bus.list_events()]}
