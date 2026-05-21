from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from config import get_settings
from schemas import AnalysisResult, HistoryItem, QuoteData

SCHEMA = """
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


def init_db() -> None:
    path = get_settings().sqlite_path
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(get_settings().sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def insert_analysis(symbol: str, quote: QuoteData, result: AnalysisResult) -> str:
    import json

    row_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    with connection() as conn:
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


def list_history(symbol: str | None, limit: int) -> list[HistoryItem]:
    import json

    limit = max(1, min(limit, 100))
    with connection() as conn:
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
