# StockSight AI

[English](README.md) | [简体中文](README.zh-CN.md)

> An editorial dashboard for the latest available US equity quotes and concise, structured AI commentary.

| | Status |
|---|---|
| Local development | End-to-end flow is implemented |
| Production demo | No verified live URL is committed yet; `render.yaml` provides default Render hostnames |
| Frontend | React 18 · Vite 5 · Tailwind CSS 3 |
| Backend | FastAPI · Python 3.12 |
| Persistence | SQLite locally · Supabase in production |
| AI | OpenAI-compatible Chat Completions API |

This is an MVP, not a trading system. Quote data can be delayed, Yahoo Finance can be unavailable, and model output can be wrong. The interface is for information only and does not provide investment advice.

## What it does

Enter a ticker such as `AAPL`, inspect the quote, and press **AI Analyze** to generate a short sentiment and risk read. Successful analyses appear in the recent-history panel and are persisted.

```text
Browser (React/Vite)
   │
   ├── GET /api/quote?symbol=AAPL ──► FastAPI ──► yfinance
   │                                      │          └─► deterministic mock fallback
   │                                      └─► normalized QuoteData
   │
   ├── POST /api/analyze ───────────► FastAPI ──► OpenAI-compatible Chat API
   │                                      │          └─► JSON parse + Pydantic validation
   │                                      └─► persist only valid analyses
   │                                           ├─ SQLite (local)
   │                                           └─ Supabase (production)
   │
   └── GET /api/history ────────────► recent saved analyses
```

The browser never receives the quote-provider key, model key, or Supabase service key. Persistence happens on `/api/analyze`, not on `/api/quote`.

### Current behavior

- Symbols are normalized to uppercase and checked against `^[A-Z]{1,5}(\.[A-Z]{1,2})?$`.
- `yfinance` is preferred. A provider error falls back to deterministic per-symbol mock data; the API returns `provider: "mock"` and the UI shows a **Demo Data** badge.
- Quotes are cached in process memory for 30 seconds by default (`QUOTE_CACHE_TTL` is configurable).
- Analysis results contain `summary` (1–500 characters), `sentiment` (`Bullish`, `Neutral`, or `Bearish`), and `risk_level` (a non-empty string up to 50 characters).
- The UI includes quote source/timestamp, a health indicator, light/dark mode, ticker suggestions, `/` keyboard focus, a responsive history panel, and a not-financial-advice disclaimer.

## Requirements

See [REQUIREMENTS.md](REQUIREMENTS.md) for the implementation matrix and planned hardening work.

You need:

- Python 3.12 (Render is pinned to 3.12.3).
- Node.js 20 and npm 10+ (Render is pinned to Node 20.18.0).
- An OpenAI-compatible API key and an endpoint that supports Chat Completions plus `response_format={"type":"json_object"}` for analysis.
- Network access to Yahoo Finance if using the default quote provider. Set `STOCK_DATA_PROVIDER=mock` for deterministic/offline quote data.

The backend dependencies are exact-pinned in [`backend/requirements.txt`](backend/requirements.txt). Frontend dependencies are resolved in [`frontend/package-lock.json`](frontend/package-lock.json); use `npm ci` rather than `npm install` in CI or deployment.

## Local development

### 1. Start the backend

Run these commands from `backend/`; settings load `.env` relative to the current working directory.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Edit .env and set OPENAI_API_KEY (and any provider/storage overrides).
.venv/bin/uvicorn main:app --reload --port 8000
```

The API is available at `http://localhost:8000`. FastAPI also exposes interactive documentation at `/docs` and the schema at `/openapi.json`.

For a quote-only smoke test without Yahoo, set `STOCK_DATA_PROVIDER=mock` in `backend/.env`. Mocking quotes does not mock the LLM: **AI Analyze still needs a reachable compatible model endpoint and key.**

### 2. Start the frontend

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. The backend default allowlist includes both `localhost` and `127.0.0.1`; if you use another origin, add it to `CORS_ORIGINS` before starting the backend.

Available frontend scripts:

```bash
npm run dev       # development server
npm run build     # production build to dist/
npm run preview   # preview the production build
```

There are no automated test or lint scripts in the repository yet.

### API smoke tests

