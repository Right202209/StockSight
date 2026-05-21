# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The repository is currently empty. The product (StockSight AI) is specified in a PRD passed via `/init`; no code, package manifests, or build tooling exist yet. Implementation choices below are constraints from the PRD, not observations from existing code. When the first commits land, update this file with concrete commands (install, run, test, lint) and replace the "intended stack" notes with what was actually built.

## Product

A minimal full-stack web app where a user enters a US stock symbol, fetches a real-time quote, then triggers an LLM analysis that returns a strict JSON object (summary / sentiment / risk_level). Both the raw quote and the analysis are persisted to Supabase. Hosted on Render.

## Intended stack

- Frontend: React (Vite) + Tailwind
- Backend: FastAPI (Python) or Express (Node) — pick one; the LLM and quote API calls all happen server-side, never from the browser
- LLM: OpenAI `gpt-4o-mini` with `response_format={"type": "json_object"}`
- Quote data: Alpha Vantage or Twelve Data free tier; fall back to `yfinance` (Python) if rate limits bite
- DB: Supabase (Postgres)
- Deploy: Render Web Service from GitHub

## Architecture: the two-call flow

The frontend never talks to the LLM or the quote provider directly. The flow is strictly:

1. `GET /api/quote?symbol=AAPL` → backend hits the quote API, returns the raw quote JSON to the frontend for display.
2. `POST /api/analyze` with `{symbol, quote_data}` → backend formats the quote into the user-message template, calls the LLM, validates the JSON response, **persists `{symbol, quote_data, ai_summary, sentiment, risk_level}` to `stock_analyses`**, and returns the analysis to the frontend.

The persistence step happens on `/api/analyze`, not on `/api/quote` — only analyzed quotes get stored. Don't move the write into the quote endpoint.

## LLM output contract (load-bearing)

The analyze endpoint depends on a strict JSON contract from the LLM. Two independent safeguards must both stay in place:

1. **System prompt** instructs the model to output only valid JSON with exactly three keys: `summary` (string), `sentiment` (one of `"Bullish" | "Neutral" | "Bearish"`), `risk_level` (string, e.g. `"Low" | "Medium" | "High"`). No markdown fences, no prose.
2. **API parameter** `response_format={"type": "json_object"}` as a second line of defense.

After the call, the backend MUST:
- `json.loads()` the response inside a try/except,
- assert the required key set is a subset of the parsed keys,
- assert `sentiment ∈ {"Bullish","Neutral","Bearish"}`,
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
