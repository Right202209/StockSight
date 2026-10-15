from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from analyze import AnalysisError, analyze_quote
from config import get_settings
from db import count_since, find_reuse, init_db, insert_analysis, list_history
from quote import QuoteError, fetch_quote
from schemas import AnalyzeRequest, normalize_symbol

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("stocksight")

# A client quote is considered "the same quote" as the server's within this
# relative tolerance. Absorbs normal drift between the browser's fetch and the
# analyze call, while still rejecting fabricated prices (B-02).
PRICE_TOLERANCE = 0.02

# ---- Simple in-memory rate limiter (single instance; see render.yaml) -------

_hits: dict[str, deque[float]] = defaultdict(deque)
_rl_lock = threading.Lock()
_MAX_TRACKED_KEYS = 10_000


def _trim_keys_locked(now: float, window_s: float) -> None:
    """Bound the key table. Caller must hold ``_rl_lock``.

    An entry only disappears when its IP makes another request, so without
    this the table would hold one deque per source IP forever (a slow leak,
    and a cheap abuse vector for anyone controlling many addresses).

    Only runs once the table is actually full, which a normal deployment
    never reaches — so the cost is amortized and is bounded by
    ``_MAX_TRACKED_KEYS``. Entries whose window has fully aged out go first;
    if the table is still over, the stalest entries go next.
    """
    if len(_hits) <= _MAX_TRACKED_KEYS:
        return
    for k in [k for k, q in _hits.items() if not q or q[-1] <= now - window_s]:
        _hits.pop(k, None)
    overflow = len(_hits) - _MAX_TRACKED_KEYS
    if overflow > 0:
        for k, _ in sorted(_hits.items(), key=lambda kv: kv[1][-1])[:overflow]:
            _hits.pop(k, None)


def _rate_limited(key: str, limit: int, window_s: float) -> bool:
    """Sliding-window check. Returns True when the caller should get a 429.

    Keys are derived from the client IP only — never from the ticker — so
    cycling random symbols can't inflate the table.
    """
    if limit <= 0:
        return False
    now = time.monotonic()
    with _rl_lock:
        _trim_keys_locked(now, window_s)
        q = _hits[key]
        while q and q[0] <= now - window_s:
            q.popleft()
        if len(q) >= limit:
            return True
        q.append(now)
        return False


