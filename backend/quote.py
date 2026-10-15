from __future__ import annotations

import hashlib
import logging
import math
import threading
import time
from collections import OrderedDict
from datetime import datetime, time as dtime, timezone
from zoneinfo import ZoneInfo

import yfinance as yf

from config import get_settings
from schemas import QuoteData

log = logging.getLogger(__name__)

# Deterministic mock quotes are allowed to live a little longer than the
# 5 s used for an *unexpected* fallback, because they never change.

# ---- Cache -----------------------------------------------------------------
# Bounded LRU + per-symbol single-flight. Two properties matter:
#   * ten simultaneous requests for an uncached symbol trigger ONE upstream
#     fetch (stampede protection),
#   * every valid-looking ticker (AAAAA, AAAAB, …) can't grow the dict forever.
# The cache is per-process. Keep one uvicorn worker (render.yaml pins
# --workers 1) unless this moves to Redis.

_cache: "OrderedDict[str, tuple[float, int, QuoteData]]" = OrderedDict()
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()

MOCK_FALLBACK_TTL = 5  # seconds — recovery is quick once Yahoo comes back
MOCK_EXPLICIT_TTL = 60  # seconds — STOCK_DATA_PROVIDER=mock never changes


class QuoteError(Exception):
    """Raised when a quote cannot be fetched or parsed."""


def _cache_ttl_seconds() -> int:
    return get_settings().quote_cache_ttl


def _max_entries() -> int:
    return max(16, get_settings().quote_cache_max_entries)


def _from_cache_locked(symbol: str) -> QuoteData | None:
    """Caller must hold ``_guard``. Uses monotonic time so a wall-clock jump
    can't extend or truncate a TTL."""
    hit = _cache.get(symbol)
    if hit is None:
        return None
    expires_at, _ttl, data = hit
    if expires_at <= time.monotonic():
        _cache.pop(symbol, None)
        return None
    _cache.move_to_end(symbol)
    return data


def _store_locked(symbol: str, data: QuoteData, ttl: int) -> None:
    """Caller must hold ``_guard``."""
    _cache[symbol] = (time.monotonic() + ttl, ttl, data)
    _cache.move_to_end(symbol)
    while len(_cache) > _max_entries():
        old, _ = _cache.popitem(last=False)
        if old != symbol:
            _locks.pop(old, None)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _to_yahoo(symbol: str) -> str:
    """Canonical display form → Yahoo's form.

    Yahoo writes class shares with a dash (``BRK-B``); the shared ticker
    regex accepts the dotted ``BRK.B``. Mapping only at this boundary keeps
    the cache key, DB rows, and API responses in the canonical form.
    """
    return symbol.replace(".", "-")


def _num(value: object, *, allow_zero: bool = True) -> float:
    """Coerce a yfinance value to a finite float or raise QuoteError."""
    if value is None:
        raise QuoteError("missing value")
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as e:
        raise QuoteError(f"non-numeric value {value!r}") from e
    if not math.isfinite(f) or (not allow_zero and f == 0.0):
        raise QuoteError(f"non-finite value {value!r}")
    return f


def _num_int(value: object) -> int:
    if value is None:
        return 0
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    return int(f) if math.isfinite(f) and f > 0 else 0


def market_state_now(now: datetime | None = None) -> str:
    """``REGULAR`` during NYSE cash hours, else ``CLOSED``.

    Weekends are handled; exchange holidays are not (a holiday reads as
    REGULAR). That is acceptable for a badge — extend with an exchange
    calendar if it ever matters.
    """
    et = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/New_York"))
    if et.weekday() >= 5:
        return "CLOSED"
    return "REGULAR" if dtime(9, 30) <= et.time() < dtime(16, 0) else "CLOSED"


def _fetch_yfinance(symbol: str) -> QuoteData:
    try:
        ticker = yf.Ticker(_to_yahoo(symbol))
        # fast_info is lazy — read each attribute exactly once into a local so
        # we don't trigger extra network round-trips.
        info = ticker.fast_info
        raw_price = info["last_price"]
        raw_previous_close = info["previous_close"]
        raw_high = info["day_high"]
        raw_low = info["day_low"]
        raw_volume = info["last_volume"]
    except QuoteError:
        raise
    except Exception as e:  # yfinance raises a zoo of exception types
        raise QuoteError(f"yfinance fetch failed: {e}") from e

    price = _num(raw_price, allow_zero=False)
    previous_close = _num(raw_previous_close, allow_zero=False)
    high = _num(raw_high)
    low = _num(raw_low)
    volume = _num_int(raw_volume)

    change = price - previous_close
    change_percent = change / previous_close * 100

    return QuoteData(
        symbol=symbol,
        price=round(price, 4),
        change=round(change, 4),
        change_percent=round(change_percent, 4),
        high=round(high, 4),
        low=round(low, 4),
        volume=volume,
        previous_close=round(previous_close, 4),
        market_state=market_state_now(),
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


def _load(symbol: str) -> tuple[QuoteData, int]:
    """Fetch a quote plus the TTL it should be cached under."""
    provider = get_settings().stock_data_provider
    if provider == "mock":
        return _fetch_mock(symbol), MOCK_EXPLICIT_TTL

    try:
        return _fetch_yfinance(symbol), _cache_ttl_seconds()
    except QuoteError as e:
        if not get_settings().allow_mock_fallback:
            raise
        log.warning("yfinance failed for %s, falling back to mock: %s", symbol, e)
        return _fetch_mock(symbol), MOCK_FALLBACK_TTL


def fetch_quote(symbol: str) -> QuoteData:
    with _guard:
        cached = _from_cache_locked(symbol)
        if cached is not None:
            log.debug("quote cache hit symbol=%s", symbol)
            return cached
        sym_lock = _locks.setdefault(symbol, threading.Lock())

    # Per-symbol single-flight: only one thread fetches an uncached symbol;
    # the rest wait here and then take the freshly cached value.
    with sym_lock:
        with _guard:
            cached = _from_cache_locked(symbol)
            if cached is not None:
                return cached
        quote, ttl = _load(symbol)
        with _guard:
            _store_locked(symbol, quote, ttl)
    log.info(
        "quote fetched symbol=%s provider=%s market_state=%s",
        symbol,
        quote.provider,
        quote.market_state,
    )
    return quote
