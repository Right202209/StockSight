-- StockSight AI: created_at DESC index for the global history feed and the
-- daily-cap query.
--
-- 0001 built idx_stock_analyses_symbol_created (symbol, created_at DESC),
-- which covers per-symbol lookups well but is a poor plan for the two queries
-- that scan across ALL symbols:
--   SELECT * FROM stock_analyses ORDER BY created_at DESC LIMIT 20;   (/api/history)
--   SELECT count(*) FROM stock_analyses WHERE created_at >= now() - interval '24 hours';
-- Auto-created on both backends at boot (see backend/db.py), so this migration
-- exists for the Supabase dashboard keepers.
--
-- Idempotent: safe to re-run.
CREATE INDEX IF NOT EXISTS stock_analyses_created_at_idx
    ON public.stock_analyses (created_at DESC);