def _client_ip(request: Request) -> str:
    """Client IP, used only as a rate-limit bucket key.

    Trust boundary: ``X-Forwarded-For`` is client-supplied unless a proxy
    sets it. Render's load balancer does, and render.yaml passes
    ``--proxy-headers --forwarded-allow-ips="*"`` so the leftmost entry is
    the address Render recorded. The value is never logged and never used for
    authorization; it is length-capped here so it can't push unbounded bytes
    into the limiter table — it only ever picks a bucket.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",", 1)[0].strip()
        if first:
            return first[:64]
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


# ---- App -------------------------------------------------------------------

settings = get_settings()

if settings.is_production and settings.openai_api_key in ("", "sk-missing"):
    raise RuntimeError("OPENAI_API_KEY must be configured in production")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    log.info(
        "startup env=%s storage=%s provider=%s mock_fallback=%s",
        settings.environment,
        settings.storage_backend,
        settings.stock_data_provider,
        settings.allow_mock_fallback,
    )
    yield


app = FastAPI(
    title="StockSight AI",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.enable_api_docs else None,
    redoc_url="/redoc" if settings.enable_api_docs else None,
    openapi_url="/openapi.json" if settings.enable_api_docs else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    max_age=600,  # let browsers cache the preflight for POST /api/analyze
)

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

_CACHE_CONTROL = {
    "/api/health": "no-store",
    "/api/quote": "private, max-age=15",
    "/api/analyze": "no-store",
    "/api/history": "no-store",
}

_DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}


def _error(status: int, code: str, detail: str, headers: dict | None = None) -> JSONResponse:
    """Additive envelope: `detail` stays a human string for the existing
    frontend, `code` is machine-readable so copy can be localized (F-08)."""
    return JSONResponse(
        status_code=status,
        content={"detail": detail, "code": code},
        headers=headers,
    )


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    response.headers.update(_SECURITY_HEADERS)
    cache = _CACHE_CONTROL.get(request.url.path)
    if cache:
        response.headers["Cache-Control"] = cache
    if settings.is_production and request.url.path not in _DOCS_PATHS:
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    ms = (time.perf_counter() - start) * 1000
    log.info(
        "req id=%s %s %s -> %s %.0fms",
        rid,
        request.method,
        request.url.path,
        response.status_code,
        ms,
    )
    return response


# ---- Routes ----------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/quote")
def get_quote(request: Request, symbol: str = Query(min_length=1, max_length=10)) -> dict:
    if _rate_limited(f"quote:{_client_ip(request)}", settings.rate_limit_quote_per_min, 60.0):
        return _error(429, "RATE_LIMITED", "Too many requests, slow down.", {"Retry-After": "60"})

    try:
        sym = normalize_symbol(symbol)
    except ValueError as e:
        return _error(400, "INVALID_SYMBOL", str(e))

    try:
        quote = fetch_quote(sym)
    except QuoteError as e:
        log.warning("quote failed for %s: %s", sym, e)
        return _error(502, "QUOTE_UNAVAILABLE", "Failed to fetch quote, please try again.")
    return quote.model_dump()


def _prices_agree(client_price: float, server_price: float) -> bool:
    if server_price <= 0:
        return client_price == server_price
    return abs(client_price - server_price) <= server_price * PRICE_TOLERANCE


@app.post("/api/analyze")
def post_analyze(request: Request, req: AnalyzeRequest) -> dict:
    sym = req.symbol
    if req.quote_data.symbol.upper() != sym:
        return _error(400, "SYMBOL_MISMATCH", "symbol and quote_data.symbol must match")

    ip = _client_ip(request)
    if _rate_limited(f"analyze:{ip}", settings.rate_limit_analyze_per_min, 60.0):
        return _error(
            429, "RATE_LIMITED", "Too many analyses, try again in a minute.", {"Retry-After": "60"}
        )

    # Global spend cap. Rows persist, so this survives restarts — unlike the
    # in-memory per-IP counters above.
    if settings.analyze_daily_cap > 0 and count_since(None, 24) >= settings.analyze_daily_cap:
        return _error(
            429,
            "DAILY_CAP",
            "Daily analysis limit reached. Please try again tomorrow.",
            {"Retry-After": "3600"},
        )

    # The server's own quote is the source of truth. A client can fabricate
    # quote_data; it must never be persisted or sent to the model.
    try:
        server_quote = fetch_quote(sym)
    except QuoteError as e:
        log.warning("analyze quote failed for %s: %s", sym, e)
        return _error(502, "QUOTE_UNAVAILABLE", "Failed to fetch quote, please try again.")

    if server_quote.provider == "mock" and settings.is_production and not settings.allow_mock_fallback:
        return _error(
            422,
            "MOCK_DATA",
            "Live market data is unavailable; analysis is disabled right now.",
        )

    if not _prices_agree(req.quote_data.price, server_quote.price):
        return _error(
            409,
            "QUOTE_STALE",
            "Quote changed since it was fetched. Refreshing…",
        )

    if settings.analysis_reuse:
        existing = find_reuse(sym, server_quote.fetched_at)
        if existing is not None:
            log.info("analyze reused existing row symbol=%s id=%s", sym, existing.id)
            return {
                "id": existing.id,
                "summary": existing.ai_summary,
                "sentiment": existing.sentiment,
                "risk_level": existing.risk_level,
                "created_at": existing.created_at,
                "reused": True,
            }

    try:
        result = analyze_quote(sym, server_quote)
    except AnalysisError as e:
        log.warning("analyze failed for %s: %s", sym, e)
        return _error(502, "LLM_FAILED", "AI analysis failed. Please try again.")

    row_id, created_at = insert_analysis(sym, server_quote, result)
    return {"id": row_id, **result.model_dump(), "created_at": created_at}


@app.get("/api/history")
def get_history(
    symbol: str | None = Query(default=None, max_length=10),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    sym = None
    if symbol:
        try:
            sym = normalize_symbol(symbol)
        except ValueError as e:
            return _error(400, "INVALID_SYMBOL", str(e))
    items = list_history(sym, limit)
    return {"items": [it.model_dump() for it in items]}
