# Deployment

The repository includes [`render.yaml`](../render.yaml), defining one FastAPI web service and one Vite static site.

## Supabase

1. Create a Supabase project.
2. Run [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) in the SQL editor.
3. Keep Row Level Security enabled. The backend uses the `service_role` key server-side.
4. Record the project URL and service key for Render environment variables.

## Render Blueprint

1. Push the repository to GitHub and choose **New -> Blueprint** in Render.
2. Apply the Blueprint from `render.yaml`.
3. Supply `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_KEY` when prompted.
4. Confirm the generated frontend origin is exactly listed in backend `CORS_ORIGINS`.
5. Confirm `VITE_API_BASE` points to the generated backend origin.
6. Verify the backend health check at `/api/health`, then open the frontend.

The Blueprint uses Python 3.12.3 and Node 20.18.0. Render's free tier can sleep when idle, so the first request after a cold start may be slow. The default `*.onrender.com` names are predictions until deployment is verified; the repository currently does not claim a live demo URL.

## GitHub Pages (static sample-data demo)

A fully offline demo is published to `https://right202209.github.io/StockSight/`. It is the
same React frontend, but `./api` is swapped for an in-repo sample dataset
(`frontend/src/demo/`), so it needs no backend, no API keys, and no network. Every page is
honestly labeled: the `Static demo` banner, the `Demo Data` badge on each quote, and
sample-data (Chinese/English) AI summaries.

- **Dataset**: `npm run gen:demo` regenerates `frontend/src/demo/dataset.js` from
  `frontend/scripts/generate-demo-data.mjs` (12 symbols, one past session). The generator
  asserts the shape (symbols, finite numbers, invariant ranges) and fails on malformed edits.
- **Build**: `npm run build:pages` = regenerate data + `vite build --config
  vite.pages.config.js` + `scripts/finalize-pages-build.mjs`. It uses `base: '/StockSight/'`
  and compiles `index-pages.html` → `dist-pages/index.html`.
- **Deploy**: `.github/workflows/pages.yml` runs the build on `main` and publishes
  `frontend/dist-pages` through the official Pages artifact workflow (configure
  **Pages → Source → GitHub Actions** once). The build never sees secrets and makes no
  outbound calls by design; a fresh build artifact already verified in a real browser shows
  zero console errors and zero non-local requests besides Google Fonts.
- **Verification**: `cd frontend && npm run build:pages`, then serve `dist-pages` at the
  repo path (e.g. `ln -s $PWD/dist-pages /tmp/ghsite/StockSight`) and
  `python3 -m http.server 4199` from `/tmp/ghsite`.

## Local Production Build

```bash
cd frontend
npm ci --no-audit --no-fund
npm run build
```

The output is written to `frontend/dist/`. The backend can be started with the same `uvicorn` command used for local development, provided production environment variables are present.
