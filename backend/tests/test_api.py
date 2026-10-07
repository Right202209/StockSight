import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_stocksight.db")
os.environ.setdefault("STORAGE_BACKEND", "sqlite")
os.environ.setdefault("STOCK_DATA_PROVIDER", "mock")
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("ANALYZE_RATE_LIMIT", "100")

import pytest

pytest.importorskip("openai")
pytest.importorskip("yfinance")

import main
from fastapi.testclient import TestClient
from schemas import AnalysisResult


def test_health_readiness_and_quote():
    with TestClient(main.app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json() == {"status": "ok"}
        assert health.headers["x-content-type-options"] == "nosniff"

        ready = client.get("/api/ready")
        assert ready.status_code == 200
        assert ready.json() == {"status": "ready"}

        quote = client.get("/api/quote?symbol=aapl")
        assert quote.status_code == 200
        assert quote.json()["symbol"] == "AAPL"
        assert quote.json()["provider"] == "mock"


def test_analyze_refetches_quote_and_persists_canonical_data(monkeypatch):
    seen = {}

    def fake_analyze(symbol, quote):
        seen["quote"] = quote
        return AnalysisResult(summary="steady", sentiment="Neutral", risk_level="Low")

    monkeypatch.setattr(main, "analyze_quote", fake_analyze)
    monkeypatch.setattr(main, "insert_analysis", lambda symbol, quote, result: "analysis-id")

    fake_client_quote = {
        "symbol": "AAPL",
        "price": 1,
        "change": 0,
        "change_percent": 0,
        "high": 1,
        "low": 1,
        "volume": 0,
        "previous_close": 1,
        "market_state": "REGULAR",
        "fetched_at": "2026-01-01T00:00:00+00:00",
        "provider": "mock",
    }
    with TestClient(main.app) as client:
        response = client.post("/api/analyze", json={"symbol": "AAPL", "quote_data": fake_client_quote})

    assert response.status_code == 200
    assert response.json()["id"] == "analysis-id"
    assert seen["quote"].price != 1


def test_oversized_request_is_rejected():
    with TestClient(main.app) as client:
        response = client.post(
            "/api/analyze",
            content="{}",
            headers={"Content-Length": str(70_000), "Content-Type": "application/json"},
        )
    assert response.status_code == 413
