# Repository Guidelines

## Project Structure & Module Organization

- `backend/` contains the FastAPI service. Keep API routes in `main.py`, provider/storage integrations in `quote.py` and `db.py`, configuration in `config.py`, and models in `schemas.py`.
- `frontend/` is a React 18 + Vite application. Reusable UI belongs in `src/components/`; API calls live in `src/api.js`; small pure helpers belong in `src/utils/`.
- `supabase/migrations/` contains database schema migrations. Do not edit an applied migration; add a new, ordered SQL file for schema changes.
- `docs/` holds API, architecture, configuration, deployment, security, and troubleshooting documentation. Root-level files describe contribution and security procedures.

## Build, Test, and Development Commands

Run backend commands from `backend/` (settings load `.env` from the current directory):

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

Run the frontend from `frontend/`:

```bash
npm ci                 # install the locked dependency set
npm run dev            # start the Vite development server
npm run build          # create a production bundle
```

For backend smoke checks, use `curl http://localhost:8000/api/health` and `curl 'http://localhost:8000/api/quote?symbol=AAPL'`.

## Coding Style & Naming Conventions

Use four-space indentation and `snake_case` for Python modules, functions, and variables. Use `PascalCase` for React components and `camelCase` for JavaScript helpers and props. Match existing Tailwind utility styling and document any new formatter or linter.

## Testing Guidelines

Install backend development dependencies with `pip install -r requirements-dev.txt`, then run `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest -q` and `ruff check .`. Run `npm run lint` and `npm run build` for frontend changes. Place backend tests under `backend/tests/` and frontend tests near the covered module or in `frontend/src/**/__tests__/`; use names such as `test_quote_fallback` or `SearchBar.test.jsx`.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects with an optional scope, following existing history (for example, `docs: refresh requirements` or `chore(render): tighten blueprint`). Keep commits and pull requests focused. PR descriptions should explain the user-visible problem and solution, list verification commands, call out configuration/schema/migration changes and known limitations, and include screenshots or a short recording for UI changes. Never commit `.env` files, credentials, or generated databases.

## Security & Configuration

Keep OpenAI-compatible API keys, quote-provider credentials, and Supabase service keys server-side in environment variables. Preserve validation at API and persistence boundaries, and update the relevant `docs/` page whenever endpoints, environment variables, prompt contracts, or deployment behavior changes.
