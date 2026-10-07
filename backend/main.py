from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from threading import Lock

from analyze import AnalysisBusyError, AnalysisError, analyze_quote
from config import get_settings
from db import check_db, init_db, insert_analysis, list_history
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from quote import QuoteError, fetch_quote
from schemas import AnalyzeRequest, normalize_symbol

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("stocksight")


class _RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= limit:
                retry_after = max(1, int(hits[0] + window - now))
                return False, retry_after
            hits.append(now)
            if len(self._hits) > 10_000:
                self._hits = defaultdict(deque, {k: v for k, v in self._hits.items() if v})
            return True, 0


_analyze_limiter = _RateLimiter()


class _DailyBudget:
    def __init__(self) -> None:
        self._day = ""
        self._count = 0
        self._lock = Lock()

    def consume(self, limit: int) -> bool:
        day = datetime.now(timezone.utc).date().isoformat()
        with self._lock:
            if day != self._day:
                self._day, self._count = day, 0
            if self._count >= limit:
                return False
            self._count += 1
            return True

    @staticmethod
    def retry_after_seconds() -> int:
        now = datetime.now(timezone.utc)
        tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        return max(1, int((tomorrow - now).total_seconds()))


_analyze_budget = _DailyBudget()


class _RequestTooLarge(Exception):
    pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    settings = get_settings()
    location = settings.sqlite_path if settings.storage_backend.lower() == "sqlite" else settings.supabase_url
    log.info("DB initialized using %s at %s", settings.storage_backend, location)
    yield


app = FastAPI(title="StockSight AI", version="0.1.0", lifespan=lifespan)


@app.exception_handler(Exception)
async def unhandled_exception(request, exc: Exception):
    log.exception(
        "unhandled request error request_id=%s %s %s",
        getattr(request.state, "request_id", "unknown"),
        request.method,
        request.url.path,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    request.state.request_id = str(uuid.uuid4())
    started = time.perf_counter()

    def hardened(response):
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        log.info(
            "request_complete request_id=%s method=%s path=%s status=%s duration_ms=%.1f",
            request.state.request_id,
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
        )
        return response

    max_bytes = get_settings().max_request_bytes
    content_length = request.headers.get("content-length")
    if content_length and request.method in {"POST", "PUT", "PATCH"}:
        try:
            declared_length = int(content_length)
            if declared_length < 0:
                return hardened(JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"}))
            if declared_length > max_bytes:
                return hardened(JSONResponse(status_code=413, content={"detail": "Request body too large"}))
        except ValueError:
            return hardened(JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"}))

    if request.method in {"POST", "PUT", "PATCH"}:
        original_receive = request._receive
        received_bytes = 0

        async def limited_receive():
            nonlocal received_bytes
            message = await original_receive()
            if message.get("type") == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > max_bytes:
                    raise _RequestTooLarge
            return message

        request._receive = limited_receive

    if request.url.path == "/api/analyze" and request.method == "POST":
        settings = get_settings()
        client_ip = request.client.host if request.client else "unknown"
        allowed, retry_after = _analyze_limiter.allow(
            client_ip, settings.analyze_rate_limit, settings.rate_limit_window_seconds
        )
        if not allowed:
            response = JSONResponse(status_code=429, content={"detail": "Too many analysis requests"})
            response.headers["Retry-After"] = str(retry_after)
            return hardened(response)

    try:
        return hardened(await call_next(request))
    except _RequestTooLarge:
        return hardened(JSONResponse(status_code=413, content={"detail": "Request body too large"}))


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/ready")
def readiness() -> dict:
    try:
        check_db()
    except Exception:
        log.exception("readiness check failed")
        raise HTTPException(status_code=503, detail="Storage is unavailable") from None
    return {"status": "ready"}


@app.get("/api/quote")
def get_quote(symbol: str = Query(min_length=1, max_length=10)) -> dict:
    try:
        sym = normalize_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
    try:
        quote = fetch_quote(sym)
    except QuoteError as e:
        log.warning("quote failed for %s: %s", sym, e)
        raise HTTPException(status_code=502, detail="Failed to fetch quote, please try again.") from None
    return quote.model_dump()


@app.post("/api/analyze")
def post_analyze(req: AnalyzeRequest) -> dict:
    sym = req.symbol
    if req.quote_data.symbol != sym:
        raise HTTPException(status_code=400, detail="symbol and quote_data.symbol must match")
    try:
        # Never trust prices supplied by the browser: the quote is re-fetched
        # server-side (and normally served from the short-lived cache).
        quote = fetch_quote(sym)
    except QuoteError as e:
        log.warning("quote refresh failed before analysis for %s: %s", sym, e)
        raise HTTPException(status_code=502, detail="Failed to refresh quote, please try again.") from None
    if not _analyze_budget.consume(get_settings().analyze_daily_limit):
        response = JSONResponse(status_code=429, content={"detail": "Daily analysis limit reached"})
        response.headers["Retry-After"] = str(_DailyBudget.retry_after_seconds())
        return response
    try:
        result = analyze_quote(sym, quote)
    except AnalysisBusyError:
        response = JSONResponse(status_code=429, content={"detail": "Analysis capacity is temporarily busy"})
        response.headers["Retry-After"] = "1"
        return response
    except AnalysisError as e:
        log.warning("analyze failed for %s: %s", sym, e)
        return JSONResponse(
            status_code=502,
            content={"error": "AI analysis failed. Please try again."},
        )
    try:
        row_id = insert_analysis(sym, quote, result)
    except Exception:
        log.exception("failed to persist analysis for %s", sym)
        raise HTTPException(status_code=503, detail="Analysis could not be saved. Please try again.") from None
    return {"id": row_id, **result.model_dump()}


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
            raise HTTPException(status_code=400, detail=str(e)) from None
    try:
        items = list_history(sym, limit)
    except Exception:
        log.exception("history lookup failed for symbol=%s", sym or "*")
        raise HTTPException(status_code=503, detail="History is temporarily unavailable") from None
    return {"items": [it.model_dump() for it in items]}
