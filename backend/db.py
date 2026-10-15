from __future__ import annotations

import base64
import json
import logging
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
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

-- Per-ticker history: ORDER BY created_at DESC WHERE symbol = ?
CREATE INDEX IF NOT EXISTS idx_stock_analyses_symbol_created
    ON stock_analyses (symbol, created_at DESC);

-- Global history and the daily-cap count share this access path. A B-tree
-- that leads with symbol cannot serve ORDER BY created_at DESC LIMIT n across
-- all symbols without scanning and sorting the table.
CREATE INDEX IF NOT EXISTS idx_stock_analyses_created
    ON stock_analyses (created_at DESC);
"""

# Columns every query should select explicitly (never SELECT *).
_HISTORY_COLUMNS = "id, symbol, quote_data, ai_summary, sentiment, risk_level, created_at"


def _utc_now() -> str:
    """Canonical timestamp. SQLite orders created_at lexicographically, and
    that is only correct if every row uses the same format and timezone:
    UTC, microseconds."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _utc_minus(hours: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat(timespec="microseconds")


# ---- SQLite ----------------------------------------------------------------

def _sqlite_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(get_settings().sqlite_path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")        # readers don't block the writer
    conn.execute("PRAGMA synchronous=NORMAL")      # safe under WAL; fewer fsyncs
    conn.execute("PRAGMA busy_timeout=5000")       # wait, don't fail, during write contention
    return conn


@contextmanager
def _sqlite_cursor() -> Iterator[sqlite3.Cursor]:
    """Cheap read connection — no commit on exit, always closed."""
    conn = _sqlite_conn()
    try:
        yield conn.cursor()
    finally:
        conn.close()


@contextmanager
def _sqlite_writer() -> Iterator[sqlite3.Cursor]:
    """Write connection — commits on success, rolls back on error, closes."""
    conn = _sqlite_conn()
    try:
        yield conn.cursor()
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def _sqlite_init() -> None:
    with _sqlite_conn() as conn:
        conn.executescript(SQLITE_SCHEMA)


def _sqlite_insert(symbol: str, quote: QuoteData, result: AnalysisResult) -> tuple[str, str]:
    row_id = str(uuid.uuid4())
    created_at = _utc_now()
    with _sqlite_writer() as cur:
        cur.execute(
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
    return row_id, created_at


def _sqlite_list(symbol: str | None, limit: int) -> list[HistoryItem]:
    sql = (
        f"SELECT {_HISTORY_COLUMNS} FROM stock_analyses "
        + ("WHERE symbol = ? " if symbol else "")
        + "ORDER BY created_at DESC, id DESC LIMIT ?"
    )
    rows: list[sqlite3.Row]
    with _sqlite_cursor() as cur:
        if symbol:
            rows = cur.execute(sql, (symbol, limit)).fetchall()
        else:
            rows = cur.execute(sql, (limit,)).fetchall()
    return [_row_to_history(r) for r in rows]


def _sqlite_reuse(symbol: str, fetched_at: str) -> HistoryItem | None:
    sql = (
        f"SELECT {_HISTORY_COLUMNS} FROM stock_analyses "
        "WHERE symbol = ? AND json_extract(quote_data, '$.fetched_at') = ? "
        "LIMIT 1"
    )
    with _sqlite_cursor() as cur:
        row = cur.execute(sql, (symbol, fetched_at)).fetchone()
    return _row_to_history(row) if row else None


def _row_to_history(row: sqlite3.Row) -> HistoryItem:
    return HistoryItem(
        id=row["id"],
        symbol=row["symbol"],
        quote_data=json.loads(row["quote_data"]),
        ai_summary=row["ai_summary"],
        sentiment=row["sentiment"],
        risk_level=row["risk_level"],
        created_at=row["created_at"],
    )


def _sqlite_count_since(symbol: str | None, since_iso: str) -> int:
    sql = "SELECT COUNT(*) AS n FROM stock_analyses "
    if symbol:
        sql += "WHERE symbol = ? AND created_at >= ?"
        params: tuple = (symbol, since_iso)
    else:
        sql += "WHERE created_at >= ?"
        params = (since_iso,)
    with _sqlite_cursor() as cur:
        row = cur.execute(sql, params).fetchone()
    return int(row["n"]) if row else 0


# ---- Supabase --------------------------------------------------------------

_supabase_client = None


def _supabase() -> object:
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


def _decode_jwt_payload(token: str) -> dict | None:
    """Best-effort, bare decode (no signature verification) of a legacy
    Supabase JWT so we can read its ``role`` claim. Newer secret keys
    (``sb_secret_…``) are not JWTs and are handled by the prefix check."""
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64))
    except (IndexError, ValueError, json.JSONDecodeError):
        return None


