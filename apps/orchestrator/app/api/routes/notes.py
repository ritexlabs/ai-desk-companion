from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import notes_service as _ns
from app.services.llm import llm_service
from app.core.config import settings

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


_PERSONALIZE_SYSTEM = (
    'You are a warm, friendly AI assistant speaking aloud to the user. '
    'Your job is to announce a reminder or alarm. '
    'Always follow this structure: first say "Hey [name]! You have a [Reminder/Alarm] for [title]." '
    'then immediately add 1 short, warm, relevant, encouraging sentence about it — like a caring friend nudging them. '
    'Total length: 2 sentences max. No markdown. Plain spoken English only. '
    'Vary the second sentence every time so it never sounds repetitive.'
)


class _PersonalizeRequest(BaseModel):
    name:  str
    title: str
    body:  str = ''
    type:  str = 'reminder'


@router.post('/api/notes/personalize-reminder')
async def personalize_reminder(req: _PersonalizeRequest) -> dict:
    llm_config = {
        'provider': settings.llm_provider,
        'api_key':  settings.openai_api_key,
        'model':    settings.llm_model,
        'base_url': settings.llm_base_url,
    }
    label   = 'Alarm' if req.type == 'alarm' else 'Reminder'
    detail  = f' Additional context: {req.body}.' if req.body else ''
    user_msg = (
        f"Announce this to {req.name}: they have a {label} for \"{req.title}\".{detail} "
        f"Start exactly with: \"Hey {req.name}! You have a {label} for {req.title}.\" "
        f"Then add one warm, relevant, encouraging sentence."
    )
    message = await llm_service.complete(
        user_message=user_msg,
        llm_config=llm_config,
        system_prompt=_PERSONALIZE_SYSTEM,
        max_tokens=120,
        temperature=0.9,
    )
    if not message:
        message = f"Hey {req.name}! You have a {label} for {req.title}."
    return {'message': message}
