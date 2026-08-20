# API Reference

The FastAPI service runs at `http://localhost:8000` during local development. Interactive OpenAPI documentation is available at `/docs`, with the schema at `/openapi.json`.

## `GET /api/health`

Returns a shallow process-health response:

```json
{"status":"ok"}
```

## `GET /api/quote?symbol=AAPL`

Accepts symbols matching `^[A-Z]{1,5}(\\.[A-Z]{1,2})?$`. Symbols are normalized to uppercase. `yfinance` is preferred; provider failures fall back to deterministic mock data and set `provider` to `mock`.

Example response:

```json
{
  "symbol": "AAPL",
  "price": 190.5,
  "change": 1.2,
  "change_percent": 0.63,
  "high": 191.0,
  "low": 188.0,
  "volume": 50000000,
  "previous_close": 189.3,
  "market_state": "REGULAR",
  "fetched_at": "2026-08-21T00:00:00+00:00",
  "provider": "yfinance"
}
```

Invalid symbols return `400`. An unrecoverable quote error returns `502`. Quotes are cached in process memory for `QUOTE_CACHE_TTL` seconds (30 by default).

## `POST /api/analyze`

The request must include a normalized symbol and a `quote_data` object. The two symbols must match case-insensitively.

```json
{
  "symbol": "AAPL",
  "quote_data": {
    "symbol": "AAPL",
    "price": 190.5,
    "change": 1.2,
    "change_percent": 0.63,
    "high": 191.0,
    "low": 188.0,
    "volume": 50000000,
    "previous_close": 189.3,
    "market_state": "REGULAR",
    "fetched_at": "2026-08-21T00:00:00+00:00",
    "provider": "mock"
  }
}
```

Successful analyses are validated and persisted before the response is returned:

```json
{
  "id": "<uuid>",
  "summary": "AAPL is up modestly on the session.",
  "sentiment": "Bullish",
  "risk_level": "Medium"
}
```

`400` indicates invalid input or a symbol mismatch, `422` indicates FastAPI request validation, and `502` indicates a model/upstream error or malformed model response. Failed analyses are not persisted.

## `GET /api/history`

Returns the newest saved analyses. `symbol` is optional; `limit` accepts 1–100 and defaults to 20.

```text
/api/history?symbol=AAPL&limit=20
```

```json
{
  "items": [
    {
      "id": "<uuid>",
      "symbol": "AAPL",
      "quote_data": { "...": "QuoteData" },
      "ai_summary": "AAPL is up modestly on the session.",
      "sentiment": "Bullish",
      "risk_level": "Medium",
      "created_at": "2026-08-21T00:00:00+00:00"
    }
  ]
}
```

The MVP history endpoint is unauthenticated and therefore represents shared public data. See [Security and limitations](SECURITY.md).

## Smoke Tests

```bash
curl http://localhost:8000/api/health
curl 'http://localhost:8000/api/quote?symbol=AAPL'
curl 'http://localhost:8000/api/history?limit=20'
```

For `/api/analyze`, first fetch a quote and use that response as `quote_data`:

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "symbol": "AAPL",
    "quote_data": {
      "symbol": "AAPL",
      "price": 190.50,
      "change": 1.20,
      "change_percent": 0.63,
      "high": 191.00,
      "low": 188.00,
      "volume": 50000000,
      "previous_close": 189.30,
      "market_state": "REGULAR",
      "fetched_at": "2026-08-21T00:00:00+00:00",
      "provider": "mock"
    }
  }'
```
