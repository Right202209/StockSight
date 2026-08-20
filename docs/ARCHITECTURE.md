# Architecture

StockSight is a single-page React application backed by a small FastAPI service. Provider and model credentials stay on the server.

```text
Browser (React/Vite)
   |
   | GET /api/quote?symbol=AAPL
   v
FastAPI -> quote.py -> yfinance
                    \-> deterministic mock fallback
   |
   | POST /api/analyze { symbol, quote_data }
   v
FastAPI -> analyze.py -> OpenAI-compatible Chat API
                    \-> JSON parse + Pydantic validation
   |
   v
db.py -> SQLite (local) or Supabase (production)
   ^
   |
   +-- GET /api/history
```

## Backend Modules

- [`main.py`](../backend/main.py): FastAPI application, routes, CORS, security headers, and startup lifecycle.
- [`config.py`](../backend/config.py): environment-backed settings and SQLite path parsing.
- [`schemas.py`](../backend/schemas.py): symbol normalization and request/response models.
- [`quote.py`](../backend/quote.py): quote provider selection, 30-second in-memory cache, and mock fallback.
- [`analyze.py`](../backend/analyze.py): field-based prompt construction, model call, JSON parsing, and result validation.
- [`db.py`](../backend/db.py): SQLite/Supabase storage dispatch and history queries.

## Request Lifecycle

1. The frontend normalizes and validates a ticker before calling the quote endpoint.
2. The backend validates it again, checks the in-process cache, and fetches the latest available provider data.
3. The frontend sends the returned quote to the analysis endpoint.
4. The backend validates the request, calls the configured model, validates the structured result, and persists only valid analyses.
5. The frontend refreshes recent history and can restore a saved quote/analysis pair.

## Storage

SQLite is convenient for local development. Render's free filesystem is ephemeral, so production uses Supabase through the same storage interface. The schema and RLS setup live in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

## Current Tradeoffs

The quote cache is process-local, not shared across instances. The analysis endpoint accepts client-supplied quote data after shape validation, and history is not user-scoped. These are known MVP limitations, not guarantees of data integrity or privacy.
