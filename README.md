# StockSight AI

An editorial dashboard for the latest available US equity quotes and concise, structured AI commentary.

> MVP for information only. Quotes may be delayed, Yahoo Finance may be unavailable, and AI output may be wrong. This is not financial advice.

## What It Does

Enter a ticker such as `AAPL` to fetch a quote, then run an AI analysis. Successful analyses are stored and shown in the recent-history panel.

| Layer | Stack |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3 |
| Backend | FastAPI, Python 3.12 |
| Quotes | `yfinance` with deterministic mock fallback |
| AI | OpenAI-compatible Chat Completions API |
| Storage | SQLite locally, Supabase in production |
| Deployment | Render Blueprint |

## Quick Start

Requirements: Python 3.12, Node.js 20, npm 10+, and an OpenAI-compatible API key for AI analysis.

```bash
# Terminal 1: backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Set OPENAI_API_KEY in backend/.env
.venv/bin/uvicorn main:app --reload --port 8000

# Terminal 2: frontend
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. For an offline quote demo, set `STOCK_DATA_PROVIDER=mock`; AI analysis still requires a reachable model endpoint and key.

Useful local checks:

```bash
curl http://localhost:8000/api/health
curl 'http://localhost:8000/api/quote?symbol=AAPL'
```

## Documentation

- [Documentation index](docs/README.md)
- [简体中文说明](docs/README.zh-CN.md)
- [API reference](docs/API.md)
- [Configuration](docs/CONFIGURATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Prompt contract](docs/PROMPT.md)
- [Render and Supabase deployment](docs/DEPLOYMENT.md)
- [Security and limitations](docs/SECURITY.md)
- [Troubleshooting and debug log](docs/TROUBLESHOOTING.md)
- [Product requirements](docs/PRD.md)
- [Implementation requirements](docs/REQUIREMENTS.md)

## Current Scope

The MVP intentionally does not provide authentication, user-scoped history, rate limiting, request-size limits, server-side quote revalidation, automated tests, linting, or CI. Review [Security and limitations](docs/SECURITY.md) before any public multi-user deployment.

There is no verified production URL in the repository yet. `render.yaml` contains the deployment blueprint and default service names.

## License

No license has been selected for this repository yet.
