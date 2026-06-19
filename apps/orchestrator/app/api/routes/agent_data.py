from __future__ import annotations

import asyncio
from functools import partial

from fastapi import APIRouter

router = APIRouter(prefix='/api/agent', tags=['agent-data'])

_IN_INDEXES = {
    '^NSEI':    'Nifty 50',
    '^BSESN':   'Sensex',
    '^NSEBANK': 'Bank Nifty',
    '^CNXIT':   'Nifty IT',
    '^CNXAUTO': 'Nifty Auto',
}

_US_INDEXES = {
    '^GSPC': 'S&P 500',
    '^DJI':  'Dow Jones',
    '^IXIC': 'NASDAQ',
    '^RUT':  'Russell 2000',
}


def _fetch_index(symbol: str, name: str) -> dict:
    try:
        import yfinance as yf
        fi = yf.Ticker(symbol).fast_info
        price = fi.last_price or 0.0
        prev  = fi.previous_close or 0.0
        change = price - prev
        change_pct = (change / prev * 100) if prev else 0.0
        return {
            'symbol':     symbol,
            'name':       name,
            'price':      round(price, 2),
            'change':     round(change, 2),
            'change_pct': round(change_pct, 2),
            'error':      None,
        }
    except Exception as e:
        return {'symbol': symbol, 'name': name, 'price': None, 'change': None, 'change_pct': None, 'error': str(e)[:80]}


@router.get('/stock/summary')
async def stock_summary(market: str = 'IN') -> dict:
    """Return major index prices for IN (NSE/BSE) or US market."""
    index_map = _IN_INDEXES if market.upper() == 'IN' else _US_INDEXES
    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(None, partial(_fetch_index, sym, name))
        for sym, name in index_map.items()
    ]
    indexes = list(await asyncio.gather(*tasks))
    return {'market': market.upper(), 'indexes': indexes}