```bash
curl http://localhost:8000/api/health
curl 'http://localhost:8000/api/quote?symbol=AAPL'
curl 'http://localhost:8000/api/history?limit=20'
```

To call `/api/analyze`, first use the quote response as `quote_data`:

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
      "fetched_at": "<ISO-8601 timestamp>",
      "provider": "mock"
    }
  }'
```

## Configuration

### Backend: `backend/.env`

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | `sk-missing` in code | Required for analysis; keep it server-side |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model understood by that endpoint |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated exact frontend origins |
| `STORAGE_BACKEND` | `sqlite` | `sqlite` locally or `supabase` in production |
| `DATABASE_URL` | `sqlite:///./stocksight.db` | Used only by SQLite storage |
| `SUPABASE_URL` | empty | Required for Supabase storage |
| `SUPABASE_SERVICE_KEY` | empty | Supabase `service_role` key; never use or expose the anon key here |
| `QUOTE_CACHE_TTL` | `30` | Quote-cache lifetime in seconds |
| `STOCK_DATA_PROVIDER` | `yfinance` | `yfinance` with mock fallback, or `mock` to force demo data |

### Frontend: `frontend/.env.local`

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:8000` | Backend origin; include the scheme |

Vite embeds `VITE_*` values at build time. Never put backend secrets in frontend environment variables or source files.

## API reference

### `GET /api/health`

Returns a shallow process-health response:

```json
{"status":"ok"}
```

### `GET /api/quote?symbol=AAPL`

Accepts a ticker matching the symbol pattern above. A successful response is a `QuoteData` object:

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
  "fetched_at": "<ISO-8601 timestamp>",
  "provider": "yfinance"
}
```

Invalid symbols return `400`; an unrecoverable quote error returns `502`. In normal upstream-failure cases the fallback means the endpoint still returns a quote with `provider: "mock"`.

### `POST /api/analyze`

Request body:

```json
{
  "symbol": "AAPL",
  "quote_data": { "...": "QuoteData fields" }
}
```

The symbol must match `quote_data.symbol` (case-insensitively). A successful response is:

```json
{
  "id": "<uuid>",
  "summary": "AAPL is up modestly on the session.",
  "sentiment": "Bullish",
  "risk_level": "Medium"
}
```

`400` indicates invalid input or a symbol mismatch; `422` is FastAPI request validation; `502` indicates a model/upstream or malformed-model-response failure. A failed analysis is not persisted.

### `GET /api/history`

Use `symbol` to filter and `limit` to request 1–100 records (the UI requests 20):

```text
/api/history?symbol=AAPL&limit=20
```

Response shape:

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
      "created_at": "<ISO-8601 timestamp>"
    }
  ]
}
```

## Prompt contract

The source of truth is [`backend/analyze.py`](backend/analyze.py). The prompt is deliberately field-based: only the validated quote fields below are interpolated into the user message.

### System message

```text
You are a professional financial analyst AI.
Your task is to analyze the given real-time stock quote data and output a strict JSON object.
Your response must contain ONLY a valid JSON object (no markdown code fences, no extra text).
The JSON must have exactly these three fields:
- "summary": A concise one-sentence summary of the stock's current performance (string).
- "sentiment": One of "Bullish", "Neutral", or "Bearish" (string).
- "risk_level": A risk assessment, e.g., "Low", "Medium", or "High" (string).

Do not include any additional keys. Do not wrap the JSON in code blocks. Do not provide explanations.
Example of valid output:
{"summary": "AAPL is up 2.3% on strong volume, breaking above 20-day moving average.", "sentiment": "Bullish", "risk_level": "Medium"}
```

### User-message template

```text
Analyze the following stock data and produce the required JSON:

Symbol: {symbol}
Current Price: {price}
Change: {change} ({change_percent}%)
Day High: {high}
Day Low: {low}
Volume: {volume}
Previous Close: {previous_close}
Market State: {market_state}
```

The call uses `temperature=0.2` and `response_format={"type":"json_object"}`. The backend then runs `json.loads()` and `AnalysisResult.model_validate()`; only a valid result reaches the database sentiment check. One nuance matters: the current Pydantic model ignores unknown extra keys, and `risk_level` is free text within its length bound. If exact keys or a fixed risk enum become mandatory, tighten the model and add tests.

## Supabase persistence

SQLite is the default for local work. Render's free filesystem is ephemeral, so production should use Supabase.

1. Create a Supabase project.
2. Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the Supabase SQL editor. It creates `stock_analyses`, an index, the `sentiment` check, and enables RLS without public policies.
3. Set `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, and the backend-only `SUPABASE_SERVICE_KEY`.
4. Start the backend. Startup performs a zero-row connectivity check and fails fast if the table, URL, or key is wrong.

