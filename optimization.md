# StockSight Optimization Guide

> Proposed location: `docs/OPTIMIZATION.md`
> Scope: performance, correctness, cost control, security hardening, and maintainability across `backend/` and `frontend/`.
> Basis: I wrote this from the project description (PROJECT.md), not from the source code. Code snippets are sketches. Adapt names and signatures to the real code before merging. Where a fix depends on how the code is written today (for example `async def` vs `def` routes), the guide says so.

---

## 0. How to Use This Document

Each item has an **ID** (e.g. `B-03`, `F-07`), a **priority**, and a **verification step**. Work through them in the order in §8. Every change must keep the invariants in §1. If a change would break one, it needs a CLAUDE.md update and an explicit decision. It should not just happen as part of a refactor.

Priority scale:

| Priority | Meaning |
|---|---|
| **P0** | Correctness, data integrity, or cost/abuse risk. Fix before any public exposure. |
| **P1** | Noticeable latency, reliability, or UX improvement. Low risk. |
| **P2** | Polish, maintainability, future-proofing. |

---

## 1. Invariants (Do Not Break)

These are the project's load-bearing contracts. All optimizations below keep them.

1. **Two-call flow.** `GET /api/quote` is read-only and never writes. Only `POST /api/analyze` persists.
2. **Keys stay server-side.** The OpenAI key and Supabase `service_role` key never reach the browser bundle, logs, or error messages.
3. **Output contract.** The model returns exactly `summary` / `sentiment` / `risk_level`. `sentiment ∈ {Bullish, Neutral, Bearish}`. Malformed output is never persisted.
4. **Multiple lines of defense.** The prompt, `response_format=json_object`, Pydantic validation, and the DB `CHECK` constraint on `sentiment` all stay.
5. **Ticker rules stay in sync.** Frontend `SYMBOL_REGEX` and backend `SYMBOL_PATTERN` must stay identical.
6. **Flat backend.** Six modules, direct imports, commands run from `backend/`. Tests may be added under `backend/tests/` without changing this.
7. **Response shapes are additive-only.** New fields may be added. Existing fields may not be renamed or removed.

---

## 2. Priority Summary

| ID | Area | Issue | Priority | Effort |
|---|---|---|---|---|
| B-01 | Backend | Blocking I/O (yfinance, OpenAI, Supabase) may stall the event loop | P0 | S |
| B-02 | Backend | `/api/analyze` trusts client-supplied `quote_data` | P0 | M |
| B-03 | Backend | Silent mock fallback can persist analyses of fake prices in production | P0 | S |
| B-04 | Backend | No rate limit or budget cap on the only paid endpoint | P0 | M |
| B-05 | Backend | Class-share tickers (`BRK.B`) don't match Yahoo's format (`BRK-B`), so they silently fall back to mock | P0 | S |
| B-06 | Backend | NaN/None values from yfinance can produce invalid JSON or division by zero | P0 | S |
| B-07 | Backend | Quote cache: no stampede protection, unbounded size | P1 | S |
| B-08 | Backend | OpenAI client: default timeout and retries, no token cap | P1 | S |
| B-09 | Backend | `(symbol, created_at)` index does not serve global "latest" queries | P1 | S |
| B-10 | Backend | SQLite pragmas, connection handling, timestamp format | P1 | S |
| B-11 | Backend | CORS preflight cost, cache headers, security headers | P1 | S |
| B-12 | Backend | Observability: request IDs, timing, bounded raw-response logs | P1 | S |
| B-13 | Backend | Optional analysis reuse to avoid duplicate LLM calls | P2 | M |
| B-14 | Backend | Structured Outputs (`json_schema`) as an opt-in stronger contract | P2 | S |
| F-01 | Frontend | Race conditions: stale quote/analysis responses overwrite newer state | P0 | S |
| F-02 | Frontend | `api.js`: no timeout, fragile error parsing (FastAPI 422 arrays) | P1 | S |
| F-03 | Frontend | Theme flash: theme is applied after the JS bundle loads | P1 | S |
| F-04 | Frontend | Extra history round-trip after each analysis | P1 | S |
| F-05 | Frontend | Re-renders and per-call `Intl.NumberFormat` construction | P1 | S |
| F-06 | Frontend | Health polling and clock timer keep running in hidden tabs | P2 | S |
| F-07 | Frontend | Font loading, paper-noise paint cost, reduced motion | P1 | S |
| F-08 | Frontend | i18n is mounted but never used (known gap) | P1 | M |
| F-09 | Frontend | Time display fixed to UTC with no label; market time is more meaningful | P2 | S |
| F-10 | Frontend | Accessibility: live regions, focus, keyboard history | P1 | S |
| F-11 | Frontend | Static hosting: cache headers, CSP, build-time env | P1 | S |
| X-01 | Both | Tests and CI | P1 | M |
| X-02 | Docs | Correct the index claim in ARCHITECTURE/PROJECT | P1 | XS |

---

## 3. Backend

### B-01 · Blocking I/O and the Event Loop (P0)

**Problem.** `yfinance`, the sync `openai` client, and `supabase-py` all block. In FastAPI:

- a route declared with **`def`** runs in a threadpool. Blocking is fine there.
- a route declared with **`async def`** that calls these libraries directly **blocks the whole event loop**. One slow LLM call (several seconds) then freezes `/api/health`, `/api/quote`, and every other request.

**Fix.** Pick one model and apply it to every route.

- **Option A (simplest, recommended):** declare all four routes as plain `def`. FastAPI runs them in its threadpool, which defaults to about 40 threads. That is plenty for this workload.
- **Option B:** keep `async def` and offload explicitly:

