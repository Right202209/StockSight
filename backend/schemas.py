from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

SYMBOL_PATTERN = re.compile(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$")
Sentiment = Literal["Bullish", "Neutral", "Bearish"]


def normalize_symbol(value: str) -> str:
    value = value.strip().upper()
    if not SYMBOL_PATTERN.match(value):
        raise ValueError("Invalid symbol — must be 1-5 uppercase letters, optional .XX suffix")
    return value


class QuoteData(BaseModel):
    symbol: str
    price: float
    change: float
    change_percent: float
    high: float
    low: float
    volume: int
    previous_close: float
    market_state: str
    fetched_at: str
    provider: Literal["yfinance", "mock"] = "yfinance"


class AnalyzeRequest(BaseModel):
    symbol: str
    quote_data: QuoteData

    @field_validator("symbol")
    @classmethod
    def _validate_symbol(cls, v: str) -> str:
        return normalize_symbol(v)


class AnalysisResult(BaseModel):
    summary: str = Field(min_length=1, max_length=500)
    sentiment: Sentiment
    risk_level: str = Field(min_length=1, max_length=50)


class HistoryItem(BaseModel):
    id: str
    symbol: str
    quote_data: dict
    ai_summary: str
    sentiment: Sentiment
    risk_level: str
    created_at: str
