from __future__ import annotations

import re
from datetime import datetime, timezone

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


# ── Indian index / ticker aliases ─────────────────────────────────────────────
_IN_ALIASES: dict[str, str] = {
    # Indices
    'nifty':        '^NSEI',
    'nifty 50':     '^NSEI',
    'nifty50':      '^NSEI',
    'sensex':       '^BSESN',
    'bse':          '^BSESN',
    'bank nifty':   '^NSEBANK',
    'nifty bank':   '^NSEBANK',
    'banknifty':    '^NSEBANK',
    'nifty it':     '^CNXIT',
    'nifty auto':   '^CNXAUTO',
    'nifty pharma': '^CNXPHARMA',
    # Large-cap NSE stocks
    'reliance':     'RELIANCE.NS',
    'tcs':          'TCS.NS',
    'infosys':      'INFY.NS',
    'infy':         'INFY.NS',
    'hdfc bank':    'HDFCBANK.NS',
    'hdfcbank':     'HDFCBANK.NS',
    'icici bank':   'ICICIBANK.NS',
    'icicibank':    'ICICIBANK.NS',
    'icici':        'ICICIBANK.NS',
    'wipro':        'WIPRO.NS',
    'itc':          'ITC.NS',
    'bajaj finance':'BAJFINANCE.NS',
    'bajajfinance': 'BAJFINANCE.NS',
    'bajaj':        'BAJFINANCE.NS',
    'kotak bank':   'KOTAKBANK.NS',
    'kotakbank':    'KOTAKBANK.NS',
    'kotak':        'KOTAKBANK.NS',
    'sbi':          'SBIN.NS',
    'axis bank':    'AXISBANK.NS',
    'axisbank':     'AXISBANK.NS',
    'axis':         'AXISBANK.NS',
    'maruti':       'MARUTI.NS',
    'hul':          'HINDUNILVR.NS',
    'hindustan unilever': 'HINDUNILVR.NS',
    'sun pharma':   'SUNPHARMA.NS',
    'sunpharma':    'SUNPHARMA.NS',
    'l&t':          'LT.NS',
    'larsen':       'LT.NS',
    'ntpc':         'NTPC.NS',
    'ongc':         'ONGC.NS',
    'ultratech':    'ULTRACEMCO.NS',
    'titan':        'TITAN.NS',
    'nestle':       'NESTLEIND.NS',
    'nestlé':       'NESTLEIND.NS',
    'asian paints': 'ASIANPAINT.NS',
    'bharti airtel':'BHARTIARTL.NS',
    'airtel':       'BHARTIARTL.NS',
    'bharti':       'BHARTIARTL.NS',
    'adani':        'ADANIENT.NS',
    'adani enterprises': 'ADANIENT.NS',
    'power grid':   'POWERGRID.NS',
    'dr reddy':     'DRREDDY.NS',
    'dr. reddy':    'DRREDDY.NS',
    'cipla':        'CIPLA.NS',
    'divis':        'DIVISLAB.NS',
    'tech mahindra':'TECHM.NS',
    'techmahindra': 'TECHM.NS',
    'hindalco':     'HINDALCO.NS',
    'tata steel':   'TATASTEEL.NS',
    'tatasteel':    'TATASTEEL.NS',
    'tata motors':  'TATAMOTORS.NS',
    'tatamotors':   'TATAMOTORS.NS',
    'jsw steel':    'JSWSTEEL.NS',
    'indusind':     'INDUSINDBK.NS',
    'jio financial':'JIOFIN.NS',
    'zomato':       'ZOMATO.NS',
    'paytm':        'PAYTM.NS',
    'nykaa':        'NYKAA.NS',
}

# ── RSI / momentum helpers ────────────────────────────────────────────────────

def _rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d, 0.0) for d in deltas[-period:]]
    losses = [max(-d, 0.0) for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100.0 - 100.0 / (1.0 + rs), 1)


