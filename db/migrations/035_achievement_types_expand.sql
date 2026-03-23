-- 035_achievement_types_expand.sql
-- Widen achievement_type CHECK constraint to support all 14 achievement types.
-- Also allow NULL token_id for auto-awarded achievements pending on-chain mint.

-- Drop old 2-type constraint and add expanded 14-type constraint
ALTER TABLE public.achievement_mints
  DROP CONSTRAINT IF EXISTS achievement_mints_achievement_type_check;

ALTER TABLE public.achievement_mints
  ADD CONSTRAINT achievement_mints_achievement_type_check
  CHECK (achievement_type IN (
    'completion', 'victory', 'streak', 'first_win', 'participation',
    'top_scorer', 'undefeated', 'comeback', 'speedrun', 'social',
    'early_adopter', 'veteran', 'perfectionist', 'explorer'
  ));

-- Allow NULL token_id for achievements auto-awarded off-chain before on-chain mint
ALTER TABLE public.achievement_mints
  ALTER COLUMN token_id DROP NOT NULL;

-- Drop unique constraint on token_id (NULL token_ids would conflict)
-- Re-add as a partial unique index (only when token_id IS NOT NULL)
ALTER TABLE public.achievement_mints
  DROP CONSTRAINT IF EXISTS achievement_mints_token_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_achievement_mints_token_id_unique
  ON public.achievement_mints (token_id) WHERE token_id IS NOT NULL;

-- Prevent duplicate awards: one achievement per (recipient, challenge, type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_achievement_mints_recipient_challenge_type
  ON public.achievement_mints (lower(recipient), challenge_id, achievement_type);

-- Add columns to reputation for new achievement type counts
ALTER TABLE public.reputation
  ADD COLUMN IF NOT EXISTS streaks       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_wins    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS participations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS veterans      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_adopters integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_scorers   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS undefeateds   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comebacks     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS speedruns     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS socials       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perfectionists integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS explorers     integer NOT NULL DEFAULT 0;
