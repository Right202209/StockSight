-- Constrain persisted risk values to the API contract. Existing legacy values
-- are normalized before the constraint is installed.
UPDATE public.stock_analyses
SET risk_level = 'Medium'
WHERE risk_level NOT IN ('Low', 'Medium', 'High');

ALTER TABLE public.stock_analyses
    DROP CONSTRAINT IF EXISTS stock_analyses_risk_level_check;

ALTER TABLE public.stock_analyses
    ADD CONSTRAINT stock_analyses_risk_level_check
    CHECK (risk_level IN ('Low', 'Medium', 'High'));
