-- Migration 034: Add auto-distribution notification types
--
-- Adds 'funds_received' and 'refund_received' to the notifications type check.
-- Also adds an 'auto_distributed' column to challenges to track distribution state.
--
-- Idempotent: safe to run multiple times.

-- Drop and recreate the CHECK constraint to add new types
-- Drop the old CHECK constraint and add a broader one including all existing + new types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'match_upcoming', 'match_result', 'competition_started', 'competition_completed',
  'registration_confirmed', 'dispute_filed', 'dispute_resolved', 'achievement_earned',
  'challenge_finalized', 'funds_received', 'refund_received'
));

-- Track auto-distribution state on challenges
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS auto_distributed boolean NOT NULL DEFAULT false;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS auto_distributed_at timestamptz;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS auto_distributed_tx text;