```python
from starlette.concurrency import run_in_threadpool

@app.get("/api/quote")
async def get_quote(symbol: str):
    sym = normalize_or_400(symbol)
    return await run_in_threadpool(fetch_quote, sym)
```

Do not mix `AsyncOpenAI` with the sync Supabase client in the same request path unless every call is offloaded. Partial async is the worst of both.

**Verify.** Start an analysis and, while it is running, `curl /api/health` in a loop. It must answer in milliseconds.

---

### B-02 · Don't Trust Client-Supplied `quote_data` (P0)

**Problem.** `/api/analyze` takes `quote_data` from the browser, checks only that `symbol` matches, then sends it to the LLM and persists it. Anyone can POST a made-up price (e.g. AAPL at $1) and get a "Bearish / High risk" analysis stored in history. Because there is no login, the history panel is effectively public.

**Fix (contract-preserving).** Treat the server-side quote as the source of truth. Keep accepting `quote_data` so the request shape doesn't change.

```python
@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    if req.symbol != req.quote_data.symbol:
        raise HTTPException(400, "symbol mismatch")

    server_quote = fetch_quote(req.symbol)   # cache hit within TTL, normally ~0 ms

    if not prices_agree(server_quote.price, req.quote_data.price, tolerance=0.02):
        # Client data is stale or fabricated. Ask the UI to refresh.
        raise HTTPException(409, "Quote changed, refresh before analyzing")

    result = analyze_quote(server_quote)
    row_id = insert_analysis(req.symbol, server_quote, result)
    return {"id": row_id, **result.model_dump()}
```

Notes:

- `409` is a new status code. Add it to API.md, and have the frontend handle it by re-fetching the quote (see F-02).
- If the user waited longer than the TTL, `fetch_quote` re-fetches. The 2% tolerance absorbs normal drift. Tune it, or drop the check and always analyze the server quote.
- What gets persisted is now always what the server observed. That makes history trustworthy.

---

### B-03 · Make Mock Fallback Explicit in Production (P0)

**Problem.** When yfinance fails, `fetch_quote` silently returns mock data. The UI badge says "Demo Data", but a user can still click Analyze. The LLM then comments on fake prices and the result is persisted next to real analyses.

**Fix.** Add a setting and enforce it in two places.

```python
# config.py
allow_mock_fallback: bool = True     # set False in production (render.yaml)
```

- In `quote.py`: if `provider == "yfinance"` and the fetch fails and `allow_mock_fallback` is false, raise. `main.py` maps that to the existing `502 quote unavailable`.
- In `/api/analyze`: if `server_quote.provider == "mock"` and the environment is production, refuse with `422`. Alternatively, allow it but make sure `provider` stays inside the persisted `quote_data` (it already is) so the history UI can badge it.

Explicit `STOCK_DATA_PROVIDER=mock` remains valid for local development and demos.

---

### B-04 · Rate Limiting and Spend Cap (P0)

**Problem.** `/api/analyze` is unauthenticated and every call costs money and writes a row. A script can drain the OpenAI budget and flood the table.

**Fix, in layers:**

1. **Per-IP limit on `/api/analyze`** (e.g. 10/min, 100/day). A simple in-memory sliding window is enough for a single instance:

```python
import time, threading
from collections import defaultdict, deque

_hits: dict[str, deque] = defaultdict(deque)
_rl_lock = threading.Lock()

def allow(ip: str, limit: int, window_s: int) -> bool:
    now = time.monotonic()
    with _rl_lock:
        q = _hits[ip]
        while q and q[0] <= now - window_s:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True
```

Return `429` with a `Retry-After` header. Behind Render's proxy, the client IP arrives in `X-Forwarded-For`. Run uvicorn with `--proxy-headers --forwarded-allow-ips="*"` so `request.client.host` is the real client. This is acceptable only because Render's proxy is the sole ingress.

2. **A lighter per-IP limit on `/api/quote`** (e.g. 60/min). This protects yfinance from getting your egress IP throttled.

3. **Global daily cap** (`ANALYZE_DAILY_CAP`, e.g. 500). Check it with a count of rows created in the last 24 hours, which survives restarts. B-09's index makes that query cheap.

4. **Provider-side hard limit.** Set a monthly spend limit in the OpenAI dashboard as the final backstop.

If you later run more than one instance or worker, move the counters to Redis or Postgres. In-memory counters are per-process.

---

### B-05 · Yahoo Symbol Mapping for Class Shares (P0)

**Problem.** The shared regex accepts `BRK.B`, which is the canonical display form. Yahoo Finance writes class shares with a dash: `BRK-B`. Passing `BRK.B` to `yf.Ticker` fails or returns nothing, and the current design then **silently falls back to mock**. The user sees deterministic fake data for a real ticker.

**Fix.** Map the symbol only at the provider boundary. Keep the canonical form everywhere else (cache key, DB, response).

```python
def _to_yahoo(symbol: str) -> str:
    return symbol.replace(".", "-")

def _fetch_yfinance(symbol: str) -> QuoteData:
    t = yf.Ticker(_to_yahoo(symbol))
    ...
    return QuoteData(symbol=symbol, ...)   # canonical symbol in the output
```

**Verify.** `curl '/api/quote?symbol=BRK.B'` must return `provider: "yfinance"`.

---

### B-06 · Sanitize Numeric Values from yfinance (P0)

**Problem.** `fast_info` can return `NaN`, `None`, or `0` (thin pre-market data, delisted tickers, partial responses). Possible effects:

