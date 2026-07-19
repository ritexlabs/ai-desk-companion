from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import httpx

from src.config.settings import settings
from src.tools.base import BaseTool
from src.utils.errors import ToolAuthError

_SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
_DRIVE_BASE  = 'https://www.googleapis.com/drive/v3/files'
_ENV_PATH    = Path(__file__).parents[2] / '.env'


def _google_auth(override_token: str = '') -> dict[str, str]:
    token = override_token.strip() or settings.google_access_token.strip()
    if not token:
        raise ToolAuthError(
            'Google not connected. Sign in via Settings → Google and make sure Drive scope is enabled.'
        )
    return {'Authorization': f'Bearer {token}'}


def _write_env(key: str, value: str) -> None:
    if not _ENV_PATH.exists():
        return
    content = _ENV_PATH.read_text()
    new_line = f'{key}={value}'
    if re.search(rf'^{re.escape(key)}=', content, re.MULTILINE):
        content = re.sub(rf'^{re.escape(key)}=.*', new_line, content, flags=re.MULTILINE)
    else:
        content = content.rstrip('\n') + f'\n{new_line}\n'
    _ENV_PATH.write_text(content)

_IN_ALIASES: dict[str, str] = {
    'nifty': '^NSEI', 'nifty 50': '^NSEI', 'nifty50': '^NSEI',
    'sensex': '^BSESN', 'bse': '^BSESN',
    'bank nifty': '^NSEBANK', 'nifty bank': '^NSEBANK', 'banknifty': '^NSEBANK',
    'nifty it': '^CNXIT', 'nifty auto': '^CNXAUTO', 'nifty pharma': '^CNXPHARMA',
    'reliance': 'RELIANCE.NS', 'tcs': 'TCS.NS',
    'infosys': 'INFY.NS', 'infy': 'INFY.NS',
    'hdfc bank': 'HDFCBANK.NS', 'hdfcbank': 'HDFCBANK.NS',
    'icici bank': 'ICICIBANK.NS', 'icicibank': 'ICICIBANK.NS', 'icici': 'ICICIBANK.NS',
    'wipro': 'WIPRO.NS', 'itc': 'ITC.NS',
    'bajaj finance': 'BAJFINANCE.NS', 'bajajfinance': 'BAJFINANCE.NS', 'bajaj': 'BAJFINANCE.NS',
    'kotak bank': 'KOTAKBANK.NS', 'kotakbank': 'KOTAKBANK.NS', 'kotak': 'KOTAKBANK.NS',
    'sbi': 'SBIN.NS', 'axis bank': 'AXISBANK.NS', 'axisbank': 'AXISBANK.NS', 'axis': 'AXISBANK.NS',
    'maruti': 'MARUTI.NS', 'hul': 'HINDUNILVR.NS', 'hindustan unilever': 'HINDUNILVR.NS',
    'sun pharma': 'SUNPHARMA.NS', 'sunpharma': 'SUNPHARMA.NS',
    'l&t': 'LT.NS', 'larsen': 'LT.NS', 'ntpc': 'NTPC.NS', 'ongc': 'ONGC.NS',
    'ultratech': 'ULTRACEMCO.NS', 'titan': 'TITAN.NS',
    'nestle': 'NESTLEIND.NS', 'nestlé': 'NESTLEIND.NS',
    'asian paints': 'ASIANPAINT.NS',
    'bharti airtel': 'BHARTIARTL.NS', 'airtel': 'BHARTIARTL.NS', 'bharti': 'BHARTIARTL.NS',
    'adani': 'ADANIENT.NS', 'adani enterprises': 'ADANIENT.NS',
    'power grid': 'POWERGRID.NS', 'dr reddy': 'DRREDDY.NS', 'dr. reddy': 'DRREDDY.NS',
    'cipla': 'CIPLA.NS', 'divis': 'DIVISLAB.NS',
    'tech mahindra': 'TECHM.NS', 'techmahindra': 'TECHM.NS',
    'hindalco': 'HINDALCO.NS', 'tata steel': 'TATASTEEL.NS', 'tatasteel': 'TATASTEEL.NS',
    'tata motors': 'TATAMOTORS.NS', 'tatamotors': 'TATAMOTORS.NS',
    'jsw steel': 'JSWSTEEL.NS', 'indusind': 'INDUSINDBK.NS',
    'jio financial': 'JIOFIN.NS', 'zomato': 'ZOMATO.NS', 'paytm': 'PAYTM.NS', 'nykaa': 'NYKAA.NS',
}

