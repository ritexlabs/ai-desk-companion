from fastapi import APIRouter
from app.dependencies import agent_manager

router = APIRouter(prefix='/health', tags=['health'])


@router.get('')
async def health_check() -> dict:
    snapshot = await agent_manager.health_snapshot()
    return {
        'status': 'ok',
        'agents': [item.model_dump() for item in snapshot]
    }
