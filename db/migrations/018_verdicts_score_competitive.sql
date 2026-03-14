-- 018_verdicts_score_competitive.sql
-- Add score + metadata columns to verdicts for competitive ranking support.
-- Competitive challenges compute a numeric score for each participant during
-- evaluation. After the proof deadline, a ranking step flips top-N verdicts
-- to pass=true and the rest to pass=false.

BEGIN;

ALTER TABLE public.verdicts
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.verdicts.score IS
  'Numeric score computed by the evaluator (e.g. total steps, distance_km, wins). Used for competitive ranking.';

COMMENT ON COLUMN public.verdicts.metadata IS
  'Structured metadata from evaluator: activity counts, eligible records, etc. Stored for auditability.';

-- Index for competitive ranking queries: fetch all verdicts for a challenge ordered by score
CREATE INDEX IF NOT EXISTS idx_verdicts_challenge_score
  ON public.verdicts (challenge_id, score DESC NULLS LAST);

COMMIT;