- `change_percent = change / previous_close` raises `ZeroDivisionError` or yields `inf`.
- `NaN`/`inf` pass a plain `float` Pydantic field. Python's JSON encoder then emits the bare token `NaN`, which is **invalid JSON**, so `response.json()` in the browser throws.

**Fix.** Validate once, in one place.

```python
import math

def _num(v, *, allow_zero=True) -> float:
    if v is None:
        raise ValueError("missing")
    f = float(v)
    if not math.isfinite(f) or (not allow_zero and f == 0):
        raise ValueError("non-finite")
    return f

price = _num(fi.last_price, allow_zero=False)
prev  = _num(fi.previous_close, allow_zero=False)
change = price - prev
change_pct = change / prev * 100
```

Treat any `ValueError` here as a provider failure, which then goes through B-03's policy. Optionally, enforce finiteness in `QuoteData` itself with `Field(allow_inf_nan=False)` so no path can ever serialize `NaN`.

Also:

- **Read `fast_info` attributes once into locals.** `fast_info` is lazy, so repeated attribute access can trigger extra network calls.
- **`market_state`.** It is currently always `"REGULAR"` for yfinance, which is wrong outside market hours. Either derive it from NYSE hours (`America/New_York`, 09:30–16:00, weekdays) as `REGULAR` / `CLOSED`, or document that it means "live source". If you add values, update the frontend badge mapping in the same PR.

---

### B-07 · Quote Cache: Stampede Protection and Bounded Size (P1)

**Problems.**

- **Stampede.** Ten simultaneous requests for an uncached `TSLA` trigger ten yfinance calls.
- **Unbounded growth.** Every valid-looking symbol (`AAAAA`, `AAAAB`, …) adds an entry forever. That is a slow memory leak and a cheap abuse vector.
- **Clock.** If expiry uses `time.time()`, wall-clock jumps break TTLs. Use `time.monotonic()`.

**Fix.** Per-symbol single-flight plus an LRU cap.

```python
import threading, time
from collections import OrderedDict

_cache: "OrderedDict[str, tuple[float, QuoteData]]" = OrderedDict()
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()
MAX_ENTRIES = settings.quote_cache_max_entries  # e.g. 512

def _get_fresh(symbol):
    hit = _cache.get(symbol)
    if hit and hit[0] > time.monotonic():
        _cache.move_to_end(symbol)
        return hit[1]
    return None

def fetch_quote(symbol: str) -> QuoteData:
    with _guard:
        if (q := _get_fresh(symbol)):
            return q
        sym_lock = _locks.setdefault(symbol, threading.Lock())

    with sym_lock:                       # only one thread fetches per symbol
        with _guard:
            if (q := _get_fresh(symbol)):
                return q
        quote, ttl = _load(symbol)       # (QuoteData, seconds)
        with _guard:
            _cache[symbol] = (time.monotonic() + ttl, quote)
            _cache.move_to_end(symbol)
            while len(_cache) > MAX_ENTRIES:
                old, _ = _cache.popitem(last=False)
                _locks.pop(old, None)
    return quote
```

TTL policy inside `_load`:

| Result | TTL |
|---|---|
| Live yfinance quote | `QUOTE_CACHE_TTL` (30 s) |
| Mock produced by fallback | short (e.g. 5 s), so recovery is quick when yfinance comes back |
| Unknown symbol / no data | short negative cache (e.g. 60 s) to absorb repeated junk lookups |

The cache is per-process. Keep **one uvicorn worker** on Render unless you move the cache to Redis. For this workload, one worker plus threadpool routes (B-01) is enough.

---

### B-08 · LLM Client Tuning (P1)

**Problems.** The OpenAI Python SDK defaults to a 10-minute timeout and 2 retries. A hung upstream ties up a worker thread far longer than any user will wait. Creating a new client per request also wastes connection setup.

**Fix.**

```python
from functools import lru_cache
from openai import OpenAI

@lru_cache
def _client() -> OpenAI:
    s = get_settings()
    return OpenAI(
        api_key=s.openai_api_key,
        base_url=s.openai_base_url or None,   # OpenAI-compatible providers
        timeout=s.llm_timeout_seconds,        # e.g. 20
        max_retries=1,
    )

def analyze_quote(q: QuoteData) -> AnalysisResult:
    resp = _client().chat.completions.create(
        model=s.openai_model,                 # default gpt-4o-mini
        temperature=0.2,
        max_tokens=s.llm_max_tokens,          # e.g. 300; three short fields
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYSTEM_PROMPT},
                  {"role": "user", "content": render_user(q)}],
    )
    ...
```

Prompt and validation details:

- **`json_object` mode requires the word "JSON" in the messages.** Keep it in `SYSTEM_PROMPT` and add a comment so nobody removes it while "tidying" the prompt.
- **Keep the user message compact.** Send only the fields the model needs (symbol, price, change, change %, high, low, previous close, volume, provider). Fewer input tokens means lower latency and cost.
- **State the length budget in the prompt**, e.g. "summary: at most 60 words". The 500-char validation limit should almost never trigger. Do not truncate silently, because that changes content.
- **Normalize before validating.** Strip whitespace and title-case `sentiment` (`"bullish "` → `"Bullish"`). This saves valid-but-sloppy outputs without weakening the `Literal`. Do the same for `risk_level`. Consider narrowing it to `Literal["Low","Medium","High"]`. The schema currently allows any 1–50 chars, so history values can drift (`"Moderate"`, `"Medium-High"`).
- **Decide on extra keys.** Configure `AnalysisResult` with `extra="ignore"` (tolerant) or `extra="forbid"` (strict) on purpose, and add a test for it (X-01).
- **Bound the raw-response log.** Log at most ~2,000 characters plus the request ID (B-12). Never log the API key or full headers.
- **Check `finish_reason`.** If it is `"length"`, the JSON is probably truncated. Raise `AnalysisError` with a clear log message instead of a confusing parse error.

