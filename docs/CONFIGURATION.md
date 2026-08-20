# Configuration

Settings are loaded from `.env` in the current working directory when the backend starts. Never commit real secrets. Vite embeds `VITE_*` values into the frontend build, so backend credentials must never be placed there.

## Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | `sk-missing` | Required for AI analysis; server-side only |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model identifier accepted by the endpoint |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated exact frontend origins |
| `STORAGE_BACKEND` | `sqlite` | `sqlite` locally or `supabase` in production |
| `DATABASE_URL` | `sqlite:///./stocksight.db` | SQLite URL, used only by SQLite storage |
| `SUPABASE_URL` | empty | Required for Supabase storage |
| `SUPABASE_SERVICE_KEY` | empty | Supabase `service_role` key; never expose it to clients |
| `QUOTE_CACHE_TTL` | `30` | Quote cache lifetime in seconds |
| `STOCK_DATA_PROVIDER` | `yfinance` | `yfinance` with mock fallback, or `mock` to force demo data |

The checked-in template is [`backend/.env.example`](../backend/.env.example).

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
