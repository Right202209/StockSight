# StockSight AI

> Editorial trading companion — live US equity quotes, paired with a one-sentence AI commentary and a structured `sentiment` / `risk_level` read.

| | |
|---|---|
| **Live demo** | _TBD — will be filled in after first Render deploy._ |
| **Stack** | FastAPI · React (Vite) · Tailwind · SQLite (local) / Supabase-ready · OpenAI-compatible LLM |
| **Status** | MVP build — runs locally end-to-end. Persistence currently SQLite; Supabase migration is a thin swap of `db.py`. |

---

## 1. What it does

```
 ┌──────────┐   GET /api/quote?symbol=AAPL    ┌──────────┐
 │          │ ─────────────────────────────►  │          │
 │ Browser  │                                 │ FastAPI  │ ──► yfinance (with mock fallback)
 │  (Vite)  │                                 │          │
 │          │   POST /api/analyze {symbol,    │          │ ──► OpenAI-compatible Chat API
 │          │        quote_data}              │          │       (response_format=json_object)
 │          │ ─────────────────────────────►  │          │
 │          │   { summary, sentiment,         │          │ ──► SQLite stock_analyses (insert)
 │          │     risk_level }                │          │
 └──────────┘                                 └──────────┘
```

1. User types a US ticker → frontend hits `/api/quote`.
2. Backend pulls from yfinance, falls back to deterministic mock data if Yahoo is unreachable, returns a normalized quote + `provider` flag.
3. User clicks **AI Analyze** → frontend posts the symbol + the full quote payload to `/api/analyze`.
4. Backend builds a strict JSON prompt, calls the LLM with `response_format={"type": "json_object"}`, validates the response against the schema, **and only then persists** the row.
5. History panel reflects the new entry instantly.

The frontend never talks to the LLM or the quote provider directly. See `CLAUDE.md` for the architectural guardrails.

---

## 2. Prompt (load-bearing — copy from `backend/analyze.py`)

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

### User message template

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

### API call

```python
client.chat.completions.create(
    model=settings.openai_model,
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ],
    temperature=0.2,
    response_format={"type": "json_object"},
)
```

### Validation (three lines of defense)

1. **Prompt** — system message forbids markdown / extra keys / prose.
2. **API parameter** — `response_format={"type": "json_object"}`.
3. **Backend validation** — `json.loads` → `AnalysisResult.model_validate`. The Pydantic model pins `sentiment` to a `Literal["Bullish","Neutral","Bearish"]`, so any deviation raises and the row is **not** persisted.

(SQLite layer adds a fourth: `CHECK (sentiment IN ('Bullish','Neutral','Bearish'))`. When migrating to Supabase, keep the CHECK.)

---

## 3. Local development

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env       # then fill in OPENAI_API_KEY etc.
.venv/bin/uvicorn main:app --reload --port 8000
```

Smoke-test:

```bash
curl 'http://127.0.0.1:8000/api/health'
curl 'http://127.0.0.1:8000/api/quote?symbol=AAPL'
curl -X POST 'http://127.0.0.1:8000/api/analyze' \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL","quote_data":{"symbol":"AAPL","price":190.5,"change":1.2,"change_percent":0.6,"high":191.0,"low":188.0,"volume":50000000,"previous_close":189.3,"market_state":"REGULAR","fetched_at":"2026-05-21T09:00:00Z","provider":"mock"}}'
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # VITE_API_BASE defaults to http://localhost:8000
npm run dev                    # http://127.0.0.1:5173
```

---

## 4. Environment variables

### `backend/.env`

| Key | Default | Notes |
|---|---|---|
| `OPENAI_API_KEY` | _required_ | Any OpenAI-compatible key (OpenAI, DeepSeek, Moonshot, vLLM, Together, etc.) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Point at any OpenAI-compatible endpoint |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model id understood by the endpoint above |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated whitelist of frontend origins |
| `DATABASE_URL` | `sqlite:///./stocksight.db` | Only SQLite is wired today |
| `QUOTE_CACHE_TTL` | `30` | Seconds; prevents hammering yfinance |
| `STOCK_DATA_PROVIDER` | `yfinance` | Set to `mock` to force deterministic demo data |

### `frontend/.env.local`

| Key | Default | Notes |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:8000` | Backend origin. **Must include scheme.** |

The Supabase service key, when added, lives only in `backend/.env` and never crosses the wire to the browser. See PRD §10 for the full security checklist.

---

## 5. Render deployment

Two services from one repo:

### Backend — Web Service
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Env vars**: all of the table above, with `CORS_ORIGINS` pointing at the deployed frontend URL.

### Frontend — Static Site
- **Root Directory**: `frontend`
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`
- **Env vars**: `VITE_API_BASE=https://<your-backend>.onrender.com`

Render's free tier sleeps after inactivity; the first request after a cold start takes ~30 s. Surface that in the UI if it matters for the demo.

---

## 6. Debug log (real incident)

> **Issue**: From the Azure dev VM, every `yfinance` call returned `429 Too Many Requests` from `query2.finance.yahoo.com`. The unwrapped `fast_info["last_price"]` raised, and `/api/quote?symbol=AAPL` returned `502 "Failed to fetch quote, please try again."`. Re-runs (different symbol, `history()`, longer waits) all hit the same wall — Yahoo had IP-banned the entire Azure subnet, not just throttled the request rate.

**Diagnosis** — captured directly from the failing import:

```
$AAPL: possibly delisted; no price data found  (period=5d)
429 Client Error: Too Many Requests for url: https://query2.finance.yahoo.com/v10/finance/quoteSummary/AAPL?...
```

**Fix** — instead of bouncing the user on every cold deploy, the quote service now has a `STOCK_DATA_PROVIDER` knob with a deterministic mock fallback. Production prefers `yfinance`; if the call raises a `QuoteError`, the service silently falls back to mock and tags the response with `provider: "mock"`. The frontend renders a small **Demo Data** badge so the user is never lied to about the source.

Relevant diff (`backend/quote.py`):

```python
def fetch_quote(symbol: str) -> QuoteData:
    cached = _from_cache(symbol)
    if cached is not None:
        return cached

    provider = get_settings().stock_data_provider
    if provider == "mock":
        quote = _fetch_mock(symbol)
    else:
        try:
            quote = _fetch_yfinance(symbol)
        except QuoteError as e:
            log.warning("yfinance failed for %s, falling back to mock: %s", symbol, e)
            quote = _fetch_mock(symbol)

    _save_cache(symbol, quote)
    return quote
```

This satisfies PRD §10.10 "上游服务故障 → 友好降级页面": the user gets a working app, the provenance is transparent in the JSON, and the LLM is still doing real work on real-looking inputs.

---

## 7. Layout

```
StockSight/
├── CLAUDE.md           # architectural contracts for Claude Code sessions
├── PRD.md              # full product spec including security & risk
├── README.md
├── backend/
│   ├── main.py         # FastAPI app, CORS, security headers, routes
│   ├── config.py       # pydantic-settings, env loader
│   ├── schemas.py      # Pydantic models + symbol regex
│   ├── quote.py        # yfinance + mock fallback + cache
│   ├── analyze.py      # System prompt, OpenAI-compatible client, JSON validation
│   ├── db.py           # SQLite, CHECK-constrained stock_analyses table
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── index.html      # Fraunces + Inter Tight + JetBrains Mono
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js      # single typed wrapper around fetch
        ├── components/
        └── utils/
```