---

### B-09 · Fix the History Index (P1)

**Problem.** PROJECT.md says the `(symbol, created_at DESC)` index serves both "filter by ticker" and "global latest" queries. Only the first is true. A B-tree that leads with `symbol` can't deliver `ORDER BY created_at DESC LIMIT 20` across all symbols without scanning and sorting the table. At small row counts nobody notices. It becomes a full scan as history grows, and B-04's daily-count query needs the same access path.

**Fix.** Add a new migration. Never edit `0001_init.sql`.

```sql
-- supabase/migrations/0002_created_at_index.sql
create index if not exists stock_analyses_created_at_idx
  on public.stock_analyses (created_at desc);
```

Mirror it in `SQLITE_SCHEMA`:

```sql
CREATE INDEX IF NOT EXISTS stock_analyses_created_at_idx
  ON stock_analyses (created_at DESC);
```

Then correct the claim in ARCHITECTURE.md and PROJECT.md (X-02).

**Optional:** for history beyond 100 items, use keyset pagination on `(created_at, id)` (`?before=<created_at>&before_id=<id>`) instead of `OFFSET`.

---

### B-10 · SQLite and Supabase Adapter Details (P1)

**SQLite**

```python
def _connect():
    conn = sqlite3.connect(settings.sqlite_path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")      # readers don't block the writer
    conn.execute("PRAGMA synchronous=NORMAL")    # safe with WAL, fewer fsyncs
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

def list_history(symbol, limit):
    with closing(_connect()) as conn:            # `with conn:` commits but does NOT close
        ...
```

- **Timestamp format.** `created_at` is stored as an ISO string, and ordering is lexicographic. That is only correct if every row uses exactly the same format and timezone. Always write `datetime.now(timezone.utc).isoformat(timespec="microseconds")`. Never mix naive local times with UTC.
- **Select only the columns you need.**
- **Render's filesystem is ephemeral.** A SQLite file on Render is wiped on every deploy or restart unless you attach a persistent disk. Production should use Supabase, as already intended. State this in DEPLOYMENT.md.

**Supabase**

- Create the client **once** (`lru_cache`, like `_client()` in B-08). Creating it per request rebuilds the HTTP client each time.
- Keep the lazy import and the startup connectivity check. Make the check a cheap `select id ... limit 1`.
- Use explicit columns in `.select("id,symbol,quote_data,ai_summary,sentiment,risk_level,created_at")`, and `.order("created_at", desc=True).limit(limit)`.
- At startup, check that the key is a `service_role` key and refuse to boot if it is not. Supabase legacy keys are JWTs whose `role` claim can be decoded without verification. The newer secret keys have a distinguishable `sb_secret_` prefix. This turns "RLS silently blocks every insert" into a clear deploy-time error.

---

### B-11 · HTTP Layer: CORS, Caching, Headers (P1)

**CORS preflight.** `POST /api/analyze` with `Content-Type: application/json` triggers an `OPTIONS` preflight because the frontend and API are on different Render origins. Let browsers cache it:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,   # exact frontend origin(s), never "*"
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
    max_age=600,                               # cache preflight for 10 minutes
)
```

Browsers cap this value (Chromium caps it at 2 hours), so 600 is safe everywhere.

**Cache-Control** per route:

| Route | Header | Reason |
|---|---|---|
| `/api/health` | `no-store` | Must reflect the live state |
| `/api/quote` | `private, max-age=15` | Small browser-side dedup. Safe because the server already caches for 30 s |
| `/api/analyze` | `no-store` | Writes |
| `/api/history` | `no-store` | Changes after each analysis |

**Security headers.** Keep the existing three and add:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` on JSON responses. This needs an exception for `/docs`, which loads Swagger UI assets from a CDN. Either skip the header on `/docs` and `/redoc`, or disable them in production.
- Optionally disable `/docs` and `/openapi.json` in production with a setting (`docs_url=None if settings.env == "production" else "/docs"`).

**Error shape.** FastAPI returns `{"detail": ...}`. Add a machine-readable `code` field next to it (`"INVALID_SYMBOL"`, `"QUOTE_UNAVAILABLE"`, `"LLM_FAILED"`, `"RATE_LIMITED"`, `"QUOTE_STALE"`). This is additive, so it is contract-safe, and the frontend can localize messages by code (F-08).

**Compression.** Payloads are small, so `GZipMiddleware(minimum_size=1024)` only matters for `/api/history?limit=100`. It is optional.

---

### B-12 · Observability (P1)

Add one small middleware to `main.py`:

```python
import logging, time, uuid

log = logging.getLogger("stocksight")

@app.middleware("http")
async def request_context(request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = rid
    log.info("req id=%s %s %s -> %s %.0fms",
             rid, request.method, request.url.path, response.status_code, ms)
    return response
```

Also log:

- in `quote.py`: cache hit/miss, provider, and fallback reason.
- in `analyze.py`: model, latency, `usage.prompt_tokens` / `completion_tokens`, `finish_reason`, and validation outcome.

Do not log full request bodies, keys, or untruncated LLM output. Token usage in the logs gives you a cost dashboard for free with `grep`.

---

### B-13 · Optional: Reuse Recent Analyses (P2)

If the same symbol is analyzed again while the same cached quote is still current (same `fetched_at`), return the existing row instead of calling the LLM again. This saves cost on double-clicks and repeated demos.

