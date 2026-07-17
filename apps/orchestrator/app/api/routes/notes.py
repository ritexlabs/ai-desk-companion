from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import notes_service as _ns

router = APIRouter()


class _CreateRequest(BaseModel):
    type:        str
    title:       str
    body:        str = ''
    due_at:      int | None = None
    repeat:      str | None = None
    repeat_time: str | None = None
    repeat_days: list[int] | None = None


class _UpdateRequest(BaseModel):
    title:       str | None = None
    body:        str | None = None
    due_at:      int | None = None
    repeat:      str | None = None
    repeat_time: str | None = None
    repeat_days: list[int] | None = None
    completed:   bool | None = None
    fired:       bool | None = None


class _SnoozeRequest(BaseModel):
    minutes: int = 10


@router.get('/api/notes')
async def list_notes(
    type: str | None = None,
    include_completed: bool = True,
) -> dict:
    items = _ns.list_items(type=type, include_completed=include_completed)
    return {'items': items}


@router.post('/api/notes')
async def create_note(body: _CreateRequest) -> dict:
    if not body.title.strip():
        raise HTTPException(status_code=400, detail='Title is required.')
    if body.type not in ('note', 'task', 'reminder', 'alarm'):
        raise HTTPException(status_code=400, detail='type must be note, task, reminder, or alarm.')
    item = _ns.create_item(
        type=body.type,
        title=body.title,
        body=body.body,
        due_at=body.due_at,
        repeat=body.repeat,
        repeat_time=body.repeat_time,
        repeat_days=body.repeat_days,
    )
    return {'item': item}


@router.put('/api/notes/{item_id}')
async def update_note(item_id: str, body: _UpdateRequest) -> dict:
    kwargs = {k: v for k, v in body.model_dump().items() if v is not None}
    item = _ns.update_item(item_id, **kwargs)
    if not item:
        raise HTTPException(status_code=404, detail='Item not found.')
    return {'item': item}


@router.delete('/api/notes/{item_id}')
async def delete_note(item_id: str) -> dict:
    if not _ns.delete_item(item_id):
        raise HTTPException(status_code=404, detail='Item not found.')
    return {'ok': True}


@router.post('/api/notes/{item_id}/complete')
async def complete_note(item_id: str) -> dict:
    item = _ns.complete_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail='Item not found.')
    return {'item': item}


@router.post('/api/notes/{item_id}/snooze')
async def snooze_note(item_id: str, body: _SnoozeRequest) -> dict:
    if not _ns.snooze_item(item_id, body.minutes):
        raise HTTPException(status_code=404, detail='Item not found.')
    return {'ok': True, 'snoozed_minutes': body.minutes}


@router.get('/api/notes/pending-alerts')
async def get_pending_alerts() -> dict:
    return {'alerts': _ns.pop_pending_alerts()}
