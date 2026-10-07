# Security and Limitations

## Implemented Controls

- Provider, model, and Supabase credentials remain server-side.
- CORS uses an exact origin allowlist.
- Responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, and HSTS on HTTPS.
- Symbols are normalized and validated on both frontend and backend.
- Pydantic validates the analysis request and model result before persistence.
- Request bodies are capped, analysis requests are rate-limited per client, and concurrent model calls are bounded.
- A per-process UTC-day analysis budget limits model spend; configure the provider's account hard limit as the authoritative cap.
- Analysis quotes are re-fetched server-side so browser-supplied prices are not sent to the model or persisted.
- Upstream model calls have a finite timeout and retries disabled; model output rejects unknown keys and invalid risk levels.
- Yahoo Finance calls have a finite timeout and a bounded provider thread pool; timeout falls back to labeled mock data.
- Requests emit request IDs, status, and duration without logging request bodies or model content.
- Quote caching reduces repeated upstream requests.
- Supabase RLS and a database sentiment check provide storage-side safeguards.
- The UI labels mock data and includes an explicit not-financial-advice disclaimer.

## Release Blockers

The following are not implemented and should be addressed before a public multi-user service:

- authentication and user-scoped history;
- a distributed model-provider spending cap (the in-process budget resets on restart and is not shared across workers);
- distributed rate limiting across multiple backend instances;
- frontend linting;
- centralized structured logging with retention/redaction rules (current logs avoid storing model content but remain process-local text logs).

## Data Trust

`POST /api/analyze` accepts a quote payload for API compatibility but re-fetches the canonical quote before model use and persistence. An unauthenticated caller can still trigger model spend. `/api/history` is also unauthenticated, so stored analyses should be treated as shared public MVP data.

Quote data may be delayed. A provider fallback is clearly marked as `mock` in the API and as **Demo Data** in the UI; it must not be interpreted as a live market quote.

## Pre-release Checklist

- [ ] Set a provider/model monthly hard spending limit.
- [ ] Define authentication and user-scoped history policy.
- [ ] Verify all production CORS origins.
- [ ] Apply the Supabase migration and confirm RLS.
- [ ] Run dependency and secret scans.
- [ ] Run backend tests and `npm run build` in CI.
- [ ] Verify the production URL and document it.
