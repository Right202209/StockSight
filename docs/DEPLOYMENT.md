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

## Local Production Build

```bash
cd frontend
npm ci --no-audit --no-fund
npm run build
```

The output is written to `frontend/dist/`. The backend can be started with the same `uvicorn` command used for local development, provided production environment variables are present.
