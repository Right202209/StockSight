# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The MVP is implemented. The repository contains a FastAPI backend, a React/Vite/Tailwind frontend, SQLite and Supabase storage adapters, a Supabase migration, and a two-service Render Blueprint. There are currently no automated test or lint commands.

## Product

A minimal full-stack web app where a user enters a US stock symbol, fetches the latest available quote, then triggers an LLM analysis that returns a structured object (summary / sentiment / risk_level). Successful analyses are persisted to SQLite locally or Supabase in production. A Render Blueprint is included for hosting.

## Implemented stack

- Frontend: React 18 + Vite 5 + Tailwind 3
- Backend: FastAPI on Python 3.12; the LLM and quote-provider calls stay server-side
- LLM: OpenAI-compatible Chat Completions, defaulting to `gpt-4o-mini`, with `response_format={"type": "json_object"}`
- Quote data: `yfinance`, with a deterministic mock fallback and a short in-memory cache
- DB: SQLite locally or Supabase (Postgres) in production via `STORAGE_BACKEND`
- Deploy: Render Blueprint with a Python web service and static frontend

## Commands

- Backend install/run: `cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn main:app --reload --port 8000`
- Frontend install/run: `cd frontend && npm ci && npm run dev`
- Frontend production build: `cd frontend && npm run build`

Run backend commands from `backend/`; settings load `.env` relative to the current working directory.

## Architecture: the two-call flow

The frontend never talks to the LLM or the quote provider directly. The flow is strictly:

1. `GET /api/quote?symbol=AAPL` → backend hits `yfinance` (with deterministic mock fallback), returns normalized quote JSON to the frontend for display.
2. `POST /api/analyze` with `{symbol, quote_data}` → backend formats the quote into the user-message template, calls the LLM, validates the JSON response, **persists `{symbol, quote_data, ai_summary, sentiment, risk_level}` to `stock_analyses`**, and returns the analysis to the frontend.

The persistence step happens on `/api/analyze`, not on `/api/quote` — only analyzed quotes get stored. Don't move the write into the quote endpoint.

## LLM output contract (load-bearing)

The analyze endpoint depends on a structured JSON contract from the LLM. Two independent safeguards must both stay in place:

1. **System prompt** instructs the model to output only valid JSON with exactly three keys: `summary` (string), `sentiment` (one of `"Bullish" | "Neutral" | "Bearish"`), `risk_level` (string, e.g. `"Low" | "Medium" | "High"`). No markdown fences, no prose.
2. **API parameter** `response_format={"type": "json_object"}` as a second line of defense.

After the call, the backend MUST:
- `json.loads()` the response inside a try/except,
- validate the required fields with `AnalysisResult.model_validate`,
- enforce `sentiment ∈ {"Bullish","Neutral","Bearish"}`,
- on failure, log the raw response (for debugging) and return a friendly error — do NOT persist a malformed analysis.

Use `temperature=0.2` to keep formatting stable. If you change the prompt, the schema, or the temperature, re-verify the validation still catches malformed outputs.

## Database schema

Table `stock_analyses`:

| column | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `symbol` | text | |
| `quote_data` | jsonb | raw provider payload |
| `ai_summary` | text | from LLM `summary` field |
| `sentiment` | text | CHECK constraint: `'Bullish' \| 'Neutral' \| 'Bearish'` |
| `risk_level` | text | |
| `created_at` | timestamp | default `now()` |

The DB-level CHECK on `sentiment` is intentional — it's the third line of defense behind the prompt and the validation code. Keep it.

## Secrets and config

Quote-API key, OpenAI key, and Supabase URL/service key all live in environment variables (Render env vars in production, `.env` locally — git-ignored). Never inline them, never ship them to the frontend bundle. The Supabase service key in particular must stay server-side.

## README deliverable

The PRD requires the final `README.md` to include: (1) the live Render URL, (2) the system prompt + user-message template (code or screenshot), and (3) a debug-log entry showing a real issue encountered during build/deploy and how it was resolved. Treat these as shipping requirements, not nice-to-haves.
