# Security and Limitations

## Implemented Controls

- Provider, model, and Supabase credentials remain server-side.
- CORS uses an exact origin allowlist.
- Responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`.
- Symbols are normalized and validated on both frontend and backend.
- Pydantic validates the analysis request and model result before persistence.
- Quote caching reduces repeated upstream requests.
- Supabase RLS and a database sentiment check provide storage-side safeguards.
- The UI labels mock data and includes an explicit not-financial-advice disclaimer.

## Release Blockers

The following are not implemented and should be addressed before a public multi-user service:

- authentication and user-scoped history;
- per-IP/user rate limiting and a model-provider spending cap;
- request-body limits and stronger numeric/text constraints;
- server-side quote re-fetching or signed quote payloads;
- strict rejection of unknown model-output keys and a fixed risk-level enum;
- upstream timeouts, bounded retries, and concurrency controls;
- automated tests, linting, CI, dependency vulnerability scans, and secret scanning;
- structured logging with retention/redaction rules.

## Data Trust

`POST /api/analyze` currently accepts client-supplied quote data after shape validation. An unauthenticated caller can submit fabricated values or trigger model spend. `/api/history` is also unauthenticated, so stored analyses should be treated as shared public MVP data.

Quote data may be delayed. A provider fallback is clearly marked as `mock` in the API and as **Demo Data** in the UI; it must not be interpreted as a live market quote.

## Pre-release Checklist

- [ ] Set a provider/model monthly hard spending limit.
- [ ] Add API rate limiting and authentication policy.
- [ ] Verify all production CORS origins.
- [ ] Apply the Supabase migration and confirm RLS.
- [ ] Run dependency and secret scans.
- [ ] Run backend tests and `npm run build` in CI.
- [ ] Verify the production URL and document it.
