-- 028: Comprehensive notification system — all lifecycle event types.
--
-- Progress alerts:
--   challenge_behind_pace  — user is behind expected progress
--   challenge_final_push   — challenge deadline is imminent
--   challenge_goal_reached — user hit their target
--
-- Lifecycle events:
--   challenge_finalized    — challenge has been finalized (verdict ready)
--   claim_available        — user has unclaimed funds (winner/loser/refund)
--   claim_reminder         — periodic reminder for unclaimed rewards
--   challenge_joined       — someone joined a challenge you created
--   proof_submitted        — auto-proof was submitted for your challenge
--   challenge_starting     — challenge starts within 24h
--   proof_window_open      — proof submission window has opened

-- Drop and recreate the CHECK constraint to include all new types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- Original types
    'match_upcoming', 'match_result', 'competition_started', 'competition_completed',
    'registration_confirmed', 'dispute_filed', 'dispute_resolved', 'achievement_earned',
    -- Progress alerts
    'challenge_behind_pace', 'challenge_final_push', 'challenge_goal_reached',
    -- Lifecycle events
    'challenge_finalized', 'claim_available', 'claim_reminder',
    'challenge_joined', 'proof_submitted', 'challenge_starting', 'proof_window_open'
  ));

-- Prevent duplicate alerts: one notification per wallet + challenge + tier.
-- Uses the data->>'challengeId' and data->>'tier' JSONB fields.
-- Covers all challenge-scoped notification types that use dedup tiers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_challenge_alert_unique
  ON public.notifications (wallet, (data->>'challengeId'), (data->>'tier'))
  WHERE type IN (
    'challenge_behind_pace', 'challenge_final_push', 'challenge_goal_reached',
    'challenge_finalized', 'claim_available', 'claim_reminder',
    'challenge_joined', 'proof_submitted', 'challenge_starting', 'proof_window_open'
  );