def _sma(closes: list[float], period: int) -> float | None:
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 2)


def _support_resistance(lows: list[float], highs: list[float], current: float, window: int = 20) -> tuple[float | None, float | None]:
    """Simple pivot-based support/resistance from recent highs and lows."""
    if not lows or not highs:
        return None, None
    recent_lows  = lows[-window:]
    recent_highs = highs[-window:]
    # Support = highest low below current price
    supports = [l for l in recent_lows if l < current]
    # Resistance = lowest high above current price
    resistances = [h for h in recent_highs if h > current]
    support    = round(max(supports), 2)    if supports    else None
    resistance = round(min(resistances), 2) if resistances else None
    return support, resistance


# ── Ticker resolution ─────────────────────────────────────────────────────────

def _resolve_ticker(raw: str, default_market: str) -> str:
    """Map a human name or raw ticker to a yfinance-compatible symbol."""
    key = raw.strip().lower()
    if key in _IN_ALIASES:
        return _IN_ALIASES[key]

    upper = raw.strip().upper()
    # Already has exchange suffix (.NS, .BO, ^)
    if '.' in upper or upper.startswith('^'):
        return upper

    # If default market is India and looks like an NSE ticker (all caps, ≤15 chars), append .NS
    if default_market.upper() == 'IN' and re.fullmatch(r'[A-Z0-9&]{1,15}', upper):
        return f'{upper}.NS'

    return upper


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


def _extract_ticker_query(text: str) -> str:
    """Strip question boilerplate to isolate the stock name or ticker."""
    t = text.strip()
    # Apply prefix stripping twice to handle "what is the stock price of X"
    for _ in range(2):
        t = _QUESTION_PREFIXES.sub('', t).strip()
        t = re.sub(r'^the\s+', '', t, flags=re.I)  # drop stray leading "the"
    t = _QUESTION_SUFFIXES.sub('', t).strip().rstrip('?.,')
    return t or text.strip()


def _fmt_price(price: float, currency: str) -> str:
    sym = '₹' if currency == 'INR' else ('$' if currency == 'USD' else currency + ' ')
    return f'{sym}{price:,.2f}'


# ── Boot-check tickers per market ─────────────────────────────────────────────

_BOOT_TICKERS: dict[str, list[tuple[str, str]]] = {
    'IN': [('nifty', 'Nifty 50'), ('sensex', 'Sensex')],
    'US': [('^GSPC', 'S&P 500'), ('^DJI', 'Dow Jones')],
}


def _price_brief(yf_module, alias: str, label: str, default_market: str) -> str:
    """Return a one-line price summary for a single ticker."""
    try:
        ticker = _resolve_ticker(alias, default_market)
        info   = yf_module.Ticker(ticker)
        hist   = info.history(period='5d', interval='1d')
        if hist.empty:
            return f'{label}: data unavailable'
        closes   = hist['Close'].tolist()
        current  = round(closes[-1], 2)
        prev     = round(closes[-2], 2) if len(closes) > 1 else current
        chg      = round(current - prev, 2)
        chg_pct  = round((chg / prev) * 100, 2) if prev else 0.0
        currency = getattr(info.fast_info, 'currency', 'INR') or 'INR'
        price    = _fmt_price(current, currency)
        sign     = '+' if chg >= 0 else ''
        return f'{label}: {price} ({sign}{chg_pct}%)'
    except Exception as e:
        return f'{label}: error — {str(e)[:40]}'


# ── Agent ─────────────────────────────────────────────────────────────────────

