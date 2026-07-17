from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import gateway_client

router = APIRouter(prefix='/api/stocks', tags=['stocks'])


@router.get('/portfolio')
async def get_portfolio(
    spreadsheet_id: str = Query('', description='Google Sheet ID; falls back to gateway .env MYSTOCKS_SPREADSHEET_ID'),
    x_google_token: str = Header('', alias='X-Google-Token'),
):
    try:
        args: dict = {}
        if spreadsheet_id:
            args['spreadsheet_id'] = spreadsheet_id
        if x_google_token:
            args['token'] = x_google_token
        rows = await gateway_client.call_tool('stocks__get_portfolio', args)
        if not isinstance(rows, list):
            rows = []
        return {'rows': rows, 'total': len(rows)}
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Could not load portfolio: {str(e)[:200]}')


@router.get('/sheets')
async def list_sheets(x_google_token: str = Header('', alias='X-Google-Token')):
    try:
        args: dict = {}
        if x_google_token:
            args['token'] = x_google_token
        sheets = await gateway_client.call_tool('stocks__list_sheets', args)
        if not isinstance(sheets, list):
            sheets = []
        return {'sheets': sheets}
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Could not list sheets: {str(e)[:200]}')


@router.get('/sheet')
async def get_current_sheet():
    try:
        result = await gateway_client.call_tool('stocks__get_current_sheet', {})
        return result
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e)[:200])


class SaveSheetRequest(BaseModel):
    spreadsheet_id: str
    token: str = ''


@router.post('/sheet')
async def save_sheet(
    body: SaveSheetRequest,
    x_google_token: str = Header('', alias='X-Google-Token'),
):
    try:
        args: dict = {'spreadsheet_id': body.spreadsheet_id}
        token = body.token or x_google_token
        if token:
            args['token'] = token
        result = await gateway_client.call_tool('stocks__save_sheet', args)
        return result
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Could not save sheet: {str(e)[:200]}')
