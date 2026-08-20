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
| Supabase | Production persistence | Project URL, `service_role` key, and the applied `supabase/migrations/0001_init.sql` migration |
| Render | Hosted deployment | One Python web service and one static frontend service, as defined in `render.yaml` |

## Implemented functional requirements

- Accept US ticker-like symbols matching `^[A-Z]{1,5}(\.[A-Z]{1,2})?$`.
- Return a normalized latest-available quote with price, change, day range, volume, timestamp, market state, and provider provenance.
- Cache quotes in memory for a configurable TTL (30 seconds by default).
- Fall back to deterministic mock quotes when Yahoo Finance fails, and label that source in both the API and UI.
- Request structured AI output with `summary`, `sentiment`, and `risk_level` fields.
- Parse and validate AI output before persistence. Invalid responses must not be written.
- Persist only successful analyses, using SQLite locally or Supabase in production.
- List recent analysis history, optionally filtered by symbol.
- Keep quote-provider, LLM, and Supabase credentials on the backend.
- Apply a CORS allowlist, basic security headers, Supabase RLS, and a database sentiment check.
- Display quote source/time and an AI/not-financial-advice disclaimer in the UI.

## Current API requirements

| Endpoint | Requirement |
|---|---|
| `GET /api/health` | Return a shallow process health response |
| `GET /api/quote?symbol=AAPL` | Validate the symbol and return normalized quote data |
| `POST /api/analyze` | Validate request shape, call the model, persist a valid result, and return its id |
| `GET /api/history?symbol=AAPL&limit=20` | Return 1–100 recent records, newest first |

## Partially implemented requirements

- The prompt asks for exactly three JSON keys, but the current Pydantic model ignores unknown extra keys rather than rejecting them.
- `sentiment` is constrained to `Bullish`, `Neutral`, or `Bearish`; `risk_level` is currently any non-empty string up to 50 characters.
- `/api/analyze` validates the shape of client-supplied quote data, but it does not re-fetch or cryptographically verify that quote.
- Supabase blocks direct anonymous access with RLS, but the backend history endpoint itself is public and not user-scoped.
- Field-level prompt construction is implemented, but quote text fields do not yet have strict length/character filters.

## Required hardening before a public or multi-user release

- Add authentication and user-scoped history, or explicitly retain a public shared archive.
- Add per-IP/user rate limiting and a model-provider spending limit for `/api/analyze`.
- Add request-body limits and stronger numeric/text constraints on `QuoteData`.
- Re-fetch quotes server-side or issue signed quote identifiers before analysis.
- Reject unexpected model-output keys and constrain risk levels if the three-value contract is mandatory.
- Add automated backend/frontend tests, linting, CI, dependency vulnerability scans, and secret scanning.
- Define log retention/redaction policy for raw malformed model responses.
- Verify and publish the production URL; the hostnames in `render.yaml` are deployment defaults, not proof that a service is live.

See `PRD.md` for the original product brief and `README.md` for setup, API, and deployment instructions.
