from __future__ import annotations

import math
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SYMBOL_PATTERN = re.compile(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$")
Sentiment = Literal["Bullish", "Neutral", "Bearish"]


def normalize_symbol(value: str) -> str:
    value = value.strip().upper()
    if not SYMBOL_PATTERN.match(value):
        raise ValueError("Invalid symbol — must be 1-5 uppercase letters, optional .XX suffix")
    return value


def _finite(v: float) -> float:
    """Reject NaN / ±inf so the JSON encoder can never emit bare NaN.

    ``json.dumps`` happily writes the bare token ``NaN`` (invalid JSON) and a
    browser's ``response.json()`` then throws. yfinance's ``fast_info`` can
    return NaN on thin or partial responses, so this guard is load-bearing.
    """
    if not math.isfinite(v):
        raise ValueError("value must be finite")
    return v


class QuoteData(BaseModel):
    # allow_inf_nan=False is the single place that makes NaN/Infinity impossible
    # on any serialization path (invariant: no response body contains NaN).
    model_config = ConfigDict(allow_inf_nan=False)

    symbol: str
    price: float
    change: float
    change_percent: float
    high: float
    low: float
    volume: int = Field(ge=0)
    previous_close: float
    market_state: str
    fetched_at: str
    provider: Literal["yfinance", "mock"] = "yfinance"

    @field_validator("price", "change", "change_percent", "high", "low", "previous_close")
    @classmethod
    def _check_finite(cls, v: float) -> float:
        return _finite(v)


class AnalyzeRequest(BaseModel):
    symbol: str
    quote_data: QuoteData

    @field_validator("symbol")
    @classmethod
    def _validate_symbol(cls, v: str) -> str:
        return normalize_symbol(v)


class AnalysisResult(BaseModel):
    # Tolerant by design: extra keys the model adds are dropped rather than
    # failing the whole analysis. See docs/PROMPT.md for the rationale.
    model_config = ConfigDict(extra="ignore")

    summary: str = Field(min_length=1, max_length=500)
    sentiment: Sentiment
    # Free-form on purpose: narrowing to Literal["Low","Medium","High"] would
    # 502 the whole analysis when a provider says "Moderate". The prompt
    # steers toward the three canonical values; validation normalizes case.
    risk_level: str = Field(min_length=1, max_length=50)


class HistoryItem(BaseModel):
    id: str
    symbol: str
    quote_data: dict
    ai_summary: str
    sentiment: Sentiment
    risk_level: str
    created_at: str
