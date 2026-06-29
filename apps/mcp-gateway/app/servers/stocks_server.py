from __future__ import annotations

import re
from typing import Any

from app.servers.base import BaseMCPServer

# ── Indian ticker aliases (kept here, yfinance resolves others automatically) ──

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
    deltas    = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains     = [max(d, 0.0) for d in deltas[-period:]]
    losses    = [max(-d, 0.0) for d in deltas[-period:]]
    avg_gain  = sum(gains) / period
    avg_loss  = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    return round(100.0 - 100.0 / (1.0 + avg_gain / avg_loss), 1)


def _sma(closes: list[float], period: int) -> float | None:
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 2)


class StocksServer(BaseMCPServer):
    namespace = 'stocks'

    async def connect(self) -> None:
        pass

    async def disconnect(self) -> None:
        pass

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
            }
        ]

    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        try:
            import yfinance as yf
        except ImportError:
            return 'Stock data requires yfinance. Install it in the gateway venv: pip install yfinance pandas numpy'

        default_market = credentials.get('stock_default_market', 'IN')
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
            lows    = hist['Low'].tolist()
            highs   = hist['High'].tolist()
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
