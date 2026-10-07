# StockSight requirements

This document records the requirements of the current MVP. It separates shipped behavior from hardening work so the product specification is not mistaken for an implementation guarantee.

## Runtime and dependency baseline

| Area | Requirement |
|---|---|
| Backend runtime | Python 3.12 (Render pins 3.12.3) |
| Frontend runtime | Node.js 20 and npm 10+ (Render pins Node 20.18.0) |
| Backend packages | Exact versions in `backend/requirements.txt` |
| Frontend packages | Resolved by `frontend/package-lock.json`; use `npm ci` for reproducible installs |
| Browser | A current evergreen browser with JavaScript enabled |

The current Vite 5 / Tailwind 3 line is intentional. Moving to newer major versions requires a separate Node/runtime and configuration migration.

## External services

| Service | When required | Requirement |
|---|---|---|
| OpenAI-compatible Chat Completions API | AI analysis | API key, model id, and an endpoint that supports `response_format={"type":"json_object"}` |
| Yahoo Finance through `yfinance` | Default quote source | Network access; the backend falls back to deterministic mock data when Yahoo is unavailable |
| Supabase | Production persistence | Project URL, `service_role` key, and all ordered files under `supabase/migrations/` applied |
| Render | Hosted deployment | One Python web service and one static frontend service, as defined in `render.yaml` |

## Implemented functional requirements

- Accept US ticker-like symbols matching `^[A-Z]{1,5}(\.[A-Z]{1,2})?$`.
- Return a normalized latest-available quote with price, change, day range, volume, timestamp, market state, and provider provenance.
- Cache quotes in memory for a configurable TTL (30 seconds by default).
- Bound Yahoo Finance calls with a configurable timeout and provider worker pool.
- Fall back to deterministic mock quotes when Yahoo Finance fails, and label that source in both the API and UI.
- Request structured AI output with `summary`, `sentiment`, and `risk_level` fields.
- Parse and validate AI output before persistence. Invalid responses must not be written.
- Persist only successful analyses, using SQLite locally or Supabase in production.
- List recent analysis history, optionally filtered by symbol.
- Keep quote-provider, LLM, and Supabase credentials on the backend.
- Apply a CORS allowlist, basic security headers, Supabase RLS, and a database sentiment check.
- Enforce bounded request bodies, per-client analysis rate limits, finite model-call timeouts, and bounded analysis concurrency.
- Enforce a configurable per-process daily analysis budget.
- Re-fetch the quote server-side before analysis and reject unknown request/model fields.
- Display quote source/time and an AI/not-financial-advice disclaimer in the UI.

## Current API requirements

| Endpoint | Requirement |
|---|---|
| `GET /api/health` | Return a shallow process health response |
| `GET /api/quote?symbol=AAPL` | Validate the symbol and return normalized quote data |
| `POST /api/analyze` | Validate request shape, call the model, persist a valid result, and return its id |
| `GET /api/history?symbol=AAPL&limit=20` | Return 1–100 recent records, newest first |

## Partially implemented requirements

- `/api/analyze` still accepts a quote payload for API compatibility, but re-fetches the canonical quote before model use and persistence.
- `sentiment` and `risk_level` are constrained to their documented enums; unknown model/request fields are rejected.
- Supabase blocks direct anonymous access with RLS, but the backend history endpoint itself is public and not user-scoped.
- Quote text fields and timestamps are bounded and validated before model use.

## Required hardening before a public or multi-user release

- Add authentication and user-scoped history, or explicitly retain a public shared archive.
- Move rate limiting and the daily model budget to shared storage when scaling beyond one worker, and retain the provider account hard limit.
- Add frontend linting and secret scanning to CI (dependency audits now run in CI).
- Define log retention/redaction policy for raw malformed model responses.
- Verify and publish the production URL; the hostnames in `render.yaml` are deployment defaults, not proof that a service is live.

See [`PRD.md`](PRD.md) for the original product brief. Setup, API, and deployment instructions are maintained in the dedicated documents under this directory and linked from [`../README.md`](../README.md).
