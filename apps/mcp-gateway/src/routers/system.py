from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from src.config.settings import settings

router = APIRouter(prefix='/api/system', tags=['system'])


class SystemConfigBody(BaseModel):
    disabled_metrics: list[str]


@router.get('/config')
async def get_system_config():
    disabled = [m.strip() for m in settings.system_disabled_metrics.split(',') if m.strip()]
    return {'disabled_metrics': disabled}


@router.post('/config')
async def set_system_config(body: SystemConfigBody):
    value = ','.join(body.disabled_metrics)
    settings.system_disabled_metrics = value

    env_file = Path(__file__).parents[3] / '.env'
    if env_file.exists():
        content = env_file.read_text()
        pattern  = re.compile(r'^SYSTEM_DISABLED_METRICS=.*', re.MULTILINE)
        new_line = f'SYSTEM_DISABLED_METRICS={value}'
        if pattern.search(content):
            content = pattern.sub(new_line, content)
        else:
            content = content.rstrip('\n') + f'\n{new_line}\n'
        env_file.write_text(content)

    return {'disabled_metrics': body.disabled_metrics}