- Lookup: `symbol = ? AND quote_data->>'fetched_at' = ?`, limited to 1 row (SQLite: `json_extract(quote_data, '$.fetched_at')`).
- Response shape is unchanged (`{id, summary, sentiment, risk_level}`). The `id` is the existing row's, so the history highlight still works.
- Make it a setting (`ANALYSIS_REUSE=true`). It changes the "every click produces a record" behavior, so document it in API.md.

The frontend should also disable the Analyze button while a request is in flight (F-01). That stops most duplicates at no cost.

---

### B-14 · Optional: Structured Outputs (P2)

`gpt-4o-mini` supports `response_format={"type": "json_schema", "json_schema": {..., "strict": true}}`, which enforces the exact schema at generation time. Many "OpenAI-compatible" providers don't support it, so:

- add `LLM_RESPONSE_FORMAT=json_object|json_schema` (default `json_object`).
- **keep all existing validation layers either way.** Structured Outputs is an additional defense, not a replacement (Invariant 4).

---

### B-15 · Runtime and Deployment Notes

- **Start command:**
  `uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
  Use one worker (see B-07).
- **Pin Python** on Render with `PYTHON_VERSION=3.12.x` in `render.yaml` so builds don't drift.
- **Cold starts.** Render free web services spin down after inactivity, and the first request afterwards can take tens of seconds. The frontend's health call on page load already acts as a warm-up. F-02's timeout and F-06's retry make the "waking up" state visible instead of looking broken.
- **Dependency hygiene.** Run `pip-audit -r requirements.txt` in CI. Update the yfinance pin regularly: Yahoo changes its endpoints often, and stale yfinance versions are the most common cause of "everything is mock".

---

## 4. Frontend

### F-01 · Eliminate Race Conditions (P0)

**Problems.**

1. The user searches `AAPL`, then quickly `TSLA`. If AAPL's response arrives last, the card shows AAPL while the input says TSLA.
2. The user clicks Analyze on AAPL, then searches TSLA. The AAPL analysis lands and renders under the TSLA quote card.
3. Double-clicking Analyze sends two paid requests.

**Fix.** Cancel superseded requests and guard every state write with the symbol it belongs to.

```jsx
const quoteCtrl = useRef(null);
const currentSymbol = useRef(null);

const handleSearch = useCallback(async (symbol) => {
  quoteCtrl.current?.abort();
  const ctrl = new AbortController();
  quoteCtrl.current = ctrl;
  currentSymbol.current = symbol;

  setLoading('quote');
  setAnalysis(null);              // never show an analysis from a different symbol
  setNotice(null);
  try {
    const q = await api.quote(symbol, { signal: ctrl.signal });
    setQuote(q);
  } catch (e) {
    if (e.name === 'AbortError') return;        // superseded, ignore silently
    setNotice(toNotice(e));
  } finally {
    if (quoteCtrl.current === ctrl) setLoading(null);
  }
}, []);

const handleAnalyze = useCallback(async () => {
  if (!quote || loading === 'analyze') return;  // double-click guard
  const symbol = quote.symbol;
  setLoading('analyze');
  try {
    const res = await api.analyze({ symbol, quote_data: quote });
    if (currentSymbol.current !== symbol) return; // user moved on; still persisted, appears in history
    setAnalysis(res);
    prependHistory(res, quote);                  // F-04
  } catch (e) {
    if (e.status === 409) return handleSearch(symbol); // quote stale (B-02)
    setNotice(toNotice(e));
  } finally {
    setLoading((l) => (l === 'analyze' ? null : l));
  }
}, [quote, loading, handleSearch]);
```

Don't abort an in-flight `/api/analyze` when the user switches tickers. The server will persist it anyway, and the result should still appear in history (F-04).

**Consider `useReducer`.** Once `quote`, `analysis`, `loading`, `notice`, and `activeId` change together, a reducer with explicit actions (`QUOTE_REQUESTED`, `QUOTE_RECEIVED`, `ANALYSIS_RECEIVED`, `HISTORY_SELECTED`, …) is easier to reason about than many separate `useState` calls. It still needs no state library.

---

### F-02 · Harden `api.js` (P1)

Goals: a timeout on every call, caller cancellation, tolerance of non-JSON bodies, and readable FastAPI errors (a `422` `detail` is an **array** of objects, not a string).

```js
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;   // 0 = network/timeout
    this.code = code;       // from backend B-11, may be undefined
  }
}

function messageFrom(data, status) {
  const d = data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x.msg).join('; ');
  return `Request failed (${status})`;
}

async function request(path, { method = 'GET', body, signal, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new DOMException('Timed out', 'TimeoutError')), timeout);
  const forward = () => ctrl.abort(signal.reason);
  signal?.addEventListener('abort', forward, { once: true });

  try {
    const res = await fetch(BASE + path, {
      method,
      signal: ctrl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON (proxy error page) */ }
    if (!res.ok) throw new ApiError(messageFrom(data, res.status), res.status, data?.code);
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e?.name === 'AbortError' && signal?.aborted) throw e;  // caller cancelled
    throw new ApiError(e?.name === 'TimeoutError' ? 'timeout' : 'network', 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
  }
}