def _assert_service_role_key(key: str) -> None:
    """Refuse to boot unless the configured key can bypass RLS.

    A publishable/anon key makes every insert silently no-op behind RLS.
    Bubbling that up as a deploy-time error beats debugging empty history.
    """
    if key.startswith("sb_secret_"):
        return
    claims = _decode_jwt_payload(key)
    if claims and claims.get("role") == "service_role":
        return
    raise RuntimeError(
        "SUPABASE_SERVICE_KEY does not look like a service_role key. "
        "Use Dashboard → Settings → API → service_role (or a new sb_secret_ key)."
    )


def _supabase_init() -> None:
    s = get_settings()
    _assert_service_role_key(s.supabase_service_key)
    # Schema lives in supabase/migrations/0001_init.sql, applied via the
    # Supabase SQL editor. Here we only verify connectivity so a misconfigured
    # deploy fails fast instead of on the first user request.
    try:
        _supabase().table("stock_analyses").select("id", count="exact").limit(0).execute()
    except Exception as e:
        raise RuntimeError(f"Supabase connectivity check failed: {e}") from e


def _supabase_insert(symbol: str, quote: QuoteData, result: AnalysisResult) -> tuple[str, str]:
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
    inserted = resp.data[0]
    return inserted["id"], inserted.get("created_at") or _utc_now()


def _supabase_list(symbol: str | None, limit: int) -> list[HistoryItem]:
    q = _supabase().table("stock_analyses").select(_HISTORY_COLUMNS)
    if symbol:
        q = q.eq("symbol", symbol)
    q = q.order("created_at", desc=True).limit(limit)
    resp = q.execute()
    return [_row_from_supabase(r) for r in resp.data or []]


def _supabase_reuse(symbol: str, fetched_at: str) -> HistoryItem | None:
    resp = (
        _supabase()
        .table("stock_analyses")
        .select(_HISTORY_COLUMNS)
        .eq("symbol", symbol)
        .filter("quote_data->>'fetched_at'", "eq", fetched_at)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return _row_from_supabase(rows[0]) if rows else None


def _row_from_supabase(row: dict) -> HistoryItem:
    return HistoryItem(
        id=row["id"],
        symbol=row["symbol"],
        quote_data=row["quote_data"],
        ai_summary=row["ai_summary"],
        sentiment=row["sentiment"],
        risk_level=row["risk_level"],
        created_at=row["created_at"],
    )


def _supabase_count_since(symbol: str | None, since_iso: str) -> int:
    q = _supabase().table("stock_analyses").select("id", count="exact")
    if symbol:
        q = q.eq("symbol", symbol)
    q = q.gte("created_at", since_iso)
    resp = q.execute()
    return resp.count or 0


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


def insert_analysis(symbol: str, quote: QuoteData, result: AnalysisResult) -> tuple[str, str]:
    """Insert an analysis row, returning ``(row_id, created_at)``.

    ``created_at`` is echoed back so the frontend can prepend the new history
    row locally (F-04) without a second round-trip.
    """
    if _backend() == "supabase":
        return _supabase_insert(symbol, quote, result)
    return _sqlite_insert(symbol, quote, result)


def list_history(symbol: str | None, limit: int) -> list[HistoryItem]:
    limit = max(1, min(limit, 100))
    if _backend() == "supabase":
        return _supabase_list(symbol, limit)
    return _sqlite_list(symbol, limit)


def find_reuse(symbol: str, fetched_at: str) -> HistoryItem | None:
    """B-13: reuse a recent analysis for the same cached quote, if enabled."""
    if _backend() == "supabase":
        return _supabase_reuse(symbol, fetched_at)
    return _sqlite_reuse(symbol, fetched_at)


def count_since(symbol: str | None, hours: int) -> int:
    """Row count over the last ``hours`` — backs the daily analyze cap, which
    survives restarts because it lives in the DB, not in process memory."""
    since = _utc_minus(hours)
    if _backend() == "supabase":
        return _supabase_count_since(symbol, since)
    return _sqlite_count_since(symbol, since)