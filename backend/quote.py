from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from threading import Lock

import yfinance as yf

from config import get_settings
from schemas import QuoteData

log = logging.getLogger(__name__)

_cache: dict[str, tuple[float, QuoteData]] = {}
_cache_lock = Lock()


class QuoteError(Exception):
    """Raised when a quote cannot be fetched or parsed."""


def _from_cache(symbol: str) -> QuoteData | None:
    ttl = get_settings().quote_cache_ttl
    with _cache_lock:
        hit = _cache.get(symbol)
    if hit is None:
        return None
    ts, data = hit
    if time.time() - ts > ttl:
        return None
    return data


def _save_cache(symbol: str, data: QuoteData) -> None:
    with _cache_lock:
        _cache[symbol] = (time.time(), data)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch_yfinance(symbol: str) -> QuoteData:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        price = float(info["last_price"])
        previous_close = float(info["previous_close"])
        high = float(info["day_high"])
        low = float(info["day_low"])
        volume = int(info["last_volume"] or 0)
    except (KeyError, TypeError, ValueError, AttributeError, Exception) as e:
        raise QuoteError(f"yfinance fetch failed: {e}") from e

    change = price - previous_close
    change_percent = (change / previous_close * 100) if previous_close else 0.0

    return QuoteData(
        symbol=symbol,
        price=round(price, 4),
        change=round(change, 4),
        change_percent=round(change_percent, 4),
        high=round(high, 4),
        low=round(low, 4),
        volume=volume,
        previous_close=round(previous_close, 4),
        market_state="REGULAR",
        fetched_at=_now_iso(),
        provider="yfinance",
    )


def _fetch_mock(symbol: str) -> QuoteData:
    # Deterministic per symbol so UI behavior is stable across reloads.
    seed = int(hashlib.sha256(symbol.encode()).hexdigest(), 16)
    base_price = 50 + (seed % 45000) / 100  # 50.00 .. 500.00
    drift = ((seed >> 8) % 1000 - 500) / 100  # -5.00 .. +5.00
    price = round(base_price + drift, 2)
    previous_close = round(base_price, 2)
    change = round(price - previous_close, 4)
    change_percent = round(change / previous_close * 100, 4) if previous_close else 0.0
    high = round(max(price, previous_close) + abs(drift) * 0.3, 2)
    low = round(min(price, previous_close) - abs(drift) * 0.3, 2)
    volume = 1_000_000 + (seed >> 16) % 50_000_000

    return QuoteData(
        symbol=symbol,
        price=price,
        change=change,
        change_percent=change_percent,
        high=high,
        low=low,
        volume=volume,
        previous_close=previous_close,
        market_state="MOCK",
        fetched_at=_now_iso(),
        provider="mock",
    )


def fetch_quote(symbol: str) -> QuoteData:
    cached = _from_cache(symbol)
    if cached is not None:
        return cached

    provider = get_settings().stock_data_provider
    if provider == "mock":
        quote = _fetch_mock(symbol)
    else:
        try:
            quote = _fetch_yfinance(symbol)
        except QuoteError as e:
            log.warning("yfinance failed for %s, falling back to mock: %s", symbol, e)
            quote = _fetch_mock(symbol)

    _save_cache(symbol, quote)
    return quote
