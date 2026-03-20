-- Migration 030: Invite join lifecycle
--
-- Extends challenge_invites for the real join flow:
--   - Adds 'joined' and 'expired' status values
--   - Adds accepted_by_wallet to track which wallet completed the join
--   - Adds joined_at timestamp
--   - Adds lookup index for invite finalization at join time
--
-- State model:  queued → sent → joined | expired | failed
--   'accepted' is kept for backward compat with existing rows but
--   new code will not produce it.
--
-- Idempotent: safe to run multiple times.

-- Drop the old CHECK constraint and recreate with new values
ALTER TABLE public.challenge_invites DROP CONSTRAINT IF EXISTS challenge_invites_status_check;
ALTER TABLE public.challenge_invites
  ADD CONSTRAINT challenge_invites_status_check
  CHECK (status IN ('queued', 'sent', 'accepted', 'joined', 'expired', 'failed'));

-- Track which wallet actually joined
ALTER TABLE public.challenge_invites
  ADD COLUMN IF NOT EXISTS accepted_by_wallet text;

-- When the real join happened
ALTER TABLE public.challenge_invites
  ADD COLUMN IF NOT EXISTS joined_at timestamptz;

-- Fast lookup: when a participant joins, find their pending invite
CREATE INDEX IF NOT EXISTS challenge_invites_lookup_idx
  ON public.challenge_invites (challenge_id, lower(value), status);