export const api = {
  health:  (o) => request('/api/health', { timeout: 60000, ...o }), // tolerate cold start
  quote:   (symbol, o) => request(`/api/quote?symbol=${encodeURIComponent(symbol)}`, o),
  analyze: (payload, o) => request('/api/analyze', { method: 'POST', body: payload, timeout: 30000, ...o }),
  history: (params = {}, o) => request(`/api/history?${new URLSearchParams(params)}`, o),
};
```

Map statuses to user-facing notices in one place (`toNotice`):

| Status | Notice |
|---|---|
| `0` network / timeout | "Server unreachable or waking up, retry in a moment" |
| `400` | Invalid ticker (should be rare thanks to client validation) |
| `409` | Silent auto-refresh of the quote |
| `429` | "Too many requests, try again in N s" (read `Retry-After`) |
| `502` | Quote or AI unavailable, with a retry button |

---

### F-03 · Remove the Theme Flash (P1)

**Problem.** `main.jsx` decides the theme, but it only runs after the JS bundle has downloaded and parsed. Dark-mode users see a flash of the light paper background first.

**Fix.** Move detection into a tiny inline script in `index.html` `<head>`, which runs before first paint. Attach the class to `<html>`, because `<body>` doesn't exist yet when `<head>` scripts run. Tailwind's `darkMode: 'class'` works on any ancestor.

```html
<meta name="color-scheme" content="light dark">
<script>
  (function () {
    try {
      var t = localStorage.getItem('stocksight-theme');
      if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (t === 'dark') document.documentElement.classList.add('dark');
    } catch (e) {}
  })();
</script>
```

Then:

- remove the detection from `main.jsx`.
- in `App.jsx`, toggle `document.documentElement.classList` instead of `document.body`, and initialize `theme` state from `document.documentElement.classList.contains('dark')`.
- update §4.4 of PROJECT.md and FRONTEND.md (the class now lives on `<html>`).
- if you add a CSP (F-11), allow this script via its `sha256-…` hash.

---

### F-04 · Update History Locally After Analysis (P1)

**Problem.** If the frontend calls `GET /api/history` after every successful analysis, that is an extra round-trip, and the panel briefly lags.

**Fix.** The analyze response already contains `id`, and the frontend holds the quote. Build the new row locally:

```js
const prependHistory = (res, quote) => {
  setHistory((h) => [
    {
      id: res.id,
      symbol: quote.symbol,
      quote_data: quote,
      ai_summary: res.summary,
      sentiment: res.sentiment,
      risk_level: res.risk_level,
      created_at: new Date().toISOString(),   // server value replaces it on next full refresh
    },
    ...h.filter((x) => x.id !== res.id),       // also dedups with B-13 reuse
  ].slice(0, HISTORY_LIMIT));
  setActiveId(res.id);
};
```

- The object shape must match `HistoryItem` in `schemas.py`. Copy the exact field names.
- Optionally, add `created_at` to the analyze response (an additive field) so the local row is exact.
- Do a full refresh only on load, on tab re-focus after more than 5 minutes, and on manual retry.

---

### F-05 · Rendering Efficiency (P1)

The app is small, so these are hygiene fixes rather than emergencies. They keep typing and theme toggling smooth on low-end phones.

- **Keep input state local to `SearchBar`.** Typing must not re-render `App`. `App` should only learn the symbol on submit.
- **Stable callbacks.** Wrap `handleSearch`, `handleAnalyze`, `handleSelectHistory`, and `toggleTheme` in `useCallback`, and wrap `QuoteCard`, `AnalysisCard`, `HistoryPanel`, and history rows in `React.memo`.
- **Stable keys.** Use `item.id` as the key for history rows, never the array index.
- **Hoist formatters.** Constructing `Intl.NumberFormat` and `Intl.DateTimeFormat` is comparatively expensive. Create them once at module level, or once per locale when i18n lands (F-08):

```js
const cache = new Map();
const fmt = (locale, key, opts) => {
  const k = `${locale}|${key}`;
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(locale, opts));
  return cache.get(k);
};
export const formatPrice = (v, locale = 'en-US') =>
  fmt(locale, 'price', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);