_QUESTION_PREFIXES = re.compile(
    r'^(?:'
    r"what(?:'s| is| are)(?: the)?|"
    r"how(?:'s| is)(?: the)?|"
    r'(?:show me|tell me(?: about)?|check|get|give me|fetch)(?: the)?|'
    r'(?:price of|quote for|stock price of|share price of|analysis of|data for|info(?:rmation)?(?: on| about| for)?)(?: the)?|'
    r'(?:support(?: and resistance)?|resistance|momentum|rsi|trend|chart|technicals?)(?: (?:of|for|on))?'
    r')\s+',
    re.I,
)

_QUESTION_SUFFIXES = re.compile(
    r'\s+(?:stock|share|equity|price|index|doing|today|now|right now|currently'
    r'|performance|analysis|momentum|trend|chart|data|information|details)'
    r'[?.,]*$',
    re.I,
)


def _extract_query(text: str) -> str:
    t = text.strip()
    for _ in range(2):
        t = _QUESTION_PREFIXES.sub('', t).strip()
        t = re.sub(r'^the\s+', '', t, flags=re.I)
    t = _QUESTION_SUFFIXES.sub('', t).strip().rstrip('?.,')
    return t or text.strip()


def _resolve_ticker(raw: str, default_market: str) -> str:
    key = raw.strip().lower()
    if key in _IN_ALIASES:
        return _IN_ALIASES[key]
    upper = raw.strip().upper()
    if '.' in upper or upper.startswith('^'):
        return upper
    if default_market.upper() == 'IN' and re.fullmatch(r'[A-Z0-9&]{1,15}', upper):
        return f'{upper}.NS'
    return upper


def _fmt_price(price: float, currency: str) -> str:
    sym = '₹' if currency == 'INR' else ('$' if currency == 'USD' else currency + ' ')
    return f'{sym}{price:,.2f}'


def _rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    deltas   = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains    = [max(d, 0.0) for d in deltas[-period:]]
    losses   = [max(-d, 0.0) for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    return round(100.0 - 100.0 / (1.0 + avg_gain / avg_loss), 1)


def _sma(closes: list[float], period: int) -> float | None:
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 2)


