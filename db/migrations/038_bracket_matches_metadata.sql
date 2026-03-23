-- 038_bracket_matches_metadata.sql
-- Add metadata JSONB column to bracket_matches for storing confirmations and dispute flags.

BEGIN;

ALTER TABLE public.bracket_matches
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.bracket_matches.metadata IS
  'JSONB metadata: player confirmations, dispute flags, admin notes, etc.';

COMMIT;
