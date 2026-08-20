# Troubleshooting

## Backend Does Not Start

Run the server from `backend/`, because settings load `.env` relative to the current working directory:

```bash
cd backend
.venv/bin/uvicorn main:app --reload --port 8000
```

If dependencies are missing, recreate the virtual environment with Python 3.12 and install `requirements.txt`.

## Frontend Cannot Reach the API

Check that the backend is listening on port 8000 and that `frontend/.env.local` contains `VITE_API_BASE=http://localhost:8000`. If the frontend runs on a non-default origin, add that exact origin to `CORS_ORIGINS` and restart the backend.

## Yahoo Finance Returns Errors or 429

The default provider falls back to deterministic mock data when `yfinance` fails. The API returns `provider: "mock"` and the UI shows **Demo Data**. For offline development, set:

```dotenv
STOCK_DATA_PROVIDER=mock
```

This does not mock the LLM; AI analysis still needs a reachable compatible model endpoint and key.

Earlier hosted logs showed:

```text
429 Too Many Requests: query2.finance.yahoo.com/...
```

The fallback was added so Yahoo egress failures do not make the quote screen unusable, while provenance remains visible.

## AI Analysis Fails

Check `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, network access, and whether the configured endpoint supports Chat Completions plus `response_format={"type":"json_object"}`. A malformed or schema-invalid response returns `502` and is not persisted.

## Supabase Startup Failure

When `STORAGE_BACKEND=supabase`, startup performs a connectivity check. Verify `SUPABASE_URL`, the backend-only `SUPABASE_SERVICE_KEY`, and that `supabase/migrations/0001_init.sql` has been applied. Do not use the anonymous/publishable key for the backend storage adapter.

## Render Deployment

The frontend must use the actual backend service URL in `VITE_API_BASE`; the backend must allow the actual frontend URL in `CORS_ORIGINS`. Renaming either Render service requires updating both values.