The backend history route is currently unauthenticated even though direct Supabase anonymous access is blocked by RLS; treat stored analyses as public MVP data.

## Deploying to Render

The repository includes [`render.yaml`](render.yaml), which defines:

- `stocksight-backend`: Python web service rooted at `backend`, with `/api/health` as its health check.
- `stocksight-frontend`: static Vite build rooted at `frontend`, published from `dist`, with an SPA fallback.

To use the Blueprint:

1. Push the repository to GitHub and create **New → Blueprint** in Render.
2. Supply the prompted `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_KEY` values.
3. Apply the Supabase migration before the backend starts.
4. If you rename either Render service, update `CORS_ORIGINS` and `VITE_API_BASE` to the actual generated origins.

The default hostnames in the Blueprint are predictions (`stocksight-frontend.onrender.com` and `stocksight-backend.onrender.com`), not a verified live demo URL. Render's free tier sleeps when idle, so the first request after a cold start can take roughly 30 seconds.

## Debug log: Yahoo rate limiting

During an earlier deployment, Yahoo Finance returned `429 Too Many Requests` for every `yfinance` request from the hosting egress range:

```text
$AAPL: possibly delisted; no price data found (period=5d)
429 Client Error: Too Many Requests: query2.finance.yahoo.com/...
```

The original behavior surfaced a `502` to the user. The fix was to catch `QuoteError`, return deterministic mock data, and expose its provenance:

```python
try:
    quote = _fetch_yfinance(symbol)
except QuoteError as exc:
    log.warning("yfinance failed for %s, falling back to mock: %s", symbol, exc)
    quote = _fetch_mock(symbol)
```

The UI now shows **Demo Data** instead of presenting fallback values as live Yahoo data. This is a graceful-degradation path, not a claim that mock values represent the market.

## Security and limitations

Implemented protections include backend-only secrets, exact CORS origins, `nosniff`/`DENY`/`no-referrer` headers, ticker normalization, Pydantic request validation, quote caching, Supabase RLS, a database sentiment check, and an explicit disclaimer.

The following are not implemented yet and should be treated as release requirements for a public multi-user service:

- authentication and user-scoped history;
- per-IP/user rate limiting and an external model spending cap;
- request-size limits and stricter quote-field filtering;
- server-side quote re-fetching or signed quote payloads;
- strict rejection of unknown model-output keys and a fixed risk-level enum;
- automated tests, linting, CI, dependency vulnerability scanning, and secret scanning.

Also note that `/api/analyze` accepts client-supplied quote data after shape validation. An unauthenticated caller can therefore submit fabricated values or trigger model spend; this is an intentional MVP limitation to address before broader exposure.

## Repository layout

```text
StockSight/
├── REQUIREMENTS.md              # implementation matrix and hardening requirements
├── PRD.md                       # original product brief
├── README.md
├── README.zh-CN.md              # Simplified Chinese documentation
├── render.yaml                  # Render Blueprint for backend + frontend
├── backend/
│   ├── main.py                  # FastAPI app, routes, CORS, headers
│   ├── config.py                # environment-backed settings
│   ├── schemas.py               # request/response models and symbol validation
│   ├── quote.py                 # yfinance, cache, mock fallback
│   ├── analyze.py               # prompt, model call, response validation
│   ├── db.py                    # SQLite/Supabase storage dispatch
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/                     # React app, components, API wrapper, utilities
└── supabase/migrations/
    └── 0001_init.sql            # schema, index, CHECK, and RLS
```

## Contributing

Keep provider and model credentials out of git, update `REQUIREMENTS.md` when behavior changes, and run the frontend production build before opening a change:

```bash
cd frontend
npm ci
npm run build
```

There is no license file or automated test suite in the repository yet.
