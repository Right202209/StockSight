-- StockSight AI: initial schema for stock_analyses.
-- Run this once in the Supabase dashboard (Database → SQL editor → New query).
-- Idempotent: safe to re-run.

-- pgcrypto is enabled by default on Supabase; CREATE EXTENSION IF NOT EXISTS
-- is a no-op when it's already there, but explicit is better than implicit.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.stock_analyses (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol       text        NOT NULL,
    quote_data   jsonb       NOT NULL,
    ai_summary   text        NOT NULL,
    sentiment    text        NOT NULL
                             CHECK (sentiment IN ('Bullish', 'Neutral', 'Bearish')),
    risk_level   text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_analyses_symbol_created
    ON public.stock_analyses (symbol, created_at DESC);

-- PRD §10.6: lock the table down. The service_role key bypasses RLS, so
-- enabling RLS with NO public policies closes the table to anon /
-- authenticated clients while still letting the backend write freely.
ALTER TABLE public.stock_analyses ENABLE ROW LEVEL SECURITY;

-- Verification helpers — uncomment to sanity-check after first run:
-- SELECT count(*) FROM public.stock_analyses;
-- INSERT INTO public.stock_analyses (symbol, quote_data, ai_summary, sentiment, risk_level)
--   VALUES ('TEST', '{}'::jsonb, 'sanity', 'Neutral', 'Low');
