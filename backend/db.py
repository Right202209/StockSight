from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from config import get_settings
from schemas import AnalysisResult, HistoryItem, QuoteData

log = logging.getLogger(__name__)

SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS stock_analyses (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    quote_data TEXT NOT NULL,
    ai_summary TEXT NOT NULL,
    sentiment TEXT NOT NULL CHECK (sentiment IN ('Bullish', 'Neutral', 'Bearish')),
    risk_level TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_analyses_symbol_created
    ON stock_analyses (symbol, created_at DESC);
"""


# ---- SQLite ----------------------------------------------------------------

def _sqlite_init() -> None:
    with sqlite3.connect(get_settings().sqlite_path) as conn:
        conn.executescript(SQLITE_SCHEMA)


@contextmanager
def _sqlite_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(get_settings().sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _sqlite_insert(symbol: str, quote: QuoteData, result: AnalysisResult) -> str:
    row_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    with _sqlite_conn() as conn:
        conn.execute(
            """
            INSERT INTO stock_analyses
                (id, symbol, quote_data, ai_summary, sentiment, risk_level, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row_id,
                symbol,
                json.dumps(quote.model_dump()),
                result.summary,
                result.sentiment,
                result.risk_level,
                created_at,
            ),
        )
    return row_id


def _sqlite_list(symbol: str | None, limit: int) -> list[HistoryItem]:
    with _sqlite_conn() as conn:
        if symbol:
            cur = conn.execute(
                "SELECT * FROM stock_analyses WHERE symbol = ? ORDER BY created_at DESC LIMIT ?",
                (symbol, limit),
            )
        else:
            cur = conn.execute(
                "SELECT * FROM stock_analyses ORDER BY created_at DESC LIMIT ?",
                (limit,),
            )
        rows = cur.fetchall()

    return [
        HistoryItem(
            id=row["id"],
            symbol=row["symbol"],
            quote_data=json.loads(row["quote_data"]),
            ai_summary=row["ai_summary"],
            sentiment=row["sentiment"],
            risk_level=row["risk_level"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


# ---- Supabase --------------------------------------------------------------

_supabase_client = None


def _supabase():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    from supabase import create_client  # lazy import — only when used

    s = get_settings()
    if not s.supabase_url or not s.supabase_service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set when STORAGE_BACKEND=supabase"
        )
    _supabase_client = create_client(s.supabase_url, s.supabase_service_key)
    return _supabase_client


def _supabase_init() -> None:
    # Schema lives in supabase/migrations/0001_init.sql, applied via the
    # Supabase SQL editor. Here we only verify connectivity so a misconfigured
    # deploy fails fast instead of on the first user request.
    try:
        _supabase().table("stock_analyses").select("id", count="exact").limit(0).execute()
    except Exception as e:
        raise RuntimeError(f"Supabase connectivity check failed: {e}") from e


def _supabase_insert(symbol: str, quote: QuoteData, result: AnalysisResult) -> str:
    row = {
        "symbol": symbol,
        "quote_data": quote.model_dump(),
        "ai_summary": result.summary,
        "sentiment": result.sentiment,
        "risk_level": result.risk_level,
    }
    resp = _supabase().table("stock_analyses").insert(row).execute()
    if not resp.data:
        raise RuntimeError("Supabase insert returned no rows")
    return resp.data[0]["id"]


def _supabase_list(symbol: str | None, limit: int) -> list[HistoryItem]:
    q = _supabase().table("stock_analyses").select("*").order("created_at", desc=True).limit(limit)
    if symbol:
        q = q.eq("symbol", symbol)
    resp = q.execute()
    return [
        HistoryItem(
            id=row["id"],
            symbol=row["symbol"],
            quote_data=row["quote_data"],
            ai_summary=row["ai_summary"],
            sentiment=row["sentiment"],
            risk_level=row["risk_level"],
            created_at=row["created_at"],
        )
        for row in resp.data or []
    ]


# ---- Dispatch --------------------------------------------------------------

def _backend() -> str:
    return (get_settings().storage_backend or "sqlite").lower()


def init_db() -> None:
    backend = _backend()
    if backend == "supabase":
        _supabase_init()
        log.info("Using Supabase storage backend")
    elif backend == "sqlite":
        _sqlite_init()
        log.info("Using SQLite storage backend at %s", get_settings().sqlite_path)
    else:
        raise RuntimeError(f"Unknown STORAGE_BACKEND: {backend!r}")


def insert_analysis(symbol: str, quote: QuoteData, result: AnalysisResult) -> str:
    if _backend() == "supabase":
        return _supabase_insert(symbol, quote, result)
    return _sqlite_insert(symbol, quote, result)


def list_history(symbol: str | None, limit: int) -> list[HistoryItem]:
    limit = max(1, min(limit, 100))
    if _backend() == "supabase":
        return _supabase_list(symbol, limit)
    return _sqlite_list(symbol, limit)