class StockAgent(AssistantAgent):
    id   = 'stock'
    name = 'Stock Market'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        try:
            import yfinance  # noqa: F401
            return AgentHealth(name=self.name, status=AgentStatus.ONLINE)
        except ImportError:
            return AgentHealth(name=self.name, status=AgentStatus.DEGRADED,
                               detail='yfinance not installed — run: pip install yfinance pandas numpy')

    async def shutdown(self) -> None:
        return None

    async def handle(self, request: AgentRequest) -> AgentResponse:
        try:
            import yfinance as yf
        except ImportError:
            return AgentResponse(
                agent=self.id,
                text=(
                    'Stock agent requires yfinance. '
                    'Install it: pip install yfinance pandas numpy'
                ),
            )

        cfg            = request.context.get('agent_config', {})
        default_market = cfg.get('default_market', 'IN')

        # Boot confirmation: fetch the two benchmark indices for this market
        if request.text.strip() == '__boot__':
            tickers = _BOOT_TICKERS.get(default_market.upper(), _BOOT_TICKERS['IN'])
            parts   = [_price_brief(yf, alias, label, default_market) for alias, label in tickers]
            return AgentResponse(agent=self.id, text=' · '.join(parts))

        raw_query = _extract_ticker_query(request.text)
        ticker    = _resolve_ticker(raw_query, default_market)

        try:
            info   = yf.Ticker(ticker)
            meta   = info.fast_info
            hist   = info.history(period='3mo', interval='1d')

            if hist.empty:
                return AgentResponse(
                    agent=self.id,
                    text=f"Could not find data for '{raw_query}'. Try the exact ticker symbol (e.g. RELIANCE.NS, ^NSEI, AAPL).",
                )

            closes = hist['Close'].tolist()
            lows   = hist['Low'].tolist()
            highs  = hist['High'].tolist()

            current  = round(closes[-1], 2)
            prev     = round(closes[-2], 2) if len(closes) > 1 else current
            chg      = round(current - prev, 2)
            chg_pct  = round((chg / prev) * 100, 2) if prev else 0.0
            currency = getattr(meta, 'currency', 'INR') or 'INR'

            price_str = _fmt_price(current, currency)
            chg_str   = f'{"+" if chg >= 0 else ""}{_fmt_price(chg, currency)} ({"+".rstrip() if chg >= 0 else ""}{chg_pct}%)'

            rsi_val  = _rsi(closes)
            sma20    = _sma(closes, 20)
            sma50    = _sma(closes, 50)
            sup, res = _support_resistance(lows, highs, current)

            # ── Compose response ──────────────────────────────────────────────
            display_name = getattr(meta, 'short_name', None) or ticker
            lines: list[str] = [f'{display_name} — {price_str}  {chg_str}']

            # Momentum
            if rsi_val is not None:
                rsi_label = 'overbought' if rsi_val > 70 else ('oversold' if rsi_val < 30 else 'neutral')
                lines.append(f'RSI(14): {rsi_val} ({rsi_label})')

            if sma20 and sma50:
                trend = 'uptrend' if current > sma20 > sma50 else ('downtrend' if current < sma20 < sma50 else 'consolidating')
                lines.append(f'SMA20: {_fmt_price(sma20, currency)}  SMA50: {_fmt_price(sma50, currency)}  — {trend}')
            elif sma20:
                pos = 'above' if current > sma20 else 'below'
                lines.append(f'SMA20: {_fmt_price(sma20, currency)} — price is {pos} the 20-day average')

            if sup:
                lines.append(f'Support: ~{_fmt_price(sup, currency)}')
            if res:
                lines.append(f'Resistance: ~{_fmt_price(res, currency)}')

            # 52-week range (if available from fast_info)
            try:
                w52_low  = round(meta.fifty_two_week_low, 2)
                w52_high = round(meta.fifty_two_week_high, 2)
                lines.append(f'52-week range: {_fmt_price(w52_low, currency)} – {_fmt_price(w52_high, currency)}')
            except Exception:
                pass

            return AgentResponse(agent=self.id, text='\n'.join(lines))

        except Exception as e:
            err = str(e)[:120]
            return AgentResponse(
                agent=self.id,
                text=f"Could not fetch data for '{raw_query}' (ticker: {ticker}). {err}",
            )
