from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SYMBOL_PATTERN = re.compile(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$")
Sentiment = Literal["Bullish", "Neutral", "Bearish"]


def normalize_symbol(value: str) -> str:
    value = value.strip().upper()
    if not SYMBOL_PATTERN.match(value):
        raise ValueError("Invalid symbol — must be 1-5 uppercase letters, optional .XX suffix")
    return value


class QuoteData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str = Field(min_length=1, max_length=8)
    price: float = Field(ge=0, le=10_000_000)
    change: float = Field(ge=-10_000_000, le=10_000_000)
    change_percent: float = Field(ge=-100, le=100_000)
    high: float = Field(ge=0, le=10_000_000)
    low: float = Field(ge=0, le=10_000_000)
    volume: int = Field(ge=0, le=10**15)
    previous_close: float = Field(ge=0, le=10_000_000)
    market_state: str = Field(min_length=1, max_length=32, pattern=r"^[A-Z][A-Z0-9_-]*$")
    fetched_at: str = Field(min_length=1, max_length=64)
    provider: Literal["yfinance", "mock"] = "yfinance"

    @field_validator("symbol")
    @classmethod
    def _validate_symbol(cls, value: str) -> str:
        return normalize_symbol(value)

    @field_validator("price", "change", "change_percent", "high", "low", "previous_close")
    @classmethod
    def _finite_number(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("numeric quote fields must be finite")
        return value

    @field_validator("fetched_at")
    @classmethod
    def _validate_timestamp(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("fetched_at must be an ISO-8601 timestamp") from exc
        if parsed.tzinfo is None:
            raise ValueError("fetched_at must include a timezone")
        return value

    @model_validator(mode="after")
    def _validate_price_range(self):
        if self.high < self.low:
            raise ValueError("high must be greater than or equal to low")
        return self


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str
    quote_data: QuoteData

    @field_validator("symbol")
    @classmethod
    def _validate_symbol(cls, v: str) -> str:
        return normalize_symbol(v)

    @model_validator(mode="after")
    def _symbols_match(self):
        if self.symbol != self.quote_data.symbol:
            raise ValueError("symbol and quote_data.symbol must match")
        return self


class AnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1, max_length=500)
    sentiment: Sentiment
    risk_level: Literal["Low", "Medium", "High"]


class HistoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    symbol: str
    quote_data: QuoteData
    ai_summary: str
    sentiment: Sentiment
    risk_level: Literal["Low", "Medium", "High"]
    created_at: str