class StocksTool(BaseTool):
    namespace = 'stocks'

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'get_quote',
                'description': (
                    'Get live stock price, daily change, RSI momentum, moving averages, '
                    'and 52-week range for any stock or market index. '
                    'Works for Nifty 50, Sensex, S&P 500, and individual stocks.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': 'Stock query, e.g. "Nifty 50 today", "price of RELIANCE", "AAPL analysis"',
                        },
                    },
                    'required': ['query'],
                },
            },
            {
                'name': 'get_portfolio',
                'description': (
                    'Read the user\'s personal stock portfolio from a Google Sheet. '
                    'Returns all holdings with broker, symbol, quantity, buy price, '
                    'current price, and P&L. Use for "my portfolio", "my holdings", '
                    '"my stocks", "how are my investments doing".'
                ),
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'list_sheets',
                'description': 'List all Google Sheets in the user\'s Google Drive for portfolio selection.',
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'get_current_sheet',
                'description': 'Get the currently configured portfolio Google Sheet ID and name.',
                'inputSchema': {'type': 'object', 'properties': {}, 'required': []},
            },
            {
                'name': 'save_sheet',
                'description': 'Save a Google Sheet ID as the default portfolio sheet.',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'spreadsheet_id': {'type': 'string', 'description': 'Google Sheet ID to save'},
                    },
                    'required': ['spreadsheet_id'],
                },
            },
        ]

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        if tool_name == 'get_portfolio':
            return await self._get_portfolio(
                arguments.get('spreadsheet_id', ''),
                arguments.get('token', ''),
            )
        if tool_name == 'list_sheets':
            return await self._list_sheets(arguments.get('token', ''))
        if tool_name == 'get_current_sheet':
            return await self._get_current_sheet()
        if tool_name == 'save_sheet':
            return self._save_sheet(arguments.get('spreadsheet_id', ''))
        try:
            import yfinance as yf
        except ImportError:
            return 'Stock data requires yfinance. Run: pip install yfinance pandas numpy'

        default_market = settings.stock_default_market
        query          = arguments.get('query', '')
        raw_query      = _extract_query(query)
        ticker         = _resolve_ticker(raw_query, default_market)

        try:
            info   = yf.Ticker(ticker)
            meta   = info.fast_info
            hist   = info.history(period='3mo', interval='1d')

            if hist.empty:
                return (
                    f"Could not find data for '{raw_query}'. "
                    "Try the exact ticker symbol (e.g. RELIANCE.NS, ^NSEI, AAPL)."
                )

            closes  = hist['Close'].tolist()
            current = round(closes[-1], 2)
            prev    = round(closes[-2], 2) if len(closes) > 1 else current
            chg     = round(current - prev, 2)
            chg_pct = round((chg / prev) * 100, 2) if prev else 0.0
            currency= getattr(meta, 'currency', 'INR') or 'INR'

            price_str = _fmt_price(current, currency)
            sign      = '+' if chg >= 0 else ''
            chg_str   = f'{sign}{_fmt_price(chg, currency)} ({sign}{chg_pct}%)'

            rsi_val = _rsi(closes)
            sma20   = _sma(closes, 20)
            sma50   = _sma(closes, 50)

            display_name = getattr(meta, 'short_name', None) or ticker
            lines: list[str] = [f'{display_name} — {price_str}  {chg_str}']

            if rsi_val is not None:
                rsi_label = 'overbought' if rsi_val > 70 else ('oversold' if rsi_val < 30 else 'neutral')
                lines.append(f'RSI(14): {rsi_val} ({rsi_label})')

            if sma20 and sma50:
                trend = 'uptrend' if current > sma20 > sma50 else ('downtrend' if current < sma20 < sma50 else 'consolidating')
                lines.append(f'SMA20: {_fmt_price(sma20, currency)}  SMA50: {_fmt_price(sma50, currency)}  — {trend}')
            elif sma20:
                pos = 'above' if current > sma20 else 'below'
                lines.append(f'SMA20: {_fmt_price(sma20, currency)} — price is {pos} the 20-day average')

            try:
                w52_low  = round(meta.fifty_two_week_low, 2)
                w52_high = round(meta.fifty_two_week_high, 2)
                lines.append(f'52-week range: {_fmt_price(w52_low, currency)} – {_fmt_price(w52_high, currency)}')
            except Exception:
                pass

            return '\n'.join(lines)

        except Exception as exc:
            return f"Could not fetch data for '{raw_query}' (ticker: {ticker}). {str(exc)[:120]}"

    async def _get_portfolio(self, spreadsheet_id: str = '', token: str = '') -> list[dict]:
        headers = _google_auth(token)
        sid = spreadsheet_id.strip() or settings.mystocks_spreadsheet_id.strip()
        if not sid:
            raise ToolAuthError(
                'Portfolio sheet not configured. '
                'Add MYSTOCKS_SPREADSHEET_ID to the gateway .env or Settings → Stocks.'
            )

        rng = settings.mystocks_range or 'A:Z'
        url = f'{_SHEETS_BASE}/{sid}/values/{rng}'
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 401:
                raise ToolAuthError('Google access token expired. Re-sign in via Settings → Google.')
            resp.raise_for_status()

        rows = resp.json().get('values', [])
        if not rows:
            return []

        # Find the header row — identified by having a "broker" column
        header_idx = 0
        for i, row in enumerate(rows):
            if any('broker' in str(cell).lower() for cell in row):
                header_idx = i
                break

        headers = [str(h).strip().lower() for h in rows[header_idx]]
        data_rows = rows[header_idx + 1:]

        def _col(*kws: str) -> int:
            for i, h in enumerate(headers):
                for kw in kws:
                    if kw in h:
                        return i
            return -1

        ci_broker = _col('broker')
        ci_symbol = _col('exchange:symbol', 'symbol', 'ticker', 'stock')
        ci_qty    = _col('qty', 'quantity', 'shares')
        ci_rate   = _col('rate', 'avg', 'purchase price', 'buy price')
        ci_buy    = _col('buy')
        ci_curr   = _col('current price', 'current', 'ltp', 'price')
        ci_pnl    = _col('p&l', 'pnl', 'profit')
        ci_pct    = _col('% change', '% p&l', 'change%', 'return%')

        def _get(row: list, idx: int) -> str:
            return row[idx].strip() if idx >= 0 and idx < len(row) else ''

        def _num(s: str) -> float:
            try:
                return float(re.sub(r'[^\d.\-]', '', s)) if s else 0.0
            except ValueError:
                return 0.0

        result = []
        for row in data_rows:
            broker = _get(row, ci_broker)
            if not broker:
                continue
            raw_sym = _get(row, ci_symbol)
            sym = raw_sym.split(':')[1] if ':' in raw_sym else raw_sym
            if not sym:
                continue

            qty     = _num(_get(row, ci_qty))
            rate    = _num(_get(row, ci_rate))
            buy_tot = _num(_get(row, ci_buy))
            curr    = _num(_get(row, ci_curr))
            pnl_a   = _num(_get(row, ci_pnl))
            pnl_p   = _num(_get(row, ci_pct))

            invested = buy_tot if buy_tot > 0 else qty * rate
            current  = qty * curr if curr > 0 else 0.0
            pnl      = pnl_a if pnl_a != 0.0 else (current - invested)
            pnl_pct  = pnl_p if pnl_p != 0.0 else ((pnl / invested * 100) if invested > 0 else 0.0)

            result.append({
                'sym':    sym,
                'name':   sym,
                'broker': broker,
                'qty':    qty,
                'buy':    rate if rate > 0 else (invested / qty if qty > 0 else 0.0),
                'curr':   curr,
                'pnl':    round(pnl, 2),
                'pnlPct': round(pnl_pct, 2),
            })

        return result

    async def _list_sheets(self, token: str = '') -> list[dict]:
        headers = _google_auth(token)
        params = {
            'q': "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
            'fields': 'files(id,name,modifiedTime)',
            'orderBy': 'modifiedTime desc',
            'pageSize': '50',
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(_DRIVE_BASE, headers=headers, params=params)
            if resp.status_code == 401:
                raise ToolAuthError('Google access token expired. Re-sign in via Settings → Google.')
            resp.raise_for_status()
        files = resp.json().get('files', [])
        current_id = settings.mystocks_spreadsheet_id.strip()
        return [
            {
                'id': f['id'],
                'name': f['name'],
                'modifiedTime': f.get('modifiedTime', ''),
                'selected': f['id'] == current_id,
            }
            for f in files
        ]

    def _get_current_sheet(self) -> dict:
        sid = settings.mystocks_spreadsheet_id.strip()
        return {'spreadsheet_id': sid, 'configured': bool(sid)}

    def _save_sheet(self, spreadsheet_id: str) -> dict:
        sid = spreadsheet_id.strip()
        if not sid:
            raise ValueError('spreadsheet_id is required')
        _write_env('MYSTOCKS_SPREADSHEET_ID', sid)
        settings.mystocks_spreadsheet_id = sid
        return {'saved': True, 'spreadsheet_id': sid}
