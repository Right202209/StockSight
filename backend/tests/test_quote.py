import importlib.util
import sys
import time
import types

import pytest

if importlib.util.find_spec("yfinance") is None:
    yfinance_stub = types.ModuleType("yfinance")
    yfinance_stub.Ticker = object
    sys.modules["yfinance"] = yfinance_stub

import quote
from config import get_settings


def test_yfinance_timeout_returns_labeled_mock(monkeypatch):
    monkeypatch.setenv("STOCK_DATA_PROVIDER", "yfinance")
    monkeypatch.setenv("QUOTE_TIMEOUT_SECONDS", "0.01")
    monkeypatch.setenv("QUOTE_CACHE_TTL", "0")
    get_settings.cache_clear()

    def slow_provider(symbol):
        time.sleep(0.05)
        raise quote.QuoteError("slow")

    monkeypatch.setattr(quote, "_fetch_yfinance", slow_provider)
    result = quote.fetch_quote("AAPL")
    assert result.provider == "mock"
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def restore_settings():
    yield
    # pytest restores monkeypatched environment after each test; clear the
    # cached Settings object so subsequent tests observe that restoration.
    get_settings.cache_clear()
