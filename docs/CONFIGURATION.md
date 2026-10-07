# Configuration

Settings are loaded from `.env` in the current working directory when the backend starts. Never commit real secrets. Vite embeds `VITE_*` values into the frontend build, so backend credentials must never be placed there.

## Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | empty | Required for AI analysis; server-side only |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model identifier accepted by the endpoint |
| `OPENAI_TIMEOUT_SECONDS` | `20` | Maximum upstream model-call duration |
| `ANALYZE_CONCURRENCY` | `2` | Maximum simultaneous model calls per process |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated exact frontend origins |
| `STORAGE_BACKEND` | `sqlite` | `sqlite` locally or `supabase` in production |
| `DATABASE_URL` | `sqlite:///./stocksight.db` | SQLite URL, used only by SQLite storage |
| `SUPABASE_URL` | empty | Required for Supabase storage |
| `SUPABASE_SERVICE_KEY` | empty | Supabase `service_role` key; never expose it to clients |
| `QUOTE_CACHE_TTL` | `30` | Quote cache lifetime in seconds |
| `QUOTE_TIMEOUT_SECONDS` | `10` | Maximum Yahoo Finance call duration |
| `MAX_REQUEST_BYTES` | `65536` | Maximum declared body size for write requests |
| `ANALYZE_RATE_LIMIT` | `10` | Analysis requests allowed per client in the rate window |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Per-process analysis rate-limit window |
| `ANALYZE_DAILY_LIMIT` | `500` | Per-process UTC-day cap on analysis requests |
| `STOCK_DATA_PROVIDER` | `yfinance` | `yfinance` with mock fallback, or `mock` to force demo data |

The checked-in template is [`backend/.env.example`](../backend/.env.example).

`/api/health` is a shallow process probe. Use `/api/ready` when a deployment platform needs to verify storage connectivity.

## Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:8000` | Backend origin, including the URL scheme |

The checked-in template is [`frontend/.env.example`](../frontend/.env.example).

## Runtime Baseline

- Python 3.12 (Render pins 3.12.3).
- Node.js 20 and npm 10+ (Render pins Node 20.18.0).
- Use `npm ci` for reproducible frontend installs.
- Backend packages are exact-pinned in [`backend/requirements.txt`](../backend/requirements.txt).