export const formatVolume = (v, locale = 'en-US') =>
  fmt(locale, 'vol', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
```

- **Guard formatters against bad values.** Return `'—'` for `null`, `undefined`, or `NaN` so a partial quote can never render "NaN%".

---

### F-06 · Timers in Hidden Tabs (P2)

- **Masthead clock.** It refreshes every minute. Align the first tick to the next minute boundary (`setTimeout(…, 60000 - Date.now() % 60000)`, then `setInterval`) so the date flips on time, and clear both on unmount.
- **Health polling** (if it repeats). Pause on `document.visibilityState === 'hidden'`, ping once on `visibilitychange` back to visible, and back off exponentially on failure (5 s → 10 s → 30 s → 60 s). On first load, treat a slow health response as "waking up" rather than "down" (see B-15).

---

### F-07 · Fonts, Paint Cost, Motion (P1)

**Fonts (CDN).**

- Add `<link rel="preconnect">` for the font CSS host and the font file host (with `crossorigin` on the file host).
- Request only the weights and styles you actually use, with `display=swap`.
- Better option: self-host with `@fontsource/*` packages. This removes a third-party request, makes the CSP simpler (F-11), avoids leaking visitor IPs to the font CDN, and lets Vite fingerprint and cache the files.
- Preload the single font used for the large price (`<link rel="preload" as="font" type="font/woff2" crossorigin>`). It sits in the Largest Contentful Paint element.

**Paper noise layer.**

- If it is a live SVG `feTurbulence` filter on a full-viewport element, every repaint recomputes it. Replace it with a small tiled pre-rendered PNG or WebP (or a data-URI) used as a `background-image`.
- Avoid `background-attachment: fixed`. It forces a repaint on scroll in many mobile browsers. Use a `position: fixed; inset: 0; pointer-events: none;` pseudo-element instead.

**Animations.**

- Animate only `transform` and `opacity`.
- Respect user settings:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### F-08 · Close the i18n Gap (P1)

This is the known gap from FRONTEND.md: the `dict` and `I18nProvider` exist, but no component uses them.

1. Replace hardcoded copy component by component (`Masthead` → `SearchBar` → `QuoteCard` → `AnalysisCard` → `HistoryPanel`) with `const { t, lang } = useI18n();`.
2. Add the language toggle next to the theme toggle in `Masthead`. It already persists to `stocksight-lang` and syncs `<html lang>`.
3. Pass `lang` into the `format.js` functions (F-05) so numbers and dates are localized: `zh-CN` vs `en-US`.
4. Localize error notices by **`ApiError.code`** (B-11), not by backend English text.
5. **Out of scope unless decided explicitly:** LLM output language. Summaries stay in whatever language the prompt produces. If you want Chinese summaries, that is a prompt-contract change: pass `lang` in the request (additive), update PROMPT.md, and re-verify validation (Invariant 3).
6. Add a dev-only check that warns on missing keys in either language, so the dictionaries can't drift.

---

### F-09 · Time Display (P2)

`formatTime` is fixed to UTC, but nothing tells the user that. For a US-equities tool, market time is more meaningful:

- show quote and analysis timestamps in `America/New_York` with an explicit label (e.g. "14:32 ET"), and the full local time in a `title` tooltip; **or**
- keep UTC but always print the "UTC" suffix.

Pick one and use it everywhere: `QuoteCard`, `AnalysisCard`, and `HistoryPanel`.

---

### F-10 · Accessibility (P1)

- **Live regions.** Wrap loading and notice messages in `role="status" aria-live="polite"`, and errors in `role="alert"`, so screen readers announce "Analyzing…" and "Quote unavailable".
- **Focus.** After an analysis arrives, move focus to the `AnalysisCard` heading (`tabIndex={-1}` + `ref.focus()`). Return focus to the input after an error.
- **`/` shortcut.** Ignore it when `e.target` is an `input`, `textarea`, or `contenteditable` element, or when a modifier key is held. Show the hint visually and in `aria-keyshortcuts="/"`.
- **History rows** must be `<button>` elements (or have `role="button"`, `tabIndex=0`, and Enter/Space handlers), with `aria-current="true"` on the active item.
- **Contrast.** Check `oxblood`, `forest`, and `gold` text on `paper`, and their dark-mode counterparts, against WCAG AA (4.5:1 for body text). Gold on off-white is the usual failure.
- Sentiment already uses color plus a symbol plus text. Keep it that way.

---

### F-11 · Static Hosting: Caching, CSP, Env (P1)

**Cache headers.** Vite fingerprints everything under `/assets/`, so those files can be cached forever. `index.html` must always be revalidated. Add to the static-site service in `render.yaml` (adapt to the existing file):

```yaml
    headers:
      - path: /assets/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
      - path: /index.html
        name: Cache-Control
        value: no-cache
      - path: /*
        name: X-Content-Type-Options
        value: nosniff
      - path: /*
        name: Referrer-Policy
        value: no-referrer
      - path: /*
        name: Content-Security-Policy
        value: >-
          default-src 'self';
          script-src 'self' 'sha256-<hash-of-theme-script>';
          style-src 'self' <font-css-host-if-CDN>;
          font-src 'self' <font-file-host-if-CDN>;
          img-src 'self' data:;
          connect-src 'self' https://<backend>.onrender.com;
          frame-ancestors 'none';
          base-uri 'none';
          form-action 'none'
```

- `img-src data:` is needed for the data-URI favicon.
- React's `style={{…}}` props are applied through the CSSOM and are not blocked by `style-src`.
- Self-hosting fonts (F-07) lets you drop the CDN hosts entirely.

**Build-time env.** `VITE_API_BASE` is baked into the bundle at build time. Changing the backend URL requires a **rebuild**, not just a restart. Call this out in CONFIGURATION.md and TROUBLESHOOTING.md. It is the most common reason for "the frontend still calls the old backend".

**Bundle budget.** React 18 + ReactDOM is roughly 45 KB gzipped. The whole app should stay under about 80 KB gzipped JS. Check with `npx vite-bundle-visualizer` and confirm Tailwind's `content` globs cover `index.html` and `src/**/*.{js,jsx}` so unused CSS is purged.

---

## 5. New Configuration Summary

Add these to `backend/.env.example` and CONFIGURATION.md with comments. Existing variables are unchanged.

| Variable | Default | Production | Item |
|---|---|---|---|
| `ALLOW_MOCK_FALLBACK` | `true` | `false` | B-03 |
| `QUOTE_CACHE_MAX_ENTRIES` | `512` | `512` | B-07 |
| `LLM_TIMEOUT_SECONDS` | `20` | `20` | B-08 |
| `LLM_MAX_TOKENS` | `300` | `300` | B-08 |
| `LLM_RESPONSE_FORMAT` | `json_object` | per provider | B-14 |
| `RATE_LIMIT_ANALYZE_PER_MIN` | `10` | `5–10` | B-04 |
| `RATE_LIMIT_QUOTE_PER_MIN` | `60` | `60` | B-04 |
| `ANALYZE_DAILY_CAP` | `0` (off) | e.g. `500` | B-04 |
| `ANALYSIS_REUSE` | `false` | optional | B-13 |
| `ENABLE_API_DOCS` | `true` | `false` | B-11 |

The frontend adds nothing new. `VITE_API_BASE` stays the only variable.

---

## 6. X-01 · Tests and CI

The tree has no tests today. A small suite protects the contracts every optimization above touches.

**Backend (`backend/tests/`, pytest + FastAPI `TestClient`, run from `backend/`):**

- Run with `STOCK_DATA_PROVIDER=mock`, `STORAGE_BACKEND=sqlite`, and a temporary DB path.
- `normalize_symbol`: accepts `aapl`, `BRK.B`, ` msft `; rejects `TOOLONG`, `A.BCD`, `123`, the empty string.
- Mock determinism: same symbol gives the same quote. The `provider` and `market_state` values are correct.
- Two-call invariant: `/api/quote` leaves the table row count unchanged, and `/api/analyze` adds exactly one row.
- LLM contract: monkeypatch `_client()` with a fake that returns each of the following, and assert `502` with **no row written**:
  - text wrapped in a code fence (```` ```json {…} ``` ````)
  - a missing `risk_level`
  - `sentiment: "Very Bullish"`
  - a 600-character summary
  - an empty string
  - `finish_reason="length"`
- Normalization: `sentiment: " bullish"` is accepted as `Bullish` (B-08).
- B-02: a mismatched price gives `409`. B-05: `_to_yahoo("BRK.B") == "BRK-B"`. B-06: NaN or zero `previous_close` is treated as a provider failure.
- Rate limit: the (N+1)th analyze request returns `429` with `Retry-After`.
- Cache: concurrent calls for one uncached symbol call the loader once (B-07).

**Frontend (Vitest, no DOM required):**

- `validate.js`: same cases as the backend. Ideally both read one shared JSON fixture so the regexes can't drift (Invariant 5).
- `format.js`: null/NaN gives `'—'`, plus locale output and compact volume.
- `api.js`: timeout produces `ApiError(status 0)`, a 422 array `detail` is flattened, a non-JSON 502 body is handled.

**CI (GitHub Actions, on every PR):**

```yaml
jobs:
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt pytest ruff pip-audit
      - run: ruff check .
      - run: pytest -q
      - run: pip-audit -r requirements.txt
  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npx vitest run
      - run: npm run build
```

---

## 7. X-02 · Documentation Corrections

| Document | Change |
|---|---|
| PROJECT.md §3.5, ARCHITECTURE.md | The `(symbol, created_at DESC)` index serves per-ticker queries only. Add `created_at DESC` for global history (B-09) |
| PROJECT.md §4.4, FRONTEND.md | The theme class moves from `<body>` to `<html>`, applied by an inline script (F-03) |
| API.md | New statuses `409` and `429`, the additive `code` field, `Retry-After`, and the analyze reuse behavior if enabled |
| PROMPT.md | Note that "JSON" must appear in the prompt, the sentiment/risk normalization step, and the `finish_reason` check |
| CONFIGURATION.md | §5 table. `VITE_API_BASE` requires a rebuild |
| DEPLOYMENT.md | The `0002` migration, `ALLOW_MOCK_FALLBACK=false`, proxy-headers start command, `PYTHON_VERSION`, ephemeral SQLite on Render |
| SECURITY.md | Rate limiting, spend cap, server-side quote authority, CSP on both services, `service_role` key check |
| TROUBLESHOOTING.md | "Everything shows Demo Data" → check the yfinance version, the class-share mapping, and egress throttling. "First request is very slow" → cold start |
| FRONTEND.md gap list | Close items as F-08 lands |

---

## 8. Rollout Plan

Each phase is independently deployable and reversible.

**Phase 1: Safety (P0)**
B-01, B-05, B-06, B-03, F-01, then B-02 (with the frontend's 409 handling in the same PR), then B-04. Deploy with `ALLOW_MOCK_FALLBACK=false` and a provider-side spend limit.

**Phase 2: Speed and reliability (P1)**
B-07, B-08, B-09 (run the migration first), B-10, B-11, B-12. Frontend: F-02, F-03, F-04, F-05, F-07, F-11. Add X-01 tests in this phase, before further refactors.

**Phase 3: Completeness (P1/P2)**
F-08 (i18n), F-10, F-09, F-06, then optional B-13 and B-14. Finish the X-02 doc pass.

---

## 9. Verification Checklist

**Correctness**
- [ ] `curl '/api/quote?symbol=BRK.B'` returns `provider: "yfinance"`
- [ ] A POST to `/api/analyze` with a fabricated price returns `409` and writes no row
- [ ] With yfinance blocked and `ALLOW_MOCK_FALLBACK=false`, `/api/quote` returns `502`, not mock data
- [ ] No response body ever contains a bare `NaN` or `Infinity`
- [ ] Fast ticker switching never shows a mismatched quote or analysis

**Performance**
- [ ] `/api/health` stays fast while an analysis is running
- [ ] Cached `/api/quote` p50 is under 20 ms server time. 20 concurrent uncached requests for one symbol trigger one upstream fetch
- [ ] `/api/analyze` p95 is under about 6 s, and token usage appears in the logs
- [ ] A second POST within 10 minutes sends no `OPTIONS` preflight (DevTools → Network)
- [ ] No theme flash on a hard reload in dark mode
- [ ] Repeat visit: `/assets/*` is served from the browser cache. JS is under 80 KB gzipped. Lighthouse Performance and Accessibility are at least 90

**Abuse and cost**
- [ ] The 11th analyze request within a minute from one IP returns `429` with `Retry-After`
- [ ] The daily cap blocks new analyses once reached, and existing history still loads
- [ ] A provider-side spend limit is configured

**Contracts**
- [ ] Every malformed-LLM-output test returns `502` with zero rows written
- [ ] The DB `CHECK` constraint on `sentiment` is still present (`\d stock_analyses`)
- [ ] The frontend and backend ticker test fixtures pass identically
- [ ] No secret appears in the built bundle (`grep -r "sk-\|service_role\|sb_secret" frontend/dist` finds nothing)
