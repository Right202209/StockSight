import math

import pytest
from config import Settings
from pydantic import ValidationError
from schemas import AnalysisResult, AnalyzeRequest, QuoteData, normalize_symbol


def quote_payload(**overrides):
    payload = {
        "symbol": "AAPL",
        "price": 200.0,
        "change": 1.5,
        "change_percent": 0.75,
        "high": 201.0,
        "low": 198.0,
        "volume": 1_000_000,
        "previous_close": 198.5,
        "market_state": "REGULAR",
        "fetched_at": "2026-01-01T00:00:00+00:00",
        "provider": "mock",
    }
    payload.update(overrides)
    return payload


def test_normalize_symbol_accepts_exchange_suffix():
    assert normalize_symbol(" brk.a ") == "BRK.A"


def test_quote_rejects_unknown_fields_and_non_finite_values():
    with pytest.raises(ValidationError):
        QuoteData(**quote_payload(unexpected="value"))
    with pytest.raises(ValidationError):
        QuoteData(**quote_payload(price=math.inf))
    with pytest.raises(ValidationError):
        QuoteData(**quote_payload(high=100, low=101))


def test_analyze_request_requires_matching_normalized_symbols():
    request = AnalyzeRequest(symbol="aapl", quote_data=QuoteData(**quote_payload()))
    assert request.symbol == "AAPL"
    with pytest.raises(ValidationError):
        AnalyzeRequest(symbol="MSFT", quote_data=QuoteData(**quote_payload()))


def test_analysis_result_has_strict_contract():
    assert AnalysisResult(summary="steady gains", sentiment="Bullish", risk_level="Low")
    with pytest.raises(ValidationError):
        AnalysisResult(summary="steady gains", sentiment="Bullish", risk_level="Elevated")
    with pytest.raises(ValidationError):
        AnalysisResult(summary="steady gains", sentiment="Bullish", risk_level="Low", extra=True)


def test_settings_reject_wildcard_cors_and_unknown_backends():
    with pytest.raises(ValidationError):
        Settings(cors_origins="*")
    with pytest.raises(ValidationError):
        Settings(cors_origins="https://example.com/app")
    with pytest.raises(ValidationError):
        Settings(cors_origins="https://*")
    with pytest.raises(ValidationError):
        Settings(cors_origins="https://example.com:not-a-port")
    with pytest.raises(ValidationError):
        Settings(storage_backend="redis")
    with pytest.raises(ValidationError):
        Settings(database_url="sqlite:///")


def test_quote_rejects_invalid_timestamp_and_market_state():
    with pytest.raises(ValidationError):
        QuoteData(**quote_payload(fetched_at="not-a-date"))
    with pytest.raises(ValidationError):
        QuoteData(**quote_payload(market_state="regular"))
